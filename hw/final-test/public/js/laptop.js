// js/laptop.js — page logic for laptop.html
//
// Two cameras can be active at once:
//   tracking camera  — used for blob/finger detection (e.g. overhead GoPro)
//   video camera     — used for outgoing WebRTC video (e.g. front Logi)
// If only one is configured, the same stream is used for both.

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();
const TRACKER = (params.get('tracker') || 'hat').toLowerCase();

const CONFIG = {
  sendRate:   20,
  videoCurve: 4,
  // Playable area in VIDEO coords. Aspect is 16:9 (the projector's aspect).
  // Tune position via keyboard (arrows / [ ]) until the red box sits inside the
  // projected area at roughly the same size.
  areaWidth:    TRACKER === 'finger' ? 0.7  : 0.54,
  areaCenterX:  TRACKER === 'finger' ? 0.50 : 0.48,
  areaCenterY:  TRACKER === 'finger' ? 0.50 : 0.47,
  areaAspect:   16/9,
  shadowRadius: 60,
  shadowMaxOpacity: 0.6,
  // Freeze-on-convergence: when the two participants get close enough, lock
  // both their reported positions in place. Prevents the projected partner
  // video from interfering with tracking via dark clothing/hair pixels.
  freezeThreshold: 0.05,   // distance below which freeze triggers
  unfreezeDrift:   0.05,   // raw position drift that breaks the freeze
  maxFreezeSec:    8,      // max time to hold a freeze before auto-release
};

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
let trackingStream    = null;   // for blob/finger tracking
let videoStream       = null;   // for outgoing WebRTC video (peer + projectors)

// Per-projector peer connections (we may stream to multiple projectors)
const projectorPCs = new Map();
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'loading…';
  try {
    await initCameras();
    await ProxTracking.init(localVideo, onPoint);
    ProxTracking.setRegion(computeROI());
    initSocket();
    initVideoRTC();
    initProjectorRelay();
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

// ─── Live ROI tuning via keyboard ───────────────────────────────────────
// Arrows = move center, [ ] = shrink/grow, A/Z = wider/taller aspect
// Hit P to log current values to copy back into CONFIG.
window.addEventListener('keydown', (e) => {
  const STEP = e.shiftKey ? 0.005 : 0.02;
  let changed = true;
  switch (e.key) {
    case 'ArrowLeft':  CONFIG.areaCenterX -= STEP; break;
    case 'ArrowRight': CONFIG.areaCenterX += STEP; break;
    case 'ArrowUp':    CONFIG.areaCenterY -= STEP; break;
    case 'ArrowDown':  CONFIG.areaCenterY += STEP; break;
    case '[':          CONFIG.areaWidth   -= STEP; break;
    case ']':          CONFIG.areaWidth   += STEP; break;
    case 'a':          CONFIG.areaAspect  += STEP * 5; break;  // wider
    case 'z':          CONFIG.areaAspect  -= STEP * 5; break;  // taller
    case 'p':
      console.log('CURRENT ROI:', JSON.stringify({
        areaWidth:    +CONFIG.areaWidth.toFixed(3),
        areaCenterX:  +CONFIG.areaCenterX.toFixed(3),
        areaCenterY:  +CONFIG.areaCenterY.toFixed(3),
        areaAspect:   +CONFIG.areaAspect.toFixed(3),
      }, null, 2));
      changed = false;
      break;
    default: changed = false;
  }
  if (changed && window.ProxTracking) {
    ProxTracking.setRegion(computeROI());
  }
});

async function initCameras() {
  // Get permission first so labels become available
  let temp;
  try {
    temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) { throw new Error('camera permission denied'); }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  console.log('available cameras:', cams.map(c => c.label));
  temp.getTracks().forEach(t => t.stop());

  function pick(substr, fallback) {
    if (!substr) return fallback;
    const m = cams.find(c => c.label.toLowerCase().includes(substr.toLowerCase()));
    if (m) return m;
    console.warn(`no camera matching "${substr}", using fallback`);
    return fallback;
  }

  const wantTrack = params.get('camera');         // for tracking
  const wantVideo = params.get('videocam');       // for outgoing video
  const trackCam  = pick(wantTrack, cams[0]);
  // If videocam not specified, fall back to tracking camera
  const videoCam  = wantVideo ? pick(wantVideo, trackCam) : trackCam;

  console.log('tracking camera:', trackCam.label);
  console.log('video camera:   ', videoCam.label);

  trackingStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: trackCam.deviceId }, width: {ideal:1280}, height: {ideal:720} },
    audio: false,
  });
  localVideo.srcObject = trackingStream;
  await new Promise(r => localVideo.onloadedmetadata = r);
  await localVideo.play();

  if (videoCam.deviceId !== trackCam.deviceId) {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: videoCam.deviceId }, width: {ideal:1280}, height: {ideal:720} },
      audio: false,
    });
  } else {
    videoStream = trackingStream;
  }
}

function computeROI() {
  const vw = localVideo.videoWidth  || 1280;
  const vh = localVideo.videoHeight || 720;
  const videoAspect = vw / vh;
  const w = CONFIG.areaWidth;
  const h = w * videoAspect / CONFIG.areaAspect;
  return {
    x: CONFIG.areaCenterX - w / 2,
    y: CONFIG.areaCenterY - h / 2,
    w,
    h,
  };
}

function roiScreenRect() {
  const vw = localVideo.videoWidth, vh = localVideo.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0, w: 0, h: 0 };
  const screenW = innerWidth, screenH = innerHeight;
  const scale = Math.max(screenW / vw, screenH / vh);
  const dW = vw * scale, dH = vh * scale;
  const oX = (screenW - dW) / 2, oY = (screenH - dH) / 2;
  const R = computeROI();
  return { x: oX + R.x*dW, y: oY + R.y*dH, w: R.w*dW, h: R.h*dH };
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

// ─── Freeze-on-convergence state ─────────────────────────────────────────
// When the two participants get close enough, both laptops freeze their
// reported positions to prevent the projected video from interfering with
// the tracker (dark clothing/hair in the projection causing centroid jumps).
let frozen = false;
let frozenAnchor = null;       // {x, y} — my reported position when freeze began
let frozenStartTime = 0;
let lastReported = null;       // last position actually sent to server

function sendPos() {
  const now = performance.now();
  const raw = myFingerSquare;  // raw centroid-in-square coords (or null)

  if (!frozen) {
    // Normal pass-through: send the raw position.
    lastReported = raw;
    ProxNet.sendPos(raw);
    // Check if we should enter freeze
    if (raw && currentDist !== null && currentDist < CONFIG.freezeThreshold) {
      frozen = true;
      frozenAnchor = { ...raw };
      frozenStartTime = now;
    }
  } else {
    // Frozen: keep sending the anchor, ignoring raw drift.
    ProxNet.sendPos(frozenAnchor);
    lastReported = frozenAnchor;
    // Check unfreeze conditions
    let drift = 0;
    if (raw) {
      const dx = raw.x - frozenAnchor.x;
      const dy = raw.y - frozenAnchor.y;
      drift = Math.sqrt(dx*dx + dy*dy) / Math.SQRT2;
    }
    const elapsed = (now - frozenStartTime) / 1000;
    if (drift > CONFIG.unfreezeDrift || elapsed > CONFIG.maxFreezeSec) {
      frozen = false;
      frozenAnchor = null;
    }
  }
}

function initVideoRTC() {
  ProxRTCVideo.onRemoteStream((stream) => {
    peerVideo.srcObject = stream;
    peerVideo.play().catch(err => console.error('peer video play:', err));
  });
  ProxNet.on('start_video_call', (m) => {
    ProxRTCVideo.start({ role: m.role, localStream: videoStream });
  });
  ProxNet.on('end_video_call', () => {
    ProxRTCVideo.stop();
    peerVideo.srcObject = null;
  });
  ProxNet.on('rtc_video_signal', (m) => ProxRTCVideo.handleSignal(m));
}

// ─── Projector relay: send video to projectors on the peer's side ────────
function initProjectorRelay() {
  ProxNet.on('start_projector_video', async (m) => {
    // The peer side has a projector; we are the source of video for it
    const projectorId = m.projectorId;
    if (!projectorId || !videoStream) return;
    if (projectorPCs.has(projectorId)) return;  // already streaming

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    projectorPCs.set(projectorId, pc);
    videoStream.getTracks().forEach(t => pc.addTrack(t, videoStream));
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ProxNet.send('rtc_projector_signal', {
          targetProjectorId: projectorId,
          kind: 'ice',
          candidate: e.candidate,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      console.log(`projector ${projectorId} pc:`, pc.connectionState);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ProxNet.send('rtc_projector_signal', {
      targetProjectorId: projectorId,
      kind: 'offer',
      sdp: offer,
    });
  });

  ProxNet.on('rtc_projector_signal', async (m) => {
    // Answer/ICE coming back from the projector
    const projectorId = m.fromProjectorId;
    const pc = projectorPCs.get(projectorId);
    if (!pc) return;
    try {
      if (m.kind === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      } else if (m.kind === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(m.candidate));
      }
    } catch (err) {
      console.error('projector signal err:', err);
    }
  });

  ProxNet.on('projector_left', (m) => {
    const pc = projectorPCs.get(m.projectorId);
    if (pc) { try { pc.close(); } catch {} }
    projectorPCs.delete(m.projectorId);
  });
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

// Each session has a fixed color — A is red, B is blue. So your own shadow
// uses your session's color, and your peer's shadow uses theirs.
const MY_COLOR   = SESSION === 'A' ? '255,40,40' : '0,80,255';
const PEER_COLOR = SESSION === 'A' ? '0,80,255' : '255,40,40';

function renderLoop() {
  ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  const sq = roiScreenRect();

  // Show the position that's actually being SENT to the server (which is the
  // frozen anchor when frozen, raw otherwise). This way the participant sees
  // their reported position, not the jittery raw one during freeze.
  const myPos = lastReported || myFingerSquare;
  if (myPos)
    drawShadow(sq.x + myPos.x * sq.w, sq.y + myPos.y * sq.h, 1.0, MY_COLOR);

  if (peerFingerSquare && currentDist !== null) {
    const proximity = Math.pow(1 - Math.min(1, currentDist), CONFIG.videoCurve);
    drawShadow(
      sq.x + peerFingerSquare.x * sq.w,
      sq.y + peerFingerSquare.y * sq.h,
      proximity,
      PEER_COLOR
    );
  }

  requestAnimationFrame(renderLoop);
}

function drawShadow(x, y, intensity, rgb) {
  const r = CONFIG.shadowRadius;
  const grad = ctx2d.createRadialGradient(x, y, 0, x, y, r);
  const a = CONFIG.shadowMaxOpacity * Math.min(1, Math.max(0, intensity));
  grad.addColorStop(0,   `rgba(${rgb},${a})`);
  grad.addColorStop(0.5, `rgba(${rgb},${a * 0.4})`);
  grad.addColorStop(1,   `rgba(${rgb},0)`);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.fill();
}