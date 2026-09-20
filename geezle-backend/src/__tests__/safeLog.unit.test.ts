import { safeLogValue } from '../utils/security/safeLog';

describe('safeLogValue', () => {
  test('redacts sensitive fields and removes control characters', () => {
    expect(safeLogValue({ email: 'synthetic@example.test', note: 'ok\nnext', nested: { token: 'hidden' } })).toEqual({
      email: '[redacted]',
      note: 'ok next',
      nested: { token: '[redacted]' }
    });
  });

  test('bounds collections and nested objects', () => {
    expect(safeLogValue({ values: Array.from({ length: 50 }, (_, index) => index), deep: { a: { b: { c: 1 } } } })).toEqual({
      values: Array.from({ length: 20 }, (_, index) => index),
      deep: { a: { b: '[nested]' } }
    });
  });
});
