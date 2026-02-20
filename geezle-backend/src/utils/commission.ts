type CommissionSettingsNormalized = {
  freelancer_fee_type: 'percentage' | 'fixed';
  freelancer_fee_value: number;
  employer_fee_type: 'percentage' | 'fixed';
  employer_fee_value: number;
  minimum_fee: number;
};

const DEFAULT_COMMISSION_SETTINGS: CommissionSettingsNormalized = {
  freelancer_fee_type: 'percentage',
  freelancer_fee_value: 20,
  employer_fee_type: 'percentage',
  employer_fee_value: 0,
  minimum_fee: 2
};

const toNumber = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeFeeType = (value: unknown, fallback: 'percentage' | 'fixed') => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'fixed' ? 'fixed' : raw === 'percentage' ? 'percentage' : fallback;
};

export const normalizeCommissionSettings = (settings: any): CommissionSettingsNormalized => {
  const maybeObject = settings && typeof settings === 'object' ? settings : {};
  const limits =
    maybeObject?.walletFundingLimits && typeof maybeObject.walletFundingLimits === 'object'
      ? (maybeObject.walletFundingLimits as Record<string, any>)
      : maybeObject;
  const stored =
    limits?.commissionSettings ||
    limits?.commission_settings ||
    maybeObject?.commissionSettings ||
    maybeObject?.commission_settings ||
    {};
  return {
    freelancer_fee_type: normalizeFeeType(
      stored.freelancer_fee_type ?? stored.freelancerFeeType,
      DEFAULT_COMMISSION_SETTINGS.freelancer_fee_type
    ),
    freelancer_fee_value: Math.max(
      0,
      toNumber(
        stored.freelancer_fee_value ?? stored.freelancerFeeValue,
        DEFAULT_COMMISSION_SETTINGS.freelancer_fee_value
      )
    ),
    employer_fee_type: normalizeFeeType(
      stored.employer_fee_type ?? stored.employerFeeType,
      DEFAULT_COMMISSION_SETTINGS.employer_fee_type
    ),
    employer_fee_value: Math.max(
      0,
      toNumber(stored.employer_fee_value ?? stored.employerFeeValue, DEFAULT_COMMISSION_SETTINGS.employer_fee_value)
    ),
    minimum_fee: Math.max(
      0,
      toNumber(stored.minimum_fee ?? stored.minimumFee, DEFAULT_COMMISSION_SETTINGS.minimum_fee)
    )
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
