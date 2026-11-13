// What a car sees: one car rolls along the circuit; the reader drags sideways to move it across the track.
import { RAY_ANGLES, RAY_COUNT, RAY_RANGE, CAR_LENGTH, CAR_WIDTH } from '../sim/types';
import { PRESETS } from '../sim/presets';
import { createRaycaster } from '../sim/rays';
import { capture, createSurface, getTokens, runWhileVisible, el, drawTrack, touchCanvas, type View } from './canvas';
import { createBars } from './bars';

export function mountSees(fig: HTMLElement): void {
  const track = PRESETS[0].track;
  const cast = createRaycaster(track);
  const rays = new Float32Array(RAY_COUNT);

  const canvas = el('canvas', 'xs-canvas xs-canvas--sees');
  canvas.setAttribute('aria-label', 'A car on the track with seven sensor rays. Drag up or down to move it across the track.');
  touchCanvas(canvas);
  const bars = createBars(RAY_ANGLES.map((_, i) => String(i + 1)), 'Ray readings, left to right. 1 means nothing within range.');
  const hint = el('p', 'xs-hint', 'Drag up or down to move the car across the track.');
  fig.append(canvas, bars.root, hint);

  const s = createSurface(canvas);
  const tk = getTokens();
  const view: View = { scale: 1, ox: 0, oy: 0 };

  let dist = track.length * 0.1; // arc length along the centreline
  let seg = 0;
  let lateral = 0; // -1..1 of the usable half width, positive = right of travel
  let target = 0;
  let yaw = 0;
  let held = false;
  let idle = 0;
  let camX = track.startX;
  let camY = track.startY;
  let camA = 0;
  let first = true;

  let downY = 0;
  let downLat = 0;
  canvas.addEventListener('pointerdown', (e) => {
    capture(canvas, e.pointerId);
    held = true;
    downY = e.clientY;
    downLat = target;
    hint.classList.add('is-used');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!held) return;
    target = Math.max(-1.25, Math.min(1.25, downLat + (e.clientY - downY) / (s.h * 0.3)));
  });
  const up = () => {
    held = false;
    idle = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  runWhileVisible(canvas, (dt) => {
    const { ctx, w, h } = s;
    if (!w) return;
    // Pose on the centreline.
    dist = (dist + dt * (held ? 70 : 110)) % track.length;
    while (track.cum[seg + 1] < dist || track.cum[seg] > dist) seg = (seg + 1) % track.n;
    const j = (seg + 1) % track.n;
    const f = (dist - track.cum[seg]) / Math.max(1e-6, track.cum[seg + 1] - track.cum[seg]);
    const px = track.cx[seg] + (track.cx[j] - track.cx[seg]) * f;
    const py = track.cy[seg] + (track.cy[j] - track.cy[seg]) * f;
    const tang = Math.atan2(track.cy[j] - track.cy[seg], track.cx[j] - track.cx[seg]);
    // Unattended, the car weaves gently so the rays keep changing.
    if (!held) {
      idle += dt;
      if (idle > 2.5) target = 0.75 * Math.sin(dist / 140);
    }
    const prev = lateral;
    lateral += (target - lateral) * Math.min(1, dt * 6);
    const half = track.halfWidth - CAR_WIDTH;
    yaw += (Math.atan2((lateral - prev) * half, Math.max(0.5, dt * 110)) - yaw) * Math.min(1, dt * 8);
    const x = px - Math.sin(tang) * lateral * half;
    const y = py + Math.cos(tang) * lateral * half;
    const angle = tang + yaw;
    cast(x, y, angle, rays);
    bars.set(rays);

    // The camera rides the centreline and turns with it, so the car always heads right and its
    // sideways position reads directly. Sized so the forward ray range just fits ahead of the car.
    if (first) {
      camX = px;
      camY = py;
      camA = tang;
      first = false;
    }
    const k = Math.min(1, dt * 4);
    camX += (px - camX) * k;
    camY += (py - camY) * k;
    camA += Math.atan2(Math.sin(tang - camA), Math.cos(tang - camA)) * Math.min(1, dt * 2.5);
    const scale = Math.min((w * 0.78) / RAY_RANGE, (h * 0.42) / (track.halfWidth + 10));
    view.scale = scale;
    view.ox = -camX * scale;
    view.oy = -camY * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.28, h / 2);
    ctx.rotate(-camA);
    drawTrack(ctx, track, view, tk);
    const sx = view.ox + x * scale;
    const sy = view.oy + y * scale;
    // Rays: hairline to the hit, a dot where they land.
    ctx.lineWidth = 1.25;
    for (let i = 0; i < RAY_COUNT; i++) {
      const a = angle + RAY_ANGLES[i];
      const d = rays[i] * RAY_RANGE * scale;
      const hx = sx + Math.cos(a) * d;
      const hy = sy + Math.sin(a) * d;
      ctx.strokeStyle = tk.ink2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (rays[i] < 1) {
        ctx.fillStyle = tk.ink;
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = tk.ink3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.25;
      }
    }
    // Car body.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.fillStyle = tk.accent;
    const L = CAR_LENGTH * scale;
    const W = CAR_WIDTH * scale;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.35);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  });
}
