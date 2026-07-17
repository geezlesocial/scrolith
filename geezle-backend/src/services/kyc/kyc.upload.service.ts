import prisma from '../../utils/prismaClient';
import { scanBufferWithClamAv } from './kyc.clamav.service';
import { writeKycAuditEvent, createKycCorrelationId } from './kyc.audit.service';
import { normalizeKycImage } from './kyc.image.service';
import {
  uploadKycObject,
  promoteKycObject,
  moveToRejectedNamespace,
  sha256Hex
} from './kyc.storage.service';
import { validateKycUploadBuffer, KycValidationError } from './kyc.validation.service';
import {
  KYC_AUDIT_ACTIONS,
  KYC_PURPOSE,
  KYC_STORAGE_CLASS_PRIVATE,
  KYC_VISIBILITY_PRIVATE
} from './kyc.constants';

export type ProcessKycUploadInput = {
  userId: string;
  documentType: string;
  buffer: Buffer;
  claimedMime?: string | null;
  originalName?: string | null;
  correlationId?: string | null;
};

/**
 * Full secure KYC upload pipeline:
 * validate → quarantine → malware scan → normalize → promote clean → persist private doc row.
 * Never returns a public URL.
 */
export const processKycSecureUpload = async (input: ProcessKycUploadInput) => {
  const correlationId = input.correlationId || createKycCorrelationId();
  const documentType = String(input.documentType || '').trim();
  if (!documentType) {
    throw new KycValidationError('document type is required', 'TYPE_REQUIRED');
  }

  await writeKycAuditEvent({
    actorType: 'USER',
    actorId: input.userId,
    actorUserId: input.userId,
    action: KYC_AUDIT_ACTIONS.UPLOAD_INITIATED,
    correlationId,
    metadata: { documentType, bytes: input.buffer?.length || 0 }
  });

  let validated;
  try {
    validated = validateKycUploadBuffer({
      buffer: input.buffer,
      claimedMime: input.claimedMime,
      originalName: input.originalName
    });
  } catch (error: any) {
    await writeKycAuditEvent({
      actorType: 'USER',
      actorId: input.userId,
      actorUserId: input.userId,
      action: KYC_AUDIT_ACTIONS.UPLOAD_VALIDATION_FAILED,
      reasonCode: error?.code || 'VALIDATION_FAILED',
      correlationId,
      metadata: { documentType, errorCode: error?.code || 'VALIDATION_FAILED' }
    });
    throw error;
  }

  // Quarantine original bytes first
  const quarantine = await uploadKycObject({
    namespace: 'quarantine',
    buffer: input.buffer,
    contentType: validated.mime
  });

  const pendingDoc = await prisma.kYCDocument.create({
    data: {
      userId: input.userId,
      type: documentType,
      fileId: `kycobj_${quarantine.objectKey.split('/').pop()}`,
      fileUrl: '',
      status: 'pending',
      purpose: KYC_PURPOSE,
      storageClass: KYC_STORAGE_CLASS_PRIVATE,
      objectKey: null,
      quarantineObjectKey: quarantine.objectKey,
      quarantineStatus: 'QUARANTINED',
      scanStatus: 'PENDING',
      contentType: validated.mime,
      sizeBytes: BigInt(validated.sizeBytes),
      originalFilenameSanitized: validated.sanitizedFilename,
      sha256: quarantine.sha256,
      visibility: KYC_VISIBILITY_PRIVATE,
      metadataStripped: false
    }
  });

  await writeKycAuditEvent({
    documentId: pendingDoc.id,
    actorType: 'SYSTEM',
    action: KYC_AUDIT_ACTIONS.FILE_QUARANTINED,
    resultingState: 'QUARANTINED',
    correlationId,
    metadata: {
      documentId: pendingDoc.id,
      documentType,
      sizeBytes: validated.sizeBytes,
      contentType: validated.mime,
      sha256Prefix: quarantine.sha256.slice(0, 12)
    }
  });

  // Scan
  await prisma.kYCDocument.update({
    where: { id: pendingDoc.id },
    data: { quarantineStatus: 'SCANNING', scanStatus: 'SCANNING' }
  });
  await writeKycAuditEvent({
    documentId: pendingDoc.id,
    actorType: 'SYSTEM',
    action: KYC_AUDIT_ACTIONS.MALWARE_SCAN_STARTED,
    correlationId,
    metadata: { documentId: pendingDoc.id, engine: 'clamav' }
  });

  const scan = await scanBufferWithClamAv(input.buffer);

  if (scan.unavailable || scan.rawStatus === 'ERROR' || scan.rawStatus === 'UNAVAILABLE') {
    await prisma.kYCDocument.update({
      where: { id: pendingDoc.id },
      data: {
        quarantineStatus: 'SCAN_FAILED',
        scanStatus: 'SCAN_FAILED',
        scanEngine: scan.engine,
        scannedAt: new Date()
      }
    });
    await writeKycAuditEvent({
      documentId: pendingDoc.id,
      actorType: 'SYSTEM',
      action: KYC_AUDIT_ACTIONS.SCAN_FAILED,
      reasonCode: 'SCANNER_UNAVAILABLE',
      resultingState: 'SCAN_FAILED',
      correlationId,
      metadata: { documentId: pendingDoc.id, errorCode: 'SCANNER_UNAVAILABLE', engine: scan.engine }
    });
    throw new KycValidationError(
      'Malware scanner unavailable. KYC upload cannot be accepted.',
      'SCANNER_UNAVAILABLE',
      503
    );
  }

  if (scan.infected || !scan.clean) {
    await moveToRejectedNamespace({
      sourceKey: quarantine.objectKey,
      buffer: input.buffer,
      contentType: validated.mime
    });
    await prisma.kYCDocument.update({
      where: { id: pendingDoc.id },
      data: {
        quarantineStatus: 'INFECTED',
        scanStatus: 'INFECTED',
        scanEngine: scan.engine,
        scanDefinitionVersion: scan.definitionVersion || null,
        scannedAt: new Date(),
        status: 'rejected',
        rejectionReason: 'MALWARE_DETECTED',
        objectKey: null,
        quarantineObjectKey: null
      }
    });
    await writeKycAuditEvent({
      documentId: pendingDoc.id,
      actorType: 'SYSTEM',
      action: KYC_AUDIT_ACTIONS.MALWARE_DETECTED,
      reasonCode: 'MALWARE_DETECTED',
      resultingState: 'INFECTED',
      correlationId,
      metadata: {
        documentId: pendingDoc.id,
        engine: scan.engine,
        // short signature code only — never file content
        errorCode: (scan.signature || 'INFECTED').slice(0, 40)
      }
    });
    throw new KycValidationError('File failed security scanning', 'MALWARE_DETECTED', 422);
  }

  await writeKycAuditEvent({
    documentId: pendingDoc.id,
    actorType: 'SYSTEM',
    action: KYC_AUDIT_ACTIONS.MALWARE_SCAN_COMPLETED,
    resultingState: 'CLEAN_SCAN',
    correlationId,
    metadata: { documentId: pendingDoc.id, engine: scan.engine, scanStatus: 'CLEAN' }
  });

  // Normalize images (strip EXIF); PDFs remain private without re-encode in this phase.
  let finalBuffer = input.buffer;
  let finalMime = validated.mime;
  let width: number | null = null;
  let height: number | null = null;
  let metadataStripped = false;

  if (validated.mime.startsWith('image/')) {
    const normalized = await normalizeKycImage(input.buffer, validated.mime);
    finalBuffer = normalized.buffer;
    finalMime = normalized.contentType;
    width = normalized.width;
    height = normalized.height;
    metadataStripped = true;
    await writeKycAuditEvent({
      documentId: pendingDoc.id,
      actorType: 'SYSTEM',
      action: KYC_AUDIT_ACTIONS.FILE_NORMALIZED,
      correlationId,
      metadata: {
        documentId: pendingDoc.id,
        metadataStripped: true,
        width,
        height,
        contentType: finalMime
      }
    });
  }

  const clean = await promoteKycObject({
    quarantineKey: quarantine.objectKey,
    buffer: finalBuffer,
    contentType: finalMime
  });

  const finalSha = sha256Hex(finalBuffer);
  const cleanDoc = await prisma.kYCDocument.update({
    where: { id: pendingDoc.id },
    data: {
      quarantineStatus: 'CLEAN',
      scanStatus: 'CLEAN',
      scanEngine: scan.engine,
      scanDefinitionVersion: scan.definitionVersion || null,
      scannedAt: new Date(),
      objectKey: clean.objectKey,
      quarantineObjectKey: null,
      promotedAt: new Date(),
      normalizedAt: metadataStripped ? new Date() : null,
      metadataStripped,
      contentType: finalMime,
      sizeBytes: BigInt(finalBuffer.length),
      sha256: finalSha,
      width: width ?? undefined,
      height: height ?? undefined,
      visibility: KYC_VISIBILITY_PRIVATE,
      storageClass: KYC_STORAGE_CLASS_PRIVATE,
      fileUrl: '',
      status: 'pending'
    }
  });

  await writeKycAuditEvent({
    documentId: cleanDoc.id,
    actorType: 'SYSTEM',
    action: KYC_AUDIT_ACTIONS.FILE_PROMOTED_CLEAN,
    resultingState: 'CLEAN',
    correlationId,
    metadata: {
      documentId: cleanDoc.id,
      contentType: finalMime,
      sizeBytes: finalBuffer.length,
      sha256Prefix: finalSha.slice(0, 12),
      metadataStripped
    }
  });

  return {
    documentId: cleanDoc.id,
    type: cleanDoc.type,
    status: cleanDoc.status,
    quarantineStatus: cleanDoc.quarantineStatus,
    scanStatus: cleanDoc.scanStatus,
    contentType: cleanDoc.contentType,
    sizeBytes: Number(cleanDoc.sizeBytes || 0),
    metadataStripped: cleanDoc.metadataStripped,
    width: cleanDoc.width,
    height: cleanDoc.height,
    correlationId
    // intentionally no fileUrl, objectKey, or signed URL
  };
};

/**
 * Validate a document id for attachment to a submission owned by userId.
 */
export const assertAttachableKycDocument = async (params: {
  documentId: string;
  userId: string;
  allowedTypes?: Set<string>;
}) => {
  const doc = await prisma.kYCDocument.findUnique({ where: { id: params.documentId } });
  if (!doc || doc.deletedAt) {
    throw new KycValidationError('Document not found', 'DOCUMENT_NOT_FOUND', 404);
  }
  if (doc.userId !== params.userId) {
    throw new KycValidationError('Document does not belong to the authenticated user', 'DOCUMENT_OWNERSHIP', 403);
  }
  if (doc.purpose !== KYC_PURPOSE) {
    throw new KycValidationError('Document is not a KYC upload', 'DOCUMENT_PURPOSE', 400);
  }
  if (String(doc.visibility || '').toUpperCase() !== 'PRIVATE') {
    throw new KycValidationError('Document is not private', 'DOCUMENT_NOT_PRIVATE', 400);
  }
  if (doc.storageClass !== KYC_STORAGE_CLASS_PRIVATE) {
    throw new KycValidationError('Legacy public media cannot be attached to KYC', 'DOCUMENT_LEGACY_MEDIA', 400);
  }
  if (doc.quarantineStatus !== 'CLEAN' || doc.scanStatus !== 'CLEAN') {
    throw new KycValidationError('Document has not passed security scanning', 'DOCUMENT_NOT_CLEAN', 400);
  }
  if (!doc.objectKey || !String(doc.objectKey).startsWith('kyc/clean/')) {
    throw new KycValidationError('Document is not in the clean KYC namespace', 'DOCUMENT_NOT_PROMOTED', 400);
  }
  if (doc.submissionId) {
    throw new KycValidationError('Document is already attached to a submission', 'DOCUMENT_ALREADY_ATTACHED', 400);
  }
  if (params.allowedTypes && params.allowedTypes.size > 0 && !params.allowedTypes.has(doc.type)) {
    throw new KycValidationError('Document type is not allowed', 'DOCUMENT_TYPE_NOT_ALLOWED', 400);
  }
  return doc;
};
