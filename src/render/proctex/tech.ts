// Procedural "technical" textures: glass variants, mirror, LCD, PCB, IC packages, plain white,
// seven-segment display, appliance panels, keycaps, grilles, the city-window facade (emissive
// mask) and scorch. 256×256 canvas art in a late-PS2 style: readable at a glance, low noise.

import {
  SIZE,
  PIX,
  type TexOutput,
  type Channel,
  type Ctx2D,
  Img,
  Prng,
  channel,
  noise,
  fbm,
  cells,
  blur,
  whiteNoise,
  ridged,
  hex,
  css,
  smooth,
  clamp01,
  makeCanvas,
  readRGBA,
  putImg,
  rgbaChannel,
  maskFromCanvas,
  fitText,
  FONT_SANS,
  FONT_MONO,
  FONT_COND,
} from "./kit.ts";
import { drawSevenSeg, measureSevenSeg } from "./sevenseg.ts";

function roundRect(g: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}
export { roundRect };

// ------------------------------------------------------------------ glass family

function glass(): TexOutput {
  // nearly clear: faint wiping streaks + specks of dust (mostly visible in the roughness)
  const streak = noise(2, 40, 5001);
  const streak2 = noise(5, 90, 5002);
  const dust = whiteNoise(5003);
  const img = Img.solid(hex(0xf6f8f8));
  const rough = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      // diagonal wipe direction: sample the streak field along a skewed coordinate
      const s = streak[((y + (x >> 1)) & 255) * SIZE + x] * 0.6 + streak2[i] * 0.4;
      const w = smooth(0.62, 0.8, s);
      const d = dust[i] > 0.996 ? 1 : 0;
      const k = 1 - w * 0.035 - d * 0.12;
      img.r[i] *= k;
      img.g[i] *= k;
      img.b[i] *= k;
      rough[i] = 1 + w * 1.2 + d * 3;
    }
  return { rgba: img.toRGBA(), height: null, rough };
}

function glassFrosted(): TexOutput {
  const a = blur(whiteNoise(5101), 1, 1),
    b = noise(96, 96, 5102),
    m = fbm(4, 4, 3, 5103);
  const img = Img.solid(hex(0xf5f8f8));
  img.modulate(m, 0.02);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = a[i] * 0.6 + b[i] * 0.4;
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough: 1 };
}

function glassEdge(): TexOutput {
  // edge of float glass: green, with faint layering lines along the pane (U)
  const lines = noise(2, 128, 5201),
    m = fbm(3, 3, 3, 5202);
  const img = Img.solid(hex(0xa9dcc9));
  img.modulate(lines, 0.12).modulate(m, 0.06);
  return { rgba: img.toRGBA(), height: lines, bump: 0.6, rough: 1 };
}

function mirror(): TexOutput {
  // silvered glass: soft bright gradient, faint smudges and a slightly darker desilvered rim
  const sm = fbm(3, 3, 4, 5301),
    specks = whiteNoise(5302);
  const img = new Img();
  const rough = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      const gy = y / SIZE;
      const v = 0.95 + (1 - gy) * 0.04 + (sm[i] - 0.5) * 0.02 - (specks[i] > 0.998 ? 0.15 : 0);
      img.r[i] = v * 0.985;
      img.g[i] = v * 0.995;
      img.b[i] = v;
      rough[i] = 1 + smooth(0.6, 0.85, sm[i]) * 2.5;
    }
  return { rgba: img.toRGBA(), height: null, rough };
}

function lcd(): TexOutput {
  // switched-off panel: deep black, faint pixel grid and RGB sub-pixel columns
  const img = Img.solid(hex(0x07090b));
  const m = fbm(2, 2, 3, 5401);
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      const grid = x % 3 === 2 || y % 3 === 2 ? 0.6 : 1;
      const sub = x % 3;
      const k = (0.9 + m[i] * 0.2) * grid;
      img.r[i] = (0.02 + (sub === 0 ? 0.012 : 0)) * k;
      img.g[i] = (0.026 + (sub === 1 ? 0.012 : 0)) * k;
      img.b[i] = (0.032 + (sub === 2 ? 0.014 : 0)) * k;
    }
  return { rgba: img.toRGBA(), height: null, rough: 1 };
}

// ------------------------------------------------------------------ electronics

function pcb(): TexOutput {
  const c = makeCanvas();
  const g = c.g;
  const rng = new Prng(5501);
  const mask = Img.solid(hex(0x1f6b3c));
  mask.modulate(fbm(4, 4, 3, 5502), 0.08).modulate(noise(128, 128, 5503), 0.04);
  putImg(c, mask);
  // copper pours under the mask (slightly lighter areas)
  g.fillStyle = "rgba(70,150,90,0.35)";
  for (let k = 0; k < 4; k++) g.fillRect(rng.range(0, 200), rng.range(0, 200), rng.range(40, 90), rng.range(30, 70));
  // height / gloss masks drawn in parallel on a second canvas
  const hc = makeCanvas();
  const hg = hc.g;
  hg.fillStyle = "#000";
  hg.fillRect(0, 0, SIZE, SIZE);
  const pads: Array<[number, number]> = [];
  const icPads = (x: number, y: number, w: number, h: number, n: number): void => {
    // IC body outline (silkscreen) + pad rows on two sides
    g.strokeStyle = "rgba(235,235,225,0.9)";
    g.lineWidth = 1;
    g.strokeRect(x - 3, y - 3, w + 6, h + 6);
    g.beginPath();
    g.arc(x + 4, y + 4, 2, 0, Math.PI * 2);
    g.fillStyle = "rgba(235,235,225,0.9)";
    g.fill();
    const step = h / n;
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        const px = side < 0 ? x - 9 : x + w + 3;
        const py = y + i * step + step * 0.25;
        g.fillStyle = "#cdb46a";
        g.fillRect(px, py, 6, step * 0.5);
        hg.fillStyle = "#fff";
        hg.fillRect(px, py, 6, step * 0.5);
        pads.push([px + 3, py + step * 0.25]);
      }
    }
  };
  const ics = [
    [40, 40, 44, 60, 8],
    [150, 30, 30, 30, 4],
    [170, 150, 54, 54, 7],
    [40, 170, 36, 36, 5],
  ] as const;
  for (const [x, y, w, h, n] of ics) icPads(x, y, w, h, n);
  // two-pad SMD parts (resistors/caps)
  const labels: Array<[string, number, number]> = [];
  for (let k = 0; k < 26; k++) {
    const x = rng.range(10, 240),
      y = rng.range(10, 240);
    if (ics.some(([ix, iy, iw, ih]) => x > ix - 14 && x < ix + iw + 14 && y > iy - 10 && y < iy + ih + 10)) continue;
    const vert = rng.chance(0.5);
    const l = 9,
      pw = 3.5;
    g.fillStyle = "#cdb46a";
    hg.fillStyle = "#fff";
    if (vert) {
      g.fillRect(x - 2, y - l / 2, 4, pw);
      g.fillRect(x - 2, y + l / 2 - pw, 4, pw);
      hg.fillRect(x - 2, y - l / 2, 4, pw);
      hg.fillRect(x - 2, y + l / 2 - pw, 4, pw);
      pads.push([x, y - l / 2 + 1], [x, y + l / 2 - 1]);
    } else {
      g.fillRect(x - l / 2, y - 2, pw, 4);
      g.fillRect(x + l / 2 - pw, y - 2, pw, 4);
      hg.fillRect(x - l / 2, y - 2, pw, 4);
      hg.fillRect(x + l / 2 - pw, y - 2, pw, 4);
      pads.push([x - l / 2 + 1, y], [x + l / 2 - 1, y]);
    }
    g.strokeStyle = "rgba(235,235,225,0.75)";
    g.lineWidth = 0.8;
    if (vert) g.strokeRect(x - 4, y - l / 2 - 1.5, 8, l + 3);
    else g.strokeRect(x - l / 2 - 1.5, y - 4, l + 3, 8);
    labels.push([`${rng.pick(["R", "C", "C", "R", "L", "D"])}${rng.int(1, 48)}`, x + (vert ? 9 : 0), y + (vert ? 0 : 9)]);
  }
  // traces: manhattan routes with 45° chamfers between random pad pairs
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let k = 0; k < 38 && pads.length > 1; k++) {
    const a = rng.pick(pads),
      b = rng.pick(pads);
    if (a === b) continue;
    const wdt = rng.chance(0.15) ? 3.2 : 1.6;
    const midX = rng.chance(0.5);
    g.strokeStyle = "rgba(78,170,100,0.9)";
    g.lineWidth = wdt;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const ch = Math.min(Math.abs(dx), Math.abs(dy), 8) * 0.5;
    if (midX) {
      const mx = a[0] + dx * 0.5;
      g.lineTo(mx - Math.sign(dx) * ch, a[1]);
      g.lineTo(mx, a[1] + Math.sign(dy) * ch);
      g.lineTo(mx, b[1] - Math.sign(dy) * ch);
      g.lineTo(mx + Math.sign(dx) * ch, b[1]);
    } else {
      const my = a[1] + dy * 0.5;
      g.lineTo(a[0], my - Math.sign(dy) * ch);
      g.lineTo(a[0] + Math.sign(dx) * ch, my);
      g.lineTo(b[0] - Math.sign(dx) * ch, my);
      g.lineTo(b[0], my + Math.sign(dy) * ch);
    }
    g.lineTo(b[0], b[1]);
    g.stroke();
    hg.strokeStyle = "rgba(255,255,255,0.45)";
    hg.lineWidth = wdt;
    hg.stroke();
  }
  // vias
  for (let k = 0; k < 55; k++) {
    const x = rng.range(4, 252),
      y = rng.range(4, 252);
    g.fillStyle = "#c9a85a";
    g.beginPath();
    g.arc(x, y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0d1a10";
    g.beginPath();
    g.arc(x, y, 0.9, 0, Math.PI * 2);
    g.fill();
  }
  // header pins (through-hole row)
  for (let k = 0; k < 8; k++) {
    const x = 104 + k * 8,
      y = 236;
    g.fillStyle = "#d2b45e";
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#101010";
    g.beginPath();
    g.arc(x, y, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  // silkscreen labels
  g.fillStyle = "rgba(240,240,230,0.92)";
  for (const [t, x, y] of labels) fitText(g, t, x, y, 16, 6, FONT_SANS, "bold");
  fitText(g, "U1", 62, 112, 20, 8, FONT_SANS, "bold");
  fitText(g, "U2", 165, 70, 20, 8, FONT_SANS, "bold");
  fitText(g, "U3", 197, 216, 20, 8, FONT_SANS, "bold");
  fitText(g, "J1", 98, 225, 20, 7, FONT_SANS, "bold");
  fitText(g, "MW-CTRL REV2.1", 128, 136, 110, 9, FONT_SANS, "bold");
  fitText(g, "94V-0  E217431", 128, 147, 90, 6, FONT_SANS, "normal");
  const d = readRGBA(c);
  const hm = rgbaChannel(readRGBA(hc), 0);
  const img = Img.fromRGBA(d);
  const h = channel();
  const rough = channel();
  for (let i = 0; i < PIX; i++) {
    h[i] = 0.3 + hm[i] * 0.6;
    rough[i] = 1 - hm[i] * 0.5;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2, rough };
}

function icChip(): TexOutput {
  // black epoxy package tops (2×2 markings so any small face shows one), laser marking
  const c = makeCanvas();
  const g = c.g;
  const ep = Img.solid(hex(0x161617));
  ep.modulate(blur(whiteNoise(5601), 1, 1), 0.2).modulate(fbm(4, 4, 3, 5602), 0.08);
  putImg(c, ep);
  const parts = [
    ["ATMEGA328P", "AU 2318", "e3"],
    ["STM32F103", "C8T6  GH21", "ARM"],
    ["NE555P", "J4X 1922", "TI"],
    ["74HC595N", "8C 2245", "NXP"],
  ];
  for (let k = 0; k < 4; k++) {
    const cx = (k % 2) * 128 + 64,
      cy = Math.floor(k / 2) * 128 + 64;
    g.fillStyle = "rgba(10,10,10,0.9)";
    g.beginPath();
    g.arc(cx - 40, cy - 38, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(90,90,90,0.6)";
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = "rgba(150,150,150,0.85)";
    fitText(g, parts[k][0], cx, cy - 6, 104, 17, FONT_MONO, "bold");
    fitText(g, parts[k][1], cx, cy + 16, 96, 13, FONT_MONO, "normal");
    g.strokeStyle = "rgba(150,150,150,0.7)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx + 34, cy + 40, 9, 0, Math.PI * 2);
    g.stroke();
    fitText(g, parts[k][2], cx + 34, cy + 40, 14, 8, FONT_SANS, "bold");
  }
  const d = readRGBA(c);
  const lum = rgbaChannel(d, 4);
  const rough = channel();
  for (let i = 0; i < PIX; i++) rough[i] = 1 + lum[i] * 0.6; // laser marks are matte
  return { rgba: d, height: lum, bump: 0.6, rough };
}

function white(): TexOutput {
  const rgba = new Uint8ClampedArray(PIX * 4).fill(255);
  return { rgba, height: null, rough: 1 };
}

// ------------------------------------------------------------------ displays & panels

function displayDigits(): TexOutput {
  // "12:00" seven-segment: white lit segments (tinted green/blue by the surface), faint unlit
  // segments; emissive mask = lit segments + soft glow.
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#070907";
  g.fillRect(0, 0, SIZE, SIZE);
  const dw = 34,
    dh = 64,
    gap = 10;
  const text = "12:00";
  const w = measureSevenSeg(text, dw, dh, gap);
  const x0 = (SIZE - w - 26) / 2,
    y0 = (SIZE - dh) / 2;
  // unlit segments (faintly visible through the filter), then the lit time
  drawSevenSeg(g, "88:88", x0, y0, dw, dh, gap, { on: "#1a1e1a", off: null, thick: 0.2 });
  drawSevenSeg(g, text, x0, y0, dw, dh, gap, { on: "#f2f2f2", off: null, thick: 0.2 });
  fitText(g, "PM", x0 + w + 6, y0 + 8, 22, 12, FONT_SANS, "bold", "left");
  const lit = maskFromCanvas((m) => {
    drawSevenSeg(m, text, x0, y0, dw, dh, gap, { on: "#fff", off: null, thick: 0.2 });
    fitText(m, "PM", x0 + w + 6, y0 + 8, 22, 12, FONT_SANS, "bold", "left");
  });
  const glow = blur(Float32Array.from(lit), 4, 2);
  const em = channel();
  for (let i = 0; i < PIX; i++) em[i] = clamp01(lit[i] + glow[i] * 0.35);
  return { rgba: readRGBA(c), height: null, rough: 1, emissive: em };
}

function panelMicrowave(): TexOutput {
  // 10 × 10 cm control panel: display window + function row + labelled 3×4 keypad
  const c = makeCanvas();
  const g = c.g;
  const base = Img.solid(hex(0x232427));
  base.modulate(noise(128, 128, 5701), 0.05).modulate(fbm(3, 3, 3, 5702), 0.05);
  putImg(c, base);
  const hc = makeCanvas();
  hc.g.fillStyle = "#808080";
  hc.g.fillRect(0, 0, SIZE, SIZE);
  // display window
  g.fillStyle = "#050607";
  roundRect(g, 18, 12, 220, 46, 6);
  g.fill();
  g.strokeStyle = "#45474c";
  g.lineWidth = 2;
  g.stroke();
  hc.g.fillStyle = "#606060";
  roundRect(hc.g, 18, 12, 220, 46, 6);
  hc.g.fill();
  // function buttons
  const fn = ["POPCORN", "DEFROST", "POWER", "TIMER"];
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 57;
    g.fillStyle = "#34363b";
    roundRect(g, x, 68, 51, 24, 5);
    g.fill();
    hc.g.fillStyle = "#c0c0c0";
    roundRect(hc.g, x, 68, 51, 24, 5);
    hc.g.fill();
    g.fillStyle = "#e8e8e8";
    fitText(g, fn[i], x + 25.5, 80, 46, 10, FONT_SANS, "bold");
  }
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "START", "0", "STOP"];
  for (let k = 0; k < 12; k++) {
    const col = k % 3,
      row = Math.floor(k / 3);
    const x = 26 + col * 70,
      y = 102 + row * 37;
    const special = keys[k] === "START" || keys[k] === "STOP";
    const grd = g.createLinearGradient(0, y, 0, y + 30);
    grd.addColorStop(0, special ? (keys[k] === "START" ? "#2f6d3a" : "#7a2a26") : "#45484e");
    grd.addColorStop(1, special ? (keys[k] === "START" ? "#24552d" : "#5e201d") : "#33363b");
    g.fillStyle = grd;
    roundRect(g, x, y, 62, 30, 6);
    g.fill();
    hc.g.fillStyle = "#e0e0e0";
    roundRect(hc.g, x, y, 62, 30, 6);
    hc.g.fill();
    g.fillStyle = "#f0f0f0";
    fitText(g, keys[k], x + 31, y + 15, 56, special ? 13 : 17, FONT_SANS, "bold");
  }
  g.fillStyle = "#9a9ca2";
  fitText(g, "SENSOR COOK  ·  1000 W", 128, 252, 220, 8, FONT_SANS, "normal");
  const h = rgbaChannel(readRGBA(hc), 0);
  blur(h, 1, 1);
  return { rgba: readRGBA(c), height: h, bump: 2.5, rough: 1 };
}

function panelAppliance(): TexOutput {
  // 30 cm range control strip: black glass, four burner knob scales with legends
  const c = makeCanvas();
  const g = c.g;
  const base = Img.solid(hex(0x1c1d20));
  base.modulate(fbm(3, 3, 3, 5801), 0.08);
  putImg(c, base);
  const names = ["FRONT L", "REAR L", "REAR R", "FRONT R"];
  for (let k = 0; k < 4; k++) {
    const cx = 32 + k * 64,
      cy = 120;
    // knob recess
    g.fillStyle = "#121315";
    g.beginPath();
    g.arc(cx, cy, 21, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#5a5c62";
    g.lineWidth = 1.5;
    g.stroke();
    // scale
    g.strokeStyle = "#e6e6e6";
    g.fillStyle = "#e6e6e6";
    for (let t = 0; t <= 10; t++) {
      const a = -Math.PI * 0.5 + (t / 10) * Math.PI * 1.6;
      const r0 = 24,
        r1 = t % 5 === 0 ? 30 : 27;
      g.lineWidth = t % 5 === 0 ? 1.6 : 1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }
    fitText(g, "OFF", cx, cy - 36, 22, 8, FONT_SANS, "bold");
    fitText(g, "HI", cx + 34, cy - 10, 14, 7, FONT_SANS, "bold");
    fitText(g, "LO", cx - 28, cy + 26, 14, 7, FONT_SANS, "bold");
    fitText(g, names[k], cx, cy + 46, 56, 8, FONT_SANS, "bold");
    // burner map icon: which burner this knob controls
    const ix = cx - 8,
      iy = 52;
    for (let b = 0; b < 4; b++) {
      const bx = ix + (b % 2) * 16,
        by = iy + Math.floor(b / 2) * 14;
      const map = [2, 0, 1, 3][k];
      g.beginPath();
      g.arc(bx, by, 4.5, 0, Math.PI * 2);
      if (b === map) g.fill();
      else {
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }
  g.fillStyle = "#bdbdbd";
  fitText(g, "BAKE · BROIL · CONV", 128, 214, 200, 10, FONT_SANS, "bold");
  fitText(g, "150   200   250   300 °C", 128, 232, 200, 9, FONT_SANS, "normal");
  const d = readRGBA(c);
  return { rgba: d, height: null, rough: 1 };
}

function keycaps(): TexOutput {
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#111214";
  g.fillRect(0, 0, SIZE, SIZE);
  const hc = makeCanvas();
  hc.g.fillStyle = "#000";
  hc.g.fillRect(0, 0, SIZE, SIZE);
  const rows = [
    ["1", "2", "3", "4", "5"],
    ["Q", "W", "E", "R", "T"],
    ["A", "S", "D", "F", "G"],
    ["Z", "X", "C", "V", "B"],
  ];
  const p = SIZE / 5;
  const key = (x: number, y: number, w: number, label: string): void => {
    const grd = g.createLinearGradient(0, y, 0, y + p);
    grd.addColorStop(0, "#3a3b40");
    grd.addColorStop(1, "#26272b");
    g.fillStyle = grd;
    roundRect(g, x + 3, y + 3, w - 6, p - 6, 6);
    g.fill();
    g.fillStyle = "#2f3035";
    roundRect(g, x + 8, y + 6, w - 16, p - 17, 5);
    g.fill();
    hc.g.fillStyle = "#b0b0b0";
    roundRect(hc.g, x + 3, y + 3, w - 6, p - 6, 6);
    hc.g.fill();
    hc.g.fillStyle = "#fff";
    roundRect(hc.g, x + 8, y + 6, w - 16, p - 17, 5);
    hc.g.fill();
    g.fillStyle = "#d9d9d9";
    if (label) fitText(g, label, x + 16, y + 18, w - 20, 15, FONT_SANS, "normal", "left");
  };
  for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) key(k * p, r * p, p, rows[r][k]);
  key(0, 4 * p, p * 1.25, "Ctrl");
  key(p * 1.25, 4 * p, SIZE - p * 1.25, "");
  const h = rgbaChannel(readRGBA(hc), 0);
  blur(h, 1, 1);
  return { rgba: readRGBA(c), height: h, bump: 3, rough: 1 };
}

function grille(): TexOutput {
  // perforated sheet: staggered round holes on a light ground (surface tint colours it)
  const cols = 16,
    rows = 18;
  const holes = maskFromCanvas((g) => {
    const px = SIZE / cols,
      py = SIZE / rows;
    for (let r = 0; r <= rows; r++)
      for (let k = -1; k <= cols; k++) {
        const x = k * px + (r % 2 ? px / 2 : 0) + px / 2,
          y = r * py + py / 2;
        g.beginPath();
        g.arc(x, y, px * 0.3, 0, Math.PI * 2);
        g.fill();
      }
  });
  const img = Img.solid(hex(0xdedede));
  const n = noise(64, 64, 5901);
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const k = (1 - holes[i] * 0.94) * (0.97 + n[i] * 0.06);
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = 1 - holes[i];
  }
  return { rgba: img.toRGBA(), height: h, bump: 3, rough: 1 };
}

// ------------------------------------------------------------------ city & damage

function cityWindows(): TexOutput {
  // 12 m of facade: 4 storeys × 8 bays. Lit windows (warm/cool interiors) form the emissive mask.
  const c = makeCanvas();
  const g = c.g;
  const rng = new Prng(6001);
  const fac = Img.solid(hex(0x7e7a73));
  fac.modulate(fbm(4, 4, 4, 6002), 0.12).modulate(noise(96, 96, 6003), 0.05);
  putImg(c, fac);
  const em = makeCanvas();
  em.g.fillStyle = "#000";
  em.g.fillRect(0, 0, SIZE, SIZE);
  const floorH = SIZE / 4,
    bayW = SIZE / 8;
  for (let f = 0; f < 4; f++) {
    const y0 = f * floorH;
    // slab edge band
    g.fillStyle = "rgba(60,58,55,0.55)";
    g.fillRect(0, y0 + floorH - 6, SIZE, 6);
    for (let b = 0; b < 8; b++) {
      const x = b * bayW + 4,
        y = y0 + 12,
        w = bayW - 8,
        h = floorH - 24;
      const lit = rng.chance(0.38);
      if (lit) {
        const warm = rng.pick(["#ffd08a", "#ffc070", "#ffe3b0", "#fff2dc", "#f4f0ff"]);
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, warm);
        grd.addColorStop(1, "#b07a40");
        g.fillStyle = grd;
        g.fillRect(x, y, w, h);
        // blinds / curtains
        const style = rng.int(0, 3);
        if (style === 1) {
          g.fillStyle = "rgba(90,60,30,0.35)";
          for (let k = 0; k < h; k += 3) g.fillRect(x, y + k, w, 1);
        } else if (style === 2) {
          g.fillStyle = "rgba(120,70,50,0.6)";
          g.fillRect(x, y, w * 0.28, h);
          g.fillRect(x + w * 0.72, y, w * 0.28, h);
        } else if (style === 3) {
          g.fillStyle = "rgba(60,40,25,0.55)";
          g.fillRect(x + w * 0.3, y + h * 0.45, w * 0.3, h * 0.55);
        }
        em.g.fillStyle = `rgba(255,255,255,${rng.range(0.7, 1)})`;
        em.g.fillRect(x, y, w, h);
      } else {
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, "#5d6e80");
        grd.addColorStop(0.5, "#2a3542");
        grd.addColorStop(1, "#1a222b");
        g.fillStyle = grd;
        g.fillRect(x, y, w, h);
      }
      // mullions
      g.fillStyle = "#3a3c3e";
      g.fillRect(x + w / 2 - 0.75, y, 1.5, h);
      g.fillRect(x, y + h * 0.3, w, 1.2);
      g.strokeStyle = "#45474a";
      g.lineWidth = 1.5;
      g.strokeRect(x, y, w, h);
    }
  }
  const emis = rgbaChannel(readRGBA(em), 0);
  return { rgba: readRGBA(c), height: null, rough: 1, emissive: emis };
}

function scorch(): TexOutput {
  // charred surface: black char with crackle (alligatoring) and grey ash
  const cr = cells(18, 6101),
    ash = fbm(5, 5, 4, 6102),
    g = whiteNoise(6103),
    rd = ridged(6, 6, 3, 6104);
  const img = new Img();
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const edge = cr.f2[i] - cr.f1[i];
    const crack = smooth(0.05, 0.0, edge);
    const a = smooth(0.55, 0.85, ash[i]) * 0.5 + rd[i] * 0.1;
    const v = 0.06 + a * 0.35 + (g[i] - 0.5) * 0.04 - crack * 0.05;
    img.r[i] = clamp01(v * 1.05 + crack * 0.0);
    img.g[i] = clamp01(v * 0.98);
    img.b[i] = clamp01(v * 0.92);
    h[i] = (1 - crack) * 0.6 + (1 - cr.f1[i]) * 0.3 + g[i] * 0.1;
  }
  return { rgba: img.toRGBA(), height: h, bump: 3, rough: 1 };
}

export const TECH_GENERATORS: Readonly<Record<string, () => TexOutput>> = {
  glass,
  glass_frosted: glassFrosted,
  glass_edge: glassEdge,
  mirror,
  lcd,
  pcb,
  ic_chip: icChip,
  white,
  display_digits: displayDigits,
  panel_microwave: panelMicrowave,
  panel_appliance: panelAppliance,
  keycaps,
  grille,
  city_windows: cityWindows,
  scorch,
};
