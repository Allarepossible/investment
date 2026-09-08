import { and, asc, eq, isNull, like, or } from 'drizzle-orm';
import { db } from '../db';
import { instruments, portfolios, transactions } from '../db/schema';
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

const moex = new MoexClient();

export class InstrumentNotFoundError extends Error {}

function normalizeTicker(ticker: string) {
    return ticker.trim().toUpperCase();
}

function isBond(instrument: { market: string | null; type: string }) {
    return instrument.market === 'bonds' || instrument.type.includes('bond');
}

function normalizeInstrumentPrice(
    quote: ReturnType<typeof mapMoexPrice>,
    instrument: { market: string | null; type: string },
) {
    if (quote.price === null || !isBond(instrument)) return quote;

    // MOEX quotes bonds as a percentage of face value. Most Russian bonds have
    // a 1,000 RUB nominal; this fallback also keeps old saved instruments valid.
    const faceValue = quote.faceValue ?? 1_000;
    return {
        ...quote,
        rawPrice: quote.price,
        price: (quote.price * faceValue) / 100 + (quote.accruedInterest ?? 0),
        faceValue,
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

    return getInstrument(values.ticker);
}

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

export async function getInstrumentsMarketData() {
    const savedInstruments = await searchInstruments();
    const incomeRows = await db
        .select({
            instrumentId: transactions.instrumentId,
            amountKopecks: transactions.amountKopecks,
        })
        .from(transactions)
        .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
        .where(and(
            isNull(portfolios.archivedAt),
            or(eq(transactions.type, 'DIVIDEND'), eq(transactions.type, 'COUPON')),
        ));
    const incomeByInstrument = new Map<number, number>();
    for (const income of incomeRows) {
        if (income.instrumentId) {
            incomeByInstrument.set(
                income.instrumentId,
                (incomeByInstrument.get(income.instrumentId) ?? 0) + (income.amountKopecks ?? 0),
            );
        }
    }
    const results = await Promise.all(savedInstruments.map(async (instrument) => {
        try {
            return [instrument.ticker, await getInstrumentPrice(instrument.ticker)] as const;
        } catch {
            return [instrument.ticker, null] as const;
        }
    }));

    return results.map(([ticker, quote]) => ({
        ticker,
        price: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null,
        currency: quote?.currency ?? 'RUB',
        updatedAt: quote?.updatedAt ?? null,
        payoutsKopecks: incomeByInstrument.get(
            savedInstruments.find((instrument) => instrument.ticker === ticker)?.id ?? 0,
        ) ?? 0,
    }));
}
