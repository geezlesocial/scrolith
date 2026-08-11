import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

const root = join(__dirname, '..', '..');
const readSource = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('homepage inline login approval regression contract', () => {
  const userContextSource = readSource('context/UserContext.tsx');
  const guestAuthSource = readSource('components/sections/GuestAuthExperience.tsx');
  const deviceSecuritySource = readSource('services/deviceSecurity.ts');

  const userContextLoginBody = userContextSource.slice(
    userContextSource.indexOf('  const login = async'),
    userContextSource.indexOf('  const register = async')
  );

  const approvalStatusBody = deviceSecuritySource.slice(
    deviceSecuritySource.indexOf('  async getApprovalStatus'),
    deviceSecuritySource.indexOf('  async exchangeApprovedLogin')
  );

  test('interactive login does not toggle global auth bootstrap loading', () => {
    expect(userContextLoginBody).toContain('AuthService.login');
    expect(userContextLoginBody).toContain('onLoginApprovalRequired');
    expect(userContextLoginBody).not.toContain('setIsLoading(');
  });

  test('inline approval token remains memory-only and is never persisted', () => {
    expect(guestAuthSource).toContain('const [loginApproval, setLoginApproval]');
    expect(guestAuthSource).toContain('approvalToken');
    expect(guestAuthSource).not.toContain('localStorage.setItem');
    expect(guestAuthSource).not.toContain('sessionStorage.setItem');
    expect(guestAuthSource).not.toContain('URLSearchParams');
  });

  test('inline approval wait flow polls, exchanges once, and cleans up on unmount', () => {
    expect(guestAuthSource).toContain('DeviceSecurityService.getApprovalStatus');
    expect(guestAuthSource).toContain('AuthService.exchangeApprovedLogin');
    expect(guestAuthSource).toContain('approvalStatusInFlightRef.current');
    expect(guestAuthSource).toContain('approvalExchangeInFlightRef.current');
    expect(guestAuthSource).toContain('window.setInterval');
    expect(guestAuthSource).toContain('window.clearInterval(timer)');
  });

  test('approval status polling never sends approvalToken in the request URL', () => {
    expect(approvalStatusBody).toContain('api.post');
    expect(approvalStatusBody).toContain('{');
    expect(approvalStatusBody).toContain('approvalToken');
    expect(approvalStatusBody).not.toContain('api.get');
    expect(approvalStatusBody).not.toContain('params:');
    expect(approvalStatusBody).not.toContain('URLSearchParams');
  });

  test('inline approval UI handles rejected, expired, cancel, and duplicate submit states', () => {
    expect(guestAuthSource).toContain('if (loginApproval) return;');
    expect(guestAuthSource).toContain('This login was rejected from your trusted session.');
    expect(guestAuthSource).toContain('This login approval expired. Please sign in again.');
    expect(guestAuthSource).toContain('Cancel approval request');
    expect(guestAuthSource).toContain('Waiting for trusted-device approval');
    expect(guestAuthSource).toContain('Waiting for approval...');
  });
});

describe('optional boot loader promise ownership', () => {
  test('currency, preloader, and app distribution boot effects terminate rejected promises', () => {
    expect(readSource('context/CurrencyContext.tsx')).toContain('refreshCurrencies().catch');
    expect(readSource('context/PreloaderContext.tsx')).toContain('run().catch');
    expect(readSource('context/PreloaderContext.tsx')).toContain('refreshConfig().catch');
    expect(readSource('components/AppDistributionPrompt.tsx')).toContain('load().catch');
  });
});
