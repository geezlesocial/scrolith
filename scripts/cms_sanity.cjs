#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    let esbuild;
    try {
      esbuild = require('esbuild');
    } catch (e) {
      console.error('esbuild is required for this sanity script. Install it with `npm install --no-audit --no-fund esbuild`');
      process.exit(2);
    }

    const repoRoot = path.resolve(__dirname, '..');
    const entry = path.resolve(repoRoot, 'scrolith/src/services/cms.ts');
    if (!fs.existsSync(entry)) {
      console.warn('CMS sanity target not present:', entry);
      console.warn('This repository layout uses a nested submodule for the frontend; skipping CMS sanity bundle.');
      process.exit(0);
    }
    const outDir = path.resolve(repoRoot, 'scrolith/tmp');
    const out = path.resolve(outDir, 'cms_bundle.cjs');

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    console.log('Bundling CMSService for CI sanity test...');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      target: ['node18'],
      format: 'cjs',
      outfile: out,
      sourcemap: false,
      define: {
        'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://localhost:5000/api', PROD: false })
      }
    });

    console.log('Bundle created:', out);

    // Provide a minimal localStorage shim used by the service
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

    const { CMSService } = require(out);

    console.log('Calling CMSService.getHeaderConfig()...');
    const header = await CMSService.getHeaderConfig();
    if (!header || typeof header !== 'object') {
      console.error('Header config was not returned or invalid');
      process.exit(3);
    }
    // Basic validation
    if (!Array.isArray(header.navigation) && !header.logoUrl) {
      console.warn('Header looks unexpectedly empty, continuing to test fallback hero');
    }

    console.log('Calling CMSService.getHeroSearchConfig()...');
    const hero = await CMSService.getHeroSearchConfig();
    if (!hero || typeof hero !== 'object') {
      console.error('Hero search config was not returned or invalid');
      process.exit(4);
    }

    // Check for expected fallback fields
    if (!Array.isArray(hero.quickTags) && !(hero.headline || hero.searchPlaceholder)) {
      console.error('Hero search config appears missing expected fields');
      process.exit(5);
    }

    console.log('CMSService sanity check passed.');
    process.exit(0);
  } catch (err) {
    console.error('Sanity script failed:', err && (err.stack || err.message) ? (err.stack || err.message) : err);
    process.exit(10);
  }
}

main();
