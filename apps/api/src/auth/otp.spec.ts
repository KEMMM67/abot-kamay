// apps/api/src/auth/otp.spec.ts
import {
  generateOtpCode,
  hashOtp,
  hashSessionToken,
  isWellFormedOtp,
  isWellFormedSessionToken,
  maskPhone,
  newSessionToken,
  normalizePhMobile,
  otpSmsMessage,
} from './otp.js';

describe('normalizePhMobile', () => {
  it.each([
    ['0917 123 4567', '+639171234567'],
    ['0917-123-4567', '+639171234567'],
    ['(0917) 123.4567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
  ])('accepts %s', (raw, expected) => {
    expect(normalizePhMobile(raw)).toBe(expected);
  });

  it.each(['02 8123 4567', '0917 123 456', '+1 415 555 0100', 'call me', ''])('rejects %s', (raw) => {
    expect(normalizePhMobile(raw)).toBeNull();
  });
});

describe('one-time codes', () => {
  it('are six digits, keyed by secret and challenge', () => {
    const code = generateOtpCode();
    expect(isWellFormedOtp(code)).toBe(true);

    const secret = Buffer.from('s'.repeat(32));
    const hash = hashOtp(secret, 'challenge-1', '123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp(secret, 'challenge-1', '123456')).toBe(hash);
    expect(hashOtp(secret, 'challenge-2', '123456')).not.toBe(hash);
    expect(hashOtp(Buffer.from('t'.repeat(32)), 'challenge-1', '123456')).not.toBe(hash);
  });

  it('warns against sharing the code, in Filipino', () => {
    expect(otpSmsMessage('482913', 5)).toBe(
      '482913 ang AbotKamay code mo. Valid ito nang 5 minuto. Huwag itong ibigay kahit kanino, kahit sa nagpapakilalang taga-AbotKamay.',
    );
  });
});

describe('session tokens', () => {
  it('are 256-bit random tokens stored only as sha256', () => {
    const first = newSessionToken();
    const second = newSessionToken();
    expect(isWellFormedSessionToken(first.token)).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashSessionToken(first.token));
    expect(first.tokenHash).not.toContain(first.token.slice(4));
  });

  it('rejects anything that is not a session token before touching the database', () => {
    expect(isWellFormedSessionToken('aks_short')).toBe(false);
    expect(isWellFormedSessionToken(`Bearer aks_${'a'.repeat(43)}`)).toBe(false);
  });
});

it('masks a phone number down to what its owner recognizes', () => {
  expect(maskPhone('+639171234567')).toBe('0917 ••• 4567');
});
