#!/usr/bin/env node
/**
 * Phase 1 frontend performance — fail CI when production bundles exceed budgets.
 * Run after `npm run build` against dist/assets.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const assetsDir = join(root, 'dist', 'assets');

/** Soft+hard budgets (uncompressed bytes as Vite emits). */
const BUDGETS = {
  /** Main entry chunk */
  indexJsMaxKb: 650,
  /** CSS entry */
  indexCssMaxKb: 320,
  /** Single non-maps chunk soft cap */
  anyAppChunkMaxKb: 320,
  /** Maps is maplibre — track separately */
  mapsJsMaxKb: 1100,
  /** Total JS under dist/assets */
  totalJsMaxKb: 8200,
  /** Total CSS */
  totalCssMaxKb: 400
};

const report = {
  generatedAt: new Date().toISOString(),
  budgets: BUDGETS,
  violations: [],
  files: []
};

const fail = (msg) => {
  report.violations.push(msg);
};

try {
  const files = readdirSync(assetsDir);
  let totalJs = 0;
  let totalCss = 0;
  for (const name of files) {
    const full = join(assetsDir, name);
    const size = statSync(full).size;
    const kb = size / 1024;
    report.files.push({ name, kb: Math.round(kb * 10) / 10 });
    if (name.endsWith('.js')) totalJs += size;
    if (name.endsWith('.css')) totalCss += size;

    if (/^index-.*\.js$/.test(name) && kb > BUDGETS.indexJsMaxKb) {
      fail(`index JS ${name} is ${kb.toFixed(1)} KB > ${BUDGETS.indexJsMaxKb} KB`);
    }
    if (/^index-.*\.css$/.test(name) && kb > BUDGETS.indexCssMaxKb) {
      fail(`index CSS ${name} is ${kb.toFixed(1)} KB > ${BUDGETS.indexCssMaxKb} KB`);
    }
    if (/^maps-.*\.js$/.test(name) && kb > BUDGETS.mapsJsMaxKb) {
      fail(`maps JS ${name} is ${kb.toFixed(1)} KB > ${BUDGETS.mapsJsMaxKb} KB`);
    }
    if (
      name.endsWith('.js') &&
      !/^maps-/.test(name) &&
      !/^index-/.test(name) &&
      !/^react-core-/.test(name) &&
      kb > BUDGETS.anyAppChunkMaxKb
    ) {
      // Soft for known large routes that are already lazy-loaded
      if (/^(MemberHomeSection|Messages|HomepageSettings|SystemSettings)-/.test(name)) {
        if (kb > 400) {
          fail(`large lazy route ${name} is ${kb.toFixed(1)} KB > 400 KB soft-hard cap`);
        }
      } else if (kb > BUDGETS.anyAppChunkMaxKb) {
        // Warning only for other chunks over soft cap — still report
        report.violations.push(
          `WARN chunk ${name} is ${kb.toFixed(1)} KB > soft ${BUDGETS.anyAppChunkMaxKb} KB`
        );
      }
    }
  }

  const totalJsKb = totalJs / 1024;
  const totalCssKb = totalCss / 1024;
  report.totalJsKb = Math.round(totalJsKb * 10) / 10;
  report.totalCssKb = Math.round(totalCssKb * 10) / 10;

  if (totalJsKb > BUDGETS.totalJsMaxKb) {
    fail(`total JS ${totalJsKb.toFixed(1)} KB > ${BUDGETS.totalJsMaxKb} KB`);
  }
  if (totalCssKb > BUDGETS.totalCssMaxKb) {
    fail(`total CSS ${totalCssKb.toFixed(1)} KB > ${BUDGETS.totalCssMaxKb} KB`);
  }

  report.files.sort((a, b) => b.kb - a.kb);
  report.pass = report.violations.filter((v) => !String(v).startsWith('WARN')).length === 0;

  const outDir = join(root, 'docs', 'evidence');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'perf_phase1_bundle_budget.json'), JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        totalJsKb: report.totalJsKb,
        totalCssKb: report.totalCssKb,
        violations: report.violations,
        top5: report.files.slice(0, 5)
      },
      null,
      2
    )
  );
  process.exit(report.pass ? 0 : 1);
} catch (e) {
  console.error(JSON.stringify({ pass: false, error: String(e?.message || e) }));
  process.exit(1);
}
