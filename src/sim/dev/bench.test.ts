// Headless evolution + performance bench. Run with: BENCH=1 npx vitest run src/sim/dev/bench.test.ts
import { test } from 'vitest';
import { PRESETS } from '../presets';
import { createSimulation } from '../sim';
import { centrelineLapTime as centrelineLap } from '../line';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

test.skipIf(!env.BENCH)('bench', () => {
  const gens = Number(env.GENS ?? 30);
  for (const p of PRESETS) {
    const sim = createSimulation(p.track, { population: Number(env.POP ?? 1000), seed: Number(env.SEED ?? 1) });
    // Cost with all 1000 cars alive: the first 60 steps of generation 1.
    let a = performance.now();
    for (let i = 0; i < 60; i++) sim.step();
    const fullMs = (performance.now() - a) / 60;
    let steps = 60, stepTime = fullMs * 60, firstLapGen = 0;
    const log: string[] = [];
    for (let g = 0; g < gens;) {
      a = performance.now();
      const s = sim.step();
      stepTime += performance.now() - a; steps++;
      if (s) {
        g++;
        if (s.bestLap > 0 && !firstLapGen) firstLapGen = s.generation;
        if (s.generation % 3 === 0 || s.generation === 1) log.push(`${s.generation}:${s.bestLap > 0 ? s.bestLap.toFixed(2) + 's' : (s.bestProgress * 100).toFixed(0) + '%'}`);
      }
    }
    console.log(`${p.id}: L=${p.track.length.toFixed(0)} centrelineBound=${centrelineLap(p.track).toFixed(2)}s firstLapGen=${firstLapGen} ms/step(1000 alive)=${fullMs.toFixed(3)} ms/step(avg)=${(stepTime / steps).toFixed(3)}`);
    console.log('  ' + log.join(' '));
  }
}, 900000);
