import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  DEV_APP_STATUS,
  createDeveloperAuditLog,
  generateClientCredentials,
  getOrCreateDeveloperPlatformConfig,
  hashSensitiveValue,
  normalizeScopes,
  sanitizeUrlOrNull
} from '../services/developerPlatform.service';
import { getTrustedClientIp } from '../utils/security/clientIdentity';

const getRequestMeta = (req: Request) => ({
  ip: getTrustedClientIp(req).slice(0, 255) || null,
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null
});

const validateDeveloperClient = async (clientId: string, clientSecret: string) => {
  const app = await prisma.developerApp.findFirst({
    where: {
      clientId,
      status: DEV_APP_STATUS.ACTIVE
    }
  });
  if (!app) return null;
  const providedHash = hashSensitiveValue(clientSecret);
  if (providedHash !== app.clientSecretHash) return null;
  return app;
};

const parseScopesFromInput = (scopeInput: unknown): string[] => {
  if (Array.isArray(scopeInput)) return normalizeScopes(scopeInput);
  const single = String(scopeInput || '').trim();
  if (!single) return [];
  return normalizeScopes(single.split(/[,\s]+/g));
};

const readBearerToken = (req: Request) => {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
};

export const oauthAuthorize = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const clientId = String(req.body?.clientId || '').trim();
    const redirectUri = sanitizeUrlOrNull(req.body?.redirectUri);
    if (!clientId || !redirectUri) {
      return res.status(400).json({ success: false, error: 'clientId and redirectUri are required.' });
    }

    const app = await prisma.developerApp.findFirst({
      where: { clientId, status: DEV_APP_STATUS.ACTIVE },
      include: {
        redirectUris: {
          where: { isActive: true }
        }
      }
    });
    if (!app) return res.status(404).json({ success: false, error: 'OAuth client not found or not active.' });
    const redirectAllowed = (app.redirectUris || []).some((entry) => entry.uri === redirectUri);
    if (!redirectAllowed) return res.status(400).json({ success: false, error: 'Redirect URI is not registered.' });

    const requestedScopes = parseScopesFromInput(req.body?.scopes);
    const allowedScopes = requestedScopes.filter((scope) => (app.requestedScopes || []).includes(scope));
    const scopes = allowedScopes.length ? allowedScopes : app.requestedScopes || [];
    const consent = await prisma.oAuthConsent.upsert({
      where: { appId_userId: { appId: app.id, userId } },
      update: {
        scopes,
        revokedAt: null,
        updatedAt: new Date()
      },
      create: {
        appId: app.id,
        userId,
        scopes
      }
    });

    const code = generateClientCredentials().clientSecret;
    const codeHash = hashSensitiveValue(code);
    const config = await getOrCreateDeveloperPlatformConfig();

    await prisma.oAuthAuthorizationCode.create({
      data: {
        appId: app.id,
        userId,
        codeHash,
        redirectUri,
        codeChallenge: String(req.body?.codeChallenge || '').trim() || null,
        codeChallengeMethod: String(req.body?.codeChallengeMethod || '').trim() || null,
        scopes: consent.scopes,
        state: String(req.body?.state || '').trim() || null,
        expiresAt: new Date(Date.now() + Number(config.authorizationCodeTtlSeconds || 300) * 1000)
      }
    });

    await createDeveloperAuditLog({
      appId: app.id,
      actorUserId: userId,
      action: 'DEV_OAUTH_AUTHORIZE',
      status: 'SUCCESS',
      metadata: {
        scopes: consent.scopes,
        redirectUri
      },
      ...getRequestMeta(req)
    });

    return res.json({
      success: true,
      data: {
        code,
        state: String(req.body?.state || '').trim() || null,
        redirectUri
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to issue authorization code.' });
  }
};

export const oauthToken = async (req: Request, res: Response) => {
  try {
    const grantType = String(req.body?.grant_type || '').trim();
    const clientId = String(req.body?.client_id || req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.client_secret || req.body?.clientSecret || '').trim();
    if (!clientId || !clientSecret) {
      return res.status(400).json({ success: false, error: 'client_id and client_secret are required.' });
    }

    const app = await validateDeveloperClient(clientId, clientSecret);
    if (!app) return res.status(401).json({ success: false, error: 'Invalid client credentials.' });
    const config = await getOrCreateDeveloperPlatformConfig();

    if (grantType === 'authorization_code') {
      const code = String(req.body?.code || '').trim();
      const redirectUri = sanitizeUrlOrNull(req.body?.redirect_uri || req.body?.redirectUri);
      if (!code || !redirectUri) {
        return res.status(400).json({ success: false, error: 'code and redirect_uri are required.' });
      }

      const codeRecord = await prisma.oAuthAuthorizationCode.findFirst({
        where: {
          appId: app.id,
          codeHash: hashSensitiveValue(code),
          redirectUri,
          usedAt: null,
          revokedAt: null
        }
      });
      if (!codeRecord) return res.status(400).json({ success: false, error: 'Invalid authorization code.' });
      if (codeRecord.expiresAt.getTime() < Date.now()) {
        await prisma.oAuthAuthorizationCode.update({
          where: { id: codeRecord.id },
          data: { revokedAt: new Date() }
        });
        return res.status(400).json({ success: false, error: 'Authorization code expired.' });
      }

      const accessToken = generateClientCredentials().clientSecret;
      const refreshToken = generateClientCredentials().clientSecret;
      const now = Date.now();
      const accessTokenExpiresAt = new Date(now + Number(config.accessTokenTtlSeconds || 3600) * 1000);
      const refreshTokenExpiresAt = new Date(now + Number(config.refreshTokenTtlSeconds || 2592000) * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.oAuthAuthorizationCode.update({
          where: { id: codeRecord.id },
          data: { usedAt: new Date() }
        });
        await tx.oAuthToken.create({
          data: {
            appId: app.id,
            userId: codeRecord.userId,
            accessTokenHash: hashSensitiveValue(accessToken),
            refreshTokenHash: hashSensitiveValue(refreshToken),
            scopes: codeRecord.scopes || [],
            accessTokenExpiresAt,
            refreshTokenExpiresAt,
            ...getRequestMeta(req)
          }
        });
      });

      await createDeveloperAuditLog({
        appId: app.id,
        actorUserId: codeRecord.userId,
        action: 'DEV_OAUTH_TOKEN_ISSUED',
        status: 'SUCCESS',
        metadata: { grantType, scopes: codeRecord.scopes || [] },
        ...getRequestMeta(req)
      });

      return res.json({
        success: true,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: Number(config.accessTokenTtlSeconds || 3600),
        scope: (codeRecord.scopes || []).join(' ')
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || '').trim();
      if (!refreshToken) return res.status(400).json({ success: false, error: 'refresh_token is required.' });

      const record = await prisma.oAuthToken.findFirst({
        where: {
          appId: app.id,
          refreshTokenHash: hashSensitiveValue(refreshToken),
          revokedAt: null
        }
      });
      if (!record) return res.status(400).json({ success: false, error: 'Invalid refresh token.' });
      if (!record.refreshTokenExpiresAt || record.refreshTokenExpiresAt.getTime() < Date.now()) {
        await prisma.oAuthToken.update({
          where: { id: record.id },
          data: { revokedAt: new Date() }
        });
        return res.status(400).json({ success: false, error: 'Refresh token expired.' });
      }

      const newAccessToken = generateClientCredentials().clientSecret;
      await prisma.oAuthToken.update({
        where: { id: record.id },
        data: {
          accessTokenHash: hashSensitiveValue(newAccessToken),
          accessTokenExpiresAt: new Date(Date.now() + Number(config.accessTokenTtlSeconds || 3600) * 1000),
          lastUsedAt: new Date(),
          ...getRequestMeta(req)
        }
      });

      return res.json({
        success: true,
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: Number(config.accessTokenTtlSeconds || 3600),
        scope: (record.scopes || []).join(' ')
      });
    }

    return res.status(400).json({ success: false, error: 'Unsupported grant_type.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to issue OAuth token.' });
  }
};

export const oauthUserInfo = async (req: Request, res: Response) => {
  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return res.status(401).json({ success: false, error: 'Missing bearer access token.' });

    const tokenRecord = await prisma.oAuthToken.findFirst({
      where: {
        accessTokenHash: hashSensitiveValue(accessToken),
        revokedAt: null
      }
    });
    if (!tokenRecord) return res.status(401).json({ success: false, error: 'Invalid access token.' });
    if (tokenRecord.accessTokenExpiresAt.getTime() < Date.now()) {
      await prisma.oAuthToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() }
      });
      return res.status(401).json({ success: false, error: 'Access token expired.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        avatar: true,
        phone: true
      }
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const scopeSet = new Set(tokenRecord.scopes || []);
    const payload: Record<string, any> = { sub: user.id };
    if (scopeSet.has('profile:read')) {
      payload.name = user.name || null;
      payload.username = user.username || null;
      payload.avatar = user.avatar || null;
    }
    if (scopeSet.has('email:read')) payload.email = user.email || null;
    if (scopeSet.has('phone:read')) payload.phone = user.phone || null;

    await prisma.oAuthToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() }
    });

    return res.json(payload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to fetch user info.' });
  }
};

export const oauthRevokeToken = async (req: Request, res: Response) => {
  try {
    const clientId = String(req.body?.client_id || req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.client_secret || req.body?.clientSecret || '').trim();
    const token = String(req.body?.token || '').trim();
    if (!clientId || !clientSecret || !token) {
      return res.status(400).json({ success: false, error: 'client credentials and token are required.' });
    }
    const app = await validateDeveloperClient(clientId, clientSecret);
    if (!app) return res.status(401).json({ success: false, error: 'Invalid client credentials.' });

    const tokenHash = hashSensitiveValue(token);
    const updated = await prisma.oAuthToken.updateMany({
      where: {
        appId: app.id,
        OR: [{ accessTokenHash: tokenHash }, { refreshTokenHash: tokenHash }],
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    return res.json({ success: true, revoked: updated.count });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to revoke token.' });
  }
};
