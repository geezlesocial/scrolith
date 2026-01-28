import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import adminRoutes from './routes/admin';
import paymentRoutes from './routes/payment'; 
import semanticSearchRoutes from './routes/semanticSearchRoutes';
import governanceRoutes from './routes/governance';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Real-Time Socket Layer
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Attach IO to request for controllers
app.use((req, res, next) => {
  (req as any).io = io;
  next();
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/semantic-search', semanticSearchRoutes);
app.use('/api/governance', governanceRoutes);

// Socket Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', (room) => {
    socket.join(room); // e.g., 'admin_updates', 'user_123'
  });

  // Handle handshake messages from client to map roles -> rooms
  socket.on('handshake', (payload) => {
    try {
      const userId = payload?.userId;
      const role = (payload?.role || '').toString().toLowerCase();
      if (userId) {
        socket.join(`user_${userId}`);
      }
      if (role && role.includes('admin')) {
        socket.join('admins');
      }
    } catch (e) {
      // ignore
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 WebSockets active`);
});