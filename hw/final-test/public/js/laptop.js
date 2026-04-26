// js/laptop.js — page logic for laptop.html

const CONFIG = {
  sendRate:   20,
  videoCurve: 4,
  // Playable area in VIDEO coords. The tracker only watches inside this rect,
  // and the white square on screen is drawn at the same place.
  areaWidth:    0.34,
  areaCenterX:  0.51,
  areaCenterY:  0.68,
  areaAspect:   16 / 9,
};

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();

// ─── DOM ────────────────────────────────────────────────────────────────
const startScreen = document.getElementById('start');
const startBtn    = document.getElementById('startBtn');
const stage       = document.getElementById('stage');
const localVideo  = document.getElementById('local-video');
const peerVideo   = document.getElementById('peer-video');
const overlay     = document.getElementById('overlay');
const ctx2d       = overlay.getContext('2d');

const elSessName  = document.getElementById('sess-name');
const elHudSess   = document.getElementById('hud-sess');
const elMePhone   = document.getElementById('me-phone');
const elPeerLap   = document.getElementById('peer-lap');
const elPeerPhone = document.getElementById('peer-phone');
const elDist      = document.getElementById('dist-val');

elSessName.textContent = SESSION;
elHudSess.textContent  = SESSION;

let myFingerSquare    = null;
let peerFingerSquare  = null;
let currentDist       = null;
let cameraStream      = null;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'loading…';
  try {
    await initCamera();
    await ProxTracking.init(localVideo, onPoint);
    ProxTracking.setRegion(computeROI());
    initSocket();
    initVideoRTC();
    initQR();
    startScreen.style.display = 'none';
    stage.style.display = 'block';
    resize();
    requestAnimationFrame(renderLoop);
    setInterval(sendPos, 1000 / CONFIG.sendRate);
  } catch (e) {
    console.error(e);
    startBtn.textContent = 'error — see console';
  }
});

window.addEventListener('resize', resize);
function resize() {
  const dpr = window.devicePixelRatio || 1;
  overlay.width  = innerWidth  * dpr;
  overlay.height = innerHeight * dpr;
  overlay.style.width  = innerWidth  + 'px';
  overlay.style.height = innerHeight + 'px';
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function initCamera() {
  let tempStream;
  try {
    tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) { throw new Error('camera permission denied'); }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  console.log('available cameras:', cams.map(c => c.label));
  tempStream.getTracks().forEach(t => t.stop());

  let chosen = cams[0];
  const want = params.get('camera');
  if (want) {
    const match = cams.find(c => c.label.toLowerCase().includes(want.toLowerCase()));
    if (match) chosen = match;
    else console.warn(`no camera matching "${want}", using default`);
  }
  console.log('using camera:', chosen.label);

  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: chosen.deviceId },
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  localVideo.srcObject = cameraStream;
  await new Promise(r => localVideo.onloadedmetadata = r);
  await localVideo.play();
}

// Compute the ROI rect in video coords from the area config.
// areaWidth is in width-fractions; the height needs to account for both
// the desired aspect (16:9) AND the video's native aspect (also 16:9), so
// that what we get is a real-world 16:9 rectangle on the floor.
function computeROI() {
  const vw = localVideo.videoWidth  || 1280;
  const vh = localVideo.videoHeight || 720;
  const videoAspect = vw / vh;   // ~1.78 for 16:9
  const w = CONFIG.areaWidth;
  // Real-world height fraction:
  //   real_h_fraction = w * videoAspect / areaAspect
  // Worked example: areaAspect = 16/9 = videoAspect → height = w
  //   In other words, w fills the same fraction of height as of width
  //   when the area aspect matches the video aspect.
  const h = w * videoAspect / CONFIG.areaAspect;
  return {
    x: CONFIG.areaCenterX - w / 2,
    y: CONFIG.areaCenterY - h / 2,
    w,
    h,
  };
}

// ─── Map video-coord ROI to on-screen pixel rect ─────────────────────────
// No mirror — display shows raw camera feed, so video coords map directly.
function roiScreenRect() {
  const vw = localVideo.videoWidth, vh = localVideo.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0, w: 0, h: 0 };

  const screenW = innerWidth, screenH = innerHeight;
  const scale = Math.max(screenW / vw, screenH / vh);
  const displayedW = vw * scale;
  const displayedH = vh * scale;
  const offsetX = (screenW - displayedW) / 2;
  const offsetY = (screenH - displayedH) / 2;

  const R = computeROI();
  const x = offsetX + R.x * displayedW;
  const y = offsetY + R.y * displayedH;
  const w = R.w * displayedW;
  const h = R.h * displayedH;

  return { x, y, w, h };
}

function onPoint(p) {
  if (!p) { myFingerSquare = null; return; }
  const R = computeROI();
  const nx = (p.x - R.x) / R.w;
  const ny = (p.y - R.y) / R.h;
  myFingerSquare = (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) ? { x: nx, y: ny } : null;
}

function initSocket() {
  ProxNet.connect({ session: SESSION, role: 'laptop' });
  ProxNet.on('peer_pos', (m) => {
    peerFingerSquare = m.pos;
    currentDist = m.dist;
    elDist.textContent = (m.dist === null) ? '—' : m.dist.toFixed(2);
    updateVideoOpacity();
  });
  ProxNet.on('presence', (m) => {
    const me   = m[SESSION];
    const peer = m[SESSION === 'A' ? 'B' : 'A'];
    setStatus(elMePhone,   me.phone);
    setStatus(elPeerLap,   peer.laptop);
    setStatus(elPeerPhone, peer.phone);
  });
  ProxNet.on('error', (msg) => console.error('server:', msg));
}

function setStatus(el, ok) {
  el.textContent = ok ? 'on' : 'waiting';
  el.className   = ok ? 'ok' : 'pending';
}

function sendPos() { ProxNet.sendPos(myFingerSquare); }

function initVideoRTC() {
  ProxRTCVideo.onRemoteStream((stream) => {
    peerVideo.srcObject = stream;
    peerVideo.play().catch(err => console.error('peer video play:', err));
  });
  ProxNet.on('start_video_call', (m) => {
    ProxRTCVideo.start({ role: m.role, localStream: cameraStream });
  });
  ProxNet.on('end_video_call', () => {
    ProxRTCVideo.stop();
    peerVideo.srcObject = null;
  });
  ProxNet.on('rtc_video_signal', (m) => ProxRTCVideo.handleSignal(m));
}

function updateVideoOpacity() {
  if (currentDist === null) { peerVideo.style.opacity = 0; return; }
  const d01 = Math.min(1, Math.max(0, currentDist));
  const opacity = Math.pow(1 - d01, CONFIG.videoCurve);
  peerVideo.style.opacity = opacity.toFixed(3);
}

function initQR() {
  const url = `${location.origin}/phone.html?session=${SESSION}`;
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cells = qr.getModuleCount();
  const cellSize = size / cells;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++)
    if (qr.isDark(r, c)) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
}

function renderLoop() {
  ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  const sq = roiScreenRect();
  ctx2d.strokeStyle = (currentDist !== null && currentDist < 0.10) ? '#8f8' : '#888';
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(sq.x, sq.y, sq.w, sq.h);
  if (myFingerSquare)
    drawDot(sq.x + myFingerSquare.x * sq.w, sq.y + myFingerSquare.y * sq.h, '#fff', 'you');
  if (peerFingerSquare)
    drawDot(sq.x + peerFingerSquare.x * sq.w, sq.y + peerFingerSquare.y * sq.h, '#8cf', 'them');
  requestAnimationFrame(renderLoop);
}

function drawDot(x, y, color, label) {
  ctx2d.fillStyle = color;
  ctx2d.beginPath(); ctx2d.arc(x, y, 12, 0, Math.PI * 2); ctx2d.fill();
  ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
  ctx2d.font = '10px sans-serif';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(label, x, y + 4);
}