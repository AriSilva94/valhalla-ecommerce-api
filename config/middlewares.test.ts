import { describe, expect, it } from 'vitest';

import config from './middlewares';

function fakeEnv(values: Record<string, string | boolean>) {
  const env = ((name: string, fallback?: string) => (values[name] as string) ?? fallback) as never;
  (env as any).bool = (name: string, fallback?: boolean) =>
    typeof values[name] === 'boolean' ? values[name] : fallback;
  return env;
}

describe('middlewares configuration', () => {
  it('restringe CORS às origens do frontend sem remover a CSP de mídia', () => {
    const middlewares = config({
      env: fakeEnv({
        CORS_ORIGINS: 'https://loja.example.com, https://preview.example.com',
        R2_PUBLIC_URL: 'https://cdn.example.com',
      }),
    } as never) as any[];
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

  it('deixa o cookie de sessão inseguro fora de um proxy HTTPS (dev local)', () => {
    const middlewares = config({ env: fakeEnv({ IS_PROXIED: false }) } as never) as any[];
    const session = middlewares.find((middleware) => middleware.name === 'strapi::session');

    expect(session.config).toEqual({ secure: false });
  });

  it('exige cookie de sessão seguro atrás do proxy HTTPS (produção)', () => {
    const middlewares = config({ env: fakeEnv({ IS_PROXIED: true }) } as never) as any[];
    const session = middlewares.find((middleware) => middleware.name === 'strapi::session');

    expect(session.config).toEqual({ secure: true });
  });
});
