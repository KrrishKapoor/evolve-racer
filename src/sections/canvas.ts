// Shared plumbing for the section demos: crisp canvases, theme tokens, and a loop that only runs on screen.
import type { Track } from '../sim/types';

export interface Tokens {
  bg: string; stage: string; ink: string; ink2: string; ink3: string; hairline: string;
  asphalt: string; wall: string; car: string; accent: string; accentSoft: string; cool: string; coolSoft: string;
  font: string;
}

const tokens = {} as Tokens;
const NAMES: [keyof Tokens, string][] = [
  ['bg', '--bg'], ['stage', '--stage'], ['ink', '--ink'], ['ink2', '--ink-2'], ['ink3', '--ink-3'],
  ['hairline', '--hairline'], ['asphalt', '--asphalt'], ['wall', '--wall'], ['car', '--car'],
  ['accent', '--accent'], ['accentSoft', '--accent-soft'], ['cool', '--cool'], ['coolSoft', '--cool-soft'],
  ['font', '--font'],
];
const themeListeners = new Set<() => void>();

function readTokens(): void {
  const cs = getComputedStyle(document.documentElement);
  for (const [k, v] of NAMES) tokens[k] = cs.getPropertyValue(v).trim();
  themeListeners.forEach((f) => f());
}
let tokensReady = false;
export function getTokens(): Tokens {
  if (!tokensReady) {
    tokensReady = true;
    readTokens();
    window.addEventListener('themechange', () => requestAnimationFrame(readTokens));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTokens);
  }
  return tokens;
}
export function onTheme(f: () => void): void {
  themeListeners.add(f);
}

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS pixel size. */
  w: number;
  h: number;
}

/** A canvas that tracks its CSS size at up to 2x DPR. `onResize` runs after every size change. */
export function createSurface(canvas: HTMLCanvasElement, onResize?: () => void): Surface {
  const ctx = canvas.getContext('2d')!;
  const s: Surface = { canvas, ctx, w: 0, h: 0 };
  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    s.w = r.width;
    s.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.();
  });
  ro.observe(canvas);
  return s;
}

/** Calls `frame(dt)` on every animation frame while `el` is on screen and the tab is visible. */
export function runWhileVisible(el: Element, frame: (dt: number) => void): void {
  let onScreen = false;
  let raf = 0;
  let last = 0;
  const loop = (t: number) => {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    frame(dt);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const want = onScreen && !document.hidden;
    if (want && !raf) {
      last = 0;
      raf = requestAnimationFrame(loop);
    } else if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  new IntersectionObserver((e) => {
    onScreen = e[e.length - 1].isIntersecting;
    sync();
  }, { rootMargin: '100px' }).observe(el);
  document.addEventListener('visibilitychange', sync);
}

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** World-to-screen fit for a track (or part of one) inside a surface. */
export interface View { scale: number; ox: number; oy: number }
export function fitView(v: View, s: Surface, minX: number, minY: number, maxX: number, maxY: number, pad: number): void {
  const scale = Math.min((s.w - 2 * pad) / (maxX - minX), (s.h - 2 * pad) / (maxY - minY));
  v.scale = scale;
  v.ox = (s.w - (maxX - minX) * scale) / 2 - minX * scale;
  v.oy = (s.h - (maxY - minY) * scale) / 2 - minY * scale;
}

/** Fills the track surface and strokes both walls, in world units under the current transform. */
export function drawTrack(ctx: CanvasRenderingContext2D, t: Track, v: View, tk: Tokens): void {
  ctx.save();
  ctx.translate(v.ox, v.oy);
  ctx.scale(v.scale, v.scale);
  ctx.beginPath();
  loop(ctx, t.lx, t.ly, t.n);
  loop(ctx, t.rx, t.ry, t.n);
  ctx.fillStyle = tk.asphalt;
  ctx.fill('evenodd');
  ctx.beginPath();
  loop(ctx, t.lx, t.ly, t.n);
  loop(ctx, t.rx, t.ry, t.n);
  ctx.lineWidth = 1.25 / v.scale;
  ctx.strokeStyle = tk.wall;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // start/finish
  ctx.beginPath();
  ctx.moveTo(t.lx[0], t.ly[0]);
  ctx.lineTo(t.rx[0], t.ry[0]);
  ctx.lineWidth = 2 / v.scale;
  ctx.strokeStyle = tk.ink;
  ctx.stroke();
  ctx.restore();
}

function loop(ctx: CanvasRenderingContext2D, xs: Float32Array, ys: Float32Array, n: number): void {
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.closePath();
}

/** Small DOM helper. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Builds the standard section frame: title, copy, and a figure the demo fills. */
export function sectionFrame(root: HTMLElement, id: string, kicker: string, title: string, copy: string[]): HTMLElement {
  const sec = el('section', 'xs');
  sec.id = id;
  const text = el('div', 'xs-text');
  text.append(el('p', 'xs-kicker', kicker), el('h2', 'xs-title', title));
  for (const c of copy) text.append(el('p', 'xs-copy', c));
  const fig = el('figure', 'xs-demo');
  sec.append(text, fig);
  root.append(sec);
  return fig;
}

/** Makes a canvas touch-safe for pointer dragging. */
export function touchCanvas(c: HTMLCanvasElement): void {
  c.classList.add('xs-touch');
}

/** Parses a CSS colour into [r, g, b, a] using the canvas colour normaliser. */
const probe = document.createElement('canvas').getContext('2d')!;
export function rgba(css: string): [number, number, number, number] {
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  const v = String(probe.fillStyle);
  if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g)!.map(Number);
  return [m[0], m[1], m[2], m[3] ?? 1];
}

/** Pointer capture can throw for pointers the browser no longer tracks; never let that abort a drag. */
export function capture(t: Element, id: number): void {
  try {
    t.setPointerCapture(id);
  } catch {
    /* ignore */
  }
}
