import React, { useEffect, useState } from 'react';
import { FileService } from '../../services/files';
import { UploadedFile } from '../../types';
import { ConfirmModal } from './ConfirmModal';
import { FilePickerModal } from './FilePickerModal';
import { Loader2, Copy, Trash2 } from 'lucide-react';
import MediaPreviewModal from '../../components/media/MediaPreviewModal';

interface UploadedFilesViewProps {
  role?: 'freelancer' | 'employer' | string;
}

export const UploadedFilesView: React.FC<UploadedFilesViewProps> = ({ role = 'freelancer' }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [preview, setPreview] = useState<UploadedFile | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await FileService.getFiles({ role });
      setFiles(res.files || []);
    } catch (error) {
      console.error('Failed to load files', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [role]);

  const handleUploadSelected = async (_file: UploadedFile) => {
    // When FilePicker returns a selected file, refresh list
    setShowPicker(false);
    await loadFiles();
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await FileService.deleteFile(deletingId);
      setFiles((prev) => prev.filter((f) => f.id !== deletingId));
    } catch (error) {
      console.error('Failed to delete file', error);
      alert('Failed to delete file');
    } finally {
      setShowConfirm(false);
      setDeletingId(null);
    }
  };

  const copyUrl = async (url?: string) => {
    if (!url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert('URL copied to clipboard');
    } catch (error) {
      console.error('Copy failed', error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Uploaded Files</h2>
        <div className="flex items-center space-x-2">
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
            onClick={() => setShowPicker(true)}
          >
            Manage / Upload
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-gray-500 py-8 text-center">No files uploaded yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {files.map((file) => (
              <div key={file.id} className="border rounded overflow-hidden p-2 relative">
                {file.type === 'image' && file.url ? (
                  <button type="button" onClick={() => setPreview(file)} className="block w-full">
                    <img src={file.url} alt={file.name} className="w-full h-32 object-cover mb-2" />
                  </button>
                ) : file.type === 'video' ? (
                  <button type="button" onClick={() => setPreview(file)} className="flex w-full h-32 items-center justify-center bg-gray-100 mb-2 text-gray-500">
                    Video
                  </button>
                ) : (
                  <button type="button" onClick={() => setPreview(file)} className="w-full h-32 bg-gray-100 flex items-center justify-center mb-2">
                    {file.name}
                  </button>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-700 truncate">{file.name}</div>
                  <div className="flex items-center space-x-2">
                    <button title="Copy URL" onClick={() => copyUrl(file.url)} className="p-1 text-gray-500 hover:text-gray-800">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button title="Delete" onClick={() => handleDelete(file.id)} className="p-1 text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {file.usedIn && file.usedIn.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">Used in {file.usedIn.length} place(s)</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <FilePickerModal isOpen={showPicker} onClose={() => setShowPicker(false)} onSelect={handleUploadSelected} allowUpload />

      <MediaPreviewModal
        open={Boolean(preview)}
        media={preview ? {
          id: preview.id,
          url: preview.url,
          name: preview.name,
          type: preview.type,
          mimeType: preview.mimeType || preview.mime_type,
          thumbnailUrl: preview.thumbnailUrl || preview.thumbnail_url || null,
          duration: preview.duration
        } : null}
        onClose={() => setPreview(null)}
      />

      <ConfirmModal
        isOpen={showConfirm}
        title="Delete file"
        message="Are you sure you want to delete this file? This action cannot be undone."
        onCancel={() => {
          setShowConfirm(false);
          setDeletingId(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

