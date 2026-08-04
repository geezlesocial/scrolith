import {
  __mediaAvailabilityTestUtils,
  isStoredMediaAvailable,
  stripUploadsPrefixForAvailability
} from '../services/media/mediaAvailability.service';

jest.mock('../services/storage/blobStorage', () => ({
  blobExistsByName: jest.fn(async () => false),
  isAzureBlobConfigured: jest.fn(() => false)
}));

jest.mock('../services/storage/databaseStorage', () => ({
  databaseStorageExistsByName: jest.fn(async () => false)
}));

jest.mock('../services/storage/firebaseStorage', () => ({
  firebaseStorageExistsByName: jest.fn(async () => false)
}));

jest.mock('../services/storage/gcsMediaStorage', () => ({
  gcsMediaExists: jest.fn(async () => false)
}));

describe('mediaAvailability', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('normalizes legacy uploads URLs into storage keys', () => {
    expect(
      stripUploadsPrefixForAvailability(
        'https://api.scrolith.com/uploads/1770655972357-Social_Media_Management-1.jpg'
      )
    ).toBe('1770655972357-Social_Media_Management-1.jpg');
    expect(stripUploadsPrefixForAvailability('/uploads/folder/media.png')).toBe('folder/media.png');
  });

  test('rejects unsafe relative storage key candidates', () => {
    expect(__mediaAvailabilityTestUtils.isSafeRelativeStorageKey('../secret.png')).toBe(false);
    expect(__mediaAvailabilityTestUtils.isSafeRelativeStorageKey('uploads/../secret.png')).toBe(false);
    expect(__mediaAvailabilityTestUtils.isSafeRelativeStorageKey('media/photo.jpg')).toBe(true);
  });

  test('marks missing legacy local image rows unavailable', async () => {
    await expect(
      isStoredMediaAvailable({
        storageProvider: 'local',
        storageKey: '1770655972357-Social_Media_Management-1.jpg',
        url: 'https://api.scrolith.com/uploads/1770655972357-Social_Media_Management-1.jpg',
        mimeType: 'image/jpeg'
      } as any)
    ).resolves.toBe(false);
  });

  test('builds unique candidates from storage key, url, filename, and original name', () => {
    expect(
      __mediaAvailabilityTestUtils.buildStorageKeyCandidates({
        storageKey: 'uploads/a.jpg',
        url: 'https://api.scrolith.com/uploads/a.jpg',
        filename: 'a.jpg',
        originalName: 'a.jpg'
      })
    ).toEqual(['uploads/a.jpg', 'a.jpg']);
  });

  test('does not probe GCS fallback when Azure is the selected storage driver', () => {
    process.env.UPLOAD_DRIVER = 'azure_blob';
    process.env.STORAGE_DRIVER = 'azure_blob';
    delete process.env.STORAGE_BUCKET;
    delete process.env.GCS_MEDIA_BUCKET;
    delete process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    delete process.env.GCLOUD_STORAGE_BUCKET;
    expect(__mediaAvailabilityTestUtils.shouldProbeGcsLegacyFallback()).toBe(false);
  });
});
