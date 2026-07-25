/**
 * Normalize / serialize CommunityPost presentation (text backgrounds).
 * Additive only — null when unset so existing posts remain unchanged.
 */

export type PostPresentation = {
  type: 'text_background';
  themeId: string;
  background: string;
  textColor: string;
};

const ALLOWED_THEME_IDS = new Set([
  'violet',
  'indigo',
  'blue',
  'coral',
  'sunset',
  'mint',
  'gold',
  'midnight',
  'slate',
  'pink',
  'teal',
  'solid-purple',
  'solid-red',
  'solid-green',
  'solid-black',
  'custom'
]);

const THEME_PRESETS: Record<string, { background: string; textColor: string }> = {
  violet: {
    background: 'linear-gradient(145deg, #a855f7 0%, #7c3aed 45%, #5b21b6 100%)',
    textColor: '#ffffff'
  },
  indigo: {
    background: 'linear-gradient(145deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)',
    textColor: '#ffffff'
  },
  blue: {
    background: 'linear-gradient(145deg, #38bdf8 0%, #2563eb 55%, #1e3a8a 100%)',
    textColor: '#ffffff'
  },
  coral: {
    background: 'linear-gradient(145deg, #fb7185 0%, #f43f5e 50%, #be123c 100%)',
    textColor: '#ffffff'
  },
  sunset: {
    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 40%, #ea580c 100%)',
    textColor: '#fff7ed'
  },
  mint: {
    background: 'linear-gradient(145deg, #6ee7b7 0%, #34d399 50%, #059669 100%)',
    textColor: '#022c22'
  },
  gold: {
    background: 'linear-gradient(145deg, #fde68a 0%, #fbbf24 50%, #d97706 100%)',
    textColor: '#422006'
  },
  midnight: {
    background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #020617 100%)',
    textColor: '#f8fafc'
  },
  slate: {
    background: 'linear-gradient(145deg, #64748b 0%, #475569 50%, #334155 100%)',
    textColor: '#f8fafc'
  },
  pink: {
    background: 'linear-gradient(145deg, #fbcfe8 0%, #f472b6 45%, #db2777 100%)',
    textColor: '#500724'
  },
  teal: {
    background: 'linear-gradient(145deg, #5eead4 0%, #14b8a6 50%, #0f766e 100%)',
    textColor: '#042f2e'
  },
  'solid-purple': { background: '#7c3aed', textColor: '#ffffff' },
  'solid-red': { background: '#dc2626', textColor: '#ffffff' },
  'solid-green': { background: '#16a34a', textColor: '#ffffff' },
  'solid-black': { background: '#0f172a', textColor: '#f8fafc' }
};

const isSafeCssColorish = (value: string) => {
  const v = String(value || '').trim();
  if (!v || v.length > 280) return false;
  // Allow hex, rgb/rgba, linear-gradient only (no url() / expression).
  if (/url\s*\(/i.test(v) || /expression\s*\(/i.test(v) || /javascript:/i.test(v)) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  if (/^rgba?\(/i.test(v)) return true;
  if (/^linear-gradient\(/i.test(v)) return true;
  return false;
};

/**
 * Accept presentation from request body. Returns null to clear / leave unset.
 * When hasAttachments is true, presentation is forced off (text-background is text-only).
 */
export const normalizePostPresentationInput = (
  body: any,
  options?: { hasAttachments?: boolean }
): PostPresentation | null | undefined => {
  if (options?.hasAttachments) {
    // Explicit clear when media present — text backgrounds are for text-only posts.
    if (
      body?.presentation !== undefined ||
      body?.textBackgroundId !== undefined ||
      body?.textBackground !== undefined
    ) {
      return null;
    }
    return undefined;
  }

  const hasAny =
    body?.presentation !== undefined ||
    body?.textBackgroundId !== undefined ||
    body?.text_background_id !== undefined ||
    body?.textBackground !== undefined ||
    body?.text_background !== undefined ||
    body?.textColor !== undefined ||
    body?.text_color !== undefined;

  if (!hasAny) return undefined;

  const raw = body?.presentation;
  if (raw === null || body?.textBackgroundId === null || body?.textBackgroundId === 'none') {
    return null;
  }

  let themeId = String(
    (raw && typeof raw === 'object' ? raw.themeId || raw.theme_id || raw.id : '') ||
      body?.textBackgroundId ||
      body?.text_background_id ||
      ''
  )
    .trim()
    .toLowerCase();

  if (themeId === 'none' || themeId === '') {
    // Custom colors from client
    const background = String(
      (raw && typeof raw === 'object' ? raw.background || raw.textBackground : '') ||
        body?.textBackground ||
        body?.text_background ||
        ''
    ).trim();
    const textColor = String(
      (raw && typeof raw === 'object' ? raw.textColor || raw.color : '') ||
        body?.textColor ||
        body?.text_color ||
        ''
    ).trim();
    if (!background || !textColor) return null;
    if (!isSafeCssColorish(background) || !isSafeCssColorish(textColor)) return null;
    return {
      type: 'text_background',
      themeId: 'custom',
      background,
      textColor
    };
  }

  if (!ALLOWED_THEME_IDS.has(themeId)) return null;
  const preset = THEME_PRESETS[themeId];
  if (preset) {
    return {
      type: 'text_background',
      themeId,
      background: preset.background,
      textColor: preset.textColor
    };
  }

  // custom with explicit colors
  const background = String(
    (raw && typeof raw === 'object' ? raw.background : '') || body?.textBackground || ''
  ).trim();
  const textColor = String(
    (raw && typeof raw === 'object' ? raw.textColor || raw.color : '') || body?.textColor || ''
  ).trim();
  if (!background || !textColor) return null;
  if (!isSafeCssColorish(background) || !isSafeCssColorish(textColor)) return null;
  return {
    type: 'text_background',
    themeId: 'custom',
    background,
    textColor
  };
};

export const serializePostPresentation = (post: any) => {
  const raw = post?.presentation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      presentation: null,
      textBackground: null,
      textColor: null,
      textBackgroundId: null
    };
  }
  const background = String((raw as any).background || '').trim();
  const textColor = String((raw as any).textColor || (raw as any).color || '').trim();
  const themeId = String((raw as any).themeId || (raw as any).id || '').trim();
  if (!background || !textColor) {
    return {
      presentation: null,
      textBackground: null,
      textColor: null,
      textBackgroundId: null
    };
  }
  const presentation: PostPresentation = {
    type: 'text_background',
    themeId: themeId || 'custom',
    background,
    textColor
  };
  return {
    presentation,
    textBackground: background,
    textColor,
    textBackgroundId: presentation.themeId
  };
};
