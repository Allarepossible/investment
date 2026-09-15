import { inArray } from 'drizzle-orm';
import { getPortfolioPositionTotals } from './analytics.service';
import { db } from '../db';
import { instruments } from '../db/schema';
import { getInstrumentDividendEstimate } from '../instruments/instrument-details.service';
import { getInstrumentPrice } from '../instruments/instrument.service';

const CACHE_TTL_MS = 5 * 60_000;
const HORIZON_DAYS = 365;

type SavedInstrument = typeof instruments.$inferSelect;

export type IncomeForecastPayment = {
    instrumentId: number;
    ticker: string;
    name: string;
    kind: 'coupon' | 'dividend';
    date: string | null;
    amountKopecks: number;
    status: 'moex-date' | 'estimated';
    note: string;
};

type ForecastResult = Awaited<ReturnType<typeof buildIncomeForecast>>;
type CachedResult = { expiresAt: number; value: ForecastResult };

const cache = new Map<string, CachedResult>();
const inFlight = new Map<string, Promise<ForecastResult>>();

function isBond(instrument: Pick<SavedInstrument, 'market' | 'type'>) {
    return instrument.market === 'bonds' || instrument.type.includes('bond');
}

function isShare(instrument: Pick<SavedInstrument, 'market' | 'type'>) {
    return instrument.market === 'shares' || instrument.type.includes('share');
}

function toDay(value: Date) {
    return value.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
    const date = new Date(`${day}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return toDay(date);
}

function isOnOrBefore(left: string, right: string) {
    return left.localeCompare(right) <= 0;
}

/**
 * MOEX exposes the next coupon date and the current coupon period. Only the
 * nearest date is taken verbatim from ISS; later dates are a transparent
 * projection based on that period, because schedules can be irregular.
 */
export function projectCouponPayments(input: {
    instrumentId: number;
    ticker: string;
    name: string;
    quantity: number;
    nextCouponDate: string | null;
    couponValueRub: number | null;
    couponPeriodDays: number | null;
    maturityDate: string | null;
    today: string;
    horizonEnd: string;
}): IncomeForecastPayment[] {
    const {
        instrumentId, ticker, name, quantity, nextCouponDate, couponValueRub, couponPeriodDays, maturityDate, today, horizonEnd,
    } = input;
    if (!nextCouponDate || couponValueRub === null || couponValueRub <= 0 || quantity <= 0) return [];

    const amountKopecks = Math.round(couponValueRub * quantity * 100);
    const payments: IncomeForecastPayment[] = [];
    let dueDate = nextCouponDate;
    let positionInSchedule = 0;

    // If the quote was taken between a coupon date and the next ISS refresh,
    // advance to the next period. Without a period we cannot safely guess.
    while (dueDate < today) {
        if (!couponPeriodDays || couponPeriodDays < 1) return [];
        dueDate = addDays(dueDate, couponPeriodDays);
        positionInSchedule += 1;
    }

    while (isOnOrBefore(dueDate, horizonEnd)) {
        if (maturityDate && dueDate > maturityDate) break;
        payments.push({
            instrumentId,
            ticker,
            name,
            kind: 'coupon',
            date: dueDate,
            amountKopecks,
            status: positionInSchedule === 0 ? 'moex-date' : 'estimated',
            note: positionInSchedule === 0
                ? 'Дата и размер купона из MOEX ISS'
                : 'Дата рассчитана по текущему купонному периоду',
        });
        if (!couponPeriodDays || couponPeriodDays < 1) break;
        dueDate = addDays(dueDate, couponPeriodDays);
        positionInSchedule += 1;
    }

    return payments;
}

async function buildIncomeForecast(portfolioId?: number) {
    const totals = await getPortfolioPositionTotals(portfolioId);
    const today = toDay(new Date());
    const horizonEnd = addDays(today, HORIZON_DAYS);
    const positionIds = totals.positions.map((position) => position.instrumentId);
    const savedInstruments = positionIds.length
        ? await db.select().from(instruments).where(inArray(instruments.id, positionIds))
        : [];
    const instrumentsById = new Map(savedInstruments.map((instrument) => [instrument.id, instrument]));

    const settledPositions = totals.positions.flatMap((position) => {
        const instrument = instrumentsById.get(position.instrumentId);
        return instrument ? [{ position, instrument }] : [];
    });
    const bondPositions = settledPositions.filter(({ instrument }) => isBond(instrument));
    const sharePositions = settledPositions.filter(({ instrument }) => isShare(instrument));

    const [couponResults, dividendResults] = await Promise.all([
        Promise.all(bondPositions.map(async ({ position, instrument }) => {
            try {
                const quote = await getInstrumentPrice(instrument.ticker);
                return projectCouponPayments({
                    instrumentId: instrument.id,
                    ticker: instrument.ticker,
                    name: instrument.name,
                    quantity: position.quantity,
                    nextCouponDate: quote.nextCouponDate,
                    couponValueRub: quote.couponValue,
                    couponPeriodDays: quote.couponPeriodDays,
                    maturityDate: quote.maturityDate,
                    today,
                    horizonEnd,
                });
            } catch {
                return [] as IncomeForecastPayment[];
            }
        })),
        Promise.all(sharePositions.map(async ({ position, instrument }) => {
            try {
                const estimate = await getInstrumentDividendEstimate(instrument.ticker);
                if (estimate.dividendPerShareRub === null || estimate.dividendPerShareRub <= 0) return [] as IncomeForecastPayment[];
                return [{
                    instrumentId: instrument.id,
                    ticker: instrument.ticker,
                    name: instrument.name,
                    kind: 'dividend' as const,
                    date: null,
                    amountKopecks: Math.round(estimate.dividendPerShareRub * position.quantity * 100),
                    status: 'estimated' as const,
                    note: 'Оценка по последней опубликованной годовой выплате',
                }];
            } catch {
                return [] as IncomeForecastPayment[];
            }
        })),
    ]);

    const payments = [...couponResults.flat(), ...dividendResults.flat()]
        .sort((left, right) => (left.date ?? '9999-12-31').localeCompare(right.date ?? '9999-12-31') || right.amountKopecks - left.amountKopecks);
    const couponKopecks = payments.filter((payment) => payment.kind === 'coupon').reduce((sum, payment) => sum + payment.amountKopecks, 0);
    const dividendKopecks = payments.filter((payment) => payment.kind === 'dividend').reduce((sum, payment) => sum + payment.amountKopecks, 0);

    return {
        scope: portfolioId ? 'portfolio' as const : 'aggregate' as const,
        portfolioId: portfolioId ?? null,
        generatedAt: new Date().toISOString(),
        horizon: { from: today, to: horizonEnd, days: HORIZON_DAYS },
        totalKopecks: couponKopecks + dividendKopecks,
        couponKopecks,
        dividendKopecks,
        nextPayment: payments.find((payment) => payment.date !== null) ?? null,
        payments,
        coverage: {
            openPositions: settledPositions.length,
            bondPositions: bondPositions.length,
            sharePositions: sharePositions.length,
            positionsWithPayments: new Set(payments.map((payment) => payment.instrumentId)).size,
        },
    };
}

export async function getPortfolioIncomeForecast(portfolioId?: number, refresh = false) {
    const key = String(portfolioId ?? 'aggregate');
    const cached = cache.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;

    const running = inFlight.get(key);
    if (running) return running;

    const request = buildIncomeForecast(portfolioId)
        .then((value) => {
            cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
            return value;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
}

export function invalidatePortfolioIncomeForecast(portfolioId?: number) {
    if (portfolioId === undefined) {
        cache.clear();
        return;
    }
    cache.delete(String(portfolioId));
    cache.delete('aggregate');
}
