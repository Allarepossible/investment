import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import './App.css';

type Instrument = { id: number; ticker: string; name: string; isin: string | null; type: string; board: string | null; currency: string; lotSize: number | null; minPriceStep: number | null };
type MarketData = { ticker: string; price: number | null; changePercent: number | null; currency: string; updatedAt: string | null; payoutsKopecks: number };
type MoexSearchResult = { ticker: string; name: string; type: string; board: string | null };
type Portfolio = { id: number; name: string; createdAt: string };
type Transaction = { id: number; type: string; quantity: number | null; priceKopecks: number | null; amountKopecks: number | null; accruedInterestKopecks: number; commissionKopecks: number; operationDate: string; ticker: string | null; name: string | null };
type BrokerImportOperation = { type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL'; ticker: string | null; quantity: number | null; priceKopecks: number | null; amountKopecks: number | null; accruedInterestKopecks: number; commissionKopecks: number; operationDate: string; sourceId: string; description: string };
type BrokerImportPreview = { broker: 'Т-Банк'; period: string | null; operations: BrokerImportOperation[]; warnings: string[]; summary: { trades: number; deposits: number; withdrawals: number; commissionsKopecks: number } };
type Analytics = { cashKopecks: number; securitiesValueKopecks: number; totalValueKopecks: number; netContributionsKopecks: number; totalPnlKopecks: number; positions: Array<{ instrumentId: number; ticker: string; name: string; quantity: number; averageCostKopecks: number; marketValueKopecks: number | null; unrealizedPnlKopecks: number | null; allocationPercent: number | null }> };
type Page = 'overview' | 'portfolios' | 'operations' | 'instruments';
const apiUrl = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api`;

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
const toKopecks = (value: string) => Math.round(Number(value.replace(/\s/g, '').replace(',', '.')) * 100);
const tradeTypes = new Set(['BUY', 'SELL']);
const instrumentTypes = new Set(['BUY', 'SELL', 'DIVIDEND', 'COUPON']);
const pageTitles: Record<Page, string> = { overview: 'Обзор', portfolios: 'Портфели', operations: 'Операции', instruments: 'Инструменты' };

function getPageFromHash(): Page {
  const page = window.location.hash.replace('#', '');
  return page in pageTitles ? page as Page : 'overview';
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
  const [transactionType, setTransactionType] = useState('DEPOSIT');
  const [transactionInstrumentId, setTransactionInstrumentId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [commission, setCommission] = useState('0');
  const [operationDate, setOperationDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactionMessage, setTransactionMessage] = useState('');
  const [brokerPdfBase64, setBrokerPdfBase64] = useState('');
  const [brokerReportName, setBrokerReportName] = useState('');
  const [brokerPreview, setBrokerPreview] = useState<BrokerImportPreview | null>(null);
  const [selectedBrokerOperationIds, setSelectedBrokerOperationIds] = useState<Set<string>>(new Set());
  const [brokerImportMessage, setBrokerImportMessage] = useState('');
  const [isBrokerImporting, setIsBrokerImporting] = useState(false);
  const [activePage, setActivePage] = useState<Page>(getPageFromHash);
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  const pendingBackendRequests = useRef(0);

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

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTransactionInstruments(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadTransactionInstruments]);

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

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadActivity(selectedPortfolioId), 0);
    return () => window.clearTimeout(timeout);
  }, [loadActivity, selectedPortfolioId]);

  useEffect(() => {
    const handleHashChange = () => setActivePage(getPageFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
    if (!file) { setBrokerPdfBase64(''); setBrokerReportName(''); return; }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setBrokerPdfBase64(''); setBrokerReportName(''); setBrokerImportMessage('Выберите PDF-файл брокерского отчёта.'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setBrokerPdfBase64(''); setBrokerReportName(''); setBrokerImportMessage('Отчёт больше 8 МБ — выберите файл меньшего размера.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (!base64) { setBrokerImportMessage('Не удалось прочитать выбранный файл.'); return; }
      setBrokerPdfBase64(base64); setBrokerReportName(file.name);
      setBrokerImportMessage('Файл готов к предпросмотру. Операции ещё не добавлены.');
    };
    reader.onerror = () => setBrokerImportMessage('Не удалось прочитать выбранный файл.');
    reader.readAsDataURL(file);
  }

  async function previewBrokerReport() {
    if (!brokerPdfBase64) { setBrokerImportMessage('Сначала выберите PDF-отчёт.'); return; }
    setIsBrokerImporting(true); setBrokerImportMessage('');
    try {
      const response = await apiFetch('/imports/tbank/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdfBase64: brokerPdfBase64 }) });
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
    if (!brokerPdfBase64 || !brokerPreview) { setBrokerImportMessage('Сначала сформируйте предпросмотр отчёта.'); return; }
    const sourceIds = [...selectedBrokerOperationIds];
    if (!sourceIds.length) { setBrokerImportMessage('Отметьте хотя бы одну операцию для импорта.'); return; }
    setIsBrokerImporting(true); setBrokerImportMessage('');
    try {
      const response = await apiFetch('/imports/tbank/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolioId: selectedPortfolioId, pdfBase64: brokerPdfBase64, sourceIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Не удалось импортировать операции');
      setBrokerImportMessage(`Добавлено операций: ${data.imported}. Комиссии и НКД уже учтены.`);
      setBrokerPreview(null); setSelectedBrokerOperationIds(new Set()); setBrokerPdfBase64(''); setBrokerReportName('');
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

  return <div className="app-shell">
    <nav className="top-navigation" aria-label="Основная навигация"><a className="top-brand" href="#overview" onClick={() => setActivePage('overview')}><span>●</span> Капитал</a><div className="nav-links">{(Object.keys(pageTitles) as Page[]).map((page) => <a key={page} className={activePage === page ? 'active' : ''} href={`#${page}`} onClick={() => setActivePage(page)}>{pageTitles[page]}{page === 'portfolios' && <small>{portfolios.length}</small>}</a>)}</div><div className="profile">АБ</div></nav>
    <main className="app" id="top">
      <div className="topbar"><span className="crumb">Инвестиции <b>/</b> {pageTitles[activePage]}</span>{isBackendLoading && <span className="backend-loading" role="status" aria-live="polite"><i />Загружаем данные…</span>}</div>
      <header className="page-intro"><p className="eyebrow">{activePage === 'overview' ? 'ОБЩИЙ ПРОФИЛЬ' : activePage === 'portfolios' ? 'УПРАВЛЕНИЕ СТРАТЕГИЯМИ' : activePage === 'operations' ? 'УЧЁТ И АНАЛИТИКА' : 'КАТАЛОГ РЫНКА'}</p><h1>{activePage === 'overview' ? 'Обзор портфеля' : activePage === 'portfolios' ? 'Мои портфели' : activePage === 'operations' ? 'Операции' : 'Инструменты'}</h1><p className="intro">{activePage === 'overview' ? 'Главные показатели по всем вашим инвестициям в одном месте.' : activePage === 'portfolios' ? 'Создавайте отдельные стратегии и управляйте ими независимо.' : activePage === 'operations' ? 'Добавляйте сделки, пополнения и выплаты — показатели пересчитаются автоматически.' : 'Находите бумаги Московской биржи и собирайте базу для своего портфеля.'}</p></header>
      {activePage === 'overview' && <section className="overview-panel"><div className="activity-header"><div><p className="section-label">СВОДКА</p><h2>Состояние портфеля</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div><div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div><div className="positions overview-positions"><h3>Позиции в портфеле</h3>{analytics?.positions.length ? analytics.positions.map((position) => <div className="position-row" key={position.instrumentId}><div><strong>{position.ticker}</strong><span>{position.name} · {position.quantity} шт.</span></div><div><strong>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</strong><span>{position.allocationPercent ?? 0}% портфеля</span></div></div>) : <p className="portfolio-empty">Добавьте операции, чтобы увидеть структуру портфеля.</p>}</div></section>}
      {activePage === 'portfolios' && <section className="portfolio-area" id="portfolio"><div className="portfolio-summary"><p className="section-label">ОБЩИЙ ПРОФИЛЬ</p><strong>{portfolios.length}</strong><span>{portfolios.length === 1 ? 'портфель' : portfolios.length > 1 && portfolios.length < 5 ? 'портфеля' : 'портфелей'}</span><p>Операции объединяются в общий инвестиционный профиль.</p></div><div className="portfolio-manager"><div><p className="section-label">ПОРТФЕЛИ</p><h2>Мои стратегии</h2></div><form onSubmit={savePortfolio}><label htmlFor="portfolio-name">Название портфеля</label><input id="portfolio-name" value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} placeholder="Например, Долгосрочный" maxLength={100} /><button>{editingPortfolioId ? 'Сохранить' : 'Создать'}</button>{editingPortfolioId && <button className="cancel-button" type="button" onClick={() => { setEditingPortfolioId(null); setPortfolioName(''); }}>Отмена</button>}</form>{portfolioMessage && <p className="portfolio-message" role="status">{portfolioMessage}</p>}<div className="portfolio-list">{portfolios.map((portfolio) => <div className="portfolio-row" key={portfolio.id}><span className="portfolio-dot" /><strong>{portfolio.name}</strong><button className="text-button" type="button" onClick={() => { setEditingPortfolioId(portfolio.id); setPortfolioName(portfolio.name); }}>Изменить</button><button className="text-button danger" type="button" onClick={() => void removePortfolio(portfolio.id)}>Удалить</button></div>)}{portfolios.length === 0 && <p className="portfolio-empty">Создайте первый портфель — например, «Долгосрочный» или «ИИС».</p>}</div></div></section>}
      {activePage === 'operations' && <section className="activity" id="activity"><div className="activity-header"><div><p className="section-label">ПОРТФЕЛЬНЫЙ УЧЁТ</p><h2>Операции и позиции</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div>
        <div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div>
        <section className="broker-import" aria-labelledby="broker-import-title">
          <div className="broker-import-heading"><div><p className="section-label">ИМПОРТ ИЗ БРОКЕРА</p><h3 id="broker-import-title">Загрузить отчёт Т‑Банка</h3><p>Отметьте нужные операции и выберите портфель — данные появятся в нём только после подтверждения.</p></div><span className="broker-badge">PDF</span></div>
          <div className="broker-upload"><label className="file-picker" htmlFor="broker-report">Выбрать PDF<input id="broker-report" type="file" accept="application/pdf,.pdf" onChange={chooseBrokerReport} /></label><span>{brokerReportName || 'Файл не выбран'}</span><button type="button" onClick={() => void previewBrokerReport()} disabled={!brokerPdfBase64 || isBrokerImporting}>{isBrokerImporting ? 'Обработка…' : 'Показать операции'}</button></div>
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
        <div className="saved-heading"><div><p className="section-label">МОЯ БАЗА</p><h2>Сохранённые инструменты</h2></div><div className="saved-actions"><button className="refresh-button" onClick={() => void loadMarketData()}>Обновить данные</button><span className="count">{instruments.length}</span></div></div>
        <div className="table-wrap"><table><thead><tr><th>Инструмент</th><th>Тип и рынок</th><th>Цена</th><th>Выплаты</th><th>Параметры</th></tr></thead><tbody>{instruments.map((instrument) => { const quote = marketData[instrument.ticker]; return <tr key={instrument.id}><td><strong>{instrument.ticker}</strong><span>{instrument.name}</span>{instrument.isin && <small className="isin">ISIN {instrument.isin}</small>}</td><td>{instrument.type}<br /><span>{instrument.board ?? '—'} · {instrument.currency}</span></td><td>{quote?.price !== null && quote?.price !== undefined ? <><strong>{quote.price.toLocaleString('ru-RU')} {quote.currency}</strong><span className={quote.changePercent !== null && quote.changePercent < 0 ? 'negative' : 'positive'}>{quote.changePercent === null ? '—' : `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toLocaleString('ru-RU')}%`}</span></> : <span>Нет цены</span>}</td><td>{quote?.payoutsKopecks ? <><strong>{money(quote.payoutsKopecks)}</strong><span>дивиденды/купоны учтены</span></> : <span>Нет учтённых выплат</span>}</td><td>Лот {instrument.lotSize ?? '—'} <i>·</i> Шаг {instrument.minPriceStep ?? '—'}</td></tr>; })}</tbody></table>{instruments.length === 0 && <div className="empty-state"><div>⌁</div><b>Ваш каталог пока пуст</b><p>Найдите ценную бумагу по тикеру или названию компании.</p></div>}</div>
      </section></>}
    </main>
  </div>;
}

export default App;
