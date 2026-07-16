import React, { useEffect, useState } from 'react';
import { Repeat2 } from 'lucide-react';
import MobileDialog, { MobileDialogFooter } from '../../components/mobile/MobileDialog';

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

  if (!isOpen) return null;

  return (
    <MobileDialog
      open={isOpen}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
            <Repeat2 className="h-5 w-5 text-slate-800" />
          <span>Repost</span>
        </span>
      }
      closeDisabled={!!busy}
      footer={
        <MobileDialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60 sm:w-auto"
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
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold uppercase text-white disabled:opacity-60 sm:w-auto"
          >
            {busy ? 'Posting...' : 'Repost'}
          </button>
        </MobileDialogFooter>
      }
    >
        <div className="grid gap-2">
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
    </MobileDialog>
  );
};

export default RepostModal;

