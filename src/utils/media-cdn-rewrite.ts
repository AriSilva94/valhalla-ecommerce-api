type MediaFormat = Record<string, any>;

export type MediaFileRecord = {
  id: number;
  name?: string | null;
  url?: string | null;
  formats?: MediaFormat | string | null;
};

type RewriteOptions = {
  publicUrl: string;
  rootPath?: string;
};

const KNOWN_CDN_HOSTS = [
  'cdn-dev.valhallatecnologia.com.br',
  'cdn.valhallatecnologia.com.br',
];

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildTargetPrefix(publicUrl: string, rootPath = 'assets/images'): string {
  return `${publicUrl.replace(/\/+$/, '')}/${trimSlashes(rootPath)}/`;
}

export function rewriteMediaUrl(
  url: unknown,
  publicUrl: string,
  rootPath = 'assets/images'
): unknown {
  if (typeof url !== 'string') return url;

  const targetPrefix = buildTargetPrefix(publicUrl, rootPath);
  const patterns = [
    /^https:\/\/pub-[^/]+\.r2\.dev\/uploads-dev\//,
    /^https:\/\/pub-[^/]+\.r2\.dev\/uploads\//,
    ...KNOWN_CDN_HOSTS.map(
      (host) => new RegExp(`^https://${host.replace(/\./g, '\\.')}/${trimSlashes(rootPath)}/`)
    ),
  ];

  for (const pattern of patterns) {
    if (pattern.test(url)) return url.replace(pattern, targetPrefix);
  }

  return url;
}

function parseFormats(value: MediaFileRecord['formats']): MediaFormat | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim() ? JSON.parse(value) : null;
  return value;
}

function serializeFormats(
  value: MediaFormat | null | undefined,
  originalValue: MediaFileRecord['formats']
): MediaFileRecord['formats'] {
  if (!value) return value;
  return typeof originalValue === 'string' ? JSON.stringify(value) : value;
}

function rewriteFormats(
  formats: MediaFormat | null | undefined,
  publicUrl: string,
  rootPath: string
): MediaFormat | null | undefined {
  if (!formats || typeof formats !== 'object') return formats;

  let changed = false;
  const nextFormats: MediaFormat = {};

  for (const [key, value] of Object.entries(formats)) {
    if (!value || typeof value !== 'object') {
      nextFormats[key] = value;
      continue;
    }

    const nextValue = { ...value };
    const nextUrl = rewriteMediaUrl(nextValue.url, publicUrl, rootPath);
    if (nextUrl !== nextValue.url) {
      nextValue.url = nextUrl;
      changed = true;
    }
    nextFormats[key] = nextValue;
  }

  return changed ? nextFormats : formats;
}

export function rewriteMediaFileRecord(file: MediaFileRecord, publicUrl: string, rootPath = 'assets/images') {
  const patch: Partial<MediaFileRecord> = {};

  const nextUrl = rewriteMediaUrl(file.url, publicUrl, rootPath);
  if (nextUrl !== file.url) patch.url = nextUrl as string;

  const originalFormats = file.formats;
  const parsedFormats = parseFormats(originalFormats);
  const nextFormats = rewriteFormats(parsedFormats, publicUrl, rootPath);
  if (nextFormats !== parsedFormats) {
    patch.formats = serializeFormats(nextFormats, originalFormats);
  }

  return {
    changed: Object.keys(patch).length > 0,
    patch,
  };
}

export async function rewriteStrapiMediaFiles(
  strapi: any,
  options: RewriteOptions
): Promise<{ files: number; updated: number }> {
  const publicUrl = options.publicUrl?.trim();
  if (!publicUrl) return { files: 0, updated: 0 };

  const rootPath = options.rootPath || 'assets/images';
  const rows = await strapi.db.connection('files').select('id', 'name', 'url', 'formats');
  let updated = 0;

  for (const file of rows) {
    const result = rewriteMediaFileRecord(file, publicUrl, rootPath);
    if (!result.changed) continue;

    updated += 1;
    await strapi.db
      .connection('files')
      .where({ id: file.id })
      .update({
        ...result.patch,
        updated_at: new Date(),
      });
  }

  return { files: rows.length, updated };
}
