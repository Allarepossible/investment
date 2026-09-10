import { calculatePortfolioTotals } from '../analytics/portfolio.analytics';
import { MoexClient } from '../integrations/moex/moex.client';
import { mapMoexPrice } from '../integrations/moex/moex.mapper';
import type { MoexMarketDataResponse } from '../integrations/moex/moex.types';
import { listPortfolios } from '../portfolios/portfolio.service';
import { listTransactions } from '../transactions/transaction.service';
import { getInstrument } from './instrument.service';

const moex = new MoexClient();

export const historyRanges = ['all', '5y', '1y', '1m', '1w', '1d'] as const;
export type HistoryRange = (typeof historyRanges)[number];

type MoexBlock = {
    columns: string[];
    data: unknown[][];
};

type MoexCandlesResponse = {
    candles?: MoexBlock;
};

type PricePoint = {
    date: string;
    close: number;
};

type FinancialRow = {
    label: string;
    unit: 'rub' | 'billionRub' | 'millionRub' | 'percent' | 'unknown';
    values: Array<number | null>;
};

function toIsoDate(value: Date) {
    return value.toISOString().slice(0, 10);
}

function subtractMonths(date: Date, count: number) {
    const result = new Date(date);
    result.setMonth(result.getMonth() - count);
    return result;
}

function subtractDays(date: Date, count: number) {
    const result = new Date(date);
    result.setDate(result.getDate() - count);
    return result;
}

function getRangeRequest(range: HistoryRange) {
    const till = new Date();

    switch (range) {
        case 'all':
            return { from: new Date('2007-01-01T00:00:00.000Z'), till, interval: '31' };
        case '5y':
            return { from: subtractMonths(till, 60), till, interval: '31' };
        case '1y':
            return { from: subtractMonths(till, 12), till, interval: '24' };
        case '1m':
            return { from: subtractMonths(till, 1), till, interval: '24' };
        case '1w':
            return { from: subtractDays(till, 7), till, interval: '60' };
        case '1d':
            return { from: subtractDays(till, 1), till, interval: '10' };
    }
}

function getColumnValue(block: MoexBlock, row: unknown[], name: string) {
    const index = block.columns.indexOf(name);
    return index === -1 ? null : row[index] ?? null;
}

function asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function toPricePoints(response: MoexCandlesResponse): PricePoint[] {
    const candles = response.candles;
    if (!candles) return [];

    return candles.data
        .map((row) => {
            const close = asNumber(getColumnValue(candles, row, 'close'));
            const begin = getColumnValue(candles, row, 'begin');
            if (close === null || typeof begin !== 'string') return null;
            return { date: begin, close };
        })
        .filter((point): point is PricePoint => point !== null);
}

function compactPoints(points: PricePoint[], maxPoints = 420) {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const compacted = points.filter((_, index) => index % step === 0);
    const lastPoint = points.at(-1);
    if (lastPoint && compacted.at(-1)?.date !== lastPoint.date) compacted.push(lastPoint);
    return compacted;
}

async function getCandles(
    instrument: { ticker: string; market: string | null; board: string | null },
    range: HistoryRange,
    timeoutMs?: number,
) {
    if (!instrument.market || !instrument.board) return [];
    const request = getRangeRequest(range);
    const response = await moex.get<MoexCandlesResponse>(
        `/engines/stock/markets/${instrument.market}/boards/${instrument.board}/securities/${instrument.ticker}/candles.json`,
        {
            from: toIsoDate(request.from),
            till: toIsoDate(request.till),
            interval: request.interval,
            'iss.meta': 'off',
        },
        { timeoutMs },
    );
    return compactPoints(toPricePoints(response));
}

export async function getInstrumentPriceHistory(ticker: string, range: HistoryRange) {
    const instrument = await getInstrument(ticker);
    const points = await getCandles(instrument, range);

    return {
        ticker: instrument.ticker,
        range,
        points,
        source: 'MOEX ISS',
    };
}

function percentChange(points: PricePoint[]) {
    const first = points[0]?.close;
    const last = points.at(-1)?.close;
    if (!first || last === undefined) return null;
    return Number((((last - first) / first) * 100).toFixed(2));
}

export async function getInstrumentGrowth(ticker: string) {
    const instrument = await getInstrument(ticker);
    const [allTime, oneYear] = await Promise.all([
        getCandles(instrument, 'all', 7_000).catch(() => []),
        getCandles(instrument, '1y', 7_000).catch(() => []),
    ]);
    const now = new Date();

    return {
        ticker: instrument.ticker,
        oneWeek: percentChange(oneYear.filter((point) => new Date(point.date) >= subtractDays(now, 7))),
        oneMonth: percentChange(oneYear.filter((point) => new Date(point.date) >= subtractMonths(now, 1))),
        oneYear: percentChange(oneYear),
        fiveYears: percentChange(allTime.filter((point) => new Date(point.date) >= subtractMonths(now, 60))),
        allTime: percentChange(allTime),
    };
}

function decodeHtml(value: string) {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#(?:x([\da-f]+)|([\d]+));/gi, (_match, hex, decimal) => {
            const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        });
}

function stripHtml(value: string) {
    return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseRussianNumber(value: string) {
    const normalized = value
        .replace(/\u2212/g, '-')
        .replace(/[^\d,.-]/g, '')
        .replace(',', '.');
    if (!normalized || normalized === '-' || normalized === '.') return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function unitFromLabel(label: string): FinancialRow['unit'] {
    const normalized = label.toLocaleLowerCase('ru-RU');
    if (normalized.includes('млрд руб')) return 'billionRub';
    if (normalized.includes('млн руб')) return 'millionRub';
    if (normalized.includes('%')) return 'percent';
    if (normalized.includes('руб')) return 'rub';
    return 'unknown';
}

function findFinancialRow(html: string, fieldNames: string[], labels: string[]) {
    const rows = [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)];

    for (const [, attributes, body] of rows) {
        const field = attributes.match(/\bfield\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
        const label = stripHtml(body.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? '');
        const hasField = field ? fieldNames.includes(field) : false;
        const hasLabel = labels.some((needle) => label.toLocaleLowerCase('ru-RU').includes(needle));
        if (!hasField && !hasLabel) continue;

        const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
            .map((match) => stripHtml(match[1]));
        // The first cell is an empty chart link. Keep empty later cells because
        // they carry the place of an unavailable year in the table.
        const values = cells.slice(1).map(parseRussianNumber);
        return { label, unit: unitFromLabel(label), values } satisfies FinancialRow;
    }

    return null;
}

function getReportYears(html: string) {
    const header = html.match(/<tr\b[^>]*class=["'][^"']*header_row[^"']*["'][^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? '';
    const matches = [...stripHtml(header).matchAll(/\b(20\d{2})\b/g)]
        .map((match) => Number(match[1]));
    const unique = [...new Set(matches)];
    return unique.length ? unique.slice(-8) : [];
}

function valueInRub(value: number | null, unit: FinancialRow['unit']) {
    if (value === null) return null;
    if (unit === 'billionRub') return value * 1_000_000_000;
    if (unit === 'millionRub') return value * 1_000_000;
    return unit === 'rub' ? value : null;
}

function latestValue(row: FinancialRow | null) {
    if (!row) return null;
    return [...row.values].reverse().find((value): value is number => value !== null) ?? null;
}

type SmartLabFundamentals = {
    financials: Array<{ year: number; revenueRub: number | null; netIncomeRub: number | null }>;
    epsRub: number | null;
    dividendPerShareRub: number | null;
    dividendYieldPercent: number | null;
    payoutRatioPercent: number | null;
    sourceUrl: string;
};

async function getSmartLabFundamentals(ticker: string): Promise<SmartLabFundamentals | null> {
    const sourceUrl = `https://smart-lab.ru/q/${encodeURIComponent(ticker)}/f/y/`;
    try {
        const response = await fetch(sourceUrl, {
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'User-Agent': 'Kapital local portfolio tracker/1.0',
            },
            signal: AbortSignal.timeout(7_000),
        });
        if (!response.ok) return null;
        const html = await response.text();
        const years = getReportYears(html);
        // Banks do not report conventional revenue. Their closest comparable
        // top-line is net operating income, so it shares the chart with revenue.
        const revenue = findFinancialRow(html, ['revenue', 'net_operating_income'], ['выручка', 'операционные доходы']);
        const netIncome = findFinancialRow(html, ['net_income', 'net_income_noc'], ['чистая прибыль']);
        const eps = findFinancialRow(html, ['eps'], ['eps']);
        const dividendPerShare = findFinancialRow(
            html,
            ['dividend_ao', 'dividend', 'dividend_per_share'],
            ['дивиденд, руб', 'див.выплата, руб'],
        );
        const dividendYield = findFinancialRow(
            html,
            ['div_yield_ao', 'div_yield'],
            ['див доход'],
        );
        const payoutRatio = findFinancialRow(
            html,
            ['div_payout_ratio'],
            ['дивиденды/прибыль'],
        );

        if (!revenue && !netIncome && !eps && !dividendPerShare) return null;

        const rowLength = Math.max(revenue?.values.length ?? 0, netIncome?.values.length ?? 0);
        const reportYears = years.slice(-rowLength);
        const financials = reportYears.map((year, index) => ({
            year,
            revenueRub: valueInRub(revenue?.values[index] ?? null, revenue?.unit ?? 'unknown'),
            netIncomeRub: valueInRub(netIncome?.values[index] ?? null, netIncome?.unit ?? 'unknown'),
        })).filter((entry) => entry.revenueRub !== null || entry.netIncomeRub !== null);

        return {
            financials,
            epsRub: latestValue(eps),
            dividendPerShareRub: latestValue(dividendPerShare),
            dividendYieldPercent: latestValue(dividendYield),
            payoutRatioPercent: latestValue(payoutRatio),
            sourceUrl,
        };
    } catch {
        return null;
    }
}

function unavailableQuote(instrument: { ticker: string; currency: string }) {
    return {
        ticker: instrument.ticker,
        price: null,
        currency: instrument.currency,
        updatedAt: new Date().toISOString(),
        issueCapitalizationRub: null,
    };
}

async function getDetailQuote(instrument: {
    ticker: string;
    market: string | null;
    board: string | null;
    currency: string;
    type: string;
}) {
    if (!instrument.market || !instrument.board) return unavailableQuote(instrument);

    try {
        // This client is isolated from the catalogue-wide market-data refresh,
        // so opening a card is not stuck behind quotes for every saved paper.
        const response = await moex.get<MoexMarketDataResponse>(
            `/engines/stock/markets/${instrument.market}/boards/${instrument.board}/securities/${instrument.ticker}.json`,
            { 'iss.meta': 'off', 'iss.only': 'marketdata,securities' },
            { timeoutMs: 5_000 },
        );
        const mapped = mapMoexPrice(response, instrument.currency);
        const isBond = instrument.market === 'bonds' || instrument.type.includes('bond');
        const price = mapped.price === null || !isBond
            ? mapped.price
            : (mapped.price * (mapped.faceValue ?? 1_000)) / 100 + (mapped.accruedInterest ?? 0);
        return {
            ticker: instrument.ticker,
            price,
            currency: mapped.currency,
            updatedAt: mapped.updatedAt,
            issueCapitalizationRub: mapped.issueCapitalizationRub,
        };
    } catch {
        return unavailableQuote(instrument);
    }
}

async function getPortfolioPositions(
    instrumentId: number,
    quote: { price: number | null },
) {
    const [portfolios, transactions] = await Promise.all([listPortfolios(), listTransactions()]);
    const priceKopecks = quote.price === null ? null : Math.round(quote.price * 100);

    return portfolios.flatMap((portfolio) => {
        try {
            const totals = calculatePortfolioTotals(
                transactions.filter((transaction) => transaction.portfolioId === portfolio.id),
            );
            const position = totals.positions.find((item) => item.instrumentId === instrumentId);
            if (!position) return [];
            const marketValueKopecks = priceKopecks === null ? null : priceKopecks * position.quantity;
            return [{
                portfolioId: portfolio.id,
                portfolioName: portfolio.name,
                quantity: position.quantity,
                averageCostKopecks: position.averageCostKopecks,
                investedKopecks: position.costKopecks,
                marketValueKopecks,
                unrealizedPnlKopecks: marketValueKopecks === null ? null : marketValueKopecks - position.costKopecks,
            }];
        } catch {
            // A malformed old operation in one portfolio must not hide the
            // instrument card or positions calculated for other portfolios.
            return [];
        }
    });
}

export async function getInstrumentDetails(ticker: string) {
    const instrument = await getInstrument(ticker);
    const [quote, fundamentals] = await Promise.all([
        getDetailQuote(instrument),
        getSmartLabFundamentals(instrument.ticker),
    ]);
    const positions = await getPortfolioPositions(instrument.id, quote);

    const dividendYieldPercent = fundamentals?.dividendYieldPercent
        ?? (fundamentals?.dividendPerShareRub && quote.price
            ? Number(((fundamentals.dividendPerShareRub / quote.price) * 100).toFixed(2))
            : null);

    return {
        instrument,
        quote,
        metrics: {
            epsRub: fundamentals?.epsRub ?? null,
            marketCapRub: quote.issueCapitalizationRub ?? null,
            dividendYieldPercent,
            dividendPerShareRub: fundamentals?.dividendPerShareRub ?? null,
            payoutRatioPercent: fundamentals?.payoutRatioPercent ?? null,
        },
        positions,
        financials: fundamentals?.financials ?? [],
        fundamentalsSource: fundamentals ? { name: 'Smart-Lab', url: fundamentals.sourceUrl } : null,
    };
}
