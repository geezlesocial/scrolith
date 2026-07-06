import React from 'react';
import { SocketProvider } from './SocketContext';
import { MessageProvider } from './MessageContext';
import { RealtimeProvider } from '../dashboard/shared/RealtimeProvider';

const AuthenticatedRuntimeProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SocketProvider>
    <RealtimeProvider>
      <MessageProvider>{children}</MessageProvider>
    </RealtimeProvider>
  </SocketProvider>
);

export default AuthenticatedRuntimeProviders;
