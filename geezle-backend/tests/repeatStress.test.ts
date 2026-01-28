// require the childProcess wrapper we add for testability
const cp = require('../scripts/_childProcess');
// require the CommonJS module under test
const { runStress, dumpRedis } = require('../scripts/repeatStress');

describe('repeatStress script', () => {
  let execSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    execSpy = jest.spyOn(cp, 'execSync').mockImplementation(() => 'ok' as any);
  });

  test('runStress invokes stressLarge script via node', async () => {
    execSpy.mockImplementation(() => 'ok' as any);
    await runStress();
    expect(execSpy).toHaveBeenCalled();
    const cmd = execSpy.mock.calls[0][0];
    expect(cmd).toMatch(/stressLarge\.js/);
  });

  test('dumpRedis does not throw when docker is unavailable and logs error', () => {
    execSpy.mockImplementation(() => { throw new Error('docker unavailable'); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => dumpRedis()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    const firstCall = spy.mock.calls[0];
    expect(firstCall[0]).toBe('Redis dump failed');
    spy.mockRestore();
  });
});
