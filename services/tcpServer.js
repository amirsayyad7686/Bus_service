const net = require('net');
const bcrypt = require('bcryptjs');
const Device = require('../models/Device');
const { signDevice, verifyDeviceToken } = require('../middleware/deviceAuth');
const telemetryStore = require('./telemetryStore');
const FIELDS = [
  'lat','lon','pitch','roll','yaw',
  'gx','gy','gz','ax','ay','az',
  'speed','st','vp','led2','led2s'
];
const commandRoutes = require('../routes/commands');
function createTcpServer({ io, port, onTelemetry }) {
  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[TCP] client connected: ${addr}`);
    socket.setNoDelay(true);

    let socketDeviceId = null;
    let buffer = '';

    const write = (line) => { try { socket.write(line + '\n'); } catch(e){} };

    socket.on('data', async (data) => {
      buffer += data.toString();
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!raw) continue;
        try {
          await handleLine(raw, socket, {
            write, io, onTelemetry,
            getDeviceId: () => socketDeviceId,
            setDeviceId: (id) => { socketDeviceId = id; }
          });
        } catch (e) { console.error('[TCP] handler error:', e.message); }
      }
    });

    socket.on('error', (err) => console.error(`[TCP] error:`, err.message));
    socket.on('close', () => console.log(`[TCP] disconnected: ${addr}`));
  });

  server.listen(port, '0.0.0.0', () =>
    console.log(`[TCP] listening on ${port}`));
  return server;
}

async function handleLine(raw, socket, ctx) {
  // -------- DEVICE LOGIN --------
  // client23832:LOGIN:<deviceId>:<secret>
  if (raw.startsWith('client23832:LOGIN:')) {
    const parts = raw.split(':');
    if (parts.length < 4) { ctx.write('AUTH:FAIL'); return; }
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

  // -------- GPIO ACK --------
if (/^client23832:ACK:GPIO:\d+:[01]$/.test(raw)) {
  const [, pinStr, stateStr] = raw.match(/ACK:GPIO:(\d+):([01])/);
  const pin = Number(pinStr);
  const state = Number(stateStr);
  commandRoutes.recordAck(pin, state);
  io.emit('gpio-state', { pin, state, ts: Date.now() });
  console.log(`[CMD] ACK ${pin} -> ${state}`);
  continue;
}

  // -------- TELEMETRY --------
  // client23832:<jwt>:lat,lon,pitch,...[,PULL]
  if (raw.startsWith('client23832:')) {
    const rest = raw.slice('client23832:'.length);
    const sep = rest.indexOf(':');
    if (sep < 0) return;
    const token = rest.slice(0, sep);
    let body = rest.slice(sep + 1);

    const payload = verifyDeviceToken(token);
    if (!payload) { ctx.write('AUTH:EXPIRED'); return; }
    ctx.setDeviceId(payload.deviceId);

    const hasPull = body.endsWith(',PULL');
    if (hasPull) {
      const cmd = commandRoutes.popCommand(payload.deviceId);
      if (cmd) {
        const line = `CMD:${cmd.type}:${cmd.pin}:${cmd.state}\n`;
        socket.write(line);
        console.log(`[CMD] -> ${payload.deviceId} ${cmd.type} ${cmd.pin}=${cmd.state}`);
      }
    }

    const csv = body.split(',');
    if (csv.length < FIELDS.length) return;

    const obj = { deviceId: payload.deviceId, ts: Date.now() };
    for (let i = 0; i < FIELDS.length; i++) obj[FIELDS[i]] = Number(csv[i]) || 0;

    Device.updateOne({ deviceId: payload.deviceId }, {
      lastSeen: new Date(), lastTelemetry: obj
    }).exec();
    telemetryStore.record(payload.deviceId, obj);   // ← ADD THIS

    ctx.onTelemetry(obj);
  }
}

module.exports = { createTcpServer, FIELDS };