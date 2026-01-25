import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function selectAdsForPlacement(placement: string, limit = 5) {
  // simple selection: active ads for placement ordered by remainingBudget desc
  const ads = await prisma.communityAd.findMany({ where: { placement, status: 'ACTIVE' }, orderBy: { remainingBudget: 'desc' }, take: limit });
  return ads;
}

export async function recordImpression(adId: string, date = new Date()) {
  const day = new Date(date);
  day.setUTCHours(0,0,0,0);
  const key = { adId, date: day };
  await prisma.$executeRaw`INSERT INTO "AdMetricsDaily" ("id","adId","date","impressions","clicks","spend","createdAt") VALUES (gen_random_uuid(), ${adId}, ${day}, 1, 0, 0, now()) ON CONFLICT ("adId","date") DO UPDATE SET "impressions" = "AdMetricsDaily"."impressions" + 1, "spend" = "AdMetricsDaily"."spend" + 0`; // fallback if pg functions missing
  await prisma.communityAd.update({ where: { id: adId }, data: { impressions: { increment: 1 }, impressionsLeft: { decrement: 1 }, impressionsBought: { decrement: 0 } as any } as any });
}

export async function recordClick(adId: string, date = new Date()) {
  const day = new Date(date);
  day.setUTCHours(0,0,0,0);
  await prisma.$executeRaw`INSERT INTO "AdMetricsDaily" ("id","adId","date","impressions","clicks","spend","createdAt") VALUES (gen_random_uuid(), ${adId}, ${day}, 0, 1, 0, now()) ON CONFLICT ("adId","date") DO UPDATE SET "clicks" = "AdMetricsDaily"."clicks" + 1`;
  await prisma.communityAd.update({ where: { id: adId }, data: { clicks: { increment: 1 } } as any });
}
