import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCouponPayments } from './income-forecast.service';

test('projects the next coupon from MOEX and later coupons from the current period', () => {
    const payments = projectCouponPayments({
        instrumentId: 1,
        ticker: 'SU26246RMFS7',
        name: 'ОФЗ 26246',
        quantity: 10,
        nextCouponDate: '2026-10-14',
        couponValueRub: 42.5,
        couponPeriodDays: 182,
        maturityDate: '2036-03-12',
        today: '2026-09-15',
        horizonEnd: '2027-09-15',
    });

    assert.deepEqual(payments.map((payment) => ({ date: payment.date, amount: payment.amountKopecks, status: payment.status })), [
        { date: '2026-10-14', amount: 42_500, status: 'moex-date' },
        { date: '2027-04-14', amount: 42_500, status: 'estimated' },
    ]);
});

test('does not invent an overdue coupon when MOEX has no coupon period', () => {
    const payments = projectCouponPayments({
        instrumentId: 1,
        ticker: 'TEST',
        name: 'Тест',
        quantity: 1,
        nextCouponDate: '2026-09-01',
        couponValueRub: 20,
        couponPeriodDays: null,
        maturityDate: null,
        today: '2026-09-15',
        horizonEnd: '2027-09-15',
    });

    assert.deepEqual(payments, []);
});
