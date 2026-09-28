// services/telemetryStore.js
const MAX_PER_DEVICE = 1000;

class RingBuffer {
  constructor(size) {
    this.size  = size;
    this.buf   = new Array(size);
    this.head  = 0;
    this.count = 0;
  }
  push(item) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }
  // oldest → newest
  toArray() {
    const out = [];
    const start = this.count < this.size ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      out.push(this.buf[(start + i) % this.size]);
    }
    return out;
  }
  latest() {
    if (this.count === 0) return null;
    return this.buf[(this.head - 1 + this.size) % this.size];
  }
}

const store = new Map();   // deviceId → RingBuffer

function record(deviceId, point) {
  let buf = store.get(deviceId);
  if (!buf) {
    buf = new RingBuffer(MAX_PER_DEVICE);
    store.set(deviceId, buf);
  }
  buf.push(point);
}

function getHistory(deviceId, limit = MAX_PER_DEVICE) {
  const buf = store.get(deviceId);
  if (!buf) return [];
  const arr = buf.toArray();
  return limit >= arr.length ? arr : arr.slice(-limit);
}

function getLatest(deviceId) {
  const buf = store.get(deviceId);
  return buf ? buf.latest() : null;
}

function listDevices() {
  return Array.from(store.keys());
}

function stats() {
  const out = [];
  for (const [deviceId, buf] of store.entries()) {
    out.push({
      deviceId,
      points: buf.count,
      latest: buf.latest()
    });
  }
  return out;
}

module.exports = {
  record, getHistory, getLatest, listDevices, stats,
  MAX_PER_DEVICE
};