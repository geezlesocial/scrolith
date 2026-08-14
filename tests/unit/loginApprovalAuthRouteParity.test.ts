import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('guest and dedicated login routes share the approval controller and LoginOutcome contract', () => {
  const guest = read('src/components/sections/GuestAuthExperience.tsx');
  const login = read('src/auth/Login.tsx');
  const context = read('src/context/UserContext.tsx');
  const flow = read('src/hooks/useLoginApprovalFlow.ts');

  assert.match(guest, /useLoginApprovalFlow/);
  assert.match(guest, /onLoginApprovalRequired/);
  assert.match(guest, /status === "failed"/);
  assert.match(login, /useLoginApprovalFlow/);
  assert.match(login, /const outcome = await login\(/);
  assert.match(login, /onLoginApprovalRequired:/);
  assert.doesNotMatch(login, /AuthService\.login\(/);
  assert.match(context, /status: 'authenticated'/);
  assert.match(context, /status: 'approval_required'/);
  assert.match(context, /status: 'failed'/);
  assert.match(flow, /onApprovedRef\.current/);
});

test('dedicated login preserves Enter submission, human verification, pending UI, and cancellation', () => {
  const login = read('src/auth/Login.tsx');
  assert.match(login, /e\.preventDefault\(\)/);
  assert.match(login, /humanVerificationToken: hvToken/);
  assert.match(login, /Waiting for trusted-device approval/);
  assert.match(login, /Waiting for approval\.\.\./);
  assert.match(login, /loginApprovalFlow\.cancel/);
  assert.match(login, /onTwoFactorRequired/);
});
