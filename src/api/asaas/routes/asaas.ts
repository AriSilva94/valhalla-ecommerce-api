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
