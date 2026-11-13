// BENCH=1 SEEDS=1,7,42 GENS=30 npx vitest run src/sim/dev/bench.test.ts --disableConsoleIntercept
import { test } from 'vitest';
import { PRESETS } from '../presets';
import { createSimulation } from '../sim';
import { DT } from '../types';
import { centrelineLapTime } from '../line';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

test.skipIf(!env.BENCH)('deterministic evolution and step cost', () => {
  const gens = Number(env.GENS ?? 30), population = Number(env.POP ?? 1000);
  const seeds = (env.SEEDS ?? env.SEED ?? '1,7,42').split(',').map(Number);
  for (const seed of seeds) for (const p of PRESETS) {
    if (env.TRACK && p.id !== env.TRACK) continue;
    // Prime JIT compilation, outside the measured run and with a separate RNG.
    const prime = createSimulation(p.track, { population, seed });
    for (let i = 0; i < 90; i++) prime.step();
    const start = performance.now();
    const sim = createSimulation(p.track, { population, seed });
    const initMs = performance.now() - start;
    let steps = 0, stepMs = 0, fullSteps = 0, fullMs = 0, firstLapGen = 0, firstLap = 0;
    let genSteps = 0, fewSteps = 0, maxFew = 0, finalLap = 0;
    const durations: number[] = [], progress: string[] = [];
    const warmupMs: Record<number, number> = {};
    for (let g = 0; g < gens;) {
      const alive = sim.snapshot().alive;
      const a = performance.now();
      const s = sim.step();
      const ms = performance.now() - a;
      stepMs += ms; steps++; genSteps++;
      if (alive === population) { fullSteps++; fullMs += ms; }
      if (alive < Math.max(3, population * 0.01)) fewSteps++;
      if (s) {
        g++;
        maxFew = Math.max(maxFew, fewSteps);
        if (g <= 8) durations.push(Number((genSteps * DT).toFixed(2)));
        genSteps = 0; fewSteps = 0;
        if ([3, 5, 8, 10, 12, 15].includes(g)) warmupMs[g] = Math.round(performance.now() - start);
        if (s.bestLap > 0 && !firstLapGen) { firstLapGen = g; firstLap = s.bestLap; }
        finalLap = s.bestLapEver;
        if (g % 3 === 0 || g === 1) progress.push(`${g}:${s.bestLap > 0 ? s.bestLap.toFixed(2) + 's' : (s.bestProgress * 100).toFixed(0) + '%'}`);
      }
    }
    console.log(JSON.stringify({ track: p.id, seed, population, gens, length: Math.round(p.track.length),
      centrelineBound: +centrelineLapTime(p.track).toFixed(3), firstLapGen, firstLap: +firstLap.toFixed(3), finalLap: +finalLap.toFixed(3),
      msStepFull: +(fullMs / fullSteps).toFixed(3), fullSamples: fullSteps, msStepAverage: +(stepMs / steps).toFixed(3),
      initMs: +initMs.toFixed(1), warmupMs, firstEightSeconds: durations, maxFewSeconds: +(maxFew * DT).toFixed(2) }));
    console.log('  ' + progress.join(' '));
  }
}, 900000);
