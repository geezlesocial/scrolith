import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Clapperboard,
  Link2,
  Loader2,
  LocateFixed,
  MapPin,
  Plus,
  Sparkles,
  UploadCloud,
  X
} from 'lucide-react';
import { FileService } from '../../services/files';
import { ScrollService, type ScrollConfig, type ScrollSeriesDetail, type ScrollVideo } from '../../services/scroll';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import OfferTagSelector from '../../components/commerce/OfferTagSelector';
import type { OfferTagSelection } from '../../utils/contentOffers';
import type { PendingPostVideoScrollSource } from '../../utils/postVideoScrollBridge';
import { LocationService } from '../../services/location';
import { getCurrentDeviceCoordinates } from '../../utils/deviceLocation';
import type { ScrolithaRewriteMode } from '../../services/scrolitha';
import { runScrolithaRewrite } from '../../utils/scrolithaRewrite';
import type { LocationSuggestion } from '../../types';

type ScrollCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (scroll: ScrollVideo) => void;
  onUpdated?: (scroll: ScrollVideo) => void;
  config?: ScrollConfig | null;
  sourceVideo?: PendingPostVideoScrollSource | null;
  editScroll?: ScrollVideo | null;
  remixSource?: ScrollVideo | null;
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

const ScrollCreateModal: React.FC<ScrollCreateModalProps> = ({
  open,
  onClose,
  onCreated,
  onUpdated,
  config,
  sourceVideo,
  editScroll,
  remixSource
}) => {
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
  const [responseMode, setResponseMode] = useState<'remix' | 'duet'>('remix');
  const [sourceRemoved, setSourceRemoved] = useState(false);
  const [mySeries, setMySeries] = useState<ScrollSeriesDetail[]>([]);
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState('');
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  const [newSeriesDescription, setNewSeriesDescription] = useState('');
  const [creatingSeries, setCreatingSeries] = useState(false);
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

  const isEditing = Boolean(editScroll?.id);
  const linkedSourceScroll = sourceRemoved ? null : (editScroll?.sourceScroll || remixSource || null);
  const linkedSourceUnavailable = Boolean((linkedSourceScroll as any)?.unavailable);

  useEffect(() => {
    if (!open) return;
    setTitle(String(editScroll?.title || sourceVideo?.title || '').trim());
    setDescription(String(editScroll?.description || sourceVideo?.description || '').trim());
    setLocation(String(editScroll?.location || sourceVideo?.location || '').trim());
    setVisibility((editScroll?.visibility as any) || (config?.defaultVisibility as any) || 'public');
    setGraphicWarning(Boolean(editScroll?.graphicWarning));
    setIsAIEnhanced(Boolean(editScroll?.isAIEnhanced));
    setFilterPreset(String(editScroll?.filterPreset || 'none').trim() || 'none');
    setFilterStrength(
      Number.isFinite(Number(editScroll?.filterStrength))
        ? Number(editScroll?.filterStrength)
        : 60
    );
    setVideoFile(null);
    setOfferTags(
      Array.isArray(editScroll?.offerTags)
        ? editScroll.offerTags
            .map((tag) => ({
              offerType: tag?.offerType,
              offerId: tag?.offerId
            }))
            .filter((tag) => Boolean(tag.offerType) && Boolean(tag.offerId))
        : []
    );
    setResponseMode((String(editScroll?.responseMode || '').trim().toLowerCase() === 'duet' ? 'duet' : 'remix'));
    setSourceRemoved(false);
    setMySeries([]);
    setSelectedSeriesIds(
      Array.isArray(editScroll?.series)
        ? Array.from(
            new Set(
              editScroll.series
                .map((series) => String(series?.id || '').trim())
                .filter(Boolean)
            )
          )
        : []
    );
    setSeriesLoading(false);
    setSeriesError('');
    setNewSeriesTitle('');
    setNewSeriesDescription('');
    setCreatingSeries(false);
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
    editScroll?.description,
    editScroll?.filterPreset,
    editScroll?.filterStrength,
    editScroll?.graphicWarning,
    editScroll?.isAIEnhanced,
    editScroll?.location,
    editScroll?.responseMode,
    editScroll?.series,
    editScroll?.title,
    editScroll?.visibility,
    sourceVideo?.description,
    sourceVideo?.location,
    sourceVideo?.title
  ]);

  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    const loadSeries = async () => {
      try {
        setSeriesLoading(true);
        const rows = await ScrollService.getMySeries();
        if (cancelled) return;
        setMySeries(Array.isArray(rows) ? rows : []);
        setSeriesError('');
      } catch (error: any) {
        if (cancelled) return;
        setSeriesError(error?.response?.data?.error || error?.message || 'Unable to load your series right now.');
      } finally {
        if (!cancelled) {
          setSeriesLoading(false);
        }
      }
    };
    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

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

  const toggleSeriesSelection = (seriesId: string) => {
    const normalizedId = String(seriesId || '').trim();
    if (!normalizedId) return;
    setSelectedSeriesIds((current) =>
      current.includes(normalizedId)
        ? current.filter((value) => value !== normalizedId)
        : [...current, normalizedId]
    );
  };

  const handleCreateSeries = async () => {
    const title = newSeriesTitle.trim();
    if (!title) {
      showNotification('info', 'Series', 'Add a series title first.');
      return;
    }
    try {
      setCreatingSeries(true);
      const created = await ScrollService.createSeries({
        title,
        description: newSeriesDescription.trim() || undefined
      });
      setMySeries((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
      setSelectedSeriesIds((current) => Array.from(new Set([...current, created.id])));
      setNewSeriesTitle('');
      setNewSeriesDescription('');
      setSeriesError('');
      showNotification('success', 'Series', 'Series created and selected.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Unable to create series right now.';
      setSeriesError(message);
      showNotification('error', 'Series', message);
    } finally {
      setCreatingSeries(false);
    }
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
    if (aiRewriting) return;

    try {
      setAiRewriting(mode);
      const result = await runScrolithaRewrite({
        text,
        mode,
        scope: 'scroll_description'
      });
      if (!result.ok) {
        showNotification(result.retryable ? 'warning' : 'error', 'Scrolitha', result.message);
        return;
      }
      setDescription(result.text);
      setIsAIEnhanced(true);
      if (result.warning) {
        showNotification('warning', 'Scrolitha', result.warning);
      }
      showNotification(
        'success',
        'Scrolitha',
        `${SCROLL_DESCRIPTION_REWRITE_ACTIONS.find((entry) => entry.mode === mode)?.label || 'Rewrite'} applied.`
      );
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
    setResponseMode('remix');
    setSourceRemoved(false);
    setMySeries([]);
    setSelectedSeriesIds([]);
    setSeriesLoading(false);
    setSeriesError('');
    setNewSeriesTitle('');
    setNewSeriesDescription('');
    setCreatingSeries(false);
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
    if (!videoFile && !sourceVideo?.fileId && !editScroll?.media?.id) {
      showNotification('error', 'Scroll', isEditing ? 'Scroll video is missing.' : 'Please choose a video file.');
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
        if (isEditing) {
          fileId = String(editScroll?.media?.id || '').trim();
        }
      }
      if (!fileId && !isEditing) {
        throw new Error('Scroll source video is missing.');
      }
      const sourceScrollId =
        linkedSourceScroll && !sourceRemoved
          ? String(linkedSourceScroll.id || '').trim() || undefined
          : isEditing
            ? null
            : undefined;
      const payload = {
        ...(fileId ? { fileId } : {}),
        ...(typeof sourceScrollId !== 'undefined' ? { sourceScrollId } : {}),
        ...(sourceScrollId ? { responseMode } : { responseMode: null }),
        seriesIds: selectedSeriesIds,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        visibility,
        graphicWarning,
        isAIEnhanced,
        filterPreset,
        filterStrength,
        offerTags
      };
      if (isEditing && editScroll?.id) {
        const updated = await ScrollService.update(editScroll.id, payload);
        onUpdated?.(updated);
        showNotification('success', 'Scroll', 'Scroll video updated.');
      } else {
        const created = await ScrollService.create(payload as any);
        onCreated(created);
        showNotification('success', 'Scroll', 'Scroll video published.');
      }
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

  const previewUrl = videoPreviewUrl || String(editScroll?.media?.url || sourceVideo?.mediaUrl || '').trim();
  const previewTitle =
    videoFile?.name ||
    editScroll?.title ||
    editScroll?.description ||
    sourceVideo?.title ||
    sourceVideo?.description ||
    'Selected video';

  return (
    <div className="fixed inset-0 z-[920] overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl sm:mt-8 sm:min-h-0 sm:max-h-[calc(100dvh-4rem)]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">{isEditing ? 'Edit Scroll' : 'Create Scroll'}</h2>
          </div>
          <button type="button" onClick={resetAndClose} className="rounded-full p-2 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
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
                      {editScroll?.id && !videoFile ? (
                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-violet-100">
                          Editing live Scroll
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-white/60">
                      {videoFile
                        ? `This ${isEditing ? 'replacement' : 'local'} video preview will be uploaded when you ${isEditing ? 'save' : 'publish'} the Scroll.`
                        : editScroll?.id
                          ? 'This is the current live Scroll video. You can update the metadata without replacing the video.'
                          : 'This is the existing post video that will be featured in Scroll when you publish.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-white/70">No video selected</div>
              )}
            </div>
          </div>

          {linkedSourceScroll ? (
            <div className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-100">
                    <Link2 className="h-3.5 w-3.5" />
                    Responding to Scroll
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">
                    {linkedSourceUnavailable ? 'Original Scroll unavailable' : linkedSourceScroll.title || linkedSourceScroll.description || 'Original Scroll'}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {linkedSourceScroll.author?.name || 'Community member'}
                    {linkedSourceScroll.author?.username ? ` · @${linkedSourceScroll.author.username}` : ''}
                  </div>
                  {linkedSourceUnavailable ? (
                    <div className="mt-2 text-xs text-amber-200">
                      The original Scroll can no longer be previewed, but the response link will remain until you remove it.
                    </div>
                  ) : null}
                </div>
                {linkedSourceScroll.media?.thumbnailUrl || linkedSourceScroll.media?.url ? (
                  <div className="hidden h-20 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:block">
                    <img
                      src={linkedSourceScroll.media?.thumbnailUrl || linkedSourceScroll.media?.url || ''}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResponseMode('remix')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    responseMode === 'remix'
                      ? 'bg-cyan-300 text-slate-950'
                      : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
                  }`}
                >
                  Remix response
                </button>
                <button
                  type="button"
                  onClick={() => setResponseMode('duet')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    responseMode === 'duet'
                      ? 'bg-cyan-300 text-slate-950'
                      : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
                  }`}
                >
                  Duet response
                </button>
                {isEditing && editScroll?.sourceScrollId ? (
                  <button
                    type="button"
                    onClick={() => setSourceRemoved((current) => !current)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/10"
                  >
                    {sourceRemoved ? 'Keep source link' : 'Remove source link'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

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
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="block text-xs font-semibold uppercase tracking-wide text-white/70">Caption</span>
              <span className="text-[11px] font-medium text-white/45">{description.trim().length} characters</span>
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Add a caption that tells viewers what this Scroll is about..."
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
            />
            {description.trim() ? (
              <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-white/70">
                <span className="font-semibold text-cyan-100">Live caption preview:</span>{' '}
                <span className="whitespace-pre-wrap break-words">{description.trim()}</span>
              </div>
            ) : (
              <div className="mt-2 text-xs leading-5 text-white/50">
                Captions appear with the Scroll video across desktop, mobile web, and the Android app.
              </div>
            )}
            <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-cyan-100">Improve with Scrolitha</div>
                  <div className="text-xs text-white/50">Polish your caption before publishing without leaving Scroll.</div>
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

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Clapperboard className="h-4 w-4 text-cyan-300" />
                  Series / playlists
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Add this Scroll to one or more creator playlists so viewers can binge related content.
                </div>
              </div>
              {seriesLoading ? (
                <div className="inline-flex items-center gap-2 text-xs text-white/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading
                </div>
              ) : null}
            </div>

            {mySeries.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {mySeries.map((series) => {
                  const selected = selectedSeriesIds.includes(series.id);
                  return (
                    <button
                      key={series.id}
                      type="button"
                      onClick={() => toggleSeriesSelection(series.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        selected
                          ? 'border-cyan-300/40 bg-cyan-400/10'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-white">{series.title}</div>
                        <div className="text-[11px] text-white/55">{series.itemCount} item{series.itemCount === 1 ? '' : 's'}</div>
                      </div>
                      {series.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-white/55">{series.description}</div>
                      ) : (
                        <div className="mt-1 text-xs text-white/35">No description</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/45">No playlists yet. Create one below and attach this Scroll immediately.</div>
            )}

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Plus className="h-4 w-4 text-cyan-300" />
                New playlist
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,220px),1fr,auto]">
                <input
                  value={newSeriesTitle}
                  onChange={(event) => setNewSeriesTitle(event.target.value)}
                  placeholder="Series title"
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
                <input
                  value={newSeriesDescription}
                  onChange={(event) => setNewSeriesDescription(event.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
                <button
                  type="button"
                  onClick={handleCreateSeries}
                  disabled={creatingSeries}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingSeries ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </button>
              </div>
              {seriesError ? <div className="mt-2 text-xs text-amber-300">{seriesError}</div> : null}
            </div>
          </div>

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

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-white/10 bg-slate-950/95 px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] backdrop-blur sm:px-6">
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
            {isEditing ? 'Save Changes' : 'Publish Scroll'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScrollCreateModal;
