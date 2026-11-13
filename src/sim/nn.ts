import { NET_LAYERS, GENOME_SIZE } from './types';
import { gaussian } from './rng';

const L = NET_LAYERS.length;

/** Runs the net. activations gets inputs, hidden layers and outputs concatenated. */
export function forward(
  genome: Float32Array,
  offset: number,
  inputs: Float32Array,
  activations: Float32Array,
): void {
  const n0 = NET_LAYERS[0];
  for (let i = 0; i < n0; i++) activations[i] = inputs[i];
  let g = offset;
  let inBase = 0;
  let outBase = n0;
  for (let l = 1; l < L; l++) {
    const nIn = NET_LAYERS[l - 1];
    const nOut = NET_LAYERS[l];
    const biasBase = g + nOut * nIn;
    for (let o = 0; o < nOut; o++) {
      let sum = genome[biasBase + o];
      const row = g + o * nIn;
      for (let i = 0; i < nIn; i++) sum += genome[row + i] * activations[inBase + i];
      activations[outBase + o] = Math.tanh(sum);
    }
    g = biasBase + nOut;
    inBase = outBase;
    outBase += nOut;
  }
}

/** Gaussian init scaled by fan-in; small biases. */
export function randomGenome(rng: () => number, out: Float32Array, offset: number): void {
  let g = offset;
  for (let l = 1; l < L; l++) {
    const nIn = NET_LAYERS[l - 1];
    const nOut = NET_LAYERS[l];
    const s = 1.6 / Math.sqrt(nIn);
    for (let k = 0; k < nOut * nIn; k++) out[g++] = gaussian(rng) * s;
    for (let k = 0; k < nOut; k++) out[g++] = gaussian(rng) * 0.3;
  }
  if (g - offset !== GENOME_SIZE) throw new Error('genome layout mismatch');
}
