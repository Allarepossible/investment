export type AssetClassKey = 'shares' | 'bonds' | 'funds' | 'other' | 'cash';

export type AssetClassAllocation = {
    key: AssetClassKey;
    name: string;
    valueKopecks: number;
    allocationPercent: number;
};

type PositionInput = {
    instrumentId: number;
    marketValueKopecks: number | null;
};

type InstrumentInput = {
    id: number;
    market: string | null;
    type: string;
};

const assetClasses: Array<Pick<AssetClassAllocation, 'key' | 'name'>> = [
    { key: 'shares', name: 'Акции' },
    { key: 'bonds', name: 'Облигации' },
    { key: 'funds', name: 'Фонды' },
    { key: 'other', name: 'Прочее' },
    { key: 'cash', name: 'Деньги' },
];

export function getAssetClass(instrument: Omit<InstrumentInput, 'id'>): AssetClassKey {
    if (instrument.market === 'bonds' || instrument.type.includes('bond')) return 'bonds';
    if (instrument.type.includes('etf') || instrument.type.includes('fund') || instrument.type.includes('ppif')) return 'funds';
    if (instrument.market === 'shares' || instrument.type.includes('share')) return 'shares';
    return 'other';
}

export function buildAssetAllocation(input: {
    cashKopecks: number;
    positions: PositionInput[];
    instrumentsById: Map<number, InstrumentInput>;
}): AssetClassAllocation[] {
    const values = new Map<AssetClassKey, number>(assetClasses.map(({ key }) => [key, 0]));
    values.set('cash', input.cashKopecks);

    input.positions.forEach((position) => {
        if (position.marketValueKopecks === null) return;
        const instrument = input.instrumentsById.get(position.instrumentId);
        const key = instrument ? getAssetClass(instrument) : 'other';
        values.set(key, (values.get(key) ?? 0) + position.marketValueKopecks);
    });

    const totalKopecks = [...values.values()].reduce((sum, value) => sum + value, 0);
    return assetClasses.map(({ key, name }) => {
        const valueKopecks = values.get(key) ?? 0;
        return {
            key,
            name,
            valueKopecks,
            allocationPercent: totalKopecks > 0 ? Number((valueKopecks / totalKopecks * 100).toFixed(2)) : 0,
        };
    });
}

