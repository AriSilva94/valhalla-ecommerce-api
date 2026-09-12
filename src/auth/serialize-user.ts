type UserRole = {
  id: number;
  name: string;
  type: string;
};

type CustomerUser = {
  id: number;
  username: string;
  email: string;
  confirmed: boolean;
  blocked: boolean;
  role?: UserRole | null;
};

export function serializeCustomerUser(user: CustomerUser): CustomerUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    confirmed: user.confirmed,
    blocked: user.blocked,
    role: user.role
      ? { id: user.role.id, name: user.role.name, type: user.role.type }
      : null,
  };
}
