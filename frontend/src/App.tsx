import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import './App.css';
import { InstrumentFinancialChart, InstrumentPriceChart } from './components/InstrumentCharts';
import { PortfolioCharts } from './components/PortfolioCharts';

type Instrument = { id: number; ticker: string; name: string; isin: string | null; type: string; board: string | null; market: string | null; currency: string; lotSize: number | null; minPriceStep: number | null; logoPath: string | null; logoStatus: 'pending' | 'found' | 'missing' };
type MarketData = { ticker: string; price: number | null; changePercent: number | null; currency: string; updatedAt: string | null; sector: string | null; marketCapUsd: number | null; pe: number | null; ps: number | null; payoutRatio: number | null };
type MoexSearchResult = { ticker: string; name: string; type: string; board: string | null };
type Portfolio = { id: number; name: string; createdAt: string };
type Transaction = { id: number; type: string; quantity: number | null; priceKopecks: number | null; amountKopecks: number | null; accruedInterestKopecks: number; commissionKopecks: number; operationDate: string; ticker: string | null; name: string | null };
type BrokerImportOperation = { type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL'; ticker: string | null; quantity: number | null; priceKopecks: number | null; amountKopecks: number | null; accruedInterestKopecks: number; commissionKopecks: number; operationDate: string; sourceId: string; description: string };
type BrokerReportFormat = 'pdf' | 'xlsx';
type BrokerImportPreview = { broker: 'Т-Банк'; format: 'PDF' | 'Excel'; period: string | null; operations: BrokerImportOperation[]; warnings: string[]; summary: { trades: number; deposits: number; withdrawals: number; commissionsKopecks: number } };
type Analytics = { cashKopecks: number; securitiesValueKopecks: number; totalValueKopecks: number; netContributionsKopecks: number; totalPnlKopecks: number; positions: Array<{ instrumentId: number; ticker: string; name: string; quantity: number; averageCostKopecks: number; marketValueKopecks: number | null; unrealizedPnlKopecks: number | null; allocationPercent: number | null }> };
type BondAnalytics = { positions: Array<{ instrumentId: number; ticker: string; name: string; quantity: number; investedKopecks: number; pricePercent: number | null; nextCouponDate: string | null; nextCouponKopecks: number | null; offerDate: string | null; maturityDate: string | null; creditRating: string | null; currentYieldPercent: number | null; yieldToMaturityPercent: number | null }> };
type Page = 'overview' | 'portfolios' | 'operations' | 'instruments' | 'instrument';
type OverviewTab = 'profit' | 'bonds' | 'assets';
type InstrumentSortKey = 'instrument' | 'type' | 'sector' | 'price' | 'pe' | 'ps' | 'payout' | 'marketCap' | 'parameters';
type SortDirection = 'asc' | 'desc';
type HistoryRange = 'all' | '5y' | '1y' | '1m' | '1w' | '1d';
type InstrumentDetails = {
  instrument: Instrument;
  quote: { ticker: string; price: number | null; currency: string; updatedAt: string; issueCapitalizationRub: number | null };
  metrics: { epsRub: number | null; marketCapRub: number | null; dividendYieldPercent: number | null; dividendPerShareRub: number | null; payoutRatioPercent: number | null };
  positions: Array<{ portfolioId: number; portfolioName: string; quantity: number; averageCostKopecks: number; investedKopecks: number; marketValueKopecks: number | null; unrealizedPnlKopecks: number | null }>;
  financials: Array<{ year: number; revenueRub: number | null; netIncomeRub: number | null }>;
  fundamentalsSource: { name: string; url: string } | null;
};
type InstrumentGrowth = { ticker: string; oneWeek: number | null; oneMonth: number | null; oneYear: number | null; fiveYears: number | null; allTime: number | null };
type InstrumentHistory = { ticker: string; range: HistoryRange; points: Array<{ date: string; close: number }>; source: string };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const apiUrl = `${apiBaseUrl}/api`;
const issuerLogos: Record<string, { src: string; name: string }> = {
  SBER: { src: '/instrument-logos/sber.svg', name: 'Сбер' },
  SBERP: { src: '/instrument-logos/sber.svg', name: 'Сбер' },
  OZON: { src: '/instrument-logos/ozon.svg', name: 'Ozon' },
};

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU') : '—';
const percent = (value: number | null) => value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
const multiple = (value: number | null) => value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}×`;
const usdCompact = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} $`;
const rubCompact = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 2 }).format(value)} ₽`;
const priceRub = (value: number | null) => value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const toKopecks = (value: string) => Math.round(Number(value.replace(/\s/g, '').replace(',', '.')) * 100);
const tradeTypes = new Set(['BUY', 'SELL']);
const instrumentTypes = new Set(['BUY', 'SELL', 'DIVIDEND', 'COUPON']);
const pageTitles: Record<Page, string> = { overview: 'Обзор', portfolios: 'Портфели', operations: 'Операции', instruments: 'Инструменты', instrument: 'Инструмент' };
const navigationPages: Page[] = ['overview', 'portfolios', 'operations', 'instruments'];
const historyRangeOptions: Array<{ value: HistoryRange; label: string }> = [
  { value: 'all', label: 'Всё время' }, { value: '5y', label: '5 лет' }, { value: '1y', label: 'Год' },
  { value: '1m', label: 'Месяц' }, { value: '1w', label: 'Неделя' }, { value: '1d', label: 'День' },
];

function getRouteFromHash() {
  const [page, rawTicker] = window.location.hash.replace(/^#/, '').split('/');
  if (page === 'instrument' && rawTicker) {
    try {
      const ticker = decodeURIComponent(rawTicker).toUpperCase();
      if (/^[A-Za-z0-9._-]{1,32}$/.test(ticker)) return { page: 'instrument' as const, ticker };
    } catch {
      return { page: 'overview' as const, ticker: null };
    }
  }
  return { page: page in pageTitles && page !== 'instrument' ? page as Exclude<Page, 'instrument'> : 'overview' as const, ticker: null };
}

function InstrumentIcon({ instrument }: { instrument: Instrument }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const issuer = issuerLogos[instrument.ticker.toUpperCase()];
  const logoSource = instrument.logoPath ? `${apiBaseUrl}${instrument.logoPath}` : issuer?.src;
  const logoName = issuer?.name ?? instrument.name;
  if (logoSource && !imageUnavailable) return <img className="instrument-logo" src={logoSource} alt={`${logoName} — ${instrument.ticker}`} title={logoName} onError={() => setImageUnavailable(true)} />;

  const normalizedType = instrument.type.toLowerCase();
  const kind = normalizedType.includes('bond') ? 'bond' : normalizedType.includes('share') || normalizedType.includes('stock') ? 'share' : normalizedType.includes('etf') || normalizedType.includes('fund') ? 'fund' : 'other';
  const labels = { bond: 'Облигация', share: 'Акция', fund: 'Фонд', other: 'Инструмент' };

  return <span className={`instrument-icon ${kind}`} role="img" aria-label={labels[kind]} title={labels[kind]}>
    {kind === 'bond' && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3" /></svg>}
    {kind === 'share' && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 15.5V4.5M3.5 15.5h13M6.5 12l3-3 2.2 1.8 4-4" /><circle cx="6.5" cy="12" r=".9" /><circle cx="9.5" cy="9" r=".9" /><circle cx="11.7" cy="10.8" r=".9" /><circle cx="15.7" cy="6.8" r=".9" /></svg>}
    {kind === 'fund' && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5 15.5 6v8L10 16.5 4.5 14V6zM4.5 6 10 8.5 15.5 6M10 8.5v8" /></svg>}
    {kind === 'other' && <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.8" /><path d="M10 6.5v7M6.5 10h7" /></svg>}
  </span>;
}

function SortableInstrumentHeader({ label, sortKey, activeSort, onSort, title }: { label: string; sortKey: InstrumentSortKey; activeSort: { key: InstrumentSortKey; direction: SortDirection }; onSort: (key: InstrumentSortKey) => void; title?: string }) {
  const isActive = activeSort.key === sortKey;
  const nextDirection = isActive && activeSort.direction === 'asc' ? 'desc' : 'asc';
  const directionLabel = nextDirection === 'asc' ? 'по возрастанию' : 'по убыванию';

  return <th aria-sort={isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
    <button className={`sort-button${isActive ? ' active' : ''}`} type="button" onClick={() => onSort(sortKey)} aria-label={`Сортировать «${label}» ${directionLabel}`}>
      {label}<span aria-hidden="true">{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>;
}

function InstrumentDetailPage({
  detail,
  growth,
  history,
  historyRange,
  isHistoryLoading,
  historyError,
  error,
  onRangeChange,
  onBack,
}: {
  detail: InstrumentDetails | null;
  growth: InstrumentGrowth | null;
  history: InstrumentHistory | null;
  historyRange: HistoryRange;
  isHistoryLoading: boolean;
  historyError: string;
  error: string;
  onRangeChange: (range: HistoryRange) => void;
  onBack: () => void;
}) {
  if (error) return <section className="instrument-detail-error"><button className="back-link" type="button" onClick={onBack}>← К инструментам</button><h2>Карточка инструмента недоступна</h2><p>{error}</p></section>;
  if (!detail) return <section className="instrument-detail-loading" aria-live="polite"><i /><span>Загружаем карточку инструмента и рыночные данные…</span></section>;

  const { instrument, quote, metrics, positions, financials, fundamentalsSource } = detail;
  const growthItems = [
    ['Неделя', growth?.oneWeek ?? null], ['Месяц', growth?.oneMonth ?? null], ['Год', growth?.oneYear ?? null], ['5 лет', growth?.fiveYears ?? null], ['Всё время', growth?.allTime ?? null],
  ] as const;
  const priceChange = history?.points.length && history.points[0].close
    ? ((history.points.at(-1)!.close - history.points[0].close) / history.points[0].close) * 100
    : null;

  return <section className="instrument-detail">
    <button className="back-link" type="button" onClick={onBack}>← К инструментам</button>
    <div className="instrument-hero">
      <div className="instrument-hero-title"><InstrumentIcon instrument={instrument} /><div><p className="section-label">{instrument.type} · {instrument.board ?? 'MOEX'}</p><h1>{instrument.ticker}</h1><p>{instrument.name}{instrument.isin ? ` · ISIN ${instrument.isin}` : ''}</p></div></div>
      <div className="instrument-current-price"><span>Текущая цена</span><strong>{quote.price === null ? 'Нет цены' : `${quote.price.toLocaleString('ru-RU')} ${quote.currency}`}</strong><small>{quote.updatedAt ? `MOEX: ${new Date(quote.updatedAt).toLocaleString('ru-RU')}` : 'Ожидаем котировку'}</small></div>
    </div>

    <section className="instrument-price-panel">
      <div className="instrument-section-heading"><div><p className="section-label">ДИНАМИКА ЦЕНЫ</p><h2>Котировки на MOEX</h2></div>{priceChange !== null && <strong className={priceChange < 0 ? 'negative' : 'positive'}>{priceChange > 0 ? '+' : ''}{priceChange.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}% за период</strong>}</div>
      <div className="history-range-tabs" role="tablist" aria-label="Период графика цены">{historyRangeOptions.map((option) => <button key={option.value} type="button" className={historyRange === option.value ? 'active' : ''} onClick={() => onRangeChange(option.value)} role="tab" aria-selected={historyRange === option.value}>{option.label}</button>)}</div>
      <div className={`instrument-chart-frame${isHistoryLoading ? ' loading' : ''}`}>{isHistoryLoading && <span className="chart-loading">Обновляем график…</span>}{historyError ? <p className="instrument-chart-empty">{historyError}</p> : history && <InstrumentPriceChart points={history.points} currency={quote.currency} />}</div>
    </section>

    <section className="instrument-metrics" aria-label="Ключевые показатели инструмента">
      <div><span>EPS</span><strong>{priceRub(metrics.epsRub)}</strong><small>прибыль на акцию</small></div>
      <div><span>Капитализация</span><strong>{rubCompact(metrics.marketCapRub)}</strong><small>по данным котировки MOEX</small></div>
      <div><span>Див. доходность</span><strong>{percent(metrics.dividendYieldPercent)}</strong><small>{metrics.payoutRatioPercent === null ? 'годовая оценка' : `payout ${percent(metrics.payoutRatioPercent)}`}</small></div>
      <div><span>Годовые выплаты</span><strong>{priceRub(metrics.dividendPerShareRub)}</strong><small>дивидендов на 1 акцию</small></div>
    </section>

    <section className="instrument-growth-panel"><div className="instrument-section-heading"><div><p className="section-label">ИЗМЕНЕНИЕ ЦЕНЫ</p><h2>Рост за период</h2></div><span>по закрытиям MOEX</span></div><div className="growth-grid">{growthItems.map(([label, value]) => <div key={label}><span>{label}</span><strong className={value !== null && value < 0 ? 'negative' : 'positive'}>{value === null ? '—' : `${value > 0 ? '+' : ''}${percent(value)}`}</strong></div>)}</div></section>

    <section className="instrument-holdings-panel"><div className="instrument-section-heading"><div><p className="section-label">МОИ ПОЗИЦИИ</p><h2>Инструмент в портфелях</h2></div><span>{positions.reduce((sum, position) => sum + position.quantity, 0).toLocaleString('ru-RU')} шт.</span></div>{positions.length ? <div className="instrument-holdings-table"><table><thead><tr><th>Портфель</th><th>Количество</th><th>Вложено</th><th>Средняя цена</th><th>Текущая оценка</th><th>Результат</th></tr></thead><tbody>{positions.map((position) => <tr key={position.portfolioId}><td><strong>{position.portfolioName}</strong></td><td>{position.quantity.toLocaleString('ru-RU')} шт.</td><td>{money(position.investedKopecks)}</td><td>{money(position.averageCostKopecks)}</td><td>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</td><td className={position.unrealizedPnlKopecks !== null && position.unrealizedPnlKopecks < 0 ? 'negative' : 'positive'}>{position.unrealizedPnlKopecks === null ? '—' : money(position.unrealizedPnlKopecks)}</td></tr>)}</tbody></table></div> : <p className="instrument-empty">В этом инструменте пока нет открытых позиций. Добавьте покупку на странице «Операции».</p>}</section>

    <section className="instrument-financial-panel"><div className="instrument-section-heading"><div><p className="section-label">ФИНАНСОВЫЕ ПОКАЗАТЕЛИ</p><h2>Выручка / доходы и чистая прибыль</h2></div><div className="financial-legend"><span><i className="revenue" />Выручка / доходы</span><span><i className="income" />Чистая прибыль</span></div></div><InstrumentFinancialChart financials={financials} />{fundamentalsSource ? <p className="fundamentals-source">Годовые данные: <a href={fundamentalsSource.url} target="_blank" rel="noreferrer">{fundamentalsSource.name}</a>. Для банков в первом столбце показаны чистые операционные доходы; показатели используются для справки и могут обновляться после публикации отчётности.</p> : <p className="fundamentals-source">MOEX ISS не публикует унифицированную финансовую отчётность, поэтому показатели доступны не для всех типов инструментов.</p>}</section>
  </section>;
}

function App() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactionInstruments, setTransactionInstruments] = useState<Instrument[]>([]);
  const [query, setQuery] = useState('');
  const [ticker, setTicker] = useState('');
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [moexResults, setMoexResults] = useState<MoexSearchResult[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolioName, setPortfolioName] = useState('');
  const [editingPortfolioId, setEditingPortfolioId] = useState<number | null>(null);
  const [portfolioMessage, setPortfolioMessage] = useState('');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [bondAnalytics, setBondAnalytics] = useState<BondAnalytics | null>(null);
  const [bondError, setBondError] = useState('');
  const [overviewTab, setOverviewTab] = useState<OverviewTab>('profit');
  const [transactionType, setTransactionType] = useState('DEPOSIT');
  const [transactionInstrumentId, setTransactionInstrumentId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [commission, setCommission] = useState('0');
  const [operationDate, setOperationDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactionMessage, setTransactionMessage] = useState('');
  const [brokerFileBase64, setBrokerFileBase64] = useState('');
  const [brokerReportFormat, setBrokerReportFormat] = useState<BrokerReportFormat | null>(null);
  const [brokerReportName, setBrokerReportName] = useState('');
  const [brokerPreview, setBrokerPreview] = useState<BrokerImportPreview | null>(null);
  const [selectedBrokerOperationIds, setSelectedBrokerOperationIds] = useState<Set<string>>(new Set());
  const [brokerImportMessage, setBrokerImportMessage] = useState('');
  const [isBrokerImporting, setIsBrokerImporting] = useState(false);
  const [isLogoSyncing, setIsLogoSyncing] = useState(false);
  const [activePage, setActivePage] = useState<Page>(() => getRouteFromHash().page);
  const [selectedInstrumentTicker, setSelectedInstrumentTicker] = useState<string | null>(() => getRouteFromHash().ticker);
  const [instrumentDetails, setInstrumentDetails] = useState<InstrumentDetails | null>(null);
  const [instrumentHistory, setInstrumentHistory] = useState<InstrumentHistory | null>(null);
  const [instrumentGrowth, setInstrumentGrowth] = useState<InstrumentGrowth | null>(null);
  const [instrumentDetailError, setInstrumentDetailError] = useState('');
  const [instrumentHistoryError, setInstrumentHistoryError] = useState('');
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1y');
  const [isInstrumentHistoryLoading, setIsInstrumentHistoryLoading] = useState(false);
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  const [instrumentSort, setInstrumentSort] = useState<{ key: InstrumentSortKey; direction: SortDirection }>({ key: 'instrument', direction: 'asc' });
  const pendingBackendRequests = useRef(0);
  const initialLogoSyncStarted = useRef(false);

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    pendingBackendRequests.current += 1;
    setIsBackendLoading(true);
    try {
      return await fetch(`${apiUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Сервер не ответил за 20 секунд. Проверьте соединение и попробуйте снова.', { cause: error });
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      pendingBackendRequests.current -= 1;
      setIsBackendLoading(pendingBackendRequests.current > 0);
    }
  }, []);

  const loadInstruments = useCallback(async (search = '') => {
    try {
      const response = await apiFetch(`/instruments?q=${encodeURIComponent(search)}`);
      if (!response.ok) throw new Error();
      setInstruments(await response.json());
    } catch { setMessage('Не удалось подключиться к backend. Запустите сервер на порту 3000.'); }
  }, [apiFetch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInstruments(query), 200);
    return () => window.clearTimeout(timeout);
  }, [loadInstruments, query]);

  const loadMarketData = useCallback(async () => {
    try {
      const response = await apiFetch('/instruments/market-data');
      if (!response.ok) throw new Error();
      const items = await response.json() as MarketData[];
      setMarketData(Object.fromEntries(items.map((item) => [item.ticker, item])));
    } catch { setMessage('Не удалось обновить рыночные данные.'); }
  }, [apiFetch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadMarketData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadMarketData]);

  const loadTransactionInstruments = useCallback(async () => {
    try {
      const response = await apiFetch('/instruments');
      if (!response.ok) throw new Error();
      setTransactionInstruments(await response.json());
    } catch { setTransactionMessage('Не удалось загрузить инструменты для операции.'); }
  }, [apiFetch]);

  const syncInstrumentLogos = useCallback(async (force = false) => {
    setIsLogoSyncing(true);
    try {
      const response = await apiFetch('/instruments/logos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Не удалось найти логотипы');
      await Promise.all([loadInstruments(query), loadTransactionInstruments()]);
      if (force) setMessage(result.checked ? `Найдено логотипов: ${result.found}; без логотипа: ${result.missing}.` : 'Все доступные логотипы уже сохранены.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось найти логотипы'); }
    finally { setIsLogoSyncing(false); }
  }, [apiFetch, loadInstruments, loadTransactionInstruments, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTransactionInstruments(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadTransactionInstruments]);

  useEffect(() => {
    if (initialLogoSyncStarted.current || !instruments.some((instrument) => instrument.logoStatus === 'pending')) return;
    initialLogoSyncStarted.current = true;
    void syncInstrumentLogos();
  }, [instruments, syncInstrumentLogos]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (query.trim().length < 2) { setMoexResults([]); return; }
      apiFetch(`/instruments/search?q=${encodeURIComponent(query)}`)
        .then((response) => response.ok ? response.json() : [])
        .then(setMoexResults)
        .catch(() => setMoexResults([]));
    }, query.trim().length < 2 ? 0 : 350);
    return () => window.clearTimeout(timeout);
  }, [apiFetch, query]);

  const loadPortfolios = useCallback(async () => {
    try {
      const response = await apiFetch('/portfolios');
      if (!response.ok) throw new Error();
      const items = await response.json() as Portfolio[];
      setPortfolios(items);
      if (items.length === 1) {
        setSelectedPortfolioId((current) => current ?? items[0].id);
      }
    } catch { setPortfolioMessage('Не удалось загрузить портфели.'); }
  }, [apiFetch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPortfolios(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPortfolios]);

  const loadActivity = useCallback(async (portfolioId: number | null) => {
    try {
      const scope = portfolioId ? `/portfolios/${portfolioId}/analytics` : '/analytics';
      const transactionUrl = portfolioId ? `/transactions?portfolioId=${portfolioId}` : '/transactions';
      const [analyticsResponse, transactionsResponse] = await Promise.all([apiFetch(scope), apiFetch(transactionUrl)]);
      if (!analyticsResponse.ok || !transactionsResponse.ok) throw new Error();
      setAnalytics(await analyticsResponse.json());
      setTransactions(await transactionsResponse.json());
    } catch { setTransactionMessage('Не удалось загрузить операции и аналитику.'); }
  }, [apiFetch]);

  const loadBondAnalytics = useCallback(async (portfolioId: number | null) => {
    setBondError('');
    try {
      const scope = portfolioId ? `/analytics/bonds?portfolioId=${portfolioId}` : '/analytics/bonds';
      const response = await apiFetch(scope);
      if (!response.ok) throw new Error();
      setBondAnalytics(await response.json());
    } catch { setBondError('Не удалось получить данные по облигациям. Попробуйте обновить страницу.'); }
  }, [apiFetch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadActivity(selectedPortfolioId), 0);
    return () => window.clearTimeout(timeout);
  }, [loadActivity, selectedPortfolioId]);

  useEffect(() => {
    if (activePage !== 'overview' || overviewTab !== 'bonds') return;
    const timeout = window.setTimeout(() => void loadBondAnalytics(selectedPortfolioId), 0);
    return () => window.clearTimeout(timeout);
  }, [activePage, loadBondAnalytics, overviewTab, selectedPortfolioId]);

  useEffect(() => {
    const handleHashChange = () => {
      const route = getRouteFromHash();
      setActivePage(route.page);
      setSelectedInstrumentTicker(route.ticker);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (activePage !== 'instrument' || !selectedInstrumentTicker) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setInstrumentDetails(null);
        setInstrumentHistory(null);
        setInstrumentGrowth(null);
        setInstrumentDetailError('');
        setInstrumentHistoryError('');
        try {
          const response = await apiFetch(`/instruments/${encodeURIComponent(selectedInstrumentTicker)}/details`);
          const data = await response.json() as InstrumentDetails | { error?: string };
          if (!response.ok) throw new Error('error' in data ? data.error : 'Не удалось загрузить карточку инструмента.');
          if (!cancelled) setInstrumentDetails(data as InstrumentDetails);
        } catch (error) {
          if (!cancelled) setInstrumentDetailError(error instanceof Error ? error.message : 'Не удалось загрузить карточку инструмента.');
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [activePage, apiFetch, selectedInstrumentTicker]);

  useEffect(() => {
    if (activePage !== 'instrument' || !selectedInstrumentTicker) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setIsInstrumentHistoryLoading(true);
        setInstrumentHistoryError('');
        try {
          const response = await apiFetch(`/instruments/${encodeURIComponent(selectedInstrumentTicker)}/history?range=${historyRange}`);
          const data = await response.json() as InstrumentHistory | { error?: string };
          if (!response.ok) throw new Error('error' in data ? data.error : 'Не удалось загрузить историю цен.');
          if (!cancelled) setInstrumentHistory(data as InstrumentHistory);
        } catch (error) {
          if (!cancelled) setInstrumentHistoryError(error instanceof Error ? error.message : 'Не удалось загрузить историю цен.');
        } finally {
          if (!cancelled) setIsInstrumentHistoryLoading(false);
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [activePage, apiFetch, historyRange, selectedInstrumentTicker]);

  useEffect(() => {
    if (activePage !== 'instrument' || !selectedInstrumentTicker) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await apiFetch(`/instruments/${encodeURIComponent(selectedInstrumentTicker)}/growth`);
          if (!response.ok) return;
          const data = await response.json() as InstrumentGrowth;
          if (!cancelled) setInstrumentGrowth(data);
        } catch {
          // Growth is supplementary: the card and the selected chart remain usable.
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [activePage, apiFetch, selectedInstrumentTicker]);

  function openInstrument(tickerToOpen: string) {
    const normalizedTicker = tickerToOpen.toUpperCase();
    setSelectedInstrumentTicker(normalizedTicker);
    setInstrumentDetailError('');
    setHistoryRange('1y');
    setActivePage('instrument');
    window.location.hash = `instrument/${encodeURIComponent(normalizedTicker)}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeInstrumentDetails() {
    setActivePage('instruments');
    window.location.hash = 'instruments';
  }

  async function addInstrument(event: FormEvent) {
    event.preventDefault();
    await importInstrument(ticker);
  }

  async function importInstrument(value: string) {
    if (!value.trim()) return;
    setIsLoading(true); setMessage('');
    try {
      const response = await apiFetch('/instruments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось добавить инструмент');
      setTicker(''); setMessage(`${data.ticker} добавлен в каталог.`);
      await loadInstruments(query);
      await loadTransactionInstruments();
      await loadMarketData();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось добавить инструмент'); }
    finally { setIsLoading(false); }
  }

  async function savePortfolio(event: FormEvent) {
    event.preventDefault();
    const name = portfolioName.trim();
    if (!name) return;
    setPortfolioMessage('');
    try {
      const response = await apiFetch(editingPortfolioId ? `/portfolios/${editingPortfolioId}` : '/portfolios', {
        method: editingPortfolioId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось сохранить портфель');
      setPortfolioName(''); setEditingPortfolioId(null);
      if (!editingPortfolioId) setSelectedPortfolioId(data.id);
      setPortfolioMessage(editingPortfolioId ? 'Название портфеля обновлено.' : 'Портфель создан.');
      await loadPortfolios();
    } catch (error) { setPortfolioMessage(error instanceof Error ? error.message : 'Не удалось сохранить портфель'); }
  }

  async function removePortfolio(id: number) {
    if (!window.confirm('Удалить этот портфель? Операции появятся в следующей фазе.')) return;
    try {
      const response = await apiFetch(`/portfolios/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      if (editingPortfolioId === id) { setEditingPortfolioId(null); setPortfolioName(''); }
      if (selectedPortfolioId === id) setSelectedPortfolioId(null);
      setPortfolioMessage('Портфель удалён.');
      await loadPortfolios();
    } catch { setPortfolioMessage('Не удалось удалить портфель.'); }
  }

  async function addTransaction(event: FormEvent) {
    event.preventDefault();
    if (!selectedPortfolioId) { setTransactionMessage('Сначала выберите портфель.'); return; }
    const isTrade = tradeTypes.has(transactionType);
    const needsInstrument = instrumentTypes.has(transactionType);
    const amountKopecks = isTrade ? null : toKopecks(amount);
    const payload = {
      portfolioId: selectedPortfolioId,
      type: transactionType,
      instrumentId: needsInstrument ? Number(transactionInstrumentId) : null,
      quantity: isTrade ? Number(quantity) : null,
      priceKopecks: isTrade ? toKopecks(price) : null,
      amountKopecks,
      commissionKopecks: isTrade ? toKopecks(commission) : 0,
      operationDate,
    };
    setTransactionMessage('');
    try {
      const response = await apiFetch('/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось добавить операцию');
      setQuantity(''); setPrice(''); setAmount(''); setCommission('0');
      setTransactionMessage('Операция добавлена.');
      await loadActivity(selectedPortfolioId);
    } catch (error) { setTransactionMessage(error instanceof Error ? error.message : 'Не удалось добавить операцию'); }
  }

  async function removeTransaction(id: number) {
    if (!window.confirm('Удалить операцию? Позиции и показатели будут пересчитаны.')) return;
    try {
      const response = await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      await loadActivity(selectedPortfolioId);
    } catch { setTransactionMessage('Не удалось удалить операцию.'); }
  }

  function chooseBrokerReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBrokerPreview(null);
    setSelectedBrokerOperationIds(new Set());
    setBrokerImportMessage('');
    if (!file) { setBrokerFileBase64(''); setBrokerReportFormat(null); setBrokerReportName(''); return; }
    const lowerName = file.name.toLowerCase();
    const format: BrokerReportFormat | null = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
      ? 'pdf'
      : file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || lowerName.endsWith('.xlsx')
        ? 'xlsx'
        : null;
    if (!format) {
      setBrokerFileBase64(''); setBrokerReportFormat(null); setBrokerReportName(''); setBrokerImportMessage('Выберите PDF- или Excel-файл (.xlsx) брокерского отчёта.'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setBrokerFileBase64(''); setBrokerReportFormat(null); setBrokerReportName(''); setBrokerImportMessage('Отчёт больше 8 МБ — выберите файл меньшего размера.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (!base64) { setBrokerImportMessage('Не удалось прочитать выбранный файл.'); return; }
      setBrokerFileBase64(base64); setBrokerReportFormat(format); setBrokerReportName(file.name);
      setBrokerImportMessage('Файл готов к предпросмотру. Операции ещё не добавлены.');
    };
    reader.onerror = () => setBrokerImportMessage('Не удалось прочитать выбранный файл.');
    reader.readAsDataURL(file);
  }

  async function previewBrokerReport() {
    if (!brokerFileBase64 || !brokerReportFormat) { setBrokerImportMessage('Сначала выберите PDF- или Excel-отчёт.'); return; }
    setIsBrokerImporting(true); setBrokerImportMessage('');
    try {
      const response = await apiFetch(
        brokerReportFormat === 'xlsx' ? '/imports/tbank/xlsx/preview' : '/imports/tbank/preview',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerReportFormat === 'xlsx' ? { xlsxBase64: brokerFileBase64 } : { pdfBase64: brokerFileBase64 }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось разобрать отчёт');
      const preview = data as BrokerImportPreview;
      setBrokerPreview(preview);
      setSelectedBrokerOperationIds(new Set(preview.operations.map((operation) => operation.sourceId)));
      setBrokerImportMessage('Предпросмотр готов. Проверьте операции перед добавлением.');
    } catch (error) { setBrokerImportMessage(error instanceof Error ? error.message : 'Не удалось разобрать отчёт'); }
    finally { setIsBrokerImporting(false); }
  }

  async function commitBrokerImport() {
    if (!selectedPortfolioId) { setBrokerImportMessage('Выберите один портфель для импорта.'); return; }
    if (!brokerFileBase64 || !brokerReportFormat || !brokerPreview) { setBrokerImportMessage('Сначала сформируйте предпросмотр отчёта.'); return; }
    const sourceIds = [...selectedBrokerOperationIds];
    if (!sourceIds.length) { setBrokerImportMessage('Отметьте хотя бы одну операцию для импорта.'); return; }
    setIsBrokerImporting(true); setBrokerImportMessage('');
    try {
      const response = await apiFetch(
        brokerReportFormat === 'xlsx' ? '/imports/tbank/xlsx/commit' : '/imports/tbank/commit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerReportFormat === 'xlsx'
            ? { portfolioId: selectedPortfolioId, xlsxBase64: brokerFileBase64, sourceIds }
            : { portfolioId: selectedPortfolioId, pdfBase64: brokerFileBase64, sourceIds }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось импортировать операции');
      setBrokerImportMessage(`Добавлено операций: ${data.imported}. Комиссии и НКД уже учтены.`);
      setBrokerPreview(null); setSelectedBrokerOperationIds(new Set()); setBrokerFileBase64(''); setBrokerReportFormat(null); setBrokerReportName('');
      await Promise.all([loadActivity(selectedPortfolioId), loadInstruments(query), loadTransactionInstruments(), loadMarketData()]);
    } catch (error) { setBrokerImportMessage(error instanceof Error ? error.message : 'Не удалось импортировать операции'); }
    finally { setIsBrokerImporting(false); }
  }

  function importAmount(operation: BrokerImportOperation) {
    if (operation.amountKopecks !== null) return operation.amountKopecks;
    const gross = (operation.priceKopecks ?? 0) * (operation.quantity ?? 0);
    return operation.type === 'SELL'
      ? gross + operation.accruedInterestKopecks - operation.commissionKopecks
      : gross + operation.accruedInterestKopecks + operation.commissionKopecks;
  }

  function transactionAmount(transaction: Transaction) {
    if (transaction.amountKopecks !== null) return transaction.amountKopecks;
    if (transaction.priceKopecks === null || transaction.quantity === null) return null;
    const gross = transaction.priceKopecks * transaction.quantity;
    return transaction.type === 'SELL'
      ? gross + transaction.accruedInterestKopecks - transaction.commissionKopecks
      : gross + transaction.accruedInterestKopecks + transaction.commissionKopecks;
  }

  function toggleBrokerOperation(sourceId: string) {
    setSelectedBrokerOperationIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId); else next.add(sourceId);
      return next;
    });
  }

  function toggleAllBrokerOperations() {
    if (!brokerPreview) return;
    setSelectedBrokerOperationIds((current) => current.size === brokerPreview.operations.length
      ? new Set()
      : new Set(brokerPreview.operations.map((operation) => operation.sourceId)));
  }

  const selectedBrokerOperations = brokerPreview?.operations.filter((operation) => selectedBrokerOperationIds.has(operation.sourceId)) ?? [];
  const selectedBrokerCommissionKopecks = selectedBrokerOperations.reduce((total, operation) => total + operation.commissionKopecks, 0);
  const changeInstrumentSort = (key: InstrumentSortKey) => setInstrumentSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));
  const sortedInstruments = [...instruments].sort((left, right) => {
    const quoteLeft = marketData[left.ticker];
    const quoteRight = marketData[right.ticker];
    const sortValue = (instrument: Instrument, quote: MarketData | undefined): string | number | null => {
      switch (instrumentSort.key) {
        case 'instrument': return `${instrument.ticker} ${instrument.name}`;
        case 'type': return `${instrument.type} ${instrument.board ?? ''} ${instrument.currency}`;
        case 'sector': return quote?.sector ?? null;
        case 'price': return quote?.price ?? null;
        case 'pe': return quote?.pe ?? null;
        case 'ps': return quote?.ps ?? null;
        case 'payout': return quote?.payoutRatio ?? null;
        case 'marketCap': return quote?.marketCapUsd ?? null;
        case 'parameters': return instrument.lotSize ?? null;
      }
    };
    const leftValue = sortValue(left, quoteLeft);
    const rightValue = sortValue(right, quoteRight);
    if (leftValue === null) return rightValue === null ? left.ticker.localeCompare(right.ticker) : 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'ru-RU');
    if (comparison !== 0) return comparison * (instrumentSort.direction === 'asc' ? 1 : -1);
    if (instrumentSort.key === 'parameters') {
      const stepComparison = (left.minPriceStep ?? Number.POSITIVE_INFINITY) - (right.minPriceStep ?? Number.POSITIVE_INFINITY);
      if (stepComparison !== 0) return stepComparison * (instrumentSort.direction === 'asc' ? 1 : -1);
    }
    return left.ticker.localeCompare(right.ticker, 'ru-RU');
  });

  return <div className="app-shell">
    <nav className="top-navigation" aria-label="Основная навигация"><a className="top-brand" href="#overview" onClick={() => setActivePage('overview')}><span>●</span> Капитал</a><div className="nav-links">{navigationPages.map((page) => <a key={page} className={activePage === page || (page === 'instruments' && activePage === 'instrument') ? 'active' : ''} href={`#${page}`} onClick={() => setActivePage(page)}>{pageTitles[page]}{page === 'portfolios' && <small>{portfolios.length}</small>}</a>)}</div><div className="profile">АБ</div></nav>
    <main className="app" id="top">
      <div className="topbar"><span className="crumb">Инвестиции <b>/</b> {activePage === 'instrument' && selectedInstrumentTicker ? `Инструменты / ${selectedInstrumentTicker}` : pageTitles[activePage]}</span>{isBackendLoading && <span className="backend-loading" role="status" aria-live="polite"><i />Загружаем данные…</span>}</div>
      {activePage !== 'instrument' && <header className="page-intro"><p className="eyebrow">{activePage === 'overview' ? 'ОБЩИЙ ПРОФИЛЬ' : activePage === 'portfolios' ? 'УПРАВЛЕНИЕ СТРАТЕГИЯМИ' : activePage === 'operations' ? 'УЧЁТ И АНАЛИТИКА' : 'КАТАЛОГ РЫНКА'}</p><h1>{activePage === 'overview' ? 'Обзор портфеля' : activePage === 'portfolios' ? 'Мои портфели' : activePage === 'operations' ? 'Операции' : 'Инструменты'}</h1><p className="intro">{activePage === 'overview' ? 'Главные показатели по всем вашим инвестициям в одном месте.' : activePage === 'portfolios' ? 'Создавайте отдельные стратегии и управляйте ими независимо.' : activePage === 'operations' ? 'Добавляйте сделки, пополнения и выплаты — показатели пересчитаются автоматически.' : 'Находите бумаги Московской биржи и собирайте базу для своего портфеля.'}</p></header>}
      {activePage === 'instrument' && <InstrumentDetailPage detail={instrumentDetails} growth={instrumentGrowth} history={instrumentHistory} historyRange={historyRange} isHistoryLoading={isInstrumentHistoryLoading} historyError={instrumentHistoryError} error={instrumentDetailError} onRangeChange={setHistoryRange} onBack={closeInstrumentDetails} />}
      {activePage === 'overview' && <section className="overview-panel">
        <div className="activity-header"><div><p className="section-label">СВОДКА</p><h2>Состояние портфеля</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div>
        <div className="overview-tabs" role="tablist" aria-label="Разделы обзора"><button type="button" className={overviewTab === 'profit' ? 'active' : ''} onClick={() => setOverviewTab('profit')} role="tab" aria-selected={overviewTab === 'profit'}>Прибыль</button><button type="button" className={overviewTab === 'bonds' ? 'active' : ''} onClick={() => setOverviewTab('bonds')} role="tab" aria-selected={overviewTab === 'bonds'}>Облигации</button><button type="button" className={overviewTab === 'assets' ? 'active' : ''} onClick={() => setOverviewTab('assets')} role="tab" aria-selected={overviewTab === 'assets'}>Мои активы</button></div>
        {overviewTab === 'profit' && <><div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div><p className="overview-note">Результат учитывает рыночную оценку активов, НКД по облигациям и зафиксированный результат от продаж.</p>{analytics && <PortfolioCharts cashKopecks={analytics.cashKopecks} positions={analytics.positions} transactions={transactions} />}</>}
        {overviewTab === 'bonds' && <div className="bond-section"><div className="bond-heading"><div><h3>Облигации в портфеле</h3><p>Даты, доходности и купоны обновляются по данным MOEX.</p></div>{bondAnalytics && <span>{bondAnalytics.positions.length}</span>}</div>{bondError ? <p className="portfolio-empty">{bondError}</p> : bondAnalytics?.positions.length ? <div className="bond-table-wrap"><table><thead><tr><th>Актив</th><th>Кол-во</th><th>Вложено</th><th>Цена (%)</th><th>Дата следующей выплаты</th><th>Следующая выплата</th><th>Дата оферты</th><th>Дата погашения</th><th>Кредитный рейтинг</th><th>Текущая доходность</th><th>Доходность к погашению</th></tr></thead><tbody>{bondAnalytics.positions.map((bond) => <tr key={bond.instrumentId}><td><strong>{bond.ticker}</strong><span>{bond.name}</span></td><td>{bond.quantity} шт.</td><td><strong>{money(bond.investedKopecks)}</strong></td><td>{percent(bond.pricePercent)}</td><td>{date(bond.nextCouponDate)}</td><td>{bond.nextCouponKopecks === null ? '—' : money(bond.nextCouponKopecks)}</td><td>{date(bond.offerDate)}</td><td>{date(bond.maturityDate)}</td><td>{bond.creditRating ?? '—'}</td><td>{percent(bond.currentYieldPercent)}</td><td>{percent(bond.yieldToMaturityPercent)}</td></tr>)}</tbody></table></div> : <p className="portfolio-empty">{isBackendLoading ? 'Загружаем параметры облигаций…' : 'В выбранном портфеле пока нет облигаций.'}</p>}</div>}
        {overviewTab === 'assets' && <div className="positions overview-positions"><h3>Мои активы</h3>{analytics?.positions.length ? analytics.positions.map((position) => <div className="position-row" key={position.instrumentId}><div><strong>{position.ticker}</strong><span>{position.name} · {position.quantity} шт.</span></div><div><strong>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</strong><span>{position.allocationPercent ?? 0}% портфеля</span></div></div>) : <p className="portfolio-empty">Добавьте операции, чтобы увидеть структуру портфеля.</p>}</div>}
      </section>}
      {activePage === 'portfolios' && <section className="portfolio-area" id="portfolio"><div className="portfolio-summary"><p className="section-label">ОБЩИЙ ПРОФИЛЬ</p><strong>{portfolios.length}</strong><span>{portfolios.length === 1 ? 'портфель' : portfolios.length > 1 && portfolios.length < 5 ? 'портфеля' : 'портфелей'}</span><p>Операции объединяются в общий инвестиционный профиль.</p></div><div className="portfolio-manager"><div><p className="section-label">ПОРТФЕЛИ</p><h2>Мои стратегии</h2></div><form onSubmit={savePortfolio}><label htmlFor="portfolio-name">Название портфеля</label><input id="portfolio-name" value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} placeholder="Например, Долгосрочный" maxLength={100} /><button>{editingPortfolioId ? 'Сохранить' : 'Создать'}</button>{editingPortfolioId && <button className="cancel-button" type="button" onClick={() => { setEditingPortfolioId(null); setPortfolioName(''); }}>Отмена</button>}</form>{portfolioMessage && <p className="portfolio-message" role="status">{portfolioMessage}</p>}<div className="portfolio-list">{portfolios.map((portfolio) => <div className="portfolio-row" key={portfolio.id}><span className="portfolio-dot" /><strong>{portfolio.name}</strong><button className="text-button" type="button" onClick={() => { setEditingPortfolioId(portfolio.id); setPortfolioName(portfolio.name); }}>Изменить</button><button className="text-button danger" type="button" onClick={() => void removePortfolio(portfolio.id)}>Удалить</button></div>)}{portfolios.length === 0 && <p className="portfolio-empty">Создайте первый портфель — например, «Долгосрочный» или «ИИС».</p>}</div></div></section>}
      {activePage === 'operations' && <section className="activity" id="activity"><div className="activity-header"><div><p className="section-label">ПОРТФЕЛЬНЫЙ УЧЁТ</p><h2>Операции и позиции</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div>
        <div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div>
        <section className="broker-import" aria-labelledby="broker-import-title">
          <div className="broker-import-heading"><div><p className="section-label">ИМПОРТ ИЗ БРОКЕРА</p><h3 id="broker-import-title">Загрузить отчёт Т‑Банка</h3><p>Поддерживаются PDF и Excel (.xlsx). Отметьте нужные операции и выберите портфель — данные появятся в нём только после подтверждения.</p></div><span className="broker-badge">{brokerPreview?.format ?? 'PDF / XLSX'}</span></div>
          <div className="broker-upload"><label className="file-picker" htmlFor="broker-report">Выбрать файл<input id="broker-report" type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" onChange={chooseBrokerReport} /></label><span>{brokerReportName || 'Файл не выбран'}</span><button type="button" onClick={() => void previewBrokerReport()} disabled={!brokerFileBase64 || isBrokerImporting}>{isBrokerImporting ? 'Обработка…' : 'Показать операции'}</button></div>
          {brokerImportMessage && <p className="broker-message" role="status">{brokerImportMessage}</p>}
          {brokerPreview && <div className="broker-preview">
            <div className="broker-summary"><span><b>{brokerPreview.summary.trades}</b> сделок</span><span><b>{brokerPreview.summary.deposits}</b> пополнения</span>{brokerPreview.summary.withdrawals > 0 && <span><b>{brokerPreview.summary.withdrawals}</b> вывода</span>}<span>в отчёте комиссий {money(brokerPreview.summary.commissionsKopecks)}</span></div>
            <div className="broker-selection-bar"><div><label className="field-label" htmlFor="broker-portfolio">Портфель для импорта</label><select id="broker-portfolio" value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)}><option value="">Выберите портфель</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div><p>Выбрано <b>{selectedBrokerOperations.length}</b> из {brokerPreview.operations.length} · комиссии выбранных: <b>{money(selectedBrokerCommissionKopecks)}</b></p></div>
            <p className="broker-period">{brokerPreview.broker}{brokerPreview.period ? ` · ${brokerPreview.period}` : ''}</p>
            <div className="broker-preview-table"><table><thead><tr><th><input type="checkbox" checked={selectedBrokerOperations.length === brokerPreview.operations.length} onChange={toggleAllBrokerOperations} aria-label="Выбрать все операции" /></th><th>Дата</th><th>Операция</th><th>Инструмент</th><th>Сумма</th><th>Комиссия</th></tr></thead><tbody>{brokerPreview.operations.map((operation) => <tr key={operation.sourceId} className={selectedBrokerOperationIds.has(operation.sourceId) ? 'selected' : ''}><td><input type="checkbox" checked={selectedBrokerOperationIds.has(operation.sourceId)} onChange={() => toggleBrokerOperation(operation.sourceId)} aria-label={`Выбрать ${operation.description}`} /></td><td>{new Date(operation.operationDate).toLocaleDateString('ru-RU')}</td><td>{operation.description}</td><td>{operation.ticker ? `${operation.ticker} · ${operation.quantity} шт.` : 'Денежная операция'}</td><td>{money(importAmount(operation))}{operation.accruedInterestKopecks > 0 && <small>НКД {money(operation.accruedInterestKopecks)}</small>}</td><td>{operation.commissionKopecks ? money(operation.commissionKopecks) : '—'}</td></tr>)}</tbody></table></div>
            {brokerPreview.warnings.length > 0 && <ul className="broker-warnings">{brokerPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <div className="broker-confirm"><span>{selectedPortfolioId ? `${selectedBrokerOperations.length} отмеч. операций будут добавлены в «${portfolios.find((portfolio) => portfolio.id === selectedPortfolioId)?.name ?? 'выбранный портфель'}».` : 'Выберите портфель для добавления отмеченных операций.'}</span><button type="button" onClick={() => void commitBrokerImport()} disabled={!selectedPortfolioId || !selectedBrokerOperations.length || isBrokerImporting}>{isBrokerImporting ? 'Импорт…' : `Добавить ${selectedBrokerOperations.length} операций`}</button></div>
          </div>}
        </section>
        <div className="transaction-layout"><form className="transaction-form" onSubmit={addTransaction}><h3>Добавить операцию</h3><label className="field-label" htmlFor="transaction-portfolio">Портфель</label><select id="transaction-portfolio" value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} required><option value="">Выберите портфель</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select><label className="field-label" htmlFor="transaction-type">Тип операции</label><select id="transaction-type" value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="DEPOSIT">Пополнение счёта</option><option value="WITHDRAWAL">Вывод средств</option><option value="BUY">Покупка бумаги</option><option value="SELL">Продажа бумаги</option><option value="DIVIDEND">Дивиденды</option><option value="COUPON">Купон</option><option value="FEE">Комиссия брокера</option><option value="TAX">Налог</option></select>{instrumentTypes.has(transactionType) && <>{transactionInstruments.length ? <><label className="field-label" htmlFor="transaction-instrument">Инструмент</label><select id="transaction-instrument" value={transactionInstrumentId} onChange={(event) => setTransactionInstrumentId(event.target.value)} required><option value="">Выберите инструмент</option>{transactionInstruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.ticker} — {instrument.name}</option>)}</select></> : <p className="instrument-help">Сначала <a href="#catalog">добавьте инструмент из MOEX</a> в каталог.</p>}</>}<label className="field-label" htmlFor="operation-date">Дата операции</label><input id="operation-date" type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} required />{tradeTypes.has(transactionType) ? <><label className="field-label" htmlFor="transaction-quantity">Количество, шт.</label><input id="transaction-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Например, 10" required /><label className="field-label" htmlFor="transaction-price">Цена за штуку, ₽</label><input id="transaction-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Например, 280,50" required /><label className="field-label" htmlFor="transaction-commission">Комиссия брокера, ₽</label><input id="transaction-commission" inputMode="decimal" value={commission} onChange={(event) => setCommission(event.target.value)} placeholder="0" required /></> : <><label className="field-label" htmlFor="transaction-amount">Сумма, ₽</label><input id="transaction-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Например, 100 000" required /><p className="form-hint">Комиссию и налог добавляйте отдельными операциями, чтобы учёт был прозрачным.</p></>}<button disabled={!selectedPortfolioId || (instrumentTypes.has(transactionType) && !transactionInstruments.length)}>Добавить операцию</button>{!selectedPortfolioId && <p className="form-hint">Выберите портфель, чтобы сохранить операцию.</p>}{transactionMessage && <p role="status">{transactionMessage}</p>}</form>
          <div className="positions"><h3>Текущие позиции</h3>{analytics?.positions.length ? analytics.positions.map((position) => <div className="position-row" key={position.instrumentId}><div><strong>{position.ticker}</strong><span>{position.quantity} шт. · средняя {money(position.averageCostKopecks)}</span></div><div><strong>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</strong><span className={position.unrealizedPnlKopecks !== null && position.unrealizedPnlKopecks < 0 ? 'negative' : 'positive'}>{position.unrealizedPnlKopecks === null ? '—' : `${money(position.unrealizedPnlKopecks)} · ${position.allocationPercent ?? 0}%`}</span></div></div>) : <p className="portfolio-empty">Добавьте покупку — здесь появятся ваши позиции.</p>}</div></div>
        <div className="history"><h3>История операций</h3>{transactions.length ? <table><thead><tr><th>Дата</th><th>Операция</th><th>Инструмент</th><th>Сумма</th><th /></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.operationDate).toLocaleDateString('ru-RU')}</td><td>{transaction.type}</td><td>{transaction.ticker ?? 'Денежная операция'}</td><td>{transactionAmount(transaction) === null ? '—' : money(transactionAmount(transaction) ?? 0)}</td><td><button className="text-button danger" onClick={() => void removeTransaction(transaction.id)}>Удалить</button></td></tr>)}</tbody></table> : <p className="portfolio-empty">История операций пока пуста.</p>}</div>
      </section>}
      {activePage === 'instruments' && <><section className="add-panel"><div><h2>Добавить по тикеру</h2><p>Например: SBER, SU26238RMFS4 или SBMX</p></div><form onSubmit={addInstrument}><label htmlFor="ticker">Тикер</label><input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="Введите тикер" autoComplete="off" /><button disabled={isLoading}>{isLoading ? 'Загрузка…' : 'Добавить'}</button></form></section>
      <section className="catalog" id="catalog"><div className="catalog-heading"><div><p className="section-label">ПОИСК И ИМПОРТ</p><h2>Найдите инструмент</h2></div><div className="search-wrap"><span>⌕</span><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Тикер, название или номер ОФЗ" aria-label="Поиск" /></div></div>
        <p className="search-hint">Для ОФЗ достаточно номера выпуска — например, <b>26238</b>.</p>
        {message && <p className="message" role="status">{message}</p>}
        {moexResults.length > 0 && <div className="moex-results"><p className="moex-title">Результаты поиска MOEX</p>{moexResults.map((result) => <div className="moex-result" key={`${result.ticker}-${result.board ?? ''}`}><div className="ticker-mark">{result.ticker.slice(0, 2)}</div><div><strong>{result.ticker}</strong><span>{result.name}</span></div><small>{result.type}{result.board ? ` · ${result.board}` : ''}</small><button onClick={() => void importInstrument(result.ticker)} disabled={isLoading}>Добавить</button></div>)}</div>}
        <div className="saved-heading"><div><p className="section-label">МОЯ БАЗА</p><h2>Сохранённые инструменты</h2></div><div className="saved-actions"><button className="refresh-button" onClick={() => void syncInstrumentLogos(true)} disabled={isLogoSyncing}>{isLogoSyncing ? 'Ищем логотипы…' : 'Найти логотипы'}</button><button className="refresh-button" onClick={() => void loadMarketData()}>Обновить данные</button><span className="count">{instruments.length}</span></div></div>
        <div className="table-wrap"><table className="saved-instruments-table"><thead><tr><SortableInstrumentHeader label="Инструмент" sortKey="instrument" activeSort={instrumentSort} onSort={changeInstrumentSort} /><SortableInstrumentHeader label="Тип и рынок" sortKey="type" activeSort={instrumentSort} onSort={changeInstrumentSort} /><SortableInstrumentHeader label="Сектор" sortKey="sector" activeSort={instrumentSort} onSort={changeInstrumentSort} /><SortableInstrumentHeader label="Цена" sortKey="price" activeSort={instrumentSort} onSort={changeInstrumentSort} /><SortableInstrumentHeader label="P/E" sortKey="pe" activeSort={instrumentSort} onSort={changeInstrumentSort} title="Капитализация к прибыли (Price/Earnings)" /><SortableInstrumentHeader label="P/S" sortKey="ps" activeSort={instrumentSort} onSort={changeInstrumentSort} title="Капитализация к выручке (Price/Sales)" /><SortableInstrumentHeader label="Payout" sortKey="payout" activeSort={instrumentSort} onSort={changeInstrumentSort} title="Доля чистой прибыли, направленная на дивиденды" /><SortableInstrumentHeader label="Капитализация, $" sortKey="marketCap" activeSort={instrumentSort} onSort={changeInstrumentSort} /><SortableInstrumentHeader label="Параметры" sortKey="parameters" activeSort={instrumentSort} onSort={changeInstrumentSort} /></tr></thead><tbody>{sortedInstruments.map((instrument) => { const quote = marketData[instrument.ticker]; const unavailableFundamental = 'Нужен отдельный источник финансовой отчётности: MOEX ISS не публикует LTM-мультипликаторы.'; return <tr key={instrument.id}><td><button className="instrument-cell-link" type="button" onClick={() => openInstrument(instrument.ticker)} title={`Открыть карточку ${instrument.ticker}`}><div className="instrument-cell"><InstrumentIcon instrument={instrument} /><div><strong>{instrument.ticker}</strong><span>{instrument.name}</span>{instrument.isin && <small className="isin">ISIN {instrument.isin}</small>}</div></div></button></td><td>{instrument.type}<br /><span>{instrument.board ?? '—'} · {instrument.currency}</span></td><td>{quote?.sector ?? '—'}</td><td>{quote?.price !== null && quote?.price !== undefined ? <><strong>{quote.price.toLocaleString('ru-RU')} {quote.currency}</strong><span className={quote.changePercent !== null && quote.changePercent < 0 ? 'negative' : 'positive'}>{quote.changePercent === null ? '—' : `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toLocaleString('ru-RU')}%`}</span></> : <span>Нет цены</span>}</td><td title={quote?.pe === null ? unavailableFundamental : undefined}>{multiple(quote?.pe ?? null)}</td><td title={quote?.ps === null ? unavailableFundamental : undefined}>{multiple(quote?.ps ?? null)}</td><td title={quote?.payoutRatio === null ? unavailableFundamental : undefined}>{percent(quote?.payoutRatio ?? null)}</td><td>{usdCompact(quote?.marketCapUsd ?? null)}</td><td>Лот {instrument.lotSize ?? '—'} <i>·</i> Шаг {instrument.minPriceStep ?? '—'}</td></tr>; })}</tbody></table>{instruments.length === 0 && <div className="empty-state"><div>⌁</div><b>Ваш каталог пока пуст</b><p>Найдите ценную бумагу по тикеру или названию компании.</p></div>}</div>
      </section></>}
    </main>
    <footer className="logo-attribution">Логотипы инструментов: <a href="https://www.allinvestview.com/tools/ticker-logos/">Ticker Logos by AllInvestView</a></footer>
  </div>;
}

export default App;
