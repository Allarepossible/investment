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
    pricePercent: number | null;
    changePercent: number | null;
    currency: string;
    updatedAt: string;
    faceValue: number | null;
    accruedInterest: number | null;
    couponValue: number | null;
    couponPeriodDays: number | null;
    nextCouponDate: string | null;
    offerDate: string | null;
    maturityDate: string | null;
    yieldToMaturityPercent: number | null;
    yieldToOfferPercent: number | null;
    currentYieldPercent: number | null;
    issueCapitalizationRub: number | null;
    sectorId: string | null;
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

function asDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value === '0000-00-00') {
        return null;
    }
    return value;
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
    response: {
        marketdata?: { columns: string[]; data: unknown[][] };
        securities?: { columns: string[]; data: unknown[][] };
    },
    currency: string,
): NormalizedPrice {
    const marketdata = response.marketdata;
    const row = marketdata?.data[0];
    const security = response.securities?.data[0];
    const faceValue = security && response.securities
        ? asNumber(getBoardValue(response.securities, security, 'FACEVALUE'))
        : null;
    const accruedInterest = security && response.securities
        ? asNumber(getBoardValue(response.securities, security, 'ACCRUEDINT'))
        : null;
    const couponValue = security && response.securities
        ? asNumber(getBoardValue(response.securities, security, 'COUPONVALUE'))
        : null;
    const couponPeriodDays = security && response.securities
        ? asNumber(getBoardValue(response.securities, security, 'COUPONPERIOD'))
        : null;
    const nextCouponDate = security && response.securities
        ? asDate(getBoardValue(response.securities, security, 'NEXTCOUPON'))
        : null;
    const offerDate = security && response.securities
        ? asDate(getBoardValue(response.securities, security, 'OFFERDATE'))
        : null;
    const maturityDate = security && response.securities
        ? asDate(getBoardValue(response.securities, security, 'MATDATE'))
        : null;
    const yieldToMaturityPercent = row && marketdata
        ? asNumber(getBoardValue(marketdata, row, 'YIELD'))
        : null;
    const yieldToOfferPercent = row && marketdata
        ? asNumber(getBoardValue(marketdata, row, 'YIELDTOOFFER'))
        : null;
    const issueCapitalizationRub = row && marketdata
        ? asNumber(getBoardValue(marketdata, row, 'ISSUECAPITALIZATION'))
        : null;
    const sectorValue = security && response.securities
        ? getBoardValue(response.securities, security, 'SECTORID')
        : null;
    const sectorId = typeof sectorValue === 'string' && sectorValue.trim()
        ? sectorValue
        : null;

    const marketPrice = marketdata && row
        ? ['LAST', 'MARKETPRICE', 'LCLOSEPRICE']
            .map((field) => asNumber(getBoardValue(marketdata, row, field)))
            .find((value): value is number => value !== null) ?? null
        : null;
    // If there was no trade in the current session, MOEX still provides the
    // previous weighted/closing price in the security block.
    const previousPrice = security && response.securities
        ? ['PREVWAPRICE', 'PREVPRICE', 'PREVLEGALCLOSEPRICE']
            .map((field) => asNumber(getBoardValue(response.securities!, security, field)))
            .find((value): value is number => value !== null) ?? null
        : null;
    const price = marketPrice ?? previousPrice;

    if (price !== null) {
        return {
            price,
            pricePercent: null,
            changePercent: marketdata && row
                ? asNumber(getBoardValue(marketdata, row, 'LASTCHANGEPRCNT'))
                : null,
            currency,
            updatedAt: marketdata && row
                ? String(getBoardValue(marketdata, row, 'SYSTIME') ?? new Date().toISOString())
                : new Date().toISOString(),
            faceValue,
            accruedInterest,
            couponValue,
            couponPeriodDays,
            nextCouponDate,
            offerDate,
            maturityDate,
            yieldToMaturityPercent,
            yieldToOfferPercent,
            currentYieldPercent: null,
            issueCapitalizationRub,
            sectorId,
        };
    }

    return {
        price: null,
        pricePercent: null,
        changePercent: null,
        currency,
        updatedAt: new Date().toISOString(),
        faceValue,
        accruedInterest,
        couponValue,
        couponPeriodDays,
        nextCouponDate,
        offerDate,
        maturityDate,
        yieldToMaturityPercent,
        yieldToOfferPercent,
        currentYieldPercent: null,
        issueCapitalizationRub,
        sectorId,
    };
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
