import './netviz.css';
import { RAY_COUNT, RAY_ANGLES, type CarDetail } from '../sim/types';
import { createNetView } from './netview';

export interface Inspector {
  update(detail: CarDetail): void;
  hide(): void;
  destroy(): void;
}

// Precomputed transform strings so per-frame updates do not allocate.
const SCALE: string[] = [];
for (let i = 0; i <= 100; i++) SCALE.push(`scaleY(${i / 100})`);
const SCALE_X: string[] = [];
for (let i = 0; i <= 100; i++) SCALE_X.push(`scaleX(${i / 100})`);
const PCT: string[] = [];
for (let i = 0; i <= 100; i++) PCT.push(String(i));
const TWO: string[] = [];
for (let i = 0; i <= 100; i++) TWO.push(i === 100 ? '1.00' : '.' + String(i).padStart(2, '0'));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

const q = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));

export function createInspector(container: HTMLElement): Inspector {
  const root = el('section', 'nv-inspector', container);
  root.setAttribute('aria-label', 'Inspected car');
  root.hidden = true;

  const head = el('header', 'nv-head', root);
  const title = el('div', 'nv-title', head);
  el('span', 'nv-micro', title).textContent = 'Car';
  const num = el('span', 'nv-num', title);
  const status = el('div', 'nv-status', head);
  const dot = el('span', 'nv-dot', status);
  const statusText = el('span', 'nv-micro', status);

  const speedRow = el('div', 'nv-speed', root);
  el('span', 'nv-micro', speedRow).textContent = 'Speed';
  const speedTrack = el('div', 'nv-track', speedRow);
  const speedFill = el('div', 'nv-fill', speedTrack);
  const speedVal = el('span', 'nv-val', speedRow);
  el('span', 'nv-unit', speedRow).textContent = '%';

  const netWrap = el('div', 'nv-net', root);
  const canvas = el('canvas', '', netWrap);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Neural network: ray and speed inputs, two hidden layers, steering and throttle outputs');
  const view = createNetView(canvas);

  const raysHead = el('div', 'nv-row-head', root);
  el('span', 'nv-micro', raysHead).textContent = 'Ray readings';
  el('span', 'nv-micro nv-dim', raysHead).textContent = '1 = clear';
  const rays = el('div', 'nv-rays', root);
  const rayFill: HTMLElement[] = [];
  const rayVal: HTMLElement[] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const col = el('div', 'nv-ray', rays);
    const bar = el('div', 'nv-ray-bar', col);
    rayFill.push(el('div', 'nv-ray-fill', bar));
    const glyph = el('span', 'nv-ray-glyph', col);
    glyph.style.transform = `rotate(${RAY_ANGLES[i]}rad)`;
    rayVal.push(el('span', 'nv-val', col));
  }

  // Last rendered quantised values, so the DOM is only touched on change.
  let lastIndex = -1;
  let lastAlive = -1;
  let lastSpeed = -1;
  const lastRay = new Int16Array(RAY_COUNT).fill(-1);
  let openRaf = 0;
  // Unhide first, then add the class a frame later so the fade-in actually transitions.
  const open = () => {
    openRaf = 0;
    if (!root.hidden) root.classList.add('nv-open');
  };

  return {
    update(d) {
      if (root.hidden) {
        root.hidden = false;
        if (!openRaf) openRaf = requestAnimationFrame(open);
      }
      if (d.index !== lastIndex) {
        lastIndex = d.index;
        num.textContent = String(d.index);
      }
      const alive = d.alive ? 1 : 0;
      if (alive !== lastAlive) {
        lastAlive = alive;
        statusText.textContent = d.alive ? 'Driving' : 'Crashed';
        dot.classList.toggle('nv-dead', !d.alive);
        root.classList.toggle('nv-crashed', !d.alive);
      }
      const s = q(d.speed);
      if (s !== lastSpeed) {
        lastSpeed = s;
        speedVal.textContent = PCT[s];
        speedFill.style.transform = SCALE_X[s];
      }
      for (let i = 0; i < RAY_COUNT; i++) {
        const v = q(d.rays[i]);
        if (v === lastRay[i]) continue;
        lastRay[i] = v;
        rayFill[i].style.transform = SCALE[v];
        rayVal[i].textContent = TWO[v];
      }
      view.update(d.genome, d.activations);
    },
    hide() {
      if (openRaf) cancelAnimationFrame(openRaf);
      openRaf = 0;
      root.classList.remove('nv-open');
      root.hidden = true;
      lastIndex = -1;
    },
    destroy() {
      if (openRaf) cancelAnimationFrame(openRaf);
      view.destroy();
      root.remove();
    },
  };
}
