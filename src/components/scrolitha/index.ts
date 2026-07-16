/**
 * Canonical Scrolitha frontend public surface.
 * Prefer importing from this barrel for new call sites.
 */
export { default as ScrolithaResponseCard } from './ScrolithaResponseCard';
export { normalizeScrolithaResponseText } from './scrolithaResponseFormat';
/** @deprecated Compatibility alias — use SupportWidget from App mount. */
export { default as ScrolithaWidget } from './ScrolithaWidget';
