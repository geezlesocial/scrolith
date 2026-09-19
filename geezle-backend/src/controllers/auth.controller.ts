// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role as PrismaRole, KYCStatus as PrismaKYCStatus } from '@prisma/client'; // Import Prisma Client, Role, and KYCStatus enums
import { resolveUserProStatus } from '../utils/proStatus';
import { verifyRecaptcha } from '../utils/recaptcha';
import { enforceHumanVerification } from '../utils/humanVerificationGate';
import {
  completeFollowOnboarding,
  getFollowOnboardingStatus
} from '../services/followOnboarding.service';
import { sendSystemMessage } from '../services/systemMessaging';
import { toAbsoluteFrontendUrl } from '../services/notificationActionUrl.service';
import prisma from '../utils/prismaClient';
import { jwtSecret } from '../utils/security/requiredSecret';
import { getTrustedClientIp } from '../utils/security/clientIdentity';
import { buildAuthClaims } from '../services/authClaims';
import {
  consumeApprovedLogin,
  evaluateLoginDevice,
  getLoginApprovalMetadata,
  normalizeLoginDeviceMetadata,
  registerTrustedDevice
} from '../services/loginApproval.service';

const minimalLoginSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  isActive: true,
  followOnboardingRequired: true,
  followOnboardingCompletedAt: true,
  passwordHash: true
};

const minimalMeSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  isActive: true,
  followOnboardingRequired: true,
  followOnboardingCompletedAt: true
};

const baseLoginSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  isActive: true,
  avatar: true,
  profilePhotoFileId: true,
  kycStatus: true,
  followOnboardingRequired: true,
  followOnboardingCompletedAt: true,
  passwordHash: true
};

const baseMeSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  isActive: true,
  avatar: true,
  profilePhotoFileId: true,
  kycStatus: true,
  followOnboardingRequired: true,
  followOnboardingCompletedAt: true
};

const fullUserSelect = {
  ...baseMeSelect,
  freelancerPlanId: true,
  freelancerPlanName: true,
  freelancerPlanInterval: true,
  freelancerPlanPrice: true,
  freelancerPlanCurrency: true,
  freelancerPlanActive: true,
  freelancerPlanPurchasedAt: true,
  freelancerPlanExpiresAt: true,
  employerPlanId: true,
  employerPlanName: true,
  employerPlanInterval: true,
  employerPlanPrice: true,
  employerPlanCurrency: true,
  employerPlanActive: true,
  employerPlanPurchasedAt: true,
  employerPlanExpiresAt: true
};

export const safeFindUserByEmail = async (email: string) => {
  try {
    return await prisma.user.findUnique({
      where: { email },
      select: { ...fullUserSelect, passwordHash: true }
    });
  } catch (error) {
    logAuthFailure('user_lookup_fallback', error);
    try {
      return await prisma.user.findUnique({
        where: { email },
        select: baseLoginSelect
      });
    } catch (fallbackError) {
      logAuthFailure('user_lookup_minimal_fallback', fallbackError);
      return await prisma.user.findUnique({
        where: { email },
        select: minimalLoginSelect
      });
    }
  }
};

export const safeFindUserById = async (id?: string | null) => {
  if (!id) return null;
  try {
    return await prisma.user.findUnique({
      where: { id },
      select: fullUserSelect
    });
  } catch (error) {
    logAuthFailure('user_id_lookup_fallback', error);
    try {
      return await prisma.user.findUnique({
        where: { id },
        select: baseMeSelect
      });
    } catch (fallbackError) {
      logAuthFailure('user_id_lookup_minimal_fallback', fallbackError);
      return await prisma.user.findUnique({
        where: { id },
        select: minimalMeSelect
      });
    }
  }
};

export const mapUserPayload = (user: any) => {
  const pro = resolveUserProStatus(user);
  const kycStatus = user?.kycStatus ? user.kycStatus.toString().toLowerCase() : undefined;
  const toIso = (value?: Date | string | null) => {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username || '',
    role: user.role,
    isActive: user.isActive !== false,
    is_active: user.isActive !== false,
    avatar: user.avatar,
    profilePhotoFileId: user.profilePhotoFileId ?? null,
    profile_photo_file_id: user.profilePhotoFileId ?? null,
    kycStatus,
    kyc_status: kycStatus,
    freelancerPlanId: user.freelancerPlanId ?? null,
    freelancer_plan_id: user.freelancerPlanId ?? null,
    freelancerPlanName: user.freelancerPlanName ?? null,
    freelancer_plan_name: user.freelancerPlanName ?? null,
    freelancerPlanInterval: user.freelancerPlanInterval ?? null,
    freelancer_plan_interval: user.freelancerPlanInterval ?? null,
    freelancerPlanPrice: user.freelancerPlanPrice ?? null,
    freelancer_plan_price: user.freelancerPlanPrice ?? null,
    freelancerPlanCurrency: user.freelancerPlanCurrency ?? null,
    freelancer_plan_currency: user.freelancerPlanCurrency ?? null,
    freelancerPlanActive: Boolean(user.freelancerPlanActive),
    freelancer_plan_active: Boolean(user.freelancerPlanActive),
    freelancerPlanPurchasedAt: toIso(user.freelancerPlanPurchasedAt),
    freelancer_plan_purchased_at: toIso(user.freelancerPlanPurchasedAt),
    freelancerPlanExpiresAt: toIso(user.freelancerPlanExpiresAt),
    freelancer_plan_expires_at: toIso(user.freelancerPlanExpiresAt),
    employerPlanId: user.employerPlanId ?? null,
    employer_plan_id: user.employerPlanId ?? null,
    employerPlanName: user.employerPlanName ?? null,
    employer_plan_name: user.employerPlanName ?? null,
    employerPlanInterval: user.employerPlanInterval ?? null,
    employer_plan_interval: user.employerPlanInterval ?? null,
    employerPlanPrice: user.employerPlanPrice ?? null,
    employer_plan_price: user.employerPlanPrice ?? null,
    employerPlanCurrency: user.employerPlanCurrency ?? null,
    employer_plan_currency: user.employerPlanCurrency ?? null,
    employerPlanActive: Boolean(user.employerPlanActive),
    employer_plan_active: Boolean(user.employerPlanActive),
    employerPlanPurchasedAt: toIso(user.employerPlanPurchasedAt),
    employer_plan_purchased_at: toIso(user.employerPlanPurchasedAt),
    employerPlanExpiresAt: toIso(user.employerPlanExpiresAt),
    employer_plan_expires_at: toIso(user.employerPlanExpiresAt),
    isProFreelancer: pro.freelancerIsPro,
    is_pro_freelancer: pro.freelancerIsPro,
    isProEmployer: pro.employerIsPro,
    is_pro_employer: pro.employerIsPro,
    followOnboardingRequired: Boolean(user.followOnboardingRequired),
    follow_onboarding_required: Boolean(user.followOnboardingRequired),
    followOnboardingCompletedAt: toIso(user.followOnboardingCompletedAt),
    follow_onboarding_completed_at: toIso(user.followOnboardingCompletedAt)
  };
};

// JWT Secret from environment variables (fallback for development)
export const JWT_SECRET = jwtSecret();
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const authFailureReason = (error: unknown): string => {
  const code = String((error as { code?: unknown })?.code || '').toUpperCase();
  const message = String((error as { message?: unknown })?.message || '').toLowerCase();
  if (code === 'P2025' || message.includes('not found')) return 'not_found';
  if (code.startsWith('P') || message.includes('prisma') || message.includes('database')) return 'database_error';
  if (message.includes('timeout')) return 'timeout';
  return 'internal_error';
};
const logAuthFailure = (event: string, error?: unknown) => {
  console.warn(`[auth] ${event}`, { reason: error ? authFailureReason(error) : 'unspecified' });
};
const invalidCredentialsResponse = (res: Response) =>
  res.status(401).json({
    success: false,
    error: 'Invalid email or password',
    code: 'INVALID_CREDENTIALS'
  });

const isMissingLoginField = (value: unknown) =>
  typeof value !== 'string' || value.trim().length === 0;

type ClientMeta = { ip?: string; userAgent?: string };

export const getClientMeta = (req: Request): ClientMeta => {
  const headers = req.headers || {};
  const ip = getTrustedClientIp(req);
  const userAgent = String(headers['user-agent'] || '');
  return { ip: ip || undefined, userAgent: userAgent || undefined };
};

export const logAuthEvent = async (payload: { userId?: string | null; email?: string | null; event: string; meta?: any }, req?: Request) => {
  try {
    const meta = payload.meta || {};
    const client: ClientMeta = req ? getClientMeta(req) : {};
    await prisma.authAuditLog.create({
      data: {
        userId: payload.userId || null,
        email: payload.email || null,
        event: payload.event,
        ip: client.ip,
        userAgent: client.userAgent,
        meta
      }
    });
  } catch (error) {
    logAuthFailure('audit_write_failed', error);
  }
};

const isStrongPassword = (value: string) => {
  if (!value || value.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  return hasLetter && hasNumber;
};

// Registration Controller
export const register = async (req: Request, res: Response) => {
  try {
    let { email, name, password, role = 'EMPLOYER' } = req.body; // Default role to EMPLOYER if not provided
    const recaptchaToken = req.body?.recaptchaToken || req.body?.recaptcha_token;

    // Normalize inputs
    email = (email || '').toString().trim().toLowerCase();
    name = (name || '').toString().trim();
    role = (role || 'EMPLOYER').toString().trim().toUpperCase();

    // Validate input
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    // Enforce reCAPTCHA if enabled in platform settings
    const recaptchaCheck = await verifyRecaptcha(recaptchaToken, req.ip);
    if (recaptchaCheck.enforced && !recaptchaCheck.success) {
      return res.status(400).json({ error: recaptchaCheck.error || 'reCAPTCHA verification failed' });
    }

    // Phase 30 — Scrolith Human Verification (signup)
    if ((await enforceHumanVerification(req, res, 'signup')) === false) return undefined;

    // General Settings → Allow Registrations
    try {
      const { getSystemControls } = await import('../services/systemControls.service');
      const controls = await getSystemControls();
      if (!controls.registrationsEnabled) {
        return res.status(403).json({
          success: false,
          error: 'New registrations are currently disabled by the platform administrator.',
          code: 'REGISTRATIONS_DISABLED'
        });
      }
    } catch (regGateErr) {
      console.error(
        JSON.stringify({
          severity: 'ERROR',
          time: new Date().toISOString(),
          message: 'security.registration_gate_failed_closed',
          component: 'auth.register'
        })
      );
      return res.status(503).json({
        success: false,
        error: 'Registration is temporarily unavailable. Please try again shortly.',
        code: 'REGISTRATION_GATE_UNAVAILABLE'
      });
    }

    // Validate role - only allow known roles for self-registration
    const allowedRoles = new Set(['FREELANCER', 'EMPLOYER', 'CLIENT']);
    if (!allowedRoles.has(role)) {
      // default to EMPLOYER if invalid
      role = 'EMPLOYER';
    }

    // Check if user already exists (email is stored normalized)
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash the password
    const saltRounds = 12; // Consider making this configurable
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create the user in the database
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashedPassword,
        role: role as PrismaRole,
        isActive: true,
        kycStatus: 'PENDING' as PrismaKYCStatus,
        followOnboardingRequired: true,
        followOnboardingCompletedAt: null
      },
    });

    // Generate JWT token
    const token = (jwt as any).sign(
      buildAuthClaims({ id: user.id, email: user.email, role: user.role }),
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN as string }
    );

    // Send success response with user data and token
    return res.status(201).json({
      success: true,
      user: mapUserPayload(user),
      token,
    });
  } catch (error) {
    logAuthFailure('registration_failed', error);
    // Check if it's a Prisma validation error (e.g., unknown argument, constraint violation)
    if (error instanceof Error && ('code' in error || error.message.includes('Unknown argument') || error.message.includes('Argument'))) {
      return res.status(500).json({ error: 'Database schema error during registration. Please contact support.' });
    } else {
      return res.status(500).json({ error: 'Internal server error during registration' });
    }
  }
};

// Login Controller
export const login = async (req: Request, res: Response) => {
  try {
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';

    console.log('[auth.login] attempt');

    // Validate input
    if (isMissingLoginField(rawEmail) || isMissingLoginField(rawPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Phase 30 — Scrolith Human Verification (login)
    if ((await enforceHumanVerification(req, res, 'login')) === false) return undefined;

    // Find user by normalized email (safe select with fallback for older schemas)
    const user = await safeFindUserByEmail(email);
    console.log('[auth.login] lookup_completed', { found: Boolean(user) });

    // Check if user exists and password is correct
    if (!user) {
      console.log('[auth.login] no user');
      return invalidCredentialsResponse(res);
    }
    if (user.isActive === false) {
      console.warn('[auth.login] inactive user login blocked');
      return res.status(403).json({
        success: false,
        error: 'Account is disabled or suspended',
        code: 'ACCOUNT_DISABLED'
      });
    }
    if (typeof user.passwordHash !== 'string' || user.passwordHash.trim().length === 0) {
      console.log('[auth.login] password_unavailable');
      return invalidCredentialsResponse(res);
    }
    let pwMatch = false;
    try {
      pwMatch = await bcrypt.compare(password, user.passwordHash);
    } catch (compareError) {
      logAuthFailure('password_compare_failed', compareError);
      return invalidCredentialsResponse(res);
    }
    console.log('[auth.login] password match?', pwMatch);
    if (!pwMatch) {
      return invalidCredentialsResponse(res);
    }

    // Staff account guardrails at login time.
    let staffProfile: any = null;
    try {
      staffProfile = await prisma.staffUser.findUnique({
        where: { userId: user.id },
        include: {
          role: {
            select: { id: true, name: true, isActive: true }
          }
        }
      });
    } catch (staffError) {
      logAuthFailure('staff_account_check_failed', staffError);
      return res.status(500).json({
        success: false,
        error: 'Unable to complete login. Please try again shortly.',
        code: 'LOGIN_GUARD_FAILED'
      });
    }
    if (staffProfile) {
      if (staffProfile.status !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          error: 'Staff account is not active',
          code: 'STAFF_ACCOUNT_INACTIVE'
        });
      }
      if (!staffProfile.role?.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Assigned staff role is inactive',
          code: 'STAFF_ROLE_INACTIVE'
        });
      }
    }

    // Update last login timestamp
    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      if (staffProfile) {
        await prisma.staffUser.update({
          where: { id: staffProfile.id },
          data: { lastLoginAt: new Date() }
        });
      }
    } catch (e) {
      logAuthFailure('last_login_update_failed', e);
    }

    // Admin / enrolled-user 2FA gate — MUST fail closed on any error (never issue session JWT)
    try {
      const full2fa = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          role: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
          twoFactorWaivedUntil: true
        }
      });
      const { evaluateAdmin2FAGate } = await import('./admin2fa.controller');
      const gate = await evaluateAdmin2FAGate(full2fa || user);
      if (gate.required) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          challengeToken: gate.challengeToken,
          code: '2FA_REQUIRED',
          message: 'Enter the 6-digit code from Google Authenticator to complete admin sign-in.',
          user: { id: user.id, email: user.email, role: user.role }
        });
      }
    } catch (twoFaErr) {
      logAuthFailure('2fa_gate_failed', twoFaErr);
      return res.status(503).json({
        success: false,
        error: 'Unable to complete security verification. Please try again shortly.',
        code: '2FA_GATE_UNAVAILABLE'
      });
    }

    // Step-up approval for a new browser/mobile identity. Legacy clients that
    // do not send device metadata keep the existing login behavior.
    const deviceMetadata = normalizeLoginDeviceMetadata(req.body?.device);
    const deviceApproval = await evaluateLoginDevice(user.id, deviceMetadata, getClientMeta(req));
    if (deviceApproval.required) {
      return res.status(200).json({
        success: true,
        requiresLoginApproval: true,
        code: 'LOGIN_APPROVAL_REQUIRED',
        message: 'Approve this login from an existing trusted session.',
        loginApproval: {
          id: deviceApproval.attemptId,
          approvalToken: deviceApproval.approvalToken,
          expiresAt: deviceApproval.expiresAt.toISOString()
        },
        user: { id: user.id, email: user.email, role: user.role }
      });
    }
    if (!('bypassed' in deviceApproval)) {
      await registerTrustedDevice(user.id, deviceMetadata);
    }
    if ('bypassed' in deviceApproval && deviceApproval.bypassed) {
      void logAuthEvent({
        userId: user.id,
        email: user.email,
        event: 'LOGIN_APPROVAL_WAIVER_USED',
        meta: { expiresAt: deviceApproval.waiverExpiresAt?.toISOString?.() || null }
      }, req);
    }

    // Generate JWT token
    let token = '';
    try {
      token = (jwt as any).sign(
        buildAuthClaims({ id: user.id, email: user.email, role: user.role }),
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as string }
      );
    } catch (signError) {
      logAuthFailure('jwt_signing_failed', signError);
      return res.status(500).json({
        success: false,
        error: 'Unable to complete login. Please try again shortly.',
        code: 'TOKEN_SIGN_FAILED'
      });
    }

    // Persist token in an HttpOnly cookie so sessions survive reloads even if
    // browser storage is blocked/cleared.
    res.cookie('Scrolith_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    // Send success response with user data and token
    return res.status(200).json({
      success: true,
      user: mapUserPayload(user),
      token,
      accessToken: token,
      forcePasswordReset: Boolean(staffProfile?.forcePasswordReset),
    });
  } catch (error) {
    logAuthFailure('login_failed', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during login',
      code: 'LOGIN_INTERNAL'
    });
  }
};

export const exchangeApprovedLogin = async (req: Request, res: Response) => {
  try {
    const attemptId = String(req.body?.attemptId || '').trim();
    const approvalToken = String(req.body?.approvalToken || '').trim();
    if (!attemptId || !approvalToken) {
      return res.status(400).json({ success: false, error: 'attemptId and approvalToken are required', code: 'MISSING_APPROVAL_CREDENTIALS' });
    }

    const row = await consumeApprovedLogin(attemptId, approvalToken);
    const user = await safeFindUserById(row.userId);
    if (!user || user.isActive === false) {
      return res.status(403).json({ success: false, error: 'Account unavailable', code: 'ACCOUNT_UNAVAILABLE' });
    }

    await registerTrustedDevice(user.id, getLoginApprovalMetadata(row));
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = (jwt as any).sign(
      buildAuthClaims({ id: user.id, email: user.email, role: user.role }),
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as string }
    );
    res.cookie('Scrolith_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    return res.json({
      success: true,
      user: mapUserPayload(user),
      token,
      accessToken: token
    });
  } catch (error: any) {
    const message = String(error?.message || 'Login approval exchange failed');
    const status = message.includes('invalid') ? 401 : 409;
    return res.status(status).json({ success: false, error: message, code: 'LOGIN_APPROVAL_EXCHANGE_FAILED' });
  }
};

// Get Current User Controller (requires auth middleware)
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // This function assumes `req.user` is populated by the `authMiddleware`
    const userId = req.user?.id;

    const user = await safeFindUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user: mapUserPayload(user) });
  } catch (error) {
    logAuthFailure('current_user_failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFollowOnboardingController = async (req: Request, res: Response) => {
  try {
    const user = await safeFindUserById(req.user?.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const onboarding = await getFollowOnboardingStatus(user.id, {
      required: Boolean((user as any)?.followOnboardingRequired),
      completedAt: (user as any)?.followOnboardingCompletedAt || null
    });

    return res.status(200).json({
      success: true,
      data: {
        user: mapUserPayload(user),
        onboarding
      }
    });
  } catch (error) {
    logAuthFailure('follow_onboarding_load_failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load follow onboarding state' });
  }
};

export const completeFollowOnboardingController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = await completeFollowOnboarding(userId);

    return res.status(200).json({
      success: true,
      data: {
        user: mapUserPayload(result.user),
        onboarding: result.onboarding
      }
    });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to complete follow onboarding');
    const status = message.toLowerCase().includes('follow at least') ? 409 : 500;
    logAuthFailure('follow_onboarding_complete_failed', error);
    return res.status(status).json({ success: false, error: message });
  }
};

// Logout Controller (typically handled client-side by clearing the token, but can add server-side logic like blacklisting if needed)
export const logout = async (req: Request, res: Response) => {
  // Logout is typically handled client-side by clearing the stored JWT token (e.g., from localStorage or sessionStorage).
  // Server-side logic might involve blacklisting the token if using refresh tokens or implementing a token revocation list.
  // For now, just send a confirmation response.
  try {
    res.clearCookie('Scrolith_token', { path: '/' });
  } catch {}
  res.status(200).json({ message: 'Logged out successfully' });
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Phase 30 — Scrolith Human Verification (forgot password)
    if ((await enforceHumanVerification(req, res, 'forgot_password')) === false) return undefined;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true }
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null }
      });

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });

      const resetLink =
        toAbsoluteFrontendUrl(`/auth/reset-password?token=${encodeURIComponent(rawToken)}`) ||
        `https://scrolith.com/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

      await sendSystemMessage({
        templateKey: 'password_reset',
        userId: user.id,
        user,
        email: user.email,
        context: {
          reset: { link: resetLink, expiresMinutes: PASSWORD_RESET_TTL_MINUTES }
        }
      });

      await logAuthEvent({ userId: user.id, email, event: 'password_reset_requested' }, req);
    } else {
      await logAuthEvent({ email, event: 'password_reset_requested_unknown' }, req);
    }

    return res.json({
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.'
    });
  } catch (error) {
    logAuthFailure('forgot_password_failed', error);
    return res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    // Phase 30 — Scrolith Human Verification (password reset)
    if ((await enforceHumanVerification(req, res, 'password_reset')) === false) return undefined;

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters and include a letter and a number.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    if (!record || !record.user) {
      await logAuthEvent({ email: undefined, event: 'password_reset_invalid_token' }, req);
      return res.status(400).json({ success: false, error: 'Reset token is invalid or expired' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      })
    ]);

    await logAuthEvent({ userId: record.userId, email: record.user.email, event: 'password_reset_completed' }, req);

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    logAuthFailure('reset_password_failed', error);
    return res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
};
