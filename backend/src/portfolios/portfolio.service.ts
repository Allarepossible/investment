import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db';
import { portfolios, transactions } from '../db/schema';

export class PortfolioNotFoundError extends Error {}

export async function listPortfolios(userId: number) {
    return db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userId), isNull(portfolios.archivedAt)))
        .orderBy(asc(portfolios.createdAt));
}

export async function getPortfolio(userId: number, id: number) {
    const [portfolio] = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId), isNull(portfolios.archivedAt)));

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }

    return portfolio;
}

export async function createPortfolio(userId: number, name: string) {
    const now = new Date();

    // Older versions used a soft delete. Remove a previously deleted portfolio
    // with the same name so its historical operations and the global unique
    // name constraint do not prevent the user from starting over.
    const archived = await db
        .select({ id: portfolios.id })
        .from(portfolios)
        .where(and(eq(portfolios.userId, userId), eq(portfolios.name, name), isNotNull(portfolios.archivedAt)));

    if (archived.length) {
        const archivedIds = archived.map((portfolio) => portfolio.id);
        db.transaction((tx) => {
            tx.delete(transactions).where(inArray(transactions.portfolioId, archivedIds)).run();
            tx.delete(portfolios).where(inArray(portfolios.id, archivedIds)).run();
        });
    }

    const [portfolio] = await db
        .insert(portfolios)
        .values({ userId, name, createdAt: now, updatedAt: now })
        .returning();

    return portfolio;
}

export async function updatePortfolio(userId: number, id: number, name: string) {
    const [portfolio] = await db
        .update(portfolios)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId), isNull(portfolios.archivedAt)))
        .returning();

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }

    return portfolio;
}

export async function deletePortfolio(userId: number, id: number) {
    const portfolio = db.transaction((tx) => {
        const existing = tx
            .select({ id: portfolios.id })
            .from(portfolios)
            .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId), isNull(portfolios.archivedAt)))
            .get();

        if (!existing) {
            throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
        }

        tx.delete(transactions).where(eq(transactions.portfolioId, id)).run();
        return tx.delete(portfolios).where(eq(portfolios.id, id)).returning().get();
    });

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }
}

export async function getAggregatePortfolio(userId: number) {
    const items = await listPortfolios(userId);

    return {
        name: 'Общий портфель',
        portfolioCount: items.length,
        portfolios: items,
    };
}
