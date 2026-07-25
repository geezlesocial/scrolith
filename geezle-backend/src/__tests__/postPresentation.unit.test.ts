import { describe, expect, it } from '@jest/globals';
import {
  normalizePostPresentationInput,
  serializePostPresentation
} from '../utils/postPresentation';

describe('postPresentation', () => {
  it('returns undefined when body has no presentation fields (plain posts)', () => {
    expect(normalizePostPresentationInput({ title: 'x', content: 'hello' })).toBeUndefined();
  });

  it('accepts valid theme id and returns preset colors', () => {
    const result = normalizePostPresentationInput({ textBackgroundId: 'violet' });
    expect(result).toEqual({
      type: 'text_background',
      themeId: 'violet',
      background: expect.stringContaining('linear-gradient'),
      textColor: '#ffffff'
    });
  });

  it('rejects unknown theme identifiers', () => {
    expect(normalizePostPresentationInput({ textBackgroundId: 'not-a-theme' })).toBeNull();
  });

  it('clears presentation when media attachments are present', () => {
    const result = normalizePostPresentationInput(
      { textBackgroundId: 'violet' },
      { hasAttachments: true }
    );
    expect(result).toBeNull();
  });

  it('clears when textBackgroundId is none', () => {
    expect(normalizePostPresentationInput({ textBackgroundId: 'none' })).toBeNull();
  });

  it('rejects unsafe background values (url)', () => {
    expect(
      normalizePostPresentationInput({
        presentation: { background: 'url(https://evil.example/x)', textColor: '#fff' }
      })
    ).toBeNull();
  });

  it('serializes null presentation for legacy posts', () => {
    expect(serializePostPresentation({ content: 'legacy' })).toEqual({
      presentation: null,
      textBackground: null,
      textColor: null,
      textBackgroundId: null
    });
  });

  it('serializes styled presentation fields', () => {
    const result = serializePostPresentation({
      presentation: {
        type: 'text_background',
        themeId: 'midnight',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #020617 100%)',
        textColor: '#f8fafc'
      }
    });
    expect(result.presentation?.themeId).toBe('midnight');
    expect(result.textColor).toBe('#f8fafc');
    expect(result.textBackgroundId).toBe('midnight');
  });
});
