#!/usr/bin/env node
/**
 * Phase 22.2A — assemble release-gate-summary.json from cert artifacts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase222');
mkdirSync(outDir, { recursive: true });

const readJson = (p, fallback = null) => {
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

const api = readJson(join(outDir, 'api-cert.json'), {});
const units = readJson(join(outDir, 'unit-results.json'), {});
const e2e = readJson(join(outDir, 'e2e-results.json'), {});
const deploy = readJson(join(outDir, 'deploy-meta.json'), {});
const phase21 = readJson(join(outDir, 'phase21-regression.json'), units.phase21 || {});
const phase221 = readJson(join(outDir, 'phase221-regression.json'), units.phase221 || {});

const pass = (v) => v === true || v === 'PASS' || v === 'pass';

const groupCrud = api.groupCrud || 'FAIL';
const inviteFlow = api.inviteFlow || 'FAIL';
const roleEnforcement = api.roleEnforcement || 'FAIL';
const mentionResolution = api.mentionResolution || 'FAIL';
const notificationPolicy =
  pass(units.notificationPolicy) && pass(api.notificationPolicy)
    ? 'PASS'
    : pass(api.notificationPolicy) && pass(units.groupPolicy)
      ? 'PASS'
      : units.notificationPolicy || api.notificationPolicy || 'FAIL';
const jumpToMessage = api.jumpToMessage || 'FAIL';
const dmCompat = api.dmCompat || 'FAIL';
const phase21Reg =
  phase21.overall ||
  (phase21.passed != null && phase21.failed === 0 ? 'PASS' : null) ||
  units.phase21 ||
  'UNKNOWN';
const phase221Reg =
  phase221.overall ||
  (phase221.passed != null && phase221.failed === 0 ? 'PASS' : null) ||
  units.phase221 ||
  'UNKNOWN';

const e2eOk = e2e.overall === 'PASS' || e2e.passed === e2e.total;

const requiredPass = [
  groupCrud,
  inviteFlow,
  roleEnforcement,
  mentionResolution,
  notificationPolicy,
  jumpToMessage,
  dmCompat,
  phase21Reg,
  phase221Reg
].every((x) => pass(x));

const apiOverall = api.overall === 'PASS';
const phase222Certified = requiredPass && apiOverall;
const promoteRecommended =
  phase222Certified &&
  (e2e.overall == null || e2eOk) &&
  Boolean(deploy.backendRevision) &&
  Boolean(deploy.frontendRevision);

const gate = {
  phase: '22.2A',
  generatedAt: new Date().toISOString(),
  overall: phase222Certified ? 'PASS' : 'FAIL',
  phase222Certified,
  promoteRecommended,
  matrix: {
    groupCrud,
    inviteFlow,
    roleEnforcement,
    mentionResolution,
    notificationPolicy,
    jumpToMessage,
    dmCompat,
    phase21Regression: phase21Reg,
    phase221Regression: phase221Reg,
    apiOverall: api.overall || 'FAIL',
    e2e: e2e.overall || (e2eOk ? 'PASS' : e2e.overall || 'SKIP')
  },
  deploy: {
    backendImage: deploy.backendImage || 'scrolith-backend:p222',
    backendRevision: deploy.backendRevision || null,
    backendTag: deploy.backendTag || 'p222',
    frontendImage: deploy.frontendImage || 'scrolith-frontend:p222',
    frontendRevision: deploy.frontendRevision || null,
    frontendTag: deploy.frontendTag || 'p222',
    migration: deploy.migration || '20260720140000_phase222_group_messaging',
    trafficAction: promoteRecommended
      ? `PROMOTE_BE_${deploy.backendRevision || 'p222'}_FE_${deploy.frontendRevision || 'p222'}_TO_100`
      : 'HOLD'
  },
  artifacts: api.artifacts || {},
  apiFailed: api.failed || []
};

writeFileSync(join(outDir, 'release-gate-summary.json'), JSON.stringify(gate, null, 2));
console.log(JSON.stringify(gate, null, 2));
process.exit(phase222Certified ? 0 : 1);
