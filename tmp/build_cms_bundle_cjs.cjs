const esbuild = require('esbuild');
const path = require('path');

(async () => {
  try {
    const entry = path.resolve(process.cwd(), 'geezle/src/services/cms.ts');
    const out = path.resolve(process.cwd(), 'tmp/cms_bundle.cjs');
    console.log('Bundling', entry, '->', out);

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

    console.log('Bundle complete');
  } catch (err) {
    console.error('Build failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
