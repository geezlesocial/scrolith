import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Scrolitha OS surface contracts', () => {
  it('App mounts global OS surface and provider', () => {
    const app = readFileSync(join(__dirname, '../../src/App.tsx'), 'utf8');
    assert.match(app, /ScrolithaOsProvider/);
    assert.match(app, /ScrolithaOsSurface/);
  });

  it('OS surface supports adaptive modes and action cards', () => {
    const surface = readFileSync(
      join(__dirname, '../../src/components/scrolitha/ScrolithaOsSurface.tsx'),
      'utf8'
    );
    assert.match(surface, /osBootstrap/);
    assert.match(surface, /osAsk/);
    assert.match(surface, /osCancel/);
    assert.match(surface, /bottom_sheet|side_panel|floating/);
    assert.match(surface, /ScrolithaActionCards/);
    assert.match(surface, /aria-live="polite"/);
    assert.match(surface, /AbortController/);
    // Safe rollout: surface stays hidden until backend permits bootstrap
    assert.match(surface, /surfaceAllowed/);
    assert.match(surface, /if \(!surfaceAllowed\) return null/);
  });

  it('Ask panel gates on backend contextual featureFlags', () => {
    const panel = readFileSync(
      join(__dirname, '../../src/components/post/AskScrolithaPanel.tsx'),
      'utf8'
    );
    assert.match(panel, /platformIdentity/);
    assert.match(panel, /featureFlags/);
    assert.match(panel, /featureAllowed/);
    assert.match(panel, /if \(!featureChecked \|\| !featureAllowed\) return null/);
  });

  it('service client exposes OS endpoints', () => {
    const service = readFileSync(join(__dirname, '../../src/services/scrolitha.ts'), 'utf8');
    assert.match(service, /os\/bootstrap/);
    assert.match(service, /os\/ask/);
    assert.match(service, /os\/cancel/);
    assert.match(service, /intelligence\/search/);
  });
});
