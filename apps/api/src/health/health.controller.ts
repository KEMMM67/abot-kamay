// apps/api/src/health/health.controller.ts
//
// GET /api/v1/health/live   -> process is up (no dependencies checked)
// GET /api/v1/health/ready  -> database reachable AND every migration shipped with this build applied.
//                              The load balancer (and Render's deploy health check) routes traffic
//                              only to ready instances, so a build that expects a newer schema never
//                              serves requests against an older database: the deploy fails and the
//                              previous version keeps running until the migrations are applied.
import { readdirSync } from 'node:fs';
import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Migration folders in this build (prisma/migrations/<timestamp>_<name>), next to src/ and dist/. */
function bundledMigrations(logger: Logger): string[] | null {
  try {
    return readdirSync(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    logger.warn('prisma/migrations is not in this build: /health/ready cannot check for pending migrations');
    return null;
  }
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly expectedMigrations = bundledMigrations(this.logger);
  /** Applied migrations never disappear, so once they are all there the check is skipped. */
  private schemaCurrent = false;

  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok'; service: 'abotkamay-api' } {
    return { status: 'ok', service: 'abotkamay-api' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    const pending = await this.pendingMigrations();
    if (pending.length > 0) {
      throw new ServiceUnavailableException({ status: 'error', database: 'up', pendingMigrations: pending });
    }
    return { status: 'ok', database: 'up' };
  }

  private async pendingMigrations(): Promise<string[]> {
    if (this.schemaCurrent || !this.expectedMigrations) return [];
    let applied: Set<string>;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      applied = new Set(rows.map((row) => row.migration_name));
    } catch {
      return this.expectedMigrations; // no _prisma_migrations table: nothing was ever migrated
    }
    const pending = this.expectedMigrations.filter((name) => !applied.has(name));
    if (pending.length === 0) this.schemaCurrent = true;
    else this.logger.error(`Pending database migrations: ${pending.join(', ')} (see DEPLOYMENT.md)`);
    return pending;
  }
}
