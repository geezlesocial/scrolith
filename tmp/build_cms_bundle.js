const esbuild = require('esbuild');
const path = require('path');

(async () => {
  try {
    const entry = path.resolve(process.cwd(), 'scrolith/src/services/cms.ts');
    const out = path.resolve(process.cwd(), 'tmp/cms_bundle.mjs');
    console.log('Bundling', entry, '->', out);

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      target: ['node18'],
      format: 'esm',
      outfile: out,
      sourcemap: false,
      define: {
        // define import.meta.env as a JSON literal so code reading import.meta.env works
        'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://localhost:5000/api', PROD: false })
      },
      external: []
    });

    console.log('Bundle complete');
  } catch (err) {
    console.error('Build failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
