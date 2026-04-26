// js/phone.js — page logic for phone.html

const CONVERGE_THRESHOLD = 0.10;

const params  = new URLSearchParams(location.search);
const SESSION = (params.get('session') || 'A').toUpperCase();

const elSess     = document.getElementById('sess');
const startBtn   = document.getElementById('startBtn');
const orb        = document.getElementById('orb');
const statusEl   = document.getElementById('status');
elSess.textContent = SESSION;

let currentDist = null;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'connecting…';
  try {
    await ProxAudio.init();
    initSocket();
    initRTC();
    startBtn.style.display = 'none';
    orb.style.display = 'block';
    requestAnimationFrame(renderLoop);
  } catch (e) {
    console.error(e);
    startBtn.textContent = 'error — see console';
  }
});

function initSocket() {
  ProxNet.connect({ session: SESSION, role: 'phone' });
  ProxNet.on('distance', (m) => {
    currentDist = m.dist;
    ProxAudio.setDistance(m.dist);
  });
  ProxNet.on('error', (msg) => console.error('server:', msg));
}

function initRTC() {
  ProxRTC.onRemoteStream((stream) => {
    console.log('[phone] got remote stream');
    ProxAudio.attachRemoteStream(stream);
  });

  ProxNet.on('start_call', (m) => {
    console.log('[phone] start_call as', m.role);
    ProxRTC.start({ role: m.role });
  });

  ProxNet.on('end_call', () => {
    console.log('[phone] end_call');
    ProxRTC.stop();
    ProxAudio.detachRemoteStream();
  });

  ProxNet.on('rtc_signal', (m) => {
    ProxRTC.handleSignal(m);
  });
}

function renderLoop() {
  if (currentDist === null) {
    statusEl.textContent = 'waiting for both';
    statusEl.className = '';
    orb.style.background = 'radial-gradient(circle, #222 0%, #000 70%)';
  } else if (currentDist < CONVERGE_THRESHOLD) {
    statusEl.textContent = '— connected —';
    statusEl.className = 'connected';
    orb.style.background = 'radial-gradient(circle, #8f8 0%, #050 70%)';
  } else {
    statusEl.textContent = currentDist < 0.3 ? 'getting close' : 'searching';
    statusEl.className = 'searching';
    const intensity = Math.floor((1 - currentDist) * 200);
    orb.style.background = `radial-gradient(circle, rgb(${intensity},80,${intensity}) 0%, #000 70%)`;
  }
  requestAnimationFrame(renderLoop);
}