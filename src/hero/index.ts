// The hero stage: a live, worker-backed evolution on a circuit the reader can redraw.
import { CAR_LENGTH, CAR_WIDTH, RAY_ANGLES, RAY_COUNT, RAY_RANGE } from '../sim/types';
import type { GenerationStats, SimSpeed, Snapshot, Track } from '../sim/types';
import { createInspector } from '../netviz';
import { PRESETS } from '../sim/presets';
import { buildTrack } from '../sim/track';
import { createSimClient } from '../sim/client';
import { createHud } from './hud';
import { drawLineLayer, drawTrackLayer, makeLayer } from './layers';
import { onTheme, palette, readPalette } from './theme';
import { applyView, fitView, toWorld } from './view';
import './hero.css';

declare global {
  interface Window {
    __evolve: { fps: number; generation: number; bestLap: number; alive: number; population: number };
  }
}

const FADE_BUCKETS = 4;
const SEED = 7;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountHero(root: HTMLElement): void {
  // DOM
  const bar = h('div', 'stage-bar');
  const presets = h('div', 'stage-presets');
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', 'Circuit');
  const drawBtn = h('button', 'text-btn draw-btn', 'Draw a track');
  drawBtn.type = 'button';
  bar.append(presets, drawBtn);

  const stage = h('div', 'stage');
  const box = h('div', 'stage-box');
  const canvas = h('canvas', 'stage-canvas');
  canvas.setAttribute('aria-label', 'Evolution running live. Click a car to inspect it.');
  const hint = h('div', 'stage-hint');
  const hintText = h('span', '', 'Draw one closed loop. Lift to build it.');
  const cancel = h('button', 'text-btn', 'Cancel');
  cancel.type = 'button';
  hint.append(hintText, cancel);
  const toast = h('div', 'stage-toast');
  box.append(canvas, hint, toast);
  const inspectorEl = h('div', 'stage-inspector');
  inspectorEl.hidden = true;
  stage.append(box, inspectorEl);

  const hudEl = h('div', 'hud');
  root.append(bar, stage, hudEl);

  // State
  let track: Track = PRESETS[0].track;
  let population = 1000;
  let speed: Exclude<SimSpeed, 0> = 1;
  let playing = true;
  let visible = true;
  let inspected = -1;
  let inspectedGen = -1;
  let drawing = false;
  let stroke: number[] = [];
  let bestLine: Float32Array | null = null;

  const client = createSimClient({ track, population, seed: SEED });
  const inspector = createInspector(inspectorEl);
  const view = { s: 1, ox: 0, oy: 0, rot: false };
  const trackLayer = makeLayer();
  const prevLayer = makeLayer();
  const lineLayer = makeLayer();
  let trackFadeStart = -1;
  const g = canvas.getContext('2d')!;
  let w = 0, ht = 0;
  const dpr = Math.min(2, devicePixelRatio || 1);

  const hud = createHud(hudEl, {
    onPlay(p) { playing = p; applySpeed(); },
    onSpeed(s) { speed = s; applySpeed(); },
    onPopulation(p) { population = p; client.setPopulation(p); restartUi(); },
  });

  function applySpeed(): void {
    client.setSpeed(playing && visible ? speed : 0);
    box.classList.toggle('is-max', speed === 'max');
  }

  function renderLayers(): void {
    if (!w || !ht) return;
    fitView(view, track, w, ht, w < 500 ? 12 : 28);
    drawTrackLayer(trackLayer, track, w, ht, dpr, view);
    drawLineLayer(lineLayer, bestLine, w, ht, dpr, view);
  }

  function restartUi(): void {
    bestLine = null;
    hud.reset();
    clearInspect();
    renderLayers();
  }

  // Presets
  const presetBtns = PRESETS.map((p, i) => {
    const b = h('button', 'text-btn', p.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => loadTrack(p.track, b));
    return b;
  });
  presets.append(...presetBtns);

  function loadTrack(t: Track, active: HTMLButtonElement | null): void {
    for (const b of presetBtns) b.setAttribute('aria-pressed', String(b === active));
    // Keep the old circuit around for a short cross-fade.
    prevLayer.width = trackLayer.width;
    prevLayer.height = trackLayer.height;
    prevLayer.getContext('2d')!.drawImage(trackLayer, 0, 0);
    trackFadeStart = performance.now();
    track = t;
    client.setTrack(t);
    restartUi();
  }

  client.onGeneration((s: GenerationStats) => {
    bestLine = s.bestLine;
    drawLineLayer(lineLayer, bestLine, w, ht, dpr, view);
    hud.push(s);
  });

  // Size and visibility
  new ResizeObserver(() => {
    const r = box.getBoundingClientRect();
    w = r.width; ht = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(ht * dpr);
    renderLayers();
    hud.redraw();
  }).observe(box);

  let inView = true;
  const updateVisible = () => {
    visible = inView && !document.hidden;
    applySpeed();
  };
  new IntersectionObserver((e) => {
    inView = e[0].isIntersecting;
    updateVisible();
  }).observe(box);
  document.addEventListener('visibilitychange', updateVisible);

  onTheme(() => {
    requestAnimationFrame(() => {
      readPalette();
      renderLayers();
      hud.redraw();
    });
  });
  readPalette();

  // Inspect
  function clearInspect(): void {
    inspected = -1;
    client.inspect(-1);
    inspector.hide();
    inspectorEl.hidden = true;
  }

  function pick(snap: Snapshot, x: number, y: number, radius: number): number {
    let best = -1, bestD = radius * radius, any = -1, anyD = radius * radius;
    for (let i = 0; i < snap.count; i++) {
      const dx = snap.x[i] - x, dy = snap.y[i] - y;
      const d = dx * dx + dy * dy;
      if (snap.fade[i] >= 1 && d < bestD) { bestD = d; best = i; }
      if (snap.fade[i] > 0 && d < anyD) { anyD = d; any = i; }
    }
    return best >= 0 ? best : any;
  }

  const pt: [number, number] = [0, 0];
  function localPoint(e: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    return toWorld(view, e.clientX - r.left, e.clientY - r.top, pt);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = localPoint(e);
    if (drawing) {
      canvas.setPointerCapture(e.pointerId);
      stroke = [x, y];
      toast.classList.remove('is-on');
      return;
    }
    const snap = client.latest;
    if (!snap || speed === 'max') return;
    const i = pick(snap, x, y, 36 / view.s);
    if (i < 0) { clearInspect(); return; }
    inspected = i;
    inspectedGen = snap.generation;
    client.inspect(i);
    inspectorEl.hidden = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !stroke.length || !canvas.hasPointerCapture(e.pointerId)) return;
    const [x, y] = localPoint(e);
    const lx = stroke[stroke.length - 2], ly = stroke[stroke.length - 1];
    if ((x - lx) ** 2 + (y - ly) ** 2 > (2 / view.s) ** 2) stroke.push(x, y);
  });

  function endStroke(e: PointerEvent): void {
    if (!drawing || !stroke.length) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const t = buildTrack(stroke);
    stroke = [];
    if (!t) {
      showToast('That loop crosses itself or is too small. Try a bigger, simpler shape.');
      return;
    }
    setDrawing(false);
    loadTrack(t, null);
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', () => { stroke = []; });

  let toastTimer = 0;
  function showToast(msg: string): void {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-on'), 3200);
  }

  function setDrawing(on: boolean): void {
    drawing = on;
    stroke = [];
    box.classList.toggle('is-drawing', on);
    drawBtn.setAttribute('aria-pressed', String(on));
    toast.classList.remove('is-on');
    if (on) clearInspect();
  }
  drawBtn.addEventListener('click', () => setDrawing(!drawing));
  cancel.addEventListener('click', () => setDrawing(false));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawing) setDrawing(false);
    else clearInspect();
  });

  // Frame loop
  const dbg = (window.__evolve = { fps: 0, generation: 0, bestLap: 0, alive: 0, population });
  let lastT = performance.now();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = now - lastT;
    lastT = now;
    if (dt > 0) dbg.fps = dbg.fps ? dbg.fps * 0.95 + (1000 / dt) * 0.05 : 1000 / dt;
    if (!visible) return;

    const snap = client.latest;
    if (snap) {
      // The inspected car's generation ended: follow the champion.
      if (inspected >= 0 && snap.generation !== inspectedGen) {
        inspected = 0;
        inspectedGen = snap.generation;
        client.inspect(0);
      }
      hud.set(snap.generation, snap.bestLap, snap.alive, snap.count);
      dbg.generation = snap.generation;
      dbg.bestLap = snap.bestLap;
      dbg.alive = snap.alive;
      dbg.population = snap.count;
      if (inspected >= 0 && snap.detail) inspector.update(snap.detail);
    }
    draw(snap, now);
    client.tick();
  }

  function draw(snap: Snapshot | null, now: number): void {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (trackFadeStart >= 0) {
      const k = Math.min(1, (now - trackFadeStart) / 600);
      const e = 1 - (1 - k) ** 3;
      g.globalAlpha = 1 - e;
      g.drawImage(prevLayer, 0, 0);
      g.globalAlpha = e;
      g.drawImage(trackLayer, 0, 0);
      g.globalAlpha = 1;
      if (k >= 1) trackFadeStart = -1;
    } else {
      g.drawImage(trackLayer, 0, 0);
    }
    g.drawImage(lineLayer, 0, 0);

    applyView(g, view, dpr);
    if (snap && speed !== 'max' && !drawing) drawCars(snap);
    if (drawing && stroke.length >= 4) {
      g.strokeStyle = palette.ink;
      g.lineWidth = 2.5 / view.s;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(stroke[0], stroke[1]);
      for (let i = 2; i < stroke.length; i += 2) g.lineTo(stroke[i], stroke[i + 1]);
      g.stroke();
    }
  }

  // Cars are batched: one path per fade bucket, plus the leader.
  const hl = CAR_LENGTH / 2, hw = CAR_WIDTH / 2;
  function carPath(snap: Snapshot, i: number, grow: number): void {
    const x = snap.x[i], y = snap.y[i], c = Math.cos(snap.angle[i]), s = Math.sin(snap.angle[i]);
    const L = hl * grow, W = hw * grow;
    g.moveTo(x + c * L - s * W, y + s * L + c * W);
    g.lineTo(x + c * L + s * W, y + s * L - c * W);
    g.lineTo(x - c * L + s * W, y - s * L - c * W);
    g.lineTo(x - c * L - s * W, y - s * L + c * W);
    g.closePath();
  }

  function drawCars(snap: Snapshot): void {
    // Below about 0.6 px per world unit cars would vanish; keep them at least a few pixels long.
    const grow = Math.max(1, 5 / (CAR_LENGTH * view.s));
    g.fillStyle = palette.car;
    for (let b = 0; b < FADE_BUCKETS; b++) {
      g.globalAlpha = (b + 0.5) / FADE_BUCKETS * 0.6;
      g.beginPath();
      for (let i = 0; i < snap.count; i++) {
        const f = snap.fade[i];
        if (f <= 0 || f >= 1 || Math.min(FADE_BUCKETS - 1, Math.floor(f * FADE_BUCKETS)) !== b) continue;
        carPath(snap, i, grow);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    g.beginPath();
    for (let i = 0; i < snap.count; i++) {
      if (snap.fade[i] >= 1 && i !== snap.leader) carPath(snap, i, grow);
    }
    g.fill();

    if (snap.leader >= 0) {
      g.fillStyle = palette.accent;
      g.beginPath();
      carPath(snap, snap.leader, grow * 1.15);
      g.fill();
    }

    const d = snap.detail;
    if (inspected >= 0 && d) {
      const px = 1 / view.s;
      g.strokeStyle = palette.ink2;
      g.lineWidth = px;
      g.beginPath();
      for (let r = 0; r < RAY_COUNT; r++) {
        const a = d.angle + RAY_ANGLES[r], len = d.rays[r] * RAY_RANGE;
        g.moveTo(d.x, d.y);
        g.lineTo(d.x + Math.cos(a) * len, d.y + Math.sin(a) * len);
      }
      g.stroke();
      g.fillStyle = palette.ink;
      g.beginPath();
      for (let r = 0; r < RAY_COUNT; r++) {
        if (d.rays[r] >= 1) continue;
        const a = d.angle + RAY_ANGLES[r], len = d.rays[r] * RAY_RANGE;
        const hx = d.x + Math.cos(a) * len, hy = d.y + Math.sin(a) * len;
        g.moveTo(hx + 2.5 * px, hy);
        g.arc(hx, hy, 2.5 * px, 0, Math.PI * 2);
      }
      g.fill();
      g.strokeStyle = d.alive ? palette.ink : palette.ink3;
      g.lineWidth = 1.5 * px;
      g.beginPath();
      g.arc(d.x, d.y, 14 * px, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // QA hook for the Playwright checks; stripped from production builds.
  if (import.meta.env.DEV) (window as unknown as { __hero: unknown }).__hero = { client, view };

  applySpeed();
  requestAnimationFrame(frame);
}
