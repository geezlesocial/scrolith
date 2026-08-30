import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Facebook,
  ExternalLink,
  Link as LinkIcon,
  Linkedin,
  MessageCircle,
  MessageCircleMore,
  Send,
  Share2,
  Twitter
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { MessagingService } from '../../services/messaging';
import { CommunityService } from '../../services/community';
import MobileDialog from '../../components/mobile/MobileDialog';
import { buildPostMessageId, buildPostSocialShareTargets, normalizeShareText } from '../../utils/postShare';

type TabKey = 'message' | 'link' | 'social' | 'network';
type SocialChannel = 'facebook' | 'x' | 'linkedin' | 'whatsapp';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  postId?: string;
  postUrl: string;
  shareText?: string;
  entityLabel?: string;
  onShareToNetwork?: () => void;
  onTrackedShare?: (channel: 'copy' | 'dm' | 'network' | 'social') => Promise<void> | void;
};

const PostShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  postId,
  postUrl,
  shareText,
  entityLabel = 'post',
  onShareToNetwork,
  onTrackedShare
}) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabKey>('message');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [conversations, setConversations] = useState<any[]>([]);

  const resolvedPostUrl = useMemo(() => {
    if (typeof window === 'undefined') return postUrl;
    try {
      return new URL(postUrl, window.location.origin).toString();
    } catch {
      return postUrl;
    }
  }, [postUrl]);

  const shareHeading = useMemo(() => {
    const raw = String(shareText || '').trim();
    if (!raw) return `Check this ${entityLabel} on Scrolith`;
    const firstLine = raw
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean);
    return normalizeShareText(firstLine || raw, 180) || `Check this ${entityLabel} on Scrolith`;
  }, [entityLabel, shareText]);

  const shareSummary = useMemo(() => {
    const raw = String(shareText || '').trim();
    if (!raw) return '';
    const parts = raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (parts.length <= 1) return '';
    return normalizeShareText(parts.slice(1).join(' '), 240);
  }, [shareText]);

  const socialShareText = useMemo(() => {
    const parts = [shareHeading];
    if (shareSummary) parts.push(shareSummary);
    parts.push(resolvedPostUrl);
    return parts.join('\n\n');
  }, [resolvedPostUrl, shareHeading, shareSummary]);

  const socialTargets = useMemo(
    () =>
      buildPostSocialShareTargets({
        postId,
        permalinkUrl: resolvedPostUrl,
        shareHeading,
        shareSummary
      }),
    [postId, resolvedPostUrl, shareHeading, shareSummary]
  );

  const shareToSocial = async (channel: SocialChannel) => {
    try {
      if (user?.id && postId) {
        await CommunityService.postShare(postId, channel);
      }
      await onTrackedShare?.('social');
      onClose();
    } catch (error: any) {
      console.warn('Social share failed', error);
      showNotification('error', 'Share', 'Unable to prepare the social share target.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab(user?.id ? 'message' : 'link');
    setSearch('');
    setSelected({});
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (tab !== 'message') return;
    if (!user?.id) return;
    let active = true;
    setLoading(true);
    MessagingService.getAllConversations(user.id, user.role as any)
      .then((list) => {
        if (!active) return;
        setConversations(Array.isArray(list) ? list : []);
      })
      .catch((error) => {
        console.warn('Failed to load conversations for sharing', error);
        if (active) setConversations([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, tab, user?.id, user?.role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = Array.isArray(conversations) ? conversations : [];
    if (!term) return base;
    return base.filter((c) => {
      const participants = Array.isArray(c?.participants) ? c.participants : [];
      const name = participants.map((p: any) => String(p?.name || '').toLowerCase()).join(' ');
      const username = participants.map((p: any) => String(p?.username || '').toLowerCase()).join(' ');
      return name.includes(term) || username.includes(term);
    });
  }, [conversations, search]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(resolvedPostUrl);
      showNotification('success', 'Share', 'Link copied.');
      if (user?.id && postId) {
        await CommunityService.postShare(postId, 'copy');
      }
      await onTrackedShare?.('copy');
    } catch (error: any) {
      console.warn(error);
      showNotification('error', 'Share', 'Failed to copy the link.');
    }
  };

  const sendToMessages = async () => {
    if (!user?.id) {
      if (confirm('Log in to send this post in messages. Go to login?')) {
        window.location.href = '/auth/login';
      }
      return;
    }
    if (!selectedIds.length) {
      showNotification('warning', 'Share', 'Select at least one conversation.');
      return;
    }
    setBusy(true);
    try {
      const text = socialShareText;
      const shareAttemptId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `share_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      for (const conversationId of selectedIds) {
        await MessagingService.sendMessage(conversationId, user.id, text, String(user.role || 'guest'), [], null, {
          clientMessageId: buildPostMessageId({
            postId,
            conversationId,
            permalinkUrl: resolvedPostUrl,
            shareAttemptId
          })
        });
      }
      if (postId) {
        await CommunityService.postShare(postId, 'dm');
      }
      await onTrackedShare?.('dm');
      showNotification('success', 'Share', `Sent to ${selectedIds.length} conversation(s).`);
      onClose();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to send.';
      showNotification('error', 'Share', message);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <MobileDialog
      open={isOpen}
      onClose={onClose}
      size="md"
      title="Send / Share"
      description={`Share this ${entityLabel} by message, link, or repost.`}
      closeDisabled={busy}
    >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('message')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              tab === 'message' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Message
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('link')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              tab === 'link' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Link
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('social')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              tab === 'social' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Social
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('network')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              tab === 'network' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Network
            </span>
          </button>
        </div>

        {tab === 'message' ? (
          <div className="mt-4">
            {!user?.id ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                Log in to send this post in messages.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || loading}
                    onClick={sendToMessages}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                </div>

                <div className="mt-3 max-h-[340px] overflow-auto rounded-xl border border-slate-200">
                  {loading ? (
                    <div className="p-4 text-sm text-slate-500">Loading conversations...</div>
                  ) : filtered.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">No conversations found.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {filtered.map((c) => {
                        const participants = Array.isArray(c?.participants) ? c.participants : [];
                        const other = participants.find((p: any) => String(p?.id || '') !== String(user.id)) || participants[0];
                        const name = String(other?.name || 'Conversation');
                        const avatar = String(other?.avatar || '');
                        const checked = !!selected[c.id];
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setSelected((prev) => ({ ...prev, [c.id]: !checked }))}
                              className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
                                className="h-4 w-4"
                              />
                              <div className="h-9 w-9 overflow-hidden rounded-full bg-slate-100">
                                {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                                <div className="truncate text-xs text-slate-500">
                                  {c.lastMessage || c.last_message || ''}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Selected: <span className="font-semibold">{selectedIds.length}</span>
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'link' ? (
          <div className="mt-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <LinkIcon className="h-4 w-4 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{resolvedPostUrl}</span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={resolvedPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open in new tab
              </a>
            </div>
          </div>
        ) : null}

        {tab === 'social' ? (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { key: 'facebook', label: 'Facebook', icon: Facebook },
                  { key: 'x', label: 'X', icon: Twitter },
                  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
                  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircleMore }
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <a
                  key={key}
                  href={socialTargets[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void shareToSocial(key);
                  }}
                  className="flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{label}</span>
                </a>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Share this {entityLabel} directly to your social network.
            </div>
          </div>
        ) : null}

        {tab === 'network' ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Share to your network</div>
            <div className="mt-1 text-sm text-slate-600">
              Repost this {entityLabel} so your followers can see it in their feed.
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={async () => {
                  onClose();
                  onShareToNetwork?.();
                  if (postId) {
                    await CommunityService.postShare(postId, 'network');
                  }
                  await onTrackedShare?.('network');
                }}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase text-white"
              >
                Repost {entityLabel}
              </button>
            </div>
          </div>
        ) : null}
    </MobileDialog>
  );
};

export default PostShareModal;
