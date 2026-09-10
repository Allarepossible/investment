const MOEX_BASE_URL = 'https://iss.moex.com/iss';
const MAX_CONCURRENT_REQUESTS = 6;

export class MoexClient {
    private activeRequests = 0;
    private readonly waiting: Array<() => void> = [];

    private async acquireSlot() {
        if (this.activeRequests < MAX_CONCURRENT_REQUESTS) {
            this.activeRequests += 1;
            return;
        }
        await new Promise<void>((resolve) => this.waiting.push(resolve));
        this.activeRequests += 1;
    }

    private releaseSlot() {
        this.activeRequests -= 1;
        this.waiting.shift()?.();
    }

    async get<T>(
        path: string,
        params?: Record<string, string>,
        options?: { timeoutMs?: number },
    ): Promise<T> {
        const url = new URL(`${MOEX_BASE_URL}${path}`);

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, value);
            });
        }

        await this.acquireSlot();
        try {
            const timeoutMs = Math.max(1_000, Math.min(options?.timeoutMs ?? 12_000, 12_000));
            const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok) {
                throw new Error(`MOEX API error: ${response.status}`);
            }
            return response.json() as Promise<T>;
        } catch {
            throw new Error('MOEX did not respond within 12 seconds');
        } finally {
            this.releaseSlot();
        }
    }
}
