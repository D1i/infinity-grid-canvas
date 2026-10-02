/**
 * Tiny vector glyphs for item types, drawn directly on the canvas so the
 * renderer has no image dependencies. Each draws inside a 16x16 box whose
 * top-left corner is (x, y); `s` scales it.
 */
export type GlyphFn = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void;

const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
};

export const glyphs: Record<string, GlyphFn> = {
  text(ctx, x, y, s) {
    ctx.beginPath();
    line(ctx, x + 3 * s, y + 4 * s, x + 13 * s, y + 4 * s);
    line(ctx, x + 3 * s, y + 8 * s, x + 13 * s, y + 8 * s);
    line(ctx, x + 3 * s, y + 12 * s, x + 9 * s, y + 12 * s);
    ctx.stroke();
  },
  textarea(ctx, x, y, s) {
    ctx.beginPath();
    ctx.rect(x + 2.5 * s, y + 2.5 * s, 11 * s, 11 * s);
    line(ctx, x + 5 * s, y + 6 * s, x + 11 * s, y + 6 * s);
    line(ctx, x + 5 * s, y + 9 * s, x + 11 * s, y + 9 * s);
    ctx.stroke();
  },
  number(ctx, x, y, s) {
    ctx.beginPath();
    line(ctx, x + 6 * s, y + 3 * s, x + 5 * s, y + 13 * s);
    line(ctx, x + 11 * s, y + 3 * s, x + 10 * s, y + 13 * s);
    line(ctx, x + 3 * s, y + 6.5 * s, x + 13 * s, y + 6.5 * s);
    line(ctx, x + 3 * s, y + 9.5 * s, x + 13 * s, y + 9.5 * s);
    ctx.stroke();
  },
  date(ctx, x, y, s) {
    ctx.beginPath();
    ctx.rect(x + 2.5 * s, y + 3.5 * s, 11 * s, 10 * s);
    line(ctx, x + 2.5 * s, y + 7 * s, x + 13.5 * s, y + 7 * s);
    line(ctx, x + 5.5 * s, y + 2 * s, x + 5.5 * s, y + 5 * s);
    line(ctx, x + 10.5 * s, y + 2 * s, x + 10.5 * s, y + 5 * s);
    ctx.stroke();
  },
  lookup(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x + 7 * s, y + 7 * s, 4 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, x + 10 * s, y + 10 * s, x + 13.5 * s, y + 13.5 * s);
    ctx.stroke();
  },
  checkbox(ctx, x, y, s) {
    ctx.beginPath();
    ctx.rect(x + 2.5 * s, y + 2.5 * s, 11 * s, 11 * s);
    ctx.stroke();
    ctx.beginPath();
    line(ctx, x + 5 * s, y + 8 * s, x + 7.5 * s, y + 10.5 * s);
    line(ctx, x + 7.5 * s, y + 10.5 * s, x + 11.5 * s, y + 5.5 * s);
    ctx.stroke();
  },
  phone(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, y + 3 * s);
    ctx.lineTo(x + 6.5 * s, y + 3 * s);
    ctx.lineTo(x + 7.5 * s, y + 6 * s);
    ctx.lineTo(x + 6 * s, y + 7 * s);
    ctx.quadraticCurveTo(x + 7.5 * s, y + 10 * s, x + 9 * s, y + 10 * s);
    ctx.lineTo(x + 10 * s, y + 8.5 * s);
    ctx.lineTo(x + 13 * s, y + 9.5 * s);
    ctx.lineTo(x + 13 * s, y + 12 * s);
    ctx.quadraticCurveTo(x + 6 * s, y + 13 * s, x + 4 * s, y + 3 * s);
    ctx.stroke();
  },
  email(ctx, x, y, s) {
    ctx.beginPath();
    ctx.rect(x + 2.5 * s, y + 4 * s, 11 * s, 8.5 * s);
    ctx.moveTo(x + 2.5 * s, y + 4.5 * s);
    ctx.lineTo(x + 8 * s, y + 9 * s);
    ctx.lineTo(x + 13.5 * s, y + 4.5 * s);
    ctx.stroke();
  },
  select(ctx, x, y, s) {
    ctx.beginPath();
    ctx.rect(x + 2.5 * s, y + 4 * s, 11 * s, 8 * s);
    ctx.moveTo(x + 9 * s, y + 7 * s);
    ctx.lineTo(x + 10.5 * s, y + 9 * s);
    ctx.lineTo(x + 12 * s, y + 7 * s);
    ctx.stroke();
  },
  money(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + 11 * s, y + 5 * s);
    ctx.quadraticCurveTo(x + 8 * s, y + 2.5 * s, x + 5.5 * s, y + 5 * s);
    ctx.quadraticCurveTo(x + 4 * s, y + 8 * s, x + 8 * s, y + 8 * s);
    ctx.quadraticCurveTo(x + 12 * s, y + 8 * s, x + 10.5 * s, y + 11 * s);
    ctx.quadraticCurveTo(x + 8 * s, y + 13.5 * s, x + 5 * s, y + 11 * s);
    ctx.moveTo(x + 8 * s, y + 2 * s);
    ctx.lineTo(x + 8 * s, y + 14 * s);
    ctx.stroke();
  },
  file(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, y + 2.5 * s);
    ctx.lineTo(x + 9.5 * s, y + 2.5 * s);
    ctx.lineTo(x + 12.5 * s, y + 5.5 * s);
    ctx.lineTo(x + 12.5 * s, y + 13.5 * s);
    ctx.lineTo(x + 4 * s, y + 13.5 * s);
    ctx.closePath();
    ctx.moveTo(x + 9.5 * s, y + 2.5 * s);
    ctx.lineTo(x + 9.5 * s, y + 5.5 * s);
    ctx.lineTo(x + 12.5 * s, y + 5.5 * s);
    ctx.stroke();
  },
  toggle(ctx, x, y, s) {
    ctx.beginPath();
    ctx.roundRect(x + 2 * s, y + 5 * s, 12 * s, 6.5 * s, 3.25 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 10.5 * s, y + 8.25 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
};

export function drawGlyph(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, s: number): void {
  const fn = glyphs[type];
  if (fn) {
    fn(ctx, x, y, s);
    return;
  }
  // Fallback: first letter in a box.
  ctx.beginPath();
  ctx.rect(x + 2.5 * s, y + 2.5 * s, 11 * s, 11 * s);
  ctx.stroke();
  ctx.font = `${Math.round(9 * s)}px ${ctx.font.split("px")[1] ?? "sans-serif"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type.charAt(0).toUpperCase(), x + 8 * s, y + 8.5 * s);
}
