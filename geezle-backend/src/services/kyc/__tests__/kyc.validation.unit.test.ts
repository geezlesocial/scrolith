import {
  detectMagicMime,
  serializePersonalInfo,
  validateKycUploadBuffer,
  KycValidationError
} from '../kyc.validation.service';

describe('kyc.validation', () => {
  test('detects jpeg magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMagicMime(buf).mime).toBe('image/jpeg');
  });

  test('detects png magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectMagicMime(buf).mime).toBe('image/png');
  });

  test('detects pdf magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
    expect(detectMagicMime(buf).mime).toBe('application/pdf');
  });

  test('rejects zip archives', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(() => validateKycUploadBuffer({ buffer: buf, claimedMime: 'application/pdf' })).toThrow(
      KycValidationError
    );
  });

  test('rejects mime/magic mismatch', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);
    expect(() =>
      validateKycUploadBuffer({ buffer: jpeg, claimedMime: 'application/pdf', originalName: 'x.pdf' })
    ).toThrow(/does not match/i);
  });

  test('rejects empty buffer', () => {
    expect(() => validateKycUploadBuffer({ buffer: Buffer.alloc(0) })).toThrow(/Empty/i);
  });

  test('serializes personal info allowlist and drops email', () => {
    const result = serializePersonalInfo({
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
      email: 'should-drop@example.com',
      ssn: 'should-drop',
      address: { city: 'London', country: 'UK', evil: 'nope' }
    });
    expect(result.firstName).toBe('Ada');
    expect(result.email).toBeUndefined();
    expect((result as any).ssn).toBeUndefined();
    expect((result.address as any).city).toBe('London');
    expect((result.address as any).evil).toBeUndefined();
  });
});
