import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { darkTheme, FULL_WIDTH, Grid, GridController, lightTheme, type GridItem } from "@infinity-grid-canvas/core";
import { FIELD_TYPES, sampleLayout, titleFor } from "./field-types";
import { GlyphIcon, SaveWarning } from "./components";
import { FlowEditor } from "./FlowEditor";
import { Icon } from "./icons";

const WIDTHS = [2, 3, 3, 4, 4, 6, 3, 12];

declare global {
  interface Window {
    /** Hooks for the benchmark script. */
    __infinityGrid?: {
      grid: Grid;
      controller: GridController;
      addMany: (n: number) => void;
      clear: () => void;
    };
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = useMemo(() => new Grid({ columns: 12, rowHeight: 44, minRows: 14 }), []);
  const ctlRef = useRef<GridController | null>(null);

  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [selected, setSelected] = useState<GridItem | null>(null);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [bench, setBench] = useState(false);
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, drawn: 0 });
  const [addN, setAddN] = useState(1000);
  const [continuous, setContinuous] = useState(false);
  const [flowItem, setFlowItem] = useState<GridItem | null>(null);
  const [warning, setWarning] = useState(false);
  const [tick, setTick] = useState(0);

  // Theme on the document for the chrome; on the controller for the canvas.
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    ctlRef.current?.setTheme(dark ? darkTheme : lightTheme);
  }, [dark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctl = new GridController(
      canvas,
      grid,
      {
        select: (it) => setSelected(it ? { ...it } : null),
        gear: (it) => setFlowItem({ ...it }),
        change: () => {
          setCount(grid.size);
          setRows(grid.rowCount());
          setHistory({ undo: grid.canUndo, redo: grid.canRedo });
          setTick((t) => t + 1);
        },
        view: (z) => setZoom(z)
      },
      dark ? darkTheme : lightTheme
    );
    ctl.observe();
    ctlRef.current = ctl;

    grid.batch(() => {
      for (const f of sampleLayout()) grid.add(f);
    });
    // The seed layout is the starting point, not an undo step.
    while (grid.undo()) {
      /* drain */
    }
    grid.batch(() => {
      for (const f of sampleLayout()) grid.add(f);
    });
    ctl.invalidate();

    const addMany = (n: number) => {
      grid.addMany(n, { widths: WIDTHS, type: (i) => FIELD_TYPES[i % FIELD_TYPES.length].type, title: (i) => titleFor(FIELD_TYPES[i % FIELD_TYPES.length].type, Math.floor(i / FIELD_TYPES.length)) });
    };
    window.__infinityGrid = { grid, controller: ctl, addMany, clear: () => grid.clear() };

    return () => {
      ctl.dispose();
      ctlRef.current = null;
      delete window.__infinityGrid;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // Keep the inspector in sync with the selected item after edits.
  useEffect(() => {
    if (!selected) return;
    const cur = grid.get(selected.id);
    if (!cur) setSelected(null);
    else if (cur.x !== selected.x || cur.y !== selected.y || cur.w !== selected.w || cur.title !== selected.title) setSelected({ ...cur });
  }, [tick, grid, selected]);

  // Poll renderer stats while the benchmark panel is open.
  useEffect(() => {
    if (!bench) return;
    const id = window.setInterval(() => {
      const s = ctlRef.current?.stats;
      if (s) setStats({ ...s });
    }, 500);
    return () => window.clearInterval(id);
  }, [bench]);

  useEffect(() => {
    ctlRef.current?.setContinuous(continuous);
  }, [continuous]);

  const addMany = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(100000, Math.floor(n)));
      const before = grid.lastRow();
      window.__infinityGrid?.addMany(clamped);
      ctlRef.current?.scrollToRow(Math.max(0, before - 1));
    },
    [grid]
  );

  const updateSelected = (patch: Partial<GridItem>) => {
    if (!selected) return;
    if (patch.w !== undefined) {
      const pred = grid.predict(selected.x, selected.y, patch.w, selected.id);
      if (!pred.valid) return;
      grid.commit(pred, { ...selected, w: patch.w });
      delete patch.w;
    }
    if (Object.keys(patch).length) grid.update(selected.id, patch);
  };

  const ctl = ctlRef.current;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">
            <Icon.Grid />
          </span>
          <span className="name">Infinity Grid Canvas</span>
          <span className="tag">infinite layout grid · Canvas 2D</span>
        </div>
        <div className="divider" />
        <div className="group">
          <button className="btn icon ghost" title="Undo (Ctrl+Z)" disabled={!history.undo} onClick={() => grid.undo()}>
            <Icon.Undo />
          </button>
          <button className="btn icon ghost" title="Redo (Ctrl+Shift+Z)" disabled={!history.redo} onClick={() => grid.redo()}>
            <Icon.Redo />
          </button>
        </div>
        <div className="divider" />
        <div className="group">
          <input
            className="input num"
            type="number"
            min={1}
            max={100000}
            value={addN}
            onChange={(e) => setAddN(Number(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && addMany(addN)}
            aria-label="Number of fields to add"
          />
          <button className="btn" onClick={() => addMany(addN)} title="Append fields packed into free rows">
            <Icon.Plus /> Add
          </button>
          <button className="chip" onClick={() => addMany(100)}>
            +100
          </button>
          <button className="chip" onClick={() => addMany(1000)}>
            +1 000
          </button>
          <button className="chip" onClick={() => addMany(10000)}>
            +10 000
          </button>
          <button className="btn ghost" onClick={() => grid.clear()} disabled={count === 0} title="Remove every field">
            <Icon.Broom /> Clear
          </button>
        </div>
        <div className="spacer" />
        <button className={`btn ${bench ? "active" : ""}`} onClick={() => setBench((b) => !b)} title="Show renderer statistics">
          <Icon.Gauge /> Benchmark
        </button>
        <button className="btn icon" onClick={() => setDark((d) => !d)} title="Toggle theme">
          {dark ? <Icon.Sun /> : <Icon.Moon />}
        </button>
        <button className="btn primary" onClick={() => setWarning(true)}>
          <Icon.Save /> Save
        </button>
      </header>

      <aside className="sidebar">
        <h3>Fields</h3>
        <div className="palette">
          {FIELD_TYPES.map((f) => (
            <div
              key={f.type}
              className="palette-item"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                const n = [...grid.all()].filter((it) => it.type === f.type).length;
                ctlRef.current?.beginExternalDrag({ type: f.type, title: titleFor(f.type, n), w: f.w }, e.nativeEvent);
              }}
              title="Drag onto the grid"
            >
              <span className="glyph">
                <GlyphIcon type={f.type} color={dark ? "#a4bcfd" : "#444ce7"} />
              </span>
              <span className="label">{f.label}</span>
              <span className="w">{f.w === FULL_WIDTH ? "full" : `${f.w}/12`}</span>
            </div>
          ))}
        </div>
        <div className="hint">
          Drag a field onto the grid. Drag edges to resize, drag the sheet to pan, <kbd>Ctrl</kbd> + scroll to zoom, double-click empty space to zoom in. <kbd>Del</kbd> removes, arrows nudge, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes.
        </div>
      </aside>

      <main className="main">
        <canvas ref={canvasRef} aria-label="Layout grid" />
        {count === 0 && (
          <div className="empty">
            <div>
              The sheet is empty.
              <br />
              Drag a field from the left, or add a thousand with one click.
            </div>
          </div>
        )}
        {bench && (
          <div className="hud tl">
            <div className="row">
              <strong>Renderer</strong>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                continuous
                <button className={`switch ${continuous ? "on" : ""}`} onClick={() => setContinuous((c) => !c)} aria-label="Render every frame" />
              </label>
            </div>
            <div className="stat">
              <div>
                <b className={stats.fps >= 50 ? "fps-good" : stats.fps > 0 && stats.fps < 30 ? "fps-bad" : ""}>{continuous ? stats.fps : "—"}</b>
                <span>fps</span>
              </div>
              <div>
                <b>{stats.frameMs}</b>
                <span>ms / frame</span>
              </div>
              <div>
                <b>{stats.drawn}</b>
                <span>drawn</span>
              </div>
            </div>
            <div className="row" style={{ fontSize: 12, color: "var(--text-3)" }}>
              <span>{count.toLocaleString("en-US")} fields in {rows.toLocaleString("en-US")} rows</span>
              <span>only visible rows are drawn</span>
            </div>
          </div>
        )}
        <div className="hud bl">
          <span>
            <span className="k">fields</span>
            {count.toLocaleString("en-US")}
          </span>
          <span>
            <span className="k">rows</span>
            {rows.toLocaleString("en-US")}
          </span>
          <span>
            <span className="k">zoom</span>
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="hud br">
          <button className="btn icon ghost sm" onClick={() => ctl?.zoomBy(1 / 1.2)} title="Zoom out (−)">
            <Icon.Minus />
          </button>
          <span className="zoom">{Math.round(zoom * 100)}%</span>
          <button className="btn icon ghost sm" onClick={() => ctl?.zoomBy(1.2)} title="Zoom in (+)">
            <Icon.Plus />
          </button>
          <button className="btn icon ghost sm" onClick={() => ctl?.resetView()} title="Reset view (0)">
            <Icon.Fit />
          </button>
        </div>
      </main>

      <aside className={`inspector ${selected ? "" : "hidden"}`}>
        {selected && (
          <>
            <div className="head">
              <h3>Field</h3>
              <button className="btn icon ghost sm" onClick={() => ctl?.select(null)} title="Close">
                <Icon.Close />
              </button>
            </div>
            <div className="body">
              <div className="field">
                <label>Title</label>
                <input className="input" value={selected.title} onChange={(e) => updateSelected({ title: e.target.value })} />
              </div>
              <div className="field">
                <label>Type</label>
                <select className="input" value={selected.type} onChange={(e) => updateSelected({ type: e.target.value })}>
                  {FIELD_TYPES.map((f) => (
                    <option key={f.type} value={f.type}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Width</label>
                <select
                  className="input"
                  value={selected.w === FULL_WIDTH ? "full" : String(selected.w)}
                  onChange={(e) => updateSelected({ w: e.target.value === "full" ? FULL_WIDTH : Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => (
                    <option key={w} value={w}>
                      {w} / 12
                    </option>
                  ))}
                  <option value="full">Full row</option>
                </select>
              </div>
              <div className="field">
                <label>Position</label>
                <div style={{ fontSize: 13, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  column {selected.x + 1}, row {selected.y + 1}
                </div>
              </div>
              <div className="toggle">
                <span>Required</span>
                <button className={`switch ${selected.required ? "on" : ""}`} onClick={() => updateSelected({ required: !selected.required })} aria-label="Required" />
              </div>
              <h3 style={{ padding: "16px 0 8px" }}>Automation</h3>
              <button className="automation" onClick={() => setFlowItem({ ...selected })}>
                <span className="gear">
                  <Icon.Gear />
                </span>
                <span>
                  <div className="t">Open no-code scheme</div>
                  <div className="d">Runs when this field changes</div>
                </span>
              </button>
            </div>
            <div className="footer">
              <button
                className="btn danger"
                onClick={() => {
                  grid.remove(selected.id);
                  ctl?.select(null);
                }}
              >
                <Icon.Trash /> Remove field
              </button>
            </div>
          </>
        )}
      </aside>

      {flowItem && <FlowEditor item={flowItem} dark={dark} onClose={() => setFlowItem(null)} />}
      {warning && <SaveWarning onStay={() => setWarning(false)} onLeave={() => window.location.reload()} />}
    </div>
  );
}
