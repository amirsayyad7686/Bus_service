import * as THREE from 'three';

/* ==================================================================
   1. THREE.JS SCENE
   ================================================================== */
const canvas   = document.getElementById('carCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x05080b, 12, 26);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4.2, 3.2, 5.0);
camera.lookAt(0, 0.35, 0);

// Lights
const amb = new THREE.AmbientLight(0x88aacc, 0.55);
scene.add(amb);

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(6, 10, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
scene.add(key);

const rim = new THREE.DirectionalLight(0x3aa0ff, 0.7);
rim.position.set(-6, 4, -5);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xff8866, 0.35);
fill.position.set(-3, 2, 6);
scene.add(fill);

/* ---------- Ground: grid + soft pad ---------- */
const grid = new THREE.GridHelper(20, 40, 0x1c3040, 0x0e1a22);
grid.position.y = 0;
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

// Circular "pad" for the car to sit on
const padGeo = new THREE.CircleGeometry(3.4, 64);
const padMat = new THREE.MeshStandardMaterial({
  color: 0x0d1a22, roughness: 0.95, metalness: 0.05,
  transparent: true, opacity: 0.85
});
const pad = new THREE.Mesh(padGeo, padMat);
pad.rotation.x = -Math.PI / 2;
pad.position.y = 0.002;
pad.receiveShadow = true;
scene.add(pad);

/* ==================================================================
   2. CAR MESH — built from primitives
   ================================================================== */
function buildCar() {
  const car = new THREE.Group();

  // ---- Materials ----
  const paint = new THREE.MeshStandardMaterial({
    color: 0x1e6bff, metalness: 0.7, roughness: 0.28
  });
  const paintDark = new THREE.MeshStandardMaterial({
    color: 0x144aa8, metalness: 0.7, roughness: 0.35
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x0b0d10, metalness: 0.3, roughness: 0.85
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1620, metalness: 0.95, roughness: 0.05,
    transparent: true, opacity: 0.75
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd8e6f5, metalness: 1.0, roughness: 0.12
  });
  const headlight = new THREE.MeshStandardMaterial({
    color: 0xfff5d0, emissive: 0xfff0b0, emissiveIntensity: 2.2
  });
  const taillight = new THREE.MeshStandardMaterial({
    color: 0xff2233, emissive: 0xff0018, emissiveIntensity: 2.0
  });
  const tire = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, metalness: 0.0, roughness: 0.95
  });
  const rim = new THREE.MeshStandardMaterial({
    color: 0xc8d8e8, metalness: 0.95, roughness: 0.15
  });
  const rimDark = new THREE.MeshStandardMaterial({
    color: 0x1a1f24, metalness: 0.6, roughness: 0.5
  });

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // ---- Lower chassis ----
  const chassis = box(0.95, 0.16, 2.20, black);
  chassis.position.y = 0.18;
  chassis.castShadow = true; chassis.receiveShadow = true;
  car.add(chassis);

  // ---- Main body ----
  const body = box(0.98, 0.34, 2.05, paint);
  body.position.y = 0.42;
  body.castShadow = true; body.receiveShadow = true;
  car.add(body);

  // ---- Hood (front slope) ----
  const hood = box(0.90, 0.10, 0.65, paint);
  hood.position.set(0, 0.63, 0.62);
  hood.rotation.x = -0.08;
  hood.castShadow = true;
  car.add(hood);

  // ---- Trunk (rear) ----
  const trunk = box(0.90, 0.12, 0.48, paint);
  trunk.position.set(0, 0.63, -0.78);
  trunk.rotation.x = 0.05;
  trunk.castShadow = true;
  car.add(trunk);

  // ---- Cabin / roof ----
  const cabin = box(0.82, 0.34, 1.00, paint);
  cabin.position.set(0, 0.76, -0.12);
  cabin.castShadow = true;
  car.add(cabin);

  // Roof top slab (slightly darker)
  const roof = box(0.78, 0.06, 0.95, paintDark);
  roof.position.set(0, 0.94, -0.12);
  roof.castShadow = true;
  car.add(roof);

  // ---- Windshield (sloped, front of cabin) ----
  const windshield = box(0.78, 0.36, 0.05, glass);
  windshield.position.set(0, 0.80, 0.38);
  windshield.rotation.x = -0.38;
  car.add(windshield);

  // ---- Rear window ----
  const rearWin = box(0.78, 0.34, 0.05, glass);
  rearWin.position.set(0, 0.80, -0.62);
  rearWin.rotation.x = 0.42;
  car.add(rearWin);

  // ---- Side windows ----
  const sideWinGeo = new THREE.BoxGeometry(0.02, 0.26, 0.85);
  const sideL = new THREE.Mesh(sideWinGeo, glass);
  sideL.position.set(0.41, 0.80, -0.12);
  car.add(sideL);

  const sideR = sideL.clone();
  sideR.position.x = -0.41;
  car.add(sideR);

  // B-pillar (black strip between front and rear side window)
  const pillarGeo = new THREE.BoxGeometry(0.03, 0.26, 0.05);
  const pillarL = new THREE.Mesh(pillarGeo, black);
  pillarL.position.set(0.42, 0.80, -0.12);
  car.add(pillarL);
  const pillarR = pillarL.clone(); pillarR.position.x = -0.42; car.add(pillarR);

  // ---- A-pillars (frame of windshield) ----
  const apGeo = new THREE.BoxGeometry(0.04, 0.36, 0.05);
  const apL = new THREE.Mesh(apGeo, paintDark);
  apL.position.set(0.40, 0.80, 0.36);
  apL.rotation.x = -0.38;
  car.add(apL);
  const apR = apL.clone(); apR.position.x = -0.40; car.add(apR);

  // ---- Front bumper ----
  const bumperF = box(0.96, 0.14, 0.10, black);
  bumperF.position.set(0, 0.30, 1.06);
  car.add(bumperF);

  // ---- Rear bumper ----
  const bumperR = box(0.96, 0.14, 0.10, black);
  bumperR.position.set(0, 0.30, -1.06);
  car.add(bumperR);

  // ---- Side skirts ----
  const skirtL = box(0.04, 0.06, 1.60, black);
  skirtL.position.set(0.50, 0.20, 0);
  car.add(skirtL);
  const skirtR = skirtL.clone(); skirtR.position.x = -0.50; car.add(skirtR);

  // ---- Grille (front) ----
  const grille = box(0.62, 0.14, 0.04, black);
  grille.position.set(0, 0.48, 1.06);
  car.add(grille);

  // Grille chrome line
  const grilleLine = box(0.64, 0.02, 0.05, chrome);
  grilleLine.position.set(0, 0.55, 1.06);
  car.add(grilleLine);
  const grilleLine2 = grilleLine.clone();
  grilleLine2.position.y = 0.41;
  car.add(grilleLine2);

  // ---- Headlights ----
  const hlGeo = new THREE.BoxGeometry(0.22, 0.09, 0.05);
  const hlL = new THREE.Mesh(hlGeo, headlight);
  hlL.position.set(0.32, 0.55, 1.07);
  car.add(hlL);
  const hlR = hlL.clone(); hlR.position.x = -0.32; car.add(hlR);

  // ---- Fog lights ----
  const fogGeo = new THREE.BoxGeometry(0.10, 0.06, 0.04);
  const fgL = new THREE.Mesh(fogGeo, headlight);
  fgL.position.set(0.34, 0.36, 1.07);
  car.add(fgL);
  const fgR = fgL.clone(); fgR.position.x = -0.34; car.add(fgR);

  // ---- Taillights ----
  const tlGeo = new THREE.BoxGeometry(0.24, 0.10, 0.04);
  const tlL = new THREE.Mesh(tlGeo, taillight);
  tlL.position.set(0.34, 0.55, -1.07);
  car.add(tlL);
  const tlR = tlL.clone(); tlR.position.x = -0.34; car.add(tlR);

  // ---- License plate ----
  const plate = box(0.28, 0.08, 0.02, new THREE.MeshStandardMaterial({
    color: 0xf5f5f5, roughness: 0.9
  }));
  plate.position.set(0, 0.30, -1.11);
  car.add(plate);

  // ---- Side mirrors ----
  function mirror(side) {
    const g = new THREE.Group();
    const arm = box(0.10, 0.03, 0.03, black);
    arm.position.x = side * 0.06;
    g.add(arm);
    const housing = box(0.10, 0.08, 0.06, paintDark);
    housing.position.x = side * 0.13;
    g.add(housing);
    const glassM = box(0.02, 0.06, 0.05, chrome);
    glassM.position.x = side * 0.19;
    g.add(glassM);
    g.position.set(side * 0.52, 0.72, 0.36);
    return g;
  }
  car.add(mirror( 1));
  car.add(mirror(-1));

  // ---- Wheels (detailed) ----
  function makeWheel(x, z) {
    const g = new THREE.Group();

    // Tire
    const tireGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 32);
    tireGeo.rotateZ(Math.PI / 2);
    const t = new THREE.Mesh(tireGeo, tire);
    t.castShadow = true;
    g.add(t);

    // Tread ring (slightly larger, dark)
    const treadGeo = new THREE.TorusGeometry(0.24, 0.025, 8, 32);
    treadGeo.rotateY(Math.PI / 2);
    const tread = new THREE.Mesh(treadGeo, black);
    g.add(tread);

    // Rim disc
    const rimGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.17, 24);
    rimGeo.rotateZ(Math.PI / 2);
    const r = new THREE.Mesh(rimGeo, rim);
    g.add(r);

    // Hub
    const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 12);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, rimDark);
    g.add(hub);

    // 5 spokes
    for (let i = 0; i < 5; i++) {
      const spokeGeo = new THREE.BoxGeometry(0.02, 0.14, 0.04);
      const spoke = new THREE.Mesh(spokeGeo, rimDark);
      spoke.position.z = 0.155;
      spoke.rotation.x = (i / 5) * Math.PI * 2;
      // rotate around wheel axis: we need to rotate the spoke around X in local plane
      spoke.rotation.set((i / 5) * Math.PI * 2, 0, 0);
      // move spokes outward from hub center
      spoke.position.y = 0;
      spoke.position.x = 0;
      // simpler: place at radius, using geometry rotation
      g.add(spoke);
    }

    // simpler spokes: radial lines
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const s = box(0.02, 0.26, 0.02, rimDark);
      s.position.set(0.16, Math.cos(ang) * 0.09, Math.sin(ang) * 0.09);
      g.add(s);
    }

    g.position.set(x, 0.24, z);
    return g;
  }

  car.add(makeWheel( 0.55,  0.68));
  car.add(makeWheel(-0.55,  0.68));
  car.add(makeWheel( 0.55, -0.68));
  car.add(makeWheel(-0.55, -0.68));

  // ---- Exhaust pipes ----
  const exGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.10, 12);
  exGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exGeo, chrome);
  exL.position.set(0.32, 0.24, -1.12);
  car.add(exL);
  const exR = exL.clone(); exR.position.x = -0.32; car.add(exR);

  // ---- Spoiler ----
  const spoilerStem = box(0.04, 0.10, 0.06, black);
  spoilerStem.position.set(0.34, 0.70, -0.95);
  car.add(spoilerStem);
  const spoilerStem2 = spoilerStem.clone(); spoilerStem2.position.x = -0.34;
  car.add(spoilerStem2);
  const spoilerBlade = box(0.85, 0.04, 0.18, paintDark);
  spoilerBlade.position.set(0, 0.78, -0.98);
  spoilerBlade.castShadow = true;
  car.add(spoilerBlade);

  return car;
}

/* ---------- Add the car to a parent group so we can rotate it ---------- */
const carGroup = new THREE.Group();
scene.add(carGroup);

const car = buildCar();
carGroup.add(car);

/* ---------- Soft contact shadow under car ---------- */
const shadowGeo = new THREE.CircleGeometry(1.1, 32);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.35
});
const shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.position.y = 0.003;
scene.add(shadowBlob);

/* ==================================================================
   3. SIMPLE ORBIT CONTROLS (no import map needed)
   ================================================================== */
const orbit = { theta: 0.65, phi: 1.15, radius: 7.2, target: new THREE.Vector3(0, 0.4, 0) };
let dragging = false, lastX = 0, lastY = 0;

canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('mouseup',   () => dragging = false);
canvas.addEventListener('mouseleave',() => dragging = false);
canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  orbit.theta -= dx * 0.008;
  orbit.phi   -= dy * 0.008;
  orbit.phi = Math.max(0.25, Math.min(Math.PI / 2 - 0.05, orbit.phi));
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  orbit.radius *= (1 + Math.sign(e.deltaY) * 0.08);
  orbit.radius = Math.max(3.5, Math.min(16, orbit.radius));
}, { passive: false });

// Touch
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
});
canvas.addEventListener('touchmove', (e) => {
  if (!dragging || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - lastX, dy = t.clientY - lastY;
  lastX = t.clientX; lastY = t.clientY;
  orbit.theta -= dx * 0.008;
  orbit.phi   -= dy * 0.008;
  orbit.phi = Math.max(0.25, Math.min(Math.PI / 2 - 0.05, orbit.phi));
});
canvas.addEventListener('touchend', () => dragging = false);

function updateCamera() {
  const x = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
  const y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
  const z = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
  camera.position.set(x, y, z);
  camera.lookAt(orbit.target);
}

/* ==================================================================
   4. SPEED GAUGE (canvas 2D)
   ================================================================== */
class SpeedGauge {
  constructor(canvas, maxSpeed = 120) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.max = maxSpeed;
    this.displayed = 0;
    this.target = 0;
  }

  setSpeed(kmh) { this.target = Math.max(0, kmh); }

  tick() {
    this.displayed += (this.target - this.displayed) * 0.15;
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

    const cx = w / 2, cy = h * 0.62;
    const R = Math.min(w * 0.42, h * 0.75);

    const a0 = 0.75 * Math.PI;
    const a1 = 2.25 * Math.PI;
    const sweep = a1 - a0;

    // Outer bezel
    ctx.beginPath();
    ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
    ctx.fillStyle = '#0a141b';
    ctx.fill();

    // Background arc
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#17252e';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();

    // Filled arc (colored)
    const frac = Math.max(0, Math.min(1, this.displayed / this.max));
    let color = '#38e5a0';
    if (frac > 0.75) color = '#ff6b6b';
    else if (frac > 0.5) color = '#ffd866';

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + frac * sweep);
    ctx.stroke();

    // Ticks + labels
    ctx.lineWidth = 2;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const TICKS = 12;
    for (let i = 0; i <= TICKS; i++) {
      const t = i / TICKS;
      const a = a0 + t * sweep;
      const major = i % 2 === 0;
      const r1 = R - (major ? 20 : 14);
      const r2 = R - 6;
      ctx.strokeStyle = major ? '#6f8899' : '#3a4a55';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
      if (major) {
        const lx = cx + Math.cos(a) * (R - 32);
        const ly = cy + Math.sin(a) * (R - 32);
        ctx.fillStyle = '#7f9aab';
        ctx.fillText(Math.round(t * this.max).toString(), lx, ly);
      }
    }

    // Needle
    const aN = a0 + frac * sweep;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(aN);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ff5566';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(R - 22, 0);
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;

    // Hub
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#0a141b';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Digital readout
    ctx.fillStyle = color;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.displayed.toFixed(1), cx, cy + R * 0.42);

    ctx.fillStyle = '#6f8899';
    ctx.font = '10px monospace';
    ctx.fillText('km/h', cx, cy + R * 0.42 + 18);
  }
}

/* ==================================================================
   5. TRACK MAP (canvas 2D — draws the trail)
   ================================================================== */
/* ==================================================================
   5. LEAFLET TRACK MAP
   ================================================================== */
class TrackMap {
  constructor(divId, opts = {}) {
    this.follow = true;
    this.startLatLng = opts.center || [29.5918, 52.5837];   // Shiraz default
    this.startZoom   = opts.zoom   || 14;
    this.points = [];
    this.totalDistance = 0;

    this.map = L.map(divId, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    }).setView(this.startLatLng, this.startZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.trail = L.polyline([], {
      color: '#38e5a0',
      weight: 4,
      opacity: 0.9,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(this.map);

    // glow underlay
    this.glow = L.polyline([], {
      color: '#38e5a0',
      weight: 10,
      opacity: 0.22,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(this.map);

    this.marker = null;
    this.startMarker = null;

    // First fix will set the view
    this.locked = false;
  }

  clear() {
    this.points = [];
    this.totalDistance = 0;
    this.trail.setLatLngs([]);
    this.glow.setLatLngs([]);
    if (this.marker) { this.map.removeLayer(this.marker); this.marker = null; }
    if (this.startMarker) { this.map.removeLayer(this.startMarker); this.startMarker = null; }
    this.locked = false;
  }

  toggleFollow() {
    this.follow = !this.follow;
    if (this.follow && this.points.length) {
      const last = this.points[this.points.length - 1];
      this.map.panTo([last.lat, last.lon], { animate: true });
    }
    return this.follow;
  }

  addPoint(lat, lon) {
    if (Math.abs(lat) < 0.0001 || Math.abs(lon) < 0.0001) return;

    const last = this.points[this.points.length - 1];
    if (last && last.lat === lat && last.lon === lon) return;

    if (last) this.totalDistance += haversine(last.lat, last.lon, lat, lon);

    this.points.push({ lat, lon });
    if (this.points.length > 10000) this.points.shift();

    const latlngs = this.points.map(p => [p.lat, p.lon]);
    this.trail.setLatLngs(latlngs);
    this.glow.setLatLngs(latlngs);

    // Current position marker (car-shaped div icon)
    const here = [lat, lon];
    const carIcon = L.divIcon({
      className: 'car-marker',
      html: `<div class="car-marker-inner">
               <svg width="26" height="26" viewBox="0 0 24 24" fill="#ffd866">
                 <path d="M12 2 L19 10 L15 10 L15 22 L9 22 L9 10 L5 10 Z"/>
               </svg>
             </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    if (!this.marker) {
      this.marker = L.marker(here, { icon: carIcon }).addTo(this.map);
    } else {
      this.marker.setLatLng(here);
    }

    // Start marker
    if (!this.startMarker) {
      const startIcon = L.divIcon({
        className: 'start-marker',
        html: `<div class="start-marker-inner"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      this.startMarker = L.marker(this.points[0] ? [this.points[0].lat, this.points[0].lon] : here,
        { icon: startIcon }).addTo(this.map);
    }

    // Auto-fit only the first time, then follow
    if (!this.locked) {
      this.map.setView(here, 16);
      this.locked = true;
    } else if (this.follow) {
      this.map.panTo(here, { animate: true, duration: 0.4 });
    }
  }
}


// Haversine distance in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ==================================================================
   6. INSTANTIATE
   ================================================================== */
const gauge = new SpeedGauge(document.getElementById('speedGauge'), 120);
const trackMap = new TrackMap('map', { center: [29.5918, 52.5837], zoom: 14 });
window.trackMap = trackMap;   // expose for the tab switcher
document.getElementById('clearMap').addEventListener('click', () => trackMap.clear());

const followBtn = document.getElementById('followBtn');
followBtn.addEventListener('click', () => {
  const on = trackMap.toggleFollow();
  followBtn.textContent = 'follow: ' + (on ? 'on' : 'off');
  followBtn.classList.toggle('active', on);
});
followBtn.classList.add('active');

// Make sure Leaflet recalculates the size after layout settles
setTimeout(() => trackMap.map.invalidateSize(), 200);
window.addEventListener('resize', () => trackMap.map.invalidateSize());

/* ==================================================================
   7. SOCKET.IO — LIVE DATA
   ================================================================== */
const io = window.io();
const $ = id => document.getElementById(id);
let packets = 0;

// Smoothed angles for the car
const target = { pitch: 0, roll: 0, yaw: 0 };
const shown  = { pitch: 0, roll: 0, yaw: 0 };

io.on('connect', () => {
  $('conn').textContent = 'online';
  $('conn').className = 'badge good';
});
io.on('disconnect', () => {
  $('conn').textContent = 'offline';
  $('conn').className = 'badge bad';
});

io.on('telemetry', (t) => {
  // --- gauge ---
  gauge.setSpeed(t.speed);

  // --- map ---
  if (Math.abs(t.lat) > 0.0001 && Math.abs(t.lon) > 0.0001) {
    trackMap.addPoint(t.lat, t.lon);
  }

  // --- panel ---
  setText('lat',   t.lat,   6);
  setText('lon',   t.lon,   6);
  setText('pitch', t.pitch, 2, '°');
  setText('roll',  t.roll,  2, '°');
  setText('yaw',   t.yaw,   2, '°');
  setText('gx',    t.gx,    2);
  setText('gy',    t.gy,    2);
  setText('gz',    t.gz,    2);
  setText('ax',    t.ax,    3);
  setText('ay',    t.ay,    3);
  setText('az',    t.az,    3);
  setText('dist',  (trackMap.totalDistance / 1000), 3, ' km');

  const hasFix = Math.abs(t.lat) > 0.0001 && Math.abs(t.lon) > 0.0001;
  const f = $('fix');
  f.textContent = hasFix ? 'YES' : 'NO';
  f.className   = 'val ' + (hasFix ? 'good' : 'bad');

  packets++;
  $('count').textContent = packets;
  $('last').textContent  = new Date(t.ts || Date.now()).toLocaleTimeString();

  // --- 3D car targets ---
  // Car's local axes:  +X right, +Y up, +Z forward
  // We map sensor pitch → car X (nose up/down)
  //          sensor yaw   → car Y (heading)
  //          sensor roll  → car Z (side roll)
  // If this feels swapped on your rig, swap the axis assignments below.
  target.pitch = t.pitch;
  target.roll  = t.roll;
  target.yaw   = t.yaw;
});

function setText(id, val, decimals = 2, unit = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = (typeof val === 'number' ? val.toFixed(decimals) : val) + unit;
}
/* ==================================================================
   10. MOBILE TAB SWITCHER
   ================================================================== */
(function setupTabs() {
  const tabs = document.querySelectorAll('#tabs button');
  if (!tabs.length) return;

  function setTab(name) {
    document.body.setAttribute('data-tab', name);
    tabs.forEach(b => b.classList.toggle('active', b.dataset.view === name));

    // Leaflet needs a size recalculation when its container becomes visible
    if (name === 'map-card' && window.trackMap && window.trackMap.map) {
      setTimeout(() => window.trackMap.map.invalidateSize(), 60);
    }
  }

  // Default tab on mobile
  if (window.matchMedia('(max-width: 860px)').matches) {
    setTab('viewer');
  } else {
    document.body.removeAttribute('data-tab');
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.view));
  });

  // Re-evaluate when the viewport crosses the breakpoint
  window.addEventListener('resize', () => {
    if (window.matchMedia('(max-width: 860px)').matches) {
      if (!document.body.hasAttribute('data-tab')) setTab('viewer');
    } else {
      document.body.removeAttribute('data-tab');
    }
  });
})();
/* ==================================================================
   8. RENDER LOOP
   ================================================================== */
function lerp(a, b, t) { return a + (b - a) * t; }

function shortAngle(a, b) {
  let d = ((b - a + 180) % 360) - 180;
  if (d < -180) d += 360;
  return a + d;
}

function animate() {
  requestAnimationFrame(animate);

  // Smooth toward latest angles
  shown.pitch = lerp(shown.pitch, shortAngle(shown.pitch, target.pitch), 0.12);
  shown.roll  = lerp(shown.roll,  shortAngle(shown.roll,  target.roll),  0.12);
  shown.yaw   = lerp(shown.yaw,   shortAngle(shown.yaw,   target.yaw),   0.12);

  // Apply rotations to the car group
  carGroup.rotation.set(
    THREE.MathUtils.degToRad(shown.pitch),   // X
    THREE.MathUtils.degToRad(shown.yaw),     // Y
    THREE.MathUtils.degToRad(shown.roll),    // Z
    'YXZ'
  );

  gauge.tick();

  updateCamera();
  renderer.render(scene, camera);
}

/* ==================================================================
   9. RESIZE
   ================================================================== */
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();
animate();



