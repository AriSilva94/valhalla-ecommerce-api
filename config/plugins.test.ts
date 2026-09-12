import { describe, expect, it } from 'vitest';

import config from './plugins';

function env(name: string, fallback?: unknown): unknown {
  const values: Record<string, unknown> = {
    JWT_SECRET: 'jwt-secret',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    EMAIL_FROM: 'Valhalla <no-reply@example.com>',
  };

  return values[name] ?? fallback;
}

describe('plugins configuration', () => {
  it('configura refresh tokens e SMTP para autenticação de clientes', () => {
    const plugins = config({ env } as never) as Record<string, any>;

    expect(plugins['users-permissions'].config).toMatchObject({
      jwtManagement: 'refresh',
      jwtSecret: 'jwt-secret',
      accessTokenLifespan: 600,
      maxRefreshTokenLifespan: 2592000,
      idleRefreshTokenLifespan: 1209600,
      sessions: { httpOnly: false },
    });
    expect(plugins.email.config).toMatchObject({
      provider: 'nodemailer',
      providerOptions: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'smtp-user', pass: 'smtp-pass' },
      },
      settings: { defaultFrom: 'Valhalla <no-reply@example.com>' },
    });
  });
});
