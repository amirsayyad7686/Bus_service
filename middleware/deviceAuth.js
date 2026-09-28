const jwt = require('jsonwebtoken');

function signDevice(deviceId) {
  return jwt.sign(
    { deviceId, type: 'device' },
    process.env.JWT_DEVICE_SECRET,
    { expiresIn: process.env.JWT_DEVICE_EXPIRES }
  );
}

function verifyDeviceToken(token) {
  try {
    const p = jwt.verify(token, process.env.JWT_DEVICE_SECRET);
    return p.type === 'device' ? p : null;
  } catch (e) { return null; }
}

module.exports = { signDevice, verifyDeviceToken };