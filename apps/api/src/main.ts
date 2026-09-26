// apps/api/src/main.ts
//
// AbotKamay API bootstrap (NestJS 12, ESM, Fastify adapter).
//
// Security- and correctness-relevant choices made here:
// - rawBody: true   -> payment webhook signatures are verified against the exact bytes received.
// - BigInt-safe JSON -> money is BigInt in minor units; responses serialize it as a string.
// - helmet + strict CORS allowlist; request body size capped.
// - Graceful shutdown hooks so in-flight DB transactions finish before the process exits.
// - Client IPs: the web server's report of the visitor's address is trusted only with the shared
//   FORWARDED_IP_SECRET (common/http/request-meta.ts).
import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module.js';
import { bigintSafeJsonStringify } from './common/http/bigint-json.js';
import { trustForwardedClientIp } from './common/http/request-meta.js';
import type { Env } from './config/env.schema.js';

const BODY_LIMIT_BYTES = 1_048_576; // 1 MiB: webhooks and JSON APIs only; media goes to presigned S3 uploads

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: true, // behind Render's edge (or CloudFront/ALB): request.ip comes from X-Forwarded-For
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    rawBody: true,
    bufferLogs: true,
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const logger = new Logger('AbotKamay');
  trustForwardedClientIp(config.get('FORWARDED_IP_SECRET', { infer: true }));

  // Money is BigInt everywhere; JSON.stringify cannot serialize BigInt, so every reply goes through
  // a serializer that renders BigInt as a decimal string ("50000"), never as a lossy JS number.
  app
    .getHttpAdapter()
    .getInstance()
    .setReplySerializer((payload) => bigintSafeJsonStringify(payload));

  await app.register(helmet, {
    contentSecurityPolicy: false, // pure JSON API; the web app sets its own CSP
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    // The web client backs off on Retry-After and logs X-Request-Id (apps/web/lib/api.ts).
    exposedHeaders: ['Retry-After', 'X-Request-Id'],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Request validation uses Zod per route (see common/validation/zod-validation.pipe.ts).
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen({ port, host: '0.0.0.0' });
  logger.log(`${config.get('APP_NAME', { infer: true })} API listening on http://localhost:${port}/api/v1`);
}

await bootstrap();
