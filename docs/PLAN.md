# Evolve Racer: build plan

Shared brief for everyone building v1. Read all of it before writing code.

## Product

A static, browser-only site (no backend, Cloudflare Pages). An interactive explainer for neuroevolution: a genetic algorithm evolving tiny neural nets that learn racing lines. It reads like an Apple product page or a Ciechanowski / distill.pub article: few words, many live demos, generous whitespace, beautiful type, smooth motion. Light by default, dark mode optional. It must not look vibe-coded: no gradient blobs, no emoji, no card soup, no drop-shadow stacks, no pill badges everywhere.

1. **Hero.** A sim is already running on a default track when the page loads: hundreds of cars (target 1000 at 60fps) evolving, the best line glowing.
2. **Draw your own circuit.** Freehand-draw a closed loop with mouse or touch; it is auto-smoothed into a track with sensible width and a start/finish line. Reset/clear, plus a few presets.
3. **Evolution live.** Each car has ray sensors feeding a small net; outputs steer and throttle. Crashed cars stop and fade. Each generation keeps the fittest (progress along the track, then lap time), then crossover and mutate. Show generation counter, best lap, a fitness-over-generations sparkline, and play/pause/speed (1x, 4x, fast-forward headless).
4. **Inspect a car.** Click or tap a car: its sensor rays are drawn live and its network is visualised with weights and activations lighting up.
5. **Explainer sections below**, each with its own small live demo: what a sensor sees, what the network does, selection/crossover/mutation shown visually, why the racing line emerges. One or two sentences per beat.

## Stack and rules

- Vite + TypeScript, no framework. Canvas2D. Plain DOM and CSS. No new runtime dependencies without a very good reason.
- `src/sim/types.ts` is the contract. Build against those exact names. Additive changes only, and say so in your final report.
- `src/styles/tokens.css` holds every colour, font and spacing token. No hard-coded colours or font stacks anywhere else. Canvas code reads tokens with `getComputedStyle(document.documentElement).getPropertyValue('--accent')` and re-reads on theme change (a `themechange` event is dispatched on `window`; also listen to the `prefers-color-scheme` media query).
- Typed arrays, no per-frame allocation in sim or render hot paths. Deterministic seeded RNG only (`Math.random` is banned in `src/sim`).
- Simple code, small files, no premature abstractions, no classes where a closure does. Comments only where the why is not obvious.
- Canvases: `devicePixelRatio` capped at 2, resize with `ResizeObserver`, pause all work when off-screen (`IntersectionObserver`) or when the tab is hidden.
- Touch: any canvas that takes pointer input sets `touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent`. Use Pointer Events with `setPointerCapture`.
- Respect `prefers-reduced-motion` for decorative motion (the sims themselves still run).
- Must work at 1440x900, 390x844 and 844x390 with no horizontal scroll and no overlapping UI.

## Ownership (touch only your own paths)

| Builder | Owns | Delivers |
| --- | --- | --- |
| A, sim | `src/sim/**` | core, worker client, presets, tests |
| B, hero | `index.html`, `src/main.ts`, `src/styles/**` (except token values), `src/hero/**` | page shell, hero stage, draw tool, HUD, controls, inspector wiring |
| C, sections | `src/sections/**` | the explainer sections and their demos |
| D, netviz | `src/netviz/**` | network visualiser and inspector panel |

Four builders share this one checkout at the same time. Never run `git add -A`, `git add .`, `git stash`, `git reset`, `git checkout` on files, or anything that touches paths you do not own. Commit only your own paths: `git add <your paths> && git commit -m "..." -- <your paths>` (retry if `index.lock` is busy). Do not push. A type error or failing test outside your paths is not yours to fix: note it in your report. Use your own dev server port (A 5171, B 5172, C 5173, D 5174) and kill it when done.

## Module APIs

### A: `src/sim`

All of these are imported by other builders, so the names and signatures are fixed.

- `rng.ts`: `createRng(seed: number): () => number` (mulberry32, uniform [0,1)), `gaussian(rng): number`.
- `track.ts`: `buildTrack(points: ArrayLike<number>): Track | null`. Input is a freehand closed stroke as x,y pairs in any units. Closes the loop, resamples evenly, smooths (Chaikin or similar) until the minimum radius of curvature exceeds about 1.3 x half-width so the inner wall never folds over itself, normalises so the longer bbox side is `TRACK_EXTENT`, picks the start on the longest straight. Returns null when the stroke is too short, too small, or self-intersecting. Direction of travel follows the drawing direction.
- `presets.ts`: `PRESETS: { id: string; name: string; track: Track }[]`, at least four hand-tuned circuits with character (a flowing GP-style default with a hairpin and a chicane, an oval, a tight technical one, a fast sweeping one). Built lazily or at import, your call.
- `rays.ts`: `createRaycaster(track: Track): (x: number, y: number, angle: number, out: Float32Array) => void` filling `RAY_COUNT` normalised readings. Uses a uniform grid over wall segments so cost does not grow with track size.
- `nn.ts`: `forward(genome: Float32Array, offset: number, inputs: Float32Array, activations: Float32Array): void` (writes all `NEURON_COUNT` activations; inputs are copied into the first slots), `randomGenome(rng, out: Float32Array, offset: number): void`.
- `ga.ts`: `crossover(a: Float32Array, aOff: number, b: Float32Array, bOff: number, out: Float32Array, outOff: number, rng): void` (uniform per-neuron or per-gene), `mutate(genome: Float32Array, offset: number, rng, rate: number, sigma: number): void`, `tournament(fitness: Float32Array, count: number, k: number, rng): number`.
- `sim.ts`: `createSimulation(track: Track, opts: SimOptions): Simulation`.
- `client.ts` + `worker.ts`: `createSimClient(opts: { track: Track; population: number; seed: number }): SimClient`. Worker created with `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`. `tick()` posts a frame request; the worker steps 1 or 4 times and answers with a snapshot whose buffers are transferred and recycled (ping-pong, no steady-state allocation). In `'max'` mode the worker free-runs in roughly 12ms slices between messages and still answers each tick with a snapshot. Generation stats are posted as they happen.

Physics (keep it this simple; it is what makes a racing line emerge):

- State per car: x, y, angle, speed. Throttle output accelerates or brakes; mild drag; a top speed.
- Steering output sets a desired yaw rate. Actual yaw rate is clamped to `grip / speed`, so a car going too fast for a corner understeers into the outside wall. Wide entry, late apex and early throttle must therefore be measurably faster than hugging the centreline.
- A car crashes when its centre leaves the track minus roughly half a car width. It also dies if it makes no forward progress for about 2 sim seconds or drives backwards.
- Progress is tracked by walking the nearest centreline sample forward/back from the previous one (no global search), accumulating signed arc length.

Evolution:

- A generation ends when every car is dead, or once the leader has finished one lap from the standing start and the rest have had about 15% longer, or at a hard time cap.
- Fitness in laps: fraction of the lap covered; for finishers `1 + reference / lapTime` style bonus so faster laps always rank higher.
- Next generation: a few elites copied unchanged (the champion is always car 0), the rest by tournament selection + crossover + gaussian mutation. Tune so a 1000-car population reliably finishes a lap on every preset within about 15 generations and keeps shaving lap time afterwards. Verify that with a headless script or test, not by hope.
- `bestLine` in `GenerationStats` is the recorded path of the best car so far (x, y, speed triples, sampled every few steps).

Tests (Vitest, next to the code): physics step invariants, ray casting against known geometry, NN forward pass against a hand-computed case, GA operators, track building (closed, no self-intersecting walls, null on garbage), determinism (same seed gives identical stats), and one integration test that evolution improves on a preset.

Performance budget: one `step()` for 1000 cars under 1.5ms on a laptop. Measure it.

### B: `src/hero`, page shell

- `index.html` + `src/main.ts` + `src/styles/base.css`: reset, typography, layout, theme toggle (sets `data-theme` on `<html>`, persists to `localStorage`, dispatches `themechange`). Slim nav (wordmark left; theme toggle and a GitHub link to https://github.com/KrrishKapoor/evolve-racer right), hero, `<main id="sections">` that `main.ts` fills by calling `mountSections(el)` from `src/sections`, a quiet footer.
- Hero: one confident headline, one sentence, then the stage. Suggested copy: "Nobody taught these cars to drive." / "A thousand tiny neural networks, one circuit, and evolution. Draw your own track and watch a racing line appear." Improve it if you can; keep it that short.
- Stage: a large rounded canvas (about 16:10 on desktop, taller on phones, never taller than the viewport minus the nav). Static track rendered once to an offscreen layer; cars batched into a few paths per frame (not 1000 `save/rotate/restore` calls); crashed cars fade using `fade`; the leader is accent coloured; the best line is drawn as a glowing accent stroke whose brightness follows speed. A crisp start/finish line.
- HUD, set in tabular numerals: Generation, Best lap, Alive, and a fitness-over-generations sparkline (best progress until the first finished lap, then lap time; your call on how to make that transition honest and legible). Controls: play/pause, 1x, 4x, Max. In Max the cars are hidden and the best line and numbers update as generations fly by. A population control (250 / 500 / 1000) if it fits cleanly.
- Draw mode: a "Draw a track" button turns the stage into a drawing surface with a one-line hint. The stroke renders live; on release it calls `buildTrack`; on success the new circuit animates in and evolution restarts; on null, a short inline message and the old track stays. Preset names sit beside it as plain text buttons. Convert pointer positions through the inverse view transform.
- Inspect: click or tap picks the nearest car within a generous radius (do the nearest search on the latest snapshot in the main thread), calls `client.inspect`, draws that car's rays live on the stage (ray lines to hit points, the car ringed), and shows the inspector panel from `src/netviz` (`createInspector(container)`, then `inspector.update(detail)` each frame and `inspector.hide()`): docked on the right of the stage on desktop, a bottom sheet under the stage on phones. Clicking empty track or pressing Escape clears it. If the inspected car dies, keep showing it until the generation ends, then follow the new car 0 (the champion).
- An FPS readout is exposed as `window.__evolve = { fps, generation, bestLap, alive, population }` (updated each frame) for QA scripts. Not shown in the UI.

### C: `src/sections`

`index.ts` exports `mountSections(root: HTMLElement): void` and imports its own `sections.css`. It builds four sections, each a short title, one or two sentences, and a live canvas demo the reader can touch:

1. **What a car sees.** One car on a short piece of track that the reader drags or steers; seven rays update live, with the seven readings shown as a small bar strip.
2. **What the network does.** Rays in, steer and throttle out. Reuse `createNetView` from `src/netviz` fed by a car driving a small loop; let the reader scrub or perturb an input and see the outputs move.
3. **Selection, crossover, mutation.** Genomes shown as strips of coloured cells (accent positive, cool negative). Show a small population ranked by fitness, two parents combining into a child cell by cell, then a few cells jittering. Steppable or gently auto-playing.
4. **Why the racing line emerges.** Same corner, two lines: centreline versus the evolved line, with speed traces and a running time delta; or an early generation's best line against a late one on the same track. Make the grip limit visible.

Demos run small sims with `createSimulation` on the main thread (50 to 150 cars), only while on screen. Layout: alternate nothing, keep it one calm column: text at `--measure`, demo at up to `--page` wide. Until A's modules land, build against the signatures above; they are fixed.

### D: `src/netviz`

- `createNetView(canvas: HTMLCanvasElement): { update(genome: Float32Array, activations: Float32Array): void; destroy(): void }`. Draws `NET_LAYERS` left to right: input labels (7 ray glyphs showing each ray's direction, plus speed), edges whose width follows |weight| and whose colour is accent for positive and cool for negative, with opacity driven by the live signal `weight * sourceActivation` so the active pathways light up; neurons as circles filled by activation; outputs rendered as a steering indicator and a throttle/brake bar. It should feel alive and precise, like a good LLM visualiser, at about 320x240 CSS px and still legible at 280 wide. No per-frame allocation; edges batched by quantised style.
- `createInspector(container: HTMLElement): { update(detail: CarDetail): void; hide(): void; destroy(): void }`. A compact panel: car number, alive/crashed, speed, the net view, and the 7 ray readings. Owns its CSS (`netviz.css`, tokens only). The container is positioned by B; the panel fills it.
- Ship a tiny standalone dev page (`src/netviz/dev.html`) that drives the view with synthetic data so you can verify it in a browser before A and B land.

## Design direction

- Type does the work: Inter Variable, display sizes tight (`letter-spacing: -0.03em`, weight 600 to 650), body 400 in `--ink-2`, uppercase micro labels in `--ink-3` with `0.08em` tracking. Numbers always `font-variant-numeric: tabular-nums`.
- Colour is almost monochrome. `--accent` is reserved for "the best" and positive signal; `--cool` only for negative weights and slow speed. Nothing else gets colour.
- Surfaces are flat. Hairlines (`--hairline`) instead of shadows. Controls are text or simple icon buttons with a clear pressed/active state, at least 44px touch targets on phones.
- Motion: `--ease`, `--dur`. Things fade and slide a few pixels; nothing bounces.
- Whitespace between sections is `--section-gap`. When in doubt, remove an element.
