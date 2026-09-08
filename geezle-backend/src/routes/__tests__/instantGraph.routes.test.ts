import { instantGraphAssignmentPercent } from '../instantGraph.routes';

describe('Instant Graph rollout assignment', () => {
  test('is deterministic for a stable user id', () => {
    expect(instantGraphAssignmentPercent('user-123')).toBe(instantGraphAssignmentPercent('user-123'));
  });

  test('stays within the canary bucket range', () => {
    for (const userId of ['a', 'b', 'c', 'user-1', 'user-2', '']) {
      const bucket = instantGraphAssignmentPercent(userId);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });
});
