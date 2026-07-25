import { describe, expect, it } from 'vitest';
import {
  buildComposerTextBackgroundStyle,
  buildPostPresentation,
  isComposerTextBackgroundActive,
  POST_TEXT_BG_NONE_ID
} from '../../src/utils/postTextBackgrounds';

describe('postTextBackgrounds composer helpers', () => {
  it('activates background canvas when theme selected without content', () => {
    expect(isComposerTextBackgroundActive('violet', { hasMedia: false })).toBe(true);
    expect(isComposerTextBackgroundActive(POST_TEXT_BG_NONE_ID, { hasMedia: false })).toBe(false);
  });

  it('disables background when media is attached', () => {
    expect(isComposerTextBackgroundActive('violet', { hasMedia: true })).toBe(false);
  });

  it('forces transparent textarea fill so parent gradient shows through', () => {
    const style = buildComposerTextBackgroundStyle('midnight');
    expect(style).toBeTruthy();
    expect(style?.backgroundColor).toBe('transparent');
    expect(style?.background).toBe('transparent');
    expect(style?.color).toMatch(/^#/);
    expect(style?.caretColor).toBe(style?.color);
  });

  it('returns no style for default theme', () => {
    expect(buildComposerTextBackgroundStyle(POST_TEXT_BG_NONE_ID)).toBeUndefined();
    expect(buildPostPresentation(POST_TEXT_BG_NONE_ID)).toBeNull();
  });
});
