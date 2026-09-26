// apps/api/src/common/db/db-errors.ts
//
// Recognizing the database's own refusals (unique indexes, CHECKs, AbotKamay triggers) so services
// can answer 409 or 403 instead of 500. Prisma 7 wraps driver-adapter errors, and the PostgreSQL
// message can sit in error.message, error.meta or the cause chain, so all of them are inspected.
import { Prisma } from '../../generated/prisma/client.js';

export function dbErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const meta = (current as { meta?: unknown }).meta;
      if (meta !== undefined) parts.push(JSON.stringify(meta));
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(typeof current === 'string' ? current : JSON.stringify(current));
      break;
    }
  }
  return parts.join('\n');
}

export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return true;
  return /unique constraint|duplicate key value/i.test(dbErrorText(error));
}

/** True when the database refused with a message matching `pattern` (e.g. /not KYC-verified/). */
export function isDbRefusal(error: unknown, pattern: RegExp): boolean {
  return pattern.test(dbErrorText(error));
}
