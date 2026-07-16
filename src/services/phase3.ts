import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type Phase3Workspace = {
  id: string;
  type: 'enterprise_workspace';
  name: string;
  description?: string;
  status: string;
  visibility: string;
  owner?: any;
  linked?: {
    contractId?: string | null;
    orderId?: string | null;
  };
  counts?: {
    members: number;
    milestones: number;
    activities: number;
  };
  members?: any[];
  milestones?: any[];
  latestActivity?: any;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type Phase3WorkspaceResponse = {
  generatedAt: string;
  scope: 'member' | 'operator' | string;
  items: Phase3Workspace[];
  counts: {
    total: number;
    active: number;
    private: number;
  };
};

export type Phase3CreatorCommerce = {
  generatedAt: string;
  scope: 'creator' | 'operator' | string;
  monetization: {
    enabled: boolean;
    status: string;
    profile?: any;
    recentApplications?: any[];
  };
  campaigns: {
    items: any[];
    totals: Record<string, number>;
  };
  challenges: {
    active: any[];
    myEntries: any[];
  };
  recommendations?: Array<{ key: string; label: string; priority: number }>;
};

export type Phase3PayoutOrchestration = {
  generatedAt: string;
  scope: 'member' | 'operator' | string;
  readiness: Record<string, number>;
  rails: any[];
  wallet?: any;
  withdrawals: any[];
  intents: {
    walletFunding: any[];
    orderPayments: any[];
  };
  fxLocks: any[];
  gcoinTransactions: any[];
  totals: Record<string, any>;
  recommendations?: Array<{ key: string; label: string; priority: number }>;
};

export type Phase3LocalizationHub = {
  generatedAt: string;
  languages: {
    defaultLocale: string;
    enabledLocales: string[];
    rtlLocales: string[];
    dictionaryCacheSeconds: number;
    overridesCacheSeconds: number;
    updatedAt?: string | null;
  };
  interfaceCopy: {
    activeKeys: number;
    valuesByLocale: Array<{ locale: string; values: number; coverageRatio: number }>;
    activeTextOverrides: number;
  };
  contentTranslation?: any;
  currencies: {
    defaultCurrency: string;
    enabledCurrencies: string[];
    latestSnapshot?: any;
    providers: any[];
  };
  recommendations?: Array<{ key: string; label: string; priority: number }>;
};

export type Phase3Briefing = {
  generatedAt: string;
  phase: 3;
  capabilities: Record<string, boolean>;
  workspaces: Phase3WorkspaceResponse;
  creatorCommerce: Phase3CreatorCommerce;
  payouts: Phase3PayoutOrchestration;
  localization: Phase3LocalizationHub;
  operatingPriorities: string[];
};

export const Phase3Service = {
  getBriefing() {
    return api.get('/phase3/briefing').then(extractData<Phase3Briefing>);
  },

  listWorkspaces(params?: { limit?: number }) {
    return api.get('/phase3/workspaces', { params }).then(extractData<Phase3WorkspaceResponse>);
  },

  createWorkspace(payload: {
    name: string;
    description?: string;
    visibility?: 'private' | 'team' | 'public' | string;
    linkedContractId?: string | null;
    linkedOrderId?: string | null;
  }) {
    return api.post('/phase3/workspaces', payload).then(extractData<Phase3Workspace>);
  },

  getCreatorCommerceCampaigns(params?: { limit?: number }) {
    return api.get('/phase3/creator-commerce/campaigns', { params }).then(extractData<Phase3CreatorCommerce>);
  },

  getPayoutOrchestration(params?: { limit?: number }) {
    return api.get('/phase3/payouts/orchestration', { params }).then(extractData<Phase3PayoutOrchestration>);
  },

  getGlobalLocalizationHub() {
    return api.get('/phase3/localization/global').then(extractData<Phase3LocalizationHub>);
  }
};

export default Phase3Service;
