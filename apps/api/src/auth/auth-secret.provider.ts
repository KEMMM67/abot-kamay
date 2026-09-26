// apps/api/src/auth/auth-secret.provider.ts
//
// Key for the HMACs over one-time codes and KYC challenge codes. validateEnv requires AUTH_SECRET in
// staging and production; development and test get a random per-process key, so codes issued before
// a restart simply stop working.
import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Env } from '../config/env.schema.js';

export const AUTH_SECRET = Symbol('AUTH_SECRET');

export const authSecretProvider: Provider = {
  provide: AUTH_SECRET,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Buffer => {
    const configured = config.get('AUTH_SECRET', { infer: true });
    if (configured) return Buffer.from(configured, 'utf8');
    new Logger('AuthSecret').warn(
      'AUTH_SECRET is not set: using a random key for this process. Sign-in and KYC challenge codes stop working after a restart.',
    );
    return randomBytes(32);
  },
};
