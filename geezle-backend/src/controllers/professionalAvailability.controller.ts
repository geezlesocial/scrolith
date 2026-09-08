import { Request, Response } from 'express';
import {
  getOrCreateProfessionalAvailability,
  serializeProfessionalAvailability,
  setProfessionalAvailabilityState,
  updateProfessionalAvailability
} from '../services/professionalAvailability.service';
import prisma from '../utils/prismaClient';
import { emitPublicProfileStatus } from '../utils/profileStatusRealtime';

const authId = (req: Request) => req.user?.id;
const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message });

export const getMyAvailability = async (req: Request, res: Response) => {
  const userId = authId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');
  try {
    const availability = await getOrCreateProfessionalAvailability(userId);
    return ok(res, serializeProfessionalAvailability(availability));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load availability');
  }
};

export const updateMyAvailability = async (req: Request, res: Response) => {
  const userId = authId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');
  try {
    const availability = await updateProfessionalAvailability(userId, req.body || {});
    await emitPublicProfileStatus(req, userId, 'profile:availability_updated');
    return ok(res, serializeProfessionalAvailability(availability));
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Invalid availability settings');
  }
};

export const pauseMyAvailability = async (req: Request, res: Response) => updateAvailabilityState(req, res, 'PAUSED');
export const resumeMyAvailability = async (req: Request, res: Response) => updateAvailabilityState(req, res, 'ACTIVE');
export const disableMyAvailability = async (req: Request, res: Response) => updateAvailabilityState(req, res, 'INACTIVE');

const updateAvailabilityState = async (req: Request, res: Response, status: 'ACTIVE' | 'PAUSED' | 'INACTIVE') => {
  const userId = authId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');
  try {
    const availability = await setProfessionalAvailabilityState(userId, status);
    await emitPublicProfileStatus(req, userId, 'profile:availability_updated');
    return ok(res, serializeProfessionalAvailability(availability));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to update availability');
  }
};

export const getPublicAvailability = async (req: Request, res: Response) => {
  const userId = req.params.userId;
  if (!userId) return fail(res, 400, 'Missing userId');
  try {
    const availability = await prisma.professionalAvailability.findUnique({ where: { userId } });
    return ok(res, serializeProfessionalAvailability(availability, { publicOnly: true }));
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load availability');
  }
};
