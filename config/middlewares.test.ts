import { describe, expect, it } from 'vitest';

import config from './middlewares';

describe('middlewares configuration', () => {
  it('restringe CORS às origens do frontend sem remover a CSP de mídia', () => {
    const middlewares = config({ env: (name: string, fallback?: string) => ({
      CORS_ORIGINS: 'https://loja.example.com, https://preview.example.com',
      R2_PUBLIC_URL: 'https://cdn.example.com',
    })[name] ?? fallback } as never) as any[];
    const cors = middlewares.find((middleware) => middleware.name === 'strapi::cors');
    const security = middlewares.find((middleware) => middleware.name === 'strapi::security');

    expect(cors.config).toEqual({
      origin: ['https://loja.example.com', 'https://preview.example.com'],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Origin'],
      credentials: true,
    });
    expect(security.config.contentSecurityPolicy.directives['img-src']).toContain(
      'https://cdn.example.com'
    );
  });
});
