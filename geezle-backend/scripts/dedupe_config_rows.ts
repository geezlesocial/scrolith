import prisma from '../src/utils/prismaClient';

type DedupeResult = {
  model: string;
  total: number;
  keptId?: string;
  deleted: number;
  skipped?: boolean;
};

type Row = { id: string; updatedAt: string | Date | null };

const fetchRows = async (table: string): Promise<Row[] | null> => {
  try {
    // Use raw SQL to avoid Prisma schema mismatches when DB is behind migrations.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, "updatedAt" FROM "${table}"`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`Skipping ${table}: ${msg}`);
    return null;
  }
};

const deleteRows = async (table: string, ids: string[]): Promise<number> => {
  if (!ids.length) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `DELETE FROM "${table}" WHERE id IN (${placeholders})`;
  const count = await prisma.$executeRawUnsafe(sql, ...ids);
  return Number(count) || 0;
};

const dedupeTable = async (label: string, table: string): Promise<DedupeResult> => {
  const rows = await fetchRows(table);
  if (!rows) return { model: label, total: 0, deleted: 0, skipped: true };
  if (rows.length <= 1) {
    return { model: label, total: rows.length, keptId: rows[0]?.id, deleted: 0 };
  }

  const sorted = [...rows].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
  const keep = sorted[0];
  const toDelete = sorted.slice(1).map((r) => r.id);
  const deleted = await deleteRows(table, toDelete);
  return { model: label, total: rows.length, keptId: keep.id, deleted };
};

async function run() {
  const results: DedupeResult[] = [];

  results.push(await dedupeTable('Settings', 'Settings'));
  results.push(await dedupeTable('GcoinSettings', 'GcoinSettings'));
  results.push(await dedupeTable('CommunityConfig', 'community_config'));

  console.log('Dedupe results:');
  results.forEach((r) => {
    const status = r.skipped ? 'skipped' : 'ok';
    console.log(
      `${r.model}: status=${status} total=${r.total} kept=${r.keptId ?? 'n/a'} deleted=${r.deleted}`
    );
  });
}

run()
  .catch((err) => {
    console.error('Dedupe failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
