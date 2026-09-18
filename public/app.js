import * as THREE from 'three';

// ================= THREE.JS SCENE =================
const canvas = document.getElementById('cubeCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0x88ccff, 0.6));
const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(3, 5, 4); scene.add(d1);
const d2 = new THREE.DirectionalLight(0x3399ff, 0.5); d2.position.set(-3, -2, -4); scene.add(d2);

// Ground grid
const grid = new THREE.GridHelper(6, 12, 0x2a4a5a, 0x18303a);
grid.position.y = -1.8;
scene.add(grid);

// Cube (own group so we can apply pitch/roll/yaw cleanly)
const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const size = 1.6;
const geo  = new THREE.BoxGeometry(size, size, size);

// 6 face materials with different colors
const colors = [0xff4d4d, 0x4dff4d, 0x4d4dff, 0xffe94d, 0xff4dff, 0x4dffff];
const mats = colors.map(c => new THREE.MeshStandardMaterial({
  color: c, roughness: 0.35, metalness: 0.15,
  emissive: new THREE.Color(c).multiplyScalar(0.15)
}));

const cube = new THREE.Mesh(geo, mats);
cubeGroup.add(cube);

// Edges for a crisp outline
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(geo),
  new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 })
);
cubeGroup.add(edges);

// Small arrow marking the "forward" (+Z) direction
const arrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, size / 2),
  0.9, 0xffffff, 0.25, 0.15
);
cubeGroup.add(arrow);

// ================= TARGET ANGLES (interpolated) =================
const target = { pitch: 0, roll: 0, yaw: 0 };
const shown  = { pitch: 0, roll: 0, yaw: 0 };

// ================= LIVE DATA FROM SERVER =================
const io = window.io();
let packets = 0;

const $ = (id) => document.getElementById(id);

function setText(id, val, decimals = 2, unit = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = (typeof val === 'number' ? val.toFixed(decimals) : val) + unit;
}

io.on('connect', () => {
  $('conn').textContent = 'online';
  $('conn').className = 'badge good';
});

io.on('disconnect', () => {
  $('conn').textContent = 'offline';
  $('conn').className = 'badge bad';
});

io.on('telemetry', (t) => {
  // -------- panel --------
  setText('lat',   t.lat,   6);
  setText('lon',   t.lon,   6);
  setText('speed', t.speed, 2, ' km/h');
  setText('pitch', t.pitch, 2, '°');
  setText('roll',  t.roll,  2, '°');
  setText('yaw',   t.yaw,   2, '°');
  setText('gx',    t.gx,    2);
  setText('gy',    t.gy,    2);
  setText('gz',    t.gz,    2);
  setText('ax',    t.ax,    3);
  setText('ay',    t.ay,    3);
  setText('az',    t.az,    3);

  const hasFix = Math.abs(t.lat) > 0.0001 && Math.abs(t.lon) > 0.0001;
  const fixEl = $('fix');
  fixEl.textContent = hasFix ? 'YES' : 'NO';
  fixEl.className   = 'val ' + (hasFix ? 'good' : 'bad');

  packets++;
  $('count').textContent = packets;
  $('last').textContent  = new Date(t.ts).toLocaleTimeString();

  // -------- 3D rotation targets --------
  target.pitch = t.pitch;
  target.roll  = t.roll;
  target.yaw   = t.yaw;
});

// ================= RENDER LOOP =================
function lerp(a, b, t) { return a + (b - a) * t; }

function shortAngle(a, b) {
  // shortest angular difference so the cube takes the short path
  let d = ((b - a + 180) % 360) - 180;
  if (d < -180) d += 360;
  return a + d;
}

function animate() {
  requestAnimationFrame(animate);

  // Smooth toward the latest angles
  shown.pitch = lerp(shown.pitch, shortAngle(shown.pitch, target.pitch), 0.15);
  shown.roll  = lerp(shown.roll,  shortAngle(shown.roll,  target.roll),  0.15);
  shown.yaw   = lerp(shown.yaw,   shortAngle(shown.yaw,   target.yaw),   0.15);

  const rX = THREE.MathUtils.degToRad(shown.roll);
  const rY = THREE.MathUtils.degToRad(shown.pitch);
  const rZ = THREE.MathUtils.degToRad(shown.yaw);

  cubeGroup.rotation.set(rX, rY, rZ, 'XYZ');

  renderer.render(scene, camera);
}
animate();

// ================= RESIZE =================
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ================= OPTIONAL: fallback poll =================
// If Socket.IO misses a packet, poll /api/latest every 3 s to stay in sync
setInterval(async () => {
  try {
    const r = await fetch('/api/latest');
    if (r.status === 204) return;
    const j = await r.json();
    if (j && j.ok) io.emit('noop'); // ensure no throw if offline
  } catch (_) {}
}, 3000);