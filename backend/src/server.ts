import express from 'express';
import cors from 'cors';
import path from 'node:path';
import {
    AuthenticationError,
    AuthValidationError,
    authenticateUser,
    createSession,
    deleteSession,
    getSessionUser,
    hasRegisteredUsers,
    registerUser,
} from './auth/auth.service';
import {
    addInstrument,
    getInstrument,
    getInstrumentPrice,
    getInstrumentsMarketData,
    deleteInstruments,
    InstrumentInUseError,
    InstrumentNotFoundError,
    InstrumentValidationError,
    searchInstruments,
    searchMoexInstruments,
    syncInstrumentLogos,
} from './instruments/instrument.service';
import {
    getInstrumentDetails,
    getInstrumentGrowth,
    getInstrumentPriceHistory,
    historyRanges,
    type HistoryRange,
} from './instruments/instrument-details.service';
import { applyMigrations } from './db';
import { getBondAnalytics, getPortfolioAnalytics } from './analytics/analytics.service';
import { getPortfolioComparison } from './analytics/portfolio-comparison.service';
import { getPortfolioIncomeForecast, invalidatePortfolioIncomeForecast } from './analytics/income-forecast.service';
import { getPortfolioPerformance, invalidatePortfolioPerformance } from './analytics/portfolio-performance.service';
import {
    createPortfolio,
    deletePortfolio,
    getAggregatePortfolio,
    listPortfolios,
    PortfolioNotFoundError,
    updatePortfolio,
} from './portfolios/portfolio.service';
import {
    createTransaction,
    deleteTransaction,
    deleteTransactions,
    listTransactions,
    parseTransactionInput,
    TransactionNotFoundError,
    TransactionValidationError,
} from './transactions/transaction.service';
import {
    BrokerReportImportError,
    importSberBrokerXlsxReport,
    importTbankBrokerReport,
    importTbankBrokerXlsxReport,
    previewSberBrokerXlsxReport,
    previewTbankBrokerReport,
    previewTbankBrokerXlsxReport,
} from './imports/tbank-report.service';

const app = express();

const PORT = Number(process.env.PORT ?? 3000);
const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);


app.use(cors({ origin: corsOrigins?.length ? corsOrigins : true, credentials: true }));
// An 8 MB PDF or Excel report becomes roughly 10.7 MB after Base64 encoding in JSON.
app.use(express.json({ limit: '12mb' }));
app.use('/api/logos', express.static(path.resolve(process.cwd(), 'data', 'logos'), {
    // The file name is stable per ticker, so do not let a browser keep an outdated rebrand forever.
    maxAge: 0,
}));

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
    });
});

const sessionCookieName = 'capital_session';
const sessionCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1_000,
};

function getCookie(req: express.Request, name: string) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return undefined;
    const prefix = `${name}=`;
    const item = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

function sessionUserId(res: express.Response) {
    const user = res.locals.user as { id: number } | undefined;
    if (!user) throw new AuthenticationError('Требуется вход в аккаунт.');
    return user.id;
}

app.get('/api/auth/session', async (req, res, next) => {
    try {
        const user = await getSessionUser(getCookie(req, sessionCookieName));
        res.json({ authenticated: Boolean(user), needsRegistration: !(await hasRegisteredUsers()), user });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/register', async (req, res, next) => {
    try {
        const user = await registerUser({ email: req.body?.email, password: req.body?.password });
        const session = await createSession(user.id);
        res.cookie(sessionCookieName, session.token, sessionCookieOptions);
        res.status(201).json({ authenticated: true, user });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const user = await authenticateUser({ email: req.body?.email, password: req.body?.password });
        const session = await createSession(user.id);
        res.cookie(sessionCookieName, session.token, sessionCookieOptions);
        res.json({ authenticated: true, user });
    } catch (error) {
        next(error);
    }
});

app.post('/api/auth/logout', async (req, res, next) => {
    try {
        await deleteSession(getCookie(req, sessionCookieName));
        res.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.use('/api', async (req, res, next) => {
    try {
        const user = await getSessionUser(getCookie(req, sessionCookieName));
        if (!user) {
            res.status(401).json({ error: 'Требуется вход в аккаунт.' });
            return;
        }
        res.locals.user = user;
        next();
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments', async (req, res, next) => {
    try {
        const query = typeof req.query.q === 'string' ? req.query.q : '';
        res.json(await searchInstruments(query));
    } catch (error) {
        next(error);
    }
});

app.post('/api/instruments', async (req, res, next) => {
    const ticker = typeof req.body?.ticker === 'string' ? req.body.ticker : '';

    if (!/^[A-Za-z0-9._-]{1,32}$/.test(ticker.trim())) {
        res.status(400).json({ error: 'Ticker must contain 1–32 letters, digits, dots, hyphens, or underscores' });
        return;
    }

    try {
        const instrument = await addInstrument(ticker);
        res.status(201).json(instrument);
    } catch (error) {
        next(error);
    }
});

app.delete('/api/instruments', async (req, res, next) => {
    try {
        res.json(await deleteInstruments(req.body?.ids));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/search', async (req, res, next) => {
    try {
        const query = typeof req.query.q === 'string' ? req.query.q : '';
        res.json(await searchMoexInstruments(query));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/market-data', async (_req, res, next) => {
    try {
        res.json(await getInstrumentsMarketData());
    } catch (error) {
        next(error);
    }
});

app.post('/api/instruments/logos/sync', async (req, res, next) => {
    try {
        res.json(await syncInstrumentLogos(req.body?.force === true));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/:ticker/details', async (req, res, next) => {
    try {
        res.json(await getInstrumentDetails(sessionUserId(res), req.params.ticker));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/:ticker/history', async (req, res, next) => {
    const range = typeof req.query.range === 'string' ? req.query.range : '1y';
    if (!historyRanges.includes(range as HistoryRange)) {
        res.status(400).json({ error: 'Unsupported history range' });
        return;
    }
    try {
        res.json(await getInstrumentPriceHistory(req.params.ticker, range as HistoryRange));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/:ticker/growth', async (req, res, next) => {
    try {
        res.json(await getInstrumentGrowth(req.params.ticker));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/:ticker/price', async (req, res, next) => {
    try {
        res.json(await getInstrumentPrice(req.params.ticker));
    } catch (error) {
        next(error);
    }
});

app.get('/api/instruments/:ticker', async (req, res, next) => {
    try {
        res.json(await getInstrument(req.params.ticker));
    } catch (error) {
        next(error);
    }
});

function getPortfolioName(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

app.get('/api/portfolios', async (_req, res, next) => {
    try {
        res.json(await listPortfolios(sessionUserId(res)));
    } catch (error) {
        next(error);
    }
});

app.get('/api/portfolios/aggregate', async (_req, res, next) => {
    try {
        res.json(await getAggregatePortfolio(sessionUserId(res)));
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics', async (_req, res, next) => {
    try {
        res.json(await getPortfolioAnalytics(sessionUserId(res)));
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics/comparison', async (_req, res, next) => {
    try {
        res.json(await getPortfolioComparison(sessionUserId(res)));
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics/performance', async (req, res, next) => {
    const portfolioId = req.query.portfolioId === undefined ? undefined : Number(req.query.portfolioId);
    if (portfolioId !== undefined && (!Number.isInteger(portfolioId) || portfolioId < 1)) {
        res.status(400).json({ error: 'portfolioId must be a positive integer' });
        return;
    }
    try {
        res.json(await getPortfolioPerformance(sessionUserId(res), portfolioId, req.query.refresh === 'true'));
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics/income-forecast', async (req, res, next) => {
    const portfolioId = req.query.portfolioId === undefined ? undefined : Number(req.query.portfolioId);
    if (portfolioId !== undefined && (!Number.isInteger(portfolioId) || portfolioId < 1)) {
        res.status(400).json({ error: 'portfolioId must be a positive integer' });
        return;
    }
    try {
        res.json(await getPortfolioIncomeForecast(sessionUserId(res), portfolioId, req.query.refresh === 'true'));
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics/bonds', async (req, res, next) => {
    const portfolioId = req.query.portfolioId === undefined ? undefined : Number(req.query.portfolioId);
    if (portfolioId !== undefined && (!Number.isInteger(portfolioId) || portfolioId < 1)) {
        res.status(400).json({ error: 'portfolioId must be a positive integer' });
        return;
    }
    try {
        res.json(await getBondAnalytics(sessionUserId(res), portfolioId));
    } catch (error) {
        next(error);
    }
});

app.get('/api/portfolios/:id/analytics', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: 'Provide a valid portfolio id' });
        return;
    }
    try {
        res.json(await getPortfolioAnalytics(sessionUserId(res), id));
    } catch (error) {
        next(error);
    }
});

app.post('/api/portfolios', async (req, res, next) => {
    const name = getPortfolioName(req.body?.name);
    if (name.length < 1 || name.length > 100) {
        res.status(400).json({ error: 'Portfolio name must contain 1–100 characters' });
        return;
    }

    try {
        res.status(201).json(await createPortfolio(sessionUserId(res), name));
    } catch (error) {
        next(error);
    }
});

app.put('/api/portfolios/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    const name = getPortfolioName(req.body?.name);
    if (!Number.isInteger(id) || id < 1 || name.length < 1 || name.length > 100) {
        res.status(400).json({ error: 'Provide a valid portfolio id and name (1–100 characters)' });
        return;
    }

    try {
        res.json(await updatePortfolio(sessionUserId(res), id, name));
    } catch (error) {
        next(error);
    }
});

app.delete('/api/portfolios/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: 'Provide a valid portfolio id' });
        return;
    }

    try {
        const userId = sessionUserId(res);
        await deletePortfolio(userId, id);
        invalidatePortfolioPerformance(userId, id);
        invalidatePortfolioIncomeForecast(userId, id);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.get('/api/transactions', async (req, res, next) => {
    const portfolioId = req.query.portfolioId === undefined ? undefined : Number(req.query.portfolioId);
    if (portfolioId !== undefined && (!Number.isInteger(portfolioId) || portfolioId < 1)) {
        res.status(400).json({ error: 'portfolioId must be a positive integer' });
        return;
    }
    try {
        res.json(await listTransactions(sessionUserId(res), portfolioId));
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/tbank/preview', async (req, res, next) => {
    try {
        res.json(await previewTbankBrokerReport(sessionUserId(res), req.body?.pdfBase64));
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/tbank/commit', async (req, res, next) => {
    const portfolioId = Number(req.body?.portfolioId);
    try {
        const userId = sessionUserId(res);
        const result = await importTbankBrokerReport(
            userId,
            portfolioId,
            req.body?.pdfBase64,
            req.body?.sourceIds,
        );
        invalidatePortfolioPerformance(userId, portfolioId);
        invalidatePortfolioIncomeForecast(userId, portfolioId);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/tbank/xlsx/preview', async (req, res, next) => {
    try {
        res.json(await previewTbankBrokerXlsxReport(sessionUserId(res), req.body?.xlsxBase64));
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/tbank/xlsx/commit', async (req, res, next) => {
    const portfolioId = Number(req.body?.portfolioId);
    try {
        const userId = sessionUserId(res);
        const result = await importTbankBrokerXlsxReport(
            userId,
            portfolioId,
            req.body?.xlsxBase64,
            req.body?.sourceIds,
        );
        invalidatePortfolioPerformance(userId, portfolioId);
        invalidatePortfolioIncomeForecast(userId, portfolioId);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/sber/xlsx/preview', async (req, res, next) => {
    try {
        res.json(await previewSberBrokerXlsxReport(sessionUserId(res), req.body?.xlsxBase64));
    } catch (error) {
        next(error);
    }
});

app.post('/api/imports/sber/xlsx/commit', async (req, res, next) => {
    const portfolioId = Number(req.body?.portfolioId);
    try {
        const userId = sessionUserId(res);
        const result = await importSberBrokerXlsxReport(
            userId,
            portfolioId,
            req.body?.xlsxBase64,
            req.body?.sourceIds,
        );
        invalidatePortfolioPerformance(userId, portfolioId);
        invalidatePortfolioIncomeForecast(userId, portfolioId);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

app.post('/api/transactions', async (req, res, next) => {
    try {
        const userId = sessionUserId(res);
        const transaction = await createTransaction(userId, parseTransactionInput(req.body));
        invalidatePortfolioPerformance(userId, transaction.portfolioId);
        invalidatePortfolioIncomeForecast(userId, transaction.portfolioId);
        res.status(201).json(transaction);
    } catch (error) {
        next(error);
    }
});

app.delete('/api/transactions', async (req, res, next) => {
    try {
        const userId = sessionUserId(res);
        const result = await deleteTransactions(userId, req.body?.ids);
        invalidatePortfolioPerformance(userId);
        invalidatePortfolioIncomeForecast(userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/api/transactions/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: 'Provide a valid transaction id' });
        return;
    }
    try {
        const userId = sessionUserId(res);
        await deleteTransaction(userId, id);
        invalidatePortfolioPerformance(userId);
        invalidatePortfolioIncomeForecast(userId);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    if (error instanceof InstrumentNotFoundError || error instanceof PortfolioNotFoundError || error instanceof TransactionNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
    }

    if (error instanceof AuthenticationError) {
        res.status(401).json({ error: error.message });
        return;
    }

    if (error instanceof AuthValidationError || error instanceof TransactionValidationError || error instanceof InstrumentValidationError || error instanceof BrokerReportImportError) {
        res.status(400).json({ error: error.message });
        return;
    }

    if (error instanceof InstrumentInUseError) {
        res.status(409).json({ error: error.message });
        return;
    }

    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'Такая запись уже существует.' });
        return;
    }

    res.status(500).json({ error: 'Unable to complete the request' });
});

applyMigrations();

app.listen(PORT, () => {
    console.log(
        `API server running on http://localhost:${PORT}`,
    );
});
