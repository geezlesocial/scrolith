/**
 * Read-only media linkage audit.
 *
 * Reports:
 * - marketplace media with fileId but missing File rows
 * - marketplace media with storagePath (legacy dual-path)
 * - File rows referenced by marketplace that may not serve content
 * - business pages with logo/cover file ids
 * - profile photo / cover references
 *
 * Usage (from geezle-backend):
 *   npx ts-node --transpile-only src/scripts/auditMediaLinkage.ts
 *
 * Does NOT mutate data.
 */
import prisma from '../utils/prismaClient';

type CountRow = { label: string; count: number; samples?: string[] };

const sampleIds = (ids: string[], limit = 5) => ids.slice(0, limit);

async function main() {
  const report: CountRow[] = [];

  const marketplaceMedia = await prisma.marketplaceListingMedia.findMany({
    select: {
      id: true,
      listingId: true,
      fileId: true,
      storagePath: true,
      url: true
    },
    take: 5000
  });

  const marketplaceFileIds = Array.from(
    new Set(marketplaceMedia.map((row) => String(row.fileId || '').trim()).filter(Boolean))
  );

  const existingFiles = marketplaceFileIds.length
    ? await prisma.file.findMany({
        where: { id: { in: marketplaceFileIds } },
        select: { id: true, storageKey: true, url: true, visibility: true, storageProvider: true }
      })
    : [];
  const existingFileIds = new Set(existingFiles.map((row) => row.id));

  const orphanedMarketplace = marketplaceMedia.filter(
    (row) => row.fileId && !existingFileIds.has(String(row.fileId))
  );
  const dualPathMarketplace = marketplaceMedia.filter(
    (row) => row.fileId && String(row.storagePath || '').trim()
  );
  const uploadsOnlyMarketplace = marketplaceMedia.filter(
    (row) => !row.fileId && String(row.storagePath || row.url || '').trim()
  );

  report.push({
    label: 'marketplace_media_total_sampled',
    count: marketplaceMedia.length
  });
  report.push({
    label: 'marketplace_media_with_fileId_missing_File_row',
    count: orphanedMarketplace.length,
    samples: sampleIds(orphanedMarketplace.map((row) => `${row.id}:${row.fileId}`))
  });
  report.push({
    label: 'marketplace_media_dual_path_fileId_and_storagePath',
    count: dualPathMarketplace.length,
    samples: sampleIds(dualPathMarketplace.map((row) => `${row.id}:${row.fileId}`))
  });
  report.push({
    label: 'marketplace_media_uploads_only',
    count: uploadsOnlyMarketplace.length
  });

  const pages = await prisma.communityBusinessPage.findMany({
    select: { id: true, logoFileId: true, coverFileId: true },
    take: 2000
  });
  const pageFileIds = Array.from(
    new Set(
      pages
        .flatMap((page) => [page.logoFileId, page.coverFileId])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  const pageFiles = pageFileIds.length
    ? await prisma.file.findMany({ where: { id: { in: pageFileIds } }, select: { id: true } })
    : [];
  const pageFileSet = new Set(pageFiles.map((row) => row.id));
  const orphanedPageMedia = pages.filter(
    (page) =>
      (page.logoFileId && !pageFileSet.has(page.logoFileId)) ||
      (page.coverFileId && !pageFileSet.has(page.coverFileId))
  );
  report.push({
    label: 'business_pages_with_missing_logo_or_cover_File',
    count: orphanedPageMedia.length,
    samples: sampleIds(orphanedPageMedia.map((page) => page.id))
  });

  const usersWithPhoto = await prisma.user.count({
    where: { OR: [{ profilePhotoFileId: { not: null } }, { avatar: { not: null } }] }
  });
  report.push({ label: 'users_with_profile_photo_or_avatar_ref', count: usersWithPhoto });

  const privateFiles = await prisma.file.count({ where: { visibility: 'PRIVATE' } });
  const publicFiles = await prisma.file.count({ where: { visibility: 'PUBLIC' } });
  report.push({ label: 'files_private', count: privateFiles });
  report.push({ label: 'files_public', count: publicFiles });

  console.log(JSON.stringify({ ok: true, readOnly: true, report }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
