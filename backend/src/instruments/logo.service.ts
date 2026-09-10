import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { instruments } from '../db/schema';

type LogoInstrument = typeof instruments.$inferSelect;
type LogoStatus = 'found' | 'missing' | 'skipped';
type LogoCandidate = { url: string; source: 'brandfetch' | 'tickerlogos' };

const logoDirectory = path.resolve(process.cwd(), 'data', 'logos');
const maxLogoSize = 512 * 1024;
const maxConcurrentLookups = 1;
const catalogHeaders = {
    'User-Agent': 'InvestmentPortfolioLocal/1.0 (local personal portfolio application)',
};

function safeLogoName(ticker: string) {
    return ticker.replace(/[^A-Za-z0-9._-]/g, '_');
}

function extensionFromContentType(contentType: string | null) {
    const value = contentType?.split(';')[0].trim().toLowerCase();
    if (value === 'image/png') return 'png';
    if (value === 'image/jpeg') return 'jpg';
    if (value === 'image/webp') return 'webp';
    return null;
}

function allowedImageHost(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (
            url.hostname === 'cdn.brandfetch.io'
            || url.hostname === 'cdn.tickerlogos.com'
        );
    } catch {
        return false;
    }
}

async function requestJson(url: URL) {
    try {
        const response = await fetch(url, { headers: catalogHeaders, signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return null;
        return await response.json() as unknown;
    } catch {
        return null;
    }
}

async function searchTickerLogos(instrument: LogoInstrument) {
    const searchUrl = new URL('https://www.allinvestview.com/api/logo-search/');
    searchUrl.searchParams.set('q', instrument.ticker);
    const response = await requestJson(searchUrl) as {
        results?: Array<{ symbol?: string; website?: string }>;
    } | null;
    const result = response?.results?.find((item) =>
        item.symbol?.toUpperCase().split('.')[0] === instrument.ticker.toUpperCase(),
    );
    if (!result?.website) return null;

    try {
        const domain = new URL(result.website).hostname.replace(/^www\./, '');
        if (!domain) return null;
        return {
            url: `https://cdn.tickerlogos.com/${encodeURIComponent(domain)}`,
            source: 'tickerlogos' as const,
        };
    } catch {
        return null;
    }
}

async function findLogoCandidate(instrument: LogoInstrument): Promise<LogoCandidate | null> {
    const clientId = process.env.BRANDFETCH_CLIENT_ID?.trim();
    if (clientId) {
        const identifier = instrument.isin?.trim() || instrument.ticker;
        const identifierType = instrument.isin?.trim() ? 'isin' : 'ticker';
        const url = new URL(`https://cdn.brandfetch.io/${identifierType}/${encodeURIComponent(identifier)}`);
        url.searchParams.set('c', clientId);
        url.searchParams.set('w', '128');
        url.searchParams.set('h', '128');
        return { url: url.toString(), source: 'brandfetch' };
    }

    if (instrument.market === 'bonds' || instrument.type.includes('bond')) return null;
    // The provider returns a domain only for an exact ticker match, preventing look-alike logos.
    return searchTickerLogos(instrument);
}

async function cacheLogo(instrument: LogoInstrument, candidate: LogoCandidate) {
    if (!allowedImageHost(candidate.url)) return null;
    try {
        const response = await fetch(candidate.url, {
            headers: catalogHeaders,
            signal: AbortSignal.timeout(8_000),
            redirect: 'error',
        });
        if (!response.ok) return null;
        const extension = extensionFromContentType(response.headers.get('content-type'));
        if (!extension) return null;
        const content = Buffer.from(await response.arrayBuffer());
        if (!content.length || content.length > maxLogoSize) return null;

        await mkdir(logoDirectory, { recursive: true });
        const fileName = `${safeLogoName(instrument.ticker)}.${extension}`;
        const filePath = path.join(logoDirectory, fileName);
        const temporaryPath = `${filePath}.tmp`;
        await writeFile(temporaryPath, content);
        await rename(temporaryPath, filePath);
        return {
            logoPath: `/api/logos/${encodeURIComponent(fileName)}`,
            logoSource: candidate.source,
        };
    } catch {
        return null;
    }
}

export async function ensureInstrumentLogo(
    instrument: LogoInstrument,
    force = false,
): Promise<LogoStatus> {
    if (!force && instrument.logoStatus !== 'pending') return 'skipped';

    const candidate = await findLogoCandidate(instrument);
    const cached = candidate ? await cacheLogo(instrument, candidate) : null;
    const now = new Date();
    await db
        .update(instruments)
        .set({
            logoPath: cached?.logoPath ?? null,
            logoSource: cached?.logoSource ?? null,
            logoStatus: cached ? 'found' : 'missing',
            updatedAt: now,
        })
        .where(eq(instruments.id, instrument.id));
    return cached ? 'found' : 'missing';
}

export async function syncInstrumentLogos(force = false) {
    const savedInstruments = await db.select().from(instruments);
    const candidates = force
        ? savedInstruments
        : savedInstruments.filter((instrument) => instrument.logoStatus === 'pending');
    let cursor = 0;
    let found = 0;
    let missing = 0;

    async function worker() {
        while (cursor < candidates.length) {
            const instrument = candidates[cursor];
            cursor += 1;
            const status = await ensureInstrumentLogo(instrument, force);
            if (status === 'found') found += 1;
            if (status === 'missing') missing += 1;
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(maxConcurrentLookups, candidates.length) },
        () => worker(),
    ));
    return { checked: candidates.length, found, missing };
}
