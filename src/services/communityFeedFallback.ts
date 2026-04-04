import { tokenStore } from './tokenStore';
import { getApiBaseUrl } from '../utils/apiBase';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const extractItems = (value: any): any[] => {
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.posts)) return value.data.posts;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.posts)) return value.posts;
  return Array.isArray(value) ? value : [];
};

export const fetchPublicCommunityPostsBaseline = async (limit: number): Promise<any[]> => {
  const safeLimit = clamp(Number(limit) || 20, 4, 80);
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}/community/posts?limit=${encodeURIComponent(String(safeLimit))}`, {
    method: 'GET',
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Public community baseline failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  return extractItems(payload);
};
