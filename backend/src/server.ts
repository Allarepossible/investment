import express from 'express';
import cors from 'cors';
import {
    addInstrument,
    getInstrument,
    getInstrumentPrice,
    InstrumentNotFoundError,
    searchInstruments,
    searchMoexInstruments,
} from './instruments/instrument.service';
import { applyMigrations } from './db';

const app = express();

const PORT = 3000;


app.use(cors());
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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    if (error instanceof InstrumentNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
    }

    res.status(502).json({ error: 'Unable to retrieve instrument data' });
});

applyMigrations();

app.listen(PORT, () => {
    console.log(
        `API server running on http://localhost:${PORT}`,
    );
});
