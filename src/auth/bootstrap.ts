import { buildAdvancedSettings, buildEmailTemplates, buildGoogleProvider } from './config';

type Store = {
  get(params: Record<string, never>): Promise<unknown>;
  set(params: { value: unknown }): Promise<void>;
};

type StrapiStore = {
  store(params: { type: 'plugin'; name: 'users-permissions'; key: string }): Store;
};

type CustomerAuthConfig = {
  frontendUrl: string;
  strapiPublicUrl: string;
  emailFrom: string;
  googleClientId?: string;
  googleClientSecret?: string;
};

export async function configureCustomerAuth(
  strapi: StrapiStore,
  options: CustomerAuthConfig
): Promise<void> {
  const advancedStore = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'advanced' });
  const grantStore = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'grant' });
  const emailStore = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'email' });

  const advanced = asSettings(await advancedStore.get({}));
  const grant = asSettings(await grantStore.get({}));
  const email = asSettings(await emailStore.get({}));

  await setIfChanged(advancedStore, buildAdvancedSettings(advanced, options.frontendUrl));
  await setIfChanged(
    grantStore,
    {
      ...grant,
      google: buildGoogleProvider(
        { clientId: options.googleClientId, clientSecret: options.googleClientSecret },
        options.frontendUrl,
        asSettings(grant.google)
      ),
    }
  );
  await setIfChanged(emailStore, buildEmailTemplates(options.emailFrom, options.frontendUrl, email));
}

async function setIfChanged(store: Store, value: unknown): Promise<void> {
  const current = await store.get({});
  if (JSON.stringify(current ?? {}) !== JSON.stringify(value)) {
    await store.set({ value });
  }
}

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
