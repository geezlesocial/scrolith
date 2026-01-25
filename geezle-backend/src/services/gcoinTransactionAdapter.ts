import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function createLedgerFromGcoin(gcoinTxId: string) {
  const gtx = await prisma.gcoinTransaction.findUnique({ where: { id: gcoinTxId } });
  if (!gtx) throw new Error('Gcoin transaction not found');

  // create a Transaction record if not exists
  const exists = await prisma.transaction.findFirst({ where: { metadata: { path: ['gcoinTransactionId'], equals: gcoinTxId } } as any });
  if (exists) return exists;

  const t = await prisma.transaction.create({ data: {
    walletId: null,
    userId: gtx.fromUserId || gtx.userId,
    type: 'COMMUNITY_GCOIN_LEDGER',
    amount: Number(gtx.netAmount || gtx.amount),
    currency: 'GCOIN',
    status: 'COMPLETED',
    description: `Gcoin ledger for ${gcoinTxId}`,
    metadata: { gcoinTransactionId: gcoinTxId }
  } });
  return t;
}
