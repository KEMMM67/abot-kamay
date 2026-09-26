// apps/api/src/auth/otp.ts
//
// Pure helpers for phone sign-in: number normalization, one-time codes and session tokens.
//   - One-time codes are 6 digits from a CSPRNG. Only HMAC-SHA256(AUTH_SECRET, challengeId:code) is
//     stored, so a database leak does not reveal codes that are still valid.
//   - Session tokens are 256 random bits. Only their sha256 is stored; the token itself exists in the
//     client's HttpOnly cookie and in the Authorization header of each request.
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5; // mirrors the DB CHECK otp_challenges_attempts_range

const SESSION_TOKEN_PREFIX = 'aks_';
const SESSION_TOKEN_PATTERN = /^aks_[A-Za-z0-9_-]{43}$/;

/**
 * Normalizes a Philippine mobile number to E.164 (+639XXXXXXXXX). Accepts "0917 123 4567",
 * "0917-123-4567", "+63 917 123 4567", "639171234567" and "9171234567". Same rules as the web app
 * (apps/web/lib/phone.ts).
 */
export function normalizePhMobile(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, '');
  const match = /^(?:\+?63|0)?(9\d{9})$/.exec(compact);
  return match ? `+63${match[1]}` : null;
}

/** "+639171234567" -> "0917 ••• 4567". Enough for a person to recognize their own number. */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+63/, '0');
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
}

export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export function hashOtp(secret: Buffer, challengeId: string, code: string): string {
  return createHmac('sha256', secret).update(`otp:v1:${challengeId}:${code}`, 'utf8').digest('hex');
}

export function isWellFormedOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedSessionToken(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token);
}

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashSessionToken(token) };
}

/** The SMS itself, in Filipino. It warns against sharing the code, the most common takeover trick. */
export function otpSmsMessage(code: string, ttlMinutes: number): string {
  return (
    `${code} ang AbotKamay code mo. Valid ito nang ${ttlMinutes} minuto. ` +
    'Huwag itong ibigay kahit kanino, kahit sa nagpapakilalang taga-AbotKamay.'
  );
}
