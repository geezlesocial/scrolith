jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    deviceApprovalWaiver: { findFirst: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    authAuditLog: { create: jest.fn() },
    $transaction: jest.fn()
  }
}));

jest.mock('../adminAudit.service', () => ({
  writeAdminAuditEvent: jest.fn()
}));

import prisma from '../../utils/prismaClient';
import {
  claimDeviceApprovalWaiver,
  getDeviceApprovalWaiverSettings
} from '../deviceApprovalWaiver.service';

const db = prisma as any;
const request = { ip: '127.0.0.1', headers: { 'user-agent': 'focused-test' } } as any;

describe('device approval waiver policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.authAuditLog.create.mockResolvedValue({ id: 'audit' });
  });

  test('defaults to disabled when no setting exists', async () => {
    db.appSetting.findUnique.mockResolvedValue(null);

    await expect(getDeviceApprovalWaiverSettings()).resolves.toEqual({ enabled: false });
  });

  test('does not inspect or claim a waiver while the global control is disabled', async () => {
    db.appSetting.findUnique.mockResolvedValue({ data: { enabled: false } });

    await expect(claimDeviceApprovalWaiver('user-1', 'device-1', request)).resolves.toEqual({
      approved: false,
      reason: 'disabled'
    });
    expect(db.deviceApprovalWaiver.findFirst).not.toHaveBeenCalled();
    expect(db.deviceApprovalWaiver.updateMany).not.toHaveBeenCalled();
  });

  test('consumes exactly one active one-time waiver', async () => {
    db.appSetting.findUnique.mockResolvedValue({ data: { enabled: true } });
    db.deviceApprovalWaiver.findFirst.mockResolvedValue({ id: 'waiver-1', mode: 'ONE_TIME', status: 'ACTIVE' });
    db.deviceApprovalWaiver.updateMany.mockResolvedValue({ count: 1 });

    await expect(claimDeviceApprovalWaiver('user-1', 'device-1', request)).resolves.toMatchObject({
      approved: true,
      mode: 'ONE_TIME',
      consumed: true
    });
    expect(db.deviceApprovalWaiver.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'waiver-1', status: 'ACTIVE', mode: 'ONE_TIME' },
      data: expect.objectContaining({ status: 'CONSUMED', consumedByDeviceId: 'device-1' })
    }));
    expect(db.authAuditLog.create).toHaveBeenCalledTimes(1);
  });

  test('rejects a one-time claim lost to a concurrent consumer', async () => {
    db.appSetting.findUnique.mockResolvedValue({ data: { enabled: true } });
    db.deviceApprovalWaiver.findFirst.mockResolvedValue({ id: 'waiver-1', mode: 'ONE_TIME', status: 'ACTIVE' });
    db.deviceApprovalWaiver.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimDeviceApprovalWaiver('user-1', 'device-1', request)).resolves.toEqual({
      approved: false,
      reason: 'already_claimed'
    });
    expect(db.authAuditLog.create).not.toHaveBeenCalled();
  });

  test('uses an active-row predicate for unlimited waivers', async () => {
    db.appSetting.findUnique.mockResolvedValue({ data: { enabled: true } });
    db.deviceApprovalWaiver.findFirst.mockResolvedValue({ id: 'waiver-2', mode: 'UNLIMITED', status: 'ACTIVE' });
    db.deviceApprovalWaiver.updateMany.mockResolvedValue({ count: 1 });

    await expect(claimDeviceApprovalWaiver('user-1', 'device-1', request)).resolves.toMatchObject({
      approved: true,
      mode: 'UNLIMITED',
      consumed: false
    });
    expect(db.deviceApprovalWaiver.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'waiver-2', status: 'ACTIVE', mode: 'UNLIMITED' }
    }));
  });
});
