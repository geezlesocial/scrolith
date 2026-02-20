import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { sendSystemMessage } from '../services/systemMessaging';
import realtime from '../utils/realtime';
import EVENTS from '../realtime/events';

const KYC_FORM_SCOPE = 'kyc_form';

const DEFAULT_KYC_FORM_CONFIG = {
  version: 1,
  copy: {
    title: 'KYC Verification',
    subtitle: 'Verify your identity to access all platform features.',
    introMessage: 'Please provide your personal information and upload required documents.',
    personalSectionTitle: 'Personal Information',
    addressSectionTitle: 'Address Information',
    documentsSectionTitle: 'Document Upload',
    submitLabel: 'Submit for Verification',
    updateLabel: 'Update Submission'
  },
  personalFields: [
    { key: 'firstName', section: 'personal', label: 'First Name', type: 'text', required: true, enabled: true, order: 10 },
    { key: 'lastName', section: 'personal', label: 'Last Name', type: 'text', required: true, enabled: true, order: 20 },
    { key: 'dateOfBirth', section: 'personal', label: 'Date of Birth', type: 'date', required: true, enabled: true, order: 30 },
    { key: 'nationality', section: 'personal', label: 'Nationality', type: 'text', required: false, enabled: true, order: 40 },
    { key: 'phoneNumber', section: 'contact', label: 'Phone Number', type: 'tel', required: false, enabled: true, order: 50 },
    { key: 'email', section: 'contact', label: 'Email', type: 'email', required: false, enabled: true, order: 60 },
    { key: 'address.street', section: 'address', label: 'Street Address', type: 'text', required: false, enabled: true, order: 70 },
    { key: 'address.city', section: 'address', label: 'City', type: 'text', required: false, enabled: true, order: 80 },
    { key: 'address.state', section: 'address', label: 'State/Province', type: 'text', required: false, enabled: true, order: 90 },
    { key: 'address.postalCode', section: 'address', label: 'Postal Code', type: 'text', required: false, enabled: true, order: 100 },
    { key: 'address.country', section: 'address', label: 'Country', type: 'text', required: false, enabled: true, order: 110 }
  ],
  documentGroups: [
    {
      key: 'identity',
      label: 'Identity Documents',
      description: 'Choose one government-issued identity document.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'passport', label: 'Passport', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'drivers_license', label: "Driver's License", required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'national_id', label: 'National ID', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'address',
      label: 'Address Proof',
      description: 'Provide one document that proves your current address.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'utility_bill', label: 'Utility Bill', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'bank_statement', label: 'Bank Statement', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'address_proof', label: 'Address Proof', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'selfie',
      label: 'Selfie Holding ID',
      description: 'Capture a live selfie while holding your ID. Gallery upload is disabled.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'selfie_with_id', label: 'Selfie Holding ID', required: true, cameraOnly: true, accept: 'image/*' }
      ]
    }
  ]
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNonEmptyString = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: any = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    out[key] = deepMergeReplaceArrays(existing ? existing[key] : undefined, incoming[key]);
  }
  return out;
};

const normalizeKycFieldConfig = (field: any, fallback: any) => {
  const source = isPlainObject(field) ? field : {};
  const base = isPlainObject(fallback) ? fallback : {};
  return {
    key: toNonEmptyString(source.key, String(base.key || '')),
    section: toNonEmptyString(source.section, String(base.section || 'personal')),
    label: toNonEmptyString(source.label, String(base.label || 'Field')),
    type: toNonEmptyString(source.type, String(base.type || 'text')),
    placeholder: String(source.placeholder ?? base.placeholder ?? '').trim(),
    required: source.required === undefined ? Boolean(base.required) : Boolean(source.required),
    enabled: source.enabled === undefined ? Boolean(base.enabled ?? true) : Boolean(source.enabled),
    order: Number(source.order ?? base.order ?? 0)
  };
};

const normalizeKycDocumentOption = (option: any, fallback: any) => {
  const source = isPlainObject(option) ? option : {};
  const base = isPlainObject(fallback) ? fallback : {};
  return {
    key: toNonEmptyString(source.key, String(base.key || 'document')),
    label: toNonEmptyString(source.label, String(base.label || 'Document')),
    description: String(source.description ?? base.description ?? '').trim(),
    required: source.required === undefined ? Boolean(base.required) : Boolean(source.required),
    cameraOnly: source.cameraOnly === undefined ? Boolean(base.cameraOnly) : Boolean(source.cameraOnly),
    accept: toNonEmptyString(source.accept, String(base.accept || 'image/*,application/pdf'))
  };
};

const normalizeKycDocumentGroup = (group: any, fallback: any) => {
  const source = isPlainObject(group) ? group : {};
  const base = isPlainObject(fallback) ? fallback : {};
  const fallbackOptions = Array.isArray(base.options) ? base.options : [];
  const mergedOptions = Array.isArray(source.options) ? source.options : fallbackOptions;
  return {
    key: toNonEmptyString(source.key, String(base.key || 'group')),
    label: toNonEmptyString(source.label, String(base.label || 'Document Group')),
    description: String(source.description ?? base.description ?? '').trim(),
    required: source.required === undefined ? Boolean(base.required) : Boolean(source.required),
    minRequired: Math.max(0, Number(source.minRequired ?? base.minRequired ?? 0)),
    options: mergedOptions
      .map((item: any, index: number) => normalizeKycDocumentOption(item, fallbackOptions[index] || {}))
      .filter((item: any) => item.key)
  };
};

const normalizeKycFormConfig = (raw: any) => {
  const merged = deepMergeReplaceArrays(DEFAULT_KYC_FORM_CONFIG, isPlainObject(raw) ? raw : {});
  const copy = isPlainObject(merged.copy) ? merged.copy : {};
  const defaultFields = Array.isArray(DEFAULT_KYC_FORM_CONFIG.personalFields)
    ? DEFAULT_KYC_FORM_CONFIG.personalFields
    : [];
  const defaultGroups = Array.isArray(DEFAULT_KYC_FORM_CONFIG.documentGroups)
    ? DEFAULT_KYC_FORM_CONFIG.documentGroups
    : [];
  const personalFields = (Array.isArray(merged.personalFields) ? merged.personalFields : defaultFields)
    .map((field: any, index: number) => normalizeKycFieldConfig(field, defaultFields[index] || {}))
    .filter((field: any) => field.key);
  const documentGroups = (Array.isArray(merged.documentGroups) ? merged.documentGroups : defaultGroups)
    .map((group: any, index: number) => normalizeKycDocumentGroup(group, defaultGroups[index] || {}))
    .filter((group: any) => group.key && Array.isArray(group.options) && group.options.length > 0);
  return {
    version: Number(merged.version || 1),
    copy: {
      title: toNonEmptyString(copy.title, DEFAULT_KYC_FORM_CONFIG.copy.title),
      subtitle: toNonEmptyString(copy.subtitle, DEFAULT_KYC_FORM_CONFIG.copy.subtitle),
      introMessage: toNonEmptyString(copy.introMessage, DEFAULT_KYC_FORM_CONFIG.copy.introMessage),
      personalSectionTitle: toNonEmptyString(copy.personalSectionTitle, DEFAULT_KYC_FORM_CONFIG.copy.personalSectionTitle),
      addressSectionTitle: toNonEmptyString(copy.addressSectionTitle, DEFAULT_KYC_FORM_CONFIG.copy.addressSectionTitle),
      documentsSectionTitle: toNonEmptyString(copy.documentsSectionTitle, DEFAULT_KYC_FORM_CONFIG.copy.documentsSectionTitle),
      submitLabel: toNonEmptyString(copy.submitLabel, DEFAULT_KYC_FORM_CONFIG.copy.submitLabel),
      updateLabel: toNonEmptyString(copy.updateLabel, DEFAULT_KYC_FORM_CONFIG.copy.updateLabel)
    },
    personalFields,
    documentGroups
  };
};

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
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: KYC_FORM_SCOPE } });
    const config = normalizeKycFormConfig(record?.data);
    const identityGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'identity');
    const addressGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'address');
    const selfieGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'selfie');
    return res.json({
      success: true,
      data: {
        identity: Array.isArray(identityGroup?.options)
          ? identityGroup.options.map((item: any) => item.key)
          : ['passport', 'drivers_license', 'national_id'],
        address: Array.isArray(addressGroup?.options)
          ? addressGroup.options.map((item: any) => item.key)
          : ['utility_bill', 'bank_statement', 'address_proof'],
        selfie: Array.isArray(selfieGroup?.options)
          ? selfieGroup.options.map((item: any) => item.key)
          : ['selfie_with_id']
      }
    });
  } catch {
    return res.json({
      success: true,
      data: {
        identity: ['passport', 'drivers_license', 'national_id'],
        address: ['utility_bill', 'bank_statement', 'address_proof'],
        selfie: ['selfie_with_id']
      }
    });
  }
};

export const getKycFormConfig = async (_req: Request, res: Response) => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: KYC_FORM_SCOPE } });
    const data = normalizeKycFormConfig(record?.data);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get KYC form config error:', error);
    return res.json({ success: true, data: normalizeKycFormConfig(DEFAULT_KYC_FORM_CONFIG) });
  }
};

export const getKycFormConfigAdmin = async (req: Request, res: Response) => {
  return getKycFormConfig(req, res);
};

export const updateKycFormConfig = async (req: Request, res: Response) => {
  try {
    const payload = isPlainObject(req.body) ? req.body : {};
    const existing = await prisma.appSetting.findUnique({ where: { scope: KYC_FORM_SCOPE } });
    const merged = deepMergeReplaceArrays(normalizeKycFormConfig(existing?.data), payload);
    const normalized = normalizeKycFormConfig(merged);
    await prisma.appSetting.upsert({
      where: { scope: KYC_FORM_SCOPE },
      create: { scope: KYC_FORM_SCOPE, data: normalized },
      update: { data: normalized }
    });
    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as
      | { emit?: (ev: string, payload: unknown) => void }
      | undefined;
    io?.emit?.('kyc:form_config_updated', { settings: normalized, timestamp: Date.now() });
    return res.json({ success: true, data: normalized });
  } catch (error: any) {
    console.error('Update KYC form config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update KYC form config' });
  }
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
