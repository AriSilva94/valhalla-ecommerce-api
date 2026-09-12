import { describe, expect, it, vi } from 'vitest';

import { configureCustomerAuth } from './bootstrap';

describe('configureCustomerAuth', () => {
  it('grava advanced, grant e email somente quando a configuração muda', async () => {
    const stores = new Map<
      string,
      { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; current: unknown }
    >();
    const store = vi.fn(({ key }: { key: string }) => {
      const existing = stores.get(key);
      if (existing) return existing;

      const value = {
        current: {},
        get: vi.fn(async () => value.current),
        set: vi.fn(async ({ value: next }) => {
          value.current = next;
        }),
      };
      stores.set(key, value);
      return value;
    });

    await configureCustomerAuth(
      { store } as never,
      {
        frontendUrl: 'https://loja.example.com',
        strapiPublicUrl: 'https://api.example.com',
        emailFrom: 'Valhalla <no-reply@example.com>',
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
      }
    );

    expect(store).toHaveBeenCalledTimes(3);
    expect(stores.get('advanced')?.set).toHaveBeenCalledOnce();
    expect(stores.get('grant')?.set).toHaveBeenCalledWith({
      value: expect.objectContaining({
        google: expect.objectContaining({ enabled: true, callback: 'https://loja.example.com/api/auth/google/callback' }),
      }),
    });
    expect(stores.get('email')?.set).toHaveBeenCalledOnce();

    await configureCustomerAuth(
      { store } as never,
      {
        frontendUrl: 'https://loja.example.com',
        strapiPublicUrl: 'https://api.example.com',
        emailFrom: 'Valhalla <no-reply@example.com>',
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
      }
    );

    expect(stores.get('advanced')?.set).toHaveBeenCalledOnce();
    expect(stores.get('grant')?.set).toHaveBeenCalledOnce();
    expect(stores.get('email')?.set).toHaveBeenCalledOnce();
  });
});
