import React, { useMemo, useState } from 'react';
import { Loader2, X, UploadCloud, Sparkles, Film } from 'lucide-react';
import { FileService } from '../../services/files';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../../services/scroll';
import { useNotification } from '../../context/NotificationContext';

type ScrollCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (scroll: ScrollVideo) => void;
  config?: ScrollConfig | null;
};

const ScrollCreateModal: React.FC<ScrollCreateModalProps> = ({ open, onClose, onCreated, config }) => {
  const { showNotification } = useNotification();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'network' | 'followers' | 'private'>('public');
  const [isAIEnhanced, setIsAIEnhanced] = useState(false);
  const [filterPreset, setFilterPreset] = useState('none');
  const [filterStrength, setFilterStrength] = useState(60);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const allowedFilters = useMemo(() => {
    const fromConfig = Array.isArray(config?.allowedFilterPresets)
      ? config?.allowedFilterPresets.filter(Boolean)
      : [];
    const defaults = ['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm'];
    return Array.from(new Set([...(fromConfig || []), ...defaults]));
  }, [config?.allowedFilterPresets]);

  if (!open) return null;

  const resetAndClose = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setVisibility((config?.defaultVisibility as any) || 'public');
    setIsAIEnhanced(false);
    setFilterPreset('none');
    setFilterStrength(60);
    setVideoFile(null);
    setUploading(false);
    setProgress(0);
    onClose();
  };

  const handleSubmit = async () => {
    if (!videoFile) {
      showNotification('error', 'Scroll', 'Please choose a video file.');
      return;
    }
    if (config?.aiLabelRequired && !isAIEnhanced) {
      showNotification('error', 'Scroll', 'AI label is required by admin settings.');
      return;
    }

    try {
      setUploading(true);
      setProgress(2);
      const uploaded = await FileService.uploadFile(videoFile, 'portfolio' as any, {
        visibility: 'public',
        onProgress: (percent) => setProgress(percent)
      });
      const created = await ScrollService.create({
        fileId: uploaded.id,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        visibility,
        isAIEnhanced,
        filterPreset,
        filterStrength
      });
      onCreated(created);
      showNotification('success', 'Scroll', 'Scroll video published.');
      resetAndClose();
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to publish scroll video.';
      showNotification('error', 'Scroll', message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">Create Scroll</h2>
          </div>
          <button type="button" onClick={resetAndClose} className="rounded-full p-2 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Video</span>
            <input
              type="file"
              accept="video/*"
              onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-950"
            />
            {videoFile ? <p className="mt-1 text-xs text-white/70">{videoFile.name}</p> : null}
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add a short title"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Location (optional)"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Describe your scroll video"
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Visibility</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as any)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
              >
                <option value="public">Public</option>
                <option value="network">Network</option>
                <option value="followers">Followers</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Filter</span>
              <select
                value={filterPreset}
                onChange={(event) => setFilterPreset(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
              >
                {allowedFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Filter strength</span>
              <input
                type="range"
                min={0}
                max={100}
                value={filterStrength}
                onChange={(event) => setFilterStrength(Number(event.target.value))}
                className="w-full accent-cyan-400"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-white/85">
            <input
              type="checkbox"
              checked={isAIEnhanced}
              onChange={(event) => setIsAIEnhanced(event.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10 accent-cyan-400"
            />
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              Mark as AI-enhanced
            </span>
          </label>

          {uploading ? (
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-cyan-100">
                  <UploadCloud className="h-4 w-4" />
                  Uploading video...
                </span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-cyan-300 transition-all" style={{ width: `${Math.max(2, progress)}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Publish Scroll
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScrollCreateModal;
