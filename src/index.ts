import type { Core } from '@strapi/strapi';

// Content types the frontend reads without auth. Grant these to the Public role
// on every boot so a fresh database (e.g. a new Postgres deploy) serves the API.
const PUBLIC_READ: Record<string, string[]> = {
  'api::homepage.homepage': ['find'],
  'api::site-setting.site-setting': ['find'],
  'api::product.product': ['find', 'findOne'],
  'api::category.category': ['find', 'findOne'],
  'api::brand.brand': ['find', 'findOne'],
  'api::tag.tag': ['find', 'findOne'],
  'api::faq.faq': ['find', 'findOne'],
  'api::policy.policy': ['find', 'findOne'],
};

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (!publicRole) return;

    for (const [uid, actions] of Object.entries(PUBLIC_READ)) {
      for (const action of actions) {
        const actionId = `${uid}.${action}`;
        const existing = await strapi.db
          .query('plugin::users-permissions.permission')
          .findOne({ where: { action: actionId, role: publicRole.id } });

        if (!existing) {
          await strapi.db.query('plugin::users-permissions.permission').create({
            data: { action: actionId, role: publicRole.id },
          });
        }
      }
    }
  },
};
