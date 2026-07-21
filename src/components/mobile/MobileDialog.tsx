import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

type MobileDialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<MobileDialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
};

type MobileDialogProps = {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: MobileDialogSize;
  zIndexClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
  lockBodyScroll?: boolean;
};

export const mobileTapIsolationProps = {
  'data-scroll-skip-swipe': 'true',
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
  onTouchStart: (event: React.TouchEvent) => event.stopPropagation(),
  onClick: (event: React.MouseEvent) => event.stopPropagation()
};

export const MobileDialogFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={[
      'flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3',
      className
    ].join(' ')}
  >
    {children}
  </div>
);

const MobileDialog: React.FC<MobileDialogProps> = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md',
  zIndexClassName = 'z-50',
  panelClassName = '',
  bodyClassName = '',
  footerClassName = '',
  closeLabel = 'Close dialog',
  closeDisabled = false,
  lockBodyScroll = true
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKeyDown);
    if (lockBodyScroll) document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (lockBodyScroll) document.body.style.overflow = previousOverflow;
    };
  }, [closeDisabled, lockBodyScroll, onClose, open]);

  if (!open) return null;

  return (
    <div
      className={[
        'fixed inset-0 flex items-center justify-center bg-black/50 p-2 sm:p-4',
        zIndexClassName
      ].join(' ')}
      role="presentation"
      data-scroll-skip-swipe="true"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))'
      }}
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <section
        {...mobileTapIsolationProps}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl',
          'sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl',
          SIZE_CLASS[size],
          panelClassName
        ].join(' ')}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-950 sm:text-lg">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={closeLabel}
            className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className={['min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6', bodyClassName].join(' ')}
          style={{ WebkitOverflowScrolling: 'touch' }}
          data-scroll-skip-swipe="true"
        >
          {children}
        </div>

        {footer ? (
          <footer
            className={[
              'shrink-0 border-t border-slate-100 bg-white/95 px-4 py-3 shadow-[0_-12px_28px_-24px_rgba(15,23,42,0.7)] backdrop-blur sm:px-6',
              footerClassName
            ].join(' ')}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};

export default MobileDialog;
