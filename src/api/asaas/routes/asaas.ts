/**
 * Custom (non-factory) route for the internal Asaas connectivity
 * health-check. `global::internal-test-token` is Strapi 5's conventional
 * reference syntax for a project-global policy in src/policies/.
 *
 * `auth: false` disables Strapi's users-permissions auth middleware for this
 * route so it isn't gated by a JWT — the internal-test-token policy is the
 * sole gate. No permission for this action is granted to the public role in
 * any bootstrap/seed file, so Strapi's own public-role permission system
 * never exposes it either.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/asaas/test',
      handler: 'asaas.test',
      config: {
        policies: ['global::internal-test-token'],
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/asaas/webhook',
      handler: 'asaas.webhook',
      config: {
        policies: ['global::asaas-webhook-token'],
        auth: false,
      },
    },
  ],
};
