import multer from 'multer';
import { mapKycUploadError } from '../kyc.uploadErrors';
import { KycValidationError } from '../kyc.validation.service';

describe('kyc.uploadErrors', () => {
  test('maps LIMIT_FILE_SIZE to FILE_TOO_LARGE 400', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const mapped = mapKycUploadError(err);
    expect(mapped?.status).toBe(400);
    expect(mapped?.code).toBe('FILE_TOO_LARGE');
    expect(mapped?.message).not.toMatch(/stack|path|C:\\|\/tmp/i);
  });

  test('maps LIMIT_FILE_COUNT to TOO_MANY_FILES', () => {
    const err = new multer.MulterError('LIMIT_FILE_COUNT');
    expect(mapKycUploadError(err)?.code).toBe('TOO_MANY_FILES');
  });

  test('maps LIMIT_UNEXPECTED_FILE to UNEXPECTED_FILE', () => {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    expect(mapKycUploadError(err)?.code).toBe('UNEXPECTED_FILE');
  });

  test('maps KycValidationError empty file', () => {
    const err = new KycValidationError('Empty file is not allowed', 'EMPTY_FILE');
    const mapped = mapKycUploadError(err);
    expect(mapped?.code).toBe('EMPTY_FILE');
    expect(mapped?.status).toBe(400);
  });

  test('maps MIME_MAGIC_MISMATCH', () => {
    const err = new KycValidationError(
      'Declared content type does not match file content',
      'MIME_MAGIC_MISMATCH'
    );
    expect(mapKycUploadError(err)?.code).toBe('MIME_MAGIC_MISMATCH');
  });

  test('maps UNSUPPORTED_TYPE', () => {
    const err = new KycValidationError('Unsupported', 'UNSUPPORTED_TYPE');
    expect(mapKycUploadError(err)?.code).toBe('UNSUPPORTED_TYPE');
  });

  test('maps sharp-like invalid content messages', () => {
    const err = Object.assign(new Error('Input buffer contains unsupported image format'), {
      code: 'ERR_INVALID_IMAGE'
    });
    const mapped = mapKycUploadError(err);
    expect(mapped?.code).toBe('INVALID_FILE_CONTENT');
    expect(mapped?.status).toBe(400);
  });

  test('does not leak sensitive fields in mapped messages', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const mapped = mapKycUploadError(err)!;
    const blob = JSON.stringify(mapped);
    expect(blob).not.toMatch(/Authorization|Bearer|signed|storage\.googleapis|password/i);
  });

  test('returns null for unknown internal errors (caller uses 500 fallback)', () => {
    expect(mapKycUploadError(new Error('unexpected db failure'))).toBeNull();
  });
});
