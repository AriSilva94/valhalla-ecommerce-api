import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const securityConfig = {
  allowedTypes: allowedMediaTypes,
  deniedTypes: deniedExecutableTypes,
};

/**
 * Cloudflare R2 is S3-compatible, so we use the official aws-s3 provider.
 * Falls back to Strapi's local provider when the R2 vars are absent, so a
 * fresh clone still boots without any storage credentials.
 */
const uploadConfig = (params: Core.Config.Shared.ConfigParams) => {
  const { env } = params;
  const bucket = env('R2_BUCKET');
  const endpoint = env('R2_ENDPOINT');
  const publicUrl = env('R2_PUBLIC_URL');

  if (!bucket || !endpoint || !publicUrl) {
    return { config: { security: securityConfig } };
  }

  return {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        baseUrl: publicUrl,
        rootPath: env('R2_ROOT_PATH', 'uploads'),
        s3Options: {
          credentials: {
            accessKeyId: env('R2_ACCESS_KEY_ID'),
            secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
          },
          // R2 has a single global region and requires path-style addressing.
          region: 'auto',
          endpoint,
          forcePathStyle: true,
          params: {
            Bucket: bucket,
            // R2 does not implement object ACLs; sending one fails the upload.
            ACL: null,
          },
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
      security: securityConfig,
    },
  };
};

const config = (params: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'sortable-entries': {
    enabled: true,
  },
  'users-permissions': {
    config: {
      jwtManagement: 'refresh',
      jwtSecret: params.env('JWT_SECRET'),
      accessTokenLifespan: 600,
      maxRefreshTokenLifespan: 2592000,
      idleRefreshTokenLifespan: 1209600,
      maxSessionLifespan: 2592000,
      idleSessionLifespan: 1209600,
      sessions: {
        httpOnly: false,
      },
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: params.env('SMTP_HOST', 'localhost'),
        port: Number(params.env('SMTP_PORT', 1025)),
        secure: params.env('SMTP_SECURE', 'false') === 'true',
        auth:
          params.env('SMTP_USER') && params.env('SMTP_PASS')
            ? {
                user: params.env('SMTP_USER'),
                pass: params.env('SMTP_PASS'),
              }
            : undefined,
      },
      settings: {
        defaultFrom: params.env('EMAIL_FROM', 'Valhalla <no-reply@example.com>'),
        defaultReplyTo: params.env(
          'EMAIL_REPLY_TO',
          params.env('EMAIL_FROM', 'Valhalla <no-reply@example.com>')
        ),
      },
    },
  },
  upload: uploadConfig(params),
});

export default config;
