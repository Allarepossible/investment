const MOEX_BASE_URL = 'https://iss.moex.com/iss';

export class MoexClient {
    async get<T>(
        path: string,
        params?: Record<string, string>,
    ): Promise<T> {
        const url = new URL(`${MOEX_BASE_URL}${path}`);

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.set(key, value);
            });
        }

        let response: Response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        } catch {
            throw new Error('MOEX did not respond within 12 seconds');
        }

        if (!response.ok) {
            throw new Error(
                `MOEX API error: ${response.status}`,
            );
        }

        return response.json() as Promise<T>;
    }
}
