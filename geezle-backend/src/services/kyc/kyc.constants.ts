/**
 * Phase 20.2 KYC security constants.
 * Retention durations are placeholders requiring legal approval — do not invent final periods.
 */

export const KYC_PURPOSE = 'kyc' as const;
export const KYC_STORAGE_CLASS_PRIVATE = 'KYC_PRIVATE' as const;
export const KYC_STORAGE_CLASS_LEGACY = 'LEGACY' as const;

export const KYC_VISIBILITY_PRIVATE = 'PRIVATE' as const;

export const KYC_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const KYC_MAX_PDF_BYTES = 10 * 1024 * 1024;
export const KYC_MAX_FILES_PER_SUBMISSION = 12;
export const KYC_MAX_PIXELS = 40_000_000; // 40MP decompression-bomb bound
export const KYC_MAX_DIMENSION = 10000;
export const KYC_UPLOAD_RATE_WINDOW_MS = 15 * 60 * 1000;
export const KYC_UPLOAD_RATE_MAX = 30;
export const KYC_SUBMIT_RATE_WINDOW_MS = 15 * 60 * 1000;
export const KYC_SUBMIT_RATE_MAX = 10;
/** Abuse prevention default — not a legal lifetime cap. Owner may reconfigure. */
export const KYC_MAX_RESUBMISSIONS_DEFAULT = 8;

export const KYC_SIGNED_URL_TTL_SECONDS = 5 * 60;
export const KYC_CLAMAV_TIMEOUT_MS = 15_000;
export const KYC_CLAMAV_RETRIES = 1;

export const KYC_CONSENT_POLICY_VERSION = 'kyc-consent-v1';
export const KYC_CONSENT_PURPOSE = 'identity_verification_review';

export const KYC_OBJECT_PREFIX = {
  quarantine: 'kyc/quarantine',
  clean: 'kyc/clean',
  rejected: 'kyc/rejected'
} as const;

export const KYC_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

export const KYC_PERSONAL_INFO_ALLOWLIST = new Set([
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationality',
  'phoneNumber',
  'address'
]);

export const KYC_ADDRESS_ALLOWLIST = new Set([
  'street',
  'city',
  'state',
  'postalCode',
  'country'
]);

export const KYC_MAX_FIELD_LENGTH = 200;
export const KYC_MAX_ADDRESS_FIELD_LENGTH = 300;

/** Retention policy keys only — durations require legal approval before enforcement. */
export const KYC_RETENTION_POLICY_PLACEHOLDERS = {
  approved: 'LEGAL_APPROVAL_REQUIRED_APPROVED',
  rejected: 'LEGAL_APPROVAL_REQUIRED_REJECTED',
  draft: 'LEGAL_APPROVAL_REQUIRED_DRAFT',
  revoked: 'LEGAL_APPROVAL_REQUIRED_REVOKED',
  quarantine_infected: 'LEGAL_APPROVAL_REQUIRED_INFECTED'
} as const;

export type KycQuarantineStatus =
  | 'UNKNOWN'
  | 'QUARANTINED'
  | 'SCANNING'
  | 'CLEAN'
  | 'INFECTED'
  | 'SCAN_FAILED'
  | 'REJECTED';

export const KYC_AUDIT_ACTIONS = {
  CONSENT_ACCEPTED: 'consent_accepted',
  UPLOAD_INITIATED: 'upload_initiated',
  UPLOAD_VALIDATION_FAILED: 'upload_validation_failed',
  FILE_QUARANTINED: 'file_quarantined',
  MALWARE_SCAN_STARTED: 'malware_scan_started',
  MALWARE_SCAN_COMPLETED: 'malware_scan_completed',
  MALWARE_DETECTED: 'malware_detected',
  SCAN_FAILED: 'scan_failed',
  FILE_NORMALIZED: 'file_normalized',
  FILE_PROMOTED_CLEAN: 'file_promoted_clean',
  FILE_ATTACHED: 'file_attached',
  SUBMISSION_CREATED: 'submission_created',
  SUBMISSION_UPDATED: 'submission_updated',
  ADMIN_QUEUE_VIEWED: 'admin_queue_viewed',
  DOCUMENT_VIEW_AUTHORIZED: 'document_view_authorized',
  DOCUMENT_VIEWED: 'document_viewed',
  APPROVAL: 'approval',
  REJECTION: 'rejection',
  RESUBMISSION_REQUESTED: 'resubmission_requested',
  STATUS_CHANGED: 'status_changed',
  FORM_CONFIG_CHANGED: 'form_config_changed',
  VERIFICATION_REVOKED: 'verification_revoked',
  SIDE_CHANNEL_BLOCKED: 'side_channel_verification_blocked'
} as const;

export const KYC_FINE_PERMISSIONS = {
  CASE_READ: 'kyc.case.read',
  DOCUMENT_VIEW: 'kyc.document.view',
  REVIEW_RECOMMEND: 'kyc.review.recommend',
  DECISION_APPROVE: 'kyc.decision.approve',
  DECISION_REJECT: 'kyc.decision.reject',
  DECISION_RESUBMIT: 'kyc.decision.resubmit',
  DECISION_REVOKE: 'kyc.decision.revoke',
  CONFIG_READ: 'kyc.config.read',
  CONFIG_WRITE: 'kyc.config.write',
  AUDIT_READ: 'kyc.audit.read',
  EXPORT: 'kyc.export',
  DELETE: 'kyc.delete',
  // Legacy aliases kept for backward compatibility during migration
  LEGACY_READ: 'kyc.read',
  LEGACY_REVIEW: 'kyc.review'
} as const;

export const KYC_SERVICE_IDENTITY = 'scrolith-kyc-service';
