const mockSendMail = jest.fn();

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: { appSetting: { findUnique: jest.fn() } }
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail }))
}));

import prisma from '../../utils/prismaClient';
import {
  buildEmailTransportOptions,
  checkSmtpReadiness,
  getEmailSettings,
  invalidateEmailTransportCache,
  normalizeEnvironmentEmailSettings,
  sendSystemEmail
} from '../email.service';

const originalEnv = { ...process.env };

const setEnvironmentEmail = (overrides: Record<string, string> = {}) => {
  process.env.EMAIL_CONFIG_SOURCE = 'environment';
  process.env.EMAIL_HOST = '127.0.0.1';
  process.env.EMAIL_PORT = '1025';
  process.env.EMAIL_FROM_NAME = 'Scrolith Staging';
  process.env.EMAIL_FROM_EMAIL = 'noreply@scrolith.test';
  process.env.EMAIL_ENCRYPTION = 'none';
  process.env.EMAIL_SECURE = 'false';
  process.env.EMAIL_REQUIRE_TLS = 'false';
  process.env.EMAIL_ALLOW_UNAUTHENTICATED = 'true';
  Object.assign(process.env, overrides);
};

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
  invalidateEmailTransportCache();
});

describe('email transport configuration', () => {
  test('preserves database settings precedence by default', async () => {
    delete process.env.EMAIL_CONFIG_SOURCE;
    (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue({
      data: { email: { provider: 'smtp', host: 'db.smtp.internal', port: 2525, fromName: 'Database', fromEmail: 'db@example.test', encryption: 'none' } }
    });

    const settings = await getEmailSettings();

    expect(settings).toEqual(expect.objectContaining({ host: 'db.smtp.internal', port: 2525, fromName: 'Database' }));
  });

  test('uses environment settings only with the explicit selector', async () => {
    setEnvironmentEmail();
    (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue({
      data: { email: { host: 'db.smtp.internal', port: 2525, fromName: 'Database', fromEmail: 'db@example.test' } }
    });

    const settings = await getEmailSettings();

    expect(settings).toEqual(expect.objectContaining({
      host: '127.0.0.1',
      port: 1025,
      fromName: 'Scrolith Staging',
      fromEmail: 'noreply@scrolith.test',
      encryption: 'none',
      secure: false,
      requireTLS: false,
      allowUnauthenticated: true
    }));
    expect(prisma.appSetting.findUnique).not.toHaveBeenCalled();
  });

  test('requires explicit host, port, sender, and encryption in environment mode', () => {
    setEnvironmentEmail();
    delete process.env.EMAIL_ENCRYPTION;

    expect(normalizeEnvironmentEmailSettings()).toBeNull();
  });

  test('maps TLS settings deterministically', () => {
    setEnvironmentEmail({ EMAIL_ENCRYPTION: 'tls', EMAIL_SECURE: 'false', EMAIL_REQUIRE_TLS: 'true' });
    const settings = normalizeEnvironmentEmailSettings();

    expect(settings).not.toBeNull();
    expect(buildEmailTransportOptions(settings!)).toEqual(expect.objectContaining({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      requireTLS: true
    }));
  });

  test('rejects an unreachable SMTP endpoint without sending mail', async () => {
    setEnvironmentEmail({ EMAIL_PORT: '1' });
    const settings = normalizeEnvironmentEmailSettings();

    const readiness = await checkSmtpReadiness(settings, 250);

    expect(readiness.ready).toBe(false);
    expect(readiness.errorCategory).toBeDefined();
  });

  test('logs only a redacted delivery error category', async () => {
    setEnvironmentEmail();
    mockSendMail.mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'recipient secret body must not be logged' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await sendSystemEmail({
      to: 'synthetic-recipient@scrolith.test',
      subject: 'synthetic subject',
      text: 'synthetic body'
    });

    expect(result).toEqual({ success: false, error: 'connection_refused' });
    const output = JSON.stringify(warn.mock.calls);
    expect(output).toContain('connection_refused');
    expect(output).not.toContain('recipient secret body');
    warn.mockRestore();
  });
});
