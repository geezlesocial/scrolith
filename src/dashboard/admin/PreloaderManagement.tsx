import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, RefreshCcw, Save, Trash2, UploadCloud, Zap } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import FilePickerModal from '../shared/FilePickerModal';
import {
  PreloaderBackgroundType,
  PreloaderConfig,
  PreloaderPosition,
  PreloaderService,
  PreloaderStatus
} from '../../services/preloader';
import type { UploadedFile } from '../../types';

const BRAND_LOADER_TYPE = 'logoPulse' as const;
const BRAND_PRELOADER_LOGO_URL = '/preloader-logo.png';
type PickerTarget = 'logo' | 'background' | null;

const statusOptions: Array<{ value: PreloaderStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'active', label: 'Active' }
];

const positionOptions: Array<{ value: PreloaderPosition; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' }
];

const backgroundOptions: Array<{ value: PreloaderBackgroundType; label: string }> = [
  { value: 'solid', label: 'Solid color' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Background image' }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const defaultDraft = (): PreloaderConfig => ({
  id: '',
  name: '',
  status: 'draft',
  isActive: false,
  minDurationMs: 800,
  maxDurationMs: 5000,
  showOnInitialLoad: true,
  showOnRouteChange: true,
  showOnApiLoading: false,
  headlineText: 'Loading Scrolith...',
  subText: 'Please wait while we prepare your experience.',
  loaderType: BRAND_LOADER_TYPE,
  logoFileId: null,
  logoUrl: BRAND_PRELOADER_LOGO_URL,
  backgroundFileId: null,
  backgroundImageUrl: null,
  backgroundType: 'solid',
  backgroundColor: '#0f172a',
  gradientFrom: '#0f172a',
  gradientTo: '#1d4ed8',
  overlayOpacity: 0.45,
  blurPx: 0,
  accentColor: '#3b82f6',
  textColor: '#ffffff',
  animationSpeed: 1,
  position: 'center',
  customCss: ''
});

const normalizeConfig = (config: PreloaderConfig): PreloaderConfig => ({
  ...defaultDraft(),
  ...config,
  loaderType: BRAND_LOADER_TYPE,
  backgroundType: (config.backgroundType || 'solid') as PreloaderBackgroundType,
  overlayOpacity: clamp(Number(config.overlayOpacity || 0), 0, 1),
  minDurationMs: Number(config.minDurationMs || 800),
  maxDurationMs: Number(config.maxDurationMs || 5000),
  animationSpeed: Number(config.animationSpeed || 1),
  blurPx: Number(config.blurPx || 0),
  backgroundFileId: config.backgroundFileId || null,
  backgroundImageUrl: config.backgroundImageUrl || null,
  logoUrl: config.logoUrl || BRAND_PRELOADER_LOGO_URL
});

const ToggleRow = ({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) => (
  <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
    <span>{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  </label>
);

const PreloaderPreview = ({ config }: { config: PreloaderConfig }) => {
  const backgroundStyle =
    config.backgroundType === 'image' && config.backgroundImageUrl
      ? { backgroundImage: `url(${config.backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : config.backgroundType === 'gradient'
        ? {
            backgroundImage: `linear-gradient(135deg, ${config.gradientFrom || config.backgroundColor}, ${config.gradientTo || config.backgroundColor})`
          }
        : { backgroundColor: config.backgroundColor };

  const overlayAlpha = clamp(config.overlayOpacity ?? 0.45, 0, 1);
  const blurPx = clamp(config.blurPx ?? 0, 0, 40);
  const speed = Math.max(0.2, Number(config.animationSpeed || 1));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Live preview</p>
      <style>{`@keyframes pm-logo-pulse { 0%, 100% { transform: scale(.97);} 50% { transform: scale(1.04);} }`}</style>
      <div className="relative overflow-hidden rounded-lg" style={{ minHeight: 240, color: config.textColor }}>
        <div className="absolute inset-0" style={backgroundStyle} />
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(15, 23, 42, ${overlayAlpha})`,
            backdropFilter: blurPx > 0 ? `blur(${blurPx}px)` : 'none'
          }}
        />
        <div
          className={`relative z-10 flex min-h-[240px] flex-col items-center gap-3 px-6 py-8 ${config.position === 'bottom' ? 'justify-end' : 'justify-center'}`}
        >
          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/20 bg-black/30">
            <img
              src={config.logoUrl || BRAND_PRELOADER_LOGO_URL}
              alt="Scrolith preloader logo"
              className="h-full w-full object-cover"
              style={{ animation: `pm-logo-pulse ${1.2 / speed}s ease-in-out infinite` }}
            />
          </div>
          <p className="text-lg font-semibold" style={{ color: config.textColor || '#ffffff' }}>
            {config.headlineText || 'Loading Scrolith...'}
          </p>
          <p className="max-w-md text-center text-sm opacity-90" style={{ color: config.textColor || '#ffffff' }}>
            {config.subText || 'Please wait while we prepare your experience.'}
          </p>
        </div>
      </div>
    </div>
  );
};

const PreloaderManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<PreloaderConfig[]>([]);
  const [draft, setDraft] = useState<PreloaderConfig>(defaultDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const hasSelected = useMemo(() => rows.some((row) => row.id === draft.id), [rows, draft.id]);

  const loadRows = async (preferredId = '') => {
    setLoading(true);
    try {
      const list = await PreloaderService.adminListPreloaders();
      const normalized = (list || []).map(normalizeConfig);
      setRows(normalized);
      const next =
        normalized.find((row) => row.id === preferredId) ||
        normalized.find((row) => row.isActive) ||
        normalized[0] ||
        defaultDraft();
      setDraft(next);
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to load preloaders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const updateDraft = (patch: Partial<PreloaderConfig>) => {
    setDraft((prev) => normalizeConfig({ ...prev, ...patch, loaderType: BRAND_LOADER_TYPE } as PreloaderConfig));
  };

  const mapPayload = (input: PreloaderConfig) => ({
    name: input.name.trim(),
    status: input.status,
    isActive: input.isActive,
    minDurationMs: Number(input.minDurationMs),
    maxDurationMs: Number(input.maxDurationMs),
    showOnInitialLoad: Boolean(input.showOnInitialLoad),
    showOnRouteChange: Boolean(input.showOnRouteChange),
    showOnApiLoading: Boolean(input.showOnApiLoading),
    headlineText: input.headlineText || '',
    subText: input.subText || '',
    loaderType: BRAND_LOADER_TYPE,
    logoFileId: input.logoFileId || null,
    backgroundType: input.backgroundType,
    backgroundColor: input.backgroundColor,
    backgroundFileId: input.backgroundType === 'image' ? input.backgroundFileId || null : null,
    gradientFrom: input.gradientFrom,
    gradientTo: input.gradientTo,
    overlayOpacity: Number(input.overlayOpacity),
    blurPx: Number(input.blurPx),
    accentColor: input.accentColor,
    textColor: input.textColor,
    animationSpeed: Number(input.animationSpeed),
    position: input.position,
    customCss: input.customCss || null
  });

  const saveDraft = async () => {
    if (!draft.name.trim()) {
      showNotification('warning', 'Validation', 'Preloader name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = mapPayload(draft);
      const saved = hasSelected
        ? await PreloaderService.adminUpdatePreloader(draft.id, payload)
        : await PreloaderService.adminCreatePreloader(payload);
      showNotification('success', 'Saved', 'Preloader configuration updated');
      await loadRows(saved.id);
    } catch (error: any) {
      showNotification('error', 'Save failed', error?.message || 'Failed to save preloader');
    } finally {
      setSaving(false);
    }
  };

  const activateDraft = async () => {
    if (!hasSelected) {
      await saveDraft();
      return;
    }
    setSaving(true);
    try {
      await PreloaderService.adminActivatePreloader(draft.id);
      showNotification('success', 'Activated', 'Preloader activated');
      await loadRows(draft.id);
    } catch (error: any) {
      showNotification('error', 'Activation failed', error?.message || 'Failed to activate preloader');
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!hasSelected) {
      setDraft(defaultDraft());
      return;
    }
    if (!window.confirm('Delete this preloader configuration?')) return;
    setSaving(true);
    try {
      await PreloaderService.adminDeletePreloader(draft.id);
      showNotification('success', 'Deleted', 'Preloader deleted');
      await loadRows();
    } catch (error: any) {
      showNotification('error', 'Delete failed', error?.message || 'Failed to delete preloader');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (file: UploadedFile) => {
    if (pickerTarget === 'logo') {
      updateDraft({ logoFileId: file.id, logoUrl: file.url || null });
    } else if (pickerTarget === 'background') {
      updateDraft({
        backgroundType: 'image',
        backgroundFileId: file.id,
        backgroundImageUrl: file.url || null
      });
    }
    setPickerTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Preloader</h2>
            <p className="text-sm text-gray-500">Single enterprise preloader: brand logo + headline + subtext.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadRows(draft.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <RefreshCcw className="mr-1 inline h-4 w-4" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setDraft(normalizeConfig({ ...defaultDraft(), name: `Preloader ${rows.length + 1}` } as PreloaderConfig))}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
            >
              <Plus className="mr-1 inline h-4 w-4" /> New
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Saved configurations</p>
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDraft(row)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${draft.id === row.id ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{row.name || 'Untitled'}</span>
                    {row.isActive && <Zap className="h-4 w-4 text-blue-600" />}
                  </div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{row.status}</p>
                </button>
              ))}
              {!rows.length && <p className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-4 text-xs text-gray-500">No preloader config yet.</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Name" value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.status} onChange={(e) => updateDraft({ status: e.target.value as PreloaderStatus })}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Headline" value={draft.headlineText || ''} onChange={(e) => updateDraft({ headlineText: e.target.value })} />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Subtext" value={draft.subText || ''} onChange={(e) => updateDraft({ subText: e.target.value })} />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.position} onChange={(e) => updateDraft({ position: e.target.value as PreloaderPosition })}>
                {positionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
                <button type="button" onClick={() => setPickerTarget('logo')} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><UploadCloud className="mr-1 inline h-4 w-4" /> Pick logo</button>
                <img src={draft.logoUrl || BRAND_PRELOADER_LOGO_URL} alt="Preloader logo" className="h-10 w-10 rounded-md object-cover" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
                <select className="rounded-md border border-gray-300 px-2 py-2 text-xs" value={draft.backgroundType} onChange={(e) => updateDraft({ backgroundType: e.target.value as PreloaderBackgroundType })}>
                  {backgroundOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {draft.backgroundType === 'image' ? (
                  <>
                    <button type="button" onClick={() => setPickerTarget('background')} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><UploadCloud className="mr-1 inline h-4 w-4" /> Pick image</button>
                    {draft.backgroundImageUrl && (
                      <button type="button" onClick={() => updateDraft({ backgroundFileId: null, backgroundImageUrl: null })} className="rounded-md border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    )}
                  </>
                ) : (
                  <input type="color" value={draft.backgroundColor} onChange={(e) => updateDraft({ backgroundColor: e.target.value })} className="h-10 w-14 rounded border border-gray-300 bg-white p-1" />
                )}
              </div>
            </div>

            {draft.backgroundType === 'gradient' && (
              <div className="grid gap-3 md:grid-cols-2">
                <input type="color" value={draft.gradientFrom || '#0f172a'} onChange={(e) => updateDraft({ gradientFrom: e.target.value })} className="h-10 rounded border border-gray-300 bg-white p-1" />
                <input type="color" value={draft.gradientTo || '#1d4ed8'} onChange={(e) => updateDraft({ gradientTo: e.target.value })} className="h-10 rounded border border-gray-300 bg-white p-1" />
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <input type="number" min={0} max={60000} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.minDurationMs} onChange={(e) => updateDraft({ minDurationMs: Number(e.target.value || 0) })} placeholder="Min duration (ms)" />
              <input type="number" min={0} max={120000} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.maxDurationMs} onChange={(e) => updateDraft({ maxDurationMs: Number(e.target.value || 0) })} placeholder="Max duration (ms)" />
              <input type="number" min={0.2} max={4} step={0.1} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.animationSpeed} onChange={(e) => updateDraft({ animationSpeed: Number(e.target.value || 1) })} placeholder="Animation speed" />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <input type="number" min={0} max={1} step={0.05} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.overlayOpacity} onChange={(e) => updateDraft({ overlayOpacity: Number(e.target.value || 0) })} placeholder="Overlay opacity" />
              <input type="number" min={0} max={40} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={draft.blurPx} onChange={(e) => updateDraft({ blurPx: Number(e.target.value || 0) })} placeholder="Blur (px)" />
              <input type="color" value={draft.textColor} onChange={(e) => updateDraft({ textColor: e.target.value })} className="h-10 rounded border border-gray-300 bg-white p-1" />
              <input type="color" value={draft.accentColor} onChange={(e) => updateDraft({ accentColor: e.target.value })} className="h-10 rounded border border-gray-300 bg-white p-1" />
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <ToggleRow label="Show on initial load" checked={draft.showOnInitialLoad} onChange={(next) => updateDraft({ showOnInitialLoad: next })} />
              <ToggleRow label="Show on route change" checked={draft.showOnRouteChange} onChange={(next) => updateDraft({ showOnRouteChange: next })} />
              <ToggleRow label="Show on API loading" checked={draft.showOnApiLoading} onChange={(next) => updateDraft({ showOnApiLoading: next })} />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
              <button type="button" disabled={saving || loading} onClick={() => void saveDraft()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                <Save className="mr-1 inline h-4 w-4" /> Save changes
              </button>
              <button type="button" disabled={saving || loading || !hasSelected} onClick={() => void activateDraft()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                <Zap className="mr-1 inline h-4 w-4" /> Set active
              </button>
              <button type="button" disabled={saving || loading} onClick={() => setDraft(defaultDraft())} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Eye className="mr-1 inline h-4 w-4" /> Clear editor
              </button>
              <button type="button" disabled={saving || loading} onClick={() => void deleteDraft()} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="mr-1 inline h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <PreloaderPreview config={draft} />

      <FilePickerModal
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={handleFileSelect}
        filterType="image"
        allowUpload
      />
    </div>
  );
};

export default PreloaderManagement;
