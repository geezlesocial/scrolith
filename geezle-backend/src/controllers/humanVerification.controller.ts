import { Request, Response } from 'express';
import { HumanVerificationService } from '../services/humanVerification';
import type { HumanVerificationEndpoint } from '../services/humanVerification/types';
import { ALL_ENDPOINTS } from '../services/humanVerification/types';

const clientIp = (req: Request) =>
  String(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      ''
  );

const clientCtx = (req: Request) => ({
  ipAddress: clientIp(req),
  userAgent: String(req.headers['user-agent'] || ''),
  fingerprint: String(req.body?.fingerprint || req.headers['x-device-fingerprint'] || '') || null,
  sessionId: String(req.body?.sessionId || req.headers['x-session-id'] || '') || null,
  userId: (req as any)?.user?.id || null,
  country: String(req.headers['cf-ipcountry'] || req.body?.country || '') || null
});

const parseEndpoint = (raw: unknown): HumanVerificationEndpoint => {
  const ep = String(raw || 'generic').toLowerCase().replace(/-/g, '_') as HumanVerificationEndpoint;
  return (ALL_ENDPOINTS.includes(ep) ? ep : 'generic') as HumanVerificationEndpoint;
};

export const createHumanVerificationChallenge = async (req: Request, res: Response) => {
  try {
    const endpoint = parseEndpoint(req.body?.endpoint);
    const result = await HumanVerificationService.createChallenge({
      endpoint,
      ctx: clientCtx(req)
    });

    if ((result as any).error) {
      const err = (result as any).error;
      const status = err.code === 'HV_LOCKED' || err.code === 'HV_RATE_LIMIT' ? 429 : 503;
      return res.status(status).json({
        success: false,
        required: true,
        error: err.message,
        code: err.code,
        retryAfter: err.retryAfter
      });
    }

    if (!(result as any).required) {
      return res.json({
        success: true,
        required: false,
        reason: (result as any).reason,
        publicSettings: (result as any).publicSettings
      });
    }

    return res.json({
      success: true,
      required: true,
      challenge: (result as any).challenge,
      publicSettings: (result as any).publicSettings
    });
  } catch (error: any) {
    console.error('[human-verification] create error', error?.message);
    return res.status(500).json({ success: false, error: 'Failed to create challenge' });
  }
};

export const verifyHumanVerificationChallenge = async (req: Request, res: Response) => {
  try {
    const challengeToken = String(req.body?.challengeToken || req.body?.challenge_token || '');
    const answer = String(req.body?.answer ?? req.body?.value ?? '');
    const optionId = req.body?.optionId || req.body?.option_id;
    const startedAt = req.body?.startedAt ? Number(req.body.startedAt) : null;

    const result = await HumanVerificationService.verifyAnswer({
      challengeToken,
      answer,
      optionId,
      ctx: clientCtx(req),
      startedAt
    });

    if (!result.success) {
      const status =
        result.code === 'HV_EXPIRED' || result.code === 'HV_NOT_FOUND'
          ? 410
          : result.code === 'HV_MAX_ATTEMPTS'
            ? 429
            : 400;
      return res.status(status).json({
        success: false,
        error: result.message,
        code: result.code,
        attemptsRemaining: (result as any).attemptsRemaining
      });
    }

    return res.json({
      success: true,
      verificationToken: result.verificationToken,
      expiresAt: result.expiresAt,
      endpoint: result.endpoint,
      message: result.message
    });
  } catch (error: any) {
    console.error('[human-verification] verify error', error?.message);
    return res.status(500).json({ success: false, error: 'Failed to verify challenge' });
  }
};

export const getPublicHumanVerificationConfig = async (req: Request, res: Response) => {
  try {
    const endpoint = parseEndpoint(req.query?.endpoint);
    const gate = await HumanVerificationService.isRequired(endpoint, clientCtx(req));
    const settings = gate.settings;
    return res.json({
      success: true,
      required: gate.required,
      reason: gate.reason,
      publicSettings: {
        masterEnabled: settings.masterEnabled && !settings.emergencyDisabled,
        theme: settings.theme,
        branding: settings.branding,
        endpoints: settings.endpoints
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to load config' });
  }
};
