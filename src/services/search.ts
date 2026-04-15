// C:\Projects\Scrolith\src\services\search.ts
import { Recommendation } from "../types";

import { getApiBaseUrl } from '../utils/apiBase';

const getSearchApiUrl = () => getApiBaseUrl();

// GLOBAL Rate Limiting Variables (SHARED across ALL services)
let lastSearchCallTime = 0;
const MIN_DELAY = 450; // 450ms minimum delay between ALL API calls

type HttpMethod = "GET" | "POST";

type ApiOk<T> = { success: true; data: T };
type ApiFail = { success: false; error?: string; status?: number };
type ApiResponse<T> = ApiOk<T> | ApiFail;

export type SearchEntityType = "posts" | "people" | "pages" | "jobs" | "gigs";
export type UnifiedSearchEntityType = Exclude<SearchEntityType, "posts">;

export type UnifiedSearchItem = {
  id: string;
  type: UnifiedSearchEntityType;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  url?: string;
  avatarUrl?: string | null;
  image?: string | null;
  meta?: Record<string, any>;
};

export type UnifiedSearchGroups = Record<UnifiedSearchEntityType, UnifiedSearchItem[]>;

export type UnifiedSearchPayload = {
  query: string;
  groups: UnifiedSearchGroups;
  results: UnifiedSearchItem[];
  totals: Record<UnifiedSearchEntityType | "total", number>;
};

const DEFAULT_UNIFIED_GROUPS: UnifiedSearchGroups = {
  people: [],
  pages: [],
  jobs: [],
  gigs: []
};

const DEFAULT_SEARCH_PROMPTS = [
  'interview tips',
  'latest in ai',
  'balancing work and personal life',
  'remote work',
  "when's the best time to switch jobs",
  'logo design',
  'web development',
  'social media marketing'
];

class SearchService {
  // Rate limiting helper (GLOBAL)
  private static async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static async applyGlobalRateLimit() {
    const now = Date.now();
    const timeSinceLast = now - lastSearchCallTime;
    const delay = Math.max(0, MIN_DELAY - timeSinceLast);

    if (delay > 0) await this.delay(delay);
    lastSearchCallTime = Date.now();
  }

  private static async request<T>(method: HttpMethod, endpoint: string, body?: any): Promise<T> {
    try {
      await this.applyGlobalRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${getSearchApiUrl()}${endpoint}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // Graceful fallback for rate limit
        if (res.status === 429) {
          console.warn(`Rate limited for ${endpoint}, using fallback where applicable`);
          return this.getFallbackData(endpoint) as T;
        }

        console.warn(`API ${method} failed for ${endpoint}, status: ${res.status}`);
        // For search-related features, return safe fallbacks rather than throwing
        return this.getFallbackData(endpoint) as T;
      }

      return (await res.json()) as T;
    } catch (e) {
      console.warn(`API ${method} timeout/error for ${endpoint}`, e);
      return this.getFallbackData(endpoint) as T;
    }
  }

  static async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>("GET", endpoint);
  }

  static async post<T = any>(endpoint: string, data: any): Promise<T> {
    return this.request<T>("POST", endpoint, data);
  }

  /**
   * IMPORTANT:
   * - This service is used for search UX and recommendations.
   * - Homepage/CMS MUST NOT rely on mock/demo fallbacks (handled elsewhere).
   * - Here we keep minimal fallbacks only for non-critical search UX
   *   (e.g., quick tags, trending keywords) when backend isn't ready.
   */
  private static getFallbackData(endpoint: string): any {
    if (endpoint.includes("/search/recommendations")) {
      return [];
    }

    if (endpoint.includes("/search/trending")) {
      return DEFAULT_SEARCH_PROMPTS.slice(0, 6).map((keyword, index) => ({
        id: `trend-${index + 1}`,
        keyword,
        count: Math.max(120, 960 - index * 80),
        trend: index < 3 ? 'up' : 'stable'
      }));
    }

    if (endpoint.includes("/search/quick-tags")) {
      return DEFAULT_SEARCH_PROMPTS.slice(0, 6).map((label, index) => ({
        id: `qt-${index + 1}`,
        label,
        url: `/search?q=${encodeURIComponent(label)}`,
        bgColor: ['#EEF2FF', '#FCE7F3', '#F3E8FF', '#ECFDF5', '#EFF6FF', '#FFF7ED'][index % 6]
      }));
    }

    if (endpoint.includes("/search/suggestions")) {
      return DEFAULT_SEARCH_PROMPTS.slice(0, 5).map((text) => ({
        text,
        type: 'keyword',
        category: 'Try searching for'
      }));
    }

    return [];
  }

  private static extractList<T = any>(payload: any): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (Array.isArray(payload?.data)) return payload.data as T[];
    if (Array.isArray(payload?.data?.items)) return payload.data.items as T[];
    if (Array.isArray(payload?.items)) return payload.items as T[];
    return [];
  }

  private static toUnifiedPayload(payload: any): UnifiedSearchPayload {
    const source =
      payload && typeof payload === "object" && !Array.isArray(payload) && payload.data && typeof payload.data === "object"
        ? payload.data
        : payload;

    const groupsSource = source?.groups || {};
    const groups: UnifiedSearchGroups = {
      people: this.extractList<UnifiedSearchItem>(groupsSource?.people),
      pages: this.extractList<UnifiedSearchItem>(groupsSource?.pages),
      jobs: this.extractList<UnifiedSearchItem>(groupsSource?.jobs),
      gigs: this.extractList<UnifiedSearchItem>(groupsSource?.gigs)
    };

    const interleavedFallback = [
      ...groups.people,
      ...groups.pages,
      ...groups.jobs,
      ...groups.gigs
    ];

    const results = this.extractList<UnifiedSearchItem>(source?.results);
    const finalResults = results.length ? results : interleavedFallback;

    const totals = {
      people: Number(source?.totals?.people ?? groups.people.length) || 0,
      pages: Number(source?.totals?.pages ?? groups.pages.length) || 0,
      jobs: Number(source?.totals?.jobs ?? groups.jobs.length) || 0,
      gigs: Number(source?.totals?.gigs ?? groups.gigs.length) || 0,
      total: Number(source?.totals?.total ?? finalResults.length) || 0
    };

    return {
      query: String(source?.query || "").trim(),
      groups,
      results: finalResults,
      totals
    };
  }

  // ----------------------------
  // Public Methods
  // ----------------------------

  static async getRecommendations(userId: string): Promise<Recommendation[]> {
    const data = await this.get<any>(`/search/recommendations?userId=${encodeURIComponent(userId)}`);
    const list = this.extractList<Recommendation>(data);
    return list.length ? list : this.getFallbackData("/search/recommendations");
  }

  static async getTrendingSearches(limit: number = 5): Promise<any[]> {
    const data = await this.get<any>(`/search/trending?limit=${limit}`);
    const list = this.extractList<any>(data);
    return list.length ? list : this.getFallbackData(`/search/trending?limit=${limit}`);
  }

  static async search(
    query: string,
    filters?: {
      category?: string;
      type?: SearchEntityType | "all";
      minPrice?: number;
      maxPrice?: number;
      limit?: number;
      perType?: number;
    }
  ): Promise<any[]> {
    const params = new URLSearchParams();
    params.append("q", query);

    if (filters?.category) params.append("category", filters.category);
    if (filters?.type) params.append("type", filters.type);
    if (filters?.minPrice != null) params.append("minPrice", String(filters.minPrice));
    if (filters?.maxPrice != null) params.append("maxPrice", String(filters.maxPrice));
    if (filters?.limit != null) params.append("limit", String(filters.limit));
    if (filters?.perType != null) params.append("perType", String(filters.perType));

    const data = await this.get<any>(`/search?${params.toString()}`);
    return this.extractList<any>(data);
  }

  static async searchUnified(
    query: string,
    options?: {
      limit?: number;
      perType?: number;
    }
  ): Promise<UnifiedSearchPayload> {
    const clean = String(query || "").trim();
    if (!clean) {
      return {
        query: "",
        groups: { ...DEFAULT_UNIFIED_GROUPS },
        results: [],
        totals: { people: 0, pages: 0, jobs: 0, gigs: 0, total: 0 }
      };
    }

    const params = new URLSearchParams();
    params.append("q", clean);
    if (options?.limit != null) params.append("limit", String(options.limit));
    if (options?.perType != null) params.append("perType", String(options.perType));

    const data = await this.get<any>(`/search/unified?${params.toString()}`);
    return this.toUnifiedPayload(data);
  }

  static async getQuickTags(): Promise<any[]> {
    const data = await this.get<any>("/search/quick-tags");
    const list = this.extractList<any>(data);
    return list.length ? list : this.getFallbackData("/search/quick-tags");
  }

  static async getSearchHistory(userId: string): Promise<any[]> {
    const data = await this.get<any>(`/search/history?userId=${encodeURIComponent(userId)}`);
    return Array.isArray(data) ? data : [];
  }

  static async saveSearchHistory(userId: string, query: string): Promise<ApiResponse<null>> {
    const res = await this.post<any>("/search/history", { userId, query });
    // normalize result
    if (res && typeof res === "object" && "success" in res) return res as ApiResponse<null>;
    return { success: true, data: null };
  }

  static async getAdvancedFilters(): Promise<any> {
    // If you later implement backend endpoint, replace this with `get('/search/filters')`.
    return {
      categories: [
        { id: "cat-1", name: "Development", slug: "development", count: 120 },
        { id: "cat-2", name: "Design", slug: "design", count: 85 },
        { id: "cat-3", name: "Marketing", slug: "marketing", count: 60 },
        { id: "cat-4", name: "Writing", slug: "writing", count: 45 },
        { id: "cat-5", name: "Video", slug: "video", count: 30 },
        { id: "cat-6", name: "AI Services", slug: "ai-services", count: 50 },
      ],
      experienceLevels: ["Beginner", "Intermediate", "Expert"],
      pricingModels: ["Fixed Price", "Hourly"],
      deliveryTimes: ["Less than 1 day", "1-3 days", "3-7 days", "7+ days"],
      ratings: [1, 2, 3, 4, 5],
    };
  }

  static async getSearchAnalytics(query: string): Promise<any> {
    const data = await this.get<any>(`/search/analytics?query=${encodeURIComponent(query)}`);
    return data || {
      query,
      resultsCount: 0,
      avgPrice: 0,
      avgRating: 0,
      avgDeliveryTime: 0,
      topCategories: [],
      trend: "neutral",
    };
  }

  static async getSemanticSearch(query: string): Promise<any[]> {
    const data = await this.get<any>(`/search/semantic?query=${encodeURIComponent(query)}`);
    return Array.isArray(data) ? data : [];
  }

  static async performSearch(query: string, mode: "keyword" | "semantic" = "keyword"): Promise<{ results: any[] }> {
    if (mode === "semantic") {
      const results = await this.getSemanticSearch(query);
      return { results: Array.isArray(results) ? results : [] };
    }
    const results = await this.search(query);
    return { results: Array.isArray(results) ? results : [] };
  }

  static async getSuggestions(query: string, userRole?: string): Promise<any[]> {
    const params = new URLSearchParams();
    params.append("q", query);
    if (userRole) params.append("role", userRole);

    const data = await this.get<any>(`/search/suggestions?${params.toString()}`);
    const list = this.extractList<any>(data);
    return list.length ? list : this.getFallbackData(`/search/suggestions?${params.toString()}`);
  }

  static async saveSearchQuery(userId: string, query: string): Promise<ApiResponse<null>> {
    // Alias for compatibility
    return this.saveSearchHistory(userId, query);
  }
}

export { SearchService };

