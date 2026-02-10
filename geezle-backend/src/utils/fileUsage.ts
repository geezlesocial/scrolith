import prisma from './prismaClient';

type UsageEntry = {
  fileId: string;
  usageType: string;
  usageId: string;
  label?: string | null;
};

export const syncFileUsages = async (usageType: string, usageId: string, fileIds: string[], label?: string) => {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  await prisma.fileUsage.deleteMany({ where: { usageType, usageId } });
  if (!ids.length) return [];
  await prisma.fileUsage.createMany({
    data: ids.map((fileId) => ({ fileId, usageType, usageId, label: label || null })),
    skipDuplicates: true
  });
  return ids;
};

export const addFileUsage = async (entry: UsageEntry) => {
  if (!entry.fileId) return null;
  try {
    return await prisma.fileUsage.create({
      data: {
        fileId: entry.fileId,
        usageType: entry.usageType,
        usageId: entry.usageId,
        label: entry.label || null
      }
    });
  } catch (e) {
    // ignore duplicate errors
    return null;
  }
};

export const removeUsage = async (usageType: string, usageId: string) => {
  await prisma.fileUsage.deleteMany({ where: { usageType, usageId } });
};
