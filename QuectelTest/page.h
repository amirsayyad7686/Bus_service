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
body {
  background: #101820;
  color: #e0ffe0;
  font-family: monospace;
  margin: 0;
  padding: 16px;
  font-size: 14px;
}
h1 { color: #7fdcff; font-size: 18px; margin: 0 0 12px 0; }
h2 { color: #7fdcff; font-size: 14px; margin: 14px 0 6px 0; }
button {
  background: #203040;
  color: #7fffa5;
  border: 1px solid #4a8a6a;
  padding: 8px 12px;
  margin: 3px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  cursor: pointer;
}
button:hover { background: #7fffa5; color: #101820; }
input, textarea {
  background: #000;
  color: #7fffa5;
  border: 1px solid #4a8a6a;
  padding: 6px;
  font-family: monospace;
  font-size: 13px;
  border-radius: 3px;
}
textarea { width: 100%; min-height: 50px; }
#monitor {
  background: #000;
  color: #7fffa5;
  border: 1px solid #4a8a6a;
  padding: 8px;
  height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 12px;
}
#cubeBox {
  width: 200px;
  height: 200px;
  margin: 16px auto;
  perspective: 600px;
}
#cube {
  width: 200px;
  height: 200px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.1s;
}
.face {
  position: absolute;
  width: 200px;
  height: 200px;
  border: 2px solid #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 26px;
  font-weight: bold;
  color: #fff;
  background: rgba(0,180,255,0.7);
}
.front  { transform: translateZ(100px); background: rgba(255,60,60,0.8); }
.back   { transform: rotateY(180deg) translateZ(100px); background: rgba(60,255,60,0.8); }
.right  { transform: rotateY(90deg) translateZ(100px); background: rgba(60,60,255,0.8); }
.left   { transform: rotateY(-90deg) translateZ(100px); background: rgba(255,255,60,0.8); }
.top    { transform: rotateX(90deg) translateZ(100px); background: rgba(255,60,255,0.8); }
.bottom { transform: rotateX(-90deg) translateZ(100px); background: rgba(60,255,255,0.8); }
.row { margin: 4px 0; }
.info { color: #a0d0ff; font-size: 12px; margin: 6px 0; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.badge.on  { background: #1a5a1a; color: #9f9; }
.badge.off { background: #5a1a1a; color: #f99; }
</style>
</head>
<body>

<h1>ESP32 + MC60 Panel</h1>

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

<div class="info" id="anglesBox">P: 0 R: 0 Y: 0</div>
<div class="info" id="gpsBox">GPS: no fix</div>
<div class="info" id="wsBox">WS: connecting...</div>

<div class="row">
  <button onclick="wsReset()">Reset Orientation</button>
</div>

<h2>Basic</h2>
<div class="row">
  <button onclick="send('AT')">AT</button>
  <button onclick="send('ATI')">ATI</button>
  <button onclick="send('AT+CPIN?')">CPIN?</button>
</div>

<h2>GSM</h2>
<div class="row">
  <button onclick="send('AT+CSQ')">CSQ</button>
  <button onclick="send('AT+CREG?')">CREG?</button>
  <button onclick="send('AT+CGREG?')">CGREG?</button>
  <button onclick="send('AT+COPS?')">COPS?</button>
</div>

<h2>GNSS</h2>
<div class="row">
  <button onclick="send('AT+QGNSSC?')">QGNSSC?</button>
  <button onclick="send('AT+QGNSSC=0')">GNSS OFF</button>
  <button onclick="send('AT+QGNSSC=1')">GNSS ON</button>
  <button onclick="send('AT+QGNSSRD=&quot;NMEA/RMC&quot;')">RMC</button>
  <button onclick="send('AT+QGNSSRD=&quot;NMEA/GGA&quot;')">GGA</button>
</div>

<h2>TCP</h2>
<div class="row">
  <input id="host" value="181.41.194.124" style="width:160px;">
  <input id="port" value="5202" style="width:70px;">
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

<h2>Auto Send <span id="autoBadge" class="badge off">OFF</span></h2>
<div class="row">
  <button onclick="toggleAuto()">Toggle Auto (1 Hz)</button>
  <button onclick="refreshStatus()">Status</button>
</div>
<div class="info" id="autoInfo">ok: 0 fail: 0</div>

<h2>Custom</h2>
<div class="row">
  <input id="custom" value="AT" style="width:200px;">
  <button onclick="sendCustom()">Send</button>
  <button onclick="clearMon()">Clear</button>
</div>

<h2>Monitor</h2>
<div id="monitor"></div>
<div class="info" id="statusBox">polling...</div>

<script>
var mon = document.getElementById('monitor');
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
function toggleAuto(){
  fetch('/auto').then(function(r){ return r.text(); }).then(function(t){
    var b = document.getElementById('autoBadge');
    b.textContent = t;
    b.className = 'badge ' + (t === 'ON' ? 'on' : 'off');
  });
}
function useLive(){
  fetch('/status').then(function(r){ return r.json(); }).then(function(j){
    document.getElementById('payload').value =
      'client23832:' + j.lat.toFixed(6) + ',' + j.lon.toFixed(6) + ',' +
      j.pitch.toFixed(2) + ',' + j.roll.toFixed(2) + ',' + j.yaw.toFixed(2);
  });
}
function refreshStatus(){
  fetch('/status').then(function(r){ return r.json(); }).then(function(j){
    document.getElementById('autoInfo').textContent =
      'ok: ' + j.ok + '  fail: ' + j.fail + '  busy: ' + j.busy;
    document.getElementById('anglesBox').textContent =
      'P: ' + j.pitch.toFixed(1) + '  R: ' + j.roll.toFixed(1) + '  Y: ' + j.yaw.toFixed(1);
    document.getElementById('gpsBox').textContent = j.gps
      ? ('GPS: ' + j.lat.toFixed(6) + ', ' + j.lon.toFixed(6))
      : 'GPS: no fix';
  });
}

try {
  sock = new WebSocket('ws://' + location.hostname + '/ws');
  sock.onopen  = function(){ document.getElementById('wsBox').textContent = 'WS: connected'; };
  sock.onclose = function(){ document.getElementById('wsBox').textContent = 'WS: closed'; };
  sock.onerror = function(){ document.getElementById('wsBox').textContent = 'WS: error'; };
  sock.onmessage = function(ev){
    try {
      var d = JSON.parse(ev.data);
      if (d.pitch !== undefined) {
        document.getElementById('cube').style.transform =
          'rotateX(' + d.roll + 'deg) rotateY(' + d.pitch + 'deg) rotateZ(' + d.yaw + 'deg)';
      }
    } catch(e) {}
  };
} catch(e) {
  document.getElementById('wsBox').textContent = 'WS: failed ' + e.message;
}

function wsReset(){
  if (sock && sock.readyState === WebSocket.OPEN) sock.send('reset');
}

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