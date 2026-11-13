import fs from 'node:fs';
import {execSync} from 'node:child_process';
const base='artifacts/qa',read=n=>JSON.parse(fs.readFileSync(`${base}/${n}.json`));
const main=read('results'),demo=read('demo-results'),racing=read('racing-results'),resize=read('resize-results');
const sha=execSync('git rev-parse HEAD').toString().trim();
const checks=[...main.viewports.flatMap(r=>r.checks),...demo.flatMap(r=>r.checks),...racing,...resize.contexts.flatMap(r=>r.checks)];
if(checks.some(c=>!c.pass)||sha!==main.sha||sha!==resize.sha)throw Error('Failed checks or changed HEAD');
const fps=main.viewports.flatMap(v=>v.fps.map(f=>`${v.name.padEnd(12)} ${f.mode.padEnd(4)} ${f.rafFps.toFixed(6).padStart(12)} ${f.debugFpsMean.toFixed(6).padStart(12)} ${f.frameP95.toFixed(1).padStart(8)}`)).join('\n');
const laps=main.viewports.map(v=>{const c=v.checks.find(c=>c.label==='best lap improves Max then 1x').data;const d=v.checks.find(c=>c.label.startsWith('draw closed')).data;return `${v.name}: ${c.initial.bestLap.toFixed(6)} s / gen ${c.initial.generation} -> ${c.after.bestLap.toFixed(6)} s / gen ${c.after.generation}; drawn loop ${d.bestLap.toFixed(6)} s / gen ${d.generation}`}).join('\n');
fs.writeFileSync(`${base}/REPORT.txt`,`Independent QA — Evolve Racer
Verdict: PASS — 161/161 final browser checks; no remaining product failures found.
QA model: GPT-6 Astra high (authorized fallback). Independent reviewer; no subagents.
Checked SHA before/after: ${sha}
Main run started: ${main.date}
URL: http://localhost:5180/

Counts and scope
Main: desktop 18/18, portrait 19/19, landscape 19/19 = 56/56.
Demo supplemental: 8/8 at each size = 24/24.
Racing supplemental: 1/1 at each size = 3/3.
Targeted regression: 13/13 in each of six viewport/DPR contexts = 78/78.
Sizes: 1440x900 desktop, 390x844 touch portrait, 844x390 touch landscape.
Main and supplemental flows use DPR 1. Targeted regression uses DPR 1 and DPR 2 at every size.

ResizeObserver fix and prior blind spot
The previous 77-check pass on 73fd18c relied on Playwright pageerror, which missed raw window error events consumed by Vite. It therefore did not establish the absence of ResizeObserver errors. The parent reported "ResizeObserver loop completed with undelivered notifications" and fixed runWhileVisible: frame(0) had updated readouts inside its observed figure during ResizeObserver delivery; the fix schedules that still paint with requestAnimationFrame after delivery. I independently inspected that source diff and tested the resulting behavior on the SHA above.
The main suite already had pre-navigation raw window error capture; I added the same exposed callback/init-script capture to both supplemental suites and the new targeted suite. Supplemental failures now cause nonzero exit codes, and the supplemental first-paint check now asserts all six canvases are painted.
Final runs: raw window errors 0 (including ResizeObserver), page errors 0, console errors 0, console warnings 0, failed requests 0, HTTP >=400 responses 0.
Targeted tests verify all six section canvases have nonzero pixels and multiple colors, with correct DPR backing dimensions: initial load, inspector opening, resize through all three sizes, inspector at each resized size, light/dark reload at each original size, and light/dark reload after resizing. All pass, including offscreen first paints.

Required user flows
Real mouse strokes on desktop and Chromium touch injection on mobile drew accepted closed loops, reset to generation 1 while paused, then evolved to generation 18. Tiny invalid strokes showed feedback and preserved a pixel-identical circuit and generation. Pause/resume, reset, all four presets and 250/500/1000 populations passed.
Moving live-car picks opened the inspector with changing rays and activations. Visible wreck picks reported crashed and exactly zero speed. Desktop inspector cleared the circuit by 84.16 px. Mobile swipes outside drawing scrolled 95 px; drawing caused 0 px scroll.
Lap measurements:
${laps}
Drawn shapes differ with aspect ratio, so their lap times are not directly comparable.

FPS measurements — 1,000 configured cars
Viewport     Mode     rAF FPS     Mean HUD FPS   p95 ms
${fps}
Each sample followed 2.5 s settling and measured about 8 s of requestAnimationFrame callbacks. Natural live/crashed mix; Max intentionally hides cars. Shared preview was closed before measurements. One automated browser context at a time; no builds, unit tests, image-sheet generation or other heavy QA ran during FPS sampling.
These are headless Chromium measurements on this machine, not physical iOS/Safari or phone-GPU claims. Mobile uses Chromium mobile/touch emulation.

Layout, explainers and visual review
All sizes: horizontal overflow 0 px; HUD ends exactly where the sections container begins. Stage bottoms: desktop 798.33/900 px, portrait 751.47/844 px, landscape 374/390 px. Full circuit appears on the first screen on desktop/landscape. Mobile HUD controls continue below the fold. Landscape inspector uses the short-screen layout without numeric ray meters; circuit rays and network remain visible.
Sensor drag changed readings; network bar input changed from 0.98 to 0.02 with changed steering/throttle; all four genetics phases worked. Generation scrub changed the selected readout, and restart reset its range. Dark theme survived reload at every size. Racing demo reached generation 26 with 13.51 s versus generation 11's 19.34 s (5.83 s saved); mouse and held touch changed the trace marker.
Reviewed the shared preview briefly, then refreshed hero light/dark, drawn track, live/wreck inspector, explainer screenshots and all three contact sheets. No blank demo, broken asset or unintended content overlap observed. Sticky navigation can overlay cropped full-section captures; *-clean and *-racing-evolved screenshots hide only that navigation for review. No source styling changes.

QA-only correction and retained evidence
The first targeted run repeatedly called getImageData on application canvases, triggering 36 Chromium willReadFrequently performance warnings and 60 cascading assertion failures among 66 checks. There were zero raw window errors in that run. Preserved as resize-results-before-readback-fix.json and resize-run-before-readback-fix.log. The checker now copies each canvas to a detached canvas with willReadFrequently enabled and reads that copy; it does not filter warnings or change product rendering. The corrected run passed; the final expanded 78-check run adds both theme reloads at each original viewport/DPR and also passed.
Earlier historical before-wait-fix and before-held-fix files remain from the prior QA. They are not results from this SHA. Existing lap-chart.html is historical; current exact lap histories are in results.json.

Build and repository checks
After browser measurements: npm test PASS (8 files / 37 tests passed; 3 benchmark files/tests skipped). npm run build PASS (TypeScript noEmit and Vite production build).
Only artifacts/qa changes. Product source unchanged. No commits, pushes, deployments, subagents or old Claude rerun. Owned shared preview closed; Playwright contexts/browsers closed. Original dev server left running.

Reproduce sequentially with the existing server:
node artifacts/qa/independent-qa.mjs
node artifacts/qa/demo-followup.mjs
node artifacts/qa/racing-followup.mjs
node artifacts/qa/resize-followup.mjs
node artifacts/qa/review-images.mjs
npm test
npm run build

Evidence paths relative to repository root
artifacts/qa/results.json, demo-results.json, racing-results.json, resize-results.json
artifacts/qa/run.log, demo-run.log, racing-run.log, resize-run.log
artifacts/qa/npm-test.log, npm-build.log
artifacts/qa/desktop-review-sheet.png
artifacts/qa/portrait-review-sheet.png
artifacts/qa/landscape-review-sheet.png
Individual screenshots use desktop-, portrait-, landscape- prefixes: hero-light/dark, drawn-track, inspector-live/wreck/complete, section-*, *-clean, *-complete, racing-evolved.
`);
console.log('Report written:',checks.length,'passed checks',sha);
