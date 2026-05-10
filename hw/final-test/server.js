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
const sessions = {
  A: { laptop: null, phone: null, projectors: [], pos: null },
  B: { laptop: null, phone: null, projectors: [], pos: null },
};

// ─── Standalone video-test state ─────────────────────────────────────────
const vt = { A: null, B: null };

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
      sendStateToProjector(session, socket.id);
      // If peer's laptop is already connected, ask it to also stream to this projector
      maybeStartProjectorVideo(session, socket.id);
      return;
    }

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
    // If a peer projector is already waiting, kick off projector video for it
    if (role === 'laptop') maybeStartAllProjectorVideos();
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

  // ─── Projector video signaling ───────────────────────────────────────
  // Two-way relay between a projector and the peer's laptop.
  // Each message includes which projector socket it's addressed to (or from).
  socket.on('rtc_projector_signal', (msg) => {
    // msg: { targetProjectorId?, ...sdp/ice }
    if (socket.data.role === 'projector') {
      // From projector to peer's laptop
      const myS = socket.data.session;
      const peerLaptop = sessions[otherSession(myS)].laptop;
      if (peerLaptop) {
        io.to(peerLaptop).emit('rtc_projector_signal', {
          ...msg,
          fromProjectorId: socket.id,
          forSession: myS,
        });
      }
    } else if (socket.data.role === 'laptop') {
      // From laptop to a specific projector on the peer side
      if (msg.targetProjectorId) {
        io.to(msg.targetProjectorId).emit('rtc_projector_signal', msg);
      }
    }
  });

  // ─── Standalone video test (isolated from proximity sessions) ─────────
  socket.on('vt_hello', (info) => {
    const role = info && info.role;
    if (!['A','B'].includes(role)) {
      socket.emit('error_msg', 'bad vt role');
      return;
    }
    if (vt[role]) {
      socket.emit('error_msg', `vt ${role} already connected`);
      return;
    }
    vt[role] = socket.id;
    socket.data.vtRole = role;
    console.log(`  -> vt role=${role}`);
    if (vt.A && vt.B) {
      io.to(vt.A).emit('vt_paired', { role: 'caller' });
      io.to(vt.B).emit('vt_paired', { role: 'callee' });
      console.log('  ~~ vt paired');
    }
  });

  socket.on('vt_signal', (msg) => {
    const r = socket.data.vtRole;
    if (!r) return;
    const peerId = vt[r === 'A' ? 'B' : 'A'];
    if (peerId) io.to(peerId).emit('vt_signal', msg);
  });

  socket.on('disconnect', () => {
    if (socket.data.vtRole) {
      const r = socket.data.vtRole;
      vt[r] = null;
      console.log(`  <- vt role=${r}`);
      const peerId = vt[r === 'A' ? 'B' : 'A'];
      if (peerId) io.to(peerId).emit('vt_peer_left');
    }

    const s = socket.data.session, r = socket.data.role;
    if (!s || !r) return;
    if (r === 'projector') {
      sessions[s].projectors = sessions[s].projectors.filter(id => id !== socket.id);
      console.log(`  <- session=${s} role=projector`);
      // Tell peer's laptop to tear down the projector's peer connection
      const peerLaptop = sessions[otherSession(s)].laptop;
      if (peerLaptop) io.to(peerLaptop).emit('projector_left', { projectorId: socket.id });
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

// When a projector connects, if the peer's laptop is already streaming,
// ask the peer's laptop to send its video to the new projector.
function maybeStartProjectorVideo(session, projectorId) {
  const peerLaptop = sessions[otherSession(session)].laptop;
  if (peerLaptop) {
    io.to(peerLaptop).emit('start_projector_video', {
      projectorId,
      forSession: session,
    });
  }
}

// When a peer's laptop joins, kick off projector video for any waiting projectors
function maybeStartAllProjectorVideos() {
  ['A','B'].forEach(s => {
    const peerLaptop = sessions[otherSession(s)].laptop;
    if (peerLaptop) {
      sessions[s].projectors.forEach(pid => {
        io.to(peerLaptop).emit('start_projector_video', {
          projectorId: pid,
          forSession: s,
        });
      });
    }
  });
}

function computeAndBroadcast() {
  const a = sessions.A.pos, b = sessions.B.pos;
  const bothPhonesPresent = !!(sessions.A.phone && sessions.B.phone);
  let dist = null;
  if (a && b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    dist = Math.min(1, Math.sqrt(dx*dx + dy*dy) / Math.SQRT2);
  }

  // Only broadcast distance to phones if BOTH phones are connected.
  // This keeps the audio silent until the experience is paired.
  if (bothPhonesPresent) {
    ['A','B'].forEach(s => {
      const id = sessions[s].phone;
      if (id) io.to(id).emit('distance', { dist });
    });
  }

  ['A','B'].forEach(s => {
    const peerPos = sessions[otherSession(s)].pos;
    const msg = { pos: peerPos, dist };
    const lap = sessions[s].laptop;
    if (lap) io.to(lap).emit('peer_pos', msg);
    sessions[s].projectors.forEach(pid => io.to(pid).emit('peer_pos', msg));
  });
}

function sendStateToProjector(session, socketId) {
  const peerPos = sessions[otherSession(session)].pos;
  io.to(socketId).emit('peer_pos', { pos: peerPos, dist: null });
  // Also send current presence so projector can render the right state immediately
  io.to(socketId).emit('presence', {
    A: { laptop: !!sessions.A.laptop, phone: !!sessions.A.phone },
    B: { laptop: !!sessions.B.laptop, phone: !!sessions.B.phone },
  });
}

function broadcastPresence() {
  const state = {
    A: { laptop: !!sessions.A.laptop, phone: !!sessions.A.phone },
    B: { laptop: !!sessions.B.laptop, phone: !!sessions.B.phone },
  };
  io.emit('presence', state);
}