/**
 * Phase 20.2T — controlled KYC upload error mapping.
 * Expected client failures must never surface as HTTP 500 or leak internals.
 */
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { KycValidationError } from './kyc.validation.service';
import { KycDecisionError } from './kyc.decision.service';

export type MappedKycClientError = {
  status: number;
  code: string;
  message: string;
};

/** Map Multer and known client validation errors to stable API responses. */
export const mapKycUploadError = (error: unknown): MappedKycClientError | null => {
  if (!error) return null;

  if (error instanceof KycValidationError || error instanceof KycDecisionError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  // MulterError (runtime instanceof can fail across package copies — check name/code)
  const anyErr = error as { name?: string; code?: string; message?: string; field?: string };
  const multerCode = String(anyErr?.code || '');
  const isMulter =
    error instanceof multer.MulterError ||
    anyErr?.name === 'MulterError' ||
    multerCode.startsWith('LIMIT_');

  if (isMulter) {
    if (multerCode === 'LIMIT_FILE_SIZE') {
      return {
        status: 400,
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size of 10 MB'
      };
    }
    if (multerCode === 'LIMIT_FILE_COUNT' || multerCode === 'LIMIT_PART_COUNT') {
      return {
        status: 400,
        code: 'TOO_MANY_FILES',
        message: 'Too many files in this request'
      };
    }
    if (multerCode === 'LIMIT_UNEXPECTED_FILE') {
      return {
        status: 400,
        code: 'UNEXPECTED_FILE',
        message: 'Unexpected file field in upload'
      };
    }
    if (multerCode === 'LIMIT_FIELD_KEY' || multerCode === 'LIMIT_FIELD_VALUE' || multerCode === 'LIMIT_FIELD_COUNT') {
      return {
        status: 400,
        code: 'INVALID_MULTIPART',
        message: 'Malformed multipart upload request'
      };
    }
    return {
      status: 400,
      code: 'INVALID_MULTIPART',
      message: 'Invalid multipart upload request'
    };
  }

  // Sharp / image decoder failures often use these codes or messages
  const msg = String(anyErr?.message || '');
  const sharpish =
    /Input buffer|unsupported image|VipsJpeg|VipsPng|pngload|jpegload|webp|corrupt|premature end|invalid/i.test(
      msg
    ) || String(anyErr?.code || '').startsWith('ERR_');

  if (sharpish && /image|jpeg|png|webp|pdf|sharp|vips/i.test(msg + String(anyErr?.code || ''))) {
    return {
      status: 400,
      code: 'INVALID_FILE_CONTENT',
      message: 'File content is invalid or corrupted'
    };
  }

  return null;
};

export const sendMappedKycError = (res: Response, error: unknown, fallback: string) => {
  const mapped = mapKycUploadError(error);
  if (mapped) {
    return res.status(mapped.status).json({
      success: false,
      error: mapped.message,
      code: mapped.code
    });
  }
  // Log only opaque codes — never stack, paths, or secrets to the client
  console.error('[kyc]', fallback, (error as any)?.code || (error as any)?.name || 'error');
  return res.status(500).json({ success: false, error: fallback });
};

/**
 * Wrap multer.single so LIMIT_* errors become controlled JSON responses
 * before the controller runs.
 */
export const wrapKycMulterSingle = (upload: ReturnType<typeof multer>) => {
  const single = upload.single('file');
  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err: unknown) => {
      if (!err) return next();
      return sendMappedKycError(res, err, 'Failed to upload KYC document');
    });
  };
};
