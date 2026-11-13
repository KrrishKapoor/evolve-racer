# Evolve Racer

Draw a track. Watch cars learn to drive it.

A browser-only interactive article about neuroevolution. Seven wall sensors and speed feed a tiny neural network; selection, crossover and mutation evolve its steering and throttle. There is no backend, training service or saved user data.

## Run locally

Use Node.js 22.12+ (or a newer supported release).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build:

```sh
npm run build
npm run preview
```

The generated `dist/` folder is static and suitable for Cloudflare Pages: build command `npm run build`, output directory `dist`. Nothing is deployed automatically by this repository.

## Explore

- Watch up to 1,000 cars evolve on four preset circuits, or draw a simple closed loop with a mouse or touch.
- Use **1×**, **4×**, or **Max** to accelerate evolution. Max hides the cars while the worker trains as quickly as possible.
- Click a car or a faded wreck to inspect its sensor readings, weights and neuron activations. Close the panel with its close button, Escape, or empty track.
- **Reset** restarts learning on the current circuit. Choosing a preset also restarts learning.
- Scroll through four interactive demos: sensors, the network, genetic operators, and the emerging racing line.
- Light is the default; the theme button remembers a dark-mode preference locally.

## Implementation

Vite, TypeScript and Canvas2D, with no UI framework. The hero simulation runs in a Web Worker using transferable frame buffers and typed arrays. Physics uses a fixed timestep and grip-limited steering; fitness rewards forward progress and then faster completed laps. The seeded random generator makes runs reproducible for the same track, population and seed. The hero uses seed 7.

Each genome contains 140 weights and biases in an 8 → 8 → 6 → 2 network with tanh activations. Genomes start randomly; no driving policy or racing line is supplied. The best line is a replay of an evolved driver. Initial warmup runs real generations in the worker; resets and newly drawn tracks start from generation 1.

The hero pauses when off screen or the tab is hidden. Section demos animate only while visible and paint a still frame before first use. Decorative transitions respect reduced motion; the simulations remain interactive.

## Checks

```sh
npm test
npm run build
BENCH=1 SEED=7 GENS=18 POP=1000 npx vitest run src/sim/dev/bench.test.ts
```

Unit and integration tests cover track geometry, ray casting, physics, network inference, genetic operators, deterministic evolution and lap improvement. The [independent QA report](artifacts/qa/REPORT.txt) records 161 browser checks at 1440×900, 390×844 and 844×390, including resize and first-paint regression checks at DPR 1 and 2, with screenshots and reproducible Playwright scripts under `artifacts/qa/`. QA used fresh GPT-6 Astra high delegates after Claude rejected the requested Opus run for its API rate limit.

## Prototype limits

- Track drawing accepts simple loops; crossed, very tight or degenerate circuits are rejected. Learning speed varies with track shape and random seed.
- Physics is intentionally simplified: cars do not collide with each other, and laps start from rest. This is an explainer, not a vehicle dynamics model.
- The genetics demo uses illustrative fitness scores while applying the real crossover and mutation operators.
- Frame rate depends on hardware and browser. Mobile viewport checks are emulation, not a guarantee for every physical phone.
- Custom tracks and evolved populations are not persisted across reloads.
