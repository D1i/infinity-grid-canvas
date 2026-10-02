/**
 * Layout model.
 *
 * The grid has a fixed number of columns and an unbounded number of rows.
 * Every item occupies one row and `w` consecutive cells starting at `x`.
 * Coordinates are integers in cell units; pixels never enter the model.
 *
 * Abstracted from the layout engine of a production low-code editor (2024).
 */

export type ItemId = string;

export interface GridItem {
  id: ItemId;
  /** Item kind; the renderer maps it to a glyph and the palette to a label. */
  type: string;
  title: string;
  /** Column index of the left edge, 0-based. */
  x: number;
  /** Row index, 0-based. Rows are unbounded. */
  y: number;
  /** Width in cells, 1..columns. `FULL_WIDTH` means "the whole row". */
  w: number;
  required?: boolean;
}

/** Sentinel width: the item spans every column of the grid. */
export const FULL_WIDTH = Infinity;

export interface Placement {
  x: number;
  y: number;
  w: number;
}

/** What the grid predicts for the item being dragged or resized. */
export interface Prediction extends Placement {
  /** False when the placement collides and cannot be resolved. */
  valid: boolean;
  /** Items the grid would push aside to make room (ids and their new x). */
  shifts: ReadonlyArray<{ id: ItemId; x: number }>;
}

export interface GridOptions {
  columns?: number;
  /** Minimum number of rows the grid always shows. */
  minRows?: number;
  /** Row height in CSS pixels at zoom 1. */
  rowHeight?: number;
  /** Extra empty rows kept below the lowest item so there is always room to drop. */
  tailRows?: number;
}

export interface GridSnapshot {
  version: 1;
  columns: number;
  items: GridItem[];
}

export const DEFAULT_OPTIONS: Required<GridOptions> = {
  columns: 12,
  minRows: 12,
  rowHeight: 44,
  tailRows: 3
};

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Resolve the sentinel to a concrete number of cells for this grid. */
export function widthInCells(w: number, columns: number): number {
  return w === FULL_WIDTH ? columns : clamp(Math.round(w), 1, columns);
}

let counter = 0;
/** Short unique id; good enough for client-side layouts. */
export function uid(prefix = "i"): string {
  counter = (counter + 1) % 0xffffff;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
