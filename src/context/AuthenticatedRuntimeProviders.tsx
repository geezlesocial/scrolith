import React from 'react';
import { MessageProvider } from './MessageContext';
import { RealtimeProvider } from '../dashboard/shared/RealtimeProvider';

/**
 * Authenticated-only messaging/realtime providers.
 * SocketProvider lives higher in App (above NotificationProvider) so every
 * useSocket() consumer shares one connection context.
 */
const AuthenticatedRuntimeProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RealtimeProvider>
    <MessageProvider>{children}</MessageProvider>
  </RealtimeProvider>
);

export default AuthenticatedRuntimeProviders;
