import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  getOrCreateClientHiringStatus,
  isClientOrEmployerRole,
  serializeClientHiringStatus,
  setClientHiringState,
  updateClientHiringStatus
} from '../services/clientHiringStatus.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message });
const authUser = (req: Request) => req.user;

const requireClientOrEmployer = (req: Request, res: Response) => {
  const user = authUser(req);
  if (!user?.id) {
    fail(res, 401, 'Unauthorized');
    return null;
  }
  if (!isClientOrEmployerRole(user.role)) {
    fail(res, 403, 'We Are Hiring is available for client and employer accounts');
    return null;
  }
  return user;
};

export const getMyClientHiringStatus = async (req: Request, res: Response) => {
  const user = requireClientOrEmployer(req, res);
  if (!user) return undefined;
  try {
    const status = await getOrCreateClientHiringStatus(user.id);
    return ok(res, serializeClientHiringStatus(status));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load hiring status');
  }
  return undefined;
};

export const updateMyClientHiringStatus = async (req: Request, res: Response) => {
  const user = requireClientOrEmployer(req, res);
  if (!user) return undefined;
  try {
    const status = await updateClientHiringStatus(user.id, req.body || {});
    return ok(res, serializeClientHiringStatus(status));
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Invalid hiring settings');
  }
  return undefined;
};

const updateState = async (req: Request, res: Response, state: 'ACTIVE' | 'PAUSED' | 'INACTIVE') => {
  const user = requireClientOrEmployer(req, res);
  if (!user) return undefined;
  try {
    const status = await setClientHiringState(user.id, state);
    return ok(res, serializeClientHiringStatus(status));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to update hiring status');
  }
  return undefined;
};

export const pauseMyClientHiringStatus = (req: Request, res: Response) => updateState(req, res, 'PAUSED');
export const resumeMyClientHiringStatus = (req: Request, res: Response) => updateState(req, res, 'ACTIVE');
export const disableMyClientHiringStatus = (req: Request, res: Response) => updateState(req, res, 'INACTIVE');

export const getPublicClientHiringStatus = async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!userId) return fail(res, 400, 'Missing userId');
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clientHiringStatus: true }
    });
    if (!user) return fail(res, 404, 'User not found');
    return ok(res, serializeClientHiringStatus(user.clientHiringStatus, { publicOnly: true, targetRole: user.role }));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load hiring status');
  }
};
