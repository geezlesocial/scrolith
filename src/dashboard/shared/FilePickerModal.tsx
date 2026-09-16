import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Search,
  Upload,
  X
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CameraSource } from '@capacitor/camera';
import { FileService } from '../../services/files';
import { UploadedFile } from '../../types';
import { useUser } from '../../context/UserContext';
import { captureAndUpload } from '../../mobile/uploads';
import {
  resolvePostAttachmentMediaPair,
  resolvePostAttachmentMediaUrl
} from '../../utils/postAttachmentMedia';
import ScrolithaMediaEnhanceOffer from '../../components/ai/ScrolithaMediaEnhanceOffer';

type FileType = 'image' | 'video' | 'document';
type FilterTab = 'all' | 'image' | 'video' | 'pdf' | 'document';

type FilePickerModalProps = {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onSelect: (file: UploadedFile) => void;
  onSelectMultiple?: (files: UploadedFile[]) => void;
  confirmLabel?: string;
  allowUpload?: boolean;
  allowCamera?: boolean;
  allowLibrarySelection?: boolean;
  cameraCapture?: 'user' | 'environment';
  multiple?: boolean;
  filterType?: 'image' | 'video' | 'document' | 'all';
  acceptedTypes?: string | FileType[];
  title?: string;
  role?: string;
  visibility?: 'public' | 'private';
};

const tabFromFilterType = (filterType: FilePickerModalProps['filterType']): FilterTab => {
  if (filterType === 'image') return 'image';
  if (filterType === 'video') return 'video';
  if (filterType === 'document') return 'document';
  return 'all';
};

const inferPickerType = (file: UploadedFile): FileType => {
  const explicit = String(file.type || '').toLowerCase();
  const mime = String(file.mime_type || '').toLowerCase();
  if (explicit === 'image' || mime.startsWith('image/')) return 'image';
  if (explicit === 'video' || mime.startsWith('video/')) return 'video';
  return 'document';
};

const isPdfFile = (file: UploadedFile) => {
  const mime = String(file.mime_type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
};

const formatDuration = (duration?: number | null) => {
  if (!duration || Number.isNaN(duration)) return '';
  const seconds = Math.max(0, Math.round(Number(duration)));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};

const acceptedStringForArray = (types?: FileType[]) => {
  if (!types?.length) return undefined;
  const accepts = new Set<string>();
  if (types.includes('image')) accepts.add('image/*');
  if (types.includes('video')) accepts.add('video/*');
  if (types.includes('document')) {
    accepts.add('application/pdf');
    accepts.add('application/vnd.android.package-archive');
    accepts.add('.apk');
    accepts.add('.doc');
    accepts.add('.docx');
    accepts.add('.xls');
    accepts.add('.xlsx');
    accepts.add('.ppt');
    accepts.add('.pptx');
    accepts.add('.txt');
    accepts.add('.csv');
  }
  return Array.from(accepts).join(',');
};

const filterFileByTab = (file: UploadedFile, tab: FilterTab) => {
  const fileType = inferPickerType(file);
  if (tab === 'all') return true;
  if (tab === 'image') return fileType === 'image';
  if (tab === 'video') return fileType === 'video';
  if (tab === 'pdf') return isPdfFile(file);
  return fileType === 'document';
};

const tabToApiType = (tab: FilterTab): 'image' | 'video' | 'document' | undefined => {
  if (tab === 'image') return 'image';
  if (tab === 'video') return 'video';
  if (tab === 'pdf' || tab === 'document') return 'document';
  return undefined;
};

const toFriendlyError = (error: any, fallback: string) => {
  const timeout =
    String(error?.code || '').toUpperCase() === 'ECONNABORTED' ||
    String(error?.message || '').toLowerCase().includes('timeout');
  if (timeout) return 'Request took too long. Please check your connection and try again.';
  return String(error?.response?.data?.error || error?.message || fallback);
};

const FilePickerModal: React.FC<FilePickerModalProps> = ({
  isOpen,
  open,
  onClose,
  onSelect,
  onSelectMultiple,
  confirmLabel,
  allowUpload = true,
  allowCamera = false,
  allowLibrarySelection = true,
  cameraCapture = 'environment',
  multiple = false,
  filterType = 'all',
  acceptedTypes,
  title,
  role,
  visibility = 'public'
}) => {
  const { user } = useUser();
  const isVisible = typeof open === 'boolean' ? open : Boolean(isOpen);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingEnhancement, setPendingEnhancement] = useState<{ file: File; kind: 'image' | 'video' } | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>(tabFromFilterType(filterType));
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const allowedTypes = Array.isArray(acceptedTypes) ? acceptedTypes : undefined;

  useEffect(() => {
    setTab(tabFromFilterType(filterType));
  }, [filterType]);

  const canCapturePhoto = useMemo(() => {
    if (!allowCamera) return false;
    if (!allowedTypes || allowedTypes.length === 0) return true;
    return allowedTypes.includes('image');
  }, [allowCamera, allowedTypes]);

  const canCaptureVideo = useMemo(() => {
    if (!allowCamera) return false;
    if (!allowedTypes || allowedTypes.length === 0) return true;
    return allowedTypes.includes('video');
  }, [allowCamera, allowedTypes]);

  const apiType = tabToApiType(tab);

  const loadFiles = async () => {
    if (!allowLibrarySelection) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await FileService.getFiles({
        role,
        visibility,
        type: apiType,
        search: search || undefined,
        limit: 60,
        page: 1,
        includeUsage: false,
        includeDisk: false
      });
      setFiles(response?.files ?? []);
    } catch (error) {
      console.error('Failed to load uploaded files:', error);
      setErrorMessage(toFriendlyError(error, 'Failed to load files.'));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    setSelected({});
    if (!allowLibrarySelection) {
      setFiles([]);
      return;
    }
    void loadFiles();
  }, [isVisible, apiType, search, role, visibility, allowLibrarySelection]);

  const visibleFiles = useMemo(() => {
    let list = files.filter((file) => filterFileByTab(file, tab));
    if (allowedTypes?.length) {
      list = list.filter((file) => allowedTypes.includes(inferPickerType(file)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((file) => String(file.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [allowedTypes, files, search, tab]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const category: UploadedFile['category'] = file.type.startsWith('image/') || file.type.startsWith('video/')
        ? 'portfolio'
        : 'document';
      const uploaded = await FileService.uploadFile(file, category, {
        role: role || user?.role,
        visibility,
        userId: user?.id
      });

      if (multiple) {
        setFiles((prev) => [uploaded, ...prev]);
        setSelected((prev) => ({ ...prev, [uploaded.id]: true }));
      } else {
        onSelect(uploaded);
        onClose();
      }
      setErrorMessage('');
    } catch (error: any) {
      console.error('Failed to upload file:', error);
      setErrorMessage(toFriendlyError(error, 'Failed to upload file.'));
    } finally {
      setUploading(false);
    }
  };

  const offerOrUpload = (file: File) => {
    const mime = String(file.type || '').toLowerCase();
    const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null;
    if (kind) {
      setPendingEnhancement({ file, kind });
      return;
    }
    void uploadFile(file);
  };

  const handleCameraCapture = async (mode: 'photo' | 'video') => {
    if (uploading) return;
    if (Capacitor.isNativePlatform() && mode === 'photo') {
      try {
        setUploading(true);
        const uploaded = await captureAndUpload({
          source: CameraSource.Camera,
          category: 'portfolio',
          role: role || user?.role,
          visibility,
          userId: user?.id
        });
        if (multiple) {
          setFiles((prev) => [uploaded, ...prev]);
          setSelected((prev) => ({ ...prev, [uploaded.id]: true }));
        } else {
          onSelect(uploaded);
          onClose();
        }
      } catch (error) {
        console.error('Camera capture failed:', error);
        setErrorMessage('Unable to capture from camera.');
      } finally {
        setUploading(false);
      }
      return;
    }

    if (mode === 'photo') {
      photoInputRef.current?.click();
      return;
    }
    videoInputRef.current?.click();
  };

  const toggleSelection = (id: string) => {
    if (!multiple) {
      setSelected({ [id]: true });
      return;
    }
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePick = (file: UploadedFile) => {
    if (!allowLibrarySelection) return;
    if (!multiple) {
      onSelect(file);
      onClose();
      return;
    }
    toggleSelection(file.id);
  };

  const handleConfirm = () => {
    const picked = visibleFiles.filter((file) => selected[file.id]);
    if (!picked.length) return;
    if (multiple && onSelectMultiple) {
      onSelectMultiple(picked);
    } else {
      onSelect(picked[0]);
    }
    onClose();
  };

  if (!isVisible) return null;

  const selectionCount = Object.values(selected).filter(Boolean).length;
  const uploadAccept = typeof acceptedTypes === 'string'
    ? acceptedTypes
    : acceptedStringForArray(allowedTypes);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/55 p-3 pt-4 sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-5.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title || 'Select from Uploaded Files'}</h3>
            <p className="text-xs text-slate-500">Library, upload, or camera capture. All media is stored in Uploaded Files.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-200 px-4 py-3">
          {pendingEnhancement ? (
            <ScrolithaMediaEnhanceOffer
              file={pendingEnhancement.file}
              kind={pendingEnhancement.kind}
              onAccept={async (enhanced) => {
                setPendingEnhancement(null);
                await uploadFile(enhanced);
              }}
              onDismiss={() => {
                const original = pendingEnhancement.file;
                setPendingEnhancement(null);
                void uploadFile(original);
              }}
            />
          ) : null}
          {allowLibrarySelection ? (
            <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Images' },
              { id: 'video', label: 'Videos' },
              { id: 'pdf', label: 'PDFs' }
            ] as Array<{ id: FilterTab; label: string }>).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  tab === item.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Camera capture is required for this document type. Gallery/library selection is disabled.
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {allowLibrarySelection ? (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by filename..."
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              />
            </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex flex-wrap items-center gap-2">
              {allowUpload && (
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
              {canCapturePhoto && (
                <button
                  type="button"
                  onClick={() => void handleCameraCapture('photo')}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" />
                  Capture Photo
                </button>
              )}
              {canCaptureVideo && (
                <button
                  type="button"
                  onClick={() => void handleCameraCapture('video')}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  <FileVideo className="h-4 w-4" />
                  Capture Video
                </button>
              )}
            </div>
          </div>
          {errorMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="flex items-center justify-between gap-2">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => void loadFiles()}
                  className="whitespace-nowrap rounded-full border border-amber-300 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-100"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {allowLibrarySelection ? (
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-slate-500">
                <FileText className="mb-2 h-8 w-8" />
                <p className="text-sm">No files found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {visibleFiles.map((file) => {
                  const kind = inferPickerType(file);
                  const isSelected = Boolean(selected[file.id]);
                  const durationLabel = formatDuration(file.duration);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => handlePick(file)}
                      className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                        isSelected ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 text-slate-700">
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : <span className="block h-3.5 w-3.5" />}
                      </div>

                      {kind === 'image' ? (
                        <img
                          src={
                            resolvePostAttachmentMediaUrl({
                              url: file.url,
                              fileId: file.id || (file as any).fileId,
                              storageKey: (file as any).storageKey || (file as any).storage_key
                            }) || String(file.url || '').trim()
                          }
                          alt={file.name}
                          className="h-36 w-full object-cover bg-slate-50"
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            const img = event.currentTarget;
                            const pair = resolvePostAttachmentMediaPair({
                              url: file.url,
                              fileId: file.id || (file as any).fileId,
                              storageKey: (file as any).storageKey || (file as any).storage_key,
                              fallbackUrl: (file as any).fallbackUrl
                            });
                            const tried = String(img.dataset.fallbackTried || '');
                            if (pair.fallbackUrl && tried !== '1' && pair.fallbackUrl !== img.src) {
                              img.dataset.fallbackTried = '1';
                              img.src = pair.fallbackUrl;
                              return;
                            }
                            // Final durable content URL attempt from file id.
                            const id = String(file.id || (file as any).fileId || '').trim();
                            if (id && tried !== '2') {
                              img.dataset.fallbackTried = '2';
                              img.src = `https://api.scrolith.com/api/files/content/${encodeURIComponent(id)}`;
                              return;
                            }
                            img.style.opacity = '0.35';
                          }}
                        />
                      ) : kind === 'video' ? (
                        <div className="relative h-36 w-full bg-slate-100">
                          {file.thumbnail_url || file.thumbnailUrl ? (
                            <img
                              src={
                                resolvePostAttachmentMediaUrl({
                                  url: file.thumbnail_url || file.thumbnailUrl
                                }) || String(file.thumbnail_url || file.thumbnailUrl || '').trim()
                              }
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <FileVideo className="h-8 w-8 text-slate-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <FileVideo className="h-8 w-8 text-white" />
                          </div>
                          {durationLabel && (
                            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {durationLabel}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex h-36 w-full items-center justify-center bg-slate-100">
                          {isPdfFile(file) ? <FileText className="h-8 w-8 text-rose-500" /> : <FileText className="h-8 w-8 text-slate-400" />}
                        </div>
                      )}

                      <div className="space-y-1 px-3 py-2">
                        <p className="truncate text-xs font-semibold text-slate-800">{file.name}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            {kind === 'image' && <FileImage className="h-3 w-3" />}
                            {kind === 'video' && <FileVideo className="h-3 w-3" />}
                            {kind === 'document' && <FileText className="h-3 w-3" />}
                            {isPdfFile(file) ? 'pdf' : kind}
                          </span>
                          <span>{((Number(file.size) || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 p-5">
            <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              Capture a live photo with your camera to continue.
            </div>
          </div>
        )}

        {multiple && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:bottom-0 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <p className="text-[11px] font-medium text-slate-500 sm:mr-auto">
              {selectionCount > 0 ? `${selectionCount} file${selectionCount > 1 ? 's' : ''} selected` : 'Select file(s) to attach'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectionCount === 0}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {(confirmLabel || 'Use Selected')} ({selectionCount})
            </button>
          </div>
        )}

        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          accept={uploadAccept}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) offerOrUpload(file);
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={photoInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture={cameraCapture}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) offerOrUpload(file);
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          className="hidden"
          accept="video/*"
          capture={cameraCapture}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) offerOrUpload(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </div>
  );
};

export { FilePickerModal };
export default FilePickerModal;
