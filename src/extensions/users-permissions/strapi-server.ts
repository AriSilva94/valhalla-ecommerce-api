import { serializeCustomerUser } from '../../auth/serialize-user';

export default (plugin: any) => {
  const originalUserFactory = plugin.controllers.user;

  plugin.controllers.user = (params: any) => {
    const controller =
      typeof originalUserFactory === 'function' ? originalUserFactory(params) : originalUserFactory;
    const strapi = params?.strapi;

    return {
      ...controller,
      async me(ctx: any) {
        if (!ctx.state.user?.id) return ctx.unauthorized();

        const user = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: ctx.state.user.id },
          populate: ['role'],
        });

        if (!user) return controller.me(ctx);

        ctx.body = serializeCustomerUser(user);
      },
    };
  };

  return plugin;
};
