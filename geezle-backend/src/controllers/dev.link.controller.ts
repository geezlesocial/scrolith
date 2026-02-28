import { Request, Response } from 'express';
import { randomInt } from 'crypto';
import prisma from '../utils/prismaClient';
import {
  DEV_LINK_REQUEST_STATUS,
  DEV_LINK_STATUS,
  createDeveloperAuditLog,
  emitDeveloperEvent,
  finalizeDeveloperLink,
  hashSensitiveValue,
  markExpiredLinkRequests,
  maskEmail
} from '../services/developerPlatform.service';

const getRequestMeta = (req: Request) => ({
  ip: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 255) || null,
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null
});

const asLookupType = (value: unknown): 'EMAIL' | 'USERNAME' =>
  String(value || '').trim().toUpperCase() === 'USERNAME' ? 'USERNAME' : 'EMAIL';

const asVerificationMethod = (value: unknown): 'SCROLITH_LOGIN_CONFIRM' | 'EMAIL_OTP' =>
  String(value || '').trim().toUpperCase() === 'EMAIL_OTP'
    ? 'EMAIL_OTP'
    : 'SCROLITH_LOGIN_CONFIRM';

const createLinkOtp = () => String(randomInt(100000, 999999));

export const getDevMe = async (req: Request, res: Response) => {
  try {
    const developerUser = req.developerUser;
    if (!developerUser) return res.status(404).json({ success: false, error: 'Developer profile not found.' });

    await markExpiredLinkRequests(developerUser.id);

    const pendingRequests = await prisma.developerLinkRequest.count({
      where: {
        developerUserId: developerUser.id,
        status: { in: [DEV_LINK_REQUEST_STATUS.CREATED, DEV_LINK_REQUEST_STATUS.OTP_SENT] }
      }
    });
    const appCount = developerUser.userId
      ? await prisma.developerApp.count({
          where: { ownerUserId: developerUser.userId }
        })
      : 0;

    return res.json({
      success: true,
      data: {
        id: developerUser.id,
        developerEmail: developerUser.developerEmail,
        developerUsername: developerUser.developerUsername,
        linkStatus: developerUser.linkStatus,
        linkedAt: developerUser.linkedAt,
        lastSyncedAt: developerUser.lastSyncedAt,
        syncSnapshot: developerUser.syncSnapshot || null,
        pendingLinkRequests: pendingRequests,
        appCount,
        capabilities: {
          canCreateApps: developerUser.linkStatus === DEV_LINK_STATUS.LINKED && Boolean(developerUser.userId),
          canRotateSecrets: developerUser.linkStatus === DEV_LINK_STATUS.LINKED && Boolean(developerUser.userId),
          canAccessLogs: developerUser.linkStatus === DEV_LINK_STATUS.LINKED && Boolean(developerUser.userId)
        }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load developer profile.' });
  }
};

export const requestDeveloperLink = async (req: Request, res: Response) => {
  try {
    const developerUser = req.developerUser;
    if (!developerUser) return res.status(404).json({ success: false, error: 'Developer profile not found.' });

    const lookupType = asLookupType(req.body?.lookupType);
    const lookupValue = String(req.body?.lookupValue || '').trim();
    const verificationMethod = asVerificationMethod(req.body?.verificationMethod);

    if (!lookupValue) return res.status(400).json({ success: false, error: 'lookupValue is required.' });

    let resolvedUser = null as null | { id: string; email: string; username: string | null };
    if (lookupType === 'EMAIL') {
      resolvedUser = await prisma.user.findFirst({
        where: { email: { equals: lookupValue, mode: 'insensitive' } },
        select: { id: true, email: true, username: true }
      });
    } else {
      resolvedUser = await prisma.user.findFirst({
        where: { username: { equals: lookupValue, mode: 'insensitive' } },
        select: { id: true, email: true, username: true }
      });
    }

    if (!resolvedUser) {
      await createDeveloperAuditLog({
        developerUserId: developerUser.id,
        actorUserId: req.user?.id || null,
        action: 'DEV_LINK_REQUEST_FAILED',
        status: 'NOT_FOUND',
        metadata: { lookupType, lookupValue },
        ...getRequestMeta(req)
      });
      return res.status(404).json({ success: false, error: 'Scrolith account not found for the supplied lookup.' });
    }

    await markExpiredLinkRequests(developerUser.id);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const otp = verificationMethod === 'EMAIL_OTP' ? createLinkOtp() : null;
    const linkRequest = await prisma.developerLinkRequest.create({
      data: {
        developerUserId: developerUser.id,
        lookupType,
        lookupValue,
        resolvedUserId: resolvedUser.id,
        verificationMethod,
        otpHash: otp ? hashSensitiveValue(otp) : null,
        expiresAt,
        status:
          verificationMethod === 'EMAIL_OTP'
            ? DEV_LINK_REQUEST_STATUS.OTP_SENT
            : DEV_LINK_REQUEST_STATUS.CREATED,
        ...getRequestMeta(req)
      }
    });

    await prisma.developerUser.update({
      where: { id: developerUser.id },
      data: { linkStatus: DEV_LINK_STATUS.PENDING_VERIFICATION }
    });

    await createDeveloperAuditLog({
      developerUserId: developerUser.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_LINK_REQUEST_CREATED',
      status: 'PENDING_VERIFICATION',
      metadata: {
        lookupType,
        verificationMethod,
        linkRequestId: linkRequest.id,
        resolvedUserId: resolvedUser.id
      },
      ...getRequestMeta(req)
    });

    emitDeveloperEvent(req, 'dev:link_status_updated', {
      developerUserId: developerUser.id,
      linkStatus: DEV_LINK_STATUS.PENDING_VERIFICATION
    });

    return res.json({
      success: true,
      data: {
        linkRequestId: linkRequest.id,
        lookupType,
        verificationMethod,
        status: linkRequest.status,
        expiresAt: linkRequest.expiresAt,
        matchedAccount: {
          username: resolvedUser.username || null,
          maskedEmail: maskEmail(resolvedUser.email)
        },
        ...(otp && process.env.NODE_ENV !== 'production'
          ? {
              _devOnlyOtp: otp
            }
          : {})
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create link request.' });
  }
};

export const verifyDeveloperLinkOtp = async (req: Request, res: Response) => {
  try {
    const developerUser = req.developerUser;
    if (!developerUser) return res.status(404).json({ success: false, error: 'Developer profile not found.' });

    const linkRequestId = String(req.body?.linkRequestId || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!linkRequestId || !otp) return res.status(400).json({ success: false, error: 'linkRequestId and otp are required.' });

    const linkRequest = await prisma.developerLinkRequest.findFirst({
      where: { id: linkRequestId, developerUserId: developerUser.id }
    });
    if (!linkRequest) return res.status(404).json({ success: false, error: 'Link request not found.' });
    if (linkRequest.verificationMethod !== 'EMAIL_OTP') {
      return res.status(400).json({ success: false, error: 'This link request does not use OTP verification.' });
    }
    if (!linkRequest.otpHash || linkRequest.status !== DEV_LINK_REQUEST_STATUS.OTP_SENT) {
      return res.status(400).json({ success: false, error: 'OTP verification is not available for this request.' });
    }
    if (linkRequest.expiresAt.getTime() < Date.now()) {
      await prisma.developerLinkRequest.update({
        where: { id: linkRequest.id },
        data: { status: DEV_LINK_REQUEST_STATUS.EXPIRED }
      });
      return res.status(400).json({ success: false, error: 'Link request has expired.' });
    }
    if (hashSensitiveValue(otp) !== linkRequest.otpHash) {
      await createDeveloperAuditLog({
        developerUserId: developerUser.id,
        actorUserId: req.user?.id || null,
        action: 'DEV_LINK_OTP_VERIFY_FAILED',
        status: 'INVALID_OTP',
        metadata: { linkRequestId },
        ...getRequestMeta(req)
      });
      return res.status(400).json({ success: false, error: 'Invalid OTP.' });
    }
    if (!linkRequest.resolvedUserId) {
      return res.status(400).json({ success: false, error: 'Link request does not have a resolved account.' });
    }

    await prisma.developerLinkRequest.update({
      where: { id: linkRequest.id },
      data: {
        status: DEV_LINK_REQUEST_STATUS.VERIFIED,
        verifiedAt: new Date()
      }
    });

    const linked = await finalizeDeveloperLink({
      developerUserId: developerUser.id,
      resolvedUserId: linkRequest.resolvedUserId,
      action: 'DEV_ACCOUNT_LINKED_OTP',
      actorUserId: req.user?.id,
      linkRequestId: linkRequest.id,
      ...getRequestMeta(req)
    });

    emitDeveloperEvent(req, 'dev:link_status_updated', {
      developerUserId: linked.id,
      linkStatus: linked.linkStatus,
      linkedAt: linked.linkedAt
    });

    return res.json({
      success: true,
      data: {
        linkStatus: linked.linkStatus,
        linkedAt: linked.linkedAt,
        lastSyncedAt: linked.lastSyncedAt,
        syncSnapshot: linked.syncSnapshot
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to verify OTP.' });
  }
};

export const confirmDeveloperLinkScrolithLogin = async (req: Request, res: Response) => {
  try {
    const developerUser = req.developerUser;
    if (!developerUser) return res.status(404).json({ success: false, error: 'Developer profile not found.' });

    const linkRequestId = String(req.body?.linkRequestId || '').trim();
    if (!linkRequestId) return res.status(400).json({ success: false, error: 'linkRequestId is required.' });

    const linkRequest = await prisma.developerLinkRequest.findFirst({
      where: { id: linkRequestId, developerUserId: developerUser.id }
    });
    if (!linkRequest) return res.status(404).json({ success: false, error: 'Link request not found.' });
    if (linkRequest.verificationMethod !== 'SCROLITH_LOGIN_CONFIRM') {
      return res.status(400).json({ success: false, error: 'This link request requires OTP verification.' });
    }
    if (linkRequest.status !== DEV_LINK_REQUEST_STATUS.CREATED) {
      return res.status(400).json({ success: false, error: 'Link request is no longer pending confirmation.' });
    }
    if (linkRequest.expiresAt.getTime() < Date.now()) {
      await prisma.developerLinkRequest.update({
        where: { id: linkRequest.id },
        data: { status: DEV_LINK_REQUEST_STATUS.EXPIRED }
      });
      return res.status(400).json({ success: false, error: 'Link request has expired.' });
    }
    if (!linkRequest.resolvedUserId) {
      return res.status(400).json({ success: false, error: 'Link request does not have a resolved account.' });
    }
    if (req.user?.id !== linkRequest.resolvedUserId) {
      return res.status(403).json({
        success: false,
        error: 'Please login as the target Scrolith account to confirm this link.'
      });
    }

    await prisma.developerLinkRequest.update({
      where: { id: linkRequest.id },
      data: { status: DEV_LINK_REQUEST_STATUS.VERIFIED, verifiedAt: new Date() }
    });

    const linked = await finalizeDeveloperLink({
      developerUserId: developerUser.id,
      resolvedUserId: linkRequest.resolvedUserId,
      action: 'DEV_ACCOUNT_LINKED_SCROLITH_LOGIN',
      actorUserId: req.user?.id,
      linkRequestId: linkRequest.id,
      ...getRequestMeta(req)
    });

    emitDeveloperEvent(req, 'dev:link_status_updated', {
      developerUserId: linked.id,
      linkStatus: linked.linkStatus,
      linkedAt: linked.linkedAt
    });

    return res.json({
      success: true,
      data: {
        linkStatus: linked.linkStatus,
        linkedAt: linked.linkedAt,
        lastSyncedAt: linked.lastSyncedAt,
        syncSnapshot: linked.syncSnapshot
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to confirm Scrolith login link.' });
  }
};
