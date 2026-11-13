import type { Track } from '../sim/types';

/** World -> CSS pixel transform: screen = world * s + (ox, oy). */
export interface View {
  s: number;
  ox: number;
  oy: number;
}

export function fitView(view: View, t: Track, w: number, h: number, pad: number): void {
  const tw = t.maxX - t.minX;
  const th = t.maxY - t.minY;
  const s = Math.min((w - 2 * pad) / tw, (h - 2 * pad) / th);
  view.s = Math.max(s, 0.01);
  view.ox = (w - tw * view.s) / 2 - t.minX * view.s;
  view.oy = (h - th * view.s) / 2 - t.minY * view.s;
}

export const toWorldX = (v: View, px: number) => (px - v.ox) / v.s;
export const toWorldY = (v: View, py: number) => (py - v.oy) / v.s;
