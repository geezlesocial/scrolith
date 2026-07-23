import { describe, expect, it } from 'vitest';
import {
  appearanceToBackgroundStyle,
  buildChatPalette,
  contrastRatio,
  estimateBackgroundLuminance,
  parseCssColor,
  relativeLuminance
} from '../chatTextColorEngine';

describe('chatTextColorEngine', () => {
  it('parses hex and rgb colors', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#0f172a')?.r).toBe(15);
    expect(parseCssColor('rgb(10, 20, 30)')).toMatchObject({ r: 10, g: 20, b: 30 });
  });

  it('computes relative luminance and contrast', () => {
    const white = relativeLuminance(255, 255, 255);
    const black = relativeLuminance(0, 0, 0);
    expect(white).toBeGreaterThan(0.9);
    expect(black).toBeLessThan(0.05);
    expect(contrastRatio(white, black)).toBeGreaterThan(20);
  });

  it('estimates dark solid backgrounds as dark', () => {
    expect(estimateBackgroundLuminance({ kind: 'solid', color: '#0f172a' })).toBeLessThan(0.2);
    expect(estimateBackgroundLuminance({ kind: 'none' })).toBeGreaterThan(0.9);
  });

  it('builds light palette for light backgrounds with WCAG-oriented contrast', () => {
    const palette = buildChatPalette({ kind: 'solid', color: '#ffffff' });
    expect(palette.mode).toBe('light');
    expect(palette.text).toMatch(/^#0f172a$/i);
    const bgL = relativeLuminance(255, 255, 255);
    const text = parseCssColor(palette.text)!;
    const textL = relativeLuminance(text.r, text.g, text.b);
    expect(contrastRatio(bgL, textL)).toBeGreaterThanOrEqual(4.5);
  });

  it('builds dark palette for dark backgrounds', () => {
    const palette = buildChatPalette({ kind: 'solid', color: '#0f172a' });
    expect(palette.mode).toBe('dark');
    expect(palette.bubbleIncomingText).toMatch(/#f/i);
    expect(palette.pinBannerText).toBeTruthy();
  });

  it('defaults photo/wallpaper to dark-safe text', () => {
    const palette = buildChatPalette({ kind: 'photo', imageUrl: 'https://example.com/a.jpg' });
    expect(palette.mode).toBe('dark');
  });

  it('maps appearance to background styles', () => {
    expect(appearanceToBackgroundStyle({ kind: 'solid', color: '#abc' }).backgroundColor).toBe('#abc');
    const gradient = appearanceToBackgroundStyle({
      kind: 'gradient',
      color: '#111',
      colorEnd: '#222'
    });
    expect(String(gradient.backgroundImage || '')).toContain('linear-gradient');
    const photo = appearanceToBackgroundStyle({
      kind: 'photo',
      imageUrl: 'https://cdn.example.com/x.jpg',
      blurPx: 8
    });
    expect(String(photo.backgroundImage || '')).toContain('url(');
    expect(String(photo.filter || '')).toContain('blur(8px)');
  });
});
