import { calculatePortfolioTotals } from './portfolio.analytics';
import { getInstrumentPrice } from '../instruments/instrument.service';
import { getPortfolio, listPortfolios } from '../portfolios/portfolio.service';
import { listTransactions } from '../transactions/transaction.service';

function priceToKopecks(price: number | null) {
    return price === null ? null : Math.round(price * 100);
}

export async function getPortfolioAnalytics(portfolioId?: number) {
    if (portfolioId) await getPortfolio(portfolioId);
    const activePortfolios = portfolioId ? null : new Set((await listPortfolios()).map((item) => item.id));
    const transactions = (await listTransactions(portfolioId)).filter(
        (transaction) => !activePortfolios || activePortfolios.has(transaction.portfolioId),
    );
    const totals = calculatePortfolioTotals(transactions);
    const quotes = await Promise.all(
        totals.positions.map(async (position) => {
            try {
                return [position.ticker, await getInstrumentPrice(position.ticker)] as const;
            } catch {
                return [position.ticker, null] as const;
            }
        }),
    );
    const prices = new Map(quotes);
    const positions = totals.positions.map((position) => {
        const quote = prices.get(position.ticker);
        const priceKopecks = priceToKopecks(quote?.price ?? null);
        const marketValueKopecks = priceKopecks === null ? null : priceKopecks * position.quantity;
        return {
            ...position,
            priceKopecks,
            marketValueKopecks,
            unrealizedPnlKopecks: marketValueKopecks === null ? null : marketValueKopecks - position.costKopecks,
            currency: quote?.currency ?? 'RUB',
        };
    });
    const securitiesValueKopecks = positions.reduce(
        (sum, position) => sum + (position.marketValueKopecks ?? 0),
        0,
    );
    const totalValueKopecks = totals.cashKopecks + securitiesValueKopecks;

    return {
        scope: portfolioId ? 'portfolio' : 'aggregate',
        portfolioId: portfolioId ?? null,
        currency: 'RUB',
        cashKopecks: totals.cashKopecks,
        securitiesValueKopecks,
        totalValueKopecks,
        netContributionsKopecks: totals.netContributionsKopecks,
        totalPnlKopecks: totalValueKopecks - totals.netContributionsKopecks,
        realizedPnlKopecks: totals.realizedPnlKopecks,
        incomeKopecks: totals.incomeKopecks,
        positions: positions.map((position) => ({
            ...position,
            allocationPercent: totalValueKopecks > 0 && position.marketValueKopecks !== null
                ? Number(((position.marketValueKopecks / totalValueKopecks) * 100).toFixed(2))
                : null,
        })),
    };
}
