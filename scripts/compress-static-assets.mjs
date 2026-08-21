import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const distRoot = path.resolve('dist');
const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt', '.wasm', '.xml']);

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else files.push(entryPath);
  }

  return files;
};

const files = await walk(distRoot);
let generated = 0;

for (const filePath of files) {
  const extension = path.extname(filePath).toLowerCase();
  if (!compressibleExtensions.has(extension)) continue;

  const input = await readFile(filePath);
  if (input.length === 0) continue;

  const brotli = await brotliCompressAsync(input, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 5
    }
  });
  const gzipOutput = await gzipAsync(input, { level: 6 });

  await writeFile(`${filePath}.br`, brotli);
  await writeFile(`${filePath}.gz`, gzipOutput);
  generated += 1;
}

console.log(`Generated compressed sidecars for ${generated} static assets.`);
