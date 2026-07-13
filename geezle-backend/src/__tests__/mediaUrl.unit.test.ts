import {
  buildFileContentUrl,
  buildUploadsUrl,
  isLegacyUploadsUrl,
  isSignedOrTokenizedUrl,
  normalizeMediaArray,
  normalizePublicMedia,
  preferServableMediaUrl,
  resolveDirectMediaUrl,
  resolveMediaDescriptor
} from '../utils/mediaUrl';

describe('mediaUrl normalization', () => {
  const baseUrl = 'https://api.scrolith.com';

  test('preserves signed URLs unchanged', () => {
    const signed =
      'https://storage.googleapis.com/bucket/key.jpg?X-Goog-Algorithm=GOOG4&X-Goog-Signature=abc&X-Goog-Credential=x';
    expect(isSignedOrTokenizedUrl(signed)).toBe(true);
    expect(resolveDirectMediaUrl(signed, baseUrl)).toBe(signed);
    expect(preferServableMediaUrl({ url: signed }, { baseUrl })).toBe(signed);
  });

  test('preserves external HTTPS URLs unchanged', () => {
    const external = 'https://cdn.example.com/photo.jpg';
    expect(preferServableMediaUrl({ url: external }, { baseUrl })).toBe(external);
  });

  test('preserves canonical API content URLs unchanged', () => {
    const content = `${baseUrl}/api/files/content/file_abc123456789`;
    expect(preferServableMediaUrl({ url: content }, { baseUrl })).toBe(content);
    expect(buildFileContentUrl(content, baseUrl)).toBe(content);
  });

  test('buildFileContentUrl does not double-wrap', () => {
    expect(buildFileContentUrl('file_abc123456789', baseUrl)).toBe(
      `${baseUrl}/api/files/content/file_abc123456789`
    );
    expect(buildFileContentUrl('/api/files/content/file_abc123456789', baseUrl)).toBe(
      `${baseUrl}/api/files/content/file_abc123456789`
    );
  });

  test('valid public File row path prefers content when fileServable=true', () => {
    const descriptor = resolveMediaDescriptor(
      {
        fileId: 'file_abc123456789',
        storagePath: 'marketplace/listings/a.png',
        url: `${baseUrl}/uploads/marketplace/listings/a.png`
      },
      { baseUrl, fileServable: true }
    );
    expect(descriptor.url).toContain('/api/files/content/file_abc123456789');
    expect(descriptor.fallbackUrl).toContain('/uploads/');
  });

  test('missing File row / unverified fileId preserves working uploads URL', () => {
    const descriptor = resolveMediaDescriptor(
      {
        fileId: 'cee0cdb0-0166-4512-a1fa-be7fd94e7a9f',
        storagePath: '1783047535108-photo.jpg',
        url: `${baseUrl}/uploads/1783047535108-photo.jpg`
      },
      { baseUrl, fileServable: false }
    );
    expect(descriptor.url).toContain('/uploads/1783047535108-photo.jpg');
    expect(descriptor.fallbackUrl).toContain('/api/files/content/');
  });

  test('orphaned fileId alone still produces content URL (not empty/malformed)', () => {
    const url = preferServableMediaUrl({ fileId: 'orphan_file_id_12345' }, { baseUrl });
    expect(url).toBe(`${baseUrl}/api/files/content/orphan_file_id_12345`);
  });

  test('malformed input returns safe empty', () => {
    expect(preferServableMediaUrl(null, { baseUrl })).toBeNull();
    expect(preferServableMediaUrl('', { baseUrl })).toBeNull();
    expect(preferServableMediaUrl({ name: 'no-media' }, { baseUrl })).toBeNull();
    expect(normalizePublicMedia({ name: 'no-media' }, { baseUrl })).toBeNull();
  });

  test('marketplace media with storagePath keeps uploads URL', () => {
    const normalized = normalizePublicMedia(
      {
        fileId: 'missing-file-row-id-xyz',
        storagePath: 'listings/cover.png',
        type: 'image'
      },
      { baseUrl, fileServable: false }
    );
    expect(normalized?.url).toBe(`${baseUrl}/uploads/listings/cover.png`);
  });

  test('buildUploadsUrl and isLegacyUploadsUrl helpers', () => {
    expect(isLegacyUploadsUrl('/uploads/a.png')).toBe(true);
    expect(buildUploadsUrl('a/b.png', baseUrl)).toBe(`${baseUrl}/uploads/a/b.png`);
  });

  test('normalizeMediaArray maps dual-path entries', () => {
    const rows = normalizeMediaArray(
      [
        {
          fileId: 'file_one_1234567890',
          storagePath: 'one.png',
          url: `${baseUrl}/uploads/one.png`
        }
      ],
      { baseUrl }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toContain('/uploads/one.png');
  });
});
