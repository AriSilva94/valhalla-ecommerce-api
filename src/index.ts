import type { Core } from '@strapi/strapi';

import { seedAdminViews } from './utils/admin-view-seed';
import { rewriteStrapiMediaFiles } from './utils/media-cdn-rewrite';
import { registerProductAutofill } from './utils/product-autofill-middleware';
import { backfillVariantPrices } from './utils/variant-price-backfill';

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
  register({ strapi }: { strapi: Core.Strapi }) {
    registerProductAutofill(strapi);
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const mediaRewrite = await rewriteStrapiMediaFiles(strapi, {
      publicUrl: process.env.R2_PUBLIC_URL || '',
      rootPath: process.env.R2_ROOT_PATH || 'assets/images',
    });

    if (mediaRewrite.updated > 0) {
      strapi.log.info(
        `Rewrote ${mediaRewrite.updated}/${mediaRewrite.files} media URLs to ${process.env.R2_PUBLIC_URL}`
      );
    }

    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    if (publicRole) {
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
    }

    await seedAdminViews(strapi);
    await backfillVariantPrices(strapi);
  },
};
