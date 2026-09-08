export type PortfolioTransaction = {
    id: number;
    portfolioId: number;
    instrumentId: number | null;
    ticker: string | null;
    name: string | null;
    type: string;
    quantity: number | null;
    priceKopecks: number | null;
    amountKopecks: number | null;
    accruedInterestKopecks: number;
    commissionKopecks: number;
    operationDate: Date;
};

export type Position = {
    instrumentId: number;
    ticker: string;
    name: string;
    quantity: number;
    costKopecks: number;
    averageCostKopecks: number;
    realizedPnlKopecks: number;
};

export type PortfolioTotals = {
    cashKopecks: number;
    netContributionsKopecks: number;
    realizedPnlKopecks: number;
    incomeKopecks: number;
    positions: Position[];
};

type WorkingPosition = Position;

function getPosition(
    positions: Map<number, WorkingPosition>,
    transaction: PortfolioTransaction,
) {
    if (!transaction.instrumentId || !transaction.ticker || !transaction.name) {
        throw new Error(`Transaction ${transaction.id} requires an instrument`);
    }

    let position = positions.get(transaction.instrumentId);
    if (!position) {
        position = {
            instrumentId: transaction.instrumentId,
            ticker: transaction.ticker,
            name: transaction.name,
            quantity: 0,
            costKopecks: 0,
            averageCostKopecks: 0,
            realizedPnlKopecks: 0,
        };
        positions.set(transaction.instrumentId, position);
    }

    return position;
}

export function calculatePortfolioTotals(
    transactions: PortfolioTransaction[],
): PortfolioTotals {
    const positions = new Map<number, WorkingPosition>();
    let cashKopecks = 0;
    let netContributionsKopecks = 0;
    let realizedPnlKopecks = 0;
    let incomeKopecks = 0;

    const ordered = [...transactions].sort(
        (left, right) => left.operationDate.getTime() - right.operationDate.getTime() || left.id - right.id,
    );

    for (const transaction of ordered) {
        const commission = transaction.commissionKopecks;

        switch (transaction.type) {
            case 'BUY': {
                const position = getPosition(positions, transaction);
                const quantity = transaction.quantity ?? 0;
                const price = transaction.priceKopecks ?? 0;
                const total = quantity * price + transaction.accruedInterestKopecks + commission;
                position.quantity += quantity;
                position.costKopecks += total;
                position.averageCostKopecks = Math.round(position.costKopecks / position.quantity);
                cashKopecks -= total;
                break;
            }
            case 'SELL': {
                const position = getPosition(positions, transaction);
                const quantity = transaction.quantity ?? 0;
                const price = transaction.priceKopecks ?? 0;
                if (quantity > position.quantity) {
                    throw new Error(`Transaction ${transaction.id} sells more than the available position`);
                }
                const averageCost = position.quantity ? position.costKopecks / position.quantity : 0;
                const soldCost = Math.round(averageCost * quantity);
                const proceeds = quantity * price + transaction.accruedInterestKopecks - commission;
                position.quantity -= quantity;
                position.costKopecks -= soldCost;
                position.averageCostKopecks = position.quantity
                    ? Math.round(position.costKopecks / position.quantity)
                    : 0;
                position.realizedPnlKopecks += proceeds - soldCost;
                realizedPnlKopecks += proceeds - soldCost;
                cashKopecks += proceeds;
                break;
            }
            case 'DIVIDEND':
            case 'COUPON': {
                const amount = transaction.amountKopecks ?? 0;
                cashKopecks += amount - commission;
                incomeKopecks += amount - commission;
                break;
            }
            case 'DEPOSIT': {
                const amount = transaction.amountKopecks ?? 0;
                cashKopecks += amount;
                netContributionsKopecks += amount;
                break;
            }
            case 'WITHDRAWAL': {
                const amount = transaction.amountKopecks ?? 0;
                cashKopecks -= amount + commission;
                netContributionsKopecks -= amount;
                break;
            }
            case 'FEE':
            case 'TAX': {
                cashKopecks -= (transaction.amountKopecks ?? 0) + commission;
                break;
            }
        }
    }

    return {
        cashKopecks,
        netContributionsKopecks,
        realizedPnlKopecks,
        incomeKopecks,
        positions: [...positions.values()].filter((position) => position.quantity > 0),
    };
}
