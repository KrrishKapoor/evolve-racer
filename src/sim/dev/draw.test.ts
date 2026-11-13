// Robustness probe for freehand strokes. Run with: BENCH=1 npx vitest run src/sim/dev/draw.test.ts
import { test } from 'vitest';
import { buildTrack } from '../track';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

function poly(vs: number[][], per: number): number[] {
  const out: number[] = [];
  let s = 7;
  const j = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 3;
  for (let i = 0; i < vs.length; i++) {
    const [ax, ay] = vs[i], [bx, by] = vs[(i + 1) % vs.length];
    for (let k = 0; k < per; k++) out.push(ax + ((bx - ax) * k) / per + j(), ay + ((by - ay) * k) / per + j());
  }
  return out;
}
const star = (pts: number, r1: number, r2: number) =>
  Array.from({ length: pts * 2 }, (_, i) => { const a = (i / (pts * 2)) * Math.PI * 2, r = i % 2 ? r2 : r1; return [200 + Math.cos(a) * r, 200 + Math.sin(a) * r]; });

test.skipIf(!env.BENCH)('draw', () => {
  const shapes: Record<string, number[]> = {
    rect: poly([[0, 0], [400, 0], [400, 250], [0, 250]], 20),
    L: poly([[0, 0], [150, 0], [150, 200], [400, 200], [400, 350], [0, 350]], 12),
    triangle: poly([[0, 300], [200, 0], [400, 300]], 25),
    star5: poly(star(5, 200, 110), 8),
    star5deep: poly(star(5, 200, 70), 8),
    coarseRect: poly([[0, 0], [400, 0], [400, 250], [0, 250]], 3),
    U: poly([[0, 0], [120, 0], [120, 250], [280, 250], [280, 0], [400, 0], [400, 350], [0, 350]], 10),
    tiny: poly([[0, 0], [20, 0], [20, 15], [0, 15]], 10),
  };
  for (const [name, pts] of Object.entries(shapes)) {
    const a = performance.now();
    const t = buildTrack(pts);
    console.log(name, t ? `ok n=${t.n} L=${t.length.toFixed(0)}` : 'NULL', `${(performance.now() - a).toFixed(1)}ms`);
  }
});
