// js/net.js — Socket.IO wrapper

(function () {
  let socket = null;
  const handlers = {};

  function connect({ session, role }) {
    socket = io();
    socket.on('connect', () => {
      socket.emit('hello', { session, role });
    });
    socket.on('error_msg', (msg) => fire('error', msg));
    socket.on('distance', (m)   => fire('distance', m));
    socket.on('peer_pos', (m)   => fire('peer_pos', m));
    socket.on('presence', (m)   => fire('presence', m));
    socket.on('start_call', (m) => fire('start_call', m));
    socket.on('end_call', (m)   => fire('end_call', m));
    socket.on('rtc_signal', (m) => fire('rtc_signal', m));
    socket.on('start_video_call', (m) => fire('start_video_call', m));
    socket.on('end_video_call', (m)   => fire('end_video_call', m));
    socket.on('rtc_video_signal', (m) => fire('rtc_video_signal', m));
    // Projector relay events
    socket.on('start_projector_video', (m) => fire('start_projector_video', m));
    socket.on('rtc_projector_signal', (m)  => fire('rtc_projector_signal', m));
    socket.on('projector_left', (m)        => fire('projector_left', m));
  }

  function on(event, fn) {
    (handlers[event] = handlers[event] || []).push(fn);
  }

  function fire(event, data) {
    (handlers[event] || []).forEach(fn => fn(data));
  }

  function sendPos(pos) {
    if (socket) socket.emit('pos', pos);
  }

  function sendSignal(msg) {
    if (socket) socket.emit('rtc_signal', msg);
  }

  function sendVideoSignal(msg) {
    if (socket) socket.emit('rtc_video_signal', msg);
  }

  // Generic send for any event (used by projector relay)
  function send(event, msg) {
    if (socket) socket.emit(event, msg);
  }

  window.ProxNet = { connect, on, sendPos, sendSignal, sendVideoSignal, send };
})();