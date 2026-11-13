// Headless evolution + performance bench. Run with: BENCH=1 npx vitest run src/sim/dev/bench.test.ts
import { test } from 'vitest';
import { PRESETS } from '../presets';
import { createSimulation, TOP_SPEED, GRIP, ACCEL, BRAKE } from '../sim';
import type { Track } from '../types';

/** Fastest possible lap driving exactly on the centreline (grip, accel and brake limits, no drag). */
function centrelineLap(t: Track): number {
  const n = t.n, k = 3;
  const vmax = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n, c = (i + k) % n;
    const ax = t.cx[a], ay = t.cy[a], bx = t.cx[i], by = t.cy[i], cx = t.cx[c], cy = t.cy[c];
    const cr = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    const r = cr < 1e-9 ? Infinity : (Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(ax - cx, ay - cy)) / (2 * cr);
    vmax[i] = Math.min(TOP_SPEED, Math.sqrt(GRIP * r));
  }
  const ds = (i: number) => t.cum[i + 1] - t.cum[i];
  const v = Float64Array.from(vmax);
  for (let pass = 0; pass < 2; pass++) for (let j = 2 * n - 1; j >= 0; j--) {
    const i = j % n, nx = (i + 1) % n;
    v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * BRAKE * ds(i)));
  }
  let cur = 0, time = 0;
  for (let i = 0; i < n; i++) {
    const nv = Math.min(v[(i + 1) % n], Math.sqrt(cur * cur + 2 * ACCEL * ds(i)));
    time += (2 * ds(i)) / (cur + nv);
    cur = nv;
  }
  return time;
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

test.skipIf(!env.BENCH)('bench', () => {
  const gens = Number(env.GENS ?? 30);
  for (const p of PRESETS) {
    const sim = createSimulation(p.track, { population: Number(env.POP ?? 1000), seed: Number(env.SEED ?? 1) });
    // Cost with all 1000 cars alive: the first 60 steps of generation 1.
    let a = performance.now();
    for (let i = 0; i < 60; i++) sim.step();
    const fullMs = (performance.now() - a) / 60;
    let steps = 60, stepTime = fullMs * 60, firstLapGen = 0;
    const log: string[] = [];
    for (let g = 0; g < gens;) {
      a = performance.now();
      const s = sim.step();
      stepTime += performance.now() - a; steps++;
      if (s) {
        g++;
        if (s.bestLap > 0 && !firstLapGen) firstLapGen = s.generation;
        if (s.generation % 3 === 0 || s.generation === 1) log.push(`${s.generation}:${s.bestLap > 0 ? s.bestLap.toFixed(2) + 's' : (s.bestProgress * 100).toFixed(0) + '%'}`);
      }
    }
    console.log(`${p.id}: L=${p.track.length.toFixed(0)} centrelineBound=${centrelineLap(p.track).toFixed(2)}s firstLapGen=${firstLapGen} ms/step(1000 alive)=${fullMs.toFixed(3)} ms/step(avg)=${(stepTime / steps).toFixed(3)}`);
    console.log('  ' + log.join(' '));
  }
}, 900000);
