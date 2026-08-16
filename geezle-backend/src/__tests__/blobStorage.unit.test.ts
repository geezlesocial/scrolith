const mockDownload = jest.fn();
const mockGetBlobClient = jest.fn(() => ({ download: mockDownload }));
const mockGetContainerClient = jest.fn(() => ({ getBlobClient: mockGetBlobClient }));

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({ getContainerClient: mockGetContainerClient }))
  }
}));

import { downloadBlobByName } from '../services/storage/blobStorage';

describe('Azure blob download ranges', () => {
  beforeEach(() => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'uploads';
    mockDownload.mockReset();
    mockGetBlobClient.mockClear();
    mockDownload.mockResolvedValue({ readableStreamBody: null });
  });

  test('forwards an inclusive byte window to Azure Blob Storage', async () => {
    await downloadBlobByName('/scroll/video.mp4', { offset: 1024, count: 4096 });

    expect(mockGetBlobClient).toHaveBeenCalledWith('scroll/video.mp4');
    expect(mockDownload).toHaveBeenCalledWith(1024, 4096);
  });

  test('keeps full-download callers compatible', async () => {
    await downloadBlobByName('images/post.jpg');

    expect(mockGetBlobClient).toHaveBeenCalledWith('images/post.jpg');
    expect(mockDownload).toHaveBeenCalledWith(undefined, undefined);
  });
});
