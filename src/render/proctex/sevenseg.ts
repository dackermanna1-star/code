// Seven-segment digit rendering on a 2D canvas (appliance displays, microwave clocks).
// Shared by the display_digits texture and the animated microwave screen in screens.ts.

import type { Ctx2D } from "./kit.ts";

//  aaa
// f   b
//  ggg
// e   c
//  ddd
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  E: "afged",
  r: "eg",
  o: "cdeg",
  n: "ceg",
  d: "bcdeg",
  F: "afge",
  " ": "",
};

/** Hexagonal segment polygon between (x0,y0) and (x1,y1) with thickness t. */
function segPath(g: Ctx2D, x0: number, y0: number, x1: number, y1: number, t: number): void {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len,
    uy = dy / len;
  const nx = -uy * t * 0.5,
    ny = ux * t * 0.5;
  const tip = t * 0.5;
  g.moveTo(x0, y0);
  g.lineTo(x0 + ux * tip + nx, y0 + uy * tip + ny);
  g.lineTo(x1 - ux * tip + nx, y1 - uy * tip + ny);
  g.lineTo(x1, y1);
  g.lineTo(x1 - ux * tip - nx, y1 - uy * tip - ny);
  g.lineTo(x0 + ux * tip - nx, y0 + uy * tip - ny);
  g.closePath();
}

export interface SevenSegStyle {
  on: string;
  /** Colour of unlit segments (null = not drawn). */
  off: string | null;
  /** Segment thickness relative to digit width. */
  thick?: number;
  /** Horizontal slant (fraction of height). */
  slant?: number;
}

/**
 * Draw `text` (digits, '-', ':', '.', ' ') with its top-left at (x, y), each digit dw × dh
 * pixels, `gap` pixels between digits. Returns the drawn width.
 */
export function drawSevenSeg(g: Ctx2D, text: string, x: number, y: number, dw: number, dh: number, gap: number, style: SevenSegStyle): number {
  const t = dw * (style.thick ?? 0.2);
  const sl = (style.slant ?? 0.08) * dh;
  let cx = x;
  const skew = (px: number, py: number): [number, number] => [px + sl * (1 - (py - y) / dh), py];
  for (const ch of text) {
    if (ch === ":" || ch === ".") {
      const r = t * 0.55;
      const dots = ch === ":" ? [y + dh * 0.32, y + dh * 0.7] : [y + dh - r];
      g.fillStyle = style.on;
      for (const dy of dots) {
        const [px, py] = skew(cx + r * 1.4, dy);
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
      }
      cx += r * 2.8 + gap;
      continue;
    }
    const lit = SEGMENTS[ch] ?? "";
    const m = t * 0.6; // inset of segment ends from the digit corners
    const L = cx + m * 0.3,
      R = cx + dw - m * 0.3;
    const T = y + m * 0.3,
      M = y + dh / 2,
      B = y + dh - m * 0.3;
    const segs: Record<string, [number, number, number, number]> = {
      a: [L + m, T, R - m, T],
      b: [R, T + m, R, M - m * 0.6],
      c: [R, M + m * 0.6, R, B - m],
      d: [L + m, B, R - m, B],
      e: [L, M + m * 0.6, L, B - m],
      f: [L, T + m, L, M - m * 0.6],
      g: [L + m, M, R - m, M],
    };
    for (const k of "abcdefg") {
      const on = lit.includes(k);
      if (!on && !style.off) continue;
      g.fillStyle = on ? style.on : (style.off as string);
      const s = segs[k];
      const [ax, ay] = skew(s[0], s[1]);
      const [bx, by] = skew(s[2], s[3]);
      g.beginPath();
      segPath(g, ax, ay, bx, by, t);
      g.fill();
    }
    cx += dw + gap;
  }
  return cx - x - gap;
}

/** Width that drawSevenSeg would use (for centring). */
export function measureSevenSeg(text: string, dw: number, dh: number, gap: number, thick = 0.2): number {
  const t = dw * thick;
  let w = 0;
  for (const ch of text) w += (ch === ":" || ch === "." ? t * 0.55 * 2.8 : dw) + gap;
  return Math.max(0, w - gap);
}
