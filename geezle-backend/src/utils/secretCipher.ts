import crypto from 'crypto';
import { requiredSecret } from './security/requiredSecret';

const ENCRYPTION_PREFIX = 'enc::';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const deriveKey = () => {
  const base = process.env.SETTINGS_ENCRYPTION_KEY || requiredSecret('JWT_SECRET', 'scrolith-dev-settings-key');
  return crypto.createHash('sha256').update(String(base)).digest().subarray(0, KEY_LENGTH);
};

const buildPayload = (iv: Buffer, encrypted: Buffer, tag: Buffer) =>
  `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;

const parsePayload = (input: string) => {
  if (!input.startsWith(ENCRYPTION_PREFIX)) return null;
  const raw = input.slice(ENCRYPTION_PREFIX.length);
  const [ivHex, tagHex, dataHex] = raw.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  return {
    iv: Buffer.from(ivHex, 'hex'),
    tag: Buffer.from(tagHex, 'hex'),
    data: Buffer.from(dataHex, 'hex')
  };
};

export const isEncryptedSecret = (value: unknown) =>
  typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);

export const encryptSecret = (value: unknown): string => {
  const plain = String(value ?? '');
  if (!plain) return '';
  if (isEncryptedSecret(plain)) return plain;

  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return buildPayload(iv, encrypted, tag);
};

export const decryptSecret = (value: unknown): string => {
  const raw = String(value ?? '');
  if (!raw) return '';
  const parsed = parsePayload(raw);
  if (!parsed) return raw;
  try {
    const key = deriveKey();
    if (parsed.iv.length !== IV_LENGTH || parsed.tag.length !== AUTH_TAG_LENGTH) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    const decrypted = Buffer.concat([decipher.update(parsed.data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

export const maybeDecryptSecret = (value: unknown): string => decryptSecret(value);

export const maskSecret = (value: unknown) => {
  const raw = maybeDecryptSecret(value);
  if (!raw) return '';
  if (raw.length <= 8) return '****';
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
};
