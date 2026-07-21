/**
 * RFC 6238 TOTP (Google Authenticator compatible) — pure Node crypto, no external OTP deps.
 */
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const generateBase32Secret = (byteLength = 20): string => {
  const bytes = crypto.randomBytes(byteLength);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
};

const base32Decode = (input: string): Buffer => {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
};

const hotp = (secret: Buffer, counter: number, digits = 6): string => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, '0');
};

export const generateTotp = (secretBase32: string, stepSeconds = 30, digits = 6): string => {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  return hotp(secret, counter, digits);
};

export const verifyTotp = (
  secretBase32: string,
  token: string,
  opts?: { window?: number; stepSeconds?: number; digits?: number }
): boolean => {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const window = opts?.window ?? 1;
  const step = opts?.stepSeconds ?? 30;
  const digits = opts?.digits ?? 6;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w, digits) === clean) return true;
  }
  return false;
};

export const buildOtpAuthUri = (params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string => {
  const issuer = encodeURIComponent(params.issuer || 'Scrolith');
  const account = encodeURIComponent(params.accountName || 'admin');
  const secret = encodeURIComponent(params.secret);
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
};

export const generateBackupCodes = (count = 8): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
};

export const hashBackupCode = (code: string): string =>
  crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
