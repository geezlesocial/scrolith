import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Send, X } from 'lucide-react';
import { CommunityService } from '../../../services/community';
import { useNotification } from '../../../context/NotificationContext';
import { UploadedFile } from '../../../types';
import FilePickerModal from '../../../dashboard/shared/FilePickerModal';

const isVideo = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('video/');
const isImage = (mime?: string | null) => String(mime || '').toLowerCase().startsWith('image/');

export default function MobilePostScreen() {
  const { showNotification } = useNotification();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canPost = content.trim().length >= 1 || attachments.length > 0;

  const attachmentIds = useMemo(
    () => Array.from(new Set(attachments.map((f) => String(f.id || '').trim()).filter(Boolean))),
    [attachments]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((f) => String(f.id) !== String(id)));
  };

  const submit = async () => {
    if (!canPost || busy) return;
    setBusy(true);
    try {
      await CommunityService.createPost({
        content: content.trim(),
        attachmentFileIds: attachmentIds,
        attachments: attachmentIds
      } as any);
      setContent('');
      setAttachments([]);
      showNotification('success', 'Posted', 'Your update is live.');
    } catch (e: any) {
      showNotification('error', 'Post failed', e?.response?.data?.error || e?.message || 'Unable to post right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Create post</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share an update with your network..."
          className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          rows={5}
        />

        {attachments.length ? (
          <div className="mt-3 grid gap-2">
            {attachments.slice(0, 6).map((file) => (
              <div key={file.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 text-slate-500 hover:text-slate-700"
                  aria-label="Remove attachment"
                >
                  <X className="h-4 w-4" />
                </button>
                {isVideo(file.mime_type as any) ? (
                  <video src={file.url} className="h-44 w-full object-cover" controls preload="metadata" />
                ) : isImage(file.mime_type as any) ? (
                  <img src={file.url} alt={file.name} className="h-44 w-full object-cover" />
                ) : (
                  <a href={file.url} className="block p-4 text-sm font-semibold text-slate-700 hover:underline">
                    {file.name}
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ImageIcon className="h-4 w-4" />
            Attach
          </button>

          <button
            type="button"
            disabled={!canPost || busy}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {busy ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>

      <FilePickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        filterType="all"
        allowUpload
        allowCamera
        onSelectMultiple={(files) => {
          setAttachments((prev) => {
            const next = [...prev];
            (files || []).forEach((f) => {
              if (!next.some((x) => String(x.id) === String(f.id))) next.push(f);
            });
            return next;
          });
          setPickerOpen(false);
        }}
        onSelect={(file) => {
          setAttachments((prev) => {
            if (prev.some((x) => String(x.id) === String(file.id))) return prev;
            return [...prev, file];
          });
          setPickerOpen(false);
        }}
        title="Attach files"
      />
    </div>
  );
}

