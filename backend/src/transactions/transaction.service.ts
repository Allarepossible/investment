import { and, asc, eq, isNull } from 'drizzle-orm';
import { calculatePortfolioTotals, type PortfolioTransaction } from '../analytics/portfolio.analytics';
import { db } from '../db';
import { instruments, portfolios, transactions } from '../db/schema';
import { getInstrument } from '../instruments/instrument.service';
import { getPortfolio } from '../portfolios/portfolio.service';

const transactionTypes = [
    'BUY',
    'SELL',
    'DIVIDEND',
    'COUPON',
    'FEE',
    'DEPOSIT',
    'WITHDRAWAL',
    'TAX',
] as const;

export type TransactionType = (typeof transactionTypes)[number];

export type TransactionInput = {
    portfolioId: number;
    instrumentId: number | null;
    type: TransactionType;
    quantity: number | null;
    priceKopecks: number | null;
    amountKopecks: number | null;
    commissionKopecks: number;
    currency: 'RUB';
    operationDate: Date;
    comment: string | null;
};

export class TransactionValidationError extends Error {}
export class TransactionNotFoundError extends Error {}

const tradeTypes = new Set<TransactionType>(['BUY', 'SELL']);
const instrumentIncomeTypes = new Set<TransactionType>(['DIVIDEND', 'COUPON']);

function requirePositiveInteger(value: number | null, field: string) {
    if (!Number.isSafeInteger(value) || !value || value < 1) {
        throw new TransactionValidationError(`${field} must be a positive integer`);
    }
}

export function parseTransactionInput(value: unknown): TransactionInput {
    if (!value || typeof value !== 'object') {
        throw new TransactionValidationError('Transaction body is required');
    }

    const body = value as Record<string, unknown>;
    const type = body.type;
    const portfolioId = body.portfolioId;
    const instrumentId = body.instrumentId === null || body.instrumentId === undefined
        ? null
        : body.instrumentId;
    const quantity = body.quantity === null || body.quantity === undefined ? null : body.quantity;
    const priceKopecks = body.priceKopecks === null || body.priceKopecks === undefined ? null : body.priceKopecks;
    const amountKopecks = body.amountKopecks === null || body.amountKopecks === undefined ? null : body.amountKopecks;
    const commissionKopecks = body.commissionKopecks ?? 0;
    const operationDate = new Date(String(body.operationDate));
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) || null : null;

    if (!Number.isSafeInteger(portfolioId) || (portfolioId as number) < 1) {
        throw new TransactionValidationError('portfolioId must be a positive integer');
    }
    if (!transactionTypes.includes(type as TransactionType)) {
        throw new TransactionValidationError('Unsupported transaction type');
    }
    if (instrumentId !== null && (!Number.isSafeInteger(instrumentId) || (instrumentId as number) < 1)) {
        throw new TransactionValidationError('instrumentId must be a positive integer or null');
    }
    if (!Number.isSafeInteger(commissionKopecks) || (commissionKopecks as number) < 0) {
        throw new TransactionValidationError('commissionKopecks must be a non-negative integer');
    }
    if (Number.isNaN(operationDate.getTime())) {
        throw new TransactionValidationError('operationDate must be a valid date');
    }

    const parsedType = type as TransactionType;
    if (tradeTypes.has(parsedType)) {
        if (instrumentId === null) throw new TransactionValidationError('Trades require an instrument');
        requirePositiveInteger(quantity as number | null, 'quantity');
        requirePositiveInteger(priceKopecks as number | null, 'priceKopecks');
    } else {
        if (instrumentIncomeTypes.has(parsedType) && instrumentId === null) {
            throw new TransactionValidationError(`${parsedType} requires an instrument`);
        }
        requirePositiveInteger(amountKopecks as number | null, 'amountKopecks');
    }

    return {
        portfolioId: portfolioId as number,
        instrumentId: instrumentId as number | null,
        type: parsedType,
        quantity: quantity as number | null,
        priceKopecks: priceKopecks as number | null,
        amountKopecks: amountKopecks as number | null,
        commissionKopecks: commissionKopecks as number,
        currency: 'RUB',
        operationDate,
        comment,
    };
}

export async function listTransactions(portfolioId?: number) {
    if (portfolioId) await getPortfolio(portfolioId);

    const query = db
        .select({
            id: transactions.id,
            portfolioId: transactions.portfolioId,
            instrumentId: transactions.instrumentId,
            type: transactions.type,
            quantity: transactions.quantity,
            priceKopecks: transactions.priceKopecks,
            amountKopecks: transactions.amountKopecks,
            commissionKopecks: transactions.commissionKopecks,
            currency: transactions.currency,
            operationDate: transactions.operationDate,
            comment: transactions.comment,
            createdAt: transactions.createdAt,
            ticker: instruments.ticker,
            name: instruments.name,
        })
        .from(transactions)
        .leftJoin(instruments, eq(transactions.instrumentId, instruments.id))
        .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id));

    return query
        .where(
            portfolioId
                ? and(eq(transactions.portfolioId, portfolioId), isNull(portfolios.archivedAt))
                : isNull(portfolios.archivedAt),
        )
        .orderBy(asc(transactions.operationDate), asc(transactions.id));
}

function toPortfolioTransactions(
    rows: Awaited<ReturnType<typeof listTransactions>>,
): PortfolioTransaction[] {
    return rows.map((row) => ({
        id: row.id,
        portfolioId: row.portfolioId,
        instrumentId: row.instrumentId,
        ticker: row.ticker,
        name: row.name,
        type: row.type,
        quantity: row.quantity,
        priceKopecks: row.priceKopecks,
        amountKopecks: row.amountKopecks,
        commissionKopecks: row.commissionKopecks,
        operationDate: row.operationDate,
    }));
}

export async function createTransaction(input: TransactionInput) {
    await getPortfolio(input.portfolioId);
    if (input.instrumentId) await getInstrumentById(input.instrumentId);

    if (input.type === 'SELL' && input.instrumentId) {
        const totals = calculatePortfolioTotals(toPortfolioTransactions(await listTransactions(input.portfolioId)));
        const position = totals.positions.find((item) => item.instrumentId === input.instrumentId);
        if (!position || position.quantity < (input.quantity ?? 0)) {
            throw new TransactionValidationError('Sell quantity exceeds the available position');
        }
    }

    const [transaction] = await db
        .insert(transactions)
        .values({ ...input, createdAt: new Date() })
        .returning();

    return transaction;
}

async function getInstrumentById(id: number) {
    const [instrument] = await db.select().from(instruments).where(eq(instruments.id, id));
    if (!instrument) throw new TransactionValidationError(`Instrument ${id} was not found`);
    return instrument;
}

export async function deleteTransaction(id: number) {
    const rows = await listTransactions();
    const transaction = rows.find((item) => item.id === id);
    if (!transaction) throw new TransactionNotFoundError(`Transaction ${id} was not found`);

    try {
        calculatePortfolioTotals(
            toPortfolioTransactions(
                rows.filter(
                    (item) => item.id !== id && item.portfolioId === transaction.portfolioId,
                ),
            ),
        );
    } catch {
        throw new TransactionValidationError(
            'This operation cannot be deleted because later operations depend on it',
        );
    }

    await db.delete(transactions).where(eq(transactions.id, id));
}
