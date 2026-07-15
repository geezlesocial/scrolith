import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Scrolitha distributed platform client contracts', () => {
  it('exposes diagnostics client method', () => {
    const service = readFileSync(join(__dirname, '../../src/services/scrolitha.ts'), 'utf8');
    assert.match(service, /intelligence\/diagnostics/);
    assert.match(service, /intelligenceDiagnostics/);
  });

  it('OS surface still supports cancel for reconnect storms', () => {
    const surface = readFileSync(
      join(__dirname, '../../src/components/scrolitha/ScrolithaOsSurface.tsx'),
      'utf8'
    );
    assert.match(surface, /osCancel/);
    assert.match(surface, /AbortController/);
  });
});
