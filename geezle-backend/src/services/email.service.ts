import prisma from '../utils/prismaClient';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

export type EmailSettings = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  secure?: boolean;
  fromName: string;
  fromEmail: string;
};

export type EmailSendInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

let cachedTransporter: any | null = null;
let cachedSignature: string | null = null;

export const invalidateEmailTransportCache = () => {
  cachedTransporter = null;
  cachedSignature = null;
};

const normalizeEmailSettings = (raw: any): EmailSettings | null => {
  const host = raw?.host || process.env.EMAIL_HOST || '';
  const port = Number(raw?.port || process.env.EMAIL_PORT || 0);
  const username = raw?.username || raw?.user || process.env.EMAIL_USER || '';
  const password = raw?.password || raw?.pass || process.env.EMAIL_PASS || '';
  const fromName = raw?.fromName || raw?.from_name || process.env.EMAIL_FROM_NAME || 'Scrolith';
  const fromEmail = raw?.fromEmail || raw?.from_email || process.env.EMAIL_FROM_EMAIL || 'noreply@Scrolith.com';
  const secure = raw?.secure ?? (port === 465);

  if (!host || !port) {
    return null;
  }

  return {
    host,
    port,
    username: username || undefined,
    password: password || undefined,
    secure: Boolean(secure),
    fromName,
    fromEmail
  };
};

export const getEmailSettings = async (): Promise<EmailSettings | null> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = record?.data as any;
    const emailConfig = data?.email || {};
    const normalized = normalizeEmailSettings(emailConfig);
    if (normalized) return normalized;
  } catch (error) {
    console.warn('[email] Failed to read system email settings', error);
  }

  // fallback to env if DB failed
  return normalizeEmailSettings({});
};

const getTransporter = async (): Promise<any | null> => {
  const settings = await getEmailSettings();
  if (!settings) return null;

  const signature = JSON.stringify({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username
  });

  if (cachedTransporter && cachedSignature === signature) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined
  });
  cachedSignature = signature;
  return cachedTransporter;
};

export const sendSystemEmail = async (payload: EmailSendInput): Promise<{ success: boolean; error?: string }> => {
  const settings = await getEmailSettings();
  if (!settings) {
    return { success: false, error: 'Email settings not configured' };
  }

  const transporter = await getTransporter();
  if (!transporter) {
    return { success: false, error: 'Email transporter not initialized' };
  }

  try {
    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html || undefined,
      text: payload.text || undefined
    });
    return { success: true };
  } catch (error: any) {
    console.warn('[email] send failed', error);
    return { success: false, error: error?.message || 'Email send failed' };
  }
};


