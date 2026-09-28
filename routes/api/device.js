const express = require('express');
const bcrypt = require('bcryptjs');
const Device = require('../../models/Device');
const { signDevice } = require('../../middleware/deviceAuth');

const router = express.Router();

// Alternate to TCP login — handy for testing with curl
router.post('/login', async (req, res) => {
  const { deviceId, secret } = req.body || {};
  if (!deviceId || !secret) {
    return res.status(400).json({ ok: false, error: 'missing fields' });
  }
  const device = await Device.findOne({ deviceId });
  if (!device || !bcrypt.compareSync(secret, device.secretHash)) {
    return res.status(401).json({ ok: false, error: 'invalid credentials' });
  }
  device.lastSeen = new Date();
  await device.save();
  res.json({ ok: true, token: signDevice(deviceId), expiresIn: 6 * 3600 });
});

module.exports = router;