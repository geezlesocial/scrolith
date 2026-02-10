import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, RefreshCcw, Save, Trash2, UploadCloud, Zap } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import FilePickerModal from '../shared/FilePickerModal';
import {
  PreloaderConfig,
  PreloaderService,
  PreloaderLoaderType,
  PreloaderBackgroundType,
  PreloaderPosition,
  PreloaderStatus,
} from '../../services/preloader';

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
  loaderType: 'spinner',
  logoFileId: null,
  logoUrl: null,
  backgroundType: 'solid',
  backgroundColor: '#0f172a',
  gradientFrom: '#0f172a',
  gradientTo: '#1d4ed8',
  overlayOpacity: 0.85,
  blurPx: 0,
  accentColor: '#3b82f6',
  textColor: '#ffffff',
  animationSpeed: 1,
  position: 'center',
  customCss: '',
});

const loaderOptions: Array<{ value: PreloaderLoaderType; label: string }> = [
  { value: 'spinner', label: 'Spinner' },
  { value: 'progress', label: 'Progress Bar' },
  { value: 'logoPulse', label: 'Logo Pulse' },
  { value: 'dots', label: 'Animated Dots' },
  { value: 'skeleton', label: 'Skeleton' },
  { value: 'lottie', label: 'Lottie / Media' },
];

const statusOptions: Array<{ value: PreloaderStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'active', label: 'Active' },
];

const positionOptions: Array<{ value: PreloaderPosition; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const backgroundOptions: Array<{ value: PreloaderBackgroundType; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
];

const ToggleRow = ({
  label,
  checked,
  onChange,
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </label>
);

const PreloaderPreview = ({ config }: { config: PreloaderConfig }) => {
  const bgStyle =
    config.backgroundType === 'gradient'
      ? {
          backgroundImage: `linear-gradient(135deg, ${config.gradientFrom || config.backgroundColor}, ${
            config.gradientTo || config.backgroundColor
          })`,
        }
      : { backgroundColor: config.backgroundColor };

  const renderLoader = () => {
    switch (config.loaderType) {
      case 'progress':
        return (
          <div className="w-full max-w-48">
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full w-1/3 rounded-full"
                style={{ backgroundColor: config.accentColor, animation: 'pm-progress 1.2s linear infinite' }}
              />
            </div>
          </div>
        );
      case 'dots':
        return (
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: config.accentColor,
                  animation: 'pm-bounce 1s ease-in-out infinite',
                  animationDelay: `${idx * 0.15}s`,
                }}
              />
            ))}
          </div>
        );
      default:
        if (config.logoUrl && (config.loaderType === 'logoPulse' || config.loaderType === 'lottie')) {
          return (
            <img
              src={config.logoUrl}
              alt="logo"
              className="h-12 w-12 rounded-lg object-cover"
              style={{ animation: 'pm-pulse 1s ease-in-out infinite' }}
            />
          );
        }
        return (
          <div
            className="h-10 w-10 rounded-full border-2"
            style={{
              borderColor: `${config.accentColor}66`,
              borderTopColor: config.accentColor,
              animation: 'pm-spin 1s linear infinite',
            }}
          />
        );
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Live Preview</p>
      <style>
        {`
          @keyframes pm-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
          @keyframes pm-progress { 0% { transform: translateX(-100%);} 100% { transform: translateX(320%);} }
          @keyframes pm-bounce { 0%, 80%, 100% { opacity: .4; transform: scale(.8);} 40% { opacity: 1; transform: scale(1);} }
          @keyframes pm-pulse { 0%, 100% { transform: scale(.95);} 50% { transform: scale(1.05);} }
        `}
      </style>
      <div
        className="relative overflow-hidden rounded-lg p-4"
        style={{
          ...bgStyle,
          minHeight: 180,
          opacity: Math.min(1, Math.max(0.2, config.overlayOpacity)),
          color: config.textColor,
        }}
      >
        <div className={`flex h-full flex-col items-center gap-3 ${config.position === 'bottom' ? 'justify-end' : 'justify-center'}`}>
          {renderLoader()}
          <p className="text-sm font-semibold">{config.headlineText || 'Loading...'}</p>
          <p className="max-w-52 text-center text-xs opacity-90">{config.subText || 'Preparing your experience.'}</p>
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeId = useMemo(
    () => rows.find((row) => row.isActive)?.id || '',
    [rows]
  );

  const loadRows = async () => {
    setLoading(true);
    try {
      const list = await PreloaderService.adminListPreloaders();
      setRows(list || []);
      if (!draft.id && list.length) {
        setDraft(list[0]);
      }
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to load preloaders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (patch: Partial<PreloaderConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
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
    loaderType: input.loaderType,
    logoFileId: input.logoFileId || null,
    backgroundType: input.backgroundType,
    backgroundColor: input.backgroundColor,
    gradientFrom: input.gradientFrom,
    gradientTo: input.gradientTo,
    overlayOpacity: Number(input.overlayOpacity),
    blurPx: Number(input.blurPx),
    accentColor: input.accentColor,
    textColor: input.textColor,
    animationSpeed: Number(input.animationSpeed),
    position: input.position,
    customCss: input.customCss || null,
  });

  const saveDraft = async (activateAfterSave = false) => {
    if (!draft.name.trim()) {
      showNotification('warning', 'Validation', 'Please provide a preloader name.');
      return;
    }
    setSaving(true);
    try {
      const payload = mapPayload(draft);
      const saved = draft.id
        ? await PreloaderService.adminUpdatePreloader(draft.id, payload)
        : await PreloaderService.adminCreatePreloader(payload);
      if (activateAfterSave) {
        const activated = await PreloaderService.adminActivatePreloader(saved.id);
        setDraft(activated);
      } else {
        setDraft(saved);
      }
      await loadRows();
      showNotification('success', 'Saved', activateAfterSave ? 'Preloader saved and activated.' : 'Preloader saved.');
    } catch (error: any) {
      showNotification('error', 'Error', error?.response?.data?.error || error?.message || 'Failed to save preloader.');
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    setSaving(true);
    try {
      const updated = await PreloaderService.adminActivatePreloader(id);
      await loadRows();
      setDraft(updated);
      showNotification('success', 'Activated', 'Preloader activated.');
    } catch (error: any) {
      showNotification('error', 'Error', error?.response?.data?.error || error?.message || 'Failed to activate preloader.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    setSaving(true);
    try {
      const updated = await PreloaderService.adminDeactivatePreloader(id);
      await loadRows();
      setDraft(updated);
      showNotification('success', 'Deactivated', 'Preloader deactivated.');
    } catch (error: any) {
      showNotification('error', 'Error', error?.response?.data?.error || error?.message || 'Failed to deactivate preloader.');
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async (id: string) => {
    const ok = window.confirm('Delete this preloader configuration?');
    if (!ok) return;
    setSaving(true);
    try {
      await PreloaderService.adminDeletePreloader(id);
      setDraft(defaultDraft());
      await loadRows();
      showNotification('success', 'Deleted', 'Preloader deleted.');
    } catch (error: any) {
      showNotification('error', 'Error', error?.response?.data?.error || error?.message || 'Failed to delete preloader.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Preloader Configs</h3>
              <button
                type="button"
                onClick={() => setDraft(defaultDraft())}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadRows()}
              className="mb-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {loading ? (
                <div className="text-xs text-gray-500">Loading preloaders...</div>
              ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-xs text-gray-500">
                  No preloader configurations yet.
                </div>
              ) : (
                rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setDraft(row)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      draft.id === row.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500">
                          {row.loaderType} • {row.showOnRouteChange ? 'Route' : 'No Route'} • {row.showOnApiLoading ? 'API' : 'No API'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {row.isActive ? 'Active' : row.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void activate(row.id);
                        }}
                        disabled={saving || row.isActive}
                        className="rounded border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deactivate(row.id);
                        }}
                        disabled={saving || !row.isActive}
                        className="rounded border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteConfig(row.id);
                        }}
                        disabled={saving}
                        className="ml-auto rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {draft.id ? 'Edit Preloader' : 'Create Preloader'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveDraft(false)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void saveDraft(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Save & Activate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Name
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800"
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  placeholder="Homepage Default Loader"
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.status}
                  onChange={(event) => updateDraft({ status: event.target.value as PreloaderStatus })}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Loader Type
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.loaderType}
                  onChange={(event) => updateDraft({ loaderType: event.target.value as PreloaderLoaderType })}
                >
                  {loaderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Position
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.position}
                  onChange={(event) => updateDraft({ position: event.target.value as PreloaderPosition })}
                >
                  {positionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Minimum Duration (ms)
                <input
                  type="number"
                  min={0}
                  max={60000}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.minDurationMs}
                  onChange={(event) => updateDraft({ minDurationMs: Number(event.target.value || 0) })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Maximum Duration (ms)
                <input
                  type="number"
                  min={300}
                  max={120000}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.maxDurationMs}
                  onChange={(event) => updateDraft({ maxDurationMs: Number(event.target.value || 300) })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500 md:col-span-2">
                Headline
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.headlineText || ''}
                  onChange={(event) => updateDraft({ headlineText: event.target.value })}
                  placeholder="Loading Scrolith..."
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500 md:col-span-2">
                Subtext
                <textarea
                  className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.subText || ''}
                  onChange={(event) => updateDraft({ subText: event.target.value })}
                  placeholder="Please wait while we prepare your experience."
                />
              </label>

              <div className="space-y-2 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Display Rules</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <ToggleRow
                    label="Initial App Load"
                    checked={draft.showOnInitialLoad}
                    onChange={(next) => updateDraft({ showOnInitialLoad: next })}
                  />
                  <ToggleRow
                    label="Route Changes"
                    checked={draft.showOnRouteChange}
                    onChange={(next) => updateDraft({ showOnRouteChange: next })}
                  />
                  <ToggleRow
                    label="API Loading"
                    checked={draft.showOnApiLoading}
                    onChange={(next) => updateDraft({ showOnApiLoading: next })}
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Branding</p>
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="h-12 w-12 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {draft.logoUrl ? (
                      <img src={draft.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Logo</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-white"
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      Select Logo
                    </button>
                    {draft.logoFileId ? (
                      <button
                        type="button"
                        onClick={() => updateDraft({ logoFileId: null, logoUrl: null })}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Background Type
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.backgroundType}
                  onChange={(event) =>
                    updateDraft({ backgroundType: event.target.value as PreloaderBackgroundType })
                  }
                >
                  {backgroundOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Accent Color
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-gray-200 px-2 py-1"
                  value={draft.accentColor}
                  onChange={(event) => updateDraft({ accentColor: event.target.value })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Background Color
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-gray-200 px-2 py-1"
                  value={draft.backgroundColor}
                  onChange={(event) => updateDraft({ backgroundColor: event.target.value })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Text Color
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-gray-200 px-2 py-1"
                  value={draft.textColor}
                  onChange={(event) => updateDraft({ textColor: event.target.value })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Gradient From
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-gray-200 px-2 py-1"
                  value={draft.gradientFrom || '#0f172a'}
                  onChange={(event) => updateDraft({ gradientFrom: event.target.value })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Gradient To
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-gray-200 px-2 py-1"
                  value={draft.gradientTo || '#1d4ed8'}
                  onChange={(event) => updateDraft({ gradientTo: event.target.value })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Overlay Opacity
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.overlayOpacity}
                  onChange={(event) => updateDraft({ overlayOpacity: Number(event.target.value || 0) })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Blur (px)
                <input
                  type="number"
                  min={0}
                  max={40}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.blurPx}
                  onChange={(event) => updateDraft({ blurPx: Number(event.target.value || 0) })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Animation Speed
                <input
                  type="number"
                  min={0.2}
                  max={4}
                  step={0.1}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.animationSpeed}
                  onChange={(event) => updateDraft({ animationSpeed: Number(event.target.value || 1) })}
                />
              </label>

              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-500 md:col-span-2">
                Custom CSS (sanitized server-side)
                <textarea
                  className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  value={draft.customCss || ''}
                  onChange={(event) => updateDraft({ customCss: event.target.value })}
                  placeholder="font-size: 18px; border-radius: 14px;"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PreloaderPreview config={draft} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Runtime Status</p>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Current active config</span>
              <span className="font-semibold text-gray-900">{activeId ? activeId.slice(0, 8) : 'Default'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Require initial load</span>
              <span className="font-semibold text-gray-900">{draft.showOnInitialLoad ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Route preloader</span>
              <span className="font-semibold text-gray-900">{draft.showOnRouteChange ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>API preloader</span>
              <span className="font-semibold text-gray-900">{draft.showOnApiLoading ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Timing (min/max)</span>
              <span className="font-semibold text-gray-900">
                {draft.minDurationMs}ms / {draft.maxDurationMs}ms
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void saveDraft(false)}
            disabled={saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Save Preview Config
          </button>
        </div>
      </div>

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(file) => {
          updateDraft({ logoFileId: file.id, logoUrl: file.url });
          setPickerOpen(false);
        }}
        allowUpload
        allowCamera
        filterType="image"
        acceptedTypes={['image']}
        title="Select Preloader Logo"
        role="admin"
        visibility="public"
      />
    </div>
  );
};

export default PreloaderManagement;
