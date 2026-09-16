export default {
  routes: [
    {
      method: 'POST',
      path: '/deflow/webhook',
      handler: 'deflow.webhook',
      config: { auth: false, policies: [] },
    },
  ],
};
