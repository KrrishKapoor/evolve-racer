import { RAY_ANGLES, RAY_COUNT, RAY_RANGE, type Track } from './types';

const CELL = 32;

/**
 * Builds a ray caster for both walls of a track. Wall segments are binned into
 * a uniform grid; each ray walks the grid cells it crosses (DDA) and stops at
 * the first cell that contains a hit, so cost depends on ray length, not track size.
 */
export function createRaycaster(track: Track): (x: number, y: number, angle: number, out: Float32Array) => void {
  const n = track.n;
  const segCount = 2 * n;
  // Segment i: start (sx, sy), delta (dx, dy).
  const sx = new Float32Array(segCount), sy = new Float32Array(segCount);
  const sdx = new Float32Array(segCount), sdy = new Float32Array(segCount);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sx[i] = track.lx[i]; sy[i] = track.ly[i];
    sdx[i] = track.lx[j] - track.lx[i]; sdy[i] = track.ly[j] - track.ly[i];
    sx[n + i] = track.rx[i]; sy[n + i] = track.ry[i];
    sdx[n + i] = track.rx[j] - track.rx[i]; sdy[n + i] = track.ry[j] - track.ry[i];
  }
  const ox = track.minX - CELL, oy = track.minY - CELL;
  const cols = Math.ceil((track.maxX - ox) / CELL) + 2;
  const rows = Math.ceil((track.maxY - oy) / CELL) + 2;
  const cellCount = cols * rows;

  // Two passes into a CSR layout: count, then fill.
  const start = new Int32Array(cellCount + 1);
  const forEachCell = (s: number, fn: (c: number) => void) => {
    const x0 = sx[s], y0 = sy[s], x1 = x0 + sdx[s], y1 = y0 + sdy[s];
    const c0 = Math.floor((Math.min(x0, x1) - ox) / CELL), c1 = Math.floor((Math.max(x0, x1) - ox) / CELL);
    const r0 = Math.floor((Math.min(y0, y1) - oy) / CELL), r1 = Math.floor((Math.max(y0, y1) - oy) / CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * cols + c);
  };
  for (let s = 0; s < segCount; s++) forEachCell(s, (c) => start[c + 1]++);
  for (let c = 0; c < cellCount; c++) start[c + 1] += start[c];
  const items = new Int32Array(start[cellCount]);
  const fill = start.slice(0, cellCount);
  for (let s = 0; s < segCount; s++) forEachCell(s, (c) => { items[fill[c]++] = s; });

  const rayCos = Float64Array.from(RAY_ANGLES, Math.cos), raySin = Float64Array.from(RAY_ANGLES, Math.sin);
  return (x, y, angle, out) => {
    const ch = Math.cos(angle) * RAY_RANGE, sh = Math.sin(angle) * RAY_RANGE;
    for (let k = 0; k < RAY_COUNT; k++) {
      // Heading rotated by the ray's fixed offset; avoids two trig calls per ray.
      const rdx = ch * rayCos[k] - sh * raySin[k], rdy = sh * rayCos[k] + ch * raySin[k];
      // DDA over cells, in units of t (0..1 along the ray).
      let cx = Math.floor((x - ox) / CELL), cy = Math.floor((y - oy) / CELL);
      const stepX = rdx > 0 ? 1 : -1, stepY = rdy > 0 ? 1 : -1;
      const tdx = rdx !== 0 ? Math.abs(CELL / rdx) : Infinity;
      const tdy = rdy !== 0 ? Math.abs(CELL / rdy) : Infinity;
      let tmx = rdx !== 0 ? ((rdx > 0 ? cx + 1 : cx) * CELL + ox - x) / rdx : Infinity;
      let tmy = rdy !== 0 ? ((rdy > 0 ? cy + 1 : cy) * CELL + oy - y) / rdy : Infinity;
      let best = 1;
      for (;;) {
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) {
          const cell = cy * cols + cx;
          for (let p = start[cell], e = start[cell + 1]; p < e; p++) {
            const s = items[p];
            const ex = sdx[s], ey = sdy[s];
            const den = rdx * ey - rdy * ex;
            if (den === 0) continue;
            const qx = sx[s] - x, qy = sy[s] - y;
            const t = (qx * ey - qy * ex) / den;
            if (t < 0 || t >= best) continue;
            const u = (qx * rdy - qy * rdx) / den;
            if (u >= 0 && u <= 1) best = t;
          }
        }
        const tNext = tmx < tmy ? tmx : tmy;
        if (best <= tNext || tNext >= 1) break;
        if (tmx < tmy) { tmx += tdx; cx += stepX; } else { tmy += tdy; cy += stepY; }
      }
      out[k] = best;
    }
  };
}
