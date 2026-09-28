const express   = require('express');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const User      = require('../models/User');
const Device    = require('../models/Device');

const router = express.Router();

// ---------- Hardcoded admin ----------
const ADMIN_EMAIL    = 'amirsayyad7686';
const ADMIN_PASSWORD = 'shiraZ1410';

function signAdmin() {
  return jwt.sign(
    { userId: 'admin', email: ADMIN_EMAIL, name: 'Amir Sayyad', isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
}

// Public admin login (no auth required)
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.render('admin/login', { error: 'Wrong credentials' });
  }
  res.cookie('token', signAdmin(), {
    httpOnly: true,
    sameSite: 'lax',
    //secure: process.env.NODE_ENV === 'production',
    secure: false,
    maxAge: 7 * 24 * 3600 * 1000
  });
  res.redirect('/admin/users');
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/admin/login');
});

// Everything below requires a valid admin cookie
router.use((req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/admin/login');
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (!p.isAdmin) return res.redirect('/admin/login');
    req.user = p;
    next();
  } catch (e) {
    res.clearCookie('token');
    res.redirect('/admin/login');
  }
});
const telemetryStore = require('../services/telemetryStore');

// ---------- Tracking page ----------
router.get('/tracking', (req, res) => {
  res.render('admin/tracking', {
    admin: req.user,
    page: 'tracking'
  });
});

// ---------- Detail page for one device ----------
router.get('/tracking/:deviceId', async (req, res) => {
  const device = await Device.findOne({ deviceId: req.params.deviceId })
                             .populate('owner', 'name email')
                             .lean();
  res.render('admin/tracking-detail', {
    admin: req.user,
    device: device || { deviceId: req.params.deviceId, name: '', owner: null },
    page: 'tracking'
  });
});

// ---------- API: all devices + latest + trails ----------
router.get('/api/tracking', (req, res) => {
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 300));

  const devices = telemetryStore.stats().map(d => {
    const history = telemetryStore.getHistory(d.deviceId, limit);
    return {
      deviceId: d.deviceId,
      points:   d.points,
      latest:   d.latest,
      trail:    history
        .filter(p => Math.abs(p.lat) > 0.0001 && Math.abs(p.lon) > 0.0001)
        .map(p => [p.lat, p.lon, p.ts])
    };
  });

  // Enrich with owner info
  Device.find({ deviceId: { $in: devices.map(d => d.deviceId) } })
    .populate('owner', 'name email')
    .lean()
    .then(list => {
      const map = new Map(list.map(d => [d.deviceId, d]));
      devices.forEach(d => {
        const meta = map.get(d.deviceId);
        d.name  = meta?.name || d.deviceId;
        d.owner = meta?.owner || null;
        d.lastSeen = meta?.lastSeen || null;
      });
      res.json({ ok: true, devices });
    })
    .catch(err => {
      console.error('[admin] tracking api error:', err);
      res.status(500).json({ ok: false, error: err.message });
    });
});

// ---------- API: one device full history ----------
router.get('/api/tracking/:deviceId', (req, res) => {
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 1000));
  const history = telemetryStore.getHistory(req.params.deviceId, limit);
  res.json({
    ok: true,
    deviceId: req.params.deviceId,
    count: history.length,
    max:   telemetryStore.MAX_PER_DEVICE,
    points: history
  });
});
// ---------- Dashboard root ----------
router.get('/', (req, res) => res.redirect('/admin/users'));

// ---------- Users list ----------
router.get('/users', async (req, res) => {
  try {
    const users   = await User.find().sort({ createdAt: -1 }).lean();
    const devices = await Device.find().lean();

    // attach device count per user
    const usersWithDevices = users.map(u => ({
      ...u,
      deviceList: devices.filter(d => d.owner && String(d.owner) === String(u._id))
    }));

    res.render('admin/users', {
      admin: req.user,
      users: usersWithDevices,
      totalDevices: devices.length,
      page: 'users'
    });
  } catch (err) {
    console.error('[admin] /users error:', err);
    res.status(500).send('Server error');
  }
});

// ---------- Update user ----------
router.post('/users/:id/edit', async (req, res) => {
  try {
    const { name, email, phone, isAdmin } = req.body;
    await User.findByIdAndUpdate(req.params.id, {
      name,
      email: (email || '').toLowerCase(),
      phone,
      isAdmin: isAdmin === 'on' || isAdmin === 'true'
    });
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[admin] edit user error:', err);
    res.redirect('/admin/users');
  }
});

// ---------- Delete user ----------
router.post('/users/:id/delete', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) {
      // free their devices
      await Device.updateMany({ owner: user._id }, { owner: null });
    }
    res.redirect('/admin/users');
  } catch (err) {
    console.error('[admin] delete user error:', err);
    res.redirect('/admin/users');
  }
});

// ---------- Devices list ----------
router.get('/devices', async (req, res) => {
  try {
    const devices = await Device.find().populate('owner', 'name email').lean();
    const users   = await User.find().select('name email').lean();

    res.render('admin/devices', {
      admin: req.user,
      devices,
      users,
      reveal:   req.query.reveal   || null,
      revealId: req.query.id       || null,
      page: 'devices'
    });
  } catch (err) {
    console.error('[admin] /devices error:', err);
    res.status(500).send('Server error');
  }
});

// ---------- Create device ----------
router.post('/devices', async (req, res) => {
  try {
    const { deviceId, name } = req.body;
    if (!deviceId) return res.redirect('/admin/devices');

    const secret = crypto.randomBytes(24).toString('hex');
    const secretHash = bcrypt.hashSync(secret, 10);

    await Device.findOneAndUpdate(
      { deviceId },
      {
        deviceId,
        name: name || deviceId,
        secretHash,
        provisioned: true
      },
      { upsert: true, new: true }
    );

    res.redirect('/admin/devices?reveal=' + secret + '&id=' + encodeURIComponent(deviceId));
  } catch (err) {
    console.error('[admin] create device error:', err);
    res.redirect('/admin/devices');
  }
});

// ---------- Assign / unassign device to user ----------
router.post('/devices/:deviceId/assign', async (req, res) => {
  try {
    const { userId } = req.body;
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) return res.redirect('/admin/devices');

    const oldOwner = device.owner;

    if (userId) {
      const user = await User.findById(userId);
      if (!user) return res.redirect('/admin/devices');

      device.owner = user._id;
      await device.save();

      // remove from any old user
      if (oldOwner) await User.findByIdAndUpdate(oldOwner, { $pull: { devices: device.deviceId } });

      // add to new user if not already there
      if (!user.devices.includes(device.deviceId)) {
        user.devices.push(device.deviceId);
        await user.save();
      }
    } else {
      device.owner = null;
      await device.save();
      if (oldOwner) await User.findByIdAndUpdate(oldOwner, { $pull: { devices: device.deviceId } });
    }

    res.redirect('/admin/devices');
  } catch (err) {
    console.error('[admin] assign device error:', err);
    res.redirect('/admin/devices');
  }
});

// ---------- Delete device ----------
router.post('/devices/:deviceId/delete', async (req, res) => {
  try {
    const device = await Device.findOneAndDelete({ deviceId: req.params.deviceId });
    if (device && device.owner) {
      await User.findByIdAndUpdate(device.owner, { $pull: { devices: device.deviceId } });
    }
    res.redirect('/admin/devices');
  } catch (err) {
    console.error('[admin] delete device error:', err);
    res.redirect('/admin/devices');
  }
});

module.exports = router;