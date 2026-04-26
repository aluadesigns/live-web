// js/tracking.js — dark blob tracking with debug overlay
//
// When CONFIG.debug = true (default), draws on top of the page:
//   - Red rectangle: the region the tracker is scanning
//   - Green pixels: every pixel the tracker considers "dark"
//   - Yellow cross: the centroid of the largest blob
//
// Turn debug off for production by setting CONFIG.debug = false.

(function () {
  const CONFIG = {
    darkThreshold:   110,
    processWidth:    160,
    minBlobArea:     150,    // raised from 30 to filter out floor grain/noise
    smoothing:       0.5,
    debug:           true,
  };

  let roi = { x: 0, y: 0, w: 1, h: 1 };
  let smoothed = null;
  let onUpdate = null;
  let videoEl;
  let canvas, cctx;
  let debugCanvas, dctx;

  async function init(video, callback) {
    videoEl = video;
    onUpdate = callback;
    canvas = document.createElement('canvas');
    canvas.width  = CONFIG.processWidth;
    canvas.height = Math.round(CONFIG.processWidth * 9/16);
    cctx = canvas.getContext('2d', { willReadFrequently: true });

    if (CONFIG.debug) setupDebugCanvas();

    function loop() {
      if (videoEl.readyState >= 2) processFrame();
      requestAnimationFrame(loop);
    }
    loop();
  }

  function setupDebugCanvas() {
    debugCanvas = document.createElement('canvas');
    debugCanvas.id = 'debug-overlay';
    debugCanvas.style.position = 'fixed';
    debugCanvas.style.inset = '0';
    debugCanvas.style.width = '100vw';
    debugCanvas.style.height = '100vh';
    debugCanvas.style.pointerEvents = 'none';
    debugCanvas.style.zIndex = '20';
    debugCanvas.style.opacity = '0.7';
    document.body.appendChild(debugCanvas);
    dctx = debugCanvas.getContext('2d');
  }

  function setRegion(r) {
    roi = {
      x: Math.max(0, Math.min(1, r.x)),
      y: Math.max(0, Math.min(1, r.y)),
      w: Math.max(0, Math.min(1, r.w)),
      h: Math.max(0, Math.min(1, r.h)),
    };
  }

  function processFrame() {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) return;
    canvas.height = Math.round(CONFIG.processWidth * vh / vw);
    const W = canvas.width, H = canvas.height;
    cctx.drawImage(videoEl, 0, 0, W, H);
    const img = cctx.getImageData(0, 0, W, H);
    const d = img.data;

    const roiX0 = Math.floor(roi.x * W);
    const roiY0 = Math.floor(roi.y * H);
    const roiX1 = Math.min(W, roiX0 + Math.ceil(roi.w * W));
    const roiY1 = Math.min(H, roiY0 + Math.ceil(roi.h * H));

    const mask = new Uint8Array(W * H);
    for (let y = roiY0; y < roiY1; y++) {
      for (let x = roiX0; x < roiX1; x++) {
        const i = (y * W + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        if (lum < CONFIG.darkThreshold) mask[y * W + x] = 1;
      }
    }

    const visited = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let bestCount = 0, bestSumX = 0, bestSumY = 0;

    for (let y = roiY0; y < roiY1; y++) {
      for (let x = roiX0; x < roiX1; x++) {
        const idx = y * W + x;
        if (!mask[idx] || visited[idx]) continue;
        let top = 0;
        stack[top++] = idx;
        visited[idx] = 1;
        let count = 0, sumX = 0, sumY = 0;
        while (top > 0) {
          const p = stack[--top];
          const px = p % W, py = (p / W) | 0;
          count++; sumX += px; sumY += py;
          if (px > roiX0     && mask[p-1] && !visited[p-1]) { visited[p-1] = 1; stack[top++] = p-1; }
          if (px < roiX1 - 1 && mask[p+1] && !visited[p+1]) { visited[p+1] = 1; stack[top++] = p+1; }
          if (py > roiY0     && mask[p-W] && !visited[p-W]) { visited[p-W] = 1; stack[top++] = p-W; }
          if (py < roiY1 - 1 && mask[p+W] && !visited[p+W]) { visited[p+W] = 1; stack[top++] = p+W; }
        }
        if (count > bestCount) { bestCount = count; bestSumX = sumX; bestSumY = sumY; }
      }
    }

    if (CONFIG.debug && dctx) drawDebug(mask, W, H, roiX0, roiY0, roiX1, roiY1, bestCount, bestSumX, bestSumY);

    if (bestCount < CONFIG.minBlobArea) {
      onUpdate && onUpdate(smoothed);
      return;
    }

    const cx = (bestSumX / bestCount) / W;
    const cy = (bestSumY / bestCount) / H;
    const raw = { x: cx, y: cy };  // un-mirrored, raw camera coords

    if (!smoothed) smoothed = raw;
    else {
      smoothed = {
        x: lerp(raw.x, smoothed.x, CONFIG.smoothing),
        y: lerp(raw.y, smoothed.y, CONFIG.smoothing),
      };
    }

    onUpdate && onUpdate({ x: smoothed.x, y: smoothed.y });
  }

  function drawDebug(mask, W, H, rx0, ry0, rx1, ry1, bestCount, bestSumX, bestSumY) {
    const scrW = innerWidth, scrH = innerHeight;
    debugCanvas.width = scrW;
    debugCanvas.height = scrH;
    dctx.clearRect(0, 0, scrW, scrH);

    const scaleX = scrW / W, scaleY = scrH / H;

    // Green = dark pixels the tracker sees
    dctx.fillStyle = 'rgba(0, 255, 0, 0.55)';
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        if (mask[y * W + x]) {
          dctx.fillRect(x * scaleX, y * scaleY, scaleX + 1, scaleY + 1);
        }
      }
    }

    // Red = the ROI (region of interest)
    dctx.strokeStyle = 'red';
    dctx.lineWidth = 3;
    dctx.strokeRect(rx0 * scaleX, ry0 * scaleY,
                    (rx1 - rx0) * scaleX, (ry1 - ry0) * scaleY);

    // Yellow cross = centroid of largest blob
    if (bestCount > 0) {
      const cx = (bestSumX / bestCount) * scaleX;
      const cy = (bestSumY / bestCount) * scaleY;
      dctx.strokeStyle = 'yellow';
      dctx.lineWidth = 4;
      dctx.beginPath();
      dctx.moveTo(cx - 20, cy); dctx.lineTo(cx + 20, cy);
      dctx.moveTo(cx, cy - 20); dctx.lineTo(cx, cy + 20);
      dctx.stroke();
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  window.ProxTracking = { init, setRegion, CONFIG };
})();