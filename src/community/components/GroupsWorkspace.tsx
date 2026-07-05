import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Expand,
  FileImage,
  Globe,
  GripVertical,
  ImageIcon,
  Inbox,
  Lock,
  MessageSquare,
  Plus,
  Search,
  UserPlus,
  Upload,
  Users,
  Video,
  X
} from 'lucide-react';
import { CommunityService } from '../../services/community';
import type {
  CommunityClub,
  CommunityGroupsConfig,
  GroupFaqItem,
  GroupInviteSummary,
  GroupJoinRequestSummary,
  GroupMemberSummary,
  UploadedFile
} from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import FilePickerModal from '../../dashboard/shared/FilePickerModal';
import MobileDialog, { MobileDialogFooter } from '../../components/mobile/MobileDialog';

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

type GroupMediaLightboxState = {
  postId: string;
  index: number;
} | null;

type GroupLiveOpsState = {
  event: string;
  label: string;
  at: number;
} | null;

const defaultGroupsDisplayConfig: CommunityGroupsConfig = {
  heroEyebrow: 'Scrolith Groups',
  heroTitle: 'Build private and public professional communities.',
  heroSubtitle:
    'Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.',
  createButtonLabel: 'Create group',
  directoryTitle: 'Your group spaces',
  directoryEmptyState: 'No groups yet. Create the first one from here.',
  allowUserGroupCreation: true,
  showDiscoveryStats: true,
  defaultVisibility: 'public',
  defaultJoinMode: 'open',
  defaultPostPermission: 'members',
  allowMemberInvitesByDefault: true,
  showInviteInbox: true,
  showMemberDirectory: true,
  highlightPostComposer: true
};

const emptyGroupForm = (config: CommunityGroupsConfig = defaultGroupsDisplayConfig): GroupFormState => ({
  name: '',
  slug: '',
  summary: '',
  description: '',
  visibility: config.defaultVisibility === 'private' ? 'private' : 'public',
  category: '',
  location: '',
  joinMode:
    config.defaultJoinMode === 'request' || config.defaultJoinMode === 'invite_only'
      ? config.defaultJoinMode
      : 'open',
  postPermission:
    config.defaultPostPermission === 'admins' || config.defaultPostPermission === 'everyone'
      ? config.defaultPostPermission
      : 'members',
  membersCanInvite: config.allowMemberInvitesByDefault !== false,
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

const defaultBulkReviewNoteTemplates = [
  {
    label: 'Approve note',
    value: 'Approved. Your profile and request are a strong fit for this group.'
  },
  {
    label: 'Decline note',
    value: 'Declined for now. Please review the group guidelines and request again with more detail.'
  },
  {
    label: 'Posting reminder',
    value: 'Please keep posts relevant to the group scope and professional standards.'
  }
];

const GroupsWorkspace: React.FC<GroupsWorkspaceProps> = ({ embedded = false }) => {
  const { showNotification } = useNotification();
  const { user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const inviteInboxRef = useRef<HTMLDivElement | null>(null);
  const moderationPanelRef = useRef<HTMLDivElement | null>(null);
  const [groups, setGroups] = useState<CommunityClub[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CommunityClub | null>(null);
  const [groupPosts, setGroupPosts] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequestSummary[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInviteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(() => emptyGroupForm(defaultGroupsDisplayConfig));
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postUploads, setPostUploads] = useState<UploadedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerTarget, setFilePickerTarget] = useState<'post' | 'cover' | 'avatar'>('post');
  const [joinRequestDraft, setJoinRequestDraft] = useState({ note: '', answersText: '' });
  const [showJoinRequestComposer, setShowJoinRequestComposer] = useState(false);
  const [submittingJoinRequest, setSubmittingJoinRequest] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [moderationFilter, setModerationFilter] = useState<'pending' | 'history' | 'all'>('pending');
  const [moderationSearch, setModerationSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteSuggestions, setInviteSuggestions] = useState<any[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedInvitees, setSelectedInvitees] = useState<Array<{ id: string; name: string; username?: string; avatar?: string }>>([]);
  const [inviteNote, setInviteNote] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'moderator'>('member');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteInbox, setInviteInbox] = useState<GroupInviteSummary[]>([]);
  const [inviteScopeFilter, setInviteScopeFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [inviteStatusFilter, setInviteStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'declined' | 'cancelled'>('all');
  const [inviteInboxSearch, setInviteInboxSearch] = useState('');
  const [showAllReceivedInvites, setShowAllReceivedInvites] = useState(false);
  const [showAllSentInvites, setShowAllSentInvites] = useState(false);
  const [postPreviewIndex, setPostPreviewIndex] = useState<Record<string, number>>({});
  const [postUploadCaptions, setPostUploadCaptions] = useState<Record<string, string>>({});
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkReviewNote, setBulkReviewNote] = useState('');
  const [bulkReviewing, setBulkReviewing] = useState(false);
  const [groupMediaLightbox, setGroupMediaLightbox] = useState<GroupMediaLightboxState>(null);
  const [displayConfig, setDisplayConfig] = useState<CommunityGroupsConfig>(defaultGroupsDisplayConfig);
  const [liveOpsState, setLiveOpsState] = useState<GroupLiveOpsState>(null);

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
      setGroupInvites([]);
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
        const [requests, invites] = await Promise.all([
          CommunityService.getClubJoinRequests(group.id),
          CommunityService.getClubInvites(group.id)
        ]);
        setJoinRequests(requests);
        setGroupInvites(invites);
      } else {
        setJoinRequests([]);
        if (group) {
          const invites = await CommunityService.getClubInvites(group.id);
          setGroupInvites(invites);
        } else {
          setGroupInvites([]);
        }
      }
    } catch (error: any) {
      showNotification('error', 'Group', error?.message || 'Unable to load this group.');
    } finally {
      setDetailsLoading(false);
    }
  }, [activeRole, showNotification]);

  const reloadInviteInbox = useCallback(async () => {
    try {
      const data = await CommunityService.getMyClubInvites();
      setInviteInbox(Array.isArray(data) ? data : []);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to load your invite inbox.');
    }
  }, [showNotification]);

  const boostSelectedGroup = useCallback(() => {
    const groupId = String(selectedGroup?.id || '').trim();
    if (!groupId) {
      showNotification('warning', 'Groups', 'Select a group first.');
      return;
    }
    navigate(`/freelancer/dashboard?tab=my-ads&boostGroupId=${encodeURIComponent(groupId)}&boostOpen=1`);
  }, [navigate, selectedGroup?.id, showNotification]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  useEffect(() => {
    let cancelled = false;
    CommunityService.getClubDisplayConfig()
      .then((config) => {
        if (!cancelled && config) setDisplayConfig({ ...defaultGroupsDisplayConfig, ...config });
      })
      .catch(() => {
        if (!cancelled) setDisplayConfig(defaultGroupsDisplayConfig);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail;
      if (detail?.groups) {
        setDisplayConfig({ ...defaultGroupsDisplayConfig, ...detail.groups });
      }
    };
    window.addEventListener('community:admin_config_updated', handleConfigUpdate as EventListener);
    return () => window.removeEventListener('community:admin_config_updated', handleConfigUpdate as EventListener);
  }, []);

  useEffect(() => {
    void reloadInviteInbox();
  }, [reloadInviteInbox]);

  useEffect(() => {
    void reloadSelectedGroup(selectedGroupId);
  }, [reloadSelectedGroup, selectedGroupId]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const requestedGroup = String(search.get('group') || '')
      .trim()
      .toLowerCase();
    if (!requestedGroup || !groups.length) return;
    const matched = groups.find((group) => {
      const candidateId = String(group.id || '').trim().toLowerCase();
      const candidateSlug = String(group.slug || '').trim().toLowerCase();
      return requestedGroup === candidateId || requestedGroup === candidateSlug;
    });
    if (matched && matched.id !== selectedGroupId) {
      setSelectedGroupId(matched.id);
    }
  }, [groups, location.search, selectedGroupId]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const panel = String(search.get('panel') || '').trim().toLowerCase();
    const scope = String(search.get('inviteScope') || '').trim().toLowerCase();
    const status = String(search.get('inviteStatus') || '').trim().toLowerCase();
    const nextModerationFilter = String(search.get('moderationFilter') || '').trim().toLowerCase();
    setInviteScopeFilter(scope === 'received' || scope === 'sent' ? scope : 'all');
    setInviteStatusFilter(
      status === 'pending' || status === 'accepted' || status === 'declined' || status === 'cancelled' ? status : 'all'
    );
    if (panel === 'moderation') {
      setModerationFilter(
        nextModerationFilter === 'history' || nextModerationFilter === 'all' ? nextModerationFilter : 'pending'
      );
    }
  }, [location.search]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    if (String(search.get('panel') || '').trim().toLowerCase() !== 'invites') return;
    if (!selectedGroup?.id) return;
    const timer = window.setTimeout(() => {
      inviteInboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [location.search, selectedGroup?.id]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    if (String(search.get('panel') || '').trim().toLowerCase() !== 'moderation') return;
    if (!selectedGroup?.id) return;
    const timer = window.setTimeout(() => {
      moderationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [location.search, selectedGroup?.id]);

  useEffect(() => {
    setSelectedRequestIds([]);
    setBulkReviewNote('');
    setModerationSearch('');
  }, [selectedGroupId]);

  useEffect(() => {
    setLiveOpsState(null);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!groupMediaLightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGroupMediaLightbox(null);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const lightboxPost = groupPosts.find((entry) => entry.id === groupMediaLightbox.postId);
      const attachments = Array.isArray(lightboxPost?.attachments) ? lightboxPost.attachments : [];
      if (attachments.length < 2) return;
      setGroupMediaLightbox((current) => {
        if (!current) return current;
        const currentIndex = Math.max(0, Math.min(current.index, attachments.length - 1));
        return {
          ...current,
          index:
            event.key === 'ArrowLeft'
              ? currentIndex === 0
                ? attachments.length - 1
                : currentIndex - 1
              : currentIndex === attachments.length - 1
                ? 0
                : currentIndex + 1
        };
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [groupMediaLightbox, groupPosts]);

  useEffect(() => {
    const refresh = () => {
      void reloadGroups();
      void reloadInviteInbox();
      if (selectedGroupId) void reloadSelectedGroup(selectedGroupId);
    };
    const registerLiveOps = (eventName: string, label: string) => (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail;
      const eventClubId = String(detail?.clubId || detail?.group?.id || '').trim();
      if (!eventClubId || !selectedGroupId || eventClubId === selectedGroupId) {
        setLiveOpsState({ event: eventName, label, at: Date.now() });
      }
      refresh();
    };
    const onGroupCreated = registerLiveOps('community:group_created', 'A new group was created');
    const onGroupUpdated = registerLiveOps('community:group_updated', 'Group settings changed');
    const onGroupDeleted = registerLiveOps('community:group_deleted', 'A group was removed');
    const onGroupMemberUpdated = registerLiveOps('community:group_member_updated', 'Membership changed');
    const onGroupRequestUpdated = registerLiveOps('community:group_request_updated', 'Join request queue updated');
    const onGroupInviteUpdated = registerLiveOps('community:group_invite_updated', 'Invite inbox updated');
    const onPostCreated = registerLiveOps('community:post_created', 'A new group post was published');
    window.addEventListener('community:group_created', onGroupCreated as EventListener);
    window.addEventListener('community:group_updated', onGroupUpdated as EventListener);
    window.addEventListener('community:group_deleted', onGroupDeleted as EventListener);
    window.addEventListener('community:group_member_updated', onGroupMemberUpdated as EventListener);
    window.addEventListener('community:group_request_updated', onGroupRequestUpdated as EventListener);
    window.addEventListener('community:group_invite_updated', onGroupInviteUpdated as EventListener);
    window.addEventListener('community:post_created', onPostCreated as EventListener);
    return () => {
      window.removeEventListener('community:group_created', onGroupCreated as EventListener);
      window.removeEventListener('community:group_updated', onGroupUpdated as EventListener);
      window.removeEventListener('community:group_deleted', onGroupDeleted as EventListener);
      window.removeEventListener('community:group_member_updated', onGroupMemberUpdated as EventListener);
      window.removeEventListener('community:group_request_updated', onGroupRequestUpdated as EventListener);
      window.removeEventListener('community:group_invite_updated', onGroupInviteUpdated as EventListener);
      window.removeEventListener('community:post_created', onPostCreated as EventListener);
    };
  }, [reloadGroups, reloadInviteInbox, reloadSelectedGroup, selectedGroupId]);

  const canManageSelectedGroup = useMemo(() => {
    const role = String(selectedGroup?.membershipRole || '').toLowerCase();
    return activeRole === 'admin' || role === 'owner' || role === 'moderator';
  }, [activeRole, selectedGroup?.membershipRole]);

  const canInviteSelectedGroup = useMemo(() => {
    if (!selectedGroup) return false;
    if (canManageSelectedGroup) return true;
    return Boolean(selectedGroup.isJoined && selectedGroup.membersCanInvite);
  }, [canManageSelectedGroup, selectedGroup]);

  const canPostInSelectedGroup = useMemo(() => {
    if (!selectedGroup) return false;
    if (canManageSelectedGroup) return true;
    const permission = String(selectedGroup.postPermission || 'members').toLowerCase();
    const joined = Boolean(selectedGroup.isJoined);
    if (permission === 'everyone') return true;
    if (permission === 'members') return joined;
    return false;
  }, [canManageSelectedGroup, selectedGroup]);

  const canCreateGroups = useMemo(() => {
    if (activeRole === 'admin') return true;
    return displayConfig.allowUserGroupCreation !== false;
  }, [activeRole, displayConfig.allowUserGroupCreation]);

  useEffect(() => {
    let cancelled = false;
    const query = inviteQuery.trim();
    if (!query || !selectedGroup || !canInviteSelectedGroup) {
      setInviteSuggestions([]);
      setInviteLoading(false);
      return;
    }

    setInviteLoading(true);
    const timer = window.setTimeout(() => {
      CommunityService.searchUserMentions(query)
        .then((results) => {
          if (cancelled) return;
          const blockedIds = new Set([
            String(user?.id || ''),
            ...(selectedGroup.members || []).map((member) => String(member.userId || '')),
            ...selectedInvitees.map((entry) => String(entry.id || ''))
          ]);
          setInviteSuggestions(
            (Array.isArray(results) ? results : []).filter((entry) => !blockedIds.has(String(entry?.id || ''))).slice(0, 8)
          );
        })
        .catch(() => {
          if (!cancelled) setInviteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setInviteLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canInviteSelectedGroup, inviteQuery, selectedGroup, selectedInvitees, user?.id]);

  const selectedPostMediaSummary = useMemo(() => {
    const imageCount = postUploads.filter((file) => String(file.type || '').toLowerCase() !== 'video').length;
    const videoCount = postUploads.filter((file) => String(file.type || '').toLowerCase() === 'video').length;
    return { imageCount, videoCount, total: postUploads.length };
  }, [postUploads]);

  const visibleMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return selectedGroup?.members || [];
    return (selectedGroup?.members || []).filter((member) => {
      const name = String(member.user?.name || '').toLowerCase();
      const username = String(member.user?.username || '').toLowerCase();
      const role = String(member.role || '').toLowerCase();
      return name.includes(query) || username.includes(query) || role.includes(query);
    });
  }, [memberSearch, selectedGroup?.members]);

  const pendingInvites = useMemo(
    () => groupInvites.filter((invite) => String(invite.status || '').toLowerCase() === 'pending'),
    [groupInvites]
  );

  const receivedInviteInbox = useMemo(
    () =>
      inviteInbox.filter((invite) => String(invite.inviteeId || invite.invitee_id || '') === String(user?.id || '')),
    [inviteInbox, user?.id]
  );

  const sentInviteInbox = useMemo(
    () =>
      inviteInbox.filter((invite) => String(invite.invitedById || invite.invited_by_id || '') === String(user?.id || '')),
    [inviteInbox, user?.id]
  );

  const matchesInviteStatusFilter = useCallback(
    (invite: GroupInviteSummary) => {
      if (inviteStatusFilter === 'all') return true;
      return String(invite.status || '').toLowerCase() === inviteStatusFilter;
    },
    [inviteStatusFilter]
  );

  const matchesInviteSearch = useCallback(
    (invite: GroupInviteSummary) => {
      const query = inviteInboxSearch.trim().toLowerCase();
      if (!query) return true;
      const clubName = String(invite.club?.name || invite.club?.slug || '').toLowerCase();
      const inviterName = String(invite.invitedBy?.name || invite.invitedBy?.username || '').toLowerCase();
      const inviteeName = String(invite.invitee?.name || invite.invitee?.username || '').toLowerCase();
      const note = String(invite.note || '').toLowerCase();
      const reviewNote = String(invite.reviewNote || '').toLowerCase();
      const role = String(invite.role || '').toLowerCase();
      const status = String(invite.status || '').toLowerCase();
      return [clubName, inviterName, inviteeName, note, reviewNote, role, status].some((value) => value.includes(query));
    },
    [inviteInboxSearch]
  );

  const visibleReceivedInviteInbox = useMemo(
    () => receivedInviteInbox.filter(matchesInviteStatusFilter).filter(matchesInviteSearch),
    [matchesInviteSearch, matchesInviteStatusFilter, receivedInviteInbox]
  );

  const visibleSentInviteInbox = useMemo(
    () => sentInviteInbox.filter(matchesInviteStatusFilter).filter(matchesInviteSearch),
    [matchesInviteSearch, matchesInviteStatusFilter, sentInviteInbox]
  );

  const receivedInviteCounts = useMemo(
    () => ({
      pending: receivedInviteInbox.filter((invite) => String(invite.status || '').toLowerCase() === 'pending').length,
      accepted: receivedInviteInbox.filter((invite) => String(invite.status || '').toLowerCase() === 'accepted').length,
      declined: receivedInviteInbox.filter((invite) => ['declined', 'cancelled'].includes(String(invite.status || '').toLowerCase())).length
    }),
    [receivedInviteInbox]
  );

  const sentInviteCounts = useMemo(
    () => ({
      pending: sentInviteInbox.filter((invite) => String(invite.status || '').toLowerCase() === 'pending').length,
      accepted: sentInviteInbox.filter((invite) => String(invite.status || '').toLowerCase() === 'accepted').length,
      declined: sentInviteInbox.filter((invite) => ['declined', 'cancelled'].includes(String(invite.status || '').toLowerCase())).length
    }),
    [sentInviteInbox]
  );

  const selectedGroupRequests = useMemo(
    () => joinRequests.filter((entry) => String(entry.status || '').toLowerCase() === 'pending'),
    [joinRequests]
  );

  const historicalGroupRequests = useMemo(
    () => joinRequests.filter((entry) => String(entry.status || '').toLowerCase() !== 'pending'),
    [joinRequests]
  );

  const visibleModerationRequests = useMemo(
    () =>
      moderationFilter === 'pending'
        ? selectedGroupRequests
        : moderationFilter === 'history'
          ? historicalGroupRequests
          : joinRequests,
    [historicalGroupRequests, joinRequests, moderationFilter, selectedGroupRequests]
  );

  const filteredModerationRequests = useMemo(() => {
    const query = moderationSearch.trim().toLowerCase();
    if (!query) return visibleModerationRequests;
    return visibleModerationRequests.filter((request) => {
      const name = String(request.user?.name || '').toLowerCase();
      const username = String(request.user?.username || '').toLowerCase();
      const note = String(request.note || '').toLowerCase();
      const reviewNote = String((request as any).reviewNote || '').toLowerCase();
      const answers = Array.isArray(request.answers)
        ? request.answers.map((entry) => String(entry || '').toLowerCase()).join(' ')
        : '';
      return (
        name.includes(query) ||
        username.includes(query) ||
        note.includes(query) ||
        reviewNote.includes(query) ||
        answers.includes(query)
      );
    });
  }, [moderationSearch, visibleModerationRequests]);

  const visiblePendingModerationRequests = useMemo(
    () => filteredModerationRequests.filter((request) => String(request.status || '').toLowerCase() === 'pending'),
    [filteredModerationRequests]
  );

  const selectedPendingRequestIds = useMemo(
    () =>
      selectedRequestIds.filter((id) =>
        visiblePendingModerationRequests.some((request) => request.id === id)
      ),
    [selectedRequestIds, visiblePendingModerationRequests]
  );

  const reviewedTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return historicalGroupRequests.filter((request) => {
      const reviewedAt = request.reviewedAt || request.reviewed_at;
      return reviewedAt ? new Date(reviewedAt).toDateString() === today : false;
    }).length;
  }, [historicalGroupRequests]);

  const applyGroupToForm = (group?: CommunityClub | null) => {
    if (!group) {
      setGroupForm(emptyGroupForm(displayConfig));
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

  const handleJoinOrRequest = async (group: CommunityClub, payload?: { note?: string; answers?: string[] }) => {
    try {
      const joinMode = String(group.joinMode || 'open').toLowerCase();
      const isPrivate = group.visibility === 'private';
      if (joinMode === 'request' || isPrivate) {
        const response = await CommunityService.requestToJoinClub(group.id, payload);
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

  const handleSubmitJoinRequest = async () => {
    if (!selectedGroup) return;
    setSubmittingJoinRequest(true);
    try {
      const answers = joinRequestDraft.answersText
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 5);
      await handleJoinOrRequest(selectedGroup, {
        note: joinRequestDraft.note.trim(),
        answers
      });
      setJoinRequestDraft({ note: '', answersText: '' });
      setShowJoinRequestComposer(false);
    } finally {
      setSubmittingJoinRequest(false);
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
      await CommunityService.respondToClubJoinRequest(selectedGroup.id, request.id, {
        decision,
        note: String(reviewDrafts[request.id] || '').trim()
      });
      showNotification('success', 'Request updated', `Join request ${decision}d.`);
      setReviewDrafts((current) => ({ ...current, [request.id]: '' }));
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Groups', error?.message || 'Unable to update this request.');
    }
  };

  const handleBulkRespondRequests = async (decision: 'approve' | 'reject') => {
    if (!selectedGroup || !selectedPendingRequestIds.length) return;
    setBulkReviewing(true);
    try {
      await CommunityService.bulkRespondToClubJoinRequests(selectedGroup.id, {
        requestIds: selectedPendingRequestIds,
        decision,
        note: bulkReviewNote.trim()
      });
      showNotification(
        'success',
        'Join requests',
        `${selectedPendingRequestIds.length} request${selectedPendingRequestIds.length === 1 ? '' : 's'} ${decision}d.`
      );
      setSelectedRequestIds([]);
      setBulkReviewNote('');
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Join requests', error?.message || 'Unable to update the selected requests.');
    } finally {
      setBulkReviewing(false);
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

  const handleCreateInvites = async () => {
    if (!selectedGroup) return;
    const inviteeIds = Array.from(new Set(selectedInvitees.map((entry) => String(entry.id || '')).filter(Boolean)));
    if (!inviteeIds.length) {
      showNotification('error', 'Invites', 'Choose at least one member to invite.');
      return;
    }
    setCreatingInvite(true);
    try {
      await CommunityService.createClubInvites(selectedGroup.id, {
        inviteeIds,
        role: inviteRole,
        note: inviteNote.trim()
      });
      showNotification('success', 'Invites', 'Group invite sent.');
      setSelectedInvitees([]);
      setInviteQuery('');
      setInviteSuggestions([]);
      setInviteNote('');
      setInviteRole('member');
      await reloadSelectedGroup(selectedGroup.id);
    } catch (error: any) {
      showNotification('error', 'Invites', error?.message || 'Unable to send group invite.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRespondInvite = async (
    invite: GroupInviteSummary,
    decision: 'accept' | 'decline' | 'cancel',
    clubIdOverride?: string
  ) => {
    const clubId = String(clubIdOverride || selectedGroup?.id || invite.club?.id || '').trim();
    if (!clubId) return;
    try {
      await CommunityService.respondToClubInvite(clubId, invite.id, { decision });
      showNotification('success', 'Invites', `Invite ${decision === 'accept' ? 'accepted' : decision === 'decline' ? 'declined' : 'cancelled'}.`);
      await reloadGroups();
      await reloadInviteInbox();
      if (selectedGroup?.id === clubId) {
        await reloadSelectedGroup(clubId);
      }
    } catch (error: any) {
      showNotification('error', 'Invites', error?.message || 'Unable to update this invite.');
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
        attachmentCaptions: Object.fromEntries(
          Object.entries(postUploadCaptions).filter(([fileId, caption]) =>
            postUploads.some((file) => String(file.id || '') === fileId) && String(caption || '').trim()
          )
        ),
        clubId: selectedGroup.id
      });
      setPostTitle('');
      setPostBody('');
      setPostUploads([]);
      setPostUploadCaptions({});
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
      setPostUploads((current) => {
        const existingIds = new Set(current.map((file) => String(file.id || '')));
        return [...current, ...nextFiles.filter((file) => !existingIds.has(String(file.id || '')))];
      });
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

  const movePostUpload = (fileId: string, direction: -1 | 1) => {
    setPostUploads((current) => {
      const index = current.findIndex((entry) => String(entry.id || '') === String(fileId || ''));
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const reorderPostUpload = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPostUploads((current) => {
      const sourceIndex = current.findIndex((entry) => String(entry.id || '') === sourceId);
      const targetIndex = current.findIndex((entry) => String(entry.id || '') === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const promotePostUpload = (fileId: string) => {
    if (!fileId) return;
    setPostUploads((current) => {
      const index = current.findIndex((entry) => String(entry.id || '') === String(fileId || ''));
      if (index <= 0) return current;
      const next = [...current];
      const [selected] = next.splice(index, 1);
      next.unshift(selected);
      return next;
    });
  };

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 rounded-[32px] bg-white/90 p-4 shadow-sm sm:p-6'}>
      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#2563eb_100%)] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-100">{displayConfig.heroEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">{displayConfig.heroTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              {displayConfig.heroSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {displayConfig.showDiscoveryStats !== false ? (
              <>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-blue-100">Visible groups</div>
                  <div className="mt-1 text-2xl font-semibold text-white">{groups.length}</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-blue-100">Joined</div>
                  <div className="mt-1 text-2xl font-semibold text-white">{groups.filter((group) => group.isJoined).length}</div>
                </div>
              </>
            ) : null}
            {canCreateGroups ? (
              <button
                onClick={() => {
                  applyGroupToForm(null);
                  setShowComposer(true);
                }}
                className="inline-flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
              >
                <Plus className="mr-2 h-4 w-4" />
                {displayConfig.createButtonLabel}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{displayConfig.directoryTitle}</h3>
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
                  {displayConfig.directoryEmptyState}
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
                        ) : selectedGroup.pendingInvite ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void handleRespondInvite(selectedGroup.pendingInvite as GroupInviteSummary, 'accept')}
                              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                            >
                              Accept invite
                            </button>
                            <button
                              onClick={() => void handleRespondInvite(selectedGroup.pendingInvite as GroupInviteSummary, 'decline')}
                              className="rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
                            >
                              Decline
                            </button>
                          </div>
                        ) : selectedGroup.pendingRequest ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                            Join request pending
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                if (selectedGroup.visibility === 'private' || selectedGroup.joinMode === 'request') {
                                  setShowJoinRequestComposer((current) => !current);
                                  return;
                                }
                                void handleJoinOrRequest(selectedGroup);
                              }}
                              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                            >
                              {selectedGroup.visibility === 'private' || selectedGroup.joinMode === 'request' ? 'Request to join' : 'Join group'}
                            </button>
                            {selectedGroup.joinMode === 'invite_only' ? (
                              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur">
                                Invite only
                              </div>
                            ) : null}
                          </>
                        )}
                        {canManageSelectedGroup ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={boostSelectedGroup}
                              className="rounded-2xl border border-blue-200 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                              Boost group
                            </button>
                            <button
                              onClick={() => {
                                applyGroupToForm(selectedGroup);
                                setShowComposer(true);
                              }}
                              className="rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
                            >
                              Manage group
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr),360px]">
                  <div className="space-y-4">
                    {showJoinRequestComposer && !selectedGroup.isJoined && !selectedGroup.pendingRequest && !selectedGroup.pendingInvite ? (
                      <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">Request access</h4>
                            <p className="mt-1 text-sm text-slate-600">
                              Introduce yourself and add optional answers so moderators can review your request faster.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowJoinRequestComposer(false)}
                            className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-white/70"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={joinRequestDraft.note}
                            onChange={(event) => setJoinRequestDraft((current) => ({ ...current, note: event.target.value }))}
                            placeholder="Tell the group owner why you want to join."
                            className="h-24 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                          <textarea
                            value={joinRequestDraft.answersText}
                            onChange={(event) => setJoinRequestDraft((current) => ({ ...current, answersText: event.target.value }))}
                            placeholder="Optional answers, one per line. Example: role, experience, what you plan to contribute."
                            className="h-24 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => void handleSubmitJoinRequest()}
                              disabled={submittingJoinRequest}
                              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {submittingJoinRequest ? 'Submitting...' : 'Send join request'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-4">
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
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Pending</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">
                          {(selectedGroup.pendingRequestCount || 0) + (selectedGroup.pendingInviteCount || 0)}
                        </p>
                      </div>
                    </div>

                    {canPostInSelectedGroup ? (
                      <div className={`rounded-[24px] border p-4 ${displayConfig.highlightPostComposer === false ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_100%)] shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">Post to group</h4>
                            <p className="mt-1 text-xs text-slate-500">Drag to reorder media, add per-attachment captions, and publish a polished group update.</p>
                          </div>
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
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Featured media</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-900">{postUploads[0]?.name || 'Upload preview'}</p>
                                  </div>
                                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">
                                    Slot 1
                                  </span>
                                </div>
                                <div className="aspect-[16/9] bg-slate-100">
                                  {String(postUploads[0]?.type || '').toLowerCase() === 'video' ? (
                                    <video src={postUploads[0]?.url} controls className="h-full w-full object-cover" />
                                  ) : (
                                    <img src={postUploads[0]?.url} alt={postUploads[0]?.name || 'Featured upload'} className="h-full w-full object-cover" />
                                  )}
                                </div>
                                <div className="border-t border-slate-100 px-4 py-3">
                                  <p className="text-sm text-slate-600">
                                    {String(postUploadCaptions[String(postUploads[0]?.id || '')] || '').trim() || 'Add a caption to explain what members should notice first.'}
                                  </p>
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Cover behavior</p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    The first attachment becomes the lead image in the group feed. Use <span className="font-semibold text-slate-900">Set cover</span> to promote any file.
                                  </p>
                                </div>
                                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Caption coverage</p>
                                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                                    {postUploads.filter((file) => String(postUploadCaptions[String(file.id || '')] || '').trim()).length}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">attachments with captions</p>
                                </div>
                                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Publishing polish</p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    Reorder the rail, keep captions concise, and use one clear hero shot so the post opens cleanly in feeds and lightbox.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {postUploads.length ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                              {postUploads.map((file, fileIndex) => (
                                <div
                                  key={file.id}
                                  draggable
                                  onDragStart={(event) => event.dataTransfer.setData('text/plain', String(file.id || ''))}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    reorderPostUpload(event.dataTransfer.getData('text/plain'), String(file.id || ''));
                                  }}
                                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                                >
                                  <div className="aspect-[4/3] bg-slate-100">
                                    {String(file.type || '').toLowerCase() === 'video' ? (
                                      <video src={file.url} className="h-full w-full object-cover" controls />
                                    ) : (
                                      <img src={file.url} alt={file.name || 'Upload'} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <div className="flex items-start justify-between gap-2 px-3 py-2 text-xs text-slate-500">
                                    <div className="min-w-0">
                                      <span className="mb-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Slot {fileIndex + 1}
                                      </span>
                                      <span className="flex items-center gap-1 truncate">
                                        <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                                        <span className="truncate">{file.name || 'Uploaded media'}</span>
                                      </span>
                                      <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                        {String(file.type || '').toLowerCase() === 'video' ? 'Video' : 'Image'}
                                      </span>
                                      <span className="mt-1 block text-[10px] text-slate-400">Drag to reorder the gallery rail.</span>
                                      {String(postUploadCaptions[String(file.id || '')] || '').trim() ? (
                                        <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                          Caption ready
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => promotePostUpload(String(file.id || ''))}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                          fileIndex === 0
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                      >
                                        {fileIndex === 0 ? 'Cover media' : 'Set cover'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => movePostUpload(String(file.id || ''), -1)}
                                        className="rounded-full border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                                        aria-label="Move upload left"
                                      >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => movePostUpload(String(file.id || ''), 1)}
                                        className="rounded-full border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                                        aria-label="Move upload right"
                                      >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setPostUploads((current) => current.filter((entry) => entry.id !== file.id));
                                          setPostUploadCaptions((current) => {
                                            const next = { ...current };
                                            delete next[String(file.id || '')];
                                            return next;
                                          });
                                        }}
                                        className="font-semibold text-rose-600"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                  <div className="border-t border-slate-100 px-3 py-2">
                                    <input
                                      value={postUploadCaptions[String(file.id || '')] || ''}
                                      onChange={(event) =>
                                        setPostUploadCaptions((current) => ({
                                          ...current,
                                          [String(file.id || '')]: event.target.value
                                        }))
                                      }
                                      placeholder="Caption for this attachment"
                                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-500"
                                    />
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
                          const activeIndex = Math.max(0, Math.min(postPreviewIndex[post.id] ?? 0, Math.max(attachments.length - 1, 0)));
                          const activeAttachment = attachments[activeIndex] || null;
                          const attachmentCaptions =
                            post?.attachmentCaptions && typeof post.attachmentCaptions === 'object'
                              ? post.attachmentCaptions
                              : {};
                          const activeCaption = activeAttachment?.id ? String(attachmentCaptions[activeAttachment.id] || '').trim() : '';
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
                              {activeAttachment ? (
                                <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                                  <div className="relative aspect-[16/9] bg-slate-100">
                                    {mediaKind(String(activeAttachment?.url || '')) === 'video' ? (
                                      <video src={activeAttachment?.url} controls className="h-full w-full object-cover" />
                                    ) : (
                                      <img
                                        src={activeAttachment?.url}
                                        alt={activeAttachment?.name || 'Attachment'}
                                        className="h-full w-full cursor-zoom-in object-cover"
                                        onClick={() => setGroupMediaLightbox({ postId: post.id, index: activeIndex })}
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setGroupMediaLightbox({ postId: post.id, index: activeIndex })}
                                      className="absolute right-3 top-3 inline-flex items-center rounded-full bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur hover:bg-slate-950/85"
                                      aria-label="Open media viewer"
                                    >
                                      <Expand className="mr-1.5 h-3.5 w-3.5" />
                                      View
                                    </button>
                                    {attachments.length > 1 ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPostPreviewIndex((current) => ({
                                              ...current,
                                              [post.id]: activeIndex === 0 ? attachments.length - 1 : activeIndex - 1
                                            }))
                                          }
                                          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/65 p-2 text-white backdrop-blur hover:bg-slate-950/80"
                                          aria-label="Previous attachment"
                                        >
                                          <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPostPreviewIndex((current) => ({
                                              ...current,
                                              [post.id]: activeIndex === attachments.length - 1 ? 0 : activeIndex + 1
                                            }))
                                          }
                                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-950/65 p-2 text-white backdrop-blur hover:bg-slate-950/80"
                                          aria-label="Next attachment"
                                        >
                                          <ChevronRight className="h-4 w-4" />
                                        </button>
                                      </>
                                    ) : null}
                                    {attachments.length > 1 ? (
                                      <div className="absolute bottom-3 left-3 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                                        {activeIndex + 1} / {attachments.length}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="border-t border-slate-200 bg-white px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Attachment details</p>
                                      {attachments.length > 1 ? <p className="text-xs text-slate-400">Click a thumbnail or use the arrows to browse.</p> : null}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                                        {mediaKind(String(activeAttachment?.url || '')) === 'video' ? <Clapperboard className="h-3.5 w-3.5" /> : <FileImage className="h-3.5 w-3.5" />}
                                        {mediaKind(String(activeAttachment?.url || '')) === 'video' ? 'Video' : 'Image'}
                                      </span>
                                      {activeAttachment?.name ? (
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{String(activeAttachment.name)}</span>
                                      ) : null}
                                    </div>
                                    {activeCaption ? (
                                      <p className="mt-2 text-sm text-slate-600">{activeCaption}</p>
                                    ) : (
                                      <p className="mt-2 text-sm text-slate-400">No caption for this attachment.</p>
                                    )}
                                  </div>
                                  {attachments.length > 1 ? (
                                    <div className="grid grid-cols-4 gap-2 border-t border-slate-200 bg-white p-3 sm:grid-cols-6">
                                      {attachments.map((attachment: any, index: number) => (
                                        <button
                                          key={`${post.id}-${index}`}
                                          type="button"
                                          onClick={() => setPostPreviewIndex((current) => ({ ...current, [post.id]: index }))}
                                          className={`overflow-hidden rounded-2xl border ${
                                            activeIndex === index ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'
                                          }`}
                                        >
                                          <div className="aspect-square bg-slate-100">
                                            {mediaKind(String(attachment?.url || '')) === 'video' ? (
                                              <video src={attachment?.url} className="h-full w-full object-cover" muted />
                                            ) : (
                                              <img src={attachment?.url} alt={attachment?.name || 'Attachment'} className="h-full w-full object-cover" />
                                            )}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {displayConfig.showInviteInbox === false ? null : (
                    <div ref={inviteInboxRef} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Inbox className="h-5 w-5 text-slate-500" />
                            Invite inbox
                          </h4>
                          <p className="mt-1 text-sm text-slate-500">Track received and sent invitations, including accepted, declined, and cancelled outcomes.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                          <span className="rounded-full bg-white px-3 py-1">Received {receivedInviteInbox.length}</span>
                          <span className="rounded-full bg-white px-3 py-1">Sent {sentInviteInbox.length}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Received pending</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{receivedInviteCounts.pending}</p>
                          <p className="mt-1 text-xs text-slate-500">Approvals waiting on this account.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Sent pending</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{sentInviteCounts.pending}</p>
                          <p className="mt-1 text-xs text-slate-500">Invites still awaiting a response.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Live state</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{liveOpsState?.label || 'No recent live changes'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {liveOpsState?.at ? `Updated ${new Date(liveOpsState.at).toLocaleTimeString()}` : 'Waiting for cross-session activity.'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          value={inviteInboxSearch}
                          onChange={(event) => setInviteInboxSearch(event.target.value)}
                          placeholder="Search invites by group, member, note, role, or status"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          { key: 'all', label: 'All invites' },
                          { key: 'received', label: 'Received' },
                          { key: 'sent', label: 'Sent' }
                        ].map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            onClick={() => setInviteScopeFilter(entry.key as 'all' | 'received' | 'sent')}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              inviteScopeFilter === entry.key
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {entry.label}
                          </button>
                        ))}
                        {[
                          { key: 'all', label: 'Any status' },
                          { key: 'pending', label: 'Pending' },
                          { key: 'accepted', label: 'Accepted' },
                          { key: 'declined', label: 'Declined' },
                          { key: 'cancelled', label: 'Cancelled' }
                        ].map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            onClick={() =>
                              setInviteStatusFilter(entry.key as 'all' | 'pending' | 'accepted' | 'declined' | 'cancelled')
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              inviteStatusFilter === entry.key
                                ? 'bg-blue-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {inviteScopeFilter !== 'sent' ? <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900">Received</p>
                            <span className="text-xs text-slate-500">
                              Pending {receivedInviteCounts.pending} • Accepted {receivedInviteCounts.accepted} • Closed {receivedInviteCounts.declined}
                            </span>
                          </div>
                          {visibleReceivedInviteInbox.length ? (
                            visibleReceivedInviteInbox.slice(0, showAllReceivedInvites ? visibleReceivedInviteInbox.length : 6).map((invite) => {
                              const status = String(invite.status || '').toLowerCase();
                              return (
                                <div key={`received-${invite.id}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <Link
                                        to={invite.club?.slug ? `/community/clubs?group=${encodeURIComponent(String(invite.club.slug))}&panel=invites&inviteScope=received` : `/community/clubs?group=${encodeURIComponent(String(invite.club?.id || ''))}&panel=invites&inviteScope=received`}
                                        className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-600"
                                      >
                                        {invite.club?.name || 'Scrolith group'}
                                      </Link>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Invited by {invite.invitedBy?.name || invite.invitedBy?.username || 'Community member'} as {invite.role || 'member'}
                                      </p>
                                      <p className="mt-1 text-[11px] text-slate-400">
                                        {new Date((invite as any).createdAt || (invite as any).updatedAt || Date.now()).toLocaleString()}
                                      </p>
                                    </div>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                        status === 'accepted'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : status === 'declined' || status === 'cancelled'
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {status}
                                    </span>
                                  </div>
                                  {invite.note ? <p className="mt-3 text-sm text-slate-600">{invite.note}</p> : null}
                                  {(invite as any).reviewNote ? (
                                    <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                      {(invite as any).reviewNote}
                                    </p>
                                  ) : null}
                                  {status === 'pending' ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleRespondInvite(invite, 'accept', invite.club?.id)}
                                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                      >
                                        Accept
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleRespondInvite(invite, 'decline', invite.club?.id)}
                                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                              No received invites match this filter.
                            </p>
                          )}
                          {visibleReceivedInviteInbox.length > 6 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllReceivedInvites((current) => !current)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              {showAllReceivedInvites ? 'Show fewer received invites' : `Show all ${visibleReceivedInviteInbox.length} received invites`}
                            </button>
                          ) : null}
                        </div> : null}
                        {inviteScopeFilter !== 'received' ? <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900">Sent</p>
                            <span className="text-xs text-slate-500">
                              Pending {sentInviteCounts.pending} • Accepted {sentInviteCounts.accepted} • Closed {sentInviteCounts.declined}
                            </span>
                          </div>
                          {visibleSentInviteInbox.length ? (
                            visibleSentInviteInbox.slice(0, showAllSentInvites ? visibleSentInviteInbox.length : 6).map((invite) => {
                              const status = String(invite.status || '').toLowerCase();
                              return (
                                <div key={`sent-${invite.id}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <Link
                                        to={invite.club?.slug ? `/community/clubs?group=${encodeURIComponent(String(invite.club.slug))}&panel=invites&inviteScope=sent` : `/community/clubs?group=${encodeURIComponent(String(invite.club?.id || ''))}&panel=invites&inviteScope=sent`}
                                        className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-600"
                                      >
                                        {invite.club?.name || 'Scrolith group'}
                                      </Link>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Invitee {invite.invitee?.name || invite.invitee?.username || 'Community member'} • {invite.role || 'member'}
                                      </p>
                                    </div>
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                        status === 'accepted'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : status === 'declined' || status === 'cancelled'
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {status}
                                    </span>
                                  </div>
                                  {invite.reviewNote ? (
                                    <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{invite.reviewNote}</p>
                                  ) : null}
                                  {status === 'pending' ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleRespondInvite(invite, 'cancel', invite.club?.id)}
                                        className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                      >
                                        Cancel invite
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                              No sent invites match this filter.
                            </p>
                          )}
                          {visibleSentInviteInbox.length > 6 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllSentInvites((current) => !current)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                            >
                              {showAllSentInvites ? 'Show fewer sent invites' : `Show all ${visibleSentInviteInbox.length} sent invites`}
                            </button>
                          ) : null}
                        </div> : null}
                      </div>
                    </div>
                    )}

                    {displayConfig.showMemberDirectory === false ? null : (
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
                    )}

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
                        <span className="text-sm text-slate-500">{visibleMembers.length} shown</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          value={memberSearch}
                          onChange={(event) => setMemberSearch(event.target.value)}
                          placeholder="Search members by name, username, or role"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                      <div className="mt-3 space-y-3">
                        {visibleMembers.map((member) => (
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
                                <Link
                                  to={member.user?.username ? `/u/${String(member.user.username).replace(/^@+/, '')}` : `/profile/${member.userId}`}
                                  className="font-semibold text-slate-900 hover:text-blue-600"
                                >
                                  {member.user?.name || 'Community member'}
                                </Link>
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                  {member.role}
                                  {member.user?.username ? ` • @${String(member.user.username).replace(/^@+/, '')}` : ''}
                                </p>
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
                        {!visibleMembers.length ? <p className="text-sm text-slate-500">No members match this search.</p> : null}
                      </div>
                    </div>

                    {canInviteSelectedGroup ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-slate-900">Invite members</h4>
                            <p className="mt-1 text-sm text-slate-500">Search users, choose a role, and send a governed invitation into the group.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                            {pendingInvites.length} pending
                          </span>
                        </div>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                            <div className="flex items-center gap-2">
                              <UserPlus className="h-4 w-4 text-slate-400" />
                              <input
                                value={inviteQuery}
                                onChange={(event) => setInviteQuery(event.target.value)}
                                placeholder="Search by name or username"
                                className="w-full bg-transparent text-sm outline-none"
                              />
                            </div>
                            {inviteLoading ? <p className="mt-2 text-xs text-slate-400">Searching members...</p> : null}
                            {inviteSuggestions.length ? (
                              <div className="mt-3 space-y-2">
                                {inviteSuggestions.map((entry) => (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedInvitees((current) => [
                                        ...current,
                                        {
                                          id: String(entry.id || ''),
                                          name: String(entry.name || entry.username || 'Community member'),
                                          username: String(entry.username || '').replace(/^@+/, ''),
                                          avatar: entry.avatar || undefined
                                        }
                                      ]);
                                      setInviteQuery('');
                                      setInviteSuggestions([]);
                                    }}
                                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                                  >
                                    <span className="text-sm font-medium text-slate-900">{entry.name || entry.username || 'Community member'}</span>
                                    <span className="text-xs text-slate-500">@{String(entry.username || 'member').replace(/^@+/, '')}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {selectedInvitees.length ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedInvitees.map((entry) => (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => setSelectedInvitees((current) => current.filter((member) => member.id !== entry.id))}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  {entry.name} ×
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-[160px,minmax(0,1fr)]">
                            <select
                              value={inviteRole}
                              onChange={(event) => setInviteRole(event.target.value as 'member' | 'moderator')}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                            >
                              <option value="member">Invite as member</option>
                              <option value="moderator">Invite as moderator</option>
                            </select>
                            <textarea
                              value={inviteNote}
                              onChange={(event) => setInviteNote(event.target.value)}
                              placeholder="Optional invite message"
                              className="h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => void handleCreateInvites()}
                              disabled={creatingInvite}
                              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {creatingInvite ? 'Sending...' : 'Send invite'}
                            </button>
                          </div>

                          {groupInvites.length ? (
                            <div className="space-y-2 border-t border-slate-200 pt-3">
                              {groupInvites.slice(0, 6).map((invite) => (
                                <div key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                      {invite.invitee?.name || invite.invitedBy?.name || 'Community member'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {invite.status} • {invite.role || 'member'}
                                    </p>
                                  </div>
                                  {String(invite.status || '').toLowerCase() === 'pending' && canManageSelectedGroup ? (
                                    <button
                                      onClick={() => void handleRespondInvite(invite, 'cancel')}
                                      className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                    >
                                      Cancel
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {canManageSelectedGroup ? (
                      <div ref={moderationPanelRef} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold text-slate-900">Join requests</h4>
                          <span className="text-sm text-slate-500">{selectedGroupRequests.length} pending</span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Pending</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{selectedGroupRequests.length}</p>
                            <p className="mt-1 text-xs text-slate-500">Requests waiting for review.</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Reviewed today</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{reviewedTodayCount}</p>
                            <p className="mt-1 text-xs text-slate-500">Moderation actions recorded today.</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Selected</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{selectedPendingRequestIds.length}</p>
                            <p className="mt-1 text-xs text-slate-500">Bulk review queue size.</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Realtime</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{liveOpsState?.label || 'No recent queue changes'}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {liveOpsState?.at ? `Updated ${new Date(liveOpsState.at).toLocaleTimeString()}` : 'Socket updates will appear here.'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            { id: 'pending', label: `Pending (${selectedGroupRequests.length})` },
                            { id: 'history', label: `History (${historicalGroupRequests.length})` },
                            { id: 'all', label: `All (${joinRequests.length})` }
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() => setModerationFilter(option.id as 'pending' | 'history' | 'all')}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                moderationFilter === option.id
                                  ? 'bg-slate-900 text-white'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 space-y-3">
                          {joinRequests.length ? (
                            <>
                              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Pending {selectedGroupRequests.length}</span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">History {historicalGroupRequests.length}</span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Selected {selectedPendingRequestIds.length}</span>
                                  </div>
                                  {moderationFilter === 'pending' && visiblePendingModerationRequests.length ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedRequestIds((current) =>
                                          selectedPendingRequestIds.length === visiblePendingModerationRequests.length
                                            ? []
                                            : visiblePendingModerationRequests.map((request) => request.id)
                                        )
                                      }
                                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      {selectedPendingRequestIds.length === visiblePendingModerationRequests.length ? 'Clear selection' : 'Select visible pending'}
                                    </button>
                                  ) : null}
                                </div>
                                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr),auto]">
                                  <label className="relative block">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                      value={moderationSearch}
                                      onChange={(event) => setModerationSearch(event.target.value)}
                                      placeholder="Search requester, answers, or notes"
                                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500"
                                    />
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    {defaultBulkReviewNoteTemplates.map((template) => (
                                      <button
                                        key={template.label}
                                        type="button"
                                        onClick={() => setBulkReviewNote(template.value)}
                                        className="rounded-full border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                      >
                                        {template.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                                    Visible {filteredModerationRequests.length}
                                  </span>
                                  {moderationSearch.trim() ? (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                      Filter: {moderationSearch.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                {selectedPendingRequestIds.length ? (
                                  <div className="mt-3 space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                                    <textarea
                                      value={bulkReviewNote}
                                      onChange={(event) => setBulkReviewNote(event.target.value)}
                                      placeholder="Optional moderator note for all selected requests"
                                      className="h-20 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void handleBulkRespondRequests('approve')}
                                        disabled={bulkReviewing}
                                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                      >
                                        {bulkReviewing ? 'Processing...' : `Approve ${selectedPendingRequestIds.length}`}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleBulkRespondRequests('reject')}
                                        disabled={bulkReviewing}
                                        className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                                      >
                                        Decline {selectedPendingRequestIds.length}
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                                      {visiblePendingModerationRequests
                                        .filter((request) => selectedPendingRequestIds.includes(request.id))
                                        .slice(0, 6)
                                        .map((request) => (
                                          <span key={request.id} className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                                            {request.user?.name || 'Member'}
                                          </span>
                                        ))}
                                      {selectedPendingRequestIds.length > 6 ? (
                                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                                          +{selectedPendingRequestIds.length - 6} more
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              {filteredModerationRequests.map((request) => (
                              <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    {request.status === 'pending' ? (
                                      <input
                                        type="checkbox"
                                        checked={selectedRequestIds.includes(request.id)}
                                        onChange={(event) =>
                                          setSelectedRequestIds((current) =>
                                            event.target.checked
                                              ? Array.from(new Set([...current, request.id]))
                                              : current.filter((id) => id !== request.id)
                                          )
                                        }
                                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                      />
                                    ) : null}
                                    <div>
                                      <p className="font-semibold text-slate-900">{request.user?.name || 'Community member'}</p>
                                      <p className="text-xs text-slate-500">{new Date(request.requestedAt || request.requested_at || Date.now()).toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                      request.status === 'approved'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : request.status === 'rejected'
                                          ? 'bg-rose-50 text-rose-700'
                                          : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {request.status}
                                  </span>
                                </div>
                                {request.note ? (
                                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Requester note</span>
                                    <p className="mt-1 whitespace-pre-wrap">{request.note}</p>
                                  </div>
                                ) : null}
                                {(request as any).reviewNote ? (
                                  <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Moderator note</span>
                                    <p className="mt-1 whitespace-pre-wrap">{(request as any).reviewNote}</p>
                                  </div>
                                ) : null}
                                {Array.isArray(request.answers) && request.answers.length ? (
                                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Submitted answers</span>
                                    <ul className="mt-2 list-disc space-y-1 pl-5">
                                      {request.answers.map((answer, index) => (
                                        <li key={`${request.id}-answer-${index}`}>{answer}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                {request.reviewedBy ? (
                                  <p className="mt-3 text-xs text-slate-500">
                                    Reviewed by {request.reviewedBy.name || 'Moderator'}
                                  </p>
                                ) : null}
                                {request.status === 'pending' ? (
                                  <div className="mt-3 space-y-3">
                                    <textarea
                                      value={reviewDrafts[request.id] || ''}
                                      onChange={(event) => setReviewDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                                      placeholder="Optional moderator note for approval or rejection"
                                      className="h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => void handleRespondRequest(request, 'approve')}
                                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                      >
                                        <CheckCheck className="mr-1 inline h-3.5 w-3.5" />
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
                                ) : null}
                              </div>
                            ))}
                            </>
                          ) : (
                            <p className="text-sm text-slate-500">
                              {moderationSearch.trim()
                                ? 'No join requests match this search.'
                                : moderationFilter === 'pending'
                                ? 'No pending requests right now.'
                                : moderationFilter === 'history'
                                  ? 'No reviewed requests yet.'
                                  : 'No join requests yet.'}
                            </p>
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

      <MobileDialog
        open={showComposer}
        onClose={() => {
          setShowComposer(false);
          applyGroupToForm(null);
        }}
        title={editingGroupId ? 'Edit group' : 'Create a new group'}
        description="Define who can join, who can post, what members should share, and the group's public or private posture."
        size="xl"
        panelClassName="max-w-6xl"
        bodyClassName="pb-5"
        footer={
          <MobileDialogFooter>
            <button
              type="button"
              onClick={() => {
                setShowComposer(false);
                applyGroupToForm(null);
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveGroup()}
              disabled={savingGroup}
              className="inline-flex items-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            >
              <Check className="mr-2 h-4 w-4" />
              {savingGroup ? 'Saving...' : editingGroupId ? 'Save group changes' : 'Create group'}
            </button>
          </MobileDialogFooter>
        }
      >
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
      </MobileDialog>

      {groupMediaLightbox && (() => {
        const lightboxPost = groupPosts.find((entry) => entry.id === groupMediaLightbox.postId);
        const lightboxAttachments = Array.isArray(lightboxPost?.attachments) ? lightboxPost.attachments : [];
        const safeIndex = Math.max(0, Math.min(groupMediaLightbox.index, Math.max(lightboxAttachments.length - 1, 0)));
        const lightboxAttachment = lightboxAttachments[safeIndex] || null;
        const lightboxCaptions =
          lightboxPost?.attachmentCaptions && typeof lightboxPost.attachmentCaptions === 'object'
            ? lightboxPost.attachmentCaptions
            : {};
        const lightboxCaption = lightboxAttachment?.id ? String(lightboxCaptions[lightboxAttachment.id] || '').trim() : '';
        if (!lightboxAttachment) return null;
        return (
          <div className="fixed inset-0 z-[90] bg-slate-950/90 p-4 backdrop-blur-sm">
            <div className="mx-auto flex h-full max-w-6xl flex-col">
              <div className="flex items-center justify-between gap-3 pb-3 text-white">
                <div>
                  <p className="text-sm font-semibold">{lightboxPost?.title || 'Group media'}</p>
                  <p className="text-xs text-slate-300">{safeIndex + 1} of {lightboxAttachments.length}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGroupMediaLightbox(null)}
                  className="rounded-full border border-white/20 p-2 text-white hover:bg-white/10"
                  aria-label="Close gallery"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-slate-900">
                {mediaKind(String(lightboxAttachment?.url || '')) === 'video' ? (
                  <video src={lightboxAttachment?.url} controls className="max-h-full max-w-full object-contain" />
                ) : (
                  <img src={lightboxAttachment?.url} alt={lightboxAttachment?.name || 'Attachment'} className="max-h-full max-w-full object-contain" />
                )}
                {lightboxAttachments.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setGroupMediaLightbox((current) => current ? { ...current, index: safeIndex === 0 ? lightboxAttachments.length - 1 : safeIndex - 1 } : current)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                      aria-label="Previous media"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupMediaLightbox((current) => current ? { ...current, index: safeIndex === lightboxAttachments.length - 1 ? 0 : safeIndex + 1 } : current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                      aria-label="Next media"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>
              <div className="mt-3 rounded-[24px] border border-white/10 bg-white/5 p-3 text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {lightboxCaption ? <p className="text-sm text-slate-100">{lightboxCaption}</p> : <p className="text-sm text-slate-300">No caption for this attachment.</p>}
                    {lightboxAttachment?.name ? <p className="mt-1 text-xs text-slate-400">{String(lightboxAttachment.name)}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={String(lightboxAttachment?.url || '#')}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      <Expand className="mr-1.5 h-3.5 w-3.5" />
                      Open original
                    </a>
                    <a
                      href={String(lightboxAttachment?.url || '#')}
                      download
                      className="inline-flex items-center rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download
                    </a>
                  </div>
                </div>
                {lightboxAttachments.length > 1 ? (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {lightboxAttachments.map((attachment: any, index: number) => (
                      <button
                        key={`${lightboxPost?.id}-${index}-lightbox`}
                        type="button"
                        onClick={() => setGroupMediaLightbox({ postId: groupMediaLightbox.postId, index })}
                        className={`overflow-hidden rounded-2xl border ${safeIndex === index ? 'border-blue-300 ring-2 ring-blue-200' : 'border-white/10'}`}
                      >
                        <div className="aspect-square bg-slate-900">
                          {mediaKind(String(attachment?.url || '')) === 'video' ? (
                            <video src={attachment?.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={attachment?.url} alt={attachment?.name || 'Attachment'} className="h-full w-full object-cover" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

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
