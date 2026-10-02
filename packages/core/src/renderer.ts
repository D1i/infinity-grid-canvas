import { drawGlyph } from "./glyphs";
import type { Grid } from "./grid";
import { FULL_WIDTH, type GridItem, type ItemId, type Prediction, widthInCells } from "./model";
import type { Theme } from "./theme";
import type { Viewport } from "./viewport";

export interface DragGhost {
  /** The item being dragged (may not be in the grid yet when it comes from the palette). */
  item: GridItem;
  /** Pointer position in canvas CSS pixels. */
  px: number;
  py: number;
  /** Pointer offset from the item's top-left corner, in CSS pixels. */
  dx: number;
  dy: number;
}

export interface RenderState {
  selected: ItemId | null;
  hovered: ItemId | null;
  /** Prediction for the item being dragged or resized, if any. */
  prediction: Prediction | null;
  ghost: DragGhost | null;
  /** Item being resized, if any. */
  resizing: ItemId | null;
}

/** Gear button geometry relative to the item's rectangle (CSS px at zoom 1). */
export const GEAR_SIZE = 22;
const ITEM_INSET_Y = 5;
const ITEM_INSET_X = 3;
const RADIUS = 7;
/** Below this zoom only glyph badges are drawn; below LOD_TILES only tiles. */
const LOD_NO_TEXT = 0.5;
const LOD_TILES = 0.3;

/**
 * Canvas 2D renderer. Draws only the rows that intersect the viewport, so
 * the cost per frame depends on the screen, not on the number of items.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Device pixel ratio of the current backing store. */
  dpr = 1;
  private textCache = new Map<string, string>();
  /** 0 = tiles, 1 = tiles + glyphs, 2 = full detail. Set per frame from zoom. */
  private lod = 2;
  /** Items drawn in the last frame, for hit testing by the controller. */
  lastDrawn: { item: GridItem; x: number; y: number; w: number; h: number }[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private grid: Grid,
    private viewport: Viewport,
    public theme: Theme
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context is not available");
    this.ctx = ctx;
  }

  /** Match the backing store to the element size and device pixel ratio. */
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.viewport.resize(width, height);
    this.textCache.clear();
  }

  /** Copy of the current backing store, for freezing a frame across a resize. */
  snapshot(): HTMLCanvasElement {
    const copy = document.createElement("canvas");
    copy.width = this.canvas.width;
    copy.height = this.canvas.height;
    copy.getContext("2d")?.drawImage(this.canvas, 0, 0);
    return copy;
  }

  /**
   * Draw a frozen frame scaled to the current size. Cell width follows the
   * element width, row height does not, so the image is stretched
   * horizontally only; the uncovered strip at the bottom takes the background.
   */
  drawFrozen(image: HTMLCanvasElement, width: number, height: number): void {
    const { ctx, viewport: vp, theme: t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, vp.width, vp.height);
    if (image.width === 0 || image.height === 0 || width === 0) return;
    // Destination is in CSS px, so a snapshot taken at another dpr still lands right.
    ctx.drawImage(image, 0, 0, vp.width, height);
  }

  /** Pixel rectangle of an item at the current viewport. */
  rectOf(it: Pick<GridItem, "x" | "y" | "w">): { x: number; y: number; w: number; h: number } {
    const vp = this.viewport;
    const cells = widthInCells(it.w, vp.columns);
    const z = vp.zoom;
    return {
      x: vp.colToPx(it.x) + ITEM_INSET_X * z,
      y: vp.rowToPx(it.y) + ITEM_INSET_Y * z,
      w: cells * vp.cellWidth - ITEM_INSET_X * 2 * z,
      h: vp.cellHeight - ITEM_INSET_Y * 2 * z
    };
  }

  /** Where the gear button of an item sits, in CSS pixels. */
  gearRect(it: GridItem): { x: number; y: number; w: number; h: number } {
    const r = this.rectOf(it);
    const s = GEAR_SIZE * this.viewport.zoom;
    return { x: r.x + r.w - s - 6 * this.viewport.zoom, y: r.y + (r.h - s) / 2, w: s, h: s };
  }

  render(state: RenderState): void {
    const { ctx, viewport: vp, theme: t } = this;
    const z = vp.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.background;
    ctx.fillRect(0, 0, vp.width, vp.height);

    const [firstRow, lastRow] = vp.visibleRows();
    const rowCount = this.grid.rowCount();
    const cw = vp.cellWidth;
    const ch = vp.cellHeight;
    const gridLeft = vp.colToPx(0);
    const gridRight = vp.colToPx(vp.columns);
    const rowsToDraw = Math.max(rowCount, lastRow + 1);

    // Row stripes make the infinite sheet readable while panning.
    ctx.fillStyle = t.rowStripe;
    for (let r = firstRow; r <= Math.min(lastRow, rowsToDraw - 1); r++) {
      if (r % 2 === 0) ctx.fillRect(gridLeft, vp.rowToPx(r), gridRight - gridLeft, ch);
    }

    // Grid lines.
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.gridLine;
    ctx.beginPath();
    for (let r = firstRow; r <= Math.min(lastRow + 1, rowsToDraw); r++) {
      const y = Math.round(vp.rowToPx(r)) + 0.5;
      ctx.moveTo(gridLeft, y);
      ctx.lineTo(gridRight, y);
    }
    const yTop = Math.max(0, vp.rowToPx(0));
    const yBottom = Math.min(vp.height, vp.rowToPx(rowsToDraw));
    for (let c = 0; c <= vp.columns; c++) {
      const x = Math.round(vp.colToPx(c)) + 0.5;
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBottom);
    }
    ctx.stroke();

    // Outer frame of the sheet.
    ctx.strokeStyle = t.gridLineStrong;
    ctx.strokeRect(Math.round(gridLeft) + 0.5, Math.round(vp.rowToPx(0)) + 0.5, Math.round(gridRight - gridLeft), Math.round(rowsToDraw * ch));

    // Prediction and pushed neighbours.
    const shifted = new Map<ItemId, number>();
    if (state.prediction) {
      for (const s of state.prediction.shifts) shifted.set(s.id, s.x);
      this.drawPrediction(state.prediction);
    }

    // Items in the visible rows. Level of detail follows the zoom: titles
    // disappear below 50%, glyph badges below 30%, so an overview of ten
    // thousand fields reads as tiles rather than noise.
    this.lastDrawn.length = 0;
    const fontPx = Math.max(9, Math.round(13 * z));
    this.lod = z < LOD_TILES ? 0 : z < LOD_NO_TEXT ? 1 : 2;
    ctx.font = `400 ${fontPx}px ${t.font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (let r = firstRow; r <= lastRow; r++) {
      for (const it of this.grid.row(r)) {
        if (state.ghost && state.ghost.item.id === it.id) continue;
        const sx = shifted.get(it.id);
        const draw = sx === undefined ? it : { ...it, x: sx };
        this.drawItem(draw, {
          hovered: state.hovered === it.id,
          selected: state.selected === it.id,
          shifted: sx !== undefined,
          resizing: state.resizing === it.id,
          fontPx
        });
      }
    }

    // Floating ghost of the dragged item follows the pointer.
    if (state.ghost) this.drawGhost(state.ghost, fontPx);
  }

  private drawPrediction(p: Prediction): void {
    const { ctx, viewport: vp, theme: t } = this;
    const r = this.rectOf(p);
    ctx.save();
    ctx.fillStyle = p.valid ? t.predict : t.predictInvalid;
    ctx.strokeStyle = p.valid ? t.predictBorder : t.predictInvalidBorder;
    ctx.lineWidth = Math.max(1, 1.5 * vp.zoom);
    ctx.setLineDash([6 * vp.zoom, 4 * vp.zoom]);
    roundRect(ctx, r.x, r.y, r.w, r.h, RADIUS * vp.zoom);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawItem(
    it: GridItem,
    o: { hovered: boolean; selected: boolean; shifted: boolean; resizing: boolean; fontPx: number }
  ): void {
    const { ctx, viewport: vp, theme: t } = this;
    const z = vp.zoom;
    const r = this.rectOf(it);
    this.lastDrawn.push({ item: it, ...r });
    const radius = RADIUS * z;

    if (o.hovered || o.selected) {
      ctx.save();
      ctx.shadowColor = t.shadow;
      ctx.shadowBlur = 10 * z;
      ctx.shadowOffsetY = 2 * z;
      ctx.fillStyle = t.item;
      roundRect(ctx, r.x, r.y, r.w, r.h, radius);
      ctx.fill();
      ctx.restore();
    }

    // At the lowest level of detail tiles take the badge tint so the sheet
    // reads as an occupancy map instead of faint outlines.
    const base = this.lod === 0 ? t.glyphBg : t.item;
    ctx.fillStyle = o.shifted ? t.shifted : o.selected ? t.itemSelectedBg : o.hovered ? t.itemHover : base;
    ctx.strokeStyle = o.selected || o.resizing ? t.itemSelected : this.lod === 0 ? t.glyph : t.itemBorder;
    ctx.lineWidth = o.selected ? Math.max(1, 1.5 * z) : 1;
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.fill();
    ctx.stroke();

    // Glyph badge.
    const pad = 8 * z;
    const badge = Math.min(22 * z, r.h - 8 * z);
    if (this.lod >= 1 && r.w > badge + pad * 2) {
      ctx.fillStyle = t.glyphBg;
      roundRect(ctx, r.x + pad, r.y + (r.h - badge) / 2, badge, badge, 5 * z);
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = t.glyph;
      ctx.fillStyle = t.glyph;
      ctx.lineWidth = Math.max(1, 1.4 * z);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const gs = (badge - 6 * z) / 16;
      drawGlyph(ctx, it.type, r.x + pad + 3 * z, r.y + (r.h - badge) / 2 + 3 * z, gs);
      ctx.restore();
    }

    // Title, truncated with an ellipsis; measurements cached per width bucket.
    const textX = r.x + pad + badge + 8 * z;
    const gearSpace = o.selected ? GEAR_SIZE * z + 10 * z : 0;
    const maxW = r.w - (textX - r.x) - pad - gearSpace - (it.required ? 10 * z : 0);
    if (this.lod >= 2 && maxW > 12 * z) {
      ctx.font = `400 ${o.fontPx}px ${t.font}`;
      ctx.fillStyle = t.itemText;
      const text = this.truncate(it.title, maxW, o.fontPx);
      ctx.fillText(text, textX, r.y + r.h / 2 + 0.5);
      if (it.required) {
        ctx.fillStyle = t.required;
        ctx.fillText("*", textX + ctx.measureText(text).width + 3 * z, r.y + r.h / 2 + 0.5);
      }
    }

    // Resize anchors on hover/selection.
    if ((o.hovered || o.selected) && r.w > 40 * z) {
      ctx.fillStyle = t.itemSelected;
      const ah = Math.min(16 * z, r.h * 0.5);
      roundRect(ctx, r.x - 1.5 * z, r.y + (r.h - ah) / 2, 3 * z, ah, 1.5 * z);
      ctx.fill();
      roundRect(ctx, r.x + r.w - 1.5 * z, r.y + (r.h - ah) / 2, 3 * z, ah, 1.5 * z);
      ctx.fill();
    }

    if (o.selected) this.drawGear(it);
  }

  private drawGear(it: GridItem): void {
    const { ctx, viewport: vp, theme: t } = this;
    const g = this.gearRect(it);
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const z = vp.zoom;
    ctx.save();
    ctx.fillStyle = t.gearBg;
    ctx.strokeStyle = t.itemBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, g.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Gear: ring with 8 teeth.
    ctx.strokeStyle = t.gear;
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.lineCap = "round";
    const R = g.w * 0.26;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawGhost(g: DragGhost, fontPx: number): void {
    const { ctx, viewport: vp, theme: t } = this;
    const z = vp.zoom;
    const cells = widthInCells(g.item.w, vp.columns);
    const w = cells * vp.cellWidth - ITEM_INSET_X * 2 * z;
    const h = vp.cellHeight - ITEM_INSET_Y * 2 * z;
    const x = g.px - g.dx;
    const y = g.py - g.dy;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = t.shadow;
    ctx.shadowBlur = 18 * z;
    ctx.shadowOffsetY = 6 * z;
    ctx.fillStyle = t.item;
    ctx.strokeStyle = t.itemSelected;
    ctx.lineWidth = Math.max(1, 1.5 * z);
    roundRect(ctx, x, y, w, h, RADIUS * z);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    const pad = 8 * z;
    const badge = Math.min(22 * z, h - 8 * z);
    ctx.fillStyle = t.glyphBg;
    roundRect(ctx, x + pad, y + (h - badge) / 2, badge, badge, 5 * z);
    ctx.fill();
    ctx.strokeStyle = t.glyph;
    ctx.fillStyle = t.glyph;
    ctx.lineWidth = Math.max(1, 1.4 * z);
    drawGlyph(ctx, g.item.type, x + pad + 3 * z, y + (h - badge) / 2 + 3 * z, (badge - 6 * z) / 16);
    ctx.font = `500 ${fontPx}px ${t.font}`;
    ctx.fillStyle = t.itemText;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(this.truncate(g.item.title, w - pad * 2 - badge - 8 * z, fontPx), x + pad + badge + 8 * z, y + h / 2 + 0.5);
    ctx.restore();
  }

  private truncate(text: string, maxW: number, fontPx: number): string {
    const key = `${fontPx}|${Math.round(maxW)}|${text}`;
    const hit = this.textCache.get(key);
    if (hit !== undefined) return hit;
    const ctx = this.ctx;
    let out = text;
    if (ctx.measureText(text).width > maxW) {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
        else hi = mid - 1;
      }
      out = lo === 0 ? "" : text.slice(0, lo) + "…";
    }
    if (this.textCache.size > 5000) this.textCache.clear();
    this.textCache.set(key, out);
    return out;
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export { FULL_WIDTH };
