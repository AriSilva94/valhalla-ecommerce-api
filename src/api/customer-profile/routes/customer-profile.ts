export default {
  routes: [
    {
      method: 'GET',
      path: '/customer-profiles/me',
      handler: 'customer-profile.me',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/customer-profiles/me',
      handler: 'customer-profile.updateMe',
      config: { policies: [] },
    },
  ],
};
