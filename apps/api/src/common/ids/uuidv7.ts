// apps/api/src/common/ids/uuidv7.ts
//
// UUIDv7 (RFC 9562): 48-bit Unix milliseconds, then random bits. Prisma generates these for rows it
// creates; the API generates one itself when it needs the id first, e.g. to build a media storage key
// before the row exists. Time-ordered ids keep B-tree inserts at the end of the index.
import { randomBytes } from 'node:crypto';

export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  let millis = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(millis & 0xffn);
    millis >>= 8n;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 9562 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
