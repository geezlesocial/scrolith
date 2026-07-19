/**
 * Phase 21.0.2 — offline/synthetic feed validation runner.
 * Produces evidence JSON for certification (no live credentials required).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'evidence');
mkdirSync(outDir, { recursive: true });

const started = Date.now();
const unit = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    'src/utils/__tests__/phase2010Stability.spec.ts',
    'src/utils/__tests__/phase210EnterpriseFeed.spec.ts',
    'src/utils/__tests__/phase2101FeedExperience.spec.ts',
    'src/utils/__tests__/phase2102FeedValidation.spec.ts'
  ],
  { cwd: root, encoding: 'utf8', shell: false }
);

const evidence = {
  phase: '21.0.2',
  collectedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  unitTests: {
    exitCode: unit.status,
    pass: unit.status === 0,
    stdoutTail: String(unit.stdout || '').slice(-4000),
    stderrTail: String(unit.stderr || '').slice(-2000)
  },
  longSession: {
    note: 'See phase2102FeedValidation.spec.ts for 500/1000/5000 retain-cap simulations',
    maxRetained: 140,
    targets: [500, 1000, 5000]
  },
  virtualization: {
    defaultOnAt: 12,
    package: '@tanstack/react-virtual',
    shortListFullRender: true
  },
  lifecycleMigration: {
    mobileMemberHome: 'useSurfaceFeedLifecycle (USE_SHARED_FEED_LIFECYCLE=true)',
    desktopMemberHome: 'useFeedChromeBridge + mixed stream helpers',
    community: 'useFeedChromeBridge + soft PTR',
    sharedHook: 'useContinuousFeed / useSurfaceFeedLifecycle'
  },
  android: {
    note: 'Wrapper inherits web bundle; rebuild AAB only after FE production validation',
    wrapper: 'Capacitor WebView',
    recommended: 'Phase 20.11 pipeline after FE deploy'
  }
};

const outPath = join(outDir, 'phase21_0_2_validation.json');
writeFileSync(outPath, JSON.stringify(evidence, null, 2), 'utf8');
console.log(JSON.stringify({ ok: unit.status === 0, outPath, durationMs: evidence.durationMs }, null, 2));
process.exit(unit.status === 0 ? 0 : 1);
