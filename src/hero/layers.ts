// Static layers rendered once to offscreen canvases: the circuit, and the best line (once per generation).
import type { Track } from '../sim/types';
import { palette } from './theme';
import { applyView, type View } from './view';

export function makeLayer(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function prep(c: HTMLCanvasElement, w: number, h: number, dpr: number, v: View): CanvasRenderingContext2D {
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  applyView(g, v, dpr);
  return g;
}

function loop(g: CanvasRenderingContext2D, xs: Float32Array, ys: Float32Array, n: number, reverse = false): void {
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k;
    if (k === 0) g.moveTo(xs[i], ys[i]);
    else g.lineTo(xs[i], ys[i]);
  }
  g.closePath();
}

export function drawTrackLayer(c: HTMLCanvasElement, t: Track, w: number, h: number, dpr: number, v: View): void {
  const g = prep(c, w, h, dpr, v);
  const px = 1 / v.s; // one CSS pixel in world units

  g.beginPath();
  loop(g, t.lx, t.ly, t.n);
  loop(g, t.rx, t.ry, t.n, true);
  g.fillStyle = palette.asphalt;
  g.fill('evenodd');

  g.lineJoin = 'round';
  g.strokeStyle = palette.wall;
  g.lineWidth = 1.25 * px;
  g.beginPath();
  loop(g, t.lx, t.ly, t.n);
  loop(g, t.rx, t.ry, t.n);
  g.stroke();

  // Centreline, barely there.
  g.strokeStyle = palette.hairline;
  g.lineWidth = px;
  g.setLineDash([6 * px, 8 * px]);
  g.beginPath();
  loop(g, t.cx, t.cy, t.n);
  g.stroke();
  g.setLineDash([]);

  // Start/finish: a crisp chequer across the track at sample 0.
  const dx = t.rx[0] - t.lx[0];
  const dy = t.ry[0] - t.ly[0];
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len; // across
  const fx = -uy, fy = ux; // along (perpendicular)
  const cells = 8;
  const cs = len / cells;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cells; i++) {
      g.fillStyle = (i + row) % 2 ? palette.wall : palette.asphalt;
      const ax = t.lx[0] + ux * cs * i + fx * cs * (row - 1);
      const ay = t.ly[0] + uy * cs * i + fy * cs * (row - 1);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(ax + ux * cs, ay + uy * cs);
      g.lineTo(ax + ux * cs + fx * cs, ay + uy * cs + fy * cs);
      g.lineTo(ax + fx * cs, ay + fy * cs);
      g.closePath();
      g.fill();
    }
  }
}

const BUCKETS = 6;

/** Best line as a glowing accent stroke whose opacity follows speed. */
export function drawLineLayer(c: HTMLCanvasElement, line: Float32Array | null, w: number, h: number, dpr: number, v: View): void {
  const g = prep(c, w, h, dpr, v);
  if (!line || line.length < 6) return;
  const px = 1 / v.s;
  const m = line.length / 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Soft halo underneath, one path.
  g.strokeStyle = palette.accentSoft;
  g.lineWidth = 9 * px;
  g.beginPath();
  for (let i = 0; i < m; i++) {
    if (i === 0) g.moveTo(line[0], line[1]);
    else g.lineTo(line[3 * i], line[3 * i + 1]);
  }
  g.stroke();

  g.strokeStyle = palette.accent;
  g.lineWidth = 2 * px;
  for (let b = 0; b < BUCKETS; b++) {
    g.globalAlpha = 0.3 + (0.7 * (b + 1)) / BUCKETS;
    g.beginPath();
    for (let i = 1; i < m; i++) {
      const sp = line[3 * i + 2];
      if (Math.min(BUCKETS - 1, Math.floor(sp * BUCKETS)) !== b) continue;
      g.moveTo(line[3 * i - 3], line[3 * i - 2]);
      g.lineTo(line[3 * i], line[3 * i + 1]);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}
