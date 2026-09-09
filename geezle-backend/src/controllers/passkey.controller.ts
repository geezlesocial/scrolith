import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import prisma from '../utils/prismaClient';
import {
  JWT_EXPIRES_IN,
  JWT_SECRET,
  getClientMeta,
  logAuthEvent,
  mapUserPayload,
  safeFindUserByEmail,
  safeFindUserById
} from './auth.controller';
import {
  PASSKEY_PURPOSE,
  consumePasskeyChallenge,
  createPasskeyChallenge,
  decodePasskeyBytes,
  encodePasskeyBytes,
  normalizePasskeyLabel
} from '../services/passkey.service';

const RP_ID = String(process.env.PASSKEY_RP_ID || 'scrolith.com').trim().toLowerCase();
const RP_NAME = String(process.env.PASSKEY_RP_NAME || 'Scrolith').trim() || 'Scrolith';
const EXPECTED_ORIGINS = String(
  process.env.PASSKEY_ALLOWED_ORIGINS || 'https://scrolith.com,https://www.scrolith.com'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const passkeysEnabled = () => String(process.env.SCROLITH_PASSKEYS_ENABLED || '').toLowerCase() === 'true';

const disabled = (res: Response) =>
  res.status(404).json({ success: false, error: 'Passkeys are not enabled', code: 'PASSKEYS_DISABLED' });

const bodyResponse = (req: Request) => {
  const response = req.body?.response;
  return response && typeof response === 'object' ? response : null;
};

const extractClientDataChallenge = (response: RegistrationResponseJSON | AuthenticationResponseJSON) => {
  try {
    const raw = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { challenge?: unknown };
    const challenge = String(parsed.challenge || '').trim();
    return challenge || null;
  } catch {
    return null;
  }
};

const clientMetadata = (req: Request) => {
  const meta = getClientMeta(req);
  return {
    platform: String(req.body?.platform || '').trim().slice(0, 32) || undefined,
    userAgent: meta.userAgent,
    ip: meta.ip
  };
};

const issueSession = (res: Response, user: any) => {
  const token = (jwt as any).sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as string }
  );
  res.cookie('Scrolith_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  return token;
};

export const beginPasskeyRegistration = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const userId = String(req.user?.id || '').trim();
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

  const user = await safeFindUserById(userId);
  if (!user || user.isActive === false) return res.status(403).json({ success: false, error: 'Account unavailable' });

  // Password accounts must prove current password before adding a new login method.
  // OAuth-only accounts can use their existing authenticated session plus required
  // WebAuthn user verification to enroll the first passkey.
  const passwordRecord = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (passwordRecord?.passwordHash) {
    const currentPassword = String(req.body?.currentPassword || '');
    if (!currentPassword || !(await bcrypt.compare(currentPassword, passwordRecord.passwordHash))) {
      return res.status(401).json({
        success: false,
        error: 'Current password confirmation is required before adding a passkey',
        code: 'PASSKEY_REAUTH_REQUIRED'
      });
    }
  }

  const existing = await prisma.passkeyCredential.findMany({
    where: { userId, revokedAt: null },
    select: { credentialId: true, transports: true }
  });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userID: Buffer.from(user.id, 'utf8'),
    userDisplayName: user.name || user.username || user.email,
    attestationType: 'none',
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required'
    },
    preferredAuthenticatorType: 'localDevice'
  });
  const challenge = await createPasskeyChallenge({
    challenge: options.challenge,
    purpose: PASSKEY_PURPOSE.registration,
    userId,
    metadata: clientMetadata(req)
  });

  return res.json({ success: true, data: options, challengeId: challenge.id, expiresAt: challenge.expiresAt });
};

export const completePasskeyRegistration = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const userId = String(req.user?.id || '').trim();
  const challengeId = String(req.body?.challengeId || '').trim();
  const response = bodyResponse(req) as RegistrationResponseJSON | null;
  if (!userId || !challengeId || !response?.id || !response?.response) {
    return res.status(400).json({ success: false, error: 'challengeId and passkey response are required' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: async (challenge) => {
        const row = await prisma.passkeyChallenge.findUnique({ where: { id: challengeId }, select: { challengeHash: true } });
        if (!row) return false;
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update(challenge, 'utf8').digest('hex');
        return crypto.timingSafeEqual(Buffer.from(row.challengeHash), Buffer.from(hash));
      },
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserPresence: true,
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(400).json({ success: false, error: 'Passkey registration could not be verified' });

    const credential = verification.registrationInfo.credential;
    const duplicate = await prisma.passkeyCredential.findUnique({ where: { credentialId: credential.id }, select: { id: true } });
    if (duplicate) return res.status(409).json({ success: false, error: 'This passkey is already registered', code: 'PASSKEY_EXISTS' });

    const clientChallenge = extractClientDataChallenge(response);
    if (!clientChallenge) return res.status(400).json({ success: false, error: 'Invalid passkey client data' });
    const challenge = await consumePasskeyChallenge({
      id: challengeId,
      challenge: clientChallenge,
      purpose: PASSKEY_PURPOSE.registration,
      userId
    });
    if (!challenge) return res.status(409).json({ success: false, error: 'Passkey registration challenge expired or was already used' });

    await prisma.passkeyCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: encodePasskeyBytes(credential.publicKey),
        counter: credential.counter,
        transports: response.response.transports || [],
        deviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
        aaguid: verification.registrationInfo.aaguid,
        label: normalizePasskeyLabel(req.body?.label)
      }
    });
    void logAuthEvent({ userId, event: 'passkey_registered', meta: { deviceType: verification.registrationInfo.credentialDeviceType, backedUp: verification.registrationInfo.credentialBackedUp } }, req);
    return res.status(201).json({ success: true, message: 'Passkey added successfully' });
  } catch (error: any) {
    console.warn('[passkey] registration verification failed', { message: error?.message || String(error) });
    return res.status(400).json({ success: false, error: 'Passkey registration could not be verified', code: 'PASSKEY_REGISTRATION_FAILED' });
  }
};

export const beginPasskeyAuthentication = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 320);
  let allowCredentials;

  // When the user has already entered an email, narrow the discoverable
  // credential lookup to that account. If the hint is absent or does not have
  // a registered passkey, retain the usernameless flow so we never disclose
  // whether an account or credential exists.
  if (email) {
    const hintedUser = await safeFindUserByEmail(email);
    if (hintedUser?.id && hintedUser.isActive !== false) {
      const credentials = await prisma.passkeyCredential.findMany({
        where: { userId: hintedUser.id, revokedAt: null },
        select: { credentialId: true, transports: true }
      });
      if (credentials.length > 0) {
        allowCredentials = credentials.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports
        }));
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    ...(allowCredentials ? { allowCredentials } : {})
  });
  const challenge = await createPasskeyChallenge({
    challenge: options.challenge,
    purpose: PASSKEY_PURPOSE.authentication,
    metadata: clientMetadata(req)
  });
  return res.json({ success: true, data: options, challengeId: challenge.id, expiresAt: challenge.expiresAt });
};

export const completePasskeyAuthentication = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const challengeId = String(req.body?.challengeId || '').trim();
  const response = bodyResponse(req) as AuthenticationResponseJSON | null;
  if (!challengeId || !response?.id || !response?.response) {
    return res.status(400).json({ success: false, error: 'challengeId and passkey response are required' });
  }

  const stored = await prisma.passkeyCredential.findFirst({
    where: { credentialId: response.id, revokedAt: null },
    select: { id: true, userId: true, credentialId: true, publicKey: true, counter: true, transports: true }
  });
  if (!stored) return res.status(401).json({ success: false, error: 'Passkey not recognized', code: 'PASSKEY_NOT_FOUND' });

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (challenge) => {
        const row = await prisma.passkeyChallenge.findUnique({ where: { id: challengeId }, select: { challengeHash: true } });
        if (!row) return false;
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update(challenge, 'utf8').digest('hex');
        return crypto.timingSafeEqual(Buffer.from(row.challengeHash), Buffer.from(hash));
      },
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: decodePasskeyBytes(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports
      }
    });
    if (!verification.verified) return res.status(401).json({ success: false, error: 'Passkey authentication failed', code: 'PASSKEY_AUTH_FAILED' });

    const clientChallenge = extractClientDataChallenge(response);
    if (!clientChallenge) return res.status(400).json({ success: false, error: 'Invalid passkey client data' });
    const challenge = await consumePasskeyChallenge({
      id: challengeId,
      challenge: clientChallenge,
      purpose: PASSKEY_PURPOSE.authentication
    });
    if (!challenge) return res.status(409).json({ success: false, error: 'Passkey challenge expired or was already used', code: 'PASSKEY_CHALLENGE_USED' });

    const updated = await prisma.passkeyCredential.updateMany({
      where: { id: stored.id, revokedAt: null, counter: stored.counter },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
        deviceType: verification.authenticationInfo.credentialDeviceType,
        backedUp: verification.authenticationInfo.credentialBackedUp
      }
    });
    if (updated.count !== 1) return res.status(409).json({ success: false, error: 'Passkey was used concurrently; please try again', code: 'PASSKEY_COUNTER_CONFLICT' });

    const user = await safeFindUserById(stored.userId);
    if (!user || user.isActive === false) return res.status(403).json({ success: false, error: 'Account unavailable' });
    const token = issueSession(res, user);
    void logAuthEvent({ userId: user.id, email: user.email, event: 'passkey_authenticated', meta: { credentialId: stored.credentialId, deviceType: verification.authenticationInfo.credentialDeviceType, backedUp: verification.authenticationInfo.credentialBackedUp } }, req);
    return res.json({ success: true, user: mapUserPayload(user), token, accessToken: token });
  } catch (error: any) {
    console.warn('[passkey] authentication verification failed', { message: error?.message || String(error) });
    void logAuthEvent({ userId: stored.userId, event: 'passkey_authentication_failed', meta: { reason: 'verification_failed' } }, req);
    return res.status(401).json({ success: false, error: 'Passkey authentication failed', code: 'PASSKEY_AUTH_FAILED' });
  }
};

export const listPasskeys = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const userId = String(req.user?.id || '').trim();
  const rows = await prisma.passkeyCredential.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true, label: true, deviceType: true, backedUp: true, aaguid: true, lastUsedAt: true, createdAt: true }
  });
  return res.json({ success: true, data: rows });
};

export const renamePasskey = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const userId = String(req.user?.id || '').trim();
  const id = String(req.params.id || '').trim();
  const updated = await prisma.passkeyCredential.updateMany({
    where: { id, userId, revokedAt: null },
    data: { label: normalizePasskeyLabel(req.body?.label) }
  });
  if (updated.count !== 1) return res.status(404).json({ success: false, error: 'Passkey not found' });
  return res.json({ success: true });
};

export const revokePasskey = async (req: Request, res: Response) => {
  if (!passkeysEnabled()) return disabled(res);
  const userId = String(req.user?.id || '').trim();
  const id = String(req.params.id || '').trim();
  const updated = await prisma.passkeyCredential.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (updated.count !== 1) return res.status(404).json({ success: false, error: 'Passkey not found' });
  void logAuthEvent({ userId, event: 'passkey_revoked', meta: { passkeyId: id } }, req);
  return res.json({ success: true });
};
