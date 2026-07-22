/**
 * Phase 33.3 — Beta allowlist for gradual copilot / native intelligence enablement.
 */
import prisma from '../../utils/prismaClient';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

const memoryAllow = new Set<string>(
  String(process.env.SCROLITHA_AI_BETA_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const KEY = 'scrolitha_ai_beta_allowlist';

export async function getBetaAllowlist(): Promise<string[]> {
  try {
    const row = await (prisma as any).aIFeatureFlag?.findUnique?.({ where: { key: KEY } });
    if (row?.value) {
      const ids = Array.isArray(row.value?.userIds)
        ? row.value.userIds.map((x: any) => String(x))
        : Array.isArray(row.value)
          ? row.value.map((x: any) => String(x))
          : [];
      return Array.from(new Set([...memoryAllow, ...ids]));
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }
  return Array.from(memoryAllow);
}

export async function setBetaAllowlist(userIds: string[], updatedBy?: string) {
  const ids = Array.from(new Set(userIds.map((u) => String(u).trim()).filter(Boolean))).slice(0, 500);
  for (const id of ids) memoryAllow.add(id);
  try {
    await (prisma as any).aIFeatureFlag?.upsert?.({
      where: { key: KEY },
      create: { key: KEY, value: { userIds: ids }, updatedBy: updatedBy || null },
      update: { value: { userIds: ids }, version: { increment: 1 }, updatedBy: updatedBy || null }
    });
  } catch {
    /* memory */
  }
  return ids;
}

export async function isBetaAllowed(userId: string | null | undefined, isAdmin?: boolean): Promise<boolean> {
  if (!userId) return false;
  if (isAdmin) return true;
  const list = await getBetaAllowlist();
  if (!list.length) {
    // Empty allowlist + betaAllowlistOnly → admins only (caller passes isAdmin)
    return false;
  }
  return list.includes(userId);
}

export default { getBetaAllowlist, setBetaAllowlist, isBetaAllowed };
