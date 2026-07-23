import {
  DEFAULT_CHAT_APPEARANCE,
  normalizeChatAppearance
} from '../chatAppearanceService';

describe('chatAppearanceService.normalizeChatAppearance', () => {
  it('returns defaults for empty input', () => {
    const result = normalizeChatAppearance(null);
    expect(result.kind).toBe('none');
    expect(result.opacity).toBe(1);
    expect(result.blurPx).toBe(0);
    expect(result.version).toBe(1);
  });

  it('accepts solid hex colors', () => {
    const result = normalizeChatAppearance({ kind: 'solid', color: '#0f172a', opacity: 0.9 });
    expect(result.kind).toBe('solid');
    expect(result.color).toBe('#0f172a');
    expect(result.opacity).toBe(0.9);
  });

  it('accepts gradients and clamps blur/opacity', () => {
    const result = normalizeChatAppearance({
      kind: 'gradient',
      color: '#e0e7ff',
      colorEnd: 'rgb(252, 231, 243)',
      opacity: 2,
      blurPx: 99
    });
    expect(result.kind).toBe('gradient');
    expect(result.opacity).toBe(1);
    expect(result.blurPx).toBe(40);
  });

  it('rejects invalid colors', () => {
    expect(() => normalizeChatAppearance({ kind: 'solid', color: 'javascript:alert(1)' })).toThrow(
      /Invalid background color/i
    );
  });

  it('rejects non-http image URLs', () => {
    expect(() =>
      normalizeChatAppearance({ kind: 'photo', imageUrl: 'file:///etc/passwd' })
    ).toThrow(/Invalid background image URL/i);
  });

  it('allows relative media paths and https', () => {
    const a = normalizeChatAppearance({ kind: 'photo', imageUrl: '/api/files/content/abc' });
    expect(a.imageUrl).toBe('/api/files/content/abc');
    const b = normalizeChatAppearance({ kind: 'wallpaper', imageUrl: 'https://cdn.example.com/x.webp' });
    expect(b.imageUrl).toContain('https://');
  });

  it('falls back unknown kinds to none', () => {
    const result = normalizeChatAppearance({ kind: 'hologram' as any });
    expect(result.kind).toBe('none');
  });

  it('default constant is safe', () => {
    expect(DEFAULT_CHAT_APPEARANCE.kind).toBe('none');
  });
});
