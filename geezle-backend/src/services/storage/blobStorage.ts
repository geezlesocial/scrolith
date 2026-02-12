import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const DEFAULT_CONTAINER = 'uploads';

let cachedContainerClient: ContainerClient | null = null;
let cachedConnectionString = '';
let cachedContainerName = '';

const normalizeBlobName = (value: string) => value.replace(/^\/+/, '');

const getConfig = () => ({
  connectionString: String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim(),
  containerName: String(process.env.AZURE_STORAGE_CONTAINER || DEFAULT_CONTAINER).trim(),
  baseUrl: String(process.env.AZURE_BLOB_BASE_URL || '').trim().replace(/\/$/, '')
});

export const isAzureBlobConfigured = () => {
  const config = getConfig();
  return Boolean(config.connectionString && config.containerName);
};

const getContainerClient = () => {
  const config = getConfig();
  if (!config.connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is missing');
  }

  if (
    cachedContainerClient &&
    cachedConnectionString === config.connectionString &&
    cachedContainerName === config.containerName
  ) {
    return cachedContainerClient;
  }

  const blobService = BlobServiceClient.fromConnectionString(config.connectionString);
  cachedContainerClient = blobService.getContainerClient(config.containerName);
  cachedConnectionString = config.connectionString;
  cachedContainerName = config.containerName;
  return cachedContainerClient;
};

export const getBlobUrl = (blobName: string) => {
  const config = getConfig();
  const normalized = normalizeBlobName(blobName);
  if (config.baseUrl) return `${config.baseUrl}/${encodeURIComponent(normalized)}`;
  return getContainerClient().getBlockBlobClient(normalized).url;
};

export const extractBlobNameFromUrl = (urlValue: string) => {
  const config = getConfig();
  const raw = String(urlValue || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/^\/+/, '');
    const prefix = `${config.containerName}/`;
    if (path.startsWith(prefix)) return decodeURIComponent(path.slice(prefix.length));
    return null;
  } catch {
    return null;
  }
};

export async function uploadBufferToBlob(params: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}) {
  const container = getContainerClient();
  const blobName = normalizeBlobName(params.fileName);
  await container.createIfNotExists();

  const blobClient = container.getBlockBlobClient(blobName);
  await blobClient.uploadData(params.buffer, {
    blobHTTPHeaders: { blobContentType: params.contentType || 'application/octet-stream' }
  });

  return getBlobUrl(blobName);
}

export async function deleteBlobByName(blobName?: string | null) {
  if (!blobName) return;
  const container = getContainerClient();
  const normalized = normalizeBlobName(blobName);
  await container.deleteBlob(normalized, {
    deleteSnapshots: 'include'
  });
}

export async function downloadBlobByName(blobName: string) {
  const container = getContainerClient();
  const normalized = normalizeBlobName(blobName);
  const blobClient = container.getBlobClient(normalized);
  return blobClient.download();
}
