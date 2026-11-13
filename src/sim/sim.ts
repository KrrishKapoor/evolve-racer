import {
  CAR_WIDTH, DT, GENOME_SIZE, NET_LAYERS, NEURON_COUNT, RAY_COUNT,
  type CarDetail, type GenerationStats, type SimOptions, type Simulation, type Snapshot, type Track,
} from './types';
import { createRng } from './rng';
import { forward, randomGenome } from './nn';
import { crossover, mutate, tournament } from './ga';
import { createRaycaster } from './rays';

// Physics. Units: world units and seconds.
export const TOP_SPEED = 400;
export const ACCEL = 280;
export const BRAKE = 520;
export const DRAG = 0.15;
const MAX_YAW = 4; // rad/s at low speed
/** Lateral grip, units/s^2. Max yaw rate is GRIP / speed, so corners cap speed at sqrt(GRIP * radius). */
export const GRIP = 600;

const STALL_TIME = 2; // seconds without STALL_GAIN progress => dead
const STALL_GAIN = 20;
const BACKWARD = 30; // units behind best progress => dead
const FADE_TIME = 0.5;
const LINE_EVERY = 4; // steps between best-line samples

const ELITE_FRACTION = 0.02;
const TOURNAMENT_K = 4;
const MUTATION_RATE = 0.1;
const MUTATION_SIGMA = 0.3;

type Rng = () => number;

/** Per-car state in flat typed arrays. Shared by the population and the best-line replay. */
interface Cars {
  count: number;
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  speed: Float32Array;
  alive: Uint8Array;
  fade: Float32Array;
  seg: Int32Array; // nearest centreline segment
  lap: Int32Array; // wrap count of seg
  progress: Float32Array; // signed arc length from the start, unwrapped
  maxProgress: Float32Array;
  markProgress: Float32Array;
  markTime: Float32Array;
  lapTime: Float32Array; // 0 until finished
}

function createCars(count: number): Cars {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    angle: new Float32Array(count),
    speed: new Float32Array(count),
    alive: new Uint8Array(count),
    fade: new Float32Array(count),
    seg: new Int32Array(count),
    lap: new Int32Array(count),
    progress: new Float32Array(count),
    maxProgress: new Float32Array(count),
    markProgress: new Float32Array(count),
    markTime: new Float32Array(count),
    lapTime: new Float32Array(count),
  };
}

function spawn(c: Cars, track: Track): void {
  for (let i = 0; i < c.count; i++) {
    c.x[i] = track.startX;
    c.y[i] = track.startY;
    c.angle[i] = track.startAngle;
    c.speed[i] = 0;
    c.alive[i] = 1;
    c.fade[i] = 1;
    c.seg[i] = 0;
    c.lap[i] = 0;
    c.progress[i] = 0;
    c.maxProgress[i] = 0;
    c.markProgress[i] = 0;
    c.markTime[i] = 0;
    c.lapTime[i] = 0;
  }
}

/** Squared distance from (x, y) to centreline segment s, and the projection t (0..1) along it. */
function makeTrackHelpers(track: Track) {
  const { n, cx, cy } = track;
  const segLen = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    segLen[i] = Math.hypot(cx[j] - cx[i], cy[j] - cy[i]);
  }
  let projT = 0;
  const dist2 = (x: number, y: number, s: number): number => {
    const j = s + 1 === n ? 0 : s + 1;
    const ax = cx[s], ay = cy[s];
    const ex = cx[j] - ax, ey = cy[j] - ay;
    const l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    projT = t;
    const dx = ax + ex * t - x, dy = ay + ey * t - y;
    return dx * dx + dy * dy;
  };
  return { segLen, dist2, getT: () => projT };
}

export interface Driver {
  cars: Cars;
  /** Advance car i by one step using genome at gOff. time is the generation clock before the step. */
  stepCar(i: number, genome: Float32Array, gOff: number, time: number, rays: Float32Array, act: Float32Array): void;
}

function createDriver(track: Track, count: number): Driver {
  const cars = createCars(count);
  const cast = createRaycaster(track);
  const { dist2, getT } = makeTrackHelpers(track);
  const n = track.n;
  const L = track.length;
  const limit = track.halfWidth - CAR_WIDTH / 2;
  const limit2 = limit * limit;
  const inputs = new Float32Array(NET_LAYERS[0]);
  const outBase = NEURON_COUNT - 2;

  const stepCar: Driver['stepCar'] = (i, genome, gOff, time, rays, act) => {
    const c = cars;
    let x = c.x[i], y = c.y[i], a = c.angle[i], v = c.speed[i];
    cast(x, y, a, rays);
    for (let k = 0; k < RAY_COUNT; k++) inputs[k] = rays[k];
    inputs[RAY_COUNT] = v / TOP_SPEED;
    forward(genome, gOff, inputs, act);
    const steer = act[outBase], throttle = act[outBase + 1];

    if (throttle >= 0) v += throttle * ACCEL * DT;
    else v += throttle * BRAKE * DT;
    v -= v * DRAG * DT;
    if (v < 0) v = 0;
    if (v > TOP_SPEED) v = TOP_SPEED;
    // Grip limit: yaw rate can never exceed GRIP / speed.
    let yaw = steer * MAX_YAW;
    const maxYaw = v > 1 ? GRIP / v : MAX_YAW;
    if (yaw > maxYaw) yaw = maxYaw;
    else if (yaw < -maxYaw) yaw = -maxYaw;
    a += yaw * DT;
    x += Math.cos(a) * v * DT;
    y += Math.sin(a) * v * DT;
    c.x[i] = x; c.y[i] = y; c.angle[i] = a; c.speed[i] = v;

    // Walk the nearest centreline segment locally.
    let s = c.seg[i], lap = c.lap[i];
    let d = dist2(x, y, s);
    for (;;) {
      const nx = s + 1 === n ? 0 : s + 1;
      const dn = dist2(x, y, nx);
      if (dn < d) { d = dn; if (nx === 0) lap++; s = nx; continue; }
      const pv = s === 0 ? n - 1 : s - 1;
      const dp = dist2(x, y, pv);
      if (dp < d) { d = dp; if (s === 0) lap--; s = pv; continue; }
      break;
    }
    dist2(x, y, s);
    const t = getT();
    c.seg[i] = s; c.lap[i] = lap;
    const nextCum = track.cum[s + 1];
    const p = lap * L + track.cum[s] + (nextCum - track.cum[s]) * t;
    const now = time + DT;
    if (p > c.maxProgress[i]) {
      if (c.lapTime[i] === 0 && p >= L) {
        // Interpolate the crossing within this step.
        const prev = c.progress[i];
        const f = p > prev ? (L - prev) / (p - prev) : 1;
        c.lapTime[i] = time + DT * f;
      }
      c.maxProgress[i] = p;
    }
    c.progress[i] = p;
    if (p > c.markProgress[i] + STALL_GAIN) { c.markProgress[i] = p; c.markTime[i] = now; }
    if (d > limit2 || p < c.maxProgress[i] - BACKWARD || now - c.markTime[i] > STALL_TIME) c.alive[i] = 0;
  };
  return { cars, stepCar };
}

/** Record a car's path by replaying one genome alone. Deterministic, so it matches what happened. */
function recordLine(track: Track, genome: Float32Array, gOff: number, maxTime: number): Float32Array {
  const d = createDriver(track, 1);
  spawn(d.cars, track);
  const rays = new Float32Array(RAY_COUNT), act = new Float32Array(NEURON_COUNT);
  const pts: number[] = [];
  let time = 0, steps = 0;
  while (d.cars.alive[0] && time < maxTime) {
    if (steps % LINE_EVERY === 0) pts.push(d.cars.x[0], d.cars.y[0], d.cars.speed[0] / TOP_SPEED);
    d.stepCar(0, genome, gOff, time, rays, act);
    time += DT;
    steps++;
    if (d.cars.lapTime[0] > 0 && d.cars.progress[0] > track.length + 20) break;
  }
  pts.push(d.cars.x[0], d.cars.y[0], d.cars.speed[0] / TOP_SPEED);
  return new Float32Array(pts);
}

export function createSimulation(track: Track, opts: SimOptions): Simulation {
  const pop = Math.max(2, opts.population | 0);
  const rng: Rng = createRng(opts.seed);
  const driver = createDriver(track, pop);
  const cars = driver.cars;
  const L = track.length;
  // Reference lap time for the bonus: a lap at top speed is the unbeatable bound.
  const refLap = L / TOP_SPEED;
  const timeCap = Math.max(40, L / 40);

  let genomes = new Float32Array(pop * GENOME_SIZE);
  let next = new Float32Array(pop * GENOME_SIZE);
  for (let i = 0; i < pop; i++) randomGenome(rng, genomes, i * GENOME_SIZE);
  const fitness = new Float32Array(pop);
  const order = new Int32Array(pop);
  const rays = new Float32Array(RAY_COUNT);
  const act = new Float32Array(NEURON_COUNT);

  let generation = 1;
  let time = 0;
  let alive = pop;
  let firstLap = 0; // sim time when the first car of this generation finished
  let bestLapEver = 0;
  let bestLine: Float32Array = new Float32Array(0);
  let bestFitnessEver = -Infinity;

  let inspected = -1;
  const detailRays = new Float32Array(RAY_COUNT);
  const detailAct = new Float32Array(NEURON_COUNT);
  const detail: CarDetail = {
    index: -1, alive: false, x: 0, y: 0, angle: 0, speed: 0,
    rays: detailRays, activations: detailAct, genome: genomes.subarray(0, GENOME_SIZE),
  };
  const snap: Snapshot = {
    generation: 1, time: 0, count: pop, alive: pop,
    x: cars.x, y: cars.y, angle: cars.angle, fade: cars.fade,
    leader: -1, bestLap: 0, detail: null,
  };

  spawn(cars, track);

  function fitnessOf(i: number): number {
    const lt = cars.lapTime[i];
    if (lt > 0) return 1 + refLap / lt;
    const p = cars.maxProgress[i] / L;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function endGeneration(): GenerationStats {
    let sum = 0, bestLap = 0;
    for (let i = 0; i < pop; i++) {
      fitness[i] = fitnessOf(i);
      sum += fitness[i];
      order[i] = i;
      const lt = cars.lapTime[i];
      if (lt > 0 && (bestLap === 0 || lt < bestLap)) bestLap = lt;
    }
    order.sort((a, b) => fitness[b] - fitness[a] || a - b);
    const champ = order[0];
    const bestFitness = fitness[champ];
    if (bestLap > 0 && (bestLapEver === 0 || bestLap < bestLapEver)) bestLapEver = bestLap;
    if (bestFitness > bestFitnessEver || bestLine.length === 0) {
      bestFitnessEver = bestFitness;
      bestLine = recordLine(track, genomes, champ * GENOME_SIZE, cars.lapTime[champ] > 0 ? cars.lapTime[champ] + 1 : timeCap);
    }
    const stats: GenerationStats = {
      generation,
      bestFitness,
      meanFitness: sum / pop,
      bestProgress: Math.min(1, Math.max(0, cars.maxProgress[champ] / L)),
      bestLap,
      bestLapEver,
      bestLine,
    };

    // Breed. Elites (champion first) are copied unchanged.
    const elites = Math.max(1, Math.round(pop * ELITE_FRACTION));
    for (let e = 0; e < elites; e++) next.set(genomes.subarray(order[e] * GENOME_SIZE, (order[e] + 1) * GENOME_SIZE), e * GENOME_SIZE);
    for (let i = elites; i < pop; i++) {
      const a = tournament(fitness, pop, TOURNAMENT_K, rng);
      const off = i * GENOME_SIZE;
      if (rng() < 0.7) {
        const b = tournament(fitness, pop, TOURNAMENT_K, rng);
        crossover(genomes, a * GENOME_SIZE, genomes, b * GENOME_SIZE, next, off, rng);
      } else {
        next.set(genomes.subarray(a * GENOME_SIZE, (a + 1) * GENOME_SIZE), off);
      }
      mutate(next, off, rng, MUTATION_RATE, MUTATION_SIGMA);
    }
    const tmp = genomes; genomes = next; next = tmp;
    if (inspected >= 0) detail.genome = genomes.subarray(inspected * GENOME_SIZE, (inspected + 1) * GENOME_SIZE);

    generation++;
    time = 0;
    alive = pop;
    firstLap = 0;
    spawn(cars, track);
    return stats;
  }

  function step(): GenerationStats | null {
    let count = 0;
    for (let i = 0; i < pop; i++) {
      if (!cars.alive[i]) {
        if (cars.fade[i] > 0) cars.fade[i] = Math.max(0, cars.fade[i] - DT / FADE_TIME);
        continue;
      }
      const isDetail = i === inspected;
      driver.stepCar(i, genomes, i * GENOME_SIZE, time, isDetail ? detailRays : rays, isDetail ? detailAct : act);
      if (cars.alive[i]) count++;
      if (firstLap === 0 && cars.lapTime[i] > 0) firstLap = cars.lapTime[i];
    }
    time += DT;
    alive = count;
    if (count === 0 || time >= timeCap || (firstLap > 0 && time > firstLap * 1.15)) return endGeneration();
    return null;
  }

  function snapshot(): Snapshot {
    let leader = -1, best = -Infinity;
    for (let i = 0; i < pop; i++) {
      if (cars.alive[i] && cars.progress[i] > best) { best = cars.progress[i]; leader = i; }
    }
    snap.generation = generation;
    snap.time = time;
    snap.alive = alive;
    snap.leader = leader;
    snap.bestLap = bestLapEver;
    if (inspected >= 0) {
      detail.index = inspected;
      detail.alive = cars.alive[inspected] === 1;
      detail.x = cars.x[inspected];
      detail.y = cars.y[inspected];
      detail.angle = cars.angle[inspected];
      detail.speed = cars.speed[inspected] / TOP_SPEED;
      snap.detail = detail;
    } else snap.detail = null;
    return snap;
  }

  function inspect(index: number): void {
    inspected = index >= 0 && index < pop ? index | 0 : -1;
    if (inspected < 0) return;
    detail.genome = genomes.subarray(inspected * GENOME_SIZE, (inspected + 1) * GENOME_SIZE);
    // Fill rays and activations now so a paused sim still shows something real.
    const x = cars.x[inspected], y = cars.y[inspected], a = cars.angle[inspected];
    inspectCast(x, y, a, detailRays);
    const inputs = new Float32Array(NET_LAYERS[0]);
    inputs.set(detailRays);
    inputs[RAY_COUNT] = cars.speed[inspected] / TOP_SPEED;
    forward(genomes, inspected * GENOME_SIZE, inputs, detailAct);
  }
  const inspectCast = createRaycaster(track);

  function pick(x: number, y: number, radius: number): number {
    let best = -1, bestD = radius * radius, bestAlive = false;
    for (let i = 0; i < pop; i++) {
      const dx = cars.x[i] - x, dy = cars.y[i] - y;
      const d = dx * dx + dy * dy;
      if (d > radius * radius) continue;
      const al = cars.alive[i] === 1;
      if ((al && !bestAlive) || (al === bestAlive && d < bestD)) { best = i; bestD = d; bestAlive = al; }
    }
    return best;
  }

  return { track, population: pop, step, snapshot, inspect, pick };
}
