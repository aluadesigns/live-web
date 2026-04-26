// js/rtc-video.js — WebRTC peer video (laptop-to-laptop)
//
// Unlike rtc.js (audio), this does NOT call getUserMedia — the laptop already
// has the camera open for hand tracking. We pass that existing stream in.

(function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let pc;
  let remoteStreamCb;

  async function start({ role, localStream }) {
    console.log(`[rtc-video] start as ${role}`);

    if (!localStream) {
      console.error('[rtc-video] no localStream provided');
      return;
    }

    if (pc) { try { pc.close(); } catch {} pc = null; }

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Send only the video track (no audio — that's the phones' job)
    localStream.getVideoTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      console.log('[rtc-video] remote track received');
      const stream = e.streams[0] || new MediaStream([e.track]);
      remoteStreamCb && remoteStreamCb(stream);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) ProxNet.sendVideoSignal({ kind: 'ice', candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => console.log('[rtc-video] state:', pc.connectionState);

    if (role === 'caller') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ProxNet.sendVideoSignal({ kind: 'offer', sdp: offer });
    }
  }

  async function handleSignal(msg) {
    if (!pc) return;
    try {
      if (msg.kind === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ProxNet.sendVideoSignal({ kind: 'answer', sdp: answer });
      } else if (msg.kind === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.kind === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    } catch (err) {
      console.error('[rtc-video] signal handling error:', err);
    }
  }

  function stop() {
    if (pc) { try { pc.close(); } catch {} pc = null; }
  }

  function onRemoteStream(cb) { remoteStreamCb = cb; }

  window.ProxRTCVideo = { start, handleSignal, stop, onRemoteStream };
})();