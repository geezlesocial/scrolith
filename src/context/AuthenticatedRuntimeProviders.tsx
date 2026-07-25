import React from 'react';
import { MessageProvider } from './MessageContext';
import { RealtimeProvider } from '../dashboard/shared/RealtimeProvider';
import GlobalVoiceCallShell from '../messages/GlobalVoiceCallShell';

/**
 * Authenticated-only messaging/realtime providers.
 * SocketProvider lives higher in App (above NotificationProvider) so every
 * useSocket() consumer shares one connection context.
 * GlobalVoiceCallShell keeps ring/accept UI mounted site-wide so calls are not
 * silently missed when the user is off /messages.
 */
const AuthenticatedRuntimeProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RealtimeProvider>
    <MessageProvider>
      <GlobalVoiceCallShell>{children}</GlobalVoiceCallShell>
    </MessageProvider>
  </RealtimeProvider>
);

export default AuthenticatedRuntimeProviders;
