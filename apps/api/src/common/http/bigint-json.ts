// apps/api/src/common/http/bigint-json.ts
//
// Money is stored and computed as BigInt minor units (centavos). JSON has no BigInt, and converting
// to Number silently loses precision above 2^53, so AbotKamay always sends BigInt as a string.

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function bigintSafeJsonStringify(payload: unknown): string {
  return JSON.stringify(payload, bigintReplacer);
}
