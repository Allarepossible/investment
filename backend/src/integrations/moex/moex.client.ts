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

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `MOEX API error: ${response.status}`,
            );
        }

        return response.json() as Promise<T>;
    }
}