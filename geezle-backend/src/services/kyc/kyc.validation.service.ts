import {
  KYC_ALLOWED_MIME,
  KYC_ADDRESS_ALLOWLIST,
  KYC_MAX_ADDRESS_FIELD_LENGTH,
  KYC_MAX_FIELD_LENGTH,
  KYC_MAX_IMAGE_BYTES,
  KYC_MAX_PDF_BYTES,
  KYC_MAX_PIXELS,
  KYC_PERSONAL_INFO_ALLOWLIST
} from './kyc.constants';

export type MagicDetectResult = {
  mime: string | null;
  extension: string | null;
};

export class KycValidationError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'KycValidationError';
    this.code = code;
    this.status = status;
  }
}

/** Detect content type from magic bytes. Do not trust extension or client MIME. */
export const detectMagicMime = (buffer: Buffer): MagicDetectResult => {
  if (!buffer || buffer.length < 4) {
    return { mime: null, extension: null };
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: 'png' };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }

  // PDF
  if (buffer.toString('ascii', 0, 5) === '%PDF-') {
    return { mime: 'application/pdf', extension: 'pdf' };
  }

  // Reject common dangerous / unsupported types early
  // ZIP/OOXML/archives
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return { mime: 'application/zip', extension: 'zip' };
  }
  // EXE / PE
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { mime: 'application/x-msdownload', extension: 'exe' };
  }
  // ELF
  if (buffer[0] === 0x7f && buffer.toString('ascii', 1, 4) === 'ELF') {
    return { mime: 'application/x-elf', extension: 'elf' };
  }
  // GIF (not allowed for KYC)
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return { mime: 'image/gif', extension: 'gif' };
  }

  return { mime: null, extension: null };
};

export const sanitizeOriginalFilename = (originalName?: string | null) => {
  const base = String(originalName || 'document')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'document';
  const cleaned = base
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return cleaned || 'document';
};

export const validateKycUploadBuffer = (params: {
  buffer: Buffer;
  claimedMime?: string | null;
  originalName?: string | null;
}) => {
  const buffer = params.buffer;
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new KycValidationError('Empty file is not allowed', 'EMPTY_FILE');
  }

  const magic = detectMagicMime(buffer);
  if (!magic.mime || !KYC_ALLOWED_MIME.has(magic.mime)) {
    throw new KycValidationError(
      'Unsupported or unrecognized file type for KYC upload',
      'UNSUPPORTED_TYPE'
    );
  }

  const claimed = String(params.claimedMime || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (claimed && claimed !== 'application/octet-stream' && claimed !== magic.mime) {
    // Allow image/jpg alias for jpeg
    const claimedNorm = claimed === 'image/jpg' ? 'image/jpeg' : claimed;
    if (claimedNorm !== magic.mime) {
      throw new KycValidationError('Declared content type does not match file content', 'MIME_MAGIC_MISMATCH');
    }
  }

  const maxBytes = magic.mime === 'application/pdf' ? KYC_MAX_PDF_BYTES : KYC_MAX_IMAGE_BYTES;
  if (buffer.length > maxBytes) {
    throw new KycValidationError(
      `File exceeds KYC size limit (${Math.floor(maxBytes / (1024 * 1024))}MB)`,
      'FILE_TOO_LARGE',
      413
    );
  }

  // Basic PDF safety: reject encrypted markers that often hide payloads; keep private residual risk for full PDF sanitization.
  if (magic.mime === 'application/pdf') {
    const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('latin1');
    if (/\/JS[\s(]|\/JavaScript|\/Launch|\/EmbeddedFile|\/XFA/i.test(head)) {
      throw new KycValidationError('PDF contains unsupported active content', 'UNSUPPORTED_PDF');
    }
  }

  return {
    mime: magic.mime,
    extension: magic.extension || 'bin',
    sizeBytes: buffer.length,
    sanitizedFilename: sanitizeOriginalFilename(params.originalName)
  };
};

export const assertImagePixelBounds = (width?: number | null, height?: number | null) => {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new KycValidationError('Invalid image dimensions', 'INVALID_DIMENSIONS');
  }
  if (w > 10000 || h > 10000) {
    throw new KycValidationError('Image dimensions exceed allowed maximum', 'DIMENSIONS_TOO_LARGE');
  }
  if (w * h > KYC_MAX_PIXELS) {
    throw new KycValidationError('Image pixel count exceeds allowed maximum', 'PIXEL_BOMB');
  }
};

const cleanString = (value: unknown, maxLen: number) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.slice(0, maxLen);
};

/**
 * Allowlist-serialize personal info. Drops email (data minimization — use account email).
 * Rejects unknown keys by omission.
 */
export const serializePersonalInfo = (input: unknown) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new KycValidationError('personal_info is required', 'PERSONAL_INFO_REQUIRED');
  }
  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of KYC_PERSONAL_INFO_ALLOWLIST) {
    if (!(key in source)) continue;
    if (key === 'address') {
      const addrRaw = source.address;
      if (!addrRaw || typeof addrRaw !== 'object' || Array.isArray(addrRaw)) continue;
      const addrIn = addrRaw as Record<string, unknown>;
      const addrOut: Record<string, string> = {};
      for (const aKey of KYC_ADDRESS_ALLOWLIST) {
        const val = cleanString(addrIn[aKey], KYC_MAX_ADDRESS_FIELD_LENGTH);
        if (val) addrOut[aKey] = val;
      }
      out.address = addrOut;
      continue;
    }
    const val = cleanString(source[key], KYC_MAX_FIELD_LENGTH);
    if (val) out[key] = val;
  }

  // Explicitly ignore email and any other unknown keys.
  return out;
};

export const validateRequiredPersonalFields = (
  personalInfo: Record<string, unknown>,
  personalFields: Array<{ key: string; required?: boolean; enabled?: boolean; label?: string; type?: string }>
) => {
  for (const field of personalFields || []) {
    if (field.enabled === false) continue;
    if (!field.required) continue;
    const key = String(field.key || '');
    // Email is never required in KYC personal info (data minimization).
    if (key === 'email') continue;

    let value = '';
    if (key.startsWith('address.')) {
      const sub = key.slice('address.'.length);
      const addr = (personalInfo.address || {}) as Record<string, unknown>;
      value = String(addr[sub] || '').trim();
    } else {
      value = String(personalInfo[key] || '').trim();
    }
    if (!value) {
      throw new KycValidationError(
        `${field.label || key} is required`,
        'REQUIRED_FIELD_MISSING'
      );
    }
    if (field.type === 'date' && Number.isNaN(Date.parse(value))) {
      throw new KycValidationError(`${field.label || key} must be a valid date`, 'INVALID_DATE');
    }
  }
};

export const validateDocumentGroups = (
  documents: Array<{ type: string }>,
  documentGroups: Array<{
    key: string;
    label?: string;
    required?: boolean;
    minRequired?: number;
    options?: Array<{ key: string; required?: boolean; label?: string }>;
  }>
) => {
  const uploadedTypes = new Set((documents || []).map((d) => String(d.type || '').trim()).filter(Boolean));
  const allowedTypes = new Set<string>();

  for (const group of documentGroups || []) {
    const options = Array.isArray(group.options) ? group.options : [];
    for (const option of options) {
      if (option?.key) allowedTypes.add(String(option.key));
    }
    for (const option of options) {
      if (option?.required && !uploadedTypes.has(String(option.key))) {
        throw new KycValidationError(
          `${option.label || option.key} is required`,
          'REQUIRED_DOCUMENT_MISSING'
        );
      }
    }
    const selectedCount = options.filter((option) => uploadedTypes.has(String(option.key))).length;
    const minimum = Math.max(Number(group.minRequired || 0), group.required ? 1 : 0);
    if (group.required && selectedCount < minimum) {
      throw new KycValidationError(
        `Please upload required documents in "${group.label || group.key}"`,
        'REQUIRED_DOCUMENT_GROUP'
      );
    }
  }

  for (const type of uploadedTypes) {
    if (!allowedTypes.has(type)) {
      throw new KycValidationError(`Document type "${type}" is not allowed`, 'DOCUMENT_TYPE_NOT_ALLOWED');
    }
  }
};
