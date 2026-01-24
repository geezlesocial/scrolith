
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
// Guarded require for PrismaClient so local dev runs without installing Prisma.
let PrismaClient: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  PrismaClient = class { constructor(){} };
}
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import cmsRoutes from './routes/cms';
import financeRoutes from './routes/finance';
import messagesRoutes from './routes/messages';
import marketIntelligenceRoutes from './routes/marketIntelligence';
import freelancerRoutes from './routes/freelancer';

// Dashboard-scoped route modules
import ordersRoutes from './routes/orders';
import walletRoutes from './routes/wallet';
import withdrawalRoutes from './routes/withdrawal';
import kycRoutes from './routes/kyc';
import jobsRoutes from './routes/jobs';
import proposalsRoutes from './routes/proposals';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// Real-Time Socket Layer
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Lock this down in production
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Attach IO to request for controllers
app.use((req: express.Request & { io?: Server }, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/admin/market-intelligence', marketIntelligenceRoutes);
app.use('/api/freelancer', freelancerRoutes);

// Mount dashboard-scoped endpoints (keep admin last to avoid collisions)
app.use('/api/orders', ordersRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/proposals', proposalsRoutes);

// Socket Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', (room) => {
    socket.join(room); // e.g., 'admin_updates', 'user_123'
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
