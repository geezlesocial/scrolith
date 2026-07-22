import { describe, expect, it } from 'vitest';
import {
  getInternalScrolithPath,
  normalizeMessageUrl,
  tokenizeMessageLinks
} from '../messageLinks';

describe('message link tokenization', () => {
  it('recognizes internal and external http urls', () => {
    const tokens = tokenizeMessageLinks('Open https://scrolith.com/messages/join/example and https://example.com');
    const urls = tokens.filter((token) => token.type === 'url');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatchObject({
      href: 'https://scrolith.com/messages/join/example',
      internalPath: '/messages/join/example'
    });
    expect(urls[1]).toMatchObject({
      href: 'https://example.com/',
      internalPath: null
    });
  });

  it('normalizes shorthand urls without changing display text', () => {
    const tokens = tokenizeMessageLinks('Visit www.example.com and scrolith.com/profile/jima');
    const urls = tokens.filter((token) => token.type === 'url');
    expect(urls[0]).toMatchObject({ value: 'www.example.com', href: 'https://www.example.com/' });
    expect(urls[1]).toMatchObject({
      value: 'scrolith.com/profile/jima',
      href: 'https://scrolith.com/profile/jima',
      internalPath: '/profile/jima'
    });
  });

  it('keeps trailing punctuation outside links', () => {
    const tokens = tokenizeMessageLinks('Visit (https://example.com/path).');
    expect(tokens).toEqual([
      { type: 'text', value: 'Visit (' },
      {
        type: 'url',
        value: 'https://example.com/path',
        href: 'https://example.com/path',
        hostname: 'example.com',
        internalPath: null
      },
      { type: 'text', value: ').' }
    ]);
  });

  it('rejects unsafe and malformed urls', () => {
    expect(normalizeMessageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeMessageUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(normalizeMessageUrl('https://user:pass@example.com')).toBeNull();
    expect(tokenizeMessageLinks('email user@scrolith.com please').filter((token) => token.type === 'url')).toHaveLength(0);
  });

  it('does not route API paths through the SPA', () => {
    expect(getInternalScrolithPath('https://scrolith.com/api/private')).toBeNull();
    expect(getInternalScrolithPath('https://api.scrolith.com/messages/join/example')).toBeNull();
  });
});
