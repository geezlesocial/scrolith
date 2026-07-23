/**
 * Phase 10.2 — POST /notifications/create authorization (IDOR fix).
 */
import { createNotification } from '../notifications.controller';

const mockCreate = jest.fn();

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    notification: {
      create: (...args: any[]) => mockCreate(...args)
    }
  }
}));

jest.mock('../../services/pushNotifications', () => ({
  getPushRuntimeStatus: () => ({}),
  isPushEnabled: () => false,
  sendPushToUser: jest.fn()
}));

jest.mock('../../services/notificationIntelligence', () => ({
  notificationIntelligenceService: {
    listForViewer: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    listForUserAdmin: jest.fn()
  }
}));

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('createNotification authorization', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: 'new-1' });
  });

  test('rejects unauthenticated', async () => {
    const res = mockRes();
    await createNotification({ user: undefined, body: { userId: 'u1', type: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('forbids non-admin creating for another user', async () => {
    const res = mockRes();
    await createNotification(
      { user: { id: 'u1', role: 'USER' }, body: { userId: 'u2', type: 'info', title: 't', body: 'b' } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('allows self-create', async () => {
    const res = mockRes();
    await createNotification(
      { user: { id: 'u1', role: 'USER' }, body: { userId: 'u1', type: 'info', title: 't', body: 'b' } } as any,
      res
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: null, status: 'suppressed' })
      })
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('allows admin create for another user', async () => {
    const res = mockRes();
    await createNotification(
      {
        user: { id: 'admin-1', role: 'ADMIN' },
        body: { userId: 'u2', type: 'system', title: 't', body: 'b' }
      } as any,
      res
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: 'new-1', status: 'created' })
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u2', type: 'system' })
      })
    );
  });
});
