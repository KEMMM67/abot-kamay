// apps/api/src/config/env.schema.spec.ts
import { validateEnv, validateWorkerEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/abotkamay';

describe('environment contract', () => {
  it('refuses to start the API in production without AUTH_SECRET', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', DATABASE_URL })).toThrow(/AUTH_SECRET/);
  });

  it("refuses to start the API in production without the web server's IP forwarding secret", () => {
    const base = { NODE_ENV: 'production', DATABASE_URL, AUTH_SECRET: 'a'.repeat(32) };
    expect(() => validateEnv(base)).toThrow(/FORWARDED_IP_SECRET/);
    expect(() => validateEnv({ ...base, FORWARDED_IP_SECRET: 'too-short' })).toThrow(/FORWARDED_IP_SECRET/);
    expect(validateEnv({ ...base, FORWARDED_IP_SECRET: 'f'.repeat(32) }).FORWARDED_IP_SECRET).toBe(
      'f'.repeat(32),
    );
    // Development runs without it: the web server's calls are then attributed to its own address.
    expect(validateEnv({ DATABASE_URL }).FORWARDED_IP_SECRET).toBeUndefined();
  });

  it('never lets production print sign-in codes to the logs', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', DATABASE_URL, AUTH_SECRET: 'x'.repeat(32), SMS_PROVIDER: 'log' }),
    ).toThrow(/SMS_PROVIDER/);
  });

  it('starts the media worker without the sign-in secret, but not without its buckets', () => {
    expect(() => validateWorkerEnv({ NODE_ENV: 'production', DATABASE_URL })).toThrow(
      /MEDIA_QUARANTINE_BUCKET[\s\S]*MEDIA_PUBLIC_BUCKET/,
    );
    const env = validateWorkerEnv({
      NODE_ENV: 'production',
      DATABASE_URL,
      MEDIA_QUARANTINE_BUCKET: 'abotkamay-quarantine',
      MEDIA_PUBLIC_BUCKET: 'abotkamay-public',
    });
    expect(env).toMatchObject({ MEDIA_WORKER_MAX_ATTEMPTS: 6, FFMPEG_PATH: 'ffmpeg' });
    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it('reads Cloudflare R2 settings', () => {
    const env = validateEnv({
      DATABASE_URL,
      MEDIA_S3_REGION: 'auto',
      MEDIA_S3_ENDPOINT: 'https://0123456789abcdef.r2.cloudflarestorage.com',
      MEDIA_S3_FORCE_PATH_STYLE: 'true',
    });
    expect(env).toMatchObject({ MEDIA_S3_REGION: 'auto', MEDIA_S3_FORCE_PATH_STYLE: true });
  });
});
