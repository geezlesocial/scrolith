import { Request, Response } from 'express';
import { prisma } from '../db';

// Fallbacks (in-memory) if Prisma isn't available
const wallets = new Map<string, any>();
const transactions = new Map<string, any[]>();

export const getMyWallet = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || 'anonymous';

  if (prisma) {
    // upsert wallet for user
    const w = await prisma.wallet.upsert({
      where: { userId },
      create: { userId, balances: JSON.stringify({ available: 0, pending: 0, total: 0 }), currency: 'USD' },
      update: {}
    });
    // parse balances if stored as string
    const out = { ...w, balances: typeof w.balances === 'string' ? JSON.parse(w.balances) : w.balances };
    return res.json({ success: true, data: out });
  }

  let wallet = wallets.get(userId);
  if (!wallet) {
    wallet = {
      id: `wallet_${userId}`,
      userId,
      balances: { available: 0, pending: 0, total: 0 },
      currency: 'USD'
    };
    wallets.set(userId, wallet);
  }
  return res.json({ success: true, data: wallet });
};

export const getMyTransactions = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || 'anonymous';

  if (prisma) {
    const w = await prisma.wallet.findUnique({ where: { userId } });
    if (!w) return res.json({ success: true, data: [] });
    const txs = await prisma.walletTransaction.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'desc' } });
    const parsed = txs.map((t: any) => ({ ...t, meta: typeof t.meta === 'string' ? JSON.parse(t.meta) : t.meta }));
    return res.json({ success: true, data: parsed });
  }

  const txs = transactions.get(userId) || [];
  return res.json({ success: true, data: txs });
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || 'anonymous';
  const { amount, method } = req.body;

  if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

  if (prisma) {
    let w = await prisma.wallet.findUnique({ where: { userId } });
    if (!w) w = await prisma.wallet.create({ data: { userId, balances: JSON.stringify({ available: 0, pending: 0, total: 0 }), currency: 'USD' } });
    const walletId = w.id;
    const tx = await prisma.walletTransaction.create({ data: { walletId, type: 'withdrawal_request', amount: Number(amount), method: method || null, status: 'pending', meta: null } });
    return res.json({ success: true, data: tx });
  }

  const tx = { id: `tx_${Date.now()}`, type: 'withdrawal_request', amount, method, status: 'pending', createdAt: new Date() };
  const txs = transactions.get(userId) || [];
  txs.push(tx);
  transactions.set(userId, txs);
  return res.json({ success: true, data: tx });
};

export const getMyWithdrawals = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || 'anonymous';
  if (prisma) {
    const w = await prisma.wallet.findUnique({ where: { userId } });
    if (!w) return res.json({ success: true, data: [] });
    const txs = await prisma.walletTransaction.findMany({ where: { walletId: w.id, type: 'withdrawal_request' }, orderBy: { createdAt: 'desc' } });
    const parsed = txs.map((t: any) => ({ ...t, meta: typeof t.meta === 'string' ? JSON.parse(t.meta) : t.meta }));
    return res.json({ success: true, data: parsed });
  }
  const txs = (transactions.get(userId) || []).filter(t => t.type === 'withdrawal_request');
  return res.json({ success: true, data: txs });
};
