// apps/api/prisma.config.ts
//
// Prisma ORM 7 configuration for AbotKamay.
//
// How the pieces fit in Prisma 7:
// - The Prisma CLI (migrate, validate, generate, studio) reads the connection URL from THIS file.
//   The URL is no longer allowed inside schema.prisma.
// - At runtime the app does not use this URL. PrismaClient is constructed with a driver adapter
//   (@prisma/adapter-pg over TCP) in src/prisma/prisma.service.ts, using DATABASE_URL (Neon pooled).
// - Neon: migrations must run over the DIRECT (non-pooled) connection because Neon's pooler runs
//   PgBouncer in transaction mode. Set DIRECT_DATABASE_URL; it falls back to DATABASE_URL.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env files. Load apps/api/.env first, then the repo-root .env.
loadEnv({ path: ['.env', '../../.env'], quiet: true });

const migrationUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Commands that do not touch the database (generate, validate, format) work without a URL,
    // so `npm ci` succeeds in CI before secrets are available.
    url: migrationUrl ?? '',
  },
});
