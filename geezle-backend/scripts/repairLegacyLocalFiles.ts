import fs from 'fs';
import path from 'path';
import prisma from '../src/utils/prismaClient';
import {
  databaseStorageExistsByName,
  uploadBufferToDatabaseStorage
} from '../src/services/storage/databaseStorage';

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DEFAULT_MIME_PREFIX = 'video/';
const FALLBACK_VIDEO_THUMBNAIL = '__video_fallback_thumbnail.svg';

type RepairTarget = {
  id: string;
  storageKey: string;
  storageProvider: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: bigint;
  thumbnailUrl: string | null;
};

const safeFilename = (name: string) => String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');

const stripTimestampPrefix = (value: string) => {
  const normalized = String(value || '').trim();
  const dashIndex = normalized.indexOf('-');
  return dashIndex >= 0 ? normalized.slice(dashIndex + 1) : normalized;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const includeAll = args.includes('--all');
  const mimePrefixArg = args.find((arg) => arg.startsWith('--mime-prefix='));
  const mimePrefix = includeAll ? '' : mimePrefixArg?.slice('--mime-prefix='.length) || DEFAULT_MIME_PREFIX;
  return { apply, mimePrefix };
};

const listUploadFiles = () => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    throw new Error(`Uploads directory not found: ${UPLOADS_DIR}`);
  }

  return fs
    .readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(UPLOADS_DIR, entry.name);
      return {
        name: entry.name,
        fullPath,
        size: fs.statSync(fullPath).size
      };
    });
};

const buildUploadIndexes = () => {
  const diskFiles = listUploadFiles();
  const byExactName = new Map<string, { name: string; fullPath: string; size: number }>();
  const bySuffix = new Map<string, Array<{ name: string; fullPath: string; size: number }>>();

  for (const file of diskFiles) {
    byExactName.set(file.name, file);
    const suffix = stripTimestampPrefix(file.name);
    const existing = bySuffix.get(suffix) || [];
    existing.push(file);
    bySuffix.set(suffix, existing);
  }

  return { byExactName, bySuffix };
};

const resolveFallbackPath = (
  target: RepairTarget,
  indexes: ReturnType<typeof buildUploadIndexes>
) => {
  const exact = indexes.byExactName.get(target.storageKey);
  if (exact) return exact;

  const exactByFilename = indexes.byExactName.get(target.filename);
  if (exactByFilename) return exactByFilename;

  const suffixCandidates = Array.from(
    new Set(
      [
        stripTimestampPrefix(target.storageKey),
        stripTimestampPrefix(target.filename),
        safeFilename(target.originalName),
        stripTimestampPrefix(safeFilename(target.originalName))
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  for (const suffix of suffixCandidates) {
    const matches = indexes.bySuffix.get(suffix) || [];
    const exactSizeMatch = matches.find((file) => file.size === Number(target.size || 0));
    if (exactSizeMatch) return exactSizeMatch;
    if (matches.length === 1) return matches[0];
  }

  return null;
};

const loadTargets = async (mimePrefix: string) => {
  const where: any = {
    storageProvider: 'local'
  };

  if (mimePrefix) {
    where.mimeType = {
      startsWith: mimePrefix
    };
  }

  return prisma.file.findMany({
    where,
    select: {
      id: true,
      storageKey: true,
      storageProvider: true,
      filename: true,
      originalName: true,
      mimeType: true,
      size: true,
      thumbnailUrl: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};

const shouldSkipThumbnailMigration = (thumbnailUrl?: string | null) =>
  !thumbnailUrl || String(thumbnailUrl).includes(FALLBACK_VIDEO_THUMBNAIL);

const main = async () => {
  const { apply, mimePrefix } = parseArgs();
  const indexes = buildUploadIndexes();
  const targets = await loadTargets(mimePrefix);

  const report: Array<{
    id: string;
    storageKey: string;
    mimeType: string;
    status: 'already-managed' | 'ready' | 'missing-local-source' | 'migrated';
    sourcePath?: string;
  }> = [];

  for (const target of targets as RepairTarget[]) {
    const alreadyManaged = await databaseStorageExistsByName(target.storageKey);
    if (alreadyManaged) {
      report.push({
        id: target.id,
        storageKey: target.storageKey,
        mimeType: target.mimeType,
        status: 'already-managed'
      });
      continue;
    }

    const fallback = resolveFallbackPath(target, indexes);
    if (!fallback) {
      report.push({
        id: target.id,
        storageKey: target.storageKey,
        mimeType: target.mimeType,
        status: 'missing-local-source'
      });
      continue;
    }

    if (!apply) {
      report.push({
        id: target.id,
        storageKey: target.storageKey,
        mimeType: target.mimeType,
        status: 'ready',
        sourcePath: fallback.fullPath
      });
      continue;
    }

    const buffer = fs.readFileSync(fallback.fullPath);
    await uploadBufferToDatabaseStorage({
      buffer,
      contentType: target.mimeType || 'application/octet-stream',
      fileName: target.storageKey
    });

    await prisma.file.update({
      where: { id: target.id },
      data: {
        storageProvider: 'database_storage'
      }
    });

    if (!shouldSkipThumbnailMigration(target.thumbnailUrl)) {
      // Leave thumbnail migration conservative; the file will still render if the original
      // asset is restored and the thumbnail path was already healthy.
    }

    report.push({
      id: target.id,
      storageKey: target.storageKey,
      mimeType: target.mimeType,
      status: 'migrated',
      sourcePath: fallback.fullPath
    });
  }

  const summary = {
    apply,
    mimePrefix: mimePrefix || 'all',
    totalScanned: report.length,
    alreadyManaged: report.filter((item) => item.status === 'already-managed').length,
    ready: report.filter((item) => item.status === 'ready').length,
    migrated: report.filter((item) => item.status === 'migrated').length,
    missingLocalSource: report.filter((item) => item.status === 'missing-local-source').length
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

main()
  .catch((error) => {
    console.error('[repairLegacyLocalFiles] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
