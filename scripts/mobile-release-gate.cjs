const { spawnSync } = require('node:child_process');

const steps = [
  {
    name: 'frontend build',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'build']
  },
  {
    name: 'mobile unit tests',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'test:mobile:unit']
  }
];

const run = ({ name, command, args }) => {
  console.log(`\n[mobile-release-gate] ${name}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });
  if (result.error) {
    console.error(`[mobile-release-gate] ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`${name} failed`);
  }
};

const checkAdb = () => {
  if (process.env.SCROLITH_SKIP_ADB === '1') return;
  const adb = spawnSync('adb', ['devices'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const output = `${adb.stdout || ''}\n${adb.stderr || ''}`;
  const hasDevice = /\n[^\s]+\s+device\b/.test(output);

  if (!hasDevice && process.env.SCROLITH_REQUIRE_ADB === '1') {
    console.error('[mobile-release-gate] No connected Android device found.');
    process.exit(1);
  }

  console.log(
    hasDevice
      ? '[mobile-release-gate] Android device detected.'
      : '[mobile-release-gate] Android device not detected; continuing because SCROLITH_REQUIRE_ADB is not set.'
  );
};

try {
  steps.forEach(run);
  checkAdb();
  console.log('\n[mobile-release-gate] passed');
} catch (error) {
  console.error(`\n[mobile-release-gate] ${(error && error.message) || error}`);
  process.exit(process.exitCode || 1);
}
