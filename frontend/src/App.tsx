import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

type Instrument = { id: number; ticker: string; name: string; isin: string | null; type: string; board: string | null; currency: string; lotSize: number | null; minPriceStep: number | null };
type MarketData = { ticker: string; price: number | null; changePercent: number | null; currency: string; updatedAt: string | null; payoutsKopecks: number };
type MoexSearchResult = { ticker: string; name: string; type: string; board: string | null };
type Portfolio = { id: number; name: string; createdAt: string };
type Transaction = { id: number; type: string; quantity: number | null; priceKopecks: number | null; amountKopecks: number | null; commissionKopecks: number; operationDate: string; ticker: string | null; name: string | null };
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
  const [activePage, setActivePage] = useState<Page>(getPageFromHash);

  const loadInstruments = useCallback(async (search = '') => {
    try {
      const response = await fetch(`${apiUrl}/instruments?q=${encodeURIComponent(search)}`);
      if (!response.ok) throw new Error();
      setInstruments(await response.json());
    } catch { setMessage('Не удалось подключиться к backend. Запустите сервер на порту 3000.'); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInstruments(query), 200);
    return () => window.clearTimeout(timeout);
  }, [loadInstruments, query]);

  const loadMarketData = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/instruments/market-data`);
      if (!response.ok) throw new Error();
      const items = await response.json() as MarketData[];
      setMarketData(Object.fromEntries(items.map((item) => [item.ticker, item])));
    } catch { setMessage('Не удалось обновить рыночные данные.'); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadMarketData(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadMarketData]);

  const loadTransactionInstruments = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/instruments`);
      if (!response.ok) throw new Error();
      setTransactionInstruments(await response.json());
    } catch { setTransactionMessage('Не удалось загрузить инструменты для операции.'); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTransactionInstruments(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadTransactionInstruments]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (query.trim().length < 2) { setMoexResults([]); return; }
      fetch(`${apiUrl}/instruments/search?q=${encodeURIComponent(query)}`)
        .then((response) => response.ok ? response.json() : [])
        .then(setMoexResults)
        .catch(() => setMoexResults([]));
    }, query.trim().length < 2 ? 0 : 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const loadPortfolios = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/portfolios`);
      if (!response.ok) throw new Error();
      const items = await response.json() as Portfolio[];
      setPortfolios(items);
      if (items.length === 1) {
        setSelectedPortfolioId((current) => current ?? items[0].id);
      }
    } catch { setPortfolioMessage('Не удалось загрузить портфели.'); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPortfolios(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPortfolios]);

  const loadActivity = useCallback(async (portfolioId: number | null) => {
    try {
      const scope = portfolioId ? `/portfolios/${portfolioId}/analytics` : '/analytics';
      const transactionUrl = portfolioId ? `/transactions?portfolioId=${portfolioId}` : '/transactions';
      const [analyticsResponse, transactionsResponse] = await Promise.all([fetch(`${apiUrl}${scope}`), fetch(`${apiUrl}${transactionUrl}`)]);
      if (!analyticsResponse.ok || !transactionsResponse.ok) throw new Error();
      setAnalytics(await analyticsResponse.json());
      setTransactions(await transactionsResponse.json());
    } catch { setTransactionMessage('Не удалось загрузить операции и аналитику.'); }
  }, []);

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
      const response = await fetch(`${apiUrl}/instruments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: value }) });
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
      const response = await fetch(editingPortfolioId ? `${apiUrl}/portfolios/${editingPortfolioId}` : `${apiUrl}/portfolios`, {
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
      const response = await fetch(`${apiUrl}/portfolios/${id}`, { method: 'DELETE' });
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
      const response = await fetch(`${apiUrl}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
      const response = await fetch(`${apiUrl}/transactions/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      await loadActivity(selectedPortfolioId);
    } catch { setTransactionMessage('Не удалось удалить операцию.'); }
  }

  return <div className="app-shell">
    <nav className="top-navigation" aria-label="Основная навигация"><a className="top-brand" href="#overview" onClick={() => setActivePage('overview')}><span>●</span> Капитал</a><div className="nav-links">{(Object.keys(pageTitles) as Page[]).map((page) => <a key={page} className={activePage === page ? 'active' : ''} href={`#${page}`} onClick={() => setActivePage(page)}>{pageTitles[page]}{page === 'portfolios' && <small>{portfolios.length}</small>}</a>)}</div><div className="profile">АБ</div></nav>
    <main className="app" id="top">
      <div className="topbar"><span className="crumb">Инвестиции <b>/</b> {pageTitles[activePage]}</span></div>
      <header className="page-intro"><p className="eyebrow">{activePage === 'overview' ? 'ОБЩИЙ ПРОФИЛЬ' : activePage === 'portfolios' ? 'УПРАВЛЕНИЕ СТРАТЕГИЯМИ' : activePage === 'operations' ? 'УЧЁТ И АНАЛИТИКА' : 'КАТАЛОГ РЫНКА'}</p><h1>{activePage === 'overview' ? 'Обзор портфеля' : activePage === 'portfolios' ? 'Мои портфели' : activePage === 'operations' ? 'Операции' : 'Инструменты'}</h1><p className="intro">{activePage === 'overview' ? 'Главные показатели по всем вашим инвестициям в одном месте.' : activePage === 'portfolios' ? 'Создавайте отдельные стратегии и управляйте ими независимо.' : activePage === 'operations' ? 'Добавляйте сделки, пополнения и выплаты — показатели пересчитаются автоматически.' : 'Находите бумаги Московской биржи и собирайте базу для своего портфеля.'}</p></header>
      {activePage === 'overview' && <section className="overview-panel"><div className="activity-header"><div><p className="section-label">СВОДКА</p><h2>Состояние портфеля</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div><div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div><div className="positions overview-positions"><h3>Позиции в портфеле</h3>{analytics?.positions.length ? analytics.positions.map((position) => <div className="position-row" key={position.instrumentId}><div><strong>{position.ticker}</strong><span>{position.name} · {position.quantity} шт.</span></div><div><strong>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</strong><span>{position.allocationPercent ?? 0}% портфеля</span></div></div>) : <p className="portfolio-empty">Добавьте операции, чтобы увидеть структуру портфеля.</p>}</div></section>}
      {activePage === 'portfolios' && <section className="portfolio-area" id="portfolio"><div className="portfolio-summary"><p className="section-label">ОБЩИЙ ПРОФИЛЬ</p><strong>{portfolios.length}</strong><span>{portfolios.length === 1 ? 'портфель' : portfolios.length > 1 && portfolios.length < 5 ? 'портфеля' : 'портфелей'}</span><p>Операции объединяются в общий инвестиционный профиль.</p></div><div className="portfolio-manager"><div><p className="section-label">ПОРТФЕЛИ</p><h2>Мои стратегии</h2></div><form onSubmit={savePortfolio}><label htmlFor="portfolio-name">Название портфеля</label><input id="portfolio-name" value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} placeholder="Например, Долгосрочный" maxLength={100} /><button>{editingPortfolioId ? 'Сохранить' : 'Создать'}</button>{editingPortfolioId && <button className="cancel-button" type="button" onClick={() => { setEditingPortfolioId(null); setPortfolioName(''); }}>Отмена</button>}</form>{portfolioMessage && <p className="portfolio-message" role="status">{portfolioMessage}</p>}<div className="portfolio-list">{portfolios.map((portfolio) => <div className="portfolio-row" key={portfolio.id}><span className="portfolio-dot" /><strong>{portfolio.name}</strong><button className="text-button" type="button" onClick={() => { setEditingPortfolioId(portfolio.id); setPortfolioName(portfolio.name); }}>Изменить</button><button className="text-button danger" type="button" onClick={() => void removePortfolio(portfolio.id)}>Удалить</button></div>)}{portfolios.length === 0 && <p className="portfolio-empty">Создайте первый портфель — например, «Долгосрочный» или «ИИС».</p>}</div></div></section>}
      {activePage === 'operations' && <section className="activity" id="activity"><div className="activity-header"><div><p className="section-label">ПОРТФЕЛЬНЫЙ УЧЁТ</p><h2>Операции и позиции</h2></div><select value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} aria-label="Выберите портфель"><option value="">Все портфели</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div>
        <div className="metric-grid"><div><span>Стоимость</span><strong>{analytics ? money(analytics.totalValueKopecks) : '—'}</strong></div><div><span>Вложено</span><strong>{analytics ? money(analytics.netContributionsKopecks) : '—'}</strong></div><div><span>Результат</span><strong className={analytics && analytics.totalPnlKopecks < 0 ? 'negative' : 'positive'}>{analytics ? money(analytics.totalPnlKopecks) : '—'}</strong></div><div><span>Свободные деньги</span><strong>{analytics ? money(analytics.cashKopecks) : '—'}</strong></div></div>
        <div className="transaction-layout"><form className="transaction-form" onSubmit={addTransaction}><h3>Добавить операцию</h3><label className="field-label" htmlFor="transaction-portfolio">Портфель</label><select id="transaction-portfolio" value={selectedPortfolioId ?? ''} onChange={(event) => setSelectedPortfolioId(event.target.value ? Number(event.target.value) : null)} required><option value="">Выберите портфель</option>{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select><label className="field-label" htmlFor="transaction-type">Тип операции</label><select id="transaction-type" value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="DEPOSIT">Пополнение счёта</option><option value="WITHDRAWAL">Вывод средств</option><option value="BUY">Покупка бумаги</option><option value="SELL">Продажа бумаги</option><option value="DIVIDEND">Дивиденды</option><option value="COUPON">Купон</option><option value="FEE">Комиссия брокера</option><option value="TAX">Налог</option></select>{instrumentTypes.has(transactionType) && <>{transactionInstruments.length ? <><label className="field-label" htmlFor="transaction-instrument">Инструмент</label><select id="transaction-instrument" value={transactionInstrumentId} onChange={(event) => setTransactionInstrumentId(event.target.value)} required><option value="">Выберите инструмент</option>{transactionInstruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.ticker} — {instrument.name}</option>)}</select></> : <p className="instrument-help">Сначала <a href="#catalog">добавьте инструмент из MOEX</a> в каталог.</p>}</>}<label className="field-label" htmlFor="operation-date">Дата операции</label><input id="operation-date" type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} required />{tradeTypes.has(transactionType) ? <><label className="field-label" htmlFor="transaction-quantity">Количество, шт.</label><input id="transaction-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Например, 10" required /><label className="field-label" htmlFor="transaction-price">Цена за штуку, ₽</label><input id="transaction-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Например, 280,50" required /><label className="field-label" htmlFor="transaction-commission">Комиссия брокера, ₽</label><input id="transaction-commission" inputMode="decimal" value={commission} onChange={(event) => setCommission(event.target.value)} placeholder="0" required /></> : <><label className="field-label" htmlFor="transaction-amount">Сумма, ₽</label><input id="transaction-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Например, 100 000" required /><p className="form-hint">Комиссию и налог добавляйте отдельными операциями, чтобы учёт был прозрачным.</p></>}<button disabled={!selectedPortfolioId || (instrumentTypes.has(transactionType) && !transactionInstruments.length)}>Добавить операцию</button>{!selectedPortfolioId && <p className="form-hint">Выберите портфель, чтобы сохранить операцию.</p>}{transactionMessage && <p role="status">{transactionMessage}</p>}</form>
          <div className="positions"><h3>Текущие позиции</h3>{analytics?.positions.length ? analytics.positions.map((position) => <div className="position-row" key={position.instrumentId}><div><strong>{position.ticker}</strong><span>{position.quantity} шт. · средняя {money(position.averageCostKopecks)}</span></div><div><strong>{position.marketValueKopecks === null ? 'Нет цены' : money(position.marketValueKopecks)}</strong><span className={position.unrealizedPnlKopecks !== null && position.unrealizedPnlKopecks < 0 ? 'negative' : 'positive'}>{position.unrealizedPnlKopecks === null ? '—' : `${money(position.unrealizedPnlKopecks)} · ${position.allocationPercent ?? 0}%`}</span></div></div>) : <p className="portfolio-empty">Добавьте покупку — здесь появятся ваши позиции.</p>}</div></div>
        <div className="history"><h3>История операций</h3>{transactions.length ? <table><thead><tr><th>Дата</th><th>Операция</th><th>Инструмент</th><th>Сумма</th><th /></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.operationDate).toLocaleDateString('ru-RU')}</td><td>{transaction.type}</td><td>{transaction.ticker ?? 'Денежная операция'}</td><td>{transaction.priceKopecks && transaction.quantity ? money(transaction.priceKopecks * transaction.quantity) : transaction.amountKopecks ? money(transaction.amountKopecks) : '—'}</td><td><button className="text-button danger" onClick={() => void removeTransaction(transaction.id)}>Удалить</button></td></tr>)}</tbody></table> : <p className="portfolio-empty">История операций пока пуста.</p>}</div>
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
