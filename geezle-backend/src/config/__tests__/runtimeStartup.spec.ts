import { getRuntimeStartupPlan } from '../runtimeStartup';

describe('runtime startup policy', () => {
  test('keeps HTTP startup enabled when background workers are disabled', () => {
    expect(getRuntimeStartupPlan({ backgroundWorkersEnabled: false, prismaReady: true })).toEqual({
      startHttpServer: true,
      startBackgroundWorkers: false
    });
  });

  test('starts workers only when enabled and Prisma is ready', () => {
    expect(getRuntimeStartupPlan({ backgroundWorkersEnabled: true, prismaReady: true })).toEqual({
      startHttpServer: true,
      startBackgroundWorkers: true
    });
    expect(getRuntimeStartupPlan({ backgroundWorkersEnabled: true, prismaReady: false })).toEqual({
      startHttpServer: true,
      startBackgroundWorkers: false
    });
  });

  test('disabled workers remain disabled regardless of Prisma readiness', () => {
    expect(getRuntimeStartupPlan({ backgroundWorkersEnabled: false, prismaReady: false })).toEqual({
      startHttpServer: true,
      startBackgroundWorkers: false
    });
  });
});
