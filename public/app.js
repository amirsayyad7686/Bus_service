import * as THREE from 'three';

/* ==================================================================
   1. THREE.JS SCENE SETUP
   ================================================================== */
const canvas = document.getElementById('carCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x03080e, 9, 24);

const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 8.2, 8.2);
camera.lookAt(0, 0.35, -0.6);

// Lights
scene.add(new THREE.AmbientLight(0x386075, 1.4));
const key = new THREE.DirectionalLight(0xdcf8ff, 2.4);
key.position.set(6, 14, 7);
scene.add(key);

const rim = new THREE.DirectionalLight(0x00f2fe, 1.2);
rim.position.set(-6, 3, -6);
scene.add(rim);

/* ==================================================================
   2. RADAR FLOOR & ADAS BOUNDING BOXES
   ================================================================== */
const radarGroup = new THREE.Group();
scene.add(radarGroup);

// Road plane & lanes
const roadMat = new THREE.MeshBasicMaterial({ color: 0x05131c });
const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 32), roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, -0.01, -2);
radarGroup.add(road);

// Center dash lanes
for (let i = -12; i < 10; i += 2.8) {
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.35 });
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.3), stripeMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(-1.8, 0.005, i);
  radarGroup.add(stripe);

  const stripeR = stripe.clone();
  stripeR.position.x = 1.8;
  radarGroup.add(stripeR);
}

// Glowing circular radar rings
[1.6, 2.7, 3.8].forEach((r, idx) => {
  const ringGeo = new THREE.RingGeometry(r, r + 0.035, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75 - idx * 0.2
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  radarGroup.add(ring);
});

// Coordinate Crosshair Axes
const axisMat = new THREE.LineBasicMaterial({ color: 0x05dfb2, transparent: true, opacity: 0.65 });
const points = [
  new THREE.Vector3(-4, 0.01, 0), new THREE.Vector3(4, 0.01, 0),
  new THREE.Vector3(0, 0.01, -4), new THREE.Vector3(0, 0.01, 4)
];
const axisGeo = new THREE.BufferGeometry().setFromPoints(points);
radarGroup.add(new THREE.LineSegments(axisGeo, axisMat));

// Helper: Wireframe Bounding Box with Label Canvas
function createDetectedTarget(w, h, d, color, x, z, labelText) {
  const group = new THREE.Group();
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  wire.position.y = h / 2;
  group.add(wire);

  // Floating distance text tag
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 128;
  tagCanvas.height = 40;
  const ctx = tagCanvas.getContext('2d');
  ctx.fillStyle = '#05dfb2';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(labelText, 64, 28);

  const tex = new THREE.CanvasTexture(tagCanvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.1, 0.35, 1);
  sprite.position.set(0, h + 0.3, 0);
  group.add(sprite);

  group.position.set(x, 0, z);
  return group;
}

// Nearby detected vehicles and pedestrians matching the visual
scene.add(createDetectedTarget(1.2, 0.75, 2.1, 0x00f2fe, -2.7, -3.2, '28.7 m'));
scene.add(createDetectedTarget(1.2, 0.75, 2.1, 0x00f2fe, 2.5, -2.9, '18.6 m'));
scene.add(createDetectedTarget(0.45, 1.0, 0.45, 0x25d366, -2.9, 1.2, '34.2 m'));
scene.add(createDetectedTarget(0.45, 1.0, 0.45, 0x25d366, 2.8, 1.4, '22.7 m'));

/* ==================================================================
   3. DETAILED 4x4 SUV MODEL
   ================================================================== */
function buildDetailedSUV() {
  const suv = new THREE.Group();

  // Materials
  const bodyPaint = new THREE.MeshStandardMaterial({
    color: 0x1e6bff,
    metalness: 0.65,
    roughness: 0.3
  });
  const darkPlastic = new THREE.MeshStandardMaterial({
    color: 0x0f151c,
    metalness: 0.3,
    roughness: 0.7
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x071118,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.8
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdaf2ff,
    metalness: 0.95,
    roughness: 0.15
  });
  const ledHeadlight = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xd0f0ff,
    emissiveIntensity: 2.2
  });
  const ledTaillight = new THREE.MeshStandardMaterial({
    color: 0xff2020,
    emissive: 0xff0020,
    emissiveIntensity: 2.0
  });

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // 1. Lower Chassis & Running Boards
  const chassis = box(1.05, 0.16, 2.3, darkPlastic);
  chassis.position.y = 0.22;
  suv.add(chassis);

  const stepL = box(0.08, 0.04, 1.3, darkPlastic);
  stepL.position.set(0.56, 0.18, 0);
  suv.add(stepL);
  const stepR = stepL.clone();
  stepR.position.x = -0.56;
  suv.add(stepR);

  // 2. Main Body Shell
  const lowerBody = box(1.08, 0.34, 2.22, bodyPaint);
  lowerBody.position.y = 0.44;
  suv.add(lowerBody);

  // Hood & Fenders
  const hood = box(1.02, 0.14, 0.74, bodyPaint);
  hood.position.set(0, 0.62, 0.72);
  hood.rotation.x = -0.05;
  suv.add(hood);

  // 3. Cabin & Glass Canopy
  const cabin = box(0.96, 0.38, 1.25, bodyPaint);
  cabin.position.set(0, 0.82, -0.22);
  suv.add(cabin);

  // Windshield
  const windshield = box(0.90, 0.36, 0.05, glassMat);
  windshield.position.set(0, 0.83, 0.42);
  windshield.rotation.x = -0.42;
  suv.add(windshield);

  // Rear Window
  const rearWin = box(0.90, 0.34, 0.05, glassMat);
  rearWin.position.set(0, 0.83, -0.84);
  rearWin.rotation.x = 0.25;
  suv.add(rearWin);

  // Side Glass Panes
  const sideWin = box(0.04, 0.26, 1.15, glassMat);
  sideWin.position.set(0.48, 0.84, -0.22);
  suv.add(sideWin);
  const sideWinR = sideWin.clone();
  sideWinR.position.x = -0.48;
  suv.add(sideWinR);

  // 4. Roof Rack & LED Bar
  const rackBar1 = box(0.86, 0.04, 0.04, darkPlastic);
  rackBar1.position.set(0, 1.05, 0.2);
  suv.add(rackBar1);
  const rackBar2 = rackBar1.clone();
  rackBar2.position.z = -0.2;
  suv.add(rackBar2);
  const rackBar3 = rackBar1.clone();
  rackBar3.position.z = -0.6;
  suv.add(rackBar3);

  const roofRailL = box(0.04, 0.04, 1.1, chromeMat);
  roofRailL.position.set(0.42, 1.05, -0.2);
  suv.add(roofRailL);
  const roofRailR = roofRailL.clone();
  roofRailR.position.x = -0.42;
  suv.add(roofRailR);

  // Roof LED Light Bar
  const lightBar = box(0.70, 0.05, 0.05, ledHeadlight);
  lightBar.position.set(0, 1.02, 0.38);
  suv.add(lightBar);

  // 5. Front Bull-Bar Grille & Bumper
  const bumper = box(1.08, 0.16, 0.14, darkPlastic);
  bumper.position.set(0, 0.32, 1.14);
  suv.add(bumper);

  const grilleGuard = box(0.68, 0.24, 0.05, chromeMat);
  grilleGuard.position.set(0, 0.44, 1.18);
  suv.add(grilleGuard);

  // Headlights & Taillights
  const hlL = box(0.22, 0.09, 0.04, ledHeadlight);
  hlL.position.set(0.38, 0.54, 1.13);
  suv.add(hlL);
  const hlR = hlL.clone();
  hlR.position.x = -0.38;
  suv.add(hlR);

  const tlL = box(0.18, 0.12, 0.04, ledTaillight);
  tlL.position.set(0.38, 0.54, -1.13);
  suv.add(tlL);
  const tlR = tlL.clone();
  tlR.position.x = -0.38;
  suv.add(tlR);

  // Side Mirrors
  const mirrorL = box(0.10, 0.07, 0.06, bodyPaint);
  mirrorL.position.set(0.56, 0.74, 0.38);
  suv.add(mirrorL);
  const mirrorR = mirrorL.clone();
  mirrorR.position.x = -0.56;
  suv.add(mirrorR);

  // 6. Detailed 4x4 Wheels with Rims & Hubs
  function buildWheel(x, z) {
    const wheel = new THREE.Group();

    // Tire
    const tireGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.20, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, darkPlastic);
    wheel.add(tire);

    // Rim Outer
    const rimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.21, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    wheel.add(rim);

    // Hub Cap
    const hubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, darkPlastic);
    wheel.add(hub);

    wheel.position.set(x, 0.26, z);
    return wheel;
  }

  suv.add(buildWheel(0.60, 0.72));
  suv.add(buildWheel(-0.60, 0.72));
  suv.add(buildWheel(0.60, -0.72));
  suv.add(buildWheel(-0.60, -0.72));

  return suv;
}

const car = buildDetailedSUV();
scene.add(car);

/* ==================================================================
   4. SPEEDOMETER (CANVAS 2D HUD)
   ================================================================== */
class HudGauge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.currentSpeed = 48;
    this.targetSpeed = 48;
    this.maxSpeed = 120;
  }

  setSpeed(v) { this.targetSpeed = Math.max(0, v); }

  update() {
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.12;
    this.draw();
  }

  draw() {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr; c.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5, cy = h * 0.65;
    const R = Math.min(w * 0.42, h * 0.6);
    const startAng = 0.85 * Math.PI;
    const endAng = 2.15 * Math.PI;
    const totalSweep = endAng - startAng;

    // Dark track
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0d2836';
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAng, endAng);
    ctx.stroke();

    // Glowing cyan arc
    const progress = Math.min(1, this.currentSpeed / this.maxSpeed);
    ctx.strokeStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAng, startAng + progress * totalSweep);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Ticks & Labels
    const steps = [0, 20, 40, 60, 80, 100, 120];
    ctx.font = '500 9px monospace';
    ctx.fillStyle = '#6e90a2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    steps.forEach((val) => {
      const frac = val / this.maxSpeed;
      const ang = startAng + frac * totalSweep;
      const x1 = cx + Math.cos(ang) * (R - 10);
      const y1 = cy + Math.sin(ang) * (R - 10);
      const x2 = cx + Math.cos(ang) * (R - 18);
      const y2 = cy + Math.sin(ang) * (R - 18);

      ctx.strokeStyle = '#184759';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const tx = cx + Math.cos(ang) * (R - 28);
      const ty = cy + Math.sin(ang) * (R - 28);
      ctx.fillText(val.toString(), tx, ty);
    });

    // Central speed readout
    ctx.fillStyle = '#05dfb2';
    ctx.font = '700 30px -apple-system, sans-serif';
    ctx.fillText(Math.round(this.currentSpeed).toString(), cx, cy - 4);

    ctx.fillStyle = '#557688';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('km/h', cx, cy + 18);
  }
}

const gauge = new HudGauge(document.getElementById('speedGauge'));

/* ==================================================================
   5. ROUTE MAP (LEAFLET)
   ================================================================== */
const map = L.map('map', { attributionControl: false, zoomControl: false }).setView([29.6312, 52.5387], 14);
L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const routeTrail = L.polyline([], {
  color: '#00f2fe',
  weight: 5,
  opacity: 0.95,
  lineCap: 'round'
}).addTo(map);

let followOn = true;
const followBtn = document.getElementById('followBtn');
followBtn.addEventListener('click', () => {
  followOn = !followOn;
  followBtn.classList.toggle('active', followOn);
  followBtn.innerHTML = followOn ? 'FOLLOW: ON' : 'FOLLOW: OFF';
});

document.getElementById('clearMap').addEventListener('click', () => routeTrail.setLatLngs([]));

/* ==================================================================
   6. CAMERA STREAM & CONTROLS
   ================================================================== */
(function setupCamera() {
  const img = document.getElementById('camStream');
  const overlay = document.getElementById('camOverlay');
  const fpsEl = document.getElementById('camFps');
  const pauseBtn = document.getElementById('camPause');
  const fullBtn = document.getElementById('camFull');
  const wrap = document.getElementById('camWrap');
  if (!img) return;

  let paused = false;

  img.addEventListener('load', () => overlay.classList.add('hidden'));
  img.addEventListener('error', () => overlay.classList.remove('hidden'));

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      img.src = '';
      overlay.textContent = 'PAUSED';
      overlay.classList.remove('hidden');
      pauseBtn.textContent = '▶';
    } else {
      img.src = '/stream?t=' + Date.now();
      overlay.textContent = 'CONNECTING…';
      pauseBtn.textContent = '⏸';
    }
  });

  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen?.();
  });

  async function pollCam() {
    try {
      const res = await fetch('/api/cam');
      const data = await res.json();
      if (!data.hasFrame || data.lastFrameAge > 3000) {
        fpsEl.textContent = 'STALLED';
        fpsEl.style.color = '#ff6b6b';
      } else {
        fpsEl.textContent = `${data.fps.toFixed(1)} fps`;
        fpsEl.style.color = '#05dfb2';
      }
    } catch (e) {
      fpsEl.textContent = '—';
    }
    setTimeout(pollCam, 1500);
  }
  pollCam();
})();

/* ==================================================================
   7. LIVE TELEMETRY SOCKET
   ================================================================== */
const io = window.io();

io.on('connect', () => {
  const c = document.getElementById('conn');
  c.className = 'badge-status online';
  c.innerHTML = '<span class="dot"></span> Online';
});

io.on('disconnect', () => {
  const c = document.getElementById('conn');
  c.className = 'badge-status bad';
  c.innerHTML = '<span class="dot"></span> Offline';
});

io.on('telemetry', (t) => {
  if (t.speed !== undefined) gauge.setSpeed(t.speed);

  if (t.lat && t.lon) {
    document.getElementById('lat').textContent = t.lat.toFixed(4);
    document.getElementById('lon').textContent = t.lon.toFixed(4);
    const pt = [t.lat, t.lon];
    routeTrail.addLatLng(pt);
    if (followOn) map.panTo(pt);
  }

  if (t.yaw !== undefined) {
    const deg = Math.round((t.yaw % 360 + 360) % 360);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    document.getElementById('directionVal').innerHTML = `${dirs[idx]} <span class="sub">(${deg}°)</span>`;
    car.rotation.y = -THREE.MathUtils.degToRad(deg);
  }

  if (t.alt !== undefined) {
    document.getElementById('altVal').textContent = `${Math.round(t.alt)} m`;
  }

  if (t.ax !== undefined) {
    document.getElementById('accVal').textContent = `${t.ax.toFixed(2)} g`;
  }
});

/* ==================================================================
   8. RENDER LOOP & RESIZE
   ================================================================== */
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

function render() {
  requestAnimationFrame(render);
  gauge.update();
  renderer.render(scene, camera);
}
render();



/* ==================================================================
   9. REMOTE GPIO CONTROL
   ================================================================== */
const PIN_CONFIG = [
  { pin: 2,  name: 'Onboard LED' },
  { pin: 4,  name: 'GPIO 4'      },
  { pin: 5,  name: 'GPIO 5'      },
  { pin: 32, name: 'GPIO 32'     },
  { pin: 33, name: 'GPIO 33'     }
];

const gpioState = {};     // pin -> 0|1 (last ACK from ESP32)

(function setupControl() {
  const grid = document.getElementById('gpioGrid');
  const statusEl = document.getElementById('cmdStatus');
  const statusText = document.getElementById('cmdStatusText');
  if (!grid) return;

  // Build the DOM
  PIN_CONFIG.forEach(({ pin, name }) => {
    const el = document.createElement('div');
    el.className = 'gpio-item';
    el.dataset.pin = pin;
    el.innerHTML = `
      <div class="gpio-info">
        <div class="gpio-name">${name}</div>
        <div class="gpio-pin">PIN ${pin}</div>
      </div>
      <div class="gpio-toggle" data-pin="${pin}"></div>
    `;
    grid.appendChild(el);
  });

  function setStatus(text, kind) {
    statusText.textContent = text;
    statusEl.className = 'cmd-status' + (kind ? ' ' + kind : '');
  }

  function renderPin(pin) {
    const item = grid.querySelector(`.gpio-item[data-pin="${pin}"]`);
    const toggle = item?.querySelector('.gpio-toggle');
    if (!toggle) return;
    const state = gpioState[pin] || 0;
    toggle.classList.toggle('on', state === 1);
    item.classList.toggle('on', state === 1);
    item.classList.remove('pending');
    toggle.classList.remove('pending');
  }

  // Initial fetch
  fetch('/api/gpio')
    .then(r => r.json())
    .then(j => {
      if (j.ok) {
        Object.assign(gpioState, j.states || {});
        PIN_CONFIG.forEach(c => renderPin(c.pin));
      }
    })
    .catch(() => {});

  // Click handler
  grid.addEventListener('click', async (e) => {
    const toggle = e.target.closest('.gpio-toggle');
    if (!toggle) return;
    const pin = Number(toggle.dataset.pin);
    const next = (gpioState[pin] || 0) ? 0 : 1;

    // Optimistic pending UI
    const item = toggle.closest('.gpio-item');
    item.classList.add('pending');
    toggle.classList.add('pending');

    setStatus('sending…', 'busy');

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, state: next })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      // Wait for the ACK event from the socket to update the UI
      setTimeout(() => {
        // If no ACK arrived within 5 s, un-pend and mark as unknown
        if (item.classList.contains('pending')) {
          item.classList.remove('pending');
          toggle.classList.remove('pending');
          setStatus('no ack', '');
        }
      }, 5000);
    } catch (err) {
      item.classList.remove('pending');
      toggle.classList.remove('pending');
      setStatus('error', '');
    }
  });

  // Live updates from server
  const sock = window.io ? window.io() : null;
  if (sock) {
    sock.on('gpio-state', ({ pin, state }) => {
      gpioState[pin] = state;
      renderPin(pin);
      setStatus(`pin ${pin} = ${state ? 'ON' : 'OFF'}`, 'ok');
      setTimeout(() => setStatus('idle', ''), 2000);
    });
    sock.on('gpio-snapshot', (snapshot) => {
      Object.assign(gpioState, snapshot || {});
      PIN_CONFIG.forEach(c => renderPin(c.pin));
    });
    sock.on('command-queued', ({ pin, state }) => {
      setStatus(`queued pin ${pin}`, 'busy');
    });
  }
})();