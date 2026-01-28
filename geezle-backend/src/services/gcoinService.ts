import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export type TransferResult = { transactionId: string };

function genRecipientId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  const len = 12;
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class GcoinService {
  async ensureWalletForUser(userId: string) {
    let w = await prisma.gcoinWallet.findUnique({ where: { userId } });
    if (!w) {
      w = await prisma.gcoinWallet.create({ data: { userId, recipientId: genRecipientId() } });
    }
    return w;
  }

  async getWallet(userId: string) {
    return prisma.gcoinWallet.findUnique({ where: { userId } });
  }

  async getByRecipientId(recipientId: string) {
    return prisma.gcoinWallet.findUnique({ where: { recipientId } });
  }

  async transfer(fromUserId: string, opts: { toRecipientId?: string; toEmail?: string; amount: number; note?: string; reference?: any; }) : Promise<TransferResult> {
    // Resolve recipient
    let recipient;
    if (opts.toRecipientId) recipient = await this.getByRecipientId(opts.toRecipientId);
    if (!recipient && opts.toEmail) {
      const user = await prisma.user.findUnique({ where: { email: opts.toEmail } });
      if (user) recipient = await this.getWallet(user.id);
    }
    if (!recipient) throw new Error('Recipient not found');

    const senderWallet = await this.getWallet(fromUserId);
    if (!senderWallet) throw new Error('Sender wallet not found');
    if (senderWallet.status === 'frozen') throw new Error('WALLET_FROZEN');

    const amount = opts.amount;
    if (senderWallet.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

    // Fee calculation: read global config (gcoinConfig.data) or fallback to GcoinSettings
    let fee = 0;
    const cfg = await prisma.gcoinConfig.findFirst({ where: { key: 'default' } });
    if (cfg && cfg.data) {
      const cfgData: any = cfg.data;
      if (cfgData.transferFeeType === 'percentage') fee = amount * Number(cfgData.transferFeeValue || 0);
      else if (cfgData.transferFeeType === 'flat') fee = Number(cfgData.transferFeeValue || 0);
    } else {
      const s = await prisma.gcoinSettings.findFirst();
      if (s) {
        if (s.transferFeeType === 'percentage') fee = amount * Number(s.transferFeeValue || 0);
        else if (s.transferFeeType === 'flat') fee = Number(s.transferFeeValue || 0);
      }
    }

    const net = amount; // amount that recipient should receive
    const totalDeduct = amount + fee; // total amount to remove from sender

    // Transactional update
    const tx = await prisma.$transaction(async (prismaTx) => {
      // debit sender by amount + fee
      await prismaTx.gcoinWallet.update({ where: { userId: fromUserId }, data: { balance: { decrement: totalDeduct } } as any });
      // credit recipient with net amount (amount)
      await prismaTx.gcoinWallet.update({ where: { userId: recipient.userId }, data: { balance: { increment: net }, lifetimeEarned: { increment: net } } as any });
      // credit admin fee to admin wallet
      const adminUserId = 'admin-user';
      let adminWallet = await prismaTx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
      if (!adminWallet) {
        await prismaTx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-8)}`, balance: fee || 0, lifetimeEarned: fee || 0 } as any });
      } else {
        await prismaTx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: fee } } as any });
      }

      // create GcoinTransaction record
      const gtx = await prismaTx.gcoinTransaction.create({ data: {
        userId: fromUserId,
        amount: amount,
        type: 'transfer',
        source: opts.reference ? opts.reference.type : 'transfer',
        reason: opts.note || null,
        referenceId: opts.reference?.id || null,
        status: 'completed',
        fromUserId: fromUserId,
        toUserId: recipient.userId,
        feeAmount: fee,
        netAmount: net,
        createdAt: new Date()
      } });

      // create a Transaction ledger entry to integrate with existing finance system (record net transfer)
      await prismaTx.transaction.create({ data: {
        walletId: null,
        userId: fromUserId,
        type: 'TRANSFER',
        amount: Number(net),
        currency: 'GCOIN',
        status: 'COMPLETED',
        description: `Gcoin transfer to ${recipient.userId}`,
        metadata: { gcoinTransactionId: gtx.id }
      } });

      // also record fee as separate transaction for admin revenue tracking
      if (fee > 0) {
        await prismaTx.transaction.create({ data: {
          walletId: null,
          userId: adminUserId,
          type: 'GCOIN_FEE',
          amount: Number(fee),
          currency: 'GCOIN',
          status: 'COMPLETED',
          description: `Gcoin transfer fee from ${fromUserId}`,
          metadata: { gcoinTransactionId: gtx.id }
        } });
      }

      return gtx;
    });

    // Emit socket event
    try {
      const communityIo = (global as any).appCommunityIo;
      communityIo?.to(recipient.userId).emit('community:gcoin_transaction_created', { transaction: tx });
      communityIo?.to(fromUserId).emit('community:gcoin_transaction_created', { transaction: tx });
    } catch (e) {
      console.warn('Failed to emit socket for gcoin transfer', e);
    }

    return { transactionId: tx.id };
  }

  async award(userId: string, amount: number, note?: string) {
    const w = await this.ensureWalletForUser(userId);
    const tx = await prisma.$transaction(async (prismaTx) => {
      const gtx = await prismaTx.gcoinTransaction.create({ data: {
        userId,
        amount,
        type: 'award',
        reason: note || 'award',
        status: 'completed',
        netAmount: amount,
        feeAmount: 0,
        createdAt: new Date()
      } });
      await prismaTx.gcoinWallet.update({ where: { userId }, data: { balance: { increment: amount }, lifetimeEarned: { increment: amount } } as any });
      await prismaTx.transaction.create({ data: {
        walletId: null,
        userId,
        type: 'REWARD',
        amount: Number(amount),
        currency: 'GCOIN',
        status: 'COMPLETED',
        description: `Gcoin award: ${note || ''}`,
        metadata: { gcoinTransactionId: gtx.id }
      } });
      return gtx;
    });

    try { (global as any).appCommunityIo?.to(userId).emit('community:gcoin_balance_updated', { userId, balance: (await this.getWallet(userId))?.balance }); } catch (e) {}
    return tx;
  }

  async createConversionRequest(userId: string, amount: number, payoutMethodId: string) {
    const req = await prisma.gcoinConversionRequest.create({ data: { userId, amountGcoin: amount, amountFiat: 0, status: 'pending' } });
    return req;
  }
}

export default new GcoinService();
