import { expect, test } from 'vitest';
import { buildTrack } from './track';
import { PRESETS } from './presets';
import { TRACK_EXTENT, type Track } from './types';

function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx) ||
    Math.max(ay, by) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by)) return false;
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

/** Any crossing among the closed polylines (each against itself and the others). */
function wallsCross(t: Track): boolean {
  const loops = [[t.lx, t.ly], [t.rx, t.ry]] as const;
  const n = t.n;
  for (let p = 0; p < 2; p++) for (let q = p; q < 2; q++) {
    const [ax, ay] = loops[p], [bx, by] = loops[q];
    for (let i = 0; i < n; i++) for (let j = p === q ? i + 2 : 0; j < n; j++) {
      if (p === q && (j + 1) % n === i) continue;
      const i2 = (i + 1) % n, j2 = (j + 1) % n;
      if (crosses(ax[i], ay[i], ax[i2], ay[i2], bx[j], by[j], bx[j2], by[j2])) return true;
    }
  }
  return false;
}

function circle(r: number, count: number, cw = false): number[] {
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((cw ? -i : i) / count) * Math.PI * 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function assertSmoothOffsets(t: Track): void {
  for (let i = 0; i < t.n; i++) {
    const a = (i + t.n - 1) % t.n, b = (i + 1) % t.n;
    const ux = t.cx[i] - t.cx[a], uy = t.cy[i] - t.cy[a];
    const vx = t.cx[b] - t.cx[i], vy = t.cy[b] - t.cy[i];
    const radius = Math.hypot(ux, uy) * Math.hypot(vx, vy) * Math.hypot(ux + vx, uy + vy) /
      (2 * Math.abs(ux * vy - uy * vx));
    expect(radius, `local radius at ${i}`).toBeGreaterThan(t.halfWidth * 1.99);
    for (const [x, y] of [[t.lx, t.ly], [t.rx, t.ry]]) {
      const wx = x[b] - x[i], wy = y[b] - y[i];
      const px = x[i] - x[a], py = y[i] - y[a];
      // Every offset segment must advance along the centreline, never fold back.
      expect(wx * vx + wy * vy, `offset direction at ${i}`).toBeGreaterThan(0);
      expect(Math.hypot(wx, wy), `pinched wall at ${i}`).toBeGreaterThan(3);
      expect(Math.abs(Math.atan2(px * wy - py * wx, px * wx + py * wy)), `wall turn at ${i}`).toBeLessThan(0.22);
      expect(Math.hypot(x[i] - t.cx[i], y[i] - t.cy[i])).toBeCloseTo(t.halfWidth, 3);
    }
  }
  expect(wallsCross(t)).toBe(false);
}

test('presets are closed, normalised and have clean walls', () => {
  expect(PRESETS.length).toBeGreaterThanOrEqual(4);
  for (const { id, track: t } of PRESETS) {
    expect(t.cum.length, id).toBe(t.n + 1);
    expect(t.cum[t.n]).toBeCloseTo(t.length, 3);
    const close = Math.hypot(t.cx[0] - t.cx[t.n - 1], t.cy[0] - t.cy[t.n - 1]);
    expect(close, id).toBeLessThan(12);
    const w = Math.max(...t.cx) - Math.min(...t.cx), h = Math.max(...t.cy) - Math.min(...t.cy);
    expect(Math.max(w, h), id).toBeCloseTo(TRACK_EXTENT, 0);
    assertSmoothOffsets(t);
  }
});

test('Meridian has the wide stage proportions', () => {
  const t = PRESETS.find((p) => p.id === 'meridian')!.track;
  expect((t.maxX - t.minX) / (t.maxY - t.minY)).toBeGreaterThan(1.5);
  expect((t.maxX - t.minX) / (t.maxY - t.minY)).toBeLessThan(1.7);
});

test('polygonal freehand rectangles, triangles and concave loops round into smooth roads', () => {
  const polygons = [
    [[0, 0], [400, 0], [400, 250], [0, 250]],
    [[0, 300], [200, 0], [400, 300]],
    [[0, 0], [150, 0], [150, 200], [400, 200], [400, 350], [0, 350]],
    [[0, 0], [120, 0], [120, 250], [280, 250], [280, 0], [400, 0], [400, 350], [0, 350]],
  ];
  for (const polygon of polygons) for (const samples of [3, 30]) {
    const points: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      for (let j = 0; j < samples; j++) points.push(a[0] + (b[0] - a[0]) * j / samples, a[1] + (b[1] - a[1]) * j / samples);
    }
    const t = buildTrack(points);
    expect(t).not.toBeNull();
    assertSmoothOffsets(t!);
  }
});

test('freehand jittery loop with overshoot builds a track', () => {
  const pts: number[] = [];
  let s = 1;
  const jitter = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
  for (let i = 0; i < 230; i++) {
    const a = (i / 200) * Math.PI * 2; // 15% overshoot past the start
    pts.push(300 + Math.cos(a) * 200 + jitter(), 300 + Math.sin(a) * 120 + jitter());
  }
  const t = buildTrack(pts);
  expect(t).not.toBeNull();
  expect(wallsCross(t!)).toBe(false);
});

test('direction of travel follows the drawing direction', () => {
  const area = (t: Track) => {
    let a = 0;
    for (let i = 0; i < t.n; i++) { const j = (i + 1) % t.n; a += t.cx[i] * t.cy[j] - t.cx[j] * t.cy[i]; }
    return a;
  };
  const ccw = buildTrack(circle(100, 80))!, cw = buildTrack(circle(100, 80, true))!;
  expect(Math.sign(area(ccw))).toBe(1);
  expect(Math.sign(area(cw))).toBe(-1);
});

test('garbage strokes return null', () => {
  expect(buildTrack([])).toBeNull();
  expect(buildTrack([0, 0, 1, 1, 2, 2])).toBeNull();
  expect(buildTrack([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  const line: number[] = [];
  for (let i = 0; i < 100; i++) line.push(i, i * 0.5);
  expect(buildTrack(line)).toBeNull();
  const eight: number[] = [];
  for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; eight.push(Math.sin(a) * 300, Math.sin(2 * a) * 150); }
  expect(buildTrack(eight)).toBeNull();
  expect(buildTrack([NaN, 0, ...circle(100, 40)])).toBeNull();
});
