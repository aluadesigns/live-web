// js/audio.js — proximity audio engine with noise + voice crossfade

(function () {
  const CONFIG = {
    filterFreqFar:   800,
    filterFreqClose: 6000,
    filterQFar:      4.0,
    filterQClose:    0.5,
    noiseVolFar:     0.35,
    noiseVolClose:   0.0,
    voiceVolFar:     0.05,   // tiny trace of voice always bleeds through
    voiceVolClose:   1.0,
    noiseCurve:      1.0,    // noise fades out gradually as they approach
    voiceCurve:      1.5,    // voice rises a bit faster than linear
  };

  let ctx;
  let noiseFilter, noiseGain;
  let voiceGain;
  let remoteSourceNode;
  let remoteAudioEl;

  async function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    // Noise channel
    const bufferSize = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i=0; i<bufferSize; i++) {
      const w = Math.random()*2-1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11;
      b6 = w*0.115926;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf; noiseSrc.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = CONFIG.filterFreqFar;
    noiseFilter.Q.value = CONFIG.filterQFar;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = CONFIG.noiseVolFar;

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start();

    // Voice channel (silent until attachRemoteStream)
    voiceGain = ctx.createGain();
    voiceGain.gain.value = CONFIG.voiceVolFar;
    voiceGain.connect(ctx.destination);
  }

  function attachRemoteStream(stream) {
    if (!ctx) return;
    detachRemoteStream();

    // iOS quirk: Web-Audio-only MediaStreams sometimes don't actually play.
    // Attach a hidden, muted <audio> element to coax it.
    remoteAudioEl = document.createElement('audio');
    remoteAudioEl.autoplay = true;
    remoteAudioEl.muted = true;
    remoteAudioEl.playsInline = true;
    remoteAudioEl.srcObject = stream;
    document.body.appendChild(remoteAudioEl);

    remoteSourceNode = ctx.createMediaStreamSource(stream);
    remoteSourceNode.connect(voiceGain);
  }

  function detachRemoteStream() {
    if (remoteSourceNode) {
      try { remoteSourceNode.disconnect(); } catch {}
      remoteSourceNode = null;
    }
    if (remoteAudioEl) {
      remoteAudioEl.srcObject = null;
      remoteAudioEl.remove();
      remoteAudioEl = null;
    }
  }

  function setDistance(dist) {
    if (!ctx) return;
    const t = ctx.currentTime;

    if (dist === null) {
      noiseGain.gain.linearRampToValueAtTime(CONFIG.noiseVolFar,         t + 0.2);
      noiseFilter.frequency.linearRampToValueAtTime(CONFIG.filterFreqFar, t + 0.2);
      noiseFilter.Q.linearRampToValueAtTime(CONFIG.filterQFar,           t + 0.2);
      voiceGain.gain.linearRampToValueAtTime(CONFIG.voiceVolFar,         t + 0.2);
      return;
    }

    const d01 = Math.min(1, Math.max(0, dist));

    const freq        = lerp(CONFIG.filterFreqClose, CONFIG.filterFreqFar, d01);
    const q           = lerp(CONFIG.filterQClose,    CONFIG.filterQFar,    d01);
    const noiseCurved = Math.pow(d01, CONFIG.noiseCurve);
    const noiseVol    = lerp(CONFIG.noiseVolClose,   CONFIG.noiseVolFar,   noiseCurved);

    const voiceCurved = Math.pow(1 - d01, CONFIG.voiceCurve);
    const voiceVol    = lerp(CONFIG.voiceVolFar,     CONFIG.voiceVolClose, voiceCurved);

    noiseFilter.frequency.linearRampToValueAtTime(freq,    t + 0.05);
    noiseFilter.Q.linearRampToValueAtTime(q,               t + 0.05);
    noiseGain.gain.linearRampToValueAtTime(noiseVol,       t + 0.05);
    voiceGain.gain.linearRampToValueAtTime(voiceVol,       t + 0.05);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  window.ProxAudio = {
    init,
    setDistance,
    attachRemoteStream,
    detachRemoteStream,
    CONFIG,
  };
})();