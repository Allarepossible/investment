import { MoexClient } from '../integrations/moex/moex.client';
import { mapMoexSecurity } from '../integrations/moex/moex.mapper';
import type { MoexSecurityResponse } from '../integrations/moex/moex.types';

const moex = new MoexClient();

export async function getInstrumentFromMoex(ticker: string) {
    const data = await moex.get<MoexSecurityResponse>(
        `/securities/${ticker.toUpperCase()}.json`,
    );

    return mapMoexSecurity(data);
}