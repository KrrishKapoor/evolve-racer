import { expect, test } from 'vitest';
import { crossover, mutate, tournament } from './ga';
import { createRng } from './rng';
import { GENOME_SIZE, NET_LAYERS } from './types';

test('crossover takes each neuron (weights + bias) from exactly one parent', () => {
  const a = new Float32Array(GENOME_SIZE).fill(1);
  const b = new Float32Array(GENOME_SIZE * 2).fill(2);
  const out = new Float32Array(GENOME_SIZE * 2);
  crossover(a, 0, b, GENOME_SIZE, out, GENOME_SIZE, createRng(3));
  expect(out.subarray(0, GENOME_SIZE).every((v) => v === 0)).toBe(true);
  const child = out.subarray(GENOME_SIZE);
  let g = 0, fromA = 0, fromB = 0;
  for (let l = 1; l < NET_LAYERS.length; l++) {
    const nIn = NET_LAYERS[l - 1], nOut = NET_LAYERS[l];
    for (let o = 0; o < nOut; o++) {
      const v = child[g + nOut * nIn + o];
      for (let i = 0; i < nIn; i++) expect(child[g + o * nIn + i]).toBe(v);
      if (v === 1) fromA++; else if (v === 2) fromB++;
    }
    g += nOut * nIn + nOut;
  }
  expect(fromA + fromB).toBe(16);
  expect(fromA).toBeGreaterThan(0);
  expect(fromB).toBeGreaterThan(0);
});

test('mutate: rate 0 changes nothing, rate 1 changes everything, and stays in its slot', () => {
  const r = createRng(5);
  const g = new Float32Array(GENOME_SIZE * 2);
  mutate(g, 0, r, 0, 1);
  expect(g.every((v) => v === 0)).toBe(true);
  mutate(g, GENOME_SIZE, r, 1, 0.5);
  expect(g.subarray(0, GENOME_SIZE).every((v) => v === 0)).toBe(true);
  expect(g.subarray(GENOME_SIZE).every((v) => v !== 0)).toBe(true);
});

test('tournament favours fitter entries and stays in range', () => {
  const r = createRng(9);
  const f = Float32Array.from({ length: 100 }, (_, i) => i);
  let sum = 0;
  for (let t = 0; t < 2000; t++) {
    const w = tournament(f, 50, 4, r);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(50);
    sum += w;
  }
  expect(sum / 2000).toBeGreaterThan(35); // uniform would average 24.5
  expect(tournament(f, 100, 400, r)).toBe(99);
});
