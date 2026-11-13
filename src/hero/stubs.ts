// TEMPORARY stand-ins for modules other builders are writing. Delete once they land.
import type { CarDetail, GenerationStats, SimClient, SimSpeed, Snapshot, Track } from '../sim/types';
import { NEURON_COUNT, GENOME_SIZE, RAY_COUNT, TRACK_EXTENT, TRACK_HALF_WIDTH } from '../sim/types';

export function buildTrack(points: ArrayLike<number>): Track | null {
  const m = points.length >> 1;
  if (m < 20) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < m; i++) {
    minX = Math.min(minX, points[2 * i]); maxX = Math.max(maxX, points[2 * i]);
    minY = Math.min(minY, points[2 * i + 1]); maxY = Math.max(maxY, points[2 * i + 1]);
  }
  const s = TRACK_EXTENT / Math.max(maxX - minX, maxY - minY, 1e-6);
  const n = Math.min(m, 300);
  const cx = new Float32Array(n), cy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = Math.floor((i * m) / n);
    cx[i] = (points[2 * j] - minX) * s; cy[i] = (points[2 * j + 1] - minY) * s;
  }
  const hw = TRACK_HALF_WIDTH;
  const lx = new Float32Array(n), ly = new Float32Array(n), rx = new Float32Array(n), ry = new Float32Array(n);
  const cum = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    let tx = cx[b] - cx[a], ty = cy[b] - cy[a];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    lx[i] = cx[i] + ty * hw; ly[i] = cy[i] - tx * hw;
    rx[i] = cx[i] - ty * hw; ry[i] = cy[i] + tx * hw;
    cum[i + 1] = cum[i] + Math.hypot(cx[b] - cx[i], cy[b] - cy[i]);
  }
  return {
    n, cx, cy, lx, ly, rx, ry, cum, length: cum[n], halfWidth: hw,
    minX: -hw, minY: -hw, maxX: (maxX - minX) * s + hw, maxY: (maxY - minY) * s + hw,
    startX: cx[0], startY: cy[0], startAngle: Math.atan2(cy[1] - cy[0], cx[1] - cx[0]),
  };
}

function ellipse(a: number, b: number, k = 0): Float32Array {
  const p = new Float32Array(400);
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * Math.PI * 2;
    const r = 1 + k * Math.sin(3 * t);
    p[2 * i] = Math.cos(t) * a * r; p[2 * i + 1] = Math.sin(t) * b * r;
  }
  return p;
}

export const PRESETS = [
  { id: 'gp', name: 'Grand Prix', track: buildTrack(ellipse(500, 300, 0.15))! },
  { id: 'oval', name: 'Oval', track: buildTrack(ellipse(500, 250))! },
  { id: 'tech', name: 'Technical', track: buildTrack(ellipse(400, 400, 0.25))! },
  { id: 'sweep', name: 'Sweeper', track: buildTrack(ellipse(500, 350, 0.08))! },
];

export function createSimClient(opts: { track: Track; population: number; seed: number }): SimClient {
  let track = opts.track, pop = opts.population, speed: SimSpeed = 1, inspected = -1;
  const cap = 1000;
  const x = new Float32Array(cap), y = new Float32Array(cap), angle = new Float32Array(cap), fade = new Float32Array(cap);
  const s = new Float32Array(cap), v = new Float32Array(cap), off = new Float32Array(cap);
  const subs: ((g: GenerationStats) => void)[] = [];
  let gen = 0, time = 0, bestLap = 0;
  const detail: CarDetail = {
    index: 0, alive: true, x: 0, y: 0, angle: 0, speed: 0,
    rays: new Float32Array(RAY_COUNT), activations: new Float32Array(NEURON_COUNT), genome: new Float32Array(GENOME_SIZE),
  };
  const snap: Snapshot = { generation: 0, time: 0, count: pop, alive: pop, x, y, angle, fade, leader: 0, bestLap: 0, detail: null };
  function spawn() {
    for (let i = 0; i < pop; i++) { s[i] = 0; v[i] = 1 + ((i * 7919) % 100) / 60; off[i] = (((i * 104729) % 100) / 100 - 0.5) * 30; fade[i] = 1; }
    time = 0;
  }
  spawn();
  function step() {
    time += 1 / 60;
    let alive = 0, lead = -1, best = -1;
    for (let i = 0; i < pop; i++) {
      if (fade[i] < 1) { fade[i] = Math.max(0, fade[i] - 0.04); continue; }
      s[i] += v[i] * (1 + gen * 0.3);
      if (s[i] > 200 + ((i * 31) % 700) * (1 + gen)) fade[i] = 0.99;
      alive++;
      if (s[i] > best) { best = s[i]; lead = i; }
      const d = s[i] % track.length;
      let k = 0; while (k < track.n - 1 && track.cum[k + 1] < d) k++;
      const k2 = (k + 1) % track.n;
      const ang = Math.atan2(track.cy[k2] - track.cy[k], track.cx[k2] - track.cx[k]);
      x[i] = track.cx[k] - Math.sin(ang) * off[i]; y[i] = track.cy[k] + Math.cos(ang) * off[i]; angle[i] = ang;
    }
    snap.alive = alive; snap.leader = lead; snap.time = time; snap.count = pop;
    if (alive === 0 || time > 20) {
      gen++;
      const line = new Float32Array(track.n * 3);
      for (let i = 0; i < track.n; i++) { line[3 * i] = track.cx[i]; line[3 * i + 1] = track.cy[i]; line[3 * i + 2] = 0.5 + 0.5 * Math.sin(i / 10); }
      const prog = Math.min(1, best / track.length);
      if (prog >= 1) bestLap = bestLap ? Math.min(bestLap, 40 - gen) : 40 - gen;
      for (const cb of subs) cb({ generation: gen, bestFitness: prog >= 1 ? 1 + 20 / bestLap : prog, meanFitness: prog / 3, bestProgress: prog, bestLap: prog >= 1 ? bestLap : 0, bestLapEver: bestLap, bestLine: line });
      snap.generation = gen; snap.bestLap = bestLap;
      spawn();
    }
    if (inspected >= 0) {
      const i = inspected;
      Object.assign(detail, { index: i, alive: fade[i] >= 1, x: x[i], y: y[i], angle: angle[i], speed: 0.6 });
      for (let r = 0; r < RAY_COUNT; r++) detail.rays[r] = 0.2 + 0.1 * r;
      snap.detail = detail;
    } else snap.detail = null;
  }
  return {
    get latest() { return snap; },
    setTrack(t) { track = t; gen = 0; bestLap = 0; snap.generation = 0; snap.bestLap = 0; spawn(); },
    setPopulation(p) { pop = p; gen = 0; spawn(); },
    setSpeed(sp) { speed = sp; },
    inspect(i) { inspected = i; },
    tick() { const n = speed === 'max' ? 40 : speed; for (let i = 0; i < n; i++) step(); },
    onGeneration(cb) { subs.push(cb); return () => subs.splice(subs.indexOf(cb), 1); },
    destroy() {},
  };
}

export function createInspector(container: HTMLElement) {
  return {
    update(d: CarDetail) { container.textContent = `Car ${d.index}`; },
    hide() { container.textContent = ''; },
    destroy() {},
  };
}

export function mountSections(_root: HTMLElement): void {}
