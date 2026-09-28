const net = require('net');

// Shared state between cam TCP server and MJPEG HTTP server
const state = {
  latestFrame: null,      // Buffer of the last JPEG
  lastFrameTime: 0,       // ms timestamp
  frameSubscribers: new Set(),  // open MJPEG HTTP responses
  camFps: 0,
  framesThisSecond: 0,
  fpsWindowStart: Date.now(),
  hasClient: false,
  clientAddr: null
};

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

  // Broadcast to every MJPEG subscriber
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

      // Parse 4-byte little-endian length prefix + JPEG
      while (buf.length >= 4) {
        const len = buf.readUInt32LE(0);

        // Sanity check — 2 MB cap
        if (len === 0 || len > 2_000_000) {
          console.warn(`[CAM] bad frame length ${len}, resetting buffer`);
          buf = Buffer.alloc(0);
          return;
        }

        if (buf.length < 4 + len) break;   // wait for full frame

        const jpeg = buf.subarray(4, 4 + len);
        buf = buf.subarray(4 + len);

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