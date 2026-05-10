// js/projector.js — floor projection with shadow → video crossfade
//
// Receives:
//   peer_pos events (where the partner is, plus distance)
//   peer's video stream via its own WebRTC peer connection with peer's laptop
//
// Renders:
//   white background (always)
//   peer's shadow (faint when far, full when close)
//   peer's video (invisible when far, fades in to fully cover when very close)

const CONFIG = {
  shadowRadius: 120,
  shadowMaxOpacity: 0.55,
  videoCurve: 4,    // same as laptop — invisible far, sharp fade-in close
};

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();

const canvas    = document.getElementById('stage');
const ctx       = canvas.getContext('2d');
const peerVideo = document.getElementById('peer-video');

let peerPos = null;
let currentDist = null;

let pc = null;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

ProxNet.connect({ session: SESSION, role: 'projector' });

ProxNet.on('peer_pos', (m) => {
  peerPos = m.pos;
  currentDist = m.dist;
  updateVideoOpacity();
});

ProxNet.on('error', (msg) => console.error('server:', msg));

// ─── WebRTC: receive peer's video from their laptop ──────────────────────
ProxNet.on('rtc_projector_signal', async (m) => {
  try {
    if (m.kind === 'offer') {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.ontrack = (e) => {
        peerVideo.srcObject = e.streams[0] || new MediaStream([e.track]);
        peerVideo.play().catch(err => console.error('peer video play:', err));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          ProxNet.send('rtc_projector_signal', { kind: 'ice', candidate: e.candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        console.log('projector pc state:', pc.connectionState);
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

function updateVideoOpacity() {
  if (currentDist === null) {
    peerVideo.style.opacity = 0;
    return;
  }
  const d01 = Math.min(1, Math.max(0, currentDist));
  const opacity = Math.pow(1 - d01, CONFIG.videoCurve);
  peerVideo.style.opacity = opacity.toFixed(3);
}

// The projector for session=A shows session B's shadow, and vice versa.
// A's color is red, B's color is blue.
const PEER_COLOR = SESSION === 'A' ? '0,80,255' : '255,40,40';

function render() {
  // Fill white (the floor)
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Draw the shadow at the peer's position
  if (peerPos) {
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