import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveConfiguredApiBase } from '../../src/utils/apiBase';
import { renderStagingNginxConfig, validateStagingApiOrigin } from '../../scripts/stagingFrontendConfig.mjs';

const sampleOrigin = 'https://candidate--revision.test.azurecontainerapps.io';
const template = readFileSync(resolve(process.cwd(), 'nginx.staging.conf.template'), 'utf8');

test('staging backend-origin configuration receives one /api suffix', () => {
  assert.equal(resolveConfiguredApiBase({ VITE_BACKEND_URL: sampleOrigin }), sampleOrigin + '/api');
});

test('configured API URLs preserve one /api suffix and normalize trailing slashes', () => {
  assert.equal(resolveConfiguredApiBase({ VITE_API_URL: sampleOrigin + '/api/' }), sampleOrigin + '/api');
  assert.equal(resolveConfiguredApiBase({ VITE_API_BASE_URL: sampleOrigin + '/' }), sampleOrigin + '/api');
});

test('VITE_API_URL remains the preferred API-base setting', () => {
  assert.equal(
    resolveConfiguredApiBase({ VITE_API_URL: sampleOrigin + '/api', VITE_BACKEND_URL: 'https://unused.invalid' }),
    sampleOrigin + '/api'
  );
});

test('staging origin validation rejects non-HTTPS, app-level, and path-bearing URLs', () => {
  assert.throws(() => validateStagingApiOrigin('http://candidate--revision.test.azurecontainerapps.io'));
  assert.throws(() => validateStagingApiOrigin('https://candidate.test.azurecontainerapps.io'));
  assert.throws(() => validateStagingApiOrigin(sampleOrigin + '/api'));
});

test('staging CSP renders only the exact revision origin in connect-src', () => {
  const rendered = renderStagingNginxConfig(template, sampleOrigin);
  const directives = [...rendered.matchAll(/connect-src\s+([^;]+);/g)].map((match) => match[1].trim());

  assert.deepEqual(directives, ["'self' " + sampleOrigin]);
  assert.equal(rendered.includes('__SCROLITH_STAGING_API_ORIGIN__'), false);
  assert.equal(directives[0].includes('*'), false);
  assert.equal(directives[0].includes('wss:'), false);
});
