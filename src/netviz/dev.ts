// Standalone driver: a random genome, smoothly sweeping inputs, the real forward pass.
import '../styles/tokens.css';
import { GENOME_SIZE, NEURON_COUNT, RAY_COUNT, RAY_ANGLES, type CarDetail } from '../sim/types';
import { forward, randomGenome } from '../sim/nn';
import { createRng } from '../sim/rng';
import { createInspector, createNetView } from './index';

const params = new URLSearchParams(location.search);
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const panel = document.getElementById('panel')!;
if (params.get('w')) panel.style.width = params.get('w') + 'px';
if (params.get('h')) panel.style.height = params.get('h') + 'px';

let seed = Number(params.get('seed') ?? 7);
const rng = createRng(seed);
const genome = new Float32Array(GENOME_SIZE);
randomGenome(rng, genome, 0);
const inputs = new Float32Array(RAY_COUNT + 1);
const activations = new Float32Array(NEURON_COUNT);
const rays = new Float32Array(RAY_COUNT);

const detail: CarDetail = {
  index: 42,
  alive: true,
  x: 0,
  y: 0,
  angle: 0,
  speed: 0,
  rays,
  activations,
  genome,
};

const inspector = createInspector(panel);
const solo = createNetView(document.getElementById('solo') as HTMLCanvasElement);
let shown = true;

function frame(now: number) {
  const t = params.has('t') ? Number(params.get('t')) : now / 1000;
  // A car weaving through a corridor that bends left and right.
  const bend = Math.sin(t * 0.7) * 0.9;
  for (let i = 0; i < RAY_COUNT; i++) {
    const a = RAY_ANGLES[i];
    const wall = 1 / (0.25 + Math.abs(Math.sin(a - bend * 0.6)) * 2.2);
    rays[i] = Math.max(0.05, Math.min(1, wall * (0.75 + 0.25 * Math.sin(t * 1.3 + i))));
    inputs[i] = rays[i];
  }
  detail.speed = 0.55 + 0.4 * Math.sin(t * 0.45);
  inputs[RAY_COUNT] = detail.speed;
  forward(genome, 0, inputs, activations);
  if (shown) inspector.update(detail);
  solo.update(genome, activations);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.getElementById('theme')!.onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'light' : 'dark';
  window.dispatchEvent(new Event('themechange'));
};
document.getElementById('toggle')!.onclick = () => {
  shown = !shown;
  if (!shown) inspector.hide();
};
document.getElementById('crash')!.onclick = () => (detail.alive = !detail.alive);
document.getElementById('mutate')!.onclick = () => {
  randomGenome(createRng(++seed), genome, 0);
  detail.index = (seed * 37) % 1000;
};
