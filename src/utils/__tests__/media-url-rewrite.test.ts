import { describe, expect, it } from 'vitest';

import { rewriteMediaUrl } from '../../../scripts/rewrite-media-urls';

describe('rewriteMediaUrl', () => {
  it('rewrites legacy R2 dev URLs to the requested CDN host', () => {
    expect(
      rewriteMediaUrl(
        'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads-dev/photo.webp',
        'https://cdn.valhallatecnologia.com.br'
      )
    ).toBe('https://cdn.valhallatecnologia.com.br/assets/images/photo.webp');
  });

  it('rewrites bridge URLs that lost the dev suffix', () => {
    expect(
      rewriteMediaUrl(
        'https://pub-61c4f8e03dc74e918adf43e0c1c4af54.r2.dev/uploads/photo.webp',
        'https://cdn-dev.valhallatecnologia.com.br'
      )
    ).toBe('https://cdn-dev.valhallatecnologia.com.br/assets/images/photo.webp');
  });

  it('can switch between Valhalla CDN hosts without changing the object key', () => {
    expect(
      rewriteMediaUrl(
        'https://cdn-dev.valhallatecnologia.com.br/assets/images/photo.webp',
        'https://cdn.valhallatecnologia.com.br/'
      )
    ).toBe('https://cdn.valhallatecnologia.com.br/assets/images/photo.webp');
  });

  it('leaves unrelated URLs unchanged', () => {
    expect(
      rewriteMediaUrl('https://example.com/assets/images/photo.webp', 'https://cdn.valhallatecnologia.com.br')
    ).toBe('https://example.com/assets/images/photo.webp');
  });
});
