export default {
  routes: [
    { method: 'POST', path: '/orders', handler: 'order.create', config: { policies: [] } },
    { method: 'GET', path: '/orders', handler: 'order.find', config: { policies: [] } },
    { method: 'GET', path: '/orders/:id', handler: 'order.findOne', config: { policies: [] } },
    { method: 'POST', path: '/orders/:id/simulate-payment', handler: 'order.simulatePayment', config: { policies: [] } },
  ],
};
