import { inArray } from 'drizzle-orm';
import { getPortfolioAnalytics } from './analytics.service';
import { buildAssetAllocation } from './portfolio-comparison.analytics';
import { db } from '../db';
import { instruments } from '../db/schema';
import { listPortfolios } from '../portfolios/portfolio.service';

export async function getPortfolioComparison(userId: number) {
    const portfolios = await listPortfolios(userId);
    const analyticsByPortfolio = await Promise.all(portfolios.map(async (portfolio) => [
        portfolio,
        await getPortfolioAnalytics(userId, portfolio.id),
    ] as const));
    const instrumentIds = [...new Set(analyticsByPortfolio.flatMap(([, analytics]) => analytics.positions.map((position) => position.instrumentId)))];
    const savedInstruments = instrumentIds.length
        ? await db.select({ id: instruments.id, market: instruments.market, type: instruments.type }).from(instruments).where(inArray(instruments.id, instrumentIds))
        : [];
    const instrumentsById = new Map(savedInstruments.map((instrument) => [instrument.id, instrument]));

    const rows = analyticsByPortfolio.map(([portfolio, analytics]) => {
        const returnOnContributionsPercent = analytics.netContributionsKopecks > 0
            ? Number((analytics.totalPnlKopecks / analytics.netContributionsKopecks * 100).toFixed(2))
            : null;
        return {
            id: portfolio.id,
            name: portfolio.name,
            createdAt: portfolio.createdAt,
            totalValueKopecks: analytics.totalValueKopecks,
            netContributionsKopecks: analytics.netContributionsKopecks,
            totalPnlKopecks: analytics.totalPnlKopecks,
            returnOnContributionsPercent,
            cashKopecks: analytics.cashKopecks,
            positionsCount: analytics.positions.length,
            allocation: buildAssetAllocation({
                cashKopecks: analytics.cashKopecks,
                positions: analytics.positions,
                instrumentsById,
            }),
        };
    }).sort((left, right) => right.totalValueKopecks - left.totalValueKopecks || left.name.localeCompare(right.name, 'ru-RU'));

    return {
        generatedAt: new Date().toISOString(),
        currency: 'RUB',
        aggregate: {
            portfoliosCount: rows.length,
            totalValueKopecks: rows.reduce((sum, item) => sum + item.totalValueKopecks, 0),
            netContributionsKopecks: rows.reduce((sum, item) => sum + item.netContributionsKopecks, 0),
            totalPnlKopecks: rows.reduce((sum, item) => sum + item.totalPnlKopecks, 0),
        },
        portfolios: rows,
    };
}
