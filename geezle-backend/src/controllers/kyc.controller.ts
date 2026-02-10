import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { sendSystemMessage } from '../services/systemMessaging';
import realtime from '../utils/realtime';
import EVENTS from '../realtime/events';

const apiStatusFromDb = (status: string) => {
  const value = status.toUpperCase();
  if (value === 'APPROVED') return 'approved';
  if (value === 'UNDER_REVIEW') return 'under_review';
  if (value === 'REQUIRES_UPDATES') return 'requires_updates';
  if (value === 'REJECTED') return 'rejected';
  return 'pending';
};

const dbStatusFromApi = (status?: string) => {
  const value = (status || '').toLowerCase();
  if (value === 'approved') return 'APPROVED';
  if (value === 'under_review') return 'UNDER_REVIEW';
  if (value === 'requires_updates') return 'REQUIRES_UPDATES';
  if (value === 'rejected') return 'REJECTED';
  return 'PENDING';
};

const mapDocument = (doc: any) => ({
  id: doc.id,
  type: doc.type,
  file_id: doc.fileId,
  file_url: doc.fileUrl,
  status: doc.status,
  rejection_reason: doc.rejectionReason,
  uploaded_at: doc.uploadedAt.toISOString()
});

const mapSubmission = (submission: any) => ({
  id: submission.id,
  user_id: submission.userId,
  status: apiStatusFromDb(submission.status),
  submitted_at: submission.createdAt.toISOString(),
  reviewed_at: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
  reviewed_by: submission.reviewedBy || null,
  rejection_reason: submission.rejectionReason || null,
  documents: Array.isArray(submission.documents) ? submission.documents.map(mapDocument) : [],
  personal_info: submission.personalInfo || {},
  created_at: submission.createdAt.toISOString(),
  updated_at: submission.updatedAt.toISOString()
});

export const getKycStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const submission = await prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { documents: true }
    });

    if (!submission) {
      return res.json({ success: true, data: { status: 'not_submitted' } });
    }

    return res.json({ success: true, data: { status: apiStatusFromDb(submission.status), submission: mapSubmission(submission) } });
  } catch (error: any) {
    console.error('Get KYC status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load KYC status' });
  }
};

export const submitKyc = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const personalInfo = req.body?.personal_info || req.body?.personalInfo;
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];

    if (!personalInfo) {
      return res.status(400).json({ success: false, error: 'personal_info is required' });
    }

    const submission = await prisma.kYCSubmission.create({
      data: {
        userId,
        status: 'PENDING',
        personalInfo
      }
    });

    let createdDocs: any[] = [];
    if (documents.length > 0) {
      createdDocs = await Promise.all(documents.map(async (doc: any) => {
        const fileId = doc.file_id || doc.fileId;
        const file = fileId ? await prisma.file.findUnique({ where: { id: fileId } }) : null;
        return prisma.kYCDocument.create({
          data: {
            submissionId: submission.id,
            userId,
            type: doc.type,
            fileId,
            fileUrl: file?.url || '',
            status: 'pending'
          }
        });
      }));
    }

    await prisma.user.update({ where: { id: userId }, data: { kycStatus: 'PENDING' } });

    const payload = mapSubmission({ ...submission, documents: createdDocs });
    realtime.emitToUser(userId, EVENTS.KYC_UPDATED, {
      userId,
      submissionId: submission.id,
      status: 'pending'
    });
    realtime.emitToRoom('community:admin', 'kyc.submitted', {
      userId,
      submissionId: submission.id,
      status: 'pending',
      action: 'created'
    });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Submit KYC error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit KYC' });
  }
};

export const updateKyc = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const submission = await prisma.kYCSubmission.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    });

    if (!submission) return res.status(404).json({ success: false, error: 'KYC submission not found' });
    if (submission.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const personalInfo = req.body?.personal_info || req.body?.personalInfo;
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : [];

    const updated = await prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        personalInfo: personalInfo || submission.personalInfo,
        status: 'PENDING',
        rejectionReason: null
      }
    });

    let docs = submission.documents;
    if (documents.length > 0) {
      const createDocs = await Promise.all(documents.map(async (doc: any) => {
        const fileId = doc.file_id || doc.fileId;
        const file = fileId ? await prisma.file.findUnique({ where: { id: fileId } }) : null;
        return prisma.kYCDocument.create({
          data: {
            submissionId: submission.id,
            userId,
            type: doc.type,
            fileId,
            fileUrl: file?.url || '',
            status: 'pending'
          }
        });
      }));
      docs = [...docs, ...createDocs];
    }

    await prisma.user.update({ where: { id: userId }, data: { kycStatus: 'PENDING' } });

    const payload = mapSubmission({ ...updated, documents: docs });
    realtime.emitToUser(userId, EVENTS.KYC_UPDATED, {
      userId,
      submissionId: submission.id,
      status: 'pending'
    });
    realtime.emitToRoom('community:admin', 'kyc.submitted', {
      userId,
      submissionId: submission.id,
      status: 'pending',
      action: 'updated'
    });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update KYC error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update KYC' });
  }
};

export const uploadKycDocument = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const type = req.body?.type;
    const fileId = req.body?.file_id || req.body?.fileId;
    if (!type || !fileId) {
      return res.status(400).json({ success: false, error: 'type and file_id are required' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });

    const doc = await prisma.kYCDocument.create({
      data: {
        userId,
        type,
        fileId,
        fileUrl: file?.url || '',
        status: 'pending'
      }
    });

    return res.json({ success: true, data: { documentId: doc.id } });
  } catch (error: any) {
    console.error('Upload KYC document error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to upload document' });
  }
};

export const getKycDocumentTypes = async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      identity: ['passport', 'drivers_license', 'national_id'],
      address: ['utility_bill', 'bank_statement', 'address_proof']
    }
  });
};

export const listKycRequests = async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? dbStatusFromApi(String(req.query.status)) : undefined;
    const submissions = await prisma.kYCSubmission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } }, documents: true }
    });

    return res.json({
      success: true,
      data: submissions.map((submission) => ({
        ...mapSubmission(submission),
        user: submission.user
      }))
    });
  } catch (error: any) {
    console.error('List KYC requests error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load KYC requests' });
  }
};

export const updateKycStatus = async (req: Request, res: Response) => {
  try {
    const submissionId = req.params.id;
    const status = dbStatusFromApi(req.body?.status);
    const rejectionReason = req.body?.notes || req.body?.rejection_reason || null;

    const submission = await prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) return res.status(404).json({ success: false, error: 'KYC submission not found' });

    const updated = await prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        status,
        rejectionReason,
        reviewedAt: new Date(),
        reviewedBy: req.user?.id || null
      }
    });

    await prisma.user.update({
      where: { id: submission.userId },
      data: { kycStatus: status === 'APPROVED' ? 'VERIFIED' : status === 'REJECTED' ? 'REJECTED' : 'PENDING' }
    });

    const payload = mapSubmission(updated);
    const apiStatus = apiStatusFromDb(updated.status);
    realtime.emitToUser(submission.userId, EVENTS.KYC_UPDATED, {
      userId: submission.userId,
      submissionId,
      status: apiStatus,
      rejectionReason: rejectionReason || undefined
    });
    realtime.emitToRoom('community:admin', 'kyc.updated', {
      userId: submission.userId,
      submissionId,
      status: apiStatus
    });

    try {
      const kycLink = `/dashboard?tab=kyc`;
      void sendSystemMessage({
        templateKey: 'kyc_status_update',
        userId: submission.userId,
        context: {
          kyc: { status: apiStatus, link: kycLink }
        },
        actionUrl: kycLink,
        typeOverride: 'kyc'
      });
    } catch (notifyError) {
      console.warn('KYC status notification failed', notifyError);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update KYC status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update KYC status' });
  }
};
