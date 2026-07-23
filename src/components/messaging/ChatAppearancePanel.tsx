/**
 * Per-user chat appearance settings (background). Personal only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Palette, RotateCcw, X } from 'lucide-react';
import { MessagingService } from '../../services/messaging';
import { FileService } from '../../services/files';
// FileService.uploadFile(file, category?, options?)
import {
  appearanceToBackgroundStyle,
  buildChatPalette,
  paletteToCssVars,
  type AppearanceInput
} from '../../services/messaging/chatTextColorEngine';

type Props = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (appearance: AppearanceInput) => void;
};

const PRESET_SOLIDS = ['#ffffff', '#0f172a', '#1e3a5f', '#14532d', '#4c1d95', '#7f1d1d', '#fef3c7', '#e0e7ff'];

const ChatAppearancePanel: React.FC<Props> = ({ conversationId, open, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<AppearanceInput>({ kind: 'none', opacity: 1, blurPx: 0 });
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!open || !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await MessagingService.getChatAppearance(conversationId);
      setAppearance(data || { kind: 'none' });
    } catch (e: any) {
      setError(e?.message || 'Failed to load appearance');
    } finally {
      setLoading(false);
    }
  }, [conversationId, open]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: AppearanceInput) => {
    setSaving(true);
    setError(null);
    try {
      const data = await MessagingService.saveChatAppearance(conversationId, next);
      setAppearance(data);
      onSaved?.(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('Image must be 15 MB or smaller');
      return;
    }
    const okType = /image\/(jpeg|jpg|png|webp)/i.test(file.type);
    if (!okType) {
      setError('Use JPG, PNG, or WEBP');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const uploaded = await FileService.uploadFile(file, 'image', { visibility: 'private' });
      const fileId = String((uploaded as any)?.id || (uploaded as any)?.fileId || '').trim();
      const imageUrl = String((uploaded as any)?.url || (uploaded as any)?.contentUrl || '').trim();
      await save({
        kind: 'photo',
        fileId: fileId || null,
        imageUrl: imageUrl || null,
        opacity: appearance.opacity ?? 1,
        blurPx: appearance.blurPx ?? 0
      });
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const previewStyle = appearanceToBackgroundStyle(appearance);
  const palette = buildChatPalette(appearance);
  const cssVars = paletteToCssVars(palette);

  const onDropPhoto = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0] || null;
    if (file) void onPickPhoto(file);
  };

  const onPastePhoto = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'file' && /^image\//i.test(item.type)) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void onPickPhoto(file);
          return;
        }
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Chat appearance"
      data-testid="chat-appearance-panel"
      onPaste={onPastePhoto}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropPhoto}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Palette className="h-4 w-4" /> Chat appearance
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
          ) : null}
          {loading ? <div className="text-sm text-slate-500">Loading…</div> : null}

          <div
            className="relative h-28 overflow-hidden rounded-xl border border-slate-200"
            style={{ ...previewStyle, ...cssVars } as React.CSSProperties}
            data-testid="chat-appearance-preview"
          >
            <div className="absolute inset-0 flex flex-col justify-end gap-1 p-3">
              <div
                className="max-w-[70%] rounded-2xl px-3 py-1.5 text-xs"
                style={{ background: 'var(--chat-bubble-in)', color: 'var(--chat-bubble-in-text)' }}
              >
                Incoming preview
              </div>
              <div
                className="ml-auto max-w-[70%] rounded-2xl px-3 py-1.5 text-xs"
                style={{ background: 'var(--chat-bubble-out)', color: 'var(--chat-bubble-out-text)' }}
              >
                Outgoing preview
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Solid colors</div>
            <div className="flex flex-wrap gap-2">
              {PRESET_SOLIDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={saving}
                  onClick={() => void save({ kind: 'solid', color: c, opacity: 1, blurPx: 0 })}
                  className="h-8 w-8 rounded-full border border-slate-200 shadow-sm"
                  style={{ backgroundColor: c }}
                  aria-label={`Solid ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() =>
                void save({
                  kind: 'gradient',
                  color: '#e0e7ff',
                  colorEnd: '#fce7f3',
                  opacity: appearance.opacity ?? 1,
                  blurPx: appearance.blurPx ?? 0
                })
              }
            >
              Soft gradient
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() =>
                void save({
                  kind: 'pattern',
                  color: '#f1f5f9',
                  opacity: appearance.opacity ?? 1,
                  blurPx: 0
                })
              }
            >
              Pattern
            </button>
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Photo
            </button>
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={() => void save({ kind: 'none', opacity: 1, blurPx: 0 })}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>

          {appearance.kind && appearance.kind !== 'none' ? (
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <label className="block text-xs font-semibold text-slate-600">
                Opacity · {Math.round((appearance.opacity ?? 1) * 100)}%
                <input
                  type="range"
                  min={15}
                  max={100}
                  value={Math.round((appearance.opacity ?? 1) * 100)}
                  disabled={saving}
                  className="mt-1 w-full"
                  onChange={(e) => {
                    const opacity = Math.min(1, Math.max(0.15, Number(e.target.value) / 100));
                    setAppearance((prev) => ({ ...prev, opacity }));
                  }}
                  onMouseUp={() => void save({ ...appearance, opacity: appearance.opacity ?? 1 })}
                  onTouchEnd={() => void save({ ...appearance, opacity: appearance.opacity ?? 1 })}
                />
              </label>
              {(appearance.kind === 'photo' || appearance.kind === 'wallpaper') && (
                <label className="block text-xs font-semibold text-slate-600">
                  Blur · {appearance.blurPx ?? 0}px
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={appearance.blurPx ?? 0}
                    disabled={saving}
                    className="mt-1 w-full"
                    onChange={(e) => {
                      const blurPx = Math.min(40, Math.max(0, Number(e.target.value) || 0));
                      setAppearance((prev) => ({ ...prev, blurPx }));
                    }}
                    onMouseUp={() => void save({ ...appearance, blurPx: appearance.blurPx ?? 0 })}
                    onTouchEnd={() => void save({ ...appearance, blurPx: appearance.blurPx ?? 0 })}
                  />
                </label>
              )}
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => void save(appearance)}
              >
                Apply adjustments
              </button>
            </div>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onPickPhoto(e.target.files?.[0] || null)}
          />

          <p className="text-[11px] text-slate-500">
            Backgrounds are private to you and sync across your devices. Text colors update automatically for
            contrast (WCAG AA target).
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatAppearancePanel;
