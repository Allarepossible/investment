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

const moex = new MoexClient();

export class InstrumentNotFoundError extends Error {}

function normalizeTicker(ticker: string) {
    return ticker.trim().toUpperCase();
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

    const response = await moex.get<MoexSearchResponse>(
        '/securities.json',
        { q: text, 'iss.meta': 'off' },
    );

    return mapMoexSearch(response, text);
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
        { 'iss.meta': 'off', 'iss.only': 'marketdata' },
    );

    return {
        ticker: instrument.ticker,
        ...mapMoexPrice(response, instrument.currency),
    };
}
