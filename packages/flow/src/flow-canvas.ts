import { nodeSize, type FlowEdge, type FlowGraph, type FlowNode, type NodeKind } from "./model";

export interface FlowTheme {
  background: string;
  dot: string;
  edge: string;
  edgeSelected: string;
  labelBg: string;
  labelText: string;
  labelBorder: string;
  text: string;
  subtext: string;
  selected: string;
  shadow: string;
  font: string;
  nodes: Record<NodeKind, { fill: string; stroke: string; accent: string; text?: string }>;
}

export const flowLight: FlowTheme = {
  background: "#f9fafb",
  dot: "#d0d5dd",
  edge: "#98a2b3",
  edgeSelected: "#444ce7",
  labelBg: "#ffffff",
  labelText: "#475467",
  labelBorder: "#d0d5dd",
  text: "#101828",
  subtext: "#667085",
  selected: "#444ce7",
  shadow: "rgba(16, 24, 40, 0.12)",
  font: '"Roboto", "Segoe UI", Helvetica, Arial, sans-serif',
  nodes: {
    start: { fill: "#ecfdf3", stroke: "#12b76a", accent: "#12b76a", text: "#054f31" },
    end: { fill: "#fef3f2", stroke: "#f04438", accent: "#f04438", text: "#7a271a" },
    action: { fill: "#ffffff", stroke: "#d0d5dd", accent: "#6172f3" },
    condition: { fill: "#fffaeb", stroke: "#f79009", accent: "#f79009", text: "#7a2e0e" },
    data: { fill: "#f8f9fc", stroke: "#b3b8db", accent: "#4e5ba6" },
    notify: { fill: "#eef4ff", stroke: "#a4bcfd", accent: "#444ce7" }
  }
};

export const flowDark: FlowTheme = {
  background: "#101828",
  dot: "#344054",
  edge: "#667085",
  edgeSelected: "#8098f9",
  labelBg: "#1d2939",
  labelText: "#d0d5dd",
  labelBorder: "#475467",
  text: "#f2f4f7",
  subtext: "#98a2b3",
  selected: "#8098f9",
  shadow: "rgba(0,0,0,0.4)",
  font: '"Roboto", "Segoe UI", Helvetica, Arial, sans-serif',
  nodes: {
    start: { fill: "#05603a", stroke: "#32d583", accent: "#32d583", text: "#ecfdf3" },
    end: { fill: "#7a271a", stroke: "#f97066", accent: "#f97066", text: "#fef3f2" },
    action: { fill: "#1d2939", stroke: "#475467", accent: "#8098f9" },
    condition: { fill: "#4e2a0b", stroke: "#fdb022", accent: "#fdb022", text: "#fef0c7" },
    data: { fill: "#293056", stroke: "#717bbc", accent: "#b3b8db" },
    notify: { fill: "#1f2550", stroke: "#6172f3", accent: "#a4bcfd" }
  }
};

type Mode = { kind: "idle" } | { kind: "pan"; x: number; y: number; moved: boolean } | { kind: "drag"; id: string; dx: number; dy: number; moved: boolean };

/** Self-contained flowchart canvas: rendering, pan/zoom, node dragging. */
export class FlowCanvas {
  graph: FlowGraph = { nodes: [], edges: [] };
  theme: FlowTheme;
  zoom = 1;
  panX = 0;
  panY = 0;
  selected: string | null = null;
  hovered: string | null = null;
  onChange?: () => void;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private mode: Mode = { kind: "idle" };
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private ro: ResizeObserver | null = null;

  constructor(readonly canvas: HTMLCanvasElement, theme: FlowTheme = flowLight) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context is not available");
    this.ctx = ctx;
    this.theme = theme;
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.bind();
    this.fit();
    this.loop();
  }

  setGraph(g: FlowGraph): void {
    this.graph = g;
    this.selected = null;
    this.fitToContent();
  }

  setTheme(t: FlowTheme): void {
    this.theme = t;
    this.invalidate();
  }

  observe(): void {
    if (this.ro) return;
    this.ro = new ResizeObserver(() => {
      this.fit();
    });
    this.ro.observe(this.canvas.parentElement ?? this.canvas);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.unbind();
  }

  fit(): void {
    const r = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // Setting the size clears the bitmap; draw now so no blank frame is painted.
    this.dirty = false;
    this.render();
  }

  /** Zoom and pan so the whole graph is visible with some margin. */
  fitToContent(): void {
    const b = this.bounds();
    if (!b) return;
    const margin = 60;
    const zx = (this.width - margin * 2) / b.w;
    const zy = (this.height - margin * 2) / b.h;
    this.zoom = Math.min(1.2, Math.max(0.2, Math.min(zx, zy)));
    this.panX = this.width / 2 - (b.x + b.w / 2) * this.zoom;
    this.panY = this.height / 2 - (b.y + b.h / 2) * this.zoom;
    this.invalidate();
    this.onChange?.();
  }

  zoomBy(factor: number, px = this.width / 2, py = this.height / 2): void {
    const next = Math.min(3, Math.max(0.2, this.zoom * factor));
    const k = next / this.zoom;
    this.panX = px - (px - this.panX) * k;
    this.panY = py - (py - this.panY) * k;
    this.zoom = next;
    this.invalidate();
    this.onChange?.();
  }

  invalidate(): void {
    this.dirty = true;
  }

  // -------------------------------------------------------------- geometry

  private bounds(): { x: number; y: number; w: number; h: number } | null {
    const ns = this.graph.nodes;
    if (!ns.length) return null;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of ns) {
      const s = nodeSize(n.kind);
      x0 = Math.min(x0, n.x - s.w / 2);
      y0 = Math.min(y0, n.y - s.h / 2);
      x1 = Math.max(x1, n.x + s.w / 2);
      y1 = Math.max(y1, n.y + s.h / 2);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.panX) / this.zoom, y: (py - this.panY) / this.zoom };
  }

  private nodeAt(wx: number, wy: number): FlowNode | null {
    const ns = this.graph.nodes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      const s = nodeSize(n.kind);
      if (Math.abs(wx - n.x) <= s.w / 2 && Math.abs(wy - n.y) <= s.h / 2) return n;
    }
    return null;
  }

  // ------------------------------------------------------------- rendering

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    this.render();
  };

  private render(): void {
    const { ctx, theme: t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawDots();

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);
    const byId = new Map(this.graph.nodes.map((n) => [n.id, n]));
    for (const e of this.graph.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (a && b) this.drawEdge(e, a, b);
    }
    for (const n of this.graph.nodes) this.drawNode(n);
    ctx.restore();
  }

  private drawDots(): void {
    const { ctx, theme: t } = this;
    const step = 24 * this.zoom;
    if (step < 7) return;
    const ox = ((this.panX % step) + step) % step;
    const oy = ((this.panY % step) + step) % step;
    ctx.fillStyle = t.dot;
    const r = Math.max(0.8, 1.1 * this.zoom);
    ctx.beginPath();
    for (let x = ox; x < this.width; x += step) {
      for (let y = oy; y < this.height; y += step) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  private drawEdge(e: FlowEdge, a: FlowNode, b: FlowNode): void {
    const { ctx, theme: t } = this;
    const sa = nodeSize(a.kind);
    const sb = nodeSize(b.kind);
    const x0 = a.x;
    const y0 = a.y + sa.h / 2;
    const x1 = b.x;
    const y1 = b.y - sb.h / 2;
    const selected = this.selected === a.id || this.selected === b.id;
    const r = 12;
    const midY = y0 + Math.max(24, (y1 - y0) / 2);

    ctx.strokeStyle = selected ? t.edgeSelected : t.edge;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    if (Math.abs(x1 - x0) < 1) {
      ctx.lineTo(x1, y1);
    } else {
      const dir = Math.sign(x1 - x0);
      ctx.lineTo(x0, midY - r);
      ctx.quadraticCurveTo(x0, midY, x0 + dir * r, midY);
      ctx.lineTo(x1 - dir * r, midY);
      ctx.quadraticCurveTo(x1, midY, x1, midY + r);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();

    // Arrow head.
    ctx.fillStyle = selected ? t.edgeSelected : t.edge;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 5, y1 - 9);
    ctx.lineTo(x1 + 5, y1 - 9);
    ctx.closePath();
    ctx.fill();

    // Source dot.
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fill();

    if (e.label) {
      const lx = Math.abs(x1 - x0) < 1 ? x0 : (x0 + x1) / 2;
      const ly = Math.abs(x1 - x0) < 1 ? (y0 + y1) / 2 : midY;
      ctx.font = `500 11px ${t.font}`;
      const w = ctx.measureText(e.label).width + 16;
      const h = 20;
      ctx.fillStyle = t.labelBg;
      ctx.strokeStyle = selected ? t.edgeSelected : t.labelBorder;
      ctx.lineWidth = 1;
      rr(ctx, lx - w / 2, ly - h / 2, w, h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.labelText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.label, lx, ly + 0.5);
    }
  }

  private drawNode(n: FlowNode): void {
    const { ctx, theme: t } = this;
    const s = nodeSize(n.kind);
    const c = t.nodes[n.kind];
    const x = n.x - s.w / 2;
    const y = n.y - s.h / 2;
    const selected = this.selected === n.id;
    const hovered = this.hovered === n.id;

    ctx.save();
    if (selected || hovered) {
      ctx.shadowColor = t.shadow;
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
    }
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = selected ? t.selected : c.stroke;
    ctx.lineWidth = selected ? 2 : 1.25;
    switch (n.kind) {
      case "condition":
        ctx.beginPath();
        ctx.moveTo(n.x, y);
        ctx.lineTo(x + s.w, n.y);
        ctx.lineTo(n.x, y + s.h);
        ctx.lineTo(x, n.y);
        ctx.closePath();
        break;
      case "start":
      case "end":
        rr(ctx, x, y, s.w, s.h, s.h / 2);
        break;
      case "data":
        ctx.beginPath();
        ctx.moveTo(x + 14, y);
        ctx.lineTo(x + s.w, y);
        ctx.lineTo(x + s.w - 14, y + s.h);
        ctx.lineTo(x, y + s.h);
        ctx.closePath();
        break;
      default:
        rr(ctx, x, y, s.w, s.h, 10);
    }
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();

    // Accent bar for action/notify nodes.
    if (n.kind === "action" || n.kind === "notify") {
      ctx.fillStyle = c.accent;
      rr(ctx, x + 1, y + 10, 4, s.h - 20, 2);
      ctx.fill();
    }

    ctx.fillStyle = c.text ?? t.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (n.kind === "condition") {
      ctx.font = `500 12px ${t.font}`;
      ctx.fillText(n.title, n.x, n.y + 0.5);
    } else if (n.kind === "start" || n.kind === "end") {
      ctx.font = `500 13px ${t.font}`;
      ctx.fillText(n.title, n.x, n.y + (n.subtitle ? -6 : 0.5));
      if (n.subtitle) {
        ctx.font = `400 10px ${t.font}`;
        ctx.fillStyle = c.text ?? t.subtext;
        ctx.fillText(n.subtitle, n.x, n.y + 9);
      }
    } else {
      ctx.textAlign = "left";
      ctx.font = `500 13px ${t.font}`;
      ctx.fillText(n.title, x + 18, n.y - (n.subtitle ? 8 : 0) + 0.5);
      if (n.subtitle) {
        ctx.font = `400 11px ${t.font}`;
        ctx.fillStyle = t.subtext;
        ctx.fillText(n.subtitle, x + 18, n.y + 10);
      }
      // Port dots.
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(n.x, y, 3.5, 0, Math.PI * 2);
      ctx.arc(n.x, y + s.h, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ----------------------------------------------------------------- input

  private bind(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("keydown", this.onKey);
  }

  private unbind(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("keydown", this.onKey);
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    const w = this.toWorld(p.x, p.y);
    const n = e.button === 0 ? this.nodeAt(w.x, w.y) : null;
    if (n) {
      this.mode = { kind: "drag", id: n.id, dx: w.x - n.x, dy: w.y - n.y, moved: false };
      this.selected = n.id;
      this.canvas.style.cursor = "grabbing";
    } else {
      this.mode = { kind: "pan", x: p.x, y: p.y, moved: false };
      this.canvas.style.cursor = "grabbing";
    }
    this.invalidate();
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    const m = this.mode;
    if (m.kind === "idle") {
      const w = this.toWorld(p.x, p.y);
      const n = this.nodeAt(w.x, w.y);
      const id = n?.id ?? null;
      if (id !== this.hovered) {
        this.hovered = id;
        this.invalidate();
      }
      this.canvas.style.cursor = n ? "grab" : "default";
      return;
    }
    if (m.kind === "pan") {
      this.panX += p.x - m.x;
      this.panY += p.y - m.y;
      m.x = p.x;
      m.y = p.y;
      m.moved = true;
      this.invalidate();
      return;
    }
    if (m.kind === "drag") {
      const w = this.toWorld(p.x, p.y);
      const n = this.graph.nodes.find((x) => x.id === m.id);
      if (n) {
        n.x = Math.round((w.x - m.dx) / 8) * 8;
        n.y = Math.round((w.y - m.dy) / 8) * 8;
        m.moved = true;
        this.invalidate();
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    const m = this.mode;
    this.mode = { kind: "idle" };
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.canvas.style.cursor = "default";
    if (m.kind === "pan" && !m.moved) this.selected = null;
    this.invalidate();
    this.onChange?.();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    if (e.ctrlKey || e.metaKey) this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    else {
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.invalidate();
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "+" || e.key === "=") this.zoomBy(1.2);
    else if (e.key === "-" || e.key === "_") this.zoomBy(1 / 1.2);
    else if (e.key === "0") this.fitToContent();
    else if (e.key === "Escape") {
      this.selected = null;
      this.invalidate();
    }
  };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + q);
  ctx.lineTo(x + w, y + h - q);
  ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  ctx.lineTo(x + q, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - q);
  ctx.lineTo(x, y + q);
  ctx.quadraticCurveTo(x, y, x + q, y);
  ctx.closePath();
}
