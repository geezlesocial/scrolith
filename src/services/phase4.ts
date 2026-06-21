import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type Phase4PublicEndpoint = {
  method: string;
  path: string;
  auth: string;
  description: string;
};

export type Phase4WebhookEvent = {
  key: string;
  category: string;
  description: string;
};

export type Phase4WidgetCatalogItem = {
  key: string;
  label: string;
  description: string;
  scriptPath: string;
};

export type Phase4Manifest = {
  generatedAt: string;
  version: string;
  ecosystem: string;
  apiBaseUrl: string;
  developerBaseUrl: string;
  capabilities: {
    publicApis: boolean;
    oauthApps: boolean;
    webhooks: boolean;
    embeddableWidgets: boolean;
    developerDashboard: boolean;
  };
  authentication: {
    publicRead: string;
    oauth: Record<string, string>;
    developer: string;
  };
  endpoints: Phase4PublicEndpoint[];
  scopes: string[];
  webhooks: Phase4WebhookEvent[];
  widgets: Phase4WidgetCatalogItem[];
};

export type Phase4DeveloperDashboard = {
  generatedAt: string;
  profile: {
    id: string;
    developerEmail: string;
    developerUsername?: string | null;
    linkStatus: string;
    linkedAt?: string | null;
    lastSyncedAt?: string | null;
    syncSnapshot?: any;
  };
  config: Record<string, any>;
  apps: {
    counts: Record<string, number>;
    items: any[];
  };
  webhooks: {
    events: Phase4WebhookEvent[];
    subscriptions: any[];
  };
  widgets: {
    catalog: Phase4WidgetCatalogItem[];
    items: any[];
  };
  recentActivity: any[];
  publicApis: Phase4PublicEndpoint[];
};

export type Phase4Briefing = {
  generatedAt: string;
  phase: 4;
  capabilities: Record<string, boolean>;
  publicApis: Phase4PublicEndpoint[];
  oauth: Record<string, string>;
  webhooks: Phase4WebhookEvent[];
  widgets: Phase4WidgetCatalogItem[];
  adminOverview?: any;
  operatingPriorities: string[];
};

export const Phase4Service = {
  getManifest() {
    return api.get('/ecosystem/public/apis').then(extractData<Phase4Manifest>);
  },

  getPublicCatalog() {
    return api.get('/public/v1/catalog').then(extractData<Phase4Manifest>);
  },

  searchPublicApi(params?: { q?: string; type?: string; limit?: number }) {
    return api.get('/public/v1/search', { params }).then(extractData<any>);
  },

  listPublicPosts(params?: { q?: string; limit?: number }) {
    return api.get('/public/v1/posts', { params }).then(extractData<any>);
  },

  listPublicJobs(params?: { q?: string; limit?: number }) {
    return api.get('/public/v1/jobs', { params }).then(extractData<any>);
  },

  listPublicGigs(params?: { q?: string; limit?: number }) {
    return api.get('/public/v1/gigs', { params }).then(extractData<any>);
  },

  listPublicPages(params?: { q?: string; limit?: number }) {
    return api.get('/public/v1/pages', { params }).then(extractData<any>);
  },

  getPhase4Briefing() {
    return api.get('/ecosystem/phase4/briefing').then(extractData<Phase4Briefing>);
  },

  getDeveloperDashboard() {
    return api.get('/ecosystem/developer/dashboard').then(extractData<Phase4DeveloperDashboard>);
  },

  listWebhooks() {
    return api.get('/ecosystem/developer/webhooks').then(extractData<any>);
  },

  createWebhook(payload: { name?: string; url: string; events: string[]; status?: 'active' | 'paused' }) {
    return api.post('/ecosystem/developer/webhooks', payload).then(extractData<any>);
  },

  testWebhook(id: string) {
    return api.post(`/ecosystem/developer/webhooks/${encodeURIComponent(id)}/test`).then(extractData<any>);
  },

  deleteWebhook(id: string) {
    return api.delete(`/ecosystem/developer/webhooks/${encodeURIComponent(id)}`).then(extractData<any>);
  },

  listWidgets() {
    return api.get('/ecosystem/developer/widgets').then(extractData<any>);
  },

  saveWidget(payload: {
    id?: string;
    widgetKey?: string;
    name?: string;
    status?: 'active' | 'draft' | 'paused';
    allowedOrigins?: string[];
    theme?: Record<string, any>;
    settings?: Record<string, any>;
  }) {
    return api.post('/ecosystem/developer/widgets', payload).then(extractData<any>);
  },

  getAdminOverview() {
    return api.get('/ecosystem/admin/overview').then(extractData<any>);
  }
};

export default Phase4Service;
