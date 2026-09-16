export type PortfolioComparison = {
  generatedAt: string;
  currency: 'RUB';
  aggregate: {
    portfoliosCount: number;
    totalValueKopecks: number;
    netContributionsKopecks: number;
    totalPnlKopecks: number;
  };
  portfolios: Array<{
    id: number;
    name: string;
    createdAt: string;
    totalValueKopecks: number;
    netContributionsKopecks: number;
    totalPnlKopecks: number;
    returnOnContributionsPercent: number | null;
    cashKopecks: number;
    positionsCount: number;
    allocation: Array<{ key: 'shares' | 'bonds' | 'funds' | 'other' | 'cash'; name: string; valueKopecks: number; allocationPercent: number }>;
  }>;
};

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
}).format(kopecks / 100);

const percent = (value: number | null) => value === null
  ? '—'
  : `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;

const colors: Record<PortfolioComparison['portfolios'][number]['allocation'][number]['key'], string> = {
  shares: '#2563c8', bonds: '#58a1ee', funds: '#6c7ce8', other: '#98a8bd', cash: '#89c9bd',
};

export function PortfolioComparisonPage({
  comparison,
  isLoading,
  error,
  onRefresh,
  onOpenPortfolio,
}: {
  comparison: PortfolioComparison | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onOpenPortfolio: (portfolioId: number) => void;
}) {
  if (isLoading && !comparison) return <section className="comparison-loading" role="status" aria-live="polite"><i /><div><strong>Сравниваем портфели</strong><span>Собираем актуальные котировки и структуру каждой стратегии.</span></div></section>;
  if (error && !comparison) return <section className="comparison-error" role="alert"><strong>Сравнение пока недоступно</strong><span>{error}</span><button type="button" className="refresh-button" onClick={onRefresh}>Повторить</button></section>;
  if (!comparison) return null;

  const totalReturn = comparison.aggregate.netContributionsKopecks > 0
    ? comparison.aggregate.totalPnlKopecks / comparison.aggregate.netContributionsKopecks * 100
    : null;

  return <section className="comparison-page">
    <div className="comparison-toolbar">
      <div><p className="section-label">ФАЗА 7 · СТРАТЕГИИ</p><h2>Сравнение портфелей</h2><p>Сопоставьте результат, свободные деньги и распределение активов по каждой стратегии.</p></div>
      <button type="button" className="refresh-button" onClick={onRefresh} disabled={isLoading}>{isLoading ? 'Обновляем…' : 'Обновить'}</button>
    </div>

    <div className="comparison-summary">
      <div><span>Портфелей</span><strong>{comparison.aggregate.portfoliosCount}</strong><small>отдельных стратегий</small></div>
      <div><span>Общая стоимость</span><strong>{money(comparison.aggregate.totalValueKopecks)}</strong><small>все портфели вместе</small></div>
      <div><span>Общий результат</span><strong className={comparison.aggregate.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{money(comparison.aggregate.totalPnlKopecks)}</strong><small>{percent(totalReturn)} к чистым вложениям</small></div>
    </div>

    {comparison.portfolios.length < 2 && <div className="comparison-empty"><strong>Добавьте ещё один портфель для полноценного сравнения</strong><span>Например, разделите долгосрочные инвестиции, ИИС или отдельные стратегии. Текущий портфель уже показан ниже.</span></div>}

    {comparison.portfolios.length > 0 && <section className="comparison-table-wrap">
      <table>
        <thead><tr><th>Портфель</th><th>Стоимость</th><th>Вложено</th><th>Результат</th><th>Результат / вложено</th><th>Свободные деньги</th><th>Позиций</th><th /></tr></thead>
        <tbody>{comparison.portfolios.map((portfolio) => <tr key={portfolio.id}>
          <td><strong>{portfolio.name}</strong><span>Стратегия #{portfolio.id}</span></td>
          <td><b>{money(portfolio.totalValueKopecks)}</b></td>
          <td>{money(portfolio.netContributionsKopecks)}</td>
          <td className={portfolio.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{money(portfolio.totalPnlKopecks)}</td>
          <td className={portfolio.returnOnContributionsPercent !== null && portfolio.returnOnContributionsPercent < 0 ? 'negative' : 'positive'}>{percent(portfolio.returnOnContributionsPercent)}</td>
          <td>{money(portfolio.cashKopecks)}</td>
          <td>{portfolio.positionsCount}</td>
          <td><button type="button" className="comparison-open-button" onClick={() => onOpenPortfolio(portfolio.id)}>Открыть</button></td>
        </tr>)}</tbody>
      </table>
    </section>}

    {comparison.portfolios.length > 0 && <section className="comparison-allocation">
      <div className="comparison-section-heading"><div><p className="section-label">СТРУКТУРА</p><h3>Распределение по классам активов</h3></div><span>доля от текущей стоимости</span></div>
      <div className="comparison-legend">{comparison.portfolios[0].allocation.map((item) => <span key={item.key}><i style={{ background: colors[item.key] }} />{item.name}</span>)}</div>
      <div className="comparison-allocation-list">{comparison.portfolios.map((portfolio) => <div key={portfolio.id} className="comparison-allocation-row"><div><strong>{portfolio.name}</strong><span>{money(portfolio.totalValueKopecks)}</span></div><div className="comparison-allocation-bar" aria-label={`Структура портфеля ${portfolio.name}`}>{portfolio.allocation.filter((item) => item.valueKopecks > 0).map((item) => <i key={item.key} style={{ width: `${Math.max(0, item.allocationPercent)}%`, background: colors[item.key] }} title={`${item.name}: ${percent(item.allocationPercent)}`} />)}</div><div className="comparison-allocation-values">{portfolio.allocation.filter((item) => item.valueKopecks > 0).map((item) => <span key={item.key}>{item.name} <b>{percent(item.allocationPercent)}</b></span>)}</div></div>)}</div>
    </section>}

    {error && <p className="comparison-stale">Показаны последние доступные данные: {error}</p>}
    <p className="comparison-disclaimer">«Результат / вложено» — текущий финансовый результат, делённый на чистые пополнения. Это не годовая доходность и не заменяет TWR или XIRR на странице аналитики.</p>
  </section>;
}

