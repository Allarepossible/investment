import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { instruments } from '../db/schema';
import { MoexClient } from '../integrations/moex/moex.client';
import { getPortfolio, listPortfolios } from '../portfolios/portfolio.service';
import { listTransactions } from '../transactions/transaction.service';
import {
    calculateRiskMetrics,
    calculateTimeWeightedReturn,
    calculateXirr,
    compactValuationPoints,
    type CashFlow,
    type PricePoint,
    type ValuationPoint,
} from './performance.analytics';

const moex = new MoexClient();
const CACHE_TTL_MS = 2 * 60_000;

type MoexBlock = { columns: string[]; data: unknown[][] };
type MoexCandlesResponse = { candles?: MoexBlock };
type SavedInstrument = typeof instruments.$inferSelect;

type CachedResult = { expiresAt: number; value: Awaited<ReturnType<typeof buildPortfolioPerformance>> };
const cache = new Map<string, CachedResult>();
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof buildPortfolioPerformance>>>>();

const sectorByTicker: Record<string, string> = {
    SBER: 'Финансы', SBERP: 'Финансы', VTBR: 'Финансы', MOEX: 'Финансы',
    GAZP: 'Нефть и газ', LKOH: 'Нефть и газ', ROSN: 'Нефть и газ', NVTK: 'Нефть и газ',
    GMKN: 'Металлы и добыча', MAGN: 'Металлы и добыча', NLMK: 'Металлы и добыча', CHMF: 'Металлы и добыча', PLZL: 'Металлы и добыча', RUAL: 'Металлы и добыча',
    MTSS: 'Телеком', RTKM: 'Телеком', YDEX: 'ИТ', VKCO: 'ИТ', ASTR: 'ИТ', POSI: 'ИТ', HEAD: 'ИТ',
    OZON: 'Потребительский сектор', MGNT: 'Потребительский сектор', X5: 'Потребительский сектор',
    HYDR: 'Электроэнергетика', IRAO: 'Электроэнергетика', FEES: 'Электроэнергетика', OGKB: 'Электроэнергетика', MRKC: 'Электроэнергетика',
    AFLT: 'Транспорт', PHOR: 'Химия', DOMRF: 'Недвижимость', SMLT: 'Недвижимость',
};

function toDay(value: Date) {
    return value.toISOString().slice(0, 10);
}

function getBlockValue(block: MoexBlock, row: unknown[], column: string) {
    const index = block.columns.indexOf(column);
    return index === -1 ? null : row[index] ?? null;
}

function asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }
    return null;
}

function getSector(instrument: SavedInstrument) {
    if (instrument.market === 'bonds' || instrument.type.includes('bond')) return instrument.type.includes('ofz') ? 'ОФЗ' : 'Облигации';
    if (instrument.type.includes('etf') || instrument.type.includes('fund') || instrument.type.includes('ppif')) return 'Фонды';
    return sectorByTicker[instrument.ticker] ?? 'Прочие акции';
}

function getAssetType(instrument: SavedInstrument) {
    if (instrument.market === 'bonds' || instrument.type.includes('bond')) return 'Облигации';
    if (instrument.type.includes('etf') || instrument.type.includes('fund') || instrument.type.includes('ppif')) return 'Фонды';
    if (instrument.market === 'shares' || instrument.type.includes('share')) return 'Акции';
    return 'Прочее';
}

function toPricePoints(response: MoexCandlesResponse, instrument: SavedInstrument): PricePoint[] {
    const candles = response.candles;
    if (!candles) return [];
    const isBond = instrument.market === 'bonds' || instrument.type.includes('bond');

    return candles.data.flatMap((row) => {
        const close = asNumber(getBlockValue(candles, row, 'close'));
        const begin = getBlockValue(candles, row, 'begin');
        if (close === null || typeof begin !== 'string') return [];
        const rubPrice = isBond ? (close * 1_000) / 100 : close;
        return [{ date: begin.slice(0, 10), close: rubPrice }];
    });
}

async function getInstrumentPrices(instrument: SavedInstrument, from: string): Promise<PricePoint[]> {
    if (!instrument.market || !instrument.board) return [];
    const points: PricePoint[] = [];
    let start = 0;

    for (let page = 0; page < 12; page += 1) {
        const response = await moex.get<MoexCandlesResponse>(
            `/engines/stock/markets/${instrument.market}/boards/${instrument.board}/securities/${instrument.ticker}/candles.json`,
            {
                from,
                till: toDay(new Date()),
                interval: '24',
                start: String(start),
                'iss.meta': 'off',
            },
            { timeoutMs: 10_000 },
        );
        const pagePoints = toPricePoints(response, instrument);
        points.push(...pagePoints);
        if (pagePoints.length < 500) break;
        start += pagePoints.length;
    }

    return points;
}

async function getBenchmarkPrices(from: string): Promise<PricePoint[]> {
    const benchmark: SavedInstrument = {
        id: -1,
        ticker: 'IMOEX',
        name: 'Индекс Мосбиржи',
        isin: null,
        type: 'index',
        exchange: 'MOEX',
        board: 'SNDX',
        market: 'index',
        currency: 'RUB',
        lotSize: null,
        minPriceStep: null,
        logoPath: null,
        logoStatus: 'missing',
        logoSource: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
    };
    return getInstrumentPrices(benchmark, from).catch(() => []);
}

function applyTransaction(
    transaction: Awaited<ReturnType<typeof listTransactions>>[number],
    holdings: Map<number, number>,
) {
    const quantity = transaction.quantity ?? 0;
    const priceKopecks = transaction.priceKopecks ?? 0;
    const gross = quantity * priceKopecks;
    const commission = transaction.commissionKopecks;
    const accruedInterest = transaction.accruedInterestKopecks;
    let cashChange = 0;
    let externalFlow = 0;

    switch (transaction.type) {
        case 'BUY':
            if (transaction.instrumentId) holdings.set(transaction.instrumentId, (holdings.get(transaction.instrumentId) ?? 0) + quantity);
            cashChange = -(gross + commission + accruedInterest);
            break;
        case 'SELL':
            if (transaction.instrumentId) holdings.set(transaction.instrumentId, (holdings.get(transaction.instrumentId) ?? 0) - quantity);
            cashChange = gross - commission + accruedInterest;
            break;
        case 'DEPOSIT':
            cashChange = transaction.amountKopecks ?? 0;
            externalFlow = cashChange;
            break;
        case 'WITHDRAWAL':
            cashChange = -((transaction.amountKopecks ?? 0) + commission);
            externalFlow = -(transaction.amountKopecks ?? 0);
            break;
        case 'DIVIDEND':
        case 'COUPON':
            cashChange = (transaction.amountKopecks ?? 0) - commission;
            break;
        case 'FEE':
        case 'TAX':
            cashChange = -((transaction.amountKopecks ?? 0) + commission);
            break;
        default:
            break;
    }

    return { cashChange, externalFlow };
}

function createConcentration(
    instrumentsById: Map<number, SavedInstrument>,
    positionValues: Map<number, number>,
    cashKopecks: number,
) {
    const entries = [...positionValues.entries()]
        .filter(([, value]) => value > 0)
        .map(([instrumentId, value]) => ({ instrumentId, value, instrument: instrumentsById.get(instrumentId) }))
        .filter((entry): entry is { instrumentId: number; value: number; instrument: SavedInstrument } => entry.instrument !== undefined);
    if (cashKopecks > 0) entries.push({ instrumentId: 0, value: cashKopecks, instrument: { ...entries[0]?.instrument, id: 0, ticker: 'CASH', name: 'Деньги', type: 'cash', market: null } as SavedInstrument });
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const group = (getKey: (instrument: SavedInstrument) => string) => [...entries.reduce((map, entry) => {
        const key = getKey(entry.instrument);
        map.set(key, (map.get(key) ?? 0) + entry.value);
        return map;
    }, new Map<string, number>()).entries()]
        .map(([name, value]) => ({ name, valueKopecks: value, allocationPercent: total ? Number((value / total * 100).toFixed(2)) : 0 }))
        .sort((left, right) => right.valueKopecks - left.valueKopecks);
    const positions = entries
        .map((entry) => ({ ticker: entry.instrument.ticker, name: entry.instrument.name, valueKopecks: entry.value, allocationPercent: total ? Number((entry.value / total * 100).toFixed(2)) : 0 }))
        .sort((left, right) => right.valueKopecks - left.valueKopecks);
    const hhi = total ? entries.reduce((sum, entry) => sum + (entry.value / total) ** 2, 0) : null;

    return {
        positions,
        bySector: group((instrument) => instrument.ticker === 'CASH' ? 'Деньги' : getSector(instrument)),
        byAssetType: group((instrument) => instrument.ticker === 'CASH' ? 'Деньги' : getAssetType(instrument)),
        hhi: hhi === null ? null : Number((hhi * 10_000).toFixed(0)),
        effectivePositions: hhi ? Number((1 / hhi).toFixed(1)) : null,
        largestPositionPercent: positions[0]?.allocationPercent ?? null,
    };
}

async function buildPortfolioPerformance(portfolioId?: number) {
    if (portfolioId) await getPortfolio(portfolioId);
    const activePortfolioIds = portfolioId ? null : new Set((await listPortfolios()).map((portfolio) => portfolio.id));
    const transactions = (await listTransactions(portfolioId)).filter(
        (transaction) => !activePortfolioIds || activePortfolioIds.has(transaction.portfolioId),
    );
    if (!transactions.length) {
        return {
            scope: portfolioId ? 'portfolio' : 'aggregate', portfolioId: portfolioId ?? null, generatedAt: new Date().toISOString(),
            period: null, series: [], benchmark: { ticker: 'IMOEX', name: 'Индекс Мосбиржи', returnPercent: null },
            performance: { timeWeightedReturnPercent: null, moneyWeightedReturnPercent: null, annualizedReturnPercent: null, currentValueKopecks: null },
            risk: calculateRiskMetrics([], []), concentration: createConcentration(new Map(), new Map(), 0), coverage: { pricedInstruments: 0, totalInstruments: 0, missingTickers: [] },
        };
    }

    const orderedTransactions = [...transactions].sort((left, right) => left.operationDate.getTime() - right.operationDate.getTime() || left.id - right.id);
    const from = toDay(orderedTransactions[0].operationDate);
    const instrumentIds = [...new Set(orderedTransactions.flatMap((transaction) => transaction.instrumentId ? [transaction.instrumentId] : []))];
    const savedInstruments = instrumentIds.length ? await db.select().from(instruments).where(inArray(instruments.id, instrumentIds)) : [];
    const instrumentsById = new Map(savedInstruments.map((instrument) => [instrument.id, instrument]));
    const histories = new Map<number, PricePoint[]>();
    const historyResults = await Promise.all(savedInstruments.map(async (instrument) => {
        try {
            return [instrument.id, await getInstrumentPrices(instrument, from)] as const;
        } catch {
            return [instrument.id, [] as PricePoint[]] as const;
        }
    }));
    historyResults.forEach(([id, points]) => histories.set(id, points));
    const benchmarkPrices = await getBenchmarkPrices(from);

    const transactionsByDay = new Map<string, typeof orderedTransactions>();
    for (const transaction of orderedTransactions) {
        const day = toDay(transaction.operationDate);
        transactionsByDay.set(day, [...(transactionsByDay.get(day) ?? []), transaction]);
    }
    const days = [...new Set([
        ...transactionsByDay.keys(),
        ...[...histories.values()].flatMap((points) => points.map((point) => point.date)),
    ])].sort();
    const priceIndexes = new Map<number, number>();
    const latestPrices = new Map<number, number>();
    const holdings = new Map<number, number>();
    const fallbackPrices = new Map<number, number>();
    const series: ValuationPoint[] = [];
    let cashKopecks = 0;
    let netContributionsKopecks = 0;
    let latestPositionValues = new Map<number, number>();

    for (const day of days) {
        for (const [instrumentId, points] of histories) {
            let index = priceIndexes.get(instrumentId) ?? 0;
            while (points[index] && points[index].date <= day) {
                latestPrices.set(instrumentId, Math.round(points[index].close * 100));
                index += 1;
            }
            priceIndexes.set(instrumentId, index);
        }
        let externalFlowKopecks = 0;
        for (const transaction of transactionsByDay.get(day) ?? []) {
            const changes = applyTransaction(transaction, holdings);
            cashKopecks += changes.cashChange;
            externalFlowKopecks += changes.externalFlow;
            netContributionsKopecks += changes.externalFlow;
            if (transaction.type === 'BUY' && transaction.instrumentId && transaction.priceKopecks) fallbackPrices.set(transaction.instrumentId, transaction.priceKopecks);
        }
        latestPositionValues = new Map();
        for (const [instrumentId, quantity] of holdings) {
            if (quantity <= 0) continue;
            const priceKopecks = latestPrices.get(instrumentId) ?? fallbackPrices.get(instrumentId);
            if (priceKopecks !== undefined) latestPositionValues.set(instrumentId, priceKopecks * quantity);
        }
        const securitiesValueKopecks = [...latestPositionValues.values()].reduce((sum, value) => sum + value, 0);
        const valueKopecks = cashKopecks + securitiesValueKopecks;
        series.push({
            date: day,
            valueKopecks,
            externalFlowKopecks,
            // This is the result after removing only external deposits and
            // withdrawals. It therefore includes revaluation, realised P/L,
            // coupons, dividends, commissions and taxes.
            profitKopecks: valueKopecks - netContributionsKopecks,
        });
    }

    const latest = series.at(-1);
    const xirrFlows: CashFlow[] = orderedTransactions.flatMap((transaction) => {
        if (transaction.type === 'DEPOSIT') return [{ date: toDay(transaction.operationDate), amountKopecks: -(transaction.amountKopecks ?? 0) }];
        if (transaction.type === 'WITHDRAWAL') return [{ date: toDay(transaction.operationDate), amountKopecks: transaction.amountKopecks ?? 0 }];
        return [];
    });
    if (latest) xirrFlows.push({ date: latest.date, amountKopecks: latest.valueKopecks });
    const dailyReturns = series.length > 1 ? calculateRiskMetrics(series, benchmarkPrices) : calculateRiskMetrics([], []);
    const twr = calculateTimeWeightedReturn(series);
    const observations = dailyReturns.observations;
    const annualizedReturnPercent = twr !== null && observations > 0 ? Number((((1 + twr / 100) ** (252 / observations) - 1) * 100).toFixed(2)) : null;
    const missingTickers = savedInstruments.filter((instrument) => !(histories.get(instrument.id)?.length)).map((instrument) => instrument.ticker);

    return {
        scope: portfolioId ? 'portfolio' : 'aggregate',
        portfolioId: portfolioId ?? null,
        generatedAt: new Date().toISOString(),
        period: latest ? { from, to: latest.date, tradingDays: series.length } : null,
        series: compactValuationPoints(series),
        benchmark: { ticker: 'IMOEX', name: 'Индекс Мосбиржи', returnPercent: dailyReturns.benchmarkReturnPercent },
        performance: {
            timeWeightedReturnPercent: twr,
            moneyWeightedReturnPercent: calculateXirr(xirrFlows),
            annualizedReturnPercent,
            currentValueKopecks: latest?.valueKopecks ?? null,
        },
        risk: dailyReturns,
        concentration: createConcentration(instrumentsById, latestPositionValues, cashKopecks),
        coverage: { pricedInstruments: savedInstruments.length - missingTickers.length, totalInstruments: savedInstruments.length, missingTickers },
    };
}

export async function getPortfolioPerformance(portfolioId?: number, refresh = false) {
    const key = String(portfolioId ?? 'aggregate');
    const cached = cache.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const running = inFlight.get(key);
    if (running) return running;

    const request = buildPortfolioPerformance(portfolioId)
        .then((value) => {
            cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
            return value;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
}

export function invalidatePortfolioPerformance(portfolioId?: number) {
    if (portfolioId === undefined) {
        cache.clear();
        return;
    }
    cache.delete(String(portfolioId ?? 'aggregate'));
    cache.delete('aggregate');
}
