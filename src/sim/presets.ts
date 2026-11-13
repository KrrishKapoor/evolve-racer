import { buildTrack } from './track';
import type { Track } from './types';

function polar(f: (t: number) => number, count = 120): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const r = f(t);
    out.push(Math.cos(t) * r, Math.sin(t) * r);
  }
  return out;
}

function stadium(straight: number, radius: number): number[] {
  const out: number[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) out.push(-straight / 2 + (straight * i) / steps, radius);
  for (let i = 1; i < steps; i++) {
    const a = Math.PI / 2 - (Math.PI * i) / steps;
    out.push(straight / 2 + Math.cos(a) * radius, Math.sin(a) * radius);
  }
  for (let i = 0; i <= steps; i++) out.push(straight / 2 - (straight * i) / steps, -radius);
  for (let i = 1; i < steps; i++) {
    const a = -Math.PI / 2 - (Math.PI * i) / steps;
    out.push(-straight / 2 + Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return out;
}

// Hand-laid control polygons, roughly 0..100. buildTrack rounds the corners.
const GP = [
  10, 80, 30, 82, 50, 83, 60, 82, 64, 78, 68, 82, 74, 84, 86, 80, 93, 70, 92, 58,
  84, 52, 72, 50, 66, 44, 70, 36, 82, 30, 90, 22, 88, 12, 78, 9, 68, 14, 60, 26,
  50, 32, 38, 30, 28, 20, 18, 14, 9, 20, 6, 34, 8, 50, 8, 66,
];
const TECHNICAL = [
  10, 85, 40, 88, 52, 80, 50, 68, 60, 60, 74, 66, 80, 80, 92, 82, 96, 68, 90, 54,
  78, 46, 86, 34, 94, 22, 86, 10, 72, 12, 64, 24, 54, 30, 46, 20, 34, 10, 20, 12,
  22, 26, 32, 36, 30, 48, 16, 50, 6, 60, 6, 74,
];

const SPECS: { id: string; name: string; points: () => number[] }[] = [
  { id: 'meridian', name: 'Meridian', points: () => GP },
  { id: 'oval', name: 'Oval', points: () => stadium(560, 220) },
  { id: 'citadel', name: 'Citadel', points: () => TECHNICAL },
  { id: 'coastline', name: 'Coastline', points: () => polar((t) => 1 + 0.22 * Math.sin(3 * t) + 0.12 * Math.cos(2 * t + 0.6)) },
];

export const PRESETS: { id: string; name: string; track: Track }[] = SPECS.map((s) => {
  const track = buildTrack(s.points());
  if (!track) throw new Error(`preset ${s.id} failed to build`);
  return { id: s.id, name: s.name, track };
});
