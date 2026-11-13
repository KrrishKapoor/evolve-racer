// Why the racing line emerges: a population evolves headless on screen; compare any generation's best line with the first.
import { PRESETS } from '../sim/presets';
import { createSimulation } from '../sim/sim';
import type { GenerationStats } from '../sim/types';
import { createSurface, getTokens, onTheme, runWhileVisible, el, drawTrack, fitView, rgba, touchCanvas, type View } from './canvas';

const MAX_GEN = 40;
const BUCKETS = 12;

interface Rec { gen: number; line: Float32Array; lap: number; progress: number }

export function mountRacingLine(fig: HTMLElement): void {
  const track = PRESETS[0].track;
  let sim = createSimulation(track, { population: 150, seed: 5 });
  const recs: Rec[] = [];
  let pick = -1; // index into recs the reader chose; -1 follows the latest

  const canvas = el('canvas', 'xs-canvas xs-canvas--line');
  canvas.setAttribute('aria-label', 'The circuit with the first and a later generation’s best lines, coloured by speed');
  const trace = el('canvas', 'xs-canvas xs-canvas--trace');
  trace.setAttribute('aria-label', 'Speed along the lap for both lines');
  touchCanvas(trace);
  const controls = el('div', 'xs-controls');
  const range = el('input', 'xs-range');
  range.type = 'range';
  range.min = '0';
  range.max = '0';
  range.value = '0';
  range.setAttribute('aria-label', 'Generation');
  const genEl = el('span', 'xs-num');
  const lapEl = el('span', 'xs-num');
  const firstEl = el('span', 'xs-num');
  const readout = el('div', 'xs-readout');
  const deltaEl = el('span', 'xs-num');
  const firstPair = pair('Generation 1', firstEl);
  const firstLabel = firstPair.firstChild as HTMLElement;
  readout.append(pair('Generation', genEl), firstPair, pair('This line', lapEl), pair('Time saved', deltaEl));
  const restart = el('button', 'xs-btn', 'Start over');
  controls.append(range, restart);
  const legend = el('div', 'xs-legend');
  legend.innerHTML =
    '<span class="xs-key xs-key--first"></span><span class="xs-key-first">Generation 1</span>' +
    '<span class="xs-key xs-key--slow"></span><span>Slow</span>' +
    '<span class="xs-key xs-key--fast"></span><span>Fast</span>';
  const keyLabel = legend.querySelector('.xs-key-first') as HTMLElement;
  fig.append(canvas, legend, trace, readout, controls);

  range.addEventListener('input', () => {
    const v = Number(range.value);
    pick = v >= recs.length - 1 ? -1 : v;
    dirty = true;
  });
  restart.addEventListener('click', () => {
    sim = createSimulation(track, { population: 150, seed: (Math.random() * 1e9) | 0 });
    recs.length = 0;
    pick = -1;
    range.max = '0';
    dirty = true;
  });

  const s = createSurface(canvas, () => (dirty = true));
  const ts = createSurface(trace, () => (dirty = true));
  const tk = getTokens();
  const view: View = { scale: 1, ox: 0, oy: 0 };
  let dirty = true;
  let ramp: string[] = [];
  const buildRamp = () => {
    const a = rgba(tk.cool);
    const b = rgba(tk.ink3);
    const c = rgba(tk.accent);
    ramp = [];
    for (let i = 0; i < BUCKETS; i++) {
      const t = i / (BUCKETS - 1);
      const [p, q, u] = t < 0.5 ? [a, b, t * 2] : [b, c, t * 2 - 1];
      const m = (k: number) => Math.round(p[k] + (q[k] - p[k]) * u);
      ramp.push(`rgb(${m(0)},${m(1)},${m(2)})`);
    }
    dirty = true;
  };
  buildRamp();
  onTheme(buildRamp);

  // Scrubbing the trace marks the same point on both lines.
  let scrub = -1;
  const scrubAt = (e: PointerEvent) => {
    const r = trace.getBoundingClientRect();
    scrub = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    dirty = true;
  };
  trace.addEventListener('pointerdown', (e) => {
    trace.setPointerCapture(e.pointerId);
    scrubAt(e);
  });
  trace.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'mouse') scrubAt(e);
  });
  trace.addEventListener('pointerleave', () => {
    scrub = -1;
    dirty = true;
  });

  const onStats = (st: GenerationStats) => {
    const prev = recs[recs.length - 1];
    const line = prev && prev.line.length === st.bestLine.length && prev.line[0] === st.bestLine[0] && st.bestLine.length > 3 && prev.line[3] === st.bestLine[3]
      ? prev.line
      : st.bestLine.slice();
    recs.push({ gen: st.generation, line, lap: st.bestLapEver, progress: st.bestProgress });
    range.max = String(recs.length - 1);
    if (pick < 0) range.value = range.max;
    dirty = true;
  };

  runWhileVisible(fig, () => {
    if (recs.length < MAX_GEN) {
      const t0 = performance.now();
      while (performance.now() - t0 < 2.5) {
        const st = sim.step();
        if (st) {
          onStats(st);
          if (recs.length >= MAX_GEN) break;
        }
      }
    }
    if (dirty) draw();
  });

  function draw(): void {
    dirty = false;
    const { ctx, w, h } = s;
    if (!w) return;
    fitView(view, s, track.minX, track.minY, track.maxX, track.maxY, Math.min(28, w * 0.05));
    ctx.clearRect(0, 0, w, h);
    drawTrack(ctx, track, view, tk);
    // Baseline: the first generation that finished a lap, so both lines cover the whole circuit.
    const first = recs.find((r) => r.lap > 0) ?? recs[0];
    const cur = recs[pick < 0 ? recs.length - 1 : pick];
    if (first) strokeLine(first.line, false);
    if (cur && cur !== first) strokeLine(cur.line, true);
    else if (first) strokeLine(first.line, true);

    genEl.textContent = cur ? String(cur.gen) : '0';
    firstEl.textContent = first ? describe(first) : '–';
    lapEl.textContent = cur ? describe(cur) : '–';
    firstLabel.textContent = first ? `Generation ${first.gen}` : 'Generation 1';
    keyLabel.textContent = firstLabel.textContent;
    deltaEl.textContent = first && cur && first.lap > 0 && cur.lap > 0 ? `${(first.lap - cur.lap).toFixed(2)} s` : '–';

    drawTrace(first, cur);
    if (scrub >= 0) {
      for (const r of [first, cur]) {
        if (!r) continue;
        const span = r.lap > 0 ? 1 : Math.max(0.02, r.progress);
        if (scrub > span) continue;
        const i = Math.round((scrub / span) * (r.line.length / 3 - 1)) * 3;
        const x = view.ox + r.line[i] * view.scale;
        const y = view.oy + r.line[i + 1] * view.scale;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = r === first ? tk.ink3 : tk.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function strokeLine(line: Float32Array, colored: boolean): void {
    const ctx = s.ctx;
    const n = line.length / 3;
    if (n < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!colored) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = tk.ink3;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = view.ox + line[i * 3] * view.scale;
        const y = view.oy + line[i * 3 + 1] * view.scale;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    ctx.lineWidth = 2.5;
    // Colour by speed relative to this line's own range, so braking zones show even when the car is fast.
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, line[i * 3 + 2]);
      hi = Math.max(hi, line[i * 3 + 2]);
    }
    // Ignore the standing start when finding the slowest point.
    lo = Math.max(lo, hi * 0.5);
    const k = 1 / Math.max(0.05, hi - lo);
    // One path per speed bucket keeps this to a dozen strokes.
    for (let b = 0; b < BUCKETS; b++) {
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const sp = (line[i * 3 + 2] + line[i * 3 - 1]) / 2;
        if (Math.max(0, Math.min(BUCKETS - 1, Math.floor((sp - lo) * k * BUCKETS))) !== b) continue;
        ctx.moveTo(view.ox + line[i * 3 - 3] * view.scale, view.oy + line[i * 3 - 2] * view.scale);
        ctx.lineTo(view.ox + line[i * 3] * view.scale, view.oy + line[i * 3 + 1] * view.scale);
      }
      ctx.strokeStyle = ramp[b];
      ctx.stroke();
    }
  }

  function drawTrace(first: Rec | undefined, cur: Rec | undefined): void {
    const { ctx, w, h } = ts;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const top = 16;
    const bot = h - 18;
    ctx.fillStyle = tk.hairline;
    ctx.fillRect(0, bot, w, 1);
    ctx.fillRect(0, top, w, 1);
    ctx.font = `500 11px ${tk.font}`;
    ctx.fillStyle = tk.ink3;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('TOP SPEED', 0, top - 5);
    ctx.fillText('START', 0, h - 3);
    ctx.textAlign = 'right';
    ctx.fillText('FINISH', w, h - 3);
    // x is the fraction of each line's own samples, so both traces span the width when both finish.
    const plot = (r: Rec, colored: boolean) => {
      const n = r.line.length / 3;
      if (n < 2) return;
      // A line that did not finish only covers its share of the lap.
      const span = r.lap > 0 ? 1 : Math.max(0.02, r.progress);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * span * w;
        const y = bot - r.line[i * 3 + 2] * (bot - top);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.lineWidth = colored ? 1.75 : 1.25;
      ctx.strokeStyle = colored ? tk.accent : tk.ink3;
      ctx.setLineDash(colored ? [] : [3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (first) plot(first, false);
    if (cur && cur !== first) plot(cur, true);
    if (scrub >= 0) {
      ctx.fillStyle = tk.ink2;
      ctx.fillRect(Math.round(scrub * w), top, 1, bot - top);
    }
  }
}

function describe(r: Rec): string {
  return r.lap > 0 ? `${r.lap.toFixed(2)} s lap` : `${Math.round(r.progress * 100)}% of a lap`;
}

function pair(label: string, v: HTMLElement): HTMLElement {
  const p = el('span', 'xs-pair');
  p.append(el('span', 'xs-micro', label), v);
  return p;
}
