// Shared contract between the sim core, the worker client and every UI module.
// Additive changes only: other modules are built against these exact names.

/** Fixed simulation timestep, seconds. */
export const DT = 1 / 60;

/** Sensor rays per car, fanned symmetrically around the heading. */
export const RAY_COUNT = 7;
/** Ray angles relative to heading, radians, left (negative) to right. */
export const RAY_ANGLES: readonly number[] = [-1.4, -0.85, -0.35, 0, 0.35, 0.85, 1.4];
/** Ray range in world units. Ray readings are normalised to 0..1 (1 = nothing within range). */
export const RAY_RANGE = 220;

/** Network shape: inputs are RAY_COUNT ray readings then speed (0..1). Outputs: steer (-1..1), throttle (-1..1). */
export const NET_LAYERS: readonly number[] = [RAY_COUNT + 1, 8, 6, 2];
/**
 * Genome layout, per layer transition in order: weights row-major [out][in], then biases [out].
 * Hidden and output activations are tanh.
 */
export const GENOME_SIZE = 140; // (8*8+8) + (8*6+6) + (6*2+2)
/** Total neurons across all layers; length of every activations buffer (inputs, h1, h2, outputs concatenated). */
export const NEURON_COUNT = 24;

/** World units: tracks are normalised so the longer side of the centreline bounding box is TRACK_EXTENT. */
export const TRACK_EXTENT = 1000;
export const TRACK_HALF_WIDTH = 26;
export const CAR_LENGTH = 12;
export const CAR_WIDTH = 6;

/** A closed circuit. Plain data (structured-cloneable) so it can be posted to the worker. */
export interface Track {
  /** Number of centreline samples. Sample i connects to (i + 1) % n. Sample 0 is the start/finish line. */
  readonly n: number;
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  /** Left and right wall vertices, one per centreline sample (closed loops). */
  readonly lx: Float32Array;
  readonly ly: Float32Array;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  /** Arc length from the start to sample i. n + 1 entries; cum[n] === length. */
  readonly cum: Float32Array;
  readonly length: number;
  readonly halfWidth: number;
  /** Bounds including walls. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Spawn pose: on the start line, heading along the direction of travel. */
  readonly startX: number;
  readonly startY: number;
  readonly startAngle: number;
}

/** Live view of one inspected car. */
export interface CarDetail {
  index: number;
  alive: boolean;
  x: number;
  y: number;
  angle: number;
  /** 0..1 of top speed. */
  speed: number;
  /** RAY_COUNT readings, 0..1. World-space hit distance is reading * RAY_RANGE along angle + RAY_ANGLES[i]. */
  rays: Float32Array;
  /** NEURON_COUNT values: inputs, hidden 1, hidden 2, outputs. */
  activations: Float32Array;
  /** GENOME_SIZE values, layout documented on GENOME_SIZE. */
  genome: Float32Array;
}

/** One rendered frame of sim state. Arrays have at least `count` entries. */
export interface Snapshot {
  generation: number;
  /** Sim seconds elapsed in the current generation. */
  time: number;
  count: number;
  alive: number;
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  /** 1 while driving, decays to 0 over about half a second after a crash. */
  fade: Float32Array;
  /** Index of the car currently furthest along, or -1. */
  leader: number;
  /** Best lap ever on this track, seconds. 0 until a car completes a lap. */
  bestLap: number;
  detail: CarDetail | null;
}

/** Emitted once per finished generation. */
export interface GenerationStats {
  /** The generation that just finished (first is 1). */
  generation: number;
  /** Best fitness this generation, in laps (1.0 = one full lap; lap-time bonus pushes it above 1). */
  bestFitness: number;
  meanFitness: number;
  /** Fraction of the lap covered by this generation's best car, 0..1. */
  bestProgress: number;
  /** Best lap this generation, seconds; 0 if nobody finished. */
  bestLap: number;
  /** Best lap so far on this track, seconds; 0 if none. */
  bestLapEver: number;
  /** Path of the best car so far: x, y, speed (0..1) triples in world units. */
  bestLine: Float32Array;
}

export interface SimOptions {
  population: number;
  seed: number;
}

/** Synchronous, deterministic simulation. No DOM. Same track + options => same history. */
export interface Simulation {
  readonly track: Track;
  readonly population: number;
  /** Advance by DT. Returns stats when this step ended a generation (the next one is already spawned). */
  step(): GenerationStats | null;
  /** Views into live buffers, no allocation. Copy before posting across threads. */
  snapshot(): Snapshot;
  /** Select the car reported in snapshot().detail. -1 clears. */
  inspect(index: number): void;
  /** Nearest car within `radius` world units of the point (alive cars preferred), or -1. */
  pick(x: number, y: number, radius: number): number;
}

/** 0 = paused, 1 and 4 = steps per rendered frame, 'max' = run as fast as possible without waiting for frames. */
export type SimSpeed = 0 | 1 | 4 | 'max';

/** Worker-backed sim used by the hero. Rendering stays at 60fps no matter how hard the sim is working. */
export interface SimClient {
  /** Latest snapshot received, or null before the first one. Valid until the next tick() resolves. */
  readonly latest: Snapshot | null;
  /** Replace the circuit and restart evolution from generation 0. */
  setTrack(track: Track): void;
  /** Restart evolution on the current track with a new population size. */
  setPopulation(population: number): void;
  setSpeed(speed: SimSpeed): void;
  inspect(index: number): void;
  /** Call once per animation frame: advances the sim per the current speed and refreshes `latest`. */
  tick(): void;
  /** Subscribe to finished generations. Returns an unsubscribe function. */
  onGeneration(cb: (stats: GenerationStats) => void): () => void;
  destroy(): void;
}
