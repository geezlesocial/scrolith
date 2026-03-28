import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Loader2, LocateFixed, MapPin, X, UploadCloud, Sparkles, Film } from 'lucide-react';
import { FileService } from '../../services/files';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../../services/scroll';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import OfferTagSelector from '../../components/commerce/OfferTagSelector';
import type { OfferTagSelection } from '../../utils/contentOffers';
import type { PendingPostVideoScrollSource } from '../../utils/postVideoScrollBridge';
import { LocationService } from '../../services/location';
import { getCurrentDeviceCoordinates } from '../../utils/deviceLocation';
import { ScrolithaService, type ScrolithaRewriteMode } from '../../services/scrolitha';
import type { LocationSuggestion } from '../../types';

type ScrollCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (scroll: ScrollVideo) => void;
  config?: ScrollConfig | null;
  sourceVideo?: PendingPostVideoScrollSource | null;
};

const SCROLL_DESCRIPTION_REWRITE_ACTIONS: Array<{ mode: ScrolithaRewriteMode; label: string }> = [
  { mode: 'grammar', label: 'Improve Grammar' },
  { mode: 'rephrase', label: 'Rephrase' },
  { mode: 'professional', label: 'Make Professional' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'expand', label: 'Expand' }
];

const getScrollPreviewFilterStyle = (preset: string, strengthValue: number): React.CSSProperties => {
  const strength = Math.max(0, Math.min(100, Number(strengthValue || 60))) / 100;
  const normalizedPreset = String(preset || 'none').toLowerCase();
  if (!normalizedPreset || normalizedPreset === 'none') return { filter: 'none' };
  if (normalizedPreset === 'bw') return { filter: `grayscale(${0.4 + strength * 0.6})` };
  if (normalizedPreset === 'sepia') return { filter: `sepia(${0.3 + strength * 0.7})` };
  if (normalizedPreset === 'warm') {
    return {
      filter: `saturate(${1 + strength * 0.35}) contrast(${1 + strength * 0.08}) brightness(${1 + strength * 0.08})`
    };
  }
  if (normalizedPreset === 'vibrant') {
    return {
      filter: `saturate(${1.2 + strength * 0.6}) contrast(${1 + strength * 0.2})`
    };
  }
  if (normalizedPreset === 'cinematic') {
    return {
      filter: `contrast(${1.1 + strength * 0.2}) saturate(${0.85 + strength * 0.2}) brightness(${0.9 + strength * 0.08})`
    };
  }
  return { filter: 'none' };
};

const ScrollCreateModal: React.FC<ScrollCreateModalProps> = ({ open, onClose, onCreated, config, sourceVideo }) => {
  const { showNotification } = useNotification();
  const { user } = useUser();
  const deviceVideoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'network' | 'followers' | 'private'>('public');
  const [graphicWarning, setGraphicWarning] = useState(false);
  const [isAIEnhanced, setIsAIEnhanced] = useState(false);
  const [filterPreset, setFilterPreset] = useState('none');
  const [filterStrength, setFilterStrength] = useState(60);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [offerTags, setOfferTags] = useState<OfferTagSelection[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [aiRewriting, setAiRewriting] = useState<ScrolithaRewriteMode | null>(null);
  const suppressLocationSearchRef = useRef(false);

  const allowedFilters = useMemo(() => {
    const fromConfig = Array.isArray(config?.allowedFilterPresets)
      ? config?.allowedFilterPresets.filter(Boolean)
      : [];
    const defaults = ['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm'];
    return Array.from(new Set([...(fromConfig || []), ...defaults]));
  }, [config?.allowedFilterPresets]);

  const selectInputClassName =
    'w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500';

  const previewFilterStyle = useMemo(
    () => getScrollPreviewFilterStyle(filterPreset, filterStrength),
    [filterPreset, filterStrength]
  );

  useEffect(() => {
    if (!open) return;
    setTitle(String(sourceVideo?.title || '').trim());
    setDescription(String(sourceVideo?.description || '').trim());
    setLocation(String(sourceVideo?.location || '').trim());
    setVisibility((config?.defaultVisibility as any) || 'public');
    setGraphicWarning(false);
    setIsAIEnhanced(false);
    setFilterPreset('none');
    setFilterStrength(60);
    setVideoFile(null);
    setOfferTags([]);
    setUploading(false);
    setProgress(0);
    setLocationSuggestions([]);
    setLocationSearching(false);
    setLocationResolving(false);
    setLocationError('');
    setAiRewriting(null);
    suppressLocationSearchRef.current = false;
  }, [
    config?.defaultVisibility,
    open,
    sourceVideo?.description,
    sourceVideo?.location,
    sourceVideo?.title
  ]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [videoFile]);

  const handleVideoInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setVideoFile(nextFile);
    event.currentTarget.value = '';
  };

  useEffect(() => {
    if (!open) return;
    const query = location.trim();
    if (suppressLocationSearchRef.current) {
      suppressLocationSearchRef.current = false;
      setLocationSuggestions([]);
      setLocationSearching(false);
      return;
    }
    if (query.length < 2) {
      setLocationSuggestions([]);
      setLocationSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLocationSearching(true);
      try {
        const results = await LocationService.search(query, 5);
        if (!cancelled) {
          setLocationSuggestions(results);
          setLocationError('');
        }
      } catch (error: any) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setLocationError(error?.message || 'Unable to search locations right now.');
        }
      } finally {
        if (!cancelled) {
          setLocationSearching(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [location, open]);

  const applyLocationSuggestion = (suggestion: LocationSuggestion) => {
    suppressLocationSearchRef.current = true;
    setLocation(String(suggestion.formattedAddress || suggestion.location || suggestion.label || '').trim());
    setLocationSuggestions([]);
    setLocationError('');
  };

  const handleUseCurrentLocation = async () => {
    try {
      setLocationResolving(true);
      const coordinates = await getCurrentDeviceCoordinates();
      const resolved = await LocationService.reverse(coordinates.latitude, coordinates.longitude);
      suppressLocationSearchRef.current = true;
      setLocation(
        String(
          resolved?.formattedAddress ||
            resolved?.location ||
            `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
        ).trim()
      );
      setLocationSuggestions([]);
      setLocationError('');
      showNotification('success', 'Location', 'Current location added to your scroll.');
    } catch (error: any) {
      const message = error?.message || 'Unable to capture your current location.';
      setLocationError(message);
      showNotification('error', 'Location', message);
    } finally {
      setLocationResolving(false);
    }
  };

  const handleDescriptionRewrite = async (mode: ScrolithaRewriteMode) => {
    const text = description.trim();
    if (!text) {
      showNotification('info', 'Scrolitha', 'Add a description first so Scrolitha can improve it.');
      return;
    }

    try {
      setAiRewriting(mode);
      const result = await ScrolithaService.rewrite({
        text,
        mode,
        scope: 'scroll_description'
      });
      const rewrittenText = String(result?.rewrittenText || '').trim();
      if (!rewrittenText) {
        throw new Error('Scrolitha returned an empty description.');
      }
      setDescription(rewrittenText);
      setIsAIEnhanced(true);
      showNotification('success', 'Scrolitha', `${SCROLL_DESCRIPTION_REWRITE_ACTIONS.find((entry) => entry.mode === mode)?.label || 'Rewrite'} applied.`);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Scrolitha could not improve the description right now.';
      showNotification('error', 'Scrolitha', message);
    } finally {
      setAiRewriting(null);
    }
  };

  if (!open) return null;

  const resetAndClose = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setVisibility((config?.defaultVisibility as any) || 'public');
    setGraphicWarning(false);
    setIsAIEnhanced(false);
    setFilterPreset('none');
    setFilterStrength(60);
    setVideoFile(null);
    setOfferTags([]);
    setUploading(false);
    setProgress(0);
    setLocationSuggestions([]);
    setLocationSearching(false);
    setLocationResolving(false);
    setLocationError('');
    setAiRewriting(null);
    suppressLocationSearchRef.current = false;
    onClose();
  };

  const handleSubmit = async () => {
    if (!videoFile && !sourceVideo?.fileId) {
      showNotification('error', 'Scroll', 'Please choose a video file.');
      return;
    }
    if (config?.aiLabelRequired && !isAIEnhanced) {
      showNotification('error', 'Scroll', 'AI label is required by admin settings.');
      return;
    }

    try {
      setUploading(true);
      let fileId = String(sourceVideo?.fileId || '').trim();
      if (videoFile) {
        setProgress(2);
        const uploaded = await FileService.uploadFile(videoFile, 'portfolio' as any, {
          visibility: 'public',
          onProgress: (percent) => setProgress(percent)
        });
        fileId = String(uploaded?.id || '').trim();
      }
      if (!fileId) {
        throw new Error('Scroll source video is missing.');
      }
      const created = await ScrollService.create({
        fileId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        visibility,
        graphicWarning,
        isAIEnhanced,
        filterPreset,
        filterStrength,
        offerTags
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

  const previewUrl = videoPreviewUrl || String(sourceVideo?.mediaUrl || '').trim();
  const previewTitle = videoFile?.name || sourceVideo?.title || sourceVideo?.description || 'Selected video';

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
          <div className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Video</span>
            <input
              ref={deviceVideoInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoInputChange}
              className="hidden"
            />
            <input
              ref={cameraVideoInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleVideoInputChange}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => deviceVideoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                <UploadCloud className="h-4 w-4 text-cyan-300" />
                Choose from device
              </button>
              <button
                type="button"
                onClick={() => cameraVideoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Camera className="h-4 w-4 text-cyan-300" />
                Capture video
              </button>
              {sourceVideo?.fileId ? (
                <span className="inline-flex items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">
                  Post video ready for Scroll
                </span>
              ) : null}
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {previewUrl ? (
                <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,220px),1fr] md:items-center">
                  <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg">
                    <div className="aspect-[9/16] w-full">
                      <video
                        key={previewUrl}
                        src={previewUrl}
                        className="h-full w-full object-cover"
                        style={previewFilterStyle}
                        muted
                        loop
                        autoPlay
                        playsInline
                        controls
                        preload="metadata"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Preview</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white">{previewTitle}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-white/75">
                      {videoFile?.type ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                          {videoFile.type}
                        </span>
                      ) : null}
                      {videoFile ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                          {Math.max(1, Math.round((videoFile.size || 0) / 1024 / 1024 * 10) / 10)} MB
                        </span>
                      ) : null}
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">
                        Filter: {filterPreset}
                      </span>
                      {sourceVideo?.fileId && !videoFile ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
                          Featured from post
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-white/60">
                      {videoFile
                        ? 'This is the exact local video preview that will be uploaded when you publish the Scroll.'
                        : 'This is the existing post video that will be featured in Scroll when you publish.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-white/70">No video selected</div>
              )}
            </div>
          </div>

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
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      onBlur={() => window.setTimeout(() => setLocationSuggestions([]), 120)}
                      placeholder="Type a city, address, or place"
                      className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                    />
                    {locationSearching ? (
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : null}
                    {locationSuggestions.length > 0 ? (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl">
                        {locationSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              applyLocationSuggestion(suggestion);
                            }}
                            className="flex w-full items-start gap-2 border-b border-white/10 px-3 py-2 text-left text-sm text-white/85 hover:bg-white/5 last:border-b-0"
                          >
                            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
                            <span className="min-w-0">
                              <span className="block truncate">{suggestion.label}</span>
                              {suggestion.subtitle ? (
                                <span className="block truncate text-xs text-white/50">{suggestion.subtitle}</span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locationResolving || uploading}
                    className="inline-flex min-w-[148px] items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {locationResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                    Use current
                  </button>
                </div>
                <div className="text-xs text-white/50">Type your location or auto-capture where you are posting from.</div>
                {locationError ? <div className="text-xs text-amber-300">{locationError}</div> : null}
              </div>
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
            <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-cyan-100">Improve with Scrolitha</div>
                  <div className="text-xs text-white/50">Polish your description before publishing without leaving Scroll.</div>
                </div>
                {aiRewriting ? (
                  <div className="inline-flex items-center gap-2 text-xs text-cyan-100">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Scrolitha is improving...
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {SCROLL_DESCRIPTION_REWRITE_ACTIONS.map((action) => (
                  <button
                    key={action.mode}
                    type="button"
                    onClick={() => handleDescriptionRewrite(action.mode)}
                    disabled={uploading || aiRewriting !== null}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </label>

          <OfferTagSelector
            mode="user"
            ownerUserId={user?.id}
            value={offerTags}
            onChange={setOfferTags}
            theme="dark"
            label="Tag storefront offers"
            helperText="Attach relevant services so viewers can open your storefront, message you, or start a brief without leaving Scroll."
          />

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Visibility</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as any)}
                className={selectInputClassName}
                style={{ colorScheme: 'light' }}
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
                className={selectInputClassName}
                style={{ colorScheme: 'light' }}
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

          <div className="grid gap-3 md:grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/85">
              <input
                type="checkbox"
                checked={graphicWarning}
                onChange={(event) => setGraphicWarning(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/10 accent-amber-400"
              />
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                Graphic warning
              </span>
            </label>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/85">
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
          </div>

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
