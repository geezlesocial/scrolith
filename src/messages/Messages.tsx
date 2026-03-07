
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { MessagingService } from '../services/messaging';
import { Conversation, Message, UploadedFile, UserRole } from '../types';
import { Send, Image as ImageIcon, Smile, MoreVertical, ArrowLeft, Sparkles, Loader2, Check, Trash2, ShieldAlert, RefreshCw, X, CornerUpLeft, Copy, Pencil, Star, Phone, Users, Paperclip, Download, Camera } from 'lucide-react';
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
import VoiceCallModal from './VoiceCallModal';
import { VoiceCallProvider, useVoiceCall } from './VoiceCallProvider';


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
  meId?: string;
  onError: (message: string) => void;
}> = ({ disabled, canConference, meId, onError }) => {
  const {
    open,
    incoming,
    statusLabel,
    muted,
    speakerOn,
    addBusy,
    participantUsers,
    participants,
    remoteStreams,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    addParticipant
  } = useVoiceCall();

  const handleStart = async (conference?: boolean) => {
    try {
      await startCall({ conference });
    } catch (error: any) {
      onError(error?.message || 'Unable to start voice call.');
    }
  };

  const handleAccept = async () => {
    try {
      await acceptCall();
    } catch (error: any) {
      onError(error?.message || 'Unable to accept voice call.');
    }
  };

  const handleReject = async () => {
    try {
      await rejectCall();
    } catch (error: any) {
      onError(error?.message || 'Unable to reject voice call.');
    }
  };

  const handleEnd = async () => {
    try {
      await endCall();
    } catch (error: any) {
      onError(error?.message || 'Unable to end voice call.');
    }
  };

  const handleAddParticipant = async (userId: string) => {
    try {
      await addParticipant(userId);
    } catch (error: any) {
      onError(error?.message || 'Unable to add participant.');
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void handleStart(false)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
          title="Start voice call"
        >
          <Phone className="h-4 w-4" />
        </button>
        {canConference ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void handleStart(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
            title="Start conference call"
          >
            <Users className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <VoiceCallModal
        open={open}
        incoming={incoming}
        statusLabel={statusLabel}
        muted={muted}
        speakerOn={speakerOn}
        addBusy={addBusy}
        canAddParticipant={Boolean(canConference)}
        participantUsers={participantUsers}
        participants={participants}
        meId={meId}
        remoteStreams={remoteStreams}
        onClose={() => void handleEnd()}
        onAccept={() => void handleAccept()}
        onReject={() => void handleReject()}
        onEnd={() => void handleEnd()}
        onToggleMute={toggleMute}
        onToggleSpeaker={toggleSpeaker}
        onAddParticipant={(userId) => void handleAddParticipant(userId)}
      />
    </>
  );
};

const Messages = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { refreshMessages } = useMessages();
  const { socket } = useSocket();
  const { settings } = useContent();
  
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<UploadedFile[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showMessageSettings, setShowMessageSettings] = useState(false);
  const [messageSettings, setMessageSettings] = useState({
      messageRequestsNotifications: true,
      allowInMail: true
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [voiceRuntimeConfig, setVoiceRuntimeConfig] = useState({
      enabledVoiceCalls: true,
      enabledConferenceCalls: true,
      enabledVoiceNotes: true,
      maxParticipants: 20,
      maxVoiceNoteDurationSeconds: 180,
      blockedForCurrentUser: false
  });
  const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
  
  // Advanced Features State
  const [typingUser, setTypingUser] = useState<string | null>(null);
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
  const [isMobileViewport, setIsMobileViewport] = useState(
      () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  );
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLUListElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const activeConvoIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingIndicatorTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const messageMediaObjectUrlRef = useRef<Map<string, string>>(new Map());
  const pendingMediaFetchRef = useRef<Set<string>>(new Set());
  const [conversationScrollTop, setConversationScrollTop] = useState(0);
  const [conversationViewportHeight, setConversationViewportHeight] = useState(0);
  const [messageMediaResources, setMessageMediaResources] = useState<Record<string, AttachmentPreviewResource>>({});
  const messageMediaResourcesRef = useRef<Record<string, AttachmentPreviewResource>>({});
  const messagesTraceEnabled =
      ['1', 'true', 'yes', 'on'].includes(String((import.meta as any)?.env?.VITE_MESSAGES_TRACE_DEBUG || '').toLowerCase());

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
      const onResize = () => setIsMobileViewport(window.innerWidth < 768);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
  }, []);

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
  }, [conversations.length, showStarredOnly, isMobileViewport]);

  useEffect(() => {
      userIdRef.current = user?.id || null;
  }, [user?.id]);

  // Load Conversations
  useEffect(() => {
      if (user) {
          MessagingService.getAllConversations(user.id, user.role).then(setConversations);
      }
  }, [user]);

  useEffect(() => {
      if (!user) return;
      MessagingService.getVoiceRuntimeConfig()
          .then((config) => {
              setVoiceRuntimeConfig({
                  enabledVoiceCalls: Boolean(config?.enabledVoiceCalls ?? true),
                  enabledConferenceCalls: Boolean(config?.enabledConferenceCalls ?? true),
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
      if (conversationId && conversations.length > 0) {
          const exists = conversations.find(c => c.id === conversationId);
          if (exists) {
              setActiveConvoId(conversationId);
              // Mark as read when opening
              if (user) {
                  MessagingService.markAsRead(conversationId, user.id).then(() => {
                      refreshMessages();
                      // Update local state to reflect read status
                      setConversations(prev => prev.map(c => 
                          c.id === conversationId ? { ...c, unreadCount: 0 } : c
                      ));
                  });
              }
          }
      }
  }, [conversationId, conversations.length, user]);

  useEffect(() => {
      if (!conversationId && isMobileViewport) {
          setActiveConvoId(null);
          setExpandedMessageId(null);
          setReactionPanelMessageId(null);
          setShowConversationMenu(false);
      }
  }, [conversationId, isMobileViewport]);

  // Auto-scroll to bottom
  useEffect(() => {
      if (!shouldAutoScrollRef.current) return;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [
      activeConvoId,
      typingUser,
      conversations.find((conversation) => conversation.id === activeConvoId)?.messages?.length
  ]); 

  useEffect(() => {
      setPendingAttachments([]);
      setReplyToMessage(null);
      setEditingMessageId(null);
      setEditDraft('');
      setMessageActionBusyId(null);
      setExpandedMessageId(null);
      setReactionPanelMessageId(null);
      setShowConversationMenu(false);
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

  const activeConvo = conversations.find(c => c.id === activeConvoId);
  const visibleConversations = [...conversations]
      .sort((a, b) => {
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
      const others = (activeConvo?.participants || []).filter((participant: any) => String(participant?.id || '') !== String(user?.id || ''));
      const withDisplayName = others.find((participant: any) => {
          const id = String(participant?.id || '').trim();
          const name = String(participant?.name || participant?.username || '').trim();
          return Boolean(name) && name !== id;
      });
      return withDisplayName || others[0] || activeConvo?.participants[0];
  })();
  const otherOnline = Boolean(otherParticipant?.isOnline ?? otherParticipant?.is_online);
  const otherLastSeen = otherParticipant?.lastSeenAt ?? otherParticipant?.last_seen_at;
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
  const resolveParticipantProfileUrl = (participant: any) => {
      if (!participant) return '/profile/edit';
      const username = String(participant.username || '').trim();
      if (username) return `/u/${username.replace(/^@+/, '')}`;
      if (participant.profileUrl || participant.profile_url) {
          return String(participant.profileUrl || participant.profile_url);
      }
      const participantId = String(participant.id || '').trim();
      return participantId ? `/profile/${participantId}` : '/profile/edit';
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
      if (Boolean(message.isDeleted ?? message.is_deleted)) return '[Message deleted]';
      const messageType = String(message.messageType || message.message_type || '').toLowerCase();
      if (messageType === 'voice_note' || message.voiceNote || message.voice_note) return 'Voice note';
      const text = String(message.text || '').trim();
      if (text) return text.slice(0, 160);
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      if (attachments.length) return 'Sent an attachment';
      return 'Message';
  };

  const applyConversationMessageChanges = (
      conversationId: string,
      updater: (messages: Message[]) => Message[]
  ) => {
      setConversations((prev) =>
          prev.map((conversation) => {
              if (conversation.id !== conversationId) return conversation;
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
          })
      );
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
      const uploaded: UploadedFile[] = [];
      setAttachmentUploadState({
          fileName: queue[0].name || 'Attachment',
          progress: 0,
          uploadedCount: 0,
          totalCount: queue.length
      });
      try {
          for (let index = 0; index < queue.length; index += 1) {
              const file = queue[index];
              const uploadedFile = await FileService.uploadFile(file, inferUploadCategory(file), {
                  role: user.role,
                  userId: user.id,
                  visibility: 'private',
                  onProgress: (progress) => {
                      setAttachmentUploadState({
                          fileName: file.name || 'Attachment',
                          progress,
                          uploadedCount: index,
                          totalCount: queue.length
                      });
                  }
              });
              uploaded.push(uploadedFile);
              setAttachmentUploadState({
                  fileName: file.name || 'Attachment',
                  progress: 100,
                  uploadedCount: index + 1,
                  totalCount: queue.length
              });
          }
          mergeAttachments(uploaded);
          showNotification(
              'success',
              'Attachments',
              uploaded.length === 1 ? 'Attachment ready to send.' : `${uploaded.length} attachments ready to send.`
          );
      } catch (error: any) {
          const message =
              error?.response?.data?.error ||
              error?.response?.data?.message ||
              error?.message ||
              'Failed to upload attachment.';
          showNotification('error', 'Attachments', String(message));
      } finally {
          window.setTimeout(() => setAttachmentUploadState(null), 600);
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

  const mediaPreviewCandidates = useMemo(() => {
      const candidates: AttachmentDisplay[] = [];
      const pushCandidate = (value: any) => {
          const normalized = normalizeAttachmentForDisplay(value);
          if (!normalized || !isPreviewableAttachment(normalized)) return;
          candidates.push(normalized);
      };

      pendingAttachments.forEach(pushCandidate);
      (activeConvo?.messages || []).forEach((message) => {
          const attachments = Array.isArray(message.attachments) ? message.attachments : [];
          attachments.forEach(pushCandidate);
          const voiceNote = (message as any)?.voiceNote || (message as any)?.voice_note;
          if (voiceNote) {
              pushCandidate({
                  id: voiceNote.fileId || voiceNote.id || '',
                  fileId: voiceNote.fileId || voiceNote.id || '',
                  url: voiceNote.url || '',
                  name: 'Voice note',
                  type: 'audio',
                  mimeType: 'audio/webm'
              });
          }
      });

      return candidates;
  }, [activeConvo?.messages, pendingAttachments]);

  useEffect(() => {
      mediaPreviewCandidates.forEach((attachment) => {
          void preloadMessageAttachment(attachment);
      });
  }, [mediaPreviewCandidates, preloadMessageAttachment]);

  const mergeAttachments = (files: UploadedFile[]) => {
      if (!files.length) return;
      setPendingAttachments(prev => {
          const map = new Map(prev.map(file => [file.id, file]));
          files.forEach(file => {
              if (file?.id) map.set(file.id, file);
          });
          return Array.from(map.values());
      });
  };

  const removeAttachment = (fileId: string) => {
      setPendingAttachments(prev => prev.filter(file => file.id !== fileId));
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
              return list.map((conversation) => {
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
          });
          const convoId = activeConvoIdRef.current;
          if (convoId && !options?.silent) {
              const full = await MessagingService.getConversationById(convoId);
              if (full) {
                  setConversations(prev => prev.map(c => c.id === convoId ? { ...c, ...full } : c));
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

  useEffect(() => {
      if (!user) return;
      const interval = setInterval(() => {
          refreshConversationData({ silent: true });
      }, 30000);
                            return () => clearInterval(interval);
  }, [user, messageInput, editingMessageId, replyToMessage, pendingAttachments.length]);

  const handleMessagesScroll = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 120;
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

          setConversations(prev => {
              let found = false;
              const updated = prev.map(c => {
                  if (c.id !== convoId) return c;
                  found = true;
                  const exists = c.messages.some(m => m.id === message.id);
                  const nextMessages = exists ? c.messages : [...c.messages, message];
                  const isActive = activeConvoIdRef.current === convoId;
                  const isFromOther = (message.senderId || message.sender_id) !== userIdRef.current;
                  const unreadBase = c.unreadCount ?? c.unread_count ?? 0;
                  const unreadCount = isActive || !isFromOther ? unreadBase : unreadBase + 1;
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
                      setConversations(current => [full, ...current.filter(c => c.id !== convoId)]);
                  });
                  return prev;
              }
              return updated;
          });

          const isActive = activeConvoIdRef.current === convoId;
          const isFromOther = (message.senderId || message.sender_id) !== userIdRef.current;
          if (isActive && isFromOther && userIdRef.current) {
              void MessagingService.markAsRead(convoId, userIdRef.current);
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
          refreshMessages();
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
          if (!typingUserId || typingUserId === userIdRef.current) return;

          if (!payload?.isTyping) {
              setTypingUser((current) =>
                  current && current === String(payload?.name || '').trim() ? null : current
              );
              if (typingIndicatorTimerRef.current) {
                  window.clearTimeout(typingIndicatorTimerRef.current);
                  typingIndicatorTimerRef.current = null;
              }
              return;
          }

          setTypingUser(String(payload?.name || 'Someone').trim() || 'Someone');
          if (typingIndicatorTimerRef.current) {
              window.clearTimeout(typingIndicatorTimerRef.current);
          }
          typingIndicatorTimerRef.current = window.setTimeout(() => {
              setTypingUser(null);
              typingIndicatorTimerRef.current = null;
          }, 2200);
      };

      const handleMessageUpdated = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          const messageId = payload?.messageId || payload?.id;
          if (!convoId || !messageId) return;
          const deletedForMe = Boolean(payload?.deletedForMe ?? payload?.deleted_for_me ?? false);
          traceClient('socket.message_updated', {
              conversationId: convoId,
              messageId,
              deletedForMe,
              isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted),
              editedAt: payload?.editedAt ?? payload?.edited_at ?? null
          });
          setConversations(prev => prev.map(c => {
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
              const nextMessages = c.messages.map(m => {
                  if (m.id !== messageId) return m;
                  return {
                      ...m,
                      text: payload?.text ?? m.text,
                      timestamp: payload?.timestamp ?? m.timestamp,
                      editedAt: payload?.editedAt ?? payload?.edited_at ?? m.editedAt ?? m.edited_at ?? null,
                      edited_at: payload?.edited_at ?? payload?.editedAt ?? m.edited_at ?? m.editedAt ?? null,
                      isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? m.isDeleted ?? m.is_deleted),
                      is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? m.is_deleted ?? m.isDeleted),
                      deletedAt: payload?.deletedAt ?? payload?.deleted_at ?? m.deletedAt ?? m.deleted_at ?? null,
                      deleted_at: payload?.deleted_at ?? payload?.deletedAt ?? m.deleted_at ?? m.deletedAt ?? null,
                      attachments: Array.isArray(payload?.attachments) ? payload.attachments : m.attachments,
                      reactions: Array.isArray(payload?.reactions) ? payload.reactions : m.reactions,
                      reactionSummary: payload?.reactionSummary || m.reactionSummary
                  };
              });
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
          }));
      };

      const handleConversationUpdated = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          traceClient('socket.conversation_updated', { conversationId: convoId, payload });
          setConversations(prev => prev.map(conversation => {
              if (conversation.id !== convoId) return conversation;
               const merged = {
                   ...conversation,
                   ...(payload?.label !== undefined ? { label: payload.label } : {}),
                   ...(payload?.isStarred !== undefined ? { isStarred: Boolean(payload.isStarred), is_starred: Boolean(payload.isStarred) } : {}),
                   ...(payload?.isMuted !== undefined ? { isMuted: Boolean(payload.isMuted), is_muted: Boolean(payload.isMuted) } : {}),
                   ...(payload?.isArchived !== undefined ? { isArchived: Boolean(payload.isArchived), is_archived: Boolean(payload.isArchived) } : {}),
                   ...(payload?.unread_count !== undefined ? { unreadCount: Number(payload.unread_count), unread_count: Number(payload.unread_count) } : {}),
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
              return merged;
          }));
      };

      const handleConversationDeleted = (payload: any) => {
          const convoId = payload?.conversationId || payload?.conversation_id;
          if (!convoId) return;
          traceClient('socket.conversation_deleted', { conversationId: convoId });
          setConversations(prev => prev.filter(conversation => conversation.id !== convoId));
          if (activeConvoIdRef.current === convoId) {
              setActiveConvoId(null);
              navigate('/messages');
          }
      };

      socket.on('messages:new', handleIncoming);
      socket.on('messages:sent', handleIncoming);
      socket.on('messages:read', handleRead);
      socket.on('messages:typing', handleTyping);
      socket.on('presence:update', handlePresence);
      socket.on('messages:updated', handleMessageUpdated);
      socket.on('messages:conversation_updated', handleConversationUpdated);
      socket.on('messages:conversation_deleted', handleConversationDeleted);
      return () => {
          socket.off('messages:new', handleIncoming);
          socket.off('messages:sent', handleIncoming);
          socket.off('messages:read', handleRead);
          socket.off('messages:typing', handleTyping);
          socket.off('presence:update', handlePresence);
          socket.off('messages:updated', handleMessageUpdated);
          socket.off('messages:conversation_updated', handleConversationUpdated);
          socket.off('messages:conversation_deleted', handleConversationDeleted);
      };
  }, [socket, user, refreshMessages, navigate]);
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
              className={`mb-2 w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] ${
                  message.senderId === user?.id
                      ? 'border-blue-300/60 bg-blue-500/20 text-blue-50'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
          >
              <div className="font-semibold">{senderName}</div>
              <div className={`truncate ${unavailable ? 'italic' : ''}`}>{unavailable ? 'Message unavailable' : snippet}</div>
          </button>
      );
  };
  // Typing indicator can be wired to real-time events later.

  const handleConversationClick = (id: string) => {
      navigate(`/messages/${id}`);
  };

  const handleBackToInbox = () => {
      setActiveConvoId(null);
      setExpandedMessageId(null);
      setReactionPanelMessageId(null);
      setShowConversationMenu(false);
      navigate('/messages', { replace: true });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = messageInput.trim();
      if ((!trimmed && pendingAttachments.length === 0) || !activeConvoId || !user) return;
      traceClient('ui.send_message.request', {
          conversationId: activeConvoId,
          textLength: trimmed.length,
          attachmentsCount: pendingAttachments.length,
          replyToMessageId: replyToMessage?.id || null
      });

      try {
          const attachmentIds = pendingAttachments.map(file => file.id).filter(Boolean);
          const newMessage = await MessagingService.sendMessage(
              activeConvoId, 
              user.id, 
              trimmed, 
              user.role,
              attachmentIds,
              replyToMessage?.id || null
          );

          emitTypingState(false);
          applyConversationMessageChanges(activeConvoId, (messages) => [...messages, newMessage]);
          setMessageInput('');
          setPendingAttachments([]);
          setReplyToMessage(null);
          resetTypingTimers();
          refreshMessages(); 
          traceClient('ui.send_message.success', {
              conversationId: activeConvoId,
              messageId: newMessage?.id || null
          });
      } catch (error) {
          console.error("Failed to send message", error);
          showNotification(
              'error',
              'Message',
              (error as any)?.response?.data?.error || (error as any)?.message || 'Failed to send message'
          );
          traceClient('ui.send_message.error', {
              conversationId: activeConvoId,
              error: String((error as any)?.message || error)
          });
      }
  };

  const handleVoiceRecorded = async (blob: Blob, durationMs: number) => {
      if (!activeConvoId || !user) return;
      if (!voiceRuntimeConfig.enabledVoiceNotes || voiceRuntimeConfig.blockedForCurrentUser) {
          showNotification('error', 'Voice notes', 'Voice notes are disabled for this account.');
          return;
      }
      setVoiceNoteBusy(true);
      try {
          const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
              type: blob.type || 'audio/webm'
          });
          const uploaded = await FileService.uploadFile(file, 'document', {
              role: user.role,
              userId: user.id,
              visibility: 'private'
          });

          const message = await MessagingService.sendVoiceNote(activeConvoId, {
              fileId: String(uploaded.id || uploaded.fileId || '').trim(),
              durationMs: Math.max(1, Math.trunc(durationMs))
          });

          applyConversationMessageChanges(activeConvoId, (messages) => [...messages, message]);
          refreshMessages();
      } catch (error: any) {
          const backendError =
              error?.response?.data?.error ||
              error?.response?.data?.message ||
              error?.message ||
              'Failed to send voice note.';
          showNotification('error', 'Voice notes', String(backendError));
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
                  messages: conversation.messages.map(message => {
                      if (message.id !== messageId) return message;
                      const reactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
                      const existingReaction = reactions.find(
                          (reaction) =>
                              String(reaction.userId || reaction.user_id) === String(user.id)
                      );
                      const withoutMine = reactions.filter(
                          (reaction) =>
                              String(reaction.userId || reaction.user_id) !== String(user.id)
                      );
                      if (existingReaction?.emoji === emoji) {
                          return {
                              ...message,
                              reactions: withoutMine
                          };
                      }
                      return {
                          ...message,
                          reactions: [
                              ...withoutMine,
                              {
                                  user_id: user.id,
                                  userId: user.id,
                                  emoji,
                                  timestamp: new Date().toISOString()
                              }
                          ]
                      };
                  })
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
              setConversations(prev =>
                  prev.map(conversation => {
                      if (conversation.id !== activeConvoId) return conversation;
                      return {
                          ...conversation,
                          messages: conversation.messages.map(message => {
                              if (message.id !== updated.messageId) return message;
                              return {
                                  ...message,
                                  reactions: Array.isArray(updated.reactions) ? updated.reactions : message.reactions,
                                  reactionSummary: updated.reactionSummary || message.reactionSummary
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

  const handleConversationAction = async (
      action: 'move_other' | 'label_jobs' | 'mark_unread' | 'toggle_star' | 'toggle_mute' | 'archive' | 'report_block' | 'delete'
  ) => {
      if (!activeConvoId || !activeConvo || actionBusy) return;
      traceClient('ui.conversation_action.request', { conversationId: activeConvoId, action });
      setActionBusy(true);
      try {
          if (action === 'move_other') {
              await MessagingService.updateConversationPreferences(activeConvoId, { label: 'other' });
              updateConversationStateLocally(activeConvoId, { label: 'other' });
          } else if (action === 'label_jobs') {
              await MessagingService.updateConversationPreferences(activeConvoId, { label: 'jobs' });
              updateConversationStateLocally(activeConvoId, { label: 'jobs' });
          } else if (action === 'mark_unread') {
              await MessagingService.markConversationUnread(activeConvoId);
              updateConversationStateLocally(activeConvoId, { unreadCount: 1, unread_count: 1 });
              showNotification('success', 'Messages', 'Conversation marked as unread.');
          } else if (action === 'toggle_star') {
              const next = !activeConversationState.isStarred;
              await MessagingService.updateConversationPreferences(activeConvoId, { isStarred: next });
              updateConversationStateLocally(activeConvoId, { isStarred: next, is_starred: next });
          } else if (action === 'toggle_mute') {
              const next = !activeConversationState.isMuted;
              await MessagingService.updateConversationPreferences(activeConvoId, { isMuted: next });
              updateConversationStateLocally(activeConvoId, { isMuted: next, is_muted: next });
          } else if (action === 'archive') {
              await MessagingService.updateConversationPreferences(activeConvoId, { isArchived: true });
              updateConversationStateLocally(activeConvoId, { isArchived: true, is_archived: true });
              showNotification('success', 'Messages', 'Conversation archived.');
          } else if (action === 'report_block') {
              await MessagingService.reportBlockConversation(activeConvoId, { block: true });
              showNotification('success', 'Messages', 'Conversation reported and blocked.');
          } else if (action === 'delete') {
              const shouldDelete = window.confirm('Delete this conversation from your inbox?');
              if (!shouldDelete) return;
              await MessagingService.deleteConversation(activeConvoId);
              setConversations((prev) => prev.filter((conversation) => conversation.id !== activeConvoId));
              setActiveConvoId(null);
              navigate('/messages');
              showNotification('success', 'Messages', 'Conversation deleted.');
          }
          traceClient('ui.conversation_action.success', { conversationId: activeConvoId, action });
      } catch (error: any) {
          const message = error?.response?.data?.error || error?.message || 'Action failed.';
          showNotification('error', 'Messages', message);
          traceClient('ui.conversation_action.error', {
              conversationId: activeConvoId,
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
    <VoiceCallProvider
        socket={socket}
        userId={user?.id}
        conversationId={activeConvoId || undefined}
        participantUsers={voiceCallCandidateUsers}
        callTargets={activeConversationVoiceTargets}
    >
    <div className="mx-auto h-[calc(100dvh-64px)] max-w-6xl px-2 py-3 sm:px-4 sm:py-6 md:h-[calc(100vh-64px)]">
        <div className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
        <div className="flex h-full">
            {/* Sidebar */}
            <div className={`w-full md:w-1/3 min-w-0 border-r border-gray-200 flex flex-col ${activeConvo ? 'hidden md:flex' : 'flex'}`}>
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
                        {user?.role === UserRole.ADMIN && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded font-mono">ADMIN VIEW</span>}
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
                    {visibleConversations.length === 0 ? (
                        <li className="p-4 text-center text-gray-500 text-sm">No conversations yet.</li>
                    ) : (
                        <>
                        {conversationWindow.top > 0 ? (
                            <li aria-hidden className="pointer-events-none border-b-0 p-0" style={{ height: conversationWindow.top }} />
                        ) : null}
                        {virtualConversations.map((convo) => {
                            const participant = convo.participants.find(p => p.id !== user?.id) || convo.participants[0];
                            const participantRole = resolveParticipantRole(participant);
                            const participantIsPro = isParticipantPro(participant);
                            const convoStarred = Boolean(convo.isStarred ?? convo.is_starred);
                            return (
                                <li 
                                    key={convo.id} 
                                    onClick={() => handleConversationClick(convo.id)}
                                    className={`w-full overflow-hidden p-4 border-b border-gray-100 cursor-pointer transition-colors ${
                                        activeConvoId === convo.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex w-full min-w-0 items-center">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    navigate(resolveParticipantProfileUrl(participant));
                                                }}
                                                className="mr-3 rounded-full"
                                            >
                                                <img
                                                    src={participant?.avatar || 'https://ui-avatars.com/api/?name=User'}
                                                    className="w-10 h-10 rounded-full border border-gray-200 object-cover"
                                                    alt={participant?.name || 'Profile'}
                                                />
                                            </button>
                                            {participant?.isOnline && (
                                                <span className="absolute bottom-0 right-3 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            navigate(resolveParticipantProfileUrl(participant));
                                                        }}
                                                        className="min-w-0 flex-1 truncate text-left text-sm font-bold text-gray-900 hover:text-blue-600"
                                                    >
                                                        {participant?.name}
                                                    </button>
                                                    {participantRole && (
                                                        <ProBadge role={participantRole} isPro={participantIsPro} />
                                                    )}
                                                    {participant?.gender && (
                                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                                                            {participant.gender}
                                                        </span>
                                                    )}
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
                                            <p className={`min-w-0 text-xs truncate ${convo.unreadCount > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                                {convo.lastMessage || <span className="italic text-gray-400">No messages</span>}
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
            
            {/* Chat Area */}
            <div className={`flex-1 min-w-0 flex flex-col bg-gradient-to-b from-gray-50 to-gray-100 ${!activeConvo ? 'hidden md:flex' : 'flex'}`}>
                {activeConvo ? (
                    <>
                        {/* Chat Header */}
                        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:px-4">
                            <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center">
                                <button onClick={handleBackToInbox} className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 md:hidden">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate(resolveParticipantProfileUrl(otherParticipant))}
                                    className="mr-3 rounded-full"
                                >
                                    <img
                                        src={otherParticipant?.avatar || 'https://ui-avatars.com/api/?name=User'}
                                        className="h-9 w-9 rounded-full border border-gray-200 object-cover md:h-10 md:w-10"
                                        alt={otherParticipant?.name || 'Profile'}
                                    />
                                </button>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => navigate(resolveParticipantProfileUrl(otherParticipant))}
                                            className="max-w-[9.5rem] truncate text-left text-sm font-bold text-gray-900 hover:text-blue-600 sm:max-w-xs"
                                        >
                                            {otherParticipant?.name || 'Conversation'}
                                        </button>
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
                                        {otherParticipantRole && (
                                            <ProBadge role={otherParticipantRole} isPro={otherParticipantIsPro} />
                                        )}
                                        {otherParticipant?.gender && (
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                                                {otherParticipant.gender}
                                            </span>
                                        )}
                                    </div>
                                    {otherOnline ? (
                                        <span className="text-xs text-green-500 flex items-center">Online</span>
                                    ) : otherLastSeen ? (
                                        <span className="text-xs text-gray-500 flex items-center">
                                            Last seen {new Date(otherLastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-400 flex items-center">Offline</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <VoiceCallControls
                                    disabled={!activeConvoId || voiceCallsBlocked}
                                    canConference={voiceRuntimeConfig.enabledConferenceCalls && voiceCallCandidateUsers.length > 1}
                                    meId={user?.id}
                                    onError={(message) => showNotification('error', 'Voice Call', message)}
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
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowConversationMenu((prev) => !prev)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    {showConversationMenu && (
                                        <div className="absolute right-0 top-11 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                                            {messagingControls.enableMoveToOther !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('move_other')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Move to Other
                                                </button>
                                            )}
                                            {messagingControls.enableLabelAsJobs !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('label_jobs')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Label as Jobs
                                                </button>
                                            )}
                                            {messagingControls.enableMarkUnread !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('mark_unread')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Mark as unread
                                                </button>
                                            )}
                                            {messagingControls.enableStar !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('toggle_star')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    {activeConversationState.isStarred ? 'Remove Star' : 'Star'}
                                                </button>
                                            )}
                                            {messagingControls.enableMute !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('toggle_mute')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    {activeConversationState.isMuted ? 'Unmute' : 'Mute'}
                                                </button>
                                            )}
                                            {messagingControls.enableArchive !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('archive')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Archive
                                                </button>
                                            )}
                                            {messagingControls.enableReportBlock !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('report_block')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Report / Block
                                                </button>
                                            )}
                                            {messagingControls.enableDeleteConversation !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleConversationAction('delete')}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                                >
                                                    Delete conversation
                                                </button>
                                            )}
                                            {messagingControls.enableManageMessageSettings !== false && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowConversationMenu(false);
                                                        setShowMessageSettings(true);
                                                    }}
                                                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                                                >
                                                    Manage settings
                                                </button>
                                            )}
                                            {actionBusy && (
                                                <div className="px-3 py-2 text-xs text-gray-500">Updating...</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            </div>
                        </div>

                        {/* Messages List */}
                        <div
                            className="flex-1 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto p-3 md:space-y-4 md:p-6"
                            ref={messagesContainerRef}
                            onScroll={handleMessagesScroll}
                        >
                            {activeConvo.messages.map(msg => {
                                const attachmentList = (Array.isArray(msg.attachments) ? msg.attachments : [])
                                    .map((attachment) => normalizeAttachmentForDisplay(attachment))
                                    .filter(Boolean) as AttachmentDisplay[];
                                const isOwner = msg.senderId === user?.id;
                                const isAdmin = user?.role === UserRole.ADMIN;
                                const canEditDelete = isOwner || isAdmin;
                                const isDeleted = Boolean(msg.isDeleted ?? msg.is_deleted);
                                const isEditing = editingMessageId === msg.id;
                                const showMessageControls = expandedMessageId === msg.id;
                                const showReactionPanel = reactionPanelMessageId === msg.id && !isDeleted;
                                const voiceCallRecord = extractVoiceCallRecord(msg);
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
                                return (
                                <div id={`message-${msg.id}`} key={msg.id} className={`flex min-w-0 ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
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
                                                {msg.text || ''}
                                            </p>
                                        )}
                                        {(String(msg.messageType || msg.message_type || '').toLowerCase() === 'voice_note' ||
                                            msg.voiceNote ||
                                            msg.voice_note) && (
                                            <div className={`mt-1 text-[11px] ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-500'}`}>
                                                Voice note
                                                {Number(msg?.voiceNote?.durationMs || msg?.voice_note?.durationMs || 0) > 0
                                                    ? ` · ${Math.round(Number(msg?.voiceNote?.durationMs || msg?.voice_note?.durationMs || 0) / 1000)}s`
                                                    : ''}
                                            </div>
                                        )}
                                        {attachmentList.length > 0 && (
                                            <div className="mt-2 space-y-2">
                                                {attachmentList.map((attachment) => {
                                                    const resolvedAttachmentUrl = getResolvedAttachmentUrl(attachment);
                                                    const previewLoading = isAttachmentPreviewLoading(attachment);
                                                    return (
                                                        <div key={attachment.id} className={`rounded-lg border p-2 text-xs ${
                                                            msg.senderId === user?.id
                                                                ? 'border-white/30 bg-white/15 text-white'
                                                                : 'border-gray-200 bg-white/80 text-gray-700'
                                                        }`}>
                                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <div className="truncate font-semibold">{attachment.name}</div>
                                                                    {formatBytes(attachment.size) ? (
                                                                        <div className={`text-[10px] ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-500'}`}>
                                                                            {formatBytes(attachment.size)}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        void downloadAttachment(attachment as AttachmentDisplay);
                                                                    }}
                                                                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                                                                        msg.senderId === user?.id
                                                                            ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                                                                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                                                    }`}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                    <span>Download</span>
                                                                </button>
                                                            </div>
                                                            {attachment.type === 'image' ? (
                                                                resolvedAttachmentUrl ? (
                                                                    <a href={resolvedAttachmentUrl} target="_blank" rel="noreferrer" className="block">
                                                                        <img src={resolvedAttachmentUrl} alt={attachment.name} className="w-full max-h-56 rounded-md object-cover" loading="lazy" />
                                                                    </a>
                                                                ) : (
                                                                    <div className="flex h-40 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                                                                        {previewLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Image preview unavailable'}
                                                                    </div>
                                                                )
                                                            ) : attachment.type === 'video' ? (
                                                                resolvedAttachmentUrl ? (
                                                                    <video controls preload="auto" playsInline src={resolvedAttachmentUrl} className="w-full max-h-56 rounded-md" />
                                                                ) : (
                                                                    <div className="flex h-40 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                                                                        {previewLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Video preview unavailable'}
                                                                    </div>
                                                                )
                                                            ) : attachment.type === 'audio' ? (
                                                                resolvedAttachmentUrl ? (
                                                                    <audio controls preload="auto" src={resolvedAttachmentUrl} className="w-full" />
                                                                ) : (
                                                                    <div className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-gray-500">
                                                                        {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                                                        <span>Preparing audio...</span>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <a
                                                                    href={attachment.url || '#'}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className={`flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-3 py-2 hover:underline ${
                                                                        msg.senderId === user?.id
                                                                            ? 'border-white/20 text-blue-100'
                                                                            : 'border-gray-200 text-blue-600'
                                                                    }`}
                                                                >
                                                                    <span className="font-semibold">Open</span>
                                                                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <div className={`text-[10px] mt-1 text-right flex justify-end items-center gap-1 ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            {!isDeleted && (msg.editedAt || msg.edited_at) && (
                                                <span className={`${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>(edited)</span>
                                            )}
                                            {isDeleted && (
                                                <span className={`${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>(deleted)</span>
                                            )}
                                            {msg.senderId === user?.id && (
                                                msg.isRead ? <div className="flex"><Check className="w-3 h-3"/><Check className="w-3 h-3 -ml-1"/></div> : <Check className="w-3 h-3" />
                                            )}
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
                            
                            {/* Typing Indicator */}
                            {typingUser && (
                                <div className="flex justify-start animate-fade-in">
                                    <div className="bg-gray-100 rounded-2xl rounded-bl-none px-4 py-2 text-xs text-gray-500 italic flex items-center">
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1 delay-100"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                        <span className="ml-2">{typingUser} is typing...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:p-4">
                            {replyToMessage && (
                                <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold">
                                            Replying to {replyToMessage.senderId === user?.id ? 'yourself' : (otherParticipant?.name || 'message')}
                                        </div>
                                        <button type="button" onClick={() => setReplyToMessage(null)} className="text-gray-400 hover:text-gray-700">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="truncate">{replyToMessage.text || 'Attachment'}</div>
                                </div>
                            )}
                            {/* AI Suggestion Bar */}
                            <div className="mb-2 flex justify-end">
                                <button 
                                    onClick={handleAiSuggest}
                                    disabled={isGettingAiSuggestion}
                                    className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50/70 px-3 py-1.5 text-xs font-medium text-purple-700 shadow-sm transition-colors hover:bg-purple-100 disabled:opacity-50"
                                >
                                    {isGettingAiSuggestion ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                    {isGettingAiSuggestion ? 'Thinking...' : 'Suggest Reply'}
                                </button>
                            </div>

                            {pendingAttachments.length > 0 && (
                                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                                    {pendingAttachments.map(file => {
                                        const preview = normalizeAttachmentForDisplay(file);
                                        const previewUrl = preview ? getResolvedAttachmentUrl(preview) : '';
                                        const previewLoading = preview ? isAttachmentPreviewLoading(preview) : false;
                                        return (
                                        <div key={file.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 shadow-sm">
                                            {preview && preview.type === 'image' && previewUrl ? (
                                                <img src={previewUrl} alt={preview.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                                            ) : preview && preview.type === 'video' && previewUrl ? (
                                                <video src={previewUrl} className="h-12 w-12 shrink-0 rounded-xl object-cover" muted playsInline preload="metadata" />
                                            ) : (
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-gray-400">
                                                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-semibold">{file.name || 'Attachment'}</div>
                                                <div className="text-[10px] text-gray-500">{formatBytes(file.size) || 'Ready to send'}</div>
                                            </div>
                                            <button type="button" onClick={() => removeAttachment(file.id)} className="text-gray-400 hover:text-gray-600">
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

                            <form onSubmit={handleSendMessage} className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm">
                                <div className="flex min-w-0 items-end gap-2">
                                    <textarea
                                        className="min-h-[46px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                                        placeholder="Write a message. Press Enter to send, Shift+Enter for a new line."
                                        value={messageInput}
                                        onChange={(event) => handleMessageInputChange(event.target.value)}
                                        onKeyDown={handleComposerKeyDown}
                                        rows={isMobileViewport ? 2 : 3}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!activeConvoId || (!messageInput.trim() && pendingAttachments.length === 0) || Boolean(attachmentUploadState)}
                                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
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
                                        <button
                                            type="button"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                                            onClick={() => uploadInputRef.current?.click()}
                                            title="Attach files from device"
                                        >
                                            <Paperclip className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                                            onClick={() => mediaInputRef.current?.click()}
                                            title="Choose photo or video from device"
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                                            onClick={() => cameraInputRef.current?.click()}
                                            title="Capture photo or video"
                                        >
                                            <Camera className="w-4 h-4" />
                                        </button>
                                        <VoiceRecorder
                                            disabled={
                                                voiceNoteBusy ||
                                                !activeConvoId ||
                                                !voiceRuntimeConfig.enabledVoiceNotes ||
                                                voiceRuntimeConfig.blockedForCurrentUser ||
                                                Boolean(attachmentUploadState)
                                            }
                                            maxDurationSeconds={voiceRuntimeConfig.maxVoiceNoteDurationSeconds}
                                            onRecorded={handleVoiceRecorded}
                                            onError={(message) => showNotification('error', 'Voice notes', message)}
                                            className="h-10 w-10 justify-center rounded-xl hover:bg-gray-100"
                                        />
                                    </div>

                                    <div className="text-[11px] text-gray-500">
                                        {pendingAttachments.length > 0
                                            ? `${pendingAttachments.length} attachment${pendingAttachments.length === 1 ? '' : 's'} queued`
                                            : 'Private chat media stays scoped to this conversation.'}
                                    </div>
                                </div>
                            </form>
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
    {showMessageSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Manage message settings</h3>
                    <button type="button" onClick={() => setShowMessageSettings(false)} className="text-gray-500 hover:text-gray-700">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="mb-4 text-xs text-gray-500">
                    User section: <span className="font-semibold">Messages {'>'} Conversation menu {'>'} Manage settings</span>
                </p>
                <div className="space-y-5">
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
                        <p className="mt-1 text-xs text-gray-500">
                            Allow others to send you InMail.
                        </p>
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
            </div>
        </div>
    )}
    </VoiceCallProvider>
  );
};

export default Messages;





