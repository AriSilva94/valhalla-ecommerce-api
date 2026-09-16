import { randomUUID } from 'node:crypto';

async function main() {
  const apiUrl = (process.env.DFLOW_API_URL || 'https://api.deflow.exchange/v1').replace(/\/+$/, '');
  const keyId = process.env.DFLOW_KEY_ID;
  const secret = process.env.DFLOW_SECRET;
  const passphrase = process.env.DFLOW_PASSPHRASE;
  const payerTaxNumber = process.env.DFLOW_TEST_PAYER_TAX_NUMBER;

  if (!keyId?.startsWith('dfk_test_') || !secret || !payerTaxNumber) {
    throw new Error('Configure DFLOW_KEY_ID (dfk_test_*), DFLOW_SECRET e DFLOW_TEST_PAYER_TAX_NUMBER para testar o sandbox.');
  }

  const headers = {
  Authorization: `Bearer ${keyId}`,
  'X-DF-Secret': secret,
  ...(passphrase ? { 'X-DF-Passphrase': passphrase } : {}),
  'X-DF-Idempotency-Key': randomUUID(),
  'Content-Type': 'application/json',
  };

  const createResponse = await fetch(`${apiUrl}/deposit/create`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ amountInCents: 100, payerTaxNumber }),
});
  const created = await createResponse.json() as { data?: { id?: string; status?: string; qrCopyPaste?: string }; error?: unknown };
  if (!createResponse.ok || !created.data?.id) throw new Error(`Deflow sandbox create falhou com HTTP ${createResponse.status}.`);

  console.log(JSON.stringify({ id: created.data.id, status: created.data.status, hasQrCopyPaste: Boolean(created.data.qrCopyPaste) }));

  const markPaidResponse = await fetch(`${apiUrl}/sandbox/deposit/${encodeURIComponent(created.data.id)}/mark-paid`, {
  method: 'POST',
  headers: { ...headers, 'X-DF-Idempotency-Key': randomUUID() },
});
  if (!markPaidResponse.ok) throw new Error(`Deflow sandbox mark-paid falhou com HTTP ${markPaidResponse.status}.`);

  const statusResponse = await fetch(`${apiUrl}/deposit-status/${encodeURIComponent(created.data.id)}`, {
  headers,
});
  const status = await statusResponse.json() as { data?: { id?: string; status?: string } };
  if (!statusResponse.ok || status.data?.id !== created.data.id) throw new Error(`Deflow sandbox status falhou com HTTP ${statusResponse.status}.`);
  console.log(JSON.stringify({ id: status.data.id, status: status.data.status }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Deflow sandbox test failed');
  process.exitCode = 1;
});
