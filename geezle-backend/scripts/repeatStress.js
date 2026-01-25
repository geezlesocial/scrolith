(async () => {
  const { execSync } = require('child_process');
  const fetch = require('node-fetch');

  const runStress = async () => {
    console.log('\n--- Running large stress test ---');
    try {
      const path = require('path');
      const scriptPath = path.resolve(__dirname, 'stressLarge.js');
      execSync(`node "${scriptPath}"`, { stdio: 'inherit', cwd: path.resolve(__dirname) });
    } catch (e) {
      console.error('stressLarge failed', e && e.output ? e.output.toString() : (e.message || e));
    }
  };

  const dumpRedis = () => {
    try {
      console.log('\n--- Redis Snapshot ---');
      const keys = execSync('docker exec geezle-redis redis-cli --raw KEYS "gcoin:*"').toString().trim().split(/\r?\n/).filter(Boolean);
      console.log('Keys:', keys);
      for (const k of keys) {
        console.log('\nKey:', k);
        const zcard = execSync(`docker exec geezle-redis redis-cli --raw ZCARD ${k}`).toString().trim();
        console.log('ZCARD:', zcard);
        const members = execSync(`docker exec geezle-redis redis-cli --raw ZRANGE ${k} 0 -1 WITHSCORES`).toString().trim();
        console.log('Members (member / score):\n', members || '(none)');
        const ttl = execSync(`docker exec geezle-redis redis-cli --raw TTL ${k}`).toString().trim();
        console.log('TTL:', ttl);
      }
    } catch (e) {
      console.error('Redis dump failed', e.message || e);
    }
  };

  const iterations = 5;
  const pauseMs = 10000; // 10s between runs

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n=== Iteration ${i}/${iterations} ===`);
    await runStress();
    // small wait to allow Lua writes to propagate
    await new Promise(r => setTimeout(r, 1500));
    dumpRedis();
    if (i < iterations) {
      console.log(`Waiting ${pauseMs/1000}s before next iteration...`);
      await new Promise(r => setTimeout(r, pauseMs));
    }
  }

  console.log('\nCompleted repeated stress runs.');
  process.exit(0);
})();
