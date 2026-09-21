import fs from 'node:fs';
import path from 'node:path';

describe('G2.6I authorization boundaries', () => {
  test('system email test requires the existing enterprise settings permission', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../routes/admin/index.ts'),
      'utf8'
    );

    expect(source).toContain(
      "router.post('/system/email/test', requirePermission('settings.enterprise_change'), testEmailSettings);"
    );
  });

  test('the protected email-test route does not expose a client-controlled authorization bypass', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../routes/admin/index.ts'),
      'utf8'
    );
    const route = source.match(/router\.post\('\/system\/email\/test',[^\n]+/u)?.[0] || '';

    expect(route).toContain('requirePermission');
    expect(route).toContain('settings.enterprise_change');
    expect(route).not.toMatch(/req\.(body|query|params).*?(admin|role|permission|bypass)/iu);
  });
});
