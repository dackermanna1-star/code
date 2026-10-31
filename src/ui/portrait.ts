import { hexToRgb, mix, rgba } from './dom';

/**
 * Hand-posed stick-figure portraits for the VS cards: a heroic stance in the fighter's colour,
 * with a glowing rim, their weapon type and accessory. Drawn once per card (shadowBlur is fine here).
 */

interface Pt {
  x: number;
  y: number;
}

function seeded(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export interface PortraitOpts {
  name: string;
  color: string;
  colorLight: string;
  weaponId: string;
  accessory: string;
  /** Mirror so the figure faces left (right-hand card). */
  mirror: boolean;
}

export function drawPortrait(canvas: HTMLCanvasElement, o: PortraitOpts): void {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 320;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const rnd = seeded(o.name + o.weaponId);
  const c = o.color, cl = o.colorLight || mix(c, '#ffffff', 0.45);

  // ---------- backdrop ----------
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.75);
  bg.addColorStop(0, rgba(c, 0.55));
  bg.addColorStop(0.35, rgba(mix(c, '#000000', 0.55), 0.6));
  bg.addColorStop(1, 'rgba(4,5,10,0.0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Light rays.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
    const w = 0.05 + rnd() * 0.08;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.62);
    ctx.lineTo(W * 0.5 + Math.cos(a - w) * W * 1.4, H * 0.62 + Math.sin(a - w) * H * 1.4);
    ctx.lineTo(W * 0.5 + Math.cos(a + w) * W * 1.4, H * 0.62 + Math.sin(a + w) * H * 1.4);
    ctx.closePath();
    ctx.fillStyle = rgba(cl, 0.035 + rnd() * 0.04);
    ctx.fill();
  }
  ctx.restore();
  // Floor glow.
  const floorY = H * 0.9;
  const fg = ctx.createRadialGradient(W * 0.5, floorY, 0, W * 0.5, floorY, W * 0.45);
  fg.addColorStop(0, rgba(cl, 0.45));
  fg.addColorStop(1, rgba(c, 0));
  ctx.save();
  ctx.translate(W * 0.5, floorY);
  ctx.scale(1, 0.18);
  ctx.translate(-W * 0.5, -floorY);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(W * 0.5, floorY, W * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---------- figure ----------
  const u = Math.min(H / 3.75, W / 2.6);
  ctx.save();
  ctx.translate(W * 0.5, floorY);
  if (o.mirror) ctx.scale(-1, 1);
  ctx.scale(u, u);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const P = (x: number, y: number): Pt => ({ x, y });
  const hip = P(-0.02, -1.28);
  const neck = P(0.14, -2.36);
  const head = P(0.2, -2.68);
  const headR = 0.27;
  const kneeF = P(0.46, -0.66), footF = P(0.7, 0);
  const kneeB = P(-0.36, -0.62), footB = P(-0.66, 0);
  const sh = P(0.12, -2.24);
  let elbowF = P(0.58, -1.86), handF = P(0.92, -2.12);
  let elbowB = P(-0.26, -1.74), handB = P(-0.38, -1.3);

  const w = o.weaponId;
  if (w === 'greatsword') {
    elbowF = P(0.42, -1.72);
    handF = P(0.5, -2.05);
    elbowB = P(-0.08, -1.7);
    handB = P(0.3, -1.98);
  } else if (w === 'spear' || w === 'staff') {
    elbowF = P(0.55, -1.8);
    handF = P(0.78, -1.82);
    elbowB = P(-0.2, -1.84);
    handB = P(0.1, -1.6);
  } else if (w === 'daggers') {
    elbowF = P(0.55, -1.95);
    handF = P(0.82, -1.72);
    elbowB = P(-0.3, -1.95);
    handB = P(-0.05, -1.62);
  } else if (w === 'gauntlets') {
    elbowF = P(0.6, -1.95);
    handF = P(0.86, -2.25);
    elbowB = P(-0.2, -1.7);
    handB = P(0.2, -1.68);
  } else if (w === 'scythe') {
    elbowF = P(0.5, -1.82);
    handF = P(0.7, -2.0);
    elbowB = P(-0.18, -1.8);
    handB = P(0.2, -1.62);
  }

  // Accessory behind the body.
  const acc = o.accessory;
  ctx.save();
  if (acc === 'cape') {
    const g = ctx.createLinearGradient(0, -2.3, -1.4, -0.3);
    g.addColorStop(0, mix(c, '#000000', 0.45));
    g.addColorStop(0.6, mix(c, '#000000', 0.72));
    g.addColorStop(1, rgba(mix(c, '#000000', 0.82), 0.92));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sh.x + 0.02, sh.y);
    ctx.bezierCurveTo(-0.5, -2.0, -1.0, -1.4, -1.5, -0.35);
    ctx.bezierCurveTo(-1.1, -0.5, -0.9, -0.15, -0.55, -0.4);
    ctx.bezierCurveTo(-0.4, -1.0, -0.2, -1.7, sh.x - 0.05, sh.y + 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(cl, 0.7);
    ctx.lineWidth = 0.025;
    ctx.stroke();
  } else if (acc === 'scarf') {
    ribbon(ctx, [P(neck.x, neck.y + 0.05), P(-0.45, -2.42), P(-0.95, -2.2), P(-1.45, -2.38)], 0.11, c, cl);
  } else if (acc === 'longhair') {
    ctx.fillStyle = '#07070d';
    ctx.beginPath();
    ctx.moveTo(head.x - 0.05, head.y - headR);
    ctx.bezierCurveTo(-0.55, -2.95, -0.75, -2.3, -1.1, -1.75);
    ctx.bezierCurveTo(-0.7, -1.95, -0.4, -2.1, head.x - 0.12, head.y + 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.8);
    ctx.lineWidth = 0.03;
    ctx.stroke();
  } else if (acc === 'ponytail') {
    ctx.strokeStyle = '#07070d';
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(head.x - 0.18, head.y - 0.12);
    ctx.bezierCurveTo(-0.45, -2.85, -0.7, -2.55, -0.9, -2.2);
    ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.9);
    ctx.lineWidth = 0.025;
    ctx.stroke();
  } else if (acc === 'headband') {
    ribbon(ctx, [P(head.x - 0.2, head.y - 0.08), P(-0.35, -2.7), P(-0.7, -2.55), P(-1.0, -2.75)], 0.06, c, cl);
    ribbon(ctx, [P(head.x - 0.2, head.y - 0.05), P(-0.3, -2.58), P(-0.6, -2.35), P(-0.85, -2.45)], 0.05, c, cl);
  }
  ctx.restore();

  // Weapon behind/in front depends; draw most weapons after the body except greatsword (behind).
  const drawWeapon = () => weapon(ctx, w, handF, handB, c, cl);
  if (w === 'greatsword' || w === 'scythe') drawWeapon();

  // Body strokes: glow pass, then ink core.
  const limbs: Pt[][] = [
    [hip, neck],
    [hip, kneeF, footF],
    [hip, kneeB, footB],
    [sh, elbowF, handF],
    [sh, elbowB, handB],
  ];
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 0.32 * u;
  ctx.strokeStyle = rgba(c, 0.95);
  ctx.lineWidth = 0.2;
  for (const l of limbs) poly(ctx, l);
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR + 0.045, 0, Math.PI * 2);
  ctx.fillStyle = rgba(c, 0.95);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#06060b';
  ctx.lineWidth = 0.13;
  for (const l of limbs) poly(ctx, l);
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
  ctx.fillStyle = '#06060b';
  ctx.fill();
  // Joint highlights (rim light).
  ctx.strokeStyle = rgba(cl, 0.55);
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.arc(head.x, head.y, headR - 0.02, -Math.PI * 0.65, Math.PI * 0.05);
  ctx.stroke();

  // Eye: glowing slit.
  ctx.save();
  ctx.shadowColor = cl;
  ctx.shadowBlur = 0.25 * u;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(head.x + 0.08, head.y - 0.04);
  ctx.lineTo(head.x + 0.22, head.y - 0.07);
  ctx.stroke();
  ctx.restore();

  if (acc === 'horns') {
    ctx.fillStyle = '#06060b';
    ctx.strokeStyle = rgba(c, 0.95);
    ctx.lineWidth = 0.025;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      const bx = head.x + s * 0.13, by = head.y - headR * 0.75;
      ctx.moveTo(bx - 0.06, by);
      ctx.quadraticCurveTo(bx + s * 0.05, by - 0.35, bx + s * 0.28, by - 0.42);
      ctx.quadraticCurveTo(bx + s * 0.04, by - 0.22, bx + 0.06, by + 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (acc === 'halo') {
    ctx.save();
    ctx.shadowColor = cl;
    ctx.shadowBlur = 0.4 * u;
    ctx.strokeStyle = rgba(cl, 0.95);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(head.x - 0.04, head.y - headR - 0.2, 0.28, 0.08, -0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (acc === 'headband') {
    ctx.strokeStyle = rgba(c, 1);
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR + 0.005, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }

  if (!(w === 'greatsword' || w === 'scythe')) drawWeapon();
  ctx.restore();

  // ---------- embers ----------
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sizeK = Math.max(0.45, Math.min(1.4, H / (320 * dpr)));
  const count = Math.round(16 + 30 * Math.min(1, (W * H) / (520 * 300 * dpr * dpr)));
  for (let i = 0; i < count; i++) {
    const x = W * (0.12 + rnd() * 0.76);
    const y = H * (0.15 + rnd() * 0.78);
    const r = (0.6 + rnd() * 2.0) * dpr * sizeK;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, rgba(i % 3 === 0 ? '#ffffff' : cl, 0.9));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Vignette to blend into the card.
  const vg = ctx.createLinearGradient(0, H * 0.7, 0, H);
  vg.addColorStop(0, 'rgba(6,7,14,0)');
  vg.addColorStop(1, 'rgba(6,7,14,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  void hexToRgb;
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function ribbon(ctx: CanvasRenderingContext2D, pts: Pt[], width: number, c: string, cl: string): void {
  // Tapered flowing ribbon through 4 control points.
  const [a, b, d, e] = pts;
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 14;
  const g = ctx.createLinearGradient(a.x, a.y, e.x, e.y);
  g.addColorStop(0, rgba(c, 1));
  g.addColorStop(1, rgba(cl, 0.75));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - width / 2);
  ctx.bezierCurveTo(b.x, b.y - width / 2, d.x, d.y - width * 0.35, e.x, e.y);
  ctx.bezierCurveTo(d.x, d.y + width * 0.35, b.x, b.y + width / 2, a.x, a.y + width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function blade(ctx: CanvasRenderingContext2D, from: Pt, angle: number, len: number, width: number, c: string, cl: string, curve = 0.12): Pt {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const nx = -dy, ny = dx;
  const tip = { x: from.x + dx * len, y: from.y + dy * len };
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 18;
  const g = ctx.createLinearGradient(from.x, from.y, tip.x, tip.y);
  g.addColorStop(0, '#d9deea');
  g.addColorStop(0.6, '#ffffff');
  g.addColorStop(1, cl);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(from.x + nx * width * 0.5, from.y + ny * width * 0.5);
  ctx.quadraticCurveTo(
    from.x + dx * len * 0.55 + nx * (width * 0.5 + curve),
    from.y + dy * len * 0.55 + ny * (width * 0.5 + curve),
    tip.x, tip.y,
  );
  ctx.quadraticCurveTo(
    from.x + dx * len * 0.5 + nx * curve * 0.4,
    from.y + dy * len * 0.5 + ny * curve * 0.4,
    from.x - nx * width * 0.5, from.y - ny * width * 0.5,
  );
  ctx.closePath();
  ctx.fill();
  // Edge glow.
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.lineWidth = 0.02;
  ctx.stroke();
  ctx.restore();
  return tip;
}

function shaft(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: string): void {
  ctx.save();
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.shadowColor = c;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 0.1;
  poly(ctx, [a, b]);
  ctx.restore();
  ctx.strokeStyle = '#1a1622';
  ctx.lineWidth = 0.065;
  poly(ctx, [a, b]);
}

function orb(ctx: CanvasRenderingContext2D, p: Pt, r: number, c: string, cl: string): void {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, rgba(cl, 0.95));
  g.addColorStop(1, rgba(c, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function weapon(ctx: CanvasRenderingContext2D, w: string, hf: Pt, hb: Pt, c: string, cl: string): void {
  switch (w) {
    case 'katana': {
      const a = -1.15;
      // Guard.
      ctx.strokeStyle = '#f2f2f8';
      ctx.lineWidth = 0.05;
      const nx = -Math.sin(a), ny = Math.cos(a);
      poly(ctx, [{ x: hf.x + nx * 0.12, y: hf.y + ny * 0.12 }, { x: hf.x - nx * 0.12, y: hf.y - ny * 0.12 }]);
      // Handle.
      shaft(ctx, hf, { x: hf.x - Math.cos(a) * 0.28, y: hf.y - Math.sin(a) * 0.28 }, c);
      blade(ctx, hf, a, 1.55, 0.075, c, cl, 0.1);
      break;
    }
    case 'greatsword': {
      const a = -2.25;
      shaft(ctx, hf, { x: hf.x + Math.cos(a) * -0.3, y: hf.y + Math.sin(a) * -0.3 }, c);
      ctx.strokeStyle = '#f2f2f8';
      ctx.lineWidth = 0.07;
      const nx = -Math.sin(a), ny = Math.cos(a);
      poly(ctx, [{ x: hf.x + nx * 0.2, y: hf.y + ny * 0.2 }, { x: hf.x - nx * 0.2, y: hf.y - ny * 0.2 }]);
      blade(ctx, hf, a, 1.95, 0.26, c, cl, 0.02);
      break;
    }
    case 'spear': {
      const a = -1.35;
      const back = { x: hf.x - Math.cos(a) * 1.05, y: hf.y - Math.sin(a) * 1.05 };
      const front = { x: hf.x + Math.cos(a) * 1.55, y: hf.y + Math.sin(a) * 1.55 };
      shaft(ctx, back, front, c);
      blade(ctx, front, a, 0.42, 0.13, c, cl, 0.0);
      break;
    }
    case 'staff': {
      const a = -0.75;
      const back = { x: hf.x - Math.cos(a) * 1.35, y: hf.y - Math.sin(a) * 1.35 };
      const front = { x: hf.x + Math.cos(a) * 0.95, y: hf.y + Math.sin(a) * 0.95 };
      shaft(ctx, back, front, c);
      orb(ctx, back, 0.07, c, cl);
      orb(ctx, front, 0.09, c, cl);
      break;
    }
    case 'daggers': {
      blade(ctx, hf, 0.55, 0.55, 0.08, c, cl, 0.05);
      blade(ctx, hb, 2.2, 0.5, 0.08, c, cl, 0.05);
      break;
    }
    case 'scythe': {
      const a = -1.75;
      const top = { x: hf.x + Math.cos(a) * 1.25, y: hf.y + Math.sin(a) * 1.25 };
      const bottom = { x: hf.x - Math.cos(a) * 1.1, y: hf.y - Math.sin(a) * 1.1 };
      shaft(ctx, bottom, top, c);
      // Curved blade sweeping backward from the top.
      ctx.save();
      ctx.shadowColor = c;
      ctx.shadowBlur = 18;
      const g = ctx.createLinearGradient(top.x, top.y, top.x - 1.0, top.y + 0.3);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, cl);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo(top.x - 0.55, top.y - 0.45, top.x - 1.1, top.y + 0.18);
      ctx.quadraticCurveTo(top.x - 0.55, top.y - 0.18, top.x + 0.02, top.y + 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'gauntlets':
    default: {
      for (const h of [hf, hb]) {
        orb(ctx, h, 0.12, c, cl);
        ctx.fillStyle = '#0a0a12';
        ctx.strokeStyle = rgba(cl, 0.95);
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
  }
}
