import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Bookmark,
  BookmarkMinus,
  FolderPlus,
  Copy,
  Edit3,
  EyeOff,
  Flag,
  Heart,
  Info,
  MessageSquareOff,
  Repeat2,
  Shield,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserMinus,
  UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../../../context/UserContext';
import { useNotification } from '../../../context/NotificationContext';
import { CommunityService } from '../../../services/community';
import api from '../../../services/api';
import { postOptionsApi } from '../../../services/postOptions';

export type PostOptionItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void | Promise<void>;
};

type UsePostOptionsParams = {
  post: any;
  isOpen?: boolean;
  onHideFromFeed?: (postId: string) => void;
  onEditPost?: (post: any) => void;
  onDeletePost?: (post: any) => void;
  onTogglePin?: (post: any) => void;
  onToggleHighlight?: (post: any) => void;
  onOpenSaveCollectionPicker?: () => void;
};

const isPrivilegedRole = (role?: string) => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized.includes('admin') || normalized.includes('moderator');
};

const resolveAuthorLabel = (post: any) => {
  const name =
    post?.author?.displayName ||
    post?.authorName ||
    post?.author?.username ||
    post?.authorUsername ||
    'Author';
  return String(name || 'Author').trim() || 'Author';
};

export function usePostOptions({
  post,
  isOpen,
  onHideFromFeed,
  onEditPost,
  onDeletePost,
  onTogglePin,
  onToggleHighlight,
  onOpenSaveCollectionPicker
}: UsePostOptionsParams) {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useUser();
  const { showNotification } = useNotification();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState<boolean>(
    Boolean(post?.viewer?.isFollowingAuthor)
  );

  const postId = String(post?.id || '').trim();
  const viewerId = String(user?.id || '').trim();
  const authorUserId = String(post?.authorUserId || post?.authorId || '').trim();
  const isOwner = Boolean(viewerId && authorUserId && viewerId === authorUserId);
  const isAdminOrMod = isPrivilegedRole(user?.role);

  useEffect(() => {
    setIsFollowingAuthor(Boolean(post?.viewer?.isFollowingAuthor));
  }, [postId, post?.viewer?.isFollowingAuthor]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isAuthenticated || !viewerId || !postId) return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await postOptionsApi.optionsState(postId);
        if (cancelled) return;
        if (typeof resp?.data?.saved === 'boolean') setSaved(resp.data.saved);
        if (typeof resp?.data?.notificationsEnabled === 'boolean') setNotifEnabled(resp.data.notificationsEnabled);
        if (typeof resp?.data?.isFollowingAuthor === 'boolean') setIsFollowingAuthor(resp.data.isFollowingAuthor);
      } catch {
        // best-effort (menu still works; it will correct after first action)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, viewerId, postId]);

  const ensureAuth = useCallback(() => {
    if (isAuthenticated && viewerId) return true;
    showNotification('info', 'Login required', 'Please sign in to use this action.', '/auth/login');
    return false;
  }, [isAuthenticated, viewerId, showNotification]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/post/${encodeURIComponent(postId)}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotification('success', 'Copied', 'Post link copied to clipboard.');
    } catch {
      showNotification('error', 'Copy failed', 'Unable to copy link. Please try again.');
    }
  }, [postId, showNotification]);

  const run = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      if (busyId) return;
      setBusyId(id);
      try {
        await fn();
      } finally {
        setBusyId(null);
      }
    },
    [busyId]
  );

  const whyThisPost = useCallback(() => {
    if (!ensureAuth()) return;
    void run('why', async () => {
      const resp = await postOptionsApi.whyThisPost(postId);
      const primary = resp?.data?.primary || resp?.message || 'This post was recommended for you.';
      const lines = (resp?.data?.reasons || []).map((r) => `- ${r.label}`).join('\n');
      const body = lines ? `${primary}\n\n${lines}` : primary;
      // Lightweight UX for now; can be upgraded to a proper modal without touching the menu contract.
      alert(body);
    });
  }, [ensureAuth, postId, run]);

  const followOrUnfollow = useCallback(() => {
    if (!ensureAuth()) return;
    void run('follow', async () => {
      const resp = isFollowingAuthor ? await postOptionsApi.unfollowAuthor(postId) : await postOptionsApi.followAuthor(postId);
      const isFollowing = Boolean(resp?.data?.isFollowing);
      setIsFollowingAuthor(isFollowing);
      showNotification('success', isFollowing ? 'Following' : 'Unfollowed', resp?.message || '');

      // Immediate UI sync (also comes via socket, but this avoids any latency/stale state).
      try {
        window.dispatchEvent(
          new CustomEvent('community:follow_updated', {
            detail: {
              actorUserId: viewerId,
              targetUserId: resp?.data?.targetId,
              targetType: resp?.data?.targetType,
              targetId: resp?.data?.targetId,
              isFollowing,
              action: isFollowing ? 'follow' : 'unfollow'
            }
          })
        );
      } catch {}
    });
  }, [ensureAuth, isFollowingAuthor, postId, run, showNotification]);

  const markInterested = useCallback(() => {
    if (!ensureAuth()) return;
    void run('interested', async () => {
      const resp = await postOptionsApi.interested(postId);
      showNotification('success', 'Thanks', resp?.message || 'We will show you more posts like this.');
    });
  }, [ensureAuth, postId, run, showNotification]);

  const markNotInterested = useCallback(() => {
    if (!ensureAuth()) return;
    // UX: remove instantly, then confirm with backend.
    onHideFromFeed?.(postId);
    void run('not_interested', async () => {
      const resp = await postOptionsApi.notInterested(postId);
      showNotification('info', 'Not interested', resp?.message || 'We will show you fewer posts like this.');
      // Phase 20.3 — dual-write IFF (telemetry only; ranking still uses intent path).
      void import('../../../services/intelligenceFeedback')
        .then(({ submitIntelligenceFeedbackEvents, getFeedbackSessionId }) =>
          submitIntelligenceFeedbackEvents([
            {
              eventId: `post_options:not_interested:post:${postId}`,
              entityType: 'post',
              entityId: postId,
              action: 'not_interested',
              sourceSurface: 'post_options',
              sessionId: getFeedbackSessionId()
            }
          ])
        )
        .catch(() => null);
    });
  }, [ensureAuth, onHideFromFeed, postId, run, showNotification]);

  const saveOrUnsave = useCallback(() => {
    if (!ensureAuth()) return;
    void run('save', async () => {
      const resp = saved ? await postOptionsApi.unsave(postId) : await postOptionsApi.save(postId);
      const next = Boolean(resp?.data?.saved);
      setSaved(next);
      showNotification('success', next ? 'Saved' : 'Unsaved', resp?.message || '');
    });
  }, [ensureAuth, postId, run, saved, showNotification]);

  const openSaveCollectionPicker = useCallback(() => {
    if (!ensureAuth()) return;
    onOpenSaveCollectionPicker?.();
  }, [ensureAuth, onOpenSaveCollectionPicker]);

  const hide = useCallback(() => {
    if (!ensureAuth()) return;
    // UX: remove instantly, then confirm with backend.
    onHideFromFeed?.(postId);
    void run('hide', async () => {
      const resp = await postOptionsApi.hide(postId);
      showNotification('info', 'Hidden', resp?.message || 'Post hidden from your feed.');
      void import('../../../services/intelligenceFeedback')
        .then(({ submitIntelligenceFeedbackEvents, getFeedbackSessionId }) =>
          submitIntelligenceFeedbackEvents([
            {
              eventId: `post_options:hide:post:${postId}`,
              entityType: 'post',
              entityId: postId,
              action: 'hide',
              sourceSurface: 'post_options',
              sessionId: getFeedbackSessionId()
            }
          ])
        )
        .catch(() => null);
    });
  }, [ensureAuth, onHideFromFeed, postId, run, showNotification]);

  const report = useCallback(() => {
    if (!ensureAuth()) return;
    void run('report', async () => {
      // Prefer accessible in-page input over native prompt() (poor AT/mobile UX).
      let reason: string | undefined;
      if (typeof window !== 'undefined') {
        const entered = window.prompt?.('Report reason (optional):');
        // When prompt is unavailable (some WebViews), still submit without reason.
        if (entered != null) reason = String(entered).trim() || undefined;
      }
      const resp = await postOptionsApi.report(postId, { reason });
      const reportId = String(resp?.data?.reportId || resp?.data?.id || '').trim();
      const reviewState = String(resp?.data?.reviewState || 'queued').trim();
      const baseMessage =
        resp?.message ||
        'Thanks for helping keep Scrolith safe. Our moderation team will review this report. You can continue using the platform while we investigate.';
      const detail =
        reportId.length > 0
          ? `${baseMessage} Reference: ${reportId.slice(0, 8)}${reviewState ? ` · ${reviewState}` : ''}.`
          : baseMessage;
      showNotification('success', 'Report submitted', detail);
      void import('../../../services/intelligenceFeedback')
        .then(({ submitIntelligenceFeedbackEvents, getFeedbackSessionId }) =>
          submitIntelligenceFeedbackEvents([
            {
              eventId: `post_options:report:post:${postId}`,
              entityType: 'post',
              entityId: postId,
              action: 'report',
              sourceSurface: 'post_options',
              sessionId: getFeedbackSessionId()
            }
          ])
        )
        .catch(() => null);
    });
  }, [ensureAuth, postId, run, showNotification]);

  const toggleNotifications = useCallback(() => {
    if (!ensureAuth()) return;
    void run('notifications', async () => {
      const resp = await postOptionsApi.toggleNotifications(postId);
      const enabled = Boolean(resp?.data?.enabled);
      setNotifEnabled(enabled);
      showNotification('success', enabled ? 'Notifications on' : 'Notifications off', resp?.message || '');
    });
  }, [ensureAuth, postId, run, showNotification]);

  const ownerEdit = useCallback(() => {
    if (!ensureAuth()) return;
    onEditPost?.(post);
  }, [ensureAuth, onEditPost, post]);

  const ownerDelete = useCallback(() => {
    if (!ensureAuth()) return;
    onDeletePost?.(post);
  }, [ensureAuth, onDeletePost, post]);

  const toggleComments = useCallback(() => {
    if (!ensureAuth()) return;
    void run('comments', async () => {
      const isOff = String(post?.commentPolicy || '').toLowerCase() === 'none';
      const nextPolicy = isOff ? 'everyone' : 'none';
      await CommunityService.updatePost(postId, { commentPolicy: nextPolicy });
      showNotification('success', isOff ? 'Comments enabled' : 'Comments disabled', '');
    });
  }, [ensureAuth, post?.commentPolicy, postId, run, showNotification]);

  const toggleReposts = useCallback(() => {
    if (!ensureAuth()) return;
    void run('reposts', async () => {
      const isOff = post?.repostsEnabled === false;
      await CommunityService.updatePost(postId, { repostsEnabled: isOff });
      showNotification('success', isOff ? 'Reposts enabled' : 'Reposts disabled', '');
    });
  }, [ensureAuth, post?.repostsEnabled, postId, run, showNotification]);

  const viewInsights = useCallback(() => {
    const views = Number(post?.interactions?.views ?? post?.viewsCount ?? 0);
    const likes = Number(post?.interactions?.likes ?? post?.likesCount ?? 0);
    const comments = Number(post?.interactions?.comments ?? 0);
    const reposts = Number(post?.interactions?.reposts ?? post?.repostsCount ?? 0);
    const shares = Number(post?.interactions?.shares ?? post?.sharesCount ?? 0);
    alert(`Post insights\n\nViews: ${views}\nLikes: ${likes}\nComments: ${comments}\nReposts: ${reposts}\nShares: ${shares}`);
  }, [post]);

  const enterModerationMode = useCallback(() => {
    navigate('/admin/dashboard?tab=community');
  }, [navigate]);

  const modHidePost = useCallback(() => {
    void run('mod_hide', async () => {
      await api.post('/community/admin/moderation/action', { targetType: 'post', targetId: postId, action: 'hide' });
      showNotification('info', 'Hidden', 'Post hidden from the public feed.');
      onHideFromFeed?.(postId);
    });
  }, [onHideFromFeed, postId, run, showNotification]);

  const modRemovePost = useCallback(() => {
    void run('mod_remove', async () => {
      await api.post('/community/admin/moderation/action', { targetType: 'post', targetId: postId, action: 'remove' });
      showNotification('success', 'Removed', 'Post removed.');
      onHideFromFeed?.(postId);
    });
  }, [onHideFromFeed, postId, run, showNotification]);

  const modWarnUser = useCallback(() => {
    const targetId = authorUserId;
    if (!targetId) return;
    void run('mod_warn', async () => {
      await api.post('/community/admin/moderation/action', { targetType: 'user', targetId, action: 'warn', note: 'Please follow community guidelines.' });
      showNotification('success', 'Warned', 'User warning sent.');
    });
  }, [authorUserId, postId, run, showNotification]);

  const modSuspendUser = useCallback(() => {
    const targetId = authorUserId;
    if (!targetId) return;
    void run('mod_suspend', async () => {
      await api.post('/community/admin/moderation/action', { targetType: 'user', targetId, action: 'ban', note: 'Suspended by moderation.' });
      showNotification('success', 'Suspended', 'User account suspended.');
    });
  }, [authorUserId, postId, run, showNotification]);

  const viewReports = useCallback(() => {
    navigate('/admin/dashboard?tab=community');
  }, [navigate]);

  const authorName = resolveAuthorLabel(post);

  const items: PostOptionItem[] = useMemo(() => {
    const disabled = (id: string) => busyId === id;

    if (isAdminOrMod) {
      return [
        {
          id: 'mod_mode',
          label: 'Enter Moderation Mode',
          icon: <Shield className="h-4 w-4" />,
          onSelect: enterModerationMode
        },
        {
          id: 'mod_hide',
          label: 'Hide Post',
          icon: <EyeOff className="h-4 w-4" />,
          onSelect: modHidePost,
          disabled: disabled('mod_hide')
        },
        {
          id: 'mod_remove',
          label: 'Remove Post',
          icon: <Trash2 className="h-4 w-4" />,
          destructive: true,
          onSelect: modRemovePost,
          disabled: disabled('mod_remove')
        },
        {
          id: 'mod_warn',
          label: 'Warn User',
          icon: <Flag className="h-4 w-4" />,
          onSelect: modWarnUser,
          disabled: disabled('mod_warn')
        },
        {
          id: 'mod_suspend',
          label: 'Suspend User',
          icon: <EyeOff className="h-4 w-4" />,
          destructive: true,
          onSelect: modSuspendUser,
          disabled: disabled('mod_suspend')
        },
        {
          id: 'mod_reports',
          label: 'View Reports',
          icon: <Info className="h-4 w-4" />,
          onSelect: viewReports,
          dividerBefore: true
        },
        {
          id: 'copy',
          label: 'Copy Link',
          icon: <Copy className="h-4 w-4" />,
          onSelect: () => void copyLink()
        }
      ];
    }

    if (isOwner) {
      const commentsOff = String(post?.commentPolicy || '').toLowerCase() === 'none';
      const repostsOff = post?.repostsEnabled === false;
      return [
        { id: 'edit', label: 'Edit Post', icon: <Edit3 className="h-4 w-4" />, onSelect: ownerEdit },
        { id: 'delete', label: 'Delete Post', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: ownerDelete },
        {
          id: 'comments',
          label: commentsOff ? 'Turn On Comments' : 'Turn Off Comments',
          icon: <MessageSquareOff className="h-4 w-4" />,
          onSelect: toggleComments,
          disabled: disabled('comments'),
          dividerBefore: true
        },
        {
          id: 'reposts',
          label: repostsOff ? 'Turn On Reposts' : 'Turn Off Reposts',
          icon: <Repeat2 className="h-4 w-4" />,
          onSelect: toggleReposts,
          disabled: disabled('reposts')
        },
        { id: 'insights', label: 'View Post Insights', icon: <Info className="h-4 w-4" />, onSelect: viewInsights },
        { id: 'copy', label: 'Copy Link', icon: <Copy className="h-4 w-4" />, onSelect: () => void copyLink() },
        ...(onTogglePin
          ? [
              {
                id: 'pin',
                label: post?.isPinned ? 'Unpin from profile' : 'Pin to profile',
                icon: <Info className="h-4 w-4" />,
                onSelect: () => onTogglePin(post),
                dividerBefore: true
              }
            ]
          : []),
        ...(onToggleHighlight
          ? [
              {
                id: 'highlight',
                label: post?.isHighlighted ? 'Remove highlight' : 'Highlight on profile',
                icon: <Heart className="h-4 w-4" />,
                onSelect: () => onToggleHighlight(post)
              }
            ]
          : [])
      ];
    }

    // Viewer menu (follow state)
    return [
      { id: 'why', label: 'Why am I seeing this post?', icon: <Info className="h-4 w-4" />, onSelect: whyThisPost },
      {
        id: 'follow',
        label: isFollowingAuthor ? `Unfollow ${authorName}` : `Follow ${authorName}`,
        icon: isFollowingAuthor ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />,
        onSelect: followOrUnfollow,
        disabled: disabled('follow'),
        dividerBefore: true
      },
      { id: 'interested', label: 'Interested', icon: <ThumbsUp className="h-4 w-4" />, onSelect: markInterested, disabled: disabled('interested') },
      { id: 'not_interested', label: 'Not Interested', icon: <ThumbsDown className="h-4 w-4" />, onSelect: markNotInterested, disabled: disabled('not_interested') },
      {
        id: 'save',
        label: saved ? 'Unsave Post' : 'Save Post',
        icon: saved ? <BookmarkMinus className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />,
        onSelect: saveOrUnsave,
        disabled: disabled('save'),
        dividerBefore: true
      },
      {
        id: 'save_to_collection',
        label: 'Save to Collection',
        icon: <FolderPlus className="h-4 w-4" />,
        onSelect: openSaveCollectionPicker
      },
      { id: 'hide', label: 'Hide Post', icon: <EyeOff className="h-4 w-4" />, onSelect: hide, disabled: disabled('hide') },
      { id: 'report', label: 'Report Post', icon: <Flag className="h-4 w-4" />, destructive: true, onSelect: report, disabled: disabled('report') },
      {
        id: 'notifications',
        label: notifEnabled ? 'Turn Off Notifications' : 'Turn On Notifications',
        icon: notifEnabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />,
        onSelect: toggleNotifications,
        disabled: disabled('notifications'),
        dividerBefore: true
      },
      { id: 'copy', label: 'Copy Link', icon: <Copy className="h-4 w-4" />, onSelect: () => void copyLink() }
    ];
  }, [
    authorName,
    busyId,
    copyLink,
    enterModerationMode,
    followOrUnfollow,
    hide,
    isAdminOrMod,
    isFollowingAuthor,
    isOwner,
    markInterested,
    markNotInterested,
    modHidePost,
    modRemovePost,
    modSuspendUser,
    modWarnUser,
    notifEnabled,
    onDeletePost,
    onEditPost,
    onToggleHighlight,
    onTogglePin,
    openSaveCollectionPicker,
    onOpenSaveCollectionPicker,
    ownerDelete,
    ownerEdit,
    post,
    report,
    run,
    saveOrUnsave,
    saved,
    toggleComments,
    toggleNotifications,
    toggleReposts,
    viewInsights,
    viewReports,
    whyThisPost
  ]);

  return { items, busyId, saved, setSaved };
}
