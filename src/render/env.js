// Environment rendering: backdrop, interiors, structure, stairs, hazards and
// decor for all four themes. Everything is vector-drawn so it stays crisp at
// any camera zoom. World units; the caller sets the camera transform.

import { PALETTES, shade, mix } from './palettes.js';
import { RNG } from '../core/rng.js';
import { clamp } from '../core/math.js';

const TAU = Math.PI * 2;

function rect(ctx, x, y, w, h, fill, stroke, lw) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2.5;
    ctx.strokeRect(x, y, w, h);
  }
}

function line(ctx, x0, y0, x1, y1, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function visible(v, x0, x1, y0, y1) {
  return x1 > v.x0 - 40 && x0 < v.x1 + 40 && y1 > v.y0 - 40 && y0 < v.y1 + 40;
}

export class EnvRenderer {
  constructor() {
    this.cache = new Map();
  }

  setLevel(level) {
    this.L = level;
    this.P = PALETTES[level.theme] || PALETTES.facility;
    this.cache.clear();
    const rng = new RNG(level.seed ^ 0x77);
    // backdrop skyline layers (deterministic per level)
    this.skyline = [0, 1, 2].map((layer) => {
      const items = [];
      let x = -3000;
      while (x < level.width + 3000) {
        const w = rng.range(70, 210) * (1 + layer * 0.3);
        const h = rng.range(140, 520) * (1 - layer * 0.18);
        items.push({ x, w, h, lit: rng.next(), seed: rng.int(0, 1e6), antenna: rng.chance(0.25) });
        x += w + rng.range(-10, 40);
      }
      return items;
    });
    this.clouds = [];
    for (let i = 0; i < 9; i++) this.clouds.push({ x: rng.range(-2000, level.width + 2000), y: rng.range(-1300, -650), w: rng.range(160, 420), s: rng.range(4, 12) });
    for (const d of level.decor) {
      if (d.type === 'skylight') d.solid = level.windows.find((w) => w.kind === 'skylight' && w.x === d.x && w.y === d.y) || null;
    }
    this.stars = [];
    for (let i = 0; i < 80; i++) this.stars.push({ x: rng.range(-2500, level.width + 2500), y: rng.range(-1800, -700), r: rng.range(0.6, 1.8), tw: rng.next() * 6 });
  }

  // ----------------------------------------------------------- backdrop
  drawBackdrop(ctx, cam, view, t) {
    const L = this.L;
    const P = this.P;
    const top = view.y0 - 200;
    const bot = view.y1 + 200;
    // sky gradient in world space
    const g = ctx.createLinearGradient(0, L.bounds.top - 600, 0, 200);
    if (L.theme === 'rooftop') {
      g.addColorStop(0, P.skyTop);
      g.addColorStop(0.55, P.skyMid);
      g.addColorStop(1, P.skyBottom);
    } else {
      g.addColorStop(0, P.skyTop);
      g.addColorStop(1, P.skyBottom);
    }
    ctx.fillStyle = g;
    ctx.fillRect(view.x0 - 100, top, view.x1 - view.x0 + 200, bot - top);
    if (L.theme === 'rooftop') {
      for (const s of this.stars) {
        const px = s.x + (cam.x - s.x) * 0.92;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.tw);
        ctx.fillStyle = '#fff4e6';
        ctx.fillRect(px, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // low sun
      const sx = cam.x * 0.9 + L.width * 0.1 - 300;
      const sg = ctx.createRadialGradient(sx, 60, 10, sx, 60, 520);
      sg.addColorStop(0, 'rgba(255,226,170,0.95)');
      sg.addColorStop(0.18, 'rgba(255,190,120,0.55)');
      sg.addColorStop(1, 'rgba(255,150,110,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 520, -460, 1040, 1040);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const c of this.clouds) {
        const px = c.x + (cam.x - c.x) * 0.85 + t * c.s;
        ctx.beginPath();
        ctx.ellipse(px, c.y, c.w * 0.5, c.w * 0.12, 0, 0, TAU);
        ctx.ellipse(px + c.w * 0.18, c.y - c.w * 0.06, c.w * 0.26, c.w * 0.1, 0, 0, TAU);
        ctx.fill();
      }
    }
    // skyline layers with parallax
    const cols = L.theme === 'rooftop' ? [P.city3 || P.city2, P.city2, P.city] : [P.city2, P.city, mix(P.city, P.skyBottom, 0.45)];
    const groundY = L.theme === 'rooftop' ? 380 : 0;
    for (let layer = 2; layer >= 0; layer--) {
      const par = [0.45, 0.62, 0.78][layer];
      const color = cols[layer];
      ctx.fillStyle = color;
      for (const b of this.skyline[layer]) {
        // far layers drift with the camera (par = 1 would be infinitely far)
        const x = b.x + cam.x * par;
        const by = groundY + cam.y * par * 0.35;
        if (x + b.w < view.x0 - 200 || x > view.x1 + 200) continue;
        ctx.fillRect(x, by - b.h, b.w, b.h + 600);
        if (b.antenna) ctx.fillRect(x + b.w * 0.5 - 2, by - b.h - 50, 3, 50);
        if (L.theme === 'rooftop' && layer < 2) {
          const wr = new RNG(b.seed);
          ctx.fillStyle = P.windowLit;
          for (let wy = by - b.h + 14; wy < by - 20; wy += 22) {
            for (let wx = x + 8; wx < x + b.w - 10; wx += 16) {
              if (wr.next() < 0.22 + b.lit * 0.2) {
                ctx.globalAlpha = 0.25 + wr.next() * 0.45;
                ctx.fillRect(wx, wy, 7, 9);
              }
            }
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
        }
      }
    }
    if (L.theme === 'construction') this.drawCraneSilhouettes(ctx, cam, view);
  }

  drawCraneSilhouettes(ctx, cam, view) {
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.lineWidth = 4;
    for (const cx0 of [-900, this.L.width * 0.6, this.L.width + 1400]) {
      const cx = cx0 + (cam.x - cx0) * 0.55;
      if (cx < view.x0 - 900 || cx > view.x1 + 900) continue;
      ctx.beginPath();
      ctx.moveTo(cx, 200);
      ctx.lineTo(cx, -1100);
      ctx.lineTo(cx + 700, -1100);
      ctx.moveTo(cx - 200, -1100);
      ctx.lineTo(cx, -1100);
      ctx.moveTo(cx, -1180);
      ctx.lineTo(cx + 500, -1100);
      ctx.moveTo(cx, -1180);
      ctx.lineTo(cx - 200, -1100);
      ctx.stroke();
    }
  }

  // Interior walls (indoor themes): the building box behind everything.
  drawInterior(ctx, view) {
    const L = this.L;
    const P = this.P;
    if (L.outdoor) return;
    const roof = L.bounds.top + 30;
    ctx.fillStyle = P.interior;
    ctx.fillRect(-2, roof, L.width + 4, -roof);
    // panel seams
    ctx.strokeStyle = P.seam;
    ctx.lineWidth = 2;
    const step = L.theme === 'warehouse' ? 22 : 190;
    ctx.beginPath();
    for (let x = Math.max(0, Math.floor(view.x0 / step) * step); x < Math.min(L.width, view.x1); x += step) {
      ctx.moveTo(x, roof);
      ctx.lineTo(x, 0);
    }
    ctx.stroke();
    if (L.theme === 'warehouse') {
      // clerestory windows high on the back wall
      const y = roof + 60;
      for (let x = 160; x < L.width - 200; x += 420) {
        if (x + 220 < view.x0 || x > view.x1) continue;
        rect(ctx, x, y, 220, 70, 'rgba(255,236,200,0.65)', P.metalDark, 3);
        for (let k = 1; k < 4; k++) line(ctx, x + k * 55, y, x + k * 55, y + 70, P.metalDark, 2);
        // light shafts
        const g = ctx.createLinearGradient(0, y, 0, 0);
        g.addColorStop(0, 'rgba(255,230,180,0.18)');
        g.addColorStop(1, 'rgba(255,230,180,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y + 70);
        ctx.lineTo(x + 220, y + 70);
        ctx.lineTo(x + 420, 0);
        ctx.lineTo(x + 140, 0);
        ctx.closePath();
        ctx.fill();
      }
    }
    // baseboards per floor
    for (const f of L.floors) {
      if (f.partial) continue;
      ctx.fillStyle = shade(P.interior, -0.06);
      ctx.fillRect(Math.max(0, f.x0), f.y - 8, Math.min(L.width, f.x1) - Math.max(0, f.x0), 8);
    }
  }

  // ------------------------------------------------------------- decor
  drawDecor(ctx, sim, view, t, layer) {
    const L = this.L;
    for (const d of L.decor) {
      const fn = DECOR[d.type];
      if (!fn) continue;
      const lay = DECOR_LAYER[d.type] || 'back';
      if (lay !== layer) continue;
      if (!this.decorVisible(d, view)) continue;
      fn(ctx, d, this.P, t, sim, this);
    }
  }

  decorVisible(d, v) {
    if (d.x0 !== undefined) return visible(v, d.x0, d.x1, (d.y || 0) - 600, (d.y || 0) + 3200);
    if (d.pts) return true;
    const x = d.x;
    return visible(v, x - 900, x + 900, (d.y || 0) - 1200, (d.y || 0) + 3200);
  }

  // -------------------------------------------------------------- stairs
  drawStairs(ctx, view) {
    const P = this.P;
    for (const st of this.L.stairs) {
      if (!visible(view, st.x0, st.x1, st.yTop, st.yBottom)) continue;
      const style = st.style;
      const n = st.n;
      ctx.beginPath();
      ctx.moveTo(st.xBottom, st.yBottom);
      for (let i = 1; i <= n; i++) {
        const xa = st.xBottom + st.dir * (i - 1) * st.stepW;
        const xb = st.xBottom + st.dir * i * st.stepW;
        const y = st.yBottom - i * st.stepH;
        ctx.lineTo(xa, y);
        ctx.lineTo(xb, y);
      }
      // underside (stringer)
      const thick = style === 'concrete' ? 26 : 12;
      ctx.lineTo(st.xTop, st.yTop + thick);
      ctx.lineTo(st.xBottom + st.dir * thick * 0.6, st.yBottom);
      ctx.closePath();
      if (style === 'concrete') {
        ctx.fillStyle = P.stairs;
        ctx.fill();
        ctx.strokeStyle = P.outline;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = style === 'wood' ? 'rgba(170,125,70,0.85)' : 'rgba(110,116,124,0.55)';
        ctx.fill();
        ctx.strokeStyle = style === 'wood' ? '#5a3c1c' : P.metalDark;
        ctx.lineWidth = 2;
        ctx.stroke();
        // treads
        ctx.strokeStyle = style === 'wood' ? '#c69a5d' : P.metalLight;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let i = 1; i <= n; i++) {
          const xa = st.xBottom + st.dir * (i - 1) * st.stepW;
          const xb = st.xBottom + st.dir * i * st.stepW;
          const y = st.yBottom - i * st.stepH + 1.5;
          ctx.moveTo(xa, y);
          ctx.lineTo(xb, y);
        }
        ctx.stroke();
        // handrail
        ctx.strokeStyle = style === 'wood' ? '#7a5428' : P.metalDark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(st.xBottom, st.yBottom - 44);
        ctx.lineTo(st.xTop, st.yTop - 44);
        ctx.stroke();
        for (let i = 0; i <= n; i += 4) {
          const x = st.xBottom + st.dir * i * st.stepW;
          const y = st.yBottom - i * st.stepH;
          line(ctx, x, y, x, y - 44, style === 'wood' ? '#7a5428' : P.metalDark, 2);
        }
      }
    }
  }

  // ------------------------------------------------------------ hazards
  drawHazards(ctx, sim, view, t) {
    const P = this.P;
    for (const hz of sim.hazards.list) {
      if (!visible(view, hz.x - 120, hz.x + 120, hz.y - 300, hz.y + 10)) continue;
      if (hz.type === 'electric') drawElectric(ctx, hz, P, t);
      else if (hz.type === 'steam') drawSteamPipe(ctx, hz, P, t);
    }
  }

  // ----------------------------------------------------------- structure
  drawStructure(ctx, view) {
    const L = this.L;
    const P = this.P;
    for (const s of L.solids) {
      if (s.broken || s.step || s.kind === 'bounds') continue;
      if (!visible(view, s.x, s.x + s.w, s.y, s.y + Math.min(s.h, 900))) continue;
      switch (s.kind) {
        case 'ground':
          this.drawGround(ctx, s, view);
          break;
        case 'floor':
        case 'ceiling':
          this.drawSlab(ctx, s);
          break;
        case 'wall':
          rect(ctx, s.x, s.y, s.w, s.h, P.wall, null);
          ctx.fillStyle = P.wallDark;
          ctx.fillRect(s.x + s.w * 0.75, s.y, s.w * 0.25, s.h);
          ctx.strokeStyle = P.outline;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(s.x, s.y, s.w, s.h);
          break;
        case 'lintel':
          rect(ctx, s.x, s.y, s.w, s.h, P.wall, P.outline, 2.5);
          break;
        case 'roof':
          this.drawRoofTop(ctx, s);
          break;
        default:
          break;
      }
    }
  }

  drawGround(ctx, s, view) {
    const L = this.L;
    const P = this.P;
    const x0 = Math.max(s.x, view.x0 - 50);
    const x1 = Math.min(s.x + s.w, view.x1 + 50);
    if (L.theme === 'construction') {
      ctx.fillStyle = '#b9ad94';
      ctx.fillRect(x0, s.y, x1 - x0, 24);
      ctx.fillStyle = '#9d907a';
      ctx.fillRect(x0, s.y + 24, x1 - x0, 400);
      line(ctx, x0, s.y, x1, s.y, P.outline, 2.5);
      // concrete pad under the building
      rect(ctx, -20, s.y, L.width + 40, 26, P.slabTop, P.outline, 2.5);
      return;
    }
    ctx.fillStyle = P.slabTop;
    ctx.fillRect(x0, s.y, x1 - x0, 28);
    ctx.fillStyle = P.ground;
    ctx.fillRect(x0, s.y + 28, x1 - x0, 500);
    line(ctx, x0, s.y, x1, s.y, P.outline, 3);
    line(ctx, x0, s.y + 28, x1, s.y + 28, P.outline, 2.5);
  }

  drawSlab(ctx, s) {
    const L = this.L;
    const P = this.P;
    if (L.theme === 'construction') {
      rect(ctx, s.x, s.y, s.w, s.h, P.slabTop, P.outline, 2.5);
      ctx.strokeStyle = shade(P.slabTop, -0.15);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = s.x + 60; x < s.x + s.w; x += 120) {
        ctx.moveTo(x, s.y + 6);
        ctx.lineTo(x, s.y + s.h - 6);
      }
      ctx.stroke();
      // rebar stubs at the free ends
      ctx.strokeStyle = '#7a4a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const ex of [s.x, s.x + s.w]) {
        const dir = ex === s.x ? -1 : 1;
        for (let k = 0; k < 3; k++) {
          ctx.moveTo(ex, s.y + 8 + k * 9);
          ctx.lineTo(ex + dir * 14, s.y + 6 + k * 9);
        }
      }
      ctx.stroke();
      return;
    }
    const plate = Math.min(18, s.h);
    rect(ctx, s.x, s.y, s.w, plate, P.slabTop, null);
    if (s.h > plate) {
      // ceiling void: big duct band
      const dy = s.y + plate;
      const dh = s.h - plate;
      rect(ctx, s.x, dy, s.w, dh, P.duct, null);
      ctx.fillStyle = P.ductLight;
      ctx.fillRect(s.x, dy + 4, s.w, 4);
      ctx.fillStyle = P.ductShade;
      ctx.fillRect(s.x, dy + dh - 8, s.w, 8);
      ctx.fillStyle = P.ductJoint;
      const start = Math.ceil(s.x / 205) * 205;
      for (let x = start; x < s.x + s.w - 6; x += 205) ctx.fillRect(x, dy, 7, dh);
      ctx.strokeStyle = P.outline;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(s.x, dy, s.w, dh);
    }
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(s.x, s.y, s.w, plate);
  }

  drawRoofTop(ctx, s) {
    const P = this.P;
    rect(ctx, s.x, s.y, s.w, 14, P.slabTop, null);
    ctx.fillStyle = P.slabFace;
    ctx.fillRect(s.x, s.y + 14, s.w, 10);
    line(ctx, s.x, s.y, s.x + s.w, s.y, P.outline, 2.5);
    line(ctx, s.x, s.y, s.x, s.y + 600, P.outline, 2.5);
    line(ctx, s.x + s.w, s.y, s.x + s.w, s.y + 600, P.outline, 2.5);
  }

  // ------------------------------------------------- foreground (front)
  drawFront(ctx, sim, view, t) {
    this.drawDecor(ctx, sim, view, t, 'front');
    const P = this.P;
    // windows and skylights (glass) in front of the action
    for (const s of this.L.windows) {
      if (!visible(view, s.x, s.x + s.w, s.y, s.y + s.h)) continue;
      if (s.kind === 'skylight') continue;
      if (s.broken) {
        // jagged remains in the frame
        ctx.fillStyle = P.glass;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.w, s.y);
        ctx.lineTo(s.x + s.w, s.y + 26);
        ctx.lineTo(s.x, s.y + 48);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + s.h);
        ctx.lineTo(s.x + s.w, s.y + s.h);
        ctx.lineTo(s.x + s.w, s.y + s.h - 34);
        ctx.lineTo(s.x, s.y + s.h - 14);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      ctx.fillStyle = P.glass;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x + 2, s.y + s.h * 0.2);
      ctx.lineTo(s.x + s.w - 2, s.y + s.h * 0.12);
      ctx.moveTo(s.x + 2, s.y + s.h * 0.32);
      ctx.lineTo(s.x + s.w - 2, s.y + s.h * 0.24);
      ctx.stroke();
    }
  }
}

// ======================================================================
// Decor drawers
// ======================================================================

const DECOR_LAYER = {
  railingPost: 'front',
  catwalk: 'mid',
  scaffold: 'mid',
  window: 'back',
  barrier: 'mid',
  ac: 'mid',
  skylight: 'mid',
  soffit: 'mid',
  holeEdge: 'mid',
  streetDoor: 'mid',
  doorway: 'mid',
  hoist: 'back',
  building: 'under',
  street: 'under',
  roofline: 'back',
};

function drawElectric(ctx, hz, P, t) {
  const x = hz.x - hz.w / 2;
  const w = hz.w;
  const bodyH = hz.h * 0.68;
  const y = hz.y - hz.h;
  const active = hz.arcT > 0;
  const flick = active && Math.sin(t * 60) > 0;
  if (hz.style === 'generator') {
    rect(ctx, x, hz.y - hz.h * 0.75, w, hz.h * 0.75, '#e0b32c', P.outline, 2.5);
    rect(ctx, x + 8, hz.y - hz.h * 0.62, w * 0.45, hz.h * 0.42, '#3a3a3a', P.outline, 2);
    for (let k = 0; k < 4; k++) line(ctx, x + 12, hz.y - hz.h * 0.56 + k * 10, x + w * 0.45, hz.y - hz.h * 0.56 + k * 10, '#666', 2);
    drawBolt(ctx, x + w * 0.75, hz.y - hz.h * 0.42, 16, flick ? '#fff6a0' : '#1d1d1d');
    rect(ctx, x + 6, hz.y - 10, 18, 10, '#333', null);
    rect(ctx, x + w - 24, hz.y - 10, 18, 10, '#333', null);
  } else if (hz.style === 'transformer') {
    rect(ctx, x + 6, y + 10, w - 12, hz.h - 10, P.metal, P.outline, 2.5);
    for (let k = 0; k < 5; k++) line(ctx, x + 14 + k * 15, y + 26, x + 14 + k * 15, hz.y - 12, P.metalDark, 3);
    rect(ctx, x + w * 0.3, y + 34, w * 0.4, 34, '#f3c623', P.outline, 2);
    drawBolt(ctx, x + w / 2, y + 51, 12, flick ? '#ffffff' : '#1d1d1d');
    line(ctx, x + 20, y + 10, x + 20, y - 30, P.metalDark, 3);
    line(ctx, x + w - 20, y + 10, x + w - 20, y - 30, P.metalDark, 3);
  } else {
    // skull box on legs, as seen in the classic facility shots
    const legH = hz.h - bodyH;
    rect(ctx, x + 6, hz.y - legH, 12, legH, P.metalDark, P.outline, 2);
    rect(ctx, x + w - 18, hz.y - legH, 12, legH, P.metalDark, P.outline, 2);
    rect(ctx, x, y, w, bodyH, P.metal, P.outline, 2.5);
    rect(ctx, x + 10, y + 10, w - 20, bodyH - 20, flick ? '#d8d8d8' : '#4e4e4e', P.outline, 2);
    for (const [cx, cy] of [[x + 15, y + 15], [x + w - 15, y + 15], [x + 15, y + bodyH - 15], [x + w - 15, y + bodyH - 15]]) {
      ctx.strokeStyle = P.outline;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, TAU);
      ctx.stroke();
    }
    drawSkull(ctx, x + w / 2, y + bodyH / 2, 13, flick ? '#2a2a2a' : '#f2f2f2');
    // conduit into the ceiling
    ctx.strokeStyle = P.pipe;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 18);
    ctx.lineTo(x - 22, y + 18);
    ctx.lineTo(x - 22, y - 400);
    ctx.stroke();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (active) {
    const g = ctx.createRadialGradient(hz.x, y + bodyH / 2, 4, hz.x, y + bodyH / 2, 120);
    g.addColorStop(0, 'rgba(255,250,190,0.5)');
    g.addColorStop(1, 'rgba(255,250,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(hz.x - 120, y + bodyH / 2 - 120, 240, 240);
  }
}

function drawSkull(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.1, cy + r * 0.55);
  ctx.lineTo(cx + r * 1.1, cy + r * 1.4);
  ctx.moveTo(cx + r * 1.1, cy + r * 0.55);
  ctx.lineTo(cx - r * 1.1, cy + r * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.72, 0, TAU);
  ctx.fill();
  ctx.fillRect(cx - r * 0.38, cy + r * 0.3, r * 0.76, r * 0.42);
  ctx.fillStyle = color === '#f2f2f2' ? '#4e4e4e' : '#d8d8d8';
  ctx.beginPath();
  ctx.arc(cx - r * 0.27, cy - r * 0.18, r * 0.17, 0, TAU);
  ctx.arc(cx + r * 0.27, cy - r * 0.18, r * 0.17, 0, TAU);
  ctx.fill();
}

function drawBolt(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.2, cy - s);
  ctx.lineTo(cx - s * 0.45, cy + s * 0.1);
  ctx.lineTo(cx - s * 0.02, cy + s * 0.1);
  ctx.lineTo(cx - s * 0.25, cy + s);
  ctx.lineTo(cx + s * 0.45, cy - s * 0.15);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
}

function drawSteamPipe(ctx, hz, P, t) {
  const x = hz.x;
  const y = hz.y;
  ctx.strokeStyle = P.pipe;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(x - hz.dir * 6, y - 240);
  ctx.lineTo(x - hz.dir * 6, y);
  ctx.lineTo(x + hz.dir * 14, y);
  ctx.stroke();
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  rect(ctx, x + hz.dir * 10 - 6, y - 10, 12, 20, P.metalDark, P.outline, 2);
  // valve wheel
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x - hz.dir * 6, y - 40, 9, 0, TAU);
  ctx.stroke();
  // warning label
  const warn = hz.burst > 0 || (hz.timer % hz.period) > hz.period - 0.8;
  ctx.fillStyle = warn && Math.sin(t * 20) > 0 ? '#ff5a3c' : '#f2c230';
  ctx.beginPath();
  ctx.moveTo(x - hz.dir * 6, y - 92);
  ctx.lineTo(x - hz.dir * 6 - 10, y - 74);
  ctx.lineTo(x - hz.dir * 6 + 10, y - 74);
  ctx.closePath();
  ctx.fill();
}

function stripeBand(ctx, x0, x1, y, h, a, b) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, x1 - x0, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x0, y, x1 - x0, h);
  ctx.fillStyle = b;
  for (let x = x0 - h; x < x1 + h; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + 8, y + h);
    ctx.lineTo(x + 8 + h, y);
    ctx.lineTo(x + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function openness(d, sim, dt) {
  const target = sim.time < (d.openUntil || 0) ? 1 : 0;
  d._open = d._open === undefined ? target : d._open + (target - d._open) * Math.min(1, dt * 6);
  return d._open;
}

const DECOR = {
  roofline(ctx, d, P) {
    line(ctx, d.x0, d.y, d.x1, d.y, P.outline, 3);
  },
  street(ctx, d, P) {
    ctx.fillStyle = P.street;
    ctx.fillRect(d.x0, d.y, d.x1 - d.x0, 30);
    ctx.fillStyle = P.streetLine;
    ctx.fillRect(d.x0, d.y + 3, d.x1 - d.x0, 4);
  },
  holeEdge(ctx, d) {
    stripeBand(ctx, d.x0 - 26, d.x0, d.y + 1, 7, '#f2c230', '#222');
    stripeBand(ctx, d.x1, d.x1 + 26, d.y + 1, 7, '#f2c230', '#222');
  },
  streetDoor(ctx, d, P) {
    const x = d.x;
    rect(ctx, x - 3, d.y - d.h - 6, d.w + 6, 8, P.wallDark, P.outline, 2);
    // swung-open door leaf
    const fx = d.side < 0 ? x - 30 : x + d.w + 4;
    rect(ctx, fx, d.y - d.h, 26, d.h, P.door, P.outline, 2.5);
    ctx.fillStyle = P.metalDark;
    ctx.fillRect(fx + (d.side < 0 ? 4 : 18), d.y - d.h * 0.5, 4, 10);
  },
  window(ctx, d, P) {
    rect(ctx, d.x - 2, d.y - 8, d.w + 4, 8, P.wallDark, P.outline, 2);
  },
  doorway(ctx, d, P) {
    const x = d.x;
    line(ctx, x - 2, d.top, x - 2, d.y, P.outline, 2.5);
    line(ctx, x + d.w + 2, d.top, x + d.w + 2, d.y, P.outline, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(x - 2, d.top, d.w + 4, d.y - d.top);
    // exit sign above
    rect(ctx, x - 18, d.top - 26, 62, 18, '#2e9e57', P.outline, 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', x + 13, d.top - 13);
  },
  soffit(ctx, d, P) {
    rect(ctx, d.x0, d.y, d.x1 - d.x0, d.bottom - d.y, P.duct, P.outline, 2.5);
    ctx.fillStyle = P.ductShade;
    ctx.fillRect(d.x0, d.bottom - 10, d.x1 - d.x0, 10);
    ctx.fillStyle = P.ductJoint;
    for (let x = d.x0 + 60; x < d.x1 - 20; x += 110) ctx.fillRect(x, d.y, 6, d.bottom - d.y);
    // grille
    ctx.strokeStyle = P.ductJoint;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const gx = (d.x0 + d.x1) / 2 - 30;
    for (let k = 0; k < 6; k++) {
      ctx.moveTo(gx + k * 10, d.bottom - 24);
      ctx.lineTo(gx + k * 10, d.bottom - 12);
    }
    ctx.stroke();
  },
  elevator(ctx, d, P, t, sim, env) {
    const o = openness(d, sim, 1 / 60);
    const x = d.x - d.w / 2;
    const y = d.y - d.h;
    rect(ctx, x - 6, y - 6, d.w + 12, d.h + 6, P.panel, P.outline, 2.5);
    rect(ctx, x, y, d.w, d.h, '#2a2a2c', null);
    // lit cabin
    ctx.fillStyle = 'rgba(255,248,220,0.25)';
    ctx.fillRect(x, y, d.w, d.h);
    const half = d.w / 2;
    const slide = half * 0.92 * o;
    rect(ctx, x - slide, y, half, d.h, P.door, P.outline, 2.5);
    rect(ctx, x + half + slide, y, half, d.h, P.door, P.outline, 2.5);
    // cover the slid panels outside the frame
    ctx.fillStyle = P.interior;
    if (slide > 0.5) {
      ctx.fillRect(x - slide - 8, y - 4, slide + 2, d.h + 4);
      ctx.fillRect(x + d.w + 6, y - 4, slide + 2, d.h + 4);
    }
    // indicator
    const ix = d.x - 30;
    const iy = y - 40;
    rect(ctx, ix, iy, 60, 24, P.panel, P.outline, 2);
    ctx.fillStyle = o > 0.1 ? '#e8a33a' : '#6a6a6a';
    ctx.beginPath();
    ctx.moveTo(ix + 15, iy + 5);
    ctx.lineTo(ix + 9, iy + 13);
    ctx.lineTo(ix + 21, iy + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(ix + 13, iy + 12, 4, 7);
    ctx.fillStyle = '#6a6a6a';
    ctx.beginPath();
    ctx.moveTo(ix + 45, iy + 19);
    ctx.lineTo(ix + 39, iy + 11);
    ctx.lineTo(ix + 51, iy + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(ix + 43, iy + 5, 4, 7);
    // call buttons
    rect(ctx, x + d.w + 16, y + d.h * 0.42, 14, 28, P.door, P.outline, 2);
    ctx.fillStyle = P.outline;
    ctx.beginPath();
    ctx.arc(x + d.w + 23, y + d.h * 0.42 + 8, 2.4, 0, TAU);
    ctx.arc(x + d.w + 23, y + d.h * 0.42 + 19, 2.4, 0, TAU);
    ctx.fill();
    void env;
    void t;
  },
  hoist(ctx, d, P, t, sim) {
    const o = openness(d, sim, 1 / 60);
    const x = d.x - d.w / 2;
    const y = d.y - d.h;
    rect(ctx, x, y, d.w, d.h, 'rgba(60,64,70,0.35)', P.pipeDark, 3);
    ctx.strokeStyle = 'rgba(70,74,80,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= d.w; k += 10) {
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k, y + d.h);
    }
    for (let k = 0; k <= d.h; k += 10) {
      ctx.moveTo(x, y + k);
      ctx.lineTo(x + d.w, y + k);
    }
    ctx.stroke();
    // gate rises when open
    rect(ctx, x + 6, y + 6 - o * (d.h - 20), d.w - 12, d.h - 12, 'rgba(242,194,48,0.25)', '#f2c230', 3);
    line(ctx, d.x, y, d.x, y - 600, P.pipeDark, 3);
  },
  vent(ctx, d, P, t, sim) {
    const o = openness(d, sim, 1 / 60);
    rect(ctx, d.x - d.w / 2, d.y, d.w, 10, '#2c2c2c', P.outline, 2);
    // grate swings down
    ctx.save();
    ctx.translate(d.x - d.w / 2, d.y + 10);
    ctx.rotate(o * 1.3);
    rect(ctx, 0, -4, d.w, 7, P.metal, P.outline, 1.5);
    for (let k = 8; k < d.w; k += 10) line(ctx, k, -4, k, 3, P.metalDark, 1.5);
    ctx.restore();
  },
  lamp(ctx, d, P) {
    const x = d.x;
    const y = d.y;
    line(ctx, x, y, x, y + 6, P.outline, 3);
    ctx.fillStyle = P.lamp;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 6);
    ctx.lineTo(x + 10, y + 6);
    ctx.lineTo(x + 22, y + 24);
    ctx.lineTo(x - 22, y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = P.lampLens;
    ctx.beginPath();
    ctx.ellipse(x, y + 25, 21, 5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  },
  hangLamp(ctx, d, P) {
    const y1 = d.y + d.len;
    line(ctx, d.x, d.y, d.x, y1, P.outline, 2);
    ctx.fillStyle = P.lamp;
    ctx.beginPath();
    ctx.arc(d.x, y1 + 18, 26, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.lampLens;
    ctx.beginPath();
    ctx.ellipse(d.x, y1 + 18, 24, 6, 0, 0, TAU);
    ctx.fill();
  },
  pipe(ctx, d, P) {
    const pts = d.pts;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = d.w + 3;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.strokeStyle = P.pipe;
    ctx.lineWidth = d.w;
    ctx.stroke();
    ctx.lineJoin = 'round';
    // flange joints
    ctx.fillStyle = P.pipeDark;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(len / 95);
      for (let k = 1; k <= n; k++) {
        const u = k / (n + 1);
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * u;
        if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) ctx.fillRect(x - 3, y - d.w * 0.8, 6, d.w * 1.6);
        else ctx.fillRect(x - d.w * 0.8, y - 3, d.w * 1.6, 6);
      }
    }
  },
  vending(ctx, d, P) {
    const x = d.x;
    const y = d.y - d.h;
    rect(ctx, x, y, d.w, d.h, '#9b9b9b', P.outline, 2.5);
    rect(ctx, x + 8, y + 18, d.w * 0.52, d.h * 0.66, '#f0f0f0', P.outline, 2);
    ctx.fillStyle = '#2a2a2a';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) ctx.fillRect(x + 13 + c * 11.5, y + 25 + r * 21, 7, 14);
    }
    rect(ctx, x + d.w * 0.6 + 4, y + 18, d.w * 0.32, 32, '#3a3a3a', P.outline, 2);
    ctx.save();
    ctx.translate(x + d.w * 0.76 + 4, y + 36);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.variant === 1 ? 'Soda' : 'Drink!', 0, 3);
    ctx.restore();
    for (let k = 0; k < 4; k++) rect(ctx, x + d.w * 0.64 + 4, y + 60 + k * 14, d.w * 0.24, 7, '#d0d0d0', P.outline, 1.2);
    rect(ctx, x + 12, y + d.h - 26, d.w * 0.3, 12, '#2a2a2a', null);
  },
  poster(ctx, d, P) {
    const hue = d.hue;
    rect(ctx, d.x - 26, d.y, 52, 70, `hsl(${hue},40%,88%)`, P.outline, 2);
    ctx.fillStyle = `hsl(${hue},55%,50%)`;
    ctx.fillRect(d.x - 20, d.y + 8, 40, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 3; k++) ctx.fillRect(d.x - 20, d.y + 42 + k * 8, 40 - k * 9, 3);
  },
  panel(ctx, d, P) {
    rect(ctx, d.x - 16, d.y + 20, 32, 44, P.panel, P.outline, 2);
    ctx.fillStyle = '#5b5b5b';
    ctx.fillRect(d.x - 9, d.y + 28, 18, 6);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(d.x, d.y + 48, 4, 0, TAU);
    ctx.fill();
  },
  clock(ctx, d, P, t, sim) {
    const cx = d.x;
    const cy = d.y + 30;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const secs = sim.time;
    const a1 = (secs / 60) * TAU;
    const a2 = (secs / 3600) * TAU + 2;
    line(ctx, cx, cy, cx + Math.sin(a1) * 12, cy - Math.cos(a1) * 12, '#c0392b', 1.5);
    line(ctx, cx, cy, cx + Math.sin(a2) * 8, cy - Math.cos(a2) * 8, P.outline, 2.5);
  },
  extinguisher(ctx, d, P) {
    rect(ctx, d.x - 13, d.y + 30, 26, 50, '#f7f7f7', P.outline, 2);
    rect(ctx, d.x - 6, d.y + 40, 12, 34, '#d63a2f', P.outline, 1.5);
  },
  sign(ctx, d, P) {
    if (d.variant % 2 === 0) {
      ctx.fillStyle = '#f2c230';
      ctx.strokeStyle = P.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y + 10);
      ctx.lineTo(d.x - 20, d.y + 44);
      ctx.lineTo(d.x + 20, d.y + 44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = P.outline;
      ctx.fillRect(d.x - 2, d.y + 20, 4, 13);
      ctx.fillRect(d.x - 2, d.y + 36, 4, 4);
    } else {
      rect(ctx, d.x - 40, d.y + 10, 80, 26, '#1f5f8b', P.outline, 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.variant === 1 ? 'LEVEL ' + ((d.floor || 0) + 1) : 'ZONE ' + 'ABCD'[(d.floor || 0) % 4], d.x, d.y + 28);
    }
  },
  column(ctx, d, P) {
    rect(ctx, d.x - d.w / 2, d.top, d.w, d.y - d.top, '#a3a3a3', P.outline, 2.5);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(d.x - d.w / 2, d.top, d.w, 34);
    line(ctx, d.x - d.w / 2, d.top + 34, d.x + d.w / 2, d.top + 34, P.outline, 2);
    rect(ctx, d.x - 9, d.y - 120, 18, 18, '#cfcfcf', P.outline, 2);
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.arc(d.x, d.y - 111, 4.5, 0, TAU);
    ctx.fill();
  },
  alarm(ctx, d, P, t, sim) {
    const on = sim.director.alarm > 0 && Math.sin(t * 14) > -0.2;
    ctx.fillStyle = on ? '#ff3b2f' : '#9a9a9a';
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 11, Math.PI * 0.5, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (on) {
      const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, 90);
      g.addColorStop(0, 'rgba(255,60,40,0.35)');
      g.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 90, d.y - 90, 180, 180);
    }
  },
  catwalk(ctx, d, P) {
    const y = d.y;
    rect(ctx, d.x0, y, d.x1 - d.x0, 12, P.metal, P.outline, 2.5);
    ctx.strokeStyle = P.metalDark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = d.x0 + 6; x < d.x1; x += 9) {
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x - 5, y + 10);
    }
    ctx.stroke();
    // supports
    for (let x = d.x0 + 40; x < d.x1 - 20; x += 220) {
      line(ctx, x, y + 12, x, 0, P.metalDark, 5);
      line(ctx, x, y + 40, x + 46, y + 12, P.metalDark, 3);
    }
  },
  railingPost(ctx, d, P) {
    line(ctx, d.x, d.y, d.x, d.y - d.h, P.metalDark, 5);
    line(ctx, d.x - 8, d.y - d.h, d.x + 8, d.y - d.h, P.metalDark, 5);
    line(ctx, d.x, d.y - d.h * 0.5, d.x + 4, d.y - d.h * 0.5, P.metalDark, 3);
  },
  officeDoor(ctx, d, P) {
    rect(ctx, d.x, d.y - 150, 60, 150, P.door, P.outline, 2.5);
    rect(ctx, d.x + 12, d.y - 136, 36, 40, 'rgba(160,200,230,0.6)', P.outline, 2);
    rect(ctx, d.x + 6, d.y - 172, 48, 16, '#2e9e57', P.outline, 2);
  },
  rollupDoor(ctx, d, P) {
    const h = d.h * (1 - d.open);
    rect(ctx, d.x, d.y - d.h, d.w, h, '#b8b2a5', P.outline, 2.5);
    ctx.strokeStyle = '#8e887b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = d.y - d.h + 8; y < d.y - d.h + h; y += 8) {
      ctx.moveTo(d.x, y);
      ctx.lineTo(d.x + d.w, y);
    }
    ctx.stroke();
    stripeBand(ctx, d.x - 30, d.x + d.w + 30, d.y + 1, 6, '#f2c230', '#222');
  },
  rack(ctx, d, P) {
    const x = d.x;
    const y = d.y - d.h;
    ctx.globalAlpha = 0.85;
    line(ctx, x, d.y, x, y, P.metalDark, 6);
    line(ctx, x + d.w, d.y, x + d.w, y, P.metalDark, 6);
    const rng = new RNG(d.seed);
    const shelves = Math.floor(d.h / 95);
    for (let s = 0; s <= shelves; s++) {
      const sy = d.y - s * 95;
      line(ctx, x, sy, x + d.w, sy, '#d08a2c', 5);
      if (s === shelves) break;
      let bx = x + 6;
      while (bx < x + d.w - 20) {
        const bw = rng.range(24, 54);
        const bh = rng.range(30, 70);
        if (bx + bw > x + d.w - 4) break;
        if (rng.next() < 0.8) rect(ctx, bx, sy - bh - 3, bw, bh, rng.pick(['#c89b62', '#b98a52', '#d9b07a', '#9a7448']), 'rgba(60,40,20,0.6)', 1.5);
        bx += bw + rng.range(2, 10);
      }
    }
    ctx.globalAlpha = 1;
  },
  forklift(ctx, d, P) {
    const x = d.x;
    const y = d.y;
    const s = d.dir;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, 1);
    ctx.globalAlpha = 0.9;
    rect(ctx, -60, -70, 90, 50, '#f0b429', P.outline, 2.5);
    rect(ctx, -40, -130, 50, 60, 'rgba(255,255,255,0)', P.outline, 3);
    rect(ctx, 34, -150, 8, 150, P.metalDark, null);
    rect(ctx, 42, -12, 46, 6, P.metalDark, null);
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-40, -16, 16, 0, TAU);
    ctx.arc(14, -16, 16, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
  trusses(ctx, d, P) {
    ctx.strokeStyle = shade(P.metalDark, 0.2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(d.x0, d.y + 50);
    ctx.lineTo(d.x1, d.y + 50);
    for (let x = d.x0; x < d.x1; x += 80) {
      ctx.moveTo(x, d.y + 50);
      ctx.lineTo(x + 40, d.y);
      ctx.lineTo(x + 80, d.y + 50);
    }
    ctx.stroke();
  },
  stripes(ctx, d) {
    stripeBand(ctx, d.x0, d.x0 + d.w, d.y + 1, 6, '#f2c230', '#222');
  },
  building(ctx, d, P, t, sim, env) {
    // facade under a roof segment
    const x0 = d.x0;
    const x1 = d.x1;
    const y = d.y + 24;
    ctx.fillStyle = P.wall;
    ctx.fillRect(x0, y, x1 - x0, 1600);
    ctx.fillStyle = P.wallDark;
    ctx.fillRect(x0, y, 10, 1600);
    ctx.fillRect(x1 - 10, y, 10, 1600);
    const rng = new RNG(d.seed);
    for (let wy = y + 40; wy < y + 900; wy += 70) {
      for (let wx = x0 + 30; wx < x1 - 50; wx += 64) {
        const lit = rng.next() < 0.35;
        ctx.fillStyle = lit ? 'rgba(255,212,134,0.85)' : 'rgba(30,24,40,0.85)';
        ctx.fillRect(wx, wy, 34, 42);
      }
    }
    void env;
  },
  skylight(ctx, d, P) {
    if (d.solid && d.solid.broken) {
      rect(ctx, d.x, d.y, d.w, 26, '#141019', null);
      ctx.fillStyle = P.glass;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + 14, d.y);
      ctx.lineTo(d.x, d.y + 9);
      ctx.closePath();
      ctx.moveTo(d.x + d.w, d.y);
      ctx.lineTo(d.x + d.w - 18, d.y);
      ctx.lineTo(d.x + d.w, d.y + 12);
      ctx.closePath();
      ctx.fill();
    } else {
      rect(ctx, d.x, d.y, d.w, 12, 'rgba(255,214,160,0.55)', P.glassEdge, 2);
      line(ctx, d.x + 10, d.y + 3, d.x + 30, d.y + 3, 'rgba(255,255,255,0.7)', 2);
    }
    line(ctx, d.x - 3, d.y, d.x - 3, d.y + 14, P.metalDark, 4);
    line(ctx, d.x + d.w + 3, d.y, d.x + d.w + 3, d.y + 14, P.metalDark, 4);
  },
  shed(ctx, d, P) {
    rect(ctx, d.x, d.y - d.h, d.w, d.h, P.wall, P.outline, 2.5);
    rect(ctx, d.x - 6, d.y - d.h - 10, d.w + 12, 12, P.wallDark, P.outline, 2);
    rect(ctx, d.x + d.w / 2 - 22, d.y - 112, 44, 112, P.door, P.outline, 2);
    ctx.fillStyle = '#ffd486';
    ctx.fillRect(d.x + d.w / 2 - 6, d.y - d.h - 4, 12, 4);
  },
  ac(ctx, d, P) {
    rect(ctx, d.x, d.y - d.h, d.w, d.h, P.metal, P.outline, 2.5);
    ctx.strokeStyle = P.metalDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x + d.w * 0.32, d.y - d.h * 0.5, Math.min(d.h, d.w) * 0.3, 0, TAU);
    ctx.stroke();
    for (let k = 0; k < 4; k++) line(ctx, d.x + d.w * 0.62, d.y - d.h + 10 + k * 10, d.x + d.w - 8, d.y - d.h + 10 + k * 10, P.metalDark, 2);
  },
  waterTower(ctx, d, P) {
    const x = d.x;
    const y = d.y;
    ctx.globalAlpha = 0.9;
    for (const k of [-40, 40]) line(ctx, x + k, y, x + k * 0.6, y - 140, P.outline, 4);
    line(ctx, x - 36, y - 60, x + 36, y - 100, P.outline, 2);
    line(ctx, x + 36, y - 60, x - 36, y - 100, P.outline, 2);
    rect(ctx, x - 46, y - 240, 92, 100, '#7a5a44', P.outline, 2.5);
    ctx.fillStyle = '#6a4c38';
    for (let k = 1; k < 4; k++) ctx.fillRect(x - 46, y - 240 + k * 25, 92, 3);
    ctx.fillStyle = '#5c4232';
    ctx.beginPath();
    ctx.moveTo(x - 50, y - 240);
    ctx.lineTo(x, y - 280);
    ctx.lineTo(x + 50, y - 240);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  antenna(ctx, d, P, t) {
    line(ctx, d.x, d.y, d.x, d.y - d.h, P.metalDark, 3);
    line(ctx, d.x - 16, d.y - d.h * 0.7, d.x + 16, d.y - d.h * 0.7, P.metalDark, 2);
    line(ctx, d.x - 10, d.y - d.h * 0.85, d.x + 10, d.y - d.h * 0.85, P.metalDark, 2);
    const on = Math.sin(t * 3 + d.x) > 0.6;
    ctx.fillStyle = on ? '#ff3b3b' : '#6b2020';
    ctx.beginPath();
    ctx.arc(d.x, d.y - d.h, 4, 0, TAU);
    ctx.fill();
    if (on) {
      const g = ctx.createRadialGradient(d.x, d.y - d.h, 1, d.x, d.y - d.h, 40);
      g.addColorStop(0, 'rgba(255,60,60,0.5)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 40, d.y - d.h - 40, 80, 80);
    }
  },
  neon(ctx, d, P, t) {
    const flick = Math.sin(t * 31 + d.x) > -0.85 || Math.sin(t * 3.1) > 0;
    const x = d.x;
    const y = d.y - 210;
    line(ctx, x + 20, d.y, x + 20, y + 60, P.metalDark, 4);
    line(ctx, x + 160, d.y, x + 160, y + 60, P.metalDark, 4);
    rect(ctx, x, y, 180, 60, '#1c1824', P.outline, 2.5);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (flick) {
      ctx.shadowColor = '#ff5d9e';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd1e6';
    } else ctx.fillStyle = '#5a3248';
    ctx.fillText(d.text, x + 90, y + 32);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  },
  chimney(ctx, d, P) {
    rect(ctx, d.x - 9, d.y - d.h, 18, d.h, P.wallDark, P.outline, 2);
    rect(ctx, d.x - 12, d.y - d.h - 6, 24, 7, P.metalDark, null);
  },
  beam(ctx, d, P) {
    const x = d.x;
    rect(ctx, x - 9, d.top, 18, d.y - d.top, P.metal, P.outline, 2);
    ctx.fillStyle = P.metalDark;
    ctx.fillRect(x - 9, d.top, 4, d.y - d.top);
    ctx.fillRect(x + 5, d.top, 4, d.y - d.top);
  },
  scaffold(ctx, d, P) {
    const y = d.y;
    ctx.strokeStyle = '#8b9096';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = d.x0 + 10; x <= d.x1; x += 110) {
      ctx.moveTo(x, d.ground);
      ctx.lineTo(x, y - 60);
    }
    for (let x = d.x0 + 10; x < d.x1 - 100; x += 110) {
      ctx.moveTo(x, d.ground);
      ctx.lineTo(x + 110, y + 10);
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x + 110, d.ground);
    }
    ctx.moveTo(d.x0, y - 46);
    ctx.lineTo(d.x1, y - 46);
    ctx.stroke();
    rect(ctx, d.x0, y, d.x1 - d.x0, 10, '#c79a5c', '#5a3c1c', 2);
  },
  barrier(ctx, d, P) {
    ctx.fillStyle = '#e9e5dc';
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + 12, d.y - d.h);
    ctx.lineTo(d.x + d.w - 12, d.y - d.h);
    ctx.lineTo(d.x + d.w, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#d8402c';
    for (let x = d.x - 20; x < d.x + d.w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, d.y - 10);
      ctx.lineTo(x + 14, d.y - 10);
      ctx.lineTo(x + 30, d.y - d.h);
      ctx.lineTo(x + 16, d.y - d.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  crane(ctx, d, P, t) {
    const x = d.x;
    ctx.strokeStyle = '#d9a12b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let y = d.y; y > d.y - d.h; y -= 60) {
      ctx.moveTo(x - 20, y);
      ctx.lineTo(x + 20, y - 60);
      ctx.moveTo(x + 20, y);
      ctx.lineTo(x - 20, y - 60);
    }
    ctx.moveTo(x - 20, d.y);
    ctx.lineTo(x - 20, d.y - d.h);
    ctx.moveTo(x + 20, d.y);
    ctx.lineTo(x + 20, d.y - d.h);
    const dir = x < 0 ? 1 : -1;
    ctx.moveTo(x - dir * 160, d.y - d.h);
    ctx.lineTo(x + dir * 900, d.y - d.h);
    ctx.moveTo(x - dir * 160, d.y - d.h + 30);
    ctx.lineTo(x + dir * 900, d.y - d.h + 30);
    ctx.stroke();
    const hx = x + dir * 620;
    const sway = Math.sin(t * 0.6) * 10;
    line(ctx, hx, d.y - d.h + 30, hx + sway, d.y - d.h + 520, '#444', 2);
    ctx.fillStyle = '#d9a12b';
    ctx.fillRect(hx + sway - 10, d.y - d.h + 520, 20, 24);
  },
  cone(ctx, d) {
    ctx.fillStyle = '#ff7b22';
    ctx.beginPath();
    ctx.moveTo(d.x - 12, d.y);
    ctx.lineTo(d.x - 3, d.y - 34);
    ctx.lineTo(d.x + 3, d.y - 34);
    ctx.lineTo(d.x + 12, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(d.x - 7, d.y - 20, 14, 5);
    ctx.fillStyle = '#333';
    ctx.fillRect(d.x - 15, d.y - 3, 30, 3);
  },
  siteSign(ctx, d, P) {
    line(ctx, d.x + 10, d.y, d.x + 10, d.y - 120, '#555', 4);
    line(ctx, d.x + 130, d.y, d.x + 130, d.y - 120, '#555', 4);
    rect(ctx, d.x, d.y - 170, 140, 70, '#f2c230', P.outline, 2.5);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DANGER', d.x + 70, d.y - 142);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('HARD HAT AREA', d.x + 70, d.y - 120);
  },
  mixer(ctx, d, P) {
    ctx.globalAlpha = 0.85;
    rect(ctx, d.x, d.y - 60, 170, 40, '#e4e0d6', P.outline, 2);
    rect(ctx, d.x + 170, d.y - 80, 50, 60, '#e4e0d6', P.outline, 2);
    ctx.fillStyle = '#d4552b';
    ctx.beginPath();
    ctx.ellipse(d.x + 85, d.y - 90, 72, 34, -0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222';
    for (const wx of [d.x + 30, d.x + 120, d.x + 195]) {
      ctx.beginPath();
      ctx.arc(wx, d.y - 16, 16, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

export { rect, line, rrect, stripeBand, clamp };
