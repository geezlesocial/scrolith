import { Decimal } from '@prisma/client/runtime/client';

export const calculateEqualDistribution = (poolAmount: Decimal | number | string, partnerCount: number) => {
  if (!Number.isInteger(partnerCount) || partnerCount <= 0) throw new Error('Partner count must be positive');
  const pool = new Decimal(poolAmount).toDecimalPlaces(2);
  if (pool.lte(0)) throw new Error('Distribution pool must be greater than zero');
  const perPartner = pool.div(partnerCount).toDecimalPlaces(2);
  const remainder = pool.minus(perPartner.mul(partnerCount)).toDecimalPlaces(2);
  return { pool, perPartner, remainder };
};
