const jwt = require('jsonwebtoken');

function signUser(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, isAdmin: user.isAdmin, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES }
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.clearCookie('token');
    res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).send('Forbidden');
  next();
}

module.exports = { signUser, requireAuth, requireAdmin };