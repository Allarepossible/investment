import { and, eq, inArray } from 'drizzle-orm';
import { calculatePortfolioTotals } from './portfolio.analytics';
import { db } from '../db';
import { instruments, transactions } from '../db/schema';
import { MoexClient } from '../integrations/moex/moex.client';
import { listPortfolios } from '../portfolios/portfolio.service';
import { listTransactions } from '../transactions/transaction.service';

const LOOKBACK_DAYS = 45;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const moex = new MoexClient();
const syncCache = new Map<string, number>();

type MoexCouponResponse = {
    coupons?: { columns: string[]; data: unknown[][] };
};

type Coupon = {
    date: string;
    recordDate: string;
    valueRub: number;
};

function toDay(value: Date) {
    return value.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
    const date = new Date(`${day}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return toDay(date);
}

function isBond(instrument: { market: string | null; type: string }) {
    return instrument.market === 'bonds' || instrument.type.includes('bond');
}

function asDay(value: Date) {
    return value.toISOString().slice(0, 10);
}

function readCoupons(response: MoexCouponResponse) {
    const block = response.coupons;
    if (!block) return [] as Coupon[];
    const index = (name: string) => block.columns.indexOf(name);
    const couponDate = index('coupondate');
    const recordDate = index('recorddate');
    const amount = index('value_rub');
    if (couponDate === -1 || amount === -1) return [] as Coupon[];

    return block.data.flatMap((row) => {
        const date = row[couponDate];
        const valueRub = Number(row[amount]);
        const record = recordDate === -1 ? date : row[recordDate];
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(valueRub) || valueRub <= 0) return [];
        return [{ date, recordDate: typeof record === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record) ? record : date, valueRub }];
    });
}

/**
 * Records recent, already due coupon payments from the official MOEX schedule.
 * The source id makes the operation idempotent. Holdings are calculated on the
 * record date, so a later sale does not erase an earned coupon.
 */
export async function syncAutomaticCoupons(userId: number, portfolioId?: number) {
    const cacheKey = `${userId}:${portfolioId ?? 'all'}`;
    if ((syncCache.get(cacheKey) ?? 0) > Date.now()) return { added: 0, skipped: true };

    const today = toDay(new Date());
    const since = addDays(today, -LOOKBACK_DAYS);
    let added = 0;
    const portfolioList = portfolioId
        ? (await listPortfolios(userId)).filter((portfolio) => portfolio.id === portfolioId)
        : await listPortfolios(userId);

    for (const portfolio of portfolioList) {
        const portfolioTransactions = await listTransactions(userId, portfolio.id);
        const instrumentIds = [...new Set(portfolioTransactions.flatMap((transaction) => transaction.instrumentId === null ? [] : [transaction.instrumentId]))];
        if (!instrumentIds.length) continue;

        const savedInstruments = await db.select().from(instruments).where(inArray(instruments.id, instrumentIds));
        const bondInstruments = savedInstruments.filter(isBond);
        if (!bondInstruments.length) continue;

        for (const instrument of bondInstruments) {
            let coupons: Coupon[];
            try {
                coupons = readCoupons(await moex.get<MoexCouponResponse>(
                    `/securities/${instrument.ticker}/bondization.json`,
                    { 'iss.meta': 'off', 'iss.only': 'coupons' },
                ));
            } catch {
                continue;
            }

            const dueCoupons = coupons.filter((coupon) => coupon.date >= since && coupon.date <= today);
            if (!dueCoupons.length) continue;
            const sourceIds = dueCoupons.map((coupon) => `auto-coupon:${portfolio.id}:${instrument.id}:${coupon.date}`);
            const existing = await db.select({ sourceId: transactions.sourceId })
                .from(transactions)
                .where(and(eq(transactions.portfolioId, portfolio.id), inArray(transactions.sourceId, sourceIds)));
            const existingSourceIds = new Set(existing.flatMap((row) => row.sourceId ? [row.sourceId] : []));

            for (const coupon of dueCoupons) {
                const sourceId = `auto-coupon:${portfolio.id}:${instrument.id}:${coupon.date}`;
                if (existingSourceIds.has(sourceId)) continue;
                const holdingsOnRecordDate = calculatePortfolioTotals(portfolioTransactions.filter(
                    (transaction) => asDay(transaction.operationDate) <= coupon.recordDate,
                )).positions.find((position) => position.instrumentId === instrument.id)?.quantity ?? 0;
                if (holdingsOnRecordDate <= 0) continue;

                await db.insert(transactions).values({
                    portfolioId: portfolio.id,
                    instrumentId: instrument.id,
                    type: 'COUPON',
                    quantity: null,
                    priceKopecks: null,
                    amountKopecks: Math.round(coupon.valueRub * holdingsOnRecordDate * 100),
                    accruedInterestKopecks: 0,
                    commissionKopecks: 0,
                    currency: 'RUB',
                    operationDate: new Date(`${coupon.date}T12:00:00.000Z`),
                    comment: `Автоматически добавлено по расписанию MOEX: ${coupon.valueRub.toLocaleString('ru-RU')} ₽ на облигацию`,
                    sourceId,
                    createdAt: new Date(),
                });
                added += 1;
            }
        }
    }

    syncCache.set(cacheKey, Date.now() + CACHE_TTL_MS);
    return { added, skipped: false };
}

export function invalidateAutomaticCouponSync(userId: number, portfolioId?: number) {
    syncCache.delete(`${userId}:${portfolioId ?? 'all'}`);
    syncCache.delete(`${userId}:all`);
}
