// js/projector.js — floor projection with state machine
//
// States (per side):
//   empty         — my phone NOT connected, peer phone NOT connected
//   waiting       — my phone connected, peer phone NOT connected
//   peer-waiting  — my phone NOT connected, peer phone connected
//   welcome       — both phones connected, my-side blob NOT detected yet
//   active        — both phones connected, my-side blob detected
//                   (white floor + peer shadow + crossfade video)

const CONFIG = {
  shadowRadius: 120,
  shadowMaxOpacity: 0.55,
  videoCurve: 4,
};

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();

const canvas    = document.getElementById('stage');
const ctx       = canvas.getContext('2d');
const peerVideo = document.getElementById('peer-video');

const overlayEmpty       = document.getElementById('overlay-empty');
const overlayWaiting     = document.getElementById('overlay-waiting');
const overlayPeerWaiting = document.getElementById('overlay-peer-waiting');
const overlayWelcome     = document.getElementById('overlay-welcome');

let peerPos = null;
let currentDist = null;
let myPhoneOn = false;
let peerPhoneOn = false;
let mySideBlob = false;     // has THIS side's tracker reported a position
let mySideEverStepped = false;  // has my-side blob ever been detected this session
let state = null;

let pc = null;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const PEER_COLOR = SESSION === 'A' ? '0,80,255' : '255,40,40';

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = innerWidth  * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width  = innerWidth  + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

drawQR('qr-empty');
drawQR('qr-peer');

ProxNet.connect({ session: SESSION, role: 'projector' });

ProxNet.on('peer_pos', (m) => {
  peerPos = m.pos;
  currentDist = m.dist;
  // Tracker reported a position this frame? Latch the "ever stepped" flag.
  if (m.mySideBlob) {
    mySideBlob = true;
    mySideEverStepped = true;
  } else {
    mySideBlob = false;
  }
  updateState();
  updateVideoOpacity();
});

ProxNet.on('presence', (m) => {
  const wasMyPhone   = myPhoneOn;
  const wasPeerPhone = peerPhoneOn;
  myPhoneOn   = m[SESSION].phone;
  peerPhoneOn = m[SESSION === 'A' ? 'B' : 'A'].phone;

  // If both phones disconnect, reset the welcome trigger so the next pair
  // sees "step onto the light" again.
  if (!myPhoneOn && !peerPhoneOn && (wasMyPhone || wasPeerPhone)) {
    mySideEverStepped = false;
  }

  updateState();
});

ProxNet.on('error', (msg) => console.error('server:', msg));

ProxNet.on('rtc_projector_signal', async (m) => {
  try {
    if (m.kind === 'offer') {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.ontrack = (e) => {
        peerVideo.srcObject = e.streams[0] || new MediaStream([e.track]);
        peerVideo.play().catch(err => console.error('peer video play:', err));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) ProxNet.send('rtc_projector_signal', { kind: 'ice', candidate: e.candidate });
      };
      await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ProxNet.send('rtc_projector_signal', { kind: 'answer', sdp: answer });
    } else if (m.kind === 'ice' && pc) {
      await pc.addIceCandidate(new RTCIceCandidate(m.candidate));
    }
  } catch (err) {
    console.error('projector signal error:', err);
  }
});

function updateState() {
  let next;
  if (!myPhoneOn && !peerPhoneOn)       next = 'empty';
  else if (myPhoneOn && !peerPhoneOn)   next = 'waiting';
  else if (!myPhoneOn && peerPhoneOn)   next = 'peer-waiting';
  else if (!mySideEverStepped)          next = 'welcome';
  else                                  next = 'active';

  if (next === state) return;
  state = next;

  overlayEmpty.classList.toggle('active',       state === 'empty');
  overlayWaiting.classList.toggle('active',     state === 'waiting');
  overlayPeerWaiting.classList.toggle('active', state === 'peer-waiting');
  overlayWelcome.classList.toggle('active',     state === 'welcome');
}

function updateVideoOpacity() {
  if (state !== 'active' || currentDist === null) {
    peerVideo.style.opacity = 0;
    return;
  }
  const d01 = Math.min(1, Math.max(0, currentDist));
  const opacity = Math.pow(1 - d01, CONFIG.videoCurve);
  peerVideo.style.opacity = opacity.toFixed(3);
}

function drawQR(canvasId) {
  const url = `${location.origin}/phone.html?session=${SESSION}`;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const c = document.getElementById(canvasId);
  const cx = c.getContext('2d');
  const size = c.width;
  const cells = qr.getModuleCount();
  const cellSize = size / cells;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
  cx.fillStyle = '#000';
  for (let r = 0; r < cells; r++) for (let cc = 0; cc < cells; cc++)
    if (qr.isDark(r, cc)) cx.fillRect(cc * cellSize, r * cellSize, cellSize, cellSize);
}

function render() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Only draw the partner's shadow when in active state AND we have a peer position
  if (state === 'active' && peerPos) {
    const x = peerPos.x * innerWidth;
    const y = peerPos.y * innerHeight;
    const r = CONFIG.shadowRadius;
    const a = CONFIG.shadowMaxOpacity;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0,   `rgba(${PEER_COLOR},${a})`);
    grad.addColorStop(0.5, `rgba(${PEER_COLOR},${a * 0.4})`);
    grad.addColorStop(1,   `rgba(${PEER_COLOR},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(render);
}
render();

updateState();