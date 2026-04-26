// js/projector.js — minimal floor projection view
//
// Whole page is white. A gray dot shows the peer's position within the
// playable area (which the projector represents fully).

const CONFIG = {
  peerDotRadius: 30,
  peerDotColor:  '#888',
};

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let peerPos = null;

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

// Subscribe as a projector for this session.
// The server will send peer_pos = the OTHER session's position.
// So projector.html?session=A shows session B's dot.
ProxNet.connect({ session: SESSION, role: 'projector' });

ProxNet.on('peer_pos', (m) => {
  peerPos = m.pos;
});

ProxNet.on('error', (msg) => {
  console.error('server:', msg);
});

function render() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  if (peerPos) {
    const dx = peerPos.x * innerWidth;
    const dy = peerPos.y * innerHeight;
    ctx.fillStyle = CONFIG.peerDotColor;
    ctx.beginPath();
    ctx.arc(dx, dy, CONFIG.peerDotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(render);
}
render();