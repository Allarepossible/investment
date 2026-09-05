import type { MoexSecurityResponse } from './moex.types';

export interface NormalizedInstrument {
    ticker: string;
    name: string;
    type: string;
    exchange: string;
    board: string | null;
    currency: string;
    lotSize: number | null;
    minPriceStep: number | null;
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

    const type =
        getDescriptionValue(description, 'TYPE') ??
        getDescriptionValue(description, 'GROUP') ??
        'unknown';

    let board: string | null = null;
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

            currency = currencyValue
                ? String(currencyValue)
                : 'RUB';
        }
    }

    return {
        ticker: String(ticker),
        name: String(shortName ?? fullName ?? ticker),
        type: String(type),
        exchange: 'MOEX',
        board,
        currency,
        lotSize: null,
        minPriceStep: null,
    };
}