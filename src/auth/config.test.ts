import { describe, expect, it } from 'vitest';

import { buildAdvancedSettings, buildEmailTemplates, buildGoogleProvider } from './config';

describe('buildAdvancedSettings', () => {
  it('configura cadastro e confirmações com URLs do frontend', () => {
    expect(buildAdvancedSettings({}, 'https://loja.example.com')).toMatchObject({
      unique_email: true,
      allow_register: true,
      email_confirmation: true,
      email_reset_password: 'https://loja.example.com/auth/reset-password',
      email_confirmation_redirection: 'https://loja.example.com/auth/email-confirmed',
      default_role: 'authenticated',
    });
  });
});

describe('buildGoogleProvider', () => {
  it('desabilita Google sem as duas credenciais', () => {
    expect(buildGoogleProvider({}, 'https://api.example.com')).toMatchObject({
      enabled: false,
    });
  });

  it('habilita Google com callback público do Strapi', () => {
    expect(
      buildGoogleProvider(
        { clientId: 'client-id', clientSecret: 'client-secret' },
        'https://api.example.com/'
      )
    ).toMatchObject({
      enabled: true,
      key: 'client-id',
      secret: 'client-secret',
      callback: 'https://api.example.com/api/connect/google/callback',
    });
  });
});

describe('buildEmailTemplates', () => {
  it('inclui os tokens e URLs oficiais de confirmação e redefinição', () => {
    const templates = buildEmailTemplates('Valhalla <no-reply@valhalla.example>', 'https://loja.example.com');

    expect(templates.reset_password.options.message).toContain('<%= URL %>?code=<%= TOKEN %>');
    expect(templates.email_confirmation.options.message).toContain(
      '<%= URL %>?confirmation=<%= CODE %>'
    );
    expect(templates.reset_password.options.message).toContain('https://loja.example.com/auth/reset-password');
    expect(templates.email_confirmation.options.message).toContain(
      'https://loja.example.com/auth/email-confirmed'
    );
  });
});
