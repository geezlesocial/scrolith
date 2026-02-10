export type PlanType = 'freelancer' | 'employer';
export type PlanInterval = 'monthly' | 'yearly' | 'lifetime';

export interface PlanFeatureRecord {
  id: string;
  name: string;
  included: boolean;
  limit?: string;
  code?: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  interval: PlanInterval;
  currency: string;
  isActive: boolean;
  isPopular: boolean;
  features: PlanFeatureRecord[];
  createdAt: string;
  updatedAt: string;
}

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const toLower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

let plans: PlanRecord[] = [
  {
    id: 'plan-1',
    name: 'Freelancer Basic',
    type: 'freelancer',
    price: 9.99,
    interval: 'monthly',
    currency: 'USD',
    isActive: true,
    isPopular: false,
    features: [
      { id: 'ft-1', name: '5 Active Gigs', included: true },
      { id: 'ft-2', name: 'Basic Analytics', included: true },
      { id: 'ft-3', name: '24/7 Support', included: false },
      { id: 'ft-4', name: 'Featured gigs', included: false },
      { id: 'ft-5', name: 'Top selected gigs', included: false },
      { id: 'ft-6', name: 'Recommended gigs', included: false }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'plan-2',
    name: 'Freelancer Pro',
    type: 'freelancer',
    price: 19.99,
    interval: 'monthly',
    currency: 'USD',
    isActive: true,
    isPopular: true,
    features: [
      { id: 'ft-7', name: 'Unlimited Gigs', included: true },
      { id: 'ft-8', name: 'Advanced Analytics', included: true },
      { id: 'ft-9', name: 'Priority Support', included: true },
      { id: 'ft-10', name: 'Featured gigs', included: true },
      { id: 'ft-11', name: 'Top selected gigs', included: true },
      { id: 'ft-12', name: 'Recommended gigs', included: true },
      { id: 'ft-13', name: 'Pro verified account', included: true, code: 'pro_verified_freelancer' }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'plan-3',
    name: 'Employer Basic',
    type: 'employer',
    price: 29.99,
    interval: 'monthly',
    currency: 'USD',
    isActive: true,
    isPopular: false,
    features: [
      { id: 'ft-14', name: '3 Active Jobs', included: true },
      { id: 'ft-15', name: 'Featured jobs', included: false },
      { id: 'ft-16', name: 'Top selected jobs', included: false },
      { id: 'ft-17', name: 'Recommended jobs', included: false }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'plan-4',
    name: 'Employer Pro',
    type: 'employer',
    price: 49.99,
    interval: 'monthly',
    currency: 'USD',
    isActive: true,
    isPopular: true,
    features: [
      { id: 'ft-18', name: 'Unlimited Jobs', included: true },
      { id: 'ft-19', name: 'Featured jobs', included: true },
      { id: 'ft-20', name: 'Top selected jobs', included: true },
      { id: 'ft-21', name: 'Recommended jobs', included: true },
      { id: 'ft-22', name: 'Priority Support', included: true },
      { id: 'ft-23', name: 'Pro verified client', included: true, code: 'pro_verified_employer' }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
];

const normalizeFeature = (feat: any): PlanFeatureRecord => ({
  id: feat?.id ?? makeId('feat'),
  name: feat?.name ?? '',
  included: Boolean(feat?.included ?? false),
  limit: feat?.limit ?? undefined,
  code: feat?.code ?? feat?.feature_code ?? feat?.featureCode ?? undefined
});

const normalizePlan = (payload: any, existing?: PlanRecord): PlanRecord => {
  const rawType = payload?.type ?? existing?.type ?? 'freelancer';
  const type = rawType === 'employer' ? 'employer' : 'freelancer';
  const rawInterval = payload?.interval ?? existing?.interval ?? 'monthly';
  const interval = rawInterval === 'yearly' || rawInterval === 'lifetime' ? rawInterval : 'monthly';
  const isActive = Boolean(payload?.isActive ?? payload?.is_active ?? existing?.isActive ?? true);
  const isPopular = Boolean(payload?.isPopular ?? payload?.is_popular ?? existing?.isPopular ?? false);

  return {
    id: existing?.id ?? payload?.id ?? makeId('plan'),
    name: payload?.name ?? existing?.name ?? 'Untitled Plan',
    type,
    price: toNumber(payload?.price ?? existing?.price, 0),
    interval,
    currency: payload?.currency ?? existing?.currency ?? 'USD',
    isActive,
    isPopular,
    features: safeArray(payload?.features ?? existing?.features).map(normalizeFeature),
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  };
};

export const listPlans = (options?: { type?: string; activeOnly?: boolean }) => {
  const type = toLower(options?.type);
  const activeOnly = Boolean(options?.activeOnly);
  return plans.filter((plan) => {
    if (type && type !== 'all' && plan.type !== type) return false;
    if (activeOnly && !plan.isActive) return false;
    return true;
  });
};

export const getPlanById = (id: string) => plans.find((plan) => plan.id === id) || null;

export const savePlan = (payload: any) => {
  const existing = payload?.id ? plans.find((plan) => plan.id === payload.id) : undefined;
  const record = normalizePlan(payload, existing);
  plans = existing ? plans.map((plan) => (plan.id === existing.id ? record : plan)) : [record, ...plans];
  return record;
};

export const togglePlanActive = (id: string) => {
  const existing = plans.find((plan) => plan.id === id);
  if (!existing) return null;
  const updated: PlanRecord = { ...existing, isActive: !existing.isActive, updatedAt: nowIso() };
  plans = plans.map((plan) => (plan.id === id ? updated : plan));
  return updated;
};

export const planHasFeature = (plan: PlanRecord | null | undefined, code: string) => {
  if (!plan || !code) return false;
  const normalized = code.toLowerCase();
  return plan.features.some((feature) => {
    const featureCode = (feature.code || '').toLowerCase();
    return feature.included && featureCode === normalized;
  });
};

export const resolvePlanFeatureCodes = (plan: PlanRecord | null | undefined) => {
  if (!plan) return [];
  return plan.features
    .filter((feature) => feature.included && feature.code)
    .map((feature) => String(feature.code));
};
