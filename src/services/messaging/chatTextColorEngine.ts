/**
 * Automatic compatible text colors for chat backgrounds (WCAG-oriented).
 * Pure client utility — no network.
 */

export type ChatPalette = {
  text: string;
  textSecondary: string;
  textMuted: string;
  link: string;
  timestamp: string;
  bubbleIncoming: string;
  bubbleIncomingText: string;
  bubbleOutgoing: string;
  bubbleOutgoingText: string;
  mention: string;
  replyPreview: string;
  reactionBg: string;
  reactionText: string;
  pinBannerBg: string;
  pinBannerText: string;
  systemText: string;
  inputHint: string;
  selection: string;
  unreadBadge: string;
  dateSeparator: string;
  mode: 'light' | 'dark';
};

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n));

export const parseCssColor = (input: string | null | undefined): { r: number; g: number; b: number; a: number } | null => {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      };
    }
  }
  const rgb = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgb) {
    return {
      r: clamp(Number(rgb[1])),
      g: clamp(Number(rgb[2])),
      b: clamp(Number(rgb[3])),
      a: rgb[4] != null ? Number(rgb[4]) : 1
    };
  }
  return null;
};

/** Relative luminance (sRGB). */
export const relativeLuminance = (r: number, g: number, b: number): number => {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

export const contrastRatio = (l1: number, l2: number): number => {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
};

export type AppearanceInput = {
  kind?: string;
  color?: string | null;
  colorEnd?: string | null;
  pattern?: string | null;
  fileId?: string | null;
  imageUrl?: string | null;
  opacity?: number;
  blurPx?: number;
  version?: number;
};

/**
 * Estimate background luminance from appearance config.
 * Photo/wallpaper default to mid-dark (0.28) for safe light text until sampled.
 */
export const estimateBackgroundLuminance = (appearance: AppearanceInput | null | undefined): number => {
  const kind = String(appearance?.kind || 'none').toLowerCase();
  if (kind === 'none' || !appearance) return 0.98; // default white chat surface
  if (kind === 'photo' || kind === 'wallpaper') return 0.28;
  if (kind === 'pattern') {
    const c = parseCssColor(appearance.color || '#e2e8f0');
    return c ? relativeLuminance(c.r, c.g, c.b) : 0.85;
  }
  const a = parseCssColor(appearance.color || '#ffffff');
  const b = parseCssColor(appearance.colorEnd || appearance.color || '#ffffff');
  if (!a && !b) return 0.9;
  const la = a ? relativeLuminance(a.r, a.g, a.b) : 0.9;
  const lb = b ? relativeLuminance(b.r, b.g, b.b) : la;
  return (la + lb) / 2;
};

export const buildChatPalette = (appearance: AppearanceInput | null | undefined): ChatPalette => {
  const L = estimateBackgroundLuminance(appearance);
  const darkBg = L < 0.45;
  if (darkBg) {
    return {
      mode: 'dark',
      text: '#f8fafc',
      textSecondary: '#e2e8f0',
      textMuted: '#cbd5e1',
      link: '#93c5fd',
      timestamp: '#94a3b8',
      bubbleIncoming: 'rgba(30,41,59,0.92)',
      bubbleIncomingText: '#f1f5f9',
      bubbleOutgoing: '#2563eb',
      bubbleOutgoingText: '#ffffff',
      mention: '#fde68a',
      replyPreview: 'rgba(148,163,184,0.25)',
      reactionBg: 'rgba(15,23,42,0.75)',
      reactionText: '#e2e8f0',
      pinBannerBg: 'rgba(120,53,15,0.85)',
      pinBannerText: '#fef3c7',
      systemText: '#cbd5e1',
      inputHint: '#94a3b8',
      selection: 'rgba(96,165,250,0.35)',
      unreadBadge: '#ef4444',
      dateSeparator: '#94a3b8'
    };
  }
  return {
    mode: 'light',
    text: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    link: '#2563eb',
    timestamp: '#94a3b8',
    bubbleIncoming: '#f1f5f9',
    bubbleIncomingText: '#1e293b',
    bubbleOutgoing: '#2563eb',
    bubbleOutgoingText: '#ffffff',
    mention: '#4f46e5',
    replyPreview: 'rgba(148,163,184,0.2)',
    reactionBg: '#ffffff',
    reactionText: '#334155',
    pinBannerBg: '#fffbeb',
    pinBannerText: '#78350f',
    systemText: '#64748b',
    inputHint: '#94a3b8',
    selection: 'rgba(37,99,235,0.2)',
    unreadBadge: '#ef4444',
    dateSeparator: '#94a3b8'
  };
};

export const paletteToCssVars = (palette: ChatPalette): Record<string, string> => ({
  '--chat-text': palette.text,
  '--chat-text-secondary': palette.textSecondary,
  '--chat-text-muted': palette.textMuted,
  '--chat-link': palette.link,
  '--chat-timestamp': palette.timestamp,
  '--chat-bubble-in': palette.bubbleIncoming,
  '--chat-bubble-in-text': palette.bubbleIncomingText,
  '--chat-bubble-out': palette.bubbleOutgoing,
  '--chat-bubble-out-text': palette.bubbleOutgoingText,
  '--chat-mention': palette.mention,
  '--chat-reply-preview': palette.replyPreview,
  '--chat-reaction-bg': palette.reactionBg,
  '--chat-reaction-text': palette.reactionText,
  '--chat-pin-bg': palette.pinBannerBg,
  '--chat-pin-text': palette.pinBannerText,
  '--chat-system': palette.systemText,
  '--chat-input-hint': palette.inputHint,
  '--chat-selection': palette.selection,
  '--chat-unread': palette.unreadBadge,
  '--chat-date-sep': palette.dateSeparator
});

export const appearanceToBackgroundStyle = (
  appearance: AppearanceInput | null | undefined
): React.CSSProperties => {
  const kind = String(appearance?.kind || 'none').toLowerCase();
  const opacity = Math.min(1, Math.max(0.15, Number(appearance?.opacity ?? 1) || 1));
  const blur = Math.min(40, Math.max(0, Number(appearance?.blurPx ?? 0) || 0));
  if (kind === 'none' || !appearance) {
    return { backgroundColor: '#ffffff' };
  }
  if (kind === 'solid') {
    return { backgroundColor: appearance.color || '#f8fafc', opacity };
  }
  if (kind === 'gradient') {
    const a = appearance.color || '#e0e7ff';
    const b = appearance.colorEnd || '#fce7f3';
    return {
      backgroundImage: `linear-gradient(145deg, ${a}, ${b})`,
      opacity
    };
  }
  if (kind === 'pattern') {
    const c = appearance.color || '#e2e8f0';
    return {
      backgroundColor: c,
      backgroundImage:
        'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.12) 1px, transparent 0)',
      backgroundSize: '16px 16px',
      opacity
    };
  }
  if ((kind === 'photo' || kind === 'wallpaper') && appearance.imageUrl) {
    return {
      backgroundImage: `url(${appearance.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: blur > 0 ? `blur(${blur}px)` : undefined,
      opacity
    };
  }
  return { backgroundColor: '#f8fafc' };
};

// React namespace for CSSProperties without importing react in non-TSX consumers
import type React from 'react';
