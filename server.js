const net     = require('net');
const http    = require('http');
const path    = require('path');
const express = require('express');
const { Server } = require('socket.io');

// ---------- Config ----------
const HTTP_PORT = 3000;
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

// ---------- Start HTTP ----------
server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[HTTP] dashboard at http://localhost:${HTTP_PORT}`);
  console.log(`[HTTP] waiting for MC60 TCP data on port ${TCP_PORT}`);
});