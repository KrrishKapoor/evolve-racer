// Canvas colours, read from CSS tokens and refreshed whenever the theme changes.
export interface Palette {
  stage: string;
  asphalt: string;
  wall: string;
  car: string;
  ink: string;
  ink2: string;
  ink3: string;
  hairline: string;
  accent: string;
  accentSoft: string;
  cool: string;
}

export const palette: Palette = {
  stage: '', asphalt: '', wall: '', car: '', ink: '', ink2: '', ink3: '', hairline: '', accent: '', accentSoft: '', cool: '',
};

export function readPalette(): void {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  palette.stage = v('--stage');
  palette.asphalt = v('--asphalt');
  palette.wall = v('--wall');
  palette.car = v('--car');
  palette.ink = v('--ink');
  palette.ink2 = v('--ink-2');
  palette.ink3 = v('--ink-3');
  palette.hairline = v('--hairline');
  palette.accent = v('--accent');
  palette.accentSoft = v('--accent-soft');
  palette.cool = v('--cool');
}

/** Calls cb now-ish and on every theme change (manual toggle or system preference). */
export function onTheme(cb: () => void): void {
  window.addEventListener('themechange', cb);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb);
}
