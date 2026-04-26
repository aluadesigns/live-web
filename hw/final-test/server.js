// HTTPS server
const https = require('https');
const fs = require('fs');

const credentials = {
  key:  fs.readFileSync('/etc/letsencrypt/live/aa13577.itp.io/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/aa13577.itp.io/cert.pem')
};

const express = require('express');
const app = express();
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('proximity — visit /laptop.html?session=A or B');
});

const PORT = 3000;
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(PORT);
console.log(`https://aa13577.itp.io:${PORT}`);

const { Server } = require("socket.io");
const io = new Server(httpsServer);

// ─── Session state ───────────────────────────────────────────────────────
// Each session has exactly one laptop and one phone. Projectors are
// unlimited (an array) — they subscribe to a session and receive peer_pos
// but don't themselves track or affect the session state.
const sessions = {
  A: { laptop: null, phone: null, projectors: [], pos: null },
  B: { laptop: null, phone: null, projectors: [], pos: null },
};

const otherSession = (s) => s === 'A' ? 'B' : 'A';

io.sockets.on('connection', (socket) => {
  console.log('new client: ' + socket.id);

  socket.on('hello', (info) => {
    const { session, role } = info || {};
    if (!sessions[session] || !['laptop','phone','projector'].includes(role)) {
      socket.emit('error_msg', 'bad session or role');
      socket.disconnect();
      return;
    }

    if (role === 'projector') {
      sessions[session].projectors.push(socket.id);
      socket.data.session = session;
      socket.data.role    = role;
      console.log(`  -> session=${session} role=projector`);
      // Immediately push current peer position so the projector has something
      sendStateToProjector(session, socket.id);
      return;
    }

    // laptop / phone: enforce single-occupancy slots
    if (sessions[session][role]) {
      socket.emit('error_msg', `${role} already connected for session ${session}`);
      socket.disconnect();
      return;
    }
    sessions[session][role] = socket.id;
    socket.data.session = session;
    socket.data.role    = role;
    console.log(`  -> session=${session} role=${role}`);
    broadcastPresence();
    computeAndBroadcast();
    maybeStartAudioCall();
    maybeStartVideoCall();
  });

  socket.on('pos', (msg) => {
    const s = socket.data.session;
    if (!s || socket.data.role !== 'laptop') return;
    sessions[s].pos = (msg && msg.x !== null && msg.x !== undefined)
      ? { x: msg.x, y: msg.y } : null;
    computeAndBroadcast();
  });

  socket.on('rtc_signal', (msg) => {
    if (socket.data.role !== 'phone') return;
    const myS    = socket.data.session;
    const peerId = sessions[otherSession(myS)].phone;
    if (peerId) io.to(peerId).emit('rtc_signal', msg);
  });

  socket.on('rtc_video_signal', (msg) => {
    if (socket.data.role !== 'laptop') return;
    const myS    = socket.data.session;
    const peerId = sessions[otherSession(myS)].laptop;
    if (peerId) io.to(peerId).emit('rtc_video_signal', msg);
  });

  socket.on('disconnect', () => {
    const s = socket.data.session, r = socket.data.role;
    if (!s || !r) return;
    if (r === 'projector') {
      sessions[s].projectors = sessions[s].projectors.filter(id => id !== socket.id);
      console.log(`  <- session=${s} role=projector`);
      return;
    }
    sessions[s][r] = null;
    if (r === 'laptop') sessions[s].pos = null;
    console.log(`  <- session=${s} role=${r}`);
    const otherId = (r === 'phone')
      ? sessions[otherSession(s)].phone
      : sessions[otherSession(s)].laptop;
    if (otherId) io.to(otherId).emit(r === 'phone' ? 'end_call' : 'end_video_call');
    broadcastPresence();
    computeAndBroadcast();
  });
});

function maybeStartAudioCall() {
  const a = sessions.A.phone, b = sessions.B.phone;
  if (a && b) {
    io.to(a).emit('start_call', { role: 'caller' });
    io.to(b).emit('start_call', { role: 'callee' });
  }
}

function maybeStartVideoCall() {
  const a = sessions.A.laptop, b = sessions.B.laptop;
  if (a && b) {
    io.to(a).emit('start_video_call', { role: 'caller' });
    io.to(b).emit('start_video_call', { role: 'callee' });
  }
}

function computeAndBroadcast() {
  const a = sessions.A.pos, b = sessions.B.pos;
  let dist = null;
  if (a && b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    dist = Math.min(1, Math.sqrt(dx*dx + dy*dy) / Math.SQRT2);
  }

  ['A','B'].forEach(s => {
    const id = sessions[s].phone;
    if (id) io.to(id).emit('distance', { dist });
  });

  ['A','B'].forEach(s => {
    const peerPos = sessions[otherSession(s)].pos;
    const msg = { pos: peerPos, dist };
    // Send to the tracking laptop
    const lap = sessions[s].laptop;
    if (lap) io.to(lap).emit('peer_pos', msg);
    // Send to every projector subscribed to this session
    sessions[s].projectors.forEach(pid => io.to(pid).emit('peer_pos', msg));
  });
}

function sendStateToProjector(session, socketId) {
  const peerPos = sessions[otherSession(session)].pos;
  io.to(socketId).emit('peer_pos', { pos: peerPos, dist: null });
}

function broadcastPresence() {
  const state = {
    A: { laptop: !!sessions.A.laptop, phone: !!sessions.A.phone },
    B: { laptop: !!sessions.B.laptop, phone: !!sessions.B.phone },
  };
  io.emit('presence', state);
}