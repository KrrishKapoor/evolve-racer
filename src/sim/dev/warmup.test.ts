// Benchmark the real worker loop without a DOM, using the browser's nested-timer
// clamp (4ms). BENCH=1 npx vitest run src/sim/dev/warmup.test.ts --disableConsoleIntercept
import { expect, test, vi } from 'vitest';
import { PRESETS } from '../presets';
import type { FromWorker, ToWorker } from '../protocol';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

test.skipIf(!env.BENCH)('warmup wall time with responsive browser-sized slices', async () => {
  const track = PRESETS[0].track, population = Number(env.POP ?? 1000), warmup = Number(env.WARMUP ?? 10);
  const seeds = (env.SEEDS ?? '1,7,42').split(',').map(Number);
  const nativeTimer = globalThis.setTimeout;
  let maxSliceMs = 0, slices = 0;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay?: number) => nativeTimer(() => {
    const t = performance.now();
    callback();
    maxSliceMs = Math.max(maxSliceMs, performance.now() - t);
    slices++;
  }, Math.max(delay ?? 0, 4))) as typeof setTimeout);
  try {
    for (const seed of seeds) {
      vi.resetModules();
      let complete: () => void;
      const done = new Promise<void>((resolve) => { complete = resolve; });
      const stats: number[] = [];
      let bestLap = 0;
      const scope = { onmessage: null as ((e: { data: ToWorker }) => void) | null,
        postMessage(m: FromWorker) {
          if (m.type === 'gen') {
            stats.push(m.stats.generation);
            bestLap = m.stats.bestLapEver;
            if (stats.length === warmup) complete();
          }
        } };
      vi.stubGlobal('self', scope);
      await import('../worker');
      maxSliceMs = 0; slices = 0;
      const t = performance.now();
      scope.onmessage!({ data: { type: 'reset', epoch: 1, track, population, seed, warmup } });
      await done;
      expect(stats).toEqual(Array.from({ length: warmup }, (_, i) => i + 1));
      console.log(JSON.stringify({ track: 'meridian', seed, population, warmup, loadMs: +(performance.now() - t).toFixed(1), slices,
        maxSliceMs: +maxSliceMs.toFixed(1), bestLap: +bestLap.toFixed(3) }));
      scope.onmessage!({ data: { type: 'speed', speed: 0 } });
    }
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
}, 120000);
