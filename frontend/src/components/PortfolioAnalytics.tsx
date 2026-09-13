import { useState, type PointerEvent } from 'react';

export type PortfolioPerformance = {
  scope: 'aggregate' | 'portfolio';
  portfolioId: number | null;
  generatedAt: string;
  period: { from: string; to: string; tradingDays: number } | null;
  series: Array<{ date: string; valueKopecks: number; externalFlowKopecks: number }>;
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

type Portfolio = { id: number; name: string };

const money = (kopecks: number | null) => kopecks === null
  ? '—'
  : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const percent = (value: number | null, sign = false) => value === null
  ? '—'
  : `${sign && value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function ValueChart({ points }: { points: PortfolioPerformance['series'] }) {
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

  return <div className="analytics-value-chart" role="img" aria-label="График изменения стоимости портфеля">
    <div className="analytics-chart-scale"><span>{money(maximum)}</span><span>{money(minimum)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" onPointerMove={selectClosestPoint} onPointerDown={selectClosestPoint} onPointerLeave={() => setActiveIndex(null)}>
      <defs><linearGradient id="portfolio-value-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a8dff" stopOpacity=".34" /><stop offset="1" stopColor="#3a8dff" stopOpacity="0" /></linearGradient></defs>
      {[0.2, 0.5, 0.8].map((point) => <line key={point} x1={padding.left} x2={width - padding.right} y1={padding.top + (height - padding.top - padding.bottom) * point} y2={padding.top + (height - padding.top - padding.bottom) * point} />)}
      <path d={area} className="analytics-area" />
      <path d={line} className="analytics-line" />
      {labelIndexes.map((index) => <g key={index}><circle cx={x(index)} cy={y(points[index].valueKopecks)} r="3.5" /><text x={x(index)} y={height - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{date(points[index].date)}</text></g>)}
      {activePoint !== null && activeX !== null && activeY !== null && <g className="analytics-hover-tooltip" pointerEvents="none">
        <line className="analytics-hover-line" x1={activeX} x2={activeX} y1={padding.top} y2={height - padding.bottom} />
        <circle className="analytics-hover-point" cx={activeX} cy={activeY} r="5" />
        <rect className="analytics-hover-tooltip-box" x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
        <text className="analytics-hover-tooltip-date" x={tooltipX + 11} y={tooltipY + 17}>{date(activePoint.date)}</text>
        <text className="analytics-hover-tooltip-label" x={tooltipX + 11} y={tooltipY + 36}>Стоимость</text>
        <text className="analytics-hover-tooltip-value" x={tooltipX + tooltipWidth - 11} y={tooltipY + 36} textAnchor="end">{money(activePoint.valueKopecks)}</text>
        <text className="analytics-hover-tooltip-label" x={tooltipX + 11} y={tooltipY + 55}>Поток</text>
        <text className="analytics-hover-tooltip-flow" x={tooltipX + tooltipWidth - 11} y={tooltipY + 55} textAnchor="end">{cashFlow}</text>
      </g>}
    </svg>
  </div>;
}

function InfoTip({ text }: { text: string }) {
  return <span className="analytics-info-tip"><button type="button" aria-label={`Пояснение: ${text}`}>?</button><span role="tooltip">{text}</span></span>;
}

function MetricCard({ label, value, hint, description, tone }: { label: string; value: string; hint: string; description: string; tone?: 'positive' | 'negative' }) {
  return <div className="analytics-metric"><div className="analytics-metric-label"><span>{label}</span><InfoTip text={description} /></div><strong className={tone}>{value}</strong><small>{hint}</small></div>;
}

function AllocationList({ title, description, items }: { title: string; description: string; items: Array<{ name: string; allocationPercent: number }> }) {
  return <section className="allocation-list"><h3>{title}<InfoTip text={description} /></h3>{items.length ? <div>{items.map((item) => <div className="allocation-row" key={item.name}><div><span>{item.name}</span><b>{percent(item.allocationPercent)}</b></div><i><i style={{ width: `${Math.min(item.allocationPercent, 100)}%` }} /></i></div>)}</div> : <p>Недостаточно данных для структуры.</p>}</section>;
}

export function PortfolioAnalyticsPage({
  performance,
  portfolios,
  selectedPortfolioId,
  isLoading,
  error,
  onPortfolioChange,
  onRefresh,
}: {
  performance: PortfolioPerformance | null;
  portfolios: Portfolio[];
  selectedPortfolioId: number | null;
  isLoading: boolean;
  error: string;
  onPortfolioChange: (portfolioId: number | null) => void;
  onRefresh: () => void;
}) {
  const period = performance?.period;
  const hasPeriod = Boolean(period && performance);
  const returnTone = (value: number | null) => value !== null && value < 0 ? 'negative' : value !== null && value > 0 ? 'positive' : undefined;

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
        <div className="analytics-metric-grid">
          <MetricCard label="Доходность TWR" value={percent(performance.performance.timeWeightedReturnPercent, true)} hint="исключает пополнения и выводы" description="Доходность стратегии без влияния того, когда и на какую сумму пополнялся или выводился счёт. Удобна для сравнения качества инвестирования." tone={returnTone(performance.performance.timeWeightedReturnPercent)} />
          <MetricCard label="Доходность XIRR" value={percent(performance.performance.moneyWeightedReturnPercent, true)} hint="годовая, учитывает даты денег" description="Ваша годовая доходность с учётом точных сумм и дат пополнений, выводов и итоговой стоимости портфеля." tone={returnTone(performance.performance.moneyWeightedReturnPercent)} />
          <MetricCard label="Годовая оценка" value={percent(performance.performance.annualizedReturnPercent, true)} hint="приведено к 252 торговым дням" description="Накопленная доходность TWR, приведённая к одному условному году из 252 торговых дней. Для короткой истории это ориентир, а не прогноз." tone={returnTone(performance.performance.annualizedReturnPercent)} />
          <MetricCard label="Индекс IMOEX" value={percent(performance.benchmark.returnPercent, true)} hint={`за тот же период · ${performance.benchmark.name}`} description="Изменение Индекса Мосбиржи за тот же период. Это ориентир для сравнения вашего результата с широким российским рынком." tone={returnTone(performance.benchmark.returnPercent)} />
        </div>
      </section>

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
