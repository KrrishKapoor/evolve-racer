import { TRACK_EXTENT, TRACK_HALF_WIDTH, type Track } from './types';

const SPACING = 8; // world units between centreline samples
const MIN_RADIUS = 1.3 * TRACK_HALF_WIDTH;

type Loop = { x: number[]; y: number[] };

function perimeter(p: Loop): number {
  let len = 0;
  const n = p.x.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    len += Math.hypot(p.x[j] - p.x[i], p.y[j] - p.y[i]);
  }
  return len;
}

/** Evenly resample a closed loop to `count` points. */
function resample(p: Loop, count: number): Loop {
  const n = p.x.length;
  const total = perimeter(p);
  const step = total / count;
  const x: number[] = [];
  const y: number[] = [];
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(p.x[1 % n] - p.x[0], p.y[1 % n] - p.y[0]);
  for (let k = 0; k < count; k++) {
    const d = k * step;
    while (segStart + segLen < d && seg < n - 1) {
      segStart += segLen;
      seg++;
      const j = (seg + 1) % n;
      segLen = Math.hypot(p.x[j] - p.x[seg], p.y[j] - p.y[seg]);
    }
    const j = (seg + 1) % n;
    const t = segLen > 0 ? Math.min(1, (d - segStart) / segLen) : 0;
    x.push(p.x[seg] + (p.x[j] - p.x[seg]) * t);
    y.push(p.y[seg] + (p.y[j] - p.y[seg]) * t);
  }
  return { x, y };
}

/** Scale and translate so the longer bbox side is TRACK_EXTENT, min corner at the origin. */
function normalise(p: Loop): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < p.x.length; i++) {
    minX = Math.min(minX, p.x[i]); maxX = Math.max(maxX, p.x[i]);
    minY = Math.min(minY, p.y[i]); maxY = Math.max(maxY, p.y[i]);
  }
  const s = TRACK_EXTENT / Math.max(maxX - minX, maxY - minY);
  for (let i = 0; i < p.x.length; i++) {
    p.x[i] = (p.x[i] - minX) * s;
    p.y[i] = (p.y[i] - minY) * s;
  }
}

/** Circumradius through samples i-k, i, i+k (Infinity when collinear). */
function radiusAt(p: Loop, i: number, k: number): number {
  const n = p.x.length;
  const a = (i - k + n) % n, c = (i + k) % n;
  const ax = p.x[a], ay = p.y[a], bx = p.x[i], by = p.y[i], cx = p.x[c], cy = p.y[c];
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(cross) < 1e-9) return Infinity;
  const ab = Math.hypot(bx - ax, by - ay), bc = Math.hypot(cx - bx, cy - by), ca = Math.hypot(ax - cx, ay - cy);
  return (ab * bc * ca) / (2 * Math.abs(cross));
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function selfIntersects(x: number[], y: number[]): boolean {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      if (segmentsCross(x[i], y[i], x[i2], y[i2], x[j], y[j], x[j2], y[j2])) return true;
    }
  }
  return false;
}

/**
 * Build a track from a freehand closed stroke (x,y pairs). Returns null for
 * strokes that are too short, too small, or that cross themselves.
 */
export function buildTrack(points: ArrayLike<number>): Track | null {
  const raw: Loop = { x: [], y: [] };
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const m = raw.x.length;
    if (m > 0 && x === raw.x[m - 1] && y === raw.y[m - 1]) continue;
    raw.x.push(x);
    raw.y.push(y);
  }
  if (raw.x.length < 8) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < raw.x.length; i++) {
    minX = Math.min(minX, raw.x[i]); maxX = Math.max(maxX, raw.x[i]);
    minY = Math.min(minY, raw.y[i]); maxY = Math.max(maxY, raw.y[i]);
  }
  const ext = Math.max(maxX - minX, maxY - minY);
  if (!(ext > 0) || Math.min(maxX - minX, maxY - minY) < ext * 0.12) return null;
  // The closing gap must be small relative to the drawing, or it was not a loop.
  const gap = Math.hypot(raw.x[0] - raw.x[raw.x.length - 1], raw.y[0] - raw.y[raw.y.length - 1]);
  if (gap > ext * 0.35) return null;
  if (perimeter(raw) < ext * 2) return null;

  normalise(raw);
  let p = resample(raw, Math.round(perimeter(raw) / SPACING));
  if (selfIntersects(p.x, p.y)) return null;

  // Smooth: a few global passes to remove hand jitter, then local passes only
  // where the radius is still too tight, so the overall shape survives.
  const k = Math.max(2, Math.round(TRACK_HALF_WIDTH / SPACING));
  let ok = false;
  for (let iter = 0; iter < 400; iter++) {
    const n = p.x.length;
    const r: number[] = [];
    let minR = Infinity;
    for (let i = 0; i < n; i++) {
      r.push(radiusAt(p, i, k));
      if (r[i] < minR) minR = r[i];
    }
    if (iter >= 4 && minR > MIN_RADIUS) { ok = true; break; }
    const nx = p.x.slice(), ny = p.y.slice();
    for (let i = 0; i < n; i++) {
      let tight = iter < 4;
      for (let d = -k; d <= k && !tight; d++) if (r[(i + d + n) % n] < MIN_RADIUS * 1.15) tight = true;
      if (!tight) continue;
      const a = (i - 1 + n) % n, c = (i + 1) % n;
      nx[i] = 0.25 * p.x[a] + 0.5 * p.x[i] + 0.25 * p.x[c];
      ny[i] = 0.25 * p.y[a] + 0.5 * p.y[i] + 0.25 * p.y[c];
    }
    p = { x: nx, y: ny };
    if (iter % 8 === 7) {
      normalise(p);
      p = resample(p, Math.round(perimeter(p) / SPACING));
    }
  }
  if (!ok) return null;
  normalise(p);
  p = resample(p, Math.round(perimeter(p) / SPACING));
  const n = p.x.length;
  if (n < 40 || selfIntersects(p.x, p.y)) return null;

  // Parts of the loop that are far apart along the track must also be far apart in space,
  // otherwise neighbouring sections would share walls.
  const total = perimeter(p);
  const clear = 2 * TRACK_HALF_WIDTH + 6;
  const skip = Math.ceil((Math.PI * clear) / (total / n));
  for (let i = 0; i < n; i++) {
    for (let j = i + skip; j < n; j++) {
      if (n - (j - i) < skip) continue;
      const dx = p.x[i] - p.x[j], dy = p.y[i] - p.y[j];
      if (dx * dx + dy * dy < clear * clear) return null;
    }
  }

  // Start line: 30% into the longest stretch of low curvature.
  const turn: number[] = [];
  for (let i = 0; i < n; i++) turn.push(1 / radiusAt(p, i, k));
  const straight = 1 / 250;
  let bestLen = 0, bestStart = 0;
  for (let s = 0; s < n; s++) {
    if (turn[s] > straight || turn[(s - 1 + n) % n] <= straight) continue;
    let len = 0;
    while (len < n && turn[(s + len) % n] <= straight) len++;
    if (len > bestLen) { bestLen = len; bestStart = s; }
  }
  if (bestLen === 0) {
    // No straight at all (e.g. a circle): start anywhere.
    bestStart = 0;
  }
  const s0 = (bestStart + Math.floor(bestLen * 0.3)) % n;

  const cx = new Float32Array(n), cy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = p.x[(i + s0) % n];
    cy[i] = p.y[(i + s0) % n];
  }
  return makeTrack(cx, cy);
}

/** Derive walls, arc lengths, bounds and spawn pose from a closed centreline. */
function makeTrack(cx: Float32Array, cy: Float32Array): Track {
  const n = cx.length;
  const hw = TRACK_HALF_WIDTH;
  const lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
  const cum = new Float32Array(n + 1);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, c = (i + 1) % n;
    let tx = cx[c] - cx[a], ty = cy[c] - cy[a];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    // Left is the side of negative angles relative to heading: (ty, -tx).
    lx[i] = cx[i] + ty * hw; ly[i] = cy[i] - tx * hw;
    rx[i] = cx[i] - ty * hw; ry[i] = cy[i] + tx * hw;
    minX = Math.min(minX, lx[i], rx[i]); maxX = Math.max(maxX, lx[i], rx[i]);
    minY = Math.min(minY, ly[i], ry[i]); maxY = Math.max(maxY, ly[i], ry[i]);
    cum[i + 1] = cum[i] + Math.hypot(cx[c] - cx[i], cy[c] - cy[i]);
  }
  return {
    n, cx, cy, lx, ly, rx, ry, cum,
    length: cum[n],
    halfWidth: hw,
    minX, minY, maxX, maxY,
    startX: cx[0],
    startY: cy[0],
    startAngle: Math.atan2(cy[1] - cy[0], cx[1] - cx[0]),
  };
}
