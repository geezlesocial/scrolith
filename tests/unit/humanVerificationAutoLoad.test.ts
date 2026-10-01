import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  deliverHumanVerificationToken,
  runHumanVerificationAutoLoad
} from '../../src/components/human-verification/autoLoadGate';

const componentSource = readFileSync(
  fileURLToPath(new URL('../../src/components/human-verification/ScrolithHumanVerification.tsx', import.meta.url)),
  'utf8'
);

test('ordinary rerenders with fresh inline callbacks do not repeat automatic challenge creation', () => {
  const gate = { current: null as string | null };
  let createCalls = 0;

  const render = (onError: (message: string) => void) => {
    // Each render supplies a newly-created loader that closes over a fresh inline callback.
    runHumanVerificationAutoLoad(
      gate,
      {
        autoLoad: true,
        disabled: false,
        endpoint: 'signup'
      },
      () => {
        onError('challenge error');
        createCalls += 1;
      }
    );
  };

  render(() => undefined);
  render(() => undefined);

  assert.equal(createCalls, 1);
  assert.match(componentSource, /\[disabled, endpoint, onError, onRequiredChange, onVerified\]/);
  assert.match(componentSource, /loadChallengeRef\.current = loadChallenge/);
  assert.match(componentSource, /runHumanVerificationAutoLoad\(/);
  assert.match(componentSource, /\[autoLoad, disabled, endpoint\]/);
});

test('explicit refresh still calls the challenge loader directly', () => {
  let createCalls = 1;
  const loadChallenge = () => {
    createCalls += 1;
  };
  const refresh = () => void loadChallenge();

  refresh();

  assert.equal(createCalls, 2);
  assert.match(componentSource, /onClick=\{\(\) => void loadChallenge\(\)\}/);
  assert.match(componentSource, /aria-label="Refresh challenge"/);
});

test('verification expiry and attempt-limit retries still load a fresh challenge', () => {
  assert.match(componentSource, /result\.code === 'HV_EXPIRED' \|\| result\.code === 'HV_MAX_ATTEMPTS' \|\| result\.code === 'HV_ALREADY_USED'/);
  assert.match(componentSource, /await loadChallenge\(\)/);
});

test('verification token is delivered to the existing callback on success only', () => {
  const delivered: Array<string | null> = [];
  const onVerified = (token: string | null) => delivered.push(token);

  assert.equal(
    deliverHumanVerificationToken({ success: true, verificationToken: 'verified-token' }, onVerified),
    true
  );
  assert.equal(deliverHumanVerificationToken({ success: false, verificationToken: 'ignored-token' }, onVerified), false);
  assert.deepEqual(delivered, ['verified-token']);
  assert.match(componentSource, /deliverHumanVerificationToken\(result, onVerified\)/);
});

test('automatic loading still responds to endpoint and enabled-state changes', () => {
  const gate = { current: null as string | null };
  let createCalls = 0;
  const load = () => { createCalls += 1; };

  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: true, disabled: false, endpoint: 'signup' }, load), true);
  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: true, disabled: false, endpoint: 'signup' }, load), false);
  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: true, disabled: true, endpoint: 'signup' }, load), false);
  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: true, disabled: false, endpoint: 'signup' }, load), true);
  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: true, disabled: false, endpoint: 'login' }, load), true);
  assert.equal(runHumanVerificationAutoLoad(gate, { autoLoad: false, disabled: false, endpoint: 'signup' }, load), false);
  assert.equal(createCalls, 3);
});
