const cp = require('child_process');

const { runStress, dumpRedis } = require('../repeatStress');

describe('repeatStress script', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    cp.execSync = jest.fn();
  });

  test('runStress invokes stressLarge script via node', async () => {
    cp.execSync.mockImplementation(() => 'ok');
    await runStress();
    expect(cp.execSync).toHaveBeenCalled();
    const cmd = cp.execSync.mock.calls[0][0];
    expect(cmd).toMatch(/stressLarge\.js/);
  });

  test('dumpRedis does not throw when docker is unavailable and logs error', () => {
    cp.execSync.mockImplementation(() => { throw new Error('docker unavailable'); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => dumpRedis()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    const firstCall = spy.mock.calls[0];
    expect(firstCall[0]).toBe('Redis dump failed');
    spy.mockRestore();
  });
});
