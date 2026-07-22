import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  test
} from '@jest/globals';

const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: jest.mock,
  doMock: jest.doMock,
  unmock: jest.unmock,
  clearAllMocks: jest.clearAllMocks,
  resetAllMocks: jest.resetAllMocks,
  restoreAllMocks: jest.restoreAllMocks,
  useFakeTimers: jest.useFakeTimers,
  useRealTimers: jest.useRealTimers,
  setSystemTime: jest.setSystemTime,
  advanceTimersByTime: jest.advanceTimersByTime,
  runAllTimers: jest.runAllTimers
};

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi };
