import { describe, expect, it } from 'vitest';

import { toUtcIsoFromSaoPauloNaive } from './pixExpiration';

describe('toUtcIsoFromSaoPauloNaive', () => {
  it('converts a naive America/Sao_Paulo timestamp to the correct UTC ISO string', () => {
    expect(toUtcIsoFromSaoPauloNaive('2026-09-13 12:00:00')).toBe('2026-09-13T15:00:00.000Z');
  });
});
