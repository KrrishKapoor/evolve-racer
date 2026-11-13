import { NET_LAYERS, NEURON_COUNT, GENOME_SIZE, RAY_COUNT, RAY_ANGLES } from '../sim/types';

export interface NetView {
  update(genome: Float32Array, activations: Float32Array): void;
  destroy(): void;
}

const LAYERS = NET_LAYERS.length;
const OUT_BASE = NEURON_COUNT - NET_LAYERS[LAYERS - 1];

// Static edge topology: genome index of each weight and its source / target neuron.
const EDGE_COUNT = (() => {
  let n = 0;
  for (let l = 1; l < LAYERS; l++) n += NET_LAYERS[l - 1] * NET_LAYERS[l];
  return n;
})();
const edgeGene = new Uint16Array(EDGE_COUNT);
const edgeSrc = new Uint8Array(EDGE_COUNT);
const edgeDst = new Uint8Array(EDGE_COUNT);
const layerStart = new Uint8Array(LAYERS + 1);
{
  let g = 0;
  let e = 0;
  let inBase = 0;
  for (let l = 0; l < LAYERS; l++) layerStart[l + 1] = layerStart[l] + NET_LAYERS[l];
  for (let l = 1; l < LAYERS; l++) {
    const nIn = NET_LAYERS[l - 1];
    const nOut = NET_LAYERS[l];
    const outBase = inBase + nIn;
    for (let o = 0; o < nOut; o++) {
      for (let i = 0; i < nIn; i++) {
        edgeGene[e] = g + o * nIn + i;
        edgeSrc[e] = inBase + i;
        edgeDst[e] = outBase + o;
        e++;
      }
    }
    g += nIn * nOut + nOut;
    inBase = outBase;
  }
}

// Edge style buckets: sign x width x alpha. Drawn dim to bright so live paths sit on top.
const W_LEVELS = 4;
const A_LEVELS = 8;
const BUCKETS = 2 * W_LEVELS * A_LEVELS;
const WEIGHT_FULL = 1.6; // |weight| that gets the widest stroke
const SIGNAL_FULL = 1.2; // |weight * activation| that gets full opacity
const TAU = 0.09; // display smoothing time constant, seconds

interface Theme {
  accent: string;
  cool: string;
  ink: string;
  ink2: string;
  ink3: string;
  hairline: string;
  font: string;
}

function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (k: string) => s.getPropertyValue(k).trim();
  return {
    accent: v('--accent'),
    cool: v('--cool'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    hairline: v('--hairline'),
    font: v('--font'),
  };
}

export function createNetView(canvas: HTMLCanvasElement): NetView {
  const ctx = canvas.getContext('2d')!;
  const genome = new Float32Array(GENOME_SIZE);
  const target = new Float32Array(NEURON_COUNT);
  const shown = new Float32Array(NEURON_COUNT);
  const nx = new Float32Array(NEURON_COUNT);
  const ny = new Float32Array(NEURON_COUNT);
  const bucketOf = new Uint8Array(EDGE_COUNT);
  const bucketCount = new Uint16Array(BUCKETS);
  const bucketStart = new Uint16Array(BUCKETS + 1);
  const order = new Uint16Array(EDGE_COUNT);

  let theme = readTheme();
  let labelFont = '';
  let w = 0;
  let h = 0;
  let dpr = 1;
  let r = 5; // neuron radius
  const colX = new Float32Array(LAYERS);
  let barX = 0;
  let barW = 0;
  let hasData = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let destroyed = false;

  function setFonts() {
    labelFont = `600 ${w < 300 ? 8.5 : 9}px ${theme.font}`;
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    setFonts();

    const top = 22; // room for column labels
    const bottom = 8;
    const glyphW = 26;
    const right = Math.max(66, Math.min(110, w * 0.27));
    const x0 = glyphW + 6;
    const x1 = w - right;
    for (let l = 0; l < LAYERS; l++) colX[l] = x0 + ((x1 - x0) * l) / (LAYERS - 1);
    const maxN = NET_LAYERS[0];
    const span = h - top - bottom;
    const gap = span / maxN;
    r = Math.max(3.5, Math.min(7, gap * 0.3));
    const mid = top + span / 2;
    for (let l = 0; l < LAYERS; l++) {
      const n = NET_LAYERS[l];
      // Outputs get double spacing so their indicators have room.
      const g = l === LAYERS - 1 ? gap * 2.4 : gap;
      for (let i = 0; i < n; i++) {
        const k = layerStart[l] + i;
        nx[k] = colX[l];
        ny[k] = mid + (i - (n - 1) / 2) * g;
      }
    }
    barX = x1 + r + 10;
    barW = w - barX - 4;
  }

  function bucketEdges() {
    bucketCount.fill(0);
    for (let e = 0; e < EDGE_COUNT; e++) {
      const wt = genome[edgeGene[e]];
      const mag = Math.abs(wt);
      const wl = Math.min(W_LEVELS - 1, Math.floor((mag / WEIGHT_FULL) * W_LEVELS));
      const sig = Math.min(1, Math.abs(wt * shown[edgeSrc[e]]) / SIGNAL_FULL);
      const al = Math.min(A_LEVELS - 1, Math.floor(Math.sqrt(sig) * A_LEVELS));
      // Index so iterating buckets in order goes dim to bright.
      const b = (al * 2 + (wt < 0 ? 1 : 0)) * W_LEVELS + wl;
      bucketOf[e] = b;
      bucketCount[b]++;
    }
    bucketStart[0] = 0;
    for (let b = 0; b < BUCKETS; b++) bucketStart[b + 1] = bucketStart[b] + bucketCount[b];
    bucketCount.fill(0);
    for (let e = 0; e < EDGE_COUNT; e++) {
      const b = bucketOf[e];
      order[bucketStart[b] + bucketCount[b]++] = e;
    }
  }

  function drawEdges() {
    bucketEdges();
    ctx.lineCap = 'round';
    for (let b = 0; b < BUCKETS; b++) {
      const s = bucketStart[b];
      const t = bucketStart[b + 1];
      if (s === t) continue;
      const wl = b % W_LEVELS;
      const neg = ((b / W_LEVELS) | 0) % 2 === 1;
      const al = (b / (2 * W_LEVELS)) | 0;
      ctx.strokeStyle = neg ? theme.cool : theme.accent;
      ctx.globalAlpha = 0.07 + 0.88 * Math.pow(al / (A_LEVELS - 1), 1.4);
      ctx.lineWidth = 0.6 + wl * 0.75;
      ctx.beginPath();
      for (let k = s; k < t; k++) {
        const e = order[k];
        const a = edgeSrc[e];
        const d = edgeDst[e];
        const xa = nx[a] + r;
        const xb = nx[d] - r;
        const xm = (xa + xb) / 2;
        ctx.moveTo(xa, ny[a]);
        ctx.bezierCurveTo(xm, ny[a], xm, ny[d], xb, ny[d]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawNeurons() {
    for (let k = 0; k < NEURON_COUNT; k++) {
      const a = shown[k];
      const x = nx[k];
      const y = ny[k];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      // Punch out the edges underneath so the canvas works on any background.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (k < NET_LAYERS[0]) {
        ctx.fillStyle = theme.ink;
        ctx.globalAlpha = 0.08 + 0.8 * Math.max(0, Math.min(1, a));
      } else {
        ctx.fillStyle = a < 0 ? theme.cool : theme.accent;
        ctx.globalAlpha = 0.06 + 0.9 * Math.min(1, Math.abs(a));
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.ink3;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawInputGlyphs() {
    const gx = colX[0] - r - 16;
    const len = Math.min(10, r * 1.7);
    ctx.lineCap = 'round';
    for (let i = 0; i < RAY_COUNT; i++) {
      const y = ny[i] + len * 0.45;
      const dx = Math.sin(RAY_ANGLES[i]);
      const dy = -Math.cos(RAY_ANGLES[i]);
      const reach = Math.max(0, Math.min(1, shown[i]));
      // Full ray faint, current reading solid: the glyph shows direction and distance at once.
      ctx.strokeStyle = theme.ink3;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + dx * len, y + dy * len);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + dx * len * reach, y + dy * len * reach);
      ctx.stroke();
      ctx.fillStyle = theme.ink2;
      ctx.fillRect(gx - 1, y - 1, 2, 2);
    }
    // Speed input: a small gauge bar.
    const k = RAY_COUNT;
    const sw = 14;
    const sx = gx - sw / 2;
    const sy = ny[k] - 1;
    ctx.fillStyle = theme.ink3;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(sx, sy, sw, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.ink2;
    ctx.fillRect(sx, sy, sw * Math.max(0, Math.min(1, shown[k])), 2);
  }

  function drawLabels() {
    ctx.font = labelFont;
    ctx.fillStyle = theme.ink3;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const y = 10;
    ctx.fillText('IN', colX[0], y);
    ctx.fillText('HIDDEN', (colX[1] + colX[2]) / 2, y);
    ctx.textAlign = 'left';
    ctx.fillText('OUT', barX - r - 10 - 6, y);
    ctx.textAlign = 'center';
    ctx.fillText('SPD', colX[0] - r - 16, ny[RAY_COUNT] + 12);
  }

  // Bipolar bar centred at mid: steering is ink (a direction, not a judgement); throttle accent, brake cool.
  function drawBar(y: number, v: number, posColor: string, negColor: string, needle: boolean) {
    const c = barX + barW / 2;
    const half = barW / 2;
    v = Math.max(-1, Math.min(1, v));
    ctx.fillStyle = theme.hairline;
    ctx.fillRect(barX, y - 1, barW, 2);
    ctx.fillStyle = theme.ink3;
    ctx.fillRect(c - 0.5, y - 4, 1, 8);
    ctx.fillStyle = v < 0 ? negColor : posColor;
    if (needle) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.min(c, c + v * half), y - 1, Math.abs(v) * half, 2);
      ctx.globalAlpha = 1;
      ctx.fillRect(c + v * half - 1, y - 5, 2, 10);
    } else {
      ctx.fillRect(Math.min(c, c + v * half), y - 2, Math.abs(v) * half, 4);
    }
  }

  function drawOutputs() {
    const steer = shown[OUT_BASE];
    const thr = shown[OUT_BASE + 1];
    ctx.font = labelFont;
    ctx.fillStyle = theme.ink3;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('STEER', barX, ny[OUT_BASE] - 8);
    ctx.fillText(thr < 0 ? 'BRAKE' : 'THROTTLE', barX, ny[OUT_BASE + 1] - 8);
    drawBar(ny[OUT_BASE] + 2, steer, theme.ink, theme.ink, true);
    drawBar(ny[OUT_BASE + 1] + 2, thr, theme.accent, theme.cool, false);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!hasData || w < 40 || h < 40) return;
    drawEdges();
    drawNeurons();
    drawInputGlyphs();
    drawLabels();
    drawOutputs();
  }

  function frame(now: number) {
    raf = 0;
    if (destroyed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1;
    last = now;
    const k = 1 - Math.exp(-dt / TAU);
    let moving = false;
    for (let i = 0; i < NEURON_COUNT; i++) {
      const d = target[i] - shown[i];
      shown[i] += d * k;
      if (Math.abs(d) > 1e-3) moving = true;
    }
    if (visible) draw();
    if (moving) schedule();
    else last = 0;
  }

  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }

  function retheme() {
    theme = readTheme();
    setFonts();
    if (visible) draw();
  }

  const ro = new ResizeObserver(() => {
    layout();
    draw();
  });
  ro.observe(canvas);
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) schedule();
  });
  io.observe(canvas);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', retheme);
  window.addEventListener('themechange', retheme);
  // Inter may arrive after the first paint.
  document.fonts?.ready.then(() => !destroyed && draw());

  layout();

  return {
    update(g, activations) {
      // Copy: callers recycle (and may transfer) their buffers.
      for (let i = 0; i < GENOME_SIZE; i++) genome[i] = g[i];
      for (let i = 0; i < NEURON_COUNT; i++) target[i] = activations[i];
      if (!hasData) {
        shown.set(target);
        hasData = true;
      }
      schedule();
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', retheme);
      window.removeEventListener('themechange', retheme);
    },
  };
}
