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

    createdAt: integer('created_at', {
        mode: 'timestamp',
    }).notNull(),

    updatedAt: integer('updated_at', {
        mode: 'timestamp',
    }).notNull(),
});
