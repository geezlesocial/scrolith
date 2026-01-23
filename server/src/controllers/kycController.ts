import { Request, Response } from 'express';
import { prisma } from '../db';

type KYCStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

const kycStore = new Map<string, any>();

export const getKYC = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const userId = user?.id || 'anonymous';
  if (prisma) {
    // Note: Prisma model name is `KYCSubmission` -> client property becomes `kYCSubmission`
    const rec = await prisma.kYCSubmission.findFirst({ where: { userId } });
    if (!rec) return res.json({ success: true, data: { status: 'not_submitted' } });
    const out = { ...rec, submission: rec.submission ? JSON.parse(rec.submission) : undefined };
    return res.json({ success: true, data: out });
  }
  const record = kycStore.get(userId) || { status: 'not_submitted' };
  return res.json({ success: true, data: record });
};

export const submitKYC = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const userId = user?.id || 'anonymous';
  const payload = req.body || {};
  if (prisma) {
    const rec = await prisma.kYCSubmission.create({ data: { userId, status: 'pending', submission: JSON.stringify(payload) } });
    const out = { ...rec, submission: payload };
    return res.json({ success: true, data: out });
  }
  const record = { id: `kyc_${userId}`, status: 'pending' as KYCStatus, submission: payload, createdAt: new Date() };
  kycStore.set(userId, record);
  return res.json({ success: true, data: record });
};

export const updateKYC = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  if (prisma) {
    const rec = await prisma.kYCSubmission.update({ where: { id }, data: { status: status || undefined, rejectionReason: rejectionReason || undefined } });
    const out = { ...rec, submission: rec.submission ? JSON.parse(rec.submission) : undefined };
    return res.json({ success: true, data: out });
  }
  // find by id in map
  let foundKey: string | null = null;
  for (const [k, v] of kycStore.entries()) {
    if (v.id === id) { foundKey = k; break; }
  }
  if (!foundKey) return res.status(404).json({ success: false, error: 'KYC record not found' });
  const rec = kycStore.get(foundKey);
  rec.status = status || rec.status;
  if (rejectionReason) rec.rejectionReason = rejectionReason;
  kycStore.set(foundKey, rec);
  return res.json({ success: true, data: rec });
};
