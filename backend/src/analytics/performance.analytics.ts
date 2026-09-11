export type ValuationPoint = {
    date: string;
    valueKopecks: number;
    externalFlowKopecks: number;
};

export type PricePoint = {
    date: string;
    close: number;
};

export type CashFlow = {
    date: string;
    amountKopecks: number;
};

function round(value: number, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
}

function daysBetween(left: string, right: string) {
    const start = new Date(`${left}T12:00:00Z`).getTime();
    const end = new Date(`${right}T12:00:00Z`).getTime();
    return (end - start) / 86_400_000;
}

function average(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleDeviation(values: number[]) {
    if (values.length < 2) return null;
    const mean = average(values);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function percentile(sortedValues: number[], percentileValue: number) {
    if (!sortedValues.length) return null;
    const position = (sortedValues.length - 1) * percentileValue;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export function calculateDailyReturns(points: ValuationPoint[]) {
    const returns: Array<{ date: string; value: number }> = [];

    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous.valueKopecks <= 0) continue;
        const value = (current.valueKopecks - current.externalFlowKopecks) / previous.valueKopecks - 1;
        if (Number.isFinite(value)) returns.push({ date: current.date, value });
    }

    return returns;
}

export function calculateTimeWeightedReturn(points: ValuationPoint[]) {
    const dailyReturns = calculateDailyReturns(points);
    if (!dailyReturns.length) return null;
    return round((dailyReturns.reduce((result, item) => result * (1 + item.value), 1) - 1) * 100, 2);
}

export function calculateXirr(flows: CashFlow[]) {
    if (flows.length < 2) return null;
    const hasPositive = flows.some((flow) => flow.amountKopecks > 0);
    const hasNegative = flows.some((flow) => flow.amountKopecks < 0);
    if (!hasPositive || !hasNegative) return null;

    const ordered = [...flows].sort((left, right) => left.date.localeCompare(right.date));
    const baseDate = ordered[0].date;
    const evaluate = (rate: number) => ordered.reduce(
        (sum, flow) => sum + flow.amountKopecks / ((1 + rate) ** (daysBetween(baseDate, flow.date) / 365)),
        0,
    );

    let low = -0.9999;
    let high = 1;
    let lowValue = evaluate(low);
    let highValue = evaluate(high);

    while (lowValue * highValue > 0 && high < 1_000) {
        high *= 2;
        highValue = evaluate(high);
    }
    if (lowValue * highValue > 0) return null;

    for (let iteration = 0; iteration < 120; iteration += 1) {
        const middle = (low + high) / 2;
        const middleValue = evaluate(middle);
        if (Math.abs(middleValue) < 0.01) return round(middle * 100, 2);
        if (lowValue * middleValue <= 0) {
            high = middle;
        } else {
            low = middle;
            lowValue = middleValue;
        }
    }

    return round(((low + high) / 2) * 100, 2);
}

function calculateMaximumDrawdown(returns: number[]) {
    if (!returns.length) return null;
    let value = 1;
    let peak = 1;
    let maximumDrawdown = 0;

    for (const dailyReturn of returns) {
        value *= 1 + dailyReturn;
        peak = Math.max(peak, value);
        maximumDrawdown = Math.min(maximumDrawdown, value / peak - 1);
    }

    return round(maximumDrawdown * 100, 2);
}

function pairedReturns(
    portfolioReturns: Array<{ date: string; value: number }>,
    benchmarkPrices: PricePoint[],
) {
    const benchmarkByDate = new Map(benchmarkPrices.map((point) => [point.date, point.close]));
    const benchmarkReturns = new Map<string, number>();
    let previous: number | null = null;

    for (const point of benchmarkPrices) {
        if (previous && previous > 0) benchmarkReturns.set(point.date, point.close / previous - 1);
        previous = point.close;
    }

    return portfolioReturns.flatMap((portfolio) => {
        const benchmark = benchmarkReturns.get(portfolio.date);
        if (benchmark === undefined || !benchmarkByDate.has(portfolio.date)) return [];
        return [{ portfolio: portfolio.value, benchmark }];
    });
}

export function calculateRiskMetrics(points: ValuationPoint[], benchmarkPrices: PricePoint[]) {
    const dailyReturns = calculateDailyReturns(points);
    const values = dailyReturns.map((item) => item.value);
    if (values.length < 2) {
        return {
            observations: values.length,
            annualizedVolatilityPercent: null,
            maximumDrawdownPercent: calculateMaximumDrawdown(values),
            sharpeRatio: null,
            sortinoRatio: null,
            var95Percent: null,
            beta: null,
            correlation: null,
            benchmarkReturnPercent: null,
        };
    }

    const volatility = sampleDeviation(values);
    const cumulativeReturn = values.reduce((result, value) => result * (1 + value), 1) - 1;
    const annualizedReturn = (1 + cumulativeReturn) ** (252 / values.length) - 1;
    const annualizedVolatility = volatility === null ? null : volatility * Math.sqrt(252);
    const downside = values.filter((value) => value < 0);
    const downsideDeviation = downside.length ? Math.sqrt(average(downside.map((value) => value ** 2))) * Math.sqrt(252) : null;
    const orderedReturns = [...values].sort((left, right) => left - right);
    const var95 = percentile(orderedReturns, 0.05);
    const pairs = pairedReturns(dailyReturns, benchmarkPrices);
    let beta: number | null = null;
    let correlation: number | null = null;

    if (pairs.length >= 2) {
        const portfolioValues = pairs.map((item) => item.portfolio);
        const benchmarkValues = pairs.map((item) => item.benchmark);
        const portfolioMean = average(portfolioValues);
        const benchmarkMean = average(benchmarkValues);
        const covariance = pairs.reduce(
            (sum, item) => sum + (item.portfolio - portfolioMean) * (item.benchmark - benchmarkMean),
            0,
        ) / (pairs.length - 1);
        const benchmarkDeviation = sampleDeviation(benchmarkValues);
        const portfolioDeviation = sampleDeviation(portfolioValues);
        if (benchmarkDeviation && portfolioDeviation) {
            beta = round(covariance / (benchmarkDeviation ** 2), 2);
            correlation = round(covariance / (benchmarkDeviation * portfolioDeviation), 2);
        }
    }

    const benchmarkReturn = benchmarkPrices.length > 1 && benchmarkPrices[0].close > 0
        ? round((benchmarkPrices.at(-1)!.close / benchmarkPrices[0].close - 1) * 100, 2)
        : null;

    return {
        observations: values.length,
        annualizedVolatilityPercent: annualizedVolatility === null ? null : round(annualizedVolatility * 100, 2),
        maximumDrawdownPercent: calculateMaximumDrawdown(values),
        sharpeRatio: annualizedVolatility ? round(annualizedReturn / annualizedVolatility, 2) : null,
        sortinoRatio: downsideDeviation ? round(annualizedReturn / downsideDeviation, 2) : null,
        var95Percent: var95 === null ? null : round(Math.max(0, -var95) * 100, 2),
        beta,
        correlation,
        benchmarkReturnPercent: benchmarkReturn,
    };
}

export function compactValuationPoints(points: ValuationPoint[], maxPoints = 250) {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const compacted = points.filter((_, index) => index % step === 0);
    const last = points.at(-1);
    if (last && compacted.at(-1)?.date !== last.date) compacted.push(last);
    return compacted;
}
