#ifndef INDEX_HTML_H
#define INDEX_HTML_H

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"HTMLPAGE(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 MC60 Panel</title>
<style>
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  background: #0a1017;
  color: #e0ffe0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin: 0;
  padding: 12px;
  font-size: 14px;
}

h1 { color: #7fdcff; font-size: 18px; margin: 0 0 12px 0; letter-spacing: .5px; }
h2 { color: #7fdcff; font-size: 13px; margin: 16px 0 6px 0;
     text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }

button {
  background: #182028;
  color: #7fffa5;
  border: 1px solid #3a5a4a;
  padding: 8px 12px;
  margin: 3px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
button:hover  { background: #7fffa5; color: #101820; }
button.active { background: #7fffa5; color: #101820; }

input, textarea {
  background: #000;
  color: #7fffa5;
  border: 1px solid #3a5a4a;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
  border-radius: 3px;
}
input:focus, textarea:focus { outline: 1px solid #7fffa5; }
textarea { width: 100%; min-height: 52px; resize: vertical; }

#monitor {
  background: #000;
  color: #7fffa5;
  border: 1px solid #3a5a4a;
  padding: 8px;
  height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 11px;
  line-height: 1.45;
  border-radius: 4px;
}

/* ================= CUBE ================= */
#cubeBox {
  width: 160px;
  height: 160px;
  margin: 10px auto;
  perspective: 600px;
}
#cube {
  width: 160px;
  height: 160px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.08s linear;
}
.face {
  position: absolute;
  width: 160px;
  height: 160px;
  border: 2px solid #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  background: rgba(0,180,255,0.7);
}
.front  { transform: translateZ(80px);             background: rgba(255,60,60,0.75); }
.back   { transform: rotateY(180deg) translateZ(80px); background: rgba(60,255,60,0.75); }
.right  { transform: rotateY(90deg)  translateZ(80px); background: rgba(60,60,255,0.75); }
.left   { transform: rotateY(-90deg) translateZ(80px); background: rgba(255,255,60,0.75); }
.top    { transform: rotateX(90deg)  translateZ(80px); background: rgba(255,60,255,0.75); }
.bottom { transform: rotateX(-90deg) translateZ(80px); background: rgba(60,255,255,0.75); }

/* ================= CARDS ================= */
.card {
  border: 1px solid #1c2a34;
  background: #0d161d;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.card h2 { margin-top: 0; }

.row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 0; }

.info { color: #8fb8cb; font-size: 12px; margin: 4px 0; }

.badge { padding: 2px 8px; border-radius: 10px; font-size: 11px;
         font-weight: 700; letter-spacing: .5px; }
.badge.on    { background: #143a25; color: #7fffa5; }
.badge.off   { background: #3a1414; color: #ff8c8c; }
.badge.warn  { background: #3a2e14; color: #ffd866; }

/* ================= POWER RAIL ================= */
.pwr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 6px;
}
.pwr-item {
  background: #071019;
  border: 1px solid #1c2a34;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color .2s, background .2s;
}
.pwr-item.ok   { background: #08261a; border-color: #166b3a; }
.pwr-item.warn { background: #241e08; border-color: #6a5620; }

.pwr-label {
  font-size: 10px;
  color: #6a8c9e;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.pwr-value {
  font-size: 15px;
  font-weight: 700;
  color: #e0ffe0;
  font-variant-numeric: tabular-nums;
}
.pwr-item.ok   .pwr-value { color: #25d366; }
.pwr-item.warn .pwr-value { color: #ffd866; }

.pwr-sub {
  font-size: 9px;
  color: #4a6673;
}

/* ================= AUTO CONNECT ================= */
.auto-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 10px;
}
.auto-step {
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid #1c2a34;
  color: #4a6673;
  background: #071019;
  font-family: monospace;
  letter-spacing: .3px;
}
.auto-step.active {
  border-color: #00f2fe;
  color: #00f2fe;
  background: #082936;
  box-shadow: 0 0 8px rgba(0,242,254,.4);
  animation: pulse-step 1s infinite;
}
.auto-step.done {
  border-color: #166b3a;
  color: #7fffa5;
  background: #08261a;
}
@keyframes pulse-step {
  0%, 100% { opacity: 1; }
  50%      { opacity: .55; }
}

@media (max-width: 420px) {
  .pwr-grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<h1>ESP32 + MC60 Panel</h1>

<!-- ============ 3D CUBE ============ -->
<div class="card">
  <div id="cubeBox">
    <div id="cube">
      <div class="face front">F</div>
      <div class="face back">B</div>
      <div class="face right">R</div>
      <div class="face left">L</div>
      <div class="face top">T</div>
      <div class="face bottom">D</div>
    </div>
  </div>
  <div class="info" id="anglesBox">P: 0.0  R: 0.0  Y: 0.0</div>
  <div class="info" id="gpsBox">GPS: no fix</div>
  <div class="info" id="wsBox">WS: connecting...</div>
  <div class="row">
    <button onclick="wsReset()">Reset Orientation</button>
  </div>
</div>

<!-- ============ POWER RAIL ============ -->
<div class="card">
  <h2>Power Rail</h2>
  <div class="pwr-grid">
    <div class="pwr-item" id="pwrStItem">
      <div class="pwr-label">LM66200 ST</div>
      <div class="pwr-value" id="pwrSt">—</div>
      <div class="pwr-sub">IO4 · rail status</div>
    </div>
    <div class="pwr-item" id="pwrVpItem">
      <div class="pwr-label">Sensor VP</div>
      <div class="pwr-value" id="pwrVp">— V</div>
      <div class="pwr-sub">IO36 · ADC</div>
    </div>
    <div class="pwr-item" id="pwrLedItem">
      <div class="pwr-label">SM5308 LED2</div>
      <div class="pwr-value" id="pwrLed">—</div>
      <div class="pwr-sub">IO23 · charge ind.</div>
    </div>
  </div>
</div>

<!-- ============ AUTO CONNECT ============ -->
<div class="card">
  <h2>
    Auto Connect
    <span id="autoBadge" class="badge off" style="margin-left:6px;">OFF</span>
  </h2>
  <div class="auto-steps" id="autoSteps">
    <div class="auto-step" data-phase="0">boot</div>
    <div class="auto-step" data-phase="1">sim</div>
    <div class="auto-step" data-phase="2">pdp</div>
    <div class="auto-step" data-phase="3">tcp</div>
    <div class="auto-step" data-phase="4">stream</div>
    <div class="auto-step" data-phase="5">online</div>
  </div>
  <div class="info" id="autoInfo" style="margin-top:8px;">
    ok: 0 fail: 0
  </div>
</div>

<!-- ============ BASIC / GSM / GNSS ============ -->
<div class="card">
  <h2>Basic</h2>
  <div class="row">
    <button onclick="send('AT')">AT</button>
    <button onclick="send('ATI')">ATI</button>
    <button onclick="send('AT+CPIN?')">CPIN?</button>
    <button onclick="send('AT+CFUN=1')">CFUN=1</button>
  </div>
</div>

<div class="card">
  <h2>GSM</h2>
  <div class="row">
    <button onclick="send('AT+CSQ')">CSQ</button>
    <button onclick="send('AT+CREG?')">CREG?</button>
    <button onclick="send('AT+CGREG?')">CGREG?</button>
    <button onclick="send('AT+COPS?')">COPS?</button>
  </div>
</div>

<div class="card">
  <h2>GNSS</h2>
  <div class="row">
    <button onclick="send('AT+QGNSSC?')">QGNSSC?</button>
    <button onclick="send('AT+QGNSSC=0')">OFF</button>
    <button onclick="send('AT+QGNSSC=1')">ON</button>
    <button onclick="send('AT+QGNSSRD=&quot;NMEA/RMC&quot;')">RMC</button>
    <button onclick="send('AT+QGNSSRD=&quot;NMEA/GGA&quot;')">GGA</button>
  </div>
</div>

<!-- ============ TCP ============ -->
<div class="card">
  <h2>TCP</h2>
  <div class="row">
    <input id="host" value="181.41.194.124" style="flex:2;min-width:140px;">
    <input id="port" value="5202" style="width:70px;">
  </div>
  <div class="row">
    <button onclick="tcpSetup()">PDP Setup</button>
    <button onclick="tcpOpen()">OPEN</button>
    <button onclick="tcpClose()">CLOSE</button>
    <button onclick="send('AT+QISTATE?')">State</button>
  </div>
  <div class="row">
    <textarea id="payload">client23832:29.611827,52.512102,12.34,-5.67,180.00</textarea>
  </div>
  <div class="row">
    <button onclick="tcpSend()">SEND</button>
    <button onclick="useLive()">Load live values</button>
  </div>
</div>

<!-- ============ CUSTOM / MONITOR ============ -->
<div class="card">
  <h2>Custom</h2>
  <div class="row">
    <input id="custom" value="AT" style="flex:2;min-width:120px;">
    <button onclick="sendCustom()">Send</button>
    <button onclick="clearMon()">Clear</button>
  </div>
</div>

<div class="card">
  <h2>Monitor</h2>
  <div id="monitor"></div>
  <div class="info" id="statusBox">polling...</div>
</div>

<script>
var mon      = document.getElementById('monitor');
var sock;
var autoScroll = true;

mon.addEventListener('scroll', function(){
  autoScroll = (mon.scrollTop + mon.clientHeight >= mon.scrollHeight - 5);
});

function append(t){
  if(!t) return;
  mon.textContent += t;
  if(mon.textContent.length > 40000) mon.textContent = mon.textContent.slice(-20000);
  if(autoScroll) mon.scrollTop = mon.scrollHeight;
}
function clearMon(){ mon.textContent = ''; }

function send(cmd){
  append('\n>> ' + cmd + '\n');
  fetch('/cmd?c=' + encodeURIComponent(cmd)).catch(function(e){ append('[ERR] ' + e); });
}
function sendCustom(){ send(document.getElementById('custom').value); }

function tcpSetup(){ append('\n>> PDP setup\n'); fetch('/tcpsetup'); }
function tcpOpen(){
  var h = document.getElementById('host').value;
  var p = document.getElementById('port').value;
  append('\n>> QIOPEN ' + h + ':' + p + '\n');
  fetch('/tcpopen?h=' + encodeURIComponent(h) + '&p=' + encodeURIComponent(p));
}
function tcpClose(){ append('\n>> QICLOSE\n'); fetch('/tcpclose'); }
function tcpSend(){
  var d = document.getElementById('payload').value;
  append('\n>> QISEND ' + d.length + ' bytes\n');
  fetch('/tcpsend?d=' + encodeURIComponent(d));
}

function useLive(){
  fetch('/status').then(function(r){ return r.json(); }).then(function(j){
    document.getElementById('payload').value =
      'client23832:' + j.lat.toFixed(6) + ',' + j.lon.toFixed(6) + ',' +
      j.pitch.toFixed(2) + ',' + j.roll.toFixed(2) + ',' + j.yaw.toFixed(2);
  });
}

/* ---------- status polling ---------- */
function refreshStatus(){
  fetch('/status').then(function(r){ return r.json(); }).then(function(j){
    // angles
    document.getElementById('anglesBox').textContent =
      'P: ' + j.pitch.toFixed(1) + '  R: ' + j.roll.toFixed(1) +
      '  Y: ' + j.yaw.toFixed(1);

    // gps
    document.getElementById('gpsBox').textContent = j.gps
      ? ('GPS: ' + j.lat.toFixed(6) + ', ' + j.lon.toFixed(6))
      : 'GPS: no fix';

    // tcp counters
    document.getElementById('autoInfo').textContent =
      'ok: ' + j.ok + '  fail: ' + j.fail + '  busy: ' + j.busy;

    // auto badge
    var b = document.getElementById('autoBadge');
    b.textContent = j.auto ? 'ON' : 'OFF';
    b.className   = 'badge ' + (j.auto ? 'on' : 'off');

    // auto step indicator
    var phase = (typeof j.phase === 'number') ? j.phase : 0;
    document.querySelectorAll('.auto-step').forEach(function(el){
      var p = parseInt(el.dataset.phase, 10);
      el.classList.remove('active', 'done');
      if (p < phase)       el.classList.add('done');
      else if (p === phase) el.classList.add('active');
    });

    // ---- power rail ----
    var st    = j.st;
    var vp    = j.vp;
    var led2  = j.led2;

    var stEl   = document.getElementById('pwrSt');
    var stItem = document.getElementById('pwrStItem');
    if (st === 0)       { stEl.textContent = 'OK';    stItem.className = 'pwr-item ok'; }
    else if (st === 1)  { stEl.textContent = 'FAULT'; stItem.className = 'pwr-item warn'; }
    else                { stEl.textContent = '—';     stItem.className = 'pwr-item'; }

    var vpEl   = document.getElementById('pwrVp');
    var vpItem = document.getElementById('pwrVpItem');
    if (typeof vp === 'number') {
      var volts = vp * 3.3 / 4095;
      vpEl.textContent = volts.toFixed(3) + ' V';
      vpItem.className = 'pwr-item' + (volts > 0.1 ? ' ok' : '');
    } else {
      vpEl.textContent = '—';
      vpItem.className = 'pwr-item';
    }

    var ledEl   = document.getElementById('pwrLed');
    var ledItem = document.getElementById('pwrLedItem');
    if (led2 === 1)       { ledEl.textContent = 'ON';  ledItem.className = 'pwr-item ok'; }
    else if (led2 === 0)  { ledEl.textContent = 'OFF'; ledItem.className = 'pwr-item'; }
    else                  { ledEl.textContent = '—';   ledItem.className = 'pwr-item'; }

  }).catch(function(){});
}

/* ---------- WebSocket ---------- */
try {
  sock = new WebSocket('ws://' + location.hostname + '/ws');
  sock.onopen  = function(){ document.getElementById('wsBox').textContent = 'WS: connected'; };
  sock.onclose = function(){ document.getElementById('wsBox').textContent = 'WS: closed'; };
  sock.onerror = function(){ document.getElementById('wsBox').textContent = 'WS: error'; };
  sock.onmessage = function(ev){
    try {
      var d = JSON.parse(ev.data);
      // Cube orientation: yaw around Y, pitch around X, roll around Z
      if (d.pitch !== undefined) {
        document.getElementById('cube').style.transform =
          'rotateX(' + d.pitch + 'deg) rotateY(' + d.yaw + 'deg) rotateZ(' + (-d.roll) + 'deg)';
      }
      // Live power update over WS too (instant response)
      if (d.st !== undefined) {
        var stEl   = document.getElementById('pwrSt');
        var stItem = document.getElementById('pwrStItem');
        if (d.st === 0)      { stEl.textContent = 'OK';    stItem.className = 'pwr-item ok'; }
        else if (d.st === 1) { stEl.textContent = 'FAULT'; stItem.className = 'pwr-item warn'; }
      }
      if (d.vp !== undefined) {
        var v = d.vp * 3.3 / 4095;
        document.getElementById('pwrVp').textContent = v.toFixed(3) + ' V';
        document.getElementById('pwrVpItem').className =
          'pwr-item' + (v > 0.1 ? ' ok' : '');
      }
      if (d.led2 !== undefined) {
        var ledEl = document.getElementById('pwrLed');
        var ledItem = document.getElementById('pwrLedItem');
        if (d.led2 === 1) { ledEl.textContent = 'ON';  ledItem.className = 'pwr-item ok'; }
        else              { ledEl.textContent = 'OFF'; ledItem.className = 'pwr-item'; }
      }
    } catch(e) {}
  };
} catch(e) {
  document.getElementById('wsBox').textContent = 'WS: failed ' + e.message;
}

function wsReset(){
  if (sock && sock.readyState === WebSocket.OPEN) sock.send('reset');
}

/* ---------- polling loops ---------- */
function poll(){
  fetch('/data').then(function(r){ return r.text(); }).then(function(t){
    append(t);
    document.getElementById('statusBox').textContent = 'ok';
  }).catch(function(){ document.getElementById('statusBox').textContent = 'err'; });
  setTimeout(poll, 500);
}
function pollStatus(){
  refreshStatus();
  setTimeout(pollStatus, 1500);
}
poll();
pollStatus();
</script>

</body>
</html>
)HTMLPAGE";

#endif