const net = require('net');

function createAudioServer({ port, io }) {
  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[AUDIO] esp32 connected: ${addr}`);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 1000);

    let buf = Buffer.alloc(0);
    let packets = 0, bytes = 0, statT = Date.now();

    socket.on('data', (data) => {
      buf = Buffer.concat([buf, data]);

      while (buf.length >= 4) {
        // Resync on magic 0x5541 = 'AU'
        if (buf[0] !== 0x41 || buf[1] !== 0x55) {
          buf = buf.subarray(1);
          continue;
        }
        const len = buf.readUInt16LE(2);
        if (len === 0 || len > 4096 || (len & 1)) {
          buf = buf.subarray(1);
          continue;
        }
        if (buf.length < 4 + len) break;

        const pcm = buf.subarray(4, 4 + len);
        buf = buf.subarray(4 + len);

        // Forward to every browser watching
        if (io) io.emit('audio', pcm);

        packets++; bytes += len;
        const now = Date.now();
        if (now - statT >= 1000) {
          const kbps = (bytes * 8 / 1000) / ((now - statT) / 1000);
          console.log(`[AUDIO] ${packets} pkt/s  ${kbps.toFixed(1)} kbps`);
          packets = 0; bytes = 0; statT = now;
        }
      }
    });

    socket.on('error', (e) => console.error('[AUDIO] err:', e.message));
    socket.on('close', () => console.log(`[AUDIO] esp32 disconnected: ${addr}`));
  });

  server.listen(port, '0.0.0.0', () =>
    console.log(`[AUDIO] TCP receiver on port ${port}`));

  return server;
}

module.exports = { createAudioServer };