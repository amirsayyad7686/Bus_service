/* ==================================================================
   11. LIVE AUDIO — ring-buffered playback
   ================================================================== */
(function setupAudio() {
  const btn = document.getElementById('audioToggle');
  if (!btn) return;

  const SR = 16000;
  const RING = new Int16Array(SR * 6);   // 6 seconds of mono 16-bit
  let wr = 0, rd = 0;

  let ctx = null, node = null;
  let playing = false;
  let lastRx = 0;
  let underruns = 0;

  function ringAvail() {
    let d = wr - rd;
    if (d < 0) d += RING.length;
    return d;
  }

  function ringWrite(samples) {
    for (let i = 0; i < samples.length; i++) {
      RING[wr] = samples[i];
      wr = (wr + 1) % RING.length;
      if (wr === rd) rd = (rd + 1) % RING.length;  // drop oldest on overflow
    }
  }

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    node = ctx.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      const n = out.length;
      const avail = ringAvail();

      if (!playing || avail < n) {
        for (let i = 0; i < n; i++) out[i] = 0;
        if (playing && avail < n) underruns++;
        return;
      }
      for (let i = 0; i < n; i++) {
        out[i] = RING[rd] / 32768;
        rd = (rd + 1) % RING.length;
      }
    };
    node.connect(ctx.destination);
  }

  const sock = window.io();
  sock.on('audio', (buf) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const n  = u8.byteLength >> 1;
    if (!n) return;

    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const s  = new Int16Array(n);
    for (let i = 0; i < n; i++) s[i] = dv.getInt16(i * 2, true);

    ringWrite(s);
    lastRx = performance.now();
  });

  btn.addEventListener('click', async () => {
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    playing = !playing;
    btn.classList.toggle('active', playing);
    btn.textContent = playing ? '🔊 LIVE' : '🔇 MUTED';
    if (playing) {
      // Pre-buffer 400 ms of data before starting playback
      const need = SR * 0.4;
      const t0 = performance.now();
      while (ringAvail() < need && performance.now() - t0 < 2000) {
        await new Promise(r => setTimeout(r, 20));
      }
      lastRx = performance.now();
    } else {
      // When muting, drain the ring so next start is clean
      wr = rd = 0;
    }
  });

  // Watchdog: if we stopped receiving audio for >2 s, show it
  setInterval(() => {
    if (!playing) return;
    const age = performance.now() - lastRx;
    if (lastRx > 0 && age > 2000) {
      btn.textContent = '🔇 NO SIGNAL';
    } else {
      btn.textContent = '🔊 LIVE';
    }
  }, 500);
})();