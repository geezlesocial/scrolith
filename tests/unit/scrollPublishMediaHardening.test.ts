import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(join(here, '../../', relativePath), 'utf8');

const filesService = read('src/services/files.ts');
const scrollComposer = read('src/features/scroll/ScrollCreateModal.tsx');

test('media uploads recreate multipart bodies and validate returned identifiers', () => {
  assert.match(filesService, /const createFormData = \(\) =>/);
  assert.match(filesService, /api\.post<ApiResponse<UploadedFile>>\('\/files\/upload', createFormData\(\)/);
  assert.match(filesService, /normalized\.id \|\| normalized\.fileId/);
});

test('Scroll publish reuses a completed upload and accepts normalized fileId responses', () => {
  assert.match(scrollComposer, /const \[uploadedFileId, setUploadedFileId\] = useState\('\'\);/);
  assert.match(scrollComposer, /if \(uploading\) return;/);
  assert.match(scrollComposer, /uploaded\?\.fileId \|\| uploaded\?\.id/);
  assert.match(scrollComposer, /videoFile && !fileId/);
});
