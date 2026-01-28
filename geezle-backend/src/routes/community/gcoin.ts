import express from 'express';
import { body, query } from 'express-validator';
import gcoinService from '../../services/gcoinService';
import realtime from '../../utils/realtime';

const router = express.Router();

// GET /api/community/gcoin/me
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    const wallet = await gcoinService.getWallet(userId);
    const pending = await (await import('../../prisma')).default.gcoinConversionRequest.count({ where: { userId, status: 'pending' } }).catch(()=>0);
    return res.json({ success: true, data: { wallet, pendingConversions: pending, flags: { frozen: wallet?.status === 'frozen', fraudScore: wallet?.fraudScore || 0 } } });
  } catch (e: any) { return res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: e?.message ?? String(e) } }); }
});

// GET /api/community/gcoin/transactions
router.get('/transactions', [query('limit').optional().isInt()], async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const limit = parseInt(req.query.limit) || 20;
    const items = await (await import('../../prisma')).default.gcoinTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
    return res.json({ success: true, data: { items, nextCursor: null } });
  } catch (e: any) { return res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: e?.message ?? String(e) } }); }
});

// POST /api/community/gcoin/transfer
router.post('/transfer', [body('amount').exists(), body('toRecipientId').optional(), body('toEmail').optional()], async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const { toRecipientId, toEmail, amount, note, reference } = req.body;
    const result = await gcoinService.transfer(userId, { toRecipientId, toEmail, amount: Number(amount), note, reference });

    // Emit realtime updates to sender and recipient wallets/users
    try {
      realtime.emitToWallet(String(userId), 'community:gcoin_balance_updated', { userId, wallet: result.fromWallet, transaction: result.transaction });
      if (result.toUserId) realtime.emitToWallet(String(result.toUserId), 'community:gcoin_balance_updated', { userId: result.toUserId, wallet: result.toWallet, transaction: result.transaction });
      // emit a transfer event to both parties
      realtime.emitToUser(String(userId), 'community:gcoin_transfer', { transaction: result.transaction });
      if (result.toUserId) realtime.emitToUser(String(result.toUserId), 'community:gcoin_transfer', { transaction: result.transaction });
    } catch (e) {}

    return res.json({ success: true, data: result });
  } catch (e) {
    const msg = (e as any)?.message ?? String(e);
    const code = msg === 'INSUFFICIENT_FUNDS' ? 'INSUFFICIENT_FUNDS' : msg === 'WALLET_FROZEN' ? 'WALLET_FROZEN' : 'ERR_INTERNAL';
    return res.status(400).json({ success: false, error: { code, message: msg } });
  }
});

// POST /api/community/gcoin/donate
router.post('/donate', [body('postId').exists(), body('amount').exists()], async (req: any, res) => {
  try {
    const fromUser = req.user?.id; if (!fromUser) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const { postId, amount, note } = req.body;
    const post = await (await import('../../prisma')).default.communityPost.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ success:false, error:{code:'NOT_FOUND', message:'Post not found'} });
    const recipientId = post.authorId;
    const recipientWallet = await gcoinService.getWallet(recipientId);
    if (!recipientWallet) await gcoinService.ensureWalletForUser(recipientId);
    const result = await gcoinService.transfer(fromUser, { toRecipientId: recipientWallet?.recipientId, amount: Number(amount), note, reference: { type:'post', id: postId } });

    // Emit donation events: update donor and recipient wallets and notify post room
    try {
      realtime.emitToWallet(String(fromUser), 'community:gcoin_balance_updated', { userId: fromUser, wallet: result.fromWallet, transaction: result.transaction });
      if (recipientWallet?.userId) realtime.emitToWallet(String(recipientWallet.userId), 'community:gcoin_balance_updated', { userId: recipientWallet.userId, wallet: result.toWallet, transaction: result.transaction });
      realtime.emitToPost(postId, 'community:gcoin_donation', { postId, transaction: result.transaction });
    } catch (e) {}

    return res.json({ success:true, data: result });
  } catch (e: any) { return res.status(400).json({ success:false, error:{code:'ERR', message:e?.message ?? String(e)} }); }
});

// POST /api/community/gcoin/convert/request
router.post('/convert/request', [body('amount').exists(), body('payoutMethodId').exists()], async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const { amount, payoutMethodId } = req.body;
    const reqRec = await gcoinService.createConversionRequest(userId, Number(amount), payoutMethodId);

    // Emit conversion request created event to the user's wallet room
    try {
      realtime.emitToWallet(String(userId), 'community:gcoin_conversion_requested', { requestId: reqRec.id, status: reqRec.status });
      realtime.emitToUser(String(userId), 'community:gcoin_conversion_requested', { requestId: reqRec.id, status: reqRec.status });
    } catch (e) {}

    return res.json({ success:true, data: { requestId: reqRec.id, status: reqRec.status } });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

// GET /api/community/gcoin/earnings/summary
router.get('/earnings/summary', async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    // simplistic summary using transactions
    const all = await (await import('../../prisma')).default.gcoinTransaction.findMany({ where: { userId, type: 'earning' } });
    const total = all.reduce((s,t) => s + Number(t.netAmount || t.amount), 0);
    return res.json({ success:true, data: { today: '0', week: '0', month: '0', breakdown: {}, total: String(total) } });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

// GET /api/community/gcoin/earnings/by-post
router.get('/earnings/by-post', [query('postId').exists()], async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const postId = req.query.postId as string;
    const events = await (await import('../../prisma')).default.gcoinEarningEvent.findMany({ where: { postId } });
    const earned = await (await import('../../prisma')).default.gcoinTransaction.findMany({ where: { referenceId: postId, type: 'earning' } });
    return res.json({ success:true, data: { postId, earned: String(earned.reduce((s,t)=>s+Number((t as any).netAmount|| (t as any).amount),0)), events } });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

export default router;
