import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePortfolioTotals, type PortfolioTransaction } from './portfolio.analytics';

const transaction = (overrides: Partial<PortfolioTransaction>): PortfolioTransaction => ({
    id: 1,
    portfolioId: 1,
    instrumentId: 1,
    ticker: 'SBER',
    name: 'Сбербанк',
    type: 'BUY',
    quantity: 10,
    priceKopecks: 25_000,
    amountKopecks: null,
    accruedInterestKopecks: 0,
    commissionKopecks: 100,
    operationDate: new Date('2026-01-01'),
    ...overrides,
});

test('calculates a position and commission-inclusive cost basis', () => {
    const result = calculatePortfolioTotals([transaction({})]);

    assert.equal(result.cashKopecks, -250_100);
    assert.deepEqual(result.positions[0], {
        instrumentId: 1,
        ticker: 'SBER',
        name: 'Сбербанк',
        quantity: 10,
        costKopecks: 250_100,
        averageCostKopecks: 25_010,
        realizedPnlKopecks: 0,
    });
});

test('calculates realized profit after a partial sell', () => {
    const result = calculatePortfolioTotals([
        transaction({}),
        transaction({
            id: 2,
            type: 'SELL',
            quantity: 4,
            priceKopecks: 30_000,
            commissionKopecks: 80,
            operationDate: new Date('2026-02-01'),
        }),
    ]);

    assert.equal(result.cashKopecks, -130_180);
    assert.equal(result.realizedPnlKopecks, 19_880);
    assert.equal(result.positions[0].quantity, 6);
    assert.equal(result.positions[0].costKopecks, 150_060);
});

test('rejects a sale larger than the available position', () => {
    assert.throws(
        () => calculatePortfolioTotals([
            transaction({}),
            transaction({ id: 2, type: 'SELL', quantity: 11, priceKopecks: 30_000 }),
        ]),
        /sells more than the available position/,
    );
});
