type PricePoint = {
  date: string;
  close: number;
};

type FinancialYear = {
  year: number;
  revenueRub: number | null;
  netIncomeRub: number | null;
};

const rubCompact = (value: number) => new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

const price = (value: number) => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
}).format(value);

function shortDate(value: string) {
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' }).format(parsed);
}

export function InstrumentPriceChart({ points, currency }: { points: PricePoint[]; currency: string }) {
  if (!points.length) {
    return <p className="instrument-chart-empty">Для этого интервала MOEX не вернул котировки. Попробуйте другой период.</p>;
  }

  const width = 760;
  const height = 278;
  const inset = { top: 22, right: 20, bottom: 38, left: 66 };
  const values = points.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.08, max * 0.005, 0.01);
  const chartMin = min - padding;
  const chartMax = max + padding;
  const x = (index: number) => points.length === 1
    ? (width - inset.left + inset.right) / 2
    : inset.left + index / (points.length - 1) * (width - inset.left - inset.right);
  const y = (value: number) => inset.top + (chartMax - value) / (chartMax - chartMin) * (height - inset.top - inset.bottom);
  const line = points.map((point, index) => `${x(index)},${y(point.close)}`).join(' ');
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const last = points.at(-1)!;

  return <svg className="instrument-price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`График цены инструмента, последняя цена ${price(last.close)} ${currency}`}>
    <title>Цена инструмента за выбранный период</title>
    {[chartMax, (chartMax + chartMin) / 2, chartMin].map((value) => <g key={value}>
      <line className="instrument-chart-grid" x1={inset.left} x2={width - inset.right} y1={y(value)} y2={y(value)} />
      <text className="instrument-chart-axis" x={inset.left - 9} y={y(value) + 4} textAnchor="end">{price(value)}</text>
    </g>)}
    <defs><linearGradient id="instrument-price-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2563eb" stopOpacity=".2" /><stop offset="1" stopColor="#2563eb" stopOpacity="0" /></linearGradient></defs>
    <path className="instrument-chart-area" d={`M ${x(0)} ${height - inset.bottom} L ${line.split(' ').join(' L ')} L ${x(points.length - 1)} ${height - inset.bottom} Z`} />
    <polyline className="instrument-price-line" points={line} />
    <circle className="instrument-price-last" cx={x(points.length - 1)} cy={y(last.close)} r="4.5"><title>{`${shortDate(last.date)}: ${price(last.close)} ${currency}`}</title></circle>
    {labels.map((index) => <text className="instrument-chart-axis" key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{shortDate(points[index].date)}</text>)}
  </svg>;
}

export function InstrumentFinancialChart({ financials }: { financials: FinancialYear[] }) {
  if (!financials.length) {
    return <p className="instrument-chart-empty">Нет унифицированных годовых данных для этого инструмента. Это нормально для облигаций, фондов и части эмитентов.</p>;
  }

  const width = 760;
  const height = 270;
  const inset = { top: 22, right: 20, bottom: 42, left: 70 };
  const values = financials.flatMap((year) => [year.revenueRub, year.netIncomeRub]).filter((value): value is number => value !== null);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const xStep = (width - inset.left - inset.right) / financials.length;
  const barWidth = Math.min(28, xStep * 0.28);
  const y = (value: number) => inset.top + (max - value) / range * (height - inset.top - inset.bottom);
  const zeroY = y(0);
  const bar = (value: number, x: number, color: string, label: string) => {
    const valueY = y(value);
    const top = Math.min(valueY, zeroY);
    const barHeight = Math.max(1, Math.abs(zeroY - valueY));
    return <rect className="financial-bar" x={x} y={top} width={barWidth} height={barHeight} fill={color} rx="3"><title>{`${label}: ${rubCompact(value)} ₽`}</title></rect>;
  };

  return <svg className="instrument-financial-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Столбчатый график выручки, доходов и чистой прибыли по годам">
    <title>Годовая выручка или доходы и чистая прибыль</title>
    {[max, (max + min) / 2, min].map((value) => <g key={value}>
      <line className="instrument-chart-grid" x1={inset.left} x2={width - inset.right} y1={y(value)} y2={y(value)} />
      <text className="instrument-chart-axis" x={inset.left - 9} y={y(value) + 4} textAnchor="end">{rubCompact(value)} ₽</text>
    </g>)}
    {financials.map((year, index) => {
      const center = inset.left + xStep * index + xStep / 2;
      return <g key={year.year}>
        {year.revenueRub !== null && bar(year.revenueRub, center - barWidth - 3, '#2563eb', `Выручка или доходы ${year.year}`)}
        {year.netIncomeRub !== null && bar(year.netIncomeRub, center + 3, year.netIncomeRub < 0 ? '#d65b5b' : '#12a179', `Чистая прибыль ${year.year}`)}
        <text className="instrument-chart-axis" x={center} y={height - 13} textAnchor="middle">{year.year}</text>
      </g>;
    })}
  </svg>;
}
