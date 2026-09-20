import prisma from '../utils/prismaClient';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { isLikelyEmail } from '../utils/security/boundedInput';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

export type EmailProvider = 'smtp' | 'ses' | 'sendgrid' | 'mailgun' | 'brevo';
export type EmailEncryption = 'tls' | 'ssl' | 'none';

export type EmailSettings = {
  provider: EmailProvider;
  host: string;
  port: number;
  username?: string;
  password?: string;
  secure?: boolean;
  encryption: EmailEncryption;
  fromName: string;
  fromEmail: string;
  apiKey?: string;
  domain?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  requireTLS?: boolean;
  allowUnauthenticated?: boolean;
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

const pickFirstString = (...values: any[]): string => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
};

const parseProvider = (value: any): EmailProvider => {
  const normalized = String(value || 'smtp').trim().toLowerCase();
  if (normalized === 'ses' || normalized === 'sendgrid' || normalized === 'mailgun' || normalized === 'brevo') {
    return normalized;
  }
  return 'smtp';
};

const parseEncryption = (value: any): EmailEncryption => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ssl') return 'ssl';
  if (normalized === 'none') return 'none';
  return 'tls';
};

const defaultHostByProvider = (provider: EmailProvider, region: string): string => {
  switch (provider) {
    case 'ses':
      return region ? `email-smtp.${region}.amazonaws.com` : '';
    case 'sendgrid':
      return 'smtp.sendgrid.net';
    case 'mailgun':
      return 'smtp.mailgun.org';
    case 'brevo':
      return 'smtp-relay.brevo.com';
    default:
      return '';
  }
};

const defaultPortByProvider = (_provider: EmailProvider): number => 587;

const parseBooleanEnv = (value: unknown): boolean | undefined => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

/**
 * Environment configuration is deliberately opt-in. The normal path below
 * continues to resolve database-backed settings first.
 */
export const normalizeEnvironmentEmailSettings = (env: NodeJS.ProcessEnv = process.env): EmailSettings | null => {
  const provider = parseProvider(env.EMAIL_PROVIDER || 'smtp');
  const host = pickFirstString(env.EMAIL_HOST);
  const portValue = String(env.EMAIL_PORT || '').trim();
  const port = Number(portValue);
  const fromName = pickFirstString(env.EMAIL_FROM_NAME);
  const fromEmail = pickFirstString(env.EMAIL_FROM_EMAIL);
  const encryption = String(env.EMAIL_ENCRYPTION || '').trim().toLowerCase() as EmailEncryption;
  const secure = parseBooleanEnv(env.EMAIL_SECURE);
  const requireTLS = parseBooleanEnv(env.EMAIL_REQUIRE_TLS);
  const allowUnauthenticated = parseBooleanEnv(env.EMAIL_ALLOW_UNAUTHENTICATED) === true;

  if (
    !host ||
    !portValue ||
    !Number.isInteger(port) ||
    port <= 0 ||
    !fromName ||
    !fromEmail ||
    !isLikelyEmail(fromEmail) ||
    !['tls', 'ssl', 'none'].includes(encryption)
  ) {
    return null;
  }

  const effectiveSecure = secure ?? encryption === 'ssl';
  const effectiveRequireTLS = requireTLS ?? encryption === 'tls';
  if ((encryption === 'ssl' && effectiveRequireTLS) || (effectiveSecure && effectiveRequireTLS)) {
    return null;
  }

  return {
    provider,
    host,
    port,
    username: pickFirstString(env.EMAIL_USER) || undefined,
    password: pickFirstString(env.EMAIL_PASS) || undefined,
    secure: effectiveSecure,
    encryption,
    requireTLS: effectiveRequireTLS,
    allowUnauthenticated,
    fromName,
    fromEmail
  };
};

export const normalizeEmailSettings = (raw: any): EmailSettings | null => {
  const source = raw || {};
  const provider = parseProvider(source.provider || process.env.EMAIL_PROVIDER);

  const region = pickFirstString(
    source.region,
    source.sesRegion,
    source.ses_region,
    process.env.SES_REGION,
    process.env.AWS_REGION,
    process.env.AWS_DEFAULT_REGION
  );
  const domain = pickFirstString(
    source.domain,
    source.mailgunDomain,
    source.mailgun_domain,
    process.env.MAILGUN_DOMAIN
  );
  const apiKey = pickFirstString(
    source.apiKey,
    source.api_key,
    source.sendgridApiKey,
    source.sendgrid_api_key,
    source.mailgunApiKey,
    source.mailgun_api_key,
    process.env.SENDGRID_API_KEY,
    process.env.MAILGUN_API_KEY
  );
  const accessKeyId = pickFirstString(
    source.accessKeyId,
    source.access_key_id,
    source.sesAccessKeyId,
    source.ses_access_key_id,
    process.env.AWS_ACCESS_KEY_ID
  );
  const secretAccessKey = pickFirstString(
    source.secretAccessKey,
    source.secret_access_key,
    source.sesSecretAccessKey,
    source.ses_secret_access_key,
    process.env.AWS_SECRET_ACCESS_KEY
  );

  const defaultHost = defaultHostByProvider(provider, region);
  const host = pickFirstString(source.host, process.env.EMAIL_HOST, defaultHost);
  const defaultPort = defaultPortByProvider(provider);
  const parsedPort = Number(source.port ?? process.env.EMAIL_PORT ?? defaultPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? Math.floor(parsedPort) : defaultPort;

  let username = pickFirstString(source.username, source.user, process.env.EMAIL_USER);
  let password = pickFirstString(source.password, source.pass, process.env.EMAIL_PASS);

  if (provider === 'ses') {
    username = pickFirstString(
      source.username,
      source.user,
      source.sesSmtpUsername,
      source.ses_smtp_username,
      process.env.SES_SMTP_USERNAME,
      process.env.EMAIL_USER
    );
    password = pickFirstString(
      source.password,
      source.pass,
      source.sesSmtpPassword,
      source.ses_smtp_password,
      process.env.SES_SMTP_PASSWORD,
      process.env.EMAIL_PASS
    );
  } else if (provider === 'sendgrid') {
    username = pickFirstString(
      source.username,
      source.user,
      process.env.SENDGRID_SMTP_USERNAME,
      process.env.EMAIL_USER,
      apiKey ? 'apikey' : ''
    );
    password = pickFirstString(
      source.password,
      source.pass,
      process.env.SENDGRID_SMTP_PASSWORD,
      process.env.EMAIL_PASS,
      apiKey
    );
  } else if (provider === 'mailgun') {
    const inferredUser = domain ? `postmaster@${domain}` : '';
    username = pickFirstString(
      source.username,
      source.user,
      source.mailgunSmtpUsername,
      source.mailgun_smtp_username,
      process.env.MAILGUN_SMTP_USERNAME,
      process.env.EMAIL_USER,
      inferredUser
    );
    password = pickFirstString(
      source.password,
      source.pass,
      source.mailgunSmtpPassword,
      source.mailgun_smtp_password,
      process.env.MAILGUN_SMTP_PASSWORD,
      process.env.EMAIL_PASS,
      apiKey
    );
  } else if (provider === 'brevo') {
    username = pickFirstString(
      source.username,
      source.user,
      source.brevoSmtpLogin,
      source.brevo_smtp_login,
      process.env.BREVO_SMTP_LOGIN,
      process.env.EMAIL_USER
    );
    password = pickFirstString(
      source.password,
      source.pass,
      source.brevoSmtpKey,
      source.brevo_smtp_key,
      source.brevoSmtpPassword,
      source.brevo_smtp_password,
      process.env.BREVO_SMTP_KEY,
      process.env.BREVO_SMTP_PASSWORD,
      process.env.EMAIL_PASS
    );
  }

  const encryption = parseEncryption(source.encryption ?? source.smtpEncryption ?? source.smtp_encryption);
  const secure = source.secure !== undefined ? Boolean(source.secure) : encryption === 'ssl' || port === 465;
  const fromName = pickFirstString(source.fromName, source.from_name, process.env.EMAIL_FROM_NAME, 'Scrolith');
  const fromEmail = pickFirstString(
    source.fromEmail,
    source.from_email,
    process.env.EMAIL_FROM_EMAIL,
    'noreply@Scrolith.com'
  );

  if (!host || !port) {
    return null;
  }

  return {
    provider,
    host,
    port,
    username: username || undefined,
    password: password || undefined,
    secure: Boolean(secure),
    encryption,
    fromName,
    fromEmail,
    apiKey: apiKey || undefined,
    domain: domain || undefined,
    region: region || undefined,
    accessKeyId: accessKeyId || undefined,
    secretAccessKey: secretAccessKey || undefined
  };
};

export const validateEmailSettings = (settings: EmailSettings | null): string[] => {
  if (!settings) return ['Email host and port are required'];

  const errors: string[] = [];
  if (!settings.host) errors.push('Email host is required');
  if (!settings.port || Number(settings.port) <= 0) errors.push('A valid email port is required');
  if (!settings.fromName) errors.push('From name is required');
  if (!settings.fromEmail || !isLikelyEmail(settings.fromEmail)) {
    errors.push('A valid from email address is required');
  }

  if (settings.provider === 'smtp' || settings.provider === 'ses') {
    if (!settings.allowUnauthenticated) {
      if (!settings.username) errors.push(`${settings.provider.toUpperCase()} username is required`);
      if (!settings.password) errors.push(`${settings.provider.toUpperCase()} password is required`);
    }
  }

  if (settings.provider === 'brevo') {
    if (!settings.username) errors.push('Brevo SMTP login is required');
    if (!settings.password) errors.push('Brevo SMTP key is required');
  }

  if (settings.provider === 'sendgrid') {
    if (!settings.password && !settings.apiKey) {
      errors.push('SendGrid API key or SMTP password is required');
    }
    if (!settings.username && !settings.apiKey) {
      errors.push('SendGrid SMTP username is required when API key is not provided');
    }
  }

  if (settings.provider === 'mailgun') {
    if (!settings.username && !settings.domain) {
      errors.push('Mailgun SMTP username or domain is required');
    }
    if (!settings.password && !settings.apiKey) {
      errors.push('Mailgun API key or SMTP password is required');
    }
  }

  return errors;
};

export const buildEmailTransportOptions = (settings: EmailSettings) => {
  const secure = Boolean(settings.secure ?? (settings.encryption === 'ssl' || settings.port === 465));
  const authUser =
    settings.username ||
    (settings.provider === 'sendgrid' && (settings.apiKey || settings.password) ? 'apikey' : undefined);
  const authPass = settings.password || settings.apiKey || undefined;

  const transport: Record<string, any> = {
    host: settings.host,
    port: settings.port,
    secure
  };

  if (settings.requireTLS !== undefined) transport.requireTLS = settings.requireTLS;
  else if (settings.encryption === 'tls') transport.requireTLS = true;
  if (settings.encryption === 'none') transport.ignoreTLS = true;
  if (authUser && authPass) transport.auth = { user: authUser, pass: authPass };

  return transport;
};

export const createEmailTransporter = (settings: EmailSettings) => {
  return nodemailer.createTransport(buildEmailTransportOptions(settings));
};

export const getEmailSettings = async (): Promise<EmailSettings | null> => {
  if (String(process.env.EMAIL_CONFIG_SOURCE || '').trim() === 'environment') {
    return normalizeEnvironmentEmailSettings();
  }

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

export type SmtpReadinessResult = {
  ready: boolean;
  errorCategory?: 'timeout' | 'connection_refused' | 'dns' | 'tls' | 'connection_error' | 'invalid_configuration';
};

const classifyConnectionError = (error: any): SmtpReadinessResult['errorCategory'] => {
  if (error?.code === 'ETIMEDOUT') return 'timeout';
  if (error?.code === 'ECONNREFUSED') return 'connection_refused';
  if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') return 'dns';
  if (error?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || error?.code === 'EPROTO') return 'tls';
  return 'connection_error';
};

/** Opens and closes a bounded TCP/TLS connection without speaking SMTP. */
export const checkSmtpReadiness = async (
  settings: EmailSettings | null,
  timeoutMs = 2_000
): Promise<SmtpReadinessResult> => {
  if (!settings?.host || !settings.port) return { ready: false, errorCategory: 'invalid_configuration' };
  const boundedTimeout = Math.max(250, Math.min(timeoutMs, 5_000));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SmtpReadinessResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const socket = settings.secure
      ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host })
      : net.createConnection({ host: settings.host, port: settings.port });

    socket.setTimeout(boundedTimeout, () => {
      socket.destroy();
      finish({ ready: false, errorCategory: 'timeout' });
    });
    socket.once('secureConnect', () => {
      socket.end();
      finish({ ready: true });
    });
    socket.once('connect', () => {
      if (!settings.secure) {
        socket.end();
        finish({ ready: true });
      }
    });
    socket.once('error', (error) => {
      socket.destroy();
      finish({ ready: false, errorCategory: classifyConnectionError(error) });
    });
  });
};

const classifyEmailError = (error: any): string => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ETIMEDOUT') return 'timeout';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'EAUTH' || /auth|credentials|authentication/i.test(String(error?.message || ''))) return 'authentication';
  if (/tls|certificate|secure/i.test(String(error?.message || ''))) return 'tls';
  return 'smtp_error';
};

const getTransporter = async (): Promise<any | null> => {
  const settings = await getEmailSettings();
  if (!settings) return null;
  const validationErrors = validateEmailSettings(settings);
  if (validationErrors.length) {
    console.warn('[email] Invalid email settings:', validationErrors.join('; '));
    return null;
  }

  const signature = JSON.stringify({
    provider: settings.provider,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    encryption: settings.encryption,
    username: settings.username,
    password: settings.password,
    apiKey: settings.apiKey
  });

  if (cachedTransporter && cachedSignature === signature) {
    return cachedTransporter;
  }

  cachedTransporter = createEmailTransporter(settings);
  cachedSignature = signature;
  return cachedTransporter;
};

export const sendSystemEmail = async (payload: EmailSendInput): Promise<{ success: boolean; error?: string }> => {
  const settings = await getEmailSettings();
  const validationErrors = validateEmailSettings(settings);
  if (validationErrors.length) {
    console.warn('[email] delivery outcome', { outcome: 'rejected', errorCategory: 'invalid_configuration' });
    return { success: false, error: validationErrors[0] };
  }

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[email] delivery outcome', { outcome: 'rejected', errorCategory: 'transporter_unavailable' });
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
    console.info('[email] delivery outcome', { outcome: 'sent', transport: settings.provider });
    return { success: true };
  } catch (error: any) {
    const errorCategory = classifyEmailError(error);
    console.warn('[email] delivery outcome', { outcome: 'failed', errorCategory });
    return { success: false, error: errorCategory };
  }
};
