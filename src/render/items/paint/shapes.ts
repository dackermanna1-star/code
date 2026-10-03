/**
 * Shared painted building blocks used by several item painters (sticks, bottles, blobs,
 * eggs, books ...). All coordinates are in 16×16 Minecraft pixel units (y down).
 */
import { Painter, type Ctx, type Col, type Mat, smooth, capsule, ellipse, poly, lin, rad, rgba, lighten, darken, mix, tint, GLASS, CLOTH, circle } from './kit';

export const WOOD_STICK = 0x8a6234;

/** Irregular closed blob outline around a centre (seeded by the painter). */
export function blobPts(p: Painter, cx: number, cy: number, rx: number, ry: number, n = 9, jitter = 0.18, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const j = 1 - jitter + p.rand() * jitter * 2;
    out.push(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j);
  }
  return out;
}

/** Shaded roundish blob part. */
export function blob(p: Painter, pts: number[], base: Col, mat?: Mat, opts: { light?: number; dark?: number; spec?: number; cx?: number; cy?: number; r?: number } = {}) {
  let cx = opts.cx, cy = opts.cy;
  if (cx === undefined || cy === undefined) {
    cx = 0; cy = 0;
    for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
    cx /= pts.length / 2; cy /= pts.length / 2;
  }
  let r = opts.r ?? 0;
  if (!r) for (let i = 0; i < pts.length; i += 2) r = Math.max(r, Math.hypot(pts[i] - cx, pts[i + 1] - cy));
  p.part((g) => {
    smooth(g, pts);
    g.fillStyle = rgba(base);
    g.fill();
  }, (g) => {
    p.volume(g, cx!, cy!, r, base, opts.light ?? 0.45, opts.dark ?? 0.55);
    if (opts.spec) p.spec(g, cx! - r * 0.38, cy! - r * 0.42, r * 0.38, r * 0.22, -0.6, opts.spec);
  }, mat);
}

/** Wooden stick (tool handles, rods). */
export function stick(p: Painter, x0: number, y0: number, x1: number, y1: number, r = 0.95, base: Col = WOOD_STICK) {
  p.part((g) => {
    capsule(g, x0, y0, x1, y1, r);
    g.fillStyle = rgba(base);
    g.fill();
  }, (g) => {
    p.cylinder(g, x0, y0, x1, y1, r, base, 0.4, 0.55);
    // wood grain streaks along the axis
    const n = 7;
    const ax = x1 - x0, ay = y1 - y0;
    const l = Math.hypot(ax, ay);
    g.lineWidth = 0.12;
    for (let i = 0; i < n; i++) {
      const t0 = p.rand() * 0.8, t1 = t0 + 0.1 + p.rand() * 0.25;
      const off = (p.rand() - 0.5) * r * 1.4;
      const nx = -ay / l * off, ny = ax / l * off;
      g.strokeStyle = rgba(darken(base, 0.45), 0.35);
      g.beginPath();
      g.moveTo(x0 + ax * t0 + nx, y0 + ay * t0 + ny);
      g.lineTo(x0 + ax * t1 + nx, y0 + ay * t1 + ny);
      g.stroke();
    }
  }, { rough: 0.7 });
}

/** Glass bottle (potion-style flask). `liquid` colour or null for empty. */
export function bottle(p: Painter, liquid: Col | null, shape: 'potion' | 'splash' | 'lingering' = 'potion', opts: { glow?: number; opaque?: boolean; cork?: boolean; fill?: number } = {}) {
  const path = (g: Ctx) => {
    g.beginPath();
    if (shape === 'potion') {
      // round flask with a neck
      g.moveTo(6.6, 1.6); g.lineTo(9.4, 1.6); g.lineTo(9.4, 3); g.lineTo(9.0, 3.4); g.lineTo(9.0, 5.6);
      g.bezierCurveTo(12.6, 6.6, 13.9, 9.2, 13.4, 11.4);
      g.bezierCurveTo(12.9, 14.0, 10.6, 15.0, 8, 15.0);
      g.bezierCurveTo(5.4, 15.0, 3.1, 14.0, 2.6, 11.4);
      g.bezierCurveTo(2.1, 9.2, 3.4, 6.6, 7.0, 5.6);
      g.lineTo(7.0, 3.4); g.lineTo(6.6, 3); g.closePath();
    } else if (shape === 'splash') {
      // squat grenade-like bottle with a slanted neck
      g.moveTo(8.6, 1.4); g.lineTo(11.4, 2.2); g.lineTo(11.0, 3.4); g.lineTo(10.2, 3.6); g.lineTo(9.6, 6.0);
      g.bezierCurveTo(12.8, 7.0, 14.0, 9.6, 13.4, 11.8);
      g.bezierCurveTo(12.8, 14.2, 10.6, 15.1, 8, 15.1);
      g.bezierCurveTo(5.2, 15.1, 2.8, 14.0, 2.5, 11.6);
      g.bezierCurveTo(2.2, 9.0, 4.2, 6.4, 7.4, 5.8);
      g.lineTo(8.0, 3.2); g.lineTo(7.8, 2.4); g.closePath();
    } else {
      // lingering: tall bulb with wide shoulders
      g.moveTo(6.4, 1.2); g.lineTo(9.6, 1.2); g.lineTo(9.6, 2.6); g.lineTo(9.2, 3.0); g.lineTo(9.2, 4.6);
      g.bezierCurveTo(12.2, 5.2, 13.6, 7.0, 13.6, 9.6);
      g.bezierCurveTo(13.6, 13.0, 11.2, 15.1, 8, 15.1);
      g.bezierCurveTo(4.8, 15.1, 2.4, 13.0, 2.4, 9.6);
      g.bezierCurveTo(2.4, 7.0, 3.8, 5.2, 6.8, 4.6);
      g.lineTo(6.8, 3.0); g.lineTo(6.4, 2.6); g.closePath();
    }
  };
  const top = shape === 'lingering' ? 4.6 : 5.6;
  const fillLevel = opts.fill ?? (shape === 'lingering' ? 6.6 : 7.4);
  // glass body (frosted, semi-transparent white so the silhouette is solid enough for 3D extrusion)
  p.part((g) => {
    path(g);
    g.fillStyle = 'rgba(214,232,240,0.62)';
    g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 2, 0, 14, 0, [[0, 0xffffff, 0.25], [0.3, 0xffffff, 0.05], [0.85, 0x90a8b8, 0.2], [1, 0x506070, 0.4]]);
    g.fillRect(0, 0, 16, 16);
  }, GLASS);
  if (liquid !== null) {
    const lc = liquid;
    p.part((g) => {
      path(g);
      g.clip();
      g.fillStyle = rgba(lc, opts.opaque ? 1 : 0.92);
      g.beginPath();
      // gentle meniscus
      g.moveTo(0, fillLevel + 0.2);
      g.quadraticCurveTo(8, fillLevel - 0.5, 16, fillLevel + 0.2);
      g.lineTo(16, 16); g.lineTo(0, 16); g.closePath();
      g.fill();
    }, (g) => {
      g.fillStyle = rad(g, 6, 9.5, 0.5, 8, 11, 7.5, [[0, lighten(lc, 0.35)], [0.5, lc], [1, darken(tint(lc, -0.5), 0.55)]]);
      g.fillRect(0, 0, 16, 16);
      // surface line
      g.strokeStyle = rgba(lighten(lc, 0.55), 0.8);
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(3.6, fillLevel + 0.1);
      g.quadraticCurveTo(8, fillLevel - 0.55, 12.4, fillLevel + 0.1);
      g.stroke();
    }, { metal: 0, rough: 0.1, emissive: opts.glow ?? 0 });
  }
  // neck shadow + glass highlights on top
  p.part((g) => {
    path(g);
    g.fillStyle = 'rgba(0,0,0,0)';
    g.fill();
    g.save();
    path(g);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(4.2, 9.2);
    g.quadraticCurveTo(4.2, 7.6, 5.8, 6.9);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    ellipse(g, 4.4, 11.0, 0.45, 0.8, 0.2);
    g.fill();
    g.strokeStyle = 'rgba(40,60,80,0.45)';
    g.lineWidth = 0.5;
    path(g);
    g.stroke();
    g.restore();
  }, undefined, GLASS);
  // cork
  if (opts.cork !== false) {
    const cx = shape === 'splash' ? 9.6 : 8;
    const cy = shape === 'splash' ? 1.8 : 1.4;
    p.part((g) => {
      g.save();
      g.translate(cx, cy);
      if (shape === 'splash') g.rotate(0.28);
      poly(g, [-1.3, -1.2, 1.3, -1.2, 1.1, 1.0, -1.1, 1.0]);
      g.fillStyle = rgba(0xa8743e);
      g.fill();
      g.restore();
    }, (g) => {
      g.fillStyle = lin(g, cx - 1.3, 0, cx + 1.3, 0, [[0, 0xd8a868], [0.5, 0xa8743e], [1, 0x6a4420]]);
      g.fillRect(0, 0, 16, 16);
      p.speckle(g, 6, cx - 1.2, cy - 1.2, cx + 1.2, cy + 1, 0.25, 0x5a3a18, 0.5);
    }, { rough: 0.85 });
  }
  void top;
  void top;
}

/** Leather-bound book. */
export function book(p: Painter, cover: Col, opts: { band?: Col; corners?: Col; quill?: boolean } = {}) {
  // page block
  p.part((g) => {
    poly(g, [4.2, 3.0, 13.4, 2.0, 13.8, 12.6, 4.6, 14.2]);
    g.fillStyle = rgba(0xf2ead6);
    g.fill();
  }, (g) => {
    g.strokeStyle = 'rgba(150,130,100,0.55)';
    g.lineWidth = 0.18;
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      g.beginPath();
      g.moveTo(12.0 + t * 1.6, 2.4 + t * 0.2);
      g.lineTo(12.4 + t * 1.6, 12.8 - t * 0.2);
      g.stroke();
    }
  }, CLOTH);
  // cover
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.2, 3.6); g.lineTo(11.6, 2.4); g.lineTo(12.2, 13.0); g.lineTo(2.8, 14.6);
    g.quadraticCurveTo(1.8, 14.4, 1.9, 13.4); g.lineTo(1.6, 4.6); g.quadraticCurveTo(1.5, 3.7, 2.2, 3.6);
    g.closePath();
    g.fillStyle = rgba(cover);
    g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 2, 3, 12, 14, [[0, lighten(cover, 0.25)], [0.5, cover], [1, darken(cover, 0.35)]]);
    g.fillRect(0, 0, 16, 16);
    // spine
    g.fillStyle = lin(g, 1.5, 0, 4, 0, [[0, darken(cover, 0.5)], [0.4, lighten(cover, 0.2)], [1, darken(cover, 0.2)]]);
    poly(g, [1.5, 3.6, 3.6, 3.3, 4.1, 14.2, 2.0, 14.6]);
    g.fill();
    // leather grain
    p.speckle(g, 40, 2, 3, 12, 14, 0.22, darken(cover, 0.4), 0.25);
    if (opts.band !== undefined) {
      g.fillStyle = rgba(opts.band);
      poly(g, [4.4, 6.2, 11.5, 5.3, 11.6, 7.6, 4.5, 8.5]);
      g.fill();
      g.fillStyle = rgba(lighten(opts.band, 0.4), 0.7);
      poly(g, [4.4, 6.2, 11.5, 5.3, 11.5, 5.8, 4.4, 6.7]);
      g.fill();
    }
    if (opts.corners !== undefined) {
      g.fillStyle = rgba(opts.corners);
      poly(g, [11.6, 2.4, 12.0, 5.0, 9.4, 2.7]);
      g.fill();
      poly(g, [12.2, 13.0, 9.6, 13.4, 12.0, 10.6]);
      g.fill();
      g.fillStyle = rgba(lighten(opts.corners, 0.4));
      circle(g, 7.8, 8.4, 1.2);
      g.fill();
      g.strokeStyle = rgba(opts.corners);
      g.lineWidth = 0.35;
      ellipse(g, 7.8, 8.4, 2.6, 3.2, 0);
      g.stroke();
    }
  }, { rough: 0.55 });
  if (opts.quill) {
    p.part((g) => {
      g.beginPath();
      g.moveTo(14.8, 1.0);
      g.quadraticCurveTo(15.2, 4.6, 10.6, 9.6);
      g.lineTo(10.0, 9.2);
      g.quadraticCurveTo(12.0, 4.6, 14.8, 1.0);
      g.closePath();
      g.fillStyle = rgba(0x2a2a30);
      g.fill();
      g.strokeStyle = rgba(0x2a2a30);
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(10.2, 9.4);
      g.lineTo(8.8, 11.6);
      g.stroke();
    }, (g) => {
      g.fillStyle = lin(g, 10, 9, 15, 1, [[0, 0x18181c], [0.6, 0x3a3a44], [1, 0x8a8a9a]]);
      g.fillRect(0, 0, 16, 16);
    }, { rough: 0.5 });
  }
}

/** An egg-shaped outline. */
export function eggPath(g: Ctx, cx: number, cy: number, w: number, h: number, rot = 0) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, -h / 2);
  g.bezierCurveTo(w * 0.62, -h / 2, w / 2, h * 0.18, w / 2, h * 0.12);
  g.bezierCurveTo(w / 2, h * 0.42, w * 0.28, h / 2, 0, h / 2);
  g.bezierCurveTo(-w * 0.28, h / 2, -w / 2, h * 0.42, -w / 2, h * 0.12);
  g.bezierCurveTo(-w / 2, h * 0.18, -w * 0.62, -h / 2, 0, -h / 2);
  g.closePath();
  g.restore();
}

/** Grey-metal rim + inside of a bucket, body, handle. Returns the opening ellipse. */
export function bucket(p: Painter, metal: Col, contents: Col | null, opts: { glow?: number; fish?: Col } = {}) {
  const top = 5.2, bot = 14.0;
  const rxT = 5.6, ryT = 1.9, rxB = 4.1, ryB = 1.2;
  // handle (behind)
  p.part((g) => {
    g.beginPath();
    g.ellipse(8, top, rxT + 0.2, 4.8, 0, Math.PI, 0);
    g.strokeStyle = rgba(darken(metal, 0.3));
    g.lineWidth = 0.7;
    g.stroke();
  }, undefined, { metal: 1, rough: 0.4 });
  // body
  p.part((g) => {
    g.beginPath();
    g.moveTo(8 - rxT, top);
    g.lineTo(8 - rxB, bot);
    g.ellipse(8, bot, rxB, ryB, 0, Math.PI, 0, true);
    g.lineTo(8 + rxT, top);
    g.ellipse(8, top, rxT, ryT, 0, 0, Math.PI, false);
    g.closePath();
    g.fillStyle = rgba(metal);
    g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 8 - rxT, 0, 8 + rxT, 0, [[0, darken(metal, 0.25)], [0.18, lighten(metal, 0.45)], [0.32, lighten(metal, 0.15)], [0.62, darken(metal, 0.12)], [0.85, darken(metal, 0.45)], [1, darken(metal, 0.3)]]);
    g.fillRect(0, 0, 16, 16);
    // reinforcing bands
    for (const y of [7.6, 11.6]) {
      const t = (y - top) / (bot - top);
      const rx = rxT + (rxB - rxT) * t, ry = ryT + (ryB - ryT) * t;
      g.strokeStyle = rgba(darken(metal, 0.45), 0.7);
      g.lineWidth = 0.35;
      g.beginPath();
      g.ellipse(8, y, rx, ry, 0, 0, Math.PI);
      g.stroke();
      g.strokeStyle = rgba(lighten(metal, 0.5), 0.5);
      g.lineWidth = 0.2;
      g.beginPath();
      g.ellipse(8, y - 0.35, rx, ry, 0, 0.2, Math.PI - 0.2);
      g.stroke();
    }
    p.speckle(g, 25, 2.5, 5, 13.5, 14.5, 0.2, darken(metal, 0.5), 0.2);
  }, { metal: 1, rough: 0.38 });
  // opening
  p.part((g) => {
    ellipse(g, 8, top, rxT, ryT);
    g.fillStyle = rgba(darken(metal, 0.55));
    g.fill();
  }, (g) => {
    if (contents !== null) {
      g.fillStyle = rad(g, 6.5, top - 0.6, 0.3, 8, top, rxT, [[0, lighten(contents, 0.45)], [0.6, contents], [1, darken(contents, 0.35)]]);
      ellipse(g, 8, top + 0.15, rxT - 0.55, ryT - 0.4);
      g.fill();
      p.spec(g, 6.2, top - 0.5, 1.6, 0.45, 0, 0.55);
      if (opts.fish !== undefined) {
        g.fillStyle = rgba(opts.fish);
        g.beginPath();
        g.ellipse(8.4, top + 0.1, 2.0, 0.7, 0.15, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(6.4, top - 0.1); g.lineTo(5.2, top - 0.8); g.lineTo(5.3, top + 0.7); g.closePath();
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.8)';
        circle(g, 9.7, top - 0.05, 0.22);
        g.fill();
      }
    } else {
      g.fillStyle = lin(g, 0, top - ryT, 0, top + ryT, [[0, darken(metal, 0.75)], [1, darken(metal, 0.35)]]);
      g.fillRect(0, 0, 16, 16);
    }
    // rim
    g.strokeStyle = rgba(lighten(metal, 0.4));
    g.lineWidth = 0.5;
    ellipse(g, 8, top, rxT - 0.2, ryT - 0.15);
    g.stroke();
  }, contents !== null ? { metal: 0, rough: 0.08, emissive: opts.glow ?? 0 } : { metal: 1, rough: 0.45 });
}

/** Wooden bowl with optional contents. */
export function bowl(p: Painter, soup: Col | null, chunks?: Col) {
  const wood = 0x9a6a3a;
  const top = 8.2, rx = 6.6, ry = 2.2;
  p.part((g) => {
    g.beginPath();
    g.moveTo(8 - rx, top);
    g.bezierCurveTo(8 - rx, 12.6, 5.2, 14.4, 8, 14.4);
    g.bezierCurveTo(10.8, 14.4, 8 + rx, 12.6, 8 + rx, top);
    g.ellipse(8, top, rx, ry, 0, 0, Math.PI, false);
    g.closePath();
    g.fillStyle = rgba(wood);
    g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 1, 0, 15, 0, [[0, darken(wood, 0.2)], [0.25, lighten(wood, 0.25)], [0.6, wood], [1, darken(wood, 0.45)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(wood, 0.35), 0.4);
    g.lineWidth = 0.18;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(8, top + 1 + i * 0.9, rx * (0.95 - i * 0.07), ry * 0.6, 0, 0.15, Math.PI - 0.15);
      g.stroke();
    }
  }, { rough: 0.6 });
  p.part((g) => {
    ellipse(g, 8, top, rx, ry);
    g.fillStyle = rgba(darken(wood, 0.25));
    g.fill();
  }, (g) => {
    if (soup !== null) {
      g.fillStyle = rad(g, 6.5, top - 0.6, 0.2, 8, top, rx, [[0, lighten(soup, 0.3)], [0.7, soup], [1, darken(soup, 0.35)]]);
      ellipse(g, 8, top + 0.2, rx - 0.7, ry - 0.5);
      g.fill();
      if (chunks !== undefined) {
        for (let i = 0; i < 5; i++) {
          g.fillStyle = rgba(i % 2 ? chunks : mix(chunks, soup, 0.4));
          ellipse(g, 4.2 + p.rand() * 7.6, top - 0.6 + p.rand() * 1.4, 0.7, 0.42, p.rand() * 3);
          g.fill();
        }
      }
      p.spec(g, 6.0, top - 0.5, 1.6, 0.4, 0, 0.45);
    } else {
      g.fillStyle = lin(g, 0, top - ry, 0, top + ry, [[0, darken(wood, 0.5)], [1, darken(wood, 0.15)]]);
      g.fillRect(0, 0, 16, 16);
    }
    g.strokeStyle = rgba(lighten(wood, 0.35));
    g.lineWidth = 0.45;
    ellipse(g, 8, top, rx - 0.22, ry - 0.15);
    g.stroke();
  }, soup !== null ? { rough: 0.25 } : { rough: 0.6 });
}
