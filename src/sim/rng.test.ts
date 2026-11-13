import { expect, test } from 'vitest';
import { createRng, gaussian } from './rng';

test('same seed, same sequence; values in [0, 1)', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  let same = true, diff = false;
  for (let i = 0; i < 1000; i++) {
    const x = a(), y = b();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
    if (x !== y) same = false;
    if (x !== c()) diff = true;
  }
  expect(same).toBe(true);
  expect(diff).toBe(true);
});

test('gaussian has mean 0 and variance 1', () => {
  const r = createRng(7);
  let s = 0, s2 = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) { const g = gaussian(r); s += g; s2 += g * g; }
  expect(Math.abs(s / n)).toBeLessThan(0.03);
  expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
});
