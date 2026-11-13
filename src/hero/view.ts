import type { Track } from '../sim/types';

/**
 * World -> CSS pixel transform. Unrotated: screen = world * s + (ox, oy).
 * On tall stages (portrait phones) the circuit is turned 90 degrees so it fills the space:
 * screen = (-y * s + ox, x * s + oy).
 */
export interface View {
  s: number;
  ox: number;
  oy: number;
  rot: boolean;
}

export function fitView(view: View, t: Track, w: number, h: number, pad: number): void {
  const tw = t.maxX - t.minX;
  const th = t.maxY - t.minY;
  view.rot = h > w * 1.1 && tw > th;
  const [vw, vh] = view.rot ? [th, tw] : [tw, th];
  const s = Math.max(Math.min((w - 2 * pad) / vw, (h - 2 * pad) / vh), 0.01);
  const mx = (t.minX + t.maxX) / 2, my = (t.minY + t.maxY) / 2;
  view.s = s;
  if (view.rot) {
    view.ox = w / 2 + my * s;
    view.oy = h / 2 - mx * s;
  } else {
    view.ox = w / 2 - mx * s;
    view.oy = h / 2 - my * s;
  }
}

export function applyView(g: CanvasRenderingContext2D, v: View, dpr: number): void {
  const k = dpr * v.s;
  if (v.rot) g.setTransform(0, k, -k, 0, dpr * v.ox, dpr * v.oy);
  else g.setTransform(k, 0, 0, k, dpr * v.ox, dpr * v.oy);
}

export function toWorld(v: View, px: number, py: number, out: [number, number]): [number, number] {
  if (v.rot) {
    out[0] = (py - v.oy) / v.s;
    out[1] = -(px - v.ox) / v.s;
  } else {
    out[0] = (px - v.ox) / v.s;
    out[1] = (py - v.oy) / v.s;
  }
  return out;
}
