// Dev harness: drives createSimClient for headless smoke tests.
import { createSimClient } from '../client';
import { PRESETS } from '../presets';

const client = createSimClient({ track: PRESETS[0].track, population: 1000, seed: 1 });
const out = { frames: 0, gens: 0, lastGen: 0, alive: 0, bestLap: 0, detail: false, mode: 1 as unknown };
(window as unknown as { __sim: typeof out }).__sim = out;
client.onGeneration((s) => { out.gens++; out.lastGen = s.generation; out.bestLap = s.bestLapEver; });
client.inspect(0);
const params = new URLSearchParams(location.search);
if (params.get('max')) { client.setSpeed('max'); out.mode = 'max'; }
const loop = () => {
  client.tick();
  const l = client.latest;
  if (l) { out.frames++; out.alive = l.alive; out.detail = !!l.detail; }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
