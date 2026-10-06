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

      // Frame format: [AA][55][len0][len1][len2][len3][JPEG...]
      while (buf.length >= 6) {

        // Resync if magic bytes missing
        if (buf[0] !== MAGIC0 || buf[1] !== MAGIC1) {
          const idx = buf.indexOf(Buffer.from([MAGIC0, MAGIC1]), 1);
          if (idx < 0) {
            buf = buf.subarray(buf.length - 1);
            break;
          }
          console.warn(`[CAM] resync: dropped ${idx} bytes`);
          buf = buf.subarray(idx);
          continue;
        }

        const len = buf.readUInt32LE(2);

        if (len === 0 || len > 2_000_000) {
          console.warn(`[CAM] bad frame length ${len}, resyncing`);
          const idx = buf.indexOf(Buffer.from([MAGIC0, MAGIC1]), 2);
          buf = idx < 0 ? Buffer.alloc(0) : buf.subarray(idx);
          continue;
        }

        if (buf.length < 6 + len) break;   // wait for the rest

        const jpeg = buf.subarray(6, 6 + len);
        buf = buf.subarray(6 + len);

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