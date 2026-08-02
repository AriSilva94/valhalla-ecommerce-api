import { describe, expect, it, vi } from 'vitest';

import {
  rewriteMediaFileRecord,
  rewriteMediaUrl,
  rewriteStrapiMediaFiles,
} from '../media-cdn-rewrite';

describe('media CDN rewrite', () => {
  it('rewrites production image URLs from legacy R2 to the configured CDN path', () => {
    expect(
      rewriteMediaUrl(
        'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/Fontes_Fonte.webp',
        'https://cdn.valhallatecnologia.com.br',
        'assets/images'
      )
    ).toBe('https://cdn.valhallatecnologia.com.br/assets/images/Fontes_Fonte.webp');
  });

  it('rewrites nested format URLs while leaving unrelated values unchanged', () => {
    const result = rewriteMediaFileRecord(
      {
        id: 1,
        name: 'Fonte.webp',
        url: 'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/Fonte.webp',
        formats: {
          thumbnail: {
            url: 'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/thumbnail_Fonte.webp',
          },
          metadata: {
            size: 123,
          },
        },
      },
      'https://cdn.valhallatecnologia.com.br',
      'assets/images'
    );

    expect(result.changed).toBe(true);
    expect(result.patch).toEqual({
      url: 'https://cdn.valhallatecnologia.com.br/assets/images/Fonte.webp',
      formats: {
        thumbnail: {
          url: 'https://cdn.valhallatecnologia.com.br/assets/images/thumbnail_Fonte.webp',
        },
        metadata: {
          size: 123,
        },
      },
    });
  });

  it('updates only changed files through the Strapi database connection', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn(() => ({ update }));
    const table = vi.fn((tableName: string) => {
      if (tableName === 'files') {
        return {
          select: vi.fn().mockResolvedValue([
            {
              id: 1,
              name: 'Fonte.webp',
              url: 'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/Fonte.webp',
              formats: null,
            },
            {
              id: 2,
              name: 'Manual.pdf',
              url: 'https://example.com/Manual.pdf',
              formats: null,
            },
          ]),
          where,
        };
      }
      throw new Error(`Unexpected table: ${tableName}`);
    });

    const result = await rewriteStrapiMediaFiles(
      { db: { connection: table } },
      {
        publicUrl: 'https://cdn.valhallatecnologia.com.br',
        rootPath: 'assets/images',
      }
    );

    expect(result).toEqual({ files: 2, updated: 1 });
    expect(where).toHaveBeenCalledWith({ id: 1 });
    expect(update).toHaveBeenCalledWith({
      url: 'https://cdn.valhallatecnologia.com.br/assets/images/Fonte.webp',
      updated_at: expect.any(Date),
    });
  });
});
