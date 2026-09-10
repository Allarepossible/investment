type ChartPosition = {
  instrumentId: number;
  ticker: string;
  name: string;
  marketValueKopecks: number | null;
  unrealizedPnlKopecks: number | null;
};

type ChartTransaction = {
  id: number;
  type: string;
  amountKopecks: number | null;
  operationDate: string;
};

type Props = {
  cashKopecks: number;
  positions: ChartPosition[];
  transactions: ChartTransaction[];
};

const colors = ['#2563eb', '#0ea5e9', '#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'];
const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value / 100);
const shortMoney = (value: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });

function AllocationDonut({ cashKopecks, positions }: Pick<Props, 'cashKopecks' | 'positions'>) {
  const entries = [
    ...positions
      .filter((position) => (position.marketValueKopecks ?? 0) > 0)
      .map((position) => ({ label: position.ticker, value: position.marketValueKopecks ?? 0 })),
    ...(cashKopecks > 0 ? [{ label: 'Деньги', value: cashKopecks }] : []),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return <section className="chart-panel allocation-chart">
    <div className="chart-heading"><div><p className="section-label">СТРУКТУРА</p><h3>Распределение активов</h3></div><span>{total ? money(total) : '—'}</span></div>
    {entries.length ? <div className="allocation-content"><svg viewBox="0 0 130 130" role="img" aria-label="Круговая диаграмма распределения активов"><title>Структура портфеля по текущей оценке</title><circle className="donut-track" cx="65" cy="65" r={radius} /><g transform="rotate(-90 65 65)">{entries.map((entry, index) => { const length = entry.value / total * circumference; const circle = <circle key={entry.label} className="donut-segment" cx="65" cy="65" r={radius} stroke={colors[index % colors.length]} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}><title>{`${entry.label}: ${money(entry.value)}`}</title></circle>; offset += length; return circle; })}</g><text x="65" y="61" textAnchor="middle" className="donut-total">{entries.length}</text><text x="65" y="76" textAnchor="middle" className="donut-caption">позиций</text></svg><div className="allocation-legend">{entries.map((entry, index) => <div key={entry.label}><i style={{ background: colors[index % colors.length] }} /><span>{entry.label}</span><strong>{(entry.value / total * 100).toFixed(1)}%</strong></div>)}</div></div> : <p className="chart-empty">Добавьте покупки, чтобы увидеть структуру портфеля.</p>}
  </section>;
}

function ContributionsChart({ transactions }: Pick<Props, 'transactions'>) {
  const amounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'DEPOSIT' && transaction.type !== 'WITHDRAWAL') continue;
    const key = transaction.operationDate.slice(0, 10);
    const signedAmount = (transaction.amountKopecks ?? 0) * (transaction.type === 'WITHDRAWAL' ? -1 : 1);
    amounts.set(key, (amounts.get(key) ?? 0) + signedAmount);
  }
  const points = [...amounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Array<{ day: string; value: number }>>((items, [day, amount]) => [
      ...items,
      { day, value: (items.at(-1)?.value ?? 0) + amount },
    ], []);
  const width = 520;
  const height = 220;
  const inset = { top: 22, right: 18, bottom: 34, left: 62 };
  const min = Math.min(0, ...points.map((point) => point.value));
  const max = Math.max(1, ...points.map((point) => point.value));
  const x = (index: number) => points.length === 1 ? width / 2 : inset.left + index / (points.length - 1) * (width - inset.left - inset.right);
  const y = (value: number) => inset.top + (max - value) / (max - min) * (height - inset.top - inset.bottom);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return <section className="chart-panel contribution-chart">
    <div className="chart-heading"><div><p className="section-label">ДИНАМИКА</p><h3>Чистые пополнения</h3></div><span>{points.length ? money(points.at(-1)?.value ?? 0) : '—'}</span></div>
    {points.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График чистых пополнений"><title>Динамика чистых пополнений портфеля</title><line className="chart-grid" x1={inset.left} x2={width - inset.right} y1={y(max)} y2={y(max)} /><line className="chart-grid" x1={inset.left} x2={width - inset.right} y1={y(min)} y2={y(min)} /><path className="chart-area" d={`M ${x(0)} ${height - inset.bottom} L ${polyline.split(' ').join(' L ')} L ${x(points.length - 1)} ${height - inset.bottom} Z`} /><polyline className="chart-line" points={polyline} />{points.map((point, index) => <circle key={point.day} className="chart-point" cx={x(index)} cy={y(point.value)} r="3"><title>{`${date(point.day)}: ${money(point.value)}`}</title></circle>)}<text className="chart-axis" x={inset.left - 8} y={y(max) + 4} textAnchor="end">{shortMoney(max)}</text><text className="chart-axis" x={inset.left - 8} y={y(min) + 4} textAnchor="end">{shortMoney(min)}</text>{labelIndexes.map((index) => <text key={index} className="chart-axis" x={x(index)} y={height - 10} textAnchor="middle">{date(points[index].day)}</text>)}</svg> : <p className="chart-empty">Пополнения и выводы появятся на этом графике после добавления операций.</p>}
  </section>;
}

function PnlChart({ positions }: Pick<Props, 'positions'>) {
  const entries = positions
    .filter((position) => position.unrealizedPnlKopecks !== null)
    .sort((left, right) => Math.abs(right.unrealizedPnlKopecks ?? 0) - Math.abs(left.unrealizedPnlKopecks ?? 0))
    .slice(0, 7);
  const max = Math.max(1, ...entries.map((entry) => Math.abs(entry.unrealizedPnlKopecks ?? 0)));

  return <section className="chart-panel pnl-chart">
    <div className="chart-heading"><div><p className="section-label">РЕЗУЛЬТАТ</p><h3>Прибыль и убыток по бумагам</h3></div><span>текущая оценка</span></div>
    {entries.length ? <div className="pnl-bars">{entries.map((entry) => { const value = entry.unrealizedPnlKopecks ?? 0; return <div className="pnl-row" key={entry.instrumentId}><span>{entry.ticker}</span><div className="pnl-track"><i className={value < 0 ? 'loss' : 'gain'} style={{ width: `${Math.abs(value) / max * 100}%` }} /></div><strong className={value < 0 ? 'negative' : 'positive'}>{money(value)}</strong></div>; })}</div> : <p className="chart-empty">Результат появится после получения рыночных цен.</p>}
  </section>;
}

export function PortfolioCharts({ cashKopecks, positions, transactions }: Props) {
  return <div className="portfolio-charts"><ContributionsChart transactions={transactions} /><AllocationDonut cashKopecks={cashKopecks} positions={positions} /><PnlChart positions={positions} /></div>;
}
