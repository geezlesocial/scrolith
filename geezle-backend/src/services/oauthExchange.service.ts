/**
 * Phase 25B — Short-lived single-use OAuth completion codes.
 *
 * Reuses PasswordResetToken storage (hashed, TTL, usedAt) to avoid a migration
 * while keeping multi-instance Cloud Run consistency via PostgreSQL.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
/** Exchange codes are intentionally short-lived */
const EXCHANGE_TTL_MS = Math.max(30_000, Number(process.env.OAUTH_EXCHANGE_TTL_MS || 90_000));

const hashCode = (code: string) =>
  crypto.createHash('sha256').update(`oauth-exchange:${code}`).digest('hex');

export type OAuthExchangeCreateResult = {
  code: string;
  expiresAt: Date;
};

/**
 * Create a one-time opaque exchange code bound to a user session JWT payload.
 */
export const createOAuthExchangeCode = async (input: {
  userId: string;
  email: string;
  role: string;
}): Promise<OAuthExchangeCreateResult> => {
  const code = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashCode(code);
  const expiresAt = new Date(Date.now() + EXCHANGE_TTL_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      expiresAt
    }
  });

  // Session JWT is never returned in the browser URL — only issued on exchange.
  // Store no plaintext JWT; re-sign on consume from current user row.
  return { code, expiresAt };
};

export type OAuthExchangeConsumeResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; error: string; status: number };

export const consumeOAuthExchangeCode = async (rawCode: unknown): Promise<OAuthExchangeConsumeResult> => {
  const code = String(rawCode || '').trim();
  if (!code || code.length < 20 || code.length > 200) {
    return { ok: false, error: 'Invalid exchange code', status: 400 };
  }

  const tokenHash = hashCode(code);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, role: true, isActive: true } } }
  });

  if (!row) {
    return { ok: false, error: 'Invalid or expired exchange code', status: 400 };
  }
  if (row.usedAt) {
    return { ok: false, error: 'Exchange code already used', status: 400 };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'Exchange code expired', status: 400 };
  }
  if (!row.user || row.user.isActive === false) {
    return { ok: false, error: 'Account unavailable', status: 403 };
  }

  // Single-use: mark before issuing token to reduce race windows.
  const marked = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() }
  });
  if (marked.count !== 1) {
    return { ok: false, error: 'Exchange code already used', status: 400 };
  }

  const token = (jwt as any).sign(
    { id: row.user.id, email: row.user.email, role: row.user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as string }
  );

  return { ok: true, token, userId: row.user.id };
};

/** Best-effort: mark all unused exchange/reset tokens for a user as used (incident response). */
export const invalidateUserOAuthExchangeCodes = async (userId: string): Promise<number> => {
  if (!userId) return 0;
  const result = await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() }
  });
  return result.count;
};
