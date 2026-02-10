type CommissionSettingsNormalized = {
  freelancer_fee_type: 'percentage' | 'fixed';
  freelancer_fee_value: number;
  employer_fee_type: 'percentage' | 'fixed';
  employer_fee_value: number;
  minimum_fee: number;
};

const toNumber = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const normalizeCommissionSettings = (settings: any): CommissionSettingsNormalized => {
  const limits =
    settings?.walletFundingLimits && typeof settings.walletFundingLimits === 'object'
      ? (settings.walletFundingLimits as Record<string, any>)
      : {};
  const stored = limits.commissionSettings || limits.commission_settings || {};
  return {
    freelancer_fee_type: (stored.freelancer_fee_type ?? stored.freelancerFeeType ?? 'percentage') as 'percentage' | 'fixed',
    freelancer_fee_value: toNumber(stored.freelancer_fee_value ?? stored.freelancerFeeValue ?? 0),
    employer_fee_type: (stored.employer_fee_type ?? stored.employerFeeType ?? 'percentage') as 'percentage' | 'fixed',
    employer_fee_value: toNumber(stored.employer_fee_value ?? stored.employerFeeValue ?? 0),
    minimum_fee: toNumber(stored.minimum_fee ?? stored.minimumFee ?? 0)
  };
};

const computeFee = (amount: number, type: 'percentage' | 'fixed', value: number) => {
  if (type === 'percentage') {
    return Number((amount * (value / 100)).toFixed(2));
  }
  return Number(value || 0);
};

export const computeCommissionBreakdown = (amount: number, settings: any) => {
  const normalized = normalizeCommissionSettings(settings);
  const safeAmount = Math.max(0, toNumber(amount, 0));

  let freelancerFee = computeFee(safeAmount, normalized.freelancer_fee_type, normalized.freelancer_fee_value);
  let employerFee = computeFee(safeAmount, normalized.employer_fee_type, normalized.employer_fee_value);

  freelancerFee = Math.max(0, Math.min(freelancerFee, safeAmount));
  employerFee = Math.max(0, employerFee);

  let totalFee = Number((freelancerFee + employerFee).toFixed(2));
  if (normalized.minimum_fee > 0 && totalFee < normalized.minimum_fee) {
    const diff = Number((normalized.minimum_fee - totalFee).toFixed(2));
    employerFee = Number((employerFee + diff).toFixed(2));
    totalFee = Number((freelancerFee + employerFee).toFixed(2));
  }

  return {
    settings: normalized,
    freelancerFee,
    employerFee,
    totalFee
  };
};
