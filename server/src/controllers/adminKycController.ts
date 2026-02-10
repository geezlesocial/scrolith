import { Request, Response } from 'express';
import { prisma } from '../db';

const normalizeStatus = (status?: string) => {
  const raw = (status || '').toString().toLowerCase();
  if (!raw || raw === 'pending' || raw === 'submitted') return 'Pending';
  if (raw === 'approved' || raw === 'approve') return 'Approved';
  if (raw === 'rejected' || raw === 'reject') return 'Rejected';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const parseSubmission = (payload: string | null | undefined) => {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
};

export const getKycRequests = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const records = await prisma.kYCSubmission.findMany({ orderBy: { createdAt: 'desc' } });
  const mapped = records.map((rec) => {
    const submission = parseSubmission(rec.submission);
    const type = submission.type || submission.documentType || submission.docType || 'ID';
    const userName = submission.userName || submission.fullName || submission.name || rec.userId;
    return {
      id: rec.id,
      userId: rec.userId,
      userName,
      type,
      status: normalizeStatus(rec.status),
      dateSubmitted: rec.createdAt,
      // legacy snake_case fields for older UIs
      user_id: rec.userId,
      user_name: userName,
      date_submitted: rec.createdAt,
      admin_notes: rec.rejectionReason || null,
      submission
    };
  });
  return res.json({ success: true, data: mapped });
};

export const updateKycStatus = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const { status, notes } = req.body || {};
  const normalized = (status || '').toString().toLowerCase();
  const storedStatus = normalized || undefined;
  const updated = await prisma.kYCSubmission.update({
    where: { id },
    data: {
      status: storedStatus,
      rejectionReason: notes || undefined
    }
  });
  const submission = parseSubmission(updated.submission);
  const payload = {
    ...updated,
    submission,
    status: normalizeStatus(updated.status)
  };
  return res.json({ success: true, data: payload });
};

