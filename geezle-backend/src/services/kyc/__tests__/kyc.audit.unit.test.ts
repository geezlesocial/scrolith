import { writeKycAuditEvent } from '../kyc.audit.service';

jest.mock('../../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    kYCAuditEvent: {
      create: jest.fn(async ({ data }) => ({ id: 'audit-1', ...data }))
    }
  }
}));

import prisma from '../../../utils/prismaClient';

describe('kyc.audit', () => {
  test('strips identity fields from metadata', async () => {
    await writeKycAuditEvent({
      actorType: 'ADMIN',
      action: 'approval',
      metadata: {
        email: 'secret@example.com',
        firstName: 'Ada',
        documentType: 'passport',
        signedUrl: 'https://evil.example/secret',
        sizeBytes: 123
      }
    });

    const call = (prisma.kYCAuditEvent.create as jest.Mock).mock.calls[0][0];
    expect(call.data.metadata.email).toBeUndefined();
    expect(call.data.metadata.firstName).toBeUndefined();
    expect(call.data.metadata.signedUrl).toBeUndefined();
    expect(call.data.metadata.documentType).toBe('passport');
    expect(call.data.metadata.sizeBytes).toBe(123);
  });
});
