/**
 * Phase 22.2 — Group management panel (members, roles, invites, meta).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MessagingService } from '../../services/messaging';
import { Users, UserPlus, Link2, Crown, Shield, Trash2, X } from 'lucide-react';

export type GroupMember = {
  userId: string;
  id?: string;
  name: string;
  username?: string;
  avatar?: string;
  role: string;
  notifications?: string;
  isMuted?: boolean;
};

type Props = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  isGroup?: boolean;
  initialTitle?: string | null;
  canManage?: boolean;
  /** Current signed-in user id (for notification prefs) */
  currentUserId?: string | null;
  onUpdated?: () => void;
};

const roleBadge = (role: string) => {
  const r = String(role || 'MEMBER').toUpperCase();
  if (r === 'OWNER') return { label: 'Owner', className: 'bg-amber-100 text-amber-800' };
  if (r === 'ADMIN') return { label: 'Admin', className: 'bg-indigo-100 text-indigo-800' };
  if (r === 'MODERATOR') return { label: 'Mod', className: 'bg-sky-100 text-sky-800' };
  return { label: 'Member', className: 'bg-slate-100 text-slate-700' };
};

const GroupManagePanel: React.FC<Props> = ({
  conversationId,
  open,
  onClose,
  isGroup = true,
  initialTitle,
  canManage = true,
  currentUserId = null,
  onUpdated
}) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(String(initialTitle || ''));
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [myNotifications, setMyNotifications] = useState('ALL');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId || !open) return;
    setLoading(true);
    setError(null);
    try {
      const list = await MessagingService.listGroupMembers(conversationId);
      setMembers(Array.isArray(list) ? list : []);
      const uid = String(currentUserId || '').trim();
      if (uid) {
        const me = (Array.isArray(list) ? list : []).find(
          (m: GroupMember) => String(m.userId || m.id || '') === uid
        );
        if (me?.notifications) setMyNotifications(String(me.notifications).toUpperCase());
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [conversationId, open, currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTitle(String(initialTitle || ''));
  }, [initialTitle]);

  if (!open || !isGroup) return null;

  const saveMeta = async () => {
    setSaving(true);
    setError(null);
    try {
      await MessagingService.updateGroupMeta(conversationId, {
        title: title.trim(),
        description: description.trim()
      });
      onUpdated?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await MessagingService.createGroupInvite(conversationId, { expiresInHours: 168 });
      setInviteCode(data?.code || null);
      setInviteLink(data?.joinPath || (data?.code ? `/messages/join/${data.code}` : null));
    } catch (e: any) {
      setError(e?.message || 'Failed to create invite');
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    const id = addUserId.trim();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await MessagingService.addGroupMembers(conversationId, [id], 'MEMBER');
      setAddUserId('');
      await load();
      onUpdated?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (memberUserId: string, role: string) => {
    setSaving(true);
    try {
      await MessagingService.updateGroupMember(conversationId, memberUserId, { role });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (memberUserId: string) => {
    setSaving(true);
    try {
      await MessagingService.removeGroupMember(conversationId, memberUserId);
      await load();
      onUpdated?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-slate-900/40"
      role="dialog"
      aria-label="Group settings"
      data-testid="group-manage-panel"
    >
      <button type="button" className="flex-1 cursor-default" aria-label="Close overlay" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Group settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Group name"
              disabled={!canManage || saving}
              data-testid="group-title-input"
            />
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[72px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="What is this group for?"
              disabled={!canManage || saving}
            />
            {canManage ? (
              <button
                type="button"
                onClick={() => void saveMeta()}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save group info
              </button>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Members ({members.length})</h3>
              {loading ? <span className="text-xs text-slate-400">Loading…</span> : null}
            </div>
            <ul className="space-y-2" data-testid="group-members-list">
              {members.map((m) => {
                const badge = roleBadge(m.role);
                const mid = m.userId || m.id || '';
                return (
                  <li
                    key={mid}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
                      {m.username ? (
                        <div className="truncate text-xs text-slate-500">@{m.username}</div>
                      ) : null}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    {canManage && String(m.role).toUpperCase() !== 'OWNER' ? (
                      <select
                        className="max-w-[100px] rounded-lg border border-slate-200 text-xs"
                        value={String(m.role || 'MEMBER').toUpperCase()}
                        onChange={(e) => void changeRole(mid, e.target.value)}
                        aria-label={`Role for ${m.name}`}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="MODERATOR">Moderator</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : null}
                    {canManage && String(m.role).toUpperCase() !== 'OWNER' ? (
                      <button
                        type="button"
                        onClick={() => void removeMember(mid)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {canManage ? (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                <UserPlus className="h-4 w-4" /> Add member
              </h3>
              <div className="flex gap-2">
                <input
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="User id"
                  data-testid="group-add-member-input"
                />
                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={saving || !addUserId.trim()}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </section>
          ) : null}

          {currentUserId ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">My notifications</h3>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={myNotifications}
                disabled={saving}
                data-testid="group-my-notifications"
                onChange={(e) => {
                  const next = e.target.value;
                  setMyNotifications(next);
                  void (async () => {
                    setSaving(true);
                    try {
                      await MessagingService.updateGroupMember(conversationId, currentUserId, {
                        notifications: next
                      });
                    } catch (err: any) {
                      setError(err?.message || 'Failed to update notifications');
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
              >
                <option value="ALL">All messages</option>
                <option value="MENTIONS">Mentions only</option>
                <option value="NONE">None</option>
              </select>
              <p className="text-[11px] text-slate-500">
                @mentions still notify you when muted or on Mentions-only.
              </p>
            </section>
          ) : null}

          {canManage ? (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                <Link2 className="h-4 w-4" /> Invite link
              </h3>
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                data-testid="group-create-invite"
              >
                Generate invite
              </button>
              {inviteCode ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div>
                    Code: <span className="font-mono font-semibold">{inviteCode}</span>
                  </div>
                  {inviteLink ? <div className="mt-1 break-all">Path: {inviteLink}</div> : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="mb-1 flex items-center gap-1 font-semibold text-slate-800">
              <Shield className="h-3.5 w-3.5" /> Roles
            </div>
            <p>
              <Crown className="mr-1 inline h-3 w-3 text-amber-600" />
              Owner controls ownership; Admins manage members and invites; Moderators help keep
              discussions healthy; Members participate.
            </p>
            <p className="mt-1">
              @mentions notify mentioned members even when muted or on Mentions-only notifications.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
};

export default GroupManagePanel;
