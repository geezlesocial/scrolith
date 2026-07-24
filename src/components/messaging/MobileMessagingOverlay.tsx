import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import MessagingChatWindow from './MessagingChatWindow';
import { useMessages } from '../../context/MessageContext';
import { prefetchMessagesWorkspace } from '../../services/messagingSoftOpen';

type MobileMessagingOverlayProps = {
  conversationId: string;
  onClose: () => void;
};

/**
 * Full-screen soft conversation open for web-mobile + Capacitor Android.
 * Host shell (e.g. MobileHome feed) stays mounted — no platform hard reload.
 */
const MobileMessagingOverlay: React.FC<MobileMessagingOverlayProps> = ({
  conversationId,
  onClose
}) => {
  const { ensureThreadLoaded } = useMessages();

  useEffect(() => {
    const id = String(conversationId || '').trim();
    if (!id) return;
    prefetchMessagesWorkspace();
    void ensureThreadLoaded(id);
  }, [conversationId, ensureThreadLoaded]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  const id = String(conversationId || '').trim();
  if (!id) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[920] flex flex-col bg-white"
      role="presentation"
      data-testid="mobile-messaging-overlay"
    >
      <MessagingChatWindow
        conversationId={id}
        presentation="fullscreen"
        onClose={onClose}
        onMinimize={onClose}
        onRestore={() => undefined}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          borderRadius: 0,
          boxShadow: 'none'
        }}
      />
    </div>,
    document.body
  );
};

export default React.memo(MobileMessagingOverlay);
