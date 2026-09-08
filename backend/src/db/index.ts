import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const dataDirectory = path.resolve(process.cwd(), 'data');
mkdirSync(dataDirectory, { recursive: true });

const sqlite = new Database(path.join(dataDirectory, 'portfolio.db'));
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite);

export function applyMigrations() {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
}
