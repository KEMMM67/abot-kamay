// apps/api/src/prisma/prisma.service.ts
//
// Prisma 7 requires a driver adapter at runtime. AbotKamay runs as a long-lived Node server, so it
// uses @prisma/adapter-pg (node-postgres over TCP) against Neon's POOLED endpoint (DATABASE_URL).
// For serverless/edge deployments, swap in @prisma/adapter-neon (WebSocket/HTTP driver).
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: config.get('DATABASE_POOL_MAX', { infer: true }),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000, // Neon computes may be resuming from scale-to-zero
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
