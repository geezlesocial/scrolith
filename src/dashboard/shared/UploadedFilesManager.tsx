import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  Search,
  Trash2,
  Copy,
  ExternalLink,
  FileImage,
  FileVideo,
  FileText,
  Filter,
  RefreshCw
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import FilePickerModal from './FilePickerModal';
import { UploadedFile } from '../../types';
import { FileService } from '../../services/files';

type Props = {
  role: 'freelancer' | 'employer';
};

const typeTabs: Array<{ id: 'all' | 'image' | 'video' | 'document'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'document', label: 'Documents' }
];

const iconFor = (t: string) => {
  if (t === 'image') return <FileImage className="w-4 h-4" />;
  if (t === 'video') return <FileVideo className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
};

export default function UploadedFilesManager({ role }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'image' | 'video' | 'document'>('all');
  const [preview, setPreview] = useState<UploadedFile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<UploadedFile | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await FileService.getFiles({
        role,
        type: type === 'all' ? undefined : type,
        limit: 50,
        page: 1
      });
      setFiles(res.files || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [type, reloadTick]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => (f.name || '').toLowerCase().includes(q));
  }, [files, search]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert('URL copied to clipboard');
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      alert('URL copied to clipboard');
    }
  };

  const openDelete = (f: UploadedFile) => {
    setFileToDelete(f);
    setConfirmDeleteOpen(true);
  };

  const doDelete = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      await FileService.deleteFile(fileToDelete.id);
      setConfirmDeleteOpen(false);
      setFileToDelete(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Uploaded Files</h2>
          <p className="text-sm text-gray-500">
            Upload once and reuse across gigs, jobs, profiles, messages, and more.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setReloadTick((x) => x + 1)}
            className="px-4 py-2 rounded-xl border bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center"
            type="button"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 inline-flex items-center"
            type="button"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload New
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex items-center bg-white border rounded-xl px-3 py-2 w-full max-w-xl">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <input
              className="bg-transparent outline-none w-full text-sm"
              placeholder="Search your files by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {typeTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`px-3 py-2 rounded-xl text-sm font-bold border transition ${
                  type === t.id
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border rounded-2xl p-10 text-center text-gray-500">
          <p className="font-bold text-gray-900 mb-1">No files found</p>
          <p className="text-sm">Upload a file to start building your library.</p>
          <button
            onClick={() => setPickerOpen(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 inline-flex items-center"
            type="button"
          >
            <Upload className="w-4 h-4 mr-2" /> Upload New
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((f) => (
            <div key={f.id} className="bg-white border border-gray-200 rounded-2xl p-3 hover:shadow-sm transition">
              <button onClick={() => setPreview(f)} className="w-full text-left" type="button">
                <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    {iconFor(f.type)}
                    {f.type}
                  </span>
                  {typeof f.size === 'number' && (
                    <span>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                  )}
                </div>

                {f.type === 'image' ? (
                  <img src={f.url} alt={f.name} className="w-full h-28 object-cover rounded-xl mb-2" />
                ) : f.type === 'video' ? (
                  <video src={f.url} className="w-full h-28 object-cover rounded-xl mb-2" />
                ) : (
                  <div className="w-full h-28 bg-gray-50 rounded-xl flex items-center justify-center mb-2 text-gray-400">
                    <FileText className="w-10 h-10" />
                  </div>
                )}

                <div className="text-sm font-bold text-gray-900 truncate">{f.name}</div>
                <div className="text-[11px] text-gray-500 mt-1 truncate">{f.url}</div>
              </button>

              {(() => {
                const usedIn = (f as unknown as { usedIn?: unknown }).usedIn;
                if (Array.isArray(usedIn) && usedIn.length > 0) {
                  const first = usedIn.slice(0, 2).map((u: unknown) => {
                    const obj = u as { type?: string; id?: string | number };
                    return `${obj.type ?? 'item'} #${obj.id ?? '?'}`;
                  });
                  return (
                    <div className="mt-2 text-[10px] text-gray-500">
                      Used in: {first.join(', ')}{usedIn.length > 2 ? '...' : ''}
                    </div>
                  );
                }
                return null;
              })()}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => copyUrl(f.url)}
                  className="flex-1 px-3 py-2 rounded-xl border text-xs font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center"
                  type="button"
                >
                  <Copy className="w-3 h-3 mr-2" /> Copy URL
                </button>

                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl border text-xs font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center"
                  title="Open"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={() => openDelete(f)}
                  className="px-3 py-2 rounded-xl border text-xs font-bold text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
                  title="Delete"
                  type="button"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(_file) => {
          setPickerOpen(false);
          load();
        }}
        multiple={false}
        role={role}
        visibility="public"
      />

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-gray-900">{preview.name}</div>
                <div className="text-xs text-gray-500">
                  {preview.type} -{' '}
                  {typeof preview.size === 'number' ? (preview.size / 1024 / 1024).toFixed(2) : '0.00'} MB
                </div>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-2 rounded-xl border text-sm font-bold hover:bg-gray-50"
                type="button"
              >
                Close
              </button>
            </div>
            <div className="p-6">
              {preview.type === 'image' ? (
                <img src={preview.url} alt={preview.name} className="w-full max-h-[60vh] object-contain rounded-xl" />
              ) : preview.type === 'video' ? (
                <video src={preview.url} controls className="w-full max-h-[60vh] rounded-xl" />
              ) : (
                <iframe title="document" src={preview.url} className="w-full h-[60vh] rounded-xl border" />
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => copyUrl(preview.url)}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 inline-flex items-center"
                  type="button"
                >
                  <Copy className="w-4 h-4 mr-2" /> Copy URL
                </button>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl border text-sm font-bold hover:bg-gray-50 inline-flex items-center"
                >
                  <ExternalLink className="w-4 h-4 mr-2" /> Open in new tab
                </a>
                <button
                  onClick={() => openDelete(preview)}
                  className="ml-auto px-4 py-2 rounded-xl border text-sm font-bold text-red-600 hover:bg-red-50 inline-flex items-center"
                  type="button"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        title="Delete file"
        message="This will remove the file from your library. If it is used elsewhere, those references may break."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => {
          if (!deleting) {
            setConfirmDeleteOpen(false);
            setFileToDelete(null);
          }
        }}
      />
    </div>
  );
}
