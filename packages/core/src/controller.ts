import type { Grid } from "./grid";
import { FULL_WIDTH, type GridItem, type ItemId, type Prediction, uid, widthInCells } from "./model";
import { Renderer, type DragGhost, type RenderState } from "./renderer";
import { lightTheme, type Theme } from "./theme";
import { Viewport } from "./viewport";

export interface ControllerEvents {
  select?: (item: GridItem | null) => void;
  gear?: (item: GridItem) => void;
  change?: () => void;
  view?: (zoom: number) => void;
}

export interface Stats {
  fps: number;
  frameMs: number;
  /** Items drawn in the last frame. */
  drawn: number;
}

type Mode =
  | { kind: "idle" }
  | { kind: "pending"; id: ItemId; x: number; y: number; dx: number; dy: number }
  | { kind: "drag"; ghost: DragGhost; external: boolean }
  | { kind: "resize"; id: ItemId; anchor: "left" | "right" }
  | { kind: "pan"; x: number; y: number; moved: boolean };

/** Resize events closer than this are treated as one continuous resize. */
const RESIZE_SETTLE_MS = 120;
const DRAG_THRESHOLD = 4;
const ANCHOR_ZONE = 8;
const EDGE_ZONE = 48;
const EDGE_SPEED = 14;

/**
 * Wires pointer, wheel and keyboard input to the grid and drives the
 * renderer. One instance per canvas element.
 */
export class GridController {
  readonly viewport: Viewport;
  readonly renderer: Renderer;
  private state: RenderState = { selected: null, hovered: null, prediction: null, ghost: null, resizing: null };
  private mode: Mode = { kind: "idle" };
  private dirty = true;
  private raf = 0;
  private continuous = false;
  private disposed = false;
  private frames = 0;
  private frameClock = performance.now();
  private lastFrameMs = 0;
  readonly stats: Stats = { fps: 0, frameMs: 0, drawn: 0 };
  private unsubscribe: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private pointerInside = false;
  private lastPointer = { x: 0, y: 0 };
  /** Last rendered frame kept while the element is being resized continuously. */
  private frozen: { image: HTMLCanvasElement; width: number; height: number } | null = null;
  private settleTimer = 0;
  private lastFit = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly grid: Grid,
    private events: ControllerEvents = {},
    theme: Theme = lightTheme
  ) {
    this.viewport = new Viewport(grid.columns, grid.rowHeight);
    this.renderer = new Renderer(canvas, grid, this.viewport, theme);
    canvas.tabIndex = 0;
    canvas.style.touchAction = "none";
    canvas.style.outline = "none";
    canvas.style.display = "block";
    // The element is sized by CSS (fill its container); only the backing store follows.
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.unsubscribe = grid.subscribe(() => {
      this.invalidate();
      this.events.change?.();
    });
    this.bind();
    this.fit();
    this.loop();
  }

  // ------------------------------------------------------------ public API

  get theme(): Theme {
    return this.renderer.theme;
  }

  setTheme(theme: Theme): void {
    this.renderer.theme = theme;
    this.invalidate();
  }

  get selected(): GridItem | null {
    return this.state.selected ? (this.grid.get(this.state.selected) ?? null) : null;
  }

  select(id: ItemId | null): void {
    if (this.state.selected === id) return;
    this.state.selected = id;
    this.invalidate();
    this.events.select?.(this.selected);
  }

  /**
   * Re-measure the canvas element and redraw.
   *
   * A one-off size change (a panel opening, a window snapped) is rendered
   * synchronously, so no blank frame is ever painted. While the size keeps
   * changing (the window being dragged), the last crisp frame is frozen and
   * drawn scaled to the new size instead of re-laying out the sheet on every
   * event; a crisp render follows once the size has settled.
   */
  fit(): void {
    const rect = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const vp = this.viewport;
    if (w === vp.width && h === vp.height && dpr === this.renderer.dpr) return;

    const now = performance.now();
    const continuous = now - this.lastFit < RESIZE_SETTLE_MS && vp.width > 1 && vp.height > 1;
    this.lastFit = now;

    if (continuous && !this.frozen) this.frozen = { image: this.renderer.snapshot(), width: vp.width, height: vp.height };

    this.renderer.resize(w, h, dpr);
    vp.panBy(0, 0);

    if (this.frozen) {
      this.renderer.drawFrozen(this.frozen.image, this.frozen.width, this.frozen.height);
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => {
        this.frozen = null;
        this.invalidate();
      }, RESIZE_SETTLE_MS);
    } else {
      this.renderOnce();
    }
  }

  /** Observe the element's size; call `dispose` to stop. */
  observe(): void {
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
  }

  zoomBy(factor: number): void {
    this.viewport.zoomAt(factor, this.viewport.width / 2, this.viewport.height / 2);
    this.afterView();
  }

  setZoom(z: number): void {
    this.viewport.setZoom(z);
    this.afterView();
  }

  resetView(): void {
    this.viewport.reset();
    this.viewport.panBy(0, 0);
    this.afterView();
  }

  /** Scroll so that row `y` is near the top. */
  scrollToRow(y: number): void {
    this.viewport.panY = -y * this.viewport.cellHeight;
    this.viewport.panBy(0, 0);
    this.afterView();
  }

  /** Render every frame (for benchmarks and smooth pan) instead of on change. */
  setContinuous(on: boolean): void {
    this.continuous = on;
    if (on) this.invalidate();
  }

  /**
   * Start dragging a new item that is not in the grid yet, e.g. from a palette.
   * Call from a pointerdown handler of the source element.
   */
  beginExternalDrag(template: Omit<GridItem, "id" | "x" | "y"> & { id?: ItemId }, e: PointerEvent): void {
    const item: GridItem = { ...template, id: template.id ?? uid(), x: 0, y: 0 };
    const p = this.toCanvas(e);
    const z = this.viewport.zoom;
    const w = widthInCells(item.w, this.grid.columns) * this.viewport.cellWidth;
    this.mode = { kind: "drag", external: true, ghost: { item, px: p.x, py: p.y, dx: Math.min(w / 2, 60 * z), dy: this.viewport.cellHeight / 2 } };
    this.state.ghost = this.mode.ghost;
    this.updateDragPrediction();
    const move = (ev: PointerEvent) => this.onPointerMove(ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.onPointerUp(ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.settleTimer);
    this.unsubscribe();
    this.resizeObserver?.disconnect();
    this.unbind();
  }

  // ------------------------------------------------------------- rendering

  invalidate(): void {
    this.dirty = true;
  }

  /** Render one frame synchronously and return how long it took (ms). Used by the benchmark. */
  renderOnce(): number {
    const t0 = performance.now();
    this.renderer.render(this.state);
    this.stats.drawn = this.renderer.lastDrawn.length;
    this.dirty = false;
    return performance.now() - t0;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.mode.kind === "drag") this.autoPan();
    // While a resize is in flight the scaled snapshot stays on screen.
    if (this.frozen) return;
    if (this.dirty || this.continuous) {
      const t0 = performance.now();
      this.renderer.render(this.state);
      this.lastFrameMs = performance.now() - t0;
      this.stats.drawn = this.renderer.lastDrawn.length;
      this.dirty = false;
      this.frames++;
    }
    if (now - this.frameClock >= 500) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.frameClock));
      this.stats.frameMs = Math.round(this.lastFrameMs * 100) / 100;
      this.frames = 0;
      this.frameClock = now;
    }
  };

  private afterView(): void {
    this.invalidate();
    this.events.view?.(this.viewport.zoom);
  }

  // ---------------------------------------------------------------- input

  private bind(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerUp);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("keydown", this.onKeyDown);
    c.addEventListener("dblclick", this.onDoubleClick);
  }

  private unbind(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("keydown", this.onKeyDown);
    c.removeEventListener("dblclick", this.onDoubleClick);
  }

  private toCanvas(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Item under a canvas point, using the rectangles from the last frame. */
  hit(x: number, y: number): { item: GridItem; rect: { x: number; y: number; w: number; h: number } } | null {
    const drawn = this.renderer.lastDrawn;
    for (let i = drawn.length - 1; i >= 0; i--) {
      const d = drawn[i];
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return { item: d.item, rect: d };
    }
    return null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    this.canvas.focus({ preventScroll: true });
    const p = this.toCanvas(e);
    this.canvas.setPointerCapture(e.pointerId);

    if (e.button === 1) {
      this.mode = { kind: "pan", x: p.x, y: p.y, moved: false };
      return;
    }

    const h = this.hit(p.x, p.y);
    if (!h) {
      this.mode = { kind: "pan", x: p.x, y: p.y, moved: false };
      return;
    }
    const { item, rect } = h;

    if (this.state.selected === item.id) {
      const g = this.renderer.gearRect(item);
      if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h) {
        this.mode = { kind: "idle" };
        this.events.gear?.(item);
        return;
      }
    }

    const zone = ANCHOR_ZONE * this.viewport.zoom;
    if (item.w !== FULL_WIDTH && p.x - rect.x <= zone) {
      this.mode = { kind: "resize", id: item.id, anchor: "left" };
      this.state.resizing = item.id;
    } else if (item.w !== FULL_WIDTH && rect.x + rect.w - p.x <= zone) {
      this.mode = { kind: "resize", id: item.id, anchor: "right" };
      this.state.resizing = item.id;
    } else {
      this.mode = { kind: "pending", id: item.id, x: p.x, y: p.y, dx: p.x - rect.x, dy: p.y - rect.y };
    }
    this.select(item.id);
    this.invalidate();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.toCanvas(e);
    this.lastPointer = p;
    this.pointerInside = p.x >= 0 && p.y >= 0 && p.x <= this.viewport.width && p.y <= this.viewport.height;
    const m = this.mode;

    switch (m.kind) {
      case "idle": {
        const h = this.hit(p.x, p.y);
        const id = h?.item.id ?? null;
        if (id !== this.state.hovered) {
          this.state.hovered = id;
          this.invalidate();
        }
        this.canvas.style.cursor = this.cursorFor(p, h);
        return;
      }
      case "pending": {
        if (Math.hypot(p.x - m.x, p.y - m.y) < DRAG_THRESHOLD) return;
        const item = this.grid.get(m.id);
        if (!item) {
          this.mode = { kind: "idle" };
          return;
        }
        this.mode = { kind: "drag", external: false, ghost: { item, px: p.x, py: p.y, dx: m.dx, dy: m.dy } };
        this.state.ghost = this.mode.ghost;
        this.canvas.style.cursor = "grabbing";
        this.updateDragPrediction();
        return;
      }
      case "drag": {
        m.ghost.px = p.x;
        m.ghost.py = p.y;
        this.updateDragPrediction();
        return;
      }
      case "resize": {
        const cell = Math.floor(this.viewport.pxToCol(p.x));
        this.state.prediction = this.grid.predictResize(m.id, m.anchor, cell);
        this.invalidate();
        return;
      }
      case "pan": {
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        if (!m.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        m.moved = true;
        this.viewport.panBy(dx, dy);
        m.x = p.x;
        m.y = p.y;
        this.canvas.style.cursor = "grabbing";
        this.afterView();
        return;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const m = this.mode;
    this.mode = { kind: "idle" };
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.canvas.style.cursor = "default";

    switch (m.kind) {
      case "drag": {
        const pred = this.state.prediction;
        const over = this.pointerInside;
        if (pred && pred.valid && over) {
          this.grid.commit(pred, m.ghost.item);
          this.select(m.ghost.item.id);
        } else if (!m.external && !over) {
          // Dropped outside: the item goes back to where it was. Nothing to do.
        }
        break;
      }
      case "resize": {
        const pred = this.state.prediction;
        if (pred && pred.valid) this.grid.setPlacement(m.id, { x: pred.x, w: pred.w });
        break;
      }
      case "pan": {
        if (!m.moved) this.select(null);
        break;
      }
      case "pending":
        break;
    }
    this.state.prediction = null;
    this.state.ghost = null;
    this.state.resizing = null;
    this.invalidate();
  };

  private onPointerLeave = (): void => {
    if (this.mode.kind === "idle" && this.state.hovered) {
      this.state.hovered = null;
      this.invalidate();
    }
    this.pointerInside = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.toCanvas(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0015);
      this.viewport.zoomAt(factor, p.x, p.y);
    } else if (e.shiftKey) {
      this.viewport.panBy(-e.deltaY, 0);
    } else {
      this.viewport.panBy(-e.deltaX, -e.deltaY);
    }
    this.afterView();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const p = this.toCanvas(e);
    if (!this.hit(p.x, p.y)) {
      this.viewport.zoomAt(this.viewport.zoom < 1 ? 1 / this.viewport.zoom : 1.5, p.x, p.y);
      this.afterView();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const sel = this.selected;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.grid.redo();
      else this.grid.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.grid.redo();
      return;
    }
    if (e.key === "Escape") {
      if (this.mode.kind === "drag" || this.mode.kind === "resize") {
        this.mode = { kind: "idle" };
        this.state.ghost = null;
        this.state.prediction = null;
        this.state.resizing = null;
        this.invalidate();
      } else this.select(null);
      return;
    }
    if (e.key === "+" || e.key === "=") return this.zoomBy(1.2);
    if (e.key === "-" || e.key === "_") return this.zoomBy(1 / 1.2);
    if (e.key === "0") return this.resetView();
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.grid.remove(sel.id);
      this.select(null);
      return;
    }
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = step[e.key];
    if (d) {
      e.preventDefault();
      const pred = this.grid.predict(sel.x + d[0], sel.y + d[1], sel.w, sel.id);
      if (pred.valid) this.grid.commit(pred, sel);
    }
  };

  private cursorFor(p: { x: number; y: number }, h: ReturnType<GridController["hit"]>): string {
    if (!h) return "grab";
    const zone = ANCHOR_ZONE * this.viewport.zoom;
    if (h.item.w !== FULL_WIDTH && (p.x - h.rect.x <= zone || h.rect.x + h.rect.w - p.x <= zone)) return "ew-resize";
    if (this.state.selected === h.item.id) {
      const g = this.renderer.gearRect(h.item);
      if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h) return "pointer";
    }
    return "grab";
  }

  // ------------------------------------------------------------------ drag

  private updateDragPrediction(): void {
    if (this.mode.kind !== "drag") return;
    const g = this.mode.ghost;
    const vp = this.viewport;
    const left = g.px - g.dx;
    const top = g.py - g.dy;
    const col = Math.round(vp.pxToCol(left));
    const row = Math.floor(vp.pxToRow(top + vp.cellHeight / 2));
    const except = this.mode.external ? undefined : g.item.id;
    const pred: Prediction = this.pointerInside
      ? this.grid.predict(col, row, g.item.w, except)
      : { x: col, y: row, w: widthInCells(g.item.w, vp.columns), valid: false, shifts: [] };
    this.state.prediction = pred;
    this.invalidate();
  }

  /** Pan when dragging close to the top/bottom edge so the sheet keeps growing. */
  private autoPan(): void {
    if (this.mode.kind !== "drag") return;
    const vp = this.viewport;
    const y = this.mode.ghost.py;
    let dy = 0;
    if (y > vp.height - EDGE_ZONE && y <= vp.height + EDGE_ZONE) dy = -EDGE_SPEED;
    else if (y < EDGE_ZONE && y >= -EDGE_ZONE) dy = EDGE_SPEED;
    if (dy) {
      vp.panBy(0, dy);
      this.updateDragPrediction();
      this.events.view?.(vp.zoom);
    }
  }
}
