import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, X } from 'lucide-react';

type Shortcut = { keys: string; description: string; group: string };

const SHORTCUTS: Shortcut[] = [
  { group: 'Navigation', keys: '?', description: 'Open or close this shortcuts help' },
  { group: 'Navigation', keys: '/', description: 'Focus global search (when available)' },
  { group: 'Navigation', keys: 'g h', description: 'Go to home / member home' },
  { group: 'Navigation', keys: 'g m', description: 'Go to messages' },
  { group: 'Navigation', keys: 'g n', description: 'Go to network (mobile)' },
  { group: 'Navigation', keys: 'g c', description: 'Go to community' },
  { group: 'Navigation', keys: 'Esc', description: 'Close dialogs and this help' },
  { group: 'Composer', keys: 'Ctrl/⌘ + Enter', description: 'Submit focused composer when supported' }
];

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"], [role="textbox"]'));
};

/**
 * Global keyboard productivity layer (Slack/Notion-inspired, FE-only).
 * Does not override inputs, modals, or browser defaults beyond documented shortcuts.
 */
const KeyboardShortcutsHelp: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const chordRef = React.useRef<string | null>(null);
  const chordTimerRef = React.useRef<number | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const focusSearch = useCallback(() => {
    const candidates = [
      'input[data-testid="global-search"]',
      'input[name="q"]',
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]'
    ];
    for (const selector of candidates) {
      const el = document.querySelector(selector) as HTMLInputElement | null;
      if (el && !el.disabled && el.offsetParent !== null) {
        el.focus();
        el.select?.();
        return true;
      }
    }
    // Fallback: open search route
    navigate('/search');
    return false;
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape' && open) {
        event.preventDefault();
        close();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (event.key === '/' && !event.shiftKey) {
        event.preventDefault();
        focusSearch();
        return;
      }

      // g + letter chord (GitHub-style)
      if (event.key === 'g' || event.key === 'G') {
        chordRef.current = 'g';
        if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current);
        chordTimerRef.current = window.setTimeout(() => {
          chordRef.current = null;
        }, 900);
        return;
      }

      if (chordRef.current === 'g') {
        const letter = event.key.toLowerCase();
        chordRef.current = null;
        if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current);
        if (letter === 'h') {
          event.preventDefault();
          navigate('/member-home');
        } else if (letter === 'm') {
          event.preventDefault();
          navigate('/messages');
        } else if (letter === 'n') {
          event.preventDefault();
          navigate('/m/network');
        } else if (letter === 'c') {
          event.preventDefault();
          navigate('/community');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (chordTimerRef.current) window.clearTimeout(chordTimerRef.current);
    };
  }, [close, focusSearch, navigate, open]);

  if (!open) return null;

  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 id="keyboard-shortcuts-title" className="text-base font-semibold text-slate-900">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {groups.map((group) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</h3>
              <ul className="space-y-2">
                {SHORTCUTS.filter((s) => s.group === group).map((item) => (
                  <li key={item.keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700">{item.description}</span>
                    <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-800">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            Shortcuts are ignored while typing in fields. Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1">?</kbd>{' '}
            anytime to reopen this guide.
          </p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;
