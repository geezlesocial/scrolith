/**
 * CLI for Phase 2 historical media recovery.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/mediaHistoricalRecovery.ts --dry-run
 *   npx ts-node --transpile-only scripts/mediaHistoricalRecovery.ts --repair --confirm
 *   npx ts-node --transpile-only scripts/mediaHistoricalRecovery.ts --dry-run --orphans --limit=200
 *
 * Safety: never deletes. Repair refuses without --confirm.
 */
import {
  runMediaRecovery,
  type MediaRecoveryMode
} from '../src/services/storage/mediaRecovery.service';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const includeOrphanScan = args.includes('--orphans') || args.includes('--include-orphans');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const cursorArg = args.find((a) => a.startsWith('--cursor='));
  const batchArg = args.find((a) => a.startsWith('--batch-size='));
  const orphanLimitArg = args.find((a) => a.startsWith('--orphan-limit='));

  // Prefer explicit --repair/--apply; otherwise dry-run
  const resolvedMode: MediaRecoveryMode =
    args.includes('--repair') || args.includes('--apply') ? 'repair' : 'dry-run';

  return {
    mode: resolvedMode,
    confirm,
    includeOrphanScan,
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
    cursor: cursorArg ? cursorArg.split('=')[1] : null,
    batchSize: batchArg ? Number(batchArg.split('=')[1]) : undefined,
    orphanScanLimit: orphanLimitArg ? Number(orphanLimitArg.split('=')[1]) : undefined
  };
};

const main = async () => {
  const opts = parseArgs();

  if (opts.mode === 'repair' && !opts.confirm) {
    console.error('Repair mode requires --confirm. Use --dry-run for a report only.');
    process.exit(2);
  }

  console.log(
    JSON.stringify(
      {
        starting: true,
        mode: opts.mode,
        includeOrphanScan: opts.includeOrphanScan,
        limit: opts.limit ?? null,
        cursor: opts.cursor
      },
      null,
      2
    )
  );

  const report = await runMediaRecovery({
    mode: opts.mode,
    limit: opts.limit,
    cursor: opts.cursor,
    batchSize: opts.batchSize,
    includeOrphanScan: opts.includeOrphanScan,
    orphanScanLimit: opts.orphanScanLimit
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error('mediaHistoricalRecovery failed:', error);
  process.exit(1);
});
