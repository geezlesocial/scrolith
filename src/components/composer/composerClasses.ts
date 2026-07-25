/**
 * Phase 5.1 — enterprise composer visual contracts.
 * Pure class strings; no behavior.
 */

export const composerEntryCard =
  'rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-22px_rgba(15,23,42,0.28)] ' +
  'transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06),0_16px_36px_-20px_rgba(15,23,42,0.3)]';

export const composerEntryTrigger =
  'flex min-h-12 flex-1 items-center rounded-full border border-slate-200 bg-slate-50/80 px-5 py-3 text-left text-[15px] ' +
  'text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const composerEntryShortcut =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 ' +
  'text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const composerModalBackdrop =
  'fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4 md:p-6';

export const composerModalShell =
  'relative z-[1] flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl ' +
  'border border-slate-200/90 bg-white shadow-[0_24px_80px_-28px_rgba(15,23,42,0.55)] sm:rounded-2xl';

export const composerModalHeader =
  'flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5';

export const composerModalBody = 'flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5';

export const composerModalFooter =
  'border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4';

export const composerAvatar =
  'h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 sm:h-14 sm:w-14';

export const composerPrimaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm ' +
  'font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const composerSecondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 ' +
  'py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const composerToolbarBtn =
  'inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold ' +
  'text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const composerField =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none ' +
  'transition focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200';

export const composerEditor =
  'min-h-[160px] max-h-[min(40vh,320px)] w-full resize-y rounded-xl border border-slate-200 bg-white p-4 ' +
  'text-[15px] leading-7 text-slate-800 shadow-sm outline-none transition focus:border-slate-400 ' +
  'focus-visible:ring-2 focus-visible:ring-slate-200 sm:min-h-[180px]';

/**
 * Facebook-style text-background composer surface.
 * Intentionally omits bg-white / text-slate so theme colors paint through.
 * Pair with inline style: backgroundColor transparent + theme textColor/caretColor.
 */
export const composerEditorTextBackground =
  'min-h-[220px] max-h-[min(50vh,420px)] w-full resize-none rounded-2xl border-0 bg-transparent p-6 ' +
  'text-center text-xl font-semibold leading-snug shadow-none outline-none transition ' +
  'focus:border-0 focus:ring-0 focus-visible:ring-0 sm:min-h-[260px] sm:p-8 sm:text-2xl ' +
  'placeholder:text-inherit placeholder:opacity-60';

export const composerAttachmentTile =
  'relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50';

export const composerDraftBanner =
  'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900';
