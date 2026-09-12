import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import policy from './internal-test-token';

const ORIGINAL_ENV = process.env.ASAAS_TEST_TOKEN;

function buildContext(headerValue?: string): any {
  return {
    request: {
      header: headerValue === undefined ? {} : { 'x-internal-test-token': headerValue },
    },
  };
}

describe('internal-test-token policy', () => {
  beforeEach(() => {
    process.env.ASAAS_TEST_TOKEN = 'expected-test-token';
  });

  afterEach(() => {
    process.env.ASAAS_TEST_TOKEN = ORIGINAL_ENV;
  });

  it('permite quando o header bate exatamente com ASAAS_TEST_TOKEN', () => {
    const result = policy(buildContext('expected-test-token'), {}, { strapi: {} as never });

    expect(result).toBe(true);
  });

  it('nega quando o header não bate', () => {
    const result = policy(buildContext('wrong-token'), {}, { strapi: {} as never });

    expect(result).toBe(false);
  });

  it('nega quando o header está ausente', () => {
    const result = policy(buildContext(undefined), {}, { strapi: {} as never });

    expect(result).toBe(false);
  });

  it('nega quando ASAAS_TEST_TOKEN não está configurado, mesmo com um header presente', () => {
    delete process.env.ASAAS_TEST_TOKEN;

    const result = policy(buildContext('anything'), {}, { strapi: {} as never });

    expect(result).toBe(false);
  });

  it('nega quando os tamanhos do header e do token divergem', () => {
    const result = policy(buildContext('short'), {}, { strapi: {} as never });

    expect(result).toBe(false);
  });
});
