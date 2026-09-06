import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMessages } from '../context/MessageContext';
import { useUser } from '../context/UserContext';
import {
  buildNativeMessagesEnvelope,
  getNativeCapabilities,
  getScrolithNative,
  isSafeInternalPath,
  postNativeEvent
} from './nativeBridge';

type NativeCommandDetail = {
  command?: string;
  requestId?: string;
  sessionBinding?: string;
  conversationId?: string;
  actionPath?: string;
};

const safeId = (value: unknown) => {
  const id = String(value || '').trim();
  return id.length > 0 && id.length <= 128 ? id : '';
};

/**
 * Projects the existing MessageContext into the Phase 4 native inbox. It has
 * no UI and never owns a socket, API client, auth token, or read database.
 */
export default function NativeMessagesBridge() {
  const { user } = useUser();
  const {
    conversations,
    refreshMessages,
    markConversationRead
  } = useMessages();
  const location = useLocation();
  const navigate = useNavigate();
  const bridge = getScrolithNative();
  const enabled = getNativeCapabilities(bridge).nativeMessagesList === true;
  const revisionRef = useRef(0);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const emitSnapshot = useCallback((requestId?: string) => {
    if (!enabled) return;
    revisionRef.current += 1;
    postNativeEvent(
      'messages:list_state',
      buildNativeMessagesEnvelope(conversationsRef.current, user?.id, requestId, revisionRef.current),
      bridge
    );
  }, [bridge, enabled, user?.id]);

  const emitResult = useCallback((requestId: string | undefined, success: boolean, error?: string) => {
    if (!enabled) return;
    postNativeEvent('messages:action_result', {
      bridgeVersion: '2',
      requestId: String(requestId || '').slice(0, 80),
      success,
      ...(error ? { error: String(error).slice(0, 160) } : {})
    }, bridge);
  }, [bridge, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onCommand = (event: Event) => {
      const detail = ((event as CustomEvent<NativeCommandDetail>).detail || {}) as NativeCommandDetail;
      const command = String(detail.command || '').trim();
      if (!command.startsWith('messages.')) return;
      const requestId = String(detail.requestId || '').slice(0, 80);
      const conversationId = safeId(detail.conversationId);

      if (command === 'messages.request_snapshot') {
        emitSnapshot(requestId);
        return;
      }
      if (command === 'messages.refresh' || command === 'messages.retry') {
        void refreshMessages({ force: true })
          .then(() => {
            emitResult(requestId, true);
            emitSnapshot(requestId);
          })
          .catch((error) => emitResult(requestId, false, error?.message || 'Unable to refresh messages.'));
        return;
      }
      if (command === 'messages.mark_read') {
        if (!conversationId || !conversationsRef.current.some((entry) => String(entry?.id || '') === conversationId)) {
          emitResult(requestId, false, 'Conversation is unavailable.');
          return;
        }
        void markConversationRead(conversationId)
          .then(() => {
            emitResult(requestId, true);
            emitSnapshot(requestId);
          })
          .catch((error) => emitResult(requestId, false, error?.message || 'Unable to mark conversation read.'));
        return;
      }
      if (command === 'messages.open_conversation') {
        const path = String(detail.actionPath || '').trim();
        const exists = conversationId && conversationsRef.current.some((entry) => String(entry?.id || '') === conversationId);
        if (!exists || !isSafeInternalPath(path) || path !== `/messages/${encodeURIComponent(conversationId)}`) {
          emitResult(requestId, false, 'Conversation link is invalid.');
          return;
        }
        emitResult(requestId, true);
        navigate(path);
      }
    };

    window.addEventListener('scrolith:native-command', onCommand as EventListener);
    postNativeEvent('messages:ready', { bridgeVersion: '2' }, bridge);
    emitSnapshot();
    return () => window.removeEventListener('scrolith:native-command', onCommand as EventListener);
  }, [bridge, emitResult, emitSnapshot, enabled, markConversationRead, navigate, refreshMessages]);

  useEffect(() => {
    if (!enabled) return;
    emitSnapshot();
  }, [conversations, emitSnapshot, enabled]);

  useEffect(() => {
    if (!enabled || location.pathname !== '/messages') return;
    const timer = window.setTimeout(() => bridge?.openNativeMessages?.(), 120);
    return () => window.clearTimeout(timer);
  }, [bridge, enabled, location.pathname]);

  return null;
}
