import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { portfolios, sessions, users } from '../db/schema';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;

export type AuthUser = { id: number; email: string; createdAt: Date };

export class AuthValidationError extends Error {}
export class AuthenticationError extends Error {}

function normalizeEmail(value: unknown) {
    if (typeof value !== 'string') throw new AuthValidationError('Укажите email.');
    const email = value.trim().toLowerCase();
    if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AuthValidationError('Укажите корректный email.');
    }
    return email;
}

function validatePassword(value: unknown) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
        throw new AuthValidationError('Пароль должен содержать от 8 до 200 символов.');
    }
    return value;
}

async function hashPassword(password: string, salt = randomBytes(16).toString('base64url')) {
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, stored: string) {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const derived = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function hashToken(token: string) {
    return createHash('sha256').update(token).digest('base64url');
}

function publicUser(user: typeof users.$inferSelect): AuthUser {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export async function hasRegisteredUsers() {
    const [result] = await db.select({ value: count() }).from(users);
    return result.value > 0;
}

export async function registerUser(input: { email: unknown; password: unknown }) {
    const email = normalizeEmail(input.email);
    const password = validatePassword(input.password);
    const now = new Date();
    const [existingCount] = await db.select({ value: count() }).from(users);
    const firstUser = existingCount.value === 0;
    const passwordHash = await hashPassword(password);

    const user = db.transaction((transaction) => {
        const [created] = transaction.insert(users)
            .values({ email, passwordHash, createdAt: now, updatedAt: now })
            .returning()
            .all();
        if (firstUser) {
            transaction.update(portfolios)
                .set({ userId: created.id })
                .where(isNull(portfolios.userId))
                .run();
        }
        return created;
    });

    return publicUser(user);
}

export async function authenticateUser(input: { email: unknown; password: unknown }) {
    const email = normalizeEmail(input.email);
    const password = validatePassword(input.password);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new AuthenticationError('Неверный email или пароль.');
    }
    return publicUser(user);
}

export async function createSession(userId: number) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1_000);
    await db.insert(sessions).values({
        userId,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt,
    });
    return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
    if (!token) return null;
    const [session] = await db
        .select({ user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    if (!session) {
        await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
        return null;
    }
    return publicUser(session.user);
}

export async function deleteSession(token: string | undefined) {
    if (!token) return;
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
