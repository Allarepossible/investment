import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssetAllocation } from './portfolio-comparison.analytics';

test('builds a portfolio allocation with cash and asset classes', () => {
    const allocation = buildAssetAllocation({
        cashKopecks: 20_000,
        positions: [
            { instrumentId: 1, marketValueKopecks: 50_000 },
            { instrumentId: 2, marketValueKopecks: 30_000 },
        ],
        instrumentsById: new Map([
            [1, { id: 1, market: 'shares', type: 'common_share' }],
            [2, { id: 2, market: 'bonds', type: 'ofz_bond' }],
        ]),
    });

    assert.deepEqual(allocation.map((item) => [item.key, item.valueKopecks, item.allocationPercent]), [
        ['shares', 50_000, 50],
        ['bonds', 30_000, 30],
        ['funds', 0, 0],
        ['other', 0, 0],
        ['cash', 20_000, 20],
    ]);
});
