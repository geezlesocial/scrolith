import { reconcileAdPayments } from '../services/adPaymentReconciliation.service';
import { disconnectPrisma } from '../utils/prismaClient';

let disconnectPromise: Promise<void> | undefined;

export { reconcileAdPayments };

export const closeReconciliationResources = async () => {
  if (!disconnectPromise) {
    disconnectPromise = disconnectPrisma();
  }
  return disconnectPromise;
};
