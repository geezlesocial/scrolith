import fs from 'node:fs';
import path from 'node:path';

describe('G2.6I development authentication bypass boundary', () => {
  test('allows the explicit bypass only in development or test runtimes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../middleware/auth.middleware.ts'),
      'utf8'
    );

    expect(source).toContain("if (!['development', 'test'].includes(nodeEnv) || process.env.K_SERVICE)");
  });

  test('does not permit staging-like NODE_ENV values to activate the bypass', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../middleware/auth.middleware.ts'),
      'utf8'
    );
    expect(source).not.toContain("nodeEnv === 'production' || process.env.K_SERVICE");
  });
});
