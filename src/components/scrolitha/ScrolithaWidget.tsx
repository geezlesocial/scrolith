/**
 * @deprecated Canonical production Scrolitha chat surface is `SupportWidget`
 * (lazy-mounted once from App.tsx). This path re-exports SupportWidget so any
 * legacy import cannot mount a second diverging chat implementation.
 *
 * Do not reintroduce a parallel chat UI here.
 */
export { default } from '../SupportWidget';
