import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { computeWalletFraudScore, recomputeAllWalletScores } from '../services/fraudDetector';

interface AuthRequest extends Request {
  user?: { id: string; email?: string; role?: string };
}

const nowIso = () => new Date().toISOString();
const ok = <T>(res: Response, data: T) => res.json({ success: true, data, timestamp: nowIso() });
const fail = (res: Response, status: number, message: string, code = 'ERR_GCOIN') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const isAdminRole = (role?: string) => (role || '').toString().toLowerCase().includes('admin');

const getOrCreateGcoinSettings = async () => {
  let s = await prisma.gcoinSettings.findFirst();
  if (!s) s = await prisma.gcoinSettings.create({ data: {} });
  return s;
};

const getAdminRevenueUserId = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  return admin ? admin.id : null;
};

const getOrCreateGcoinWallet = async (userId: string) => {
  let w = await prisma.gcoinWallet.findUnique({ where: { userId } });
  if (w) return w;
  await prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `${userId}@local.dev`, role: 'USER' } });
  const recipientId = `GC-${Math.random().toString(36).slice(2, 12)}`;
  return prisma.gcoinWallet.create({ data: { userId, recipientId, balance: 0, lifetimeEarned: 0, status: 'active' } });
};

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getOrCreateGcoinSettings();
    return ok(res, settings);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load settings');
  }
};

export const saveSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const payload = req.body || {};
    const existing = await prisma.gcoinSettings.findFirst();
    if (!existing) {
      const created = await prisma.gcoinSettings.create({ data: payload });
      return ok(res, created);
    }
    const updated = await prisma.gcoinSettings.update({ where: { id: existing.id }, data: payload });
    return ok(res, updated);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to save settings');
  }
};

export const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    const w = await getOrCreateGcoinWallet(user.id);
    return ok(res, w);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load wallet');
  }
};

// Get current user's wallet summary (me endpoint)
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    
    const wallet = await getOrCreateGcoinWallet(user.id);
    
    // Calculate pending earnings (credited=false events)
    const pendingEvents = await prisma.gcoinEarningEvent.findMany({
      where: {
        post: { authorId: user.id },
        credited: false,
        value: { gt: 0 }
      },
      select: { value: true }
    });
    const pendingEarnings = pendingEvents.reduce((sum, e) => sum + Number(e.value || 0), 0);
    
    // Get fraud flags
    const fraudFlags = {
      score: wallet.fraudScore || 0,
      isFlagged: (wallet.fraudScore || 0) > 0,
      isFrozen: wallet.status === 'frozen'
    };
    
    return ok(res, {
      wallet: {
        id: wallet.id,
        userId: wallet.userId,
        recipientId: wallet.recipientId,
        balance: wallet.balance,
        lifetimeEarned: wallet.lifetimeEarned,
        status: wallet.status,
        fraudScore: wallet.fraudScore,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      },
      pendingEarnings,
      fraudFlags
    });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load wallet summary');
  }
};

export const getAllWallets = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const wallets = await prisma.gcoinWallet.findMany({ orderBy: { updatedAt: 'desc' } });
    return ok(res, wallets);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load wallets');
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    
    const { cursor, limit = 50 } = req.query;
    const limitNum = Math.min(Number(limit) || 50, 100); // Max 100 per page
    
    const txs = await prisma.gcoinTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limitNum + 1,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor as string } } : {})
    });
    
    const hasMore = txs.length > limitNum;
    const results = hasMore ? txs.slice(0, limitNum) : txs;
    const nextCursor = hasMore ? results[results.length - 1].id : null;
    
    return ok(res, {
      transactions: results,
      pagination: {
        hasMore,
        nextCursor,
        limit: limitNum
      }
    });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load transactions');
  }
};

export const getAllTransactions = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const txs = await prisma.gcoinTransaction.findMany({ orderBy: { createdAt: 'desc' } });
    return ok(res, txs);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load transactions');
  }
};

export const getAdminSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    // Total supply = sum of all wallet balances
    const supplyAgg: any = await prisma.gcoinWallet.aggregate({ _sum: { balance: true } });
    const totalSupply = Number(supplyAgg._sum.balance || 0);
    // Total lifetime earned
    const lifetimeAgg: any = await prisma.gcoinWallet.aggregate({ _sum: { lifetimeEarned: true } });
    const totalLifetimeEarned = Number(lifetimeAgg._sum.lifetimeEarned || 0);
    // Platform fees: sum of gcoinTransaction amounts where type contains 'FEE' or 'FEE' types
    const feeAgg: any = await prisma.gcoinTransaction.aggregate({
      _sum: { amount: true },
      where: { OR: [ { type: 'TRANSFER_FEE' }, { type: 'FEE' }, { type: 'PLATFORM_FEE' } ] }
    });
    const platformFees = Number(feeAgg._sum.amount || 0);
    // Pending conversions total (gcoin)
    const pendingConvAgg: any = await prisma.gcoinConversionRequest.aggregate({ _sum: { amountGcoin: true }, where: { status: 'pending' } });
    const pendingConversions = Number(pendingConvAgg._sum.amountGcoin || 0);

    return ok(res, { totalSupply, totalLifetimeEarned, platformFees, pendingConversions });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load admin summary');
  }
};

export const createTransaction = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { userId, amount, type, reason } = req.body || {};
    if (!userId || amount === undefined || !type) return fail(res, 400, 'Missing fields');
    await getOrCreateGcoinWallet(userId);
    const tx = await prisma.gcoinTransaction.create({ data: { userId, amount: Number(amount), type, reason, status: 'completed', createdBy: req.user?.id } });
    return ok(res, tx);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to create transaction');
  }
};

export const creditUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { userId, amount, note } = req.body || {};
    if (!userId || amount === undefined) return fail(res, 400, 'Missing fields');
    const w = await getOrCreateGcoinWallet(userId);
    const newBal = Number(w.balance) + Number(amount);
    await prisma.gcoinWallet.update({ where: { userId }, data: { balance: newBal, lifetimeEarned: Number(w.lifetimeEarned) + Number(amount) } });
    const tx = await prisma.gcoinTransaction.create({ data: { userId, amount: Number(amount), type: 'ADMIN_CREDIT', reason: note || 'Admin credit', status: 'completed', createdBy: req.user?.id } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_transaction_created', { tx }); } catch(e){}
    try { io?.emit('community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToUser(userId, 'community:gcoin_transaction_created', { tx }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToUser(userId, 'community:gcoin_transaction_created', { tx }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToUser(userId, 'community:gcoin_transaction_created', { tx }); } catch(e){}
    // emit fiat wallet balance for UI consistency (if exists)
    try {
      const fiatWallet = await prisma.wallet.findUnique({ where: { userId } });
      if (fiatWallet) {
        try { io?.emit('community:fiat_balance_updated', { userId, fiatBalance: fiatWallet.balance }); } catch(e){}
      }
    } catch(e) {
      console.error('Failed to emit fiat balance on admin credit:', e);
    }
    return ok(res, { wallet: { userId, balance: newBal }, tx });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to credit user');
  }
};

export const adminAdjustBalance = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { userId } = req.params;
    const { amount, note } = req.body || {};
    if (!userId || amount === undefined) return fail(res, 400, 'Missing fields');
    const w = await getOrCreateGcoinWallet(userId);
    const newBal = Number(w.balance) + Number(amount);
    if (newBal < 0) return fail(res, 400, 'Insufficient balance');
    await prisma.gcoinWallet.update({ where: { userId }, data: { balance: newBal } });
    const tx = await prisma.gcoinTransaction.create({ data: { userId, amount: Number(amount), type: 'ADJUSTMENT', reason: note || 'Admin adjustment', status: 'completed', createdBy: req.user?.id } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_transaction_created', { tx }); } catch(e){}
    try { io?.emit('community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_balance_updated', { userId, balance: newBal }); } catch(e){}
    try { realtime.emitToUser(userId, 'community:gcoin_transaction_created', { tx }); } catch(e){}
    // Emit fiat wallet update if present
    try {
      const fiatWallet = await prisma.wallet.findUnique({ where: { userId } });
      if (fiatWallet) {
        try { io?.emit('community:fiat_balance_updated', { userId, fiatBalance: fiatWallet.balance }); } catch(e){}
      }
    } catch(e) {
      console.error('Failed to emit fiat balance on admin adjust:', e);
    }
    return ok(res, { wallet: { userId, balance: newBal }, tx });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to adjust balance');
  }
};

export const checkAndAward = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, type, count } = req.body || {};
    if (!userId || !type || count === undefined) return fail(res, 400, 'Missing fields');
    const settingsRaw = await getOrCreateGcoinSettings();
    const s: any = settingsRaw as any;
    const rules = {
      viewsUnit: s.viewsUnit ?? 200,
      likesUnit: s.likesUnit ?? 30,
      repostsUnit: s.repostsUnit ?? 40,
      sharesUnit: s.sharesUnit ?? 50,
      coinPerViewsUnit: s.coinPerViewsUnit ?? 1,
      coinPerLikesUnit: s.coinPerLikesUnit ?? 1,
      coinPerRepostsUnit: s.coinPerRepostsUnit ?? 1,
      coinPerSharesUnit: s.coinPerSharesUnit ?? 1,
      adminFeePercent: s.adminFeePercent ?? 0.1
    };

    const mapping: any = {
      view: { unit: rules.viewsUnit, coinPerUnit: rules.coinPerViewsUnit },
      like: { unit: rules.likesUnit, coinPerUnit: rules.coinPerLikesUnit },
      repost: { unit: rules.repostsUnit, coinPerUnit: rules.coinPerRepostsUnit },
      share: { unit: rules.sharesUnit, coinPerUnit: rules.coinPerSharesUnit }
    };

    const cfg = mapping[type];
    if (!cfg || !cfg.unit || cfg.unit <= 0) return ok(res, { success: false, message: 'No rule for type', awarded: 0, units: 0 });

    const units = Math.floor(Number(count) / Number(cfg.unit));
    if (units <= 0) return ok(res, { success: false, message: 'No awardable units yet', awarded: 0, units: 0 });

    // Prevent double-award by counting existing credited events for this user/type
    const already = await prisma.gcoinEarningEvent.count({ where: { actorId: userId, eventType: `${type}_award`, credited: true } });
    const awardableUnits = Math.max(0, units - already);
    if (awardableUnits <= 0) return ok(res, { success: false, message: 'Already awarded for these units', awarded: 0, units: 0 });

    const totalCoins = awardableUnits * cfg.coinPerUnit;
    const adminShare = Number((totalCoins * rules.adminFeePercent).toFixed(8));
    const creatorShare = Number((totalCoins - adminShare).toFixed(8));

    const adminUserId = await getAdminRevenueUserId();

    await prisma.$transaction(async (tx) => {
      // ensure wallets
      const userWallet = await tx.gcoinWallet.findUnique({ where: { userId } });
      if (!userWallet) await tx.gcoinWallet.create({ data: { userId, recipientId: `GC-${Date.now().toString().slice(-8)}` } });

      if (creatorShare > 0) {
        await tx.gcoinWallet.update({ where: { userId }, data: { balance: { increment: creatorShare }, lifetimeEarned: { increment: creatorShare } } });
        await tx.gcoinTransaction.create({ data: { userId, amount: creatorShare, type: 'reward', source: 'earning_engine', reason: `${type}_award`, status: 'completed' } });
      }

      if (adminUserId && adminShare > 0) {
        const adminWallet = await tx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
        if (!adminWallet) await tx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-8)}` } });
        await tx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: adminShare } } });
        await tx.gcoinTransaction.create({ data: { userId: adminUserId, amount: adminShare, type: 'admin_fee', source: 'earning_engine', reason: `${type}_fee`, status: 'completed' } });
      }

      // create earning event record
      // GcoinEarningEvent.postId is required by schema; create a lightweight CommunityPost when none is available
      let postIdForEvent = null as string | null;
      try {
        const createdPost = await tx.communityPost.create({ data: { authorId: userId, content: `system:${type}:award`, title: null as any } });
        postIdForEvent = createdPost.id;
      } catch (e) {
        // fallback: try to find any existing post for user
        const existing = await tx.communityPost.findFirst({ where: { authorId: userId } });
        postIdForEvent = existing ? existing.id : undefined as any;
      }
      await tx.gcoinEarningEvent.create({ data: { postId: postIdForEvent as string, actorId: userId, eventType: `${type}_award`, eventKey: `${userId}:${type}:award:${Date.now()}`, value: totalCoins, credited: true } });

      // mirror to generic ledger
      await tx.transaction.create({ data: {
        userId,
        amount: creatorShare,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        description: `${type} reward (user-level)`,
        metadata: { community: true, subtype: 'GCOIN_EARN', metric: type, units: awardableUnits }
      } });
      if (adminUserId && adminShare > 0) {
        await tx.transaction.create({ data: {
          userId: adminUserId,
          amount: adminShare,
          type: 'FEE',
          status: 'COMPLETED',
          description: `${type} admin fee (user-level)`,
          metadata: { community: true, subtype: 'GCOIN_FEE', metric: type }
        } });
      }
    });

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:gcoin_earned', { userId, metric: type, totalCoins, creatorShare, adminShare }); } catch(e){}
    try { io?.emit('community:gcoin_balance_updated', { userId, balance: (await prisma.gcoinWallet.findUnique({ where: { userId } }))?.balance }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_earned', { userId, metric: type, totalCoins, creatorShare, adminShare }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_balance_updated', { userId, balance: (await prisma.gcoinWallet.findUnique({ where: { userId } }))?.balance }); } catch(e){}

    return ok(res, { success: true, awarded: totalCoins, units: awardableUnits });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to evaluate rewards');
  }
};

export const getFraudReports = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    // suspicious wallets: fraudScore > 0
    const wallets = await prisma.gcoinWallet.findMany({ where: { fraudScore: { gt: 0 } }, orderBy: { fraudScore: 'desc' } });
    // recent velocity alerts for each wallet (events in last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const reports = await Promise.all(wallets.map(async (w) => {
      const recent = await prisma.gcoinEarningEvent.count({ where: { actorId: w.userId, createdAt: { gt: tenMinutesAgo } } });
      // recompute live score and reasons
      const computed = await computeWalletFraudScore(w.userId);
      return {
        userId: w.userId,
        recipientId: w.recipientId,
        balance: w.balance,
        lifetimeEarned: w.lifetimeEarned,
        fraudScore: computed.fraudScore,
        riskLevel: computed.riskLevel,
        reasons: computed.reasons,
        recentEvents: recent,
        status: w.status
      };
    }));
    return ok(res, { suspiciousWallets: reports });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load fraud reports');
  }
};

export const recomputeFraudScores = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const summary = await recomputeAllWalletScores();
    const total = Array.isArray(summary.results) ? summary.results.length : 0;
    console.log(`[gcoin.controller] recomputeFraudScores: total=${total} changed=${summary.changedCount} durationMs=${summary.durationMs}`);
    return ok(res, { recomputed: total, changedCount: summary.changedCount, durationMs: summary.durationMs, sample: Array.isArray(summary.results) ? summary.results.slice(0, 10) : [] });
  } catch (e: any) {
    console.error('recomputeFraudScores error:', e);
    return fail(res, 500, 'Failed to recompute fraud scores');
  }
};

import { tryRecordTransfer, tryRecordConversion } from '../middleware/gcoinLimits';

export const transferGcoin = async (req: AuthRequest, res: Response) => {
  try {
    const sender = req.user;
    if (!sender?.id) return fail(res, 401, 'Unauthorized');
    const { toRecipientId, toEmail, amount, note } = req.body || {};
    const value = Number(amount);
    if (!value || value <= 0) return fail(res, 400, 'Invalid amount');
    // Rate limit / anti-fraud: per-user limits
    const allowed = await tryRecordTransfer(sender.id);
    if (!allowed) return fail(res, 429, 'Transfer rate limit exceeded');

    const senderW = await getOrCreateGcoinWallet(sender.id);
    if (senderW.status === 'frozen') return fail(res, 403, 'Wallet frozen');
    let recipientUser: any = null;
    if (toRecipientId) {
      const wallet = await prisma.gcoinWallet.findUnique({ where: { recipientId: toRecipientId } });
      if (!wallet) return fail(res, 404, 'Recipient not found');
      recipientUser = await prisma.user.findUnique({ where: { id: wallet.userId } });
    } else if (toEmail) {
      recipientUser = await prisma.user.findUnique({ where: { email: toEmail } });
      if (!recipientUser) return fail(res, 404, 'Recipient not found');
    } else {
      return fail(res, 400, 'Missing recipient');
    }
    const recipientW = await getOrCreateGcoinWallet(recipientUser.id);
    // Apply transfer fee (configured in GcoinSettings)
    const settingsRaw = await getOrCreateGcoinSettings();
    const settings: any = settingsRaw as any;
    const feeType = (settings.transferFeeType || 'percentage').toString();
    const feeValue = Number(settings.transferFeeValue || 0);
    let feeAmount = 0;
    if (feeType === 'percentage') {
      feeAmount = Number((value * feeValue).toFixed(8));
    } else {
      feeAmount = Number(feeValue);
    }

    const totalDeduct = Number((value + feeAmount).toFixed(8));
    if (Number(senderW.balance) < totalDeduct) return fail(res, 400, 'Insufficient balance for amount and fee');

    const adminUserId = await getAdminRevenueUserId();

    await prisma.$transaction(async (tx) => {
      // deduct total from sender
      await tx.gcoinWallet.update({ where: { userId: sender.id }, data: { balance: Number(senderW.balance) - totalDeduct } });
      // credit recipient with the amount (fee absorbed by platform)
      await tx.gcoinWallet.update({ where: { userId: recipientUser.id }, data: { balance: Number(recipientW.balance) + value } });

      // create transaction records
      await tx.gcoinTransaction.create({ data: { userId: sender.id, amount: -value, type: 'TRANSFER_OUT', reason: note || 'Transfer', status: 'completed', createdBy: sender.id } });
      await tx.gcoinTransaction.create({ data: { userId: recipientUser.id, amount: value, type: 'TRANSFER_IN', reason: note || 'Transfer', status: 'completed', createdBy: sender.id } });

      // Also record ledger entries in the generic Transaction table with community metadata
      await tx.transaction.create({ data: {
        userId: sender.id,
        amount: -value,
        type: 'TRANSFER',
        status: 'COMPLETED',
        description: 'Gcoin transfer out',
        metadata: { community: true, subtype: 'GCOIN_TRANSFER', fee: feeAmount, recipientId: recipientUser.id }
      } });
      await tx.transaction.create({ data: {
        userId: recipientUser.id,
        amount: value,
        type: 'TRANSFER',
        status: 'COMPLETED',
        description: 'Gcoin transfer in',
        metadata: { community: true, subtype: 'GCOIN_TRANSFER', from: sender.id }
      } });

      // if fee exists, credit admin revenue wallet and create fee tx
      if (feeAmount > 0 && adminUserId) {
        const adminWallet = await tx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
        if (!adminWallet) {
          await tx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-6)}` } });
        }
        await tx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: feeAmount } } });
        await tx.gcoinTransaction.create({ data: { userId: adminUserId, amount: feeAmount, type: 'TRANSFER_FEE', reason: `fee_from_${sender.id}`, status: 'completed', createdBy: sender.id } });
        // record platform fee in ledger
        await tx.transaction.create({ data: {
          userId: adminUserId,
          amount: feeAmount,
          type: 'FEE',
          status: 'COMPLETED',
          description: `Gcoin transfer fee from ${sender.id}`,
          metadata: { community: true, subtype: 'GCOIN_TRANSFER_FEE', source: sender.id }
        } });
      }
    });
    // Emit socket events for balance and transaction (use community namespace when available)
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io') || (global as any).appCommunityIo || (global as any).appIo;
    try { io?.emit('community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, note }); } catch(e){}
    try { io?.emit('community:gcoin_balance_updated', { userId: sender.id, balance: Number(senderW.balance) - totalDeduct }); } catch(e){}
    try { io?.emit('community:gcoin_balance_updated', { userId: recipientUser.id, balance: Number(recipientW.balance) + value }); } catch(e){}
    // targeted emits for affected users/wallets
    try { realtime.emitToUser(sender.id, 'community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, note }); } catch(e){}
    try { realtime.emitToUser(recipientUser.id, 'community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, note }); } catch(e){}
    try { realtime.emitToWallet(sender.id, 'community:gcoin_balance_updated', { userId: sender.id, balance: Number(senderW.balance) - totalDeduct }); } catch(e){}
    try { realtime.emitToWallet(recipientUser.id, 'community:gcoin_balance_updated', { userId: recipientUser.id, balance: Number(recipientW.balance) + value }); } catch(e){}
    return ok(res, { from: sender.id, to: recipientUser.id, amount: value });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Transfer failed');
  }
};

// Donate Gcoin to post author
export const donateGcoin = async (req: AuthRequest, res: Response) => {
  try {
    const sender = req.user;
    if (!sender?.id) return fail(res, 401, 'Unauthorized');
    
    const { postId, amount, note } = req.body || {};
    const value = Number(amount);
    
    if (!postId || !value || value <= 0) {
      return fail(res, 400, 'postId and amount are required');
    }
    
    // Get post and author
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      include: {
        author: {
          include: {
            gcoinWallet: true
          }
        }
      }
    });
    
    if (!post) return fail(res, 404, 'Post not found');
    if (post.authorId === sender.id) return fail(res, 400, 'Cannot donate to your own post');
    
    const recipientUser = post.author;
    const recipientWallet = recipientUser?.gcoinWallet || await getOrCreateGcoinWallet(recipientUser.id);
    
    // Use transfer logic (reuse transferGcoin implementation)
    const senderW = await getOrCreateGcoinWallet(sender.id);
    if (senderW.status === 'frozen') return fail(res, 403, 'Wallet frozen');
    
    // Rate limit check
    const allowed = await tryRecordTransfer(sender.id);
    if (!allowed) return fail(res, 429, 'Transfer rate limit exceeded');
    
    // Apply transfer fee
    const settingsRaw = await getOrCreateGcoinSettings();
    const settings: any = settingsRaw as any;
    const feeType = (settings.transferFeeType || 'percentage').toString();
    const feeValue = Number(settings.transferFeeValue || 0);
    let feeAmount = 0;
    if (feeType === 'percentage') {
      feeAmount = Number((value * feeValue).toFixed(8));
    } else {
      feeAmount = Number(feeValue);
    }
    
    const totalDeduct = Number((value + feeAmount).toFixed(8));
    if (Number(senderW.balance) < totalDeduct) return fail(res, 400, 'Insufficient balance for amount and fee');
    
    const adminUserId = await getAdminRevenueUserId();
    const donationNote = note || `Donation for post: ${postId}`;
    
    await prisma.$transaction(async (tx) => {
      // Deduct from sender
      await tx.gcoinWallet.update({ where: { userId: sender.id }, data: { balance: Number(senderW.balance) - totalDeduct } });
      // Credit recipient
      await tx.gcoinWallet.update({ where: { userId: recipientUser.id }, data: { balance: Number(recipientWallet.balance) + value } });
      
      // Create donation transaction records
      await tx.gcoinTransaction.create({ 
        data: { 
          userId: sender.id, 
          amount: -value, 
          type: 'donation', 
          source: 'community',
          reason: donationNote,
          referenceId: postId,
          status: 'completed', 
          createdBy: sender.id 
        } 
      });
      await tx.gcoinTransaction.create({ 
        data: { 
          userId: recipientUser.id, 
          amount: value, 
          type: 'donation_received', 
          source: 'community',
          reason: donationNote,
          referenceId: postId,
          status: 'completed', 
          createdBy: sender.id 
        } 
      });
      
      // Record in generic Transaction ledger
      await tx.transaction.create({ 
        data: {
          userId: sender.id,
          amount: -value,
          type: 'TRANSFER',
          status: 'COMPLETED',
          description: `Gcoin donation to post ${postId}`,
          metadata: { community: true, subtype: 'GCOIN_DONATION', postId, recipientId: recipientUser.id, fee: feeAmount }
        } 
      });
      await tx.transaction.create({ 
        data: {
          userId: recipientUser.id,
          amount: value,
          type: 'TRANSFER',
          status: 'COMPLETED',
          description: `Gcoin donation received for post ${postId}`,
          metadata: { community: true, subtype: 'GCOIN_DONATION_RECEIVED', postId, donorId: sender.id }
        } 
      });
      
      // Fee handling
      if (feeAmount > 0 && adminUserId) {
        const adminWallet = await tx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
        if (!adminWallet) {
          await tx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-6)}` } });
        }
        await tx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: feeAmount } } });
        await tx.gcoinTransaction.create({ 
          data: { 
            userId: adminUserId, 
            amount: feeAmount, 
            type: 'TRANSFER_FEE', 
            reason: `donation_fee_from_${sender.id}`, 
            status: 'completed', 
            createdBy: sender.id 
          } 
        });
        await tx.transaction.create({ 
          data: {
            userId: adminUserId,
            amount: feeAmount,
            type: 'FEE',
            status: 'COMPLETED',
            description: `Gcoin donation fee from ${sender.id}`,
            metadata: { community: true, subtype: 'GCOIN_DONATION_FEE', postId, source: sender.id }
          } 
        });
      }
    });
    
    // Emit socket events
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:gcoin_donated', { postId, donorId: sender.id, recipientId: recipientUser.id, amount: value }); } catch (e) { console.error('Socket emit error (gcoin_donated):', e); }
    try { io?.emit('community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, type: 'donation', postId }); } catch (e) {}
    try { io?.emit('community:gcoin_balance_updated', { userId: sender.id, balance: Number(senderW.balance) - totalDeduct }); } catch (e) {}
    try { io?.emit('community:gcoin_balance_updated', { userId: recipientUser.id, balance: Number(recipientWallet.balance) + value }); } catch (e) {}
    // targeted emits
    try { realtime.emitToPost(postId, 'community:gcoin_donated', { postId, donorId: sender.id, recipientId: recipientUser.id, amount: value }); } catch (e) {}
    try { realtime.emitToUser(sender.id, 'community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, type: 'donation', postId }); } catch (e) {}
    try { realtime.emitToUser(recipientUser.id, 'community:gcoin_transaction_created', { from: sender.id, to: recipientUser.id, amount: value, type: 'donation', postId }); } catch (e) {}
    try { realtime.emitToWallet(sender.id, 'community:gcoin_balance_updated', { userId: sender.id, balance: Number(senderW.balance) - totalDeduct }); } catch (e) {}
    try { realtime.emitToWallet(recipientUser.id, 'community:gcoin_balance_updated', { userId: recipientUser.id, balance: Number(recipientWallet.balance) + value }); } catch (e) {}
    
    return ok(res, { 
      success: true,
      postId,
      donorId: sender.id,
      recipientId: recipientUser.id,
      amount: value,
      fee: feeAmount
    });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to process donation');
  }
};

export const requestConversion = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    const { amount, payoutMethodId } = req.body || {};
    const value = Number(amount);
    if (!value || value <= 0) return fail(res, 400, 'Invalid amount');
    const w = await getOrCreateGcoinWallet(user.id);
    if (w.balance < value) return fail(res, 400, 'Insufficient gcoin');
    // Check platform settings for min withdrawal
    const settings = await getOrCreateGcoinSettings();
    if (settings.minWithdrawal && value < Number(settings.minWithdrawal)) return fail(res, 400, 'Amount below minimum withdrawal');
    // Rate limit conversions per user
    const allowed = await tryRecordConversion(user.id);
    if (!allowed) return fail(res, 429, 'Too many conversion requests');
    const amountFiat = Number((value * (settings.conversionRate || 0)).toFixed(2));
    
    // Store payoutMethodId in metadata if provided
    const metadata: any = {};
    if (payoutMethodId) {
      metadata.payoutMethodId = payoutMethodId;
    }
    
    const rec = await prisma.gcoinConversionRequest.create({ 
      data: { 
        userId: user.id, 
        amountGcoin: value, 
        amountFiat, 
        status: 'pending'
      } 
    });
    
    // Store payoutMethodId separately if needed (can be added to model later or stored in metadata via Transaction)
    // For now, we'll note it in the response
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_conversion_requested', { id: rec.id, userId: user.id, amountGcoin: value, amountFiat, payoutMethodId: payoutMethodId || null }); } catch(e){}
    try { realtime.emitToUser(user.id, 'community:gcoin_conversion_requested', { id: rec.id, userId: user.id, amountGcoin: value, amountFiat, payoutMethodId: payoutMethodId || null }); } catch(e){}
    
    return ok(res, { ...rec, payoutMethodId: payoutMethodId || null });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Conversion request failed');
  }
};

export const getConversionRequests = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    if (isAdminRole(user.role)) {
      const list = await prisma.gcoinConversionRequest.findMany({ orderBy: { requestedAt: 'desc' } });
      return ok(res, list);
    }
    const list = await prisma.gcoinConversionRequest.findMany({ where: { userId: user.id }, orderBy: { requestedAt: 'desc' } });
    return ok(res, list);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load conversions');
  }
};

export const processConversion = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { id } = req.params;
    const { action, note } = req.body || {};
    if (!id || !action) return fail(res, 400, 'Missing fields');
    const reqRec = await prisma.gcoinConversionRequest.findUnique({ where: { id } });
    if (!reqRec) return fail(res, 404, 'Not found');
    if (reqRec.status !== 'pending') return fail(res, 400, 'Already processed');
      if (action === 'approve') {
      const w = await getOrCreateGcoinWallet(reqRec.userId);
      if (w.balance < reqRec.amountGcoin) return fail(res, 400, 'Insufficient gcoin');
        // Perform approve flow inside transaction: debit Gcoin wallet, credit fiat wallet via Transaction
        await prisma.$transaction(async (tx) => {
          // debit Gcoin
          await tx.gcoinWallet.update({ where: { userId: reqRec.userId }, data: { balance: Number(w.balance) - Number(reqRec.amountGcoin) } });
          // mark conversion request approved
          await tx.gcoinConversionRequest.update({ where: { id }, data: { status: 'approved', processedAt: new Date(), processedBy: req.user?.id } });

          // Credit user's fiat Wallet using existing Transaction model and Wallet update
          // find or create Wallet for user
          let wallet = await tx.wallet.findUnique({ where: { userId: reqRec.userId } });
          if (!wallet) {
            wallet = await tx.wallet.create({ data: { userId: reqRec.userId, balance: 0, pendingClearance: 0, escrowBalance: 0, frozen: false, currency: 'USD', isActive: true } });
          }

          // create a Transaction record referencing the conversion request
          await tx.transaction.create({ data: {
            walletId: wallet.id,
            userId: reqRec.userId,
            type: 'DEPOSIT',
            amount: Number(reqRec.amountFiat),
            currency: 'USD',
            status: 'COMPLETED',
            description: `Gcoin conversion approved: ${reqRec.id}`,
            referenceId: reqRec.id,
            metadata: { conversionRequestId: reqRec.id }
          } });

          // update Wallet balance (credit funds)
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: Number(reqRec.amountFiat) } } });
        });

          const io = (req.app as any).get('io');
          try { io?.emit('community:gcoin_conversion_processed', { id, status: 'approved', userId: reqRec.userId, amountGcoin: reqRec.amountGcoin, amountFiat: reqRec.amountFiat }); } catch(e){}
          // publish updated gcoin balance
          try { io?.emit('community:gcoin_balance_updated', { userId: reqRec.userId, balance: Number(w.balance) - Number(reqRec.amountGcoin) }); } catch(e){}
          try {
            realtime.emitToUser(reqRec.userId, 'community:gcoin_conversion_processed', { id, status: 'approved', userId: reqRec.userId, amountGcoin: reqRec.amountGcoin, amountFiat: reqRec.amountFiat });
          } catch (e) {}
          try {
            realtime.emitToWallet(reqRec.userId, 'community:gcoin_balance_updated', { userId: reqRec.userId, balance: Number(w.balance) - Number(reqRec.amountGcoin) });
          } catch (e) {}

          // publish fiat balance update (reconciled from Wallet)
          try {
            const fiatWallet = await prisma.wallet.findUnique({ where: { userId: reqRec.userId } });
            if (fiatWallet) {
              try { io?.emit('community:fiat_balance_updated', { userId: reqRec.userId, fiatBalance: fiatWallet.balance }); } catch(e){}
              try { realtime.emitToUser(reqRec.userId, 'community:fiat_balance_updated', { userId: reqRec.userId, fiatBalance: fiatWallet.balance }); } catch(e){}
            }
          } catch(e) {
            console.error('Failed to publish fiat balance after conversion:', e);
          }
          // create admin note notification if provided
          try {
            if (note && note.toString().trim().length > 0) {
              await prisma.notification.create({ data: {
                userId: reqRec.userId,
                actorId: req.user?.id || null,
                type: 'gcoin_conversion_note',
                title: 'Conversion processed',
                body: `Admin note: ${note}`,
                meta: { conversionId: id, action: 'approved' }
              } });
            }
          } catch (e) {
            console.error('Failed to create conversion admin note notification:', e);
          }
        return ok(res, { id, status: 'approved' });
    }
    await prisma.gcoinConversionRequest.update({ where: { id }, data: { status: 'denied', processedAt: new Date(), processedBy: req.user?.id } });
    try {
      if (note && note.toString().trim().length > 0) {
        await prisma.notification.create({ data: {
          userId: reqRec.userId,
          actorId: req.user?.id || null,
          type: 'gcoin_conversion_note',
          title: 'Conversion denied',
          body: `Admin note: ${note}`,
          meta: { conversionId: id, action: 'denied' }
        } });
      }
    } catch (e) {
      console.error('Failed to create conversion admin note notification (deny):', e);
    }
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_conversion_processed', { id, status: 'denied', userId: reqRec.userId }); } catch(e){}
    return ok(res, { id, status: 'denied' });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to process conversion');
  }
};

export const freezeWallet = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'Missing userId');
    await getOrCreateGcoinWallet(userId);
    const w = await prisma.gcoinWallet.update({ where: { userId }, data: { status: 'frozen' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_wallet_status', { userId, status: 'frozen' }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_wallet_status', { userId, status: 'frozen' }); } catch(e){}
    return ok(res, w);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to freeze wallet');
  }
};

export const unfreezeWallet = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'Missing userId');
    await getOrCreateGcoinWallet(userId);
    const w = await prisma.gcoinWallet.update({ where: { userId }, data: { status: 'active' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:gcoin_wallet_status', { userId, status: 'active' }); } catch(e){}
    try { realtime.emitToWallet(userId, 'community:gcoin_wallet_status', { userId, status: 'active' }); } catch(e){}
    return ok(res, w);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to unfreeze wallet');
  }
};

// Earnings summary (today / this week / this month, by source)
export const getEarningsSummary = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    type Metric = 'view' | 'like' | 'share' | 'repost';
    const metrics: Metric[] = ['view', 'like', 'share', 'repost'];

    const bySource = (period: { from: Date }) =>
      prisma.gcoinTransaction.findMany({
        where: {
          userId: user.id,
          type: 'reward',
          amount: { gt: 0 },
          createdAt: { gte: period.from }
        },
        select: { amount: true, reason: true, createdAt: true }
      });

    const [todayTx, weekTx, monthTx] = await Promise.all([
      bySource({ from: startOfToday }),
      bySource({ from: startOfWeek }),
      bySource({ from: startOfMonth })
    ]);

    const sumByMetric = (txs: any[]) => {
      const out: Record<string, number> = { view: 0, like: 0, share: 0, repost: 0 };
      for (const t of txs) {
        const r = (t.reason || '').toLowerCase();
        if (r.includes('view')) out.view += Number(t.amount);
        else if (r.includes('like')) out.like += Number(t.amount);
        else if (r.includes('share')) out.share += Number(t.amount);
        else if (r.includes('repost')) out.repost += Number(t.amount);
      }
      return out;
    };

    const today = sumByMetric(todayTx);
    const thisWeek = sumByMetric(weekTx);
    const thisMonth = sumByMetric(monthTx);

    // Pending: uncredited earning events (value > 0) for user's posts
    const pendingEvents = await prisma.gcoinEarningEvent.findMany({
      where: {
        post: { authorId: user.id },
        credited: false,
        value: { gt: 0 }
      },
      select: { value: true, eventType: true }
    });
    const pendingTotal = pendingEvents.reduce((s, e) => s + Number(e.value || 0), 0);
    const pendingBySource: Record<string, number> = { view: 0, like: 0, share: 0, repost: 0 };
    for (const e of pendingEvents) {
      const t = (e.eventType || '').replace(/_award_pending$/, '') as Metric;
      if (metrics.includes(t)) pendingBySource[t] = (pendingBySource[t] || 0) + Number(e.value || 0);
    }

    return ok(res, {
      today: { total: Object.values(today).reduce((a, b) => a + b, 0), bySource: today },
      thisWeek: { total: Object.values(thisWeek).reduce((a, b) => a + b, 0), bySource: thisWeek },
      thisMonth: { total: Object.values(thisMonth).reduce((a, b) => a + b, 0), bySource: thisMonth },
      pending: { total: pendingTotal, bySource: pendingBySource }
    });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load earnings summary');
  }
};

// Earnings breakdown for a specific post
export const getEarningsByPost = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return fail(res, 401, 'Unauthorized');
    const { postId } = req.query;
    if (!postId || typeof postId !== 'string') return fail(res, 400, 'postId is required');

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true } } }
    });
    if (!post) return fail(res, 404, 'Post not found');
    if (post.authorId !== user.id && !isAdminRole(req.user?.role)) return fail(res, 403, 'Forbidden');

    const events = await prisma.gcoinEarningEvent.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' }
    });

    const rewarded = events.filter(e => e.credited && e.value > 0);
    const byMetric: Record<string, { coins: number; eventsCount: number }> = {
      view: { coins: 0, eventsCount: 0 },
      like: { coins: 0, eventsCount: 0 },
      share: { coins: 0, eventsCount: 0 },
      repost: { coins: 0, eventsCount: 0 }
    };
    for (const e of rewarded) {
      const t = (e.eventType || '').replace(/_award$/, '').replace(/_award_pending$/, '');
      if (byMetric[t]) {
        byMetric[t].coins += Number(e.value || 0);
        byMetric[t].eventsCount += 1;
      }
    }

    const totalCredited = rewarded.reduce((s, e) => s + Number(e.value || 0), 0);
    const settings = await getOrCreateGcoinSettings();
    const adminFeePercent = Number((settings as any).adminFeePercent ?? 0.1);
    const adminFee = totalCredited * adminFeePercent;
    const creatorShare = totalCredited - adminFee;

    return ok(res, {
      postId,
      metrics: { views: post.viewsCount, likes: post.likesCount, shares: post.sharesCount, reposts: post.repostsCount },
      bySource: byMetric,
      totalCredited,
      creatorShare,
      adminFee,
      adminFeePercent,
      eventCount: events.length,
      rewardedCount: rewarded.length
    });
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to load earnings by post');
  }
};

export default {} as any;
