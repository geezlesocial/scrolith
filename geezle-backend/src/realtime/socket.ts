import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env';

export function initSocket(httpServer: any) {
  const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth && (socket.handshake.auth as any).token) || socket.handshake.query?.token;
      if (!token) return next(new Error('Unauthorized'));
      const user = jwt.verify(String(token), env.JWT_SECRET);
      (socket as any).user = user;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    if (user && (user as any).id) {
      socket.join(`user:${(user as any).id}`);
      socket.join(`role:${(user as any).role}`);
    }
  });

  return io;
}

export function emitToUser(io: Server, userId: string, event: string, payload: any) {
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToRole(io: Server, role: string, event: string, payload: any) {
  io.to(`role:${role}`).emit(event, payload);
}

export default initSocket;
