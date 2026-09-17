import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { portfolios } from '../db/schema';

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
    const [portfolio] = await db
        .update(portfolios)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId), isNull(portfolios.archivedAt)))
        .returning();

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
