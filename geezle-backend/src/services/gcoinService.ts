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

    // Fee calculation: read global config
    const cfg = await prisma.gcoinConfig.findFirst({ where: { key: 'default' } });
    const cfgData: any = cfg?.data;
    let fee = 0;
    if (cfgData && cfgData.transferFeeType === 'percentage') {
      fee = amount * (Number(cfgData.transferFeeValue || 0));
    } else if (cfgData && cfgData.transferFeeType === 'flat') {
      fee = Number(cfgData.transferFeeValue || 0);
    }

    const net = amount - fee;

    // Transactional update
    const tx = await prisma.$transaction(async (prismaTx) => {
      // debit sender
      await prismaTx.gcoinWallet.update({ where: { userId: fromUserId }, data: { balance: { decrement: amount } } as any });
      // credit recipient
      await prismaTx.gcoinWallet.update({ where: { userId: recipient.userId }, data: { balance: { increment: net }, lifetimeEarned: { increment: net } } as any });
      // credit admin fee to system wallet (optional: use userId = null or special admin wallet)
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

      // create a Transaction ledger entry to integrate with existing finance system
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
