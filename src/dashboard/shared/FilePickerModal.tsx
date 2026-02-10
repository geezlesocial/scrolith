import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Upload, FileImage, FileVideo, FileText, Check, Loader2 } from 'lucide-react';
import { FileService } from '../../services/files';
import { UploadedFile } from '../../types';
import { useUser } from '../../context/UserContext';
import { Capacitor } from '@capacitor/core';
import { CameraSource } from '@capacitor/camera';
import { captureAndUpload } from '../../mobile/uploads';

type FileType = 'image' | 'video' | 'document';

type FilePickerModalProps = {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onSelect: (file: UploadedFile) => void;
  onSelectMultiple?: (files: UploadedFile[]) => void;
  allowUpload?: boolean;
  allowCamera?: boolean;
  cameraCapture?: 'user' | 'environment';
  multiple?: boolean;
  filterType?: 'image' | 'video' | 'document' | 'all';
  acceptedTypes?: string | FileType[];
  title?: string;
  role?: string;
  visibility?: 'public' | 'private';
};

const FilePickerModal: React.FC<FilePickerModalProps> = ({
  isOpen,
  open,
  onClose,
  onSelect,
  onSelectMultiple,
  allowUpload = true,
  allowCamera = false,
  cameraCapture = 'user',
  multiple = false,
  filterType = 'all',
  acceptedTypes,
  title,
  role,
  visibility = 'public'
}) => {
  const isVisible = typeof open === 'boolean' ? open : Boolean(isOpen);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'document'>(
    filterType === 'all' ? 'all' : filterType
  );
  const { user } = useUser();

  useEffect(() => {
    setFilter(filterType === 'all' ? 'all' : filterType);
  }, [filterType]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const visibilityKey = visibility === 'public' || visibility === 'private' ? visibility : undefined;

      const options: {
        role?: string;
        visibility?: 'public' | 'private';
        type?: 'image' | 'video' | 'document' | 'other';
        search?: string;
        page?: number;
        limit?: number;
      } = {
        role,
        visibility: visibilityKey,
        type: filter === 'all' ? undefined : filter,
        search: search || undefined,
        limit: 50,
        page: 1
      };

      const response = await FileService.getFiles(options);
      setFiles(response?.files ?? []);
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    setSelected({});
    loadFiles();
  }, [isVisible, filter, search]);

  const allowedTypes = Array.isArray(acceptedTypes) ? acceptedTypes : undefined;
  const canUseCamera = allowCamera && (filter === 'image' || (typeof acceptedTypes === 'string' && acceptedTypes.includes('image')) || allowedTypes?.includes('image'));

  const visibleFiles = useMemo(() => {
    let list = files;
    if (allowedTypes && allowedTypes.length > 0) {
      list = list.filter((file) => allowedTypes.includes(file.type as FileType));
    }
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((file) => (file.name || '').toLowerCase().includes(query));
    }
    return list;
  }, [files, search, allowedTypes]);

  const toggleSelection = (id: string) => {
    setSelected((prev) => {
      if (!multiple) return { [id]: true };
      return { ...prev, [id]: !prev[id] };
    });
  };

  const handleSelect = (file: UploadedFile) => {
    if (multiple) {
      toggleSelection(file.id);
      return;
    }
    onSelect(file);
    onClose();
  };

  const confirmSelection = () => {
    const picked = visibleFiles.filter((file) => selected[file.id]);
    if (multiple) {
      if (onSelectMultiple) {
        onSelectMultiple(picked);
      } else if (picked[0]) {
        onSelect(picked[0]);
      }
    } else if (picked[0]) {
      onSelect(picked[0]);
    }
    onClose();
  };

  const uploadNew = async (file: File) => {
    setUploading(true);
    try {
      const category: UploadedFile['category'] =
        file.type.startsWith('image/') || file.type.startsWith('video/') ? 'portfolio' : 'document';

      const uploaded = await FileService.uploadFile(file, category, {
        role: role || user?.role,
        visibility,
        userId: user?.id
      });

      if (!multiple) {
        onSelect(uploaded);
        onClose();
        return;
      }

      setFiles((prev) => [uploaded, ...prev]);
      setSelected((prev) => ({ ...prev, [uploaded.id]: true }));
      await loadFiles();
    } catch (err: any) {
      console.error('Failed to upload file:', err);
      const message = err?.response?.data?.error || err?.message || 'Failed to upload file.';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const handleCamera = async () => {
    if (!canUseCamera || uploading) return;
    try {
      if (Capacitor.isNativePlatform()) {
        setUploading(true);
        const uploaded = await captureAndUpload({
          source: CameraSource.Camera,
          category: 'portfolio',
          role: role || user?.role,
          visibility,
          userId: user?.id
        });
        onSelect(uploaded);
        onClose();
        return;
      }
      cameraInputRef.current?.click();
    } catch (err) {
      console.error('Failed to capture via camera:', err);
      alert('Unable to access camera.');
    } finally {
      setUploading(false);
    }
  };

  if (!isVisible) return null;

  const accept = typeof acceptedTypes === 'string' ? acceptedTypes : undefined;
  const selectionCount = Object.values(selected).filter(Boolean).length;

  const iconFor = (type: string) => {
    if (type === 'image') return <FileImage className="w-4 h-4" />;
    if (type === 'video') return <FileVideo className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title || 'Select from Uploaded Files'}</h3>
            <p className="text-xs text-gray-500">Upload new files here or pick existing ones.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" type="button">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
                placeholder="Search files..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={filter}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === 'all' || v === 'image' || v === 'video' || v === 'document') setFilter(v);
                else setFilter('all');
              }}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
            </select>

            {allowUpload && (
              <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload New'}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadNew(file);
                    e.currentTarget.value = '';
                  }}
                  disabled={uploading}
                  accept={accept}
                />
              </label>
            )}
            {canUseCamera && (
              <>
                <button
                  type="button"
                  onClick={handleCamera}
                  className="inline-flex items-center px-4 py-2 border border-slate-300 text-slate-700 rounded-lg"
                  disabled={uploading}
                >
                  <FileImage className="w-4 h-4 mr-2" />
                  Use Camera
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture={cameraCapture}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadNew(file);
                    e.currentTarget.value = '';
                  }}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p>No files found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {visibleFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => handleSelect(file)}
                  className={`relative group cursor-pointer border rounded-lg overflow-hidden text-left transition ${
                    selected[file.id] ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-gray-200'
                  }`}
                >
                  <div className="absolute top-2 right-2 text-indigo-600">
                    {selected[file.id] && <Check className="w-4 h-4" />}
                  </div>
                  {file.type === 'image' && file.url ? (
                    <img src={file.url} alt={file.name} className="w-full h-32 object-cover" />
                  ) : file.type === 'video' ? (
                    <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                      <FileVideo className="w-8 h-8 text-gray-400" />
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="p-2 bg-white">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        {iconFor(file.type)}
                        {file.type}
                      </span>
                      {typeof file.size === 'number' && (
                        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 truncate mt-1">{file.name}</p>
                    {Array.isArray(file.usedIn) && file.usedIn.length > 0 && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Used in {file.usedIn.length} place(s)
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {multiple && (
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-bold" type="button">
              Cancel
            </button>
            <button
              onClick={confirmSelection}
              disabled={selectionCount === 0}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
              type="button"
            >
              Use Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export { FilePickerModal };
export default FilePickerModal;
