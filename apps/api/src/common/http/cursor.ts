// apps/api/src/common/http/cursor.ts
//
// Opaque cursors for "cursor pagination everywhere" (TECHNICAL_PLAN.md 2.8). A cursor is the sort
// key of the last row a client saw, base64url-encoded so clients treat it as a token, not an API.
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const PageQuerySchema = z.object({
  cursor: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(parts.join('|'), 'utf8').toString('base64url');
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({ message: 'Invalid cursor', code: 'INVALID_CURSOR' });
}

/** Decodes a cursor made by encodeCursor with the expected number of parts, or answers 400. */
export function decodeCursor(cursor: string, partCount: number): string[] {
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (parts.length !== partCount || parts.some((part) => part === '')) throw invalidCursor();
  return parts;
}

/** Keyset cursor over (timestamp, id): the usual "newest first" or "oldest first" list position. */
export function encodeTimeCursor(at: Date, id: string): string {
  return encodeCursor([at.toISOString(), id]);
}

export function decodeTimeCursor(cursor: string): { at: Date; id: string } {
  const [iso = '', id = ''] = decodeCursor(cursor, 2);
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw invalidCursor();
  return { at, id };
}
