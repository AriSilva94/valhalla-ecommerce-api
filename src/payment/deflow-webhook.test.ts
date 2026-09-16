import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { parseDeflowWebhook, verifyDeflowSignature } from './deflow-webhook';

describe('Deflow webhook', () => {
  it('verifica assinatura sobre o corpo bruto e aceita apenas evento liquidado', () => {
    const raw = '{"id":"evt-1","event":"deposit.completed","data":{"id":"dep-1"}}';
    const timestamp = 1700000000;
    const signature = createHmac('sha256', 'secret').update(`${timestamp}.${raw}`).digest('hex');
    expect(verifyDeflowSignature(raw, `t=${timestamp}, v1=${signature}`, 'secret', timestamp * 1000)).toBe(true);
    expect(parseDeflowWebhook(JSON.parse(raw))).toMatchObject({ provider: 'deflow', status: 'paid', providerCheckoutId: 'dep-1' });
    expect(parseDeflowWebhook({ id: 'evt-2', event: 'deposit.approved', data: { id: 'dep-1' } })).toBeNull();
  });
});
