const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Device = require('../models/Device');
const { signUser } = require('../middleware/auth');

const router = express.Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  //secure: process.env.NODE_ENV === 'production',
  secure: false,
  maxAge: 7 * 24 * 3600 * 1000
};

router.get('/login', (req, res) => res.render('auth/login', { error: null }));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.render('auth/login', { error: 'Invalid email or password' });
  }
  res.cookie('token', signUser(user), cookieOpts);
  res.redirect(user.isAdmin ? '/admin/users' : '/dashboard');
});

router.get('/register', (req, res) => res.render('auth/register', { error: null }));

router.post('/register', async (req, res) => {
  const { name, email, phone, password, deviceId } = req.body;
  if (!name || !email || !phone || !password || !deviceId) {
    return res.render('auth/register', { error: 'All fields are required' });
  }
  if (await User.findOne({ email: email.toLowerCase() })) {
    return res.render('auth/register', { error: 'Email already registered' });
  }
  const device = await Device.findOne({ deviceId });
  if (!device) return res.render('auth/register', { error: 'Device ID not found' });
  if (device.owner) return res.render('auth/register', { error: 'Device already claimed' });

  const user = await User.create({
    name, email: email.toLowerCase(), phone,
    passwordHash: bcrypt.hashSync(password, 10),
    devices: [deviceId]
  });
  device.owner = user._id;
  await device.save();

  res.cookie('token', signUser(user), cookieOpts);
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;