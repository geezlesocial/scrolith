import prisma from '../../utils/prismaClient';

const normalizeObjectKey = (value: string) => String(value || '').replace(/^\/+/, '').trim();

const createNotFoundError = (message: string) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = 'NOT_FOUND';
  return error;
};

const toPrismaBytes = (buffer: Buffer): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return bytes;
};

export const isDatabaseStorageConfigured = () => true;

export const uploadBufferToDatabaseStorage = async (params: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}) => {
  const objectKey = normalizeObjectKey(params.fileName);
  const data = toPrismaBytes(params.buffer);
  await prisma.managedUploadObject.upsert({
    where: { objectKey },
    create: {
      objectKey,
      contentType: params.contentType || 'application/octet-stream',
      sizeBytes: BigInt(params.buffer.length || 0),
      data
    },
    update: {
      contentType: params.contentType || 'application/octet-stream',
      sizeBytes: BigInt(params.buffer.length || 0),
      data
    }
  });
  return { objectKey };
};

export const deleteDatabaseStorageByName = async (fileName?: string | null) => {
  const objectKey = normalizeObjectKey(String(fileName || ''));
  if (!objectKey) return;
  await prisma.managedUploadObject.deleteMany({
    where: { objectKey }
  });
};

export const databaseStorageExistsByName = async (fileName: string) => {
  const objectKey = normalizeObjectKey(fileName);
  if (!objectKey) return false;
  const existing = await prisma.managedUploadObject.findUnique({
    where: { objectKey },
    select: { id: true }
  });
  return Boolean(existing?.id);
};

export const getDatabaseStorageMetadataByName = async (fileName: string) => {
  const objectKey = normalizeObjectKey(fileName);
  const row = await prisma.managedUploadObject.findUnique({
    where: { objectKey },
    select: {
      contentType: true,
      sizeBytes: true
    }
  });
  if (!row) {
    throw createNotFoundError('Managed upload object not found');
  }
  return {
    contentType: row.contentType,
    size: Number(row.sizeBytes || 0)
  };
};

export const downloadDatabaseStorageBufferByName = async (fileName: string) => {
  const objectKey = normalizeObjectKey(fileName);
  const row = await prisma.managedUploadObject.findUnique({
    where: { objectKey },
    select: { data: true }
  });
  if (!row?.data) {
    throw createNotFoundError('Managed upload object not found');
  }
  return Buffer.from(row.data);
};
