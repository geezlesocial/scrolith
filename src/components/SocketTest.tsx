import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

const SocketTest = () => {
  const { isConnected, socket, joinRoom, sendMessage, sendTypingIndicator } = useSocket() as any;
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState('test-room');

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data: any) => {
      setMessages(prev => [...prev, `Received: ${JSON.stringify(data)}`]);
    };

    const handleNotification = (data: any) => {
      setMessages(prev => [...prev, `Notification: ${JSON.stringify(data)}`]);
    };

    socket.on('receive-message', handleMessage);
    socket.on('order-notification', handleNotification);
    socket.on('new-message-notification', handleNotification);
    socket.on('user-typing', (data) => {
      setMessages(prev => [...prev, `User typing: ${JSON.stringify(data)}`]);
    });

    return () => {
      socket.off('receive-message', handleMessage);
      socket.off('order-notification', handleNotification);
      socket.off('new-message-notification', handleNotification);
      socket.off('user-typing');
    };
  }, [socket]);

  const handleJoinRoom = () => {
    joinRoom(roomId);
    setMessages(prev => [...prev, `Joined room: ${roomId}`]);
  };

  const handleSendMessage = () => {
    if (!input.trim()) return;
    
    sendMessage(roomId, { text: input, type: 'text' }, 'test-receiver');
    setMessages(prev => [...prev, `Sent: ${input}`]);
    setInput('');
  };

  const handleTypingStart = () => {
    sendTypingIndicator(roomId, true);
  };

  const handleTypingStop = () => {
    sendTypingIndicator(roomId, false);
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h2 className="text-xl font-bold mb-4">Socket.io Test</h2>
      
      <div className="mb-4">
        <div className={`inline-block px-3 py-1 rounded-full ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          Status: {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        {socket && (
          <div className="mt-2 text-sm text-gray-600">
            Socket ID: {socket.id}
          </div>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Room ID"
          className="border px-3 py-2 rounded mr-2"
        />
        <button
          onClick={handleJoinRoom}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Join Room
        </button>
      </div>

      <div className="mb-4">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={handleTypingStart}
            onBlur={handleTypingStop}
            placeholder="Type a message..."
            className="flex-1 border px-3 py-2 rounded"
          />
          <button
            onClick={handleSendMessage}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Send
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTypingStart}
            className="bg-yellow-500 text-white px-3 py-1 rounded text-sm"
          >
            Start Typing
          </button>
          <button
            onClick={handleTypingStop}
            className="bg-gray-500 text-white px-3 py-1 rounded text-sm"
          >
            Stop Typing
          </button>
        </div>
      </div>

      <div className="border rounded p-3 bg-white max-h-60 overflow-y-auto">
        <h3 className="font-semibold mb-2">Messages:</h3>
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages yet</p>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="text-sm mb-1 p-1 border-b last:border-b-0">
              {msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SocketTest;