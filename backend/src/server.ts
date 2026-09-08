import express from 'express';
import cors from 'cors';
import {
    addInstrument,
    getInstrument,
    getInstrumentPrice,
    getInstrumentsMarketData,
    InstrumentNotFoundError,
    searchInstruments,
    searchMoexInstruments,
} from './instruments/instrument.service';
import { applyMigrations } from './db';
import { getPortfolioAnalytics } from './analytics/analytics.service';
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
    listTransactions,
    parseTransactionInput,
    TransactionNotFoundError,
    TransactionValidationError,
} from './transactions/transaction.service';

const app = express();

const PORT = Number(process.env.PORT ?? 3000);
const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);


app.use(cors({ origin: corsOrigins?.length ? corsOrigins : true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
    });
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
        res.json(await listPortfolios());
    } catch (error) {
        next(error);
    }
});

app.get('/api/portfolios/aggregate', async (_req, res, next) => {
    try {
        res.json(await getAggregatePortfolio());
    } catch (error) {
        next(error);
    }
});

app.get('/api/analytics', async (_req, res, next) => {
    try {
        res.json(await getPortfolioAnalytics());
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
        res.json(await getPortfolioAnalytics(id));
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
        res.status(201).json(await createPortfolio(name));
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
        res.json(await updatePortfolio(id, name));
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
        await deletePortfolio(id);
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
        res.json(await listTransactions(portfolioId));
    } catch (error) {
        next(error);
    }
});

app.post('/api/transactions', async (req, res, next) => {
    try {
        res.status(201).json(await createTransaction(parseTransactionInput(req.body)));
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
        await deleteTransaction(id);
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

    if (error instanceof TransactionValidationError) {
        res.status(400).json({ error: error.message });
        return;
    }

    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'A portfolio with this name already exists' });
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
