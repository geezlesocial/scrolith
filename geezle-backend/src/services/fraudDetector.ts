import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function scoreEvent({ postId, actorId, ip, userAgent }: { postId?: string; actorId?: string; ip?: string; userAgent?: string; }) {
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

export const computeWalletFraudScore = async (userId: string) => {
  // Recompute a wallet-level fraud score by combining multiple signals.
  const reasons: string[] = [];
  const wallet = await prisma.gcoinWallet.findUnique({ where: { userId } });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  let base = wallet?.fraudScore || 0;

  // recent activity velocity
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentEvents = await prisma.gcoinEarningEvent.count({ where: { actorId: userId, createdAt: { gt: tenMinutesAgo } } });
  if (recentEvents > 20) {
    base += 40;
    reasons.push('High event velocity');
  } else if (recentEvents > 5) {
    base += 10;
    reasons.push('Elevated event rate');
  }

  // sudden lifetime earnings vs balance heuristic
  if (wallet) {
    if ((wallet.lifetimeEarned || 0) < 5 && (wallet.balance || 0) > 50) {
      base += 50;
      reasons.push('Sudden large balance for new earner');
    }
    // suspicious recipient patterns
    if (wallet.recipientId && wallet.recipientId.includes('SUS')) {
      base += 30;
      reasons.push('Suspicious recipient id pattern');
    }
  }

  // account age signal
  if (user) {
    const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays < 7) {
      base += 15;
      reasons.push('New account');
    }
  }

  // include event-level heuristics
  const eventScore = await scoreEvent({ actorId: userId });
  if (eventScore > 0) {
    base += eventScore;
    reasons.push('Event-level signals');
  }

  // IP/UA aggregation: inspect recent events' eventKey to extract IPs and UA indicators
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const events = await prisma.gcoinEarningEvent.findMany({ where: { actorId: userId, createdAt: { gt: sevenDaysAgo } }, select: { eventKey: true, createdAt: true }, take: 1000 });
    const ipRegex = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
    const distinctIps = new Set<string>();
    const distinctUas = new Set<string>();
    for (const e of events) {
      const k = e.eventKey || '';
      const m = ipRegex.exec(k);
      if (m) distinctIps.add(m[0]);
      // UA heuristics: look for UA= or ua= or 'Mozilla' tokens
      const uaMatch = k.match(/ua=([^:|;]+)/i) || k.match(/UA=([^:|;]+)/i);
      if (uaMatch && uaMatch[1]) distinctUas.add(uaMatch[1].substring(0, 50));
      if (!uaMatch && k.includes('Mozilla')) distinctUas.add('Mozilla');
    }

    if (distinctIps.size > 5) {
      base += 40;
      reasons.push('Rotating IPs');
    }
    if (distinctUas.size > 10) {
      base += 20;
      reasons.push('Many user-agents');
    }

    // cross-actor reuse: if an IP appears used by many other actors recently, flag it
    for (const ip of Array.from(distinctIps)) {
      const shared = await prisma.gcoinEarningEvent.count({ where: { eventKey: { contains: ip } as any, actorId: { not: userId }, createdAt: { gt: sevenDaysAgo } } as any });
      if (shared > 50) {
        base += 25;
        reasons.push('Shared IP high reuse');
        break;
      }
    }
  } catch (e) {
    // non-fatal: don't block scoring on event parsing failures
    console.error('Error parsing event keys for fraud scoring', e);
  }

  const final = Math.max(0, Math.min(100, Math.round(base)));

  // derive risk level
  const riskLevel = final >= 90 ? 'Critical' : final >= 50 ? 'High' : final >= 20 ? 'Medium' : 'Low';

  // persist if changed and return changed flag
  let changed = false;
  try {
    if (wallet && wallet.fraudScore !== final) {
      await prisma.gcoinWallet.update({ where: { userId }, data: { fraudScore: final } });
      changed = true;
    }
  } catch (e) {
    // non-fatal
    console.error('Failed to persist recomputed fraud score', e);
  }

  return { fraudScore: final, reasons, riskLevel, changed };
};

export const recomputeAllWalletScores = async () => {
  const wallets = await prisma.gcoinWallet.findMany();
  const start = Date.now();
  const results = await Promise.all(wallets.map(w => computeWalletFraudScore(w.userId)));
  const durationMs = Date.now() - start;
  const changedCount = results.filter(r => (r as any).changed).length;
  try {
    const metrics = await import('../utils/metrics');
    try { metrics.recordRecomputeMetrics({ wallets: wallets.length, changed: changedCount, durationMs }); } catch (e) {}
  } catch (e) {
    // metrics optional
  }
  return { results, changedCount, durationMs };
};
