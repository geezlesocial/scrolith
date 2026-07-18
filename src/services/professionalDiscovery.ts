import api from './api';

export type ProfessionalDiscoveryItem = {
  id: string;
  type:
    | 'marketplace_listing'
    | 'group'
    | 'blog'
    | 'job'
    | 'gig'
    | 'career_action'
    | 'resume_template'
    | string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string | null;
  url: string;
  score?: number;
  reasons?: string[];
  meta?: Record<string, any>;
};

export type ProfessionalDiscoveryBundle = {
  generatedAt: string;
  marketplace: ProfessionalDiscoveryItem[];
  groups: ProfessionalDiscoveryItem[];
  blogs: ProfessionalDiscoveryItem[];
  career: ProfessionalDiscoveryItem[];
  resumeTemplates: ProfessionalDiscoveryItem[];
  totals?: Record<string, number>;
};

const unwrap = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const emptyBundle = (): ProfessionalDiscoveryBundle => ({
  generatedAt: new Date().toISOString(),
  marketplace: [],
  groups: [],
  blogs: [],
  career: [],
  resumeTemplates: [],
  totals: { marketplace: 0, groups: 0, blogs: 0, career: 0, resumeTemplates: 0 }
});

export const ProfessionalDiscoveryService = {
  async getHome(limit = 8): Promise<ProfessionalDiscoveryBundle> {
    try {
      return unwrap<ProfessionalDiscoveryBundle>(
        await api.get('/professional-discovery/home', { params: { limit }, timeout: 20000 })
      );
    } catch {
      return emptyBundle();
    }
  },

  async getMarketplace(limit = 12): Promise<ProfessionalDiscoveryItem[]> {
    try {
      const data = unwrap<{ items: ProfessionalDiscoveryItem[] }>(
        await api.get('/professional-discovery/marketplace', { params: { limit }, timeout: 15000 })
      );
      return Array.isArray(data?.items) ? data.items : [];
    } catch {
      return [];
    }
  },

  async getGroups(limit = 12): Promise<ProfessionalDiscoveryItem[]> {
    try {
      const data = unwrap<{ items: ProfessionalDiscoveryItem[] }>(
        await api.get('/professional-discovery/groups', { params: { limit }, timeout: 15000 })
      );
      return Array.isArray(data?.items) ? data.items : [];
    } catch {
      return [];
    }
  },

  async getBlogs(limit = 12): Promise<ProfessionalDiscoveryItem[]> {
    try {
      const data = unwrap<{ items: ProfessionalDiscoveryItem[] }>(
        await api.get('/professional-discovery/blogs', { params: { limit }, timeout: 15000 })
      );
      return Array.isArray(data?.items) ? data.items : [];
    } catch {
      return [];
    }
  },

  async getCareer() {
    try {
      return unwrap<{
        actions: ProfessionalDiscoveryItem[];
        resumeTemplates: ProfessionalDiscoveryItem[];
        blogs: ProfessionalDiscoveryItem[];
        generatedAt: string;
      }>(await api.get('/professional-discovery/career', { timeout: 15000 }));
    } catch {
      return {
        actions: [],
        resumeTemplates: [],
        blogs: [],
        generatedAt: new Date().toISOString()
      };
    }
  }
};
