import { GENOME_SIZE, NEURON_COUNT, RAY_COUNT, type GenerationStats, type SimSpeed, type Track } from './types';

/** Frame buffer layout: x, y, angle, fade (count each), then detail rays, activations, genome. */
export const frameLength = (count: number) => count * 4 + RAY_COUNT + NEURON_COUNT + GENOME_SIZE;

export type ToWorker =
  | { type: 'reset'; epoch: number; track: Track; population: number; seed: number; warmup?: number }
  | { type: 'speed'; speed: SimSpeed }
  | { type: 'inspect'; index: number }
  | { type: 'frame'; buf: Float32Array };

export interface FrameMessage {
  type: 'frame';
  epoch: number;
  generation: number;
  time: number;
  count: number;
  alive: number;
  leader: number;
  bestLap: number;
  /** -1 when nothing is inspected. */
  detailIndex: number;
  detailAlive: boolean;
  detailX: number;
  detailY: number;
  detailAngle: number;
  detailSpeed: number;
  buf: Float32Array;
}

export type FromWorker = FrameMessage | { type: 'gen'; epoch: number; stats: GenerationStats };
