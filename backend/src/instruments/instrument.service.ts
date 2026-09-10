import { asc, eq, like, or } from 'drizzle-orm';
import { db } from '../db';
import { instruments } from '../db/schema';
import { MoexClient } from '../integrations/moex/moex.client';
import {
    mapMoexPrice,
    mapMoexSearch,
    mapMoexSecurity,
    mapMoexTradingParameters,
    type NormalizedInstrument,
} from '../integrations/moex/moex.mapper';
import type {
    MoexMarketDataResponse,
    MoexSearchResponse,
    MoexSecurityResponse,
} from '../integrations/moex/moex.types';
import { ensureInstrumentLogo, syncInstrumentLogos } from './logo.service';

const moex = new MoexClient();

export class InstrumentNotFoundError extends Error {}

function normalizeTicker(ticker: string) {
    return ticker.trim().toUpperCase();
}

function isBond(instrument: { market: string | null; type: string }) {
    return instrument.market === 'bonds' || instrument.type.includes('bond');
}

function isFund(instrument: { type: string }) {
    return instrument.type.includes('etf') || instrument.type.includes('fund') || instrument.type.includes('ppif');
}

function isShare(instrument: { market: string | null; type: string }) {
    return !isFund(instrument) && (instrument.market === 'shares' || instrument.type.includes('share'));
}

const sectorByTicker: Record<string, string> = {
    SBER: 'Финансы', SBERP: 'Финансы', VTBR: 'Финансы', MOEX: 'Финансы',
    GAZP: 'Нефть и газ', LKOH: 'Нефть и газ', ROSN: 'Нефть и газ', SIBN: 'Нефть и газ', NVTK: 'Нефть и газ',
    GMKN: 'Металлы и добыча', MAGN: 'Металлы и добыча', NLMK: 'Металлы и добыча', CHMF: 'Металлы и добыча', PLZL: 'Металлы и добыча', RUAL: 'Металлы и добыча',
    MTSS: 'Телеком', RTKM: 'Телеком',
    YDEX: 'ИТ', VKCO: 'ИТ', ASTR: 'ИТ', POSI: 'ИТ', HEAD: 'ИТ',
    OZON: 'Потребительский сектор', MGNT: 'Потребительский сектор', FIVE: 'Потребительский сектор', LENT: 'Потребительский сектор', MVID: 'Потребительский сектор',
    HYDR: 'Электроэнергетика', IRAO: 'Электроэнергетика', FEES: 'Электроэнергетика', OGKB: 'Электроэнергетика',
    AFLT: 'Транспорт', PHOR: 'Химия', DOMRF: 'Недвижимость', SMLT: 'Недвижимость', X5: 'Потребительский сектор', MRKC: 'Электроэнергетика',
};

const sectorByMoexId: Record<string, string> = {
    financials: 'Финансы', finance: 'Финансы', oil_gas: 'Нефть и газ', energy: 'Нефть и газ',
    metals_mining: 'Металлы и добыча', consumer: 'Потребительский сектор', telecom: 'Телеком',
    information_technology: 'ИТ', it: 'ИТ', utilities: 'Электроэнергетика', transport: 'Транспорт',
};

function getSector(
    instrument: { ticker: string; market: string | null; type: string },
    sectorId: string | null,
) {
    if (isBond(instrument)) return instrument.type.includes('ofz') ? 'Гособлигации' : 'Облигации';
    if (isFund(instrument)) return 'Фонд';
    if (sectorId) return sectorByMoexId[sectorId.toLowerCase()] ?? sectorId;
    return sectorByTicker[instrument.ticker] ?? null;
}

function normalizeInstrumentPrice(
    quote: ReturnType<typeof mapMoexPrice>,
    instrument: { market: string | null; type: string },
) {
    if (quote.price === null || !isBond(instrument)) return quote;

    // MOEX quotes bonds as a percentage of face value. Most Russian bonds have
    // a 1,000 RUB nominal; this fallback also keeps old saved instruments valid.
    const faceValue = quote.faceValue ?? 1_000;
    const price = (quote.price * faceValue) / 100 + (quote.accruedInterest ?? 0);
    return {
        ...quote,
        pricePercent: quote.price,
        price,
        faceValue,
        currentYieldPercent: quote.couponValue && quote.couponPeriodDays
            ? Number((((quote.couponValue * 365) / quote.couponPeriodDays / price) * 100).toFixed(2))
            : null,
        priceIncludesAccruedInterest: true,
    };
}

export async function getInstrumentFromMoex(ticker: string) {
    const data = await moex.get<MoexSecurityResponse>(
        `/securities/${normalizeTicker(ticker)}.json`,
    );

    const instrument = mapMoexSecurity(data);

    if (!instrument.board || !instrument.market) {
        return instrument;
    }

    const tradingData = await moex.get<MoexMarketDataResponse>(
        `/engines/stock/markets/${instrument.market}/boards/${instrument.board}/securities/${instrument.ticker}.json`,
        { 'iss.meta': 'off', 'iss.only': 'securities' },
    );

    return { ...instrument, ...mapMoexTradingParameters(tradingData) };
}

function toValues(instrument: NormalizedInstrument) {
    const now = new Date();

    return {
        ...instrument,
        ticker: normalizeTicker(instrument.ticker),
        createdAt: now,
        updatedAt: now,
    };
}

export async function addInstrument(ticker: string) {
    const values = toValues(await getInstrumentFromMoex(ticker));

    await db
        .insert(instruments)
        .values(values)
        .onConflictDoUpdate({
            target: instruments.ticker,
            set: {
                name: values.name,
                isin: values.isin,
                type: values.type,
                exchange: values.exchange,
                board: values.board,
                market: values.market,
                currency: values.currency,
                lotSize: values.lotSize,
                minPriceStep: values.minPriceStep,
                updatedAt: values.updatedAt,
            },
        });

    const savedInstrument = await getInstrument(values.ticker);
    // A missing third-party image must never prevent a security from being added.
    await ensureInstrumentLogo(savedInstrument);
    return getInstrument(values.ticker);
}

export { syncInstrumentLogos };

export async function getInstrument(ticker: string) {
    const [instrument] = await db
        .select()
        .from(instruments)
        .where(eq(instruments.ticker, normalizeTicker(ticker)));

    if (!instrument) {
        throw new InstrumentNotFoundError(`Instrument ${ticker} was not found`);
    }

    return instrument;
}

export async function searchInstruments(query = '') {
    const text = query.trim();
    const where = text
        ? or(
              like(instruments.ticker, `%${text.toUpperCase()}%`),
              like(instruments.name, `%${text}%`),
          )
        : undefined;

    return db
        .select()
        .from(instruments)
        .where(where)
        .orderBy(asc(instruments.ticker));
}

export async function searchMoexInstruments(query: string) {
    const text = query.trim();
    if (text.length < 2) {
        return [];
    }

    const ofzIssue = text.match(/^(?:ОФЗ[\s-]*)?(\d{5})$/i)?.[1];
    const searchQuery = ofzIssue ? `ОФЗ ${ofzIssue}` : text;

    const response = await moex.get<MoexSearchResponse>(
        '/securities.json',
        { q: searchQuery, 'iss.meta': 'off' },
    );

    const results = mapMoexSearch(response, searchQuery);

    if (ofzIssue) {
        return results
            .filter(
                (instrument) =>
                    instrument.type === 'ofz_bond' &&
                    (instrument.ticker.includes(ofzIssue) || instrument.name.includes(ofzIssue)),
            )
            .slice(0, 20);
    }

    return results.slice(0, 20);
}

export async function getInstrumentPrice(ticker: string) {
    const instrument = await getInstrument(ticker);

    if (!instrument.board || !instrument.market) {
        return {
            ticker: instrument.ticker,
            ...mapMoexPrice({}, instrument.currency),
        };
    }

    const response = await moex.get<MoexMarketDataResponse>(
        `/engines/stock/markets/${instrument.market}/boards/${instrument.board}/securities/${instrument.ticker}.json`,
        { 'iss.meta': 'off', 'iss.only': 'marketdata,securities' },
    );

    return {
        ticker: instrument.ticker,
        ...normalizeInstrumentPrice(mapMoexPrice(response, instrument.currency), instrument),
    };
}

async function getUsdRubRate() {
    try {
        const response = await moex.get<MoexMarketDataResponse>(
            '/engines/currency/markets/selt/boards/CETS/securities/USD000UTSTOM.json',
            { 'iss.meta': 'off', 'iss.only': 'marketdata,securities' },
        );
        return mapMoexPrice(response, 'RUB').price;
    } catch {
        return null;
    }
}

export async function getInstrumentsMarketData() {
    const savedInstruments = await searchInstruments();
    const needsUsdRubRate = savedInstruments.some((instrument) => isShare(instrument));
    const [results, usdRubRate] = await Promise.all([
        Promise.all(savedInstruments.map(async (instrument) => {
            try {
                return [instrument, await getInstrumentPrice(instrument.ticker)] as const;
            } catch {
                return [instrument, null] as const;
            }
        })),
        needsUsdRubRate ? getUsdRubRate() : Promise.resolve(null),
    ]);

    return results.map(([instrument, quote]) => ({
        ticker: instrument.ticker,
        price: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null,
        currency: quote?.currency ?? 'RUB',
        updatedAt: quote?.updatedAt ?? null,
        sector: getSector(instrument, quote?.sectorId ?? null),
        marketCapUsd: isShare(instrument) && quote?.issueCapitalizationRub && usdRubRate
            ? quote.issueCapitalizationRub / usdRubRate
            : null,
        // MOEX ISS does not publish company financial statements or LTM ratios.
        // Returning null is safer than showing an outdated or inferred multiple.
        pe: null,
        ps: null,
        payoutRatio: null,
    }));
}
