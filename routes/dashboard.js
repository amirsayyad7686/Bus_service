const express = require('express');
const User    = require('../models/User');
const Device  = require('../models/Device');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Reusable guard
function requireClient(req, res, next) {
  if (req.user?.isAdmin) return res.redirect('/admin/users');
  next();
}

router.get('/dashboard', requireAuth, requireClient, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.redirect('/login');
  const devices = await Device.find({ owner: user._id });
  res.render('dashboard', { user, devices });
});

router.get('/profile', requireAuth, requireClient, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.redirect('/login');
  res.render('profile', { user, error: null, success: null });
});

router.post('/profile', requireAuth, requireClient, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.redirect('/login');
  const { name, phone } = req.body;
  if (name)  user.name  = name;
  if (phone) user.phone = phone;
  await user.save();
  res.render('profile', { user, error: null, success: 'Profile updated' });
});

module.exports = router;