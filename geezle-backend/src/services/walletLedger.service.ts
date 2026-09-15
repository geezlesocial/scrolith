/** Canonical ledger entry point for new wallet credits. */
export const creditWallet = async (tx: any, input: { userId: string; amount: number; currency: string; referenceId: string; description: string; metadata?: Record<string, any> }) => {
  let wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) wallet = await tx.wallet.create({ data: { userId: input.userId, currency: input.currency } });
  if (wallet.currency.toUpperCase() !== input.currency.toUpperCase()) throw new Error(`Wallet currency ${wallet.currency} does not match settlement currency ${input.currency}`);
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Wallet credit amount must be positive');
  const duplicate = await tx.transaction.findFirst({ where: { userId: input.userId, referenceId: input.referenceId } });
  if (duplicate) return duplicate;
  const transaction = await tx.transaction.create({ data: { walletId: wallet.id, userId: input.userId, type: 'REWARD', amount: input.amount, currency: input.currency, status: 'COMPLETED', description: input.description, referenceId: input.referenceId, metadata: input.metadata || undefined } });
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: input.amount } } });
  return transaction;
};
