import { storeFeedbackEvent } from '../feedbackStorage';
import type { NormalizedFeedbackEvent } from '../types';

const event: NormalizedFeedbackEvent = {
  eventId: 'evt-1',
  idempotencyKey: 'iff_test_key',
  viewerId: 'viewer-1',
  entityType: 'post',
  entityId: 'post-1',
  action: 'like',
  storageAction: 'iff_like',
  category: 'positive',
  surface: 'member_home',
  occurredAt: new Date(0).toISOString(),
  metadata: {
    feedbackFabricVersion: 'test',
    category: 'positive',
    originalAction: 'like',
    sourceSurface: 'member_home'
  }
};

describe('feedback storage idempotency', () => {
  test('uses an atomic duplicate-safe insert for deterministic IDs', async () => {
    const create = jest.fn();
    const createMany = jest.fn().mockResolvedValue({ count: 1 });

    const result = await storeFeedbackEvent(event, { recoFeedbackLog: { create, createMany } });

    expect(result).toEqual({ stored: true, duplicate: false, id: 'iff_test_key' });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(create).not.toHaveBeenCalled();
  });

  test('reports a duplicate as a successful idempotent outcome without create()', async () => {
    const create = jest.fn();
    const createMany = jest.fn().mockResolvedValue({ count: 0 });

    const result = await storeFeedbackEvent(event, { recoFeedbackLog: { create, createMany } });

    expect(result).toEqual({ stored: false, duplicate: true, id: 'iff_test_key' });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(create).not.toHaveBeenCalled();
  });
});
