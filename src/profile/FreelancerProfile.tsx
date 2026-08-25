
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Star, PlayCircle, Briefcase, GraduationCap, Award, CheckCircle, ShieldCheck, TrendingUp, X, Users, Heart, Pin, Sparkles } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { UserProfile, TrustScore } from '../types';
import ProBadge from '../components/ProBadge';
import VerifiedBadge from '../components/common/VerifiedBadge';
import GigCard from '../components/GigCard';
import { ReputationService } from '../services/ai/reputation.service';
import { UserService, type UserStorefrontPayload } from '../services/user';
import { CommunityService } from '../services/community';
import { MessagingService } from '../services/messaging';
import { ReviewsService, Review } from '../services/reviews';
import { resolveVerificationLevel } from '../utils/verification';
import { resolveAssetUrl } from '../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../community/storyStyles';
import { getPublicAppOrigin } from '../utils/siteUrl';
import ProfessionalIntegrationStrip from '../components/discovery/ProfessionalIntegrationStrip';
import CreatorAnalyticsCard from '../components/insights/CreatorAnalyticsCard';
import GrowthPulseCard from '../components/growth/GrowthPulseCard';
import PeopleYouMayKnowRail from '../components/discovery/PeopleYouMayKnowRail';
import EmptyState from '../components/ui/EmptyState';
import EnterpriseAvatar from '../components/common/EnterpriseAvatar';
import EnterpriseImage from '../components/common/EnterpriseImage';

const EditProfile = lazy(() => import('./EditProfile'));

type StoryVisibility = 'public' | 'followers' | 'following' | 'mutuals' | 'network' | 'private' | 'custom';

const storyVisibilityOptions: Array<{ value: StoryVisibility; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
  { value: 'mutuals', label: 'Mutuals' },
  { value: 'network', label: 'Network' },
  { value: 'private', label: 'Only me' }
];

const normalizeStoryVisibility = (value?: string): StoryVisibility => {
  if (!value) return 'public';
  const normalized = String(value).toLowerCase();
  if (storyVisibilityOptions.some((option) => option.value === normalized)) {
    return normalized as StoryVisibility;
  }
  return 'public';
};

const resolveStoryMediaUrl = (story: any) => {
  if (!story) return undefined;
  const candidate =
    story.media?.url ||
    story.media?.fileUrl ||
    story.mediaUrl ||
    story.media_url ||
    story.mediaFileUrl ||
    story.media_file_url ||
    story.media?.[0]?.url;
  if (candidate) return resolveAssetUrl(String(candidate));
  const fileId = story.mediaFileId || story.media_file_id;
  if (typeof fileId === 'string') {
    if (fileId.startsWith('disk:')) {
      const relative = fileId.slice('disk:'.length).replace(/^\/+/, '');
      return resolveAssetUrl(`/uploads/${relative}`);
    }
    if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      return resolveAssetUrl(fileId);
    }
  }
  return undefined;
};

const resolveStoryContent = (story: any) =>
  story?.content || story?.text || story?.caption || story?.storyText || story?.story_text || story?.message || '';

const toArray = <T = any>(value: any): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (Array.isArray(value?.items)) return value.items as T[];
  if (Array.isArray(value?.rows)) return value.rows as T[];
  if (Array.isArray(value?.results)) return value.results as T[];
  if (Array.isArray(value?.data)) return value.data as T[];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getIdentityTierStyles = (tier?: string) => {
  switch (String(tier || '').toLowerCase()) {
    case 'elite':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'established':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
};

const formatIdentityVerification = (status?: string, isVerified?: boolean) => {
  if (isVerified) return 'Verified identity';
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pending') return 'Verification pending';
  if (normalized === 'rejected') return 'Verification needs review';
  return 'Community identity';
};

const isStoryActive = (story: any) => {
  const expiry = story?.expiresAt || story?.expires_at;
  if (!expiry) return true;
  const ts = new Date(expiry).getTime();
  return Number.isNaN(ts) ? true : ts > Date.now();
};

const FreelancerProfile = () => {
  const { id, username } = useParams();
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('overview');
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [storefront, setStorefront] = useState<UserStorefrontPayload | null>(null);
  const [storefrontLoading, setStorefrontLoading] = useState(false);
  const [publicUser, setPublicUser] = useState<{
    id?: string;
    name?: string;
    avatar?: string;
    profilePhotoFileId?: string;
    profile_photo_file_id?: string;
    isProFreelancer?: boolean;
    isVerified?: boolean;
    verificationLevel?: string;
    username?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [activeStory, setActiveStory] = useState<any | null>(null);
  const [storyEditOpen, setStoryEditOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<any | null>(null);
  const [storyEditSaving, setStoryEditSaving] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<Record<string, boolean>>({});
  const [storyEditDraft, setStoryEditDraft] = useState({
    content: '',
    visibility: 'public' as StoryVisibility,
    ...getDefaultStoryTextDraft()
  });
  const [followState, setFollowState] = useState<{ isFollowing: boolean; followId?: string }>({ isFollowing: false });
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [followersList, setFollowersList] = useState<Array<{ id: string; name: string; avatar?: string; username?: string }>>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockBusyId, setBlockBusyId] = useState<string | null>(null);
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  /** Pinned + highlighted posts shown on Overview */
  const [featuredPosts, setFeaturedPosts] = useState<any[]>([]);
  const [featuredPostsLoading, setFeaturedPostsLoading] = useState(false);
  const publicBaseUrl = getPublicAppOrigin();
  const cleanBaseUrl = publicBaseUrl.replace(/\/$/, '');
  const portfolioItems = useMemo(
    () =>
      toArray<any>(
        (profile as any)?.portfolio ??
          (profile as any)?.portfolioItems ??
          (profile as any)?.portfolio_items
      ),
    [profile]
  );
  const professionalIdentity = useMemo(
    () => (profile as any)?.professionalIdentity ?? (profile as any)?.professional_identity ?? null,
    [profile]
  );
  const storyEditPreviewStyle = getStoryTextStyle(storyEditDraft);
  const coverUrl = useMemo(() => {
    const raw = profile?.coverPhotoUrl || (profile as any)?.cover_photo_url;
    const fileId =
      (profile as any)?.coverFileId ||
      (profile as any)?.cover_file_id ||
      (profile as any)?.coverPhotoFileId ||
      (profile as any)?.cover_photo_file_id;
    return (
      resolvePostAttachmentMediaUrl({ url: raw, fileId }) ||
      resolvePostAttachmentMediaUrl((profile as any)?.cover) ||
      (raw ? resolveAssetUrl(String(raw)) : undefined) ||
      undefined
    );
  }, [profile]);
  const isOwner = useMemo(
    () => Boolean(user?.id && publicUser?.id && String(user.id) === String(publicUser.id)),
    [publicUser?.id, user?.id]
  );
  const profileVerificationLevel = useMemo(
    () =>
      resolveVerificationLevel({
        verificationLevel: publicUser?.verificationLevel,
        isVerified: publicUser?.isVerified,
        isPro: publicUser?.isProFreelancer,
        type: 'user'
      }),
    [publicUser?.isProFreelancer, publicUser?.isVerified, publicUser?.verificationLevel]
  );
  const publicGender = String(profile?.gender || '').trim();
  const publicBirthMonthDay = String((profile as any)?.birthMonthDay || (profile as any)?.birth_month_day || '').trim();
  const storefrontMerchantSummary = useMemo(
    () => storefront?.merchantSummary ?? storefront?.merchant_summary ?? null,
    [storefront]
  );
  const storefrontFeaturedServices = useMemo(
    () => storefront?.featuredServices ?? storefront?.featured_services ?? [],
    [storefront]
  );
  const storefrontServices = useMemo(() => storefront?.services ?? [], [storefront]);
  const storefrontHasTab = useMemo(
    () =>
      Boolean(
        storefront &&
          (storefront.canManage ||
            storefront.enabled ||
            storefrontFeaturedServices.length ||
            storefrontServices.length)
      ),
    [storefront, storefrontFeaturedServices.length, storefrontServices.length]
  );

  const filterActiveStories = useCallback((items: any[]) => items.filter(isStoryActive), []);
  const canManageStory = useCallback(
    (story: any) => {
      if (!user) return false;
      const authorId = story?.authorId || story?.userId || story?.user_id;
      if (authorId && String(authorId) === String(user.id)) return true;
      return (user.role || '').toLowerCase().includes('admin');
    },
    [user]
  );

  const applyStoryUpdate = useCallback(
    (updated: any) => {
      setStories((current) =>
        filterActiveStories(current.map((story) => (story.id === updated.id ? { ...story, ...updated } : story)))
      );
      setActiveStory((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    },
    [filterActiveStories]
  );

  useEffect(() => {
      let mounted = true;
      const load = async () => {
        if (!id && !username) return;
        setLoading(true);
        setError(null);
        try {
          const baseUser = id
            ? await UserService.getUserBasic(id)
            : await UserService.getUserByUsername(username || '');
          if (!mounted) return;
          const userId = baseUser.id;
          const [profileData, trust] = await Promise.all([
            UserService.getProfile(userId),
            ReputationService.getTrustScore(userId)
          ]);
          if (!mounted) return;
          const profilePhotoFileId = String(
            (baseUser as any)?.profilePhotoFileId ||
              (baseUser as any)?.profile_photo_file_id ||
              (baseUser as any)?.avatarFileId ||
              (baseUser as any)?.avatar_file_id ||
              ''
          ).trim();
          setPublicUser({
            id: baseUser.id,
            name: baseUser.name,
            avatar: baseUser.avatar,
            profilePhotoFileId: profilePhotoFileId || undefined,
            profile_photo_file_id: profilePhotoFileId || undefined,
            username: (baseUser as any)?.username,
            isProFreelancer: Boolean((baseUser as any)?.isProFreelancer ?? (baseUser as any)?.is_pro_freelancer),
            isVerified: Boolean((baseUser as any)?.isVerified ?? (baseUser as any)?.is_verified),
            verificationLevel:
              (baseUser as any)?.verificationLevel ||
              (baseUser as any)?.verification_level ||
              (baseUser as any)?.badgeType ||
              (baseUser as any)?.badge_type
          } as any);
          setProfile(profileData);
          setTrustScore(trust);
          setStorefrontLoading(true);
          UserService.getStorefront(userId)
            .then((storefrontData) => {
              if (!mounted) return;
              setStorefront(storefrontData);
            })
            .catch(() => {
              if (!mounted) return;
              setStorefront(null);
            })
            .finally(() => {
              if (mounted) setStorefrontLoading(false);
            });
        } catch {
          if (mounted) setError('Unable to load profile right now.');
        } finally {
          if (mounted) setLoading(false);
        }
      };
      load();
      return () => {
        mounted = false;
      };
  }, [id, username]);

  useEffect(() => {
      const targetId = publicUser?.id || id;
      if (!targetId) return;
      setStoriesLoading(true);
      CommunityService.getStoriesFeed()
        .then((feed) => {
          const list = Array.isArray(feed) ? feed : [];
          const filtered = list.filter((story: any) => {
            const authorId = story.authorId || story.userId || story.user_id;
            return String(authorId) === String(targetId);
          });
          setStories(filterActiveStories(filtered));
        })
        .catch(() => setStories([]))
        .finally(() => setStoriesLoading(false));
  }, [filterActiveStories, id, publicUser?.id]);

  useEffect(() => {
      const interval = window.setInterval(() => {
        setStories((current) => filterActiveStories(current));
      }, 60 * 1000);
      return () => window.clearInterval(interval);
  }, [filterActiveStories]);

  useEffect(() => {
      const targetId = publicUser?.id || id;
      if (!targetId) return;
      const handleStoryUpdated = (event: Event) => {
        const detail = (event as CustomEvent).detail || {};
        const updated = detail?.story ?? detail;
        const authorId = updated?.authorId || updated?.userId || updated?.user_id;
        if (!updated?.id) return;
        if (authorId && String(authorId) !== String(targetId)) return;
        applyStoryUpdate(updated);
      };
      const handleStoryLiked = (event: Event) => {
        const detail = (event as CustomEvent).detail || {};
        const payload = detail?.story ?? detail;
        const storyId = payload?.storyId || payload?.id;
        if (!storyId) return;
        const authorId = payload?.authorId || payload?.userId || payload?.user_id;
        if (authorId && String(authorId) !== String(targetId)) return;
        applyStoryUpdate({
          id: storyId,
          likesCount: payload?.likesCount ?? payload?._count?.likes,
          viewerLiked: payload?.viewerLiked ?? payload?.viewer_liked ?? payload?.liked
        });
      };
      window.addEventListener('community:story_updated', handleStoryUpdated as EventListener);
      window.addEventListener('community:story_liked', handleStoryLiked as EventListener);
      return () => {
        window.removeEventListener('community:story_updated', handleStoryUpdated as EventListener);
        window.removeEventListener('community:story_liked', handleStoryLiked as EventListener);
      };
  }, [applyStoryUpdate, id, publicUser?.id]);

  useEffect(() => {
      const targetId = publicUser?.id || id;
      if (!targetId) return;
      setReviewsLoading(true);
      ReviewsService.listForUser(String(targetId))
        .then((items) => setReviews(toArray<Review>(items)))
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
  }, [id, publicUser?.id]);

  useEffect(() => {
      const targetId = publicUser?.id || id;
      if (!targetId) return;
      setFollowersLoading(true);
      CommunityService.listFollowers('user', String(targetId))
        .then((followers) => {
          const items = toArray<any>(followers);
          setFollowersCount(items.length);
          setFollowersList(
            items.map((entry: any) => ({
              id: String(entry?.id || entry?.userId || entry?.user_id || ''),
              name: entry?.name || 'Member',
              avatar: entry?.avatar || undefined,
              username: entry?.username || entry?.userName || ''
            }))
          );
        })
        .catch(() => {
          setFollowersCount(0);
          setFollowersList([]);
        })
        .finally(() => setFollowersLoading(false));
  }, [id, publicUser?.id]);

  useEffect(() => {
      if (!isOwner) return;
      CommunityService.listBlockedUsers({ limit: 200 })
        .then((result) => {
          const ids = Array.isArray(result?.items)
            ? result.items.map((entry: any) => String(entry?.user?.id || '')).filter(Boolean)
            : [];
          setBlockedUserIds(new Set(ids));
        })
        .catch(() => setBlockedUserIds(new Set()));
  }, [isOwner, publicUser?.id]);

  useEffect(() => {
      if (!isOwner || !user) return;
      setPublicUser((prev) =>
        prev
          ? {
              ...prev,
              name: user.name || prev.name,
              avatar: user.avatar || prev.avatar,
              username: user.username || prev.username
            }
          : prev
      );
  }, [isOwner, user?.name, user?.avatar, user?.username]);

  useEffect(() => {
      const handler = (event: Event) => {
        if (!isOwner) return;
        const detail = (event as CustomEvent).detail || {};
        if (detail.profile) setProfile(detail.profile);
        if (detail.user) {
          setPublicUser((prev) => (prev ? { ...prev, ...detail.user } : prev));
        }
      };
      window.addEventListener('profile:updated', handler as EventListener);
      return () => window.removeEventListener('profile:updated', handler as EventListener);
  }, [isOwner]);

  useEffect(() => {
      if (!publicUser?.id || !user || isOwner) return;
      UserService.logProfileView(publicUser.id)
        .then(() => {
          window.dispatchEvent(
            new CustomEvent('community:profile_view_logged', {
              detail: {
                viewerId: user.id,
                viewedUserId: publicUser.id,
                createdAt: new Date().toISOString()
              }
            })
          );
        })
        .catch(() => null);
  }, [publicUser?.id, user?.id, isOwner]);

  const refreshFollowing = useCallback(async () => {
      if (!user || !publicUser?.id || isOwner) {
          setFollowState({ isFollowing: false });
          return;
      }
      try {
          const data = await CommunityService.listFollowing('me');
          const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
          const match = users.find((entry: any) => String(entry.id || entry.userId || entry.user_id) === String(publicUser.id));
          setFollowState({
              isFollowing: Boolean(match),
              followId: match?.followId || match?.follow_id
          });
      } catch {
          setFollowState({ isFollowing: false });
      }
  }, [publicUser?.id, isOwner, user]);

  useEffect(() => {
      refreshFollowing();
  }, [refreshFollowing]);

  useEffect(() => {
      if (activeTab === 'storefront' && !storefrontHasTab) {
        setActiveTab('overview');
      }
  }, [activeTab, storefrontHasTab]);

  const handleFollow = async () => {
      if (!user || !publicUser?.id || followLoading) return;
      setFollowLoading(true);
      try {
          const response = await CommunityService.followTarget({ targetType: 'user', targetId: publicUser.id });
          const followId = response?.id || response?.followId || response?.follow_id;
          setFollowState({ isFollowing: true, followId });
          setFollowersCount((count) => count + 1);
          showNotification('success', 'Following', 'You are now following this profile.');
      } catch (error: any) {
          showNotification('error', 'Follow failed', error?.message || 'Unable to follow this profile.');
      } finally {
          setFollowLoading(false);
      }
  };

  const handleUnfollow = async () => {
      if (!user || !publicUser?.id || followLoading) return;
      setFollowLoading(true);
      try {
          let followId = followState.followId;
          if (!followId) {
              const data = await CommunityService.listFollowing('me');
              const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
              const match = users.find((entry: any) => String(entry.id || entry.userId || entry.user_id) === String(publicUser.id));
              followId = match?.followId || match?.follow_id;
          }
          if (!followId) {
              showNotification('error', 'Unfollow failed', 'Unable to locate follow record.');
              return;
          }
          await CommunityService.unfollowTarget(followId);
          setFollowState({ isFollowing: false });
          setFollowersCount((count) => Math.max(0, count - 1));
          showNotification('success', 'Unfollowed', 'You are no longer following this profile.');
      } catch (error: any) {
          showNotification('error', 'Unfollow failed', error?.message || 'Unable to unfollow this profile.');
      } finally {
          setFollowLoading(false);
      }
  };

  const handleToggleBlockFollower = async (targetUserId: string) => {
      if (!isOwner || !targetUserId || blockBusyId) return;
      setBlockBusyId(targetUserId);
      try {
          const isBlocked = blockedUserIds.has(targetUserId);
          if (isBlocked) {
              await CommunityService.unblockUser(targetUserId);
              setBlockedUserIds((prev) => {
                const next = new Set(prev);
                next.delete(targetUserId);
                return next;
              });
              showNotification('success', 'Unblocked', 'User can interact with your profile again.');
          } else {
              await CommunityService.blockUser(targetUserId);
              setBlockedUserIds((prev) => new Set(prev).add(targetUserId));
              showNotification('success', 'Blocked', 'User was blocked from interacting with your profile.');
          }
      } catch (error: any) {
          showNotification('error', 'Action failed', error?.message || 'Unable to update block status.');
      } finally {
          setBlockBusyId(null);
      }
  };

  const handleContact = async () => {
      if (!user || !publicUser?.id) return;
      try {
          const conversationId = await MessagingService.createConversation([
              { id: user.id, name: user.name || 'You', avatar: user.avatar, role: user.role },
              {
                id: publicUser.id,
                name: publicUser?.name || 'User',
                avatar: publicUser?.avatar,
                profilePhotoFileId: publicUser?.profilePhotoFileId || publicUser?.profile_photo_file_id
              }
          ]);
          window.location.href = `/messages/${conversationId}`;
      } catch (error: any) {
          showNotification('error', 'Message failed', error?.message || 'Unable to start a conversation.');
      }
  };

  const openStory = async (story: any) => {
      setActiveStory(story);
      try {
          await CommunityService.viewStory(story.id);
      } catch {
          // ignore view tracking failures
      }
  };

  const openStoryEditor = (story: any) => {
      if (!story) return;
      const style = getStoryTextStyle(story);
      setEditingStory(story);
      setStoryEditDraft({
          content: resolveStoryContent(story) || '',
          visibility: normalizeStoryVisibility(story.visibility),
          textBackground: style.background,
          textColor: style.color,
          textFont: style.fontFamily,
          textAlign: (style.textAlign as any) || 'center'
      });
      setStoryEditOpen(true);
  };

  const saveStoryEdit = async () => {
      if (!editingStory?.id) return;
      if (!canManageStory(editingStory)) return;
      if (editingStory.type === 'text' && !storyEditDraft.content.trim()) {
          showNotification('warning', 'Stories', 'Add text before saving the story.');
          return;
      }
      setStoryEditSaving(true);
      try {
          const payload: any = {
              content: storyEditDraft.content?.trim() || undefined,
              visibility: storyEditDraft.visibility
          };
          if (editingStory.type === 'text') {
              payload.textBackground = storyEditDraft.textBackground;
              payload.textColor = storyEditDraft.textColor;
              payload.textFont = storyEditDraft.textFont;
              payload.textAlign = storyEditDraft.textAlign;
          }
          const updated = await CommunityService.updateStory(editingStory.id, payload);
          applyStoryUpdate(updated);
          setStoryEditOpen(false);
          setEditingStory(null);
          showNotification('success', 'Stories', 'Story updated.');
      } catch (error: any) {
          showNotification('error', 'Stories', error?.message || 'Unable to update story.');
      } finally {
          setStoryEditSaving(false);
      }
  };

  const handleStoryDelete = async (story: any) => {
      if (!story?.id || !canManageStory(story)) return;
      setStoryActionBusy((prev) => ({ ...prev, [story.id]: true }));
      try {
          await CommunityService.deleteStory(story.id);
          setStories((current) => current.filter((item) => item.id !== story.id));
          setActiveStory((current) => (current?.id === story.id ? null : current));
          showNotification('success', 'Stories', 'Story deleted.');
      } catch (error: any) {
          showNotification('error', 'Stories', error?.message || 'Unable to delete story.');
      } finally {
          setStoryActionBusy((prev) => ({ ...prev, [story.id]: false }));
      }
  };

  const handleStoryLike = async (story: any) => {
      if (!story?.id) return;
      setStoryActionBusy((prev) => ({ ...prev, [story.id]: true }));
      try {
          const response = await CommunityService.toggleStoryLike(story.id);
          const payload = response?.data ?? response;
          const viewerLiked = Boolean(payload?.liked ?? payload?.viewerLiked ?? payload?.viewer_liked);
          const likesCount =
            payload?.likesCount ?? payload?._count?.likes ?? story.likesCount ?? story._count?.likes ?? 0;
          applyStoryUpdate({
            id: story.id,
            viewerLiked,
            likesCount
          });
      } catch (error: any) {
          showNotification('error', 'Stories', error?.message || 'Unable to like story.');
      } finally {
          setStoryActionBusy((prev) => ({ ...prev, [story.id]: false }));
      }
  };

  useEffect(() => {
    const displayName = String(publicUser?.name || publicUser?.username || 'Member').trim();
    const titleRole = profile?.title ? ` · ${profile.title}` : '';
    const nextTitle = `${displayName}${titleRole} | Scrolith`;
    const prev = document.title;
    if (document.title !== nextTitle) document.title = nextTitle;
    return () => {
      if (document.title === nextTitle) document.title = prev;
    };
  }, [publicUser?.name, publicUser?.username, profile?.title]);

  // Load pinned + highlighted posts for profile Overview (/u/:username)
  useEffect(() => {
    const authorId = String(publicUser?.id || '').trim();
    if (!authorId) {
      setFeaturedPosts([]);
      return;
    }
    let mounted = true;
    const loadFeatured = async () => {
      setFeaturedPostsLoading(true);
      try {
        const posts = await CommunityService.getPosts({
          authorId,
          limit: 50,
          status: 'active'
        });
        if (!mounted) return;
        const list = Array.isArray(posts) ? posts : [];
        const featured = list
          .filter(
            (post) =>
              Boolean(post?.isPinned) ||
              Boolean(post?.isHighlighted ?? post?.is_highlighted)
          )
          .sort((a, b) => {
            const pinDelta = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
            if (pinDelta !== 0) return pinDelta;
            const hiDelta =
              Number(Boolean(b.isHighlighted ?? b.is_highlighted)) -
              Number(Boolean(a.isHighlighted ?? a.is_highlighted));
            if (hiDelta !== 0) return hiDelta;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });
        setFeaturedPosts(featured);
      } catch {
        if (mounted) setFeaturedPosts([]);
      } finally {
        if (mounted) setFeaturedPostsLoading(false);
      }
    };
    void loadFeatured();
    const onUpdated = () => void loadFeatured();
    window.addEventListener('community:post_updated', onUpdated as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('community:post_updated', onUpdated as EventListener);
    };
  }, [publicUser?.id]);

  return (
    <div className="bg-gray-50 min-h-screen pb-12">
        {error && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
              {error}
            </div>
          </div>
        )}
        {/* Header Cover */}
        <div
          className="h-64 md:h-72 w-full relative overflow-hidden bg-gradient-to-br from-blue-900 via-indigo-800 to-slate-800"
        >
            {coverUrl && (
              <EnterpriseImage
                src={coverUrl}
                candidates={[
                  (profile as any)?.coverPhotoUrl,
                  (profile as any)?.cover_photo_url,
                  (profile as any)?.coverFileId,
                  (profile as any)?.cover_file_id,
                  (profile as any)?.coverPhotoFileId,
                  (profile as any)?.cover_photo_file_id,
                  (profile as any)?.cover
                ]}
                alt="Cover"
                width={1920}
                height={480}
                loading="eager"
                rounded="rounded-none"
                className="absolute inset-0 h-full w-full bg-transparent"
                placeholder="generic"
              />
            )}
            <div className="absolute inset-0 bg-black/30"></div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                <div className="p-5 md:p-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                            <button
                                type="button"
                                onClick={() => {
                                  if (stories.length > 0) openStory(stories[0]);
                                }}
                                className="relative shrink-0 self-center sm:self-auto"
                            >
                                <EnterpriseAvatar
                                    className={`!h-24 !w-24 border-4 border-white shadow-md sm:!h-28 sm:!w-28 md:!h-32 md:!w-32 ${
                                      stories.length > 0 ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-white' : ''
                                    }`}
                                    src={
                                      resolveUserAvatarUrl(publicUser) ||
                                      resolveAssetUrl(String(publicUser?.avatar || '')) ||
                                      undefined
                                    }
                                    name={publicUser?.name || publicUser?.username || 'Profile'}
                                    user={publicUser}
                                    size="xl"
                                    rounded="xl"
                                    alt={publicUser?.name || 'Profile photo'}
                                />
                                {storiesLoading && (
                                  <span className="absolute inset-x-0 -bottom-6 text-xs text-gray-400">Loading story...</span>
                                )}
                                {!storiesLoading && stories.length > 0 && (
                                  <span className="absolute inset-x-0 -bottom-6 text-xs font-semibold text-emerald-600">View story</span>
                                )}
                            </button>
                            <div className="min-w-0 flex-1 text-center sm:text-left">
                                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{publicUser?.name || "Profile"}</h1>
                                    {profileVerificationLevel ? (
                                      <VerifiedBadge
                                        size={20}
                                        level={profileVerificationLevel}
                                        className="ml-1"
                                        subjectRole={publicUser?.isProFreelancer ? 'freelancer' : 'user'}
                                        subjectType="user"
                                      />
                                    ) : null}
                                    <ProBadge role="freelancer" isPro={publicUser?.isProFreelancer} size="md" />
                                </div>
                                {publicUser?.username && (
                                  <p className="text-sm font-semibold text-blue-600 break-all">{cleanBaseUrl}/u/{publicUser.username}</p>
                                )}
                                <p className="text-lg text-gray-600 font-medium">{profile?.title || "-"}</p>
                                <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500 sm:justify-start">
                                    <span className="inline-flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      {followersCount} followers
                                    </span>
                                    {publicGender && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                        {publicGender}
                                      </span>
                                    )}
                                    {publicBirthMonthDay && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                        Born {publicBirthMonthDay}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-500 sm:justify-start">
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-4 h-4" /> {profile?.location || "-"}
                                    </span>
                                    <span className="hidden sm:inline">&middot;</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                        {loading ? 'Loading' : 'Available'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
                            {isOwner ? (
                                <button
                                  onClick={() => setShowInlineEditor((prev) => !prev)}
                                  className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 sm:flex-none"
                                >
                                    {showInlineEditor ? 'Close Editor' : 'Edit Profile'}
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={followState.isFollowing ? handleUnfollow : handleFollow}
                                        disabled={followLoading}
                                        className={`flex-1 rounded-lg border px-6 py-2 font-medium transition sm:flex-none ${
                                          followState.isFollowing
                                            ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                            : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        {followLoading ? 'Working...' : followState.isFollowing ? 'Following' : 'Follow'}
                                    </button>
                                    <button
                                        onClick={handleContact}
                                        className="flex-1 rounded-lg border border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 transition hover:bg-gray-50 sm:flex-none"
                                    >
                                        Contact
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="mt-8 overflow-x-auto">
                        <div className="flex min-w-max gap-6 border-b border-gray-200 px-1">
                            {[
                                { id: 'overview', label: 'Overview' },
                                storefrontHasTab ? { id: 'storefront', label: 'Storefront' } : null,
                                { id: 'portfolio', label: 'Portfolio' },
                                { id: 'reviews', label: 'Reviews' },
                                { id: 'followers', label: 'Followers' }
                            ]
                                .filter((tab): tab is { id: string; label: string } => Boolean(tab))
                                .map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`shrink-0 pb-4 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600' 
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

        {isOwner && showInlineEditor && (
          <div className="border-t border-gray-100 bg-gray-50 p-6">
            <Suspense
              fallback={
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                  Loading profile editor...
                </div>
              }
            >
              <EditProfile isEmbedded={true} />
            </Suspense>
          </div>
        )}

                {activeTab === 'overview' && (
                  <div className="bg-gray-50 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Intro Video */}
                        {profile?.introVideoUrl && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                    <PlayCircle className="w-5 h-5 mr-2 text-blue-600" /> Intro Video
                                </h3>
                                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                                    <video controls className="w-full h-full">
                                        <source src={profile.introVideoUrl} type="video/mp4" />
                                        Your browser does not support the video tag.
                                    </video>
                                </div>
                            </div>
                        )}

                        {/* About */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">About Me</h3>
                            <p className="text-gray-600 leading-relaxed">{profile?.bio || "No bio provided yet."}</p>
                        </div>

                        {/* Pinned & Highlighted posts (My Posts pin/highlight → Overview) */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Pin className="w-5 h-5 text-amber-600" aria-hidden />
                                Featured posts
                              </h3>
                              <p className="mt-1 text-sm text-gray-500">
                                Posts this member pinned or highlighted for visitors.
                              </p>
                            </div>
                            {featuredPostsLoading ? (
                              <span className="text-xs text-gray-400">Loading…</span>
                            ) : null}
                          </div>
                          {!featuredPostsLoading && featuredPosts.length === 0 ? (
                            <EmptyState
                              title="No featured posts yet"
                              description={
                                isOwner
                                  ? 'Pin or highlight posts from My Posts to show them here on your Overview.'
                                  : 'This member has not pinned or highlighted any posts yet.'
                              }
                              className="border-0 bg-slate-50 p-4 shadow-none"
                            />
                          ) : (
                            <div className="space-y-4">
                              {featuredPosts.map((post) => {
                                const attachments = Array.isArray(post.attachments) ? post.attachments : [];
                                const isPinned = Boolean(post.isPinned);
                                const isHighlighted = Boolean(post.isHighlighted ?? post.is_highlighted);
                                const preview =
                                  String(post.content || '')
                                    .replace(/\s+/g, ' ')
                                    .trim()
                                    .slice(0, 220) || 'No caption';
                                return (
                                  <article
                                    key={post.id}
                                    className={`rounded-xl border p-4 ${
                                      isHighlighted
                                        ? 'border-violet-200 bg-violet-50/40'
                                        : 'border-slate-200 bg-white'
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      {isPinned ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                                          <Pin className="h-3 w-3" />
                                          Pinned
                                        </span>
                                      ) : null}
                                      {isHighlighted ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800">
                                          <Sparkles className="h-3 w-3" />
                                          Highlight
                                        </span>
                                      ) : null}
                                      {post.title ? (
                                        <h4 className="text-sm font-semibold text-slate-900">{post.title}</h4>
                                      ) : null}
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{preview}</p>
                                    {attachments.length > 0 ? (
                                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {attachments.slice(0, 3).map((media: any, index: number) => {
                                          const url =
                                            resolvePostAttachmentMediaUrl(media) ||
                                            resolveAssetUrl(String(media?.url || media?.id || '')) ||
                                            '';
                                          const mime = String(media?.mimeType || media?.mime_type || media?.type || '').toLowerCase();
                                          const isVideo =
                                            mime.startsWith('video/') ||
                                            /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
                                          if (!url) return null;
                                          return isVideo ? (
                                            <div
                                              key={`${post.id}-m-${index}`}
                                              className="relative aspect-video overflow-hidden rounded-lg bg-slate-900"
                                            >
                                              <video
                                                src={url}
                                                className="h-full w-full object-cover"
                                                muted
                                                playsInline
                                                preload="metadata"
                                              />
                                            </div>
                                          ) : (
                                            <img
                                              key={`${post.id}-m-${index}`}
                                              src={url}
                                              alt=""
                                              className="aspect-video w-full rounded-lg object-cover bg-slate-100"
                                              loading="lazy"
                                            />
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                    <div className="mt-3">
                                      <Link
                                        to={`/community?post=${encodeURIComponent(post.id)}`}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                      >
                                        View post
                                      </Link>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Experience */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                                <Briefcase className="w-5 h-5 mr-2 text-blue-600" aria-hidden="true" /> Work Experience
                            </h3>
                            {(profile?.experience || []).length === 0 ? (
                              <EmptyState
                                title="No experience listed yet"
                                description={isOwner ? 'Add roles and achievements so clients and collaborators can evaluate your background quickly.' : 'This member has not published work experience yet.'}
                                ctaLabel={isOwner ? 'Edit profile' : undefined}
                                onCtaClick={isOwner ? () => setShowInlineEditor(true) : undefined}
                                className="border-0 bg-slate-50 p-4 shadow-none"
                              />
                            ) : (
                            <div className="space-y-6">
                                {(profile?.experience || []).map((exp: any, index: number) => (
                                    <div key={exp.id || `exp-${index}`} className="relative pl-8 border-l-2 border-gray-100 last:border-0">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-600"></div>
                                        <h4 className="text-base font-bold text-gray-900">{exp.title || 'Untitled role'}</h4>
                                        <div className="text-sm text-gray-500 mb-2">
                                          {exp.company || 'Company'} &middot; {exp.start_date || exp.startDate || '-'} - {exp.end_date || exp.endDate || 'Present'}
                                        </div>
                                        <p className="text-sm text-gray-600">{exp.description || ''}</p>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>

                        {/* Education */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                                <GraduationCap className="w-5 h-5 mr-2 text-blue-600" aria-hidden="true" /> Education
                            </h3>
                            {(profile?.education || []).length === 0 ? (
                              <EmptyState
                                title="No education listed yet"
                                description={isOwner ? 'Add schools and credentials to strengthen professional discovery.' : 'This member has not published education yet.'}
                                ctaLabel={isOwner ? 'Edit profile' : undefined}
                                onCtaClick={isOwner ? () => setShowInlineEditor(true) : undefined}
                                className="border-0 bg-slate-50 p-4 shadow-none"
                              />
                            ) : (
                            <div className="space-y-4">
                                {(profile?.education || []).map((edu: any, index: number) => (
                                    <div key={edu.id || `edu-${index}`} className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-base font-bold text-gray-900">{edu.school || 'School'}</h4>
                                            <p className="text-sm text-gray-600">{edu.degree || 'Degree'}{edu.field_of_study || edu.fieldOfStudy ? `, ${edu.field_of_study || edu.fieldOfStudy}` : ''}</p>
                                        </div>
                                        <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                            {edu.start_year || edu.startYear || '-'} - {edu.end_year || edu.endYear || '-'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        {/* Delivery & Reliability Score */}
                        {trustScore && (
                            <div className="bg-gradient-to-br from-indigo-900 to-blue-900 p-6 rounded-xl shadow-lg text-white">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold flex items-center">
                                        <ShieldCheck className="w-5 h-5 mr-2 text-green-400" /> Trust Score
                                    </h3>
                                    <span className="text-xs bg-white/20 px-2 py-1 rounded">Governed score</span>
                                </div>
                                <div className="flex items-end mb-4">
                                    <span className="text-4xl font-extrabold text-white">{trustScore.overallScore}</span>
                                    <span className="text-indigo-200 mb-1 ml-1">/100</span>
                                </div>
                                <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
                                    {((trustScore as any)?.trustTier || (trustScore as any)?.trust_tier) ? (
                                        <span className="rounded-full bg-white/15 px-2 py-1 font-semibold capitalize text-white">
                                            {(trustScore as any)?.trustTier || (trustScore as any)?.trust_tier}
                                        </span>
                                    ) : null}
                                    {typeof ((trustScore as any)?.completedJobs ?? (trustScore as any)?.completed_jobs) === 'number' ? (
                                        <span className="rounded-full bg-white/10 px-2 py-1 text-indigo-100">
                                            {((trustScore as any)?.completedJobs ?? (trustScore as any)?.completed_jobs)} completed jobs
                                        </span>
                                    ) : null}
                                    {typeof ((trustScore as any)?.responseRate ?? (trustScore as any)?.response_rate) === 'number' ? (
                                        <span className="rounded-full bg-white/10 px-2 py-1 text-indigo-100">
                                            {Math.round((trustScore as any)?.responseRate ?? (trustScore as any)?.response_rate)}% response rate
                                        </span>
                                    ) : null}
                                </div>
                                <div className="space-y-2 text-sm text-indigo-100">
                                    <div className="flex justify-between">
                                        <span>Reliability</span>
                                        <span className="font-bold">{trustScore.reliability}%</span>
                                    </div>
                                    <div className="w-full bg-black/20 rounded-full h-1.5">
                                        <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${trustScore.reliability}%` }}></div>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span>Professionalism</span>
                                        <span className="font-bold">{trustScore.professionalism}%</span>
                                    </div>
                                    <div className="w-full bg-black/20 rounded-full h-1.5">
                                        <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${trustScore.professionalism}%` }}></div>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-indigo-100">
                                    <div className="rounded-lg bg-black/15 px-3 py-2">
                                        <div className="font-semibold text-white">Completion</div>
                                        <div>{Math.round((trustScore as any)?.completionRate ?? (trustScore as any)?.completion_rate ?? 0)}%</div>
                                    </div>
                                    <div className="rounded-lg bg-black/15 px-3 py-2">
                                        <div className="font-semibold text-white">Cancellation</div>
                                        <div>{Math.round((trustScore as any)?.cancellationRate ?? (trustScore as any)?.cancellation_rate ?? 0)}%</div>
                                    </div>
                                    <div className="rounded-lg bg-black/15 px-3 py-2">
                                        <div className="font-semibold text-white">Disputes</div>
                                        <div>{Math.round((trustScore as any)?.disputeRate ?? (trustScore as any)?.dispute_rate ?? 0)}%</div>
                                    </div>
                                </div>
                                {Array.isArray((trustScore as any)?.riskIndicators ?? (trustScore as any)?.risk_indicators) &&
                                ((trustScore as any)?.riskIndicators ?? (trustScore as any)?.risk_indicators).length > 0 ? (
                                    <div className="mt-4 pt-3 border-t border-white/10">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200">Risk Indicators</div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {((trustScore as any)?.riskIndicators ?? (trustScore as any)?.risk_indicators).map((risk: string) => (
                                                <span key={risk} className="rounded-full bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">
                                                    {risk}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {trustScore.trend === 'up' && (
                                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center text-xs text-green-300">
                                        <TrendingUp className="w-3 h-3 mr-1" /> Trending Up this month
                                    </div>
                                )}
                                {trustScore.trend === 'down' && (
                                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center text-xs text-amber-200">
                                        <X className="w-3 h-3 mr-1" /> Needs recovery attention
                                    </div>
                                )}
                            </div>
                        )}

                        {professionalIdentity && (
                            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Professional Identity</p>
                                        <h3 className="mt-2 text-lg font-bold text-gray-900">{formatIdentityVerification(professionalIdentity.verificationStatus, professionalIdentity.isVerified)}</h3>
                                        <p className="mt-1 text-sm leading-6 text-gray-500">
                                            Trustable profile signals connected to reviews, proof of work, certifications, and communities.
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getIdentityTierStyles(professionalIdentity.trustTier)}`}>
                                        {String(professionalIdentity.trustTier || 'growing').replace(/^\w/, (value) => value.toUpperCase())}
                                    </span>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <Star className="mr-1.5 h-3.5 w-3.5 text-amber-400" /> Reviews
                                        </div>
                                        <div className="mt-2 text-xl font-bold text-gray-900">
                                            {Number(professionalIdentity.averageRating || 0).toFixed(1)}
                                        </div>
                                        <div className="text-xs text-gray-500">{professionalIdentity.reviewCount || 0} published reviews</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <CheckCircle className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Proof of Work
                                        </div>
                                        <div className="mt-2 text-xl font-bold text-gray-900">{professionalIdentity.portfolioProofCount || 0}</div>
                                        <div className="text-xs text-gray-500">{professionalIdentity.verifiedPortfolioProofCount || 0} verified proofs</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <Users className="mr-1.5 h-3.5 w-3.5 text-blue-500" /> Communities
                                        </div>
                                        <div className="mt-2 text-xl font-bold text-gray-900">{professionalIdentity.clubCount || 0}</div>
                                        <div className="text-xs text-gray-500">Active community memberships</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <Award className="mr-1.5 h-3.5 w-3.5 text-indigo-500" /> Credentials
                                        </div>
                                        <div className="mt-2 text-xl font-bold text-gray-900">{professionalIdentity.certificationCount || 0}</div>
                                        <div className="text-xs text-gray-500">{professionalIdentity.verifiedCertificationCount || 0} verified certifications</div>
                                    </div>
                                </div>

                                {Array.isArray(professionalIdentity.badges) && professionalIdentity.badges.length > 0 && (
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        {professionalIdentity.badges.map((badge: string) => (
                                            <span key={badge} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {Array.isArray(professionalIdentity.featuredClubs) && professionalIdentity.featuredClubs.length > 0 && (
                                    <div className="mt-5 border-t border-gray-100 pt-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-900">Featured communities</h4>
                                                <p className="mt-1 text-xs text-gray-500">Trusted circles this member is actively part of.</p>
                                            </div>
                                            <Link to="/community/clubs" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                                                View communities
                                            </Link>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {professionalIdentity.featuredClubs.map((club: any) => (
                                                <span key={club.id} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                                                    {club.name} · {club.memberCount || club.member_count || 0}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {Array.isArray(professionalIdentity.topSkills) && professionalIdentity.topSkills.length > 0 && (
                                    <div className="mt-5 border-t border-gray-100 pt-5">
                                        <h4 className="text-sm font-semibold text-gray-900">Top verified strengths</h4>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {professionalIdentity.topSkills.map((skill: string) => (
                                                <span key={skill} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <ProfessionalIntegrationStrip surface="profile" />
                        {isOwner ? <CreatorAnalyticsCard compact /> : null}
                        {isOwner ? <GrowthPulseCard compact className="mt-3" /> : null}
                        {!isOwner ? <PeopleYouMayKnowRail limit={4} /> : null}

                        {/* Stats Card */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Hourly Rate</span>
                                <span className="font-bold text-xl">${profile?.hourlyRate ?? profile?.hourly_rate ?? 0}</span>
                            </div>
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Rating</span>
                                <span className="font-bold flex items-center text-gray-900">
                                    <Star className="w-4 h-4 text-yellow-400 fill-current mr-1"/> {profile?.rating ?? 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Jobs Done</span>
                                <span className="font-bold text-gray-900">{profile?.completedJobs ?? 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Response Time</span>
                                <span className="font-bold text-gray-900">{profile?.responseTime ? `~ ${profile.responseTime} hrs` : '-'}</span>
                            </div>
                        </div>

                        {/* Skills */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4">Skills</h3>
                            {(profile?.skills || []).length === 0 ? (
                              <p className="text-sm text-gray-500">
                                {isOwner ? 'Add skills in Edit Profile so clients can discover your strengths.' : 'No skills listed yet.'}
                              </p>
                            ) : (
                            <div className="flex flex-wrap gap-2">
                                {(profile?.skills || []).map(skill => (
                                    <span key={skill} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                            )}
                        </div>

                        {/* Certifications */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                                <Award className="w-5 h-5 mr-2 text-blue-600" aria-hidden="true" /> Certifications
                            </h3>
                            {(profile?.certifications || []).length === 0 ? (
                              <p className="text-sm text-gray-500">
                                {isOwner ? 'Add certifications to strengthen trust signals.' : 'No certifications listed yet.'}
                              </p>
                            ) : (
                            <div className="space-y-4">
                                {(profile?.certifications || []).map((cert: any, index: number) => (
                                    <div key={cert.id || `cert-${index}`} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="font-bold text-sm text-gray-900">{cert.name || 'Certification'}</div>
                                                <div className="text-xs text-gray-500">{cert.issuer || 'Issuer'} &middot; {cert.issue_date || cert.issueDate || '-'}</div>
                                            </div>
                                            {cert.isVerified && <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {activeTab === 'storefront' && (
                  <div className="bg-gray-50 p-6 md:p-8 space-y-6">
                    {storefrontLoading ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
                        Loading storefront...
                      </div>
                    ) : null}

                    {!storefrontLoading && storefrontMerchantSummary ? (
                      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-6 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Storefront</p>
                            <h3 className="mt-2 text-2xl font-bold text-gray-900">{storefrontMerchantSummary.title || publicUser?.name || 'Storefront'}</h3>
                            {storefrontMerchantSummary.subtitle ? (
                              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{storefrontMerchantSummary.subtitle}</p>
                            ) : null}
                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              {storefrontMerchantSummary.category ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-100/70 px-3 py-1 font-semibold text-emerald-800">
                                  {storefrontMerchantSummary.category}
                                </span>
                              ) : null}
                              {storefrontMerchantSummary.location ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                                  {storefrontMerchantSummary.location}
                                </span>
                              ) : null}
                              {storefrontMerchantSummary.trustTier ? (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold capitalize text-slate-700">
                                  {storefrontMerchantSummary.trustTier}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
                            <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">Services</div>
                              <div className="mt-1 text-2xl font-bold text-gray-900">{storefrontMerchantSummary.serviceCount || 0}</div>
                            </div>
                            <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">Featured</div>
                              <div className="mt-1 text-2xl font-bold text-gray-900">{storefrontMerchantSummary.featuredCount || 0}</div>
                            </div>
                            <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">Price from</div>
                              <div className="mt-1 text-lg font-bold text-gray-900">
                                {storefrontMerchantSummary.priceFrom !== null && storefrontMerchantSummary.priceFrom !== undefined
                                  ? `${String(storefrontMerchantSummary.currency || 'USD').toUpperCase()} ${Number(storefrontMerchantSummary.priceFrom).toFixed(2)}`
                                  : 'Not set'}
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">Response</div>
                              <div className="mt-1 text-lg font-bold text-gray-900">
                                {typeof storefrontMerchantSummary.responseTimeHours === 'number'
                                  ? `~ ${storefrontMerchantSummary.responseTimeHours}h`
                                  : 'Flexible'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!storefrontLoading && storefront?.enabled === false && storefront?.canManage ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Storefront visibility is currently disabled for this profile by platform policy. Your services remain manageable, but the public tab is hidden until storefront access is re-enabled.
                      </div>
                    ) : null}

                    {!storefrontLoading && storefrontFeaturedServices.length > 0 ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Featured Services</h3>
                            <p className="mt-1 text-sm text-gray-500">Top offers pinned for faster conversion from profile visits.</p>
                          </div>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                          {storefrontFeaturedServices.map((gig) => (
                            <GigCard key={`featured_${gig.id}`} gig={gig} />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {!storefrontLoading && storefrontServices.length > 0 ? (
                      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Service Catalog</h3>
                            <p className="mt-1 text-sm text-gray-500">Browse all public storefront services from this profile.</p>
                          </div>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {storefrontServices.map((gig) => (
                            <GigCard key={gig.id} gig={gig} />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {!storefrontLoading && storefront && !storefrontServices.length ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900">No storefront services yet</h3>
                        <p className="mt-2 text-sm text-gray-500">
                          {storefront.canManage
                            ? 'Publish approved gigs to turn this profile into a commerce-ready storefront.'
                            : 'This member has not published storefront services yet.'}
                        </p>
                        {storefront.canManage ? (
                          <div className="mt-4 flex flex-wrap justify-center gap-3">
                            <Link
                              to="/create-gig"
                              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                              Create service
                            </Link>
                            <Link
                              to="/freelancer/dashboard?tab=my-gigs"
                              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Manage gigs
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}

                {activeTab === 'portfolio' && (
                  <div className="bg-gray-50 p-6 md:p-8">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-6">Portfolio</h3>
                      {portfolioItems.length === 0 && (
                        <p className="text-sm text-gray-500">No portfolio items added yet.</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {portfolioItems.map((item) => {
                          const image = resolveAssetUrl((item as any).image_url || (item as any).imageUrl);
                          return (
                            <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                              {image && (
                                <img src={image} alt={item.title} className="h-44 w-full object-cover" />
                              )}
                              <div className="p-4 space-y-2">
                                <h4 className="font-semibold text-gray-900">{item.title || 'Untitled'}</h4>
                                {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
                                {item.link && (
                                  <a href={item.link} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                                    View project
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="bg-gray-50 p-6 md:p-8">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-6">Reviews</h3>
                      {reviewsLoading && (
                        <p className="text-sm text-gray-500">Loading reviews...</p>
                      )}
                      {!reviewsLoading && reviews.length === 0 && (
                        <p className="text-sm text-gray-500">No reviews yet.</p>
                      )}
                      <div className="space-y-4">
                        {reviews.map((review) => (
                          <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <EnterpriseAvatar
                                  src={
                                    resolveUserAvatarUrl(review.author) ||
                                    resolveAssetUrl(review.author?.avatar) ||
                                    undefined
                                  }
                                  name={review.author?.name || 'Reviewer'}
                                  user={review.author}
                                  size="md"
                                  alt={review.author?.name || 'Reviewer'}
                                />
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{review.author?.name || 'Reviewer'}</div>
                                  <div className="text-xs text-gray-500">{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''}</div>
                                </div>
                              </div>
                              <div className="flex items-center text-sm font-semibold text-gray-900">
                                <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                                {review.rating || 0}
                              </div>
                            </div>
                            {review.title && <div className="mt-3 text-sm font-semibold text-gray-800">{review.title}</div>}
                            {review.comment && <p className="mt-2 text-sm text-gray-600">{review.comment}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'followers' && (
                  <div className="bg-gray-50 p-6 md:p-8">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-6">Followers</h3>
                      {followersLoading && (
                        <p className="text-sm text-gray-500">Loading followers...</p>
                      )}
                      {!followersLoading && followersList.length === 0 && (
                        <p className="text-sm text-gray-500">No followers yet.</p>
                      )}
                      <div className="space-y-3">
                        {followersList.map((follower) => {
                          const isBlocked = blockedUserIds.has(follower.id);
                          return (
                            <div key={follower.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                              <Link to={follower.username ? `/u/${follower.username}` : `/profile/${follower.id}`} className="flex items-center gap-3 min-w-0">
                                <EnterpriseAvatar
                                  src={
                                    resolveUserAvatarUrl(follower) ||
                                    resolveAssetUrl(follower.avatar) ||
                                    undefined
                                  }
                                  name={follower.name}
                                  user={follower}
                                  size="md"
                                  alt={follower.name}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-gray-900">{follower.name}</div>
                                  <div className="truncate text-xs text-gray-500">{follower.username ? `@${follower.username}` : 'Member'}</div>
                                </div>
                              </Link>
                              <div className="flex items-center gap-2">
                                <Link
                                  to={follower.username ? `/u/${follower.username}` : `/profile/${follower.id}`}
                                  className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  View
                                </Link>
                                {isOwner && (
                                  <button
                                    onClick={() => handleToggleBlockFollower(follower.id)}
                                    disabled={blockBusyId === follower.id}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                      isBlocked
                                        ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                        : 'border-rose-300 text-rose-700 hover:bg-rose-50'
                                    }`}
                                  >
                                    {blockBusyId === follower.id ? 'Working...' : isBlocked ? 'Unblock' : 'Block'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
            </div>
        </div>

        {activeStory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{activeStory.authorName || publicUser?.name || 'Story'}</p>
                  <p className="text-xs text-gray-500">{activeStory.createdAt ? new Date(activeStory.createdAt).toLocaleString() : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageStory(activeStory) && (
                    <>
                      <button
                        onClick={() => openStoryEditor(activeStory)}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-800"
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStoryDelete(activeStory)}
                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:text-red-600"
                        type="button"
                        disabled={storyActionBusy[activeStory.id]}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button onClick={() => setActiveStory(null)} className="text-gray-500 hover:text-gray-700" type="button">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl bg-gray-100">
                {(() => {
                  const mediaUrl = resolveStoryMediaUrl(activeStory);
                  if (mediaUrl) {
                    return activeStory.type === 'video' ? (
                      <video src={mediaUrl} controls className="h-80 w-full object-cover" />
                    ) : (
                      <img src={mediaUrl} alt="Story" className="h-80 w-full object-cover" />
                    );
                  }
                  const text = resolveStoryContent(activeStory);
                  if (text) {
                    const style = getStoryTextStyle(activeStory);
                    return (
                      <div
                        className="flex h-80 w-full items-center justify-center px-6 text-center"
                        style={{
                          background: style.background,
                          color: style.color,
                          fontFamily: style.fontFamily,
                          textAlign: style.textAlign as any
                        }}
                      >
                        <p className="text-lg font-semibold leading-snug whitespace-pre-wrap">{text}</p>
                      </div>
                    );
                  }
                  return <div className="flex h-80 w-full items-center justify-center text-sm text-gray-500">No media</div>;
                })()}
              </div>
              {(() => {
                const text = resolveStoryContent(activeStory);
                const mediaUrl = resolveStoryMediaUrl(activeStory);
                if (text && mediaUrl) {
                  return <p className="mt-3 text-sm text-gray-700">{text}</p>;
                }
                return null;
              })()}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => handleStoryLike(activeStory)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${activeStory.viewerLiked ? 'border-rose-200 text-rose-600' : 'border-gray-200 text-gray-500'}`}
                  disabled={storyActionBusy[activeStory.id]}
                  type="button"
                >
                  <Heart className={`h-4 w-4 ${activeStory.viewerLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                  {activeStory.likesCount ?? activeStory._count?.likes ?? 0}
                </button>
                <span className="text-xs text-gray-400">{normalizeStoryVisibility(activeStory.visibility)}</span>
              </div>
            </div>
          </div>
        )}

        {storyEditOpen && editingStory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit Story</h3>
                  <p className="text-xs text-gray-500">Update your story content and settings.</p>
                </div>
                <button
                  onClick={() => {
                    setStoryEditOpen(false);
                    setEditingStory(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {editingStory.type === 'text' ? (
                  <div
                    className="flex h-40 w-full items-center justify-center rounded-xl px-6 text-center"
                    style={{
                      background: storyEditPreviewStyle.background,
                      color: storyEditPreviewStyle.color,
                      fontFamily: storyEditPreviewStyle.fontFamily,
                      textAlign: storyEditPreviewStyle.textAlign as any
                    }}
                  >
                    <span className="text-base font-semibold whitespace-pre-wrap">
                      {storyEditDraft.content.trim() ? storyEditDraft.content : 'Type a story...'}
                    </span>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl bg-gray-100">
                    {(() => {
                      const mediaUrl = resolveStoryMediaUrl(editingStory);
                      if (mediaUrl) {
                        return editingStory.type === 'video' ? (
                          <video src={mediaUrl} controls className="h-48 w-full object-cover" />
                        ) : (
                          <img src={mediaUrl} alt="Story media" className="h-48 w-full object-cover" />
                        );
                      }
                      return <div className="flex h-48 w-full items-center justify-center text-sm text-gray-500">No media</div>;
                    })()}
                  </div>
                )}

                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                  value={storyEditDraft.content}
                  onChange={(event) => setStoryEditDraft((prev) => ({ ...prev, content: event.target.value }))}
                  placeholder={editingStory.type === 'text' ? 'Update your story...' : 'Add a caption (optional)'}
                />

                {editingStory.type === 'text' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Background</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {storyTextThemes.map((theme) => (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() =>
                              setStoryEditDraft((prev) => ({
                                ...prev,
                                textBackground: theme.background,
                                textColor: theme.textColor
                              }))
                            }
                            className={`h-10 w-10 rounded-full border-2 ${storyEditDraft.textBackground === theme.background ? 'border-gray-900' : 'border-transparent'}`}
                            style={{ background: theme.background }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Font</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {storyTextFonts.map((font) => (
                          <button
                            key={font.id}
                            type="button"
                            onClick={() => setStoryEditDraft((prev) => ({ ...prev, textFont: font.fontFamily }))}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${storyEditDraft.textFont === font.fontFamily ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-500'}`}
                            style={{ fontFamily: font.fontFamily }}
                          >
                            {font.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold text-gray-500">Visibility</label>
                  <select
                    value={storyEditDraft.visibility}
                    onChange={(event) =>
                      setStoryEditDraft((prev) => ({ ...prev, visibility: normalizeStoryVisibility(event.target.value) }))
                    }
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600"
                  >
                    {storyVisibilityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setStoryEditOpen(false);
                      setEditingStory(null);
                    }}
                    className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveStoryEdit}
                    disabled={storyEditSaving || (editingStory.type === 'text' && !storyEditDraft.content.trim())}
                    className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    type="button"
                  >
                    {storyEditSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default FreelancerProfile;
