const cp = require('./_childProcess');
const path = require('path');

async function runStress() {
  console.log('\n--- Running large stress test ---');
  try {
    const scriptPath = path.resolve(__dirname, 'stressLarge.js');
    cp.execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: path.resolve(__dirname) });
  } catch (e) {
    console.error('stressLarge failed', e && e.output ? e.output.toString() : (e.message || e));
  }
}

function dumpRedis() {
  try {
    console.log('\n--- Redis Snapshot ---');
    const raw = cp.execSync('docker exec geezle-redis redis-cli --raw KEYS "gcoin:*"').toString().trim();
    const keys = raw.split(/\r?\n/).filter(Boolean);
    console.log('Keys:', keys);
    for (const k of keys) {
      console.log('\nKey:', k);
      const zcard = cp.execSync(`docker exec geezle-redis redis-cli --raw ZCARD ${k}`).toString().trim();
      console.log('ZCARD:', zcard);
      const members = cp.execSync(`docker exec geezle-redis redis-cli --raw ZRANGE ${k} 0 -1 WITHSCORES`).toString().trim();
      console.log('Members (member / score):\n', members || '(none)');
      const ttl = cp.execSync(`docker exec geezle-redis redis-cli --raw TTL ${k}`).toString().trim();
      console.log('TTL:', ttl);
    }
  } catch (e) {
    console.error('Redis dump failed', e.message || e);
  }
}

async function runRepeats(options = {}) {
  const iterations = typeof options.iterations === 'number' ? options.iterations : 5;
  const pauseMs = typeof options.pauseMs === 'number' ? options.pauseMs : 10000; // 10s

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n=== Iteration ${i}/${iterations} ===`);
    await runStress();
    await new Promise(r => setTimeout(r, 1500));
    dumpRedis();
    if (i < iterations) {
      console.log(`Waiting ${pauseMs/1000}s before next iteration...`);
      await new Promise(r => setTimeout(r, pauseMs));
    }
  }

  console.log('\nCompleted repeated stress runs.');
}

module.exports = {
  runStress,
  dumpRedis,
  runRepeats,
};

if (require.main === module) {
  (async () => {
    await runRepeats();
    process.exit(0);
  })();
}
