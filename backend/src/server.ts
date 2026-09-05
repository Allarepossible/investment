import express from 'express';
import cors from 'cors';
import { getInstrumentFromMoex } from './instruments/instrument.service';

const app = express();

const PORT = 3000;


app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
    });
});

app.get('/api/instruments/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();

        const instrument = await getInstrumentFromMoex(ticker);

        res.json(instrument);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to load instrument',
        });
    }
});

app.listen(PORT, () => {
    console.log(
        `API server running on http://localhost:${PORT}`,
    );
});