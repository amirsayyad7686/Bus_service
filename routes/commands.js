const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Device  = require('../models/Device');

const router = express.Router();

// ---------- In-memory command queue ----------
const COMMAND_TTL = 30_000;
let commandQueue = [];
const lastGpioState = {};

function enqueueCommand(deviceId, pin, state) {
  // coalesce same pin+device
  commandQueue = commandQueue.filter(
    c => !(c.deviceId === deviceId && c.pin === pin)
  );
  const cmd = {
    id: Date.now(),
    deviceId,
    type: 'GPIO',
    pin: Number(pin),
    state: state ? 1 : 0,
    queuedAt: Date.now()
  };
  commandQueue.push(cmd);
  return cmd;
}

function popCommand(deviceId) {
  const now = Date.now();
  commandQueue = commandQueue.filter(c => now - c.queuedAt < COMMAND_TTL);
  const idx = commandQueue.findIndex(c => c.deviceId === deviceId);
  if (idx < 0) return null;
  const cmd = commandQueue.splice(idx, 1)[0];
  return cmd;
}

// Expose popCommand so tcpServer can pull from it
router.popCommand = popCommand;

// ---------- Auth: accept both client JWT and admin JWT ----------
function requireAnyAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ ok: false, error: 'no auth' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: 'bad token' });
  }
}

// ---------- POST /api/command ----------
router.post('/command', requireAnyAuth, async (req, res) => {
  const { pin, state, deviceId } = req.body || {};

  if (pin === undefined || state === undefined) {
    return res.status(400).json({ ok: false, error: 'pin and state required' });
  }

  // Determine which device the user is controlling
  let targetDeviceId = deviceId;

  if (!targetDeviceId) {
    // fall back to the user's first device
    if (req.user.isAdmin) {
      return res.status(400).json({ ok: false, error: 'deviceId required for admin' });
    }
    const user = await User.findById(req.user.userId).lean();
    if (!user || !user.devices?.length) {
      return res.status(400).json({ ok: false, error: 'no devices assigned' });
    }
    targetDeviceId = user.devices[0];
  } else if (!req.user.isAdmin) {
    // non-admin can only control their own devices
    const user = await User.findById(req.user.userId).lean();
    if (!user?.devices?.includes(targetDeviceId)) {
      return res.status(403).json({ ok: false, error: 'not your device' });
    }
  }

  const cmd = enqueueCommand(targetDeviceId, pin, state);

  // broadcast to any open dashboards
  if (req.io) {
    req.io.emit('command-queued', cmd);
  }

  res.json({ ok: true, cmd });
});

// ---------- GET /api/gpio ----------
router.get('/gpio', requireAnyAuth, (req, res) => {
  res.json({ ok: true, states: lastGpioState });
});

// ---------- POST /api/gpio/state (called from tcpServer on ACK) ----------
router.recordAck = function (pin, state) {
  lastGpioState[pin] = state;
};

module.exports = router;