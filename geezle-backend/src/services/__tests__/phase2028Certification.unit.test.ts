/**
 * Phase 20.2.8 certification contracts — source-level guarantees.
 * Avoids full Express bootstrap; locks additive observability + report shape.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

describe('Phase 20.2.8 enterprise certification contracts', () => {
  test('reportPost returns queued reviewState and reportId', () => {
    const source = fs.readFileSync(
      path.join(root, 'controllers/posts.options.controller.ts'),
      'utf8'
    );
    expect(source).toMatch(/reportPost/);
    expect(source).toMatch(/reviewState:\s*'queued'/);
    expect(source).toMatch(/reportId:\s*report\.id/);
    expect(source).toMatch(/moderation team will review/i);
  });

  test('posts.options 500 responses do not leak error.message by default', () => {
    const source = fs.readFileSync(
      path.join(root, 'controllers/posts.options.controller.ts'),
      'utf8'
    );
    const leakLines = source
      .split(/\r?\n/)
      .filter((line) => line.includes('fail(res, 500') && line.includes('error?.message'));
    expect(leakLines).toEqual([]);
  });

  test('server exposes readyz and request correlation middleware', () => {
    const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    expect(server).toMatch(/\/api\/readyz/);
    expect(server).toMatch(/\/api\/health\/ready/);
    expect(server).toMatch(/x-request-id/);
    expect(server).toMatch(/randomUUID/);
  });

  test('logger emits structured JSON payloads', () => {
    const logger = fs.readFileSync(path.join(root, 'utils/logger.ts'), 'utf8');
    expect(logger).toMatch(/JSON\.stringify/);
    expect(logger).toMatch(/severity/);
  });
});
