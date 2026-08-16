
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import {
  MessagingService,
  MessageSearchResult,
  getConversationMergeKey,
  mergeDirectConversations,
  messageMatchesConversation,
  getMessagePreviewText,
  getConversationPreviewText,
  normalizeMessageReactions
} from '../services/messaging';
import { tokenStore } from '../services/tokenStore';
import { Conversation, Message, ProjectBrief, UploadedFile, UserRole } from '../types';
import { Send, Image as ImageIcon, Smile, MoreVertical, ArrowLeft, Sparkles, Loader2, Check, Trash2, ShieldAlert, RefreshCw, X, CornerUpLeft, Copy, Pencil, Star, Phone, Users, Paperclip, Download, Camera, FileText, Search, Shield, Pin, Palette, Video } from 'lucide-react';
import { AIService } from '../services/ai/ai.service';
import { UserService } from '../services/user';
import { useUser } from '../context/UserContext';
import { useMessages } from '../context/MessageContext';
import { useSocket } from '../context/SocketContext';
import { useNotification } from '../context/NotificationContext';
import { useContent } from '../context/ContentContext';
import ProBadge from '../components/ProBadge';
import { FileService } from '../services/files';
import VoiceRecorder from './VoiceRecorder';
import EnterpriseAvatar from '../components/common/EnterpriseAvatar';
import { useVoiceCall } from './VoiceCallProvider';
import { BriefsService } from '../services/briefs';
import { proposalsApi } from '../services/proposals';
import { normalizeDealFlowSettings } from '../utils/dealFlow';
import AcceptProposalContractModal from '../components/contracts/AcceptProposalContractModal';
import { getRecoverableActionMessage } from '../mobile/runtime/requestRecovery';
import MobileDialog, { MobileDialogFooter } from '../components/mobile/MobileDialog';
import { MessageAttachmentsList } from '../components/messaging/MessageAttachmentRenderer';
import ScrolithaEntityCards from '../components/scrolitha/ScrolithaEntityCards';
import ScrolithaConversationMenu from '../components/messaging/ScrolithaConversationMenu';
import SmartComposer from '../components/messaging/SmartComposer';
import GroupManagePanel from '../components/messaging/GroupManagePanel';
import GroupCreateWizard from '../components/messaging/GroupCreateWizard';
import ChatAppearancePanel from '../components/messaging/ChatAppearancePanel';
import ExpandableMessageText from '../components/messaging/ExpandableMessageText';
import {
  appearanceToBackgroundStyle,
  buildChatPalette,
  paletteToCssVars,
  type AppearanceInput
} from '../services/messaging/chatTextColorEngine';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import { extractStoryMessageReference } from '../utils/storyMessageMedia';
import {
  formatMultiRecorderLabel,
  formatMultiTyperLabel,
  resolveGroupComposerRestriction
} from '../utils/groupMessagingUx';
import MessageDeliveryTicks from '../components/messaging/MessageDeliveryTicks';
import MessagingPrivacySettingsPanel from '../components/messaging/MessagingPrivacySettingsPanel';
import ConversationActionsMenu from '../components/messaging/ConversationActionsMenu';
import StoryMessageMediaThumb from '../components/messaging/StoryMessageMediaThumb';
import ScrolithaService from '../services/scrolitha';
import { isScrolithaAuthoredMessage, normalizeScrolithaDisplayText } from '../utils/scrolithaDisplayText';
import {
  getScrolithaProfilePhotoUrl,
  isScrolithaUsername,
  resolveScrolithaAvatar,
  SCROLITHA_DISPLAY_NAME
} from '../utils/scrolithaIdentity';
import { extractMessageAttachments, revokeMessageAttachmentMediaUrls } from '../services/messagingMedia';
import {
  buildThreadTimeline,
  findFirstUnreadIndex,
  isNearBottom,
  markOutgoingState,
  preloadConversationAvatars,
  preloadConversationMedia,
  preserveScrollTopAfterGrowth,
  startMessagingTimer,
  subscribeMessagingEvent,
  trackOutgoingMessage
} from '../services/messagingEngine';
import { computeComposerTextareaHeight, mobileComposerPlaceholder } from './messagesWorkspaceLayout';
import {
  applyLocalReactionToggle,
  buildClientSendId,
  createLocalPendingAttachment,
  getReactionChipEntries,
  hasPendingUploadsInFlight,
  MESSAGE_UPLOAD_CONCURRENCY,
  pendingToAttachmentIds,
  reconcilePendingWithUploadedFile,
  revokePendingObjectUrls,
  runWithConcurrency,
  type PendingComposerAttachment,
  updatePendingAttachment
} from '../services/messagingComposer';
import { dedupeMessagesById, reconcileOptimisticMessage } from '../services/messagingSurfaces';
import { setMessagingMediaConversationAffinity } from '../services/messagingMedia';
import { generateImageBlurPreview, generateVideoPoster } from '../services/messagingEngine/mediaProgressive';
import { uploadMessagingFileWithEngine } from '../services/messagingEngine/mediaUploadEngine';


const QUICK_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];
const MESSAGE_UPLOAD_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar';

type AttachmentDisplay = {
  id: string;
  fileId?: string;
  url: string;
  name: string;
  type: string;
  size?: number;
  mimeType?: string;
};

type AttachmentPreviewResource = {
  objectUrl?: string;
  loading: boolean;
  mimeType?: string;
  error?: string;
};

const VoiceCallControls: React.FC<{
  disabled?: boolean;
  canConference?: boolean;
  canVideo?: boolean;
  conversationId?: string | null;
  callTargets?: { id: string; name: string; avatar?: string }[];
  participantUsers?: { id: string; name: string; avatar?: string }[];
  onError: (message: string) => void;
}> = ({
  disabled,
  canConference,
  canVideo,
  conversationId,
  callTargets,
  participantUsers: roster,
  onError
}) => {
  const { startCall } = useVoiceCall();

  const handleStart = async (options?: { conference?: boolean; video?: boolean }) => {
    try {
      await startCall({
        conference: Boolean(options?.conference),
        video: Boolean(options?.video),
        conversationId: conversationId || undefined,
        callTargets: callTargets,
        participantUsers: roster
      });
    } catch (error: any) {
      onError(error?.message || 'Unable to start call.');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleStart({ conference: false, video: false })}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 sm:w-10 sm:px-0"
        title="Start voice call"
        aria-label="Start voice call"
        data-testid="messages-voice-call-btn"
      >
        <Phone className="h-4 w-4" />
        <span className="text-xs font-semibold sm:sr-only">Voice</span>
      </button>
      {canVideo ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void handleStart({ conference: false, video: true })}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 sm:w-10 sm:px-0"
          title="Start video call"
          aria-label="Start video call"
          data-testid="messages-video-call-btn"
        >
          <Video className="h-4 w-4" />
          <span className="text-xs font-semibold sm:sr-only">Video call</span>
        </button>
      ) : null}
      {canConference ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void handleStart({ conference: true, video: false })}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-gray-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 sm:w-10 sm:px-0"
          title="Start conference call"
          aria-label="Start conference call"
          data-testid="messages-conference-call-btn"
        >
          <Users className="h-4 w-4" />
          <span className="text-xs font-semibold sm:sr-only">Conference</span>
        </button>
      ) : null}
    </div>
  );
};

const Messages = () => {
  const { conversationId, inviteCode: inviteCodeParam } = useParams<{
    conversationId?: string;
    inviteCode?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useUser();
  const { showNotification } = useNotification();
  const {
    refreshMessages,
    registerVisibleConversation,
    unregisterVisibleConversation
  } = useMessages();
  const { socket, isConnected, connectionHealth } = useSocket();
  const { settings } = useContent();
  
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingComposerAttachment[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showGroupManage, setShowGroupManage] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  /** Phase 29.3 — enterprise group profile for active conversation */
  const [activeGroupProfile, setActiveGroupProfile] = useState<any>(null);
  const [groupPins, setGroupPins] = useState<any[]>([]);
  const [chatAppearance, setChatAppearance] = useState<AppearanceInput>({ kind: 'none' });
  const [chatAppearanceLoading, setChatAppearanceLoading] = useState(false);
  const [chatAppearanceOpen, setChatAppearanceOpen] = useState(false);
  const [groupSendAckStatus, setGroupSendAckStatus] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showMessageSettings, setShowMessageSettings] = useState(false);
  const [messageSettingsTab, setMessageSettingsTab] = useState<'privacy' | 'inbox' | 'safety'>('privacy');
  const jumpAroundInFlightRef = useRef<string | null>(null);
  const [messageSettings, setMessageSettings] = useState({
      messageRequestsNotifications: true,
      allowInMail: true
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [voiceRuntimeConfig, setVoiceRuntimeConfig] = useState({
      enabledVoiceCalls: true,
      enabledConferenceCalls: true,
      enabledVideoCalls: true,
      enabledVoiceNotes: true,
      maxParticipants: 20,
      maxVoiceNoteDurationSeconds: 180,
      blockedForCurrentUser: false
  });
  const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
  /** Phase 20.7.2 — visible Scrolitha response lifecycle (no silent failure) */
  const [scrolithaThinking, setScrolithaThinking] = useState(false);
  const [scrolithaError, setScrolithaError] = useState<string | null>(null);
  const lastScrolithaPromptRef = useRef<{ text: string; attachmentIds: string[]; replyToMessageId: string | null } | null>(null);
  const [dealFlowConfig, setDealFlowConfig] = useState(() => normalizeDealFlowSettings(null));
  const [showBriefComposer, setShowBriefComposer] = useState(false);
  const [briefComposerBusy, setBriefComposerBusy] = useState(false);
  const [briefDraft, setBriefDraft] = useState<Partial<ProjectBrief>>({});
  const [showProposalComposer, setShowProposalComposer] = useState(false);
  const [proposalComposerBusy, setProposalComposerBusy] = useState(false);
  const [proposalBrief, setProposalBrief] = useState<ProjectBrief | null>(null);
  const [proposalDraft, setProposalDraft] = useState({
      coverLetter: '',
      proposedAmount: '',
      proposedTimeline: 14
  });
  const [timelineActionBusyId, setTimelineActionBusyId] = useState<string | null>(null);
  const [acceptProposalEvent, setAcceptProposalEvent] = useState<any | null>(null);
  
  // Advanced Features State
  const [typingUser, setTypingUser] = useState<string | null>(null);
  /** Phase 29.3 multi-typer / multi-recorder display label */
  const [presenceIndicatorLabel, setPresenceIndicatorLabel] = useState<string | null>(null);
  const [isGettingAiSuggestion, setIsGettingAiSuggestion] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [attachmentUploadState, setAttachmentUploadState] = useState<{
      fileName: string;
      progress: number;
      uploadedCount: number;
      totalCount: number;
  } | null>(null);
  const [messageActionBusyId, setMessageActionBusyId] = useState<string | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [reactionPanelMessageId, setReactionPanelMessageId] = useState<string | null>(null);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [messageSearchInput, setMessageSearchInput] = useState('');
  const [debouncedMessageSearch, setDebouncedMessageSearch] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<MessageSearchResult[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(
      () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  );
  const [mobileComposerHostHeight, setMobileComposerHostHeight] = useState<number | null>(null);
  const [mobileViewportTop, setMobileViewportTop] = useState(0);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
  const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
  
  const layoutShellRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLUListElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const messagesScrollMetricsRef = useRef({ scrollHeight: 0, scrollTop: 0, clientHeight: 0 });
  const activeConvoIdRef = useRef<string | null>(null);
  const chatAppearanceRequestRef = useRef({ generation: 0, conversationId: '' });
  const lastPreloadConvoRef = useRef<string | null>(null);
  const [showJumpToUnread, setShowJumpToUnread] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingIndicatorTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const messageSearchAbortRef = useRef<AbortController | null>(null);
  const pendingSearchMessageFocusRef = useRef<string | null>(null);
  const messageMediaObjectUrlRef = useRef<Map<string, string>>(new Map());
  const pendingMediaFetchRef = useRef<Set<string>>(new Set());
  const [conversationScrollTop, setConversationScrollTop] = useState(0);
  const [conversationViewportHeight, setConversationViewportHeight] = useState(0);
  const [messageMediaResources, setMessageMediaResources] = useState<Record<string, AttachmentPreviewResource>>({});
  const messageMediaResourcesRef = useRef<Record<string, AttachmentPreviewResource>>({});
  const messagesTraceEnabled =
      ['1', 'true', 'yes', 'on'].includes(String((import.meta as any)?.env?.VITE_MESSAGES_TRACE_DEBUG || '').toLowerCase());

  const searchResultByConversationId = useMemo(() => {
      const map = new Map<string, MessageSearchResult>();
      messageSearchResults.forEach((result) => {
          if (result.conversationId) map.set(result.conversationId, result);
      });
      return map;
  }, [messageSearchResults]);

  const searchConversations = useMemo(
      () =>
          mergeDirectConversations(
              messageSearchResults
                  .map((result) => {
                      const conversation = result.conversation;
                      if (!conversation?.id) return null;
                      return {
                          ...conversation,
                          participants: conversation.participants?.length ? conversation.participants : result.participants,
                          lastMessage: result.lastMessage || conversation.lastMessage || conversation.last_message,
                          last_message: result.lastMessage || conversation.last_message || conversation.lastMessage,
                          unreadCount: result.unreadCount ?? conversation.unreadCount ?? conversation.unread_count,
                          unread_count: result.unreadCount ?? conversation.unread_count ?? conversation.unreadCount
                      } as Conversation;
                  })
                  .filter(Boolean) as Conversation[],
              user?.id
          ),
      [messageSearchResults]
  );

  const dedupedConversations = useMemo(
    () => mergeDirectConversations(conversations, user?.id),
    [conversations, user?.id]
  );

  const traceClient = (event: string, details?: Record<string, any>) => {
      if (!messagesTraceEnabled) return;
      const payload = {
          event,
          timestamp: new Date().toISOString(),
          conversationId: activeConvoIdRef.current,
          userId: userIdRef.current,
          ...(details || {})
      };
      try {
          console.log('[messages-trace][client]', payload);
      } catch {}
      try {
          socket?.emit?.('messages:debug_trace', payload);
      } catch {}
  };

  const emitTypingState = (isTyping: boolean) => {
      if (!socket || !user?.id || !activeConvoIdRef.current) return;
      if (typingActiveRef.current === isTyping) return;
      typingActiveRef.current = isTyping;
      socket.emit('messages:typing', {
          conversationId: activeConvoIdRef.current,
          userId: user.id,
          name: user.name || user.username || 'Someone',
          isTyping
      });
      traceClient('ui.typing_state', {
          conversationId: activeConvoIdRef.current,
          isTyping
      });
  };

  const resetTypingTimers = () => {
      if (typingStopTimerRef.current) {
          window.clearTimeout(typingStopTimerRef.current);
          typingStopTimerRef.current = null;
      }
      if (typingIndicatorTimerRef.current) {
          window.clearTimeout(typingIndicatorTimerRef.current);
          typingIndicatorTimerRef.current = null;
      }
  };

  const handleMessageInputChange = (value: string) => {
      setMessageInput(value);
      if (!socket || !activeConvoIdRef.current || !user?.id) return;
      const hasContent = Boolean(String(value || '').trim());
      if (!hasContent) {
          emitTypingState(false);
          resetTypingTimers();
          return;
      }
      emitTypingState(true);
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = window.setTimeout(() => {
          emitTypingState(false);
          typingStopTimerRef.current = null;
      }, 1600);
  };

  const resizeComposerTextarea = useCallback(() => {
      const textarea = composerTextareaRef.current;
      if (!textarea) return;
      const keyboardOpen = isMobileViewport && mobileKeyboardInset > 96;
      textarea.style.height = '0px';
      const { height, overflowY } = computeComposerTextareaHeight({
          scrollHeight: textarea.scrollHeight,
          isMobile: isMobileViewport,
          keyboardOpen
      });
      textarea.style.height = `${height}px`;
      textarea.style.overflowY = overflowY;
  }, [isMobileViewport, mobileKeyboardInset]);

  const syncMobileComposerHostHeight = useCallback(() => {
      if (typeof window === 'undefined') return;
      const mobile = window.innerWidth < 768;
      setIsMobileViewport(mobile);
      if (!mobile) {
          setMobileComposerHostHeight(null);
          setMobileViewportTop(0);
          setMobileViewportHeight(null);
          setMobileKeyboardInset(0);
          return;
      }
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height || window.innerHeight;
      const viewportTop = viewport?.offsetTop || 0;
      const keyboardInset = Math.max(0, Math.round(window.innerHeight - visibleHeight - viewportTop));
      const shellTop = layoutShellRef.current?.getBoundingClientRect().top ?? 0;
      const availableHeight = Math.floor(visibleHeight - Math.max(shellTop - viewportTop, 0) - 8);
      setMobileViewportTop(Math.max(0, Math.round(viewportTop)));
      setMobileViewportHeight(Math.max(0, Math.floor(visibleHeight)));
      setMobileKeyboardInset(keyboardInset);
      setMobileComposerHostHeight(Math.max(keyboardInset > 0 ? 0 : 360, availableHeight));
  }, []);

  const scrollComposerIntoView = useCallback((behavior: ScrollBehavior = 'smooth') => {
      if (!isMobileViewport || typeof window === 'undefined') return;
      const action = () => {
          composerTextareaRef.current?.scrollIntoView({ behavior, block: 'nearest' });
          messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      };
      window.requestAnimationFrame(action);
      window.setTimeout(action, 120);
  }, [isMobileViewport]);

  useEffect(() => {
      resizeComposerTextarea();
  }, [messageInput, resizeComposerTextarea]);

  useEffect(() => {
      const handler = (event: Event) => {
          const detail = (event as CustomEvent<any>)?.detail || {};
          const type = String(detail?.type || '').trim().toLowerCase();
          if (!type) return;
          if (type === 'incoming') {
              showNotification('info', 'Voice call', 'Incoming call...');
              return;
          }
          if (type === 'missed') {
              showNotification('warning', 'Voice call', 'Missed call.');
              return;
          }
          if (type === 'failed') {
              const message = String(detail?.error || 'Voice call failed.');
              showNotification('error', 'Voice call', message);
              return;
          }
          if (type === 'busy') {
              const busyUserName = String(detail?.busyUserName || '').trim();
              const message = String(detail?.error || (busyUserName ? `${busyUserName} is on another call.` : 'User is on another call.'));
              showNotification('warning', 'Voice call', message);
              return;
          }
          if (type === 'permission_denied') {
              const message = String(detail?.message || 'Microphone permission denied.');
              showNotification('error', 'Voice call', message);
          }
      };
      window.addEventListener('voicecall:lifecycle', handler as EventListener);
      return () => window.removeEventListener('voicecall:lifecycle', handler as EventListener);
  }, [showNotification]);

  useEffect(() => {
      activeConvoIdRef.current = activeConvoId;
  }, [activeConvoId]);

  useEffect(() => {
      if (!activeConvoIdRef.current) {
          emitTypingState(false);
          setTypingUser(null);
      }
      return () => {
          emitTypingState(false);
      };
  }, [activeConvoId]);

  useEffect(() => {
      syncMobileComposerHostHeight();
      const viewport = window.visualViewport;
      window.addEventListener('resize', syncMobileComposerHostHeight);
      viewport?.addEventListener('resize', syncMobileComposerHostHeight);
      viewport?.addEventListener('scroll', syncMobileComposerHostHeight);
      return () => {
          window.removeEventListener('resize', syncMobileComposerHostHeight);
          viewport?.removeEventListener('resize', syncMobileComposerHostHeight);
          viewport?.removeEventListener('scroll', syncMobileComposerHostHeight);
      };
  }, [syncMobileComposerHostHeight]);

  useEffect(() => {
      syncMobileComposerHostHeight();
  }, [activeConvoId, pendingAttachments.length, replyToMessage, syncMobileComposerHostHeight]);

  useEffect(() => {
      if (!isMobileViewport) return;
      if (document.activeElement !== composerTextareaRef.current) return;
      scrollComposerIntoView('auto');
  }, [isMobileViewport, mobileComposerHostHeight, scrollComposerIntoView]);

  useEffect(() => {
      return () => {
          resetTypingTimers();
          typingActiveRef.current = false;
      };
  }, []);

  useEffect(() => {
      const node = conversationListRef.current;
      if (!node) return;
      const syncMetrics = () => {
          setConversationViewportHeight(node.clientHeight || 0);
          setConversationScrollTop(node.scrollTop || 0);
      };
      syncMetrics();
      if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', syncMetrics);
          return () => window.removeEventListener('resize', syncMetrics);
      }
      const observer = new ResizeObserver(syncMetrics);
      observer.observe(node);
      return () => observer.disconnect();
  }, [conversations.length, messageSearchResults.length, showStarredOnly, isMobileViewport, debouncedMessageSearch]);

  useEffect(() => {
      userIdRef.current = user?.id || null;
  }, [user?.id]);

  useEffect(() => {
      setMessagingMediaConversationAffinity(activeConvoId);
      if (!activeConvoId) {
          setShowJumpToUnread(false);
          lastPreloadConvoRef.current = null;
          return;
      }
      const stop = startMessagingTimer('conversation_switch_ms');
      const convo = conversations.find((row) => row.id === activeConvoId);
      const messages = Array.isArray(convo?.messages) ? convo!.messages : [];
      const firstUnread = findFirstUnreadIndex(messages, user?.id);
      setShowJumpToUnread(firstUnread >= 0);
      if (lastPreloadConvoRef.current !== activeConvoId) {
          lastPreloadConvoRef.current = activeConvoId;
          void preloadConversationMedia({
              conversationId: activeConvoId,
              messages,
              maxItems: 10,
              priority: 'high'
          });
          const avatarUrls = (convo?.participants || [])
              .map((p: any) =>
                  resolveUserAvatarUrl(p) ||
                  String(p?.avatar || p?.avatarUrl || p?.profilePhotoFileId || '').trim()
              )
              .map((url: string) => resolveUserAvatarUrl(url) || url)
              .filter(Boolean);
          preloadConversationAvatars(avatarUrls);
      }
      window.requestAnimationFrame(() => stop({ export: true }));
  }, [activeConvoId, conversations, user?.id]);

  // Load Conversations (+ ensure official Scrolitha assistant DM)
  useEffect(() => {
      if (!user) return;
      let cancelled = false;
      const softOpen = Boolean((location.state as { softOpen?: boolean } | null)?.softOpen);
      (async () => {
          try {
              // Best-effort ensure before list so the pinned assistant appears.
              // Soft header opens skip ensure to open faster (assistant already usually present).
              if (!softOpen) {
                  await MessagingService.ensureScrolithaConversation().catch(() => null);
              }
          } catch {
              // ignore — assistant may be rollout-gated
          }
          if (cancelled) return;
          // Soft open reuses cache when warm; force only on cold / hard entry.
          const list = await MessagingService.getAllConversations(user.id, user.role, {
              force: !softOpen
          });
          if (!cancelled) setConversations(mergeDirectConversations(list, user?.id));
      })().catch(() => undefined);
      return () => {
          cancelled = true;
      };
  }, [user]);

  useEffect(() => {
      const timer = window.setTimeout(() => {
          setDebouncedMessageSearch(messageSearchInput.replace(/\s+/g, ' ').trim());
      }, 300);
      return () => window.clearTimeout(timer);
  }, [messageSearchInput]);

  useEffect(() => {
      const query = debouncedMessageSearch.trim();
      messageSearchAbortRef.current?.abort();
      messageSearchAbortRef.current = null;

      if (authLoading || !isAuthenticated || !user?.id || query.length < 2) {
          setMessageSearchResults([]);
          setMessageSearchLoading(false);
          setMessageSearchError('');
          return;
      }

      const controller = new AbortController();
      messageSearchAbortRef.current = controller;
      setMessageSearchLoading(true);
      setMessageSearchError('');

      void (async () => {
          const token = await tokenStore.get();
          if (controller.signal.aborted) return;
          if (!token) {
              setMessageSearchResults([]);
              setMessageSearchError('Please sign in to search messages.');
              setMessageSearchLoading(false);
              return;
          }

          return MessagingService.searchConversations(query, {
              limit: 30,
              signal: controller.signal,
              adminScope: user.role === UserRole.ADMIN
          });
      })()
          .then((payload) => {
              if (controller.signal.aborted) return;
              if (!payload) return;
              const { results } = payload;
              setMessageSearchResults(results);
              setConversationScrollTop(0);
              conversationListRef.current?.scrollTo({ top: 0 });
          })
          .catch((error: any) => {
              if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
              setMessageSearchResults([]);
              if (error?.response?.status === 401) {
                  setMessageSearchError('Please sign in to search messages.');
              } else if (
                  error?.response?.status === 404 ||
                  /api route not found|not found/i.test(
                      String(error?.response?.data?.error || error?.message || '')
                  )
              ) {
                  // Never surface raw backend 404 text in the Messages search UI.
                  setMessageSearchError('Search is temporarily unavailable. Please try again.');
              } else {
                  setMessageSearchError(
                      error?.response?.data?.error &&
                          !/api route not found/i.test(String(error.response.data.error))
                          ? String(error.response.data.error)
                          : 'Search is temporarily unavailable. Please try again.'
                  );
              }
          })
          .finally(() => {
              if (!controller.signal.aborted) {
                  setMessageSearchLoading(false);
              }
          });

      return () => controller.abort();
  }, [debouncedMessageSearch, authLoading, isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
      if (!user) return;
      MessagingService.getVoiceRuntimeConfig()
          .then((config) => {
              setVoiceRuntimeConfig({
                  enabledVoiceCalls: Boolean(config?.enabledVoiceCalls ?? true),
                  enabledConferenceCalls: Boolean(config?.enabledConferenceCalls ?? true),
                  enabledVideoCalls: Boolean((config as any)?.enabledVideoCalls ?? true),
                  enabledVoiceNotes: Boolean(config?.enabledVoiceNotes ?? true),
                  maxParticipants: Number(config?.maxParticipants ?? 20),
                  maxVoiceNoteDurationSeconds: Number(config?.maxVoiceNoteDurationSeconds ?? 180),
                  blockedForCurrentUser: Boolean((config as any)?.blockedForCurrentUser ?? false)
              });
          })
          .catch(() => {
              setVoiceRuntimeConfig((prev) => ({ ...prev }));
          });
  }, [user?.id]);

  // Handle URL param for deep linking
  useEffect(() => {
      // Phase 22.2 — /messages/join/:code is not a conversation id
      if (!conversationId || conversationId === 'join') return;
      if (dedupedConversations.length > 0) {
          const exact = dedupedConversations.find((c) => c.id === conversationId);
          // If this id was absorbed into a merged row, open the canonical primary id.
          const absorbed = !exact
              ? dedupedConversations.find((c) => {
                    const fromIds = ((c as any)?.mergedFromIds || (c as any)?.merged_from_ids || []) as string[];
                    return Array.isArray(fromIds) && fromIds.includes(conversationId);
                })
              : null;
          const resolved = exact || absorbed;
          if (resolved?.id) {
              if (absorbed && absorbed.id !== conversationId) {
                  navigate(`/messages/${absorbed.id}`, { replace: true });
              }
              setActiveConvoId(resolved.id);
              // Mark as read only when the viewer is an active participant.
              // Admin list returns all platform threads; foreign rows 404 on /read and /appearance.
              const isPlatformAdmin = String(user?.role || '')
                  .toLowerCase()
                  .includes('admin');
              const hasSelfMembership = Boolean(
                  user?.id &&
                      (resolved.participants || []).some(
                          (p: any) =>
                              String(p?.id || p?.userId || '').trim() === String(user.id) &&
                              !p?.deletedAt &&
                              !p?.deleted_at
                      )
              );
              // Non-admin inbox is membership-scoped; always attempt. Admin: only own threads.
              const viewerIsMember = hasSelfMembership || !isPlatformAdmin;
              if (user && viewerIsMember) {
                  MessagingService.markAsRead(resolved.id, user.id).then(() => {
                      refreshMessages();
                      setConversations((prev) =>
                          prev.map((c) =>
                              c.id === resolved.id
                                  ? { ...c, unreadCount: 0, unread_count: 0 }
                                  : c
                          )
                      );
                  }).catch(() => {
                      // Read receipts are best-effort; conversation loading and messaging must remain stable.
                  });
              }
          } else {
              setActiveConvoId(conversationId);
          }
      } else {
          setActiveConvoId(conversationId);
      }
  }, [conversationId, dedupedConversations.length, user, navigate]);

  // Phase 22.2 — accept group invite via /messages/join/:code or ?invite=
  useEffect(() => {
      const code = String(inviteCodeParam || searchParams.get('invite') || '').trim();
      if (!code || !user?.id) return;
      let cancelled = false;
      void (async () => {
          try {
              const data = await MessagingService.acceptGroupInvite(code);
              if (cancelled) return;
              const joinedId = String(data?.conversationId || '').trim();
              showNotification('success', 'Group joined', 'You joined the group conversation.');
              await refreshMessages();
              navigate(joinedId ? `/messages/${joinedId}` : '/messages', { replace: true });
          } catch (error: any) {
              if (cancelled) return;
              showNotification(
                  'error',
                  'Invite',
                  error?.message || 'Could not accept group invite.'
              );
              navigate('/messages', { replace: true });
          }
      })();
      return () => {
          cancelled = true;
      };
      // intentionally once per invite code + user
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCodeParam, user?.id]);

  // Keep shared messaging surfaces (header badge + dock) aligned with full-page visibility.
  useEffect(() => {
      if (!activeConvoId) return;
      registerVisibleConversation(activeConvoId);
      return () => unregisterVisibleConversation(activeConvoId);
  }, [activeConvoId, registerVisibleConversation, unregisterVisibleConversation]);

  // Enterprise engine bridge: dock / multi-tab / recovery updates without page refresh.
  // Socket-origin events are ignored here because Messages.tsx already owns local thread
  // socket handlers; shared badge ownership remains in MessageContext.
  useEffect(() => {
      const unsubCreated = subscribeMessagingEvent('MESSAGE_CREATED', (event) => {
          if (event.source === 'socket') return;
          const message = event.payload as Message | undefined;
          const conversationId = String(
              event.conversationId ||
                  (message as any)?.conversationId ||
                  (message as any)?.conversation_id ||
                  ''
          ).trim();
          if (!conversationId || !message?.id) return;
          setConversations((prev) => {
              const has = prev.some((entry) => entry.id === conversationId);
              if (!has) {
                  void refreshMessages();
                  return prev;
              }
              return prev.map((entry) => {
                  if (entry.id !== conversationId) return entry;
                  const existing = Array.isArray(entry.messages) ? entry.messages : [];
                  const previewFromPayload = String(
                      (message as any)?.lastMessage ||
                          (message as any)?.last_message ||
                          ''
                  ).trim();
                  const nextPreview =
                      previewFromPayload ||
                      getMessagePreviewText(message, { currentUserId: user?.id }) ||
                      entry.lastMessage ||
                      entry.last_message ||
                      '';
                  if (existing.some((row) => row.id === message.id)) {
                      return {
                          ...entry,
                          messages: existing.map((row) =>
                              row.id === message.id ? { ...row, ...message } : row
                          ),
                          lastMessage: nextPreview,
                          last_message: nextPreview,
                          lastMessageAt: message.timestamp || entry.lastMessageAt,
                          last_message_at: message.timestamp || entry.last_message_at
                      };
                  }
                  return {
                      ...entry,
                      messages: [...existing, message],
                      lastMessage: nextPreview,
                      last_message: nextPreview,
                      lastMessageAt: message.timestamp || entry.lastMessageAt,
                      last_message_at: message.timestamp || entry.last_message_at
                  };
              });
          });
      });
      const unsubRecovery = subscribeMessagingEvent('MISSED_EVENTS_RECOVERY', () => {
          void refreshMessages();
      });
      return () => {
          unsubCreated();
          unsubRecovery();
      };
  }, [refreshMessages]);

  useEffect(() => {
      if (!conversationId && isMobileViewport) {
          setActiveConvoId(null);
          setExpandedMessageId(null);
          setReactionPanelMessageId(null);
          setShowConversationMenu(false);
      }
  }, [conversationId, isMobileViewport]);

  // Auto-scroll to bottom only when user is near bottom; otherwise preserve position.
  useEffect(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const prev = messagesScrollMetricsRef.current;
      const nextScrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      if (shouldAutoScrollRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      } else if (prev.scrollHeight > 0 && nextScrollHeight !== prev.scrollHeight) {
          container.scrollTop = preserveScrollTopAfterGrowth({
              previousScrollHeight: prev.scrollHeight,
              previousScrollTop: prev.scrollTop,
              nextScrollHeight,
              stickToBottom: false,
              clientHeight
          });
      }
      messagesScrollMetricsRef.current = {
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
          clientHeight: container.clientHeight
      };
  }, [
      activeConvoId,
      typingUser,
      dedupedConversations.find((conversation) => conversation.id === activeConvoId)?.messages?.length
  ]);

  useEffect(() => {
      setPendingAttachments((prev) => {
          revokePendingObjectUrls(prev);
          return [];
      });
      setReplyToMessage(null);
      setEditingMessageId(null);
      setEditDraft('');
      setMessageActionBusyId(null);
      setExpandedMessageId(null);
      setReactionPanelMessageId(null);
      setShowConversationMenu(false);
  }, [activeConvoId]);

  useEffect(() => {
      if (!activeConvoId) return;
      let cancelled = false;
      void MessagingService.getConversationById(activeConvoId)
          .then((full) => {
              if (cancelled || !full) return;
              setConversations((prev) => {
                  const exists = prev.some((conversation) => conversation.id === activeConvoId);
                  if (!exists) return prev;
                  return prev.map((conversation) =>
                      conversation.id === activeConvoId ? { ...conversation, ...full } : conversation
                  );
              });
          })
          .catch(() => null);
      return () => {
          cancelled = true;
      };
  }, [activeConvoId]);

  useEffect(() => {
      messageMediaResourcesRef.current = messageMediaResources;
  }, [messageMediaResources]);

  useEffect(() => {
      return () => {
          messageMediaObjectUrlRef.current.forEach((value) => {
              try {
                  window.URL.revokeObjectURL(value);
              } catch {}
          });
          messageMediaObjectUrlRef.current.clear();
      };
  }, []);

  const activeConvo = useMemo(() => {
      if (!activeConvoId) return undefined;
      const exact = dedupedConversations.find((conversation) => conversation.id === activeConvoId);
      if (exact) return exact;
      const rawMatch = conversations.find((conversation) => conversation.id === activeConvoId);
      const mergeKey = rawMatch ? getConversationMergeKey(rawMatch) : '';
      if (!mergeKey) return undefined;
      return dedupedConversations.find((conversation) => getConversationMergeKey(conversation) === mergeKey);
  }, [activeConvoId, conversations, dedupedConversations]);

  /**
   * Strict Scrolitha peer detection for inbox titles/avatars.
   * Do not use bare participant.label === 'system' or username === 'ai' — those false-positive
   * and rename normal DMs to "Scrolitha" (esp. in ADMIN VIEW).
   */
  const isScrolithaParticipantEntity = (participant: any) => {
      if (!participant) return false;
      if (participant.isScrolitha || participant.is_scrolitha) return true;
      const username = String(participant.username || '')
          .trim()
          .toLowerCase()
          .replace(/^@/, '');
      // Official handles only (exclude generic 'ai').
      if (
          username === 'scrolitha' ||
          username === 'scrolitha_ai' ||
          username === 'scrolitha-bot'
      ) {
          return true;
      }
      const systemLabel = String(
          participant.systemLabel || participant.system_label || ''
      ).toLowerCase();
      if (systemLabel.includes('ai assistant') || systemLabel.includes('official ai')) {
          return true;
      }
      const name = String(participant.name || '').trim().toLowerCase();
      if (name === 'scrolitha') return true;
      // label=scrolitha is explicit; label=system alone is NOT enough (over-matches).
      if (String(participant.label || '').toLowerCase() === 'scrolitha') return true;
      return false;
  };

  const isActiveScrolithaConversation = Boolean(
      activeConvo?.isScrolitha ||
          activeConvo?.is_scrolitha ||
          activeConvo?.participants?.some((p: any) => isScrolithaParticipantEntity(p))
  );

  const scrolithaPromptChips = useMemo(
      () => [
          'Find jobs for me',
          'Improve my resume',
          'Review my profile',
          'Find freelancers',
          'Create a proposal draft',
          'Write a post',
          'Search marketplace',
          'Find communities',
          'Show my growth plan'
      ],
      []
  );

  // Phase 22.2 — jump-to-message (local scroll or around-window fetch)
  useEffect(() => {
      const targetMessageId = searchParams.get('messageId') || pendingSearchMessageFocusRef.current;
      if (!activeConvoId || !targetMessageId) return;

      const hasLocal = Boolean(activeConvo?.messages?.some((msg) => msg.id === targetMessageId));
      if (!hasLocal) {
          const flightKey = `${activeConvoId}:${targetMessageId}`;
          if (jumpAroundInFlightRef.current === flightKey) return;
          jumpAroundInFlightRef.current = flightKey;
          void MessagingService.getMessagesAround(activeConvoId, targetMessageId, 40)
              .then((result) => {
                  const around = Array.isArray(result?.messages) ? result.messages : [];
                  if (!around.length) return;
                  setConversations((prev) =>
                      prev.map((conversation) => {
                          if (conversation.id !== activeConvoId) return conversation;
                          const merged = dedupeMessagesById([
                              ...(conversation.messages || []),
                              ...around
                          ]);
                          return { ...conversation, messages: merged };
                      })
                  );
              })
              .catch(() => {
                  /* best-effort jump */
              })
              .finally(() => {
                  if (jumpAroundInFlightRef.current === flightKey) {
                      jumpAroundInFlightRef.current = null;
                  }
              });
          return;
      }

      const timer = window.setTimeout(() => {
          const node = document.getElementById(`message-${targetMessageId}`);
          if (!node) return;
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedMessageId(targetMessageId);
          pendingSearchMessageFocusRef.current = null;
          window.setTimeout(() => {
              setHighlightedMessageId((current) => (current === targetMessageId ? null : current));
          }, 2400);
      }, 120);

      return () => window.clearTimeout(timer);
  }, [activeConvoId, activeConvo?.messages?.length, searchParams]);
  const activeMessageSearchQuery = debouncedMessageSearch.trim();
  const isMessageSearchActive = activeMessageSearchQuery.length >= 2;
  const isMobileConversationMode = Boolean(isMobileViewport && activeConvo);
  const isMobileKeyboardOpen = Boolean(isMobileViewport && mobileKeyboardInset > 96);
  const mobileConversationViewportStyle: React.CSSProperties | undefined = isMobileConversationMode
      ? {
            top: `${mobileViewportTop}px`,
            height: `${Math.max(mobileViewportHeight || 0, 280)}px`
        }
      : undefined;
  const conversationListSource = isMessageSearchActive ? searchConversations : dedupedConversations;
  /** Backend Scrolitha consolidation leaves soft-deleted losers with this preview marker. */
  const isScrolithaMergeStubConversation = (convo: Conversation) => {
      const preview = String(
          getConversationPreviewText(convo, { currentUserId: user?.id }) ||
              (convo as any)?.lastMessage ||
              (convo as any)?.last_message ||
              ''
      );
      if (/\[\s*merged\s+into\s+[a-z0-9_-]+\s*\]/i.test(preview)) return true;
      const selfId = String(user?.id || '').trim();
      const selfRow = (convo.participants || []).find(
          (p: any) => String(p?.id || p?.userId || '').trim() === selfId
      );
      const label = String(selfRow?.label || '').toLowerCase();
      if (label === 'scrolitha_duplicate_merged') return true;
      // Soft-left self on a scrolitha duplicate should not appear in the inbox.
      if (selfRow && (selfRow.deletedAt || selfRow.deleted_at) && isScrolithaParticipantEntity(
          (convo.participants || []).find((p: any) => isScrolithaParticipantEntity(p))
      )) {
          return true;
      }
      return false;
  };
  /**
   * Admin global list includes foreign threads. Keep a conversation when:
   * - self is an active participant, OR
   * - participant payload is incomplete (0–1 peers) — common for own DIRECT previews that omit self.
   * Hide only clearly foreign multi-party rows (2+ participants and self absent).
   */
  const isViewerInboxConversation = (convo: Conversation) => {
      const selfId = String(user?.id || '').trim();
      if (!selfId) return true;
      const parts = Array.isArray(convo.participants) ? convo.participants : [];
      const active = parts.filter((p: any) => !p?.deletedAt && !p?.deleted_at);
      const hasSelf = active.some(
          (p: any) => String(p?.id || p?.userId || '').trim() === selfId
      );
      if (hasSelf) return true;
      // Incomplete own-inbox preview (peer-only or empty participants).
      if (active.length <= 1) return true;
      // Multi-party without self → foreign admin-list noise.
      return false;
  };
  const visibleConversations = [...conversationListSource]
      .filter((convo) => !isScrolithaMergeStubConversation(convo))
      .filter((convo) => isViewerInboxConversation(convo))
      .sort((a, b) => {
          // Official Scrolitha assistant always pins above user conversations.
          // Do NOT treat isPinned as Scrolitha — that renames/sorts normal starred DMs as AI.
          const aAi = Number(
              Boolean(
                  a.isScrolitha ||
                      a.is_scrolitha ||
                      (a.participants || []).some((p: any) => isScrolithaParticipantEntity(p))
              )
          );
          const bAi = Number(
              Boolean(
                  b.isScrolitha ||
                      b.is_scrolitha ||
                      (b.participants || []).some((p: any) => isScrolithaParticipantEntity(p))
              )
          );
          if (aAi !== bAi) return bAi - aAi;
          const aStar = Number(Boolean(a.isStarred ?? a.is_starred));
          const bStar = Number(Boolean(b.isStarred ?? b.is_starred));
          if (aStar !== bStar) return bStar - aStar;
          const aTime = new Date(a.lastMessageAt || a.last_message_at || 0).getTime();
          const bTime = new Date(b.lastMessageAt || b.last_message_at || 0).getTime();
          return bTime - aTime;
      })
      .filter((conversation) => {
          if (!showStarredOnly) return true;
          return Boolean(conversation.isStarred ?? conversation.is_starred);
      });
  const conversationItemHeight = isMobileViewport ? 88 : 92;
  const conversationOverscan = 5;
  const conversationWindow = useMemo(() => {
      const itemCount = visibleConversations.length;
      if (itemCount === 0) {
          return { start: 0, end: 0, top: 0, bottom: 0 };
      }
      const viewport = Math.max(conversationViewportHeight, conversationItemHeight * 8);
      const start = Math.max(0, Math.floor(conversationScrollTop / conversationItemHeight) - conversationOverscan);
      const end = Math.min(
          itemCount,
          Math.ceil((conversationScrollTop + viewport) / conversationItemHeight) + conversationOverscan
      );
      return {
          start,
          end,
          top: start * conversationItemHeight,
          bottom: Math.max(0, (itemCount - end) * conversationItemHeight)
      };
  }, [conversationItemHeight, conversationOverscan, conversationScrollTop, conversationViewportHeight, visibleConversations.length]);
  const virtualConversations = useMemo(
      () => visibleConversations.slice(conversationWindow.start, conversationWindow.end),
      [visibleConversations, conversationWindow.start, conversationWindow.end]
  );
  const otherParticipant = (() => {
      const selfId = String(user?.id || '').trim();
      const participants = Array.isArray(activeConvo?.participants) ? activeConvo!.participants : [];
      const others = participants.filter(
          (participant: any) => String(participant?.id || '').trim() !== selfId
      );

      // Official assistant: never fall back to the viewer (e.g. Admin) as the peer.
      const scrolithaPeer =
          others.find((participant: any) => isScrolithaParticipantEntity(participant)) ||
          participants.find(
              (participant: any) =>
                  isScrolithaParticipantEntity(participant) &&
                  String(participant?.id || '').trim() !== selfId
          );
      if (scrolithaPeer) {
          return {
              ...scrolithaPeer,
              name: SCROLITHA_DISPLAY_NAME,
              username: scrolithaPeer.username || 'scrolitha',
              isScrolitha: true,
              is_scrolitha: true,
              isOnline: true,
              is_online: true,
              systemLabel: 'AI assistant',
              system_label: 'AI assistant'
          };
      }
      if (isActiveScrolithaConversation) {
          return {
              id: 'scrolitha',
              name: SCROLITHA_DISPLAY_NAME,
              username: 'scrolitha',
              isScrolitha: true,
              is_scrolitha: true,
              isOnline: true,
              is_online: true,
              systemLabel: 'AI assistant',
              system_label: 'AI assistant',
              profileUrl: '/u/scrolitha',
              profile_url: '/u/scrolitha'
          };
      }

      const withDisplayName = others.find((participant: any) => {
          const id = String(participant?.id || '').trim();
          const name = String(participant?.name || participant?.username || '').trim();
          return Boolean(name) && name !== id;
      });
      // Never use the current user as the "other" party for DM headers.
      return withDisplayName || others[0] || undefined;
  })();
  const isActiveGroupConversation = Boolean(
      !isActiveScrolithaConversation &&
          (activeConvo?.type === 'group' ||
              String((activeConvo as any)?.type || '').toUpperCase() === 'GROUP' ||
              Boolean((activeConvo as any)?.title && (activeConvo?.participants?.length || 0) > 2))
  );
  const activeGroupTitle = String((activeConvo as any)?.title || '').trim();
  const activeConversationTitle = isActiveScrolithaConversation
      ? SCROLITHA_DISPLAY_NAME
      : isActiveGroupConversation
        ? activeGroupTitle ||
          (activeConvo?.participants || [])
              .filter((p: any) => String(p?.id || '') !== String(user?.id || ''))
              .map((p: any) => p?.name || p?.username)
              .filter(Boolean)
              .slice(0, 3)
              .join(', ') ||
          'Group'
        : otherParticipant?.name || 'Conversation';
  const myGroupRole = String(
      (activeConvo as any)?.memberRole ||
          (activeConvo?.participants || []).find((p: any) => String(p?.id || '') === String(user?.id || ''))
              ?.memberRole ||
          'MEMBER'
  ).toUpperCase();
  const canManageActiveGroup =
      isActiveGroupConversation &&
      (myGroupRole === 'OWNER' ||
          myGroupRole === 'ADMIN' ||
          String(user?.role || '').toLowerCase().includes('admin') ||
          Boolean(activeGroupProfile?.permissions?.canEditGroup));
  const groupComposerRestriction = useMemo(
      () =>
          resolveGroupComposerRestriction({
              isGroup: isActiveGroupConversation,
              messagingMode:
                  activeGroupProfile?.messagingMode || (activeConvo as any)?.messagingMode,
              slowModeSeconds: activeGroupProfile?.slowModeSeconds,
              canSend: activeGroupProfile?.permissions?.canSend,
              content: activeGroupProfile?.content || null,
              lockedAt: activeGroupProfile?.lockedAt,
              sendAckStatus: groupSendAckStatus
          }),
      [isActiveGroupConversation, activeGroupProfile, groupSendAckStatus, activeConvo]
  );

  // Pins + appearance for any active conversation; enterprise group profile for groups
  useEffect(() => {
      if (!activeConvoId) {
          setActiveGroupProfile(null);
          setGroupPins([]);
          setChatAppearance({ kind: 'none' });
          setGroupSendAckStatus(null);
          return;
      }
      let cancelled = false;
      void (async () => {
          if (isActiveGroupConversation) {
              try {
                  const profile = await MessagingService.getEnterpriseGroup(activeConvoId);
                  if (!cancelled) setActiveGroupProfile(profile || null);
              } catch {
                  if (!cancelled) setActiveGroupProfile(null);
              }
          } else if (!cancelled) {
              setActiveGroupProfile(null);
          }
          // Pins are group membership APIs — do not call on DIRECT/Scrolitha DMs (403 noise).
          if (isActiveGroupConversation) {
              try {
                  const pins = await MessagingService.listGroupPins(activeConvoId);
                  if (!cancelled) setGroupPins(Array.isArray(pins) ? pins : []);
              } catch {
                  if (!cancelled) setGroupPins([]);
              }
          } else if (!cancelled) {
              setGroupPins([]);
          }
       })();
      try {
          if (socket && isConnected && isActiveGroupConversation) {
              socket.emit('messages:group:join', { conversationId: activeConvoId });
          }
      } catch {
          /* optional */
      }
      return () => {
          cancelled = true;
          try {
              if (socket && isActiveGroupConversation) {
                  socket.emit('messages:group:leave', { conversationId: activeConvoId });
              }
          } catch {
              /* optional */
          }
      };
  }, [
      activeConvoId,
      isActiveGroupConversation,
      socket,
      isConnected,
      user?.id,
      activeConvo?.participants
  ]);

  // Messages owns appearance hydration. The editor receives this state and never
  // starts a second request, so a late response cannot repaint another chat.
  useEffect(() => {
      const conversationId = String(activeConvoId || '').trim();
      const generation = chatAppearanceRequestRef.current.generation + 1;
      chatAppearanceRequestRef.current = { generation, conversationId };
      if (!conversationId) {
          setChatAppearanceLoading(false);
          setChatAppearance({ kind: 'none' });
          return;
      }

      let cancelled = false;
      const isCurrent = () =>
          !cancelled &&
          chatAppearanceRequestRef.current.generation === generation &&
          chatAppearanceRequestRef.current.conversationId === conversationId &&
          activeConvoIdRef.current === conversationId;

      setChatAppearanceLoading(true);
      setChatAppearance({ kind: 'none' });
      void (async () => {
          const selfId = String(user?.id || '').trim();
          const parts = Array.isArray(activeConvo?.participants) ? activeConvo.participants : [];
          const hasSelfMembership =
              !selfId ||
              parts.some(
                  (p: any) =>
                      String(p?.id || p?.userId || '').trim() === selfId &&
                      !p?.deletedAt &&
                      !p?.deleted_at
              );
          if (parts.length > 0 && selfId && !hasSelfMembership) {
              if (isCurrent()) setChatAppearance({ kind: 'none' });
              if (isCurrent()) setChatAppearanceLoading(false);
              return;
          }
          try {
              const appearance = await MessagingService.getChatAppearance(conversationId);
              if (isCurrent()) setChatAppearance(appearance || { kind: 'none' });
          } catch {
              if (isCurrent()) setChatAppearance({ kind: 'none' });
          } finally {
              if (isCurrent()) setChatAppearanceLoading(false);
          }
      })();
      return () => {
          cancelled = true;
      };
  }, [activeConvoId, user?.id]);

  const chatSurfaceStyle = useMemo(() => {
      const vars = paletteToCssVars(buildChatPalette(chatAppearance));
      const kind = String(chatAppearance?.kind || 'none').toLowerCase();
      if (kind === 'none') {
          return { ...vars } as React.CSSProperties;
      }
      const bg = appearanceToBackgroundStyle(chatAppearance);
      return { ...bg, ...vars } as React.CSSProperties;
  }, [chatAppearance]);

  const activeGroupAvatarSrc = useMemo(() => {
      if (!isActiveGroupConversation) return null;
      const fileId = String(
          (activeConvo as any)?.avatarFileId ||
              (activeConvo as any)?.avatar_file_id ||
              activeGroupProfile?.avatarFileId ||
              activeGroupProfile?.avatar_file_id ||
              ''
      ).trim();
      return fileId ? resolveUserAvatarUrl(fileId) : null;
  }, [isActiveGroupConversation, activeConvo, activeGroupProfile]);

  const jumpToPinnedMessage = useCallback(
      (messageId: string) => {
          const id = String(messageId || '').trim();
          if (!id) return;
          const node = document.getElementById(`message-${id}`);
          if (node) {
              node.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setHighlightedMessageId(id);
              window.setTimeout(() => {
                  setHighlightedMessageId((current) => (current === id ? null : current));
              }, 1800);
              return;
          }
          // Fall through to existing search/jump path via query-style focus
          pendingSearchMessageFocusRef.current = id;
          setHighlightedMessageId(id);
          void MessagingService.getMessagesAround(activeConvoId || '', id, 40)
              .then((result) => {
                  const around = Array.isArray(result?.messages) ? result.messages : [];
                  if (!around.length || !activeConvoId) return;
                  setConversations((prev) =>
                      prev.map((conversation) => {
                          if (conversation.id !== activeConvoId) return conversation;
                          return {
                              ...conversation,
                              messages: dedupeMessagesById([...(conversation.messages || []), ...around])
                          };
                      })
                  );
                  window.setTimeout(() => {
                      document.getElementById(`message-${id}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center'
                      });
                  }, 160);
              })
              .catch(() => null);
      },
      [activeConvoId]
  );

  const handlePinToggle = useCallback(
      async (messageId: string, isPinned: boolean) => {
          if (!activeConvoId) return;
          setMessageActionBusyId(messageId);
          try {
              if (isPinned) {
                  const data = await MessagingService.unpinGroupMessage(activeConvoId, messageId);
                  setGroupPins(
                      Array.isArray(data?.pins) ? data.pins : await MessagingService.listGroupPins(activeConvoId)
                  );
                  showNotification('success', 'Unpinned', 'Message unpinned.');
              } else {
                  const data = await MessagingService.pinGroupMessage(activeConvoId, messageId);
                  setGroupPins(
                      Array.isArray(data?.pins) ? data.pins : await MessagingService.listGroupPins(activeConvoId)
                  );
                  showNotification('success', 'Pinned', 'Message pinned.');
              }
          } catch (error: any) {
              showNotification(
                  'error',
                  'Pin',
                  error?.response?.data?.error || error?.message || 'Could not update pin'
              );
          } finally {
              setMessageActionBusyId(null);
          }
      },
      [activeConvoId, showNotification]
  );

  const otherOnline = isActiveScrolithaConversation
      ? true
      : Boolean(otherParticipant?.isOnline ?? otherParticipant?.is_online);
  const otherPresenceState = isActiveScrolithaConversation
      ? 'online'
      : String(
            (otherParticipant as any)?.presenceState ||
                (otherOnline ? 'online' : 'offline')
        ).toLowerCase();
  const otherLastSeen = isActiveScrolithaConversation
      ? undefined
      : otherParticipant?.lastSeenAt ?? otherParticipant?.last_seen_at;
  const resolveParticipantRole = (participant: any): 'freelancer' | 'employer' | null => {
      if (!participant) return null;
      const role = String(participant.role || '').toLowerCase();
      if (role.includes('freelancer')) return 'freelancer';
      if (role.includes('employer') || role.includes('client')) return 'employer';
      if (participant.isProEmployer || participant.is_pro_employer) return 'employer';
      if (participant.isProFreelancer || participant.is_pro_freelancer) return 'freelancer';
      return null;
  };
  const isParticipantPro = (participant: any) =>
      Boolean(
          participant?.isPro ??
          participant?.is_pro ??
          participant?.isProEmployer ??
          participant?.is_pro_employer ??
          participant?.isProFreelancer ??
          participant?.is_pro_freelancer
      );
  const otherParticipantRole = resolveParticipantRole(otherParticipant);
  const otherParticipantIsPro = isParticipantPro(otherParticipant);
  const normalizedUserRole = String(user?.role || '').toLowerCase();
  const canCreateBriefFromConversation = Boolean(
      activeConvoId &&
      dealFlowConfig.enabled &&
      dealFlowConfig.allowCreateBriefFromChat &&
      (normalizedUserRole.includes('employer') || normalizedUserRole.includes('client') || normalizedUserRole.includes('admin'))
  );
  const canCreateProposalFromBrief = Boolean(
      dealFlowConfig.enabled &&
      dealFlowConfig.allowBriefToProposal &&
      (normalizedUserRole.includes('freelancer') || normalizedUserRole.includes('seller') || normalizedUserRole.includes('admin'))
  );
  const resolveParticipantProfileUrl = (participant: any) => {
      if (!participant) return '/profile/edit';
      // Official assistant always uses the public Scrolitha handle.
      if (
          participant?.isScrolitha ||
          participant?.is_scrolitha ||
          isScrolithaUsername(participant?.username)
      ) {
          return '/u/scrolitha';
      }
      const rawUsername = String(participant.username || '').trim().replace(/^@+/, '');
      // Never route emails (e.g. admin@scrolith.com) through /u/:username — API returns 400.
      const usernameLooksValid =
          Boolean(rawUsername) &&
          !rawUsername.includes('@') &&
          /^[a-zA-Z0-9._-]{2,64}$/.test(rawUsername);
      if (usernameLooksValid) return `/u/${encodeURIComponent(rawUsername)}`;
      const profileUrl = String(participant.profileUrl || participant.profile_url || '').trim();
      if (profileUrl.startsWith('/') && !profileUrl.toLowerCase().includes('@')) {
          return profileUrl;
      }
      const participantId = String(participant.id || '').trim();
      return participantId ? `/profile/${encodeURIComponent(participantId)}` : '/profile/edit';
  };
  const activeConversationState = {
      label: String(activeConvo?.label || 'other').toLowerCase() === 'jobs' ? 'jobs' : 'other',
      isStarred: Boolean(activeConvo?.isStarred ?? activeConvo?.is_starred),
      isMuted: Boolean(activeConvo?.isMuted ?? activeConvo?.is_muted),
      isArchived: Boolean(activeConvo?.isArchived ?? activeConvo?.is_archived)
  };
  const messagingControls = (settings as any)?.messagingControls || {};
  const activeConversationVoiceTargets = (activeConvo?.participants || [])
      .filter((participant: any) => String(participant?.id || '') !== String(user?.id || ''))
      .map((participant: any) => ({
          id: String(participant?.id || ''),
          name: (() => {
              const participantId = String(participant?.id || '').trim();
              const rawName = String(participant?.name || participant?.username || '').trim();
              if (!rawName) return 'Participant';
              if (rawName === participantId) return 'Participant';
              if (/^[a-z0-9_-]{18,}$/i.test(rawName)) return 'Participant';
              return rawName;
          })(),
          avatar: String(participant?.avatar || '')
      }))
      .filter((participant) => Boolean(participant.id));
  const voiceCallCandidateUsers = (() => {
      const ordered: { id: string; name: string; avatar?: string }[] = [...activeConversationVoiceTargets];
      const seen = new Set(ordered.map((entry) => entry.id));
      conversations.forEach((conversation) => {
          (conversation?.participants || []).forEach((participant: any) => {
              const id = String(participant?.id || '').trim();
              if (!id || id === String(user?.id || '').trim() || seen.has(id)) return;
              const participantId = String(participant?.id || '').trim();
              const rawName = String(participant?.name || participant?.username || '').trim();
              ordered.push({
                  id,
                  name: (() => {
                      if (!rawName) return 'Participant';
                      if (rawName === participantId) return 'Participant';
                      if (/^[a-z0-9_-]{18,}$/i.test(rawName)) return 'Participant';
                      return rawName;
                  })(),
                  avatar: String(participant?.avatar || '')
              });
              seen.add(id);
          });
      });
      return ordered;
  })();

  useEffect(() => {
      if (typeof document === 'undefined' || !isMobileConversationMode) return;
      const previousBodyOverflow = document.body.style.overflow;
      const previousBodyOverscroll = document.body.style.overscrollBehavior;
      const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.documentElement.style.overscrollBehavior = 'none';
      return () => {
          document.body.style.overflow = previousBodyOverflow;
          document.body.style.overscrollBehavior = previousBodyOverscroll;
          document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      };
  }, [isMobileConversationMode]);
  const voiceCallsBlocked =
      Boolean(voiceRuntimeConfig.blockedForCurrentUser) ||
      !Boolean(voiceRuntimeConfig.enabledVoiceCalls);

  useEffect(() => {
      if (!showMessageSettings || !user) return;
      let mounted = true;
      UserService.getMySettings()
          .then((data) => {
              if (!mounted) return;
              setMessageSettings({
                  messageRequestsNotifications: Boolean(
                      data.messageRequestsNotifications ??
                      data.message_requests_notifications ??
                      true
                  ),
                  allowInMail: Boolean(data.allowInMail ?? data.allow_in_mail ?? true)
              });
          })
          .catch(() => null);
      return () => {
          mounted = false;
      };
  }, [showMessageSettings, user]);

  useEffect(() => {
      if (!user) return;
      let mounted = true;
      BriefsService.getConfig()
          .then((config) => {
              if (!mounted) return;
              setDealFlowConfig(normalizeDealFlowSettings(config));
          })
          .catch(() => {
              if (!mounted) return;
              setDealFlowConfig(normalizeDealFlowSettings(null));
          });
      return () => {
          mounted = false;
      };
  }, [user]);

  const toMediaType = (value: string) => {
      const normalized = (value || '').toLowerCase();
      if (normalized.startsWith('image/')) return 'image';
      if (normalized.startsWith('video/')) return 'video';
      if (normalized.startsWith('audio/')) return 'audio';
      if (normalized === 'image' || normalized === 'video') return normalized;
      if (normalized === 'audio') return 'audio';
      return 'document';
  };

  const extractVoiceCallRecord = (message: Message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
      const voiceCall = metadata?.voiceCall && typeof metadata.voiceCall === 'object' ? metadata.voiceCall : null;
      if (!voiceCall) return null;
      const status = String(voiceCall.status || '').trim().toLowerCase();
      if (!status) return null;
      const durationMs = Number(voiceCall.durationMs || 0);
      const participantCount = Number(voiceCall.participantCount || 0);
      return {
          status,
          durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.trunc(durationMs)) : 0,
          participantCount: Number.isFinite(participantCount) ? Math.max(0, Math.trunc(participantCount)) : 0,
          endedBy: String(voiceCall.endedBy || '').trim(),
          rejectedById: String(voiceCall.rejectedById || '').trim()
      };
  };

  const extractDealFlowEvent = (message: Message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
      const dealFlow = metadata?.dealFlow && typeof metadata.dealFlow === 'object' ? metadata.dealFlow : null;
      if (!dealFlow) return null;
      const eventType = String(dealFlow.eventType || dealFlow.type || '').trim().toLowerCase();
      if (!eventType) return null;
      return {
          ...dealFlow,
          eventType
      };
  };

  const extractStoryReference = (message: Message) => extractStoryMessageReference(message);

  const normalizeBriefFromEvent = (event: any): ProjectBrief | null => {
      const brief = event?.brief && typeof event.brief === 'object' ? event.brief : event;
      const id = String(brief?.id || brief?.briefId || event?.briefId || '').trim();
      if (!id) return null;
      const normalizedConversationId = String(
          brief?.conversation_id ?? brief?.conversationId ?? activeConvoId ?? ''
      );

      return {
          id,
          user_id: String(brief?.user_id ?? brief?.userId ?? ''),
          prompt: String(brief?.prompt ?? brief?.description ?? ''),
          title: String(brief?.title || ''),
          category: String(brief?.category || ''),
          budget_range: String(brief?.budget_range ?? brief?.budgetRange ?? event?.budgetRange ?? 'TBD'),
          timeline: String(brief?.timeline ?? event?.timeline ?? ''),
          description: String(brief?.description ?? ''),
          required_skills: Array.isArray(brief?.required_skills ?? brief?.requiredSkills)
              ? (brief?.required_skills ?? brief?.requiredSkills)
              : [],
          screening_questions: Array.isArray(brief?.screening_questions ?? brief?.screeningQuestions)
              ? (brief?.screening_questions ?? brief?.screeningQuestions)
              : [],
          created_at: String(brief?.created_at ?? brief?.createdAt ?? new Date().toISOString()),
          updated_at: String(brief?.updated_at ?? brief?.updatedAt ?? new Date().toISOString()),
          conversation_id: normalizedConversationId,
          conversationId: normalizedConversationId,
          linked_job_id: brief?.linked_job_id ?? brief?.linkedJobId ?? event?.linkedJobId ?? null,
          linkedJobId: brief?.linkedJobId ?? brief?.linked_job_id ?? event?.linkedJobId ?? null,
          linked_proposals: Array.isArray(brief?.linked_proposals ?? brief?.linkedProposals)
              ? (brief?.linked_proposals ?? brief?.linkedProposals)
              : [],
          linkedProposals: Array.isArray(brief?.linkedProposals ?? brief?.linked_proposals)
              ? (brief?.linkedProposals ?? brief?.linked_proposals)
              : [],
          linked_contract: brief?.linked_contract ?? brief?.linkedContract ?? null,
          linkedContract: brief?.linkedContract ?? brief?.linked_contract ?? null
      };
  };

  const resolveDealFlowPreviewText = (event: any) => {
      if (!event) return '';
      const title = String(event?.title || event?.brief?.title || event?.contract?.title || '').trim();
      if (event.eventType === 'brief_created') return title ? `Brief created: ${title}` : 'Brief created';
      if (event.eventType === 'brief_updated') return title ? `Brief updated: ${title}` : 'Brief updated';
      if (event.eventType === 'proposal_created') return title ? `Proposal created for ${title}` : 'Proposal created';
      if (event.eventType === 'contract_created') return title ? `Contract created: ${title}` : 'Contract created';
      return title || 'Deal flow update';
  };

  const formatVoiceCallDuration = (durationMs: number) => {
      const normalized = Math.max(0, Math.trunc(Number(durationMs || 0)));
      if (!normalized) return '0s';
      const totalSeconds = Math.max(1, Math.round(normalized / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const parts: string[] = [];
      if (hours) parts.push(`${hours}h`);
      if (minutes) parts.push(`${minutes}m`);
      if (!hours && !minutes) parts.push(`${seconds}s`);
      if (hours && seconds) parts.push(`${seconds}s`);
      return parts.join(' ');
  };

  const formatBytes = (bytes?: number) => {
      const value = Number(bytes || 0);
      if (!Number.isFinite(value) || value <= 0) return '';
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentContentId = (attachment: any) => {
      const directId = String(attachment?.fileId || attachment?.file_id || attachment?.id || '').trim();
      if (directId && !directId.startsWith('http')) return directId;
      const directUrl = String(attachment?.url || attachment?.path || attachment?.downloadUrl || '').trim();
      if (!directUrl) return '';
      const match = directUrl.match(/\/api\/files\/content\/([^/?#]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : '';
  };

  const getAttachmentCacheKey = (attachment: any) => {
      const contentId = getAttachmentContentId(attachment);
      if (contentId) return contentId;
      return String(attachment?.url || attachment?.path || attachment?.downloadUrl || attachment?.id || '').trim();
  };

  const isPreviewableAttachment = (attachment: any) => {
      const type = toMediaType(String(attachment?.type || attachment?.mimeType || attachment?.mime_type || ''));
      return type === 'image' || type === 'video' || type === 'audio';
  };

  const normalizeAttachmentForDisplay = (attachment: any) => {
      if (!attachment) return null;
      if (typeof attachment === 'string') {
          const parts = attachment.split('/');
          const name = parts[parts.length - 1] || attachment;
          return { id: attachment, fileId: attachment, url: attachment, name, type: toMediaType(name) };
      }
      const fileId = getAttachmentContentId(attachment);
      const url = String(attachment.url || attachment.path || attachment.downloadUrl || '');
      if (!url && !fileId) return null;
      const name = attachment.name || attachment.filename || attachment.originalName || url.split('/').pop() || 'Attachment';
      const type = toMediaType(attachment.type || attachment.mimeType || attachment.mime_type || '');
      return {
          id: attachment.id || fileId || url,
          fileId,
          url,
          name,
          type,
          size: attachment.size,
          mimeType: attachment.mimeType || attachment.mime_type || ''
      };
  };

  const resolveMessagePreviewText = (message: Partial<Message> | null | undefined) => {
      if (!message) return '';
      if (Boolean(message.isDeleted ?? message.is_deleted)) return 'This message was deleted';
      const dealFlowEvent = extractDealFlowEvent(message as Message);
      if (dealFlowEvent) return resolveDealFlowPreviewText(dealFlowEvent);
      return getMessagePreviewText(message as Message, { currentUserId: user?.id });
  };

  const applyConversationMessageChanges = (
      conversationId: string,
      updater: (messages: Message[]) => Message[]
  ) => {
      setConversations((prev) => {
          const targetConversation = prev.find((conversation) => conversation.id === conversationId);
          const targetMergeKey = targetConversation ? getConversationMergeKey(targetConversation) : '';
          return prev.map((conversation) => {
              const matchesThread =
                  conversation.id === conversationId ||
                  Boolean(targetMergeKey && getConversationMergeKey(conversation) === targetMergeKey);
              if (!matchesThread) return conversation;
              const nextMessages = updater(Array.isArray(conversation.messages) ? conversation.messages : []);
              const lastMessage = nextMessages[nextMessages.length - 1];
              const lastMessageText = resolveMessagePreviewText(lastMessage);
              const lastMessageAt = lastMessage?.timestamp || conversation.lastMessageAt || conversation.last_message_at || '';
              return {
                  ...conversation,
                  messages: nextMessages,
                  lastMessage: lastMessageText,
                  last_message: lastMessageText,
                  lastMessageAt: lastMessageAt || '',
                  last_message_at: lastMessageAt || ''
              };
          });
      });
  };

  const inferUploadCategory = (file: File): UploadedFile['category'] => {
      const mimeType = String(file?.type || '').toLowerCase();
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'portfolio';
      return 'document';
  };

  const uploadMessageFiles = async (files: FileList | File[]) => {
      if (!user) return;
      const queue = Array.from(files || []).filter(Boolean);
      if (!queue.length) return;

      // Optimistic local placeholders — conversation remains interactive while uploads run.
      const pairs = queue.map((file, index) => ({
          file,
          local: createLocalPendingAttachment(file, Date.now() + index)
      }));
      const locals = pairs.map((pair) => pair.local);
      setPendingAttachments((prev) => [...prev, ...locals]);
      setAttachmentUploadState({
          fileName: locals[0]?.name || 'Attachment',
          progress: 0,
          uploadedCount: 0,
          totalCount: locals.length
      });

      let completed = 0;
      let failures = 0;

      await runWithConcurrency(pairs, MESSAGE_UPLOAD_CONCURRENCY, async (pair) => {
          const { file, local } = pair;
          const clientLocalId = String(local.clientLocalId || local.id);
          try {
              // Progressive local previews while upload engine runs (resumable + backoff).
              void generateImageBlurPreview(file).then((preview) => {
                  if (!preview?.blurDataUrl) return;
                  setPendingAttachments((prev) =>
                      updatePendingAttachment(prev, clientLocalId, { url: preview.blurDataUrl } as any)
                  );
              });
              void generateVideoPoster(file).then((poster) => {
                  if (!poster?.blurDataUrl) return;
                  setPendingAttachments((prev) =>
                      updatePendingAttachment(prev, clientLocalId, {
                          url: poster.blurDataUrl,
                          durationMs: poster.durationMs
                      } as any)
                  );
              });
              const engineResult = await uploadMessagingFileWithEngine({
                  file,
                  conversationId: activeConvoId || '',
                  category: inferUploadCategory(file),
                  role: user.role,
                  userId: user.id,
                  onProgress: (progress) => {
                      setPendingAttachments((prev) =>
                          updatePendingAttachment(prev, clientLocalId, {
                              progress,
                              uploadState: 'uploading'
                          })
                      );
                      setAttachmentUploadState((prev) =>
                          prev
                              ? {
                                    ...prev,
                                    fileName: local.name || 'Attachment',
                                    progress
                                }
                              : {
                                    fileName: local.name || 'Attachment',
                                    progress,
                                    uploadedCount: completed,
                                    totalCount: locals.length
                                }
                      );
                  }
              });
              setPendingAttachments((prev) =>
                  reconcilePendingWithUploadedFile(prev, clientLocalId, engineResult.uploaded)
              );
              completed += 1;
              setAttachmentUploadState({
                  fileName: local.name || 'Attachment',
                  progress: 100,
                  uploadedCount: completed,
                  totalCount: locals.length
              });
          } catch (error: any) {
              failures += 1;
              setPendingAttachments((prev) =>
                  updatePendingAttachment(prev, clientLocalId, {
                      uploadState: 'failed',
                      progress: 0,
                      errorMessage: getRecoverableActionMessage('Attachment upload', error)
                  })
              );
              throw error;
          }
      });

      window.setTimeout(() => setAttachmentUploadState(null), 500);
      if (failures > 0 && completed === 0) {
          showNotification('error', 'Attachments', 'Upload failed. Remove failed items and try again.');
      } else if (failures > 0) {
          showNotification(
              'warning',
              'Attachments',
              `${completed} ready, ${failures} failed. Remove failed items before sending.`
          );
      } else {
          showNotification(
              'success',
              'Attachments',
              completed === 1 ? 'Attachment ready to send.' : `${completed} attachments ready to send.`
          );
      }
  };

  const downloadAttachment = async (attachment: AttachmentDisplay) => {
      const fallbackDownload = () => {
          const link = document.createElement('a');
          link.href = attachment.url || '';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.download = attachment.name || 'attachment';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      };

      try {
          let blob: Blob | null = null;
          const contentId = getAttachmentContentId(attachment);
          if (contentId) {
              const response = await api.get(`/files/content/${encodeURIComponent(contentId)}`, {
                  responseType: 'blob'
              });
              blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
          } else {
              const response = await fetch(attachment.url, { credentials: 'include' });
              if (!response.ok) throw new Error(`Download failed (${response.status})`);
              blob = await response.blob();
          }

          const objectUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = attachment.name || 'attachment';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(objectUrl);
      } catch (error) {
          console.warn('Attachment download fallback triggered', error);
          fallbackDownload();
      }
  };

  const preloadMessageAttachment = useCallback(async (attachment: any) => {
      const normalized = normalizeAttachmentForDisplay(attachment);
      if (!normalized || !isPreviewableAttachment(normalized)) return;
      const cacheKey = getAttachmentCacheKey(normalized);
      if (!cacheKey) return;
      const existing = messageMediaResourcesRef.current[cacheKey];
      if (existing?.objectUrl || existing?.loading || pendingMediaFetchRef.current.has(cacheKey)) return;
      const contentId = getAttachmentContentId(normalized);
      if (!contentId && !normalized.url) return;

      pendingMediaFetchRef.current.add(cacheKey);
      setMessageMediaResources((prev) => ({
          ...prev,
          [cacheKey]: {
              ...(prev[cacheKey] || {}),
              loading: true,
              error: undefined
          }
      }));

      try {
          let blob: Blob;
          if (contentId) {
              const response = await api.get(`/files/content/${encodeURIComponent(contentId)}`, {
                  responseType: 'blob'
              });
              blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
          } else {
              const response = await fetch(normalized.url, { credentials: 'include' });
              if (!response.ok) throw new Error(`Preview failed (${response.status})`);
              blob = await response.blob();
          }

          const objectUrl = window.URL.createObjectURL(blob);
          const previousUrl = messageMediaObjectUrlRef.current.get(cacheKey);
          if (previousUrl && previousUrl !== objectUrl) {
              window.URL.revokeObjectURL(previousUrl);
          }
          messageMediaObjectUrlRef.current.set(cacheKey, objectUrl);
          setMessageMediaResources((prev) => ({
              ...prev,
              [cacheKey]: {
                  objectUrl,
                  loading: false,
                  mimeType: blob.type || normalized.mimeType || ''
              }
          }));
      } catch (error) {
          console.warn('Failed to preload message attachment', error);
          setMessageMediaResources((prev) => ({
              ...prev,
              [cacheKey]: {
                  ...(prev[cacheKey] || {}),
                  loading: false,
                  error: 'preview_failed'
              }
          }));
      } finally {
          pendingMediaFetchRef.current.delete(cacheKey);
      }
  }, []);

  const getResolvedAttachmentUrl = (attachment: any) => {
      const normalized = normalizeAttachmentForDisplay(attachment);
      if (!normalized) return '';
      const cacheKey = getAttachmentCacheKey(normalized);
      if (!cacheKey) return normalized.url || '';
      return messageMediaResources[cacheKey]?.objectUrl || normalized.url || '';
  };

  const isAttachmentPreviewLoading = (attachment: any) => {
      const normalized = normalizeAttachmentForDisplay(attachment);
      if (!normalized) return false;
      const cacheKey = getAttachmentCacheKey(normalized);
      if (!cacheKey) return false;
      return Boolean(messageMediaResources[cacheKey]?.loading);
  };

  // Composer pending previews only. Historical message media is loaded by
  // MessageAttachmentRenderer (shared dock + /messages path) to avoid double-fetch
  // and unbounded full-conversation blob preloads (especially video).
  const mediaPreviewCandidates = useMemo(() => {
      const candidates: AttachmentDisplay[] = [];
      const pushCandidate = (value: any) => {
          const normalized = normalizeAttachmentForDisplay(value);
          if (!normalized || !isPreviewableAttachment(normalized)) return;
          candidates.push(normalized);
      };

      pendingAttachments.forEach(pushCandidate);
      return candidates;
  }, [pendingAttachments]);

  useEffect(() => {
      mediaPreviewCandidates.forEach((attachment) => {
          void preloadMessageAttachment(attachment);
      });
  }, [mediaPreviewCandidates, preloadMessageAttachment]);

  const removeAttachment = (fileId: string) => {
      setPendingAttachments((prev) => {
          const next = prev.filter(
              (file) =>
                  String(file.id) !== String(fileId) &&
                  String(file.clientLocalId || '') !== String(fileId) &&
                  String(file.fileId || '') !== String(fileId)
          );
          const removed = prev.filter((file) => !next.includes(file));
          revokePendingObjectUrls(removed);
          return next;
      });
  };

  const refreshConversationData = async (options?: { silent?: boolean }) => {
      if (!user || refreshingRef.current) return;
      if (
          options?.silent &&
          (Boolean(messageInput.trim()) ||
              Boolean(editingMessageId) ||
              Boolean(replyToMessage) ||
              pendingAttachments.length > 0)
      ) {
          return;
      }
      refreshingRef.current = true;
      traceClient('ui.refresh_conversations.start', { silent: Boolean(options?.silent) });
      if (!options?.silent) setIsRefreshing(true);
      try {
          const list = await MessagingService.getAllConversations(user.id, user.role, { force: true });
          setConversations(prev => {
              const activeId = activeConvoIdRef.current;
              const existingMap = new Map(prev.map(conversation => [conversation.id, conversation]));
              const next = list.map((conversation) => {
                  const existing = existingMap.get(conversation.id);
                  if (!existing) return conversation;
                  if (options?.silent && activeId && conversation.id === activeId) {
                      return {
                          ...conversation,
                          messages: existing.messages
                      };
                  }
                  return conversation;
              });
              return mergeDirectConversations(next, userIdRef.current);
          });
          const convoId = activeConvoIdRef.current;
          if (convoId && !options?.silent) {
              const full = await MessagingService.getConversationById(convoId);
              if (full) {
                  setConversations((prev) => {
                      const selfId = userIdRef.current;
                      const mergeKey = getConversationMergeKey(full, selfId);
                      const without = prev.filter((entry) => {
                          if (entry.id === full.id) return false;
                          if (mergeKey && getConversationMergeKey(entry, selfId) === mergeKey) return false;
                          return true;
                      });
                      return mergeDirectConversations([{ ...full }, ...without], selfId);
                  });
              }
          }
          refreshMessages();
          traceClient('ui.refresh_conversations.success', {
              totalConversations: list.length,
              activeConversationId: activeConvoIdRef.current
          });
      } catch (error) {
          console.error('Failed to refresh messages', error);
          traceClient('ui.refresh_conversations.error', { error: String((error as any)?.message || error) });
      } finally {
          refreshingRef.current = false;
          if (!options?.silent) setIsRefreshing(false);
      }
  };

  // Fallback poll only when socket is unhealthy (grace handled by health state).
  // Healthy sockets rely on event-driven updates — no routine 30s polling.
  useEffect(() => {
      if (!user) return;
      if (isConnected || connectionHealth === 'connected') return;
      if (connectionHealth === 'offline') return;
      if (connectionHealth === 'connecting' || connectionHealth === 'reconnecting') {
          // Brief reconnect window — no poll storm.
          return;
      }
      const interval = window.setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          void refreshConversationData({ silent: true });
      }, 30_000);
      return () => window.clearInterval(interval);
  }, [user, isConnected, connectionHealth]);

  const handleMessagesScroll = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      messagesScrollMetricsRef.current = {
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
          clientHeight: container.clientHeight
      };
      shouldAutoScrollRef.current = isNearBottom(
          container.scrollTop,
          container.scrollHeight,
          container.clientHeight,
          120
      );
  };

  const normalizeIncomingMessage = (raw: any): Message => {
      const conversationId = raw?.conversation_id ?? raw?.conversationId ?? '';
      const senderId = raw?.sender_id ?? raw?.senderId ?? '';
      const receiverId = raw?.receiver_id ?? raw?.receiverId ?? '';
      const timestamp = raw?.timestamp ?? raw?.createdAt ?? new Date().toISOString();
      const isRead = Boolean(raw?.is_read ?? raw?.isRead ?? false);
      const rawAttachments = Array.isArray(raw?.attachments)
          ? raw.attachments
          : Array.isArray(raw?.attachment_ids)
              ? raw.attachment_ids
              : Array.isArray(raw?.attachmentIds)
                  ? raw.attachmentIds
                  : [];
      const attachments = rawAttachments
          .map((attachment: any) => normalizeAttachmentForDisplay(attachment))
          .filter(Boolean);
      return {
          id: raw?.id ?? `${conversationId}-msg-${Date.now()}`,
          conversation_id: conversationId,
          sender_id: senderId,
          receiver_id: receiverId,
          text: raw?.text ?? '',
          timestamp,
          is_read: isRead,
          message_type: raw?.message_type ?? raw?.messageType ?? 'text',
          messageType: raw?.messageType ?? raw?.message_type ?? 'text',
          metadata: raw?.metadata ?? null,
          voice_note: raw?.voice_note ?? raw?.voiceNote ?? null,
          voiceNote: raw?.voiceNote ?? raw?.voice_note ?? null,
          reactions: Array.isArray(raw?.reactions) ? raw.reactions : [],
          attachments,
          attachment_ids: rawAttachments,
          reply_to_message_id: raw?.reply_to_message_id ?? raw?.replyToMessageId ?? null,
          replyToMessageId: raw?.replyToMessageId ?? raw?.reply_to_message_id ?? null,
          reply_to_snapshot: raw?.reply_to_snapshot ?? raw?.replyToSnapshot ?? null,
          replyToSnapshot: raw?.replyToSnapshot ?? raw?.reply_to_snapshot ?? null,
          reply_to: raw?.reply_to ?? raw?.replyTo ?? null,
          replyTo: raw?.replyTo ?? raw?.reply_to ?? null,
          conversationId,
          senderId,
          receiverId,
          isRead
      };
  };

  useEffect(() => {
      if (!socket || !user) return;

      const handleIncoming = (payload: any) => {
          const message = normalizeIncomingMessage(payload);
          const convoId = message.conversation_id || message.conversationId;
          if (!convoId) return;
          traceClient('socket.messages_incoming', {
              socketEvent: payload?.sender_id === userIdRef.current ? 'messages:sent' : 'messages:new',
              conversationId: convoId,
              messageId: message.id,
              textLength: String(message.text || '').length
          });

          // Clear Scrolitha thinking when an assistant message arrives for the active thread.
          const incomingFromOther = (message.senderId || message.sender_id) !== userIdRef.current;
          if (
              incomingFromOther &&
              activeConvoIdRef.current === convoId &&
              (Boolean((message as any)?.isScrolitha) ||
                  Boolean((message as any)?.is_scrolitha) ||
                  Boolean((payload as any)?.isScrolitha) ||
                  Boolean((payload as any)?.is_scrolitha) ||
                  Boolean(String(message.text || '').trim()))
          ) {
              setScrolithaThinking(false);
              if (String(message.text || '').trim()) {
                  setScrolithaError(null);
              }
          }

          setConversations(prev => {
              let found = false;
              const updated = prev.map(c => {
                  const matchesThread = messageMatchesConversation(message, c);
                  if (!matchesThread) return c;
                  found = true;
                  // Reconcile optimistic clientSendId rows the same way as dock.
                  const nextMessages = reconcileOptimisticMessage(c.messages || [], message);
                  const isActive = activeConvoIdRef.current === convoId;
                  const isFromOther = incomingFromOther;
                  const unreadBase = Number(c.unreadCount ?? c.unread_count ?? 0) || 0;
                  // Full-page local thread state only. Shared badge unread is owned by MessageContext.
                  // Do not re-increment when the same message id is re-delivered.
                  const alreadyHad = (c.messages || []).some((m) => m.id === message.id);
                  const unreadCount = isActive
                      ? 0
                      : !isFromOther || alreadyHad
                        ? Math.max(0, unreadBase)
                        : Math.max(0, unreadBase) + 1;
                  const lastMessageText = resolveMessagePreviewText(message);
                  return {
                      ...c,
                      messages: nextMessages,
                      lastMessage: lastMessageText,
                      lastMessageAt: message.timestamp,
                      last_message: lastMessageText,
                      last_message_at: message.timestamp,
                      unreadCount,
                      unread_count: unreadCount
                  };
              });

              if (!found) {
                  void MessagingService.getConversationById(convoId).then((full) => {
                      if (!full) return;
                      const fullMergeKey = getConversationMergeKey(full);
                      setConversations(current => [
                          full,
                          ...current.filter((conversation) => {
                              if (conversation.id === convoId) return false;
                              return Boolean(!(fullMergeKey && getConversationMergeKey(conversation) === fullMergeKey));
                          })
                      ]);
                  });
                  return prev;
              }
              return updated;
          });

          const isActive = activeConvoIdRef.current === convoId;
          const isFromOther = (message.senderId || message.sender_id) !== userIdRef.current;
          if (isActive && isFromOther && userIdRef.current) {
              void MessagingService.markAsRead(convoId, userIdRef.current).catch(() => {
                  // Read receipts are best-effort and should not surface as unhandled runtime errors.
              });
              setConversations(prev => prev.map(c => {
                  if (c.id !== convoId) return c;
                  return {
                      ...c,
                      unreadCount: 0,
                      unread_count: 0,
                      messages: c.messages.map(m => m.id === message.id ? { ...m, isRead: true, is_read: true } : m)
                  };
              }));
          }
          // Shared list/unread/badge reconciliation is owned by MessageContext socket handlers.
          // Do not call refreshMessages() here — that double-owned badge updates and caused thrash.
      };

      const handleRead = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          traceClient('socket.messages_read', { conversationId: convoId });
          setConversations(prev => prev.map(c => {
              if (c.id !== convoId) return c;
              return {
                  ...c,
                  unreadCount: 0,
                  unread_count: 0,
                  messages: c.messages.map(m => ({ ...m, isRead: true, is_read: true }))
              };
          }));
      };

      const handlePresence = (payload: any) => {
          const userId = payload?.userId;
          if (!userId) return;
          const isOnline = Boolean(payload?.isOnline ?? payload?.is_online);
          const lastSeenAt = payload?.lastSeenAt ?? payload?.last_seen_at;
          setConversations(prev => prev.map(c => ({
              ...c,
              participants: c.participants.map(p => p.id === userId ? { ...p, isOnline, is_online: isOnline, lastSeenAt, last_seen_at: lastSeenAt } : p)
          })));
      };

      const handleTyping = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          const typingUserId = String(payload?.userId || '').trim();
          if (!convoId || convoId !== activeConvoIdRef.current) return;
          if (typingUserId && typingUserId === userIdRef.current && !payload?.typing) return;

          // Phase 29.3 — multi-typer array from Phase 29.2
          const multi = formatMultiTyperLabel(
              Array.isArray(payload?.typing) ? payload.typing : Array.isArray(payload?.typers) ? payload.typers : null,
              userIdRef.current
          );
          if (multi) {
              setPresenceIndicatorLabel(multi);
              setTypingUser(multi);
              if (typingIndicatorTimerRef.current) window.clearTimeout(typingIndicatorTimerRef.current);
              typingIndicatorTimerRef.current = window.setTimeout(() => {
                  setTypingUser(null);
                  setPresenceIndicatorLabel(null);
                  typingIndicatorTimerRef.current = null;
              }, 6000);
              return;
          }

          if (!typingUserId || typingUserId === userIdRef.current) return;

          if (!payload?.isTyping) {
              setTypingUser((current) =>
                  current && !String(current).startsWith('recording:') ? null : current
              );
              setPresenceIndicatorLabel(null);
              if (typingIndicatorTimerRef.current) {
                  window.clearTimeout(typingIndicatorTimerRef.current);
                  typingIndicatorTimerRef.current = null;
              }
              return;
          }

          setTypingUser(String(payload?.name || 'Someone').trim() || 'Someone');
          setPresenceIndicatorLabel(null);
          if (typingIndicatorTimerRef.current) {
              window.clearTimeout(typingIndicatorTimerRef.current);
          }
          typingIndicatorTimerRef.current = window.setTimeout(() => {
              setTypingUser(null);
              typingIndicatorTimerRef.current = null;
          }, 2200);
      };

      const handleRecording = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          const recUserId = String(payload?.userId || '').trim();
          if (!convoId || convoId !== activeConvoIdRef.current) return;
          const multiRec = formatMultiRecorderLabel(
              Array.isArray(payload?.recording)
                  ? payload.recording
                  : Array.isArray(payload?.recorders)
                    ? payload.recorders
                    : null,
              userIdRef.current
          );
          if (multiRec) {
              setTypingUser(`recording:${multiRec.replace(/ is recording…$/, '').replace(/ are recording…$/, '')}`);
              setPresenceIndicatorLabel(multiRec);
              return;
          }
          if (!recUserId || recUserId === userIdRef.current) return;
          if (!payload?.isRecording) {
              setTypingUser((current) =>
                  current && String(current).startsWith('recording:') ? null : current
              );
              setPresenceIndicatorLabel(null);
              return;
          }
          const name = String(payload?.name || 'Someone').trim() || 'Someone';
          setTypingUser(`recording:${name}`);
      };

      const handleReceipts = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          const peerUserId = String(payload?.userId || '').trim();
          if (!peerUserId || peerUserId === userIdRef.current) return;
          const lastReadAt = payload?.lastReadAt ? new Date(payload.lastReadAt).getTime() : 0;
          const lastDeliveredAt = payload?.lastDeliveredAt
              ? new Date(payload.lastDeliveredAt).getTime()
              : lastReadAt;
          setConversations((prev) =>
              prev.map((c) => {
                  if (c.id !== convoId) return c;
                  return {
                      ...c,
                      messages: (c.messages || []).map((m: any) => {
                          if (String(m.senderId || m.sender_id) !== String(user?.id || '')) return m;
                          const created = new Date(m.timestamp || 0).getTime();
                          if (!created) return m;
                          let deliveryStatus = m.deliveryStatus || m.delivery_status || 'sent';
                          if (lastReadAt && created <= lastReadAt) deliveryStatus = 'read';
                          else if (lastDeliveredAt && created <= lastDeliveredAt && deliveryStatus !== 'read') {
                              deliveryStatus = 'delivered';
                          }
                          return {
                              ...m,
                              deliveryStatus,
                              delivery_status: deliveryStatus,
                              isRead: deliveryStatus === 'read',
                              is_read: deliveryStatus === 'read',
                              isDelivered: deliveryStatus === 'delivered' || deliveryStatus === 'read',
                              is_delivered: deliveryStatus === 'delivered' || deliveryStatus === 'read'
                          };
                      })
                  };
              })
          );
      };

      const handleMessageUpdated = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          const messageId = payload?.messageId || payload?.id;
          if (!convoId || !messageId) return;
          const deletedForMe = Boolean(payload?.deletedForMe ?? payload?.deleted_for_me ?? false);
          const isDeleted = Boolean(payload?.isDeleted ?? payload?.is_deleted);
          traceClient('socket.message_updated', {
              conversationId: convoId,
              messageId,
              deletedForMe,
              isDeleted,
              editedAt: payload?.editedAt ?? payload?.edited_at ?? null
          });
          setConversations(prev => {
              if (deletedForMe || isDeleted) {
                  const target = prev.find((entry) => entry.id === convoId);
                  const existing = target?.messages?.find((entry) => entry.id === messageId);
                  if (existing) revokeMessageAttachmentMediaUrls(existing);
              }
              return prev.map(c => {
              if (c.id !== convoId) return c;
              if (deletedForMe) {
                  const nextMessages = c.messages.filter(m => m.id !== messageId);
                  const nextLast = nextMessages[nextMessages.length - 1];
                  const nextLastText = resolveMessagePreviewText(nextLast);
                  const nextLastAt = nextLast?.timestamp || '';
                  return {
                      ...c,
                      messages: nextMessages,
                      lastMessage: nextLastText,
                      last_message: nextLastText,
                      lastMessageAt: nextLastAt,
                      last_message_at: nextLastAt
                  };
              }
              const isReactionUpdate =
                  payload?.updateKind === 'reaction' ||
                  Array.isArray(payload?.reactions) ||
                  Boolean(payload?.reactionSummary || payload?.reaction_summary);
              const nextReactions = Array.isArray(payload?.reactions)
                  ? normalizeMessageReactions(payload.reactions)
                  : null;
              const nextReactionSummary =
                  payload?.reactionSummary ??
                  payload?.reaction_summary ??
                  (nextReactions
                      ? nextReactions.reduce((acc: Record<string, number>, reaction: any) => {
                            const key = String(reaction?.emoji || '').trim();
                            if (!key) return acc;
                            acc[key] = (acc[key] || 0) + 1;
                            return acc;
                        }, {})
                      : undefined);
              const nextMessages = c.messages.map(m => {
                  if (m.id !== messageId) return m;
                  return {
                      ...m,
                      text: isReactionUpdate ? m.text : (payload?.text ?? m.text),
                      timestamp: isReactionUpdate ? m.timestamp : (payload?.timestamp ?? m.timestamp),
                      editedAt: isReactionUpdate
                          ? m.editedAt ?? m.edited_at ?? null
                          : payload?.editedAt ?? payload?.edited_at ?? m.editedAt ?? m.edited_at ?? null,
                      edited_at: isReactionUpdate
                          ? m.edited_at ?? m.editedAt ?? null
                          : payload?.edited_at ?? payload?.editedAt ?? m.edited_at ?? m.editedAt ?? null,
                      isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? m.isDeleted ?? m.is_deleted),
                      is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? m.is_deleted ?? m.isDeleted),
                      deletedAt: payload?.deletedAt ?? payload?.deleted_at ?? m.deletedAt ?? m.deleted_at ?? null,
                      deleted_at: payload?.deleted_at ?? payload?.deletedAt ?? m.deleted_at ?? m.deletedAt ?? null,
                      attachments:
                          isReactionUpdate || !Array.isArray(payload?.attachments)
                              ? m.attachments
                              : payload.attachments,
                      reactions: nextReactions !== null ? nextReactions : m.reactions,
                      reactionSummary:
                          nextReactionSummary !== undefined ? nextReactionSummary : m.reactionSummary
                  };
              });
              if (isReactionUpdate) {
                  return {
                      ...c,
                      messages: nextMessages
                  };
              }
              const nextLast = nextMessages[nextMessages.length - 1];
              const nextLastText =
                  payload?.lastMessage ??
                  payload?.last_message ??
                  resolveMessagePreviewText(nextLast);
              const nextLastAt =
                  payload?.lastMessageAt ??
                  payload?.last_message_at ??
                  nextLast?.timestamp ??
                  c.lastMessageAt ??
                  c.last_message_at ??
                  '';
              return {
                  ...c,
                  messages: nextMessages,
                  lastMessage: nextLastText,
                  last_message: nextLastText,
                  lastMessageAt: nextLastAt,
                  last_message_at: nextLastAt
              };
              });
          });
      };

      const handleConversationUpdated = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          traceClient('socket.conversation_updated', { conversationId: convoId, payload });
          if (Array.isArray(payload?.pins) && convoId === activeConvoIdRef.current) {
              setGroupPins(payload.pins);
          }
          setConversations(prev => {
              const targetConversation = prev.find((conversation) => conversation.id === convoId);
              const targetMergeKey = targetConversation ? getConversationMergeKey(targetConversation) : '';
              return prev.map(conversation => {
                  const matchesThread =
                      conversation.id === convoId ||
                      Boolean(targetMergeKey && getConversationMergeKey(conversation) === targetMergeKey);
                  if (!matchesThread) return conversation;
                  return {
                      ...conversation,
                      ...(payload?.label !== undefined ? { label: payload.label } : {}),
                      ...(payload?.isStarred !== undefined ? { isStarred: Boolean(payload.isStarred), is_starred: Boolean(payload.isStarred) } : {}),
                      ...(payload?.isMuted !== undefined ? { isMuted: Boolean(payload.isMuted), is_muted: Boolean(payload.isMuted) } : {}),
                      ...(payload?.isArchived !== undefined ? { isArchived: Boolean(payload.isArchived), is_archived: Boolean(payload.isArchived) } : {}),
                      ...(payload?.unread_count !== undefined ? { unreadCount: Number(payload.unread_count), unread_count: Number(payload.unread_count) } : {}),
                      ...(payload?.avatarFileId !== undefined
                          ? {
                                avatarFileId: payload.avatarFileId || null,
                                avatar_file_id: payload.avatarFileId || null
                            }
                          : {}),
                      ...(payload?.title !== undefined ? { title: payload.title } : {}),
                      ...(payload?.lastMessage !== undefined || payload?.last_message !== undefined
                          ? {
                                lastMessage: payload?.lastMessage ?? payload?.last_message ?? conversation.lastMessage,
                                last_message: payload?.last_message ?? payload?.lastMessage ?? conversation.last_message
                            }
                          : {}),
                      ...(payload?.lastMessageAt !== undefined || payload?.last_message_at !== undefined
                          ? {
                                lastMessageAt: payload?.lastMessageAt ?? payload?.last_message_at ?? conversation.lastMessageAt,
                                last_message_at: payload?.last_message_at ?? payload?.lastMessageAt ?? conversation.last_message_at
                            }
                          : {})
                  };
              });
          });
      };

      const handleConversationDeleted = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          traceClient('socket.conversation_deleted', { conversationId: convoId });
          setConversations(prev => {
              const targetConversation = prev.find((conversation) => conversation.id === convoId);
              const targetMergeKey = targetConversation ? getConversationMergeKey(targetConversation) : '';
              return prev.filter((conversation) => {
                  if (conversation.id === convoId) return false;
                  if (targetMergeKey && getConversationMergeKey(conversation) === targetMergeKey) return false;
                  return true;
              });
          });
          if (activeConvoIdRef.current === convoId) {
              setActiveConvoId(null);
              navigate('/messages');
          }
      };

      const handlePrivacyUpdated = (payload: any) => {
          // Self-only full settings broadcast — other devices/tabs reconcile without reload.
          if (!payload || (payload.userId && user?.id && payload.userId !== user.id)) return;
          traceClient('socket.privacy_updated', {
              updatedAt: payload?.updatedAt || payload?.settings?.updatedAt || null
          });
          // Best-effort: presence projection may change after privacy update; refresh batch presence.
          void refreshMessages().catch(() => null);
      };

      socket.on('messages:new', handleIncoming);
      socket.on('messages:sent', handleIncoming);
      socket.on('messages:read', handleRead);
      socket.on('messages:receipts', handleReceipts);
      socket.on('messages:typing', handleTyping);
      socket.on('messages:recording', handleRecording);
      socket.on('presence:update', handlePresence);
      socket.on('presence:updated', handlePresence);
      socket.on('messages:updated', handleMessageUpdated);
      socket.on('messages:reaction', handleMessageUpdated);
      socket.on('messages:conversation_updated', handleConversationUpdated);
      socket.on('messages:conversation_deleted', handleConversationDeleted);
      socket.on('messages:privacy:updated', handlePrivacyUpdated);

      const handlePinUpdated = (payload: any) => {
          const convoId = String(payload?.conversationId || payload?.conversation_id || '').trim();
          if (!convoId || convoId !== activeConvoIdRef.current) return;
          // Pin events only apply to groups; avoid listGroupPins on DIRECT (403).
          if (Array.isArray(payload?.pins)) {
              setGroupPins(payload.pins);
          }
          const actorId = String(payload?.actorId || '').trim();
          if (actorId && actorId !== userIdRef.current && payload?.action === 'created') {
              showNotification('info', 'Pinned message', 'A message was pinned in this chat.');
          }
      };

      const handleAppearanceUpdated = (payload: any) => {
          const convoId = String(payload?.conversationId || payload?.conversation_id || '').trim();
          if (!convoId || convoId !== activeConvoIdRef.current) return;
          const payloadUserId = String(payload?.userId || payload?.participantId || '').trim();
          if (payloadUserId && user?.id && payloadUserId !== String(user.id)) return;
          if (payload?.appearance) {
              setChatAppearance(payload.appearance);
          }
      };

      const handleGroupUpdated = (payload: any) => {
          const convoId = String(payload?.conversationId || payload?.conversation_id || '').trim();
          if (!convoId) return;
          const avatarFileId =
              payload?.avatarFileId != null
                  ? String(payload.avatarFileId || '').trim() || null
                  : undefined;
          const title =
              payload?.title != null ? String(payload.title || '').trim() || null : undefined;
          setConversations((prev) =>
              prev.map((c) => {
                  if (c.id !== convoId) return c;
                  return {
                      ...c,
                      ...(avatarFileId !== undefined
                          ? { avatarFileId, avatar_file_id: avatarFileId }
                          : {}),
                      ...(title !== undefined ? { title } : {})
                  } as any;
              })
          );
          if (convoId === activeConvoIdRef.current && avatarFileId !== undefined) {
              setActiveGroupProfile((prev: any) =>
                  prev ? { ...prev, avatarFileId, avatar_file_id: avatarFileId } : prev
              );
          }
      };

      socket.on('messages:pin_updated', handlePinUpdated);
      socket.on('messages:appearance_updated', handleAppearanceUpdated);
      socket.on('messages:group_updated', handleGroupUpdated);
      return () => {
          socket.off('messages:new', handleIncoming);
          socket.off('messages:sent', handleIncoming);
          socket.off('messages:read', handleRead);
          socket.off('messages:receipts', handleReceipts);
          socket.off('messages:typing', handleTyping);
          socket.off('messages:recording', handleRecording);
          socket.off('presence:update', handlePresence);
          socket.off('presence:updated', handlePresence);
          socket.off('messages:updated', handleMessageUpdated);
          socket.off('messages:reaction', handleMessageUpdated);
          socket.off('messages:conversation_updated', handleConversationUpdated);
          socket.off('messages:conversation_deleted', handleConversationDeleted);
          socket.off('messages:privacy:updated', handlePrivacyUpdated);
          socket.off('messages:pin_updated', handlePinUpdated);
          socket.off('messages:appearance_updated', handleAppearanceUpdated);
          socket.off('messages:group_updated', handleGroupUpdated);
      };
  }, [socket, user, refreshMessages, navigate, showNotification]);
  const renderReplyPreview = (message: Message) => {
      const reply = (message.replyTo || message.reply_to || null) as any;
      if (!reply && !message.replyToMessageId && !message.reply_to_message_id) return null;
      const targetId = reply?.messageId || message.replyToMessageId || message.reply_to_message_id;
      const senderName = reply?.senderName || 'Message';
      const snippet = reply?.snippet || 'Message unavailable';
      const unavailable = Boolean(reply?.unavailable);
      return (
          <button
              type="button"
              onClick={() => {
                  if (!targetId) return;
                  const existing = document.getElementById(`message-${targetId}`);
                  if (existing) {
                      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      return;
                  }
                  if (!activeConvoId) return;
                  void MessagingService.getConversationById(activeConvoId).then((full) => {
                      if (!full) return;
                      setConversations(prev => prev.map(c => c.id === activeConvoId ? { ...c, ...full } : c));
                      window.setTimeout(() => {
                          document.getElementById(`message-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 120);
                  });
              }}
              className={`mb-2 w-full rounded-xl border px-3 py-2 text-left text-[11px] shadow-sm transition hover:opacity-95 ${
                  message.senderId === user?.id
                      ? 'border-blue-300/60 bg-blue-500/20 text-blue-50'
                      : 'border-gray-200 bg-white/80 text-gray-600'
              }`}
          >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">{senderName}</div>
              <div className={`mt-1 truncate text-xs ${unavailable ? 'italic' : ''}`}>{unavailable ? 'Message unavailable' : snippet}</div>
          </button>
      );
  };

  const renderDealFlowCard = (message: Message) => {
      const event = extractDealFlowEvent(message);
      if (!event) return null;

      const brief = normalizeBriefFromEvent(event);
      const proposal = event?.proposal && typeof event.proposal === 'object' ? event.proposal : null;
      const contract = event?.contract && typeof event.contract === 'object' ? event.contract : null;
      const isEmployerViewer = normalizedUserRole.includes('employer') || normalizedUserRole.includes('client') || normalizedUserRole.includes('admin');
      const proposalStatus = String(proposal?.status || '').trim().toLowerCase();
      const canAcceptProposalFromCard =
          isEmployerViewer &&
          event.eventType === 'proposal_created' &&
          Boolean(event?.proposalId || proposal?.id) &&
          proposalStatus !== 'accepted' &&
          timelineActionBusyId !== message.id;

      return (
          <div className="mx-auto w-full max-w-2xl rounded-3xl border border-indigo-100 bg-white/95 p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700">
                      {event.eventType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-gray-500">
                      {new Date(message.timestamp).toLocaleString()}
                  </span>
              </div>

              <div className="mt-3 space-y-3">
                  {(event.eventType === 'brief_created' || event.eventType === 'brief_updated') && brief ? (
                      <>
                          <div>
                              <h4 className="text-base font-bold text-gray-900">{brief.title || 'Conversation brief'}</h4>
                              <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{brief.description || brief.prompt}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                              {brief.category ? <span className="rounded-full bg-gray-100 px-2.5 py-1">{brief.category}</span> : null}
                              {brief.budget_range ? <span className="rounded-full bg-gray-100 px-2.5 py-1">{brief.budget_range}</span> : null}
                              {brief.timeline ? <span className="rounded-full bg-gray-100 px-2.5 py-1">{brief.timeline}</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                              {canCreateBriefFromConversation ? (
                                  <button
                                      type="button"
                                      onClick={() => void openExistingBriefComposer(brief.id, brief)}
                                      disabled={briefComposerBusy}
                                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                  >
                                      {briefComposerBusy ? 'Loading...' : 'Edit Brief'}
                                  </button>
                              ) : null}
                              {canCreateProposalFromBrief && (brief.linked_job_id ?? brief.linkedJobId) ? (
                                  <button
                                      type="button"
                                      onClick={() => void openProposalComposerForBrief(brief.id, brief)}
                                      disabled={proposalComposerBusy}
                                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                      {proposalComposerBusy ? 'Loading...' : 'Create Proposal'}
                                  </button>
                              ) : null}
                          </div>
                      </>
                  ) : null}

                  {event.eventType === 'proposal_created' && proposal ? (
                      <>
                          <div>
                              <h4 className="text-base font-bold text-gray-900">{event?.title || 'Proposal created'}</h4>
                              <p className="mt-1 text-sm text-gray-600">
                                  {proposal.freelancerName || 'Freelancer'} proposed {proposal.proposedAmount ? `$${Number(proposal.proposedAmount).toFixed(2)}` : 'a custom amount'}
                                  {proposal.proposedTimeline ? ` for ${proposal.proposedTimeline} days` : ''}.
                              </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                              {proposal.status ? <span className="rounded-full bg-gray-100 px-2.5 py-1 capitalize">{proposal.status}</span> : null}
                              {proposal.proposedAmount ? <span className="rounded-full bg-gray-100 px-2.5 py-1">${Number(proposal.proposedAmount).toFixed(2)}</span> : null}
                              {proposal.proposedTimeline ? <span className="rounded-full bg-gray-100 px-2.5 py-1">{proposal.proposedTimeline} days</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                              {canAcceptProposalFromCard ? (
                                  <button
                                      type="button"
                                      onClick={() => {
                                          setAcceptProposalEvent({
                                              messageId: message.id,
                                              event
                                          });
                                      }}
                                      disabled={timelineActionBusyId === message.id}
                                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                      {timelineActionBusyId === message.id ? 'Creating contract...' : 'Accept & Create Contract'}
                                  </button>
                              ) : null}
                              <button
                                  type="button"
                                  onClick={() => navigate(isEmployerViewer ? '/client/dashboard?tab=proposals-offers' : '/freelancer/dashboard?tab=my-proposals')}
                                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                  Open Proposal Pipeline
                              </button>
                          </div>
                      </>
                  ) : null}

                  {event.eventType === 'contract_created' && contract ? (
                      <>
                          <div>
                              <h4 className="text-base font-bold text-gray-900">{contract.title || event?.title || 'Contract created'}</h4>
                              <p className="mt-1 text-sm text-gray-600">
                                  The proposal has been converted into an active contract with the agreed delivery and payment structure.
                              </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                              {contract.status ? <span className="rounded-full bg-gray-100 px-2.5 py-1 capitalize">{contract.status}</span> : null}
                              {contract.paymentCycle ? <span className="rounded-full bg-gray-100 px-2.5 py-1 capitalize">{String(contract.paymentCycle).replace('_', ' ')}</span> : null}
                              {contract.startDate ? <span className="rounded-full bg-gray-100 px-2.5 py-1">Starts {new Date(contract.startDate).toLocaleDateString()}</span> : null}
                              {contract.contractValue ? <span className="rounded-full bg-gray-100 px-2.5 py-1">${Number(contract.contractValue).toFixed(2)} fixed</span> : null}
                              {contract.hourlyRate ? <span className="rounded-full bg-gray-100 px-2.5 py-1">${Number(contract.hourlyRate).toFixed(2)}/hr</span> : null}
                              {Array.isArray(contract.milestones) && contract.milestones.length ? (
                                  <span className="rounded-full bg-gray-100 px-2.5 py-1">{contract.milestones.length} milestones</span>
                              ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                              <button
                                  type="button"
                                  onClick={() => navigate(isEmployerViewer ? `/client/dashboard?tab=contracts&contract_id=${event.contractId || contract.id || ''}` : `/freelancer/dashboard?tab=contracts&contract_id=${event.contractId || contract.id || ''}`)}
                                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                  Open Contract
                              </button>
                          </div>
                      </>
                  ) : null}
              </div>
          </div>
      );
  };
  // Typing indicator can be wired to real-time events later.

  const handleConversationClick = (id: string, matchedMessageId?: string | null) => {
      const searchResult = searchResultByConversationId.get(id);
      if (searchResult?.conversation) {
          setConversations((prev) => {
              if (prev.some((conversation) => conversation.id === id)) return prev;
              return [searchResult.conversation, ...prev];
          });
      }
      setActiveConvoId(id);
      if (matchedMessageId) {
          pendingSearchMessageFocusRef.current = matchedMessageId;
          navigate(`/messages/${id}?messageId=${encodeURIComponent(matchedMessageId)}`);
          return;
      }
      pendingSearchMessageFocusRef.current = null;
      navigate(`/messages/${id}`);
  };

  const handleBackToInbox = () => {
      setActiveConvoId(null);
      setExpandedMessageId(null);
      setReactionPanelMessageId(null);
      setShowConversationMenu(false);
      navigate('/messages', { replace: true });
  };

  const renderHighlightedText = (value: string, query: string) => {
      const text = String(value || '');
      const needle = String(query || '').trim();
      if (!needle) return text;
      const index = text.toLowerCase().indexOf(needle.toLowerCase());
      if (index < 0) return text;
      return (
          <>
              {text.slice(0, index)}
              <mark className="rounded bg-yellow-100 px-0.5 font-semibold text-gray-900">
                  {text.slice(index, index + needle.length)}
              </mark>
              {text.slice(index + needle.length)}
          </>
      );
  };

  const openConversationBriefComposer = useCallback(async () => {
      if (!activeConvoId || !canCreateBriefFromConversation) return;
      setBriefComposerBusy(true);
      try {
          const draft = await BriefsService.draftFromConversation({ conversationId: activeConvoId });
          setBriefDraft({
              ...draft,
              conversation_id: activeConvoId,
              conversationId: activeConvoId
          });
          setShowBriefComposer(true);
      } catch (error: any) {
          showNotification('error', 'Brief', error?.message || 'Unable to extract a brief from this conversation.');
      } finally {
          setBriefComposerBusy(false);
      }
  }, [activeConvoId, canCreateBriefFromConversation]);

  useEffect(() => {
      const shouldComposeBrief = ['1', 'true', 'yes', 'on'].includes(
          String(searchParams.get('composeBrief') || '').trim().toLowerCase()
      );
      if (!shouldComposeBrief || !activeConvoId || showBriefComposer || briefComposerBusy || !canCreateBriefFromConversation) {
          return;
      }
      void openConversationBriefComposer().finally(() => {
          const next = new URLSearchParams(searchParams);
          next.delete('composeBrief');
          setSearchParams(next, { replace: true });
      });
  }, [
      activeConvoId,
      briefComposerBusy,
      canCreateBriefFromConversation,
      openConversationBriefComposer,
      searchParams,
      setSearchParams,
      showBriefComposer
  ]);

  const openExistingBriefComposer = async (briefId: string, fallback?: ProjectBrief | null) => {
      setBriefComposerBusy(true);
      try {
          const brief = briefId ? await BriefsService.getBrief(briefId) : fallback;
          if (!brief) throw new Error('Brief not found');
          setBriefDraft(brief);
          setShowBriefComposer(true);
      } catch (error: any) {
          showNotification('error', 'Brief', error?.message || 'Unable to load brief.');
      } finally {
          setBriefComposerBusy(false);
      }
  };

  const handleSaveBrief = async () => {
      const title = String(briefDraft.title || '').trim();
      const description = String(briefDraft.description || briefDraft.prompt || '').trim();
      if (!title || !description) {
          showNotification('error', 'Brief', 'Title and description are required.');
          return;
      }

      setBriefComposerBusy(true);
      try {
          const saved = await BriefsService.saveBrief({
              ...briefDraft,
              title,
              description,
              prompt: String(briefDraft.prompt || description),
              category: String(briefDraft.category || dealFlowConfig.defaultCategory || 'General'),
              budget_range: String(briefDraft.budget_range || briefDraft.budgetRange || 'TBD'),
              timeline: String(briefDraft.timeline || '2-4 weeks'),
              required_skills: Array.isArray(briefDraft.required_skills ?? briefDraft.requiredSkills)
                  ? (briefDraft.required_skills ?? briefDraft.requiredSkills)
                  : [],
              screening_questions: Array.isArray(briefDraft.screening_questions ?? briefDraft.screeningQuestions)
                  ? (briefDraft.screening_questions ?? briefDraft.screeningQuestions)
                  : []
          } as Partial<ProjectBrief>);
          setBriefDraft(saved);
          setShowBriefComposer(false);
          showNotification('success', 'Brief', 'Conversation brief saved.');
          void refreshConversationData();
      } catch (error: any) {
          showNotification('error', 'Brief', error?.message || 'Failed to save brief.');
      } finally {
          setBriefComposerBusy(false);
      }
  };

  const openProposalComposerForBrief = async (briefId: string, fallback?: ProjectBrief | null) => {
      if (!canCreateProposalFromBrief) return;
      setProposalComposerBusy(true);
      try {
          const brief = briefId ? await BriefsService.getBrief(briefId) : fallback;
          if (!brief) throw new Error('Brief not found');
          const linkedJobId = brief.linked_job_id ?? brief.linkedJobId;
          if (!linkedJobId) throw new Error('This brief is not ready for proposal creation yet.');
          setProposalBrief(brief);
          setProposalDraft({
              coverLetter: String(dealFlowConfig.proposalDefaults?.coverLetterIntro || ''),
              proposedAmount: '',
              proposedTimeline: Number(dealFlowConfig.proposalDefaults?.timelineDays ?? 14)
          });
          setShowProposalComposer(true);
      } catch (error: any) {
          showNotification('error', 'Proposal', error?.message || 'Unable to start a proposal from this brief.');
      } finally {
          setProposalComposerBusy(false);
      }
  };

  const handleSubmitProposalFromBrief = async () => {
      if (!proposalBrief) return;
      const jobId = String(proposalBrief.linked_job_id ?? proposalBrief.linkedJobId ?? '').trim();
      const coverLetter = String(proposalDraft.coverLetter || '').trim();
      const proposedAmount = Number(proposalDraft.proposedAmount || 0);
      const proposedTimeline = Number(proposalDraft.proposedTimeline || 0);
      if (!jobId) {
          showNotification('error', 'Proposal', 'This brief is not linked to a proposal-ready job yet.');
          return;
      }
      if (coverLetter.length < 10 || !Number.isFinite(proposedAmount) || proposedAmount <= 0 || !Number.isFinite(proposedTimeline) || proposedTimeline <= 0) {
          showNotification('error', 'Proposal', 'Add a cover letter, amount, and valid timeline before submitting.');
          return;
      }

      setProposalComposerBusy(true);
      try {
          await proposalsApi.createProposal({
              jobId,
              coverLetter,
              proposedAmount,
              proposedTimeline,
              briefId: proposalBrief.id,
              conversationId: proposalBrief.conversation_id ?? proposalBrief.conversationId ?? activeConvoId ?? undefined
          });
          setShowProposalComposer(false);
          setProposalBrief(null);
          showNotification('success', 'Proposal', 'Proposal created from conversation brief.');
          void refreshConversationData();
      } catch (error: any) {
          showNotification('error', 'Proposal', error?.message || 'Failed to create proposal.');
      } finally {
          setProposalComposerBusy(false);
      }
  };

  const handleAcceptProposalFromTimeline = async (messageId: string, event: any, payload: any) => {
      const proposalId = String(event?.proposalId || event?.proposal?.id || '').trim();
      if (!proposalId || !activeConvoId) return;
      setTimelineActionBusyId(messageId);
      try {
          await proposalsApi.acceptProposal(proposalId, {
              ...(payload || {}),
              conversationId: activeConvoId
          });
          applyConversationMessageChanges(activeConvoId, (messages) =>
              messages.map((message) => {
                  if (message.id !== messageId) return message;
                  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
                  return {
                      ...message,
                      metadata: {
                          ...metadata,
                          dealFlow: {
                              ...(metadata as any).dealFlow,
                              proposal: {
                                  ...(((metadata as any).dealFlow || {}).proposal || {}),
                                  status: 'accepted'
                              }
                          }
                      }
                  };
              })
          );
          showNotification('success', 'Contract', 'Proposal accepted and contract created.');
          void refreshConversationData();
          setAcceptProposalEvent(null);
      } catch (error: any) {
          showNotification('error', 'Contract', error?.message || 'Failed to accept proposal.');
      } finally {
          setTimelineActionBusyId(null);
      }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = messageInput.trim();
      if ((!trimmed && pendingAttachments.length === 0) || !activeConvoId || !user) return;
      if (isActiveGroupConversation && groupComposerRestriction.blocked) {
          showNotification('error', 'Group', groupComposerRestriction.message || 'Sending is disabled.');
          return;
      }
      if (hasPendingUploadsInFlight(pendingAttachments)) {
          showNotification('info', 'Attachments', 'Please wait for uploads to finish before sending.');
          return;
      }
      const failedPending = pendingAttachments.filter((item) => item.uploadState === 'failed');
      if (failedPending.length) {
          showNotification('error', 'Attachments', 'Remove or re-upload failed attachments before sending.');
          return;
      }
      const attachmentIds = pendingToAttachmentIds(pendingAttachments);
      const replyToMessageId = replyToMessage?.id || null;
      const clientSendId = buildClientSendId(activeConvoId, Date.now());
      const scrolithaThread = Boolean(
          isActiveScrolithaConversation ||
              activeConvo?.isScrolitha ||
              activeConvo?.is_scrolitha ||
              activeConvo?.participants?.some((p: any) => p?.isScrolitha || p?.is_scrolitha)
      );
      // Capture local previews for optimistic bubble so media appears instantly.
      const optimisticAttachmentPayload = pendingAttachments
          .filter((item) => item.uploadState === 'ready' || item.fileId)
          .map((item) => ({
              id: item.fileId || item.id,
              fileId: item.fileId || item.id,
              url: item.localObjectUrl || item.url || '',
              name: item.name,
              type: item.mimeType || item.type,
              mimeType: item.mimeType,
              size: item.size
          }));
      traceClient('ui.send_message.request', {
          conversationId: activeConvoId,
          textLength: trimmed.length,
          attachmentsCount: attachmentIds.length,
          replyToMessageId,
          clientSendId,
          scrolitha: scrolithaThread
      });

      const optimistic: Message = {
          id: clientSendId,
          conversationId: activeConvoId,
          conversation_id: activeConvoId,
          senderId: user.id,
          sender_id: user.id,
          text: trimmed,
          timestamp: new Date().toISOString(),
          is_read: true,
          isRead: true,
          message_type: attachmentIds.length ? 'file' : 'text',
          messageType: attachmentIds.length ? 'file' : 'text',
          attachments: optimisticAttachmentPayload.length ? optimisticAttachmentPayload : attachmentIds,
          replyToMessageId,
          reply_to_message_id: replyToMessageId,
          metadata: { clientSendId }
      } as Message;

      trackOutgoingMessage({
          clientSendId,
          conversationId: activeConvoId,
          text: trimmed,
          attachmentIds,
          replyToMessageId,
          state: 'sending'
      });
      applyConversationMessageChanges(activeConvoId, (messages) =>
          dedupeMessagesById([...messages.filter((row) => row.id !== clientSendId), optimistic])
      );
      setMessageInput('');
      // Keep blob URLs alive briefly for optimistic bubble; revoke after send settles.
      const snapshotPending = pendingAttachments;
      setPendingAttachments([]);
      setReplyToMessage(null);
      emitTypingState(false);
      resetTypingTimers();
      if (scrolithaThread) {
          setScrolithaThinking(true);
          setScrolithaError(null);
          lastScrolithaPromptRef.current = { text: trimmed, attachmentIds, replyToMessageId };
      }

      try {
          const newMessage = await MessagingService.sendMessage(
              activeConvoId,
              user.id,
              trimmed,
              user.role,
              attachmentIds,
              replyToMessageId,
              {
                  scrolitha: scrolithaThread,
                  clientRequestId: clientSendId,
                  timeoutMs: scrolithaThread ? 95_000 : undefined
              }
          );
          const reconciled = {
              ...newMessage,
              metadata: {
                  ...((newMessage as any)?.metadata || {}),
                  clientSendId
              }
          } as Message;
          markOutgoingState(clientSendId, 'sent', { serverMessageId: String(newMessage?.id || '') });
          applyConversationMessageChanges(activeConvoId, (messages) =>
              reconcileOptimisticMessage(messages, reconciled)
          );

          const scrolithaTurn = (newMessage as any)?.scrolithaTurn;
          const assistantRaw = scrolithaTurn?.assistantMessage;
          if (assistantRaw?.id) {
              const assistant = {
                  ...assistantRaw,
                  conversationId: activeConvoId,
                  conversation_id: activeConvoId
              } as Message;
              applyConversationMessageChanges(activeConvoId, (messages) =>
                  reconcileOptimisticMessage(messages, assistant)
              );
              setScrolithaThinking(false);
              setScrolithaError(null);
          } else if (scrolithaThread) {
              if (scrolithaTurn?.status === 'ok' && scrolithaTurn?.replyPreview) {
                  // Assistant was persisted but envelope lacked full message — refetch.
                  try {
                      const full = await MessagingService.getConversationById(activeConvoId);
                      if (full) {
                          setConversations((prev) =>
                              prev.map((c) => (c.id === activeConvoId ? { ...c, ...full } : c))
                          );
                      }
                  } catch {
                      // ignore; socket may still deliver
                  }
                  setScrolithaThinking(false);
              } else if (scrolithaTurn?.status === 'error' || scrolithaTurn?.status === 'skipped') {
                  const reason = String(scrolithaTurn?.reason || 'unavailable');
                  setScrolithaError(
                      reason === 'messaging_assistant_disabled'
                          ? 'Scrolitha messaging assistant is currently unavailable.'
                          : "Scrolitha couldn't finish that reply just now. Please try again."
                  );
                  setScrolithaThinking(false);
              } else {
                  // Wait briefly for socket, then refetch as recovery.
                  window.setTimeout(async () => {
                      try {
                          const full = await MessagingService.getConversationById(activeConvoId);
                          if (full) {
                              setConversations((prev) =>
                                  prev.map((c) => (c.id === activeConvoId ? { ...c, ...full } : c))
                              );
                              const hasAssistant = (full.messages || []).some(
                                  (m: any) =>
                                      String(m.senderId || m.sender_id) !== String(user.id) &&
                                      String(m.text || '').trim()
                              );
                              if (!hasAssistant) {
                                  setScrolithaError(
                                      "Scrolitha couldn't finish that reply just now. Please try again."
                                  );
                              }
                          }
                      } catch {
                          setScrolithaError(
                              "Scrolitha couldn't finish that reply just now. Please try again."
                          );
                      } finally {
                          setScrolithaThinking(false);
                      }
                  }, 2500);
              }
          }

          refreshMessages();
          // Local blob previews can be released once server attachments exist.
          window.setTimeout(() => revokePendingObjectUrls(snapshotPending), 4000);
          traceClient('ui.send_message.success', {
              conversationId: activeConvoId,
              messageId: newMessage?.id || null,
              clientSendId,
              scrolithaStatus: scrolithaTurn?.status || null
          });
      } catch (error) {
          if (scrolithaThread) {
              setScrolithaThinking(false);
              setScrolithaError("Scrolitha couldn't finish that reply just now. Please try again.");
          }
          markOutgoingState(clientSendId, 'failed', {
              error: getRecoverableActionMessage('Message send', error)
          });
          // Keep blob previews for failed optimistic bubbles.
          applyConversationMessageChanges(activeConvoId, (messages) =>
              messages.map((entry) =>
                  entry.id === clientSendId
                      ? ({
                            ...entry,
                            metadata: {
                                ...(entry.metadata || {}),
                                sendFailed: true,
                                clientSendId,
                                failedText: trimmed,
                                failedAttachmentIds: attachmentIds,
                                failedReplyToMessageId: replyToMessageId
                            }
                        } as Message)
                      : entry
              )
          );
          console.error("Failed to send message", error);
          showNotification(
              'error',
              'Message',
              getRecoverableActionMessage('Message send', error)
          );
          traceClient('ui.send_message.error', {
              conversationId: activeConvoId,
              error: String((error as any)?.message || error),
              clientSendId
          });
      }
  };

  const handleVoiceRecorded = async (blob: Blob, durationMs: number) => {
      if (!activeConvoId || !user) return;
      if (!voiceRuntimeConfig.enabledVoiceNotes || voiceRuntimeConfig.blockedForCurrentUser) {
          showNotification('error', 'Voice notes', 'Voice notes are disabled for this account.');
          return;
      }
      if (!blob || Number(blob.size || 0) < 32) {
          showNotification('error', 'Voice notes', 'Recording was empty or too short. Try again.');
          return;
      }
      setVoiceNoteBusy(true);
      try {
          const mime = String(blob.type || 'audio/webm').split(';')[0] || 'audio/webm';
          const extension = mime.includes('ogg')
            ? 'ogg'
            : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')
              ? 'm4a'
              : mime.includes('mpeg') || mime.includes('mp3')
                ? 'mp3'
                : 'webm';
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
              type: mime
          });
          const uploaded = await FileService.uploadFile(file, 'document', {
              role: user.role,
              userId: user.id,
              visibility: 'private'
          });
          const fileId = String(uploaded.id || uploaded.fileId || '').trim();
          if (!fileId) {
              throw new Error('Voice upload did not return a file id. Please retry.');
          }

          const clientSendId = buildClientSendId(activeConvoId, Date.now());
          trackOutgoingMessage({
              clientSendId,
              conversationId: activeConvoId,
              text: 'Voice note',
              attachmentIds: [fileId],
              state: 'sending'
          });
          const message = await MessagingService.sendVoiceNote(activeConvoId, {
              fileId,
              durationMs: Math.max(1, Math.trunc(durationMs))
          });
          const reconciled = {
              ...message,
              metadata: {
                  ...((message as any)?.metadata || {}),
                  clientSendId
              }
          } as Message;
          markOutgoingState(clientSendId, 'sent', { serverMessageId: String(message?.id || '') });
          applyConversationMessageChanges(activeConvoId, (messages) =>
              reconcileOptimisticMessage(messages, reconciled)
          );
          refreshMessages();
      } catch (error: any) {
          showNotification('error', 'Voice notes', getRecoverableActionMessage('Voice note send', error));
      } finally {
          setVoiceNoteBusy(false);
      }
  };

  const handleAiSuggest = async () => {
      if (!activeConvo || !user) return;
      setIsGettingAiSuggestion(true);
      
      try {
          const history = activeConvo.messages.slice(-5).map(m => ({
              sender: m.senderId === user.id ? 'Me' : 'Other',
              text: m.text
          }));

          const response = await AIService.suggestReply({
              history,
              userRole: user.role
          });

          if (response.suggestion) {
              handleMessageInputChange(response.suggestion);
          }
      } catch (error) {
          console.error("AI Suggestion failed");
      } finally {
          setIsGettingAiSuggestion(false);
      }
  };

  const handleDeleteMessage = async (message: Message, scope: 'me' | 'everyone') => {
      if (!activeConvoId) return;
      const messageId = String(message.id || '');
      if (!messageId) return;
      const confirmText =
          scope === 'me'
              ? 'Delete this message for you only?'
              : 'Delete this message for everyone?';
      if (!confirm(confirmText)) return;
      traceClient('ui.delete_message.request', { conversationId: activeConvoId, messageId, scope });
      setMessageActionBusyId(messageId);
      try {
          const result = await MessagingService.deleteMessage(activeConvoId, messageId, scope);
          const deletedForMe = Boolean(result?.deletedForMe ?? result?.deleted_for_me ?? scope === 'me');
          // Targeted media cache cleanup for unsend / delete-for-me.
          revokeMessageAttachmentMediaUrls(message);
          if (deletedForMe) {
              applyConversationMessageChanges(activeConvoId, (messages) => messages.filter((m) => m.id !== messageId));
              if (replyToMessage?.id === messageId) setReplyToMessage(null);
              if (editingMessageId === messageId) {
                  setEditingMessageId(null);
                  setEditDraft('');
              }
              if (expandedMessageId === messageId) setExpandedMessageId(null);
              if (reactionPanelMessageId === messageId) setReactionPanelMessageId(null);
          } else {
              applyConversationMessageChanges(activeConvoId, (messages) =>
                  messages.map((m) => {
                      if (m.id !== messageId) return m;
                      return {
                          ...m,
                          text: '[Message deleted]',
                          attachments: [],
                          isDeleted: true,
                          is_deleted: true,
                          deletedAt: new Date().toISOString(),
                          deleted_at: new Date().toISOString()
                      };
                  })
              );
          }
          traceClient('ui.delete_message.success', { conversationId: activeConvoId, messageId, scope });
      } catch (error) {
          showNotification(
              'error',
              'Messages',
              scope === 'me' ? 'Failed to delete message for you.' : 'Failed to delete message for everyone.'
          );
          traceClient('ui.delete_message.error', {
              conversationId: activeConvoId,
              messageId,
              scope,
              error: String((error as any)?.message || error)
          });
      } finally {
          setMessageActionBusyId(null);
      }
  };

  const handleStartEditMessage = (message: Message) => {
      const isDeleted = Boolean(message.isDeleted ?? message.is_deleted);
      if (isDeleted) return;
      setReplyToMessage(null);
      setEditingMessageId(message.id);
      setEditDraft(String(message.text || ''));
  };

  const handleCancelEditMessage = () => {
      setEditingMessageId(null);
      setEditDraft('');
  };

  const handleSaveEditMessage = async (messageId: string) => {
      if (!activeConvoId) return;
      const nextText = String(editDraft || '').trim();
      if (!nextText) {
          showNotification('error', 'Messages', 'Message text is required.');
          return;
      }
      traceClient('ui.edit_message.request', {
          conversationId: activeConvoId,
          messageId,
          textLength: nextText.length
      });
      setMessageActionBusyId(messageId);
      try {
          const updated = await MessagingService.editMessage(activeConvoId, messageId, nextText);
          applyConversationMessageChanges(activeConvoId, (messages) =>
              messages.map((m) => (m.id === messageId ? { ...m, ...updated } : m))
          );
          setEditingMessageId(null);
          setEditDraft('');
          traceClient('ui.edit_message.success', { conversationId: activeConvoId, messageId });
      } catch (error: any) {
          const message = error?.response?.data?.error || error?.message || 'Failed to edit message.';
          showNotification('error', 'Messages', message);
          traceClient('ui.edit_message.error', {
              conversationId: activeConvoId,
              messageId,
              error: String(message)
          });
      } finally {
          setMessageActionBusyId(null);
      }
  };

  const copyToClipboard = async (value: string) => {
      const text = String(value || '');
      if (!text) return;
      if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
      }
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
  };

  const handleCopyMessage = async (message: Message) => {
      if (!activeConvoId) return;
      const messageId = String(message.id || '');
      if (!messageId) return;
      setMessageActionBusyId(messageId);
      try {
          await copyToClipboard(String(message.text || ''));
          await MessagingService.copyMessage(activeConvoId, messageId);
          showNotification('success', 'Messages', 'Message copied.');
      } catch {
          showNotification('error', 'Messages', 'Failed to copy message.');
      } finally {
          setMessageActionBusyId(null);
      }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) {
          form.requestSubmit();
      }
  };

  const handleUploadInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;
      await uploadMessageFiles(files);
      event.target.value = '';
  };

  const updateMessageReactionLocally = (messageId: string, emoji: string) => {
      if (!user?.id) return;
      setConversations(prev =>
          prev.map(conversation => {
              if (conversation.id !== activeConvoId) return conversation;
              return {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                      message.id === messageId
                          ? (applyLocalReactionToggle(message, user.id, emoji) as any)
                          : message
                  )
              };
          })
      );
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
      if (!activeConvoId || !user?.id) return;
      traceClient('ui.toggle_reaction.request', {
          conversationId: activeConvoId,
          messageId,
          emoji
      });
      setMessageActionBusyId(messageId);
      try {
          updateMessageReactionLocally(messageId, emoji);
          const updated = await MessagingService.toggleReaction(activeConvoId, messageId, user.id, emoji);
          if (updated?.messageId) {
              const nextReactions = Array.isArray(updated.reactions)
                  ? normalizeMessageReactions(updated.reactions)
                  : null;
              const nextSummary =
                  updated.reactionSummary ||
                  (nextReactions
                      ? nextReactions.reduce((acc: Record<string, number>, reaction: any) => {
                            const key = String(reaction?.emoji || '').trim();
                            if (!key) return acc;
                            acc[key] = (acc[key] || 0) + 1;
                            return acc;
                        }, {})
                      : undefined);
              setConversations(prev =>
                  prev.map(conversation => {
                      if (conversation.id !== activeConvoId) return conversation;
                      return {
                          ...conversation,
                          messages: conversation.messages.map(message => {
                              if (message.id !== updated.messageId) return message;
                              return {
                                  ...message,
                                  reactions: nextReactions !== null ? nextReactions : message.reactions,
                                  reactionSummary:
                                      nextSummary !== undefined ? nextSummary : message.reactionSummary
                              };
                          })
                      };
                  })
              );
          }
          traceClient('ui.toggle_reaction.success', {
              conversationId: activeConvoId,
              messageId,
              emoji
          });
      } catch (error) {
          showNotification('error', 'Messages', 'Failed to update reaction.');
          traceClient('ui.toggle_reaction.error', {
              conversationId: activeConvoId,
              messageId,
              emoji,
              error: String((error as any)?.message || error)
          });
          await refreshConversationData({ silent: true });
      } finally {
          setMessageActionBusyId(null);
      }
  };

  const updateConversationStateLocally = (conversationId: string, updates: Partial<Conversation>) => {
      setConversations((prev) =>
          prev.map((conversation) => (conversation.id === conversationId ? { ...conversation, ...updates } : conversation))
      );
  };

  const toggleFavoriteContact = async (conversationId: string, current: boolean) => {
      if (actionBusy) return;
      traceClient('ui.toggle_favorite_contact.request', { conversationId, current });
      setActionBusy(true);
      try {
          const next = !current;
          await MessagingService.updateConversationPreferences(conversationId, { isStarred: next });
          updateConversationStateLocally(conversationId, { isStarred: next, is_starred: next });
          showNotification('success', 'Messages', next ? 'Added to favorite contacts.' : 'Removed from favorite contacts.');
          traceClient('ui.toggle_favorite_contact.success', { conversationId, isStarred: next });
      } catch (error: any) {
          const message = error?.response?.data?.error || error?.message || 'Unable to update favorite contact.';
          showNotification('error', 'Messages', message);
          traceClient('ui.toggle_favorite_contact.error', { conversationId, error: String(message) });
      } finally {
          setActionBusy(false);
      }
  };

  const openMessagingPrivacySettings = useCallback((tab: 'privacy' | 'inbox' | 'safety' = 'privacy') => {
      setShowConversationMenu(false);
      setMessageSettingsTab(tab);
      setShowMessageSettings(true);
  }, []);

  const handleConversationAction = async (
      action:
          | 'move_other'
          | 'label_jobs'
          | 'mark_unread'
          | 'toggle_star'
          | 'toggle_mute'
          | 'archive'
          | 'report_block'
          | 'delete'
          | 'manage_settings'
          | 'group_settings'
          | 'leave_group'
  ) => {
      // Global privacy must open even when actionBusy or when conversation state is transient
      // (mobile WebView / Capacitor). Does not require a selected conversation.
      if (action === 'manage_settings') {
          openMessagingPrivacySettings('privacy');
          return;
      }
      if (!activeConvoId || !activeConvo || actionBusy) return;
      if (action === 'group_settings') {
          setShowConversationMenu(false);
          setShowGroupManage(true);
          return;
      }
      const conversationId = activeConvoId;
      const snapshot = {
          label: activeConversationState.label,
          isStarred: activeConversationState.isStarred,
          isMuted: activeConversationState.isMuted,
          isArchived: activeConversationState.isArchived,
          unreadCount: Number((activeConvo as any)?.unreadCount ?? (activeConvo as any)?.unread_count ?? 0)
      };
      const rollback = () => {
          updateConversationStateLocally(conversationId, {
              label: snapshot.label,
              isStarred: snapshot.isStarred,
              is_starred: snapshot.isStarred,
              isMuted: snapshot.isMuted,
              is_muted: snapshot.isMuted,
              isArchived: snapshot.isArchived,
              is_archived: snapshot.isArchived,
              unreadCount: snapshot.unreadCount,
              unread_count: snapshot.unreadCount
          });
      };
      traceClient('ui.conversation_action.request', { conversationId, action });
      setActionBusy(true);
      try {
          if (action === 'move_other') {
              updateConversationStateLocally(conversationId, { label: 'other' });
              await MessagingService.updateConversationPreferences(conversationId, { label: 'other' });
              showNotification('success', 'Messages', 'Moved to Other.');
          } else if (action === 'label_jobs') {
              const nextLabel = snapshot.label === 'jobs' ? 'other' : 'jobs';
              updateConversationStateLocally(conversationId, { label: nextLabel });
              await MessagingService.updateConversationPreferences(conversationId, { label: nextLabel });
              showNotification(
                  'success',
                  'Messages',
                  nextLabel === 'jobs' ? 'Labeled as Jobs.' : 'Jobs label removed.'
              );
          } else if (action === 'mark_unread') {
              updateConversationStateLocally(conversationId, { unreadCount: 1, unread_count: 1 });
              await MessagingService.markConversationUnread(conversationId);
              showNotification('success', 'Messages', 'Conversation marked as unread.');
          } else if (action === 'toggle_star') {
              const next = !snapshot.isStarred;
              updateConversationStateLocally(conversationId, { isStarred: next, is_starred: next });
              await MessagingService.updateConversationPreferences(conversationId, { isStarred: next });
              showNotification('success', 'Messages', next ? 'Conversation starred.' : 'Star removed.');
          } else if (action === 'toggle_mute') {
              const next = !snapshot.isMuted;
              updateConversationStateLocally(conversationId, { isMuted: next, is_muted: next });
              await MessagingService.updateConversationPreferences(conversationId, { isMuted: next });
              showNotification('success', 'Messages', next ? 'Conversation muted.' : 'Conversation unmuted.');
          } else if (action === 'archive') {
              const next = !snapshot.isArchived;
              updateConversationStateLocally(conversationId, {
                  isArchived: next,
                  is_archived: next
              });
              await MessagingService.updateConversationPreferences(conversationId, { isArchived: next });
              showNotification(
                  'success',
                  'Messages',
                  next ? 'Conversation archived.' : 'Conversation unarchived.'
              );
          } else if (action === 'report_block') {
              const shouldProceed = window.confirm(
                  'Report this conversation and block the participant? You can unblock later from safety settings.'
              );
              if (!shouldProceed) return;
              await MessagingService.reportBlockConversation(conversationId, { block: true });
              showNotification('success', 'Messages', 'Conversation reported and blocked.');
          } else if (action === 'delete' || action === 'leave_group') {
              const isGroup = Boolean(isActiveGroupConversation);
              const shouldDelete = window.confirm(
                  isGroup
                      ? 'Leave this group? You may need an invite to rejoin.'
                      : 'Delete this conversation from your inbox?'
              );
              if (!shouldDelete) return;
              await MessagingService.deleteConversation(conversationId);
              setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
              setActiveConvoId(null);
              navigate('/messages');
              showNotification(
                  'success',
                  'Messages',
                  isGroup ? 'You left the group.' : 'Conversation deleted.'
              );
          }
          traceClient('ui.conversation_action.success', { conversationId, action });
      } catch (error: any) {
          if (
              action === 'move_other' ||
              action === 'label_jobs' ||
              action === 'mark_unread' ||
              action === 'toggle_star' ||
              action === 'toggle_mute' ||
              action === 'archive'
          ) {
              rollback();
          }
          const message = error?.response?.data?.error || error?.message || 'Action failed.';
          showNotification('error', 'Messages', message);
          traceClient('ui.conversation_action.error', {
              conversationId,
              action,
              error: String(message)
          });
      } finally {
          setActionBusy(false);
          setShowConversationMenu(false);
      }
  };

  const handleMessageSettingToggle = async (key: 'messageRequestsNotifications' | 'allowInMail') => {
      if (settingsBusy) return;
      const nextValue = !Boolean(messageSettings[key]);
      const nextSettings = { ...messageSettings, [key]: nextValue };
      setMessageSettings(nextSettings);
      setSettingsBusy(true);
      try {
          await UserService.updateMySettings(nextSettings as any);
          showNotification('success', 'Message settings', 'Settings updated.');
      } catch (error: any) {
          setMessageSettings((prev) => ({ ...prev, [key]: !nextValue }));
          showNotification('error', 'Message settings', error?.message || 'Unable to update settings.');
      } finally {
          setSettingsBusy(false);
      }
  };
                            return (
    <>
    <div
        ref={layoutShellRef}
        className="mx-auto flex max-w-6xl min-h-0 flex-col px-2 py-3 sm:px-4 sm:py-4 md:h-[calc(100dvh-4rem)] md:max-h-[calc(100dvh-4rem)] md:py-4"
        style={isMobileViewport && mobileComposerHostHeight ? { height: `${mobileComposerHostHeight}px` } : undefined}
        data-testid="messages-workspace-shell"
    >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
        <div className="flex min-h-0 flex-1">
            {/* Sidebar */}
            <div className={`w-full md:w-1/3 min-w-0 border-r border-gray-200 flex min-h-0 flex-col ${activeConvo ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-800">Messages</h2>
                            <button
                                onClick={() => refreshConversationData()}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded"
                                title="Refresh"
                                type="button"
                            >
                                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => openMessagingPrivacySettings('privacy')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-indigo-700"
                                data-testid="messages-inbox-privacy-btn"
                                title="Messaging privacy"
                                aria-label="Messaging privacy settings"
                            >
                                <Shield className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCreateGroup(true)}
                                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                data-testid="messages-create-group-btn"
                                title="Create group"
                            >
                                <Users className="h-3.5 w-3.5" />
                                Group
                            </button>
                            {user?.role === UserRole.ADMIN && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded font-mono">ADMIN VIEW</span>}
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={messageSearchInput}
                            onChange={(event) => setMessageSearchInput(event.target.value)}
                            placeholder="Search messages, people, or usernames..."
                            className="h-10 w-full rounded-2xl border border-gray-200 bg-white pl-9 pr-10 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            aria-label="Search messages, people, or usernames"
                        />
                        {messageSearchInput ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setMessageSearchInput('');
                                    setDebouncedMessageSearch('');
                                    setMessageSearchResults([]);
                                    setMessageSearchError('');
                                    messageSearchAbortRef.current?.abort();
                                    messageSearchAbortRef.current = null;
                                }}
                                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                aria-label="Clear message search"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowStarredOnly(false)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                !showStarredOnly ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowStarredOnly(true)}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                showStarredOnly ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                        >
                            <Star className="h-3.5 w-3.5" />
                            Starred
                        </button>
                    </div>
                </div>
                <ul
                    ref={conversationListRef}
                    className="flex-1 overflow-y-auto"
                    onScroll={(event) => setConversationScrollTop(event.currentTarget.scrollTop)}
                >
                    {messageSearchLoading ? (
                        <li className="flex items-center justify-center gap-2 p-4 text-center text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                        </li>
                    ) : messageSearchError ? (
                        <li className="p-4 text-center text-sm text-red-500">{messageSearchError}</li>
                    ) : visibleConversations.length === 0 ? (
                        <li className="p-4 text-center text-gray-500 text-sm">
                            {isMessageSearchActive ? 'No conversations or messages found.' : 'No conversations yet.'}
                        </li>
                    ) : (
                        <>
                        {conversationWindow.top > 0 ? (
                            <li aria-hidden className="pointer-events-none border-b-0 p-0" style={{ height: conversationWindow.top }} />
                        ) : null}
                        {virtualConversations.map((convo) => {
                            const selfId = String(user?.id || '').trim();
                            const peerCandidates = (convo.participants || []).filter(
                                (p: any) => String(p?.id || '').trim() !== selfId
                            );
                            const scrolithaListPeer = peerCandidates.find((p: any) =>
                                isScrolithaParticipantEntity(p)
                            );
                            // Require a real Scrolitha peer or explicit conversation flag — never title-force
                            // from weak heuristics alone.
                            const isScrolithaConvo = Boolean(
                                scrolithaListPeer ||
                                    ((convo.isScrolitha || convo.is_scrolitha) &&
                                        (convo.participants || []).some((p: any) =>
                                            isScrolithaParticipantEntity(p)
                                        ))
                            );
                            const humanPeer = peerCandidates.find(
                                (p: any) => !isScrolithaParticipantEntity(p)
                            );
                            const participant = isScrolithaConvo
                                ? {
                                      ...(scrolithaListPeer || {}),
                                      id: scrolithaListPeer?.id || 'scrolitha',
                                      name: SCROLITHA_DISPLAY_NAME,
                                      username: scrolithaListPeer?.username || 'scrolitha',
                                      // Official art only — do not reuse a human peer avatar as Scrolitha.
                                      avatar: undefined,
                                      avatarUrl: undefined,
                                      isScrolitha: true,
                                      is_scrolitha: true,
                                      systemLabel: 'AI assistant',
                                      system_label: 'AI assistant'
                                  }
                                : peerCandidates.find((p: any) => {
                                      const id = String(p?.id || '').trim();
                                      const name = String(p?.name || p?.username || '').trim();
                                      return Boolean(name) && name !== id;
                                  }) ||
                                  peerCandidates[0] ||
                                  undefined;
                            const searchMeta = isMessageSearchActive ? searchResultByConversationId.get(convo.id) : null;
                            const participantRole = resolveParticipantRole(participant);
                            const participantIsPro = isParticipantPro(participant);
                            const convoStarred = Boolean(convo.isStarred ?? convo.is_starred);
                            const isGroupConvo = Boolean(
                                !isScrolithaConvo &&
                                    (convo.type === 'group' ||
                                        String((convo as any)?.type || '').toUpperCase() === 'GROUP' ||
                                        Boolean((convo as any)?.title && (convo.participants?.length || 0) > 2))
                            );
                            const groupDisplayName =
                                String((convo as any)?.title || '').trim() ||
                                (convo.participants || [])
                                    .filter((p: any) => String(p?.id || '') !== String(user?.id || ''))
                                    .map((p: any) => p?.name || p?.username)
                                    .filter(Boolean)
                                    .slice(0, 3)
                                    .join(', ') ||
                                'Group';
                            const isPlatformAdmin = String(user?.role || '')
                                .toLowerCase()
                                .includes('admin');
                            // Admin global list may show many users' Scrolitha DMs — disambiguate with peer.
                            const inboxTitle = isScrolithaConvo
                                ? isPlatformAdmin && humanPeer?.name
                                    ? `${SCROLITHA_DISPLAY_NAME} · ${humanPeer.name}`
                                    : SCROLITHA_DISPLAY_NAME
                                : isGroupConvo
                                  ? groupDisplayName
                                  : participant?.name || 'Conversation';
                            const previewText = String(
                                searchMeta?.matchedMessageSnippet ||
                                searchMeta?.lastMessage ||
                                getConversationPreviewText(convo, { currentUserId: user?.id }) ||
                                ''
                            );
                            return (
                                <li 
                                    key={convo.id} 
                                    onClick={() => handleConversationClick(convo.id, searchMeta?.matchedMessageId || null)}
                                    className={`mx-2 my-1.5 w-auto cursor-pointer overflow-hidden rounded-2xl border px-4 py-3 shadow-sm transition-all ${
                                        activeConvoId === convo.id
                                            ? 'border-blue-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 shadow-md ring-1 ring-blue-100'
                                            : isScrolithaConvo
                                              ? 'border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60 hover:border-indigo-200 hover:shadow'
                                              : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50 hover:shadow'
                                    }`}
                                >
                                    <div className="flex w-full min-w-0 items-center">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (!isScrolithaConvo) {
                                                        navigate(resolveParticipantProfileUrl(participant));
                                                    }
                                                }}
                                                className="mr-3 rounded-full"
                                            >
                                                <EnterpriseAvatar
                                                    src={
                                                      isGroupConvo
                                                        ? (() => {
                                                            const fid = String(
                                                              (convo as any)?.avatarFileId ||
                                                                (convo as any)?.avatar_file_id ||
                                                                ''
                                                            ).trim();
                                                            return fid
                                                              ? resolveUserAvatarUrl(fid)
                                                              : undefined;
                                                          })()
                                                        : isScrolithaConvo
                                                          ? getScrolithaProfilePhotoUrl()
                                                          : resolveScrolithaAvatar(participant) ||
                                                            resolveUserAvatarUrl(participant) ||
                                                            null
                                                    }
                                                    name={
                                                      isGroupConvo
                                                        ? groupDisplayName
                                                        : isScrolithaConvo
                                                          ? SCROLITHA_DISPLAY_NAME
                                                          : participant?.name || 'User'
                                                    }
                                                    user={
                                                      isGroupConvo || isScrolithaConvo
                                                        ? undefined
                                                        : participant
                                                    }
                                                    size="md"
                                                    className={
                                                      isScrolithaConvo
                                                        ? 'border border-indigo-200 ring-2 ring-indigo-100'
                                                        : isGroupConvo
                                                          ? 'border border-indigo-100 bg-indigo-50 text-indigo-700'
                                                          : 'border border-gray-200'
                                                    }
                                                    alt={participant?.name || 'Profile'}
                                                />
                                            </button>
                                            {(!isGroupConvo && (participant?.isOnline || isScrolithaConvo)) && (
                                        <span className="absolute bottom-0 right-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"></span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {/* Name opens the conversation (row click). Only avatar navigates to profile. */}
                                                    <span className="min-w-0 flex-1 truncate text-left text-sm font-bold text-gray-900">
                                                        {renderHighlightedText(inboxTitle, activeMessageSearchQuery)}
                                                    </span>
                                                    {isGroupConvo ? (
                                                        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                                                            Group
                                                        </span>
                                                    ) : null}
                                                    {isScrolithaConvo ? (
                                                        <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                                                            AI
                                                        </span>
                                                    ) : null}
                                                    {isScrolithaConvo ? (
                                                        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title="Verified system assistant">
                                                            ✓
                                                        </span>
                                                    ) : null}
                                                    {!isScrolithaConvo && participantRole && (
                                                        <ProBadge role={participantRole} isPro={participantIsPro} />
                                                    )}
                                                    {searchMeta?.matchType ? (
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                            {searchMeta.matchType === 'message' ? 'Message' : searchMeta.matchType === 'username' ? 'Username' : 'Person'}
                                                        </span>
                                                    ) : null}
                                                    {/* Gender is profile metadata — hide on mobile inbox density */}
                                                    {!isMobileViewport && participant?.gender ? (
                                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                                                            {participant.gender}
                                                        </span>
                                                    ) : null}
                                                    {String(convo.label || '').toLowerCase() === 'jobs' && (
                                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                                            Jobs
                                                        </span>
                                                    )}
                                                </div>
                                                {convo.lastMessageAt && (
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(convo.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                )}
                                            </div>
                                            {isMessageSearchActive && participant?.username ? (
                                                <p className="min-w-0 truncate text-[11px] text-gray-400">
                                                    @{renderHighlightedText(participant.username, activeMessageSearchQuery)}
                                                </p>
                                            ) : null}
                                            <p className={`min-w-0 truncate text-xs ${convo.unreadCount > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                                {previewText ? (
                                                    <>
                                                        {searchMeta?.matchType === 'message' ? <span className="font-semibold text-gray-600">... </span> : null}
                                                        {renderHighlightedText(previewText, activeMessageSearchQuery)}
                                                    </>
                                                ) : (
                                                    <span className="italic text-gray-400">No messages</span>
                                                )}
                                            </p>
                                        </div>
                                        {convo.unreadCount > 0 && (
                                            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                                                {convo.unreadCount}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void toggleFavoriteContact(convo.id, convoStarred);
                                            }}
                                            className={`ml-2 rounded-full p-1 transition ${
                                                convoStarred ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                                            }`}
                                            title={convoStarred ? 'Remove from favorite contacts' : 'Add to favorite contacts'}
                                        >
                                            <Star className={`h-4 w-4 ${convoStarred ? 'fill-current' : ''}`} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                        {conversationWindow.bottom > 0 ? (
                            <li aria-hidden className="pointer-events-none border-b-0 p-0" style={{ height: conversationWindow.bottom }} />
                        ) : null}
                        </>
                    )}
                </ul>
            </div>
            
            {/* Chat Area — flex column: header | history (flex-1 scroll) | composer (content-sized) */}
            <div
                className={`flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-gray-50 to-gray-100 ${
                    !activeConvo ? 'hidden md:flex' : 'flex'
                } ${
                    isMobileConversationMode
                        ? 'fixed inset-x-0 z-[80] rounded-none border-0 shadow-none'
                        : ''
                }`}
                style={mobileConversationViewportStyle}
                data-testid="messages-conversation-panel"
            >
                {activeConvo ? (
                    <>
                        {/* Chat Header — fixed row, not sticky overlay */}
                        <div
                            className={`z-10 shrink-0 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur md:px-4 ${
                                isMobileConversationMode
                                    ? 'px-3 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))]'
                                    : 'px-3 py-3'
                            }`}
                            data-testid="messages-conversation-header"
                        >
                            <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center">
                                <button onClick={handleBackToInbox} className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 md:hidden">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isActiveGroupConversation) {
                                            setShowGroupManage(true);
                                            return;
                                        }
                                        navigate(resolveParticipantProfileUrl(otherParticipant));
                                    }}
                                    className="mr-3 rounded-full"
                                >
                                    <EnterpriseAvatar
                                        src={
                                          isActiveGroupConversation
                                            ? activeGroupAvatarSrc || undefined
                                            : resolveScrolithaAvatar(
                                                isActiveScrolithaConversation
                                                  ? { ...otherParticipant, isScrolitha: true }
                                                  : otherParticipant
                                              ) ||
                                              resolveUserAvatarUrl(otherParticipant) ||
                                              (isActiveScrolithaConversation ? getScrolithaProfilePhotoUrl() : null)
                                        }
                                        name={
                                          isActiveGroupConversation
                                            ? activeConversationTitle
                                            : otherParticipant?.name || (isActiveScrolithaConversation ? 'Scrolitha' : 'User')
                                        }
                                        user={isActiveGroupConversation ? undefined : otherParticipant}
                                        size="md"
                                        className={`border border-gray-200 !h-9 !w-9 md:!h-10 md:!w-10 ${
                                          isActiveGroupConversation ? 'bg-indigo-50 text-indigo-700' : ''
                                        }`}
                                        alt={activeConversationTitle || 'Profile'}
                                    />
                                </button>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        {/* Title: groups open manage panel; DM names stay in-thread (profile via avatar only). */}
                                        {isActiveGroupConversation ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowGroupManage(true)}
                                                className="max-w-[9.5rem] truncate text-left text-sm font-bold text-gray-900 hover:text-blue-600 sm:max-w-xs"
                                                data-testid="messages-conversation-title"
                                            >
                                                {activeConversationTitle}
                                            </button>
                                        ) : (
                                            <h3
                                                className="max-w-[9.5rem] truncate text-left text-sm font-bold text-gray-900 sm:max-w-xs"
                                                data-testid="messages-conversation-title"
                                            >
                                                {activeConversationTitle}
                                            </h3>
                                        )}
                                        {isActiveGroupConversation ? (
                                            <span className="hidden rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 sm:inline">
                                                Group · {(activeConvo?.participants || []).length} members
                                            </span>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                activeConvoId
                                                    ? void toggleFavoriteContact(
                                                          activeConvoId,
                                                          Boolean(activeConversationState.isStarred)
                                                      )
                                                    : undefined
                                            }
                                            className={`rounded-full p-1 transition ${
                                                activeConversationState.isStarred
                                                    ? 'text-amber-500 hover:bg-amber-50'
                                                    : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
                                            }`}
                                            title={
                                                activeConversationState.isStarred
                                                    ? 'Remove sender from favorite contacts'
                                                    : 'Add sender to favorite contacts'
                                            }
                                        >
                                            <Star className={`h-4 w-4 ${activeConversationState.isStarred ? 'fill-current' : ''}`} />
                                        </button>
                                        {otherParticipantRole && !isActiveScrolithaConversation && (
                                            <ProBadge role={otherParticipantRole} isPro={otherParticipantIsPro} />
                                        )}
                                        {/* Phase 20.8.1 — gender lives on profile, not compact mobile header */}
                                        {!isMobileViewport && !isActiveScrolithaConversation && otherParticipant?.gender ? (
                                            <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 sm:inline">
                                                {otherParticipant.gender}
                                            </span>
                                        ) : null}
                                    </div>
                                    {typingUser || presenceIndicatorLabel ? (
                                        <span
                                            className="text-xs text-indigo-600 flex items-center font-medium"
                                            data-testid="messages-typing-indicator"
                                            aria-live="polite"
                                        >
                                            {presenceIndicatorLabel
                                                ? presenceIndicatorLabel
                                                : String(typingUser).startsWith('recording:')
                                                  ? `${String(typingUser).replace(/^recording:/, '')} is recording…`
                                                  : `${typingUser} is typing…`}
                                        </span>
                                    ) : isActiveGroupConversation ? (
                                        <span className="text-xs text-gray-500 flex items-center">
                                            {(() => {
                                                const onlineCount = (activeConvo?.participants || []).filter(
                                                    (p: any) =>
                                                        String(p?.id || '') !== String(user?.id || '') &&
                                                        Boolean(p?.isOnline ?? p?.is_online)
                                                ).length;
                                                const total = (activeConvo?.participants || []).length;
                                                if (onlineCount > 0) {
                                                    return `${onlineCount} online · ${total} members`;
                                                }
                                                return (activeConvo as any)?.description
                                                    ? String((activeConvo as any).description).slice(0, 64)
                                                    : `${total} members`;
                                            })()}
                                        </span>
                                    ) : isActiveScrolithaConversation ? (
                                        <span className="text-xs text-indigo-600 flex items-center font-medium" data-testid="messages-presence-scrolitha">
                                            AI assistant
                                        </span>
                                    ) : otherPresenceState === 'away' ? (
                                        <span className="text-xs text-amber-600 flex items-center">Away</span>
                                    ) : otherOnline ? (
                                        <span className="text-xs text-green-500 flex items-center" data-testid="messages-presence-online">
                                            Online
                                        </span>
                                    ) : otherLastSeen ? (
                                        <span className="text-xs text-gray-500 flex items-center" data-testid="messages-presence-last-seen">
                                            Last seen{' '}
                                            {new Date(otherLastSeen).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 flex items-center" data-testid="messages-presence-offline">
                                            Offline
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <button
                                    type="button"
                                    onClick={() => setChatAppearanceOpen(true)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                                    title="Chat appearance"
                                    aria-label="Chat appearance"
                                    data-testid="messages-appearance-btn"
                                >
                                    <Palette className="h-4 w-4" />
                                </button>
                                {isActiveGroupConversation ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowGroupManage(true)}
                                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                                        title="Group settings"
                                        data-testid="messages-group-settings-btn"
                                    >
                                        <Users className="h-4 w-4" />
                                        <span className="hidden sm:inline text-xs font-semibold">Group</span>
                                    </button>
                                ) : null}
                                {canCreateBriefFromConversation && (
                                    <button
                                        type="button"
                                        onClick={() => void openConversationBriefComposer()}
                                        disabled={briefComposerBusy}
                                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
                                        title="Create brief from chat"
                                    >
                                        {briefComposerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                        <span className="hidden sm:inline text-xs font-semibold">Create Brief</span>
                                    </button>
                                )}
                                <VoiceCallControls
                                    disabled={!activeConvoId || voiceCallsBlocked || isActiveScrolithaConversation}
                                    canConference={
                                        voiceRuntimeConfig.enabledConferenceCalls &&
                                        voiceCallCandidateUsers.length > 1
                                    }
                                    canVideo={
                                        Boolean(voiceRuntimeConfig.enabledVideoCalls) &&
                                        !isActiveScrolithaConversation
                                    }
                                    conversationId={activeConvoId}
                                    callTargets={activeConversationVoiceTargets}
                                    participantUsers={voiceCallCandidateUsers}
                                    onError={(message) => showNotification('error', 'Call', message)}
                                />
                                {user?.role === UserRole.ADMIN && (
                                    <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50" title="Admin Actions">
                                        <ShieldAlert className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => refreshConversationData()}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                    title="Refresh"
                                    type="button"
                                >
                                    {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                </button>
                                {/* Phase 20.7.8 — Scrolitha uses trusted system menu only */}
                                {isActiveScrolithaConversation && activeConvoId ? (
                                    <ScrolithaConversationMenu conversationId={activeConvoId} />
                                ) : (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowConversationMenu((prev) => !prev)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                        aria-haspopup="menu"
                                        aria-expanded={showConversationMenu}
                                        data-testid="messages-conversation-menu-btn"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    <ConversationActionsMenu
                                        open={showConversationMenu}
                                        onClose={() => setShowConversationMenu(false)}
                                        onAction={(action) => {
                                            void handleConversationAction(action);
                                        }}
                                        menuState={{
                                            isStarred: activeConversationState.isStarred,
                                            isMuted: activeConversationState.isMuted,
                                            isArchived: activeConversationState.isArchived,
                                            label: activeConversationState.label as 'jobs' | 'other',
                                            isGroup: Boolean(isActiveGroupConversation),
                                            isDm: !isActiveGroupConversation
                                        }}
                                        messagingControls={messagingControls as Record<string, boolean | undefined>}
                                        actionBusy={actionBusy}
                                        /* Mobile conversation shell clips absolute menus — always portal sheet */
                                        useMobileSheet={Boolean(isMobileViewport || isMobileConversationMode)}
                                    />
                                </div>
                                )}
                            </div>
                            </div>
                        </div>

                        {/* Messages List — owns remaining height; independent scroll */}
                        <div
                            className={`min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-y-contain p-3 pb-4 md:space-y-4 md:p-6 ${
                                chatAppearance?.kind && chatAppearance.kind !== 'none'
                                    ? ''
                                    : isMobileConversationMode
                                      ? 'bg-gradient-to-b from-gray-50 to-gray-100'
                                      : ''
                            }`}
                            ref={messagesContainerRef}
                            onScroll={handleMessagesScroll}
                            data-testid="messages-history-viewport"
                            style={chatSurfaceStyle}
                        >
                            {groupPins.length > 0 ? (
                                <button
                                    type="button"
                                    className="sticky top-0 z-20 mb-1 w-full rounded-xl border px-3 py-2 text-left text-xs shadow-sm backdrop-blur"
                                    style={{
                                        background: 'var(--chat-pin-bg, #fffbeb)',
                                        color: 'var(--chat-pin-text, #78350f)',
                                        borderColor: 'rgba(0,0,0,0.08)'
                                    }}
                                    data-testid="group-pins-banner"
                                    onClick={() => {
                                        const mid = String(
                                            groupPins[0]?.messageId || groupPins[0]?.message?.id || ''
                                        );
                                        if (mid) jumpToPinnedMessage(mid);
                                    }}
                                >
                                    <div className="font-semibold">
                                        📌 {groupPins.length} pinned message
                                        {groupPins.length === 1 ? '' : 's'}
                                    </div>
                                    <div className="mt-0.5 truncate opacity-90">
                                        {String(
                                            groupPins[0]?.message?.text || groupPins[0]?.messageId || ''
                                        ).slice(0, 120)}
                                    </div>
                                </button>
                            ) : null}
                            {showJumpToUnread ? (
                                <div className="sticky top-2 z-10 flex justify-center">
                                    <button
                                        type="button"
                                        className="rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur hover:bg-blue-50"
                                        onClick={() => {
                                            const idx = findFirstUnreadIndex(activeConvo.messages || [], user?.id);
                                            const target = idx >= 0 ? activeConvo.messages[idx] : null;
                                            const id = String(target?.id || '');
                                            if (!id) return;
                                            document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            setShowJumpToUnread(false);
                                        }}
                                    >
                                        Jump to first unread
                                    </button>
                                </div>
                            ) : null}
                            {buildThreadTimeline(activeConvo.messages || [], { viewerId: user?.id }).map((item) => {
                                if (item.kind === 'date') {
                                    return (
                                        <div key={item.key} className="sticky top-10 z-[5] flex justify-center py-1">
                                            <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur">
                                                {item.label}
                                            </span>
                                        </div>
                                    );
                                }
                                if (item.kind === 'unread') {
                                    return (
                                        <div key={item.key} className="flex items-center gap-3 py-1" role="separator" aria-label={`${item.count} unread messages`}>
                                            <div className="h-px flex-1 bg-blue-200" />
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                                                {item.count} unread
                                            </span>
                                            <div className="h-px flex-1 bg-blue-200" />
                                        </div>
                                    );
                                }
                                const msg = activeConvo.messages[item.index] || (item.message as any);
                                if (!msg) return null;
                                const attachmentList = extractMessageAttachments(msg);
                                const dealFlowEvent = extractDealFlowEvent(msg);
                                const isOwner = msg.senderId === user?.id;
                                const isAdmin = user?.role === UserRole.ADMIN;
                                const canEditDelete = isOwner || isAdmin;
                                const isDeleted = Boolean(msg.isDeleted ?? msg.is_deleted);
                                const isEditing = editingMessageId === msg.id;
                                const showMessageControls = expandedMessageId === msg.id;
                                const showReactionPanel = reactionPanelMessageId === msg.id && !isDeleted;
                                const voiceCallRecord = extractVoiceCallRecord(msg);
                                const storyReference = extractStoryReference(msg);
                                const messageReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
                                const myReaction = messageReactions.find(
                                    (reaction) => String(reaction.userId || reaction.user_id) === String(user?.id || '')
                                )?.emoji;
                                const reactionCounts = messageReactions.reduce((acc: Record<string, number>, reaction: any) => {
                                    const emojiKey = String(reaction?.emoji || '').trim();
                                    if (!emojiKey) return acc;
                                    acc[emojiKey] = (acc[emojiKey] || 0) + 1;
                                    return acc;
                                }, {});
                                const reactionChips = isDeleted ? [] : getReactionChipEntries(msg);
                                if (dealFlowEvent) {
                                    return (
                                        <div id={`message-${msg.id}`} key={msg.id} className={`flex min-w-0 justify-center rounded-2xl transition ${highlightedMessageId === msg.id ? 'ring-4 ring-yellow-200 ring-offset-2' : ''}`}>
                                            <div className="w-full max-w-3xl">
                                                {renderDealFlowCard(msg)}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                <div id={`message-${msg.id}`} key={msg.id} className={`flex min-w-0 rounded-2xl transition ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'} ${highlightedMessageId === msg.id ? 'ring-4 ring-yellow-200 ring-offset-2' : ''}`}>
                                    <div className="min-w-0 max-w-[90%] md:max-w-[70%]">
                                    {/* Message Bubble */}
                                    <div className={`relative max-w-full min-w-0 rounded-2xl px-4 py-2.5 text-sm shadow-sm transition ${
                                        msg.senderId === user?.id
                                        ? 'rounded-br-none bg-gradient-to-br from-blue-600 to-blue-500 text-white'
                                        : 'rounded-bl-none border border-gray-200 bg-white text-gray-800'
                                    }`}
                                    onClick={() => {
                                        if (isEditing) return;
                                        setExpandedMessageId((prev) => (prev === msg.id ? null : msg.id));
                                        if (!isDeleted) {
                                            setReactionPanelMessageId((prev) => (prev === msg.id ? null : msg.id));
                                        }
                                    }}
                                    onContextMenu={(event) => event.preventDefault()}
                                    onDoubleClick={() => {
                                        if (isDeleted || isEditing) return;
                                        setExpandedMessageId(msg.id);
                                        setReactionPanelMessageId(msg.id);
                                    }}>
                                        {renderReplyPreview(msg)}
                                        {storyReference ? (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    navigate(storyReference.actionUrl || `/community?story=${encodeURIComponent(storyReference.storyId)}`);
                                                }}
                                                className={`mb-2 flex w-full max-w-sm items-center gap-2 rounded-xl border p-2 text-left transition ${
                                                    msg.senderId === user?.id
                                                        ? 'border-white/25 bg-white/10 text-white hover:bg-white/15'
                                                        : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                                                }`}
                                                aria-label="Open referenced story"
                                            >
                                                <StoryMessageMediaThumb
                                                    candidates={
                                                        storyReference.mediaCandidates?.length
                                                            ? storyReference.mediaCandidates
                                                            : storyReference.mediaPreview
                                                              ? [storyReference.mediaPreview]
                                                              : []
                                                    }
                                                    reactionType={storyReference.reactionType}
                                                    outgoing={msg.senderId === user?.id}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-xs font-semibold">
                                                        {storyReference.reactionType ? 'Story reaction' : 'Story message'}
                                                    </span>
                                                    <span className={`line-clamp-1 text-[11px] ${
                                                        msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-500'
                                                    }`}>
                                                        {storyReference.caption || 'Tap to open story context'}
                                                    </span>
                                                </span>
                                            </button>
                                        ) : null}
                                        {isEditing ? (
                                            <div className="space-y-2">
                                                <textarea
                                                    value={editDraft}
                                                    onChange={(event) => setEditDraft(event.target.value)}
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                                                    rows={3}
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelEditMessage}
                                                        className="px-2.5 py-1.5 rounded-md text-xs border border-gray-300 text-gray-700 bg-white"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSaveEditMessage(msg.id)}
                                                        className="px-2.5 py-1.5 rounded-md text-xs bg-blue-700 text-white"
                                                        disabled={messageActionBusyId === msg.id}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        ) : voiceCallRecord ? (
                                            <div
                                                className={`rounded-xl border px-3 py-2 ${
                                                    msg.senderId === user?.id
                                                        ? 'border-white/35 bg-white/15 text-white'
                                                        : 'border-emerald-100 bg-emerald-50 text-emerald-900'
                                                }`}
                                            >
                                                <div className="text-sm font-semibold">
                                                    {msg.text || 'Voice call update'}
                                                </div>
                                                <div
                                                    className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] ${
                                                        msg.senderId === user?.id ? 'text-blue-100' : 'text-emerald-700'
                                                    }`}
                                                >
                                                    <span className="rounded-full border border-current/20 px-2 py-0.5 uppercase tracking-wide">
                                                        {voiceCallRecord.status}
                                                    </span>
                                                    {voiceCallRecord.durationMs > 0 ? (
                                                        <span>Duration: {formatVoiceCallDuration(voiceCallRecord.durationMs)}</span>
                                                    ) : null}
                                                    {voiceCallRecord.participantCount > 1 ? (
                                                        <span>Participants: {voiceCallRecord.participantCount}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : (
                                            <p
                                                className={[
                                                    isDeleted ? 'italic opacity-80' : '',
                                                    // Keep the overall chat layout stable even for long URLs / unbroken text.
                                                    'max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]'
                                                ].join(' ')}
                                            >
                                                <ExpandableMessageText
                                                    messageId={String(msg.id)}
                                                    text={
                                                        isScrolithaAuthoredMessage(msg)
                                                            ? normalizeScrolithaDisplayText(String(msg.text || ''))
                                                            : String(msg.text || '')
                                                    }
                                                    outgoing={msg.senderId === user?.id}
                                                    navigate={navigate}
                                                    mentionClassName={
                                                        msg.senderId === user?.id
                                                            ? 'font-semibold text-blue-100 underline decoration-blue-200/80'
                                                            : 'font-semibold text-indigo-600'
                                                    }
                                                />
                                            </p>
                                        )}
                                        {!isDeleted && msg.senderId !== user?.id && Array.isArray((msg as any)?.metadata?.cards) && (msg as any).metadata.cards.length > 0 ? (
                                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                                <ScrolithaEntityCards
                                                    cards={(msg as any).metadata.cards}
                                                    onConfirm={async (action) => {
                                                        if (!action.actionId) return;
                                                        try {
                                                            await ScrolithaService.execute({
                                                                actionId: String(action.actionId),
                                                                confirmed: true,
                                                                confirmationToken: action.confirmationToken || undefined
                                                            });
                                                            showNotification('success', 'Scrolitha', 'Action confirmed.');
                                                        } catch (err: any) {
                                                            showNotification(
                                                                'warning',
                                                                'Scrolitha',
                                                                err?.response?.data?.error || err?.message || 'Could not confirm action.'
                                                            );
                                                        }
                                                    }}
                                                />
                                            </div>
                                        ) : null}
                                        {attachmentList.length > 0 && !isDeleted ? (
                                            <MessageAttachmentsList
                                                attachments={attachmentList}
                                                outgoing={msg.senderId === user?.id}
                                            />
                                        ) : null}
                                        <div className={`text-[10px] mt-1 text-right flex justify-end items-center gap-1 ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            {!isDeleted && (msg.editedAt || msg.edited_at) && (
                                                <span className={`${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>(edited)</span>
                                            )}
                                            {isDeleted && (
                                                <span className={`${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>(deleted)</span>
                                            )}
                                            {msg.senderId === user?.id ? (
                                                <MessageDeliveryTicks
                                                    message={msg}
                                                    isOutgoing
                                                    onOutgoingBubble
                                                />
                                            ) : null}
                                        </div>

                                        {showReactionPanel && (
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {QUICK_REACTIONS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            void handleToggleReaction(msg.id, emoji);
                                                        }}
                                                        disabled={messageActionBusyId === msg.id}
                                                        aria-pressed={myReaction === emoji}
                                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${
                                                            myReaction === emoji
                                                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                                                        }`}
                                                    >
                                                        <span>{emoji}</span>
                                                        {reactionCounts[emoji] ? <span className="font-semibold">{reactionCounts[emoji]}</span> : null}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Always-visible reaction labels (sender + receiver) */}
                                    {reactionChips.length > 0 ? (
                                        <div
                                            className={`mt-1 flex flex-wrap gap-1 ${
                                                msg.senderId === user?.id ? 'justify-end' : 'justify-start'
                                            }`}
                                            aria-label="Message reactions"
                                        >
                                            {reactionChips.map(({ emoji, count }) => (
                                                <button
                                                    key={`${msg.id}-chip-${emoji}`}
                                                    type="button"
                                                    disabled={messageActionBusyId === msg.id}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void handleToggleReaction(msg.id, emoji);
                                                    }}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] shadow-sm transition ${
                                                        myReaction === emoji
                                                            ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700'
                                                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                    aria-label={`${emoji} ${count}${
                                                        myReaction === emoji ? ', your reaction' : ''
                                                    }`}
                                                    title={myReaction === emoji ? 'Remove your reaction' : 'React'}
                                                >
                                                    <span>{emoji}</span>
                                                    {count > 1 ? (
                                                        <span className="font-semibold">{count}</span>
                                                    ) : null}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}

                                    {/* Message Actions */}
                                    <div className={`mt-1.5 flex max-w-full ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`flex max-w-full flex-wrap items-center gap-1.5 ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedMessageId((prev) => (prev === msg.id ? null : msg.id))}
                                            className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-[11px] font-medium text-gray-600 shadow-sm transition hover:bg-gray-100"
                                            title="Message actions"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                            <span className="hidden sm:inline">Actions</span>
                                        </button>
                                        {showMessageControls && (
                                            <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-sm sm:flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setReplyToMessage(msg)}
                                                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                                                    title="Reply"
                                                    disabled={isDeleted}
                                                >
                                                    <CornerUpLeft className="w-4 h-4" />
                                                    <span>Reply</span>
                                                </button>
                                                {!isDeleted ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const isPinnedMsg = groupPins.some(
                                                                (p: any) =>
                                                                    String(p.messageId || p.message?.id || '') ===
                                                                    String(msg.id)
                                                            );
                                                            void handlePinToggle(msg.id, isPinnedMsg);
                                                        }}
                                                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                                                        title="Pin message"
                                                        data-testid="message-pin-action"
                                                        disabled={messageActionBusyId === msg.id}
                                                        aria-label={
                                                            groupPins.some(
                                                                (p: any) =>
                                                                    String(p.messageId || p.message?.id || '') ===
                                                                    String(msg.id)
                                                            )
                                                                ? 'Unpin message'
                                                                : 'Pin message'
                                                        }
                                                    >
                                                        <Pin className="w-4 h-4" />
                                                        <span>
                                                            {groupPins.some(
                                                                (p: any) =>
                                                                    String(p.messageId || p.message?.id || '') ===
                                                                    String(msg.id)
                                                            )
                                                                ? 'Unpin'
                                                                : 'Pin'}
                                                        </span>
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyMessage(msg)}
                                                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                                                    title="Copy"
                                                    disabled={messageActionBusyId === msg.id}
                                                >
                                                    <Copy className="w-4 h-4" />
                                                    <span>Copy</span>
                                                </button>
                                                {canEditDelete && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEditMessage(msg)}
                                                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                                                        title="Edit"
                                                        disabled={isDeleted || messageActionBusyId === msg.id}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                        <span>Edit</span>
                                                    </button>
                                                )}
                                                {!isDeleted && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteMessage(msg, 'me')}
                                                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                                                        title="Delete for me"
                                                        disabled={messageActionBusyId === msg.id}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        <span>Delete for me</span>
                                                    </button>
                                                )}
                                                {canEditDelete && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteMessage(msg, 'everyone')}
                                                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                                                        title="Delete for everyone"
                                                        disabled={isDeleted || messageActionBusyId === msg.id}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        <span>Delete for everyone</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            )})}
                            
                            {/* Typing / recording Indicator (Phase 29.3 multi-typer aware) */}
                            {(typingUser || presenceIndicatorLabel) && (
                                <div className="flex justify-start animate-fade-in" aria-live="polite">
                                    <div className="flex items-center rounded-2xl rounded-bl-none border border-gray-200 bg-white px-4 py-2 text-xs italic text-gray-500 shadow-sm">
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1 delay-100"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                        <span className="ml-2">
                                            {presenceIndicatorLabel ||
                                                (String(typingUser).startsWith('recording:')
                                                    ? `${String(typingUser).replace(/^recording:/, '')} is recording…`
                                                    : `${typingUser} is typing...`)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {/* Phase 20.7.2 — Scrolitha thinking / error / retry (never silent) */}
                            {isActiveScrolithaConversation && scrolithaThinking ? (
                                <div
                                    className="flex justify-start animate-fade-in"
                                    data-testid="scrolitha-thinking"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-none border border-indigo-100 bg-indigo-50/80 px-4 py-2.5 text-xs text-indigo-800 shadow-sm">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                        <span>Scrolitha is thinking…</span>
                                    </div>
                                </div>
                            ) : null}
                            {isActiveScrolithaConversation && scrolithaError && !scrolithaThinking ? (
                                <div
                                    className="flex justify-start animate-fade-in"
                                    data-testid="scrolitha-error"
                                    role="alert"
                                >
                                    <div className="max-w-[90%] rounded-2xl rounded-bl-none border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 shadow-sm md:max-w-[70%]">
                                        <p className="font-medium">{scrolithaError}</p>
                                        <button
                                            type="button"
                                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-900"
                                            onClick={() => {
                                                const last = lastScrolithaPromptRef.current;
                                                if (!last?.text) return;
                                                setScrolithaError(null);
                                                setMessageInput(last.text);
                                                window.requestAnimationFrame(() => {
                                                    composerTextareaRef.current?.focus();
                                                    composerTextareaRef.current?.form?.requestSubmit();
                                                });
                                            }}
                                        >
                                            <RefreshCw className="h-3 w-3" aria-hidden />
                                            Retry response
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Composer — content-sized flex row (never sticky/fixed overlay) */}
                        <div
                            ref={composerDockRef}
                            className="shrink-0 border-t border-gray-200 bg-white/95 p-2 backdrop-blur md:p-3"
                            style={
                                isMobileViewport
                                    ? {
                                          paddingBottom: isMobileConversationMode
                                              ? 'max(0.875rem, env(safe-area-inset-bottom))'
                                              : 'max(0.625rem, env(safe-area-inset-bottom))'
                                      }
                                    : undefined
                            }
                            data-testid="messages-composer-region"
                            data-scrolitha-composer={isActiveScrolithaConversation ? 'true' : 'false'}
                        >
                            {/* Phase 20.8.1 — collapse Scrolitha chrome while typing / keyboard open on mobile */}
                            {isActiveScrolithaConversation &&
                            !(isMobileViewport && (isMobileKeyboardOpen || Boolean(messageInput.trim()))) ? (
                                <div
                                    className="mb-2 space-y-1.5"
                                    role="region"
                                    aria-label="Scrolitha suggested prompts"
                                    data-testid="scrolitha-prompt-chips"
                                >
                                    {!isMobileViewport || !isMobileKeyboardOpen ? (
                                      <p className="truncate text-[11px] font-medium text-indigo-700">
                                          {isMobileViewport
                                            ? 'Scrolitha · AI assistant'
                                            : 'Scrolitha · official AI assistant · responses are AI-generated'}
                                      </p>
                                    ) : null}
                                    <div className="flex max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        {scrolithaPromptChips.map((chip) => (
                                            <button
                                                key={chip}
                                                type="button"
                                                onClick={() => {
                                                    setMessageInput(chip);
                                                    window.requestAnimationFrame(() => {
                                                        composerTextareaRef.current?.focus();
                                                    });
                                                }}
                                                className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-800 transition hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500"
                                            >
                                                {chip}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : isActiveScrolithaConversation &&
                              isMobileViewport &&
                              (isMobileKeyboardOpen || Boolean(messageInput.trim())) ? (
                                <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                                  <p className="truncate text-[10px] font-medium text-indigo-600/90">
                                    AI · verify important details
                                  </p>
                                  {!messageInput.trim() ? (
                                    <button
                                      type="button"
                                      className="shrink-0 text-[10px] font-semibold text-indigo-700"
                                      onClick={() => {
                                        /* chips reappear when input cleared / keyboard closed */
                                      }}
                                      hidden
                                    >
                                      Suggestions
                                    </button>
                                  ) : null}
                                </div>
                            ) : null}
                            {replyToMessage && (
                                <div className="mb-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-3 text-xs text-slate-600 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                                                Replying to {replyToMessage.senderId === user?.id ? 'yourself' : (otherParticipant?.name || 'message')}
                                            </div>
                                            <div className="mt-1 truncate text-sm font-medium text-slate-700">
                                                {replyToMessage.text || 'Attachment'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setReplyToMessage(null)}
                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {pendingAttachments.length > 0 && (
                                <div
                                  className="mb-3 flex gap-2 overflow-x-auto pb-1"
                                  data-testid="composer-attachment-staging"
                                  role="list"
                                  aria-label="Attachments ready to send"
                                >
                                    {pendingAttachments.map(file => {
                                        const preview = normalizeAttachmentForDisplay({
                                            ...file,
                                            url: file.localObjectUrl || file.url,
                                            id: file.fileId || file.id
                                        });
                                        const localPreview = String(file.localObjectUrl || file.url || '');
                                        const previewUrl = localPreview || (preview ? getResolvedAttachmentUrl(preview) : '');
                                        const isUploading = file.uploadState === 'uploading';
                                        const isFailed = file.uploadState === 'failed';
                                        return (
                                        <div
                                          key={file.clientLocalId || file.id}
                                          role="listitem"
                                          className={[
                                            'flex min-w-[11rem] max-w-[16rem] shrink-0 items-center justify-between gap-2 rounded-2xl border px-2.5 py-1.5 text-xs shadow-sm sm:min-w-[14rem] sm:max-w-[18rem] sm:gap-3 sm:px-3 sm:py-2',
                                            isFailed
                                              ? 'border-red-200 bg-red-50 text-red-800'
                                              : 'border-gray-200 bg-gray-50 text-gray-700'
                                          ].join(' ')}
                                        >
                                            {preview && preview.type === 'image' && previewUrl ? (
                                                <img src={previewUrl} alt={preview.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                                            ) : preview && preview.type === 'video' && previewUrl ? (
                                                <video src={previewUrl} className="h-12 w-12 shrink-0 rounded-xl object-cover" muted playsInline preload="metadata" />
                                            ) : (
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-gray-400">
                                                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-semibold">{file.name || 'Attachment'}</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {isFailed
                                                      ? (file.errorMessage || 'Upload failed')
                                                      : isUploading
                                                        ? `Uploading ${Math.max(0, Math.min(100, Number(file.progress || 0)))}%`
                                                        : formatBytes(file.size) || 'Ready to send'}
                                                </div>
                                                {isUploading ? (
                                                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-blue-100">
                                                    <div
                                                      className="h-full rounded-full bg-blue-600 transition-all"
                                                      style={{ width: `${Math.max(4, Math.min(100, Number(file.progress || 0)))}%` }}
                                                    />
                                                  </div>
                                                ) : null}
                                            </div>
                                            <button type="button" onClick={() => removeAttachment(String(file.clientLocalId || file.id))} className="text-gray-400 hover:text-gray-600" aria-label="Remove attachment">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )})}
                                </div>
                            )}

                            {attachmentUploadState && (
                                <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-700 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold">{attachmentUploadState.fileName}</div>
                                            <div className="text-[11px]">
                                                Uploading {attachmentUploadState.uploadedCount + 1} of {attachmentUploadState.totalCount}
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-semibold">{attachmentUploadState.progress}%</div>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
                                        <div
                                            className="h-full rounded-full bg-blue-600 transition-all"
                                            style={{ width: `${attachmentUploadState.progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Composer policy banners */}
                            {isActiveGroupConversation && groupComposerRestriction.message ? (
                                <div
                                    className={`mx-2 mb-2 rounded-xl border px-3 py-2 text-xs ${
                                        groupComposerRestriction.blocked
                                            ? 'border-rose-200 bg-rose-50 text-rose-900'
                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                    }`}
                                    data-testid="group-composer-restriction"
                                    role="status"
                                >
                                    {groupComposerRestriction.message}
                                </div>
                            ) : null}

                            {/* Phase 20.8 — Smart Composer: + / input / mic / suggest / send */}
                            <SmartComposer
                                value={messageInput}
                                onChange={handleMessageInputChange}
                                onSubmit={handleSendMessage}
                                textareaRef={composerTextareaRef}
                                onKeyDown={handleComposerKeyDown}
                                onFocus={() => scrollComposerIntoView('auto')}
                                isMobile={isMobileViewport}
                                keyboardOpen={isMobileKeyboardOpen}
                                isScrolitha={isActiveScrolithaConversation}
                                placeholder={
                                    isMobileViewport
                                      ? mobileComposerPlaceholder(
                                          isActiveScrolithaConversation,
                                          pendingAttachments.length > 0
                                        )
                                      : isActiveScrolithaConversation
                                        ? 'Ask Scrolitha to do something on Scrolith…'
                                        : 'Write a message. Press Enter to send, Shift+Enter for a new line.'
                                }
                                canSend={
                                    Boolean(activeConvoId) &&
                                    Boolean(messageInput.trim() || pendingAttachments.length) &&
                                    !hasPendingUploadsInFlight(pendingAttachments) &&
                                    !pendingAttachments.some((item) => item.uploadState === 'failed') &&
                                    !(isActiveGroupConversation && groupComposerRestriction.blocked)
                                }
                                onPickFiles={() => uploadInputRef.current?.click()}
                                onPickMedia={() => mediaInputRef.current?.click()}
                                onPickCamera={() => cameraInputRef.current?.click()}
                                onSuggestReply={() => void handleAiSuggest()}
                                suggestLoading={isGettingAiSuggestion}
                                showSuggestReply={!isActiveScrolithaConversation}
                                helperText={
                                    isMobileKeyboardOpen
                                      ? undefined
                                      : hasPendingUploadsInFlight(pendingAttachments)
                                        ? 'Uploading…'
                                        : pendingAttachments.length > 0
                                          ? `${pendingAttachments.length} ready`
                                          : isMobileViewport
                                            ? undefined
                                            : isActiveScrolithaConversation
                                              ? 'AI responses are generated — verify important details.'
                                              : 'Private chat media stays scoped to this conversation.'
                                }
                                fileInputs={
                                    <>
                                        <input
                                            ref={uploadInputRef}
                                            type="file"
                                            multiple
                                            accept={MESSAGE_UPLOAD_ACCEPT}
                                            className="hidden"
                                            onChange={(event) => void handleUploadInputChange(event)}
                                        />
                                        <input
                                            ref={mediaInputRef}
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            className="hidden"
                                            onChange={(event) => void handleUploadInputChange(event)}
                                        />
                                        <input
                                            ref={cameraInputRef}
                                            type="file"
                                            accept="image/*,video/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={(event) => void handleUploadInputChange(event)}
                                        />
                                    </>
                                }
                                voiceControl={
                                    <VoiceRecorder
                                        disabled={
                                            voiceNoteBusy ||
                                            !activeConvoId ||
                                            !voiceRuntimeConfig.enabledVoiceNotes ||
                                            voiceRuntimeConfig.blockedForCurrentUser ||
                                            hasPendingUploadsInFlight(pendingAttachments)
                                        }
                                        maxDurationSeconds={voiceRuntimeConfig.maxVoiceNoteDurationSeconds}
                                        onRecorded={handleVoiceRecorded}
                                        onError={(message) => showNotification('error', 'Voice notes', message)}
                                        className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50"
                                    />
                                }
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <Smile className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="font-medium">Select a conversation to start messaging</p>
                    </div>
                )}
            </div>
        </div>
        </div>
    </div>
    {activeConvoId ? (
        <GroupManagePanel
            conversationId={activeConvoId}
            open={showGroupManage}
            onClose={() => setShowGroupManage(false)}
            isGroup={isActiveGroupConversation}
            initialTitle={activeGroupTitle || activeConversationTitle}
            canManage={canManageActiveGroup}
            currentUserId={user?.id || null}
            onUpdated={() => {
                void refreshConversationData();
                void refreshMessages();
            }}
        />
    ) : null}
    {activeConvoId ? (
        <ChatAppearancePanel
            conversationId={activeConvoId}
            open={chatAppearanceOpen}
            appearance={chatAppearance}
            loading={chatAppearanceLoading}
            onClose={() => setChatAppearanceOpen(false)}
            onSaved={(next) => {
                setChatAppearance(next || { kind: 'none' });
                setChatAppearanceOpen(false);
            }}
        />
    ) : null}
    {user?.id ? (
        <GroupCreateWizard
            open={showCreateGroup}
            onClose={() => setShowCreateGroup(false)}
            currentUserId={user.id}
            onCreated={(id) => {
                setShowCreateGroup(false);
                void refreshMessages();
                if (id) {
                    setActiveConvoId(id);
                    navigate(`/messages/${id}`);
                    setShowGroupManage(true);
                }
                showNotification('success', 'Group created', 'Your messaging group is ready.');
            }}
            onError={(message) => showNotification('error', 'Create group', message)}
        />
    ) : null}
    <MobileDialog
        open={showMessageSettings}
        onClose={() => setShowMessageSettings(false)}
        size="lg"
        title="Messaging privacy & settings"
        closeDisabled={settingsBusy}
        bodyClassName="space-y-1"
        /* Must sit above mobile conversation shell (z-[80]) and group panels */
        zIndexClassName="z-[200]"
    >
                <div data-testid="messages-manage-settings">
                <p className="mb-3 text-xs text-gray-500">
                    <span className="font-semibold">Messaging privacy</span> is global across all conversations.
                    Conversation actions (mute, archive, star) stay in the conversation menu.
                </p>
                <div
                    className="mb-4 flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1"
                    role="tablist"
                    aria-label="Settings sections"
                >
                    {(
                        [
                            { id: 'privacy' as const, label: 'Privacy' },
                            { id: 'inbox' as const, label: 'Inbox & InMail' },
                            { id: 'safety' as const, label: 'Safety' }
                        ] as const
                    ).map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={messageSettingsTab === tab.id}
                            data-testid={`messages-settings-tab-${tab.id}`}
                            onClick={() => setMessageSettingsTab(tab.id)}
                            className={`min-h-9 flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                                messageSettingsTab === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {messageSettingsTab === 'privacy' ? (
                    <MessagingPrivacySettingsPanel
                        open={showMessageSettings && messageSettingsTab === 'privacy'}
                        onSaved={() => {
                            showNotification('success', 'Messaging privacy', 'Settings updated.');
                        }}
                        onError={(message) => {
                            showNotification('error', 'Messaging privacy', message);
                        }}
                    />
                ) : null}
                {messageSettingsTab === 'inbox' ? (
                    <div className="space-y-5" data-testid="messages-settings-inbox">
                        <section className="rounded-lg border border-gray-200 p-4">
                            <h4 className="text-sm font-semibold text-gray-900">Messages you receive</h4>
                            <p className="mt-1 text-xs text-gray-500">
                                Allows others to send you message requests notifications.
                            </p>
                            <label className="mt-3 flex items-center justify-between text-sm">
                                Message requests
                                <input
                                    type="checkbox"
                                    checked={Boolean(messageSettings.messageRequestsNotifications)}
                                    disabled={settingsBusy}
                                    onChange={() => handleMessageSettingToggle('messageRequestsNotifications')}
                                />
                            </label>
                        </section>
                        <section className="rounded-lg border border-gray-200 p-4">
                            <h4 className="text-sm font-semibold text-gray-900">InMail messages</h4>
                            <p className="mt-1 text-xs text-gray-500">Allow others to send you InMail.</p>
                            <label className="mt-3 flex items-center justify-between text-sm">
                                InMail messages
                                <input
                                    type="checkbox"
                                    checked={Boolean(messageSettings.allowInMail)}
                                    disabled={settingsBusy}
                                    onChange={() => handleMessageSettingToggle('allowInMail')}
                                />
                            </label>
                        </section>
                        <div className="text-xs text-gray-500">
                            You cannot disable messages from your 1st-degree connections. Use block for specific users.
                        </div>
                    </div>
                ) : null}
                {messageSettingsTab === 'safety' ? (
                    <div className="space-y-4" data-testid="messages-settings-safety">
                        <section className="rounded-lg border border-gray-200 p-4">
                            <h4 className="text-sm font-semibold text-gray-900">Blocked accounts</h4>
                            <p className="mt-1 text-xs text-gray-500">
                                Use <span className="font-medium">Report / Block</span> on a conversation to block a
                                participant. Unblock is available from account safety settings when supported.
                            </p>
                        </section>
                        <section className="rounded-lg border border-gray-200 p-4">
                            <h4 className="text-sm font-semibold text-gray-900">Conversation-specific controls</h4>
                            <p className="mt-1 text-xs text-gray-500">
                                Mute, archive, star, labels, and notification levels live in each conversation&apos;s
                                menu — they do not change global online or last-seen privacy.
                            </p>
                        </section>
                    </div>
                ) : null}
                </div>
    </MobileDialog>
    <MobileDialog
        open={showBriefComposer}
        onClose={() => setShowBriefComposer(false)}
        size="lg"
        title="Conversation Brief"
        description="Edit the structured request before saving it back into the relationship timeline."
        closeDisabled={briefComposerBusy}
        bodyClassName="space-y-4"
        footer={
            <MobileDialogFooter>
                <button
                    type="button"
                    onClick={() => setShowBriefComposer(false)}
                    disabled={briefComposerBusy}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:w-auto"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => void handleSaveBrief()}
                    disabled={briefComposerBusy}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                >
                    {briefComposerBusy ? 'Saving...' : 'Save Brief'}
                </button>
            </MobileDialogFooter>
        }
    >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Title</span>
                            <input
                                type="text"
                                value={String(briefDraft.title || '')}
                                onChange={(e) => setBriefDraft((prev) => ({ ...prev, title: e.target.value }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Category</span>
                            <input
                                type="text"
                                list="deal-flow-categories"
                                value={String(briefDraft.category || '')}
                                onChange={(e) => setBriefDraft((prev) => ({ ...prev, category: e.target.value }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                        <datalist id="deal-flow-categories">
                            {(dealFlowConfig.allowedCategories || []).map((category) => (
                                <option key={category} value={category} />
                            ))}
                        </datalist>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Budget Range</span>
                            <input
                                type="text"
                                value={String(briefDraft.budget_range || briefDraft.budgetRange || '')}
                                onChange={(e) => setBriefDraft((prev) => ({ ...prev, budget_range: e.target.value }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</span>
                            <input
                                type="text"
                                value={String(briefDraft.timeline || '')}
                                onChange={(e) => setBriefDraft((prev) => ({ ...prev, timeline: e.target.value }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Description</span>
                        <textarea
                            value={String(briefDraft.description || '')}
                            onChange={(e) => setBriefDraft((prev) => ({ ...prev, description: e.target.value }))}
                            className="w-full rounded-2xl border-gray-300 p-3 text-sm"
                            rows={6}
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Required Skills</span>
                        <input
                            type="text"
                            value={Array.isArray(briefDraft.required_skills ?? briefDraft.requiredSkills) ? (briefDraft.required_skills ?? briefDraft.requiredSkills)?.join(', ') : ''}
                            onChange={(e) =>
                                setBriefDraft((prev) => ({
                                    ...prev,
                                    required_skills: e.target.value.split(',').map((entry) => entry.trim()).filter(Boolean)
                                }))
                            }
                            className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            placeholder="design, webflow, analytics"
                        />
                    </label>

                    {(briefDraft.source_messages || briefDraft.sourceMessages) && (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation Context</div>
                            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                {((briefDraft.source_messages || briefDraft.sourceMessages) as any[]).slice(-6).map((entry) => (
                                    <div key={String(entry.id || entry.timestamp)} className="rounded-xl bg-white px-3 py-2 text-xs text-gray-600 shadow-sm">
                                        <div className="font-semibold text-gray-700">{entry.sender_name || 'Participant'}</div>
                                        <div className="mt-1 whitespace-pre-wrap">{entry.snippet}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
    </MobileDialog>
    <MobileDialog
        open={Boolean(showProposalComposer && proposalBrief)}
        onClose={() => setShowProposalComposer(false)}
        size="lg"
        title="Create Proposal From Brief"
        description={proposalBrief?.title}
        closeDisabled={proposalComposerBusy}
        footer={
            <MobileDialogFooter>
                <button
                    type="button"
                    onClick={() => setShowProposalComposer(false)}
                    disabled={proposalComposerBusy}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:w-auto"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => void handleSubmitProposalFromBrief()}
                    disabled={proposalComposerBusy}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                >
                    {proposalComposerBusy ? 'Submitting...' : 'Submit Proposal'}
                </button>
            </MobileDialogFooter>
        }
    >
                {proposalBrief ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
                        <div className="rounded-2xl bg-gray-50 px-3 py-2">
                            <div className="font-semibold text-gray-700">Budget</div>
                            <div className="mt-1">{proposalBrief.budget_range || proposalBrief.budgetRange || 'TBD'}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2">
                            <div className="font-semibold text-gray-700">Timeline</div>
                            <div className="mt-1">{proposalBrief.timeline || 'TBD'}</div>
                        </div>
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cover Letter</span>
                        <textarea
                            value={proposalDraft.coverLetter}
                            onChange={(e) => setProposalDraft((prev) => ({ ...prev, coverLetter: e.target.value }))}
                            className="w-full rounded-2xl border-gray-300 p-3 text-sm"
                            rows={6}
                        />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Proposed Amount</span>
                            <input
                                type="number"
                                min={1}
                                step={0.01}
                                value={proposalDraft.proposedAmount}
                                onChange={(e) => setProposalDraft((prev) => ({ ...prev, proposedAmount: e.target.value }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline (days)</span>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={proposalDraft.proposedTimeline}
                                onChange={(e) => setProposalDraft((prev) => ({ ...prev, proposedTimeline: Number.parseInt(e.target.value || '14', 10) }))}
                                className="w-full rounded-xl border-gray-300 p-3 text-sm"
                            />
                        </label>
                    </div>

                </div>
                ) : null}
    </MobileDialog>
    <AcceptProposalContractModal
        open={Boolean(acceptProposalEvent)}
        proposal={
            acceptProposalEvent
                ? {
                      id: String(acceptProposalEvent.event?.proposalId || acceptProposalEvent.event?.proposal?.id || ''),
                      jobId: '',
                      jobTitle: String(
                          acceptProposalEvent.event?.title ||
                              acceptProposalEvent.event?.proposal?.jobTitle ||
                              acceptProposalEvent.event?.proposal?.job_title ||
                              'Proposal'
                      ),
                      jobType: String(
                          acceptProposalEvent.event?.proposal?.jobType ||
                              acceptProposalEvent.event?.proposal?.job_type ||
                              ''
                      ),
                      jobBudget:
                          acceptProposalEvent.event?.proposal?.jobBudget ||
                          acceptProposalEvent.event?.proposal?.job_budget ||
                          undefined,
                      freelancerId: '',
                      freelancerName: String(
                          acceptProposalEvent.event?.proposal?.freelancerName ||
                              acceptProposalEvent.event?.proposal?.freelancer_name ||
                              'Freelancer'
                      ),
                      coverLetter: '',
                      proposedAmount: Number(acceptProposalEvent.event?.proposal?.proposedAmount || 0),
                      proposedTimeline: Number(acceptProposalEvent.event?.proposal?.proposedTimeline || 14),
                      attachments: [],
                      status: String(acceptProposalEvent.event?.proposal?.status || 'pending') as any,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                  }
                : null
        }
        dealFlowConfig={dealFlowConfig}
        loading={Boolean(acceptProposalEvent && timelineActionBusyId === String(acceptProposalEvent.messageId || ''))}
        onClose={() => {
            if (timelineActionBusyId) return;
            setAcceptProposalEvent(null);
        }}
        onSubmit={async (payload) => {
            if (!acceptProposalEvent) return;
            await handleAcceptProposalFromTimeline(
                String(acceptProposalEvent.messageId || ''),
                acceptProposalEvent.event,
                payload
            );
        }}
    />
    </>
  );
};

export default Messages;





