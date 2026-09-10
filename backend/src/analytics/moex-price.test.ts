import assert from 'node:assert/strict';
import test from 'node:test';
import { mapMoexPrice } from '../integrations/moex/moex.mapper';

test('uses the previous MOEX price when the current session has no trade', () => {
    const quote = mapMoexPrice({
        marketdata: {
            columns: ['LAST', 'MARKETPRICE', 'LCLOSEPRICE', 'ISSUECAPITALIZATION'],
            data: [[null, null, null, 6_027_075_881_600]],
        },
        securities: {
            columns: ['PREVWAPRICE', 'PREVPRICE', 'FACEVALUE', 'ACCRUEDINT', 'SECTORID'],
            data: [[82.75, 82.7, 1_000, 12.5, 'financials']],
        },
    }, 'RUB');

    assert.equal(quote.price, 82.75);
    assert.equal(quote.faceValue, 1_000);
    assert.equal(quote.accruedInterest, 12.5);
    assert.equal(quote.issueCapitalizationRub, 6_027_075_881_600);
    assert.equal(quote.sectorId, 'financials');
});
