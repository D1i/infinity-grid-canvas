import { clamp } from "./model";

/**
 * Maps between CSS pixels of the canvas element and grid cells.
 * The grid fits the container width at zoom 1; zoom scales both axes
 * around a pivot point, pan translates in CSS pixels.
 */
export class Viewport {
  width = 0;
  height = 0;
  zoom = 1;
  panX = 0;
  panY = 0;
  readonly minZoom = 0.2;
  readonly maxZoom = 4;

  constructor(
    public columns: number,
    public rowHeight: number
  ) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Width of one cell in CSS pixels at the current zoom. */
  get cellWidth(): number {
    return (this.width / this.columns) * this.zoom;
  }

  get cellHeight(): number {
    return this.rowHeight * this.zoom;
  }

  /** Pixel x of the left edge of column `cx`. */
  colToPx(cx: number): number {
    return this.panX + cx * this.cellWidth;
  }

  rowToPx(cy: number): number {
    return this.panY + cy * this.cellHeight;
  }

  /** Fractional column under pixel x (may be negative or beyond the grid). */
  pxToCol(px: number): number {
    return (px - this.panX) / this.cellWidth;
  }

  pxToRow(py: number): number {
    return (py - this.panY) / this.cellHeight;
  }

  /** First and last row that intersect the canvas. */
  visibleRows(): [number, number] {
    const first = Math.max(0, Math.floor(this.pxToRow(0)));
    const last = Math.max(first, Math.ceil(this.pxToRow(this.height)));
    return [first, last];
  }

  /** Zoom by `factor` keeping the point (px, py) fixed on screen. */
  zoomAt(factor: number, px: number, py: number): void {
    const next = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    if (next === this.zoom) return;
    const k = next / this.zoom;
    this.panX = px - (px - this.panX) * k;
    this.panY = py - (py - this.panY) * k;
    this.zoom = next;
    this.constrain();
  }

  setZoom(z: number): void {
    this.zoomAt(clamp(z, this.minZoom, this.maxZoom) / this.zoom, this.width / 2, this.height / 2);
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.constrain();
  }

  reset(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /** Keep the grid reachable: no scrolling above row 0 or past the horizontal edges. */
  private constrain(): void {
    const gridW = this.cellWidth * this.columns;
    if (gridW <= this.width) {
      this.panX = (this.width - gridW) / 2;
    } else {
      this.panX = clamp(this.panX, this.width - gridW, 0);
    }
    if (this.panY > 0) this.panY = 0;
  }
}
