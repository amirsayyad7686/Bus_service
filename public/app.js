import * as THREE from 'three';

/* ==================================================================
   1. THREE.JS SCENE & RADAR ENVIRONMENT
   ================================================================== */
const canvas = document.getElementById('carCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x03080e, 8, 22);

const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
// Isometric bird's-eye angle matching the reference
camera.position.set(0, 7.5, 7.8);
camera.lookAt(0, 0.2, -0.6);

// Lighting
scene.add(new THREE.AmbientLight(0x447788, 1.2));
const key = new THREE.DirectionalLight(0xaae8ff, 2.2);
key.position.set(5, 12, 6);
scene.add(key);

/* ---------- Concentric Radar Grid & Rings ---------- */
const radarGroup = new THREE.Group();
scene.add(radarGroup);

// Road plane with dash lane marks
const roadMat = new THREE.MeshBasicMaterial({ color: 0x05131c });
const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 26), roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, -0.01, -2);
radarGroup.add(road);

// Road dashed stripes
for (let i = -10; i < 8; i += 2.5) {
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.35 });
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.2), stripeMat);
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
    opacity: 0.7 - idx * 0.18
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  radarGroup.add(ring);
});

// Radar Axes overlay
const axisMat = new THREE.LineBasicMaterial({ color: 0x05dfb2, transparent: true, opacity: 0.6 });
const points = [
  new THREE.Vector3(-3.8, 0.01, 0), new THREE.Vector3(3.8, 0.01, 0),
  new THREE.Vector3(0, 0.01, -3.8), new THREE.Vector3(0, 0.01, 3.8)
];
const axisGeo = new THREE.BufferGeometry().setFromPoints(points);
const axes = new THREE.LineSegments(axisGeo, axisMat);
radarGroup.add(axes);

/* ---------- Wireframe Detected Targets (ADAS UI) ---------- */
function makeWireframeBox(w, h, d, color = 0x00f2fe) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const edges = new THREE.EdgesGeometry(geo);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  return line;
}

// Nearby detected vehicles
const v1 = makeWireframeBox(1.1, 0.7, 2.0);
v1.position.set(-2.5, 0.4, -3.2);
scene.add(v1);

const v2 = makeWireframeBox(1.1, 0.7, 2.0);
v2.position.set(2.4, 0.4, -2.8);
scene.add(v2);

// Pedestrian bounding boxes
const p1 = makeWireframeBox(0.4, 0.9, 0.4, 0x25d366);
p1.position.set(-2.7, 0.5, 1.2);
scene.add(p1);

const p2 = makeWireframeBox(0.4, 0.9, 0.4, 0x25d366);
p2.position.set(2.8, 0.5, 1.4);
scene.add(p2);

/* ==================================================================
   2. BLUE SUV CHASSIS
   ================================================================== */
function buildSUV() {
  const suv = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x185adb, roughness: 0.3, metalness: 0.4 });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x050c12, roughness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.8 });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 2.3), blue);
  body.position.y = 0.45;
  suv.add(body);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 1.3), darkGlass);
  cabin.position.set(0, 0.76, -0.2);
  suv.add(cabin);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  [[-0.6, 0.75], [0.6, 0.75], [-0.6, -0.75], [0.6, -0.75]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, black);
    w.position.set(x, 0.24, z);
    suv.add(w);
  });

  return suv;
}

const car = buildSUV();
scene.add(car);

/* ==================================================================
   3. CYBER-HUD SPEEDOMETER GAUGE
   ================================================================== */
class HudGauge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.currentSpeed = 0;
    this.targetSpeed = 48;
    this.maxSpeed = 120;
  }

  setSpeed(v) { this.targetSpeed = Math.max(0, v); }

  update() {
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.1;
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

    // Track arc
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0d2836';
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAng, endAng);
    ctx.stroke();

    // Active cyan glowing arc
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
    ctx.font = '700 28px -apple-system, sans-serif';
    ctx.fillText(Math.round(this.currentSpeed).toString(), cx, cy - 4);

    ctx.fillStyle = '#557688';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('km/h', cx, cy + 18);
  }
}

const gauge = new HudGauge(document.getElementById('speedGauge'));

/* ==================================================================
   4. ROUTE MAP (LEAFLET)
   ================================================================== */
const map = L.map('map', {
  attributionControl: false,
  zoomControl: false
}).setView([29.6312, 52.5387], 14);

L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

const routeTrail = L.polyline([], {
  color: '#00f2fe',
  weight: 5,
  opacity: 0.95,
  lineCap: 'round'
}).addTo(map);

/* ==================================================================
   5. SOCKET TELEMETRY INTEGRATION
   ================================================================== */
const io = window.io();

io.on('telemetry', (t) => {
  if (t.speed !== undefined) gauge.setSpeed(t.speed);

  if (t.lat && t.lon) {
    document.getElementById('lat').textContent = t.lat.toFixed(4);
    document.getElementById('lon').textContent = t.lon.toFixed(4);
    routeTrail.addLatLng([t.lat, t.lon]);
  }

  if (t.yaw !== undefined) {
    const deg = Math.round(t.yaw % 360);
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
   6. RENDER LOOP & RESIZE
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