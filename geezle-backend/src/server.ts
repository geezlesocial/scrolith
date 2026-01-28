import 'dotenv/config';
// C:\Projects\geezle-backend\src\server.ts
import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import prisma from './utils/prismaClient';
import fs from 'fs';
import jwt from 'jsonwebtoken'; // Ensure jwt import exists
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
  // Attempt to apply JWT auth for namespace sockets (mirrors io.use middleware)
  try {
    const hs = socket.handshake as any;
    const tokenRaw = (hs.auth && hs.auth.token) || (hs.query && hs.query.token) || '';
    const token = tokenRaw && tokenRaw.toString().startsWith('Bearer ') ? tokenRaw.toString().slice('Bearer '.length) : tokenRaw;
    if (token) {
      const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
      try {
        const decoded = jwt.verify(token, secret) as any;
        if (decoded && decoded.id) {
          prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, isActive: true } })
            .then(user => {
              if (user && user.isActive) {
                (socket as any).data = (socket as any).data || {};
                (socket as any).data.user = { id: user.id, role: user.role, email: user.email };
              }
            })
            .catch(e => console.warn('communityNs auth prisma error:', e));
        }
      } catch (e) {
        console.warn('communityNs JWT verify failed:', (e as any)?.message ?? String(e));
      }
    }
  } catch (e) {
    console.error('communityNs auth setup error:', e);
  }

  socket.on('handshake', (data) => {
    console.log('Community handshake:', data);
  });
  // Also allow listening sockets in /community to perform room joins so they receive targeted emits
  socket.on('join:wallet', (payload: { userId: string }) => {
    const handleJoinWallet = async (pl: { userId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:wallet invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const requested = pl?.userId;
        const identity = (socket as any).data?.user?.id || null;
        if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
        const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
        if (identity === requested || process.env.NODE_ENV === 'development' || allowTestJoins) {
          socket.join(`wallet:${requested}`);
          socket.join(requested);
          socket.emit('joined', { room: `wallet:${requested}` });
          console.log(`Socket ${socket.id} joined wallet:${requested}`);
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join wallet room' });
        }
      } catch (e) {
        console.error('join:wallet error (community ns):', e);
      }
      return;
    };
    void handleJoinWallet(payload);
  });

  socket.on('join:post', (payload: { postId: string }) => {
    const handleJoinPost = async (pl: { postId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:post invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const postId = pl?.postId;
        if (!postId) { socket.emit('error', { code: 'MISSING_POSTID', message: 'postId required' }); return; }
        const identity = (socket as any).data?.user?.id || null;
        const post = await prisma.communityPost.findUnique({ where: { id: postId } });
        if (!post) { socket.emit('error', { code: 'NOT_FOUND', message: 'Post not found' }); return; }
        const isOwner = identity && post.authorId === identity;
        const isPublic = (post.status || 'active') === 'active';
        const role = (socket as any).data?.user?.role || '';
        const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
        const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || allowTestJoins;
        if (isOwner || isPublic || isAdmin) {
          socket.join(`post:${postId}`);
          socket.emit('joined', { room: `post:${postId}` });
          console.log(`Socket ${socket.id} joined post:${postId}`);
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join post room' });
        }
      } catch (e) {
        console.error('join:post error (community ns):', e);
      }
      return;
    };
    void handleJoinPost(payload);
  });

  socket.on('join:ad', (payload: { adId: string }) => {
    const handleJoinAd = async (pl: { adId: string }): Promise<void> => {
      try {
        console.log(`communityNs join:ad invoked for socket ${socket.id}`, { payload: pl, user: (socket as any).data?.user });
        const adId = pl?.adId;
        if (!adId) { socket.emit('error', { code: 'MISSING_ADID', message: 'AdId required' }); return; }
        const identity = (socket as any).data?.user?.id || null;
        const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
        if (!ad) { socket.emit('error', { code: 'NOT_FOUND', message: 'Ad not found' }); return; }
        const isOwner = identity && ad.creatorId === identity;
        const isActive = (ad.status || '').toString().toUpperCase() === 'ACTIVE';
        const role = (socket as any).data?.user?.role || '';
        const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development';
        if (isOwner || isActive || isAdmin) {
          socket.join(`ad:${adId}`);
          socket.emit('joined', { room: `ad:${adId}` });
          console.log(`Socket ${socket.id} joined ad:${adId}`);
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join ad room' });
        }
      } catch (e) {
        console.error('join:ad error (community ns):', e);
      }
      return;
    };
    void handleJoinAd(payload);
  });
});

// Socket auth: verify JWT if provided, attach user to socket.data.user
io.use(async (socket, next) => {
  try {
    const hs = socket.handshake as any;
    const tokenRaw = (hs.auth && hs.auth.token) || (hs.query && hs.query.token) || '';
    const token = tokenRaw && tokenRaw.toString().startsWith('Bearer ') ? tokenRaw.toString().slice('Bearer '.length) : tokenRaw;
    if (!token) return next(); // allow unauthenticated sockets for public use
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    let decoded: any = null;
    try {
      decoded = jwt.verify(token, secret) as any;
    } catch (e) {
      console.warn('Socket JWT verification failed:', (e as any)?.message ?? String(e));
      return next(new Error('unauthorized'));
    }
    if (!decoded || !decoded.id) return next(new Error('unauthorized'));
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return next(new Error('unauthorized'));
    (socket as any).data = (socket as any).data || {};
    (socket as any).data.user = { id: user.id, role: user.role, email: user.email };
    return next();
  } catch (err) {
    console.error('Socket auth error:', err);
    return next(new Error('unauthorized'));
  }
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

// Serve favicon from uploads if present so platform settings that point to
// `/favicon.ico` resolve even when the file was uploaded to /uploads.
app.get('/favicon.ico', (req: Request, res: Response) => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) return res.status(404).end();
    const files = fs.readdirSync(uploadsDir);
    // Prefer common favicon filenames (ico, png) that include 'favicon' or start with 'favicon'
    const candidate = files.find(f => /(^favicon\.|favicon\.|favicon_)/i.test(f) || /favicon/i.test(f));
    if (!candidate) return res.status(404).end();
    const filePath = path.join(uploadsDir, candidate);
    return res.sendFile(filePath);
  } catch (e) {
    console.error('Failed to serve favicon from uploads', e);
    return res.status(500).end();
  }
});

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

// Prometheus metrics endpoint (optional)
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    // Optional security: IP allowlist and basic auth
    const allowListRaw = process.env.METRICS_ALLOW_IPS || '';
    const allowList = allowListRaw.split(',').map(s => s.trim()).filter(Boolean);
    const metricsUser = process.env.METRICS_USERNAME;
    const metricsPass = process.env.METRICS_PASSWORD;

    const clientIpRaw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '').toString();
    const clientIp = clientIpRaw.replace(/^::ffff:/, '').split(',')[0].trim();

    // support CIDR entries in allow list (e.g. 10.0.0.0/8)
    const isValidIpv4 = (ip: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
    const ipv4ToInt = (ip: string) => {
      const p = ip.split('.').map(n => Number(n) & 0xff);
      return ((p[0] << 24) >>> 0) + ((p[1] << 16) >>> 0) + ((p[2] << 8) >>> 0) + (p[3] >>> 0);
    };
    const cidrMatch = (ip: string, cidr: string) => {
      try {
        if (!cidr.includes('/')) return ip === cidr;
        const [base, prefixRaw] = cidr.split('/');
        const prefix = Number(prefixRaw);
        if (!isValidIpv4(ip) || !isValidIpv4(base) || isNaN(prefix) || prefix < 0 || prefix > 32) return false;
        const ipInt = ipv4ToInt(ip);
        const baseInt = ipv4ToInt(base);
        const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1) >>> 0);
        return (ipInt & mask) === (baseInt & mask);
      } catch (e) {
        return false;
      }
    };

    const ipAllowed = allowList.length === 0 ? false : allowList.some(entry => cidrMatch(clientIp, entry));
    const requireAuth = Boolean(metricsUser && metricsPass) || allowList.length > 0;

    if (requireAuth) {
      // allow if IP is allowlisted
      if (ipAllowed) {
        // proceed
      } else if (metricsUser && metricsPass) {
        const auth = (req.headers.authorization || '').toString();
        if (!auth.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = auth.slice('Basic '.length).trim();
        let cred = '';
        try { cred = Buffer.from(token, 'base64').toString('utf8'); } catch (e) { cred = ''; }
        const [u, p] = cred.split(':');
        if (u !== metricsUser || p !== metricsPass) {
          res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const metrics = await import('./utils/metrics');
    const registry = metrics.getPromRegistry && metrics.getPromRegistry();
    if (!registry) return res.status(404).json({ error: 'Metrics not enabled' });
    const body = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType || 'text/plain; version=0.0.4');
    return res.send(body);
  } catch (e) {
    console.error('Metrics endpoint error:', e);
    return res.status(500).json({ error: 'Failed to collect metrics' });
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

    // Authenticated, typed room joins
    socket.on('join:wallet', (payload: { userId: string }) => {
      const handleJoinWallet = async (pl: { userId: string }): Promise<void> => {
        try {
          const requested = pl?.userId;
          const identity = (socket as any).data?.user?.id || null;
          if (!requested) { socket.emit('error', { code: 'MISSING_USERID', message: 'userId required' }); return; }
          // Allow join if identity matches requested userId or in development mode
          const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
          if (identity === requested || process.env.NODE_ENV === 'development' || allowTestJoins) {
            socket.join(`wallet:${requested}`);
            socket.join(requested); // legacy user room
            socket.emit('joined', { room: `wallet:${requested}` });
            console.log(`Socket ${socket.id} joined wallet:${requested}`);
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join wallet room' });
          }
        } catch (e) {
          console.error('join:wallet error:', e);
        }
        return;
      };
      void handleJoinWallet(payload);
    });

    socket.on('join:post', (payload: { postId: string }) => {
      const handleJoinPost = async (pl: { postId: string }): Promise<void> => {
        try {
          const postId = pl?.postId;
          if (!postId) { socket.emit('error', { code: 'MISSING_POSTID', message: 'postId required' }); return; }
          const identity = (socket as any).data?.user?.id || null;
          // fetch post and verify visibility/ownership
          const post = await prisma.communityPost.findUnique({ where: { id: postId } });
          if (!post) { socket.emit('error', { code: 'NOT_FOUND', message: 'Post not found' }); return; }
          const isOwner = identity && post.authorId === identity;
          const isPublic = (post.status || 'active') === 'active';
          const role = (socket as any).data?.user?.role || '';
          const allowTestJoins = String(process.env.SOCKET_ALLOW_TEST_JOIN || '').toLowerCase() === 'true';
          const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || allowTestJoins;
          if (isOwner || isPublic || isAdmin) {
            socket.join(`post:${postId}`);
            socket.emit('joined', { room: `post:${postId}` });
            console.log(`Socket ${socket.id} joined post:${postId}`);
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join post room' });
          }
        } catch (e) {
          console.error('join:post error:', e);
        }
        return;
      };
      void handleJoinPost(payload);
    });

    socket.on('join:ad', (payload: { adId: string }) => {
      const handleJoinAd = async (pl: { adId: string }): Promise<void> => {
        try {
          const adId = pl?.adId;
          if (!adId) { socket.emit('error', { code: 'MISSING_ADID', message: 'adId required' }); return; }
          const identity = (socket as any).data?.user?.id || null;
          const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
          if (!ad) { socket.emit('error', { code: 'NOT_FOUND', message: 'Ad not found' }); return; }
          const isOwner = identity && ad.creatorId === identity;
          const isActive = (ad.status || '').toString().toUpperCase() === 'ACTIVE';
          const role = (socket as any).data?.user?.role || '';
          const isAdmin = (role || '').toString().toLowerCase().includes('admin') || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
          if (isOwner || isActive || isAdmin) {
            socket.join(`ad:${adId}`);
            socket.emit('joined', { room: `ad:${adId}` });
            console.log(`Socket ${socket.id} joined ad:${adId}`);
          } else {
            socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized to join ad room' });
          }
        } catch (e) {
          console.error('join:ad error:', e);
        }
        return;
      };
      void handleJoinAd(payload);
    });

    socket.on('leave-room', (roomId: string) => {
      try {
        socket.leave(roomId);
        socket.emit('left', { room: roomId });
        console.log(`Socket ${socket.id} left room ${roomId}`);
      } catch (e) {
        console.error('leave-room error:', e);
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
export { server, io, communityNs };
