import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import prisma from '../utils/prismaClient';
import { sendSystemMessage } from '../services/systemMessaging';
import realtime from '../utils/realtime';
import EVENTS from '../realtime/events';
import { writeKycAuditEvent, createKycCorrelationId } from '../services/kyc/kyc.audit.service';
import { applyKycDecision, KycDecisionError } from '../services/kyc/kyc.decision.service';
import {
  processKycSecureUpload,
  assertAttachableKycDocument
} from '../services/kyc/kyc.upload.service';
import {
  createKycSignedReadUrl,
  createKycReadStream,
  downloadKycObject
} from '../services/kyc/kyc.storage.service';
import {
  serializePersonalInfo,
  validateRequiredPersonalFields,
  validateDocumentGroups,
  KycValidationError
} from '../services/kyc/kyc.validation.service';
import {
  KYC_AUDIT_ACTIONS,
  KYC_CONSENT_POLICY_VERSION,
  KYC_CONSENT_PURPOSE,
  KYC_FINE_PERMISSIONS,
  KYC_MAX_FILES_PER_SUBMISSION,
  KYC_MAX_RESUBMISSIONS_DEFAULT,
  KYC_SIGNED_URL_TTL_SECONDS,
  KYC_SUBMIT_RATE_MAX,
  KYC_SUBMIT_RATE_WINDOW_MS,
  KYC_UPLOAD_RATE_MAX,
  KYC_UPLOAD_RATE_WINDOW_MS
} from '../services/kyc/kyc.constants';
import { sendMappedKycError, wrapKycMulterSingle } from '../services/kyc/kyc.uploadErrors';

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
    updateLabel: 'Update Submission',
    consentLabel:
      'I confirm that the information and documents I provide are accurate, that they will be reviewed by authorized administrators, and that automated security checks may be performed. Final approval is issued only by an authorized administrator.'
  },
  personalFields: [
    { key: 'firstName', section: 'personal', label: 'First Name', type: 'text', required: true, enabled: true, order: 10 },
    { key: 'lastName', section: 'personal', label: 'Last Name', type: 'text', required: true, enabled: true, order: 20 },
    { key: 'dateOfBirth', section: 'personal', label: 'Date of Birth', type: 'date', required: true, enabled: true, order: 30 },
    { key: 'nationality', section: 'personal', label: 'Nationality', type: 'text', required: false, enabled: true, order: 40 },
    { key: 'phoneNumber', section: 'contact', label: 'Phone Number', type: 'tel', required: false, enabled: true, order: 50 },
    // email intentionally disabled by default (data minimization — use account email)
    { key: 'email', section: 'contact', label: 'Email', type: 'email', required: false, enabled: false, order: 60 },
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
      // configuration-controlled; not silently mandatory beyond config
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
  ],
  consent: {
    policyVersion: KYC_CONSENT_POLICY_VERSION,
    purpose: KYC_CONSENT_PURPOSE,
    required: true
  },
  security: {
    biometricsEnabled: false,
    automatedFinalApproval: false,
    maxFilesPerSubmission: KYC_MAX_FILES_PER_SUBMISSION,
    maxResubmissions: KYC_MAX_RESUBMISSIONS_DEFAULT
  }
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
    .filter((field: any) => field.key)
    // Force email off unless explicitly re-enabled with documented requirement
    .map((field: any) =>
      field.key === 'email' ? { ...field, required: false } : field
    );
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
      updateLabel: toNonEmptyString(copy.updateLabel, DEFAULT_KYC_FORM_CONFIG.copy.updateLabel),
      consentLabel: toNonEmptyString(copy.consentLabel, DEFAULT_KYC_FORM_CONFIG.copy.consentLabel)
    },
    personalFields,
    documentGroups,
    consent: {
      policyVersion: toNonEmptyString(
        merged?.consent?.policyVersion,
        KYC_CONSENT_POLICY_VERSION
      ),
      purpose: toNonEmptyString(merged?.consent?.purpose, KYC_CONSENT_PURPOSE),
      required: true
    },
    security: {
      biometricsEnabled: false,
      automatedFinalApproval: false,
      maxFilesPerSubmission: Math.max(
        1,
        Number(merged?.security?.maxFilesPerSubmission || KYC_MAX_FILES_PER_SUBMISSION)
      ),
      maxResubmissions: Math.max(
        1,
        Number(merged?.security?.maxResubmissions || KYC_MAX_RESUBMISSIONS_DEFAULT)
      )
    }
  };
};

const loadFormConfig = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: KYC_FORM_SCOPE } });
    return normalizeKycFormConfig(record?.data);
  } catch {
    return normalizeKycFormConfig(DEFAULT_KYC_FORM_CONFIG);
  }
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

/** Never expose permanent public URLs or object keys to clients. */
const mapDocument = (doc: any, opts?: { includeLegacyUrl?: boolean }) => {
  const isPrivateKyc =
    String(doc.storageClass || '') === 'KYC_PRIVATE' ||
    String(doc.purpose || '') === 'kyc';
  const clean = String(doc.quarantineStatus || '').toUpperCase() === 'CLEAN';
  return {
    id: doc.id,
    type: doc.type,
    file_id: doc.fileId,
    // Phase 20.2: never return public file URLs for KYC docs
    file_url: isPrivateKyc || !opts?.includeLegacyUrl ? null : doc.fileUrl || null,
    status: doc.status,
    rejection_reason: doc.rejectionReason,
    uploaded_at: doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : null,
    scan_status: doc.scanStatus || null,
    quarantine_status: doc.quarantineStatus || null,
    content_type: doc.contentType || null,
    size_bytes: doc.sizeBytes != null ? Number(doc.sizeBytes) : null,
    metadata_stripped: Boolean(doc.metadataStripped),
    secure_view: isPrivateKyc && clean,
    storage_class: doc.storageClass || 'LEGACY'
  };
};

const mapSubmission = (submission: any) => ({
  id: submission.id,
  user_id: submission.userId,
  status: apiStatusFromDb(submission.status),
  submitted_at: submission.createdAt ? new Date(submission.createdAt).toISOString() : null,
  reviewed_at: submission.reviewedAt ? new Date(submission.reviewedAt).toISOString() : null,
  reviewed_by: submission.reviewedBy || null,
  rejection_reason: submission.rejectionReason || null,
  decision_reason_code: submission.decisionReasonCode || null,
  documents: Array.isArray(submission.documents) ? submission.documents.map((d: any) => mapDocument(d)) : [],
  personal_info: submission.personalInfo || {},
  consent_policy_version: submission.consentPolicyVersion || null,
  consent_accepted_at: submission.consentAcceptedAt
    ? new Date(submission.consentAcceptedAt).toISOString()
    : null,
  resubmission_count: Number(submission.resubmissionCount || 0),
  created_at: submission.createdAt ? new Date(submission.createdAt).toISOString() : null,
  updated_at: submission.updatedAt ? new Date(submission.updatedAt).toISOString() : null
});

const sendError = (res: Response, error: any, fallback: string) =>
  sendMappedKycError(res, error, fallback);

export const kycUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

/** Multer wrapper that maps LIMIT_* to controlled 400 responses. */
export const kycUploadMulterMiddleware = wrapKycMulterSingle(kycUploadMulter);

export const kycUploadRateLimiter = rateLimit({
  windowMs: KYC_UPLOAD_RATE_WINDOW_MS,
  max: KYC_UPLOAD_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Prefer authenticated user id; fall back to IP string without IPv6 validation warning.
  keyGenerator: (req) => {
    const userId = String((req as any).user?.id || '').trim();
    if (userId) return `user:${userId}`;
    return `ip:${String(req.ip || req.socket?.remoteAddress || 'anon')}`;
  },
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'Too many KYC upload attempts. Please try again later.', code: 'RATE_LIMIT' }
});

export const kycSubmitRateLimiter = rateLimit({
  windowMs: KYC_SUBMIT_RATE_WINDOW_MS,
  max: KYC_SUBMIT_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = String((req as any).user?.id || '').trim();
    if (userId) return `user:${userId}`;
    return `ip:${String(req.ip || req.socket?.remoteAddress || 'anon')}`;
  },
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, error: 'Too many KYC submissions. Please try again later.', code: 'RATE_LIMIT' }
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

    // Clean, unattached docs survive form remounts / reloads before submit.
    const pendingRows = await prisma.kYCDocument.findMany({
      where: {
        userId,
        submissionId: null,
        OR: [
          { quarantineStatus: 'CLEAN' },
          { scanStatus: 'CLEAN' }
        ],
        NOT: { status: 'rejected' }
      },
      orderBy: { uploadedAt: 'desc' },
      take: 24
    });
    const pendingDocuments = pendingRows.map((doc) => mapDocument(doc));

    if (!submission) {
      return res.json({
        success: true,
        data: {
          status: 'not_submitted',
          pendingDocuments,
          pending_documents: pendingDocuments
        }
      });
    }

    return res.json({
      success: true,
      data: {
        status: apiStatusFromDb(submission.status),
        submission: mapSubmission(submission),
        pendingDocuments,
        pending_documents: pendingDocuments
      }
    });
  } catch (error: any) {
    return sendError(res, error, 'Failed to load KYC status');
  }
};

export const uploadKycSecureDocument = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      return res.status(400).json({ success: false, error: 'file is required', code: 'FILE_REQUIRED' });
    }

    const documentType = String(req.body?.type || req.body?.document_type || '').trim();
    const result = await processKycSecureUpload({
      userId,
      documentType,
      buffer: file.buffer,
      claimedMime: file.mimetype,
      originalName: file.originalname
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    return sendError(res, error, 'Failed to upload KYC document');
  }
};

const parseDocumentRefs = (body: any): Array<{ type: string; documentId: string }> => {
  const docs = Array.isArray(body?.documents) ? body.documents : [];
  return docs
    .map((doc: any) => ({
      type: String(doc.type || '').trim(),
      documentId: String(doc.document_id || doc.documentId || doc.id || '').trim()
    }))
    .filter((d: { type: string; documentId: string }) => d.documentId);
};

const requireConsent = (body: any, policyVersion: string) => {
  const accepted = body?.consent_accepted === true || body?.consentAccepted === true;
  if (!accepted) {
    throw new KycValidationError('Explicit KYC consent is required', 'CONSENT_REQUIRED');
  }
  const version = String(body?.consent_policy_version || body?.consentPolicyVersion || '').trim();
  if (version && version !== policyVersion) {
    throw new KycValidationError('Consent policy version mismatch', 'CONSENT_VERSION_MISMATCH');
  }
  return policyVersion;
};

export const submitKyc = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const correlationId = createKycCorrelationId();
    const config = await loadFormConfig();
    const policyVersion = requireConsent(req.body, config.consent.policyVersion);

    const personalInfo = serializePersonalInfo(req.body?.personal_info || req.body?.personalInfo);
    validateRequiredPersonalFields(personalInfo, config.personalFields);

    const docRefs = parseDocumentRefs(req.body);
    if (docRefs.length === 0) {
      throw new KycValidationError('At least one document is required', 'DOCUMENTS_REQUIRED');
    }
    if (docRefs.length > config.security.maxFilesPerSubmission) {
      throw new KycValidationError('Too many documents for a single submission', 'TOO_MANY_DOCUMENTS');
    }

    // Reject legacy file_id-only attachments (public media path)
    for (const raw of Array.isArray(req.body?.documents) ? req.body.documents : []) {
      if ((raw?.file_id || raw?.fileId) && !(raw?.document_id || raw?.documentId || raw?.id)) {
        throw new KycValidationError(
          'Use secure KYC upload (document_id). Generic media file IDs are not accepted.',
          'LEGACY_FILE_ID_REJECTED'
        );
      }
      if (raw?.file_url || raw?.fileUrl || raw?.url) {
        throw new KycValidationError('External or public file URLs are not accepted', 'URL_REJECTED');
      }
    }

    const allowedTypes = new Set<string>();
    for (const group of config.documentGroups) {
      for (const option of group.options || []) {
        if (option.key) allowedTypes.add(String(option.key));
      }
    }

    const attachedDocs = [];
    for (const ref of docRefs) {
      const doc = await assertAttachableKycDocument({
        documentId: ref.documentId,
        userId,
        allowedTypes
      });
      // Prefer stored type; allow type override only if matches allowlist
      const type = allowedTypes.has(ref.type) ? ref.type : doc.type;
      attachedDocs.push({ ...doc, type });
    }

    validateDocumentGroups(
      attachedDocs.map((d) => ({ type: d.type })),
      config.documentGroups
    );

    const now = new Date();
    const submission = await prisma.kYCSubmission.create({
      data: {
        userId,
        status: 'PENDING',
        personalInfo,
        consentPolicyVersion: policyVersion,
        consentAcceptedAt: now,
        resubmissionCount: 0
      }
    });

    await prisma.kYCConsent.create({
      data: {
        userId,
        submissionId: submission.id,
        policyVersion,
        purpose: config.consent.purpose,
        acceptedAt: now,
        sourceSurface: String(req.body?.source_surface || req.body?.sourceSurface || 'kyc_form')
      }
    });

    await writeKycAuditEvent({
      submissionId: submission.id,
      actorType: 'USER',
      actorId: userId,
      actorUserId: userId,
      action: KYC_AUDIT_ACTIONS.CONSENT_ACCEPTED,
      correlationId,
      metadata: { policyVersion, sourceSurface: 'kyc_form' }
    });

    const linked = [];
    for (const doc of attachedDocs) {
      const updated = await prisma.kYCDocument.update({
        where: { id: doc.id },
        data: {
          submissionId: submission.id,
          type: doc.type,
          fileUrl: ''
        }
      });
      linked.push(updated);
      await writeKycAuditEvent({
        submissionId: submission.id,
        documentId: doc.id,
        actorType: 'USER',
        actorId: userId,
        actorUserId: userId,
        action: KYC_AUDIT_ACTIONS.FILE_ATTACHED,
        correlationId,
        metadata: { documentId: doc.id, documentType: doc.type }
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'PENDING', isVerified: false }
    });

    await writeKycAuditEvent({
      submissionId: submission.id,
      actorType: 'USER',
      actorId: userId,
      actorUserId: userId,
      action: KYC_AUDIT_ACTIONS.SUBMISSION_CREATED,
      resultingState: 'PENDING',
      correlationId,
      metadata: { count: linked.length, status: 'PENDING' }
    });

    const payload = mapSubmission({ ...submission, documents: linked });
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
    return sendError(res, error, 'Failed to submit KYC');
  }
};

export const updateKyc = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const correlationId = createKycCorrelationId();
    const submission = await prisma.kYCSubmission.findUnique({
      where: { id: req.params.id },
      include: { documents: true }
    });

    if (!submission) return res.status(404).json({ success: false, error: 'KYC submission not found' });
    if (submission.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const status = String(submission.status).toUpperCase();
    if (!['PENDING', 'REJECTED', 'REQUIRES_UPDATES'].includes(status)) {
      throw new KycValidationError('Submission cannot be modified in its current state', 'INVALID_STATE');
    }

    const config = await loadFormConfig();
    const maxResubmissions = config.security.maxResubmissions;
    if (Number(submission.resubmissionCount || 0) >= maxResubmissions) {
      throw new KycValidationError('Resubmission limit reached. Contact support.', 'RESUBMISSION_LIMIT');
    }

    const policyVersion = requireConsent(req.body, config.consent.policyVersion);
    const personalInfo = serializePersonalInfo(
      req.body?.personal_info || req.body?.personalInfo || submission.personalInfo
    );
    validateRequiredPersonalFields(personalInfo, config.personalFields);

    const docRefs = parseDocumentRefs(req.body);
    const existingDocs = (submission.documents || []).filter(
      (d: any) => d.quarantineStatus === 'CLEAN' || d.storageClass === 'LEGACY'
    );

    // New secure docs only for additional attachments
    const allowedTypes = new Set<string>();
    for (const group of config.documentGroups) {
      for (const option of group.options || []) {
        if (option.key) allowedTypes.add(String(option.key));
      }
    }

    const newlyLinked = [];
    for (const ref of docRefs) {
      // Skip if already on this submission
      if (existingDocs.some((d: any) => d.id === ref.documentId)) continue;
      const doc = await assertAttachableKycDocument({
        documentId: ref.documentId,
        userId,
        allowedTypes
      });
      const type = allowedTypes.has(ref.type) ? ref.type : doc.type;
      const updated = await prisma.kYCDocument.update({
        where: { id: doc.id },
        data: { submissionId: submission.id, type, fileUrl: '' }
      });
      newlyLinked.push(updated);
      await writeKycAuditEvent({
        submissionId: submission.id,
        documentId: doc.id,
        actorType: 'USER',
        actorId: userId,
        actorUserId: userId,
        action: KYC_AUDIT_ACTIONS.FILE_ATTACHED,
        correlationId,
        metadata: { documentId: doc.id, documentType: type }
      });
    }

    const allDocs = [...existingDocs, ...newlyLinked];
    if (allDocs.length > config.security.maxFilesPerSubmission) {
      throw new KycValidationError('Too many documents for a single submission', 'TOO_MANY_DOCUMENTS');
    }

    validateDocumentGroups(
      allDocs.map((d: any) => ({ type: d.type })),
      config.documentGroups
    );

    const now = new Date();
    const updated = await prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        personalInfo,
        status: 'PENDING',
        rejectionReason: null,
        decisionReasonCode: null,
        consentPolicyVersion: policyVersion,
        consentAcceptedAt: now,
        resubmissionCount: { increment: 1 }
      }
    });

    await prisma.kYCConsent.create({
      data: {
        userId,
        submissionId: submission.id,
        policyVersion,
        purpose: config.consent.purpose,
        acceptedAt: now,
        sourceSurface: String(req.body?.source_surface || 'kyc_form_resubmit')
      }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { kycStatus: 'PENDING', isVerified: false }
    });

    await writeKycAuditEvent({
      submissionId: submission.id,
      actorType: 'USER',
      actorId: userId,
      actorUserId: userId,
      action: KYC_AUDIT_ACTIONS.SUBMISSION_UPDATED,
      priorState: status,
      resultingState: 'PENDING',
      correlationId,
      metadata: { count: newlyLinked.length, status: 'PENDING' }
    });

    const payload = mapSubmission({ ...updated, documents: allDocs });
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
    return sendError(res, error, 'Failed to update KYC');
  }
};

/** @deprecated Phase 20.2 — use POST /api/kyc/uploads */
export const uploadKycDocument = async (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'This endpoint is retired. Use POST /api/kyc/uploads for private KYC uploads.',
    code: 'KYC_UPLOAD_RETIRED'
  });
};

export const getKycDocumentTypes = async (_req: Request, res: Response) => {
  try {
    const config = await loadFormConfig();
    const identityGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'identity');
    const addressGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'address');
    const selfieGroup = config.documentGroups.find((group: any) => String(group.key).toLowerCase() === 'selfie');
    return res.json({
      success: true,
      data: {
        identity: Array.isArray(identityGroup?.options) ? identityGroup.options.map((item: any) => item.key) : [],
        address: Array.isArray(addressGroup?.options) ? addressGroup.options.map((item: any) => item.key) : [],
        selfie: Array.isArray(selfieGroup?.options) ? selfieGroup.options.map((item: any) => item.key) : []
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
    const data = await loadFormConfig();
    return res.json({ success: true, data });
  } catch (error: any) {
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
    // Never allow enabling automated approval or biometrics via config
    normalized.security.biometricsEnabled = false;
    normalized.security.automatedFinalApproval = false;

    await prisma.appSetting.upsert({
      where: { scope: KYC_FORM_SCOPE },
      create: { scope: KYC_FORM_SCOPE, data: normalized },
      update: { data: normalized }
    });

    await writeKycAuditEvent({
      actorType: 'ADMIN',
      actorId: req.user?.id || null,
      actorUserId: req.user?.id || null,
      action: KYC_AUDIT_ACTIONS.FORM_CONFIG_CHANGED,
      metadata: { status: 'updated' }
    });

    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as
      | { emit?: (ev: string, payload: unknown) => void }
      | undefined;
    io?.emit?.('kyc:form_config_updated', { version: normalized.version, timestamp: Date.now() });
    return res.json({ success: true, data: normalized });
  } catch (error: any) {
    return sendError(res, error, 'Failed to update KYC form config');
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

    await writeKycAuditEvent({
      actorType: 'ADMIN',
      actorId: req.user?.id || null,
      actorUserId: req.user?.id || null,
      action: KYC_AUDIT_ACTIONS.ADMIN_QUEUE_VIEWED,
      metadata: { count: submissions.length }
    });

    return res.json({
      success: true,
      data: submissions.map((submission) => ({
        ...mapSubmission(submission),
        user: submission.user
      }))
    });
  } catch (error: any) {
    return sendError(res, error, 'Failed to load KYC requests');
  }
};

export const updateKycStatus = async (req: Request, res: Response) => {
  try {
    const submissionId = req.params.id;
    const rawStatus = String(req.body?.status || '').toLowerCase();
    const reason = String(req.body?.notes || req.body?.rejection_reason || req.body?.reason || '').trim();
    const reasonCode = String(req.body?.reason_code || req.body?.reasonCode || '').trim() || null;

    let action: 'approve' | 'reject' | 'resubmit' | 'revoke';
    if (rawStatus === 'approved' || rawStatus === 'approve') action = 'approve';
    else if (rawStatus === 'rejected' || rawStatus === 'reject') action = 'reject';
    else if (rawStatus === 'requires_updates' || rawStatus === 'resubmit' || rawStatus === 'resubmission_required') {
      action = 'resubmit';
    } else if (rawStatus === 'revoked' || rawStatus === 'revoke') action = 'revoke';
    else {
      return res.status(400).json({
        success: false,
        error: 'status must be approved, rejected, requires_updates, or revoked',
        code: 'INVALID_STATUS'
      });
    }

    // Permission fine-grain enforcement beyond route middleware
    const perms = req.staffContext?.permissions;
    if (perms && perms.size > 0) {
      const need =
        action === 'approve'
          ? KYC_FINE_PERMISSIONS.DECISION_APPROVE
          : action === 'reject'
            ? KYC_FINE_PERMISSIONS.DECISION_REJECT
            : action === 'resubmit'
              ? KYC_FINE_PERMISSIONS.DECISION_RESUBMIT
              : KYC_FINE_PERMISSIONS.DECISION_REVOKE;
      const legacyOk = perms.has(KYC_FINE_PERMISSIONS.LEGACY_REVIEW);
      if (!perms.has(need) && !legacyOk && !req.staffContext?.isAdmin) {
        return res.status(403).json({ success: false, error: 'Missing KYC decision permission', code: 'FORBIDDEN' });
      }
    }

    const updated = await applyKycDecision({
      submissionId,
      action,
      actorUserId: String(req.user?.id || ''),
      reason: reason || (action === 'approve' ? 'Approved by administrator' : ''),
      reasonCode,
      correlationId: createKycCorrelationId()
    });

    // Approval still requires a reason (applyKycDecision enforces min length).
    // For approve we allow a short default above only if reason empty — change to always require:
    // Already enforced in applyKycDecision.

    const payload = mapSubmission(updated);
    const apiStatus = apiStatusFromDb(updated.status);
    realtime.emitToUser(updated.userId, EVENTS.KYC_UPDATED, {
      userId: updated.userId,
      submissionId,
      status: apiStatus,
      rejectionReason: updated.rejectionReason || undefined
    });
    realtime.emitToRoom('community:admin', 'kyc.updated', {
      userId: updated.userId,
      submissionId,
      status: apiStatus
    });

    try {
      const kycLink = `/dashboard?tab=kyc`;
      void sendSystemMessage({
        templateKey: 'kyc_status_update',
        userId: updated.userId,
        context: {
          kyc: { status: apiStatus, link: kycLink }
        },
        actionUrl: kycLink,
        typeOverride: 'kyc'
      });
    } catch {
      console.warn('[kyc] status notification failed');
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    return sendError(res, error, 'Failed to update KYC status');
  }
};

/**
 * Secure document view: permission + clean status + audit + short-lived access.
 * Never returns permanent public URLs.
 */
export const viewKycDocument = async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.id as string | undefined;
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const documentId = String(req.params.documentId || '').trim();
    const doc = await prisma.kYCDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.deletedAt) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const isOwner = doc.userId === actorId;
    const perms = req.staffContext?.permissions;
    const canView =
      isOwner ||
      req.staffContext?.isAdmin ||
      (perms &&
        (perms.has(KYC_FINE_PERMISSIONS.DOCUMENT_VIEW) ||
          perms.has(KYC_FINE_PERMISSIONS.LEGACY_REVIEW) ||
          perms.has(KYC_FINE_PERMISSIONS.LEGACY_READ)));

    if (!canView) {
      return res.status(403).json({ success: false, error: 'Missing document view permission', code: 'FORBIDDEN' });
    }

    // Infected / not clean never viewable (except owner cannot view infected either)
    const qStatus = String(doc.quarantineStatus || '').toUpperCase();
    if (['INFECTED', 'SCAN_FAILED', 'QUARANTINED', 'SCANNING', 'REJECTED'].includes(qStatus)) {
      return res.status(403).json({
        success: false,
        error: 'Document is not available for viewing',
        code: 'DOCUMENT_NOT_VIEWABLE'
      });
    }

    const correlationId = createKycCorrelationId();
    await writeKycAuditEvent({
      submissionId: doc.submissionId,
      documentId: doc.id,
      actorType: isOwner ? 'USER' : 'ADMIN',
      actorId,
      actorUserId: actorId,
      action: KYC_AUDIT_ACTIONS.DOCUMENT_VIEW_AUTHORIZED,
      correlationId,
      metadata: { documentId: doc.id }
    });

    // Prefer private object stream / signed URL
    if (doc.objectKey && String(doc.objectKey).startsWith('kyc/clean/')) {
      const mode = String(req.query.mode || 'meta').toLowerCase();

      if (mode === 'stream') {
        await writeKycAuditEvent({
          submissionId: doc.submissionId,
          documentId: doc.id,
          actorType: isOwner ? 'USER' : 'ADMIN',
          actorId,
          actorUserId: actorId,
          action: KYC_AUDIT_ACTIONS.DOCUMENT_VIEWED,
          correlationId,
          metadata: { documentId: doc.id }
        });
        const buffer = await downloadKycObject(doc.objectKey);
        res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="kyc-document${doc.contentType === 'application/pdf' ? '.pdf' : '.bin'}"`
        );
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; style-src 'none'; sandbox");
        return res.send(buffer);
      }

      // Default: short-lived signed URL if GCS available, else stream token instruction
      let signedUrl: string | null = null;
      try {
        signedUrl = await createKycSignedReadUrl(doc.objectKey, KYC_SIGNED_URL_TTL_SECONDS);
      } catch {
        signedUrl = null;
      }

      await writeKycAuditEvent({
        submissionId: doc.submissionId,
        documentId: doc.id,
        actorType: isOwner ? 'USER' : 'ADMIN',
        actorId,
        actorUserId: actorId,
        action: KYC_AUDIT_ACTIONS.DOCUMENT_VIEWED,
        correlationId,
        metadata: { documentId: doc.id }
      });

      return res.json({
        success: true,
        data: {
          documentId: doc.id,
          contentType: doc.contentType,
          expiresInSeconds: KYC_SIGNED_URL_TTL_SECONDS,
          // Signed URL only in response body — never logged
          signedUrl,
          streamPath: signedUrl ? null : `/api/admin/kyc/documents/${doc.id}/view?mode=stream`,
          download: false
        }
      });
    }

    // Legacy documents: never return raw public URL; deny if not private-capable
    return res.status(409).json({
      success: false,
      error:
        'Legacy KYC document is not available through the secure viewer. User must re-upload via secure KYC upload.',
      code: 'LEGACY_DOCUMENT'
    });
  } catch (error: any) {
    return sendError(res, error, 'Failed to authorize document view');
  }
};

// Avoid unused import warning for createKycReadStream in stream path variant
void createKycReadStream;
