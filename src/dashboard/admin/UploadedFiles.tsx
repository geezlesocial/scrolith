
import React, { useState, useEffect } from 'react';
import type { UploadedFile } from '../../types';
import { FileService } from '../../services/files';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { Upload, Eye, Trash2, Copy, Download, Shield } from 'lucide-react';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';

type TabKey = 'all' | 'images' | 'videos' | 'documents';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All Files' },
  { key: 'images', label: 'Images' },
  { key: 'videos', label: 'Videos' },
  { key: 'documents', label: 'Documents' }
];

const ADMIN_UPLOAD_ACCEPT =
  'image/*,video/*,application/pdf,text/plain,text/csv,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.android.package-archive,.apk';

const tabFilters: Record<TabKey, (file: UploadedFile) => boolean> = {
  all: () => true,
  images: (file) => file.type === 'image' || file.type?.toLowerCase().startsWith('image/'),
  videos: (file) => file.type === 'video' || file.type?.toLowerCase().startsWith('video/'),
  documents: (file) => file.type === 'document' || (!file.type?.toLowerCase().startsWith('image/') && !file.type?.toLowerCase().startsWith('video/'))
};

const formatVisibility = (value?: UploadedFile['visibility']) =>
  value?.toLowerCase() === 'private' ? 'Private' : 'Public';

const formatSize = (size: number) => {
  if (!size || Number.isNaN(size)) return '0 KB';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const formatDate = (value?: string) => {
  if (!value) return '';
  try {
    const parsed = new Date(value);
    return parsed.toLocaleString();
  } catch {
    return value;
  }
};

const normalizeType = (file: UploadedFile) => {
  if (file.type === 'image' || file.type === 'video' || file.type === 'document') return file.type;
  const raw = file.type?.toLowerCase() ?? '';
  if (raw.startsWith('image/')) return 'image';
  if (raw.startsWith('video/')) return 'video';
  return 'document';
};

const UploadedFilesTab = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [brokenPreviews, setBrokenPreviews] = useState<Record<string, boolean>>({});
  const { showNotification } = useNotification();
  const { user } = useUser();

  const loadFiles = () => {
    FileService.getFiles({
      role: 'admin',
      visibility: undefined
    })
      .then(({ files: uploadedFiles }) => {
        setFiles(uploadedFiles);
        setBrokenPreviews({});
      })
      .catch((error) => {
        console.error('Failed to load files:', error);
        showNotification('error', 'Load Error', 'Failed to load uploaded files.');
        setFiles([]);
      });
  };

  useEffect(() => {
    loadFiles();
  }, [user?.id]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const category = file.type.startsWith('image/') || file.type.startsWith('video/')
      ? 'portfolio'
      : 'document';

    FileService.uploadFile(user?.id || 'admin', file, category, {
      role: 'admin',
      visibility: 'public'
    })
      .then((newFile) => {
        setFiles((prev) => [newFile, ...prev]);
        showNotification('success', 'File Uploaded', 'New media added to library.');
      })
      .catch((error) => {
        console.error('Failed to upload file:', error);
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to upload file.';
        showNotification('error', 'Upload Error', String(message));
      })
      .finally(() => {
        e.target.value = '';
      });
  };

  const handleCopyUrl = async (url: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showNotification('success', 'Copied', 'File URL copied to clipboard.');
    } catch (error) {
      console.error('Failed to copy URL:', error);
      showNotification('error', 'Copy Error', 'Unable to copy file URL.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this file?')) {
      await FileService.deleteFile(id, user?.id);
      setFiles((prev) => prev.filter((file) => file.id !== id));
      showNotification('success', 'Deleted', 'File removed from storage.');
    }
  };

  const filteredFiles = files.filter(tabFilters[activeTab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-gray-200 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-bold text-gray-900">File Manager</h3>
          <p className="text-sm text-gray-500">Browse, manage, and reuse uploaded media across Scrolith.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-blue-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 flex items-center text-sm font-medium">
            <Upload className="w-4 h-4 mr-2" /> Upload
            <input type="file" className="hidden" accept={ADMIN_UPLOAD_ACCEPT} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <div className="text-center p-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Upload className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No files found for this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.map((file) => {
            const normalizedType = normalizeType(file);
            const isImage = normalizedType === 'image';
            const isVideo = normalizedType === 'video';
            const fileUrl =
              resolvePostAttachmentMediaUrl({
                url: file.url,
                fileId: file.id || (file as any).fileId,
                storageKey: (file as any).storageKey || (file as any).storage_key
              }) || String(file.url || '').trim();
            const previewUrl =
              resolvePostAttachmentMediaUrl({
                url: isVideo
                  ? file.thumbnailUrl || file.thumbnail_url || file.url
                  : file.url,
                fileId: isVideo
                  ? (file as any).thumbnailFileId || file.id || (file as any).fileId
                  : file.id || (file as any).fileId,
                storageKey: (file as any).storageKey || (file as any).storage_key
              }) || fileUrl;
            const isPreviewBroken = Boolean(brokenPreviews[file.id]);
            return (
              <div key={file.id} className="group relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                  {isImage && !isPreviewBroken ? (
                    <img
                      src={previewUrl}
                      className="w-full h-full object-cover"
                      alt={file.name}
                      onError={() =>
                        setBrokenPreviews((current) => ({ ...current, [file.id]: true }))
                      }
                    />
                  ) : isVideo && !isPreviewBroken ? (
                    <video
                      src={fileUrl}
                      poster={previewUrl || undefined}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      onError={() =>
                        setBrokenPreviews((current) => ({ ...current, [file.id]: true }))
                      }
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs font-medium p-4 text-center break-words">
                      <FileTypeLabel type={file.mime_type || file.type} />
                      {isPreviewBroken ? (
                        <span className="mt-2 text-amber-600">Preview unavailable</span>
                      ) : null}
                      <span className="mt-2 text-gray-500">{formatSize(file.size)}</span>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(file.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Shield className="w-3 h-3" />
                      {formatVisibility(file.visibility)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Owner: {file.owner_id || 'system'}</span>
                    <span>Size: {formatSize(file.size)}</span>
                  </div>
                  <div className="flex justify-between gap-2 pt-1">
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs font-medium flex items-center justify-center gap-1"
                      title="View"
                    >
                      <Eye className="w-3 h-3" /> View
                    </a>
                    <button
                      className="flex-1 p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-medium flex items-center justify-center gap-1"
                      title="Copy URL"
                      onClick={() => handleCopyUrl(fileUrl)}
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                    <a
                      href={fileUrl}
                      download
                      className="flex-1 p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 text-xs font-medium flex items-center justify-center gap-1"
                      title="Download"
                    >
                      <Download className="w-3 h-3" /> Save
                    </a>
                    <button
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-xs font-medium flex items-center justify-center"
                      title="Delete"
                      onClick={() => handleDelete(file.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FileTypeLabel = ({ type }: { type?: string }) => (
  <>
    <span className="uppercase tracking-wide">{type?.split('/').pop() || 'FILE'}</span>
  </>
);

export default UploadedFilesTab;

