// What the network does: the champion of a small live population drives; the reader can hold any input to a value.
import { NEURON_COUNT, NET_LAYERS, RAY_ANGLES, RAY_COUNT, RAY_RANGE } from '../sim/types';
import { PRESETS } from '../sim/presets';
import { createSimulation } from '../sim/sim';
import { forward } from '../sim/nn';
import { createNetView } from '../netviz';
import { createSurface, getTokens, runWhileVisible, el, drawTrack, fitView, type View } from './canvas';
import { createBars } from './bars';

const N_IN = NET_LAYERS[0];
const OUT = NEURON_COUNT - 2;

export function mountNetwork(fig: HTMLElement): void {
  const track = (PRESETS.find((p) => p.id === 'oval') ?? PRESETS[0]).track;
  const sim = createSimulation(track, { population: 80, seed: 11 });
  sim.inspect(0);

  const row = el('div', 'xs-split');
  const carCanvas = el('canvas', 'xs-canvas xs-canvas--car');
  carCanvas.setAttribute('aria-label', 'The best car of a small population driving an oval');
  const netCanvas = el('canvas', 'xs-canvas xs-canvas--net');
  netCanvas.setAttribute('aria-label', 'Its neural network: inputs on the left, steer and throttle on the right');
  row.append(carCanvas, netCanvas);
  const labels = [...RAY_ANGLES.map((_, i) => String(i + 1)), 'Speed'];
  const inputs = new Float32Array(N_IN);
  const acts = new Float32Array(NEURON_COUNT);
  let held = -1;
  const bars = createBars(labels, 'Network inputs. Drag a bar to hold that input.', (i, v) => {
    held = i;
    if (i >= 0) inputs[i] = v;
  });
  const meta = el('div', 'xs-readout');
  const steerEl = el('span', 'xs-num');
  const throttleEl = el('span', 'xs-num');
  const genEl = el('span', 'xs-num');
  meta.append(pair('Steer', steerEl), pair('Throttle', throttleEl), pair('Generation', genEl));
  const hint = el('p', 'xs-hint', 'Drag any input bar to hold it there and watch the outputs respond.');
  fig.append(row, bars.root, meta, hint);

  const net = createNetView(netCanvas);
  const s = createSurface(carCanvas);
  const tk = getTokens();
  const view: View = { scale: 1, ox: 0, oy: 0 };
  let warm = true;

  runWhileVisible(fig, (dt) => {
    const { ctx, w, h } = s;
    if (!w) return;
    // Evolve a few generations quickly first so the driver is worth watching.
    if (held < 0 && dt > 0) {
      if (warm) {
        const t0 = performance.now();
        while (performance.now() - t0 < 6) {
          const st = sim.step();
          if (st && st.generation >= 3) warm = false;
        }
      } else {
        const st = sim.step();
        if (st) sim.inspect(0);
      }
    }
    const snap = sim.snapshot();
    const d = snap.detail;
    if (!d) return;
    if (held < 0) {
      inputs.set(d.activations.subarray(0, N_IN));
      acts.set(d.activations);
    } else {
      // The sim is paused; run the same genome on the edited inputs.
      forward(d.genome, 0, inputs, acts);
    }
    bars.set(inputs);
    net.update(d.genome, acts);
    steerEl.textContent = signed(acts[OUT]);
    throttleEl.textContent = signed(acts[OUT + 1]);
    genEl.textContent = String(snap.generation);

    fitView(view, s, track.minX, track.minY, track.maxX, track.maxY, 12);
    ctx.clearRect(0, 0, w, h);
    drawTrack(ctx, track, view, tk);
    ctx.fillStyle = tk.car;
    for (let i = 1; i < snap.count; i++) {
      if (snap.fade[i] <= 0) continue;
      ctx.globalAlpha = snap.fade[i] * 0.6;
      ctx.fillRect(view.ox + snap.x[i] * view.scale - 1.5, view.oy + snap.y[i] * view.scale - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    const cx = view.ox + d.x * view.scale;
    const cy = view.oy + d.y * view.scale;
    ctx.strokeStyle = tk.ink2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < RAY_COUNT; i++) {
      const a = d.angle + RAY_ANGLES[i];
      const r = d.rays[i] * RAY_RANGE * view.scale;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tk.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function pair(label: string, v: HTMLElement): HTMLElement {
  const p = el('span', 'xs-pair');
  p.append(el('span', 'xs-micro', label), v);
  return p;
}

function signed(v: number): string {
  return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
}
