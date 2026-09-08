import type { MoexSecurityResponse } from './moex.types';

export interface NormalizedInstrument {
    ticker: string;
    name: string;
    isin: string | null;
    type: string;
    exchange: string;
    board: string | null;
    market: string | null;
    currency: string;
    lotSize: number | null;
    minPriceStep: number | null;
}

export interface NormalizedPrice {
    price: number | null;
    changePercent: number | null;
    currency: string;
    updatedAt: string;
}

export interface MoexSearchResult {
    ticker: string;
    name: string;
    type: string;
    board: string | null;
}

function getDescriptionValue(
    block: {
        columns: string[];
        data: unknown[][];
    },
    name: string,
): unknown {
    const nameIndex = block.columns.indexOf('name');
    const valueIndex = block.columns.indexOf('value');

    if (nameIndex === -1 || valueIndex === -1) {
        return null;
    }

    const row = block.data.find(
        (row) => row[nameIndex] === name,
    );

    return row?.[valueIndex] ?? null;
}

function getBoardValue(
    block: {
        columns: string[];
        data: unknown[][];
    },
    row: unknown[],
    column: string,
): unknown {
    const index = block.columns.indexOf(column);

    if (index === -1) {
        return null;
    }

    return row[index] ?? null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    return null;
}

export function mapMoexSecurity(
    response: MoexSecurityResponse,
): NormalizedInstrument {
    if (!response.description) {
        throw new Error(
            'MOEX response does not contain description block',
        );
    }

    const description = response.description;

    const ticker = getDescriptionValue(
        description,
        'SECID',
    );

    if (!ticker) {
        throw new Error('Security ticker was not found');
    }

    const shortName = getDescriptionValue(
        description,
        'SHORTNAME',
    );

    const fullName = getDescriptionValue(
        description,
        'NAME',
    );

    const isin = getDescriptionValue(description, 'ISIN');

    const type =
        getDescriptionValue(description, 'TYPE') ??
        getDescriptionValue(description, 'GROUP') ??
        'unknown';

    let board: string | null = null;
    let market: string | null = null;
    let currency = 'RUB';

    if (response.boards) {
        const primaryBoard = response.boards.data.find(
            (row) =>
                getBoardValue(
                    response.boards!,
                    row,
                    'is_primary',
                ) === 1,
        );

        if (primaryBoard) {
            const boardValue = getBoardValue(
                response.boards,
                primaryBoard,
                'boardid',
            );

            const currencyValue = getBoardValue(
                response.boards,
                primaryBoard,
                'currencyid',
            );

            board = boardValue ? String(boardValue) : null;

            const marketValue = getBoardValue(
                response.boards,
                primaryBoard,
                'market',
            );
            market = marketValue ? String(marketValue) : null;

            currency = currencyValue
                ? String(currencyValue)
                : 'RUB';
        }
    }

    return {
        ticker: String(ticker),
        name: String(shortName ?? fullName ?? ticker),
        isin: isin ? String(isin) : null,
        type: String(type),
        exchange: 'MOEX',
        board,
        market,
        currency,
        lotSize: asNumber(getDescriptionValue(description, 'LOTSIZE')),
        minPriceStep: asNumber(getDescriptionValue(description, 'MINSTEP')),
    };
}

export function mapMoexPrice(
    response: { marketdata?: { columns: string[]; data: unknown[][] } },
    currency: string,
): NormalizedPrice {
    const marketdata = response.marketdata;
    const row = marketdata?.data[0];

    if (!marketdata || !row) {
        return { price: null, changePercent: null, currency, updatedAt: new Date().toISOString() };
    }

    for (const field of ['LAST', 'MARKETPRICE', 'LCLOSEPRICE']) {
        const value = asNumber(getBoardValue(marketdata, row, field));
        if (value !== null) {
            return {
                price: value,
                changePercent: asNumber(getBoardValue(marketdata, row, 'LASTCHANGEPRCNT')),
                currency,
                updatedAt: String(getBoardValue(marketdata, row, 'SYSTIME') ?? new Date().toISOString()),
            };
        }
    }

    return { price: null, changePercent: null, currency, updatedAt: new Date().toISOString() };
}

export function mapMoexTradingParameters(
    response: { securities?: { columns: string[]; data: unknown[][] } },
): Pick<NormalizedInstrument, 'lotSize' | 'minPriceStep'> {
    const securities = response.securities;
    const row = securities?.data[0];

    if (!securities || !row) {
        return { lotSize: null, minPriceStep: null };
    }

    return {
        lotSize: asNumber(getBoardValue(securities, row, 'LOTSIZE')),
        minPriceStep: asNumber(getBoardValue(securities, row, 'MINSTEP')),
    };
}

export function mapMoexSearch(
    response: { securities?: { columns: string[]; data: unknown[][] } },
    query = '',
): MoexSearchResult[] {
    const securities = response.securities;
    if (!securities) {
        return [];
    }

    return securities.data
        .map((row) => {
            const ticker = getBoardValue(securities, row, 'secid');
            const shortName = getBoardValue(securities, row, 'shortname');
            const name = getBoardValue(securities, row, 'name');
            const type = getBoardValue(securities, row, 'type');
            const board = getBoardValue(securities, row, 'primary_boardid');

            if (!ticker) {
                return null;
            }

            return {
                ticker: String(ticker),
                name: String(shortName ?? name ?? ticker),
                type: String(type ?? 'unknown'),
                board: board ? String(board) : null,
            };
        })
        .filter((item): item is MoexSearchResult => item !== null)
        .sort((left, right) => {
            const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
            const rank = (item: MoexSearchResult) => {
                const ticker = item.ticker.toLocaleLowerCase('ru-RU');
                const name = item.name.toLocaleLowerCase('ru-RU');
                if (ticker === normalizedQuery) return 0;
                if (name === normalizedQuery) return 1;
                if (ticker.startsWith(normalizedQuery)) return 2;
                if (name.startsWith(normalizedQuery)) return 3;
                if (item.type.includes('index')) return 5;
                return 4;
            };
            return rank(left) - rank(right) || left.ticker.localeCompare(right.ticker);
        });
}
