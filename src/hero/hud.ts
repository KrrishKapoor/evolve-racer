// HUD: generation, best lap, alive, fitness sparkline, and the playback controls.
import type { GenerationStats, SimSpeed } from '../sim/types';
import { palette } from './theme';

export interface HudHandlers {
  onPlay(playing: boolean): void;
  onSpeed(speed: Exclude<SimSpeed, 0>): void;
  onPopulation(p: number): void;
}

const PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5h2.75v11H4zM9.25 2.5H12v11H9.25z" fill="currentColor"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function stat(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = el('div', 'hud-stat');
  const value = el('div', 'hud-value', '0');
  root.append(el('div', 'micro', label), value);
  return { root, value };
}

function segmented<T>(items: [string, T][], initial: T, label: string, onPick: (v: T) => void) {
  const root = el('div', 'seg');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const btns = items.map(([text, v]) => {
    const b = el('button', 'seg-btn', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === initial));
    b.addEventListener('click', () => {
      for (const o of btns) o.setAttribute('aria-pressed', String(o === b));
      onPick(v);
    });
    return b;
  });
  root.append(...btns);
  return root;
}

export function createHud(root: HTMLElement, h: HudHandlers) {
  const gen = stat('Generation');
  const lap = stat('Best lap');
  const alive = stat('Alive');

  const spark = el('div', 'hud-spark');
  const sparkCanvas = el('canvas', 'hud-spark-canvas');
  const sparkLabel = el('div', 'micro', 'Fitness');
  spark.append(sparkLabel, sparkCanvas);

  const stats = el('div', 'hud-stats');
  stats.append(gen.root, lap.root, alive.root, spark);

  let playing = true;
  const play = el('button', 'icon-btn play-btn', PAUSE);
  play.type = 'button';
  play.setAttribute('aria-label', 'Pause');
  play.addEventListener('click', () => {
    playing = !playing;
    play.innerHTML = playing ? PAUSE : PLAY;
    play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    h.onPlay(playing);
  });

  const speed = segmented<Exclude<SimSpeed, 0>>([['1×', 1], ['4×', 4], ['Max', 'max']], 1, 'Speed', h.onSpeed);
  const pop = segmented<number>([['250', 250], ['500', 500], ['1000', 1000]], 1000, 'Population', h.onPopulation);
  const popWrap = el('div', 'hud-pop');
  popWrap.append(el('span', 'micro', 'Cars'), pop);

  const controls = el('div', 'hud-controls');
  controls.append(play, speed, popWrap);
  root.append(stats, controls);

  // Fitness history, in laps. Above 1.0 the curve is driven by lap time, so that part is drawn in accent.
  const hist: number[] = [];
  const dpr = Math.min(2, devicePixelRatio || 1);
  let sw = 0, sh = 0;

  function drawSpark(): void {
    const r = sparkCanvas.getBoundingClientRect();
    if (r.width !== sw || r.height !== sh) {
      sw = r.width; sh = r.height;
      sparkCanvas.width = Math.round(sw * dpr);
      sparkCanvas.height = Math.round(sh * dpr);
    }
    const g = sparkCanvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, sw, sh);
    let max = 1.05;
    for (const v of hist) max = Math.max(max, v);
    const pad = 3;
    const y = (v: number) => sh - pad - (v / max) * (sh - 2 * pad);
    // The one-lap mark.
    g.strokeStyle = palette.hairline;
    g.lineWidth = 1;
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(0, Math.round(y(1)) + 0.5);
    g.lineTo(sw, Math.round(y(1)) + 0.5);
    g.stroke();
    g.setLineDash([]);
    if (hist.length < 2) return;
    const n = hist.length;
    const x = (i: number) => (i / (n - 1)) * (sw - 2 * pad) + pad;
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const lapped of [false, true]) {
      g.strokeStyle = lapped ? palette.accent : palette.ink2;
      g.beginPath();
      let open = false;
      for (let i = 1; i < n; i++) {
        if ((hist[i] > 1) !== lapped) { open = false; continue; }
        if (!open) { g.moveTo(x(i - 1), y(hist[i - 1])); open = true; }
        g.lineTo(x(i), y(hist[i]));
      }
      g.stroke();
    }
    const last = hist[n - 1];
    g.fillStyle = last > 1 ? palette.accent : palette.ink2;
    g.beginPath();
    g.arc(x(n - 1), y(last), 2.5, 0, Math.PI * 2);
    g.fill();
  }

  let lastGen = -1, lastLap = -1, lastAlive = -1;

  return {
    set(generation: number, bestLap: number, aliveCount: number, population: number) {
      if (generation !== lastGen) { gen.value.textContent = String(generation); lastGen = generation; }
      if (bestLap !== lastLap) { lap.value.textContent = bestLap > 0 ? `${bestLap.toFixed(2)}s` : '—'; lastLap = bestLap; }
      if (aliveCount !== lastAlive) { alive.value.innerHTML = `${aliveCount}<span class="hud-of">/${population}</span>`; lastAlive = aliveCount; }
    },
    push(s: GenerationStats) {
      hist.push(s.bestFitness);
      if (hist.length > 200) hist.shift();
      sparkLabel.textContent = s.bestLapEver > 0 ? 'Fitness · lapping' : 'Fitness · progress';
      drawSpark();
    },
    reset() {
      hist.length = 0;
      sparkLabel.textContent = 'Fitness';
      drawSpark();
    },
    redraw: drawSpark,
  };
}
