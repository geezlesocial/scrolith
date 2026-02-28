import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  FileText,
  Megaphone,
  PenSquare,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  Users
} from 'lucide-react';
import { CommunityService } from '../services/community';
import { RecoService } from '../services/reco';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import MentionText from '../community/components/MentionText';
import PostHeader from '../community/components/PostHeader';
import ReactionBar from '../community/components/ReactionBar';
import PostComments from '../components/PostComments';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { resolveAssetUrl } from '../utils/assetUrl';

type PageState = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  handle?: string | null;
  tagline?: string | null;
  category?: string | null;
  industry?: string | null;
  orgSize?: string | null;
  orgType?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string | null;
  statusReason?: string | null;
  logoFileId?: string | null;
  coverFileId?: string | null;
  logo?: { url?: string | null } | null;
  cover?: { url?: string | null } | null;
  followersCount?: number;
  postsCount?: number;
  isFollowing?: boolean;
  followId?: string | null;
};

type PostState = {
  id: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  authorId?: string;
  authorUserId?: string;
  author?: any;
  businessPage?: any;
  visibility?: string;
  commentPolicy?: string;
  attachments?: Array<{ id?: string; url: string; name?: string; type?: string; mimeType?: string }>;
  interactions?: { comments?: number; reactions?: Record<string, number> };
  userState?: { reaction?: string | null };
};

type UploadedAttachment = {
  id: string;
  url: string;
  name?: string;
  type?: string;
  mimeType?: string;
};

type BusinessFollowingEntry = {
  id: string;
  name?: string;
  username?: string;
  slug?: string;
  handle?: string;
  avatar?: string | null;
  logoFileId?: string | null;
  followId?: string;
  targetType?: 'user' | 'page';
};

type CompanyTab = 'dashboard' | 'posts' | 'followers' | 'following' | 'edit';

type CompanyPageProps = {
  slugOverride?: string;
};

const inferMediaType = (media: { url?: string; mimeType?: string; type?: string }) => {
  const explicit = String(media.type || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const url = String(media.url || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(url)) return 'video';
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  return 'document';
};

const normalizePost = (post: any): PostState => ({
  id: String(post?.id || ''),
  content: post?.content || '',
  createdAt: post?.createdAt || post?.created_at,
  updatedAt: post?.updatedAt || post?.updated_at,
  authorId: post?.authorId || post?.userId || post?.user_id || post?.author?.id,
  authorUserId:
    post?.authorUserId ||
    post?.author_user_id ||
    post?.author?.userId ||
    post?.author?.user_id ||
    null,
  author: post?.author,
  businessPage: post?.businessPage,
  visibility: post?.visibility || 'public',
  commentPolicy: post?.commentPolicy || post?.comment_policy || 'everyone',
  attachments: Array.isArray(post?.attachments)
    ? post.attachments.map((item: any) => ({
        id: item?.id || item?.fileId,
        url: resolveAssetUrl(item?.url || item),
        name: item?.name || item?.originalName,
        type: item?.type || inferMediaType(item),
        mimeType: item?.mimeType || item?.mime_type
      }))
    : [],
  interactions: {
    comments: Number(post?.interactions?.comments || post?.commentsCount || post?.comments_count || 0),
    reactions: post?.interactions?.reactions || {}
  },
  userState: {
    reaction: post?.userState?.reaction || post?.user_state?.reaction || null
  }
});

const CompanyPage: React.FC<CompanyPageProps> = ({ slugOverride }) => {
  const navigate = useNavigate();
  const { slug: routeSlug = '' } = useParams<{ slug: string }>();
  const slug = String(slugOverride || routeSlug || '').trim();
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState<PageState | null>(null);
  const [posts, setPosts] = useState<PostState[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<any[]>([]);
  const [recommendedPages, setRecommendedPages] = useState<any[]>([]);
  const [pageFollowingUsers, setPageFollowingUsers] = useState<Record<string, boolean>>({});
  const [pageFollowingPages, setPageFollowingPages] = useState<Record<string, boolean>>({});
  const [pageFollowingUsersList, setPageFollowingUsersList] = useState<BusinessFollowingEntry[]>([]);
  const [pageFollowingPagesList, setPageFollowingPagesList] = useState<BusinessFollowingEntry[]>([]);
  const [followingBusy, setFollowingBusy] = useState<Record<string, boolean>>({});

  const [followBusy, setFollowBusy] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerBusy, setComposerBusy] = useState(false);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [logoFileId, setLogoFileId] = useState<string | null>(null);
  const [coverFileId, setCoverFileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyTab>('dashboard');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState('');
  const [editingPostBusy, setEditingPostBusy] = useState(false);
  const [pageDetailsBusy, setPageDetailsBusy] = useState(false);
  const [pageForm, setPageForm] = useState({
    name: '',
    handle: '',
    slug: '',
    tagline: '',
    category: '',
    industry: '',
    orgSize: '',
    orgType: '',
    website: '',
    email: '',
    phone: '',
    location: '',
    description: ''
  });

  const isOwner = useMemo(() => {
    if (!user?.id || !page?.ownerId) return false;
    const role = String(user.role || '').toLowerCase();
    return String(user.id) === String(page.ownerId) || role.includes('admin');
  }, [page?.ownerId, user?.id, user?.role]);

  const openPostDetail = useCallback(
    (postId: string) => {
      const id = String(postId || '').trim();
      if (!id) return;
      navigate(`/post/${encodeURIComponent(id)}`);
    },
    [navigate]
  );

  const openPostFromText = useCallback(
    (event: React.MouseEvent<HTMLElement>, postId: string) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, label, video, audio')) return;
      openPostDetail(postId);
    },
    [openPostDetail]
  );

  const loadPageFollowing = useCallback(async (pageId: string) => {
    if (!isOwner) return;
    try {
      const data = await CommunityService.listBusinessPageFollowing(pageId);
      const userMap: Record<string, boolean> = {};
      const pageMap: Record<string, boolean> = {};
      const userList = Array.isArray(data?.users) ? data.users : [];
      const pageList = Array.isArray(data?.pages) ? data.pages : [];
      for (const entry of userList) {
        if (entry?.id) userMap[String(entry.id)] = true;
      }
      for (const entry of pageList) {
        if (entry?.id) pageMap[String(entry.id)] = true;
      }
      setPageFollowingUsers(userMap);
      setPageFollowingPages(pageMap);
      setPageFollowingUsersList(
        userList.map((entry: any) => ({
          id: String(entry?.id || ''),
          name: entry?.name || 'User',
          username: entry?.username || null,
          avatar: entry?.avatar || null,
          followId: entry?.followId,
          targetType: 'user'
        }))
      );
      setPageFollowingPagesList(
        pageList.map((entry: any) => ({
          id: String(entry?.id || ''),
          name: entry?.name || 'Business page',
          slug: entry?.slug || null,
          handle: entry?.handle || null,
          logoFileId: entry?.logoFileId || null,
          followId: entry?.followId,
          targetType: 'page'
        }))
      );
    } catch (error) {
      console.warn('Failed to load page following map', error);
    }
  }, [isOwner]);

  const loadAll = useCallback(
    async (silent = false) => {
      if (!slug) return;
      if (!silent) setLoading(true);
      setRefreshing(true);
      try {
        const [pageData, feedData] = await Promise.all([
          CommunityService.getBusinessPageBySlug(slug),
          CommunityService.getBusinessPageFeed(slug, { limit: 25 })
        ]);

        const normalizedPage: PageState | null = pageData
          ? {
              id: String(pageData.id || ''),
              ownerId: String(pageData.ownerId || ''),
              name: String(pageData.name || 'Business page'),
              slug: String(pageData.slug || slug),
              handle: pageData.handle || null,
              tagline: pageData.tagline || null,
              category: pageData.category || null,
              industry: pageData.industry || null,
              orgSize: pageData.orgSize || null,
              orgType: pageData.orgType || null,
              website: pageData.website || null,
              email: pageData.email || null,
              phone: pageData.phone || null,
              location: pageData.location || null,
              description: pageData.description || null,
              status: pageData.status || 'active',
              statusReason: pageData.statusReason || null,
              logoFileId: pageData.logoFileId || null,
              coverFileId: pageData.coverFileId || null,
              logo: pageData.logo || null,
              cover: pageData.cover || null,
              followersCount: Number(pageData.followersCount || 0),
              postsCount: Number(pageData.postsCount || 0),
              isFollowing: Boolean(pageData.isFollowing),
              followId: pageData.followId || null
            }
          : null;

        setPage(normalizedPage);
        setPosts(
          Array.isArray(feedData?.items)
            ? feedData.items.map(normalizePost).filter((item: PostState) => item.id)
            : []
        );

        if (normalizedPage?.id && user?.id) {
          const [followersData] = await Promise.allSettled([
            CommunityService.listFollowers('page', normalizedPage.id)
          ]);
          if (followersData.status === 'fulfilled') {
            setFollowers(Array.isArray(followersData.value) ? followersData.value : []);
          } else {
            setFollowers([]);
          }

          if (isOwner) {
            await loadPageFollowing(normalizedPage.id);
            const [usersRes, pagesRes] = await Promise.allSettled([
              Promise.allSettled([
                RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 6 }),
                RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 4 })
              ]).then((results) => {
                const freelancerRows =
                  results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
                const clientRows =
                  results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
                const merged = [...freelancerRows, ...clientRows];
                if (merged.length) return merged;
                return CommunityService.getTopContributors(8);
              }),
              RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: 8 }).catch(() =>
                CommunityService.getRecommendedBusinessPages(8)
              )
            ]);
            if (usersRes.status === 'fulfilled') {
              setRecommendedUsers(
                (Array.isArray(usersRes.value) ? usersRes.value : [])
                  .map((entry: any) => {
                    const account = entry?.account || entry;
                    const id = String(account?.id || entry?.entityId || entry?.id || '').trim();
                    if (!id) return null;
                    return {
                      id,
                      name: account?.name || entry?.name || entry?.displayName || 'User',
                      username: account?.username || entry?.username || null,
                      avatar: account?.avatar || entry?.avatar || null
                    };
                  })
                  .filter(Boolean)
              );
            }
            if (pagesRes.status === 'fulfilled') {
              setRecommendedPages(
                (Array.isArray(pagesRes.value) ? pagesRes.value : [])
                  .map((entry: any) => {
                    const account = entry?.account || entry;
                    const id = String(account?.id || entry?.entityId || entry?.id || '').trim();
                    if (!id) return null;
                    return {
                      id,
                      name: account?.name || entry?.name || 'Business page',
                      slug: account?.pageSlug || account?.slug || entry?.slug || id,
                      handle: account?.pageHandle || account?.handle || entry?.handle || null,
                      avatar: account?.avatar || entry?.avatar || null
                    };
                  })
                  .filter(
                    (entry: any) =>
                      entry &&
                      String(entry.id || '') !== String(normalizedPage.id)
                  )
              );
            }
          } else {
            setRecommendedUsers([]);
            setRecommendedPages([]);
            setPageFollowingUsers({});
            setPageFollowingPages({});
            setPageFollowingUsersList([]);
            setPageFollowingPagesList([]);
          }
        }
      } catch (error: any) {
        console.error('Failed to load company page', error);
        showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to load page.');
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [isOwner, loadPageFollowing, showNotification, slug, user?.id]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!page) return;
    setPageForm({
      name: page.name || '',
      handle: page.handle || '',
      slug: page.slug || '',
      tagline: page.tagline || '',
      category: page.category || '',
      industry: page.industry || '',
      orgSize: page.orgSize || '',
      orgType: page.orgType || '',
      website: page.website || '',
      email: page.email || '',
      phone: page.phone || '',
      location: page.location || '',
      description: page.description || ''
    });
    setLogoFileId(page.logoFileId || null);
    setCoverFileId(page.coverFileId || null);
  }, [
    page?.id,
    page?.name,
    page?.handle,
    page?.slug,
    page?.tagline,
    page?.category,
    page?.industry,
    page?.orgSize,
    page?.orgType,
    page?.website,
    page?.email,
    page?.phone,
    page?.location,
    page?.description,
    page?.logoFileId,
    page?.coverFileId
  ]);

  useEffect(() => {
    if (!page?.id) return;

    const onPostCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const post = detail?.post || detail;
      if (!post?.id) return;
      const postPageId = String(post?.businessPage?.id || '');
      const postPageSlug = String(post?.businessPage?.slug || post?.author?.businessSlug || '');
      if (postPageId !== String(page.id) && postPageSlug !== String(page.slug)) return;
      const normalized = normalizePost(post);
      setPosts((prev) => {
        if (prev.some((entry) => String(entry.id) === String(normalized.id))) return prev;
        return [normalized, ...prev];
      });
      setPage((prev) =>
        prev
          ? {
              ...prev,
              postsCount: Number(prev.postsCount || 0) + 1
            }
          : prev
      );
    };

    const onPostUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const post = detail?.post || detail;
      if (!post?.id) return;
      const postPageId = String(post?.businessPage?.id || '');
      const postPageSlug = String(post?.businessPage?.slug || post?.author?.businessSlug || '');
      if (postPageId !== String(page.id) && postPageSlug !== String(page.slug)) return;
      const normalized = normalizePost(post);
      setPosts((prev) => prev.map((entry) => (String(entry.id) === String(normalized.id) ? { ...entry, ...normalized } : entry)));
    };

    const onPostDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const postId = String(detail?.postId || '');
      if (!postId) return;
      setPosts((prev) => prev.filter((entry) => String(entry.id) !== postId));
      setPage((prev) =>
        prev
          ? {
              ...prev,
              postsCount: Math.max(0, Number(prev.postsCount || 0) - 1)
            }
          : prev
      );
    };

    const onPageUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const incomingPage = detail?.page;
      const pageId = String(detail?.pageId || incomingPage?.id || '');
      if (pageId && pageId === String(page.id)) {
        if (incomingPage && typeof incomingPage === 'object') {
          setPage((prev) =>
            prev
              ? {
                  ...prev,
                  followersCount:
                    incomingPage.followersCount !== undefined
                      ? Number(incomingPage.followersCount || 0)
                      : prev.followersCount,
                  postsCount:
                    incomingPage.postsCount !== undefined
                      ? Number(incomingPage.postsCount || 0)
                      : prev.postsCount,
                  status: incomingPage.status || (prev as any).status
                }
              : prev
          );
          void loadAll(true);
        } else {
          void loadAll(true);
        }
      }
    };

    const onFollowUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const targetType = String(detail?.targetType || '').toLowerCase();
      if (targetType !== 'page') return;
      const targetId = String(detail?.targetId || '');
      if (targetId !== String(page.id)) return;
      const action = String(detail?.action || '').toLowerCase();
      setPage((prev) => {
        if (!prev) return prev;
        const delta = action === 'unfollow' ? -1 : 1;
        return { ...prev, followersCount: Math.max(0, Number(prev.followersCount || 0) + delta) };
      });
      if (isOwner) {
        void loadAll(true);
      }
    };

    window.addEventListener('community:post_created', onPostCreated as EventListener);
    window.addEventListener('community:post_updated', onPostUpdated as EventListener);
    window.addEventListener('community:post_deleted', onPostDeleted as EventListener);
    window.addEventListener('community:business_page_updated', onPageUpdated as EventListener);
    window.addEventListener('community:follow_updated', onFollowUpdated as EventListener);
    return () => {
      window.removeEventListener('community:post_created', onPostCreated as EventListener);
      window.removeEventListener('community:post_updated', onPostUpdated as EventListener);
      window.removeEventListener('community:post_deleted', onPostDeleted as EventListener);
      window.removeEventListener('community:business_page_updated', onPageUpdated as EventListener);
      window.removeEventListener('community:follow_updated', onFollowUpdated as EventListener);
    };
  }, [isOwner, loadAll, page?.id, page?.slug]);

  const handleFollowPage = async () => {
    if (!page?.id) return;
    if (!user?.id) {
      if (window.confirm('Log in to follow this page?')) window.location.href = '/auth/login';
      return;
    }
    if (isOwner) return;

    setFollowBusy(true);
    const previous = { isFollowing: Boolean(page.isFollowing), followId: page.followId || null };
    try {
      if (page.isFollowing && page.followId) {
        await CommunityService.unfollowTarget(page.followId);
        setPage((prev) =>
          prev
            ? {
                ...prev,
                isFollowing: false,
                followId: null,
                followersCount: Math.max(0, Number(prev.followersCount || 0) - 1)
              }
            : prev
        );
      } else {
        const response = await CommunityService.followTarget({ targetType: 'page', targetId: page.id });
        const followId = response?.id || response?.followId || response?.data?.id || null;
        setPage((prev) =>
          prev
            ? {
                ...prev,
                isFollowing: true,
                followId,
                followersCount: Number(prev.followersCount || 0) + 1
              }
            : prev
        );
      }
    } catch (error: any) {
      setPage((prev) => (prev ? { ...prev, isFollowing: previous.isFollowing, followId: previous.followId } : prev));
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const normalizeUploadedAttachment = useCallback((file: any): UploadedAttachment | null => {
    const id = String(file?.id || '').trim();
    if (!id) return null;
    return {
      id,
      url: resolveAssetUrl(file?.url || ''),
      name: file?.name || file?.originalName,
      type: file?.type || inferMediaType({ url: file?.url, mimeType: file?.mime_type || file?.mimeType }),
      mimeType: file?.mime_type || file?.mimeType
    };
  }, []);

  const mergeAttachments = useCallback((incoming: UploadedAttachment[]) => {
    if (!incoming.length) return;
    setAttachments((prev) => {
      const map = new Map<string, UploadedAttachment>();
      for (const entry of prev) {
        if (entry?.id) map.set(String(entry.id), entry);
      }
      for (const entry of incoming) {
        if (entry?.id) map.set(String(entry.id), entry);
      }
      return Array.from(map.values());
    });
  }, []);

  const handleAttachmentSelect = useCallback((file: any) => {
    const normalized = normalizeUploadedAttachment(file);
    if (!normalized) return;
    mergeAttachments([normalized]);
    showNotification('success', 'Business Page', 'Attachment added.');
  }, [mergeAttachments, normalizeUploadedAttachment, showNotification]);

  const handleAttachmentSelectMultiple = useCallback((files: any[]) => {
    const normalized = (Array.isArray(files) ? files : [])
      .map((file) => normalizeUploadedAttachment(file))
      .filter((file): file is UploadedAttachment => Boolean(file));
    if (!normalized.length) return;
    mergeAttachments(normalized);
    showNotification('success', 'Business Page', `${normalized.length} attachment(s) ready.`);
  }, [mergeAttachments, normalizeUploadedAttachment, showNotification]);

  const handleLogoSelect = useCallback((file: any) => {
    const id = String(file?.id || '').trim();
    if (!id) return;
    setLogoFileId(id);
    setPage((prev) =>
      prev
        ? {
            ...prev,
            logoFileId: id,
            logo: {
              ...(prev.logo || {}),
              url: resolveAssetUrl(file?.url || prev.logo?.url || '')
            }
          }
        : prev
    );
    showNotification('success', 'Business Page', 'Logo selected. Save details to apply.');
  }, [showNotification]);

  const handleCoverSelect = useCallback((file: any) => {
    const id = String(file?.id || '').trim();
    if (!id) return;
    setCoverFileId(id);
    setPage((prev) =>
      prev
        ? {
            ...prev,
            coverFileId: id,
            cover: {
              ...(prev.cover || {}),
              url: resolveAssetUrl(file?.url || prev.cover?.url || '')
            }
          }
        : prev
    );
    showNotification('success', 'Business Page', 'Cover selected. Save details to apply.');
  }, [showNotification]);

  const handleCreatePost = async () => {
    if (!page?.id || !isOwner) return;
    const content = composerText.trim();
    const attachmentIds = attachments.map((item) => item.id).filter(Boolean);
    if (!content && !attachmentIds.length) {
      showNotification('warning', 'Business Page', 'Add text or at least one attachment.');
      return;
    }

    setComposerBusy(true);
    try {
      const created = await CommunityService.createBusinessPagePost(page.id, {
        content,
        attachments: attachmentIds,
        visibility: 'public'
      });
      if (created?.id) {
        setPosts((prev) => [normalizePost(created), ...prev]);
        setPage((prev) => (prev ? { ...prev, postsCount: Number(prev.postsCount || 0) + 1 } : prev));
      }
      setComposerText('');
      setAttachments([]);
      showNotification('success', 'Business Page', 'Post published.');
    } catch (error: any) {
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to publish post.');
    } finally {
      setComposerBusy(false);
    }
  };

  const togglePageFollowing = async (targetType: 'user' | 'page', targetId: string) => {
    if (!page?.id || !isOwner || !targetId) return;
    const key = `${targetType}:${targetId}`;
    if (followingBusy[key]) return;

    const isFollowing =
      targetType === 'user' ? Boolean(pageFollowingUsers[targetId]) : Boolean(pageFollowingPages[targetId]);
    setFollowingBusy((prev) => ({ ...prev, [key]: true }));

    try {
      if (isFollowing) {
        await CommunityService.unfollowFromBusinessPage(page.id, { targetType, targetId });
        if (targetType === 'user') {
          setPageFollowingUsers((prev) => ({ ...prev, [targetId]: false }));
        } else {
          setPageFollowingPages((prev) => ({ ...prev, [targetId]: false }));
        }
      } else {
        await CommunityService.followFromBusinessPage(page.id, { targetType, targetId });
        if (targetType === 'user') {
          setPageFollowingUsers((prev) => ({ ...prev, [targetId]: true }));
        } else {
          setPageFollowingPages((prev) => ({ ...prev, [targetId]: true }));
        }
      }
      await loadPageFollowing(page.id);
    } catch (error: any) {
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to update follow.');
    } finally {
      setFollowingBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const startEditPost = (post: PostState) => {
    if (!isOwner || !post?.id) return;
    setEditingPostId(post.id);
    setEditingPostContent(String(post.content || ''));
  };

  const cancelEditPost = () => {
    setEditingPostId(null);
    setEditingPostContent('');
  };

  const saveEditedPost = async () => {
    if (!editingPostId) return;
    const content = editingPostContent.trim();
    if (!content) {
      showNotification('warning', 'Business Page', 'Post content cannot be empty.');
      return;
    }
    setEditingPostBusy(true);
    try {
      const updated = await CommunityService.updatePost(editingPostId, { content });
      if (updated?.id) {
        const normalized = normalizePost(updated);
        setPosts((prev) => prev.map((item) => (String(item.id) === String(editingPostId) ? { ...item, ...normalized } : item)));
      }
      cancelEditPost();
      showNotification('success', 'Business Page', 'Post updated.');
    } catch (error: any) {
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to update post.');
    } finally {
      setEditingPostBusy(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!isOwner || !postId) return;
    const confirmed = window.confirm('Delete this post?');
    if (!confirmed) return;
    try {
      await CommunityService.deletePost(postId);
      setPosts((prev) => prev.filter((item) => String(item.id) !== String(postId)));
      setPage((prev) =>
        prev
          ? {
              ...prev,
              postsCount: Math.max(0, Number(prev.postsCount || 0) - 1)
            }
          : prev
      );
      showNotification('success', 'Business Page', 'Post deleted.');
    } catch (error: any) {
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to delete post.');
    }
  };

  const handlePageFieldChange = (field: keyof typeof pageForm, value: string) => {
    setPageForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePageDetails = async () => {
    if (!isOwner || !page?.id) return;
    const payload: Record<string, any> = {
      name: pageForm.name.trim(),
      handle: pageForm.handle.trim(),
      slug: pageForm.slug.trim(),
      tagline: pageForm.tagline.trim(),
      category: pageForm.category.trim(),
      industry: pageForm.industry.trim(),
      orgSize: pageForm.orgSize.trim(),
      orgType: pageForm.orgType.trim(),
      website: pageForm.website.trim(),
      email: pageForm.email.trim(),
      phone: pageForm.phone.trim(),
      location: pageForm.location.trim(),
      description: pageForm.description.trim()
    };
    if (logoFileId) payload.logoFileId = logoFileId;
    if (coverFileId) payload.coverFileId = coverFileId;

    if (!payload.name) {
      showNotification('warning', 'Business Page', 'Business name is required.');
      return;
    }

    setPageDetailsBusy(true);
    try {
      const updated = await CommunityService.updateBusinessPage(page.id, payload);
      if (updated?.id) {
        setPage((prev) =>
          prev
            ? {
                ...prev,
                ...updated,
                logoFileId: updated.logoFileId || logoFileId || prev.logoFileId || null,
                coverFileId: updated.coverFileId || coverFileId || prev.coverFileId || null,
                logo: updated.logo || prev.logo,
                cover: updated.cover || prev.cover
              }
            : prev
        );
      }
      showNotification('success', 'Business Page', 'Page details saved.');
      await loadAll(true);
    } catch (error: any) {
      showNotification('error', 'Business Page', error?.response?.data?.error || 'Unable to save page.');
    } finally {
      setPageDetailsBusy(false);
    }
  };

  const ownerTabs: Array<{ id: CompanyTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'posts', label: 'Page posts', icon: FileText },
    { id: 'followers', label: 'Followers', icon: Users },
    { id: 'following', label: 'Following', icon: UserPlus },
    { id: 'edit', label: 'Edit page', icon: Settings }
  ];
  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const left = new Date(a.createdAt || 0).getTime();
        const right = new Date(b.createdAt || 0).getTime();
        return right - left;
      }),
    [posts]
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading page...</div>
      </div>
    );
  }

  if (!page?.id) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">Business page not found.</div>
      </div>
    );
  }

  const logoUrl = resolveAssetUrl(page.logo?.url || '');
  const coverUrl = resolveAssetUrl(page.cover?.url || '');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-44 w-full bg-slate-100">
          {coverUrl ? <img src={coverUrl} alt={page.name} className="h-full w-full object-cover" /> : null}
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {logoUrl ? (
                  <img src={logoUrl} alt={page.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-slate-900">{page.name}</h1>
                <p className="text-sm text-slate-500">
                  @{page.handle || page.slug} {page.tagline ? `· ${page.tagline}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {Number(page.followersCount || 0)} followers · {Number(page.postsCount || 0)} posts
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAll(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {!isOwner ? (
                <button
                  type="button"
                  disabled={followBusy}
                  onClick={handleFollowPage}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    page.isFollowing
                      ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-60`}
                >
                  {page.isFollowing ? 'Following' : 'Follow'}
                </button>
              ) : (
                <Link
                  to={`/my-ads?source=business-page&pageId=${encodeURIComponent(page.id)}&pageSlug=${encodeURIComponent(page.slug || '')}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Megaphone className="h-4 w-4" />
                  Promote Page
                </Link>
              )}
            </div>
          </div>
          {page.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{page.description}</p> : null}
        </div>
      </section>

      <div className={`mt-6 grid grid-cols-1 gap-6 ${isOwner ? 'lg:grid-cols-[220px,minmax(0,1fr),340px]' : 'lg:grid-cols-[minmax(0,1fr),340px]'}`}>
        {isOwner ? (
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-3">
              <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Manage Page</h3>
              <div className="space-y-1">
                {ownerTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="text-xs uppercase tracking-wide text-slate-500">Performance</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Followers</p>
                  <p className="text-lg font-semibold text-slate-900">{Number(page.followersCount || 0)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Posts</p>
                  <p className="text-lg font-semibold text-slate-900">{Number(page.postsCount || 0)}</p>
                </div>
              </div>
            </section>
          </aside>
        ) : null}
        <main className="space-y-4">
          {isOwner && (activeTab === 'dashboard' || activeTab === 'posts') ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Post as {page.name}</h2>
              <textarea
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Share an update with your followers..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {attachments.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((item) => (
                    <div key={item.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                      <span className="max-w-[180px] truncate">{item.name || item.id}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((entry) => entry.id !== item.id))}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAttachmentPickerOpen(true)}
                    disabled={composerBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    Add images / videos / files
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={composerBusy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {composerBusy ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </section>
          ) : null}

          {isOwner && activeTab === 'dashboard' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Page dashboard</h3>
              <p className="mt-1 text-xs text-slate-500">Quick overview of your page growth and activity.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Total followers</p>
                  <p className="text-lg font-semibold text-slate-900">{Number(page.followersCount || 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Total posts</p>
                  <p className="text-lg font-semibold text-slate-900">{Number(page.postsCount || 0)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Following</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {Number(pageFollowingUsersList.length + pageFollowingPagesList.length)}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {(!isOwner || activeTab === 'posts' || activeTab === 'dashboard') &&
            (isOwner && activeTab === 'dashboard' ? sortedPosts.slice(0, 3) : sortedPosts).map((post) => (
            <article key={post.id} id={`company-post-${post.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <PostHeader
                  author={{
                    id: post.author?.id || page.id,
                    username: post.author?.username || page.handle || page.slug,
                    displayName: post.author?.displayName || page.name,
                    avatarUrl: post.author?.avatarUrl || logoUrl,
                    type: 'business',
                    businessSlug: page.slug
                  }}
                  createdAt={post.createdAt}
                  currentUserId={user?.id || ''}
                  showFollow={false}
                />
                {isOwner ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditPost(post)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <PenSquare className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePost(post.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {Object.values(post.interactions?.reactions || {}).reduce((sum, count) => sum + Number(count || 0), 0)} reactions ·{' '}
                {Number(post.interactions?.comments || 0)} comments
              </div>
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                {editingPostId === post.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingPostContent}
                      onChange={(event) => setEditingPostContent(event.target.value)}
                      rows={5}
                      maxLength={5000}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={editingPostBusy}
                        onClick={() => void saveEditedPost()}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {editingPostBusy ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={editingPostBusy}
                        onClick={cancelEditPost}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {post.content ? (
                      <div
                        className="block w-full cursor-pointer text-left"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => openPostFromText(event, post.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openPostDetail(post.id);
                          }
                        }}
                      >
                        <MentionText text={post.content} className="whitespace-pre-wrap" />
                      </div>
                    ) : null}
                    {post.attachments?.length ? (
                      <div className="space-y-2">
                        {post.attachments.map((file) => {
                          const mediaType = inferMediaType(file);
                          if (mediaType === 'image') {
                            return (
                              <button
                                key={file.id || file.url}
                                type="button"
                                onClick={() => openPostDetail(post.id)}
                                className="block w-full text-left"
                              >
                                <img
                                  src={file.url}
                                  alt={file.name || 'Post attachment'}
                                  className="max-h-[420px] w-full rounded-xl object-cover"
                                />
                              </button>
                            );
                          }
                          if (mediaType === 'video') {
                            return (
                              <video
                                key={file.id || file.url}
                                src={file.url}
                                controls
                                className="max-h-[420px] w-full rounded-xl bg-black"
                              />
                            );
                          }
                          return (
                            <a
                              key={file.id || file.url}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-slate-200 px-3 py-2 text-blue-600 hover:bg-slate-50"
                            >
                              {file.name || 'Open file'}
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <ReactionBar
                targetType="POST"
                targetId={post.id}
                initialCounts={post.interactions?.reactions || {}}
                initialUserReaction={post.userState?.reaction || null}
              />
              <PostComments
                postId={post.id}
                authorId={post.authorUserId || post.authorId}
                commentPolicy={post.commentPolicy}
                initialCount={post.interactions?.comments || 0}
              />
            </article>
          ))}

          {(!isOwner || activeTab === 'posts' || activeTab === 'dashboard') && !sortedPosts.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No posts yet.</div>
          ) : null}

          {isOwner && activeTab === 'followers' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Page followers</h3>
              <p className="mt-1 text-xs text-slate-500">Members currently following this business page.</p>
              <div className="mt-3 space-y-2">
                {followers.length ? (
                  followers.map((follower: any) => (
                    <div key={follower.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
                      <Link
                        to={follower.username ? `/u/${String(follower.username).replace(/^@+/, '')}` : `/profile/${follower.id}`}
                        className="flex min-w-0 items-center gap-2"
                      >
                        <img
                          src={resolveAssetUrl(follower.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(follower.name || 'User')}`)}
                          alt={follower.name || 'Follower'}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{follower.name || 'Community member'}</p>
                          <p className="truncate text-xs text-slate-500">@{(follower.username || '').replace(/^@+/, '') || 'member'}</p>
                        </div>
                      </Link>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No followers yet.</p>
                )}
              </div>
            </section>
          ) : null}

          {isOwner && activeTab === 'following' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Following</h3>
              <p className="mt-1 text-xs text-slate-500">Users and pages followed by this business page.</p>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Users</p>
                  <div className="space-y-2">
                    {pageFollowingUsersList.length ? (
                      pageFollowingUsersList.map((entry) => {
                        const id = String(entry.id || '');
                        const busyKey = `user:${id}`;
                        return (
                          <div key={id} className="flex items-center justify-between gap-2">
                            <Link
                              to={entry.username ? `/u/${String(entry.username).replace(/^@+/, '')}` : `/profile/${id}`}
                              className="min-w-0 truncate text-sm text-slate-700 hover:text-slate-900"
                            >
                              {entry.name || 'User'}
                            </Link>
                            <button
                              type="button"
                              disabled={Boolean(followingBusy[busyKey])}
                              onClick={() => void togglePageFollowing('user', id)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Unfollow
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500">Not following users yet.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pages</p>
                  <div className="space-y-2">
                    {pageFollowingPagesList.length ? (
                      pageFollowingPagesList.map((entry) => {
                        const id = String(entry.id || '');
                        const busyKey = `page:${id}`;
                        return (
                          <div key={id} className="flex items-center justify-between gap-2">
                            <Link to={`/company/${entry.slug || id}`} className="min-w-0 truncate text-sm text-slate-700 hover:text-slate-900">
                              {entry.name || 'Business page'}
                            </Link>
                            <button
                              type="button"
                              disabled={Boolean(followingBusy[busyKey])}
                              onClick={() => void togglePageFollowing('page', id)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Unfollow
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500">Not following pages yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {isOwner && activeTab === 'edit' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Edit page profile</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={pageForm.name}
                  onChange={(event) => handlePageFieldChange('name', event.target.value)}
                  placeholder="Page name"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.handle}
                  onChange={(event) => handlePageFieldChange('handle', event.target.value)}
                  placeholder="Handle"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.slug}
                  onChange={(event) => handlePageFieldChange('slug', event.target.value)}
                  placeholder="Slug"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.tagline}
                  onChange={(event) => handlePageFieldChange('tagline', event.target.value)}
                  placeholder="Tagline"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.industry}
                  onChange={(event) => handlePageFieldChange('industry', event.target.value)}
                  placeholder="Industry"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.category}
                  onChange={(event) => handlePageFieldChange('category', event.target.value)}
                  placeholder="Category"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.orgSize}
                  onChange={(event) => handlePageFieldChange('orgSize', event.target.value)}
                  placeholder="Organization size"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.orgType}
                  onChange={(event) => handlePageFieldChange('orgType', event.target.value)}
                  placeholder="Organization type"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.website}
                  onChange={(event) => handlePageFieldChange('website', event.target.value)}
                  placeholder="Website"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.email}
                  onChange={(event) => handlePageFieldChange('email', event.target.value)}
                  placeholder="Business email"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.phone}
                  onChange={(event) => handlePageFieldChange('phone', event.target.value)}
                  placeholder="Phone"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={pageForm.location}
                  onChange={(event) => handlePageFieldChange('location', event.target.value)}
                  placeholder="Location"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Page logo</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{page.logo?.url ? 'Selected logo ready' : 'No logo selected'}</p>
                  <button
                    type="button"
                    onClick={() => setLogoPickerOpen(true)}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Choose logo
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cover image</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{page.cover?.url ? 'Selected cover ready' : 'No cover selected'}</p>
                  <button
                    type="button"
                    onClick={() => setCoverPickerOpen(true)}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Choose cover
                  </button>
                </div>
              </div>
              <textarea
                value={pageForm.description}
                onChange={(event) => handlePageFieldChange('description', event.target.value)}
                rows={5}
                placeholder="Page description"
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  disabled={pageDetailsBusy}
                  onClick={() => void handleSavePageDetails()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {pageDetailsBusy ? 'Saving...' : 'Save details'}
                </button>
              </div>
            </section>
          ) : null}
        </main>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4" />
              Page Followers
            </h3>
            {followers.length ? (
              <div className="space-y-2">
                {followers.slice(0, 10).map((follower: any) => (
                  <Link
                    key={follower.id}
                    to={follower.username ? `/u/${String(follower.username).replace(/^@+/, '')}` : `/profile/${follower.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <img
                      src={resolveAssetUrl(follower.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(follower.name || 'User')}`)}
                      alt={follower.name || 'Follower'}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <span className="truncate text-sm text-slate-700">{follower.name || 'Community member'}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No followers to display.</p>
            )}
          </section>

          {isOwner ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Page Follow Controls</h3>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested Users</p>
                  <div className="space-y-2">
                    {recommendedUsers.slice(0, 6).map((entry: any) => {
                      const id = String(entry?.id || '');
                      const busyKey = `user:${id}`;
                      const following = Boolean(pageFollowingUsers[id]);
                      return (
                        <div key={id} className="flex items-center justify-between gap-2">
                          <Link
                            to={entry?.username ? `/u/${String(entry.username).replace(/^@+/, '')}` : `/profile/${id}`}
                            className="min-w-0 text-sm text-slate-700 hover:text-slate-900"
                          >
                            <span className="truncate">{entry?.name || entry?.displayName || 'User'}</span>
                          </Link>
                          <button
                            type="button"
                            disabled={Boolean(followingBusy[busyKey])}
                            onClick={() => void togglePageFollowing('user', id)}
                            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {following ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                    {!recommendedUsers.length ? <p className="text-xs text-slate-500">No user recommendations yet.</p> : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested Pages</p>
                  <div className="space-y-2">
                    {recommendedPages.slice(0, 6).map((entry: any) => {
                      const id = String(entry?.id || '');
                      const busyKey = `page:${id}`;
                      const following = Boolean(pageFollowingPages[id]);
                      return (
                        <div key={id} className="flex items-center justify-between gap-2">
                          <Link to={`/company/${entry?.slug || id}`} className="min-w-0 text-sm text-slate-700 hover:text-slate-900">
                            <span className="truncate">{entry?.name || 'Business page'}</span>
                          </Link>
                          <button
                            type="button"
                            disabled={Boolean(followingBusy[busyKey])}
                            onClick={() => void togglePageFollowing('page', id)}
                            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {following ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                    {!recommendedPages.length ? <p className="text-xs text-slate-500">No page recommendations yet.</p> : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
      <FilePickerModal
        isOpen={attachmentPickerOpen}
        onClose={() => setAttachmentPickerOpen(false)}
        onSelect={handleAttachmentSelect}
        onSelectMultiple={handleAttachmentSelectMultiple}
        multiple
        allowUpload
        allowCamera
        filterType="all"
        acceptedTypes="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        role={user?.role || 'freelancer'}
        visibility="public"
        title="Attach page media"
      />
      <FilePickerModal
        isOpen={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onSelect={handleLogoSelect}
        allowUpload
        allowCamera
        filterType="image"
        acceptedTypes="image/*"
        role={user?.role || 'freelancer'}
        visibility="public"
        title="Select page logo"
      />
      <FilePickerModal
        isOpen={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onSelect={handleCoverSelect}
        allowUpload
        allowCamera
        filterType="image"
        acceptedTypes="image/*"
        role={user?.role || 'freelancer'}
        visibility="public"
        title="Select cover image"
      />
    </div>
  );
};

export default CompanyPage;

