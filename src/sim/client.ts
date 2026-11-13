import { GENOME_SIZE, NEURON_COUNT, RAY_COUNT, type GenerationStats, type SimClient, type SimSpeed, type Snapshot, type Track } from './types';
import { frameLength, type FromWorker, type ToWorker } from './protocol';

/** Worker-backed simulation. Frame buffers ping-pong between threads, so steady state allocates nothing big. */
export function createSimClient(opts: { track: Track; population: number; seed: number }): SimClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const listeners = new Set<(s: GenerationStats) => void>();
  let track = opts.track;
  let population = opts.population;
  let epoch = 0;
  let latest: Snapshot | null = null;
  let spare: Float32Array | null = null; // buffer not referenced by `latest`
  let inFlight = false;
  let destroyed = false;

  const send = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  const reset = () => {
    epoch++;
    latest = null;
    send({ type: 'reset', epoch, track, population, seed: opts.seed });
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'gen') {
      if (m.epoch === epoch) for (const cb of listeners) cb(m.stats);
      return;
    }
    inFlight = false;
    if (m.epoch !== epoch) { spare = m.buf; return; }
    const n = m.count, b = m.buf;
    const prev = latest;
    let detail: Snapshot['detail'] = null;
    if (m.detailIndex >= 0) {
      const o = 4 * n;
      detail = {
        index: m.detailIndex, alive: m.detailAlive, x: m.detailX, y: m.detailY, angle: m.detailAngle, speed: m.detailSpeed,
        rays: b.subarray(o, o + RAY_COUNT),
        activations: b.subarray(o + RAY_COUNT, o + RAY_COUNT + NEURON_COUNT),
        genome: b.subarray(o + RAY_COUNT + NEURON_COUNT, o + RAY_COUNT + NEURON_COUNT + GENOME_SIZE),
      };
    }
    latest = {
      generation: m.generation, time: m.time, count: n, alive: m.alive,
      x: b.subarray(0, n), y: b.subarray(n, 2 * n), angle: b.subarray(2 * n, 3 * n), fade: b.subarray(3 * n, 4 * n),
      leader: m.leader, bestLap: m.bestLap, detail,
    };
    // The previous frame's buffer is free once `latest` moves on.
    if (prev) spare = prev.x.buffer instanceof ArrayBuffer ? new Float32Array(prev.x.buffer) : null;
  };

  reset();

  return {
    get latest() { return latest; },
    setTrack(t) { track = t; reset(); },
    setPopulation(p) { population = p; reset(); },
    setSpeed(s: SimSpeed) { send({ type: 'speed', speed: s }); },
    inspect(index) { send({ type: 'inspect', index }); },
    tick() {
      if (inFlight || destroyed) return;
      let buf = spare;
      spare = null;
      if (!buf || buf.length < frameLength(population)) buf = new Float32Array(frameLength(population));
      inFlight = true;
      send({ type: 'frame', buf }, [buf.buffer]);
    },
    onGeneration(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    destroy() { destroyed = true; worker.terminate(); listeners.clear(); },
  };
}
