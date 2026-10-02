import { useEffect, useRef, type ReactNode } from "react";
import { drawGlyph } from "@infinity-grid-canvas/core";
import { Icon } from "./icons";

/** 16px canvas glyph, same drawing code the grid renderer uses. */
export function GlyphIcon({ type, color, size = 16 }: { type: string; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawGlyph(ctx, type, 0, 0, size / 16);
  }, [type, color, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} aria-hidden />;
}

export function Modal({
  title,
  children,
  actions,
  onClose
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="icon-wrap">
          <Icon.Warning />
        </div>
        <h2>{title}</h2>
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}

/** The "nothing is saved" warning every Save button in the demo opens. */
export function SaveWarning({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <Modal
      title="This is a demo — nothing is saved"
      onClose={onStay}
      actions={
        <>
          <button className="btn" onClick={onStay} autoFocus>
            Stay
          </button>
          <button className="btn primary" onClick={onLeave}>
            Leave anyway
          </button>
        </>
      }
    >
      <p>
        The layout and the automation scheme live only in this browser tab. Leaving will discard everything you built
        here. Are you sure you want to leave?
      </p>
    </Modal>
  );
}
