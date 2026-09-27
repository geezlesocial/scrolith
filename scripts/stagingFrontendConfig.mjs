import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(scriptDirectory, '../nginx.staging.conf.template');
const ORIGIN_PLACEHOLDER = '__SCROLITH_STAGING_API_ORIGIN__';

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
  const placeholders = template.split(ORIGIN_PLACEHOLDER).length - 1;
  if (placeholders !== 1) {
    throw new Error('Staging Nginx template must contain exactly one API-origin placeholder.');
  }

  const rendered = template.replace(ORIGIN_PLACEHOLDER, validatedOrigin);
  const connectSources = [...rendered.matchAll(/connect-src\s+([^;]+);/g)].map((match) => match[1].trim());
  if (connectSources.length !== 1 || connectSources[0] !== "'self' " + validatedOrigin) {
    throw new Error('Staging connect-src must allow only self and the configured API origin.');
  }

  return rendered;
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
