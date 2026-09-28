const { state } = require('./camTcpServer');

function registerRoutes(app) {
  // GET /stream — MJPEG multipart stream
  app.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Connection': 'close'
    });

    // Send the latest frame immediately so the <img> shows something
    if (state.latestFrame) {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${state.latestFrame.length}\r\n\r\n`);
      res.write(state.latestFrame);
      res.write(`\r\n`);
    }

    state.frameSubscribers.add(res);
    req.on('close', () => state.frameSubscribers.delete(res));
  });

  // GET /frame.jpg — latest still image (handy for debugging)
  app.get('/frame.jpg', (req, res) => {
    if (!state.latestFrame) return res.status(204).send();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    res.send(state.latestFrame);
  });

  // GET /api/cam — status (last frame time, FPS, subscribers)
  app.get('/api/cam', (req, res) => {
    res.json({
      hasClient:    state.hasClient,
      clientAddr:   state.clientAddr,
      hasFrame:     !!state.latestFrame,
      lastFrameAge: state.lastFrameTime ? (Date.now() - state.lastFrameTime) : null,
      fps:          Number(state.camFps.toFixed(2)),
      subscribers:  state.frameSubscribers.size,
      frameBytes:   state.latestFrame ? state.latestFrame.length : 0
    });
  });
}

module.exports = { registerRoutes };