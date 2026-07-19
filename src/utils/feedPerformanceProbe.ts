/**
 * Phase 21.0.2 — lightweight performance probes (browser + synthetic).
 * Records evidence for certification; no PII.
 */

export type FeedPerfMark = {
  name: string;
  t: number;
  detail?: Record<string, number | string | boolean | null>;
};

export type FeedPerfReport = {
  marks: FeedPerfMark[];
  summary: {
    requestLatencyMs?: number;
    renderLatencyMs?: number;
    mergeLatencyMs?: number;
    longSessionOk?: boolean;
    retainedItems?: number;
  };
  collectedAt: string;
  version: string;
};

const marks: FeedPerfMark[] = [];
const MAX_MARKS = 80;

export const markFeedPerf = (
  name: string,
  detail?: FeedPerfMark['detail']
): number => {
  const t =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  marks.push({ name, t, detail });
  if (marks.length > MAX_MARKS) marks.shift();
  return t;
};

export const measureFeedPerfSpan = (
  startName: string,
  endName: string
): number | null => {
  const start = [...marks].reverse().find((m) => m.name === startName);
  const end = [...marks].reverse().find((m) => m.name === endName);
  if (!start || !end) return null;
  return Math.max(0, end.t - start.t);
};

export const buildFeedPerfReport = (extra?: FeedPerfReport['summary']): FeedPerfReport => {
  const requestLatencyMs = measureFeedPerfSpan('feed_request_start', 'feed_request_end') ?? undefined;
  const renderLatencyMs = measureFeedPerfSpan('feed_render_start', 'feed_render_end') ?? undefined;
  const mergeLatencyMs = measureFeedPerfSpan('feed_merge_start', 'feed_merge_end') ?? undefined;
  return {
    marks: [...marks],
    summary: {
      requestLatencyMs,
      renderLatencyMs,
      mergeLatencyMs,
      ...extra
    },
    collectedAt: new Date().toISOString(),
    version: '21.0.2'
  };
};

export const clearFeedPerfMarks = () => {
  marks.length = 0;
};

export const getFeedPerfMarks = () => [...marks];

/**
 * Synthetic CPU-bound merge benchmark for CI (no browser).
 * Returns items merged per ms.
 */
export const benchmarkMergeThroughput = (
  itemCount: number,
  pageSize = 20,
  simulate?: (params: {
    total: number;
    pageSize?: number;
    maxRetained?: number;
  }) => { pages: number }
): {
  itemCount: number;
  durationMs: number;
  itemsPerMs: number;
  pages: number;
} => {
  const start =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const report = simulate
    ? simulate({ total: itemCount, pageSize, maxRetained: 140 })
    : { pages: Math.ceil(itemCount / pageSize) };
  const end =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const durationMs = Math.max(0.001, end - start);
  return {
    itemCount,
    durationMs,
    itemsPerMs: itemCount / durationMs,
    pages: report.pages
  };
};
