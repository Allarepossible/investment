import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { portfolios } from '../db/schema';

export class PortfolioNotFoundError extends Error {}

export async function listPortfolios() {
    return db
        .select()
        .from(portfolios)
        .where(isNull(portfolios.archivedAt))
        .orderBy(asc(portfolios.createdAt));
}

export async function getPortfolio(id: number) {
    const [portfolio] = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.id, id), isNull(portfolios.archivedAt)));

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }

    return portfolio;
}

export async function createPortfolio(name: string) {
    const now = new Date();
    const [portfolio] = await db
        .insert(portfolios)
        .values({ name, createdAt: now, updatedAt: now })
        .returning();

    return portfolio;
}

export async function updatePortfolio(id: number, name: string) {
    const [portfolio] = await db
        .update(portfolios)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(portfolios.id, id), isNull(portfolios.archivedAt)))
        .returning();

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }

    return portfolio;
}

export async function deletePortfolio(id: number) {
    const [portfolio] = await db
        .update(portfolios)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(portfolios.id, id), isNull(portfolios.archivedAt)))
        .returning();

    if (!portfolio) {
        throw new PortfolioNotFoundError(`Portfolio ${id} was not found`);
    }
}

export async function getAggregatePortfolio() {
    const items = await listPortfolios();

    return {
        name: 'Общий портфель',
        portfolioCount: items.length,
        portfolios: items,
    };
}
