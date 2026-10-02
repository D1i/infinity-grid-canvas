import { useEffect, useRef, useState } from "react";
import type { GridItem } from "@infinity-grid-canvas/core";
import { FlowCanvas, flowDark, flowLight, generateFlow } from "@infinity-grid-canvas/flow";
import { Icon } from "./icons";
import { SaveWarning } from "./components";

/**
 * Full-screen "automation" editor opened from an item's gear. Visual only:
 * it draws plausible no-code schemes, nothing executes and nothing persists.
 */
export function FlowEditor({ item, dark, onClose }: { item: GridItem; dark: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flowRef = useRef<FlowCanvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [warning, setWarning] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const flow = new FlowCanvas(c, dark ? flowDark : flowLight);
    flow.onChange = () => setZoom(flow.zoom);
    flow.observe();
    flowRef.current = flow;
    // Fit after the first layout pass so the window has its final size.
    requestAnimationFrame(() => {
      flow.fit();
      flow.setGraph(generateFlow({ seed, subject: item.title }));
      setZoom(flow.zoom);
    });
    return () => {
      flow.dispose();
      flowRef.current = null;
    };
    // The graph is regenerated through `seed`; the canvas lives for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    flowRef.current?.setTheme(dark ? flowDark : flowLight);
  }, [dark]);

  useEffect(() => {
    const f = flowRef.current;
    if (!f) return;
    f.setGraph(generateFlow({ seed, subject: item.title }));
    setZoom(f.zoom);
  }, [seed, item.title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !warning) setWarning(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [warning]);

  const f = () => flowRef.current;

  return (
    <div className="flow" role="dialog" aria-modal="true" aria-label={`Automation for ${item.title}`}>
      <div className="window">
        <div className="head">
          <span className="brand">
            <span className="mark">
              <Icon.Gear />
            </span>
          </span>
          <div>
            <div className="title">
              Automation · {item.title} <span className="badge">visual only</span>
            </div>
            <div className="sub">No-code scheme attached to this field. Drag nodes, scroll to pan, Ctrl + scroll to zoom.</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} title="Generate a new scheme">
            <Icon.Sparkles /> Generate scheme
          </button>
          <div className="divider" />
          <button className="btn icon ghost" onClick={() => f()?.zoomBy(1 / 1.2)} title="Zoom out">
            <Icon.Minus />
          </button>
          <span className="zoom" style={{ minWidth: 46, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
            {Math.round(zoom * 100)}%
          </span>
          <button className="btn icon ghost" onClick={() => f()?.zoomBy(1.2)} title="Zoom in">
            <Icon.Plus />
          </button>
          <button className="btn icon ghost" onClick={() => f()?.fitToContent()} title="Fit to screen">
            <Icon.Fit />
          </button>
          <div className="divider" />
          <button className="btn primary" onClick={() => setWarning(true)}>
            <Icon.Save /> Save
          </button>
          <button className="btn icon ghost" onClick={() => setWarning(true)} title="Close">
            <Icon.Close />
          </button>
        </div>
        <div className="stage">
          <canvas ref={canvasRef} />
        </div>
        <div className="foot">
          <span className="legend">
            <i style={{ background: "#12b76a" }} /> trigger
          </span>
          <span className="legend">
            <i style={{ background: "#6172f3" }} /> action
          </span>
          <span className="legend">
            <i style={{ background: "#f79009" }} /> condition
          </span>
          <span className="legend">
            <i style={{ background: "#4e5ba6" }} /> data
          </span>
          <span className="legend">
            <i style={{ background: "#f04438" }} /> end
          </span>
          <span className="spacer" />
          <span>Esc to close · 0 to fit · + / − to zoom</span>
        </div>
      </div>
      {warning && <SaveWarning onStay={() => setWarning(false)} onLeave={onClose} />}
    </div>
  );
}
