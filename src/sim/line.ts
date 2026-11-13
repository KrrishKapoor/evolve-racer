import { ACCEL, BRAKE, GRIP, TOP_SPEED } from './sim';
import type { Track } from './types';

/**
 * Fastest possible standing-start lap driving exactly on the centreline under the
 * sim's grip, acceleration and braking limits (drag ignored, so it is a lower bound).
 * An evolved lap that beats this must be using the width of the track.
 * Fills `speedOut` (optional, n entries) with the speed profile, units/s.
 */
export function centrelineLapTime(t: Track, speedOut?: Float32Array): number {
  const n = t.n, k = 3;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n, c = (i + k) % n;
    const ax = t.cx[a], ay = t.cy[a], bx = t.cx[i], by = t.cy[i], cx = t.cx[c], cy = t.cy[c];
    const cr = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    const r = cr < 1e-9 ? Infinity : (Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(ax - cx, ay - cy)) / (2 * cr);
    v[i] = Math.min(TOP_SPEED, Math.sqrt(GRIP * r));
  }
  const ds = (i: number) => t.cum[i + 1] - t.cum[i];
  // Braking pass, twice round so it wraps.
  for (let j = 2 * n - 1; j >= 0; j--) {
    const i = j % n, nx = (i + 1) % n;
    v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * BRAKE * ds(i)));
  }
  let cur = 0, time = 0;
  for (let i = 0; i < n; i++) {
    if (speedOut) speedOut[i] = cur;
    const nv = Math.min(v[(i + 1) % n], Math.sqrt(cur * cur + 2 * ACCEL * ds(i)));
    time += (2 * ds(i)) / (cur + nv);
    cur = nv;
  }
  return time;
}
