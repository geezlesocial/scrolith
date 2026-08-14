import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('homepage login approval keeps the token in memory and completes the existing signed exchange flow', () => {
  const context = read('src/context/UserContext.tsx');
  const guestAuth = read('src/components/sections/GuestAuthExperience.tsx');
  const approvalFlow = read('src/hooks/useLoginApprovalFlow.ts');
  const authService = read('src/services/authService.ts');
  const deviceSecurity = read('src/services/deviceSecurity.ts');

  assert.match(context, /onLoginApprovalRequired/);
  assert.match(guestAuth, /Waiting for trusted-device approval/);
  assert.match(guestAuth, /useLoginApprovalFlow/);
  assert.match(approvalFlow, /DeviceSecurityService\.getApprovalStatus/);
  assert.match(approvalFlow, /AuthService\.exchangeApprovedLogin/);
  assert.match(authService, /requiresLoginApproval/);
  assert.match(authService, /device: await getDeviceMetadata\(\)/);
  assert.match(deviceSecurity, /auth\/login\/approval\/exchange/);
  assert.doesNotMatch(guestAuth, /localStorage\.setItem\([^\n]*approvalToken/);
  assert.doesNotMatch(guestAuth, /sessionStorage\.setItem\([^\n]*approvalToken/);
});

test('trusted sessions receive approval controls through authenticated realtime forwarding', () => {
  const socket = read('src/context/SocketContext.tsx');
  const app = read('src/App.tsx');
  const overlay = read('src/components/security/LoginApprovalOverlay.tsx');

  assert.match(socket, /security\.login_approval\.requested/);
  assert.match(socket, /security:login_approval_required/);
  assert.match(app, /AuthenticatedLoginApprovalOverlay/);
  assert.match(app, /LazyLoginApprovalOverlay = lazy/);
  assert.match(overlay, /DeviceSecurityService\.approveLogin/);
  assert.match(overlay, /DeviceSecurityService\.rejectLogin/);
  assert.match(overlay, /authenticateBiometrics/);
});

test('guest marketplace preview bypasses automatic 429 retries and reports a cooldown without blocking the page', () => {
  const service = read('src/services/marketplace.ts');
  const sections = read('src/components/sections/GuestSections.tsx');

  assert.match(service, /skipRetry/);
  assert.match(service, /__skipRetry/);
  assert.match(sections, /sort: 'recommended' \}, \{ skipRetry: true \}/);
  assert.match(sections, /sort: 'popular' \}, \{ skipRetry: true \}/);
  assert.match(sections, /retryAfterSeconds/);
  assert.match(sections, /Marketplace preview is temporarily busy/);
});
