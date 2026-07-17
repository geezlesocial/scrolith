import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { KYC_SERVICE_IDENTITY } from './kyc.constants';

export type KycActorType = 'USER' | 'ADMIN' | 'SYSTEM' | 'SERVICE';

export type WriteKycAuditInput = {
  submissionId?: string | null;
  documentId?: string | null;
  actorType: KycActorType;
  actorId?: string | null;
  actorUserId?: string | null;
  action: string;
  reasonCode?: string | null;
  priorState?: string | null;
  resultingState?: string | null;
  correlationId?: string | null;
  serviceIdentity?: string | null;
  /** Allowlist-only metadata. Identity fields are stripped. */
  metadata?: Record<string, unknown> | null;
  /** When true, throw if audit write fails (required for final decisions). */
  critical?: boolean;
};

const BLOCKED_METADATA_KEYS = new Set([
  'email',
  'name',
  'firstName',
  'lastName',
  'phone',
  'phoneNumber',
  'address',
  'dateOfBirth',
  'dob',
  'nationality',
  'documentNumber',
  'idNumber',
  'personalInfo',
  'personal_info',
  'fileUrl',
  'file_url',
  'signedUrl',
  'signed_url',
  'token',
  'password',
  'raw',
  'buffer',
  'content',
  'image',
  'selfie'
]);

const ALLOWED_METADATA_KEYS = new Set([
  'documentType',
  'documentId',
  'fileId',
  'mimeType',
  'contentType',
  'sizeBytes',
  'sha256Prefix',
  'scanStatus',
  'quarantineStatus',
  'reasonCode',
  'status',
  'priorStatus',
  'nextStatus',
  'policyVersion',
  'sourceSurface',
  'errorCode',
  'storageClass',
  'metadataStripped',
  'width',
  'height',
  'permissionKey',
  'path',
  'method',
  'count',
  'engine',
  'definitionVersion',
  'bytes'
]);

const sanitizeMetadata = (input?: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (BLOCKED_METADATA_KEYS.has(key)) continue;
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (value === undefined) continue;
    if (typeof value === 'string') {
      // Never store long free-text that may contain PII.
      out[key] = value.slice(0, 120);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value === null) {
      out[key] = null;
    }
  }
  return Object.keys(out).length ? out : null;
};

export const createKycCorrelationId = () => randomUUID();

/**
 * Append-only KYC audit write. Never stores raw identity documents or PII fields.
 */
export const writeKycAuditEvent = async (input: WriteKycAuditInput) => {
  const payload = {
    submissionId: input.submissionId || null,
    documentId: input.documentId || null,
    actorType: String(input.actorType || 'SYSTEM'),
    actorId: input.actorId || null,
    actorUserId: input.actorUserId || null,
    action: String(input.action || '').trim(),
    reasonCode: input.reasonCode || null,
    priorState: input.priorState || null,
    resultingState: input.resultingState || null,
    correlationId: input.correlationId || null,
    serviceIdentity: input.serviceIdentity || KYC_SERVICE_IDENTITY,
    metadata: sanitizeMetadata(input.metadata)
  };

  if (!payload.action) {
    if (input.critical) throw new Error('KYC audit action is required');
    return null;
  }

  try {
    return await prisma.kYCAuditEvent.create({ data: payload as any });
  } catch (error) {
    if (input.critical) throw error;
    console.warn('[kyc.audit] non-critical audit write failed', {
      action: payload.action,
      submissionId: payload.submissionId,
      documentId: payload.documentId
    });
    return null;
  }
};
