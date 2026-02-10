export type StoryTextTheme = {
  id: string;
  label: string;
  background: string;
  textColor: string;
};

export type StoryTextFont = {
  id: string;
  label: string;
  fontFamily: string;
};

export const storyTextThemes: StoryTextTheme[] = [
  {
    id: 'sunset',
    label: 'Sunset',
    background: 'linear-gradient(135deg, #f6b093 0%, #f08c7c 45%, #e26d7d 100%)',
    textColor: '#2b1a12'
  },
  {
    id: 'midnight',
    label: 'Midnight',
    background: 'linear-gradient(135deg, #0f172a 0%, #1f2937 100%)',
    textColor: '#f8fafc'
  },
  {
    id: 'mint',
    label: 'Mint',
    background: 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)',
    textColor: '#064e3b'
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    background: 'linear-gradient(135deg, #bfdbfe 0%, #60a5fa 100%)',
    textColor: '#0f172a'
  },
  {
    id: 'rose',
    label: 'Rose',
    background: 'linear-gradient(135deg, #fecdd3 0%, #fb7185 100%)',
    textColor: '#4c0519'
  },
  {
    id: 'sand',
    label: 'Sand',
    background: '#d6c0a6',
    textColor: '#2a1a12'
  }
];

export const storyTextFonts: StoryTextFont[] = [
  {
    id: 'sans',
    label: 'Sans',
    fontFamily: 'var(--font-sans)'
  },
  {
    id: 'serif',
    label: 'Serif',
    fontFamily: 'var(--font-display)'
  },
  {
    id: 'mono',
    label: 'Mono',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  }
];

const defaultTheme = storyTextThemes[0];
const defaultFont = storyTextFonts[0];

export const getStoryTextStyle = (story: any) => {
  const background =
    story?.textBackground ||
    story?.text_background ||
    defaultTheme.background;
  const color =
    story?.textColor ||
    story?.text_color ||
    defaultTheme.textColor;
  const fontFamily =
    story?.textFont ||
    story?.text_font ||
    defaultFont.fontFamily;
  const textAlign =
    story?.textAlign ||
    story?.text_align ||
    'center';

  return { background, color, fontFamily, textAlign };
};

export const getDefaultStoryTextDraft = () => ({
  textBackground: defaultTheme.background,
  textColor: defaultTheme.textColor,
  textFont: defaultFont.fontFamily,
  textAlign: 'center' as const
});
