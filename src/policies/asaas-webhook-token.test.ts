import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import policy from './asaas-webhook-token';

const ORIGINAL_ENV = process.env.ASAAS_WEBHOOK_TOKEN;

function buildContext(headerValue?: string): any {
  return {
    request: { header: headerValue === undefined ? {} : { 'asaas-access-token': headerValue } },
  };
}

describe('asaas-webhook-token policy', () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'expected-webhook-token';
  });

  afterEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = ORIGINAL_ENV;
  });

  it('permite quando o header bate com ASAAS_WEBHOOK_TOKEN', () => {
    expect(policy(buildContext('expected-webhook-token'), {}, { strapi: {} as never })).toBe(true);
  });

  it('nega quando o header não bate', () => {
    expect(policy(buildContext('wrong'), {}, { strapi: {} as never })).toBe(false);
  });

  it('nega quando o header está ausente', () => {
    expect(policy(buildContext(undefined), {}, { strapi: {} as never })).toBe(false);
  });

  it('nega quando ASAAS_WEBHOOK_TOKEN não está configurado', () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    expect(policy(buildContext('anything'), {}, { strapi: {} as never })).toBe(false);
  });
});
