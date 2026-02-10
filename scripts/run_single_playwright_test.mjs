import { spawn } from 'child_process';

const TEST = process.env.TEST_GREP || 'admin config form updates propagate to another client';
const TEST_FILE = process.env.TEST_FILE || 'tests/admin-config.spec.ts';

console.log('Running Playwright single test:', TEST_FILE, TEST);
const args = ['playwright', 'test', TEST_FILE, '-g', TEST, '--headed', '--trace=on', '--reporter=list', '--timeout=300000', '--retries=0'];
const child = spawn('npx', args, { cwd: process.cwd(), stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
