// js/rtc.js — WebRTC peer audio (phone-to-phone)

(function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let pc;
  let localStream;
  let remoteStreamCb;
  let myRole;

  async function start({ role }) {
    myRole = role;
    console.log(`[rtc-audio] start as ${role}`);

    if (!localStream) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (err) {
        console.error('[rtc-audio] getUserMedia failed:', err);
        return;
      }
    }

    if (pc) { try { pc.close(); } catch {} pc = null; }

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      console.log('[rtc-audio] remote track received');
      const stream = e.streams[0] || new MediaStream([e.track]);
      remoteStreamCb && remoteStreamCb(stream);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) ProxNet.sendSignal({ kind: 'ice', candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => console.log('[rtc-audio] state:', pc.connectionState);

    if (role === 'caller') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ProxNet.sendSignal({ kind: 'offer', sdp: offer });
    }
  }

  async function handleSignal(msg) {
    if (!pc) return;
    try {
      if (msg.kind === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ProxNet.sendSignal({ kind: 'answer', sdp: answer });
      } else if (msg.kind === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.kind === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    } catch (err) {
      console.error('[rtc-audio] signal handling error:', err);
    }
  }

  function stop() {
    if (pc) { try { pc.close(); } catch {} pc = null; }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
  }

  function onRemoteStream(cb) { remoteStreamCb = cb; }

  window.ProxRTC = { start, handleSignal, stop, onRemoteStream };
})();