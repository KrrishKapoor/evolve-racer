// Writes preset outlines to SVG for eyeballing. Run with: BENCH=1 SVG=/path/out.html npx vitest run src/sim/dev/svg.test.ts
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { PRESETS } from '../presets';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

test.skipIf(!env.SVG)('svg', () => {
  const path = (xs: Float32Array, ys: Float32Array) => 'M' + Array.from(xs, (x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join('L') + 'Z';
  const svgs = PRESETS.map(({ track: t, name }) =>
    `<figure><figcaption>${name}</figcaption><svg viewBox="-40 -40 1080 1080" width="300"><path d="${path(t.lx, t.ly)}" fill="none" stroke="#000"/><path d="${path(t.rx, t.ry)}" fill="none" stroke="#000"/><circle cx="${t.startX}" cy="${t.startY}" r="8" fill="red"/></svg></figure>`);
  writeFileSync(env.SVG!, `<body style="display:flex;flex-wrap:wrap">${svgs.join('')}</body>`);
});
