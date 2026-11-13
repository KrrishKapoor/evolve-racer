import { afterEach, expect, test, vi } from 'vitest';
import { createSimClient } from './client';
import { PRESETS } from './presets';
import type { FromWorker, ToWorker } from './protocol';
import type { GenerationStats } from './types';

function client(warmup?: number) {
  const sent: ToWorker[] = [];
  let receive: (m: FromWorker) => void;
  const terminate = vi.fn();
  vi.stubGlobal('Worker', class {
    onmessage: ((e: { data: FromWorker }) => void) | null = null;
    constructor() { receive = (data) => this.onmessage!({ data }); }
    postMessage(m: ToWorker) { sent.push(m); }
    terminate = terminate;
  });
  const sim = createSimClient({ track: PRESETS[0].track, population: 1000, seed: 7, warmup });
  return { sim, sent, receive: receive!, terminate };
}

afterEach(() => vi.unstubAllGlobals());

test('warmup is forwarded only on initial construction, never track/population reset', () => {
  const { sim, sent } = client(8);
  expect(sent[0]).toMatchObject({ type: 'reset', epoch: 1, warmup: 8 });
  sim.setTrack(PRESETS[1].track);
  expect(sent[1]).toMatchObject({ type: 'reset', epoch: 2, warmup: 0 });
  sim.setPopulation(500);
  expect(sent[2]).toMatchObject({ type: 'reset', epoch: 3, population: 500, warmup: 0 });
  sim.destroy();
});

test('warmup defaults to zero', () => {
  const { sim, sent } = client();
  expect(sent[0]).toMatchObject({ warmup: 0 });
  sim.destroy();
});

test('HUD receives warmup stats, while stale stats after reset are discarded', () => {
  const { sim, receive, terminate, sent } = client(8);
  const listener = vi.fn();
  const unsubscribe = sim.onGeneration(listener);
  const stats: GenerationStats = { generation: 1, bestFitness: 0.2, meanFitness: 0.1, bestProgress: 0.2, bestLap: 0, bestLapEver: 0, bestLine: new Float32Array() };
  receive({ type: 'gen', epoch: 1, stats });
  expect(listener).toHaveBeenCalledWith(stats);
  sim.setTrack(PRESETS[1].track);
  receive({ type: 'gen', epoch: 1, stats });
  expect(listener).toHaveBeenCalledTimes(1);
  receive({ type: 'gen', epoch: 2, stats });
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  receive({ type: 'gen', epoch: 2, stats });
  expect(listener).toHaveBeenCalledTimes(2);
  sim.destroy();
  expect(terminate).toHaveBeenCalledOnce();
  const messages = sent.length;
  sim.tick();
  expect(sent).toHaveLength(messages);
});
