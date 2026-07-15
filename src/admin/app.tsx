import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: ['pt-BR'],
    translations: {
      'pt-BR': {
        'app.components.LeftMenu.navbrand.title': 'Valhalla',
        'app.components.LeftMenu.navbrand.workplace': 'Painel da loja',
      },
    },
  },
  bootstrap(_app: StrapiApp) {},
};
