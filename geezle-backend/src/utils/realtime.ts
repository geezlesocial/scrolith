// Utility wrapper for emitting real-time events to rooms/users/posts/ads
const getCommunityIo = () => {
  // prefer express app-level stored namespace
  try {
    const globalNs = (global as any).appCommunityIo || (global as any).appIo;
    return globalNs;
  } catch (e) {
    return (global as any).appCommunityIo || (global as any).appIo || null;
  }
};

const userRooms = (userId: string) => [
  String(userId || '').trim(),
  `wallet:${String(userId || '').trim()}`,
  `community:user:${String(userId || '').trim()}`,
  `user:${String(userId || '').trim()}`
].filter(Boolean);

const emitNotificationOncePerSocket = (io: any, userId: string, event: string, payload: any) => {
  const rooms = userRooms(userId);
  const fallback = () => {
    try { io.to(`community:user:${userId}`).emit(event, payload); } catch (e) {}
  };
  try {
    if (!io || typeof io.in !== 'function') return fallback();
    const selector = io.in(rooms);
    if (!selector || typeof selector.fetchSockets !== 'function') return fallback();
    void selector
      .fetchSockets()
      .then((sockets: any[]) => {
        const sent = new Set<string>();
        for (const socket of sockets || []) {
          const socketId = String(socket?.id || '');
          if (!socketId || sent.has(socketId)) continue;
          sent.add(socketId);
          try { socket.emit(event, payload); } catch (e) {}
        }
      })
      .catch(() => fallback());
  } catch (e) {
    fallback();
  }
};

const emitToUser = (userId: string, event: string, payload: any) => {
  try {
    const io = getCommunityIo();
    if (!io) return;
    if (event === 'notifications:new') {
      emitNotificationOncePerSocket(io, userId, event, payload);
      return;
    }
    // join conventions: direct user room (user id) and wallet room
    try { io.to(userId).emit(event, payload); } catch (e) {}
    try { io.to(`wallet:${userId}`).emit(event, payload); } catch (e) {}
    try { io.to(`community:user:${userId}`).emit(event, payload); } catch (e) {}
  } catch (e) {
    // swallow
  }
};

const emitToWallet = (userId: string, event: string, payload: any) => emitToUser(userId, event, payload);

const emitToAd = (adId: string, event: string, payload: any) => {
  try {
    const io = getCommunityIo();
    if (!io) return;
    try { io.to(`ad:${adId}`).emit(event, payload); } catch (e) {}
  } catch (e) {}
};

const emitToPost = (postId: string, event: string, payload: any) => {
  try {
    const io = getCommunityIo();
    if (!io) return;
    try { io.to(`post:${postId}`).emit(event, payload); } catch (e) {}
  } catch (e) {}
};

const emitToRoom = (room: string, event: string, payload: any) => {
  try {
    const io = getCommunityIo();
    if (!io) return;
    try { io.to(room).emit(event, payload); } catch (e) {}
  } catch (e) {}
};

export default {
  emitToUser,
  emitToWallet,
  emitToAd,
  emitToPost,
  emitToRoom
};
