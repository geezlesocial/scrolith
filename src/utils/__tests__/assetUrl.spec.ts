import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAssetUrl } from '../assetUrl';

test('production API content URLs remain stable in the production runtime', () => {
  const url = 'https://api.scrolith.com/api/files/content/file-123?v=1';
  assert.equal(resolveAssetUrl(url), url);
});

test('signed production API content URLs are never rebased', () => {
  const url = 'https://api.scrolith.com/api/files/content/file-123?signature=redacted';
  assert.equal(resolveAssetUrl(url), url);
});
