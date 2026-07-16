import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, FolderPlus, Loader2, Plus, Save } from 'lucide-react';

import MobileDialog, { MobileDialogFooter } from '../../../components/mobile/MobileDialog';
import { useNotification } from '../../../context/NotificationContext';
import { postOptionsApi, type PostCollectionSummary } from '../../../services/postOptions';

type Props = {
  open: boolean;
  postId: string;
  postTitle?: string;
  saved: boolean;
  onClose: () => void;
  onSavedChange: (next: boolean) => void;
};

const DEFAULT_COLLECTION_LABEL = 'Saved Posts';

export default function PostSaveCollectionDialog({ open, postId, postTitle, saved, onClose, onSavedChange }: Props) {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [collections, setCollections] = useState<PostCollectionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const defaultCollection = useMemo(() => collections.find((collection) => collection.isDefault), [collections]);

  useEffect(() => {
    if (!open || !postId) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const resp = await postOptionsApi.listCollections(postId);
        if (cancelled) return;
        const next = Array.isArray(resp?.data?.collections) ? resp.data.collections : [];
        setCollections(next);
        setSelectedId(next.find((collection) => collection.isSelected)?.id || next.find((collection) => collection.isDefault)?.id || null);
      } catch (error: any) {
        if (cancelled) return;
        showNotification('error', 'Collections unavailable', error?.message || 'Unable to load saved collections.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, postId, showNotification]);

  const refreshCollections = async () => {
    const resp = await postOptionsApi.listCollections(postId);
    const next = Array.isArray(resp?.data?.collections) ? resp.data.collections : [];
    setCollections(next);
    return next;
  };

  const commitSave = async (payload?: { collectionId?: string; collectionName?: string; collectionDescription?: string }) => {
    setActionId(payload?.collectionId || payload?.collectionName || 'default');
    try {
      const resp = await postOptionsApi.save(postId, payload);
      const nextSaved = Boolean(resp?.data?.saved);
      onSavedChange(nextSaved);
      await refreshCollections().catch(() => null);
      showNotification('success', nextSaved ? 'Saved' : 'Updated', resp?.message || 'Post saved to your collections.');
      onClose();
    } catch (error: any) {
      showNotification('error', 'Save failed', error?.message || 'Unable to save this post to a collection.');
    } finally {
      setActionId(null);
    }
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      showNotification('info', 'Collection name required', 'Enter a collection name first.');
      return;
    }

    setActionId(`create:${name}`);
    try {
      const created = await postOptionsApi.createCollection({
        name,
        description: newCollectionDescription.trim() || undefined
      });
      const collection = created?.data?.collection;
      if (!collection?.id) {
        throw new Error('Collection could not be created.');
      }
      await commitSave({ collectionId: collection.id });
      setNewCollectionName('');
      setNewCollectionDescription('');
    } catch (error: any) {
      showNotification('error', 'Collection not created', error?.message || 'Unable to create collection.');
      setActionId(null);
    }
  };

  const handleSaveDefault = async () => {
    if (defaultCollection?.id) {
      await commitSave({ collectionId: defaultCollection.id });
      return;
    }
    await commitSave();
  };

  const handleUnsave = async () => {
    setActionId('unsave');
    try {
      const resp = await postOptionsApi.unsave(postId);
      onSavedChange(Boolean(resp?.data?.saved));
      await refreshCollections().catch(() => null);
      showNotification('info', 'Removed from saved', resp?.message || 'Post removed from your saved items.');
      onClose();
    } catch (error: any) {
      showNotification('error', 'Unable to remove', error?.message || 'Unable to unsave this post.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <MobileDialog
      open={open}
      title="Save to collection"
      description={postTitle ? `Save "${postTitle}" to a collection.` : 'Choose where this post should be saved.'}
      onClose={onClose}
      size="lg"
      panelClassName="sm:max-w-2xl"
      footer={
        <MobileDialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleUnsave}
            disabled={!saved || actionId === 'unsave'}
            className="rounded-xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {actionId === 'unsave' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
            Remove saved post
          </button>
        </MobileDialogFooter>
      }
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Bookmark className="h-4 w-4" />
            Quick save
          </div>
          <button
            type="button"
            onClick={handleSaveDefault}
            disabled={actionId === 'default'}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                {actionId === 'default' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{defaultCollection?.name || DEFAULT_COLLECTION_LABEL}</span>
                <span className="block text-xs text-slate-500">Store the post in your default saved collection.</span>
              </span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Save</span>
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Your collections</div>
              <div className="text-xs text-slate-500">Tap a collection to save the post there.</div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{collections.length} total</div>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Loading collections...
              </div>
            ) : collections.length ? (
              collections.map((collection) => {
                const isSelected = selectedId === collection.id || collection.isSelected;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={async () => {
                      setSelectedId(collection.id);
                      await commitSave({ collectionId: collection.id });
                    }}
                    disabled={actionId === collection.id}
                    className={[
                      'flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition',
                      isSelected ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      actionId === collection.id ? 'opacity-70' : ''
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{collection.name}</span>
                        {collection.isDefault ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {collection.description || 'Private collection'} | {collection.postCount} saved posts
                      </div>
                    </div>
                    <div className="shrink-0 text-slate-500">
                      {actionId === collection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : isSelected ? <Check className="h-4 w-4 text-blue-600" /> : <FolderPlus className="h-4 w-4" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No collections yet. Create one below to organize saved posts.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Plus className="h-4 w-4" />
            Create a new collection
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Collection name"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400"
            />
            <input
              value={newCollectionDescription}
              onChange={(e) => setNewCollectionDescription(e.target.value)}
              placeholder="Short description (optional)"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-400"
            />
            <button
              type="button"
              onClick={handleCreateCollection}
              disabled={actionId?.startsWith('create:') || !newCollectionName.trim()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {actionId?.startsWith('create:') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </section>
      </div>
    </MobileDialog>
  );
}
