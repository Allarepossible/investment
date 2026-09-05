import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

type Instrument = { id: number; ticker: string; name: string; type: string; board: string | null; currency: string; lotSize: number | null; minPriceStep: number | null };
type Price = { ticker: string; price: number | null; currency: string };
type MoexSearchResult = { ticker: string; name: string; type: string; board: string | null };
const apiUrl = 'http://localhost:3000/api';

function App() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [query, setQuery] = useState('');
  const [ticker, setTicker] = useState('');
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const [moexResults, setMoexResults] = useState<MoexSearchResult[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось добавить инструмент'); }
    finally { setIsLoading(false); }
  }

  async function loadPrice(instrument: Instrument) {
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/instruments/${instrument.ticker}/price`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Цена недоступна');
      setPrices((current) => ({ ...current, [instrument.ticker]: data }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Цена недоступна'); }
  }

  return <main className="app">
    <header><p className="eyebrow">INVESTMENT PORTFOLIO</p><h1>Каталог инструментов</h1><p className="intro">Добавляйте акции, облигации и фонды с Московской биржи. Параметры инструмента сохраняются локально.</p></header>
    <section className="panel add-panel"><div><h2>Добавить по тикеру</h2><p>Например: SBER, SU26238RMFS4 или SBMX</p></div><form onSubmit={addInstrument}><label htmlFor="ticker">Тикер</label><input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="SBER" autoComplete="off" /><button disabled={isLoading}>{isLoading ? 'Загрузка…' : 'Добавить'}</button></form></section>
    <section className="panel"><div className="catalog-heading"><div><h2>Поиск инструментов</h2><p>Поиск идёт по сохранённому каталогу и MOEX</p></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Введите тикер или название" aria-label="Поиск" /></div>
      {message && <p className="message" role="status">{message}</p>}
      {moexResults.length > 0 && <div className="moex-results"><p className="moex-title">Найдено на MOEX</p>{moexResults.map((result) => <div className="moex-result" key={`${result.ticker}-${result.board ?? ''}`}><div><strong>{result.ticker}</strong><span>{result.name}</span></div><small>{result.type}{result.board ? ` · ${result.board}` : ''}</small><button onClick={() => void importInstrument(result.ticker)} disabled={isLoading}>Добавить</button></div>)}</div>}
      <h2 className="saved-title">Сохранённые инструменты</h2>
      <div className="table-wrap"><table><thead><tr><th>Инструмент</th><th>Тип</th><th>Торги</th><th>Параметры</th><th>Цена</th></tr></thead><tbody>{instruments.map((instrument) => { const price = prices[instrument.ticker]; return <tr key={instrument.id}><td><strong>{instrument.ticker}</strong><span>{instrument.name}</span></td><td>{instrument.type}</td><td>{instrument.board ?? '—'} · {instrument.currency}</td><td>Лот: {instrument.lotSize ?? '—'}<br />Шаг: {instrument.minPriceStep ?? '—'}</td><td><button className="price-button" onClick={() => void loadPrice(instrument)}>{price?.price != null ? `${price.price.toLocaleString('ru-RU')} ${price.currency}` : 'Обновить'}</button></td></tr>; })}</tbody></table></div>
    </section>
  </main>;
}

export default App;
