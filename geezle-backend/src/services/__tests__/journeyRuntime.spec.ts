import { createJourneyRuntimeController } from '../journeyRuntime';

describe('journey runtime controller', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('worker-disable mode does not poll or create an interval', async () => {
    jest.useFakeTimers();
    const poll = jest.fn().mockResolvedValue(undefined);
    const runtime = createJourneyRuntimeController({
      enabled: () => false,
      poll,
      onError: jest.fn(),
      intervalMs: 15_000
    });

    expect(runtime.ensure()).toBe(false);
    await Promise.resolve();
    jest.advanceTimersByTime(30_000);
    expect(poll).not.toHaveBeenCalled();
    expect(runtime.isRunning()).toBe(false);
  });

  test('normal mode performs the initial and scheduled polls', async () => {
    jest.useFakeTimers();
    const poll = jest.fn().mockResolvedValue(undefined);
    const runtime = createJourneyRuntimeController({
      enabled: () => true,
      poll,
      onError: jest.fn(),
      intervalMs: 15_000
    });

    expect(runtime.ensure()).toBe(true);
    await Promise.resolve();
    expect(poll).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(15_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  test('repeated initialization is idempotent', async () => {
    jest.useFakeTimers();
    const poll = jest.fn().mockResolvedValue(undefined);
    const runtime = createJourneyRuntimeController({
      enabled: () => true,
      poll,
      onError: jest.fn(),
      intervalMs: 15_000
    });

    expect(runtime.ensure()).toBe(true);
    expect(runtime.ensure()).toBe(false);
    await Promise.resolve();
    jest.advanceTimersByTime(15_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  test('shutdown clears the timer and is safe to repeat', async () => {
    jest.useFakeTimers();
    const poll = jest.fn().mockResolvedValue(undefined);
    const runtime = createJourneyRuntimeController({
      enabled: () => true,
      poll,
      onError: jest.fn(),
      intervalMs: 15_000
    });

    runtime.ensure();
    await Promise.resolve();
    expect(runtime.shutdown()).toBe(true);
    expect(runtime.shutdown()).toBe(false);
    jest.advanceTimersByTime(30_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(runtime.isRunning()).toBe(false);
  });
});
