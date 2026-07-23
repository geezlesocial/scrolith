/**
 * Phase 22.2 + 29.3 — Group management panel.
 * Tabs: General · Members · Invites · Join requests · Restrictions · Danger
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessagingService } from '../../services/messaging';
import { FileService } from '../../services/files';
import EnterpriseAvatar from '../common/EnterpriseAvatar';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  Users,
  UserPlus,
  Link2,
  Crown,
  Shield,
  Trash2,
  X,
  QrCode,
  Lock,
  Bell,
  UserCheck,
  AlertTriangle,
  Camera
} from 'lucide-react';

export type GroupMember = {
  userId: string;
  id?: string;
  name: string;
  username?: string;
  avatar?: string;
  role: string;
  notifications?: string;
  isMuted?: boolean;
  isOnline?: boolean;
};

type Props = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  isGroup?: boolean;
  initialTitle?: string | null;
  canManage?: boolean;
  currentUserId?: string | null;
  onUpdated?: () => void;
};

type TabId = 'general' | 'members' | 'invites' | 'requests' | 'restrictions' | 'danger';

const roleBadge = (role: string) => {
  const r = String(role || 'MEMBER').toUpperCase();
  if (r === 'OWNER') return { label: 'Owner', className: 'bg-amber-100 text-amber-800' };
  if (r === 'ADMIN') return { label: 'Admin', className: 'bg-indigo-100 text-indigo-800' };
  if (r === 'MODERATOR') return { label: 'Mod', className: 'bg-sky-100 text-sky-800' };
  return { label: 'Member', className: 'bg-slate-100 text-slate-700' };
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'invites', label: 'Invites' },
  { id: 'requests', label: 'Requests' },
  { id: 'restrictions', label: 'Modes' },
  { id: 'danger', label: 'Danger' }
];

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
  const [tab, setTab] = useState<TabId>('general');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(String(initialTitle || ''));
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PRIVATE');
  const [messagingMode, setMessagingMode] = useState('EVERYONE');
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteMeta, setInviteMeta] = useState<any>(null);
  const [addIdentifier, setAddIdentifier] = useState('');
  const [resolvedMember, setResolvedMember] = useState<any>(null);
  const [memberSuggestions, setMemberSuggestions] = useState<any[]>([]);
  const [memberResolveBusy, setMemberResolveBusy] = useState(false);
  const [memberAddResult, setMemberAddResult] = useState<string | null>(null);
  const [myNotifications, setMyNotifications] = useState('ALL');
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [groupProfile, setGroupProfile] = useState<any>(null);
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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
      try {
        const profile = await MessagingService.getEnterpriseGroup(conversationId);
        setGroupProfile(profile);
        if (profile?.title || profile?.name) setTitle(String(profile.title || profile.name || ''));
        if (profile?.description != null) setDescription(String(profile.description || ''));
        if (profile?.visibility) setVisibility(String(profile.visibility).toUpperCase());
        if (profile?.messagingMode) setMessagingMode(String(profile.messagingMode).toUpperCase());
        if (profile?.slowModeSeconds != null) setSlowModeSeconds(Number(profile.slowModeSeconds) || 0);
        if (profile?.avatarFileId != null || profile?.avatar_file_id != null) {
          setAvatarFileId(String(profile.avatarFileId || profile.avatar_file_id || '').trim() || null);
        }
      } catch {
        /* enterprise endpoint may be unavailable until migration */
      }
      try {
        const pinList = await MessagingService.listGroupPins(conversationId);
        setPins(Array.isArray(pinList) ? pinList : []);
      } catch {
        setPins([]);
      }
      if (canManage) {
        try {
          const reqs = await MessagingService.listGroupJoinRequests(conversationId, 'PENDING');
          setJoinRequests(Array.isArray(reqs) ? reqs : []);
        } catch {
          setJoinRequests([]);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [conversationId, open, currentUserId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTitle(String(initialTitle || ''));
  }, [initialTitle]);

  useEffect(() => {
    if (!open || tab !== 'members' || !canManage) return;
    const query = addIdentifier.trim();
    setResolvedMember(null);
    setMemberAddResult(null);
    if (query.length < 2) {
      setMemberSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void MessagingService.listGroupMemberCandidates(conversationId, query)
        .then((results) => setMemberSuggestions(Array.isArray(results) ? results : []))
        .catch(() => setMemberSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addIdentifier, canManage, conversationId, open, tab]);

  if (!open || !isGroup) return null;

  const saveMeta = async () => {
    setSaving(true);
    setError(null);
    try {
      try {
        await MessagingService.patchEnterpriseGroup(conversationId, {
          name: title.trim(),
          description: description.trim(),
          visibility,
          messagingMode,
          slowModeSeconds,
          avatarFileId: avatarFileId
        });
      } catch {
        await MessagingService.updateGroupMeta(conversationId, {
          title: title.trim(),
          description: description.trim(),
          visibility,
          avatarFileId: avatarFileId
        });
      }
      onUpdated?.();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const uploadGroupPhoto = async (file: File | null) => {
    if (!file || !canManage) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Group photo must be 10 MB or smaller');
      return;
    }
    const okType = /image\/(jpeg|jpg|png|webp|avif)/i.test(file.type);
    if (!okType) {
      setError('Use JPG, PNG, WEBP, or AVIF');
      return;
    }
    setAvatarUploading(true);
    setError(null);
    try {
      const uploaded = await FileService.uploadFile(file, 'image', { visibility: 'public' });
      const fileId = String((uploaded as any)?.id || (uploaded as any)?.fileId || '').trim();
      if (!fileId) throw new Error('Upload did not return a file id');
      setAvatarFileId(fileId);
      try {
        await MessagingService.patchEnterpriseGroup(conversationId, { avatarFileId: fileId });
      } catch {
        await MessagingService.updateGroupMeta(conversationId, { avatarFileId: fileId });
      }
      onUpdated?.();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to upload group photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeGroupPhoto = async () => {
    if (!canManage) return;
    setAvatarUploading(true);
    setError(null);
    try {
      setAvatarFileId(null);
      try {
        await MessagingService.patchEnterpriseGroup(conversationId, { avatarFileId: null });
      } catch {
        await MessagingService.updateGroupMeta(conversationId, { avatarFileId: null });
      }
      onUpdated?.();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove group photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const createInvite = async (opts?: { oneTime?: boolean; maxUses?: number }) => {
    setSaving(true);
    setError(null);
    try {
      const data = await MessagingService.createGroupInvite(conversationId, {
        expiresInHours: 168,
        oneTime: opts?.oneTime,
        maxUses: opts?.maxUses,
        previewDisabled: visibility === 'SECRET'
      });
      setInviteCode(data?.code || null);
      setInviteLink(data?.joinPath || (data?.code ? `/messages/join/${data.code}` : null));
      setInviteMeta(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to create invite');
    } finally {
      setSaving(false);
    }
  };

  const resolveMemberIdentifier = async () => {
    const identifier = addIdentifier.trim();
    if (!identifier) return null;
    setMemberResolveBusy(true);
    setError(null);
    setMemberAddResult(null);
    try {
      const result = await MessagingService.resolveGroupMember(conversationId, identifier);
      const match = result?.match || null;
      setResolvedMember(match);
      return match;
    } catch (e: any) {
      setResolvedMember(null);
      setError(e?.response?.data?.error || e?.message || 'No matching user found');
      return null;
    } finally {
      setMemberResolveBusy(false);
    }
  };

  const addMember = async () => {
    const match = resolvedMember || (await resolveMemberIdentifier());
    const id = String(match?.userId || '').trim();
    if (!id) return;
    if (String(match?.membershipStatus || '').toUpperCase() !== 'NOT_MEMBER') {
      setError('This user cannot be added in the current state.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await MessagingService.addGroupMembers(
        conversationId,
        [id],
        'MEMBER',
        match?.matchedBy
      );
      const outcome = String(result?.outcome || 'MEMBER_ADDED').replace(/_/g, ' ').toLowerCase();
      setMemberAddResult(outcome.charAt(0).toUpperCase() + outcome.slice(1));
      setAddIdentifier('');
      setResolvedMember(null);
      setMemberSuggestions([]);
      await load();
      onUpdated?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to add member');
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

  const decideRequest = async (requestId: string, decision: 'approve' | 'reject') => {
    setSaving(true);
    try {
      await MessagingService.decideGroupJoinRequest(conversationId, requestId, decision);
      await load();
      onUpdated?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to update request');
    } finally {
      setSaving(false);
    }
  };

  const lockOrUnlock = async (lock: boolean) => {
    setSaving(true);
    try {
      if (lock) await MessagingService.lockGroup(conversationId, { reason: 'Admin lockdown' });
      else await MessagingService.unlockGroup(conversationId, 'EVERYONE');
      await load();
      onUpdated?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to update lockdown');
    } finally {
      setSaving(false);
    }
  };

  const copyInvite = async () => {
    const text = inviteLink
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${inviteLink}`
      : inviteCode || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <div
      className="fixed inset-0 z-[180] flex justify-end bg-slate-900/40"
      role="dialog"
      aria-label="Group settings"
      data-testid="group-manage-panel"
    >
      <button type="button" className="flex-1 cursor-default" aria-label="Close overlay" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Group settings</h2>
                <p className="text-[11px] text-slate-500">
                  {members.length} members
                  {onlineCount ? ` · ${onlineCount} online` : ''}
                  {pins.length ? ` · ${pins.length} pinned` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="mt-3 flex gap-1 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Group settings tabs"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-testid={`group-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.label}
                {t.id === 'requests' && joinRequests.length ? (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5">{joinRequests.length}</span>
                ) : null}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {tab === 'general' ? (
            <section className="space-y-2" data-testid="group-tab-panel-general">
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <EnterpriseAvatar
                  src={avatarFileId ? resolveUserAvatarUrl(avatarFileId) : undefined}
                  name={title || 'Group'}
                  size="lg"
                  className="!h-16 !w-16 border border-slate-200 bg-indigo-50 text-indigo-700"
                  alt={title || 'Group photo'}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group photo
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={avatarUploading || saving}
                        onClick={() => avatarInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        data-testid="group-photo-upload"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {avatarUploading ? 'Uploading…' : avatarFileId ? 'Change' : 'Upload'}
                      </button>
                      {avatarFileId ? (
                        <button
                          type="button"
                          disabled={avatarUploading || saving}
                          onClick={() => void removeGroupPhoto()}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          data-testid="group-photo-remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {avatarFileId ? 'Photo set by admins' : 'No photo yet — initials are shown'}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    JPG, PNG, WEBP, AVIF · max 10 MB · square crop recommended
                  </p>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.target.value = '';
                    void uploadGroupPhoto(f);
                  }}
                />
              </div>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Group name"
                disabled={!canManage || saving}
                data-testid="group-title-input"
              />
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[72px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="What is this group for?"
                disabled={!canManage || saving}
              />
              {canManage ? (
                <>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    disabled={saving}
                  >
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public</option>
                    <option value="SECRET">Secret</option>
                    <option value="UNLISTED">Unlisted</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveMeta()}
                    disabled={saving}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Save group info
                  </button>
                </>
              ) : null}

              {currentUserId ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <Bell className="h-4 w-4" /> My notifications
                  </h3>
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
                </div>
              ) : null}

              {pins.length ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <h3 className="text-sm font-semibold text-slate-900">Pinned ({pins.length})</h3>
                  <ul className="space-y-1">
                    {pins.slice(0, 8).map((p: any) => (
                      <li
                        key={p.id || p.messageId}
                        className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
                      >
                        {String(p?.message?.text || p.messageId || 'Pinned message').slice(0, 120)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'members' ? (
            <section className="space-y-2" data-testid="group-tab-panel-members">
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
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                          {m.name}
                          {m.isOnline ? (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          ) : null}
                        </div>
                        {m.username ? (
                          <div className="truncate text-xs text-slate-500">@{m.username}</div>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
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
              {canManage ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <UserPlus className="h-4 w-4" /> Add member
                  </h3>
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor="group-add-member-identifier">
                      Username, email, or user ID
                    </label>
                    <input
                      id="group-add-member-identifier"
                      value={addIdentifier}
                      onChange={(e) => setAddIdentifier(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void resolveMemberIdentifier();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Search by username, email, or user ID"
                      data-testid="group-add-member-input"
                      aria-describedby="group-add-member-status"
                    />
                    <button
                      type="button"
                      onClick={() => void (resolvedMember ? addMember() : resolveMemberIdentifier())}
                      disabled={saving || memberResolveBusy || !addIdentifier.trim()}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {resolvedMember ? 'Add' : memberResolveBusy ? 'Search' : 'Find'}
                    </button>
                  </div>
                  <div id="group-add-member-status" className="sr-only" aria-live="polite">
                    {memberResolveBusy ? 'Searching for member' : memberAddResult || ''}
                  </div>
                  {memberSuggestions.length > 0 && !resolvedMember ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2" role="listbox">
                      {memberSuggestions.slice(0, 5).map((candidate) => (
                        <button
                          key={candidate.userId}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white"
                          onClick={() => {
                            setAddIdentifier(candidate.username ? `@${candidate.username}` : candidate.userId);
                            setResolvedMember(candidate);
                          }}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                            {String(candidate.displayName || candidate.username || 'S').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-900">{candidate.displayName}</span>
                            {candidate.username ? (
                              <span className="block truncate text-xs text-slate-500">@{candidate.username}</span>
                            ) : null}
                          </span>
                          <span className="text-[10px] font-semibold uppercase text-slate-400">
                            {String(candidate.membershipStatus || 'NOT_MEMBER').replace(/_/g, ' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {resolvedMember ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                          {String(resolvedMember.displayName || resolvedMember.username || 'S').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {resolvedMember.displayName || 'Scrolith member'}
                          </div>
                          {resolvedMember.username ? (
                            <div className="truncate text-xs text-slate-600">@{resolvedMember.username}</div>
                          ) : null}
                          <div className="mt-1 text-[11px] text-slate-500">
                            Matched by: {String(resolvedMember.matchedBy || 'identifier').replace(/_/g, ' ')}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Status: {String(resolvedMember.membershipStatus || 'NOT_MEMBER').replace(/_/g, ' ').toLowerCase()}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          onClick={() => setResolvedMember(null)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          onClick={() => void addMember()}
                          disabled={saving || String(resolvedMember.membershipStatus || '').toUpperCase() !== 'NOT_MEMBER'}
                        >
                          Add member
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {memberAddResult ? (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {memberAddResult}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'invites' ? (
            <section className="space-y-3" data-testid="group-tab-panel-invites">
              {canManage ? (
                <>
                  <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <Link2 className="h-4 w-4" /> Invite links
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void createInvite()}
                      disabled={saving}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      data-testid="group-create-invite"
                    >
                      Generate invite
                    </button>
                    <button
                      type="button"
                      onClick={() => void createInvite({ oneTime: true, maxUses: 1 })}
                      disabled={saving}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      One-time invite
                    </button>
                  </div>
                  {inviteCode ? (
                    <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-700">
                      <div>
                        Code: <span className="font-mono font-semibold">{inviteCode}</span>
                      </div>
                      {inviteLink ? <div className="break-all">Path: {inviteLink}</div> : null}
                      {inviteMeta?.expiresAt ? <div>Expires: {inviteMeta.expiresAt}</div> : null}
                      {inviteMeta?.maxUses != null ? (
                        <div>
                          Uses: {inviteMeta.useCount || 0}/{inviteMeta.maxUses}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void copyInvite()}
                          className="rounded-lg bg-white px-2 py-1 font-semibold shadow-sm"
                        >
                          Copy link
                        </button>
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <QrCode className="h-3.5 w-3.5" /> QR via join path
                        </span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">Only admins can manage invites.</p>
              )}
            </section>
          ) : null}

          {tab === 'requests' ? (
            <section className="space-y-2" data-testid="group-tab-panel-requests">
              <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                <UserCheck className="h-4 w-4" /> Join requests
              </h3>
              {!canManage ? (
                <p className="text-sm text-slate-500">Only approvers can review requests.</p>
              ) : joinRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No pending requests.</p>
              ) : (
                <ul className="space-y-2">
                  {joinRequests.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-medium text-slate-900">{r.userId}</div>
                        <div className="text-xs text-slate-500">Pending</div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => void decideRequest(r.id, 'approve')}
                        disabled={saving}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                        onClick={() => void decideRequest(r.id, 'reject')}
                        disabled={saving}
                      >
                        Reject
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === 'restrictions' ? (
            <section className="space-y-3" data-testid="group-tab-panel-restrictions">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Messaging mode
                </span>
                <select
                  value={messagingMode}
                  onChange={(e) => setMessagingMode(e.target.value)}
                  disabled={!canManage || saving}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="ADMINS_ONLY">Admins only</option>
                  <option value="MODS_PLUS">Mods + admins</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="READ_ONLY">Read only</option>
                  <option value="LOCKED">Locked</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Slow mode (seconds)
                </span>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={slowModeSeconds}
                  onChange={(e) => setSlowModeSeconds(Number(e.target.value) || 0)}
                  disabled={!canManage || saving}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void saveMeta()}
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Apply modes
                </button>
              ) : null}
              {groupProfile?.content ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Content: images {groupProfile.content.allowImages === false ? 'off' : 'on'}, files{' '}
                  {groupProfile.content.allowFiles === false ? 'off' : 'on'}, voice{' '}
                  {groupProfile.content.allowVoice === false ? 'off' : 'on'}
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'danger' ? (
            <section className="space-y-3" data-testid="group-tab-panel-danger">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Lockdown immediately blocks sends for all members. DMs are unaffected.
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void lockOrUnlock(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" /> Lock group
                  </button>
                  <button
                    type="button"
                    onClick={() => void lockOrUnlock(false)}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    Unlock
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Only owners/admins can lock the group.</p>
              )}
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="mb-1 flex items-center gap-1 font-semibold text-slate-800">
                  <Shield className="h-3.5 w-3.5" /> Roles
                </div>
                <p>
                  <Crown className="mr-1 inline h-3 w-3 text-amber-600" />
                  Owner controls ownership; Admins manage members and invites; Moderators help keep
                  discussions healthy; Members participate.
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
};

export default GroupManagePanel;
