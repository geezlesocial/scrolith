#!/usr/bin/env node
/**
 * Phase 21.1.6 — Android wrapper certification helper (preparation only).
 *
 * Does not require a physical device by default. When ADB device is present
 * and SCROLITH_REQUIRE_ADB=1, prints device info and opens the cert URL intent.
 *
 * Full WebView automation still uses the Playwright mobile projects + manual
 * checklist in docs/certification/android-wrapper-cert.md.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../playwright-results/phase2116');
mkdirSync(outDir, { recursive: true });

const certUrl =
  process.env.CERT_BASE_URL ||
  process.env.P2115_BASE_URL ||
  'https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app';

const report = {
  phase: '21.1.6-android-prep',
  generatedAt: new Date().toISOString(),
  certUrl,
  adb: null,
  device: null,
  notes: []
};

const adb = spawnSync('adb', ['devices', '-l'], {
  encoding: 'utf8',
  shell: process.platform === 'win32'
});

report.adb = {
  status: adb.status,
  stdout: (adb.stdout || '').trim(),
  stderr: (adb.stderr || '').trim()
};

const devices = (adb.stdout || '')
  .split('\n')
  .filter((line) => /\tdevice\b/.test(line))
  .map((line) => line.split(/\s+/)[0]);

report.device = devices[0] || null;

if (!report.device) {
  report.notes.push('No ADB device — physical Android cert remains manual / deferred');
  if (process.env.SCROLITH_REQUIRE_ADB === '1') {
    writeFileSync(join(outDir, 'android-prep.json'), JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
} else {
  report.notes.push(`Device detected: ${report.device}`);
  // Optional: open browser intent for operator
  if (process.env.CERT_OPEN_ANDROID === '1') {
    spawnSync(
      'adb',
      ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', certUrl],
      { encoding: 'utf8', shell: process.platform === 'win32' }
    );
    report.notes.push(`Opened VIEW intent for ${certUrl}`);
  }
}

report.checklist = [
  'WebView text scaling does not clip post title/body',
  'Safe-area insets respected at top/bottom',
  'Touch targets: survey 42px+, actions ~48px',
  'AI Coach CTA tappable, no overflow',
  'Media portrait/landscape/square load without jump',
  'Feed scroll smooth; 60s identity dwell',
  'Dark mode readable if enabled'
];

writeFileSync(join(outDir, 'android-prep.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
