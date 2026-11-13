// A strip of labelled vertical bars with tabular readouts. Optionally draggable to set values.
import { el, capture } from './canvas';

export interface Bars {
  root: HTMLElement;
  set(values: ArrayLike<number>): void;
  /** Index being dragged by the reader, or -1. */
  readonly dragging: number;
}

export function createBars(labels: string[], caption: string, onDrag?: (i: number, v: number) => void): Bars {
  const root = el('div', 'xs-bars');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', caption);
  const fills: HTMLElement[] = [];
  const nums: HTMLElement[] = [];
  const cols: HTMLElement[] = [];
  for (const l of labels) {
    const col = el('div', 'xs-bar');
    const track = el('div', 'xs-bar-track');
    const fill = el('div', 'xs-bar-fill');
    track.append(fill);
    const num = el('span', 'xs-bar-num', '1.00');
    col.append(num, track, el('span', 'xs-bar-label', l));
    root.append(col);
    fills.push(fill);
    nums.push(num);
    cols.push(col);
  }
  const last = new Float32Array(labels.length).fill(-1);
  const bars: Bars = {
    root,
    dragging: -1,
    set(values) {
      for (let i = 0; i < labels.length; i++) {
        const v = Math.max(0, Math.min(1, values[i]));
        if (Math.abs(v - last[i]) < 0.004) continue;
        last[i] = v;
        fills[i].style.transform = `scaleY(${v})`;
        nums[i].textContent = v.toFixed(2);
      }
    },
  };
  if (onDrag) {
    root.classList.add('is-draggable', 'xs-touch');
    const valueAt = (i: number, clientY: number) => {
      const r = cols[i].querySelector('.xs-bar-track')!.getBoundingClientRect();
      return Math.max(0, Math.min(1, (r.bottom - clientY) / r.height));
    };
    root.addEventListener('pointerdown', (e) => {
      const col = (e.target as HTMLElement).closest('.xs-bar');
      const i = cols.indexOf(col as HTMLElement);
      if (i < 0) return;
      capture(root, e.pointerId);
      (bars as { dragging: number }).dragging = i;
      cols[i].classList.add('is-active');
      onDrag(i, valueAt(i, e.clientY));
    });
    root.addEventListener('pointermove', (e) => {
      const i = bars.dragging;
      if (i >= 0) onDrag(i, valueAt(i, e.clientY));
    });
    const end = () => {
      const i = bars.dragging;
      if (i < 0) return;
      cols[i].classList.remove('is-active');
      (bars as { dragging: number }).dragging = -1;
      onDrag(-1, 0);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }
  return bars;
}
