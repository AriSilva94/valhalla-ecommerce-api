/**
 * Asaas sends `expirationDate` as a naive "YYYY-MM-DD HH:mm:ss" string in
 * America/Sao_Paulo local time (fixed -03:00 offset, no DST since 2019).
 * If written as-is into a datetime column, Node/Postgres treat it as UTC,
 * silently shifting the real expiry by the Brazil offset. This converts it
 * to a proper UTC ISO string with the correct offset applied.
 */
export function toUtcIsoFromSaoPauloNaive(naive: string): string {
  return new Date(`${naive.replace(' ', 'T')}-03:00`).toISOString();
}
