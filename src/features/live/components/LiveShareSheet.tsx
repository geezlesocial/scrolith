import React, { useEffect } from 'react';
import { Copy, ExternalLink, Facebook, Link2, Linkedin, MessageCircleMore, X } from 'lucide-react';

type LiveShareChannel = 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'whatsapp' | 'copy';

type LiveShareSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onShare: (channel: LiveShareChannel) => Promise<void> | void;
};

const shareButtons: Array<{ id: LiveShareChannel; label: string; Icon: React.ComponentType<any> }> = [
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'twitter', label: 'Twitter / X', Icon: ExternalLink },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { id: 'tiktok', label: 'TikTok', Icon: ExternalLink },
  { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircleMore },
  { id: 'copy', label: 'Copy live URL', Icon: Copy }
];

const LiveShareSheet: React.FC<LiveShareSheetProps> = ({ isOpen, onClose, onShare }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button type="button" className="absolute inset-0 bg-slate-950/65" onClick={onClose} aria-label="Close share sheet" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_45%),linear-gradient(135deg,_#f8fafc,_#ffffff)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                <Link2 className="h-3.5 w-3.5" />
                Share live
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-950">Send this live stream anywhere.</h3>
              <p className="mt-1 text-sm text-slate-500">
                Share directly to your network or copy the live URL without disturbing the broadcast surface.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              aria-label="Close share sheet"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          {shareButtons.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => void onShare(id)}
              className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-200 hover:bg-sky-50"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">{label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveShareSheet;
