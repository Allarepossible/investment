import { useState, type PointerEvent } from 'react';

export type PortfolioPerformance = {
  scope: 'aggregate' | 'portfolio';
  portfolioId: number | null;
  generatedAt: string;
  period: { from: string; to: string; tradingDays: number } | null;
  series: Array<{ date: string; valueKopecks: number; externalFlowKopecks: number; profitKopecks?: number }>;
  benchmark: { ticker: string; name: string; returnPercent: number | null };
  performance: {
    timeWeightedReturnPercent: number | null;
    moneyWeightedReturnPercent: number | null;
    annualizedReturnPercent: number | null;
    currentValueKopecks: number | null;
  };
  risk: {
    observations: number;
    annualizedVolatilityPercent: number | null;
    maximumDrawdownPercent: number | null;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    var95Percent: number | null;
    beta: number | null;
    correlation: number | null;
    benchmarkReturnPercent: number | null;
  };
  concentration: {
    positions: Array<{ ticker: string; name: string; valueKopecks: number; allocationPercent: number }>;
    bySector: Array<{ name: string; valueKopecks: number; allocationPercent: number }>;
    byAssetType: Array<{ name: string; valueKopecks: number; allocationPercent: number }>;
    hhi: number | null;
    effectivePositions: number | null;
    largestPositionPercent: number | null;
  };
  coverage: { pricedInstruments: number; totalInstruments: number; missingTickers: string[] };
};

export type PortfolioIncomeForecast = {
  scope: 'aggregate' | 'portfolio';
  portfolioId: number | null;
  generatedAt: string;
  horizon: { from: string; to: string; days: number };
  totalKopecks: number;
  couponKopecks: number;
  dividendKopecks: number;
  nextPayment: IncomeForecastPayment | null;
  payments: IncomeForecastPayment[];
  coverage: { openPositions: number; bondPositions: number; sharePositions: number; positionsWithPayments: number };
};

type IncomeForecastPayment = {
  instrumentId: number;
  ticker: string;
  name: string;
  kind: 'coupon' | 'dividend';
  date: string | null;
  amountKopecks: number;
  status: 'moex-date' | 'estimated';
  note: string;
};

type Portfolio = { id: number; name: string };

const money = (kopecks: number | null) => kopecks === null
  ? '—'
  : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const percent = (value: number | null, sign = false) => value === null
  ? '—'
  : `${sign && value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function ValueChart({
  points,
  ariaLabel = 'График изменения стоимости портфеля',
  valueLabel = 'Стоимость',
  flowLabel = 'Поток',
  gradientId = 'portfolio-value-fill',
}: {
  points: PortfolioPerformance['series'];
  ariaLabel?: string;
  valueLabel?: string;
  flowLabel?: string;
  gradientId?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length < 2) return <p className="analytics-chart-empty">Для графика нужны котировки хотя бы за два дня.</p>;

  const width = 860;
  const height = 270;
  const padding = { top: 20, right: 18, bottom: 30, left: 18 };
  const values = points.map((point) => point.valueKopecks);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const x = (index: number) => padding.left + index / (points.length - 1) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + (maximum - value) / range * (height - padding.top - padding.bottom);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.valueKopecks)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${height - padding.bottom} L ${x(0)} ${height - padding.bottom} Z`;
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeX = activeIndex === null ? null : x(activeIndex);
  const activeY = activePoint === null ? null : y(activePoint.valueKopecks);
  const tooltipWidth = 184;
  const tooltipHeight = 68;
  const tooltipX = activeX === null
    ? 0
    : Math.max(padding.left, Math.min(width - padding.right - tooltipWidth, activeX > width - tooltipWidth - padding.right - 12 ? activeX - tooltipWidth - 12 : activeX + 12));
  const tooltipY = activeY === null
    ? 0
    : activeY < padding.top + tooltipHeight + 14 ? activeY + 13 : activeY - tooltipHeight - 13;
  const cashFlow = activePoint === null || activePoint.externalFlowKopecks === 0
    ? '—'
    : `${activePoint.externalFlowKopecks > 0 ? '+' : '−'}${money(Math.abs(activePoint.externalFlowKopecks))}`;

  const selectClosestPoint = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const chartX = (event.clientX - bounds.left) / bounds.width * width;
    const ratio = (chartX - padding.left) / (width - padding.left - padding.right);
    setActiveIndex(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };

  return <div className="analytics-value-chart" role="img" aria-label={ariaLabel}>
    <div className="analytics-chart-scale"><span>{money(maximum)}</span><span>{money(minimum)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" onPointerMove={selectClosestPoint} onPointerDown={selectClosestPoint} onPointerLeave={() => setActiveIndex(null)}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a8dff" stopOpacity=".34" /><stop offset="1" stopColor="#3a8dff" stopOpacity="0" /></linearGradient></defs>
      {[0.2, 0.5, 0.8].map((point) => <line key={point} x1={padding.left} x2={width - padding.right} y1={padding.top + (height - padding.top - padding.bottom) * point} y2={padding.top + (height - padding.top - padding.bottom) * point} />)}
      <path d={area} className="analytics-area" style={{ fill: `url(#${gradientId})` }} />
      <path d={line} className="analytics-line" />
      {labelIndexes.map((index) => <g key={index}><circle cx={x(index)} cy={y(points[index].valueKopecks)} r="3.5" /><text x={x(index)} y={height - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{date(points[index].date)}</text></g>)}
      {activePoint !== null && activeX !== null && activeY !== null && <g className="analytics-hover-tooltip" pointerEvents="none">
        <line className="analytics-hover-line" x1={activeX} x2={activeX} y1={padding.top} y2={height - padding.bottom} />
        <circle className="analytics-hover-point" cx={activeX} cy={activeY} r="5" />
        <rect className="analytics-hover-tooltip-box" x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
        <text className="analytics-hover-tooltip-date" x={tooltipX + 11} y={tooltipY + 17}>{date(activePoint.date)}</text>
        <text className="analytics-hover-tooltip-label" x={tooltipX + 11} y={tooltipY + 36}>{valueLabel}</text>
        <text className="analytics-hover-tooltip-value" x={tooltipX + tooltipWidth - 11} y={tooltipY + 36} textAnchor="end">{money(activePoint.valueKopecks)}</text>
        <text className="analytics-hover-tooltip-label" x={tooltipX + 11} y={tooltipY + 55}>{flowLabel}</text>
        <text className="analytics-hover-tooltip-flow" x={tooltipX + tooltipWidth - 11} y={tooltipY + 55} textAnchor="end">{cashFlow}</text>
      </g>}
    </svg>
  </div>;
}

function toProfitPoints(points: PortfolioPerformance['series']) {
  let netContributionsKopecks = 0;
  return points.map((point) => {
    netContributionsKopecks += point.externalFlowKopecks;
    return {
      ...point,
      valueKopecks: point.profitKopecks ?? point.valueKopecks - netContributionsKopecks,
    };
  });
}

function ProfitChart({ points }: { points: PortfolioPerformance['series'] }) {
  return <ValueChart
    points={toProfitPoints(points)}
    ariaLabel="График накопленной прибыли портфеля"
    valueLabel="Результат"
    flowLabel="Вложения"
    gradientId="portfolio-profit-fill"
  />;
}

function InfoTip({ text }: { text: string }) {
  return <span className="analytics-info-tip"><button type="button" aria-label={`Пояснение: ${text}`}>?</button><span role="tooltip">{text}</span></span>;
}

function MetricCard({ label, value, hint, description, tone }: { label: string; value: string; hint: string; description: string; tone?: 'positive' | 'negative' }) {
  return <div className="analytics-metric"><div className="analytics-metric-label"><span>{label}</span><InfoTip text={description} /></div><strong className={tone}>{value}</strong><small>{hint}</small></div>;
}

type PaymentMonth = {
  key: string;
  label: string;
  shortLabel: string;
  amountKopecks: number;
  payments: IncomeForecastPayment[];
};

function paymentMonths(payments: IncomeForecastPayment[], horizon: PortfolioIncomeForecast['horizon']): PaymentMonth[] {
  const paymentsByMonth = new Map<string, IncomeForecastPayment[]>();
  payments.filter((payment) => payment.date !== null).forEach((payment) => {
    const key = payment.date!.slice(0, 7);
    paymentsByMonth.set(key, [...(paymentsByMonth.get(key) ?? []), payment]);
  });

  const result: PaymentMonth[] = [];
  const cursor = new Date(`${horizon.from.slice(0, 7)}-01T12:00:00`);
  const lastMonth = horizon.to.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= lastMonth) {
    const key = cursor.toISOString().slice(0, 7);
    const monthPayments = paymentsByMonth.get(key) ?? [];
    result.push({
      key,
      label: cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      shortLabel: cursor.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }).replace('.', ''),
      amountKopecks: monthPayments.reduce((sum, payment) => sum + payment.amountKopecks, 0),
      payments: monthPayments.sort((left, right) => left.date!.localeCompare(right.date!) || right.amountKopecks - left.amountKopecks),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function FuturePaymentsChart({ payments, horizon }: { payments: IncomeForecastPayment[]; horizon: PortfolioIncomeForecast['horizon'] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const months = paymentMonths(payments, horizon);
  const scheduledPayments = months.flatMap((month) => month.payments);
  const undatedEstimateKopecks = payments.filter((payment) => payment.date === null).reduce((sum, payment) => sum + payment.amountKopecks, 0);

  if (!scheduledPayments.length) return <div className="analytics-payments-chart-empty"><strong>Пока нет выплат с точными датами</strong><span>MOEX ещё не передал календарь купонов для текущих позиций. Оценочные дивиденды без даты показаны отдельно.</span>{undatedEstimateKopecks > 0 && <b>Оценка без даты: {money(undatedEstimateKopecks)}</b>}</div>;

  const width = 860;
  const height = 208;
  const padding = { top: 18, right: 18, bottom: 32, left: 18 };
  const maximum = Math.max(...months.map((month) => month.amountKopecks), 1);
  const usableWidth = width - padding.left - padding.right;
  const step = usableWidth / months.length;
  const barWidth = Math.max(11, Math.min(44, step * 0.58));
  const chartHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + step * index + (step - barWidth) / 2;
  const y = (amountKopecks: number) => padding.top + chartHeight - amountKopecks / maximum * chartHeight;
  const labelIndexes = [...new Set([0, Math.floor((months.length - 1) / 3), Math.floor((months.length - 1) * 2 / 3), months.length - 1])];
  const activeMonth = activeIndex === null ? null : months[activeIndex];

  const selectMonth = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const chartX = (event.clientX - bounds.left) / bounds.width * width;
    const index = Math.floor((chartX - padding.left) / step);
    setActiveIndex(Math.max(0, Math.min(months.length - 1, index)));
  };

  return <div className="analytics-payments-chart" aria-label="График будущих выплат по месяцам">
    <div className="analytics-payments-chart-heading"><span>По месяцам · до удержания налогов</span><b>{activeMonth ? `${activeMonth.label} · ${money(activeMonth.amountKopecks)}` : 'Наведите на месяц'}</b></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Столбчатый график ожидаемых купонов по месяцам" onPointerMove={selectMonth} onPointerDown={selectMonth} onPointerLeave={() => setActiveIndex(null)}>
      {[0.25, 0.5, 0.75].map((part) => <line key={part} x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * part} y2={padding.top + chartHeight * part} />)}
      <line className="analytics-payments-axis" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
      {months.map((month, index) => {
        const amount = month.amountKopecks;
        const barY = y(amount);
        const isActive = index === activeIndex;
        return <g key={month.key} className={isActive ? 'active' : undefined}>
          <rect className="analytics-payment-bar-hit" x={padding.left + step * index} y={padding.top} width={step} height={chartHeight} />
          {amount > 0 && <rect className="analytics-payment-bar" x={x(index)} y={barY} width={barWidth} height={height - padding.bottom - barY} rx="5" />}
          {isActive && <><line className="analytics-payment-hover-line" x1={padding.left + step * index + step / 2} x2={padding.left + step * index + step / 2} y1={padding.top} y2={height - padding.bottom} /><circle className="analytics-payment-hover-dot" cx={padding.left + step * index + step / 2} cy={amount > 0 ? barY : height - padding.bottom} r="4.5" /></>}
          {labelIndexes.includes(index) && <text x={padding.left + step * index + step / 2} y={height - 9} textAnchor="middle">{month.shortLabel}</text>}
        </g>;
      })}
    </svg>
    <div className="analytics-payments-chart-detail" aria-live="polite">
      {activeMonth ? activeMonth.payments.length ? <><strong>{activeMonth.label}</strong><b>{money(activeMonth.amountKopecks)}</b><ul>{activeMonth.payments.slice(0, 4).map((payment, index) => <li key={`${payment.instrumentId}-${payment.date}-${index}`}><span>{date(payment.date!)} · {payment.ticker}</span><b>{money(payment.amountKopecks)}</b></li>)}</ul>{activeMonth.payments.length > 4 && <small>И ещё {activeMonth.payments.length - 4} выплат — в таблице ниже.</small>}</> : <><strong>{activeMonth.label}</strong><span>В этом месяце выплаты с подтверждённой датой пока не ожидаются.</span></> : <><strong>Календарь ближайших выплат</strong><span>Наведите на столбец, чтобы увидеть дату, бумагу и сумму.</span></>}
    </div>
    {undatedEstimateKopecks > 0 && <p className="analytics-payments-undated">Ещё {money(undatedEstimateKopecks)} — оценка дивидендов без объявленной даты; в столбцы она не включена.</p>}
  </div>;
}

function IncomeForecastPanel({
  forecast,
  isLoading,
  error,
}: {
  forecast: PortfolioIncomeForecast | null;
  isLoading: boolean;
  error: string;
}) {
  if (isLoading && !forecast) return <section className="analytics-income-panel analytics-income-loading" aria-live="polite"><i /><div><strong>Собираем календарь выплат</strong><span>Проверяем ближайшие купоны на MOEX и последнюю опубликованную дивидендную выплату.</span></div></section>;
  if (error && !forecast) return <section className="analytics-income-panel analytics-income-error" role="status"><strong>Календарь выплат пока недоступен</strong><span>{error}</span></section>;
  if (!forecast) return null;

  const nextPayment = forecast.nextPayment;
  const visiblePayments = forecast.payments.slice(0, 12);
  const nextPaymentLabel = nextPayment ? `${money(nextPayment.amountKopecks)} · ${nextPayment.date ? date(nextPayment.date) : '—'}` : 'Нет точной даты';

  return <section className="analytics-income-panel">
    <div className="analytics-section-heading"><div><p className="section-label">БУДУЩИЕ ВЫПЛАТЫ</p><h2>Что принесёт портфель <InfoTip text="Купоны рассчитаны для текущего количества облигаций. Ближайшая дата берётся из MOEX ISS, последующие даты строятся по текущему купонному периоду. Дивиденды — ориентир по последней опубликованной годовой выплате, без даты и без гарантии." /></h2></div><span>{isLoading ? 'Обновляем…' : `до ${date(forecast.horizon.to)}`}</span></div>
    {forecast.payments.length ? <>
      <div className="analytics-metric-grid analytics-income-metric-grid">
        <MetricCard label="За 12 месяцев" value={money(forecast.totalKopecks)} hint="до удержания налогов" description="Сумма ожидаемых купонов и ориентировочных дивидендов за следующие 365 дней по текущим открытым позициям. Это не прогноз роста цены и не гарантированный доход." tone="positive" />
        <MetricCard label="Ближайший купон" value={nextPaymentLabel} hint={nextPayment ? `${nextPayment.ticker} · ${nextPayment.name}` : 'MOEX не дал ближайшую дату'} description="Ближайшая выплата с датой из MOEX ISS. В расчёт включено количество бумаг, которое сейчас находится в выбранном портфеле." />
        <MetricCard label="Купоны" value={money(forecast.couponKopecks)} hint={`${forecast.coverage.bondPositions} поз. в облигациях`} description="Плановые купонные выплаты по облигациям. Размер указан до НДФЛ; номинал при погашении сюда не включён." />
        <MetricCard label="Дивиденды — оценка" value={money(forecast.dividendKopecks)} hint={`${forecast.coverage.sharePositions} поз. в акциях`} description="Ориентир по последней опубликованной годовой дивидендной выплате. Совет директоров и собрание акционеров могут изменить размер или отменить дивиденды." />
      </div>
      <FuturePaymentsChart payments={forecast.payments} horizon={forecast.horizon} />
      <div className="analytics-income-table"><table><thead><tr><th>Когда</th><th>Инструмент</th><th>Выплата</th><th>Вы получите</th><th>Статус</th></tr></thead><tbody>{visiblePayments.map((payment, index) => <tr key={`${payment.instrumentId}-${payment.kind}-${payment.date ?? 'estimate'}-${index}`}><td>{payment.date ? date(payment.date) : 'За 12 мес.'}</td><td><strong>{payment.ticker}</strong><span>{payment.name}</span></td><td>{payment.kind === 'coupon' ? 'Купон' : 'Дивиденды'}</td><td><b>{money(payment.amountKopecks)}</b></td><td><span className={`income-payment-status ${payment.status}`}>{payment.status === 'moex-date' ? 'MOEX' : 'Оценка'}</span><small>{payment.note}</small></td></tr>)}</tbody></table>{forecast.payments.length > visiblePayments.length && <p>Показаны ближайшие {visiblePayments.length} выплат из {forecast.payments.length}.</p>}</div>
    </> : <div className="analytics-income-empty"><strong>Пока нет выплат для расчёта</strong><span>Для облигаций нужна дата и размер купона из MOEX; для акций — последняя опубликованная дивидендная выплата.</span></div>}
    {error && <p className="analytics-income-stale">Показываем сохранённый расчёт: {error}</p>}
    <p className="analytics-disclaimer">Расчёт ведётся по текущему количеству бумаг и до удержания налогов. Дивиденды и будущие купоны могут быть изменены эмитентом.</p>
  </section>;
}

function AllocationList({ title, description, items }: { title: string; description: string; items: Array<{ name: string; allocationPercent: number }> }) {
  return <section className="allocation-list"><h3>{title}<InfoTip text={description} /></h3>{items.length ? <div>{items.map((item) => <div className="allocation-row" key={item.name}><div><span>{item.name}</span><b>{percent(item.allocationPercent)}</b></div><i><i style={{ width: `${Math.min(item.allocationPercent, 100)}%` }} /></i></div>)}</div> : <p>Недостаточно данных для структуры.</p>}</section>;
}

export function PortfolioAnalyticsPage({
  performance,
  incomeForecast,
  portfolios,
  selectedPortfolioId,
  isLoading,
  isIncomeForecastLoading,
  error,
  incomeForecastError,
  onPortfolioChange,
  onRefresh,
}: {
  performance: PortfolioPerformance | null;
  incomeForecast: PortfolioIncomeForecast | null;
  portfolios: Portfolio[];
  selectedPortfolioId: number | null;
  isLoading: boolean;
  isIncomeForecastLoading: boolean;
  error: string;
  incomeForecastError: string;
  onPortfolioChange: (portfolioId: number | null) => void;
  onRefresh: () => void;
}) {
  const period = performance?.period;
  const hasPeriod = Boolean(period && performance);
  const returnTone = (value: number | null) => value !== null && value < 0 ? 'negative' : value !== null && value > 0 ? 'positive' : undefined;
  const currentProfitKopecks = performance?.series.at(-1)?.profitKopecks ?? null;

  return <section className="analytics-page">
    <div className="analytics-toolbar">
      <div><p className="section-label">ДОХОДНОСТЬ И РИСК</p><h2>Аналитика портфеля</h2><p>Историческая стоимость, результат инвестирования и ключевые риски.</p></div>
      <div className="analytics-toolbar-actions"><label><span>Портфель</span><select value={selectedPortfolioId ?? ''} onChange={(event) => onPortfolioChange(event.target.value ? Number(event.target.value) : null)}><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label><button className="refresh-button" type="button" onClick={onRefresh} disabled={isLoading}>{isLoading ? 'Считаем…' : 'Обновить расчёт'}</button></div>
    </div>

    {isLoading && !performance && <div className="analytics-loading" role="status" aria-live="polite"><i /><div><strong>Собираем историю портфеля</strong><span>Запрашиваем дневные котировки MOEX и рассчитываем показатели. Первый расчёт может занять до минуты.</span></div></div>}
    {error && <div className="analytics-error" role="alert"><strong>Не удалось рассчитать аналитику</strong><span>{error}</span><button className="refresh-button" type="button" onClick={onRefresh}>Повторить</button></div>}
    {!isLoading && !error && !hasPeriod && <div className="analytics-empty"><strong>Пока нечего анализировать</strong><span>Добавьте пополнение и операции с бумагами — после этого здесь появится история доходности и риска.</span></div>}

    {performance && hasPeriod && <>
      <div className="analytics-period"><span>Период: <b>{date(period!.from)} — {date(period!.to)}</b></span><span>{period!.tradingDays} точек в истории</span>{isLoading && <span className="analytics-inline-loading"><i />Обновляем…</span>}</div>
      <section className="analytics-performance-panel">
        <div className="analytics-section-heading"><div><p className="section-label">ФАЗА 5 · ДОХОДНОСТЬ</p><h2>Динамика стоимости <InfoTip text="История показывает стоимость портфеля на закрытие торговых дней. Внешние пополнения и выводы отражены в сумме, но отдельно учитываются при расчёте доходности." /></h2></div><div className="analytics-close-value"><strong>{money(performance.performance.currentValueKopecks)}</strong><span>на закрытие {date(period!.to)}</span></div></div>
        <ValueChart points={performance.series} />
        <div className="analytics-subchart-heading"><div><p className="section-label">ФИНАНСОВЫЙ РЕЗУЛЬТАТ</p><h3>Динамика прибыли портфеля <InfoTip text="Это накопленный результат после исключения только пополнений и выводов. Он включает изменение цены бумаг, реализованный результат, дивиденды, купоны, комиссии и налоги." /></h3></div><strong className={currentProfitKopecks !== null && currentProfitKopecks < 0 ? 'negative' : 'positive'}>{money(currentProfitKopecks)}</strong></div>
        <ProfitChart points={performance.series} />
        <p className="analytics-profit-note">Прибыль не учитывает пополнения и выводы, но учитывает переоценку активов, выплаты, комиссии и налоги.</p>
        <div className="analytics-metric-grid">
          <MetricCard label="Доходность TWR" value={percent(performance.performance.timeWeightedReturnPercent, true)} hint="исключает пополнения и выводы" description="Доходность стратегии без влияния того, когда и на какую сумму пополнялся или выводился счёт. Удобна для сравнения качества инвестирования." tone={returnTone(performance.performance.timeWeightedReturnPercent)} />
          <MetricCard label="Доходность XIRR" value={percent(performance.performance.moneyWeightedReturnPercent, true)} hint="годовая, учитывает даты денег" description="Ваша годовая доходность с учётом точных сумм и дат пополнений, выводов и итоговой стоимости портфеля." tone={returnTone(performance.performance.moneyWeightedReturnPercent)} />
          <MetricCard label="Годовая оценка" value={percent(performance.performance.annualizedReturnPercent, true)} hint="приведено к 252 торговым дням" description="Накопленная доходность TWR, приведённая к одному условному году из 252 торговых дней. Для короткой истории это ориентир, а не прогноз." tone={returnTone(performance.performance.annualizedReturnPercent)} />
          <MetricCard label="Индекс IMOEX" value={percent(performance.benchmark.returnPercent, true)} hint={`за тот же период · ${performance.benchmark.name}`} description="Изменение Индекса Мосбиржи за тот же период. Это ориентир для сравнения вашего результата с широким российским рынком." tone={returnTone(performance.benchmark.returnPercent)} />
        </div>
      </section>

      <IncomeForecastPanel forecast={incomeForecast} isLoading={isIncomeForecastLoading} error={incomeForecastError} />

      <section className="analytics-risk-panel">
        <div className="analytics-section-heading"><div><p className="section-label">ФАЗА 6 · РИСК</p><h2>Профиль риска <InfoTip text="Все показатели риска построены по изменениям стоимости портфеля между днями и не являются прогнозом будущих потерь." /></h2></div><span>На основе {performance.risk.observations} дневных доходностей</span></div>
        <div className="analytics-risk-grid">
          <MetricCard label="Волатильность" value={percent(performance.risk.annualizedVolatilityPercent)} hint="годовая, по дневным изменениям" description="Насколько сильно стоимость портфеля обычно колебалась. Чем выше показатель, тем менее предсказуемым было движение; значение приведено к году." />
          <MetricCard label="Макс. просадка" value={percent(performance.risk.maximumDrawdownPercent)} hint="от локального максимума" description="Наибольшее историческое падение от достигнутого максимума до последующего минимума. Пополнения и выводы не считаются падением рынка." tone="negative" />
          <MetricCard label="Коэффициент Шарпа" value={number(performance.risk.sharpeRatio)} hint="безрисковая ставка = 0%" description="Сколько доходности приходилось на единицу общего риска. Здесь для простоты безрисковая ставка принята равной нулю; большее значение обычно лучше." tone={returnTone(performance.risk.sharpeRatio)} />
          <MetricCard label="Коэффициент Сортино" value={number(performance.risk.sortinoRatio)} hint="учитывает только падения" description="Похож на коэффициент Шарпа, но учитывает только отрицательные колебания. Помогает отделить риск падения от обычной изменчивости." tone={returnTone(performance.risk.sortinoRatio)} />
          <MetricCard label="Исторический VaR 95%" value={percent(performance.risk.var95Percent)} hint="оценка потери за один день" description="Размер дневного убытка, который по истории не превышался примерно в 95 случаях из 100. Это не максимальный возможный убыток и не гарантия." tone="negative" />
          <MetricCard label="Бета к IMOEX" value={number(performance.risk.beta)} hint="чувствительность к рынку" description="Чувствительность портфеля к движению Индекса Мосбиржи: около 1 — как рынок, выше 1 — обычно сильнее, ниже 1 — слабее." />
          <MetricCard label="Корреляция с IMOEX" value={number(performance.risk.correlation)} hint="связь дневных изменений" description="Насколько дневные изменения портфеля похожи на IMOEX: 1 — двигаются очень похоже, 0 — связи почти нет, −1 — часто движутся в разные стороны." />
          <MetricCard label="Крупнейшая позиция" value={percent(performance.concentration.largestPositionPercent)} hint="доля в текущей стоимости" description="Доля самого крупного инструмента или остатка денег в стоимости портфеля. Чем она выше, тем сильнее результат зависит от одной позиции." />
        </div>
        <p className="analytics-disclaimer">Показатели описывают уже наблюдавшиеся изменения, а не прогнозируют доходность или будущий убыток.</p>
      </section>

      <section className="analytics-concentration-panel">
        <div className="analytics-section-heading"><div><p className="section-label">КОНЦЕНТРАЦИЯ</p><h2>Структура портфеля <InfoTip text="Раздел показывает, как стоимость распределена между активами и секторами. Он помогает заметить, когда один инструмент или направление занимает слишком большую долю." /></h2></div><span>{performance.concentration.effectivePositions === null ? '—' : `${performance.concentration.effectivePositions} эффективных позиций`}</span></div>
        <div className="allocation-grid"><AllocationList title="По классам активов" description="Распределение стоимости между акциями, облигациями, фондами и свободными деньгами." items={performance.concentration.byAssetType} /><AllocationList title="По секторам" description="Распределение по отраслям. Для облигаций и свободных денег используются отдельные группы." items={performance.concentration.bySector} /></div>
        <div className="analytics-positions"><div><h3>Крупнейшие позиции <InfoTip text="В таблице — до восьми самых крупных инструментов и денежный остаток. HHI складывает квадраты долей: чем выше число, тем меньше диверсификация." /></h3><span>HHI {performance.concentration.hhi ?? '—'} · чем выше, тем выше концентрация</span></div><div className="analytics-positions-table"><table><thead><tr><th>Инструмент</th><th>Оценка</th><th>Доля</th></tr></thead><tbody>{performance.concentration.positions.slice(0, 8).map((position) => <tr key={position.ticker}><td><strong>{position.ticker}</strong><span>{position.name}</span></td><td>{money(position.valueKopecks)}</td><td><b>{percent(position.allocationPercent)}</b></td></tr>)}</tbody></table></div></div>
      </section>

      {performance.coverage.pricedInstruments < performance.coverage.totalInstruments && <div className="analytics-coverage" role="status"><strong>История рассчитана с неполным покрытием</strong><span>Котировки получены для {performance.coverage.pricedInstruments} из {performance.coverage.totalInstruments} инструментов. Без истории: {performance.coverage.missingTickers.join(', ')}.</span></div>}
    </>}
  </section>;
}
