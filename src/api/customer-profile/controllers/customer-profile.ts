import type { Context } from 'koa';

import { isValidCep, isValidCpfCnpj, isValidUf, onlyDigits } from '../../../customer-profile/validation';

const PUBLIC_FIELDS = [
  'cpfCnpj',
  'phone',
  'addressLine',
  'addressNumber',
  'addressComplement',
  'neighborhood',
  'city',
  'state',
  'postalCode',
] as const;

function serializeProfile(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_FIELDS) out[field] = profile[field] ?? '';
  return out;
}

function readInput(body: Record<string, unknown>) {
  return {
    cpfCnpj: onlyDigits(typeof body.cpfCnpj === 'string' ? body.cpfCnpj : ''),
    phone: onlyDigits(typeof body.phone === 'string' ? body.phone : ''),
    addressLine: typeof body.addressLine === 'string' ? body.addressLine.trim() : '',
    addressNumber: typeof body.addressNumber === 'string' ? body.addressNumber.trim() : '',
    addressComplement: typeof body.addressComplement === 'string' ? body.addressComplement.trim() : '',
    neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood.trim() : '',
    city: typeof body.city === 'string' ? body.city.trim() : '',
    state: typeof body.state === 'string' ? body.state.trim().toUpperCase() : '',
    postalCode: onlyDigits(typeof body.postalCode === 'string' ? body.postalCode : ''),
  };
}

function isComplete(input: ReturnType<typeof readInput>): boolean {
  return (
    isValidCpfCnpj(input.cpfCnpj) &&
    isValidCep(input.postalCode) &&
    isValidUf(input.state) &&
    input.addressLine.length > 0 &&
    input.addressNumber.length > 0 &&
    input.neighborhood.length > 0 &&
    input.city.length > 0
  );
}

export default {
  async me(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const profile = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    ctx.body = { ok: true, data: serializeProfile(profile) };
  },

  async updateMe(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const input = readInput((ctx.request.body ?? {}) as Record<string, unknown>);

    if (!isComplete(input)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'VALIDATION_ERROR' };
      return;
    }

    const existing = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    const saved = existing
      ? await strapi.db
          .query('api::customer-profile.customer-profile')
          .update({ where: { id: existing.id }, data: input })
      : await strapi.db
          .query('api::customer-profile.customer-profile')
          .create({ data: { ...input, user: userId } });

    ctx.body = { ok: true, data: serializeProfile(saved) };
  },
};
