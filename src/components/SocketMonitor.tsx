// C:\Projects\geezle\src\components\SocketMonitor.tsx
import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';

const SocketMonitor: React.FC = () => {
  const { socket, isConnected } = useSocket();
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 10)]);
  };

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => addLog('Connected');
    const handleDisconnect = () => addLog('Disconnected');
    const handleWelcome = (data: any) => addLog(`Welcome: ${JSON.stringify(data)}`);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('welcome', handleWelcome);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('welcome', handleWelcome);
    };
  }, [socket]);

  const sendTest = () => {
    if (socket?.connected) {
      socket.emit('ping', { test: 'ping from monitor', time: Date.now() });
      addLog('Sent ping');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      width: '300px',
      maxHeight: '400px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 9999,
      overflow: 'auto',
      fontFamily: 'monospace'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <strong>Socket.io Monitor</strong>
        <span style={{
          padding: '2px 6px',
          borderRadius: '4px',
          background: isConnected ? '#10b981' : '#ef4444',
          fontSize: '10px'
        }}>
          {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <div>ID: {socket?.id || 'N/A'}</div>
        <div>Transport: {socket?.io?.engine?.transport?.name || 'N/A'}</div>
      </div>

      <button 
        onClick={sendTest}
        style={{
          width: '100%',
          padding: '5px',
          marginBottom: '10px',
          background: isConnected ? '#3b82f6' : '#6b7280',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isConnected ? 'pointer' : 'not-allowed'
        }}
        disabled={!isConnected}
      >
        Send Ping Test
      </button>

      <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
        <strong>Event Log:</strong>
        <div style={{ maxHeight: '200px', overflow: 'auto', marginTop: '5px' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No events yet</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ 
                padding: '2px 0', 
                borderBottom: '1px solid #333',
                wordBreak: 'break-all'
              }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SocketMonitor;