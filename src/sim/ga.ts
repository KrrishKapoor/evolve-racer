import { NET_LAYERS, GENOME_SIZE } from './types';
import { gaussian } from './rng';

/**
 * Uniform crossover per neuron: each neuron's incoming weights and bias come
 * together from one parent, so useful feature detectors are not torn apart.
 */
export function crossover(
  a: Float32Array,
  aOff: number,
  b: Float32Array,
  bOff: number,
  out: Float32Array,
  outOff: number,
  rng: () => number,
): void {
  let g = 0;
  for (let l = 1; l < NET_LAYERS.length; l++) {
    const nIn = NET_LAYERS[l - 1];
    const nOut = NET_LAYERS[l];
    const biasBase = g + nOut * nIn;
    for (let o = 0; o < nOut; o++) {
      const fromA = rng() < 0.5;
      const src = fromA ? a : b;
      const so = fromA ? aOff : bOff;
      const row = g + o * nIn;
      for (let i = 0; i < nIn; i++) out[outOff + row + i] = src[so + row + i];
      out[outOff + biasBase + o] = src[so + biasBase + o];
    }
    g = biasBase + nOut;
  }
}

/** Adds N(0, sigma) to each gene with probability rate. */
export function mutate(
  genome: Float32Array,
  offset: number,
  rng: () => number,
  rate: number,
  sigma: number,
): void {
  for (let i = 0; i < GENOME_SIZE; i++) {
    if (rng() < rate) genome[offset + i] += gaussian(rng) * sigma;
  }
}

/** Index of the fittest of k uniformly drawn entries among the first count. */
export function tournament(fitness: Float32Array, count: number, k: number, rng: () => number): number {
  let best = (rng() * count) | 0;
  for (let j = 1; j < k; j++) {
    const c = (rng() * count) | 0;
    if (fitness[c] > fitness[best]) best = c;
  }
  return best;
}
