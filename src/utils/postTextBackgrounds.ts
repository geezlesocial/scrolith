/**
 * Facebook-style create-post text backgrounds.
 * Each theme pairs background (solid or gradient) with high-contrast text color.
 */

export type PostTextBackgroundTheme = {
  id: string;
  label: string;
  /** CSS background value */
  background: string;
  /** Auto-compatible text color */
  textColor: string;
  /** Optional preview swatch (same as background) */
  preview?: string;
};

/** Default = no background (normal post). */
export const POST_TEXT_BG_NONE_ID = 'none';

export const postTextBackgroundThemes: PostTextBackgroundTheme[] = [
  {
    id: POST_TEXT_BG_NONE_ID,
    label: 'Default',
    background: '',
    textColor: ''
  },
  {
    id: 'violet',
    label: 'Violet',
    background: 'linear-gradient(145deg, #a855f7 0%, #7c3aed 45%, #5b21b6 100%)',
    textColor: '#ffffff'
  },
  {
    id: 'indigo',
    label: 'Indigo',
    background: 'linear-gradient(145deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)',
    textColor: '#ffffff'
  },
  {
    id: 'blue',
    label: 'Blue',
    background: 'linear-gradient(145deg, #38bdf8 0%, #2563eb 55%, #1e3a8a 100%)',
    textColor: '#ffffff'
  },
  {
    id: 'coral',
    label: 'Coral',
    background: 'linear-gradient(145deg, #fb7185 0%, #f43f5e 50%, #be123c 100%)',
    textColor: '#ffffff'
  },
  {
    id: 'sunset',
    label: 'Sunset',
    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 40%, #ea580c 100%)',
    textColor: '#fff7ed'
  },
  {
    id: 'mint',
    label: 'Mint',
    background: 'linear-gradient(145deg, #6ee7b7 0%, #34d399 50%, #059669 100%)',
    textColor: '#022c22'
  },
  {
    id: 'gold',
    label: 'Gold',
    background: 'linear-gradient(145deg, #fde68a 0%, #fbbf24 50%, #d97706 100%)',
    textColor: '#422006'
  },
  {
    id: 'midnight',
    label: 'Midnight',
    background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #020617 100%)',
    textColor: '#f8fafc'
  },
  {
    id: 'slate',
    label: 'Slate',
    background: 'linear-gradient(145deg, #64748b 0%, #475569 50%, #334155 100%)',
    textColor: '#f8fafc'
  },
  {
    id: 'pink',
    label: 'Pink',
    background: 'linear-gradient(145deg, #fbcfe8 0%, #f472b6 45%, #db2777 100%)',
    textColor: '#500724'
  },
  {
    id: 'teal',
    label: 'Teal',
    background: 'linear-gradient(145deg, #5eead4 0%, #14b8a6 50%, #0f766e 100%)',
    textColor: '#042f2e'
  },
  {
    id: 'solid-purple',
    label: 'Solid purple',
    background: '#7c3aed',
    textColor: '#ffffff'
  },
  {
    id: 'solid-red',
    label: 'Solid red',
    background: '#dc2626',
    textColor: '#ffffff'
  },
  {
    id: 'solid-green',
    label: 'Solid green',
    background: '#16a34a',
    textColor: '#ffffff'
  },
  {
    id: 'solid-black',
    label: 'Solid black',
    background: '#0f172a',
    textColor: '#f8fafc'
  }
];

export type PostPresentation = {
  type: 'text_background';
  themeId: string;
  background: string;
  textColor: string;
};

export const getPostTextBackgroundTheme = (id?: string | null) => {
  const key = String(id || POST_TEXT_BG_NONE_ID).trim();
  return postTextBackgroundThemes.find((t) => t.id === key) || postTextBackgroundThemes[0];
};

export const buildPostPresentation = (themeId?: string | null): PostPresentation | null => {
  const theme = getPostTextBackgroundTheme(themeId);
  if (!theme || theme.id === POST_TEXT_BG_NONE_ID || !theme.background) return null;
  return {
    type: 'text_background',
    themeId: theme.id,
    background: theme.background,
    textColor: theme.textColor
  };
};

export const resolvePostPresentation = (post: any): PostPresentation | null => {
  if (!post || typeof post !== 'object') return null;
  const raw = post.presentation || post.textPresentation || post.text_presentation || null;
  if (raw && typeof raw === 'object') {
    const background = String(raw.background || raw.textBackground || '').trim();
    const textColor = String(raw.textColor || raw.text_color || raw.color || '').trim();
    const themeId = String(raw.themeId || raw.theme_id || raw.id || '').trim();
    if (background && textColor) {
      return {
        type: 'text_background',
        themeId: themeId || 'custom',
        background,
        textColor
      };
    }
  }
  const background = String(post.textBackground || post.text_background || '').trim();
  const textColor = String(post.textColor || post.text_color || '').trim();
  const themeId = String(post.textBackgroundId || post.text_background_id || '').trim();
  if (background && textColor) {
    return {
      type: 'text_background',
      themeId: themeId || 'custom',
      background,
      textColor
    };
  }
  if (themeId) return buildPostPresentation(themeId);
  return null;
};

/** Text-background layouts only apply when there is body text and no media attachments. */
export const shouldRenderTextBackground = (post: any) => {
  const presentation = resolvePostPresentation(post);
  if (!presentation?.background) return false;
  const content = String(post?.content || post?.body || post?.text || '').trim();
  if (!content) return false;
  const attachments = Array.isArray(post?.attachments)
    ? post.attachments
    : Array.isArray(post?.media)
      ? post.media
      : [];
  const attachmentIds = Array.isArray(post?.attachmentFileIds) ? post.attachmentFileIds : [];
  if (attachments.length > 0 || attachmentIds.length > 0) return false;
  return true;
};
