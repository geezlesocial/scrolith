import crypto from 'crypto';
import prisma from '../utils/prismaClient';

export const PASSKEY_PURPOSE = {
  registration: 'REGISTRATION',
  authentication: 'AUTHENTICATION'
} as const;

export type PasskeyPurpose = typeof PASSKEY_PURPOSE[keyof typeof PASSKEY_PURPOSE];

const CHALLENGE_TTL_MS = Math.max(
  30_000,
  Math.min(5 * 60_000, Number(process.env.PASSKEY_CHALLENGE_TTL_MS || 120_000))
);

const hashChallenge = (challenge: string) =>
  crypto.createHash('sha256').update(challenge, 'utf8').digest('hex');

const sameHash = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createPasskeyChallenge = async (input: {
  challenge: string;
  purpose: PasskeyPurpose;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const metadata = input.metadata
    ? Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined))
    : undefined;
  await prisma.passkeyChallenge.deleteMany({
    where: {
      expiresAt: { lte: new Date() }
    }
  });
  return prisma.passkeyChallenge.create({
    data: {
      userId: input.userId || null,
      challengeHash: hashChallenge(input.challenge),
      purpose: input.purpose,
      expiresAt,
      metadata
    },
    select: { id: true, expiresAt: true }
  });
};

export const consumePasskeyChallenge = async (input: {
  id: string;
  challenge: string;
  purpose: PasskeyPurpose;
  userId?: string | null;
}) => {
  const row = await prisma.passkeyChallenge.findUnique({
    where: { id: input.id },
    select: { id: true, userId: true, challengeHash: true, purpose: true, expiresAt: true, consumedAt: true }
  });
  if (!row || row.purpose !== input.purpose || row.consumedAt || row.expiresAt <= new Date()) return null;
  if (input.userId && row.userId !== input.userId) return null;
  if (!sameHash(row.challengeHash, hashChallenge(input.challenge))) return null;

  const consumed = await prisma.passkeyChallenge.updateMany({
    where: {
      id: input.id,
      purpose: input.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      ...(input.userId ? { userId: input.userId } : {})
    },
    data: { consumedAt: new Date() }
  });
  return consumed.count === 1 ? row : null;
};

export const encodePasskeyBytes = (value: Uint8Array) => Buffer.from(value).toString('base64url');

export const decodePasskeyBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));

export const normalizePasskeyLabel = (value: unknown) =>
  String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Scrolith passkey';
