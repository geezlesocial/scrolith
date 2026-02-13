import React, { useEffect, useState } from 'react';
import { Repeat2, X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onRepostNow: () => Promise<void> | void;
  onRepostWithComment: (comment: string) => Promise<void> | void;
  busy?: boolean;
};

const RepostModal: React.FC<Props> = ({ isOpen, onClose, onRepostNow, onRepostWithComment, busy }) => {
  const [mode, setMode] = useState<'now' | 'comment'>('now');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('now');
    setComment('');
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (!isOpen) return;
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-5 w-5 text-slate-800" />
            <h3 className="text-base font-semibold text-slate-900">Repost</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => setMode('now')}
            className={`rounded-xl border p-3 text-left text-sm transition ${
              mode === 'now' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-semibold">Repost now</div>
            <div className="mt-1 text-xs text-slate-500">Share instantly to your feed.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode('comment')}
            className={`rounded-xl border p-3 text-left text-sm transition ${
              mode === 'comment' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="font-semibold">Repost with a comment</div>
            <div className="mt-1 text-xs text-slate-500">Add your own take before reposting.</div>
          </button>
        </div>

        {mode === 'comment' ? (
          <div className="mt-4">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
              rows={4}
            />
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!!busy || (mode === 'comment' && !comment.trim())}
            onClick={() => {
              if (mode === 'now') return void onRepostNow();
              return void onRepostWithComment(comment.trim());
            }}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase text-white disabled:opacity-60"
          >
            {busy ? 'Posting...' : 'Repost'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RepostModal;

