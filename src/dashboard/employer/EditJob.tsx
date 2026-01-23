import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { JobsService } from '../../services/jobs';
import FilePickerModal from '../shared/FilePickerModal';

export default function EditJob() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const load = async () => {
      try {
        const data = await JobsService.getById(id);
        if (!mounted) return;
        setJob(data);
        const existing = (data as any)?.fileIds || (data as any)?.attachments || [];
        setFileIds(Array.isArray(existing) ? existing : []);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load job');
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await JobsService.update(id, {
        title: job.title,
        description: job.description,
        attachments: fileIds
      });
      navigate('/client/dashboard/jobs');
    } catch (err: any) {
      setError(err?.message || 'Failed to save job');
    } finally {
      setSaving(false);
    }
  };

  if (error && !job) {
    return (
      <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700">
        {error}
      </div>
    );
  }

  if (!job) {
    return <div className="p-8 text-gray-500">Loading job...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Edit Job</h2>
        <button
          onClick={save}
          className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-600">Title</label>
          <input
            className="w-full border rounded-xl p-3 mt-1"
            value={job.title || ''}
            onChange={(e) => setJob({ ...job, title: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-600">Description</label>
          <textarea
            className="w-full border rounded-xl p-3 mt-1 min-h-[140px]"
            value={job.description || ''}
            onChange={(e) => setJob({ ...job, description: e.target.value })}
          />
        </div>

        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
          <div>
            <div className="font-bold text-gray-900">Attachments</div>
            <div className="text-xs text-gray-500">
              Attachments must be selected from Uploaded Files.
            </div>
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
          >
            Add Files
          </button>
        </div>

        {fileIds.length > 0 && (
          <div className="text-sm text-gray-700">
            <div className="font-bold mb-2">Attached File IDs</div>
            <div className="flex flex-wrap gap-2">
              {fileIds.map((fid) => (
                <span key={fid} className="px-3 py-1 rounded-full bg-gray-100 border text-xs font-bold">
                  {fid}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        role="employer"
        visibility="private"
        onSelectMultiple={(picked) => {
          const ids = picked.map((f) => f.id);
          setFileIds((prev) => Array.from(new Set([...(prev || []), ...ids])));
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
