// js/tracking-finger.js — MediaPipe index-fingertip tracking
//
// Drop-in alternative to tracking.js (the dark-blob tracker).
// Same interface: ProxTracking.init(videoEl, onUpdate), ProxTracking.setRegion()
//
// Reports the index fingertip position in 0..1 video coords.

(function () {
  const CONFIG = {
    smoothing: 0.4,
  };

  let roi = { x: 0, y: 0, w: 1, h: 1 };
  let smoothed = null;
  let onUpdate = null;
  let videoEl;

  async function init(video, callback) {
    videoEl = video;
    onUpdate = callback;

    const hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(handleResults);

    async function pump() {
      if (videoEl.readyState >= 2) {
        await hands.send({ image: videoEl });
      }
      requestAnimationFrame(pump);
    }
    pump();
  }

  function setRegion(r) {
    roi = {
      x: Math.max(0, Math.min(1, r.x)),
      y: Math.max(0, Math.min(1, r.y)),
      w: Math.max(0, Math.min(1, r.w)),
      h: Math.max(0, Math.min(1, r.h)),
    };
  }

  function handleResults(results) {
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      onUpdate && onUpdate(smoothed);
      return;
    }
    const lm = results.multiHandLandmarks[0];
    if (!lm || !lm[8]) return;
    const tip = lm[8];

    // Restrict to ROI: ignore detections outside the playable rect
    const x = tip.x, y = tip.y;
    if (x < roi.x || x > roi.x + roi.w || y < roi.y || y > roi.y + roi.h) {
      onUpdate && onUpdate(smoothed);
      return;
    }

    const raw = { x, y };
    if (!smoothed) smoothed = raw;
    else {
      smoothed = {
        x: lerp(raw.x, smoothed.x, CONFIG.smoothing),
        y: lerp(raw.y, smoothed.y, CONFIG.smoothing),
      };
    }
    onUpdate && onUpdate({ x: smoothed.x, y: smoothed.y });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  window.ProxTracking = { init, setRegion, CONFIG };
})();