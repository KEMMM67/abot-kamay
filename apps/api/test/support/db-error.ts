// apps/api/test/support/db-error.ts
//
// Prisma 7 wraps database errors raised through driver adapters. The PostgreSQL message (for
// example "AbotKamay: ledger_entries is append-only") can sit in error.message, error.meta, or the
// cause chain depending on the operation, so assertions inspect all of them. Asserting on the
// specific database message matters: a bare `rejects.toThrow()` would also pass on a dropped
// connection, and /invalid/ would match Prisma's own "Invalid `prisma...` invocation" prefix.

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

export async function expectDbRejection(operation: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (error === null) {
    throw new Error(`Expected the database to reject the operation (${pattern}), but it succeeded.`);
  }
  expect(dbErrorText(error)).toMatch(pattern);
}
