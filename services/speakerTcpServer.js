const net = require('net');

let espSocket = null;
const stats = { packets: 0, bytes: 0, lastT: Date.now() };

function createSpeakerServer({ port }) {
  const server = net.createServer((socket) => {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[SPEAKER] esp32 connected: ${addr}`);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 1000);

    espSocket = socket;

    socket.on('error', (e) => console.error('[SPEAKER] err:', e.message));
    socket.on('close', () => {
      console.log(`[SPEAKER] esp32 disconnected: ${addr}`);
      if (espSocket === socket) espSocket = null;
    });
  });

  server.listen(port, '0.0.0.0', () =>
    console.log(`[SPEAKER] TCP server on port ${port}`));

  return server;
}

function sendToSpeaker(pcmBuf) {
  if (!espSocket || !espSocket.writable) return false;
  const hdr = Buffer.allocUnsafe(4);
  hdr[0] = 0x53;  // 'S'
  hdr[1] = 0x50;  // 'P'
  hdr.writeUInt16LE(pcmBuf.length, 2);
  try {
    espSocket.write(hdr);
    espSocket.write(pcmBuf);
    stats.packets++;
    stats.bytes += pcmBuf.length;
    return true;
  } catch { return false; }
}

// Optional: call once a second to log throughput
function logSpeakerStats() {
  const now = Date.now();
  const dt = (now - stats.lastT) / 1000;
  const pps = stats.packets / dt;
  const kbps = (stats.bytes * 8 / 1000) / dt;
  stats.packets = 0; stats.bytes = 0; stats.lastT = now;
  if (pps > 0) console.log(`[SPEAKER] ${pps.toFixed(0)} pkt/s ${kbps.toFixed(0)} kbps`);
}

module.exports = { createSpeakerServer, sendToSpeaker, logSpeakerStats };