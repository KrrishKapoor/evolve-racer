/// <reference lib="webworker" />
import { createSimulation } from './sim';
import { frameLength, type FrameMessage, type FromWorker, type ToWorker } from './protocol';
import type { SimSpeed, Simulation } from './types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const SLICE_MS = 12;

let sim: Simulation | null = null;
let epoch = 0;
let speed: SimSpeed = 1;
let running = false;
let warmup = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

function step(): void {
  const stats = sim!.step();
  if (stats) {
    if (warmup > 0) warmup--;
    post({ type: 'gen', epoch, stats });
  }
}

const shouldFreeRun = () => sim !== null && speed !== 0 && (warmup > 0 || speed === 'max');

function freeRun(): void {
  if (!shouldFreeRun()) { running = false; return; }
  const end = performance.now() + SLICE_MS;
  // One step between deadline checks: a busy population must not turn a
  // nominal 12ms slice into 16 expensive steps before messages can be handled.
  do { step(); } while (shouldFreeRun() && performance.now() < end);
  if (shouldFreeRun()) setTimeout(freeRun, 0);
  else running = false;
}

function frame(buf: Float32Array): void {
  if (!sim) return;
  if (warmup === 0 && (speed === 1 || speed === 4)) for (let i = 0; i < speed; i++) step();
  const s = sim.snapshot();
  const n = s.count;
  if (buf.length < frameLength(n)) buf = new Float32Array(frameLength(n));
  buf.set(s.x.subarray(0, n), 0);
  buf.set(s.y.subarray(0, n), n);
  buf.set(s.angle.subarray(0, n), 2 * n);
  buf.set(s.fade.subarray(0, n), 3 * n);
  const d = s.detail;
  if (d) {
    let o = 4 * n;
    buf.set(d.rays, o); o += d.rays.length;
    buf.set(d.activations, o); o += d.activations.length;
    buf.set(d.genome, o);
  }
  const msg: FrameMessage = {
    type: 'frame', epoch,
    generation: s.generation, time: s.time, count: n, alive: s.alive, leader: s.leader, bestLap: s.bestLap,
    detailIndex: d ? d.index : -1, detailAlive: d ? d.alive : false,
    detailX: d ? d.x : 0, detailY: d ? d.y : 0, detailAngle: d ? d.angle : 0, detailSpeed: d ? d.speed : 0,
    buf,
  };
  post(msg, [buf.buffer]);
}

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'reset':
      epoch = m.epoch;
      sim = createSimulation(m.track, { population: m.population, seed: m.seed });
      warmup = Number.isFinite(m.warmup) ? Math.max(0, Math.floor(m.warmup!)) : 0;
      break;
    case 'speed':
      speed = m.speed;
      break;
    case 'inspect':
      sim?.inspect(m.index);
      break;
    case 'frame':
      frame(m.buf);
      break;
  }
  if (shouldFreeRun() && !running) { running = true; setTimeout(freeRun, 0); }
};
