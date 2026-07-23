#!/usr/bin/env node
/**
 * Coordinated staged rollout for messaging enhancements candidates.
 * Promotes FE + BE together; smoke checks at each stage; never logs secrets.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'docs/evidence');
mkdirSync(outDir, { recursive: true });

const PROJECT = 'scrolith-500821';
const REGION = 'asia-southeast1';
const BE_CAND = 'scrolith-backend-00282-xup';
const BE_PROD = 'scrolith-backend-prisma-pool2';
const FE_CAND = 'scrolith-frontend-00328-rav';
const FE_PROD = 'scrolith-frontend-00313-dep';
const BE_TAG_URL = 'https://msg-enh-51716906---scrolith-backend-25ysnpjdda-as.a.run.app';
const FE_TAG_URL = 'https://msg-enh-92da8d29---scrolith-frontend-25ysnpjdda-as.a.run.app';
const STAGES = [5, 25, 50, 100];
const STAGE_WAIT_MS = Number(process.env.ROLLOUT_STAGE_WAIT_MS || 90_000);

const report = {
  startedAt: new Date().toISOString(),
  stages: [],
  monitoring: [],
  rollbackRequired: false,
  productionCertificationComplete: false
};

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }).trim();
  } catch (e) {
    const err = (e.stderr || e.stdout || e.message || '').toString().slice(0, 500);
    throw new Error(`cmd_failed: ${cmd}\n${err}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const extractToken = () => {
  if (process.env.CERT_TOKEN) return process.env.CERT_TOKEN;
  for (const p of [
    join(root, 'geezle/tests/certification/fixtures/storage-state.json'),
    join(root, 'geezle/tests/storageState.json')
  ]) {
    if (!existsSync(p)) continue;
    try {
      const st = JSON.parse(readFileSync(p, 'utf8'));
      for (const o of st.origins || []) {
        for (const item of o.localStorage || []) {
          if ((item.name === 'token' || item.name === 'accessToken') && item.value) return String(item.value);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return '';
};

const token = extractToken();

const getTraffic = (service) => {
  const raw = sh(
    `gcloud run services describe ${service} --region=${REGION} --project=${PROJECT} --format=json`
  );
  const d = JSON.parse(raw);
  return (d.status?.traffic || []).map((t) => ({
    percent: t.percent ?? 0,
    revision: t.revisionName,
    tag: t.tag || null
  }));
};

const setTraffic = (service, cand, prod, pct) => {
  const other = 100 - pct;
  if (pct >= 100) {
    sh(
      `gcloud run services update-traffic ${service} --region=${REGION} --project=${PROJECT} --to-revisions=${cand}=100`
    );
  } else if (pct <= 0) {
    sh(
      `gcloud run services update-traffic ${service} --region=${REGION} --project=${PROJECT} --to-revisions=${prod}=100`
    );
  } else {
    sh(
      `gcloud run services update-traffic ${service} --region=${REGION} --project=${PROJECT} --to-revisions=${cand}=${pct},${prod}=${other}`
    );
  }
};

const smoke = async (label) => {
  const checks = [];
  const add = (name, ok, detail = {}) => checks.push({ name, ok, ...detail });

  // BE main URL health
  try {
    const r = await fetch('https://scrolith-backend-25ysnpjdda-as.a.run.app/api/health', {
      signal: AbortSignal.timeout(20000)
    });
    add('be_main_health', r.status === 200, { status: r.status });
  } catch (e) {
    add('be_main_health', false, { error: String(e.message || e).slice(0, 120) });
  }

  // BE candidate tag health
  try {
    const r = await fetch(`${BE_TAG_URL}/api/health`, { signal: AbortSignal.timeout(20000) });
    add('be_tag_health', r.status === 200, { status: r.status });
  } catch (e) {
    add('be_tag_health', false, { error: String(e.message || e).slice(0, 120) });
  }

  // FE main
  try {
    const r = await fetch('https://scrolith-frontend-25ysnpjdda-as.a.run.app/', {
      signal: AbortSignal.timeout(20000)
    });
    add('fe_main', r.status === 200, { status: r.status });
  } catch (e) {
    add('fe_main', false, { error: String(e.message || e).slice(0, 120) });
  }

  // FE tag
  try {
    const r = await fetch(FE_TAG_URL + '/', { signal: AbortSignal.timeout(20000) });
    add('fe_tag', r.status === 200, { status: r.status });
  } catch (e) {
    add('fe_tag', false, { error: String(e.message || e).slice(0, 120) });
  }

  // Authenticated smoke against candidate API (tag)
  if (token) {
    try {
      const r = await fetch(`${BE_TAG_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          Origin: FE_TAG_URL
        },
        signal: AbortSignal.timeout(20000)
      });
      add('auth_me_tag', r.status === 200, {
        status: r.status,
        allowOrigin: r.headers.get('access-control-allow-origin')
      });
      const conv = await fetch(`${BE_TAG_URL}/api/messages/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          Origin: FE_TAG_URL
        },
        signal: AbortSignal.timeout(25000)
      });
      add('messages_list_tag', conv.status === 200, { status: conv.status });
    } catch (e) {
      add('auth_smoke_tag', false, { error: String(e.message || e).slice(0, 120) });
    }
  } else {
    add('auth_smoke_tag', false, { error: 'no_token' });
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ label, pass: failed.length === 0, checks }, null, 0));
  return { ok: failed.length === 0, checks };
};

const rollback = () => {
  console.log(JSON.stringify({ action: 'ROLLBACK', to: { be: BE_PROD, fe: FE_PROD } }));
  setTraffic('scrolith-backend', BE_CAND, BE_PROD, 0);
  setTraffic('scrolith-frontend', FE_CAND, FE_PROD, 0);
  report.rollbackRequired = true;
};

try {
  for (const pct of STAGES) {
    console.log(JSON.stringify({ stage: pct, action: 'promote' }));
    setTraffic('scrolith-backend', BE_CAND, BE_PROD, pct);
    setTraffic('scrolith-frontend', FE_CAND, FE_PROD, pct);
    await sleep(5000);
    const beT = getTraffic('scrolith-backend');
    const feT = getTraffic('scrolith-frontend');
    const smokeResult = await smoke(`stage_${pct}`);
    const stage = {
      percent: pct,
      at: new Date().toISOString(),
      backendTraffic: beT,
      frontendTraffic: feT,
      smoke: smokeResult
    };
    report.stages.push(stage);
    writeFileSync(join(outDir, 'msg_enh_rollout_progress.json'), JSON.stringify(report, null, 2));

    if (!smokeResult.ok) {
      rollback();
      report.endedAt = new Date().toISOString();
      writeFileSync(join(outDir, 'msg_enh_rollout_final.json'), JSON.stringify(report, null, 2));
      process.exit(1);
    }

    if (pct < 100) {
      console.log(JSON.stringify({ stage: pct, action: 'stabilize', waitMs: STAGE_WAIT_MS }));
      await sleep(STAGE_WAIT_MS);
      const recheck = await smoke(`stage_${pct}_recheck`);
      report.stages[report.stages.length - 1].recheck = recheck;
      if (!recheck.ok) {
        rollback();
        report.endedAt = new Date().toISOString();
        writeFileSync(join(outDir, 'msg_enh_rollout_final.json'), JSON.stringify(report, null, 2));
        process.exit(1);
      }
    }
  }

  // 60 minute production monitoring (or shorter if env override for emergency)
  const monitorMs = Number(process.env.ROLLOUT_MONITOR_MS || 60 * 60 * 1000);
  const intervalMs = Number(process.env.ROLLOUT_MONITOR_INTERVAL_MS || 5 * 60 * 1000);
  const end = Date.now() + monitorMs;
  console.log(JSON.stringify({ action: 'monitor_start', monitorMs, intervalMs }));
  while (Date.now() < end) {
    const sample = await smoke(`monitor_${new Date().toISOString()}`);
    report.monitoring.push({ at: new Date().toISOString(), ...sample });
    writeFileSync(join(outDir, 'msg_enh_rollout_progress.json'), JSON.stringify(report, null, 2));
    if (!sample.ok) {
      rollback();
      report.endedAt = new Date().toISOString();
      writeFileSync(join(outDir, 'msg_enh_rollout_final.json'), JSON.stringify(report, null, 2));
      process.exit(1);
    }
    const remaining = end - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }

  report.productionCertificationComplete = true;
  report.rollbackRequired = false;
  report.endedAt = new Date().toISOString();
  report.finalTraffic = {
    backend: getTraffic('scrolith-backend'),
    frontend: getTraffic('scrolith-frontend')
  };
  writeFileSync(join(outDir, 'msg_enh_rollout_final.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ done: true, productionCertificationComplete: true }, null, 2));
  process.exit(0);
} catch (e) {
  report.error = String(e.message || e).slice(0, 800);
  try {
    rollback();
  } catch (rb) {
    report.rollbackError = String(rb.message || rb).slice(0, 400);
  }
  report.endedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'msg_enh_rollout_final.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ fatal: true, error: report.error }));
  process.exit(1);
}
