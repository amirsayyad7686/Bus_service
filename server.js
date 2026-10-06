const path = require('path');
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';
require('dotenv').config({ path: path.join(__dirname, envFile) });
const commandRoutes = require('./routes/commands');

const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { createTcpServer } = require('./services/tcpServer');
const { createCamServer } = require('./services/camTcpServer');

const authRoutes = require('./routes/auth');
const dashRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const apiDeviceRoutes = require('./routes/api/device');

async function main() {
  await connectDB();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  // ---------- view engine ----------
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // ---------- global middleware ----------
  app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => res.redirect('/dashboard'));
  // Rate limit auth endpoints
  app.use('/login',    rateLimit({ windowMs: 60_000, max: 10 }));
  app.use('/register', rateLimit({ windowMs: 60_000, max: 10 }));

  // ---------- broadcast helper ----------
  const onTelemetry = (obj) => io.emit('telemetry', obj);
  io.on('connection', (sock) => {
    console.log(`[WS] browser ${sock.id}`);
  });
// ---------- camera routes FIRST (bypass auth) ----------
require('./services/mjpegServer').registerRoutes(app);
  // ---------- routes ----------
app.use('/admin', adminRoutes);   // specific prefix first
app.use('/', authRoutes);
app.use('/', dashRoutes);


app.use('/api', commandRoutes);
app.use('/api/device', apiDeviceRoutes);



    // ---------- 404 & 500 ----------
  app.use((req, res) => res.status(404).send('404 Not found'));
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).send('500 Server error');
  });

  
  // ---------- TCP servers ----------
  createTcpServer({ io, port: +process.env.TCP_PORT, onTelemetry });

  app.use((req, res, next) => {
    req.io = io;
    next();
  });

  createCamServer({ port: +process.env.CAM_TCP_PORT });

  // ---------- start ----------
  server.listen(+process.env.HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP] http://localhost:${process.env.HTTP_PORT}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });

