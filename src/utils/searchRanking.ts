export type SearchRankable = {
  id?: string;
  type?: string;
  title?: string;
  name?: string;
  username?: string;
  description?: string;
  subtitle?: string;
  excerpt?: string;
  category?: string;
  url?: string;
};

const normalizeSearchText = (value: unknown) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const scoreSearchItem = (item: SearchRankable, query: string) => {
  const title = normalizeSearchText(item.title || item.name);
  const username = normalizeSearchText(item.username);
  const supportingText = normalizeSearchText(
    [item.description, item.subtitle, item.excerpt, item.category].filter(Boolean).join(' ')
  );
  let score = 0;

  if (title === query) score += 100;
  else if (title.startsWith(query)) score += 75;
  else if (title.includes(query)) score += 55;
  if (username === query || username === query.replace(/^@/, '')) score += 90;
  else if (username.startsWith(query.replace(/^@/, ''))) score += 65;
  else if (username.includes(query.replace(/^@/, ''))) score += 40;
  if (supportingText.includes(query)) score += 20;
  if (item.url) score += 1;
  return score;
};

/** Rank and deduplicate existing search results without changing the search API. */
export const rankSearchItems = <T extends SearchRankable>(items: T[], rawQuery: string): T[] => {
  const query = normalizeSearchText(rawQuery);
  const seen = new Set<string>();

  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index, score: query ? scoreSearchItem(item, query) : 0 }))
    .filter(({ item }) => Boolean(item?.url))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter(({ item }) => {
      const key = item.id
        ? `${normalizeSearchText(item.type)}:${normalizeSearchText(item.id)}`
        : `${normalizeSearchText(item.type)}:${normalizeSearchText(item.url)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ item }) => item);
};
