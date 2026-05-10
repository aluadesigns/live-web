// js/projector.js — floor projection with state machine
//
// States:
//   empty         — no phones connected. show QR + "scan me"
//   waiting       — my phone connected, peer phone not. show "waiting for someone..."
//   peer-waiting  — peer phone connected, my phone not. show small QR + "someone is waiting..."
//   active        — both phones connected. show white floor + shadow + crossfade video

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

let peerPos = null;
let currentDist = null;
let myPhoneOn = false;
let peerPhoneOn = false;
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

// Draw QR codes once, on load
drawQR('qr-empty');
drawQR('qr-peer');

ProxNet.connect({ session: SESSION, role: 'projector' });

ProxNet.on('peer_pos', (m) => {
  peerPos = m.pos;
  currentDist = m.dist;
  updateVideoOpacity();
});

ProxNet.on('presence', (m) => {
  myPhoneOn   = m[SESSION].phone;
  peerPhoneOn = m[SESSION === 'A' ? 'B' : 'A'].phone;
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
  if (myPhoneOn && peerPhoneOn)        next = 'active';
  else if (myPhoneOn && !peerPhoneOn)  next = 'waiting';
  else if (!myPhoneOn && peerPhoneOn)  next = 'peer-waiting';
  else                                  next = 'empty';

  if (next === state) return;
  state = next;

  overlayEmpty.classList.toggle('active',       state === 'empty');
  overlayWaiting.classList.toggle('active',     state === 'waiting');
  overlayPeerWaiting.classList.toggle('active', state === 'peer-waiting');
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

  // Only draw the shadow when in active state (both phones connected)
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

// Initialize state to 'empty' visually until first presence message arrives
updateState();