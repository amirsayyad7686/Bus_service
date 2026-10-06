const net = require('net');

const state = {
  latestFrame: null,
  lastFrameTime: 0,
  frameSubscribers: new Set(),
  camFps: 0,
  framesThisSecond: 0,
  fpsWindowStart: Date.now(),
  hasClient: false,
  clientAddr: null
};

const MAGIC0 = 0xAA;
const MAGIC1 = 0x55;

function pushFrame(jpeg) {
  state.latestFrame = jpeg;
  state.lastFrameTime = Date.now();

  state.framesThisSecond++;
  const elapsed = Date.now() - state.fpsWindowStart;
  if (elapsed >= 1000) {
    state.camFps = state.framesThisSecond * 1000 / elapsed;
    state.framesThisSecond = 0;
    state.fpsWindowStart = Date.now();
  }

  const header = Buffer.from(
    `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
  );
  const footer = Buffer.from('\r\n');

  for (const s of state.frameSubscribers) {
    try {
      s.write(header);
      s.write(jpeg);
      s.write(footer);
    } catch (e) {
      state.frameSubscribers.delete(s);
    }
  }
}

function createCamServer({ port, onFrame }) {
  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[CAM] TCP client connected: ${addr}`);
    socket.setNoDelay(true);
    state.hasClient = true;
    state.clientAddr = addr;

    let buf = Buffer.alloc(0);

socket.on('data', (data) => {
  buf = Buffer.concat([buf, data]);

  // Loop while we can possibly parse a frame
  while (buf.length >= 4) {

    let headerLen = 4;
    let len;

    // --- auto-detect header format ---
    if (buf.length >= 6 && buf[0] === 0xAA && buf[1] === 0x55) {
      // 6-byte format: [AA][55][len32 LE]
      headerLen = 6;
      len = buf.readUInt32LE(2);
    } else {
      // 4-byte format: [len32 LE]
      headerLen = 4;
      len = buf.readUInt32LE(0);
    }

    // Sanity check
    if (len === 0 || len > 2_000_000) {
      console.warn(`[CAM] bad length ${len}, resyncing`);
      // Try to find next possible header start
      const idx = buf.indexOf(Buffer.from([0xAA, 0x55]), 1);
      buf = idx < 0 ? Buffer.alloc(0) : buf.subarray(idx);
      continue;
    }

    if (buf.length < headerLen + len) break;   // wait for full frame

    const jpeg = buf.subarray(headerLen, headerLen + len);
    buf = buf.subarray(headerLen + len);

    pushFrame(jpeg);
    if (onFrame) onFrame(jpeg);
  }
});
    socket.on('error', (err) => console.error(`[CAM] error from ${addr}:`, err.message));
    socket.on('close', () => {
      console.log(`[CAM] client disconnected: ${addr}`);
      state.hasClient = false;
      state.clientAddr = null;
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[CAM] TCP frame receiver on port ${port}`);
  });

  return server;
}

module.exports = { createCamServer, state };