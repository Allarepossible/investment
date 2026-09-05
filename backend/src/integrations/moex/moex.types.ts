export interface MoexBlock {
    metadata?: Record<string, unknown>;
    columns: string[];
    data: unknown[][];
}

export interface MoexSecurityResponse {
    description?: MoexBlock;
    boards?: MoexBlock;
    [key: string]: unknown;
}