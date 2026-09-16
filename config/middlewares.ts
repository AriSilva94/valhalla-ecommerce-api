import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  const mediaOrigins = [env('R2_PUBLIC_URL')].filter(Boolean) as string[];
  const corsOrigins = (env('CORS_ORIGINS', 'http://localhost:3000') as string)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:'],
            'img-src': ["'self'", 'data:', 'blob:', ...mediaOrigins],
            'media-src': ["'self'", 'data:', 'blob:', ...mediaOrigins],
            upgradeInsecureRequests: null,
          },
        },
      },
    },
    {
      name: 'strapi::cors',
      config: {
        origin: corsOrigins,
        methods: ['GET', 'POST', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'Origin'],
        credentials: true,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    { name: 'strapi::body', config: { includeUnparsed: true } },
    {
      name: 'strapi::session',
      config: {
        secure: env.bool('IS_PROXIED', false),
      },
    },
    'strapi::favicon',
    'strapi::public',
  ];
};

export default config;
