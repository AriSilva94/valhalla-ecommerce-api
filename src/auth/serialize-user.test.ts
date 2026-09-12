import { describe, expect, it } from 'vitest';

import { serializeCustomerUser } from './serialize-user';

describe('serializeCustomerUser', () => {
  it('retorna somente os campos seguros do cliente', () => {
    const user = serializeCustomerUser({
      id: 7,
      username: 'cliente@example.com',
      email: 'cliente@example.com',
      confirmed: true,
      blocked: false,
      password: 'hashed-password',
      resetPasswordToken: 'reset-token',
      confirmationToken: 'confirmation-token',
      role: { id: 2, name: 'Authenticated', type: 'authenticated' },
    });

    expect(user).toEqual({
      id: 7,
      username: 'cliente@example.com',
      email: 'cliente@example.com',
      confirmed: true,
      blocked: false,
      role: { id: 2, name: 'Authenticated', type: 'authenticated' },
    });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('resetPasswordToken');
    expect(user).not.toHaveProperty('confirmationToken');
  });
});
