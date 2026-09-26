// apps/api/src/health/health.controller.spec.ts
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

const SHIPPED = [
  '20260925000000_init',
  '20260925000100_ledger_guarantees',
  '20260925000200_creator_posts_kyc',
];

/** $queryRaw stand-in: answers SELECT 1 and the _prisma_migrations query. */
function fakePrisma({ up = true, applied }: { up?: boolean; applied: string[] | 'no-table' }) {
  const calls: string[] = [];
  const $queryRaw = async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    calls.push(sql);
    if (!up) throw new Error('connection refused');
    if (sql.includes('_prisma_migrations')) {
      if (applied === 'no-table') throw new Error('relation "_prisma_migrations" does not exist');
      return applied.map((migration_name) => ({ migration_name }));
    }
    return [{ '?column?': 1 }];
  };
  return { prisma: { $queryRaw } as unknown as PrismaService, calls };
}

describe('GET /health/ready', () => {
  it('is ready once every migration shipped in this build is applied, then stops asking', async () => {
    const { prisma, calls } = fakePrisma({ applied: SHIPPED });
    const health = new HealthController(prisma);
    await expect(health.ready()).resolves.toEqual({ status: 'ok', database: 'up' });
    await expect(health.ready()).resolves.toEqual({ status: 'ok', database: 'up' });
    expect(calls.filter((sql) => sql.includes('_prisma_migrations'))).toHaveLength(1);
  });

  it('is not ready while a migration is pending, and says which', async () => {
    const { prisma } = fakePrisma({ applied: SHIPPED.slice(0, 2) });
    await expect(new HealthController(prisma).ready()).rejects.toMatchObject({
      response: { database: 'up', pendingMigrations: ['20260925000200_creator_posts_kyc'] },
    });
  });

  it('is not ready on a database that was never migrated', async () => {
    const { prisma } = fakePrisma({ applied: 'no-table' });
    await expect(new HealthController(prisma).ready()).rejects.toMatchObject({
      response: { pendingMigrations: SHIPPED },
    });
  });

  it('is not ready when the database is down', async () => {
    const { prisma } = fakePrisma({ up: false, applied: SHIPPED });
    await expect(new HealthController(prisma).ready()).rejects.toMatchObject({
      response: { status: 'error', database: 'down' },
    });
  });
});
