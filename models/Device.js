const mongoose = require('mongoose');
const Schema = new mongoose.Schema({
  deviceId:      { type: String, required: true, unique: true, trim: true },
  name:          { type: String, default: '' },
  secretHash:    { type: String, required: true },
  owner:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  provisioned:   { type: Boolean, default: false },
  lastSeen:      { type: Date, default: null },
  lastTelemetry: { type: Object, default: null },
  createdAt:     { type: Date, default: Date.now }
});
module.exports = mongoose.model('Device', Schema);