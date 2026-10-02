// Reproducible benchmark for the demo app.
//
//   npm run build && npm run bench            # unthrottled + 10x CPU throttling
//   npm run bench -- --throttle 4             # custom throttling rate
//   npm run bench -- --url http://localhost:5173
//
// Drives the built demo in headless Chromium through Playwright, slows the
// CPU with the DevTools protocol (Emulation.setCPUThrottlingRate) and records
// frame times straight from the controller. Results are written to
// bench/results/latest.md and latest.json.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const throttle = Number(opt("throttle", 10));
const sizes = String(opt("sizes", "1000,10000,50000"))
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);
const frames = Number(opt("frames", 200));
let url = opt("url", null);
const viewport = { width: 1440, height: 900 };

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "–");

// ------------------------------------------------------------- preview server

let server = null;
if (!url) {
  const { preview } = await import("vite");
  server = await preview({
    root: path.join(root, "apps", "demo"),
    logLevel: "silent",
    preview: { port: 4179, strictPort: true, host: "127.0.0.1" }
  });
  url = server.resolvedUrls.local[0];
}

// ----------------------------------------------------------------- scenarios

const browser = await chromium.launch();
const results = [];

async function session(rate) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__infinityGrid));
  return page;
}

/** Measure `frames` synchronous renders at the current viewport. */
const measureFrames = (page, n) =>
  page.evaluate((n) => {
    const c = window.__infinityGrid.controller;
    const samples = [];
    for (let i = 0; i < n; i++) samples.push(c.renderOnce());
    return { samples, drawn: c.stats.drawn, zoom: c.viewport.zoom };
  }, n);

/** Drag the first visible item across the sheet and sample rAF frame rate. */
async function measureDrag(page, moves = 120) {
  const box = await page.locator("main canvas").boundingBox();
  const start = await page.evaluate(() => {
    const c = window.__infinityGrid.controller;
    c.renderOnce();
    const d = c.renderer.lastDrawn[0];
    return d ? { x: d.x + d.w / 2, y: d.y + d.h / 2 } : null;
  });
  if (!start) throw new Error("nothing to drag");
  await page.evaluate(() => {
    window.__bench = { frames: 0, t0: performance.now(), stop: false };
    const tick = () => {
      if (window.__bench.stop) return;
      window.__bench.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    const t = i / moves;
    await page.mouse.move(box.x + start.x + Math.sin(t * Math.PI * 2) * 260, box.y + start.y + t * 420);
  }
  await page.mouse.up();
  const r = await page.evaluate(() => {
    window.__bench.stop = true;
    const ms = performance.now() - window.__bench.t0;
    return { fps: (window.__bench.frames * 1000) / ms, ms };
  });
  await page.keyboard.press("Control+z");
  return r;
}

for (const rate of [1, throttle].filter((r, i, a) => r > 0 && a.indexOf(r) === i)) {
  const label = rate === 1 ? "no throttling" : `${rate}x CPU throttling`;
  console.log(`\n== ${label} ==`);
  const page = await session(rate);

  for (const n of sizes) {
    await page.evaluate(() => window.__infinityGrid.clear());
    const add = await page.evaluate((n) => {
      const t0 = performance.now();
      window.__infinityGrid.addMany(n);
      return performance.now() - t0;
    }, n);
    const undo = await page.evaluate(() => {
      const g = window.__infinityGrid.grid;
      const t0 = performance.now();
      g.undo();
      const u = performance.now() - t0;
      const t1 = performance.now();
      g.redo();
      return { undo: u, redo: performance.now() - t1 };
    });
    const total = await page.evaluate(() => window.__infinityGrid.grid.size);
    const rows = await page.evaluate(() => window.__infinityGrid.grid.rowCount());

    const row = { rate, label, fields: total, rows, addMs: add, undoMs: undo.undo, redoMs: undo.redo, frames: {} };
    for (const zoom of [1, 0.4, 0.2]) {
      await page.evaluate((z) => {
        const c = window.__infinityGrid.controller;
        c.zoomBy(z / c.viewport.zoom);
        c.scrollToRow(Math.max(0, Math.floor(window.__infinityGrid.grid.rowCount() / 2)));
      }, zoom);
      const f = await measureFrames(page, frames);
      row.frames[zoom] = { drawn: f.drawn, p50: pct(f.samples, 0.5), p95: pct(f.samples, 0.95), max: Math.max(...f.samples) };
    }
    await page.evaluate(() => {
      const c = window.__infinityGrid.controller;
      c.zoomBy(1 / c.viewport.zoom);
      c.scrollToRow(0);
    });
    row.drag = await measureDrag(page);
    results.push(row);
    console.log(
      `${String(total).padStart(6)} fields | add ${fmt(add, 0)} ms | undo ${fmt(undo.undo, 0)} ms | ` +
        `frame@100% p50 ${fmt(row.frames[1].p50)} / p95 ${fmt(row.frames[1].p95)} ms (${row.frames[1].drawn} drawn) | ` +
        `@20% p50 ${fmt(row.frames[0.2].p50)} ms (${row.frames[0.2].drawn} drawn) | drag ${fmt(row.drag.fps, 0)} fps`
    );
  }
  await page.close();
}

await browser.close();
await server?.close();

// -------------------------------------------------------------------- report

const chromeVersion = chromium.name() + " " + (await (async () => { const b = await chromium.launch(); const v = b.version(); await b.close(); return v; })());
const lines = [];
lines.push(`# Benchmark results`, ``, `Headless ${chromeVersion}, viewport ${viewport.width}×${viewport.height}, ${frames} frames per sample, ${new Date().toISOString().slice(0, 10)}.`, ``);
for (const rate of [...new Set(results.map((r) => r.rate))]) {
  const rows = results.filter((r) => r.rate === rate);
  lines.push(`## ${rows[0].label}`, ``);
  lines.push(`| fields | rows | add | undo | redo | frame @100% (drawn) | frame @40% (drawn) | frame @20% (drawn) | drag |`);
  lines.push(`|---:|---:|---:|---:|---:|---|---|---|---:|`);
  for (const r of rows) {
    const f = (z) => `${fmt(r.frames[z].p50, 1)} / ${fmt(r.frames[z].p95, 1)} ms (${r.frames[z].drawn})`;
    lines.push(
      `| ${r.fields.toLocaleString("en-US")} | ${r.rows.toLocaleString("en-US")} | ${fmt(r.addMs, 0)} ms | ${fmt(r.undoMs, 0)} ms | ${fmt(r.redoMs, 0)} ms | ${f(1)} | ${f(0.4)} | ${f(0.2)} | ${fmt(r.drag.fps, 0)} fps |`
    );
  }
  lines.push(``);
}
lines.push(`Frame columns are p50 / p95 of a synchronous render at that zoom; "drawn" is how many items intersected the viewport. "drag" is the requestAnimationFrame rate while an item is dragged across the sheet with placement prediction running on every pointer move.`, ``);

await mkdir(path.join(here, "results"), { recursive: true });
await writeFile(path.join(here, "results", "latest.md"), lines.join("\n"));
await writeFile(path.join(here, "results", "latest.json"), JSON.stringify(results, null, 2));
console.log(`\nwritten bench/results/latest.md`);
