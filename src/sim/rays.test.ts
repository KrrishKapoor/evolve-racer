import { expect, test } from 'vitest';
import { createRaycaster } from './rays';
import { buildTrack } from './track';
import { RAY_ANGLES, RAY_COUNT, RAY_RANGE } from './types';

/** Distance along a ray from (x, y) to a circle around (ox, oy), the first hit ahead. */
function rayCircle(x: number, y: number, a: number, ox: number, oy: number, r: number): number {
  const dx = Math.cos(a), dy = Math.sin(a);
  const fx = x - ox, fy = y - oy;
  const b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t1 = -b - s, t2 = -b + s;
  return t1 > 1e-6 ? t1 : t2 > 1e-6 ? t2 : Infinity;
}

test('rays on a circular track match analytic distances', () => {
  const pts: number[] = [];
  for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; pts.push(Math.cos(a) * 10, Math.sin(a) * 10); }
  const t = buildTrack(pts)!;
  expect(t).not.toBeNull();
  // Centre and radius from the centreline.
  let ox = 0, oy = 0;
  for (let i = 0; i < t.n; i++) { ox += t.cx[i]; oy += t.cy[i]; }
  ox /= t.n; oy /= t.n;
  const R = Math.hypot(t.cx[0] - ox, t.cy[0] - oy);
  const cast = createRaycaster(t);
  const out = new Float32Array(RAY_COUNT);
  for (const [k, lateral] of [[0, 0], [5, 10], [40, -15]]) {
    const x0 = t.cx[k], y0 = t.cy[k];
    const ux = (x0 - ox) / R, uy = (y0 - oy) / R;
    const x = x0 + ux * lateral, y = y0 + uy * lateral;
    const heading = t.startAngle + (k / t.n) * Math.PI * 2;
    cast(x, y, heading, out);
    for (let i = 0; i < RAY_COUNT; i++) {
      const a = heading + RAY_ANGLES[i];
      const d = Math.min(rayCircle(x, y, a, ox, oy, R + t.halfWidth), rayCircle(x, y, a, ox, oy, R - t.halfWidth), RAY_RANGE);
      expect(out[i] * RAY_RANGE).toBeCloseTo(d, 0);
    }
  }
});
