import {
    integer,
    real,
    sqliteTable,
    text,
} from 'drizzle-orm/sqlite-core';

export const instruments = sqliteTable('instruments', {
    id: integer('id').primaryKey({ autoIncrement: true }),

    ticker: text('ticker').notNull().unique(),
    name: text('name').notNull(),

    isin: text('isin'),

    type: text('type').notNull(),

    exchange: text('exchange')
        .notNull()
        .default('MOEX'),

    board: text('board'),

    market: text('market'),

    currency: text('currency')
        .notNull()
        .default('RUB'),

    lotSize: integer('lot_size'),

    minPriceStep: real('min_price_step'),

    // The image itself is stored locally in data/logos; the database keeps only its public API path.
    logoPath: text('logo_path'),
    logoStatus: text('logo_status')
        .notNull()
        .default('pending'),
    logoSource: text('logo_source'),

    createdAt: integer('created_at', {
        mode: 'timestamp',
    }).notNull(),

    updatedAt: integer('updated_at', {
        mode: 'timestamp',
    }).notNull(),
});

export const portfolios = sqliteTable('portfolios', {
    id: integer('id').primaryKey({ autoIncrement: true }),

    name: text('name').notNull().unique(),

    createdAt: integer('created_at', {
        mode: 'timestamp',
    }).notNull(),

    updatedAt: integer('updated_at', {
        mode: 'timestamp',
    }).notNull(),

    archivedAt: integer('archived_at', {
        mode: 'timestamp',
    }),
});

export const transactions = sqliteTable('transactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),

    portfolioId: integer('portfolio_id')
        .notNull()
        .references(() => portfolios.id, { onDelete: 'restrict' }),

    instrumentId: integer('instrument_id')
        .references(() => instruments.id, { onDelete: 'restrict' }),

    type: text('type').notNull(),

    quantity: integer('quantity'),

    priceKopecks: integer('price_kopecks'),

    amountKopecks: integer('amount_kopecks'),

    accruedInterestKopecks: integer('accrued_interest_kopecks')
        .notNull()
        .default(0),

    commissionKopecks: integer('commission_kopecks')
        .notNull()
        .default(0),

    currency: text('currency')
        .notNull()
        .default('RUB'),

    operationDate: integer('operation_date', {
        mode: 'timestamp',
    }).notNull(),

    comment: text('comment'),

    sourceId: text('source_id').unique(),

    createdAt: integer('created_at', {
        mode: 'timestamp',
    }).notNull(),
});
