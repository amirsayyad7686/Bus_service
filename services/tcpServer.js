const net = require('net');
const bcrypt = require('bcryptjs');
const Device = require('../models/Device');
const { signDevice, verifyDeviceToken } = require('../middleware/deviceAuth');
const commandRoutes = require('../routes/commands');

const FIELDS = [
  'lat','lon','pitch','roll','yaw',
  'gx','gy','gz','ax','ay','az',
  'speed','st','vp','led2','led2s'
];

// ============================================================
//  Line handler — one TCP line from the device
// ============================================================
async function handleLine(raw, socket, ctx) {
  // ---------- DEVICE LOGIN ----------
  // client23832:LOGIN:<deviceId>:<secret>
  if (raw.startsWith('client23832:LOGIN:')) {
    const parts = raw.split(':');
    if (parts.length < 4) {
      ctx.write('AUTH:FAIL');
      return;
    }
    const deviceId = parts[2];
    const secret = parts.slice(3).join(':');

    const device = await Device.findOne({ deviceId });
    if (!device || !bcrypt.compareSync(secret, device.secretHash)) {
      ctx.write('AUTH:FAIL');
      console.log(`[TCP] login FAIL ${deviceId}`);
      return;
    }

    device.lastSeen = new Date();
    await device.save();

    ctx.setDeviceId(deviceId);
    ctx.write('TOKEN:' + signDevice(deviceId));
    console.log(`[TCP] device logged in: ${deviceId}`);
    return;
  }

  // ---------- GPIO ACK ----------
  // client23832:<token>:ACK:GPIO:<pin>:<state>
  if (raw.includes(':ACK:GPIO:')) {
    const m = raw.match(/ACK:GPIO:(\d+):([01])$/);
    if (m) {
      const pin = Number(m[1]);
      const state = Number(m[2]);
      commandRoutes.recordAck(pin, state);
      ctx.io.emit('gpio-state', { pin, state, ts: Date.now() });
      console.log(`[CMD] ACK ${pin} -> ${state}`);
    }
    return;
  }

  // ---------- TELEMETRY ----------
  // client23832:<jwt>:<csv>[,PULL]
  if (raw.startsWith('client23832:')) {
    const rest = raw.slice('client23832:'.length);
    const sep = rest.indexOf(':');
    if (sep < 0) return;

    const token = rest.slice(0, sep);
    let body = rest.slice(sep + 1);

    const payload = verifyDeviceToken(token);
    if (!payload) {
      ctx.write('AUTH:EXPIRED');
      console.log('[TCP] token expired');
      return;
    }

    ctx.setDeviceId(payload.deviceId);

    const hasPull = body.endsWith(',PULL');
    if (hasPull) body = body.slice(0, -5);

    const csv = body.split(',');
    if (csv.length < FIELDS.length) return;

    const obj = { deviceId: payload.deviceId, ts: Date.now() };
    for (let i = 0; i < FIELDS.length; i++) obj[FIELDS[i]] = Number(csv[i]) || 0;

    // Persist last snapshot
    Device.updateOne(
      { deviceId: payload.deviceId },
      { lastSeen: new Date(), lastTelemetry: obj }
    ).exec();

    // Ring buffer for the tracking page
    try {
      const telemetryStore = require('./telemetryStore');
      telemetryStore.record(payload.deviceId, obj);
    } catch (e) { /* store optional */ }

    // Broadcast to dashboards
    ctx.onTelemetry(obj);

    // If the ESP32 asked for a command, hand one back
    if (hasPull) {
      const cmd = commandRoutes.popCommand(payload.deviceId);
      if (cmd) {
        const line = `CMD:${cmd.type}:${cmd.pin}:${cmd.state}\n`;
        socket.write(line);
        console.log(`[CMD] -> ${payload.deviceId} ${cmd.type} ${cmd.pin}=${cmd.state}`);
      }
    }
  }
}

// ============================================================
//  TCP server factory
// ============================================================
function createTcpServer({ io, port, onTelemetry }) {
  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[TCP] client connected: ${addr}`);
    socket.setNoDelay(true);

    let socketDeviceId = null;
    let buffer = '';

    const write = (line) => {
      try { socket.write(line + '\n'); } catch (e) {}
    };

    const ctx = {
      write,
      io,
      onTelemetry,
      getDeviceId: () => socketDeviceId,
      setDeviceId: (id) => { socketDeviceId = id; }
    };

    socket.on('data', (data) => {
      buffer += data.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!raw) continue;
        handleLine(raw, socket, ctx).catch(e =>
          console.error('[TCP] handleLine error:', e.message)
        );
      }
    });

    socket.on('error', (err) => console.error(`[TCP] error:`, err.message));
    socket.on('close', () => console.log(`[TCP] disconnected: ${addr}`));
  });

  server.listen(port, '0.0.0.0', () =>
    console.log(`[TCP] listening on ${port}`)
  );

  return server;
}

module.exports = { createTcpServer, FIELDS };