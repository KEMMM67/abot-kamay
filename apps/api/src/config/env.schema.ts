// apps/api/src/config/env.schema.ts
//
// Environment contract for the AbotKamay API. The app refuses to start with a missing or malformed
// setting, instead of failing later in the middle of a donation.
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const optionalSecret = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

/** Optional setting where an empty value (KEY= in .env) means "not set". */
const optionalValue = optionalSecret;

const optionalLongSecret = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.string().min(32, 'must be at least 32 characters').optional())
  .optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('AbotKamay'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Shared with the web app's server (Vercel), which reports each visitor's IP address with it. Without
  // it, calls from the web server are attributed to the server's own address: every visitor would share
  // one per-IP sign-in limit, and audit rows would record Vercel's address.
  FORWARDED_IP_SECRET: optionalLongSecret,

  // Neon pooled connection string for the running app (see .env.example).
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/.+/, 'DATABASE_URL must be a PostgreSQL connection string (postgresql://...)'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Payment gateways: each provider's webhook route is disabled (404) until its secret is set.
  PAYMONGO_WEBHOOK_SECRET: optionalSecret,
  XENDIT_CALLBACK_TOKEN: optionalSecret,
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),

  // AI
  ANTHROPIC_API_KEY: optionalSecret,
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_SCREENING_ENABLED: booleanFromString.default(true),

  // Sign-in. AUTH_SECRET keys the HMACs for one-time codes and KYC challenge codes. Required in
  // staging and production; development and test fall back to a random per-process secret.
  AUTH_SECRET: optionalLongSecret,
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  // "log" prints one-time codes to the API log instead of sending an SMS. Development and test only.
  SMS_PROVIDER: z.enum(['none', 'log']).default('none'),

  // Creator KYC
  KYC_REVERIFY_MONTHS: z.coerce.number().int().min(1).max(60).default(24),
  KYC_MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CREATOR_MAX_OPEN_CAMPAIGNS: z.coerce.number().int().min(1).max(20).default(3),

  // Media storage (S3 or an S3-compatible store). Uploads answer 503 until the buckets are set.
  MEDIA_S3_REGION: z.string().trim().default('ap-southeast-1'), // "auto" for Cloudflare R2
  MEDIA_S3_ENDPOINT: optionalValue, // e.g. https://<account>.r2.cloudflarestorage.com; empty for AWS
  MEDIA_S3_FORCE_PATH_STYLE: booleanFromString.default(false),
  MEDIA_QUARANTINE_BUCKET: optionalValue, // every post, consent and receipt upload lands here first
  MEDIA_RESTRICTED_BUCKET: optionalValue, // government IDs and selfies; never public
  MEDIA_PUBLIC_BUCKET: optionalValue, // the media worker writes public copies here (served by the CDN)
  MEDIA_PUBLIC_BASE_URL: optionalValue, // CDN origin of the public bucket, e.g. https://media.abotkamay.ph

  // Media worker (node dist/worker.js): turns moderated uploads into public copies.
  MEDIA_WORKER_POLL_SECONDS: z.coerce.number().int().min(1).max(300).default(5),
  MEDIA_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(6),
  /** Wall-clock limit for one ffmpeg run; a stuck encode is killed and retried later. */
  MEDIA_WORKER_FFMPEG_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3_600).default(900),
  FFMPEG_PATH: z.string().trim().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
  /** libheif's converter (Debian package libheif-examples): iPhone HEIC photos to JPEG. */
  HEIF_CONVERT_PATH: z.string().trim().min(1).default('heif-convert'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `api` is the HTTP server (dist/main.js). `worker` is the media worker (dist/worker.js): it never
 * signs anyone in, so it does not need AUTH_SECRET, but it can't work without its buckets.
 */
export type ProcessRole = 'api' | 'worker';

export function validateEnv(raw: Record<string, unknown>, role: ProcessRole = 'api'): Env {
  const parsed = envSchema
    .superRefine((env, ctx) => {
      const deployed = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
      if (role === 'api' && deployed && !env.AUTH_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_SECRET'],
          message: `is required when NODE_ENV=${env.NODE_ENV}`,
        });
      }
      if (role === 'api' && deployed && !env.FORWARDED_IP_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['FORWARDED_IP_SECRET'],
          message: `is required when NODE_ENV=${env.NODE_ENV} (the web app's server reports visitor IPs with it)`,
        });
      }
      if (role === 'api' && deployed && env.SMS_PROVIDER === 'log') {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_PROVIDER'],
          message: '"log" would write one-time codes to the logs; it is for development and test only',
        });
      }
      if (role === 'worker') {
        for (const key of ['MEDIA_QUARANTINE_BUCKET', 'MEDIA_PUBLIC_BUCKET'] as const) {
          if (!env[key])
            ctx.addIssue({ code: 'custom', path: [key], message: 'is required by the media worker' });
        }
      }
    })
    .safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`AbotKamay ${role} configuration is invalid:\n${problems}`);
  }
  return parsed.data;
}

export function validateWorkerEnv(raw: Record<string, unknown>): Env {
  return validateEnv(raw, 'worker');
}
