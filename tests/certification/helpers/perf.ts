import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE_DIR = join(here, '../baselines');

export type PerfBaseline = {
  surface: string;
  viewport: string;
  collectedAt: string;
  baseURL: string;
  fcp: number | null;
  lcp: number | null;
  cls: number;
  inp: number | null;
  ttfb: number | null;
  overflowX: number;
  postCardCount: number;
};

export async function collectWebVitals(page: Page, meta: { surface: string; viewport: string; baseURL: string }) {
  // Allow paints to settle
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => {
    let cls = 0;
    try {
      for (const e of performance.getEntriesByType('layout-shift') as any[]) {
        if (!e.hadRecentInput) cls += e.value || 0;
      }
    } catch {
      /* ignore */
    }
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const ttfb = nav ? nav.responseStart : null;
    // INP is not always exposed; leave null when unavailable
    let inp: number | null = null;
    try {
      const anyPerf = performance as any;
      if (typeof anyPerf.getEntriesByType === 'function') {
        const events = performance.getEntriesByType('event') as any[];
        if (events?.length) {
          inp = Math.max(...events.map((e) => e.duration || 0));
        }
      }
    } catch {
      inp = null;
    }
    const overflowX =
      Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - window.innerWidth;
    const postCardCount = document.querySelectorAll(
      '[data-testid="enterprise-post-card"], [data-post-card-design="21.1.5"]'
    ).length;
    return { fcp, lcp, cls, inp, ttfb, overflowX, postCardCount };
  });

  const baseline: PerfBaseline = {
    surface: meta.surface,
    viewport: meta.viewport,
    collectedAt: new Date().toISOString(),
    baseURL: meta.baseURL,
    fcp: metrics.fcp,
    lcp: metrics.lcp,
    cls: metrics.cls,
    inp: metrics.inp,
    ttfb: metrics.ttfb,
    overflowX: metrics.overflowX,
    postCardCount: metrics.postCardCount
  };
  return baseline;
}

export function writeBaseline(baseline: PerfBaseline, fileName?: string) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  const name =
    fileName ||
    `${baseline.surface}-${baseline.viewport}-${baseline.collectedAt.slice(0, 10)}.json`.replace(/[^\w.-]+/g, '_');
  const path = join(BASELINE_DIR, name);
  writeFileSync(path, JSON.stringify(baseline, null, 2));
  // Also write "latest" pointer for the surface/viewport pair
  const latest = join(BASELINE_DIR, `${baseline.surface}-${baseline.viewport}-latest.json`);
  writeFileSync(latest, JSON.stringify(baseline, null, 2));
  return path;
}

export function readLatestBaseline(surface: string, viewport: string): PerfBaseline | null {
  const path = join(BASELINE_DIR, `${surface}-${viewport}-latest.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PerfBaseline;
  } catch {
    return null;
  }
}

/** Soft regression check — fail only on severe CLS regressions */
export function compareCls(current: PerfBaseline, previous: PerfBaseline | null, maxCls = 0.25) {
  if (current.cls > maxCls) {
    return { ok: false, reason: `CLS ${current.cls.toFixed(3)} exceeds ${maxCls}` };
  }
  if (previous && current.cls > previous.cls + 0.15) {
    return {
      ok: false,
      reason: `CLS regressed ${previous.cls.toFixed(3)} -> ${current.cls.toFixed(3)}`
    };
  }
  return { ok: true as const };
}
