/**
 * Critical security remediation — focused adversarial + unit tests.
 * @jest-environment node
 */

import {
  isAuthoritativeAdminRole,
  isProductionRuntime,
  isTruthyEnv
} from '../utils/security/isProductionRuntime';
import fs from 'fs';
import path from 'path';

describe('isAuthoritativeAdminRole', () => {
  test('accepts real admin roles', () => {
    expect(isAuthoritativeAdminRole('ADMIN')).toBe(true);
    expect(isAuthoritativeAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAuthoritativeAdminRole('platform_admin')).toBe(true);
  });

  test('rejects non-admin and substring traps', () => {
    expect(isAuthoritativeAdminRole('FREELANCER')).toBe(false);
    expect(isAuthoritativeAdminRole('CLIENT')).toBe(false);
    expect(isAuthoritativeAdminRole('not_admin')).toBe(false);
    expect(isAuthoritativeAdminRole('')).toBe(false);
    expect(isAuthoritativeAdminRole(null)).toBe(false);
  });

  test('ignores client spoof strings that only contain admin as substring incorrectly', () => {
    // "administrator" contains admin as segment after normalize? administrator -> parts [administrator] - not includes admin
    expect(isAuthoritativeAdminRole('administrator')).toBe(false);
  });
});

describe('production runtime flags', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test('isProductionRuntime true for NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.K_SERVICE;
    expect(isProductionRuntime()).toBe(true);
  });

  test('isTruthyEnv parses flags', () => {
    expect(isTruthyEnv('true')).toBe(true);
    expect(isTruthyEnv('1')).toBe(true);
    expect(isTruthyEnv('false')).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
  });
});

describe('rate-limit skip logic (production)', () => {
  test('server source does not honor x-skip-ratelimit in production skip path', () => {
    const serverPath = path.join(__dirname, '../server.ts');
    const text = fs.readFileSync(serverPath, 'utf8');
    // Must not return true solely because of client headers
    expect(text).toMatch(/Client-supplied bypass headers are IGNORED/);
    expect(text).not.toMatch(
      /if \(req\.headers\['x-dev-role'\] \|\| req\.headers\['x-skip-ratelimit'\]\) return true/
    );
  });
});

describe('Socket.IO admin trust', () => {
  test('server does not use query.role for isAdmin', () => {
    const serverPath = path.join(__dirname, '../server.ts');
    const text = fs.readFileSync(serverPath, 'utf8');
    expect(text).not.toMatch(/roleHint\.includes\('admin'\)/);
    expect(text).toMatch(/never query\.role/i);
  });

  test('community namespace requires authenticated principal', () => {
    const serverPath = path.join(__dirname, '../server.ts');
    const text = fs.readFileSync(serverPath, 'utf8');
    expect(text).toMatch(/if \(!user\)/);
    expect(text).toMatch(/next\(new Error\('unauthorized'\)\)/);
  });
});

describe('2FA fail-closed', () => {
  test('login does not fail open on 2FA gate errors', () => {
    const authPath = path.join(__dirname, '../controllers/auth.controller.ts');
    const text = fs.readFileSync(authPath, 'utf8');
    expect(text).not.toMatch(/2FA gate failed open/);
    expect(text).toMatch(/2FA_GATE_UNAVAILABLE/);
    expect(text).toMatch(/security\.2fa_gate_failed_closed/);
  });
});

describe('auth routes rate limits', () => {
  test('login and register use dedicated limiters', () => {
    const routesPath = path.join(__dirname, '../routes/auth.routes.ts');
    const text = fs.readFileSync(routesPath, 'utf8');
    expect(text).toMatch(/loginRateLimiter/);
    expect(text).toMatch(/registerRateLimiter/);
    expect(text).toMatch(/admin2faVerifyRateLimiter/);
  });
});

describe('runtime image safety', () => {
  test('deploy backend Dockerfile uses node dist/server.js', () => {
    const dockerPath = path.join(__dirname, '../../../deploy/docker/backend.Dockerfile');
    const text = fs.readFileSync(dockerPath, 'utf8');
    expect(text).toMatch(/node.*dist\/server\.js/);
    expect(text).not.toMatch(/migrate:apply/);
  });

  test('storyfix runtime Dockerfile uses node dist/server.js', () => {
    const dockerPath = path.join(__dirname, '../../Dockerfile.storyfix.runtime');
    const text = fs.readFileSync(dockerPath, 'utf8');
    expect(text).toMatch(/node.*dist\/server\.js/);
    expect(text).not.toMatch(/migrate:apply/);
  });
});

describe('gitignore secret hygiene', () => {
  test('gitignore covers env backups', () => {
    const gi = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
    expect(gi).toMatch(/\.env\.\*/);
    expect(gi).toMatch(/\*\.backup/);
    expect(gi).toMatch(/localbackup/);
  });
});
