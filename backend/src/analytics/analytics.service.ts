import { inArray } from 'drizzle-orm';
import { calculatePortfolioTotals } from './portfolio.analytics';
import { db } from '../db';
import { instruments } from '../db/schema';
import { getInstrumentPrice } from '../instruments/instrument.service';
import { getPortfolio, listPortfolios } from '../portfolios/portfolio.service';
import { listTransactions } from '../transactions/transaction.service';

function priceToKopecks(price: number | null) {
    return price === null ? null : Math.round(price * 100);
}

function isBond(instrument: { market: string | null; type: string }) {
    return instrument.market === 'bonds' || instrument.type.includes('bond');
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

export async function getBondAnalytics(portfolioId?: number) {
    const analytics = await getPortfolioAnalytics(portfolioId);
    const positionIds = analytics.positions.map((position) => position.instrumentId);
    const savedInstruments = positionIds.length
        ? await db
            .select({
                id: instruments.id,
                ticker: instruments.ticker,
                type: instruments.type,
                market: instruments.market,
            })
            .from(instruments)
            .where(inArray(instruments.id, positionIds))
        : [];
    const instrumentsById = new Map(savedInstruments.map((instrument) => [instrument.id, instrument]));
    const bondPositions = analytics.positions.filter((position) => {
        const instrument = instrumentsById.get(position.instrumentId);
        return instrument ? isBond(instrument) : false;
    });
    const quotes = await Promise.all(bondPositions.map(async (position) => {
        try {
            return [position.instrumentId, await getInstrumentPrice(position.ticker)] as const;
        } catch {
            return [position.instrumentId, null] as const;
        }
    }));
    const quotesById = new Map(quotes);

    return {
        scope: analytics.scope,
        portfolioId: analytics.portfolioId,
        currency: 'RUB',
        positions: bondPositions.map((position) => {
            const quote = quotesById.get(position.instrumentId);
            const couponValue = quote?.couponValue ?? null;
            return {
                instrumentId: position.instrumentId,
                ticker: position.ticker,
                name: position.name,
                quantity: position.quantity,
                investedKopecks: position.costKopecks,
                pricePercent: quote?.pricePercent ?? null,
                nextCouponDate: quote?.nextCouponDate ?? null,
                nextCouponKopecks: couponValue === null ? null : Math.round(couponValue * position.quantity * 100),
                offerDate: quote?.offerDate ?? null,
                maturityDate: quote?.maturityDate ?? null,
                creditRating: null,
                currentYieldPercent: quote?.currentYieldPercent ?? null,
                yieldToMaturityPercent: quote?.yieldToMaturityPercent ?? null,
            };
        }),
    };
}
