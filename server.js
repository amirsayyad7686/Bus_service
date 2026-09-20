const net     = require('net');
const http    = require('http');
const path    = require('path');
const express = require('express');
const { Server } = require('socket.io');

// ---------- Config ----------
const HTTP_PORT = 5101;
const TCP_PORT  = 5202;
const EXPECTED_CLIENT_ID = 'client23832';

// ---------- Express app ----------
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Simple REST endpoint with the latest snapshot
let latest = null;
app.get('/api/latest', (req, res) => {
  if (!latest) return res.status(204).json({ ok: false, msg: 'no data yet' });
  res.json({ ok: true, ...latest });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, tcpPort: TCP_PORT, httpPort: HTTP_PORT, up: process.uptime() });
});

// ---------- TCP server (MC60 → here) ----------
const FIELDS = ['lat','lon','pitch','roll','yaw','gx','gy','gz','ax','ay','az','speed'];

function parsePayload(msg) {
  // Expect: client23832:lat,lon,pitch,roll,yaw,gx,gy,gz,ax,ay,az,speed
  const colon = msg.indexOf(':');
  if (colon < 0) return null;

  const clientId = msg.slice(0, colon);
  const rest     = msg.slice(colon + 1);
  if (clientId !== EXPECTED_CLIENT_ID) return null;

  const parts = rest.split(',');
  if (parts.length < FIELDS.length) return null;

  const out = { clientId, ts: Date.now() };
  for (let i = 0; i < FIELDS.length; i++) {
    out[FIELDS[i]] = Number(parts[i]) || 0;
  }
  return out;
}

const tcpServer = net.createServer((socket) => {
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[TCP] client connected: ${addr}`);
  socket.setNoDelay(true);

  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!raw) continue;

      console.log(`[TCP] <- ${raw}`);

      const parsed = parsePayload(raw);
      if (!parsed) {
        console.warn(`[TCP] dropped (bad format or unknown client): ${raw}`);
        continue;
      }

      latest = parsed;

      // Broadcast to every connected browser
      io.emit('telemetry', parsed);
    }
  });

  socket.on('error', (err) => console.error(`[TCP] error from ${addr}:`, err.message));
  socket.on('close', () => console.log(`[TCP] client disconnected: ${addr}`));
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
  console.log(`[TCP] listening on port ${TCP_PORT}`);
});

// ---------- Socket.IO ----------
io.on('connection', (sock) => {
  console.log(`[WS] browser connected: ${sock.id}`);
  if (latest) sock.emit('telemetry', latest);
  sock.on('disconnect', () => console.log(`[WS] browser disconnected: ${sock.id}`));
});



// --------------------------------------------------------------
//  CAMERA STREAM
// --------------------------------------------------------------
let latestFrame = null;              // Buffer of the last JPEG
let lastFrameTime = 0;
const frameSubscribers = new Set();  // open MJPEG responses
let camFps = 0;
let camFrameCounter = 0;
let camFpsWindowStart = Date.now();

// POST /frame — ESP32-CAM sends raw JPEG bytes here
app.post(
  '/frame',
  express.raw({ type: 'image/jpeg', limit: '4mb' }),
  (req, res) => {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).send('empty body');
    }
    latestFrame   = req.body;
    lastFrameTime = Date.now();

    // FPS tracking
    camFrameCounter++;
    const elapsed = Date.now() - camFpsWindowStart;
    if (elapsed >= 1000) {
      camFps = camFrameCounter * 1000 / elapsed;
      camFrameCounter = 0;
      camFpsWindowStart = Date.now();
    }

    // Push to all open MJPEG subscribers
    const header = Buffer.from(
      `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.length}\r\n\r\n`
    );
    const footer = Buffer.from('\r\n');
    for (const s of frameSubscribers) {
      try {
        s.write(header);
        s.write(latestFrame);
        s.write(footer);
      } catch (e) {
        frameSubscribers.delete(s);
      }
    }

    res.sendStatus(200);
  }
);

// GET /stream — MJPEG stream for browsers
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'close'
  });

  // Send the latest frame immediately so the <img> shows something
  if (latestFrame) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.length}\r\n\r\n`);
    res.write(latestFrame);
    res.write(`\r\n`);
  }

  frameSubscribers.add(res);
  req.on('close', () => frameSubscribers.delete(res));
});

// GET /frame.jpg — latest still image (handy for debugging)
app.get('/frame.jpg', (req, res) => {
  if (!latestFrame) return res.status(204).send();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(latestFrame);
});

// GET /api/cam — status (last frame time, FPS, subscribers)
app.get('/api/cam', (req, res) => {
  res.json({
    hasFrame:     !!latestFrame,
    lastFrameAge: lastFrameTime ? (Date.now() - lastFrameTime) : null,
    fps:          Number(camFps.toFixed(2)),
    subscribers:  frameSubscribers.size,
    frameBytes:   latestFrame ? latestFrame.length : 0
  });
});



// ---------- Start HTTP ----------
server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP] dashboard at http://localhost:${HTTP_PORT}`);
  console.log(`[HTTP] waiting for MC60 TCP data on port ${TCP_PORT}`);
});