import { spawn } from 'child_process';

const HEALTH = process.env.BACKEND_HEALTH || 'http://localhost:5000/api/health';

const waitForHealth = async (timeoutSec = 30) => {
  for (let i = 0; i < timeoutSec; i++) {
    try {
      const res = await fetch(HEALTH, { method: 'GET' });
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
};

(async () => {
  const ok = await waitForHealth(30);
  if (!ok) {
    console.error('Backend not ready after waiting');
    process.exit(2);
  }
  console.log('Backend ready — running Playwright tests');
  const child = spawn('npx', ['playwright', 'test', '--workers=1', '--reporter=list'], { cwd: process.cwd(), stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code ?? 0));
})();
