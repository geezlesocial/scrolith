import { Request, Response } from 'express';
import { HumanVerificationService } from '../services/humanVerification';
import type { HumanVerificationEndpoint } from '../services/humanVerification/types';
import { getTrustedClientIp } from './security/clientIdentity';

const extractToken = (body: any) =>
  body?.humanVerificationToken ||
  body?.human_verification_token ||
  body?.hvToken ||
  body?.hv_token ||
  null;

const clientCtx = (req: Request) => ({
  ipAddress: getTrustedClientIp(req),
  userAgent: String(req.headers['user-agent'] || ''),
  fingerprint: String(bodyFingerprint(req) || ''),
  sessionId: String(req.body?.sessionId || req.headers['x-session-id'] || '') || null,
  userId: (req as any)?.user?.id || null
});

function bodyFingerprint(req: Request) {
  return req.body?.fingerprint || req.headers['x-device-fingerprint'] || null;
}

/**
 * Enforce Scrolith Human Verification for an endpoint when enabled.
 * Google reCAPTCHA remains independent (optional parallel control).
 */
export async function enforceHumanVerification(
  req: Request,
  res: Response,
  endpoint: HumanVerificationEndpoint
): Promise<boolean> {
  try {
    const result = await HumanVerificationService.consumeVerificationToken({
      endpoint,
      token: extractToken(req.body || {}),
      ctx: clientCtx(req)
    });

    if (!result.enforced) return true;
    if (result.success) return true;

    res.status(400).json({
      success: false,
      error: result.message || 'Human verification failed',
      code: result.code || 'HV_FAILED'
    });
    return false;
  } catch (err: any) {
    console.error('[human-verification] gate error', err?.message);
    res.status(503).json({
      success: false,
      error: 'Human verification is temporarily unavailable. Please try again.',
      code: 'HV_GATE_ERROR'
    });
    return false;
  }
}
