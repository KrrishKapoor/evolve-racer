import { expect, test } from 'vitest';
import { createDriver, createSimulation, GRIP, TOP_SPEED } from './sim';
import { PRESETS } from './presets';
import { CAR_WIDTH, DT, GENOME_SIZE, NEURON_COUNT, RAY_COUNT, type GenerationStats } from './types';

const track = PRESETS[0].track;

test('physics: speed bounded and yaw rate never exceeds grip / speed', () => {
  const d = createDriver(track, 1);
  const g = new Float32Array(GENOME_SIZE);
  g[GENOME_SIZE - 2] = 5; // steer hard right
  g[GENOME_SIZE - 1] = 5; // full throttle
  const c = d.cars;
  c.x[0] = track.startX; c.y[0] = track.startY; c.angle[0] = track.startAngle;
  c.speed[0] = TOP_SPEED; c.alive[0] = 1;
  const rays = new Float32Array(RAY_COUNT), act = new Float32Array(NEURON_COUNT);
  let time = 0;
  for (let s = 0; s < 120 && c.alive[0]; s++) {
    const a0 = c.angle[0];
    d.stepCar(0, g, 0, time, rays, act);
    time += DT;
    const v = c.speed[0];
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(TOP_SPEED);
    expect(Math.abs(c.angle[0] - a0) / DT).toBeLessThanOrEqual(GRIP / v + 1e-3);
  }
  expect(c.alive[0]).toBe(0); // understeered into the wall
});

test('alive cars stay inside the track; crashed cars fade', () => {
  const sim = createSimulation(track, { population: 200, seed: 3 });
  const limit = track.halfWidth - CAR_WIDTH / 2;
  for (let s = 0; s < 600; s++) {
    sim.step();
    const snap = sim.snapshot();
    expect(snap.alive).toBeLessThanOrEqual(snap.count);
    if (s % 20 !== 0) continue;
    for (let i = 0; i < snap.count; i++) {
      expect(Number.isFinite(snap.x[i])).toBe(true);
      expect(snap.fade[i]).toBeGreaterThanOrEqual(0);
      expect(snap.fade[i]).toBeLessThanOrEqual(1);
      if (snap.fade[i] < 1) continue;
      let best = Infinity;
      for (let j = 0; j < track.n; j++) {
        const k = (j + 1) % track.n;
        const ex = track.cx[k] - track.cx[j], ey = track.cy[k] - track.cy[j];
        const u = Math.max(0, Math.min(1, ((snap.x[i] - track.cx[j]) * ex + (snap.y[i] - track.cy[j]) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(track.cx[j] + ex * u - snap.x[i], track.cy[j] + ey * u - snap.y[i]));
      }
      expect(best).toBeLessThanOrEqual(limit + 1);
    }
  }
});

function run(seed: number, gens: number, population = 150): GenerationStats[] {
  const sim = createSimulation(track, { population, seed });
  const out: GenerationStats[] = [];
  while (out.length < gens) { const s = sim.step(); if (s) out.push(s); }
  return out;
}

test('determinism: same seed gives identical stats', () => {
  const a = run(11, 3), b = run(11, 3), c = run(12, 3);
  const key = (s: GenerationStats[]) => s.map((x) => [x.bestFitness, x.meanFitness, x.bestLap, x.bestLine.length].join(',')).join('|');
  expect(key(a)).toBe(key(b));
  expect(key(a)).not.toBe(key(c));
});

test('inspect and pick', () => {
  const sim = createSimulation(track, { population: 50, seed: 1 });
  for (let s = 0; s < 30; s++) sim.step();
  const snap = sim.snapshot();
  expect(snap.detail).toBeNull();
  const i = sim.pick(snap.x[7], snap.y[7], 5);
  expect(i).toBeGreaterThanOrEqual(0);
  expect(sim.pick(-1e5, -1e5, 10)).toBe(-1);
  sim.inspect(i);
  sim.step();
  const d = sim.snapshot().detail!;
  expect(d.index).toBe(i);
  expect(d.genome.length).toBe(GENOME_SIZE);
  expect(d.activations.length).toBe(NEURON_COUNT);
  sim.inspect(-1);
  expect(sim.snapshot().detail).toBeNull();
});

test('a crashed inspected car reports zero speed and stays in place while fading', () => {
  const sim = createSimulation(track, { population: 200, seed: 3 });
  for (let s = 0; s < 30; s++) sim.step();
  const moving: number[] = [];
  for (let i = 0; i < sim.population; i++) {
    sim.inspect(i);
    if (sim.snapshot().detail!.speed > 0.05) moving.push(i);
  }
  expect(moving.length).toBeGreaterThan(0);
  for (let s = 0; s < 90; s++) {
    expect(sim.step()).toBeNull();
    const snap = sim.snapshot();
    const crashed = moving.find((i) => snap.fade[i] > 0 && snap.fade[i] < 1);
    if (crashed === undefined) continue;
    sim.inspect(crashed);
    const { x, y, speed, alive } = sim.snapshot().detail!;
    expect(alive).toBe(false);
    expect(speed).toBe(0);
    const fade = snap.fade[crashed];
    for (let i = 0; i < 4; i++) expect(sim.step()).toBeNull();
    expect(sim.snapshot().detail).toMatchObject({ x, y, speed: 0, alive: false });
    expect(sim.snapshot().fade[crashed]).toBeLessThan(fade);
    return;
  }
  throw new Error('expected a moving car to crash');
});

test.each([1, 7, 42])('early generations cull crawlers without waiting twenty seconds (seed %s)', (seed) => {
  const sim = createSimulation(track, { population: 1000, seed });
  let steps = 0, generation = 0;
  while (generation < 3) {
    steps++;
    const s = sim.step();
    expect(steps * DT).toBeLessThan(10);
    if (s) { generation++; steps = 0; }
  }
});

test('evolution finishes a lap and keeps improving (Meridian, 1000 cars)', () => {
  const stats = run(1, 20, 1000);
  const firstLap = stats.findIndex((s) => s.bestLap > 0);
  expect(firstLap).toBeGreaterThanOrEqual(0);
  expect(firstLap).toBeLessThan(15);
  for (let g = 1; g < stats.length; g++) expect(stats[g].bestFitness).toBeGreaterThanOrEqual(stats[g - 1].bestFitness - 1e-6);
  expect(stats[19].bestLapEver).toBeLessThan(stats[firstLap].bestLap);
  expect(stats[19].bestLine.length % 3).toBe(0);
}, 60000);

test('evolved line beats the best possible centreline lap (Oval, 600 cars)', async () => {
  const { centrelineLapTime } = await import('./line');
  const oval = PRESETS.find((p) => p.id === 'oval')!.track;
  const sim = createSimulation(oval, { population: 600, seed: 1 });
  let last: GenerationStats | null = null;
  while (!last || last.generation < 20) last = sim.step() ?? last;
  expect(last.bestLapEver).toBeGreaterThan(0);
  expect(last.bestLapEver).toBeLessThan(centrelineLapTime(oval));
}, 120000);
