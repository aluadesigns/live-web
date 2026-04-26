// js/net.js — Socket.IO wrapper for proximity prototype

(function () {
  let socket;
  const handlers = {};

  function connect({ session, role }) {
    socket = io();
    socket.on('connect', () => {
      socket.emit('hello', { session, role });
    });
    socket.on('distance',          (m) => emit('distance',          m));
    socket.on('peer_pos',          (m) => emit('peer_pos',          m));
    socket.on('presence',          (m) => emit('presence',          m));
    socket.on('error_msg',         (m) => emit('error',             m));
    // Phone audio RTC
    socket.on('start_call',        (m) => emit('start_call',        m));
    socket.on('end_call',          (m) => emit('end_call',          m));
    socket.on('rtc_signal',        (m) => emit('rtc_signal',        m));
    // Laptop video RTC
    socket.on('start_video_call',  (m) => emit('start_video_call',  m));
    socket.on('end_video_call',    (m) => emit('end_video_call',    m));
    socket.on('rtc_video_signal',  (m) => emit('rtc_video_signal',  m));
  }

  function sendPos(p) {
    if (!socket || !socket.connected) return;
    socket.emit('pos', p ? { x: p.x, y: p.y } : { x: null, y: null });
  }

  function sendSignal(payload) {
    if (!socket || !socket.connected) return;
    socket.emit('rtc_signal', payload);
  }

  function sendVideoSignal(payload) {
    if (!socket || !socket.connected) return;
    socket.emit('rtc_video_signal', payload);
  }

  function on(event, handler) {
    (handlers[event] = handlers[event] || []).push(handler);
  }

  function emit(event, data) {
    (handlers[event] || []).forEach(h => h(data));
  }

  window.ProxNet = { connect, sendPos, sendSignal, sendVideoSignal, on };
})();