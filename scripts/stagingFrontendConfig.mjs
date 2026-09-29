import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(scriptDirectory, '../nginx.staging.conf.template');
const ORIGIN_PLACEHOLDER = '__SCROLITH_STAGING_API_ORIGIN__';
const WEBSOCKET_ORIGIN_PLACEHOLDER = '__SCROLITH_STAGING_API_WEBSOCKET_ORIGIN__';
const MAP_TILE_ORIGIN = 'https://tile.openstreetmap.org';

export function validateStagingApiOrigin(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new Error('Staging API origin is missing or invalid.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Staging API origin is not a valid URL.');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/' ||
    !parsed.hostname.includes('--') ||
    !parsed.hostname.endsWith('.azurecontainerapps.io')
  ) {
    throw new Error('Staging API origin must be an HTTPS revision-specific Container Apps origin.');
  }

  return parsed.origin;
}

export function renderStagingNginxConfig(template, apiOrigin) {
  const validatedOrigin = validateStagingApiOrigin(apiOrigin);
  const apiPlaceholders = template.split(ORIGIN_PLACEHOLDER).length - 1;
  const websocketPlaceholders = template.split(WEBSOCKET_ORIGIN_PLACEHOLDER).length - 1;
  if (apiPlaceholders !== 1 || websocketPlaceholders !== 1) {
    throw new Error('Staging Nginx template must contain exactly one API and WebSocket origin placeholder.');
  }

  const websocketUrl = new URL(validatedOrigin);
  websocketUrl.protocol = 'wss:';
  const websocketOrigin = websocketUrl.origin;
  const rendered = template
    .replace(ORIGIN_PLACEHOLDER, validatedOrigin)
    .replace(WEBSOCKET_ORIGIN_PLACEHOLDER, websocketOrigin);
  validateStagingConnectSources(rendered, validatedOrigin);
  return rendered;
}

export function validateStagingConnectSources(rendered, apiOrigin) {
  const validatedOrigin = validateStagingApiOrigin(apiOrigin);
  const websocketUrl = new URL(validatedOrigin);
  websocketUrl.protocol = 'wss:';
  const websocketOrigin = websocketUrl.origin;
  const connectSources = [...rendered.matchAll(/connect-src\s+([^;]+);/g)].map((match) => match[1].trim());
  const expectedConnectSources = `'self' ${validatedOrigin} ${websocketOrigin} ${MAP_TILE_ORIGIN}`;
  if (connectSources.length !== 1 || connectSources[0] !== expectedConnectSources) {
    throw new Error(
      'Staging connect-src must allow only self, the configured API/WebSocket origins, and the required map tile origin.'
    );
  }
}

export function writeStagingNginxConfig(outputPath, apiOrigin) {
  const template = readFileSync(templatePath, 'utf8');
  const rendered = renderStagingNginxConfig(template, apiOrigin);
  writeFileSync(outputPath, rendered, { encoding: 'utf8', mode: 0o644 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2];
  if (!outputPath || !process.env.STAGING_API_ORIGIN) {
    throw new Error('Output path and staging API origin are required.');
  }
  writeStagingNginxConfig(outputPath, process.env.STAGING_API_ORIGIN);
}
