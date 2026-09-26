// apps/api/src/common/ids/uuidv7.spec.ts
import { isUuid, uuidv7 } from './uuidv7.js';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 ids', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('starts with the timestamp, so ids sort by creation time', () => {
    const at = Date.parse('2026-09-25T04:00:00.000Z');
    const id = uuidv7(at);
    expect(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(at);
    expect(uuidv7(at) < uuidv7(at + 1)).toBe(true);
  });
});
