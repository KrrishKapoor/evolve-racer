// Selection, crossover, mutation on real genomes, drawn as grids: one column per neuron, one cell per gene.
import { GENOME_SIZE, NET_LAYERS } from '../sim/types';
import { createRng } from '../sim/rng';
import { randomGenome } from '../sim/nn';
import { crossover, mutate } from '../sim/ga';
import { createSurface, getTokens, onTheme, runWhileVisible, el, reducedMotion, type Tokens } from './canvas';

const POP = 6;
const ROWS = Math.max(...NET_LAYERS.slice(0, -1)) + 1; // tallest column: inputs + bias
// Column k -> gene offsets of one neuron (its incoming weights, then its bias).
const COLS: number[][] = [];
{
  let g = 0;
  for (let l = 1; l < NET_LAYERS.length; l++) {
    const nIn = NET_LAYERS[l - 1];
    const nOut = NET_LAYERS[l];
    const bias = g + nOut * nIn;
    for (let o = 0; o < nOut; o++) {
      const col: number[] = [];
      for (let i = 0; i < nIn; i++) col.push(g + o * nIn + i);
      col.push(bias + o);
      COLS.push(col);
    }
    g = bias + nOut;
  }
}

const PHASES = ['Rank', 'Select', 'Crossover', 'Mutate'] as const;
const CAPTIONS = [
  'Six genomes, ranked by fitness. Each parent is the fitter of two genomes drawn at random.',
  'Two parents are drawn. The fittest win more often, but not always, which keeps variety alive.',
  'The child takes each neuron whole from one parent or the other.',
  'A few genes are nudged at random. Most mutations hurt; a few help.',
];

export function mountGenetics(fig: HTMLElement): void {
  const canvas = el('canvas', 'xs-canvas xs-canvas--genes');
  canvas.setAttribute('aria-label', 'Genomes as grids of weights; parents combine into a child, then mutate');
  const bar = el('div', 'xs-controls');
  const caption = el('p', 'xs-caption');
  const step = el('button', 'xs-btn', 'Next step');
  const steps = el('div', 'xs-steps');
  const stepEls = PHASES.map((p) => steps.appendChild(el('span', 'xs-step', p)));
  bar.append(steps, step);
  fig.append(canvas, bar, caption);

  const rng = createRng(7);
  const pop = new Float32Array(POP * GENOME_SIZE);
  const fit = new Float32Array(POP);
  const child = new Float32Array(GENOME_SIZE);
  const before = new Float32Array(GENOME_SIZE);
  const fromA = new Uint8Array(COLS.length);
  let pa = 0;
  let pb = 1;
  let phase = 0;
  let t = 0; // seconds into the current phase
  let auto = !reducedMotion();

  const reseed = () => {
    for (let i = 0; i < POP; i++) randomGenome(rng, pop, i * GENOME_SIZE);
    for (let i = 0; i < POP; i++) fit[i] = 0.05 + rng() * 0.9;
    // Sort genomes by fitness, best first, so rank order equals storage order.
    const order = [...fit.keys()].sort((a, b) => fit[b] - fit[a]);
    const copy = pop.slice();
    const f = fit.slice();
    order.forEach((src, dst) => {
      pop.set(copy.subarray(src * GENOME_SIZE, (src + 1) * GENOME_SIZE), dst * GENOME_SIZE);
      fit[dst] = f[src];
    });
  };
  const pick = () => {
    // Tournament of two, done here by hand so the reader sees which pair was compared.
    const t2 = () => {
      const a = (rng() * POP) | 0;
      const b = (rng() * POP) | 0;
      return fit[a] > fit[b] ? a : b;
    };
    pa = t2();
    do pb = t2(); while (pb === pa);
    if (fit[pb] > fit[pa]) [pa, pb] = [pb, pa];
    crossover(pop, pa * GENOME_SIZE, pop, pb * GENOME_SIZE, child, 0, rng);
    for (let k = 0; k < COLS.length; k++) fromA[k] = child[COLS[k][0]] === pop[pa * GENOME_SIZE + COLS[k][0]] ? 1 : 0;
    before.set(child);
  };
  const advance = () => {
    phase = (phase + 1) % PHASES.length;
    t = 0;
    if (phase === 0) reseed();
    if (phase === 1) pick();
    if (phase === 3) mutate(child, 0, rng, 0.06, 0.6);
    stepEls.forEach((s, i) => s.classList.toggle('is-on', i === phase));
    caption.textContent = CAPTIONS[phase];
  };
  reseed();
  phase = -1;
  advance();

  step.addEventListener('click', () => {
    auto = false;
    advance();
  });

  const s = createSurface(canvas, () => draw());
  const tk = getTokens();
  let mul = 1; // alpha multiplier for dimmed grids

  function cell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, v: number, k: Tokens): void {
    const a = Math.min(1, Math.abs(v) / 1.2);
    ctx.globalAlpha = mul * (0.12 + 0.88 * a);
    ctx.fillStyle = v >= 0 ? k.accent : k.cool;
    ctx.fillRect(x, y, size, size);
  }

  /** Draws a genome grid; `reveal` 0..1 shows columns left to right (crossover). */
  function grid(g: Float32Array, off: number, x: number, y: number, c: number, reveal = 1, highlight?: Float32Array): void {
    const ctx = s.ctx;
    const gap = Math.max(1, c * 0.18);
    const shown = Math.round(reveal * COLS.length);
    for (let k = 0; k < COLS.length; k++) {
      const col = COLS[k];
      const cx = x + k * (c + gap) + (k >= 8 ? gap * 2 : 0) + (k >= 14 ? gap * 2 : 0);
      for (let r = 0; r < col.length; r++) {
        const cy = y + r * (c + gap);
        if (k >= shown) {
          ctx.globalAlpha = mul;
          ctx.strokeStyle = tk.hairline;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, c - 1, c - 1);
          continue;
        }
        cell(ctx, cx, cy, c, g[off + col[r]], tk);
        if (highlight && highlight[col[r]] !== g[off + col[r]]) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = tk.ink;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - 1.5, cy - 1.5, c + 3, c + 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  const gridW = (c: number) => COLS.length * c + (COLS.length - 1 + 4) * Math.max(1, c * 0.18);
  const gridH = (c: number) => ROWS * c + (ROWS - 1) * Math.max(1, c * 0.18);

  function label(text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', size = 11): void {
    const ctx = s.ctx;
    ctx.font = `500 ${size}px ${tk.font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function draw(): void {
    const ctx = s.ctx;
    const { w, h } = s;
    ctx.clearRect(0, 0, w, h);
    const narrow = w < 640;
    // Population: 6 grids, 3x2 on desktop, 2x3 on phones.
    const cols = narrow ? 2 : 3;
    const top = 0;
    const popH = h * (narrow ? 0.52 : 0.5);
    const rows = POP / cols;
    const slotW = w / cols;
    const slotH = popH / rows;
    const c = Math.max(2, Math.min((slotW - 16) / (COLS.length * 1.18 + 1), (slotH - 26) / (ROWS * 1.18)));
    const gw = gridW(c);
    for (let i = 0; i < POP; i++) {
      const sx = (i % cols) * slotW + (slotW - gw) / 2;
      const sy = top + Math.floor(i / cols) * slotH + 18;
      const isParent = phase >= 1 && (i === pa || i === pb);
      const dim = phase >= 1 && !isParent;
      ctx.globalAlpha = 1;
      label(`#${i + 1}`, sx, sy - 6, i === 0 ? tk.accent : tk.ink3);
      label(`fitness ${fit[i].toFixed(2)}`, sx + gw, sy - 6, isParent ? tk.ink : tk.ink3, 'right');
      mul = dim ? 0.3 : 1;
      grid(pop, i * GENOME_SIZE, sx, sy, c);
      mul = 1;
      if (isParent) {
        ctx.strokeStyle = tk.ink;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 4.5, sy - 4.5, gw + 9, gridH(c) + 9);
        label(i === pa ? 'A' : 'B', sx - 10, sy + gridH(c) / 2 + 4, tk.ink, 'right');
      }
    }
    // Lower band: parent A + parent B -> child.
    const y0 = popH + 12;
    ctx.fillStyle = tk.hairline;
    ctx.fillRect(0, y0 - 6, w, 1);
    if (phase === 0) {
      // Odds of winning a two-way tournament at each rank: (2(N - r) - 1) / N^2.
      const bw0 = Math.min(w - 40, 420);
      const x0 = (w - bw0) / 2;
      const rowH = Math.min(26, (h - y0 - 40) / POP);
      const yt = y0 + (h - y0 - rowH * POP - 18) / 2 + 18;
      label('CHANCE OF WINNING A DRAW', x0, yt - 8, tk.ink3);
      for (let i = 0; i < POP; i++) {
        const p = (2 * (POP - i) - 1) / (POP * POP);
        const y = yt + i * rowH;
        label(`#${i + 1}`, x0, y + rowH * 0.62, i === 0 ? tk.accent : tk.ink3);
        ctx.fillStyle = i === 0 ? tk.accent : tk.ink;
        ctx.globalAlpha = i === 0 ? 1 : 0.7;
        ctx.fillRect(x0 + 32, y + rowH * 0.25, (bw0 - 80) * p * (36 / 11), rowH * 0.5);
        ctx.globalAlpha = 1;
        label(`${Math.round(p * 100)}%`, x0 + bw0, y + rowH * 0.62, tk.ink2, 'right');
      }
      return;
    }
    const big = Math.max(3, Math.min((narrow ? w : w / 3 - 24) / (COLS.length * 1.18 + 1), (h - y0 - (narrow ? 60 : 40)) / (ROWS * 1.18 * (narrow ? 2 : 1))));
    const bw = gridW(big);
    const bh = gridH(big);
    let ax: number, ay: number, bx: number, by: number, cx: number, cy: number;
    if (narrow) {
      const small = big * 0.55;
      ax = (w / 2 - gridW(small)) / 2;
      bx = w / 2 + (w / 2 - gridW(small)) / 2;
      ay = by = y0 + 18;
      cx = (w - bw) / 2;
      cy = ay + gridH(small) + 34;
      label('A', ax, ay - 6, tk.ink);
      label('B', bx, by - 6, tk.ink);
      grid(pop, pa * GENOME_SIZE, ax, ay, small);
      grid(pop, pb * GENOME_SIZE, bx, by, small);
    } else {
      const gap = (w - 3 * bw) / 4;
      ax = gap;
      bx = gap * 2 + bw;
      cx = gap * 3 + bw * 2;
      ay = by = cy = y0 + 22 + (h - y0 - 22 - bh) / 2 - 8;
      label('Parent A', ax, ay - 8, tk.ink);
      label('Parent B', bx, by - 8, tk.ink);
      grid(pop, pa * GENOME_SIZE, ax, ay, big);
      grid(pop, pb * GENOME_SIZE, bx, by, big);
    }
    if (phase >= 2) {
      const reveal = phase === 2 ? Math.min(1, t / 1.6) : 1;
      label(phase === 3 ? 'Child, mutated' : 'Child', cx, cy - 8, tk.ink);
      // Jitter in the mutate phase is decorative; skip it for reduced motion.
      const show = phase === 3 && !reducedMotion() && t < 0.8 ? jittered() : child;
      grid(show, 0, cx, cy, big, reveal, phase === 3 ? before : undefined);
      // Which parent each column came from: a tick in the parent's position under the child.
      const gap = Math.max(1, big * 0.18);
      const shown = Math.round(reveal * COLS.length);
      for (let k = 0; k < shown; k++) {
        const x = cx + k * (big + gap) + (k >= 8 ? gap * 2 : 0) + (k >= 14 ? gap * 2 : 0);
        label(fromA[k] ? 'A' : 'B', x + big / 2, cy + bh + 13, tk.ink3, 'center', Math.min(11, big * 1.05));
      }
    }
  }
  const jit = new Float32Array(GENOME_SIZE);
  function jittered(): Float32Array {
    const k = 1 - t / 0.8;
    for (let i = 0; i < GENOME_SIZE; i++) jit[i] = child[i] + (child[i] - before[i]) * k * Math.sin(t * 40);
    return jit;
  }

  onTheme(draw);
  runWhileVisible(canvas, (dt) => {
    t += dt;
    if (auto && t > (phase === 2 ? 3.2 : 2.6)) advance();
    draw();
  });
}
