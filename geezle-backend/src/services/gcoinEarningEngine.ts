import prisma from '../utils/prismaClient';
import { getGcoinSettingsSafe } from '../utils/gcoinSettings';

type Metric = 'view' | 'like' | 'share' | 'repost';

const isMonetizationEnabledForUser = async (userId: string) => {
  const profile = await prisma.monetizationProfile.findUnique({
    where: { userId },
    select: { isEnabled: true }
  });
  return Boolean(profile?.isEnabled);
};

// Record an event and evaluate whether awards should be issued to the post author
export const recordEventAndEvaluate = async (actorId: string, postId: string, metric: Metric) => {
  // create pending event
  const ev = await prisma.gcoinEarningEvent.create({ data: { postId, actorId, eventType: `${metric}_pending`, eventKey: `${actorId}:${metric}:${Date.now()}`, value: 0, credited: false } });

  // Load post and author
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true, viewsCount: true, likesCount: true, sharesCount: true, repostsCount: true } });
  if (!post) return { awarded: 0, units: 0 };
  if (!(await isMonetizationEnabledForUser(post.authorId))) {
    return { awarded: 0, units: 0 };
  }

  const s: any = await getGcoinSettingsSafe();
  const rules: Record<Metric, { unit: number; coinPerUnit: number }> = {
    view: { unit: Number(s.viewsUnit ?? 200), coinPerUnit: Number(s.coinPerViewsUnit ?? 1) },
    like: { unit: Number(s.likesUnit ?? 30), coinPerUnit: Number(s.coinPerLikesUnit ?? 1) },
    share: { unit: Number(s.sharesUnit ?? 50), coinPerUnit: Number(s.coinPerSharesUnit ?? 1) },
    repost: { unit: Number(s.repostsUnit ?? 40), coinPerUnit: Number(s.coinPerRepostsUnit ?? 1) }
  };

  const cfg = rules[metric];
  if (!cfg || cfg.unit <= 0) return { awarded: 0, units: 0 };

  // Count total events (pending + credited) for this post+metric
  const totalCount = await prisma.gcoinEarningEvent.count({ where: { postId, eventType: { contains: metric } } });
  const units = Math.floor(totalCount / cfg.unit);

  // Count already awarded units for this post and metric (credited events with eventType like `${metric}_award`)
  const awardedCount = await prisma.gcoinEarningEvent.count({ where: { postId, eventType: `${metric}_award`, credited: true } });
  const awardableUnits = Math.max(0, units - awardedCount);
  if (awardableUnits <= 0) return { awarded: 0, units: 0 };

  const totalCoins = awardableUnits * cfg.coinPerUnit;
  const adminFeePercent = Number(s.adminFeePercent ?? 0.1);
  const adminShare = Number((totalCoins * adminFeePercent).toFixed(8));
  const creatorShare = Number((totalCoins - adminShare).toFixed(8));

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  await prisma.$transaction(async (tx) => {
    // ensure author wallet
    const authorId = post.authorId;
    const w = await tx.gcoinWallet.findUnique({ where: { userId: authorId } });
    if (!w) await tx.gcoinWallet.create({ data: { userId: authorId, recipientId: `GC-${Date.now().toString().slice(-8)}`, balance: 0, lifetimeEarned: 0, status: 'active' } });

    if (creatorShare > 0) {
      await tx.gcoinWallet.update({ where: { userId: post.authorId }, data: { balance: { increment: creatorShare }, lifetimeEarned: { increment: creatorShare } } });
      await tx.gcoinTransaction.create({ data: { userId: post.authorId, amount: creatorShare, type: 'reward', source: 'earning_engine', reason: `${metric}_award`, status: 'completed' } });
    }

    if (adminUser && adminShare > 0) {
      const adminW = await tx.gcoinWallet.findUnique({ where: { userId: adminUser.id } });
      if (!adminW) await tx.gcoinWallet.create({ data: { userId: adminUser.id, recipientId: `GC-${Date.now().toString().slice(-8)}`, balance: 0, lifetimeEarned: 0, status: 'active' } });
      await tx.gcoinWallet.update({ where: { userId: adminUser.id }, data: { balance: { increment: adminShare } } });
      await tx.gcoinTransaction.create({ data: { userId: adminUser.id, amount: adminShare, type: 'admin_fee', source: 'earning_engine', reason: `${metric}_fee`, status: 'completed' } });
    }

    // create credited events for the awardable units
    for (let i = 0; i < awardableUnits; i++) {
      await tx.gcoinEarningEvent.create({ data: { postId, actorId, eventType: `${metric}_award`, eventKey: `${postId}:${metric}:award:${Date.now()}:${i}`, value: cfg.coinPerUnit, credited: true } });
    }

    // mirror to generic ledger
    await tx.transaction.create({ data: {
      userId: post.authorId,
      amount: creatorShare,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      description: `${metric} reward for post ${postId}`,
      metadata: { community: true, subtype: 'GCOIN_EARN', metric, units: awardableUnits }
    } });

    if (adminUser && adminShare > 0) {
      await tx.transaction.create({ data: {
        userId: adminUser.id,
        amount: adminShare,
        type: 'FEE',
        status: 'COMPLETED',
        description: `${metric} admin fee for post ${postId}`,
        metadata: { community: true, subtype: 'GCOIN_FEE', metric }
      } });
    }
  });

  // Emit via global io if available (best-effort)
  try {
    const io = (global as any).appIo || (global as any).appCommunityIo;
    io?.emit('community:gcoin_earned', { postId, metric, totalCoins, creatorShare, adminShare });
  } catch (e) {}

  return { awarded: totalCoins, units: awardableUnits };
};
// Reuse the shared prisma client imported above (avoid duplicate client instances)

// Simple deterministic engine: when counts cross thresholds, award coins
export async function processEarningForPost(postId: string) {
  const cfg = await prisma.gcoinConfig.findFirst({ where: { key: 'default' } });
  if (!cfg) return null;
  const data = cfg.data as any;

  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');
  if (!(await isMonetizationEnabledForUser(post.authorId))) return null;

  // compute awards from aggregated counts
  const awards: Array<{type:string, coins:number}> = [];

  if (data.viewsUnit && data.coinPerViewsUnit) {
    const coinsFromViews = Math.floor(post.viewsCount / data.viewsUnit) * data.coinPerViewsUnit;
    awards.push({ type: 'views', coins: coinsFromViews });
  }
  if (data.likesUnit && data.coinPerLikesUnit) {
    const coinsFromLikes = Math.floor(post.likesCount / data.likesUnit) * data.coinPerLikesUnit;
    awards.push({ type: 'likes', coins: coinsFromLikes });
  }

  // Sum awarded coins and prevent double awarding by checking existing GcoinTransactions referencing post
  const totalCoins = awards.reduce((s, a) => s + a.coins, 0);
  if (totalCoins <= 0) return null;

  // Check already awarded amount
  const already = await prisma.gcoinTransaction.findMany({ where: { referenceId: postId, type: 'earning' } });
  const alreadySum = already.reduce((s, t) => s + Number(t.netAmount || t.amount), 0);

  const toAward = totalCoins - alreadySum;
  if (toAward <= 0) return null;

  // Apply admin fee
  const adminFeePercent = data.adminFeePercent || 0;
  const fee = toAward * adminFeePercent;
  const net = toAward - fee;

  // create transactions and update wallets
  const tx = await prisma.$transaction(async (tx) => {
    const gtx = await tx.gcoinTransaction.create({ data: {
      userId: post.authorId,
      amount: toAward,
      type: 'earning',
      source: 'post_metrics',
      referenceId: postId,
      status: 'completed',
      netAmount: net,
      feeAmount: fee,
      createdAt: new Date()
    } });

    await tx.gcoinWallet.update({ where: { userId: post.authorId }, data: { balance: { increment: net }, lifetimeEarned: { increment: net } } as any });

    // admin revenue wallet handled as AppSetting or special user; for now, log a Transaction
    await tx.transaction.create({ data: {
      walletId: null,
      userId: post.authorId,
      type: 'REWARD',
      amount: Number(net),
      currency: 'GCOIN',
      status: 'COMPLETED',
      description: `Gcoin earnings for post ${postId}`,
      metadata: { gcoinTransactionId: gtx.id }
    } });

    return gtx;
  });

  try { (global as any).appCommunityIo?.to(post.authorId).emit('community:gcoin_earned', { postId, amount: tx.netAmount }); } catch (e) {}
  return tx;
}
