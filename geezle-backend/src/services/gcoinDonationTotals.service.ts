import prisma from '../utils/prismaClient';

const uniqueIds = (ids: string[]) =>
  Array.from(new Set((ids || []).map((value) => String(value || '').trim()).filter(Boolean)));

const aggregateTotals = async ({
  referenceIds,
  source,
  type
}: {
  referenceIds: string[];
  source: string;
  type: string;
}) => {
  const ids = uniqueIds(referenceIds);
  if (!ids.length) return new Map<string, number>();

  const rows = await prisma.gcoinTransaction.groupBy({
    by: ['referenceId'],
    where: {
      referenceId: { in: ids },
      source,
      type,
      amount: { gt: 0 }
    },
    _sum: { amount: true }
  });

  return new Map<string, number>(
    rows
      .map((row) => [String(row.referenceId || '').trim(), Number(row._sum.amount || 0)] as const)
      .filter(([referenceId]) => Boolean(referenceId))
  );
};

export const getPostDashTotals = async (postIds: string[]) =>
  aggregateTotals({ referenceIds: postIds, source: 'community', type: 'donation_received' });

export const getPostDashTotal = async (postId: string) =>
  (await getPostDashTotals([postId])).get(String(postId || '').trim()) || 0;

export const getScrollDashTotals = async (scrollIds: string[]) =>
  aggregateTotals({ referenceIds: scrollIds, source: 'scroll', type: 'scroll_donation_received' });

export const getScrollDashTotal = async (scrollId: string) =>
  (await getScrollDashTotals([scrollId])).get(String(scrollId || '').trim()) || 0;
