import {
  clamp,
  DEFAULT_OPTIONS,
  FULL_WIDTH,
  type GridItem,
  type GridOptions,
  type GridSnapshot,
  type ItemId,
  type Placement,
  type Prediction,
  uid,
  widthInCells
} from "./model";

type Listener = () => void;

interface Command {
  undo(): void;
  redo(): void;
}

/**
 * The layout engine. Pure data: no DOM, no canvas.
 *
 * Items are indexed by row so that collision checks, hit tests and
 * virtualized rendering cost O(items in row), not O(items in grid).
 */
export class Grid {
  readonly columns: number;
  readonly rowHeight: number;
  readonly minRows: number;
  readonly tailRows: number;

  private items = new Map<ItemId, GridItem>();
  private rows = new Map<number, GridItem[]>();
  private listeners = new Set<Listener>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private batchDepth = 0;
  private batchDirty = false;

  constructor(options: GridOptions = {}) {
    const o = { ...DEFAULT_OPTIONS, ...options };
    this.columns = o.columns;
    this.rowHeight = o.rowHeight;
    this.minRows = o.minRows;
    this.tailRows = o.tailRows;
  }

  // ---------------------------------------------------------------- reads

  get size(): number {
    return this.items.size;
  }

  get(id: ItemId): GridItem | undefined {
    return this.items.get(id);
  }

  all(): IterableIterator<GridItem> {
    return this.items.values();
  }

  /** Items in a row, in no particular order. Empty array when the row is free. */
  row(y: number): ReadonlyArray<GridItem> {
    return this.rows.get(y) ?? EMPTY;
  }

  /** Highest occupied row index, or -1 for an empty grid. */
  lastRow(): number {
    let max = -1;
    for (const y of this.rows.keys()) if (y > max) max = y;
    return max;
  }

  /** Number of rows the grid should present: content plus breathing room. */
  rowCount(): number {
    return Math.max(this.minRows, this.lastRow() + 1 + this.tailRows);
  }

  /** The item under a cell, if any. */
  at(x: number, y: number): GridItem | undefined {
    for (const it of this.row(y)) {
      const w = widthInCells(it.w, this.columns);
      if (x >= it.x && x < it.x + w) return it;
    }
    return undefined;
  }

  /** Is the span [x, x+w) in row y free, ignoring `except`? */
  isFree(x: number, y: number, w: number, except?: ItemId): boolean {
    if (x < 0 || x + w > this.columns || y < 0) return false;
    for (const it of this.row(y)) {
      if (it.id === except) continue;
      const iw = widthInCells(it.w, this.columns);
      if (x < it.x + iw && x + w > it.x) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ prediction

  /**
   * Predict where an item of width `w` would land if dropped with its left
   * edge at cell (x, y). Neighbours in the row are pushed right when there is
   * room; otherwise the prediction is marked invalid and nothing moves.
   */
  predict(x: number, y: number, w: number, except?: ItemId): Prediction {
    const cols = this.columns;
    const width = widthInCells(w, cols);
    const px = clamp(Math.round(x), 0, cols - width);
    const py = Math.max(0, Math.round(y));

    if (this.isFree(px, py, width, except)) {
      return { x: px, y: py, w: width, valid: true, shifts: [] };
    }

    // Try to push the overlapping items to the right, cascading.
    const others = this.row(py)
      .filter((it) => it.id !== except)
      .map((it) => ({ id: it.id, x: it.x, w: widthInCells(it.w, cols) }))
      .sort((a, b) => a.x - b.x);

    let cursor = px + width;
    const shifts: { id: ItemId; x: number }[] = [];
    for (const it of others) {
      if (it.x + it.w <= px) continue; // entirely left of the drop
      if (it.x < cursor) {
        shifts.push({ id: it.id, x: cursor });
        cursor += it.w;
      } else {
        cursor = it.x + it.w;
      }
    }
    const valid = cursor <= cols;
    return { x: px, y: py, w: width, valid, shifts: valid ? shifts : [] };
  }

  /** Apply a prediction: place `item` and move the pushed neighbours. */
  commit(prediction: Prediction, item: GridItem): boolean {
    if (!prediction.valid) return false;
    this.batch(() => {
      for (const s of prediction.shifts) this.setPlacement(s.id, { x: s.x });
      if (this.items.has(item.id)) {
        this.setPlacement(item.id, { x: prediction.x, y: prediction.y, w: item.w === FULL_WIDTH ? FULL_WIDTH : prediction.w });
      } else {
        this.add({ ...item, x: prediction.x, y: prediction.y, w: item.w === FULL_WIDTH ? FULL_WIDTH : prediction.w });
      }
    });
    return true;
  }

  /**
   * Predict a resize. `anchor` is the edge being dragged; `cell` is the cell
   * under the pointer. The far edge stays put. Width is clamped to 1..columns.
   */
  predictResize(id: ItemId, anchor: "left" | "right", cell: number): Prediction {
    const it = this.items.get(id);
    if (!it) return { x: 0, y: 0, w: 1, valid: false, shifts: [] };
    const cols = this.columns;
    const w = widthInCells(it.w, cols);
    let x = it.x;
    let nw = w;
    if (anchor === "right") {
      nw = clamp(cell - it.x + 1, 1, cols - it.x);
    } else {
      const left = clamp(cell, 0, it.x + w - 1);
      x = left;
      nw = it.x + w - left;
    }
    const valid = this.isFree(x, it.y, nw, id);
    return { x, y: it.y, w: nw, valid, shifts: [] };
  }

  // ---------------------------------------------------------------- writes

  add(item: Omit<GridItem, "id"> & { id?: ItemId }): GridItem {
    const full: GridItem = { ...item, id: item.id ?? uid() };
    this.insert(full);
    this.push({
      undo: () => this.erase(full.id),
      redo: () => this.insert(full)
    });
    return full;
  }

  remove(id: ItemId): void {
    const it = this.items.get(id);
    if (!it) return;
    const copy = { ...it };
    this.erase(id);
    this.push({
      undo: () => this.insert(copy),
      redo: () => this.erase(copy.id)
    });
  }

  update(id: ItemId, patch: Partial<Pick<GridItem, "title" | "type" | "required">>): void {
    const it = this.items.get(id);
    if (!it) return;
    const before = { title: it.title, type: it.type, required: it.required };
    Object.assign(it, patch);
    this.changed();
    this.push({
      undo: () => {
        const cur = this.items.get(id);
        if (cur) Object.assign(cur, before);
        this.changed();
      },
      redo: () => {
        const cur = this.items.get(id);
        if (cur) Object.assign(cur, patch);
        this.changed();
      }
    });
  }

  setPlacement(id: ItemId, p: Partial<Placement>): void {
    const it = this.items.get(id);
    if (!it) return;
    const before: Placement = { x: it.x, y: it.y, w: it.w };
    const after: Placement = { x: p.x ?? it.x, y: p.y ?? it.y, w: p.w ?? it.w };
    if (before.x === after.x && before.y === after.y && before.w === after.w) return;
    this.place(it, after);
    this.push({
      undo: () => {
        const cur = this.items.get(id);
        if (cur) this.place(cur, before);
      },
      redo: () => {
        const cur = this.items.get(id);
        if (cur) this.place(cur, after);
      }
    });
  }

  clear(): void {
    const all = [...this.items.values()].map((it) => ({ ...it }));
    if (!all.length) return;
    for (const it of all) this.items.delete(it.id);
    this.rows.clear();
    this.changed();
    this.push({
      undo: () => this.batch(() => all.forEach((it) => this.insert(it))),
      redo: () => this.batch(() => all.forEach((it) => this.erase(it.id)))
    });
  }

  /**
   * Append `count` items, packed row by row from the first free row. Widths
   * come from `widths` (cells) in rotation; titles from `title(i)`.
   * O(count): the allocator keeps a cursor instead of scanning the grid.
   */
  addMany(count: number, spec: { widths: number[]; type: (i: number) => string; title: (i: number) => string }): GridItem[] {
    const cols = this.columns;
    const added: GridItem[] = [];
    let y = this.lastRow() + 1;
    let x = 0;
    this.batch(() => {
      for (let i = 0; i < count; i++) {
        const w = widthInCells(spec.widths[i % spec.widths.length], cols);
        if (x + w > cols) {
          y++;
          x = 0;
        }
        const it: GridItem = { id: uid(), type: spec.type(i), title: spec.title(i), x, y, w };
        this.insert(it);
        added.push(it);
        x += w;
      }
    });
    const ids = added.map((it) => it.id);
    this.push({
      undo: () => this.batch(() => ids.forEach((id) => this.erase(id))),
      redo: () => this.batch(() => added.forEach((it) => this.insert(it)))
    });
    return added;
  }

  // --------------------------------------------------------------- history

  undo(): boolean {
    const c = this.undoStack.pop();
    if (!c) return false;
    c.undo();
    this.redoStack.push(c);
    return true;
  }

  redo(): boolean {
    const c = this.redoStack.pop();
    if (!c) return false;
    c.redo();
    this.undoStack.push(c);
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Group several writes into one undo step and one change notification. */
  batch(fn: () => void): void {
    this.batchDepth++;
    const mark = this.undoStack.length;
    try {
      fn();
    } finally {
      this.batchDepth--;
    }
    if (this.undoStack.length - mark > 1) {
      const cmds = this.undoStack.splice(mark);
      this.undoStack.push({
        undo: () => {
          for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo();
        },
        redo: () => cmds.forEach((c) => c.redo())
      });
    }
    if (this.batchDepth === 0 && this.batchDirty) {
      this.batchDirty = false;
      this.emit();
    }
  }

  // ------------------------------------------------------------- serialize

  toJSON(): GridSnapshot {
    return { version: 1, columns: this.columns, items: [...this.items.values()].map((it) => ({ ...it })) };
  }

  load(snapshot: GridSnapshot): void {
    this.batch(() => {
      this.clear();
      for (const it of snapshot.items) this.insert({ ...it });
    });
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  // ---------------------------------------------------------------- events

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // -------------------------------------------------------------- internal

  private insert(it: GridItem): void {
    this.items.set(it.id, it);
    this.link(it);
    this.changed();
  }

  private erase(id: ItemId): void {
    const it = this.items.get(id);
    if (!it) return;
    this.unlink(it);
    this.items.delete(id);
    this.changed();
  }

  private place(it: GridItem, p: Placement): void {
    this.unlink(it);
    it.x = p.x;
    it.y = p.y;
    it.w = p.w;
    this.link(it);
    this.changed();
  }

  private link(it: GridItem): void {
    let row = this.rows.get(it.y);
    if (!row) this.rows.set(it.y, (row = []));
    row.push(it);
  }

  private unlink(it: GridItem): void {
    const row = this.rows.get(it.y);
    if (!row) return;
    const i = row.indexOf(it);
    if (i >= 0) row.splice(i, 1);
    if (!row.length) this.rows.delete(it.y);
  }

  private push(c: Command): void {
    this.undoStack.push(c);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private changed(): void {
    if (this.batchDepth > 0) {
      this.batchDirty = true;
      return;
    }
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

const EMPTY: ReadonlyArray<GridItem> = Object.freeze([]);
