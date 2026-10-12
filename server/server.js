require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Routes
const authRoutes = require('./routes/auth.routes');
const communityRoutes = require('./routes/communities.routes');
const postRoutes = require('./routes/posts.routes');
const projectRoutes = require('./routes/projects.routes');
const messageRoutes = require('./routes/messages.routes');
const notificationRoutes = require('./routes/notifications.routes');
const userRoutes = require('./routes/users.routes');
const liveRoutes = require('./routes/live.routes');
const searchRoutes = require('./routes/search.routes');
const reportRoutes = require('./routes/reports.routes');
const adminRoutes = require('./routes/admin.routes');

// Socket
const { initializeSocket } = require('./sockets/chat');

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.set('io', io);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false, // Allow Live Demo Sandbox iframes to load without X-Frame-Options blocking
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(uploadsDir));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  skip: (req) => process.env.NODE_ENV === 'test' || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Auth-specific rate limit (relaxed in development)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 50 : 500,
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/communities', communityRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/live', liveRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
});

// Initialize Socket.IO
initializeSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Collabry server running on port ${PORT}`);
});

module.exports = { app, server, io };
