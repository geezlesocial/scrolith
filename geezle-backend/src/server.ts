// C:\Projects\geezle-backend\src\server.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import validateEnv from './utils/validateEnv';

// Import routes
import cmsRoutes from './routes/cms';
import cmsAuthPagesRoutes from './routes/cms.auth-pages.routes';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user';
import profileRoutes from './routes/profile.routes';
import settingsRoutes from './routes/settings.routes';
import commerceRoutes from './routes/commerce';
import searchRoutes from './routes/search';
import aiRoutes from './routes/ai';
import gigRoutes from './routes/gigs';
import jobsRoutes from './routes/jobs.routes';
import freelancerRoutes from './routes/freelancer.routes';
import employerRoutes from './routes/employer.routes';
import categoriesRoutes from './routes/categories.routes';
import adminGigsJobsRoutes from './routes/admin/gigs-jobs.routes';
import walletRoutes from './routes/wallet.routes';
import escrowRoutes from './routes/escrow.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import communityRoutes from './routes/community';
import contractsRoutes from './routes/contracts.routes';
import messagesRoutes from './routes/messages.routes';
import filesRoutes from './routes/files.routes';
import favoritesRoutes from './routes/favorites.routes';
import ordersRoutes from './routes/orders.routes';
import proposalsRoutes from './routes/proposals.routes';
import kycRoutes from './routes/kyc.routes';
import supportRoutes from './routes/support.routes';
import gcoinRoutes from './routes/gcoin.routes';
import reviewsRoutes from './routes/reviews.routes';
import paymentRoutes from './routes/payment.routes';
import briefsRoutes from './routes/briefs.routes';
import notificationsRoutes from './routes/notifications.routes';
import { handleStripeWalletWebhook } from './controllers/walletFunding.controller';
import cron from 'node-cron';
import { reconcileAdPayments } from './scripts/reconcileAdPayments';


// Validate environment early and warn about missing values
validateEnv();

const app = express();
const server = http.createServer(app);

// IMPORTANT: Enhanced Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  serveClient: false,
  connectTimeout: 45000,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true, // For compatibility with older clients
  maxHttpBufferSize: 1e8,
  httpCompression: false,
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: false,
    sameSite: 'lax'
  }
});

// Create a community-specific namespace so frontend and backend can subscribe to community events
const communityNs = io.of('/community');
communityNs.on('connection', (socket) => {
  console.log('Client connected to /community namespace', { id: socket.id, handshake: socket.handshake.query });
  socket.on('handshake', (data) => {
    console.log('Community handshake:', data);
  });
});

app.set('io', io);
app.set('communityIo', communityNs);
// Expose io and community namespace globally for webhook handlers that don't have app context
(global as any).appIo = io;
(global as any).appCommunityIo = communityNs;

io.engine.on('connection_error', (err) => {
  console.log('Socket.io connection error:', {
    code: err.code,
    message: err.message,
    context: err.context,
    timestamp: new Date().toISOString()
  });
});

io.engine.on('initial_headers', (headers) => {
  headers['Access-Control-Allow-Origin'] = 'http://localhost:3000';
  headers['Access-Control-Allow-Credentials'] = 'true';
});

io.engine.on('headers', (headers) => {
  headers['Access-Control-Allow-Origin'] = 'http://localhost:3000';
  headers['Access-Control-Allow-Credentials'] = 'true';
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws://localhost:3000", "ws://localhost:5000", "http://localhost:3000", "http://localhost:5000"]
    }
  }
}));

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// Rate limiting
const isDevelopment = process.env.NODE_ENV === 'development';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 1000,
  message: { error: 'Too many requests from this IP, please try again later.' },
  // Skip rate limiting for socket.io and local/dev requests to make local testing reliable.
  skip: (req) => {
    try {
      if (req.path.includes('/socket.io/')) return true;
      // Allow bypass when running in development mode
      if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') return true;
      // Allow requests that carry a developer override header
      if (req.headers['x-dev-role'] || req.headers['x-skip-ratelimit']) return true;
      // Allow local requests
      const conn = req.connection as unknown as { remoteAddress?: string } | undefined;
      const ip = (req.ip || (conn && conn.remoteAddress) || '').toString();
      if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.0.0.1')) return true;
    } catch (e) {
      // If anything goes wrong, do not skip by default
    }
    return false;
  }
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = req.user;
    console.log(
      `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms) ` +
      `${user?.id ? `user=${user.id}` : ''} ${user?.role ? `role=${user.role}` : ''}`.trim()
    );
  });
  next();
});

// Stripe webhook for wallet top-ups (must be raw body)
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWalletWebhook);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads - allow cross-origin usage from frontend
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  try {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      services: {
        cms: '/api/cms/test',
        admin: '/api/admin/test',
        auth: '/api/auth',
        users: '/api/users',
        commerce: '/api/commerce',
        search: '/api/search',
        ai: '/api/ai',
        'gigs-jobs': '/api/admin/gigs-jobs/test',
        'homepage': '/api/cms/homepage'
      },
      socket: {
        status: io.engine?.clientsCount ? 'active' : 'inactive',
        connected: io.engine?.clientsCount || 0
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Test homepage endpoint directly (for debugging)
app.get('/api/test-homepage', async (req: Request, res: Response) => {
  try {
    const { getHomepage } = await import('./controllers/cmsController');
    return getHomepage(req, res);
  } catch (error) {
    console.error('Test homepage error:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint for socket.io
app.get('/api/socket-test', (req: Request, res: Response) => {
  res.json({ 
    message: 'Socket.io test endpoint',
    socketAvailable: true,
    timestamp: new Date().toISOString()
  });
});

// WebSocket test endpoint (non-API route)
app.get('/ws-test', (req: Request, res: Response) => {
  res.json({
    message: 'WebSocket test endpoint',
    socket: {
      enabled: true,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timestamp: new Date().toISOString()
    }
  });
});

// Socket test endpoint (non-API route)
app.get('/socket-test', (req: Request, res: Response) => {
  res.json({
    message: 'Socket.io test endpoint',
    proxyWorking: true,
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/cms', cmsRoutes);
app.use('/api/cms', cmsAuthPagesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/commerce', commerceRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/freelancer', freelancerRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/admin/gigs-jobs', adminGigsJobsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/gcoin', gcoinRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/briefs', briefsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Socket.io connection with enhanced logging and error handling
io.on('connection', (socket) => {
  try {
    console.log(`Socket connected: ${socket.id} - Transport: ${socket.conn.transport.name}`);
    console.log(`Total connections: ${io.engine.clientsCount}`);

    socket.emit('connected', { 
      id: socket.id,
      serverTime: new Date().toISOString(),
      transport: socket.conn.transport.name
    });

    socket.emit('welcome', { 
      message: 'Connected to Geezle Socket.io server',
      id: socket.id,
      timestamp: new Date().toISOString()
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { time: new Date().toISOString() });
      }
    }, 15000);

    socket.on('handshake', (data: any) => {
      console.log(`Handshake from ${socket.id}:`, data);
      socket.emit('handshake-ack', {
        id: socket.id,
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('join-room', (roomId: string) => {
      try {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
      } catch (error) {
        console.error(`Error joining room ${roomId}:`, error);
      }
    });

    socket.on('message', (data: any) => {
      try {
        console.log(`Message from ${socket.id}:`, data);
        if (data.roomId) {
          io.to(data.roomId).emit('message', data);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    socket.on('ping', (data) => {
      try {
        socket.emit('pong', { 
          ...data,
          serverTime: new Date().toISOString(),
          id: socket.id
        });
      } catch (error) {
        console.error('Error handling ping:', error);
      }
    });

    socket.conn.on('upgrade', (transport) => {
      console.log(`Transport upgraded for ${socket.id}: ${transport.name}`);
    });

    socket.conn.on('close', (reason) => {
      console.log(`Connection closed for ${socket.id}: ${reason}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
      clearInterval(heartbeatInterval);
      console.log('Disconnect details:', {
        socketId: socket.id,
        reason,
        connected: socket.connected,
        time: new Date().toISOString(),
        remainingConnections: io.engine.clientsCount
      });
      console.log(`Remaining connections: ${io.engine.clientsCount}`);
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  } catch (error) {
    console.error('Connection handler error:', error);
  }
});

// 404 handler for API routes
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'API route not found',
    requestedPath: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      '/api/health',
      '/api/socket-test',
      '/api/cms/*',
      '/api/admin/*',
      '/api/auth/*',
      '/api/users/*',
      '/api/commerce/*',
      '/api/search/*',
      '/api/ai/*',
      '/api/gigs/*',
      '/api/admin/gigs-jobs/*'
    ]
  });
});

// 404 handler for all other routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  console.error('Error stack:', err.stack);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  res.status(500).json({ 
    success: false,
    error: 'Internal Server Error',
    code: 'ERR_INTERNAL',
    timestamp: new Date().toISOString()
  });
});

// Start server (skip auto-listen during test runs to avoid port conflicts)
const PORT = parseInt(process.env.PORT!) || 5000;
if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Geezle Marketplace Backend Started`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Frontend URL: http://localhost:3000`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
    console.log(`📡 Socket.io: ws://localhost:${PORT}/socket.io`);
    console.log(`========================================`);
    console.log('\n📡 Mounted Routes:');
    console.log('  /api/cms       - CMS Management');
    console.log('  /api/admin     - Admin Dashboard');
    console.log('  /api/auth      - Authentication');
    console.log('  /api/users     - User Management');
    console.log('  /api/commerce  - Commerce & Listings');
    console.log('  /api/search    - Search Functionality');
    console.log('  /api/ai        - AI Services');
    console.log('  /api/gigs      - Gigs Management');
    console.log('  /api/admin/gigs-jobs - Admin Gigs & Jobs');
    console.log('  /api/wallet    - Wallet & Transactions');
    console.log('  /api/escrow    - Escrow Management');
    console.log('  /api/withdrawal - Withdrawal Requests');
    console.log('  /api/community - Community Forum');
    console.log('  /socket.io/*   - Socket.io WebSocket');
    console.log('========================================');

    // Initialize AdPayment reconciliation: run once and schedule periodically
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        // Run an initial reconciliation on startup
        reconcileAdPayments().catch(err => console.error('Initial reconcileAdPayments failed:', err));

        // Schedule reconciliation every 5 minutes
        const reconcileTask = cron.schedule('*/5 * * * *', async () => {
          console.log(`[cron] Running reconcileAdPayments at ${new Date().toISOString()}`);
          try {
            await reconcileAdPayments();
          } catch (err) {
            console.error('[cron] reconcileAdPayments error:', err);
          }
        }, {
          scheduled: true,
          timezone: process.env.SCHEDULE_TIMEZONE || 'UTC'
        });

        reconcileTask.start();
      } else {
        console.warn('STRIPE_SECRET_KEY not set; skipping AdPayment reconciliation on startup.');
      }
    } catch (err) {
      console.error('Failed to initialize reconcileAdPayments cron job:', err);
    }
  });
} else {
  console.log('Server auto-start skipped (test environment detected).');
}

export default app;
