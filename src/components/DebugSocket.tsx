// C:\Projects\Scrolith\src\components\DebugSocket.tsx
import React, { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

const DebugSocket: React.FC = () => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    console.log('🔍 DebugSocket - Props:', { 
      hasSocket: !!socket, 
      isConnected,
      socketId: socket?.id,
      connected: socket?.connected 
    });
  }, [socket, isConnected]);

  const sendPing = () => {
    if (socket?.connected) {
      console.log('📤 Sending ping...');
      socket.emit('ping', { 
        message: 'Debug ping', 
        time: Date.now() 
      });
    }
  };

  const checkConnection = () => {
    console.log('🔗 Connection check:', {
      connected: socket?.connected,
      id: socket?.id,
      transport: (socket as any)?.io?.engine?.transport?.name,
      url: (socket as any)?.io?.uri
    });
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.85)',
      color: 'white',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px',
      fontFamily: 'monospace',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isConnected ? '#10b981' : '#ef4444',
          marginRight: '10px',
          animation: isConnected ? 'pulse 2s infinite' : 'none'
        }} />
        <strong>Socket.io Debug</strong>
      </div>
      
      <div style={{ marginBottom: '10px', lineHeight: '1.4' }}>
        <div>Status: <span style={{ 
          color: isConnected ? '#10b981' : '#ef4444',
          fontWeight: 'bold'
        }}>
          {isConnected ? '✅ Connected' : '❌ Disconnected'}
        </span></div>
        <div>ID: <span style={{ color: '#93c5fd' }}>{socket?.id || 'N/A'}</span></div>
        <div>Transport: <span style={{ color: '#fbbf24' }}>{socket?.io?.engine?.transport?.name || 'N/A'}</span></div>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '10px',
        flexWrap: 'wrap' 
      }}>
        <button
          onClick={sendPing}
          style={{
            padding: '6px 12px',
            background: isConnected ? '#3b82f6' : '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            fontSize: '12px',
            flex: 1,
            minWidth: '60px'
          }}
          disabled={!isConnected}
        >
          Ping
        </button>
        
        <button
          onClick={checkConnection}
          style={{
            padding: '6px 12px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            flex: 1,
            minWidth: '60px'
          }}
        >
          Check
        </button>
      </div>

      <div style={{ 
        fontSize: '11px', 
        color: '#d1d5db', 
        borderTop: '1px solid #4b5563', 
        paddingTop: '10px',
        lineHeight: '1.4'
      }}>
        <div>URL: <span style={{ wordBreak: 'break-all' }}>{(socket as any)?.io?.uri || 'N/A'}</span></div>
        <div style={{ marginTop: '4px', fontStyle: 'italic' }}>Open console for detailed logs</div>
      </div>
    </div>
  );
};

export default DebugSocket;
