type Settings = Record<string, unknown>;

type EmailTemplate = {
  display: string;
  icon: string;
  options: {
    from: { name: string; email: string };
    response_email: string;
    object: string;
    message: string;
  };
};

export function buildAdvancedSettings(current: Settings, frontendUrl: string): Settings {
  const baseUrl = trimTrailingSlash(frontendUrl);

  return {
    ...current,
    unique_email: true,
    allow_register: true,
    email_confirmation: true,
    email_reset_password: `${baseUrl}/auth/reset-password`,
    email_confirmation_redirection: `${baseUrl}/auth/email-confirmed`,
    default_role: 'authenticated',
  };
}

export function buildGoogleProvider(
  credentials: { clientId?: string; clientSecret?: string },
  frontendUrl: string,
  current: Settings = {}
): Settings {
  if (!credentials.clientId || !credentials.clientSecret) {
    return { ...current, enabled: false };
  }

  return {
    ...current,
    enabled: true,
    key: credentials.clientId,
    secret: credentials.clientSecret,
    callback: `${trimTrailingSlash(frontendUrl)}/api/auth/google/callback`,
    // Without this, Google silently re-authenticates whoever is already
    // signed into it in the browser — our own logout only clears this
    // app's session, never Google's, so "Entrar com Google" after a
    // logout skips straight past the account picker. `select_account`
    // forces that screen every time, regardless of Google's own session.
    custom_params: { prompt: 'select_account' },
  };
}

export function buildEmailTemplates(
  from: string,
  frontendUrl: string,
  current: Settings = {}
): Settings & { reset_password: EmailTemplate; email_confirmation: EmailTemplate } {
  const baseUrl = trimTrailingSlash(frontendUrl);
  const fromIdentity = parseEmailIdentity(from);
  const resetUrl = '<%= URL %>?code=<%= TOKEN %>';
  const confirmationUrl = `${baseUrl}/auth/email-confirmed?confirmation=<%= CODE %>`;

  return {
    ...current,
    reset_password: {
      display: 'Email.template.reset_password',
      icon: 'sync',
      options: {
        from: fromIdentity,
        response_email: '',
        object: 'Redefinição de senha Valhalla',
        message: buildEmail({
          title: 'Redefina sua senha',
          body: 'Use o link abaixo para criar uma nova senha.',
          actionLabel: 'Redefinir senha',
          actionUrl: resetUrl,
          fallbackUrl: `${baseUrl}/auth/reset-password`,
        }),
      },
    },
    email_confirmation: {
      display: 'Email.template.email_confirmation',
      icon: 'check-square',
      options: {
        from: fromIdentity,
        response_email: '',
        object: 'Confirme seu e-mail na Valhalla',
        message: buildEmail({
          title: 'Confirme seu e-mail',
          body: 'Use o link abaixo para ativar sua conta.',
          actionLabel: 'Confirmar e-mail',
          actionUrl: confirmationUrl,
          fallbackUrl: `${baseUrl}/auth/email-confirmed`,
        }),
      },
    },
  };
}

function buildEmail({
  title,
  body,
  actionLabel,
  actionUrl,
  fallbackUrl,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  fallbackUrl: string;
}): string {
  return `<h1>${title}</h1><p>${body}</p><p><a href="${actionUrl}">${actionLabel}</a></p><p>${fallbackUrl}</p>`;
}

function parseEmailIdentity(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: '', email: value.trim() };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
