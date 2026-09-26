// apps/api/test/support/test-database.ts
//
// Shared helpers for integration tests. They run against a REAL PostgreSQL with all migrations
// applied (CI: service container; locally: a Neon branch or any Postgres with pgvector).
// Ledger and audit tables are append-only by design, so tests never clean up; every test run
// uses unique keys (RUN_ID) instead.
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export const RUN_ID = `it_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Integration tests need DATABASE_URL pointing at a migrated PostgreSQL database.');
  }
  return url;
}

export function createTestPrisma(): PrismaService {
  const config = new ConfigService<Env, true>({
    DATABASE_URL: requireDatabaseUrl(),
    DATABASE_POOL_MAX: Number(process.env.DATABASE_POOL_MAX ?? 5),
  } as Partial<Env>);
  return new PrismaService(config);
}

export function uniqueSlug(label: string): string {
  return `${label}-${RUN_ID}-${randomUUID().slice(0, 6)}`;
}
