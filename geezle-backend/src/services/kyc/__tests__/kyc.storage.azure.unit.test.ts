import {
  deleteBlobByName,
  downloadBlobBufferByName,
  isAzureBlobConfigured,
  uploadBufferToBlob
} from '../../storage/blobStorage';

import {
  createKycSignedReadUrl,
  deleteKycObject,
  downloadKycObject,
  promoteKycObject,
  uploadKycObject
} from '../kyc.storage.service';

jest.mock('../../storage/blobStorage', () => ({
  deleteBlobByName: jest.fn(),
  downloadBlobBufferByName: jest.fn(),
  isAzureBlobConfigured: jest.fn(),
  uploadBufferToBlob: jest.fn()
}));

const mockIsAzureBlobConfigured =
  isAzureBlobConfigured as jest.MockedFunction<
    typeof isAzureBlobConfigured
  >;

const mockUploadBufferToBlob =
  uploadBufferToBlob as jest.MockedFunction<
    typeof uploadBufferToBlob
  >;

const mockDeleteBlobByName =
  deleteBlobByName as jest.MockedFunction<
    typeof deleteBlobByName
  >;

const mockDownloadBlobBufferByName =
  downloadBlobBufferByName as jest.MockedFunction<
    typeof downloadBlobBufferByName
  >;

describe('KYC Azure Blob storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockIsAzureBlobConfigured.mockReturnValue(true);

    mockUploadBufferToBlob.mockResolvedValue(
      'https://example.blob.core.windows.net/private/test'
    );

    mockDeleteBlobByName.mockResolvedValue(undefined);

    mockDownloadBlobBufferByName.mockResolvedValue(
      Buffer.from('downloaded-document')
    );
  });

  it('uploads quarantine documents to Azure Blob under the private KYC namespace', async () => {
    const buffer = Buffer.from('private-kyc-document');

    const result = await uploadKycObject({
      namespace: 'quarantine',
      buffer,
      contentType: 'image/jpeg'
    });

    expect(result.objectKey).toMatch(
      /^kyc\/quarantine\/[a-f0-9]{32}$/
    );

    expect(result.storageProvider).toBe('azure_blob');

    expect(result.sizeBytes).toBe(buffer.length);

    expect(result.contentType).toBe('image/jpeg');

    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

    expect(mockUploadBufferToBlob).toHaveBeenCalledTimes(1);

    expect(mockUploadBufferToBlob).toHaveBeenCalledWith({
      buffer,
      contentType: 'image/jpeg',
      fileName: result.objectKey
    });
  });

  it('promotes a quarantine document into the clean Azure namespace', async () => {
    const buffer = Buffer.from('validated-clean-document');
    const quarantineKey =
      'kyc/quarantine/11111111111111111111111111111111';

    const result = await promoteKycObject({
      quarantineKey,
      buffer,
      contentType: 'application/pdf'
    });

    expect(result.objectKey).toMatch(
      /^kyc\/clean\/[a-f0-9]{32}$/
    );

    expect(result.storageProvider).toBe('azure_blob');

    expect(mockUploadBufferToBlob).toHaveBeenCalledTimes(1);

    expect(mockUploadBufferToBlob).toHaveBeenCalledWith({
      buffer,
      contentType: 'application/pdf',
      fileName: result.objectKey
    });

    expect(mockDeleteBlobByName).toHaveBeenCalledWith(
      quarantineKey
    );
  });

  it('downloads a private KYC object from Azure Blob', async () => {
    const key =
      'kyc/clean/22222222222222222222222222222222';

    const expected = Buffer.from('downloaded-document');

    mockDownloadBlobBufferByName.mockResolvedValue(expected);

    const result = await downloadKycObject(key);

    expect(result).toEqual(expected);

    expect(
      mockDownloadBlobBufferByName
    ).toHaveBeenCalledTimes(1);

    expect(
      mockDownloadBlobBufferByName
    ).toHaveBeenCalledWith(key);
  });

  it('rejects object keys outside the KYC private namespace', async () => {
    await expect(
      downloadKycObject('public/profile/photo.jpg')
    ).rejects.toMatchObject({
      code: 'INVALID_KEY',
      status: 400
    });

    expect(
      mockDownloadBlobBufferByName
    ).not.toHaveBeenCalled();
  });

  it('refuses KYC storage when Azure Blob is not configured', async () => {
    mockIsAzureBlobConfigured.mockReturnValue(false);

    await expect(
      uploadKycObject({
        namespace: 'quarantine',
        buffer: Buffer.from('document'),
        contentType: 'image/png'
      })
    ).rejects.toMatchObject({
      code: 'KYC_STORAGE_UNAVAILABLE',
      status: 503
    });

    expect(mockUploadBufferToBlob).not.toHaveBeenCalled();
  });

  it('treats deletion of an already missing Azure blob as idempotent', async () => {
    mockDeleteBlobByName.mockRejectedValue({
      statusCode: 404,
      code: 'BlobNotFound'
    });

    await expect(
      deleteKycObject(
        'kyc/quarantine/33333333333333333333333333333333'
      )
    ).resolves.toBeUndefined();
  });

  it('uses authenticated streaming fallback instead of exposing a permanent Azure URL', async () => {
    const result = await createKycSignedReadUrl(
      'kyc/clean/44444444444444444444444444444444'
    );

    expect(result).toBeNull();
  });

  it('does not allow signed-read handling outside the clean namespace', async () => {
    await expect(
      createKycSignedReadUrl(
        'kyc/quarantine/55555555555555555555555555555555'
      )
    ).rejects.toMatchObject({
      code: 'SIGNED_URL_NAMESPACE',
      status: 400
    });
  });
});