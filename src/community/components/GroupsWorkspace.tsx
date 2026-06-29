import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Globe,
  ImageIcon,
  Lock,
  MessageSquare,
  Plus,
  Upload,
  Users,
  Video
} from 'lucide-react';
import { CommunityService } from '../../services/community';
import type { CommunityClub, GroupFaqItem, GroupJoinRequestSummary, GroupMemberSummary, UploadedFile } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import FilePickerModal from '../../dashboard/shared/FilePickerModal';

type GroupsWorkspaceProps = {
  embedded?: boolean;
};

type GroupFormState = {
  name: string;
  slug: string;
  summary: string;
  description: string;
  visibility: 'public' | 'private';
  category: string;
  location: string;
  joinMode: 'open' | 'request' | 'invite_only';
  postPermission: 'admins' | 'members' | 'everyone';
  membersCanInvite: boolean;
  postingGuidelines: string;
  faqs: GroupFaqItem[];
  coverImage: string;
  avatarImage: string;
};

const emptyGroupForm = (): GroupFormState => ({
  name: '',
  slug: '',
  summary: '',
  description: '',
  visibility: 'public',
  category: '',
  location: '',
  joinMode: 'open',
  postPermission: 'members',
  membersCanInvite: true,
  postingGuidelines: '',
  faqs: [{ question: '', answer: '' }],
  coverImage: '',
  avatarImage: ''
});

const toSlug = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const mediaKind = (url: string) => {
  const normalized = String(url || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(normalized)) return 'video';
  return 'image';
};

const GroupsWorkspace: React.FC<GroupsWorkspaceProps> = ({ embedded = false }) => {
  const { showNotification } = useNotification();
  const { user } = useUser();
  const [groups, setGroups] = useState<CommunityClub[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CommunityClub | null>(null);
  const [groupPosts, setGroupPosts] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm);
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postUploads, setPostUploads] = useState<UploadedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerTarget, setFilePickerTarget] = useState<'post' | 'cover' | 'avatar'>('post');

  const activeRole = String(user?.role || '').toLowerCase();

  const reloadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CommunityService.getClubs();
      setGroups(data);
      setSelectedGroupId((current) => current || data[0]?.id || '');
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to load groups right now.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const reloadSelectedGroup = useCallback(async (groupId: string) => {
    const id = String(groupId || '').trim();
    if (!id) {
      setSelectedGroup(null);
      setGroupPosts([]);
      setJoinRequests([]);
      return;
    }

    setDetailsLoading(true);
    try {
      const [group, posts] = await Promise.all([
        CommunityService.getClubById(id),
        CommunityService.getPosts({ clubId: id, status: 'active', limit: 50 })
      ]);
      setSelectedGroup(group);
      setGroupPosts(Array.isArray(posts) ? posts : []);
      const canManage = ['owner', 'moderator'].includes(String(group?.membershipRole || '').toLowerCase()) || activeRole === 'admin';
      if (group && canManage) {
        const requests = await CommunityService.getClubJoinRequests(group.id);
        setJoinRequests(requests);
      } else {
        setJoinRequests([]);
      }
    } catch (error: any) {
      showNotification('error', 'Group', error?.message || 'Unable to load this group.');
    } finally {
      setDetailsLoading(false);
    }
  }, [activeRole, showNotification]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  useEffect(() => {
    void reloadSelectedGroup(selectedGroupId);
  }, [reloadSelectedGroup, selectedGroupId]);

  useEffect(() => {
    const refresh = () => {
      void reloadGroups();
      if (selectedGroupId) void reloadSelectedGroup(selectedGroupId);
    };
    window.addEventListener('community:group_created', refresh as EventListener);
    window.addEventListener('community:group_updated', refresh as EventListener);
    window.addEventListener('community:group_deleted', refresh as EventListener);
    window.addEventListener('community:group_member_updated', refresh as EventListener);
    window.addEventListener('community:group_request_updated', refresh as EventListener);
    window.addEventListener('community:post_created', refresh as EventListener);
    return () => {
      window.removeEventListener('community:group_created', refresh as EventListener);
      window.removeEventListener('community:group_updated', refresh as EventListener);
      window.removeEventListener('community:group_deleted', refresh as EventListener);
      window.removeEventListener('community:group_member_updated', refresh as EventListener);
      window.removeEventListener('community:group_request_updated', refresh as EventListener);
      window.removeEventListener('community:post_created', refresh as EventListener);
    };
  }, [reloadGroups, reloadSelectedGroup, selectedGroupId]);

  const canManageSelectedGroup = useMemo(() => {
    const role = String(selectedGroup?.membershipRole || '').toLowerCase();
    return activeRole === 'admin' || role === 'owner' || role === 'moderator';
  }, [activeRole, selectedGroup?.membershipRole]);

  const canPostInSelectedGroup = useMemo(() => {
    if (!selectedGroup) return false;
    if (canManageSelectedGroup) return true;
    const permission = String(selectedGroup.postPermission || 'members').toLowerCase();
    const joined = Boolean(selectedGroup.isJoined);
    if (permission === 'everyone') return true;
    if (permission === 'members') return joined;
    return false;
  }, [canManageSelectedGroup, selectedGroup]);

  const selectedPostMediaSummary = useMemo(() => {
    const imageCount = postUploads.filter((file) => String(file.type || '').toLowerCase() !== 'video').length;
    const videoCount = postUploads.filter((file) => String(file.type || '').toLowerCase() === 'video').length;
    return { imageCount, videoCount, total: postUploads.length };
  }, [postUploads]);

  const applyGroupToForm = (group?: CommunityClub | null) => {
    if (!group) {
      setGroupForm(emptyGroupForm());
      setEditingGroupId(null);
      return;
    }
    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name || '',
      slug: group.slug || '',
      summary: group.summary || '',
      description: group.description || '',
      visibility: group.visibility === 'private' ? 'private' : 'public',
      category: group.category || '',
      location: group.location || '',
      joinMode: (group.joinMode || 'open') as GroupFormState['joinMode'],
      postPermission: (group.postPermission || 'members') as GroupFormState['postPermission'],
      membersCanInvite: group.membersCanInvite !== false,
      postingGuidelines: group.postingGuidelines || '',
      faqs: Array.isArray(group.faqs) && group.faqs.length ? group.faqs : [{ question: '', answer: '' }],
      coverImage: group.coverImage || '',
      avatarImage: group.avatarImage || ''
    });
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim() || !groupForm.description.trim()) {
      showNotification('error', 'Groups', 'Group name and description are required.');
      return;
    }

    setSavingGroup(true);
    try {
      const payload = {
        ...groupForm,
        slug: toSlug(groupForm.slug || groupForm.name),
        faqs: groupForm.faqs.filter((entry) => entry.question.trim() && entry.answer.trim())
      };
      const saved = editingGroupId
        ? await CommunityService.updateClub(editingGroupId, payload)
        : await CommunityService.createClub(payload);
      showNotification('success', 'Groups', editingGroupId ? 'Group updated.' : 'Group created.');
      setShowComposer(false);
      applyGroupToForm(null);
      await reloadGroups();
      setSelectedGroupId(saved.id);
      await reloadSelectedGroup(saved.id);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to save this group.');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleJoinOrRequest = async (group: CommunityClub) => {
    try {
      const joinMode = String(group.joinMode || 'open').toLowerCase();
      const isPrivate = group.visibility === 'private';
      if (joinMode === 'request' || isPrivate) {
        const response = await CommunityService.requestToJoinClub(group.id);
        if (response.pending) {
          showNotification('success', 'Join request sent', `Your request to join ${group.name} is awaiting review.`);
        }
      } else {
        await CommunityService.joinClub(group.id);
        showNotification('success', 'Joined', `You joined ${group.name}.`);
      }
      await reloadGroups();
      await reloadSelectedGroup(group.id);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to join this group.');
    }
  };

  const handleLeaveGroup = async (group: CommunityClub) => {
    try {
      await CommunityService.leaveClub(group.id);
      showNotification('success', 'Membership updated', `You left ${group.name}.`);
      await reloadGroups();
      await reloadSelectedGroup(group.id);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to leave this group.');
    }
  };

  const handleRespondRequest = async (request: GroupJoinRequestSummary, decision: 'approve' | 'reject') => {
    if (!selectedGroup) return;
    try {
      await CommunityService.respondToClubJoinRequest(selectedGroup.id, request.id, { decision });
      showNotification('success', 'Request updated', `Join request ${decision}d.`);
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to update this request.');
    }
  };

  const handleUpdateMember = async (member: GroupMemberSummary, payload: { action?: 'remove'; role?: 'member' | 'moderator' }) => {
    if (!selectedGroup) return;
    try {
      await CommunityService.updateClubMember(selectedGroup.id, member.userId, payload);
      showNotification('success', 'Members', payload.action === 'remove' ? 'Member removed.' : 'Member role updated.');
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Members', error?.message || 'Unable to update this member.');
    }
  };

  const handleSubmitGroupPost = async () => {
    if (!selectedGroup) return;
    if (!postTitle.trim() && !postBody.trim() && postUploads.length === 0) {
      showNotification('error', 'Group posts', 'Add text or media before posting.');
      return;
    }
    setSubmittingPost(true);
    try {
      await CommunityService.createPost({
        title: postTitle.trim(),
        content: postBody.trim(),
        attachmentFileIds: postUploads.map((file) => String(file.id || '')).filter(Boolean),
        clubId: selectedGroup.id
      });
      setPostTitle('');
      setPostBody('');
      setPostUploads([]);
      showNotification('success', 'Group posts', 'Post shared with the group.');
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Group posts', error?.message || 'Unable to publish this group post.');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleFileSelection = (files: UploadedFile[]) => {
    const nextFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!nextFiles.length) return;
    if (filePickerTarget === 'post') {
      setPostUploads((current) => [...current, ...nextFiles]);
      return;
    }
    const selectedFile = nextFiles[0];
    if (!selectedFile?.url) return;
    if (filePickerTarget === 'cover') {
      setGroupForm((current) => ({ ...current, coverImage: selectedFile.url }));
      return;
    }
    setGroupForm((current) => ({ ...current, avatarImage: selectedFile.url }));
  };

  const selectedGroupRequests = joinRequests.filter((entry) => String(entry.status || '').toLowerCase() === 'pending');

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 rounded-[32px] bg-white/90 p-4 shadow-sm sm:p-6'}>
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#2563eb_100%)] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-100">Scrolith Groups</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Build private and public professional communities.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.25em] text-blue-100">Visible groups</div>
              <div className="mt-1 text-2xl font-semibold text-white">{groups.length}</div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.25em] text-blue-100">Joined</div>
              <div className="mt-1 text-2xl font-semibold text-white">{groups.filter((group) => group.isJoined).length}</div>
            </div>
            <button
              onClick={() => {
                applyGroupToForm(null);
                setShowComposer(true);
              }}
              className="inline-flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create group
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Your group spaces</h3>
              <button
                onClick={() => void reloadGroups()}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
                ))
              ) : groups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                  No groups yet. Create the first one from here.
                </div>
              ) : (
                groups.map((group) => {
                  const active = selectedGroupId === group.id;
                  const isPrivate = group.visibility === 'private';
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {isPrivate ? <Lock className="h-4 w-4 text-slate-500" /> : <Globe className="h-4 w-4 text-slate-500" />}
                            <span className="truncate text-base font-semibold text-slate-900">{group.name}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{group.summary || group.description}</p>
                        </div>
                        {group.isJoined ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Joined</span>
                        ) : group.pendingRequest ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Pending</span>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{group.memberCount || 0} members</span>
                        {group.category ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{group.category}</span> : null}
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{group.joinMode || 'open'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedGroup ? (
            <>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="relative h-44 bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_45%,#bfdbfe_100%)]">
                  {selectedGroup.coverImage ? (
                    <img src={selectedGroup.coverImage} alt={selectedGroup.name} className="h-full w-full object-cover" />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="flex items-end gap-4">
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/20 bg-white/15 shadow-lg backdrop-blur">
                          {selectedGroup.avatarImage ? (
                            <img src={selectedGroup.avatarImage} alt={selectedGroup.name} className="h-full w-full object-cover" />
                          ) : (
                            <Users className="h-8 w-8 text-white" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl font-bold text-white">{selectedGroup.name}</h3>
                            {selectedGroup.visibility === 'private' ? <Lock className="h-4 w-4 text-white/90" /> : <Globe className="h-4 w-4 text-white/90" />}
                          </div>
                          <p className="mt-1 text-sm text-slate-200">{selectedGroup.summary || selectedGroup.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedGroup.isJoined ? (
                          <button
                            onClick={() => void handleLeaveGroup(selectedGroup)}
                            className="rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
                          >
                            Leave group
                          </button>
                        ) : selectedGroup.pendingRequest ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                            Join request pending
                          </div>
                        ) : (
                          <button
                            onClick={() => void handleJoinOrRequest(selectedGroup)}
                            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                          >
                            {selectedGroup.visibility === 'private' || selectedGroup.joinMode === 'request' ? 'Request to join' : 'Join group'}
                          </button>
                        )}
                        {canManageSelectedGroup ? (
                          <button
                            onClick={() => {
                              applyGroupToForm(selectedGroup);
                              setShowComposer(true);
                            }}
                            className="rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
                          >
                            Manage group
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr),360px]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Members</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">{selectedGroup.memberCount || 0}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Join mode</p>
                        <p className="mt-1 text-base font-semibold capitalize text-slate-900">{String(selectedGroup.joinMode || 'open').replace('_', ' ')}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Posting</p>
                        <p className="mt-1 text-base font-semibold capitalize text-slate-900">{selectedGroup.postPermission || 'members'}</p>
                      </div>
                    </div>

                    {canPostInSelectedGroup ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-lg font-semibold text-slate-900">Post to group</h4>
                          <button
                            onClick={() => {
                              setFilePickerTarget('post');
                              setShowFilePicker(true);
                            }}
                            className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                          >
                            <Upload className="mr-2 h-3.5 w-3.5" />
                            Add media
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          <input
                            value={postTitle}
                            onChange={(event) => setPostTitle(event.target.value)}
                            placeholder="Post title (optional)"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                          />
                          <textarea
                            value={postBody}
                            onChange={(event) => setPostBody(event.target.value)}
                            placeholder="Share an update, question, image set, or video with this group..."
                            className="h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                          />
                          {selectedPostMediaSummary.total ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                              <span>{selectedPostMediaSummary.total} file(s) attached</span>
                              {selectedPostMediaSummary.imageCount ? <span>{selectedPostMediaSummary.imageCount} image(s)</span> : null}
                              {selectedPostMediaSummary.videoCount ? <span>{selectedPostMediaSummary.videoCount} video(s)</span> : null}
                            </div>
                          ) : null}
                          {postUploads.length ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                              {postUploads.map((file) => (
                                <div key={file.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                  <div className="aspect-[4/3] bg-slate-100">
                                    {String(file.type || '').toLowerCase() === 'video' ? (
                                      <video src={file.url} className="h-full w-full object-cover" controls />
                                    ) : (
                                      <img src={file.url} alt={file.name || 'Upload'} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-500">
                                    <div className="min-w-0">
                                      <span className="block truncate">{file.name || 'Uploaded media'}</span>
                                      <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                        {String(file.type || '').toLowerCase() === 'video' ? 'Video' : 'Image'}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => setPostUploads((current) => current.filter((entry) => entry.id !== file.id))}
                                      className="font-semibold text-rose-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex justify-end">
                            <button
                              onClick={() => void handleSubmitGroupPost()}
                              disabled={submittingPost}
                              className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                            >
                              {submittingPost ? 'Posting...' : 'Publish to group'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-slate-900">Group posts</h4>
                        <span className="text-sm text-slate-500">{groupPosts.length} items</span>
                      </div>
                      {detailsLoading ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">Loading group details...</div>
                      ) : groupPosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
                          No group posts yet. Start the conversation with a text, image, or video post.
                        </div>
                      ) : (
                        groupPosts.map((post) => {
                          const attachments = Array.isArray(post?.attachments) ? post.attachments : [];
                          return (
                            <article key={post.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h5 className="text-lg font-semibold text-slate-900">{post.title || 'Group update'}</h5>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {post.author?.displayName || post.authorName || post.userName || 'Community member'} · {new Date(post.createdAt || Date.now()).toLocaleString()}
                                  </p>
                                </div>
                                <Link
                                  to={`/community/posts/${encodeURIComponent(post.id)}`}
                                  className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Open
                                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                </Link>
                              </div>
                              {post.content ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{post.content}</p> : null}
                              {attachments.length ? (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  {attachments.map((attachment: any, index: number) => (
                                    <div key={`${post.id}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                      <div className="aspect-[4/3]">
                                        {mediaKind(String(attachment?.url || '')) === 'video' ? (
                                          <video src={attachment?.url} controls className="h-full w-full object-cover" />
                                        ) : (
                                          <img src={attachment?.url} alt={attachment?.name || 'Attachment'} className="h-full w-full object-cover" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-lg font-semibold text-slate-900">About this group</h4>
                      <div className="mt-4 space-y-3 text-sm text-slate-600">
                        <p>{selectedGroup.description}</p>
                        {selectedGroup.location ? <p><strong className="text-slate-900">Location:</strong> {selectedGroup.location}</p> : null}
                        {selectedGroup.category ? <p><strong className="text-slate-900">Category:</strong> {selectedGroup.category}</p> : null}
                        <p><strong className="text-slate-900">Who can join:</strong> {String(selectedGroup.joinMode || 'open').replace('_', ' ')}</p>
                        <p><strong className="text-slate-900">Who can post:</strong> {selectedGroup.postPermission || 'members'}</p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-lg font-semibold text-slate-900">What to post</h4>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {selectedGroup.postingGuidelines || 'Share relevant questions, project updates, visuals, videos, or opportunities that fit this group’s purpose.'}
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-lg font-semibold text-slate-900">FAQs</h4>
                      <div className="mt-3 space-y-3">
                        {(selectedGroup.faqs || []).length ? (
                          (selectedGroup.faqs || []).map((faq, index) => (
                            <div key={`${faq.question}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="font-semibold text-slate-900">{faq.question}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">{faq.answer}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">No FAQs configured yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-slate-900">Members</h4>
                        <span className="text-sm text-slate-500">{selectedGroup.members?.length || 0} shown</span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {(selectedGroup.members || []).map((member) => (
                          <div key={member.userId} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                                {member.user?.avatar ? (
                                  <img src={member.user.avatar} alt={member.user.name} className="h-full w-full object-cover" />
                                ) : (
                                  <Users className="h-5 w-5 text-slate-500" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{member.user?.name || 'Community member'}</p>
                                <p className="text-xs uppercase tracking-wide text-slate-500">{member.role}</p>
                              </div>
                            </div>
                            {canManageSelectedGroup && member.role !== 'owner' ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void handleUpdateMember(member, { role: member.role === 'moderator' ? 'member' : 'moderator' })}
                                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  {member.role === 'moderator' ? 'Make member' : 'Make moderator'}
                                </button>
                                <button
                                  onClick={() => void handleUpdateMember(member, { action: 'remove' })}
                                  className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    {canManageSelectedGroup ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold text-slate-900">Join requests</h4>
                          <span className="text-sm text-slate-500">{selectedGroupRequests.length} pending</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {selectedGroupRequests.length ? (
                            selectedGroupRequests.map((request) => (
                              <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-900">{request.user?.name || 'Community member'}</p>
                                    <p className="text-xs text-slate-500">{new Date(request.requestedAt || request.requested_at || Date.now()).toLocaleString()}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => void handleRespondRequest(request, 'approve')}
                                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => void handleRespondRequest(request, 'reject')}
                                      className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No pending requests right now.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
              <Users className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-4 text-xl font-semibold text-slate-900">Select a group workspace</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Choose a group from the left to review details, join requests, members, and posts, or create a new one to start building a professional community.
              </p>
            </div>
          )}
        </div>
      </section>

      {showComposer ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{editingGroupId ? 'Edit group' : 'Create a new group'}</h3>
              <p className="mt-1 text-sm text-slate-500">Define who can join, who can post, what members should share, and the group’s public or private posture.</p>
            </div>
            <button
              onClick={() => {
                setShowComposer(false);
                applyGroupToForm(null);
              }}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.15fr),320px]">
            <div className="grid gap-4 lg:grid-cols-2">
              <input
                value={groupForm.name}
                onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value, slug: current.slug || toSlug(event.target.value) }))}
                placeholder="Group name"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={groupForm.slug}
                onChange={(event) => setGroupForm((current) => ({ ...current, slug: toSlug(event.target.value) }))}
                placeholder="Group address"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={groupForm.summary}
                onChange={(event) => setGroupForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Short summary"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 lg:col-span-2"
              />
              <textarea
                value={groupForm.description}
                onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Describe the group purpose, audience, and value."
                className="h-32 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 lg:col-span-2"
              />
              <select
                value={groupForm.visibility}
                onChange={(event) => setGroupForm((current) => ({ ...current, visibility: event.target.value as GroupFormState['visibility'] }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="public">Public group</option>
                <option value="private">Private group</option>
              </select>
              <select
                value={groupForm.joinMode}
                onChange={(event) => setGroupForm((current) => ({ ...current, joinMode: event.target.value as GroupFormState['joinMode'] }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="open">Open join</option>
                <option value="request">Request approval</option>
                <option value="invite_only">Invite only</option>
              </select>
              <select
                value={groupForm.postPermission}
                onChange={(event) => setGroupForm((current) => ({ ...current, postPermission: event.target.value as GroupFormState['postPermission'] }))}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="members">Members can post</option>
                <option value="admins">Only admins and moderators can post</option>
                <option value="everyone">Anyone who can view can post</option>
              </select>
              <input
                value={groupForm.category}
                onChange={(event) => setGroupForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="Category"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={groupForm.location}
                onChange={(event) => setGroupForm((current) => ({ ...current, location: event.target.value }))}
                placeholder="Location"
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Branding and identity</h4>
                    <p className="text-xs text-slate-500">Add a cover and avatar so the group looks complete in feeds, invites, and discovery.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setFilePickerTarget('cover');
                        setShowFilePicker(true);
                      }}
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <ImageIcon className="mr-2 h-3.5 w-3.5" />
                      Select cover
                    </button>
                    <button
                      onClick={() => {
                        setFilePickerTarget('avatar');
                        setShowFilePicker(true);
                      }}
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Users className="mr-2 h-3.5 w-3.5" />
                      Select avatar
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="space-y-2">
                    <input
                      value={groupForm.coverImage}
                      onChange={(event) => setGroupForm((current) => ({ ...current, coverImage: event.target.value }))}
                      placeholder="Cover image URL"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-900">
                      {groupForm.coverImage ? (
                        <img src={groupForm.coverImage} alt="Group cover preview" className="h-36 w-full object-cover" />
                      ) : (
                        <div className="flex h-36 items-center justify-center text-sm font-medium text-slate-300">Cover preview</div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <input
                      value={groupForm.avatarImage}
                      onChange={(event) => setGroupForm((current) => ({ ...current, avatarImage: event.target.value }))}
                      placeholder="Avatar image URL"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {groupForm.avatarImage ? (
                          <img src={groupForm.avatarImage} alt="Group avatar preview" className="h-full w-full object-cover" />
                        ) : (
                          <Users className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{groupForm.name || 'Your group name'}</p>
                        <p className="truncate text-xs text-slate-500">{groupForm.summary || 'Short summary preview'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={groupForm.membersCanInvite}
                  onChange={(event) => setGroupForm((current) => ({ ...current, membersCanInvite: event.target.checked }))}
                />
                Allow members to invite others
              </label>
              <textarea
                value={groupForm.postingGuidelines}
                onChange={(event) => setGroupForm((current) => ({ ...current, postingGuidelines: event.target.value }))}
                placeholder="What should members post here?"
                className="h-28 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 lg:col-span-2"
              />
              <div className="space-y-3 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">FAQs</h4>
                  <button
                    onClick={() => setGroupForm((current) => ({ ...current, faqs: [...current.faqs, { question: '', answer: '' }] }))}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Add FAQ
                  </button>
                </div>
                {groupForm.faqs.map((faq, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[1fr,1.4fr,auto]">
                    <input
                      value={faq.question}
                      onChange={(event) =>
                        setGroupForm((current) => ({
                          ...current,
                          faqs: current.faqs.map((entry, entryIndex) => (entryIndex === index ? { ...entry, question: event.target.value } : entry))
                        }))
                      }
                      placeholder="Question"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <input
                      value={faq.answer}
                      onChange={(event) =>
                        setGroupForm((current) => ({
                          ...current,
                          faqs: current.faqs.map((entry, entryIndex) => (entryIndex === index ? { ...entry, answer: event.target.value } : entry))
                        }))
                      }
                      placeholder="Answer"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() =>
                        setGroupForm((current) => ({
                          ...current,
                          faqs: current.faqs.filter((_, entryIndex) => entryIndex !== index)
                        }))
                      }
                      className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <aside className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Creation preview</p>
              <div className="mt-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="relative h-32 bg-slate-900">
                  {groupForm.coverImage ? <img src={groupForm.coverImage} alt="Group cover" className="h-full w-full object-cover" /> : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/15 backdrop-blur">
                      {groupForm.avatarImage ? (
                        <img src={groupForm.avatarImage} alt="Group avatar" className="h-full w-full object-cover" />
                      ) : (
                        <Users className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{groupForm.name || 'Your group name'}</p>
                      <p className="truncate text-xs text-slate-200">{groupForm.summary || 'Short summary shown in invites and discovery.'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-4 text-sm text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{groupForm.visibility === 'private' ? 'Private' : 'Public'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{String(groupForm.joinMode || 'open').replace('_', ' ')}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{groupForm.postPermission || 'members'} posting</span>
                  </div>
                  <p>{groupForm.description || 'Describe the group purpose, audience, and value so members know why they should join.'}</p>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {groupForm.location || 'Remote'} {groupForm.category ? `· ${groupForm.category}` : ''}
                  </div>
                </div>
              </div>
            </aside>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={() => void handleSaveGroup()}
              disabled={savingGroup}
              className="inline-flex items-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            >
              <Check className="mr-2 h-4 w-4" />
              {savingGroup ? 'Saving...' : editingGroupId ? 'Save group changes' : 'Create group'}
            </button>
          </div>
        </section>
      ) : null}

      <FilePickerModal
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={(file) => handleFileSelection([file])}
        onSelectMultiple={(files) => handleFileSelection(files)}
        allowUpload
        allowCamera
        multiple={filePickerTarget === 'post'}
        filterType={filePickerTarget === 'post' ? 'all' : 'image'}
        acceptedTypes={filePickerTarget === 'post' ? ['image', 'video'] : ['image']}
        title={filePickerTarget === 'post' ? 'Select group media' : filePickerTarget === 'cover' ? 'Select group cover' : 'Select group avatar'}
        role={user?.role}
        visibility="public"
      />
    </div>
  );
};

export default GroupsWorkspace;
