/**
 * Pure layout contracts for the dedicated /messages workspace.
 * Keeps conversation history scroll ownership correct and Scrolitha chrome compact.
 */

/** Desktop textarea defaults (px). */
export const MESSAGES_COMPOSER_MIN_HEIGHT_DESKTOP = 52;
export const MESSAGES_COMPOSER_MAX_HEIGHT_DESKTOP = 168;
export const MESSAGES_COMPOSER_MIN_HEIGHT_MOBILE = 56;
export const MESSAGES_COMPOSER_MAX_HEIGHT_MOBILE = 136;

export const computeComposerTextareaHeight = (input: {
  scrollHeight: number;
  isMobile: boolean;
  keyboardOpen?: boolean;
}): { height: number; overflowY: 'auto' | 'hidden' } => {
  const keyboardOpen = Boolean(input.keyboardOpen);
  const minHeight = input.isMobile
    ? keyboardOpen
      ? 48
      : MESSAGES_COMPOSER_MIN_HEIGHT_MOBILE
    : MESSAGES_COMPOSER_MIN_HEIGHT_DESKTOP;
  const maxHeight = input.isMobile
    ? keyboardOpen
      ? 112
      : MESSAGES_COMPOSER_MAX_HEIGHT_MOBILE
    : MESSAGES_COMPOSER_MAX_HEIGHT_DESKTOP;
  const height = Math.max(minHeight, Math.min(Number(input.scrollHeight) || 0, maxHeight));
  return {
    height,
    overflowY: (Number(input.scrollHeight) || 0) > maxHeight ? 'auto' : 'hidden'
  };
};

/** Scrolitha chips: single-row horizontal scroll (not multi-row wrap). */
export const SCROLITHA_PROMPT_CHIP_CONTAINER_CLASS =
  'flex max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-0.5';

/** History viewport must flex-grow and scroll independently. */
export const MESSAGES_HISTORY_VIEWPORT_CLASS =
  'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain';

/** Composer region is content-sized, never sticky/fixed overlay. */
export const MESSAGES_COMPOSER_REGION_CLASS = 'shrink-0 border-t';

export const isComposerOverlayPositioning = (className: string): boolean => {
  const tokens = String(className || '')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((t) => t === 'sticky' || t === 'fixed' || t.startsWith('sticky') || t.startsWith('fixed'));
};
