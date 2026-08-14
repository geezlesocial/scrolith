import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('inline login approval preserves the structured 202 response and avoids native form submission', () => {
  const authService = read('src/services/authService.ts');
  const userContext = read('src/context/UserContext.tsx');
  const guestAuth = read('src/components/sections/GuestAuthExperience.tsx');
  const loginMethod = userContext.slice(userContext.indexOf('const login = async'), userContext.indexOf('const register = async'));

  assert.match(authService, /status === 202/);
  assert.match(authService, /root\?\.attemptId/);
  assert.match(authService, /root\?\.approvalToken/);
  assert.match(authService, /normalizedLoginApproval/);
  assert.match(userContext, /status: 'approval_required'/);
  assert.match(userContext, /return \{ status: 'approval_required', approval \}/);
  assert.doesNotMatch(userContext, /return false;[\s\S]{0,120}onLoginApprovalRequired/);

  const submitStart = guestAuth.indexOf('const handleLoginSubmit');
  const submitEnd = guestAuth.indexOf('const handleSignupSubmit');
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitHandler = guestAuth.slice(submitStart, submitEnd);
  assert.match(submitHandler, /event\.preventDefault\(\)/);
  assert.match(submitHandler, /onLoginApprovalRequired/);
  assert.match(submitHandler, /ok\.status === "failed"/);
  assert.doesNotMatch(submitHandler, /window\.location\.(reload|replace|assign)/);
  assert.match(guestAuth, /<form className=\{formSpacingClass\} onSubmit=\{handleLoginSubmit\}>/);
  assert.match(guestAuth, /type="submit"/);
  assert.match(guestAuth, /loginApproval \? "Waiting for approval\.\.\."/);
  assert.match(guestAuth, /authTabWasManuallySelectedRef/);
  assert.doesNotMatch(loginMethod, /setIsLoading\(true\)/);
});

test('human verification controls cannot submit or remount the surrounding auth form', () => {
  const verification = read('src/components/human-verification/ScrolithHumanVerification.tsx');
  const guestAuth = read('src/components/sections/GuestAuthExperience.tsx');

  assert.doesNotMatch(verification, /<form/);
  assert.match(verification, /type="button"/);
  assert.match(guestAuth, /event\.preventDefault\(\)/);
  assert.match(guestAuth, /humanVerificationToken: loginHvToken/);
});

test('shared approval polling is gated by in-memory state and uses single-flight status and exchange calls', () => {
  const flow = read('src/hooks/useLoginApprovalFlow.ts');
  const guestAuth = read('src/components/sections/GuestAuthExperience.tsx');
  const login = read('src/auth/Login.tsx');

  assert.match(flow, /statusInFlightRef\.current/);
  assert.match(flow, /exchangeInFlightRef\.current/);
  assert.match(flow, /window\.setInterval\(\(\) => void poll\(\), 3000\)/);
  assert.match(flow, /DeviceSecurityService\.getApprovalStatus\(approval\.id, approval\.approvalToken\)/);
  assert.match(flow, /AuthService\.exchangeApprovedLogin\(approval\.id, approval\.approvalToken\)/);
  assert.match(flow, /window\.clearInterval\(timer\)/);
  assert.match(guestAuth, /useLoginApprovalFlow/);
  assert.match(login, /useLoginApprovalFlow/);
  assert.doesNotMatch(flow, /localStorage|sessionStorage|approvalToken.*URL/);
});
