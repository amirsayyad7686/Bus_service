const mongoose = require('mongoose');
const Schema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  devices:      [{ type: String }],   // deviceIds
  isAdmin:      { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', Schema);