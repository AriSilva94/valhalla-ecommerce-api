import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  // Media served from R2 lives on another origin, so the default CSP would
  // block every thumbnail in the admin panel.
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
    'strapi::body',
    // strapi::session (used by the users-permissions Google OAuth "connect"
    // flow) defaults `secure` to `NODE_ENV === 'production'`, which is
    // always true here — including local Docker testing over plain HTTP,
    // where the browser then silently drops the cookie and the connect
    // flow throws "Cannot send secure cookie over unencrypted connection".
    // Reuse the same signal server.ts already uses for "are we actually
    // behind an HTTPS-terminating proxy" (IS_PROXIED) instead of NODE_ENV.
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
