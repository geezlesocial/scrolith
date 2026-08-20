import { Readable } from 'stream';

const download = jest.fn();
const getProperties = jest.fn();
const getBlobClient = jest.fn(() => ({ download, getProperties }));
const getContainerClient = jest.fn(() => ({ getBlobClient }));

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({ getContainerClient }))
  }
}));

import {
  __resetAzureBlobCachesForTests,
  createBlobReadStreamByRange,
  getBlobPropertiesByName
} from '../services/storage/blobStorage';

describe('Azure Blob ranged delivery adapter', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAzureBlobCachesForTests();
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'scrolith-prod-media';
    getProperties.mockResolvedValue({
      contentLength: 10,
      contentType: 'video/mp4',
      etag: 'etag-1',
      lastModified: new Date('2026-08-20T00:00:00.000Z')
    });
  });

  afterAll(() => {
    process.env = previousEnv;
  });

  test('opens only the requested inclusive byte range', async () => {
    const body = Buffer.from('0123456789');
    download.mockResolvedValue({ readableStreamBody: Readable.from([body.subarray(2, 6)]) });

    const stream = createBlobReadStreamByRange('/media/video.mp4', 2, 5);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));

    expect(Buffer.concat(chunks).toString()).toBe('2345');
    expect(getBlobClient).toHaveBeenCalledWith('media/video.mp4');
    expect(download).toHaveBeenCalledWith(2, 4);
  });

  test('exposes Azure metadata needed for HTTP validators', async () => {
    await expect(getBlobPropertiesByName('/media/video.mp4')).resolves.toMatchObject({
      contentLength: 10,
      contentType: 'video/mp4',
      etag: 'etag-1'
    });
    expect(getProperties).toHaveBeenCalledTimes(1);
  });
});
