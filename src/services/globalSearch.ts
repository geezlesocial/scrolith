import { listMarketplaceListings } from './marketplace';
import { SearchService } from './search';
import type { MarketplaceListing } from '../types/marketplace';

export type GlobalSearchGroupKey = 'people' | 'pages' | 'jobs' | 'gigs' | 'marketplace' | 'posts';

export type GlobalSearchItem = {
  id?: string;
  type?: GlobalSearchGroupKey | string;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  excerpt?: string;
  url?: string;
  avatarUrl?: string | null;
  image?: string | null;
  category?: string;
  meta?: Record<string, any>;
};

export type GlobalSearchGroups = Record<GlobalSearchGroupKey, GlobalSearchItem[]>;

export type GlobalSearchPayload = {
  query: string;
  groups: GlobalSearchGroups;
  results: GlobalSearchItem[];
  totals: Record<GlobalSearchGroupKey | 'total', number>;
};

export const GLOBAL_SEARCH_GROUP_ORDER: GlobalSearchGroupKey[] = [
  'people',
  'pages',
  'jobs',
  'gigs',
  'marketplace',
  'posts'
];

export const GLOBAL_SEARCH_GROUP_LABELS: Record<GlobalSearchGroupKey, string> = {
  people: 'Users',
  pages: 'Pages',
  jobs: 'Jobs',
  gigs: 'Gigs',
  marketplace: 'Marketplace',
  posts: 'Posts'
};

export const GLOBAL_SEARCH_GROUP_BADGES: Record<GlobalSearchGroupKey, string> = {
  people: 'User',
  pages: 'Page',
  jobs: 'Job',
  gigs: 'Gig',
  marketplace: 'Item',
  posts: 'Post'
};

export const emptyGlobalSearchGroups = (): GlobalSearchGroups => ({
  people: [],
  pages: [],
  jobs: [],
  gigs: [],
  marketplace: [],
  posts: []
});

export const normalizeGlobalSearchType = (value: unknown): GlobalSearchGroupKey | undefined => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return undefined;
  if (key === 'people' || key === 'person' || key === 'users' || key === 'user') return 'people';
  if (key === 'pages' || key === 'page' || key === 'company') return 'pages';
  if (key === 'jobs' || key === 'job') return 'jobs';
  if (key === 'gigs' || key === 'gig') return 'gigs';
  if (key === 'marketplace' || key === 'marketplace_listing' || key === 'listing' || key === 'product' || key === 'item') return 'marketplace';
  if (key === 'posts' || key === 'post') return 'posts';
  return undefined;
};

export const resolveGlobalSearchItemUrl = (item: any, normalizedType?: GlobalSearchGroupKey | string): string => {
  const direct = String(item?.url || item?.link || item?.href || '').trim();
  if (direct) return direct;

  const kind = String(normalizedType || item?.type || item?.kind || item?.entityType || item?.category || '')
    .trim()
    .toLowerCase();
  const id = String(item?.slug || item?.id || item?._id || item?.userId || item?.user_id || '').trim();
  const encodedId = id ? encodeURIComponent(id) : '';

  if (kind === 'people' || kind === 'person' || kind === 'users' || kind === 'user') {
    const username = String(item?.username || item?.handle || item?.meta?.username || '').trim().replace(/^@+/, '');
    return username ? `/u/${encodeURIComponent(username)}` : encodedId ? `/profile/${encodedId}` : '/search';
  }
  if (kind === 'pages' || kind === 'page' || kind === 'company') {
    const slug = String(item?.slug || item?.handle || item?.username || item?.meta?.slug || id || '').trim().replace(/^@+/, '');
    return slug ? `/company/${encodeURIComponent(slug)}` : '/community';
  }
  if (kind === 'jobs' || kind === 'job') return encodedId ? `/jobs/${encodedId}` : '/jobs';
  if (kind === 'gigs' || kind === 'gig') return encodedId ? `/gigs/${encodedId}` : '/gigs';
  if (kind === 'marketplace' || kind === 'marketplace_listing' || kind === 'listing' || kind === 'product' || kind === 'item') {
    return encodedId ? `/marketplace/listing/${encodedId}` : '/marketplace';
  }
  if (kind === 'posts' || kind === 'post') return encodedId ? `/post/${encodedId}` : '/community';
  return encodedId ? `/search?q=${encodedId}` : '/search';
};

export const normalizeGlobalSearchItem = (item: any): GlobalSearchItem => {
  const normalizedType = normalizeGlobalSearchType(item?.type || item?.kind || item?.entityType || item?.category);
  const title = item?.title || item?.name || item?.username || 'Result';
  const image = item?.avatarUrl || item?.avatar || item?.image || item?.cover || item?.thumbnail || null;
  return {
    id: item?.id || item?._id,
    type: normalizedType || item?.type || item?.kind || item?.category,
    title,
    name: item?.name || item?.title || undefined,
    username: item?.username || item?.handle || item?.meta?.username || undefined,
    subtitle: item?.subtitle || undefined,
    description: item?.description || item?.excerpt || item?.summary || item?.subtitle,
    excerpt: item?.excerpt,
    url: resolveGlobalSearchItemUrl(item, normalizedType),
    avatarUrl: image,
    image: image || undefined,
    category: item?.category,
    meta: item?.meta || {}
  };
};

export const normalizeMarketplaceSearchItem = (listing: MarketplaceListing): GlobalSearchItem => {
  const categoryName = String(listing?.category?.name || '').trim();
  const location = String(listing?.location || '').trim();
  const price = listing?.price !== undefined && listing?.price !== null && listing.price !== ''
    ? `${listing.currency || 'USD'} ${listing.price}`
    : '';
  const subtitle = [price, categoryName, location].filter(Boolean).join(' - ');
  const image =
    listing.coverImage ||
    (Array.isArray(listing.images) && listing.images.length
      ? (typeof listing.images[0] === 'string' ? listing.images[0] : listing.images[0]?.url)
      : null) ||
    null;

  return {
    id: listing.id,
    type: 'marketplace',
    title: listing.title || 'Marketplace item',
    subtitle: subtitle || 'Marketplace listing',
    description: listing.description || undefined,
    url: `/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`,
    avatarUrl: image,
    image: image || undefined,
    category: categoryName || 'Marketplace',
    meta: {
      price: listing.price,
      currency: listing.currency,
      brand: listing.brand,
      location: listing.location
    }
  };
};

const uniqueSearchItems = (items: GlobalSearchItem[]) => {
  return Array.from(
    new Map(
      items
        .filter((item) => Boolean(item?.url))
        .map((item, index) => [
          item.id ? `${item.type || 'result'}:${item.id}` : `${item.type || 'result'}:${item.url || ''}:${index}`,
          item
        ])
    ).values()
  );
};

export const searchGlobalWithMarketplace = async (
  query: string,
  options: { maxResults?: number; includePosts?: boolean } = {}
): Promise<GlobalSearchPayload> => {
  const clean = String(query || '').trim();
  const maxResults = Math.max(4, options.maxResults || 8);
  if (!clean) {
    return {
      query: '',
      groups: emptyGlobalSearchGroups(),
      results: [],
      totals: { people: 0, pages: 0, jobs: 0, gigs: 0, marketplace: 0, posts: 0, total: 0 }
    };
  }

  const perType = Math.max(2, Math.min(6, Math.ceil(maxResults / 2)));
  const [unified, posts, marketplaceResponse] = await Promise.all([
    SearchService.searchUnified(clean, { limit: Math.max(maxResults, 12), perType }),
    options.includePosts === false
      ? Promise.resolve([])
      : SearchService.search(clean, { type: 'posts', limit: Math.max(4, Math.min(8, maxResults)) }).catch(() => []),
    listMarketplaceListings({
      search: clean,
      page: 1,
      pageSize: Math.max(4, Math.min(8, maxResults)),
      sort: 'recommended'
    }).catch(() => null)
  ]);

  const marketplaceListings = Array.isArray(marketplaceResponse)
    ? marketplaceResponse
    : Array.isArray((marketplaceResponse as any)?.listings)
      ? (marketplaceResponse as any).listings
      : Array.isArray((marketplaceResponse as any)?.items)
        ? (marketplaceResponse as any).items
        : [];
  const marketplaceItems = marketplaceListings.map(normalizeMarketplaceSearchItem);
  const sourceGroups = unified?.groups || {};
  const groups = emptyGlobalSearchGroups();

  GLOBAL_SEARCH_GROUP_ORDER.forEach((key) => {
    const source =
      key === 'marketplace'
        ? marketplaceItems
        : key === 'posts' && Array.isArray((sourceGroups as any)?.posts) && !(sourceGroups as any).posts.length
          ? posts
          : Array.isArray((sourceGroups as any)?.[key])
            ? (sourceGroups as any)[key]
            : [];
    groups[key] = uniqueSearchItems(source.map(normalizeGlobalSearchItem)).slice(0, maxResults);
  });

  const merged = Array.isArray(unified?.results) && unified.results.length
    ? [...unified.results.map(normalizeGlobalSearchItem), ...posts.map(normalizeGlobalSearchItem), ...marketplaceItems]
    : GLOBAL_SEARCH_GROUP_ORDER.flatMap((key) => groups[key]);
  const results = uniqueSearchItems(merged).slice(0, Math.max(maxResults, 12));
  const totals = {
    people: groups.people.length,
    pages: groups.pages.length,
    jobs: groups.jobs.length,
    gigs: groups.gigs.length,
    marketplace: groups.marketplace.length,
    posts: groups.posts.length,
    total: results.length
  };

  return { query: clean, groups, results, totals };
};
