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

const emitToUser = (userId: string, event: string, payload: any) => {
  try {
    const io = getCommunityIo();
    if (!io) return;
    // join conventions: direct user room (user id) and wallet room
    try { io.to(userId).emit(event, payload); } catch (e) {}
    try { io.to(`wallet:${userId}`).emit(event, payload); } catch (e) {}
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

export default {
  emitToUser,
  emitToWallet,
  emitToAd,
  emitToPost
};
