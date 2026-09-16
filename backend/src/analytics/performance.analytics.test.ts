import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateRiskMetrics,
    calculateTimeWeightedReturn,
    calculateXirr,
    estimateBondAccruedInterest,
} from './performance.analytics';

test('time-weighted return excludes a later deposit from investment performance', () => {
    const result = calculateTimeWeightedReturn([
        { date: '2026-01-01', valueKopecks: 100_000, externalFlowKopecks: 100_000 },
        { date: '2026-01-02', valueKopecks: 110_000, externalFlowKopecks: 0 },
        { date: '2026-01-03', valueKopecks: 230_000, externalFlowKopecks: 100_000 },
    ]);

    assert.equal(result, 30);
});

test('xirr returns the annual money-weighted return', () => {
    const result = calculateXirr([
        { date: '2025-01-01', amountKopecks: -100_000 },
        { date: '2026-01-01', amountKopecks: 110_000 },
    ]);

    assert.equal(result, 10);
});

test('risk drawdown is calculated from flow-adjusted returns', () => {
    const result = calculateRiskMetrics([
        { date: '2026-01-01', valueKopecks: 100_000, externalFlowKopecks: 100_000 },
        { date: '2026-01-02', valueKopecks: 110_000, externalFlowKopecks: 0 },
        { date: '2026-01-03', valueKopecks: 88_000, externalFlowKopecks: 0 },
        { date: '2026-01-04', valueKopecks: 96_800, externalFlowKopecks: 0 },
    ], []);

    assert.equal(result.maximumDrawdownPercent, -20);
    assert.equal(result.var95Percent, 17);
});

test('bond valuation adds accrued interest and resets it on a coupon date', () => {
    const input = {
        asOfDay: '2026-09-16',
        accruedInterestRub: 54.25,
        couponValueRub: 56.1,
        couponPeriodDays: 182,
        nextCouponDate: '2026-09-23',
    };

    assert.equal(estimateBondAccruedInterest({ ...input, day: '2026-09-16' }), 54.25);
    assert.equal(estimateBondAccruedInterest({ ...input, day: '2026-09-23' }), 0);
    assert.equal(estimateBondAccruedInterest({ ...input, day: '2026-08-26' }), 47.47);
});
