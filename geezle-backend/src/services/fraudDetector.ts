import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function scoreEvent({ postId, actorId, ip, userAgent }: { postId: string; actorId?: string; ip?: string; userAgent?: string; }) {
  // Basic signals: same IP repeated, same UA repeated, new account rapid events
  let score = 0;
  if (ip) {
    const recent = await prisma.gcoinEarningEvent.count({ where: { eventKey: { contains: ip } } as any });
    if (recent > 20) score += 50;
  }
  if (userAgent) {
    const recentUa = await prisma.gcoinEarningEvent.count({ where: { eventKey: { contains: userAgent.substring(0, 20) } } as any });
    if (recentUa > 50) score += 30;
  }
  if (actorId) {
    // account age
    const user = await prisma.user.findUnique({ where: { id: actorId } });
    if (user) {
      const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays < 7) score += 20;
    }
  }
  return score; // higher is more suspicious
}
