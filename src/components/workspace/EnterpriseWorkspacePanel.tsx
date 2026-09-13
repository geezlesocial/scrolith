import React from 'react';
import { BriefcaseBusiness, Check, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { Phase3Service, type Phase3Workspace } from '../../services/phase3';
import WorkspaceWidget from './WorkspaceWidget';

const statusLabel = (status?: string) => {
  const value = String(status || 'active').toLowerCase();
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Updated just now';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Updated just now' : `Updated ${date.toLocaleDateString()}`;
};

export default function EnterpriseWorkspacePanel() {
  const [items, setItems] = React.useState<Phase3Workspace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [error, setError] = React.useState('');
  const [form, setForm] = React.useState({ name: '', description: '', visibility: 'private' });

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await Phase3Service.listWorkspaces({ limit: 6 });
      setItems(Array.isArray(response?.items) ? response.items : []);
    } catch (cause: any) {
      setError(cause?.response?.data?.error || 'Workspaces are temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const workspace = await Phase3Service.createWorkspace({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        visibility: form.visibility
      });
      setItems((previous) => [workspace, ...previous].slice(0, 6));
      setForm({ name: '', description: '', visibility: 'private' });
      setShowCreate(false);
    } catch (cause: any) {
      setError(cause?.response?.data?.error || 'Unable to create this workspace.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <WorkspaceWidget
      id="enterprise-workspaces"
      title="Enterprise Workspaces"
      subtitle="Bring contracts, milestones, members, and delivery activity into one operating space."
      actions={
        <>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50" aria-label="Refresh workspaces">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus className="h-3.5 w-3.5" /> New workspace
          </button>
        </>
      }
    >
      {showCreate ? (
        <form onSubmit={create} className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} required maxLength={120} placeholder="Workspace name" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            <input value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} maxLength={1000} placeholder="What is this workspace for?" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            <button type="submit" disabled={creating} className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <label htmlFor="workspace-visibility">Visibility</label>
            <select id="workspace-visibility" value={form.visibility} onChange={(event) => setForm((previous) => ({ ...previous, visibility: event.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
              <option value="private">Private</option>
              <option value="team">Team</option>
              <option value="public">Public</option>
            </select>
          </div>
        </form>
      ) : null}

      {error ? <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
      {loading ? <div className="grid gap-2 sm:grid-cols-2"><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /><div className="h-20 animate-pulse rounded-2xl bg-slate-100" /></div> : items.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((workspace) => (
            <article key={workspace.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><BriefcaseBusiness className="h-4 w-4" /></span>
                  <div className="min-w-0"><h4 className="truncate text-sm font-semibold text-slate-900">{workspace.name}</h4><p className="text-[11px] text-slate-500">{statusLabel(workspace.status)} · {workspace.visibility}</p></div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Live</span>
              </div>
              {workspace.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{workspace.description}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {workspace.counts?.members || 0} members</span><span>{workspace.counts?.milestones || 0} milestones</span><span className="ml-auto">{formatDate(workspace.updatedAt)}</span></div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center"><BriefcaseBusiness className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700">No enterprise workspaces yet</p><p className="mt-1 text-xs text-slate-500">Create one to coordinate delivery, milestones, and collaborators.</p></div>
      )}
    </WorkspaceWidget>
  );
}
