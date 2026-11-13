import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PRESETS } from './presets';
import { frameLength, type FromWorker, type ToWorker } from './protocol';
import { createSimulation } from './sim';
import type { GenerationStats } from './types';

const track = PRESETS[0].track;
const population = 60, seed = 7;
let posted: FromWorker[];
let scope: { onmessage: ((e: { data: ToWorker }) => void) | null; postMessage: (m: FromWorker) => void };
const send = (data: ToWorker) => scope.onmessage!({ data });
const reset = (warmup?: number, epoch = 1) => send({ type: 'reset', epoch, track, population, seed, warmup });
const frame = () => {
  send({ type: 'frame', buf: new Float32Array(frameLength(population)) });
  const m = posted[posted.length - 1];
  if (m.type !== 'frame') throw new Error('missing frame response');
  return m;
};
const generations = () => posted.filter((m) => m.type === 'gen');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  let now = 0;
  // Advance the slice clock independently of simulation speed so each timer
  // yields after at most 12 steps; the simulation itself remains real.
  vi.spyOn(performance, 'now').mockImplementation(() => now++);
  posted = [];
  scope = { onmessage: null, postMessage: (m) => posted.push(structuredClone(m)) };
  vi.stubGlobal('self', scope);
  await import('./worker');
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('default init starts at generation 1 and waits for frame requests', () => {
  reset();
  expect(vi.getTimerCount()).toBe(0);
  const s = frame();
  expect(s.generation).toBe(1);
  expect(s.time).toBeCloseTo(1 / 60);
});

test('warmup yields, posts every genuine generation, and stops exactly at the requested count', () => {
  reset(3);
  expect(generations()).toHaveLength(0);
  const initial = frame();
  expect(initial.time).toBe(0); // frames do not advance the headless warmup
  vi.advanceTimersToNextTimer();
  expect(vi.getTimerCount()).toBe(1);
  const partial = frame();
  expect(partial.generation).toBe(1);
  expect(partial.time).toBeGreaterThan(0);
  expect(partial.time).toBeLessThan(1);
  vi.runAllTimers();
  const results = generations();
  expect(results.map((m) => m.stats.generation)).toEqual([1, 2, 3]);
  expect(results.every((m) => m.epoch === 1)).toBe(true);
  const direct = createSimulation(track, { population, seed });
  const expected: GenerationStats[] = [];
  while (expected.length < 3) { const s = direct.step(); if (s) expected.push(s); }
  expect(results.map((m) => m.stats)).toEqual(expected);
  send({ type: 'speed', speed: 0 });
  const done = frame();
  expect(done.generation).toBe(4);
  expect(done.time).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test('pause stops warmup and resume continues it', () => {
  reset(2);
  vi.advanceTimersToNextTimer();
  send({ type: 'speed', speed: 0 });
  const paused = frame();
  vi.runAllTimers();
  expect(frame().time).toBe(paused.time);
  expect(generations()).toHaveLength(0);
  send({ type: 'speed', speed: 4 });
  vi.runAllTimers();
  expect(generations()).toHaveLength(2);
  expect(frame().generation).toBe(3);
});

test('fractional warmup counts are rounded down', () => {
  reset(1.9);
  vi.runAllTimers();
  expect(generations().map((m) => m.stats.generation)).toEqual([1]);
  expect(frame().generation).toBe(2);
});

test('reset cancels outstanding warmup and starts the new epoch at generation 1', () => {
  reset(20);
  vi.advanceTimersToNextTimer();
  reset(undefined, 2);
  vi.runAllTimers();
  expect(generations()).toHaveLength(0);
  const s = frame();
  expect(s.epoch).toBe(2);
  expect(s.generation).toBe(1);
  expect(s.time).toBeCloseTo(1 / 60);
  expect(vi.getTimerCount()).toBe(0);
});

test('Max keeps running after warmup and a queued slice still accepts pause', () => {
  reset(1);
  send({ type: 'speed', speed: 'max' });
  while (generations().length === 0) vi.advanceTimersToNextTimer();
  expect(vi.getTimerCount()).toBe(1);
  send({ type: 'speed', speed: 0 });
  const paused = frame();
  vi.runAllTimers();
  expect(frame().time).toBe(paused.time);
  expect(vi.getTimerCount()).toBe(0);
});

test.each([0, -1, Infinity, NaN])('invalid or empty warmup %s does not start background work', (warmup) => {
  reset(warmup);
  expect(vi.getTimerCount()).toBe(0);
  expect(frame().generation).toBe(1);
});
