import { expect, test } from 'vitest';
import { forward, randomGenome } from './nn';
import { createRng } from './rng';
import { GENOME_SIZE, NEURON_COUNT } from './types';

test('forward pass matches a hand-computed case', () => {
  const g = new Float32Array(GENOME_SIZE);
  // Layer 1 (8 -> 8): w[0][0] = 1, w[1][7] = -2, bias[1] = 0.25.
  g[0 * 8 + 0] = 1;
  g[1 * 8 + 7] = -2;
  g[64 + 1] = 0.25;
  // Layer 2 (8 -> 6) starts at 72: w[0][0] = 1, w[0][1] = 1.
  g[72 + 0] = 1;
  g[72 + 1] = 1;
  // Layer 3 (6 -> 2) starts at 126: w[0][0] = 1; bias[1] = 0.5 (index 126 + 12 + 1).
  g[126 + 0] = 1;
  g[126 + 13] = 0.5;
  const inputs = Float32Array.from([0.5, 0, 0, 0, 0, 0, 0, 0.3]);
  const act = new Float32Array(NEURON_COUNT);
  forward(g, 0, inputs, act);
  expect(Array.from(act.subarray(0, 8))).toEqual(Array.from(inputs));
  const h10 = Math.tanh(0.5), h11 = Math.tanh(0.25 - 2 * 0.3);
  expect(act[8]).toBeCloseTo(h10, 5);
  expect(act[9]).toBeCloseTo(h11, 5);
  const h20 = Math.tanh(h10 + h11);
  expect(act[16]).toBeCloseTo(h20, 5);
  expect(act[22]).toBeCloseTo(Math.tanh(h20), 5);
  expect(act[23]).toBeCloseTo(Math.tanh(0.5), 5);
});

test('forward respects the genome offset and randomGenome fills one genome', () => {
  const r = createRng(1);
  const buf = new Float32Array(GENOME_SIZE * 3);
  randomGenome(r, buf, GENOME_SIZE);
  expect(buf.subarray(0, GENOME_SIZE).every((v) => v === 0)).toBe(true);
  expect(buf.subarray(2 * GENOME_SIZE).every((v) => v === 0)).toBe(true);
  const single = buf.slice(GENOME_SIZE, 2 * GENOME_SIZE);
  const inputs = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  const a = new Float32Array(NEURON_COUNT), b = new Float32Array(NEURON_COUNT);
  forward(buf, GENOME_SIZE, inputs, a);
  forward(single, 0, inputs, b);
  expect(Array.from(a)).toEqual(Array.from(b));
  for (const v of a.subarray(8)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
});
