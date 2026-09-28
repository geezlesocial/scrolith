import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveConfiguredApiBase } from '../../src/utils/apiBase';
import { renderStagingNginxConfig, validateStagingApiOrigin } from '../../scripts/stagingFrontendConfig.mjs';

const sampleOrigin = 'https://candidate--revision.test.azurecontainerapps.io';
const selectedCandidateOrigin = 'https://ca-scrolith-staging-api--0000008.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io';
const template = readFileSync(resolve(process.cwd(), 'nginx.staging.conf.template'), 'utf8');
const stagingDockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile.staging'), 'utf8');
const productionDockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
const productionNginx = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

test('staging backend-origin configuration receives one /api suffix', () => {
  assert.equal(resolveConfiguredApiBase({ VITE_BACKEND_URL: sampleOrigin }), sampleOrigin + '/api');
  assert.equal(
    `${resolveConfiguredApiBase({ VITE_BACKEND_URL: sampleOrigin })}/auth/login`,
    sampleOrigin + '/api/auth/login'
  );
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

test('staging build keeps the configured API origin aligned across CSP and API requests', () => {
  assert.match(stagingDockerfile, /--mount=type=secret,id=staging_api_origin/);
  assert.match(stagingDockerfile, /export STAGING_API_ORIGIN="\$\(cat \/run\/secrets\/staging_api_origin\)"/);
  assert.match(stagingDockerfile, /export VITE_BACKEND_URL="\$STAGING_API_ORIGIN"/);
  assert.match(stagingDockerfile, /export VITE_API_URL="\$STAGING_API_ORIGIN\/api"/);

  const apiBase = resolveConfiguredApiBase({
    VITE_API_URL: `${sampleOrigin}/api`,
    VITE_BACKEND_URL: sampleOrigin,
  });
  const rendered = renderStagingNginxConfig(template, sampleOrigin);
  const connectSources = [...rendered.matchAll(/connect-src\s+([^;]+);/g)].map((match) => match[1].trim());

  assert.equal(apiBase, `${sampleOrigin}/api`);
  assert.equal(`${apiBase}/homepage/guest`, `${sampleOrigin}/api/homepage/guest`);
  assert.equal(`${apiBase}/cms/platform-settings`, `${sampleOrigin}/api/cms/platform-settings`);
  assert.deepEqual(connectSources, [`'self' ${sampleOrigin}`]);
});

test('selected G1 staging candidate uses one /api prefix and the same exact CSP origin', () => {
  const apiBase = resolveConfiguredApiBase({
    VITE_API_URL: `${selectedCandidateOrigin}/api`,
    VITE_BACKEND_URL: selectedCandidateOrigin,
  });
  const rendered = renderStagingNginxConfig(template, selectedCandidateOrigin);
  const connectSources = [...rendered.matchAll(/connect-src\s+([^;]+);/g)].map((match) => match[1].trim());

  assert.equal(apiBase, `${selectedCandidateOrigin}/api`);
  assert.equal(`${apiBase}/homepage/guest`, `${selectedCandidateOrigin}/api/homepage/guest`);
  assert.deepEqual(connectSources, [`'self' ${selectedCandidateOrigin}`]);
  assert.equal(connectSources[0].includes('*'), false);
});

test('staging SPA fallback and static assets have deliberate cache and path behavior', () => {
  const staticStart = template.indexOf('location ~*');
  const spaStart = template.indexOf('location / {');
  const staticEnd = template.indexOf('\n  }', staticStart);
  const spaEnd = template.indexOf('\n  }', spaStart);
  const staticAssets = staticStart >= 0 && staticEnd > staticStart ? template.slice(staticStart, staticEnd) : '';
  const spa = spaStart >= 0 && spaEnd > spaStart ? template.slice(spaStart, spaEnd) : '';

  assert.ok(staticAssets, 'static asset location exists');
  assert.ok(spa, 'SPA location exists');
  assert.ok(
    staticAssets.includes('location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf)$'),
    'built JavaScript, stylesheets, images, icons, and fonts use the static location'
  );
  assert.match(staticAssets, /expires 365d;/);
  assert.match(staticAssets, /Cache-Control "public, max-age=31536000, immutable"/);
  assert.match(staticAssets, /try_files \$uri =404;/);
  assert.match(spa, /Cache-Control "no-cache"/);
  assert.match(spa, /try_files \$uri \$uri\/ \/index\.html;/);
});

test('staging response headers are present in each location block', () => {
  const locations = [...template.matchAll(/location[^{}]*\{([\s\S]*?)\n  \}/g)].map((match) => match[1]);
  assert.equal(locations.length, 2);

  for (const location of locations) {
    assert.match(location, /add_header Content-Security-Policy/);
    assert.match(location, /add_header X-Content-Type-Options/);
    assert.match(location, /add_header X-Frame-Options/);
    assert.match(location, /add_header Referrer-Policy/);
    assert.match(location, /add_header Permissions-Policy/);
    assert.match(location, /add_header Cross-Origin-Opener-Policy/);
  }
});

test('staging image serves built assets with isolated Nginx configuration', () => {
  assert.match(stagingDockerfile, /FROM nginx:1\.27-alpine AS runtime/);
  assert.match(stagingDockerfile, /COPY --from=build \/tmp\/default\.conf \/etc\/nginx\/conf\.d\/default\.conf/);
  assert.match(stagingDockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/);
  assert.match(productionDockerfile, /COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/);
  assert.doesNotMatch(productionDockerfile, /nginx\.staging\.conf\.template/);
  assert.doesNotMatch(productionNginx, /__SCROLITH_STAGING_API_ORIGIN__|connect-src/);
});
