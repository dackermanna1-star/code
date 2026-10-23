/* Derry High School (exterior, main hall, Ms. Whitcomb's classroom,
 * cafeteria, boiler room) and the Derry Public Library reading room.
 * Same hand as bg_larch.js: flat two-tone shapes, light as shapes. */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  const F_TYPE = "'Special Elite','Courier New',monospace";
  const F_HAND = "'Covered By Your Grace','Comic Sans MS',cursive";
  const F_SIGN = "'Barlow Condensed','Arial Narrow',sans-serif";

  /* <text> with an optional fixed advance (textLength) so the layout holds
   * whichever fallback font the player's browser ends up using. */
  const T = (x, y, str, o = {}) => {
    let a = ` x="${n(x)}" y="${n(y)}" font-family="${K.esc(o.font || F_SIGN)}" font-size="${n(o.size || 20)}" fill="${o.fill || P.ink}"`;
    if (o.anchor) a += ` text-anchor="${o.anchor}"`;
    if (o.weight) a += ` font-weight="${o.weight}"`;
    if (o.ls !== undefined) a += ` letter-spacing="${o.ls}"`;
    if (o.opacity !== undefined) a += ` opacity="${n(o.opacity * 100) / 100}"`;
    if (o.len) a += ` textLength="${n(o.len)}" lengthAdjust="spacingAndGlyphs"`;
    if (o.stroke) a += ` stroke="${o.stroke}" stroke-width="${o.sw || 1}" stroke-linejoin="round"`;
    if (o.style) a += ` font-style="${o.style}"`;
    if (o.transform) a += ` transform="${o.transform}"`;
    return `<text${a}>${K.esc(str)}</text>`;
  };

  /* True one-point perspective camera (feet, camera at X=0, Y=eye, Z=0,
   * looking down +Z). Repeated things (lockers, desks, tables) recede
   * correctly, which K.room's screen-linear mapping can't do. */
  const Cam = (f, cx, cy, eye) => {
    const c = { f, cx, cy, eye };
    c.p = (X, Y, Z) => [cx + (X * f) / Z, cy - ((Y - eye) * f) / Z];
    c.s = (Z) => f / Z;
    c.fx = (X, Z0, Z1, Y0, Y1) => [c.p(X, Y1, Z0), c.p(X, Y1, Z1), c.p(X, Y0, Z1), c.p(X, Y0, Z0)];
    c.fz = (Z, X0, X1, Y0, Y1) => [c.p(X0, Y1, Z), c.p(X1, Y1, Z), c.p(X1, Y0, Z), c.p(X0, Y0, Z)];
    c.fy = (Y, X0, X1, Z0, Z1) => [c.p(X0, Y, Z0), c.p(X1, Y, Z0), c.p(X1, Y, Z1), c.p(X0, Y, Z1)];
    /* affine frame for flat content (text) lying on a side wall X=const:
     * local +u runs along dir*Z, local +v runs down; k local units per foot */
    c.onX = (X, Y, Z, dir = 1, k = 100) => {
      const [sx, sy] = c.p(X, Y, Z), z2 = Z * Z;
      return `matrix(${((dir * -X * f) / z2 / k).toFixed(4)} ${((dir * (Y - eye) * f) / z2 / k).toFixed(4)} 0 ${(f / Z / k).toFixed(4)} ${n(sx)} ${n(sy)})`;
    };
    /* frame for content on a plane facing the camera (Z=const) */
    c.onZ = (X, Y, Z, k = 100) => {
      const [sx, sy] = c.p(X, Y, Z), sc = (f / Z / k).toFixed(4);
      return `matrix(${sc} 0 0 ${sc} ${n(sx)} ${n(sy)})`;
    };
    /* axis-aligned box; only faces turned toward the camera are drawn.
     * col: {front, left, right, top, bottom} (left = the face at X0). */
    c.box = (X0, X1, Y0, Y1, Z0, Z1, col, o2) => {
      let r = '';
      if (X0 > 0 && col.left) r += K.poly(c.fx(X0, Z0, Z1, Y0, Y1), col.left, o2);
      if (X1 < 0 && col.right) r += K.poly(c.fx(X1, Z0, Z1, Y0, Y1), col.right, o2);
      if (Y1 < eye && col.top) r += K.poly(c.fy(Y1, X0, X1, Z0, Z1), col.top, o2);
      if (Y0 > eye && col.bottom) r += K.poly(c.fy(Y0, X0, X1, Z0, Z1), col.bottom, o2);
      if (col.front) r += K.poly(c.fz(Z0, X0, X1, Y0, Y1), col.front, o2);
      return r;
    };
    c.line = (a, b, stroke, w = 1, o2) => K.line(...c.p(...a), ...c.p(...b), stroke, w, o2);
    return c;
  };

  /* o.id(name) is per-render, not per-call: anything drawn in a loop (or a
   * userSpace gradient reused with new geometry) needs its own name. */
  let UID = 0;
  const u = (name) => name + (UID++).toString(36);
  /* text laid letter by letter along a side wall (X = const) between z0
   * and z1, so a long word keeps true perspective; reads left to right */
  const wallLetters = (c, X, Y, z0, z1, str, sizeFt, fill, o2 = {}) => {
    const ch = [...str], dir = X < 0 ? 1 : -1;
    let r = '';
    ch.forEach((q, i) => {
      if (q === ' ') return;
      const t = (i + 0.5) / ch.length, Z = dir > 0 ? z0 + (z1 - z0) * t : z1 - (z1 - z0) * t;
      r += T(0, 0, q, Object.assign({ size: sizeFt * 100, anchor: 'middle', fill, transform: c.onX(X, Y, Z, dir) }, o2));
    });
    return r;
  };
  const clipTo = (o, poly, inner) => {
    const id = o.id(u('clip'));
    return `<clipPath id="${id}"><polygon points="${K.pts(poly)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
  };
  const speckle = (o, rng, colors, { size = 36, count = 14, rMin = 0.6, rMax = 1.9 } = {}) => {
    const id = o.id(u('speck'));
    let tile = '';
    for (let i = 0; i < count; i++) tile += `<circle cx="${n(rng() * size)}" cy="${n(rng() * size)}" r="${n(rMin + rng() * (rMax - rMin))}" fill="${rng.pick(colors)}"/>`;
    return { defs: `<defs><pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>`, fill: `url(#${id})` };
  };
  /* analog clock face (frontal) */
  const clockFace = (x, y, r, hh, mm, { rim = '#2a2622', face = '#efe9da', hand = '#1d1a18' } = {}) => {
    let s = K.circle(x, y, r * 1.14, rim) + K.circle(x, y, r, face);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s += K.line(x + Math.sin(a) * r * 0.78, y - Math.cos(a) * r * 0.78, x + Math.sin(a) * r * 0.92, y - Math.cos(a) * r * 0.92, hand, i % 3 ? r * 0.05 : r * 0.1);
    }
    const ha = ((hh % 12) + mm / 60) / 12 * Math.PI * 2, ma = (mm / 60) * Math.PI * 2;
    s += K.line(x, y, x + Math.sin(ha) * r * 0.5, y - Math.cos(ha) * r * 0.5, hand, Math.max(1.5, r * 0.1), { strokeLinecap: 'round' });
    s += K.line(x, y, x + Math.sin(ma) * r * 0.78, y - Math.cos(ma) * r * 0.78, hand, Math.max(1, r * 0.06), { strokeLinecap: 'round' });
    return s + K.circle(x, y, Math.max(1.2, r * 0.07), hand);
  };

  /* ------------------------------------------------------------------ */
  /* The main hall: lockers, trophy case, bulletin board, terrazzo.
   * Locker 227 (Gus's) sits on the left wall, ~x 390–460, y 350–720. */
  ART.bg('school_hall', {
    times: ['day', 'empty_night'],
    light: { day: 'fluorescent', empty_night: 'dim' },
    draw(o) {
      const rng = o.rng, night = o.time === 'empty_night';
      const tt = night ? 'dim' : 'fluorescent';
      /* at night everything sinks toward blue-black; light is added back on top */
      const L = night ? (c) => K.mix(K.tone(c, tt), '#101524', 0.5) : (c) => K.tone(c, tt);
      const S = night ? (c) => K.mix(K.shade(c, tt), '#090c16', 0.55) : (c) => K.shade(c, tt);
      const M = (c, k) => K.mix(S(c), L(c), k);
      const c = Cam(540, 820, 430, 5.2);
      const XL = -5.4, XR = 7.2, YC = 10.4, ZB = 40, ZN = 2.4, LK = 6.3, LB = 0.45;
      const wall = '#d4cfb0', ceil = '#d8d4c4', floor = '#bdb29e', lock = '#9a4932', oak = '#94683f';
      let s = '', lite = ''; // lite: emissive things + light, drawn above the darkness

      /* shell */
      s += K.poly(c.fy(YC, XL, XR, ZN, ZB), S(ceil));
      s += K.poly(c.fx(XL, ZN, ZB, 0, YC), M(wall, 0.4));
      s += K.poly(c.fx(XR, ZN, ZB, 0, YC), M(wall, 0.72));
      const floorPoly = c.fy(0, XL, XR, ZN, ZB);
      s += K.poly(floorPoly, L(floor));
      const sp = speckle(o, rng, [S('#7d705e'), L('#e6dcc6'), S('#8f5a44'), L('#a7a58c')], { size: 30, count: 16, rMin: 0.6, rMax: 1.6 });
      s += sp.defs + K.poly(floorPoly, sp.fill, { opacity: night ? 0.16 : 0.55 });
      let strips = '';
      for (const X of [-1.6, 2.4]) strips += c.line([X, 0, ZN], [X, 0, ZB], L('#b89a5a'), 1.4);
      for (let Z = 6; Z < ZB; Z += 4) strips += c.line([XL, 0, Z], [XR, 0, Z], L('#b89a5a'), 1.2);
      s += K.g({ opacity: night ? 0.3 : 0.5 }, strips);
      let grid = '';
      for (let X = XL + 1.3; X < XR; X += 2) grid += c.line([X, YC, ZN], [X, YC, ZB], S('#a9a596'), 1.2);
      for (let Z = 4; Z < ZB; Z += 4) grid += c.line([XL, YC, Z], [XR, YC, Z], S('#a9a596'), 1.2);
      s += K.g({ opacity: 0.6 }, grid);
      s += K.poly(c.fx(XL, ZN, ZB, 8.15, 8.3), S(oak)) + K.poly(c.fx(XR, ZN, ZB, 8.15, 8.3), M(oak, 0.6));

      /* end wall: the big stair-landing window */
      const WX0 = -3.4, WX1 = 5.2, WY0 = 2.7, WY1 = 9.5;
      s += K.poly(c.fz(ZB, XL, XR, 0, YC), M(wall, 0.55));
      s += K.poly(c.fz(ZB, WX0 - 0.18, WX1 + 0.18, WY0 - 0.18, WY1 + 0.15), M('#8c8676', 0.6));
      const win = c.fz(ZB, WX0, WX1, WY0, WY1);
      const [wx0, wy0] = c.p(WX0, WY1, ZB), [wx1, wy1] = c.p(WX1, WY0, ZB);
      const ww = wx1 - wx0, wh = wy1 - wy0;
      {
        const gid = o.id(u('farwin'));
        let w = K.defs(K.linear(gid, night ? [[0, '#6d86b6'], [1, '#33456c']] : [[0, '#fbf8ee'], [0.7, '#f3ecd8'], [1, '#e6dcc0']])) + K.poly(win, `url(#${gid})`);
        w += clipTo(o, win, K.path(K.blob(rng, wx0 + ww * 0.8, wy0 + wh * 0.62, ww * 0.3, wh * 0.36, { lobes: 6, jag: 0.25 }), night ? '#22304e' : '#efc9a0', { opacity: night ? 0.95 : 0.75 }) +
          K.rect(wx0, wy0 + wh * 0.8, ww * 0.6, wh * 0.2, night ? '#1c2640' : '#e2d6be', { opacity: 0.9 }) +
          (night ? K.circle(wx0 + ww * 0.24, wy0 + wh * 0.22, 5, '#eef0e6') : ''));
        for (let i = 1; i < 4; i++) w += K.rect(wx0 + (ww * i) / 4 - 1.2, wy0, 2.4, wh, night ? '#121826' : '#77705f');
        for (let i = 1; i < 4; i++) w += K.rect(wx0, wy0 + (wh * i) / 4 - 1, ww, 2, night ? '#121826' : '#77705f');
        lite += w;
      }
      s += K.poly(c.fz(ZB, WX0 - 0.4, WX1 + 0.4, WY0 - 0.42, WY0 - 0.26), L('#cfc8b6'));
      s += K.poly(c.fz(ZB, -1.8, 3.6, 0.4, 2.1), M('#a8a497', 0.6));
      for (let X = -1.6; X < 3.5; X += 0.35) s += K.poly(c.fz(ZB, X, X + 0.14, 0.5, 2.0), S('#a8a497'));

      /* ---------- lockers, doors ---------- */
      const lockFaceL = M(lock, 0.5), lockFaceR = M(lock, 0.8);
      const vent = K.adj(S(lock), -0.25), seam = K.adj(S(lock), -0.45), lip = M(lock, 1.15);
      const plate = night ? '#4a4c52' : L('#cfcbbf'), digit = night ? '#14151a' : '#29231f';
      const locked = { 225: 1, 228: 1, 230: 1, 231: 1, 293: 1, 296: 1, 248: 1 };
      const locker = (X, z0, z1, num) => {
        const dir = X < 0 ? 1 : -1, zm = (z0 + z1) / 2;
        let r = K.poly(c.fx(X, z0, z1, LB, LK), X < 0 ? lockFaceL : lockFaceR);
        r += K.poly(c.fx(X, dir > 0 ? z0 : z1 - 0.05, dir > 0 ? z0 + 0.05 : z1, LB, LK), seam);
        if (zm < 17) {
          r += K.poly(c.fx(X, z0 + 0.06, z1 - 0.02, LK - 0.08, LK - 0.03), lip, { opacity: 0.6 });
          for (let i = 0; i < 4; i++) { const y = 5.62 + i * 0.13; r += K.poly(c.fx(X, z0 + 0.28, z1 - 0.28, y, y + 0.065), vent); }
          for (let i = 0; i < 4; i++) { const y = 0.72 + i * 0.13; r += K.poly(c.fx(X, z0 + 0.28, z1 - 0.28, y, y + 0.065), vent); }
          const hz0 = dir > 0 ? z0 + 0.14 : z1 - 0.3;
          r += K.poly(c.fx(X, hz0, hz0 + 0.16, 3.05, 3.8), seam) + K.poly(c.fx(X, hz0, hz0 + 0.16, 3.72, 3.8), night ? '#3a3c42' : L('#c9c4b8'));
          if (locked[num]) {
            const [lx, ly] = c.p(X + 0.05, 2.92, hz0 + 0.08), lr = c.s(hz0) * 0.1;
            r += K.path(`M${n(lx - lr * 0.55)},${n(ly - lr * 0.4)} v${n(-lr * 0.7)} a${n(lr * 0.55)},${n(lr * 0.55)} 0 0 1 ${n(lr * 1.1)},0 v${n(lr * 0.7)}`, 'none', { stroke: night ? '#3a3c42' : L('#b9bcbc'), strokeWidth: Math.max(1, lr * 0.22) });
            r += K.circle(lx, ly, lr, night ? '#16171c' : '#2a2b30') + K.circle(lx, ly, lr * 0.62, night ? '#3a3c42' : L('#c9ccce'));
          }
          r += K.poly(c.fx(X, zm - 0.24, zm + 0.24, 5.06, 5.42), plate);
          if (zm < 14) r += T(0, 0, String(num), { size: 25, anchor: 'middle', fill: digit, weight: 700, len: 33, transform: c.onX(X, 5.13, zm, dir) });
        } else {
          r += K.poly(c.fx(X, z0 + 0.3, z1 - 0.3, 5.6, 6.1), vent, { opacity: 0.55 }) + K.poly(c.fx(X, zm - 0.2, zm + 0.2, 5.08, 5.4), plate, { opacity: 0.7 });
        }
        return r;
      };
      const run = (X, zA, zB, num, step = 1.25) => {
        let r = K.poly(c.fx(X, zA, zB, 0, LB), night ? '#0a0b10' : S('#2c2826')) + K.poly(c.fx(X, zA, zB, LK, LK + 0.3), K.adj(X < 0 ? lockFaceL : lockFaceR, -0.14));
        r += K.poly(c.fx(X, zA, zB, LK + 0.3, LK + 0.42), S(wall), { opacity: 0.5 });
        const items = [];
        for (let z = zA, k = num; z + step <= zB + 0.01; z += step, k++) items.push(locker(X, z, z + step, k));
        return r + items.reverse().join('');
      };
      const door = (X, z0, z1, open = false) => {
        const dir = X < 0 ? 1 : -1;
        let r = K.poly(c.fx(X, z0 - 0.25, z1 + 0.25, 0, 7.4), M(oak, X < 0 ? 0.35 : 0.65));
        r += K.poly(c.fx(X, z0, z1, 0, 7.1), open ? (night ? '#05070b' : S('#3a3530')) : M(oak, X < 0 ? 0.55 : 0.85));
        if (!open) {
          const wz0 = dir > 0 ? z1 - 1.2 : z0 + 0.8, wz1 = wz0 + 0.42;
          r += K.poly(c.fx(X, wz0, wz1, 3.9, 6.4), night ? '#2a3858' : L('#8c9aa0'));
          r += K.poly(c.fx(X, wz0, wz1, 3.9, 6.4), 'none', { stroke: S('#5a5a52'), strokeWidth: 0.8, strokeDasharray: '2 2', opacity: 0.6 });
          r += K.poly(c.fx(X, dir > 0 ? z0 + 0.25 : z1 - 0.4, dir > 0 ? z0 + 0.4 : z1 - 0.25, 3.3, 3.45), L('#c9a24a'));
        } else if (!night) {
          r += K.poly(c.fx(X, z0, z1, 0, 7.1), '#e8eef0', { opacity: 0.08 });
        }
        r += K.poly(c.fx(X, z0 + 0.1, z1 - 0.1, 7.6, 8.05), night ? '#1e2a44' : L('#9aa6a8'));
        r += K.poly(c.fx(X, (z0 + z1) / 2 - 0.35, (z0 + z1) / 2 + 0.35, 6.75, 7.0), L('#e8e1cf'));
        return r;
      };
      s += run(XL, 33, 39.25, 260) + door(XL, 29.6, 32.6) + run(XL, 19.25, 29.25, 242) + door(XL, 15.9, 18.9) + run(XL, 3.05, 15.55, 224);
      s += K.poly(c.fx(XL, 5.95, 6.15, 4.4, 4.62), L('#d9b44a'), { opacity: 0.9 }); // a sticker on 226
      s += K.poly(c.fx(XL, 10.75, 10.9, 2.0, 2.5), L('#6a8ab0'), { opacity: 0.7 });  // and one on 230
      s += run(XR, 28.6, 39.85, 301) + door(XR, 25.2, 28.2, true) + run(XR, 18.6, 24.85, 292);

      /* trophy case, built into the right wall, lit from within */
      const TZ0 = 12.7, TZ1 = 18.2, TY0 = 2.6, TY1 = 7.6, TD = 1.4;
      s += K.poly(c.fx(XR, TZ0 - 0.3, TZ1 + 0.3, TY0 - 0.35, TY1 + 0.3), M(oak, 0.7));
      const glass = c.fx(XR, TZ0, TZ1, TY0, TY1);
      {
        const inside = night ? (c0) => K.mix(S(c0), '#05070b', 0.5) : (c0) => K.mix(L(c0), '#fff6e0', 0.08);
        let tc = K.poly(c.fx(XR + TD, TZ0, TZ1, TY0, TY1), inside('#6a3a30'));
        tc += K.poly(c.fz(TZ1, XR, XR + TD, TY0, TY1), inside('#4f2a24'));
        tc += K.poly(c.fy(TY1, XR, XR + TD, TZ0, TZ1), inside('#e9e2cf'));
        tc += K.poly(c.fy(TY0, XR, XR + TD, TZ0, TZ1), inside('#7a3a30'));
        // a faded team photo, 1958 state champions, leaning on the back
        tc += K.poly(c.fx(XR + TD - 0.02, 15.0, 17.6, 5.6, 7.0), inside('#d8cdb0'));
        tc += K.poly(c.fx(XR + TD - 0.03, 15.15, 17.45, 5.72, 6.88), inside('#b5a588'));
        for (let row = 0; row < 3; row++) for (let k = 0; k < 9; k++) {
          const zz = 15.3 + k * 0.24 + (row % 2) * 0.1, yy = 5.95 + row * 0.25;
          tc += K.circle(...c.p(XR + TD - 0.04, yy, zz), 1.7, inside('#7a6a54'), { opacity: 0.8 });
        }
        tc += K.poly([c.p(XR + TD - 0.03, 7.3, 13.0), c.p(XR + TD - 0.03, 6.7, 13.0), c.p(XR + TD - 0.03, 7.0, 14.9)], inside('#7a2232'));
        for (const sy of [4.15, 5.45]) tc += K.poly(c.fy(sy, XR, XR + TD, TZ0, TZ1), inside('#dfe6e2'), { opacity: 0.55 });
        const gold = inside('#d4ac50'), goldS = inside('#8e6c2a'), base = inside('#3c2e26');
        const cup = (X, Y, Z, h) => {
          const [x, y] = c.p(X, Y, Z), sc = c.s(Z), w = 0.36 * sc, H = h * sc;
          return K.rect(x - w * 0.6, y - H * 0.22, w * 1.2, H * 0.22, base) + K.rect(x - w * 0.1, y - H * 0.55, w * 0.2, H * 0.33, goldS) +
            K.path(`M${n(x - w * 0.55)},${n(y - H)} h${n(w * 1.1)} q0,${n(H * 0.42)} ${n(-w * 0.55)},${n(H * 0.46)} q${n(-w * 0.55)},${n(-H * 0.04)} ${n(-w * 0.55)},${n(-H * 0.46)} Z`, gold) +
            K.rect(x - w * 0.42, y - H * 0.97, w * 0.16, H * 0.3, '#fff6dc', { opacity: night ? 0.12 : 0.6 });
        };
        const fig = (X, Y, Z, h) => {
          const [x, y] = c.p(X, Y, Z), sc = c.s(Z), H = h * sc, w = 0.26 * sc;
          return K.rect(x - w * 0.7, y - H * 0.25, w * 1.4, H * 0.25, base) + K.rect(x - w * 0.3, y - H * 0.8, w * 0.6, H * 0.55, goldS) + K.circle(x, y - H * 0.88, w * 0.32, gold);
        };
        [[17.4, 0.8], [16.5, 1.05], [15.5, 0.6], [14.6, 0.9]].forEach(([z, h], i) => { tc += i % 2 ? fig(XR + 0.75, TY0, z, h) : cup(XR + 0.75, TY0, z, h); });
        [[17.3, 0.9], [16.3, 0.7], [15.3, 1.0], [14.3, 0.7]].forEach(([z, h], i) => { tc += i % 2 ? fig(XR + 0.7, 4.15, z, h) : cup(XR + 0.7, 4.15, z, h); });
        [[17.0, 0.55], [14.6, 0.45]].forEach(([z, h]) => { tc += cup(XR + 0.8, 5.45, z, h); });
        if (!night) tc += K.poly(c.fy(TY1 - 0.02, XR + 0.2, XR + 0.5, TZ0 + 0.2, TZ1 - 0.2), '#fbfbf2') + K.pool(o, ...c.p(XR + 0.7, TY0, 15.5), 60, 14, '#fff6dc', 0.35, u('tcp'));
        s += clipTo(o, glass, tc);
      }
      s += K.poly([c.p(XR, TY1, 13.3), c.p(XR, TY1, 14.1), c.p(XR, TY0, 15.6), c.p(XR, TY0, 14.8)], '#ffffff', { opacity: night ? 0.05 : 0.13 });
      s += K.poly([c.p(XR, TY1, 15.6), c.p(XR, TY1, 15.9), c.p(XR, TY0, 17.4), c.p(XR, TY0, 17.1)], '#ffffff', { opacity: night ? 0.04 : 0.1 });
      s += K.poly(c.fx(XR, TZ0, TZ1, TY0 - 0.32, TY0), S(oak));
      // fire alarm pull station
      s += K.poly(c.fx(XR, 19.0, 19.35, 4.4, 4.95), night ? '#2a1214' : L('#b8342c'));

      /* drinking fountain: enamel body, steel basin */
      const FZ0 = 10.95, FZ1 = 12.1, FX0 = XR - 1.2;
      s += K.poly(c.fx(XR, FZ0 - 0.15, FZ1 + 0.15, 2.4, 4.0), M('#bdb8a8', 0.55));
      s += c.box(FX0 + 0.3, XR, 1.1, 2.5, FZ0 + 0.14, FZ1 - 0.14, { front: M('#cfc8b4', 0.55), left: M('#cfc8b4', 0.85) });
      s += c.box(FX0, XR, 2.5, 3.2, FZ0, FZ1, { front: M('#b9bcbc', 0.65), left: L('#c9cccc'), top: L('#dfe2e1') });
      s += K.poly(c.fy(3.21, FX0 + 0.14, XR - 0.12, FZ0 + 0.12, FZ1 - 0.12), S('#8f9496'));
      { const [bx, by] = c.p(FX0 + 0.45, 3.32, (FZ0 + FZ1) / 2); s += K.rect(bx - 2, by - 3, 4, 6, L('#e2e4e3')); }
      { const [bx, by] = c.p(FX0, 2.85, (FZ0 + FZ1) / 2 - 0.1); s += K.circle(bx + 8, by, 2.6, S('#6c7072')); }

      /* bulletin board: old missing-child posters under this fall's flyers */
      const BZ0 = 6.8, BZ1 = 10.4, BY0 = 3.3, BY1 = 6.5;
      s += K.poly(c.fx(XR, BZ0 - 0.15, BZ1 + 0.15, BY0 - 0.15, BY1 + 0.15), M(oak, 0.8));
      s += K.poly(c.fx(XR, BZ0, BZ1, BY0, BY1), night ? '#21190f' : L('#b48a58'));
      { const cp = speckle(o, rng, [S('#8a6038'), L('#d0a670')], { size: 14, count: 10, rMin: 0.5, rMax: 1.2 }); s += cp.defs + K.poly(c.fx(XR, BZ0, BZ1, BY0, BY1), cp.fill, { opacity: 0.5 }); }
      const paper = (u0, u1, y0, y1, fill, op = 1) => K.poly(c.fx(XR, BZ1 - u0, BZ1 - u1, y0, y1), fill, { opacity: op });
      const ptext = (uu, y, str, size, fill, len, o2 = {}) => T(0, 0, str, Object.assign({ size, fill, anchor: 'middle', len, transform: c.onX(XR, y, BZ1 - uu, -1) }, o2));
      const pin = (uu, y, col) => K.circle(...c.p(XR, y, BZ1 - uu), Math.max(1.6, c.s(BZ1 - uu) * 0.035), col);
      const faded = night ? '#34342f' : L('#d6cfbb'), fadedInk = night ? '#1e1e1b' : L('#8a8478'), photo = night ? '#2a2a28' : L('#a9a291');
      const ink = (c0) => (night ? '#17150f' : c0);
      // scraps of older paper, torn, under everything
      s += paper(2.62, 2.9, 3.5, 3.9, faded, 0.8) + paper(0.05, 0.3, 6.0, 6.35, faded, 0.7);
      s += paper(0.12, 1.1, 4.3, 5.75, faded);
      s += ptext(0.61, 5.48, 'HAVE YOU SEEN', 15, fadedInk, 78, { weight: 700 });
      s += ptext(0.61, 5.3, 'THIS CHILD?', 15, fadedInk, 70, { weight: 700 });
      s += paper(0.38, 0.84, 4.55, 5.18, photo);
      s += paper(1.75, 2.6, 4.75, 6.25, faded, 0.95);
      s += ptext(2.17, 6.0, 'HAVE YOU SEEN', 14, fadedInk, 68, { weight: 700 });
      s += ptext(2.17, 5.84, 'THIS CHILD?', 14, fadedInk, 60, { weight: 700 });
      s += paper(1.95, 2.4, 5.05, 5.62, photo);
      s += paper(0.5, 1.55, 3.45, 4.75, night ? '#3e3820' : L('#e3c24c'));
      s += ptext(1.02, 4.42, 'CANAL DAYS', 19, ink('#6a2a1c'), 86, { weight: 700 });
      s += ptext(1.02, 4.12, '— OCT 11 —', 17, ink('#6a2a1c'), 70, { weight: 700 });
      s += ptext(1.02, 3.72, 'MAIN ST · PARADE · FIREWORKS', 7, ink('#6a2a1c'), 84);
      s += paper(1.62, 2.28, 4.05, 5.15, night ? '#352729' : L('#e2a3a8'));
      s += ptext(1.95, 4.8, 'VOTE', 16, ink('#5a1e2a'), 40, { weight: 700 });
      s += ptext(1.95, 4.55, 'STUDENT', 10, ink('#5a1e2a'), 44);
      s += ptext(1.95, 4.38, 'COUNCIL', 10, ink('#5a1e2a'), 44);
      s += paper(2.85, 3.5, 4.1, 5.95, night ? '#3c3c36' : L('#efeadb'));
      s += ptext(3.17, 5.7, 'AV CLUB SIGN-UP', 9, ink('#2a2a3a'), 52, { weight: 700 });
      for (let i = 0; i < 7; i++) {
        const y = 5.48 - i * 0.18;
        s += K.poly(c.fx(XR, BZ1 - 2.92, BZ1 - 3.43, y, y + 0.012), night ? '#2a2a26' : L('#9bb0c6'));
        if (i < 5) s += ptext(3.13 + (i % 2) * 0.03, y + 0.03, ['K. Doyle', 'M. Ruiz', 'Pete S.', 'B. Tardif', 'T.O.'][i], 10, ink('#2b3a7a'), 30 + (i % 3) * 4, { font: F_HAND });
      }
      s += paper(1.25, 1.62, 5.35, 5.9, night ? '#2e3436' : L('#bcd3d6'));
      [[0.2, 5.68], [1.0, 5.7], [0.6, 4.68], [1.48, 4.68], [1.7, 5.08], [2.2, 5.08], [3.18, 5.9], [2.5, 6.18], [1.44, 5.85]].forEach(([uu, y], i) => { s += pin(uu, y, night ? '#2a2a2e' : [L('#c8463a'), L('#2e6b8b'), L('#d9a441'), L('#2f7a4a')][i % 4]); });

      /* mop bucket left by the far door */
      s += c.box(5.7, 6.7, 0, 1.25, 29.2, 30.2, { front: L('#d9b23a'), left: M('#d9b23a', 0.85), top: S('#6a5a3a') });
      s += c.line([6.2, 1.2, 29.7], [6.5, 4.6, 30.1], night ? '#1a1612' : S('#8a6a44'), 2);

      /* wall clock (double-faced, projecting from the left wall) */
      const [kx, ky] = c.p(XL + 0.8, 8.75, 12.6), kr = c.s(12.6) * 0.55;
      s += K.poly([c.p(XL, 8.6, 12.5), c.p(XL + 0.4, 8.6, 12.5), c.p(XL + 0.4, 8.9, 12.5), c.p(XL, 8.9, 12.5)], S('#3a3530'));
      s += clockFace(kx, ky, kr, night ? 11 : 10, night ? 40 : 12, { rim: night ? '#0b0d12' : S('#3a3530'), face: night ? '#2e3138' : L('#f1ece0'), hand: night ? '#08090d' : '#1d1a18' });

      /* ceiling lights: two rows of 2x4 troffers */
      const fixtures = [];
      for (const z of [5, 12, 19, 26, 33]) for (const X of [-3.6, 4.0]) fixtures.push([X, z]);
      fixtures.forEach(([X, z]) => {
        s += K.poly(c.fy(YC, X - 1.1, X + 1.1, z - 0.1, z + 4.1), S('#b8b6aa'));
        const on = !night || (X > 0 && z === 19);
        const lens = c.fy(YC - 0.01, X - 0.95, X + 0.95, z, z + 4);
        if (!on) { s += K.poly(lens, night ? '#262b35' : '#2b2f36'); return; }
        let l = K.poly(lens, night ? '#b4c8b8' : '#f7f9f0');
        if (!night) for (let k = 1; k < 4; k++) l += c.line([X - 0.95, YC - 0.01, z + k], [X + 0.95, YC - 0.01, z + k], '#dfe5da', 1);
        lite += l;
      });

      /* EXIT sign hanging near the end */
      const ex = c.fz(31, -0.2, 1.7, 9.0, 9.75);
      s += c.line([0.75, YC, 31], [0.75, 9.75, 31], S('#3a3a3a'), 1.4);
      {
        const [ex0, ey0] = ex[0], [ex1, ey1] = ex[2];
        lite += K.poly(ex, night ? '#2a0d0d' : L('#ece7dc'));
        lite += T((ex0 + ex1) / 2, ey1 - (ey1 - ey0) * 0.2, 'EXIT', { size: (ey1 - ey0) * 0.8, anchor: 'middle', fill: night ? '#ff6a58' : '#c8302a', weight: 700, len: (ex1 - ex0) * 0.78 });
        lite += K.glow(o, (ex0 + ex1) / 2, (ey0 + ey1) / 2, night ? 150 : 50, '#ff4a3a', night ? 0.42 : 0.18, u('exit'));
      }

      if (!night) {
        fixtures.forEach(([X, z]) => {
          const [gx, gy] = c.p(X, YC, z + 2);
          lite += K.glow(o, gx, gy, c.s(z + 2) * 3.0, '#f3f8ee', 0.3, u('fx'));
          const [px, py] = c.p(X * 0.6, 0, z + 2);
          s += K.pool(o, px, py, c.s(z + 2) * 3.2, c.s(z + 2) * 0.9, '#fbfdf6', 0.22, u('fxp'));
        });
        const [vx, vy] = c.p(0.9, 6, ZB);
        lite += K.glow(o, vx, vy, 360, '#fff6e2', 0.42, u('endglow'));
        const rw = c.fz(ZB, WX0, WX1, -WY1, -WY0);
        s += K.shaft(o, rw, '#fffaf0', 0.45, u('wref'));
        s += K.shaft(o, [c.p(WX0 + 1, 0, ZB), c.p(WX1 - 1, 0, ZB), c.p(WX1 + 1, 0, 9), c.p(WX0 - 0.5, 0, 9)], '#fffaf0', 0.22, u('wstreak'));
        s += K.poly(c.fx(XL, ZN, ZB, -2.2, 0), lockFaceL, { opacity: 0.18 }) + K.poly(c.fx(XR, ZN, ZB, -2.2, 0), lockFaceR, { opacity: 0.16 });
        s += K.band(o, 0, 200, '#3a3a34', 0.22, 0, u('ceil'));
        s += K.band(o, 640, 260, '#2a2a26', 0, 0.18, u('floor'));
        return s + lite;
      }

      /* ---- empty night: darkness, then the three lights ---- */
      {
        const vg = o.id(u('nv'));
        s += K.defs(K.radial(vg, [[0, '#03040a', 0], [0.2, '#03040a', 0.18], [0.5, '#03040a', 0.62], [0.85, '#03040a', 0.86], [1, '#03040a', 0.92]], 860, 400, 1000)) + K.rect(0, 0, 1600, 900, `url(#${vg})`);
        s += K.band(o, 0, 260, '#03040a', 0.6, 0, u('ceil'));
      }
      // moonlight: window glow, a pale shaft down the floor with mullion shadows
      const [mx, my] = c.p(0.9, 6, ZB);
      lite += K.glow(o, mx, my, 200, '#8fa8d8', 0.32, u('moon'));
      lite += K.shaft(o, [c.p(WX0, 0, ZB), c.p(WX1, 0, ZB), c.p(WX1 + 2.2, 0, 17), c.p(WX0 + 0.6, 0, 17)], '#a9bde6', 0.34, u('mfloor'));
      for (let i = 1; i < 4; i++) { const X0 = WX0 + ((WX1 - WX0) * i) / 4; lite += K.poly([c.p(X0 - 0.08, 0, ZB), c.p(X0 + 0.08, 0, ZB), c.p(X0 + 0.55 + i * 0.12, 0, 17), c.p(X0 + 0.25 + i * 0.12, 0, 17)], '#05070c', { opacity: 0.4 }); }
      lite += K.shaft(o, c.fz(ZB, WX0, WX1, -WY1, -WY0), '#a9bde6', 0.25, u('mref'));
      // the one tube left on
      const [gx, gy] = c.p(4.0, YC, 21);
      lite += K.glow(o, gx, gy, 190, '#b8d0c0', 0.38, u('tube'));
      lite += K.pool(o, ...c.p(3.2, 0, 21), 210, 36, '#a9c4b4', 0.3, u('tubep'));
      lite += K.pool(o, ...c.p(XR, 4.2, 21), 46, 130, '#a9c4b4', 0.16, u('tubew'));
      lite += K.pool(o, ...c.p(XL, 4.2, 21), 30, 110, '#a9c4b4', 0.1, u('tubew2'));
      // EXIT glow on the ceiling and floor
      lite += K.pool(o, ...c.p(0.7, YC, 31), 90, 22, '#ff4a3a', 0.25, u('exitc'));
      lite += K.pool(o, ...c.p(0.7, 0, 31), 110, 12, '#ff4a3a', 0.22, u('exitp'));
      // the near lockers just catch the moon on their plates' edges
      return s + lite;
    }
  });
  /* ------------------------------------------------------------------ */
  /* Derry High School, front elevation: 1923 brick, limestone trim. */
  const brickPattern = (o, rng, base, mortar, { bw = 18, bh = 6, vary = 0.07 } = {}) => {
    const id = o.id(u('brk')), W = bw * 4, H = bh * 6;
    let tile = `<rect width="${W}" height="${H}" fill="${base}"/>`;
    for (let r = 0; r < 6; r++) {
      tile += `<rect y="${r * bh + bh - 1}" width="${W}" height="1" fill="${mortar}"/>`;
      for (let k = 0; k < 5; k++) {
        const x = k * bw + (r % 2 ? bw / 2 : 0);
        tile += `<rect x="${x - 1}" y="${r * bh}" width="1" height="${bh - 1}" fill="${mortar}"/>`;
        if (rng() < 0.35) tile += `<rect x="${x}" y="${r * bh}" width="${bw - 1}" height="${bh - 1}" fill="${K.adj(base, (rng() - 0.5) * vary * 2)}"/>`;
      }
    }
    return { defs: `<defs><pattern id="${id}" width="${W}" height="${H}" patternUnits="userSpaceOnUse">${tile}</pattern></defs>`, fill: `url(#${id})` };
  };
  /* a small dark figure, no face: h = height in px at its depth */
  const kid = (x, base, h, col, { pack = null, dir = 1, sit = false, skirt = false } = {}) => {
    const k = h / 100;
    let r = '';
    if (sit) {
      r += K.rect(dir > 0 ? x - 9 * k : x - 17 * k, base - 22 * k, 26 * k, 9 * k, col); // thighs
      r += K.rect(x + (dir > 0 ? 13 : -19) * k, base - 22 * k, 6 * k, 22 * k, col); // shins
      r += K.path(`M${n(x - 11 * k)},${n(base - 18 * k)} L${n(x - 9 * k)},${n(base - 52 * k)} Q${n(x)},${n(base - 58 * k)} ${n(x + 9 * k)},${n(base - 52 * k)} L${n(x + 10 * k)},${n(base - 18 * k)} Z`, col);
      r += K.circle(x + 1 * k * dir, base - 64 * k, 7.5 * k, col);
    } else {
      r += K.rect(x - 7 * k, base - 46 * k, 6 * k, 46 * k, col) + K.rect(x + 1 * k, base - 46 * k, 6 * k, 46 * k, col);
      if (skirt) r += K.path(`M${n(x - 11 * k)},${n(base - 34 * k)} L${n(x - 9 * k)},${n(base - 52 * k)} L${n(x + 9 * k)},${n(base - 52 * k)} L${n(x + 11 * k)},${n(base - 34 * k)} Z`, col);
      r += K.path(`M${n(x - 12 * k)},${n(base - 42 * k)} L${n(x - 10 * k)},${n(base - 78 * k)} Q${n(x)},${n(base - 84 * k)} ${n(x + 10 * k)},${n(base - 78 * k)} L${n(x + 12 * k)},${n(base - 42 * k)} Z`, col);
      r += K.circle(x, base - 90 * k, 8 * k, col);
    }
    if (pack) r += K.rect(dir > 0 ? x - 19 * k : x + 10 * k, base - (sit ? 50 : 78) * k, 9 * k, 24 * k, pack, { rx: 2 * k });
    return r;
  };

  ART.bg('school_ext', {
    times: ['morning', 'afternoon'],
    draw(o) {
      const t = o.time, rng = o.rng, am = t === 'morning';
      const L = (c) => K.tone(c, t), S = (c) => K.shade(c, t), TD = K.TOD[t];
      const M = (c, k) => K.mix(S(c), L(c), k);
      const stone = '#d6cbb2', brick = P.brick;
      let s = K.sky(o, t);

      /* sky: low sun upper-left, autumn cloud banks */
      s += K.glow(o, 120, 40, 560, am ? '#fff6e0' : '#ffe0a0', am ? 0.55 : 0.6, u('sun'));
      s += am ? K.clouds(rng, { count: 6, y0: 40, y1: 250, color: '#f6f2ea', shadow: '#b9c7d3', opacity: 0.72, w: 540 })
        : K.clouds(rng, { count: 6, y0: 50, y1: 270, color: '#fbe0b0', shadow: '#c08a6a', opacity: 0.62, w: 580 });

      /* far hills and pines (peek out past the building ends) */
      s += K.path(K.ridge(rng, { y: 470, amp: 28, steps: 18, jag: 0.25 }), K.mix(L(P.slate), TD.haze, 0.62));
      s += K.pines(rng, { base: 540, hMin: 30, hMax: 74, gap: 18, fill: K.mix(L(P.pine), TD.haze, 0.45), shade: K.mix(S(P.pine), TD.haze, 0.45), jitterY: 16 });
      // hazy maples behind
      for (const [x, y, rx, ry] of [[60, 470, 130, 110], [250, 500, 120, 80], [1380, 495, 120, 90], [1560, 470, 140, 120]]) s += K.path(K.blob(rng, x, y, rx, ry, { lobes: 7, jag: 0.22 }), K.mix(L(P.rust), TD.haze, 0.5));

      /* the boiler stack behind the right wing */
      s += K.rect(1192, 20, 46, 120, L('#7a3a2e')) + K.rect(1222, 20, 16, 120, S('#7a3a2e')) + K.rect(1186, 20, 58, 10, L(stone)) + K.rect(1188, 52, 54, 6, L(stone));

      /* ---------------- the building ---------------- */
      const GX0 = 150, GX1 = 1450, PX0 = 650, PX1 = 950, BASE = 600;
      const F1 = 560, F2 = 430, CORN = 180, PAR = 132;
      const bp = brickPattern(o, rng, L(brick), K.mix(L(brick), L(stone), 0.35));
      const bpS = brickPattern(o, rng, S(brick), K.mix(S(brick), S(stone), 0.3));
      s += bp.defs + bpS.defs;
      // wings
      s += K.rect(GX0, PAR, GX1 - GX0, BASE - PAR, bp.fill);
      // parapet coping, cornice and its shadow
      s += K.rect(GX0 - 6, PAR - 7, GX1 - GX0 + 12, 8, L(stone));
      s += K.rect(GX0 - 10, CORN - 14, GX1 - GX0 + 20, 14, L(stone)) + K.rect(GX0 - 10, CORN - 4, GX1 - GX0 + 20, 4, M(stone, 0.4));
      s += K.rect(GX0, CORN, GX1 - GX0, 9, S(brick), { opacity: 0.85 });
      // belt courses + water table + foundation
      s += K.rect(GX0, F2 - 8, GX1 - GX0, 8, L(stone)) + K.rect(GX0, F2, GX1 - GX0, 3, S(brick), { opacity: 0.7 });
      s += K.rect(GX0, 291, GX1 - GX0, 6, L(stone));
      s += K.rect(GX0, F1, GX1 - GX0, BASE - F1, L(stone)) + K.rect(GX0 - 4, F1 - 6, GX1 - GX0 + 8, 8, L(stone)) + K.rect(GX0 - 4, F1 + 2, GX1 - GX0 + 8, 3, M(stone, 0.4));
      // quoins at the building corners
      for (let y = PAR; y < F1 - 10; y += 26) { s += K.rect(GX0, y, (y / 26) % 2 < 1 ? 26 : 16, 13, L(stone)) + K.rect(GX1 - ((y / 26) % 2 < 1 ? 26 : 16), y, (y / 26) % 2 < 1 ? 26 : 16, 13, L(stone)); }

      /* windows: shared bbox gradients for glass (sky reflected above, room below) */
      const gG = o.id(u('glass')), gGl = o.id(u('glare')), gIn = o.id(u('inside'));
      s += K.defs(K.linear(gG, am ? [[0, '#cbd8e1'], [0.45, '#90a3b4'], [1, '#56636f']] : [[0, '#ebcfa6'], [0.45, '#9d8a7e'], [1, '#5a4a46']], 0, 0, 0.3, 1),
        K.linear(gGl, am ? [[0, '#f4f2ea'], [1, '#c9d4dc']] : [[0, '#fff0c8'], [1, '#f2b866']], 0, 0, 0.4, 1),
        K.linear(gIn, am ? [[0, '#e9ecdf'], [0.3, '#c2c8bc'], [1, '#6e7470']] : [[0, '#f2e6c8'], [0.3, '#cdbf9e'], [1, '#76665a']], 0, 0, 0, 1));
      const frame = K.mix(L('#e6dfcd'), L(brick), 0.12), reveal = S(brick), blind = L('#ddd5c2');
      const facadeWin = (x, y, w, h, glare = false) => {
        let r = K.rect(x, y, w, h, frame);
        r += K.rect(x + 3, y + 3, w - 6, h - 6, `url(#${glare ? gGl : rng() < 0.2 ? gIn : gG})`);
        const bl = rng() < 0.55 ? (0.15 + rng() * 0.45) * h : 0;
        if (bl) r += K.rect(x + 3, y + 3, w - 6, bl, blind, { opacity: 0.92 }) + K.rect(x + 3, y + 3 + bl - 2, w - 6, 2, S('#b9b09a'));
        r += K.rect(x + 2, y + h / 2 - 2, w - 4, 4, frame);
        r += K.rect(x + w / 2 - 1, y + 3, 2, h - 6, frame, { opacity: 0.9 });
        r += K.rect(x + 3, y + h * 0.25 - 1, w - 6, 1.6, frame, { opacity: 0.8 }) + K.rect(x + 3, y + h * 0.75 - 1, w - 6, 1.6, frame, { opacity: 0.8 });
        r += K.rect(x, y, w, 5, reveal, { opacity: 0.55 }) + K.rect(x, y, 4, h, reveal, { opacity: 0.45 });
        return r;
      };
      const bayWins = (bx, y, h, glareIdx = -1) => {
        let r = K.rect(bx - 4, y - 12, 148, 10, L(stone)) + K.rect(bx - 6, y + h, 152, 7, L(stone)) + K.rect(bx - 6, y + h + 7, 152, 3, S(brick), { opacity: 0.6 });
        for (let i = 0; i < 3; i++) r += facadeWin(bx + 5 + i * 45, y, 40, h, i === glareIdx);
        return r;
      };
      const bays = [170, 330, 490, 970, 1130, 1290];
      bays.forEach((bx, i) => {
        s += bayWins(bx, 450, 94, !am && i === 4 ? 1 : -1);
        s += bayWins(bx, 322, 92, !am && (i === 3 || i === 5) ? (i === 3 ? 2 : 0) : -1);
        s += bayWins(bx, 200, 82, !am && i === 4 ? 0 : -1);
        // basement windows in the foundation
        for (let k = 0; k < 3; k++) s += K.rect(bx + 12 + k * 45, F1 + 12, 26, 18, S('#3d4552')) + K.rect(bx + 12 + k * 45, F1 + 12, 26, 3, S(stone));
      });

      /* central pavilion: projects a little, casts a shadow on the right wing */
      s += K.poly([[PX1, CORN + 2], [PX1 + 34, CORN + 18], [PX1 + 34, BASE], [PX1, BASE]], bpS.fill, { opacity: 0.85 });
      s += K.rect(PX0, 92, PX1 - PX0, BASE - 92, bp.fill);
      s += K.path(`M${PX0 - 8},${PAR - 8} L${PX0 - 8},110 L740,110 L760,84 L840,84 L860,110 L${PX1 + 8},110 L${PX1 + 8},${PAR - 8} Z`, L(brick));
      s += K.path(`M${PX0 - 10},112 L${PX0 - 10},104 L736,104 L756,78 L844,78 L864,104 L${PX1 + 10},104 L${PX1 + 10},112 L866,112 L846,86 L754,86 L734,112 Z`, L(stone));
      s += K.rect(PX0 - 10, CORN - 16, PX1 - PX0 + 20, 16, L(stone)) + K.rect(PX0 - 10, CORN - 4, PX1 - PX0 + 20, 4, M(stone, 0.4)) + K.rect(PX0, CORN, PX1 - PX0, 9, S(brick), { opacity: 0.85 });
      // date stone
      s += K.rect(768, 112, 64, 30, L(stone)) + K.rect(768, 112, 64, 3, M(stone, 0.45)) + K.rect(772, 116, 56, 22, M(stone, 0.85));
      s += T(800, 134, '1923', { size: 17, anchor: 'middle', fill: S('#8a7e66'), weight: 700, len: 42, font: F_SIGN });
      // finials
      for (const fx of [PX0 - 2, PX1 + 2]) s += K.rect(fx - 9, 84, 18, 28, L(stone)) + K.rect(fx + 2, 84, 7, 28, M(stone, 0.5)) + K.poly([[fx - 11, 86], [fx, 72], [fx + 11, 86]], L(stone));
      // quoins
      for (let y = 112; y < F1 - 6; y += 26) { const w = Math.round((y - 112) / 26) % 2 ? 16 : 26; s += K.rect(PX0, y, w, 13, L(stone)) + K.rect(PX1 - w, y, w, 13, L(stone)); }
      // two-story window group with spandrel panels
      s += K.rect(694, 190, 212, 10, L(stone));
      for (let i = 0; i < 3; i++) {
        const x = 704 + i * 66;
        s += facadeWin(x, 202, 60, 70, !am && i === 2) + facadeWin(x, 286, 60, 50, false);
        s += K.rect(x - 2, 272, 64, 14, L(stone)) + K.rect(x + 6, 275, 48, 8, M(stone, 0.75));
      }
      s += K.rect(692, 336, 216, 8, L(stone));
      // carved name frieze
      s += K.rect(686, 350, 228, 30, L(stone)) + K.rect(686, 380, 228, 4, M(stone, 0.4));
      s += T(801, 373, 'DERRY HIGH SCHOOL', { size: 21, anchor: 'middle', fill: '#fff8ea', opacity: 0.35, weight: 700, len: 196, ls: 2 });
      s += T(800, 372, 'DERRY HIGH SCHOOL', { size: 21, anchor: 'middle', fill: S('#8a7e66'), weight: 700, len: 196, ls: 2 });
      // the arch: voussoirs, keystone, fanlight, doors
      const AX = 800, AY = 474, AR = 64, AR2 = 88;
      s += K.path(`M${AX - AR2},${F1} L${AX - AR2},${AY} A${AR2},${AR2} 0 0 1 ${AX + AR2},${AY} L${AX + AR2},${F1} Z`, L(stone));
      for (let i = 1; i < 9; i++) { const a = Math.PI * (i / 9); s += K.line(AX - Math.cos(a) * AR, AY - Math.sin(a) * AR, AX - Math.cos(a) * AR2, AY - Math.sin(a) * AR2, M(stone, 0.5), 1.6); }
      s += K.poly([[AX - 11, AY - AR2 - 6], [AX + 11, AY - AR2 - 6], [AX + 8, AY - AR + 2], [AX - 8, AY - AR + 2]], L('#e2d8c0'));
      s += K.path(`M${AX - AR},${F1} L${AX - AR},${AY} A${AR},${AR} 0 0 1 ${AX + AR},${AY} L${AX + AR},${F1} Z`, S('#4a4038'));
      const fan = o.id(u('fan'));
      s += K.defs(K.linear(fan, am ? [[0, '#c9d6de'], [1, '#56616e']] : [[0, '#f0d2a0'], [1, '#5a4a44']]));
      s += K.path(`M${AX - AR + 6},${AY} A${AR - 6},${AR - 6} 0 0 1 ${AX + AR - 6},${AY} Z`, `url(#${fan})`);
      for (let i = 1; i < 6; i++) { const a = Math.PI * (i / 6); s += K.line(AX, AY, AX - Math.cos(a) * (AR - 6), AY - Math.sin(a) * (AR - 6), L('#ece6d6'), 2); }
      s += K.rect(AX - AR + 4, AY - 2, AR * 2 - 8, 6, L('#ece6d6'));
      const dc = '#3b5446';
      for (const dx of [AX - AR + 8, AX + 2]) {
        s += K.rect(dx, AY + 6, AR - 10, F1 - AY - 6, L(dc)) + K.rect(dx + AR - 18, AY + 6, 8, F1 - AY - 6, S(dc));
        s += K.rect(dx + 7, AY + 14, AR - 26, 40, `url(#${gG})`) + K.rect(dx + 7, AY + 62, AR - 26, 14, S(dc));
      }
      s += K.rect(AX - 1, AY + 6, 2, F1 - AY - 6, S('#2a2a2a'));
      s += K.rect(AX - AR, AY + 4, AR * 2, 10, P.ink, { opacity: 0.22 });
      // entrance lanterns on brackets
      for (const lx of [AX - AR2 - 22, AX + AR2 + 22]) {
        s += K.rect(lx - 2, 470, 4, 26, S('#2a2622')) + K.rect(lx - 9, 474, 18, 24, am ? L('#e8e0c8') : L('#f4dca0')) + K.poly([[lx - 12, 474], [lx, 464], [lx + 12, 474]], S('#2a2622')) + K.rect(lx - 9, 498, 18, 4, S('#2a2622'));
      }
      // the banner over the doors
      s += K.path(`M690,438 Q800,452 910,438 L910,470 Q800,484 690,470 Z`, L('#6f2432'));
      s += K.path(`M690,438 Q800,452 910,438 L910,442 Q800,456 690,442 Z`, S('#6f2432'));
      s += K.path('M690,436 L682,428 M910,436 L918,428', 'none', { stroke: S('#2a2622'), strokeWidth: 1.5 });
      s += `<path id="${o.id('banpath')}" d="M702,465 Q800,479 898,465" fill="none"/>`;
      s += `<text font-family="${K.esc(F_SIGN)}" font-size="18" font-weight="700" fill="${L('#e8bf55')}" letter-spacing="1"><textPath href="#${o.id('banpath')}" startOffset="50%" text-anchor="middle" textLength="186" lengthAdjust="spacingAndGlyphs">WELCOME BACK TIGERS</textPath></text>`;

      /* steps, cheek walls, lamp posts */
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const y = F1 + i * 10, half = 112 + i * 7;
        s += K.rect(AX - half, y, half * 2, 10, i % 2 ? M(stone, 0.72) : M(stone, 0.85));
        s += K.rect(AX - half, y, half * 2, 2.5, L('#efe6d0'));
      }
      for (const sgn of [-1, 1]) {
        const x0 = AX + sgn * 112, x1 = AX + sgn * 175;
        s += K.poly([[x0, F1 - 18], [x0 + sgn * 26, F1 - 18], [x1 + sgn * 6, F1 + 62], [x1 + sgn * 6, F1 + 82], [x1 - sgn * 22, F1 + 82], [x0, F1 + 10]], sgn < 0 ? L(stone) : M(stone, 0.7));
      }
      for (const lx of [AX - 196, AX + 196]) {
        s += K.rect(lx - 3, 560, 6, 82, S('#2a2622')) + K.rect(lx - 6, 636, 12, 8, S('#2a2622')) + K.circle(lx, 552, 11, am ? L('#ece6d6') : L('#f6e2b0')) + K.rect(lx - 5, 561, 10, 4, S('#2a2622'));
      }

      /* foundation yews */
      for (const [x0, x1] of [[GX0, 600], [1000, GX1]]) for (let x = x0 + 14; x < x1 - 10; x += 34 + rng() * 14) {
        const r0 = 18 + rng() * 8;
        s += K.path(K.blob(rng, x, 596, r0 * 1.2, r0, { lobes: 6, jag: 0.2 }), S(P.pine)) + K.path(K.blob(rng, x - 5, 590, r0 * 0.8, r0 * 0.6, { lobes: 5, jag: 0.2 }), L('#3f5a44'));
      }

      /* ground: lawn, walk, drive, sidewalk, street */
      s += K.rect(-10, BASE, 1620, 44, L(P.moss));
      s += K.poly([[AX - 175, F1 + 82], [AX + 175, F1 + 82], [AX + 190, 644], [AX - 190, 644]], M(stone, 0.8));
      s += K.rect(-10, 644, 1620, 58, L('#55565c'));
      s += K.rect(-10, 644, 1620, 4, L('#a7a397'));
      s += K.rect(-10, 700, 1620, 18, L('#b4afa3')) + K.g({ opacity: 0.35 }, Array.from({ length: 17 }, (_, i) => K.rect(i * 100 - 10, 700, 2, 18, S('#b4afa3'))).join(''));
      s += K.rect(-10, 718, 1620, 8, L('#98948a')) + K.rect(-10, 726, 1620, 190, L('#4a4c53'));
      s += K.rect(-10, 800, 1620, 4, L('#c9b25a'), { opacity: 0.5 });
      // morning mist / afternoon warmth over the lawn
      s += K.band(o, 470, 180, TD.haze, 0, am ? 0.28 : 0.2, u('haze'));

      /* chain-link fence along the ball field (left) */
      const fc = L('#8e9298');
      s += K.rect(-10, 570, 280, 3, fc) + K.g({ opacity: 0.45 }, Array.from({ length: 22 }, (_, i) => K.line(i * 13 - 10, 573, i * 13 + 3, 640, fc, 1) + K.line(i * 13 + 3, 573, i * 13 - 10, 640, fc, 1)).join(''));
      for (let x = -4; x <= 270; x += 68) s += K.rect(x, 564, 4, 78, fc);

      /* long shadows (sun low, upper left) */
      const sh = S(P.moss);
      s += K.poly([[540, 628], [546, 628], [760, 642], [748, 644]], sh, { opacity: 0.55 });
      s += K.path('M60,640 C200,632 360,634 470,642 L420,644 L60,644 Z', sh, { opacity: 0.45 });
      s += K.path('M1400,632 C1460,628 1560,628 1620,632 L1620,644 L1400,644 Z', sh, { opacity: 0.4 });

      /* flagpole + flag */
      s += K.rect(541, 36, 5, 594, L('#c9c6bc')) + K.rect(544, 36, 2, 594, S('#c9c6bc')) + K.circle(543.5, 33, 5, L(P.mustard)) + K.rect(534, 622, 19, 8, S(stone));
      {
        const fx = 546, fy = 44, fw = 86, fh = 52, wave = (x) => Math.sin((x / fw) * Math.PI * 1.6 + 0.4) * 5 * (x / fw);
        const band = (y0, y1, x0, x1, col) => {
          let d = `M${n(fx + x0)},${n(fy + y0 + wave(x0))}`;
          for (let x = x0; x <= x1; x += 6) d += ` L${n(fx + x)},${n(fy + y0 + wave(x))}`;
          for (let x = x1; x >= x0; x -= 6) d += ` L${n(fx + x)},${n(fy + y1 + wave(x))}`;
          return K.path(d + ' Z', col);
        };
        const red = L('#a8443a'), white = L('#ece6d8'), blue = L('#2f3d5c');
        for (let i = 0; i < 13; i++) s += band((fh / 13) * i, (fh / 13) * (i + 1) + 0.3, 0, fw, i % 2 ? white : red);
        s += band(0, (fh / 13) * 7, 0, fw * 0.42, blue);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) s += K.circle(fx + 4 + k * 7 + (r % 2) * 3, fy + 4 + r * 6.4 + wave(4 + k * 7), 0.9, white, { opacity: 0.85 });
        s += K.g({ opacity: 0.16 }, band(0, fh, fw * 0.48, fw * 0.74, '#1a1a2a'));
      }

      /* bike rack + bikes */
      const rk = S('#5c6066');
      for (let i = 0; i < 6; i++) s += K.path(`M${330 + i * 18},636 v-22 a7,7 0 0 1 14,0 v22`, 'none', { stroke: rk, strokeWidth: 2.4 });
      s += K.rect(326, 634, 112, 3, rk);
      const bike = (x, y, col) => K.circle(x, y, 13, 'none', { stroke: S('#22252c'), strokeWidth: 2.6 }) + K.circle(x + 40, y, 13, 'none', { stroke: S('#22252c'), strokeWidth: 2.6 }) +
        K.path(`M${x},${y} L${x + 14},${y - 20} L${x + 32},${y - 20} L${x + 40},${y} M${x + 14},${y - 20} L${x + 22},${y} L${x + 32},${y - 20} M${x + 12},${y - 24} h8 M${x + 31},${y - 26} l4,-4 h6`, 'none', { stroke: col, strokeWidth: 2.4 });
      s += bike(338, 630, L('#2e6b8b')) + bike(392, 632, L('#b5532e'));

      /* students: small, dark, no faces */
      const kc = am ? ['#2b3140', '#3a2e34', '#28363a', '#33302e'] : ['#3a2a28', '#2e2630', '#2c3030', '#3a3026'];
      const col = (i) => S(kc[i % kc.length]);
      const people = [
        [762, F1, 50, 0, { pack: S('#5a2a2a') }], [836, F1 - 1, 52, 1, { skirt: true }],
        [692, F1 + 18, 48, 2, { sit: true, dir: 1 }], [906, F1 + 24, 48, 3, { sit: true, dir: -1, pack: S('#2e4a5a') }],
        [770, 610, 58, 1, { pack: S('#7a5a2a') }], [742, 636, 62, 3, {}],
        [590, 640, 62, 0, { skirt: true }], [612, 641, 64, 2, { pack: S('#2e3a5a'), dir: -1 }],
        [452, 640, 63, 3, {}],
        [1018, 690, 70, 2, { pack: S('#6a3030') }], [1066, 688, 68, 0, { skirt: true }]
      ];
      people.forEach(([x, b, h0, ci, op]) => {
        const h = h0 * 0.9;
        s += K.ellipse(x + h * 0.4, b, h * 0.42, h * 0.035, S(P.moss), { opacity: 0.5 });
        s += kid(x, b, h, col(ci), op);
      });

      /* trees: big maples at both ends */
      s += K.tree(rng, { x: 90, base: 652, h: 560, w: 420, colors: [L(P.ember), S(P.rust), L(P.mustard)], trunk: S('#3a2c26') });
      s += K.tree(rng, { x: 1520, base: 650, h: 600, w: 440, colors: [L(P.rust), S('#7e3a24'), L(P.ember)], trunk: S('#3a2c26') });

      /* the bus at the curb of the drive, driver's side toward us */
      {
        const G = 690, y0 = 566, yb = 674, bx0 = 1124, bx1 = 1640;
        const yel = K.desat(P.mustard, 0.28);
        const by = L(yel), byS = S(yel), byH = L(K.desat('#ecc878', 0.28)), blk = S('#22242a'), gl = S('#2b3446');
        s += K.ellipse(1330, G + 2, 340, 9, P.ink, { opacity: 0.28 });
        s += K.path(`M1038,${yb} L1038,646 Q1040,634 1058,632 L${bx0},626 L${bx0},${yb} Z`, by);
        s += K.path(`M1038,646 Q1040,634 1058,632 L${bx0},626 L${bx0},632 L1060,638 Q1046,640 1042,650 Z`, byH);
        s += K.rect(1028, 654, 16, 22, blk) + K.rect(1042, 643, 8, 10, L('#efe6c8')) + K.rect(1060, 650, 52, 3, byS);
        s += K.path(`M${bx0},${yb} L${bx0},${y0 + 18} Q${bx0 + 2},${y0} ${bx0 + 22},${y0} L${bx1},${y0} L${bx1},${yb} Z`, by);
        s += K.rect(bx0 + 14, y0, bx1 - bx0, 7, byH);
        s += K.poly([[bx0 + 1, y0 + 18], [bx0 + 9, y0 + 13], [bx0 + 9, 626], [bx0 + 1, 628]], gl);
        s += K.rect(bx0 + 16, y0 + 14, 42, 36, gl) + K.rect(bx0 + 37, y0 + 14, 2, 36, by) + K.rect(bx0 + 16, y0 + 14, 42, 6, L('#c9d4dc'), { opacity: 0.35 });
        for (let x = bx0 + 74; x < bx1; x += 48) {
          s += K.rect(x, y0 + 14, 40, 34, gl) + K.rect(x, y0 + 14, 40, 13, L('#c9d4dc'), { opacity: am ? 0.32 : 0.22 });
          s += K.rect(x, y0 + 29, 40, 2.5, byS) + K.rect(x - 4, y0 + 12, 4, 38, byS);
        }
        for (const yy of [619, 638, 657]) s += K.rect(bx0 + 2, yy, bx1 - bx0, 4, blk);
        s += T(bx0 + 82, 634, 'DERRY SCHOOL DEPARTMENT', { size: 12.5, fill: blk, weight: 700, len: 206 });
        s += T(bx0 + 312, 634, '14', { size: 12.5, fill: blk, weight: 700 });
        const ox = bx0 + 37, oy = 630, orr = 10;
        s += K.poly(Array.from({ length: 8 }, (_, k) => [ox + Math.cos(Math.PI / 8 + (k * Math.PI) / 4) * orr, oy + Math.sin(Math.PI / 8 + (k * Math.PI) / 4) * orr]), L('#b8342c'));
        s += K.rect(ox - 6, oy - 1, 12, 2, L('#efe6dc'), { opacity: 0.8 });
        s += K.rect(bx0 + 12, y0 + 2, 10, 5, L('#c8463a')) + K.rect(bx0 + 26, y0 + 2, 10, 5, L('#e0a040'));
        s += K.rect(bx0 - 8, y0 + 16, 3, 26, blk) + K.rect(bx0 - 16, y0 + 22, 10, 14, blk);
        s += K.rect(bx0, yb - 8, bx1 - bx0, 8, byS);
        for (const wx of [1094, 1462]) s += K.path(`M${wx - 30},${yb} a30,30 0 0 1 60,0 Z`, S('#2a2a2e')) + K.circle(wx, G - 20, 21, '#16171b') + K.circle(wx, G - 20, 9, L('#8f949a'));
      }

      /* long morning/afternoon shadows from the trees across the street */
      {
        const shc = am ? '#3c4a66' : '#5a3a3a';
        let sh = '';
        for (const [x, w] of [[-60, 260], [420, 180], [700, 320], [1180, 240]]) sh += K.path(`M${x},900 C${x + 40},800 ${x + 60},760 ${x + w * 0.4},${700 + rng() * 8} C${x + w * 0.7},${690 + rng() * 8} ${x + w},${700} ${x + w + 140},900 Z`, shc);
        s += K.g({ opacity: am ? 0.32 : 0.26 }, sh);
      }

      /* a few leaves let go, and the ones already down */
      s += K.leaves(rng, { count: 9, x0: 160, x1: 420, y0: 380, y1: 600, colors: [L(P.ember), L(P.rust), L(P.mustard)], size: 5 });
      s += K.leaves(rng, { count: 8, x0: 1300, x1: 1500, y0: 420, y1: 640, colors: [L(P.ember), L(P.rust)], size: 5 });
      s += K.leaves(rng, { count: 60, y0: 604, y1: 642, colors: [L(P.rust), L(P.ember), L(P.mustard), S(P.rust)], size: 5 });
      s += K.leaves(rng, { count: 40, y0: 700, y1: 726, colors: [L(P.ember), S(P.rust), L(P.mustard)], size: 6 });
      s += K.leaves(rng, { count: 34, y0: 726, y1: 900, colors: [S(P.rust), S(P.ember), S(P.mustard)], size: 8, opacity: 0.85 });

      /* atmosphere */
      if (am) s += K.band(o, 0, 900, '#dfe8f0', 0.06, 0.0, u('cool'));
      else s += K.band(o, 200, 700, '#f0b060', 0, 0.12, u('gold')) + K.glow(o, 120, 40, 900, '#ffcf80', 0.18, u('sun2'));
      return s;
    }
  });
  /* ------------------------------------------------------------------ */
  /* Ms. Whitcomb's English room, 2nd floor, windows on the left.
   * variant 'board_blank': the board erased, only the date left. */
  const hull = (pts) => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };

  ART.bg('classroom', {
    times: ['day'],
    light: { day: 'day' },
    draw(o) {
      const rng = o.rng, blank = o.variant === 'board_blank';
      const L = (c) => K.tone(c, 'day'), S = (c) => K.shade(c, 'day'), M = (c, k) => K.mix(S(c), L(c), k);
      const c = Cam(760, 830, 330, 5.2);
      const XL = -10, XR = 12.5, YC = 11, ZB = 21, ZN = 2.5;
      const wall = '#e3d6b3', oak = '#8a5a34', flo = '#c49a64', ceil = '#e8e1ce';
      const sun = '#fff0c8';
      const wins = [[9.4, 12.6], [14.0, 17.4]], WY0 = 3.0, WY1 = 9.6, BL = 6.3; // blinds down to BL
      const dir = [1, -0.85, -0.3]; // sunlight direction (right, down, toward camera)
      const toFloor = (Y, Z, h = 0) => { const t = (Y - h) / -dir[1]; return [XL + dir[0] * t, h, Z + dir[2] * t]; };
      let s = '';

      /* shell */
      s += K.poly(c.fy(YC, XL, XR, ZN, ZB), S(ceil));
      s += K.poly(c.fx(XL, ZN, ZB, 0, YC), M(wall, 0.25));
      s += K.poly(c.fx(XR, ZN, ZB, 0, YC), M(wall, 0.7));
      s += K.poly(c.fz(ZB, XL, XR, 0, YC), L(wall));
      const floorPoly = c.fy(0, XL, XR, ZN, ZB);
      s += K.poly(floorPoly, L(flo));
      let fb = '';
      for (let X = XL + 0.45; X < XR; X += 0.45) fb += c.line([X, 0, ZN], [X, 0, ZB], S(flo), 1);
      for (let i = 0; i < 70; i++) { const X = XL + 0.45 * Math.floor(rng() * 50), Z = ZN + 1 + rng() * (ZB - ZN - 1); fb += c.line([X, 0, Z], [X + 0.45, 0, Z], S(flo), 1); }
      s += K.g({ opacity: 0.32 }, fb);
      // trim: baseboards, chair rail, picture rail
      for (const X of [XL, XR]) {
        const f = X < 0 ? 0.35 : 0.7;
        s += K.poly(c.fx(X, ZN, ZB, 0, 0.45), M(oak, f)) + K.poly(c.fx(X, ZN, ZB, 3.0, 3.18), M(oak, f)) + K.poly(c.fx(X, ZN, ZB, 8.9, 9.05), M(oak, f));
      }
      s += K.poly(c.fz(ZB, XL, XR, 0, 0.45), L(oak)) + K.poly(c.fz(ZB, XL, XR, 8.9, 9.05), L(oak));

      /* left wall: two tall windows, blinds half raised, radiators */
      wins.forEach(([z0, z1], wi) => {
        s += K.poly(c.fx(XL, z0 - 0.35, z1 + 0.35, WY0 - 0.4, WY1 + 0.35), M(oak, 0.4));
        const glass = c.fx(XL, z0, z1, WY0, WY1);
        const [gx0, gy0] = c.p(XL, WY1, z0), [gx1, gy1] = c.p(XL, WY0, z1);
        const gid = o.id(u('out'));
        let out = K.defs(K.linear(gid, [[0, '#cfe0ea'], [0.6, '#eef0e4'], [1, '#f6e6c4']])) + K.poly(glass, `url(#${gid})`);
        const top = Math.min(gy0, c.p(XL, WY1, z1)[1]), bot = Math.max(gy1, c.p(XL, WY0, z0)[1]);
        for (let k = 0; k < 4; k++) out += K.path(K.blob(rng, gx0 + (gx1 - gx0) * (0.15 + k * 0.28), top + (bot - top) * (0.5 + rng() * 0.25), (gx1 - gx0) * 0.35, (bot - top) * 0.22, { lobes: 6, jag: 0.3 }), [L(P.ember), L(P.rust), L(P.mustard), L('#c86a3a')][(k + wi) % 4], { opacity: 0.92 });
        out += K.path(K.blob(rng, gx0 + (gx1 - gx0) * 0.5, bot, (gx1 - gx0) * 0.7, (bot - top) * 0.18, { lobes: 7, jag: 0.25 }), L('#a8542e'));
        s += clipTo(o, glass, out);
        // sash frame + muntins on the open lower half
        s += K.poly(c.fx(XL, z0, z1, (WY0 + BL) / 2 - 0.08, (WY0 + BL) / 2 + 0.08), M('#ece6d4', 0.5));
        s += K.poly(c.fx(XL, (z0 + z1) / 2 - 0.06, (z0 + z1) / 2 + 0.06, WY0, BL), M('#ece6d4', 0.5));
        // venetian blind: slats across the top half, bottom rail, cords
        s += K.poly(c.fx(XL, z0, z1, BL, WY1), L('#f2ecdc'), { opacity: 0.55 });
        for (let y = BL + 0.12; y < WY1 - 0.05; y += 0.22) s += K.poly(c.fx(XL, z0, z1, y, y + 0.1), M('#e8e0cc', 0.75));
        s += K.poly(c.fx(XL, z0 - 0.05, z1 + 0.05, BL - 0.08, BL + 0.04), M('#d8cfb8', 0.5));
        s += c.line([XL, BL, z1 - 0.4], [XL, 4.6, z1 - 0.4], S('#c9bfa8'), 1.2) + K.circle(...c.p(XL, 4.55, z1 - 0.4), 2.2, S('#c9bfa8'));
        s += K.poly(c.fx(XL, z0 - 0.45, z1 + 0.45, WY0 - 0.5, WY0 - 0.36), L('#e9e2d0'));
        // radiator under the sill
        s += c.box(XL, XL + 0.55, 0.4, 2.55, z0 + 0.2, z1 - 0.2, { right: M('#cfcbbf', 0.65), top: L('#ddd9cd'), front: L('#d9d5c9') });
        for (let z = z0 + 0.35; z < z1 - 0.3; z += 0.22) s += c.line([XL + 0.56, 0.5, z], [XL + 0.56, 2.45, z], S('#bfbab0'), 1.2);
      });
      // pencil sharpener by the board
      s += K.poly(c.fz(ZB, -7.0, -6.6, 4.2, 4.6), S('#9aa0a2'));

      /* front wall: posters, chalkboard, map case, flag, clock, door */
      // READ poster (left of the board)
      const pR = c.fz(ZB, -9.3, -6.9, 4.4, 7.6);
      s += K.poly(c.fz(ZB, -9.38, -6.82, 4.32, 7.68), S('#d8cfb8')) + K.poly(pR, L('#2e5a6e'));
      {
        const [x0, y0] = pR[0], [x1, y1] = pR[2], w = x1 - x0, h = y1 - y0;
        s += K.circle(x0 + w * 0.5, y0 + h * 0.36, w * 0.3, L('#e0b44a'));
        s += K.path(`M${n(x0 + w * 0.22)},${n(y0 + h * 0.52)} l${n(w * 0.28)},${n(h * 0.06)} l${n(w * 0.28)},${n(-h * 0.06)} v${n(h * 0.12)} l${n(-w * 0.28)},${n(h * 0.06)} l${n(-w * 0.28)},${n(-h * 0.06)} Z`, L('#f0e8d4'));
        s += K.line(x0 + w * 0.5, y0 + h * 0.58, x0 + w * 0.5, y0 + h * 0.76, S('#7a6a50'), 1);
        s += T(x0 + w / 2, y0 + h * 0.93, 'READ', { size: h * 0.17, anchor: 'middle', fill: L('#f0e8d4'), weight: 700, len: w * 0.78 });
      }
      // raven poster (right of the board)
      const pV = c.fz(ZB, 8.0, 10.5, 4.3, 7.7);
      s += K.poly(c.fz(ZB, 7.92, 10.58, 4.22, 7.78), S('#d8cfb8')) + K.poly(pV, L('#d9ccb0'));
      {
        const [x0, y0] = pV[0], [x1, y1] = pV[2], w = x1 - x0, h = y1 - y0;
        s += K.rect(x0 + w * 0.08, y0 + h * 0.06, w * 0.84, h * 0.66, L('#5b4a6b'));
        s += K.circle(x0 + w * 0.66, y0 + h * 0.24, w * 0.16, L('#e8e2d0'));
        const rx = x0 + w * 0.42, ry = y0 + h * 0.5, q = w / 100;
        s += K.path(`M${n(rx - 30 * q)},${n(ry + 18 * q)} C${n(rx - 20 * q)},${n(ry - 2 * q)} ${n(rx - 6 * q)},${n(ry - 14 * q)} ${n(rx + 6 * q)},${n(ry - 22 * q)} L${n(rx + 10 * q)},${n(ry - 32 * q)} L${n(rx + 20 * q)},${n(ry - 30 * q)} L${n(rx + 14 * q)},${n(ry - 22 * q)} C${n(rx + 20 * q)},${n(ry - 10 * q)} ${n(rx + 18 * q)},${n(ry + 6 * q)} ${n(rx + 4 * q)},${n(ry + 16 * q)} L${n(rx + 10 * q)},${n(ry + 28 * q)} L${n(rx - 4 * q)},${n(ry + 18 * q)} Z`, '#15131a');
        s += K.rect(x0 + w * 0.08, y0 + h * 0.68, w * 0.84, h * 0.04, '#15131a');
        s += T(x0 + w / 2, y0 + h * 0.87, 'NEVERMORE', { size: h * 0.1, anchor: 'middle', fill: L('#3a2e3e'), weight: 700, len: w * 0.74, font: F_SIGN });
        s += T(x0 + w / 2, y0 + h * 0.95, 'E. A. POE', { size: h * 0.055, anchor: 'middle', fill: L('#5a4e5e'), len: w * 0.3 });
      }
      // the chalkboard
      const BX0 = -5.8, BX1 = 7.0, BY0 = 3.0, BY1 = 7.3;
      s += K.poly(c.fz(ZB, BX0 - 0.25, BX1 + 0.25, BY0 - 0.2, BY1 + 0.25), L(oak));
      const board = c.fz(ZB, BX0, BX1, BY0, BY1);
      const bg = o.id(u('board'));
      s += K.defs(K.linear(bg, [[0, '#35503f'], [1, '#2b4234']], 0, 0, 1, 1)) + K.poly(board, `url(#${bg})`);
      const [bx0, by0] = board[0], [bx1, by1] = board[2], bw = bx1 - bx0, bh = by1 - by0;
      // old erasures: chalk-dust swipes (heavier on the blank board)
      let smudge = '';
      const sw = blank ? 26 : 12;
      for (let i = 0; i < sw; i++) {
        const x = bx0 + rng() * bw, y = by0 + 12 + rng() * (bh - 24), w = 60 + rng() * 140;
        smudge += K.path(`M${n(x - w / 2)},${n(y + 8)} q${n(w / 2)},${n(-26 - rng() * 20)} ${n(w)},0`, 'none', { stroke: '#dfe6dc', strokeWidth: n(10 + rng() * 16), opacity: n((blank ? 0.05 : 0.035) + rng() * 0.05), strokeLinecap: 'round' });
      }
      s += clipTo(o, board, smudge + (blank ? K.rect(bx0, by0, bw, bh, '#dfe6dc', { opacity: 0.06 }) : ''));
      const chalk = '#eeede4';
      if (blank) {
        s += T(bx1 - 16, by0 + 34, 'Wed., Sept. 4', { size: 24, anchor: 'end', fill: chalk, opacity: 0.88, font: F_HAND, len: 138 });
        s += T(bx0 + bw * 0.3, by0 + bh * 0.55, 'Th', { size: 26, fill: chalk, opacity: 0.08, font: F_HAND });
      } else {
        const tx = bx0 + bw / 2;
        s += T(tx + 0.8, by0 + bh * 0.33 + 0.6, 'The Lottery — Shirley Jackson (1948)', { size: 29, anchor: 'middle', fill: chalk, opacity: 0.25, font: F_HAND, len: bw * 0.86 });
        s += T(tx, by0 + bh * 0.33, 'The Lottery — Shirley Jackson (1948)', { size: 29, anchor: 'middle', fill: chalk, opacity: 0.9, font: F_HAND, len: bw * 0.86 });
        s += K.path(`M${n(tx - bw * 0.42)},${n(by0 + bh * 0.39)} q${n(bw * 0.2)},-3 ${n(bw * 0.42)},-1`, 'none', { stroke: chalk, strokeWidth: 2, opacity: 0.7, strokeLinecap: 'round' });
        s += T(tx - bw * 0.02, by0 + bh * 0.7, 'Why do they keep doing it?', { size: 30, anchor: 'middle', fill: chalk, opacity: 0.9, font: F_HAND, len: bw * 0.6 });
        s += T(bx1 - 14, by0 + bh * 0.93, 'p. 291', { size: 16, anchor: 'end', fill: chalk, opacity: 0.55, font: F_HAND, len: 40 });
      }
      // chalk tray, chalk, eraser
      s += K.poly(c.fz(ZB, BX0 - 0.1, BX1 + 0.1, BY0 - 0.3, BY0), M('#a9a9a2', 0.7));
      s += K.poly(c.fy(BY0 - 0.02, BX0 - 0.1, BX1 + 0.1, ZB - 0.35, ZB), L('#c9c9c2'));
      { const [ex, ey] = c.p(4.6, BY0, ZB - 0.15); s += K.rect(ex, ey - 8, 30, 8, L('#7a5a3a')) + K.rect(ex, ey - 3, 30, 3, S('#3a3a3e')); }
      for (const [xx, w] of [[-3.0, 6], [-2.7, 4], [1.2, 6]]) { const [cx2, cy2] = c.p(xx, BY0, ZB - 0.15); s += K.rect(cx2, cy2 - 3, w, 3, '#e8e6dc', { opacity: 0.85 }); }
      // map case above the board
      s += K.poly(c.fz(ZB, BX0 + 0.5, BX1 - 0.5, 7.75, 8.15), M('#9a8f78', 0.7)) + K.poly(c.fz(ZB, BX0 + 0.5, BX1 - 0.5, 7.75, 7.83), S('#6a6250'));
      { const [rx, ry] = c.p(0.6, 7.75, ZB); s += K.line(rx, ry, rx, ry + 10, S('#5a5244'), 1.2) + K.circle(rx, ry + 13, 3, 'none', { stroke: S('#5a5244'), strokeWidth: 1.2 }); }
      // flag on a staff angled out above the board's left end
      {
        const [fx, fy] = c.p(-4.6, 8.55, ZB);
        s += K.line(fx, fy, fx - 34, fy - 40, S('#6a5a3a'), 2.2) + K.circle(fx - 35, fy - 41, 2.6, L(P.mustard));
        const red = L('#a8443a'), white = L('#ece6d8');
        for (let i = 0; i < 9; i++) s += K.poly([[fx - 33 + i * 0.4, fy - 38 + i * 6.6], [fx - 4 + i * 0.3, fy - 4 + i * 6.6], [fx - 3 + i * 0.3, fy + 2.6 + i * 6.6], [fx - 32 + i * 0.4, fy - 31.4 + i * 6.6]], i % 2 ? white : red);
        s += K.poly([[fx - 33, fy - 38], [fx - 18, fy - 21], [fx - 17, fy + 2], [fx - 32, fy - 15]], L('#2f3d5c'));
      }
      // clock
      { const [kx, ky] = c.p(3.6, 9.55, ZB); s += clockFace(kx, ky, 21, 1, 18, { rim: S('#3a3530'), face: L('#f1ece0') }); }
      // door to the hall on the right wall, near the front
      s += K.poly(c.fx(XR, 16.2, 19.9, 0, 7.6), M(oak, 0.62)) + K.poly(c.fx(XR, 16.5, 19.6, 0, 7.3), M(oak, 0.85));
      s += K.poly(c.fx(XR, 18.4, 19.2, 3.9, 6.6), M('#9aa8ac', 0.9)) + K.poly(c.fx(XR, 18.4, 19.2, 3.9, 6.6), 'none', { stroke: S('#5a5a52'), strokeWidth: 0.8, strokeDasharray: '2 2', opacity: 0.5 });
      s += K.poly(c.fx(XR, 16.75, 16.95, 3.3, 3.45), L('#c9a24a'));
      // bookcase along the right wall
      s += c.box(XR - 1.1, XR, 0, 3.4, 11.2, 15.6, { front: M(oak, 0.55), left: M(oak, 0.8), top: L(oak) });
      for (const sy of [1.1, 2.25]) s += K.poly(c.fx(XR - 1.1, 11.2, 15.6, sy - 0.06, sy), S(oak));
      for (let row = 0; row < 3; row++) for (let z = 11.4; z < 15.4; z += 0.22 + rng() * 0.12) {
        const y0 = row * 1.15 + 0.1, hh = 0.75 + rng() * 0.3;
        s += K.poly(c.fx(XR - 1.12, z, z + 0.16, y0, y0 + hh), L(rng.pick(['#7a2a2a', '#2e4a5a', '#5a6a3a', '#8a6a3a', '#3a3a4a', '#9a8a6a'])));
      }

      /* ceiling: suspended fluorescent fixtures in two rows */
      for (const X of [-3.6, 5.2]) for (const z of [4.5, 9, 13.5, 18]) {
        s += c.line([X, YC, z + 0.4], [X, 9.8, z + 0.4], S('#555'), 1) + c.line([X, YC, z + 3.4], [X, 9.8, z + 3.4], S('#555'), 1);
        s += c.box(X - 0.45, X + 0.45, 9.45, 9.8, z, z + 3.8, { front: S('#d8d6cc'), left: M('#d8d6cc', 0.7), right: M('#d8d6cc', 0.7), bottom: '#f4f6ee' });
      }

      /* the teacher's desk (front right) and what's on it */
      const TX0 = 4.2, TX1 = 9.2, TZ0 = 17.4, TZ1 = 19.8;
      s += c.box(TX0 + 1.7, TX1 - 1.7, 2.3, 3.55, TZ1 + 0.5, TZ1 + 0.62, { front: M(oak, 0.62), top: L(oak) }); // her chair back
      for (const sx of [TX0 + 2.15, TX0 + 2.5, TX0 + 2.85]) s += K.poly(c.fz(TZ1 + 0.49, sx, sx + 0.12, 2.5, 3.25), S(oak));
      s += c.box(TX0, TX1, 0, 2.35, TZ0 + 0.1, TZ1, { front: M(oak, 0.62), left: M(oak, 0.85) });
      s += c.box(TX0 - 0.1, TX1 + 0.1, 2.35, 2.5, TZ0, TZ1, { front: L(oak), top: L('#a4744a'), left: L(oak) });
      s += K.poly(c.fz(TZ0 + 0.1, TX0 + 0.3, TX1 - 0.3, 0.3, 2.1), 'none', { stroke: S(oak), strokeWidth: 2 });
      for (let i = 0; i < 6; i++) s += c.box(TX0 + 0.6 + i * 0.03, TX0 + 1.9 + i * 0.03, 2.5 + i * 0.05, 2.55 + i * 0.05, TZ0 + 0.5, TZ0 + 1.5, { front: L(i % 2 ? '#f1ece0' : '#e6e0d2'), top: L('#f4f0e6') });
      s += c.box(TX0 + 2.3, TX0 + 3.4, 2.5, 2.7, TZ0 + 0.6, TZ0 + 1.6, { front: L('#2e4a5a'), top: L('#3a5a6a') }); // grade book
      { const [ax, ay] = c.p(TX0 + 3.95, 2.62, TZ0 + 0.45), ar = c.s(TZ0) * 0.19; s += K.circle(ax, ay, ar, L('#b8342c')) + K.circle(ax - ar * 0.35, ay - ar * 0.3, ar * 0.3, '#ffd8c8', { opacity: 0.45 }) + K.line(ax, ay - ar, ax + 1, ay - ar - 4, S('#4a3a2a'), 1.5) + K.ellipse(ax + 4, ay - ar - 3, 3.5, 1.6, L('#5a7a3a')); }
      { const [mx, my] = c.p(TX0 + 4.45, 2.5, TZ0 + 0.9), mr = c.s(TZ0) * 0.17; s += K.rect(mx - mr, my - mr * 2.1, mr * 2, mr * 2.1, L('#d9a441')) + K.ellipse(mx, my - mr * 2.1, mr, mr * 0.3, S('#5a3a2a')) + K.path(`M${n(mx + mr)},${n(my - mr * 1.6)} q${n(mr * 0.7)},${n(mr * 0.3)} 0,${n(mr)}`, 'none', { stroke: L('#d9a441'), strokeWidth: 2 }); }
      // globe on the desk's far corner
      {
        const [gx, gy] = c.p(TX1 - 0.35, 2.5, TZ0 + 1.6), gs = c.s(TZ0 + 1.6), gr = gs * 0.52;
        s += K.rect(gx - gs * 0.2, gy - gs * 0.06, gs * 0.4, gs * 0.06, S('#3a3028')) + K.rect(gx - 1.5, gy - gs * 0.35, 3, gs * 0.3, S('#3a3028'));
        const cy2 = gy - gs * 0.35 - gr;
        s += K.circle(gx, cy2, gr, L('#6f9aa8')) + K.path(`M${n(gx - gr * 0.5)},${n(cy2 - gr * 0.6)} q${n(gr * 0.4)},${n(gr * 0.2)} ${n(gr * 0.3)},${n(gr * 0.7)} q${n(-gr * 0.3)},${n(gr * 0.4)} ${n(-gr * 0.5)},${n(gr * 0.1)} Z`, L('#c9b27a')) + K.path(`M${n(gx + gr * 0.2)},${n(cy2 - gr * 0.2)} q${n(gr * 0.5)},0 ${n(gr * 0.5)},${n(gr * 0.5)} q${n(-gr * 0.3)},${n(gr * 0.3)} ${n(-gr * 0.4)},${n(gr * 0.1)} Z`, L('#b9a06a'));
        s += K.path(`M${n(gx)},${n(cy2 - gr * 1.15)} A${n(gr * 1.15)},${n(gr * 1.15)} 0 0 1 ${n(gx)},${n(cy2 + gr * 1.15)}`, 'none', { stroke: L(P.mustard), strokeWidth: 2 });
        s += K.path(`M${n(gx + gr * 0.2)},${n(cy2)} A${n(gr)},${n(gr)} 0 0 1 ${n(gx)},${n(cy2 + gr)} A${n(gr * 0.7)},${n(gr)} 0 0 0 ${n(gx + gr * 0.2)},${n(cy2)}`, S('#2a4a5a'), { opacity: 0.35 });
      }
      s += c.box(TX1 + 0.4, TX1 + 1.2, 0, 1.3, TZ0 + 0.2, TZ0 + 1.0, { front: S('#6a6f74'), left: M('#6a6f74', 0.7), top: S('#2a2c30') }); // wastebasket

      /* sunlight: patches on the floor through the open lower sash and the slats */
      wins.forEach(([z0, z1]) => {
        const lo = [toFloor(WY0, z0), toFloor(WY0, z1), toFloor(BL, z1), toFloor(BL, z0)];
        s += K.poly(lo.map((q) => c.p(...q)), sun, { opacity: 0.3 });
        for (let y = BL + 0.12; y < WY1 - 0.05; y += 0.22) {
          const st = [toFloor(y, z0), toFloor(y, z1), toFloor(y + 0.12, z1), toFloor(y + 0.12, z0)];
          s += K.poly(st.map((q) => c.p(...q)), sun, { opacity: 0.24 });
        }
      });

      /* desks: wood tops on steel frames, chairs facing the board */
      const desks = [];
      for (const Z of [6.6, 9.4, 12.2, 15.0]) for (const X of [-7.4, -3.5, 0.5, 4.4]) if (!(Z === 15.0 && X === 4.4)) desks.push([X, Z]);
      desks.sort((a, b) => b[1] - a[1]);
      const steel = S('#5a5e66'), wood = '#b78a58', seat = '#8a5a3a';
      const tops = [];
      desks.forEach(([X, Z]) => {
        const w = 2.1, d = 1.5;
        tops.push(c.fy(2.42, X - w / 2, X + w / 2, Z, Z + d));
        // desk legs + book box
        for (const lx of [X - w / 2 + 0.15, X + w / 2 - 0.15]) s += c.line([lx, 0, Z + d - 0.2], [lx, 2.3, Z + d - 0.2], steel, 2) + c.line([lx, 0, Z + 0.2], [lx, 2.3, Z + 0.2], steel, 2);
        s += c.box(X - w / 2 + 0.1, X + w / 2 - 0.1, 1.85, 2.28, Z + 0.15, Z + d - 0.1, { front: S('#4a4e56'), left: M('#4a4e56', 0.8), right: S('#3a3e46') });
        s += c.box(X - w / 2, X + w / 2, 2.3, 2.42, Z, Z + d, { front: M(wood, 0.6), left: L(wood), right: S(wood), top: L(wood) });
        // chair (behind the desk, toward us)
        const cz = Z - 0.95;
        for (const lx of [X - 0.55, X + 0.55]) s += c.line([lx, 0, cz - 0.4], [lx, 1.45, cz - 0.4], steel, 1.8) + c.line([lx, 0, cz + 0.45], [lx, 1.45, cz + 0.45], steel, 1.8);
        s += c.box(X - 0.68, X + 0.68, 1.42, 1.55, cz - 0.55, cz + 0.6, { front: S(seat), left: L(seat), right: S(seat), top: L(seat) });
        for (const lx of [X - 0.6, X + 0.6]) s += c.line([lx, 1.5, cz - 0.6], [lx, 2.75, cz - 0.62], steel, 1.8);
        s += c.box(X - 0.7, X + 0.7, 2.05, 2.8, cz - 0.7, cz - 0.6, { front: M(seat, 0.75), top: L(seat) });
      });
      // a few things left on desks
      const book = (X, Z, col) => c.box(X - 0.45, X + 0.35, 2.42, 2.55, Z + 0.3, Z + 1.0, { front: S(col), top: L(col), left: L(col) });
      s += book(-3.4, 12.2, '#7a2a2a') + book(0.7, 9.4, '#2e4a5a') + book(-7.2, 15.0, '#5a6a3a');
      s += c.box(1.0, 1.9, 0, 1.1, 8.0, 8.5, { front: L('#2e6b8b'), left: L('#3a7b9b'), top: S('#2e6b8b') }); // backpack on the floor

      {
        const cid = o.id(u('tops'));
        let st = '';
        wins.forEach(([z0, z1]) => {
          const lo = [toFloor(WY0, z0, 2.42), toFloor(WY0, z1, 2.42), toFloor(BL, z1, 2.42), toFloor(BL, z0, 2.42)];
          st += K.poly(lo.map((q) => c.p(...q)), sun, { opacity: 0.34 });
          for (let y = BL + 0.12; y < WY1 - 0.05; y += 0.22) st += K.poly([toFloor(y, z0, 2.42), toFloor(y, z1, 2.42), toFloor(y + 0.12, z1, 2.42), toFloor(y + 0.12, z0, 2.42)].map((q) => c.p(...q)), sun, { opacity: 0.3 });
        });
        s += `<clipPath id="${cid}">${tops.map((q) => `<polygon points="${K.pts(q)}"/>`).join('')}</clipPath><g clip-path="url(#${cid})">${st}</g>`;
      }
      /* the light itself: soft beams through the room */
      wins.forEach(([z0, z1], wi) => {
        const pts = [c.p(XL, WY0, z0), c.p(XL, WY0, z1), c.p(XL, WY1, z0), c.p(XL, WY1, z1), c.p(...toFloor(WY0, z0)), c.p(...toFloor(WY0, z1)), c.p(...toFloor(WY1, z0)), c.p(...toFloor(WY1, z1))];
        s += K.shaft(o, hull(pts), sun, 0.13, u('beam'), [0, 0, 1, 0.6]);
      });
      s += K.glow(o, ...c.p(XL, 6.5, 15.7), 380, '#fff4da', 0.25, u('wing'));
      s += K.glow(o, ...c.p(XL, 6.5, 11), 420, '#fff4da', 0.2, u('wing'));

      /* depth */
      s += K.band(o, 0, 200, '#3a3024', 0.28, 0, u('ceil'));
      s += K.band(o, 640, 260, '#2a2018', 0, 0.22, u('floor'));
      return s;
    }
  });
  /* ------------------------------------------------------------------ */
  /* The cafeteria: long tables, lunch line on the right, tall windows on
   * the left, the Derry Tigers mural on the far wall. */
  const seated = (x, y, s, col, rng) => {
    // a seated figure seen from behind/side above a table edge: y = table-top line
    const w = s * (1.25 + rng() * 0.3), h = s * (1.35 + rng() * 0.25);
    let r = K.path(`M${n(x - w / 2)},${n(y)} L${n(x - w * 0.42)},${n(y - h * 0.62)} Q${n(x)},${n(y - h * 0.78)} ${n(x + w * 0.42)},${n(y - h * 0.62)} L${n(x + w / 2)},${n(y)} Z`, col);
    r += K.circle(x + (rng() - 0.5) * s * 0.15, y - h * 0.9, s * 0.3, col);
    if (rng() < 0.35) r += K.path(`M${n(x - s * 0.32)},${n(y - h * 0.95)} q${n(s * 0.32)},${n(-s * 0.4)} ${n(s * 0.64)},0 v${n(s * 0.35)} h${n(-s * 0.64)} Z`, col); // hair
    return r;
  };

  ART.bg('cafeteria', {
    times: ['day'],
    light: { day: 'fluorescent' },
    draw(o) {
      const rng = o.rng;
      const L = (c) => K.tone(c, 'fluorescent'), S = (c) => K.shade(c, 'fluorescent'), M = (c, k) => K.mix(S(c), L(c), k);
      const c = Cam(600, 800, 372, 5.4);
      const XL = -16, XR = 18, YC = 13.5, ZB = 34, ZN = 3;
      const wall = '#ddd3b6', ceil = '#dcd8ca', flo = '#cdbf9f', maroon = '#6e2434', gold = '#d9a441', steel = '#b4b9ba';
      let s = '';

      /* shell */
      s += K.poly(c.fy(YC, XL, XR, ZN, ZB), S(ceil));
      s += K.poly(c.fx(XL, ZN, ZB, 0, YC), M(wall, 0.35));
      s += K.poly(c.fx(XR, ZN, ZB, 0, YC), M(wall, 0.72));
      s += K.poly(c.fz(ZB, XL, XR, 0, YC), L(wall));
      // painted block courses
      let bl = '';
      for (let y = 0.67; y < YC; y += 0.67) bl += c.line([XL, y, ZB], [XR, y, ZB], S(wall), 1) + c.line([XL, y, ZN], [XL, y, ZB], S(wall), 1) + c.line([XR, y, ZN], [XR, y, ZB], S(wall), 1);
      s += K.g({ opacity: 0.35 }, bl);
      // maroon wainscot band in school colors
      s += K.poly(c.fz(ZB, XL, XR, 0, 3.4), L(maroon)) + K.poly(c.fx(XL, ZN, ZB, 0, 3.4), S(maroon)) + K.poly(c.fx(XR, ZN, ZB, 0, 3.4), M(maroon, 0.7));
      s += K.poly(c.fz(ZB, XL, XR, 3.4, 3.65), L(gold)) + K.poly(c.fx(XL, ZN, ZB, 3.4, 3.65), S(gold)) + K.poly(c.fx(XR, ZN, ZB, 3.4, 3.65), M(gold, 0.7));
      /* floor: big VCT checker, waxed */
      const floorPoly = c.fy(0, XL, XR, ZN, ZB);
      s += K.poly(floorPoly, L(flo));
      let tiles = '';
      for (let X = XL; X < XR; X += 2) for (let Z = 4; Z < ZB; Z += 2) if (((X - XL) / 2 + Z / 2) % 2 === 0) tiles += K.poly(c.fy(0, X, X + 2, Z, Z + 2), S(flo));
      s += K.g({ opacity: 0.35 }, tiles);
      const sp = speckle(o, rng, [S('#8a7d62'), L('#efe6d0')], { size: 22, count: 10, rMin: 0.5, rMax: 1.2 });
      s += sp.defs + K.poly(floorPoly, sp.fill, { opacity: 0.4 });

      /* left wall: tall windows */
      const wins = [[13.2, 17.2], [19.4, 23.4], [25.6, 29.6], [31.0, 33.4]], WY0 = 3.9, WY1 = 11.8;
      wins.forEach(([z0, z1], wi) => {
        s += K.poly(c.fx(XL, z0 - 0.3, z1 + 0.3, WY0 - 0.3, WY1 + 0.3), M('#cfc9b8', 0.5));
        const glass = c.fx(XL, z0, z1, WY0, WY1);
        const gid = o.id(u('cw'));
        const [gx0] = c.p(XL, WY1, z0), [gx1] = c.p(XL, WY1, z1);
        let out = K.defs(K.linear(gid, [[0, '#d6e3ea'], [0.55, '#f1f0e6'], [1, '#f2e2c0']])) + K.poly(glass, `url(#${gid})`);
        const yb = c.p(XL, WY0 + 2.2, z0)[1];
        out += K.path(K.blob(rng, (gx0 + gx1) / 2, yb, Math.abs(gx1 - gx0) * 0.9, 40 + wi * -6, { lobes: 6, jag: 0.3 }), L(wi % 2 ? P.ember : P.rust), { opacity: 0.85 });
        s += clipTo(o, glass, out);
        for (let k = 1; k < 3; k++) s += K.poly(c.fx(XL, z0 + ((z1 - z0) * k) / 3 - 0.05, z0 + ((z1 - z0) * k) / 3 + 0.05, WY0, WY1), M('#cfc9b8', 0.4));
        for (let k = 1; k < 4; k++) s += K.poly(c.fx(XL, z0, z1, WY0 + ((WY1 - WY0) * k) / 4 - 0.06, WY0 + ((WY1 - WY0) * k) / 4 + 0.06), M('#cfc9b8', 0.4));
        s += K.poly(c.fx(XL, z0 - 0.4, z1 + 0.4, WY0 - 0.42, WY0 - 0.3), L('#e2dccb'));
      });

      /* the mural: a hand-painted tiger, maroon and gold */
      {
        const MX0 = -12.5, MX1 = 13.5, MY0 = 4.6, MY1 = 12.4;
        const mp = c.fz(ZB, MX0, MX1, MY0, MY1);
        const [mx0, my0] = mp[0], [mx1, my1] = mp[2], mw = mx1 - mx0, mh = my1 - my0;
        let m = K.rect(mx0, my0, mw, mh, L('#e9dcbc'));
        m += K.path(`M${n(mx0)},${n(my0 + mh * 0.7)} Q${n(mx0 + mw * 0.5)},${n(my0 + mh * 0.5)} ${n(mx1)},${n(my0 + mh * 0.72)} L${n(mx1)},${n(my1)} L${n(mx0)},${n(my1)} Z`, L(maroon), { opacity: 0.9 });
        // tiger head (left third), stylized and a little naive
        const tx = mx0 + mw * 0.2, ty = my0 + mh * 0.5, R = mh * 0.42;
        m += K.path(`M${n(tx - R * 0.9)},${n(ty - R * 0.55)} L${n(tx - R * 0.75)},${n(ty - R * 1.05)} L${n(tx - R * 0.35)},${n(ty - R * 0.78)} Z M${n(tx + R * 0.9)},${n(ty - R * 0.55)} L${n(tx + R * 0.75)},${n(ty - R * 1.05)} L${n(tx + R * 0.35)},${n(ty - R * 0.78)} Z`, L('#c9862e'));
        const head = `M${n(tx)},${n(ty - R * 0.95)} C${n(tx + R * 0.9)},${n(ty - R * 0.95)} ${n(tx + R * 1.08)},${n(ty + R * 0.2)} ${n(tx + R * 0.7)},${n(ty + R * 0.62)} L${n(tx + R * 0.86)},${n(ty + R * 0.5)} L${n(tx + R * 0.62)},${n(ty + R * 0.82)} Q${n(tx)},${n(ty + R * 1.08)} ${n(tx - R * 0.62)},${n(ty + R * 0.82)} L${n(tx - R * 0.86)},${n(ty + R * 0.5)} L${n(tx - R * 0.7)},${n(ty + R * 0.62)} C${n(tx - R * 1.08)},${n(ty + R * 0.2)} ${n(tx - R * 0.9)},${n(ty - R * 0.95)} ${n(tx)},${n(ty - R * 0.95)} Z`;
        m += K.path(head, 'none', { stroke: L('#3a1418'), strokeWidth: n(R * 0.1), strokeLinejoin: 'round' }) + K.path(head, L(gold));
        m += K.path(`M${n(tx - R * 0.42)},${n(ty + R * 0.12)} Q${n(tx)},${n(ty - R * 0.05)} ${n(tx + R * 0.42)},${n(ty + R * 0.12)} Q${n(tx + R * 0.45)},${n(ty + R * 0.75)} ${n(tx)},${n(ty + R * 0.82)} Q${n(tx - R * 0.45)},${n(ty + R * 0.75)} ${n(tx - R * 0.42)},${n(ty + R * 0.12)} Z`, L('#f2e8d2'));
        m += K.path(`M${n(tx - R * 0.26)},${n(ty + R * 0.38)} Q${n(tx)},${n(ty + R * 0.3)} ${n(tx + R * 0.26)},${n(ty + R * 0.38)} Q${n(tx + R * 0.2)},${n(ty + R * 0.7)} ${n(tx)},${n(ty + R * 0.72)} Q${n(tx - R * 0.2)},${n(ty + R * 0.7)} ${n(tx - R * 0.26)},${n(ty + R * 0.38)} Z`, L('#5a1a24'));
        m += K.poly([[tx - R * 0.2, ty + R * 0.37], [tx - R * 0.13, ty + R * 0.56], [tx - R * 0.06, ty + R * 0.36]], '#f6f0e2') + K.poly([[tx + R * 0.2, ty + R * 0.37], [tx + R * 0.13, ty + R * 0.56], [tx + R * 0.06, ty + R * 0.36]], '#f6f0e2');
        m += K.poly([[tx - R * 0.16, ty + R * 0.72], [tx - R * 0.11, ty + R * 0.6], [tx - R * 0.06, ty + R * 0.72]], '#f6f0e2') + K.poly([[tx + R * 0.16, ty + R * 0.72], [tx + R * 0.11, ty + R * 0.6], [tx + R * 0.06, ty + R * 0.72]], '#f6f0e2');
        m += K.path(`M${n(tx - R * 0.14)},${n(ty + R * 0.1)} L${n(tx + R * 0.14)},${n(ty + R * 0.1)} L${n(tx)},${n(ty + R * 0.24)} Z`, L('#3a1418'));
        for (const sx of [-1, 1]) {
          m += K.path(`M${n(tx + sx * R * 0.52)},${n(ty - R * 0.3)} L${n(tx + sx * R * 0.12)},${n(ty - R * 0.16)} Q${n(tx + sx * R * 0.3)},${n(ty - R * 0.08)} ${n(tx + sx * R * 0.48)},${n(ty - R * 0.18)} Z`, L('#2a2a1e'));
          m += K.circle(tx + sx * R * 0.3, ty - R * 0.17, R * 0.035, L('#e8c060'));
          for (const k of [0, 1, 2]) m += K.path(`M${n(tx + sx * R * (0.98 - k * 0.05))},${n(ty - R * (0.2 - k * 0.24))} Q${n(tx + sx * R * 0.75)},${n(ty - R * (0.16 - k * 0.24))} ${n(tx + sx * R * (0.62 + k * 0.04))},${n(ty - R * (0.1 - k * 0.22))}`, 'none', { stroke: L('#3a2418'), strokeWidth: n(R * 0.07), strokeLinecap: 'round' });
        }
        for (const k of [-1, 0, 1]) m += K.path(`M${n(tx + k * R * 0.22)},${n(ty - R * 0.94)} q${n(R * 0.04)},${n(R * 0.18)} 0,${n(R * 0.34)}`, 'none', { stroke: L('#3a2418'), strokeWidth: n(R * 0.07), strokeLinecap: 'round' });
        // lettering
        m += T(mx0 + mw * 0.66, my0 + mh * 0.4, 'DERRY', { size: mh * 0.3, anchor: 'middle', fill: L(maroon), weight: 700, len: mw * 0.4, ls: 2 });
        m += T(mx0 + mw * 0.66, my0 + mh * 0.85, 'TIGERS', { size: mh * 0.34, anchor: 'middle', fill: L(gold), weight: 700, len: mw * 0.5, ls: 2 });
        m += T(mx0 + mw * 0.66 + 2, my0 + mh * 0.85 + 2, 'TIGERS', { size: mh * 0.34, anchor: 'middle', fill: L('#3a1418'), weight: 700, len: mw * 0.5, ls: 2, opacity: 0.35 });
        m += T(mx1 - 6, my1 - 4, "CLASS OF '79", { size: 9, anchor: 'end', fill: L('#e9dcbc'), opacity: 0.8, len: 56 });
        s += m + K.rect(mx0, my0, mw, mh, 'none', { stroke: L('#f2e8d0'), strokeWidth: 3, opacity: 0.6 });
      }
      // clock + exit door on the far wall
      s += clockFace(...c.p(-14.2, 12.6, ZB), 12, 11, 47, { rim: S('#3a3530'), face: L('#f1ece0') });
      s += K.poly(c.fz(ZB, -15.6, -12.6, 0, 7.4), M('#8e8270', 0.8)) + K.poly(c.fz(ZB, -15.4, -12.8, 0, 7.2), L('#a8341e'));
      { const [ex, ey] = c.p(-14.1, 7.9, ZB); s += K.rect(ex - 12, ey - 6, 24, 9, '#2a0d0d') + T(ex, ey + 1.5, 'EXIT', { size: 7.5, anchor: 'middle', fill: '#ff6a58', weight: 700, len: 18 }) + K.glow(o, ex, ey - 1, 26, '#ff4a3a', 0.3, u('cexit')); }

      /* tray return + trash cans, back right */
      s += K.poly(c.fz(ZB, 13.4, 17.2, 2.8, 6.4), S('#2b2e33')) + K.poly(c.fz(ZB, 13.2, 17.4, 2.6, 2.8), L(steel)) + K.poly(c.fz(ZB, 13.2, 17.4, 6.4, 6.65), L(steel));
      for (let i = 0; i < 6; i++) s += K.poly(c.fz(ZB - 0.1, 13.8, 15.6, 2.8 + i * 0.08, 2.85 + i * 0.08), L(i % 2 ? '#c9a472' : '#b88f5a'));
      { const [tx, ty] = c.p(15.3, 7.1, ZB); s += K.rect(tx - 26, ty - 7, 52, 11, L('#efe8d6')) + T(tx, ty + 2, 'TRAY RETURN', { size: 7.5, anchor: 'middle', fill: L(maroon), weight: 700, len: 46 }); }
      for (const X of [10.2, 11.9]) s += c.box(X, X + 1.4, 0, 2.6, ZB - 2.0, ZB - 0.6, { front: L('#6f7478'), left: M('#6f7478', 0.8), top: S('#3a3c40') }) + K.poly(c.fz(ZB - 2.0, X - 0.05, X + 1.45, 2.4, 2.6), S('#55595e'));

      /* lunch line along the right wall */
      const CX0 = 14.6, LZ0 = 13.5, LZ1 = 30.5;
      // pass-through to the kitchen behind the counter + menu board
      s += K.poly(c.fx(XR, LZ0 + 1, LZ1 - 1, 3.6, 7.6), S('#3a3a3c'));
      for (let z = LZ0 + 2; z < LZ1 - 2; z += 3.4) s += K.poly(c.fx(XR - 0.05, z, z + 2.2, 5.6, 7.2), M(steel, 0.5), { opacity: 0.8 });
      s += K.poly(c.fx(XR, LZ0 + 1, LZ1 - 1, 7.6, 7.85), L(steel));
      {
        const mb = c.fx(XR, 18.5, 26.5, 8.4, 10.6);
        s += K.poly(c.fx(XR, 18.35, 26.65, 8.25, 10.75), L('#8a6a44')) + K.poly(mb, '#22231f');
        s += wallLetters(c, XR, 10.0, 20.6, 24.4, 'TODAY', 0.42, '#e8e4d8', { weight: 700 });
        s += wallLetters(c, XR, 9.35, 18.9, 26.1, 'PIZZA BOATS', 0.4, '#e8e4d8', { weight: 700 });
        s += wallLetters(c, XR, 8.7, 18.9, 26.1, 'CORN  MILK 25¢', 0.36, '#d9a441', { weight: 700 });
      }
      // a lunch lady behind the glass
      { const [lx, ly] = c.p(16.4, 0, 21.5), ls = c.s(21.5), hy = c.p(16.4, 5.25, 21.5)[1]; s += kid(lx, ly, ls * 5.3, S('#3a3a44')) + K.rect(lx - ls * 0.3, hy - ls * 0.05, ls * 0.6, ls * 0.2, L('#e8e4dc'), { opacity: 0.85 }); }
      // the counter: stainless front, steam wells, sneeze guard, tray slide
      s += c.box(CX0, XR - 1.6, 0, 3.0, LZ0, LZ1, { left: M(steel, 0.8), top: L('#d9dcdc'), front: M(steel, 0.6) });
      for (let z = LZ0 + 0.4; z < LZ1 - 0.6; z += 1.0) s += c.line([CX0, 0.3, z], [CX0, 2.7, z], S(steel), 1, { opacity: 0.5 });
      const pans = ['#d9b23a', '#9a4a2a', '#c9a472', '#e0c070', '#7a8a4a', '#b8442a', '#e8e0c8', '#c9862e'];
      for (let k = 0; k < 8; k++) { const z = LZ0 + 1.2 + k * 1.95; s += K.poly(c.fy(3.01, CX0 + 0.25, CX0 + 1.3, z, z + 1.5), S('#7f8486')) + K.poly(c.fy(3.03, CX0 + 0.35, CX0 + 1.2, z + 0.12, z + 1.38), L(pans[k])); }
      for (let z = LZ0 + 1; z <= LZ1 - 0.5; z += 4) s += c.line([CX0 + 0.3, 3.0, z], [CX0 + 0.3, 5.2, z], L(steel), 2);
      s += K.poly([c.p(CX0 + 0.3, 5.2, LZ0 + 1), c.p(CX0 + 0.3, 5.2, LZ1 - 0.5), c.p(CX0 - 0.15, 3.6, LZ1 - 0.5), c.p(CX0 - 0.15, 3.6, LZ0 + 1)], '#dfeef0', { opacity: 0.22 });
      s += c.line([CX0 - 0.15, 3.6, LZ0 + 1], [CX0 - 0.15, 3.6, LZ1 - 0.5], '#ffffff', 1.4, { opacity: 0.5 }) + c.line([CX0 + 0.3, 5.2, LZ0 + 1], [CX0 + 0.3, 5.2, LZ1 - 0.5], L(steel), 2.5);
      s += K.poly(c.fy(5.2, CX0 + 0.1, CX0 + 1.2, LZ0 + 1, LZ1 - 0.5), '#eaf2f2', { opacity: 0.18 });
      for (const y of [2.6, 2.75, 2.9]) s += c.line([CX0 - 0.9, y, LZ0 - 0.5], [CX0 - 0.9, y, LZ1], L(steel), 1.6);
      // trays stacked at the start of the line, milk crates, the milk cooler
      for (let i = 0; i < 7; i++) s += c.box(CX0 - 1.1, CX0 + 0.2, 3.0 + i * 0.07, 3.06 + i * 0.07, LZ0 - 1.4, LZ0 - 0.1, { front: L(i % 2 ? '#c9a472' : '#b88f5a'), top: L('#d4b07e'), left: L('#c9a472') });
      s += c.box(CX0 - 0.6, XR - 1.6, 0, 2.9, LZ0 - 1.6, LZ0 - 0.05, { front: L(steel), left: M(steel, 0.85) });
      s += c.box(CX0 - 3.2, CX0 - 0.9, 0, 2.6, 9.6, 12.2, { front: L('#e8e4d8'), left: M('#e8e4d8', 0.85), top: L('#f0ece2') });
      s += K.poly(c.fz(9.6, CX0 - 3.0, CX0 - 1.1, 1.6, 2.3), L('#3a6a8a')) + T(0, 0, 'MILK', { size: 34, anchor: 'middle', fill: '#f2efe6', weight: 700, len: 90, transform: c.onZ(CX0 - 2.05, 1.72, 9.6) });
      const crate = (X, Y, Z, col) => {
        let r = c.box(X, X + 1.1, Y, Y + 0.9, Z, Z + 1.1, { front: L(col), left: M(col, 0.85), top: S(col) });
        for (let k = 1; k < 4; k++) r += K.poly(c.fz(Z, X + k * 0.27 - 0.05, X + k * 0.27 + 0.05, Y + 0.1, Y + 0.8), S(col));
        return r;
      };
      s += crate(CX0 - 4.8, 0, 9.0, '#b8392c') + crate(CX0 - 4.8, 0.9, 9.0, '#c84a2e') + crate(CX0 - 4.7, 1.8, 9.05, '#b8392c') + crate(CX0 - 6.1, 0, 9.2, '#2e6b8b');

      /* ceiling lights */
      const fx = [];
      for (const X of [-9, 0.5, 10]) for (let z = 6; z < ZB - 1; z += 5) fx.push([X, z]);
      fx.forEach(([X, z]) => { s += K.poly(c.fy(YC, X - 1.15, X + 1.15, z - 0.1, z + 4.1), S('#b8b6aa')) + K.poly(c.fy(YC - 0.01, X - 1, X + 1, z, z + 4), '#f7f9f0'); });

      /* daylight on the floor from the tall windows */
      wins.forEach(([z0, z1]) => {
        const f = (Y, Z) => { const t = Y / 0.8; return c.p(XL + t, 0, Z - t * 0.35); };
        s += K.poly([f(WY0, z0), f(WY0, z1), f(WY1, z1), f(WY1, z0)], '#fff4d8', { opacity: 0.22 });
      });

      /* tables with attached benches, receding in four lines */
      const tables = [];
      for (const X of [-10.5, -4.2, 2.1]) for (const [z0, z1] of [[21, 31.5], [7.5, 18.5]]) tables.push([X, z0, z1]);
      tables.push([8.4, 21, 31.5]);
      tables.sort((a, b) => b[1] - a[1]);
      const top = '#c9a472', bench = '#3f6f78', frameC = S('#3a3c42');
      const kc = ['#33303a', '#3a2e30', '#2c3638', '#3a3428', '#2e2e3a', '#40302e'];
      tables.forEach(([X, z0, z1]) => {
        const far = z0 > 20;
        // benches
        for (const bx of [X - 2.3, X + 1.4]) {
          s += c.box(bx, bx + 0.9, 1.4, 1.55, z0 + 0.4, z1 - 0.4, { top: L(bench), front: S(bench), left: M(bench, 0.85), right: S(bench) });
          s += c.box(bx + 0.35, bx + 0.55, 0, 1.4, z1 - 1.2, z1 - 0.9, { front: frameC }) + c.box(bx + 0.35, bx + 0.55, 0, 1.4, z0 + 0.9, z0 + 1.2, { front: frameC });
        }
        s += c.box(X - 0.1, X + 0.1, 0, 2.35, z0 + 1, z0 + 1.3, { front: frameC }) + c.box(X - 0.1, X + 0.1, 0, 2.35, z1 - 1.3, z1 - 1, { front: frameC });
        // far tables: kids on the near-side bench (drawn before the top hides them)
        if (far) {
          for (let z = z1 - 1.2; z > z0 + 0.6; z -= 1.6 + rng() * 1.6) {
            for (const side of [-1, 1]) {
              if (rng() < 0.3) continue;
              const [px, py] = c.p(X + side * 1.85, 2.4, z), ps = c.s(z);
              s += seated(px, py, ps, S(rng.pick(kc)), rng);
            }
          }
        }
        s += c.box(X - 1.3, X + 1.3, 2.3, 2.45, z0, z1, { top: L(top), front: M(top, 0.6), left: M(top, 0.85), right: S(top) });
        // trays and milk cartons on the far tables
        if (far) for (let z = z0 + 1; z < z1 - 1; z += 2.2 + rng() * 1.5) {
          const tx = X + (rng() < 0.5 ? -0.7 : 0.15);
          s += K.poly(c.fy(2.46, tx, tx + 0.65, z, z + 0.9), L('#b88f5a'));
          if (rng() < 0.6) s += c.box(tx + 0.4, tx + 0.58, 2.46, 2.8, z + 0.1, z + 0.28, { front: L('#f0ece2'), top: L('#3a6a8a') });
        }
      });
      // a few standing kids in line and walking
      const stand = [[13.0, 25.0, 2], [12.9, 27.2, 0], [12.7, 29.4, 4], [-1.0, 32.6, 3]];
      stand.forEach(([X, Z, ci]) => { const [px, py] = c.p(X, 0, Z); s += kid(px, py, c.s(Z) * 5.2, K.mix(S(kc[ci]), L(wall), 0.18), { pack: ci % 2 ? S('#5a2a2a') : null }); });

      /* light: sun across the tables, window glow, fluorescent wash */
      wins.forEach(([z0, z1]) => {
        const f = (Y, Z) => { const t = (Y - 2.46) / 0.8; return c.p(XL + t, 2.46, Z - t * 0.35); };
        s += K.poly([f(WY0, z0), f(WY0, z1), f(WY1, z1), f(WY1, z0)], '#fff4d8', { opacity: 0.12 });
      });
      s += K.glow(o, ...c.p(XL, 8, 18), 420, '#fff6e2', 0.28, u('wg'));
      fx.forEach(([X, z]) => { if (z < 20) s += K.glow(o, ...c.p(X, YC, z + 2), c.s(z + 2) * 3, '#f3f8ee', 0.28, u('cfx')); });
      s += K.band(o, 0, 180, '#3a3a34', 0.2, 0, u('ceil'));
      s += K.band(o, 640, 260, '#2a2a26', 0, 0.16, u('floor'));
      return s;
    }
  });
  /* ------------------------------------------------------------------ */
  /* The boiler room, and Mr. Teague's wall: forty children, one a year,
   * in black grease pencil. Column 4 starts lower (the fuse box). */
  const WALL_NAMES = [
    ['PAUL OUELLETTE 1957', 'MARGARET DOYLE 1958', 'WALTER DIONNE ?', 'RAYMOND CYR 1959', 'SUSAN HADLEY 1960', 'ROSE TEAGUE 1961', 'TOM PELLETIER 1962', 'ANNIE GAGNON 1963', 'DAVID KEANE 1964', 'BETTY ST. PIERRE ?'],
    ['LINDA MICHAUD 1965', 'PETER DUNHAM 1966', 'CAROL LIBBY 1967', 'MICHAEL FLYNN 1968', 'KATHY LEVESQUE 1969', 'FRANKIE COTE ?', 'ROBERT SAWYER 1970', 'DANIEL CARRIER 1971', 'DENISE ROY 1972', 'JAMES PRESCOTT 1973'],
    ['TINA BOUCHARD 1974', 'MARK DONNELLY 1975', 'MARIE PAQUETTE ?', 'LISA POULIN 1976', 'BRIAN HAYES 1977', 'JENNY CLOUTIER 1978', 'SCOTT MORIN 1979', 'JOEY HEBERT ?', 'AMY THERIAULT 1980'],
    ['KEVIN BOLDUC 1981', 'LOUISE THERRIEN ?', 'JUNE BRENNAN 1982', 'CHRIS NADEAU 1983', 'MELISSA DUBE 1984', 'JASON ALBERT 1985', 'TOBY MERCER 1986', 'HEATHER SIROIS 1987', 'RYAN LEBLANC 1988', 'NICOLE BEAULIEU 1989', 'JOSHUA PARADIS 1990']
  ];
  /* how many times each line has been gone over: older lines more, but no
   * pattern that singles anyone out */
  const RETRACE = [[2, 2, 1, 2, 2, 2, 1, 2, 2, 1], [2, 1, 2, 2, 1, 2, 2, 1, 2, 1], [1, 2, 1, 1, 2, 1, 1, 2, 1], [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1]];
  const retrace = (ci, ri) => RETRACE[ci][ri];
  const GREASE = '#17130f';

  /* pipe running along Z: hull of its two end circles, with a lit stripe */
  const pipeZ = (c, X, Y, z0, z1, r, col, lit, hi) => {
    const pts = [];
    for (const z of [z0, z1]) { const [x, y] = c.p(X, Y, z), rr = c.s(z) * r; for (let a = 0; a < 16; a++) pts.push([x + Math.cos((a / 16) * 6.283) * rr, y + Math.sin((a / 16) * 6.283) * rr]); }
    let s = K.poly(hull(pts), col);
    if (lit) {
      const q = [];
      for (const z of [z0, z1]) { const [x, y] = c.p(X, Y, z), rr = c.s(z) * r; for (let a = 0; a < 8; a++) { const t = hi[0] + (hi[1] - hi[0]) * (a / 7); q.push([x + Math.cos(t) * rr * 0.92, y + Math.sin(t) * rr * 0.92]); } }
      s += K.poly(hull(q), lit, { opacity: 0.75 });
    }
    return s;
  };
  /* vertical pipe at (X, Z) from Y0 to Y1 */
  const pipeY = (c, X, Z, y0, y1, r, col, lit) => {
    const [xa, ya] = c.p(X, y1, Z), [, yb] = c.p(X, y0, Z), w = c.s(Z) * r;
    return K.rect(xa - w, ya, w * 2, yb - ya, col) + (lit ? K.rect(xa + w * 0.15, ya, w * 0.55, yb - ya, lit, { opacity: 0.7 }) : '');
  };

  const boilerRoom = (o) => {
    const rng = o.rng;
    const L = (c0) => K.tone(c0, 'evening'), S = (c0) => K.shade(c0, 'dim'), M = (c0, k) => K.mix(S(c0), L(c0), k);
    const c = Cam(640, 560, 400, 5.2);
    const XL = -9.6, XR = 6.5, YC = 9.6, ZB = 19.5, ZN = 2.6;
    const paint = '#d2c6a6', conc = '#8a857a', brick = '#7a3a2e', iron = '#3a3634';
    const B = [1.4, 7.25, 8.0]; // the bulb
    const [bx, by] = c.p(...B);
    let s = '';

    /* shell: slab ceiling with beams, stone back wall, brick left, painted brick right */
    s += K.poly(c.fy(YC, XL, XR, ZN, ZB), S('#6a6458'));
    for (let z = 4; z < ZB; z += 3.2) s += K.poly(c.fy(YC - 0.01, XL, XR, z, z + 0.7), S('#4a453e')) + K.poly(c.fz(z, XL, XR, YC - 0.75, YC), M('#5a554c', 0.5));
    s += K.poly(c.fz(ZB, XL, XR, 0, YC), M(conc, 0.55));
    for (let i = 0; i < 26; i++) { const X = XL + rng() * (XR - XL), Y = rng() * YC; s += K.poly(c.fz(ZB, X, X + 0.9 + rng(), Y, Y + 0.5 + rng() * 0.4), K.adj(M(conc, 0.55), (rng() - 0.5) * 0.12)); }
    s += K.poly(c.fx(XL, ZN, ZB, 0, YC), S(brick));
    const rw = c.fx(XR, ZN, ZB, 0, YC);
    s += K.poly(rw, L(paint));
    let crs = '';
    for (let y = 0.22; y < YC; y += 0.22) crs += c.line([XR, y, ZN], [XR, y, ZB], M(paint, 0.55), 1);
    for (let y = 0.22, row = 0; y < YC; y += 0.22, row++) for (let z = 4.2 + (row % 2) * 0.33; z < 13; z += 0.66) crs += c.line([XR, y, z], [XR, y - 0.22, z], M(paint, 0.55), 1);
    s += clipTo(o, rw, K.g({ opacity: 0.45 }, crs));
    // old paint: a few chips showing brick, rust streaks bleeding down from the pipes
    for (let i = 0; i < 12; i++) {
      const Y = 0.6 + rng() * 8.4, Z = 4 + rng() * 14, z1 = Z - 0.25 - rng() * 0.4, h = 0.12 + rng() * 0.15;
      s += K.poly(c.fx(XR, z1, Z, Y, Y + h), M('#9a6a58', 0.7), { opacity: 0.55 });
    }
    for (let i = 0; i < 9; i++) {
      const Z = 4.5 + rng() * 14, len = 1.2 + rng() * 2.6;
      s += K.poly(c.fx(XR, Z - 0.05 - rng() * 0.08, Z, 8.6 - len, 8.6), M('#7a5a3a', 0.8), { opacity: 0.18 + rng() * 0.12 });
    }
    s += K.poly(c.fx(XR, ZN, ZB, 0, 0.5), M('#5a5246', 0.6)); // grime at the foot
    // fuse box (why column 4 starts low) + conduit
    s += K.poly(c.fx(XR, 6.4, 8.4, 7.2, 8.75), M('#4f5a52', 0.8)) + K.poly(c.fx(XR, 6.55, 8.25, 7.32, 8.62), 'none', { stroke: S('#2e3530'), strokeWidth: 1.5 });
    s += K.poly(c.fx(XR, 7.3, 7.5, 8.75, YC), M('#5f6660', 0.7));
    s += K.poly(c.fx(XR, 6.7, 7.1, 7.95, 8.25), L('#e8e2cc'), { opacity: 0.7 }); // a paper label

    /* the names, letter by letter so they sit on the wall */
    const cols = [[19.3, 8.55, 0.8, 0.27], [15.85, 8.55, 0.8, 0.27], [12.4, 8.55, 0.88, 0.27], [8.95, 6.65, 0.56, 0.27]];
    let names = '';
    WALL_NAMES.forEach((col, ci) => {
      const [zs, y0, dy, h] = cols[ci], adv = h * 0.6;
      col.forEach((str, ri) => {
        const Y = y0 - ri * dy, rt = retrace(ci, ri);
        if (ci < 2) {
          const tr = c.onX(XR, Y, zs - (str.length * adv) / 2, -1), len = str.length * adv * 100;
          names += T(0, 0, str, { size: h * 100, anchor: 'middle', fill: GREASE, opacity: 0.84, font: F_HAND, transform: tr, len });
          if (rt > 0) names += T(0.9, 0.6, str, { size: h * 100, anchor: 'middle', fill: GREASE, opacity: rt > 1 ? 0.42 : 0.28, font: F_HAND, transform: tr, len });
          return;
        }
        [...str].forEach((ch, k) => {
          if (ch === ' ') return;
          const Z = zs - (k + 0.5) * adv;
          const tr = c.onX(XR, Y, Z, -1);
          names += T(0, 0, ch, { size: h * 100, anchor: 'middle', fill: GREASE, opacity: 0.84, font: F_HAND, transform: tr });
          if (rt > 0) names += T(0.9, 0.6, ch, { size: h * 100, anchor: 'middle', fill: GREASE, opacity: rt > 1 ? 0.42 : 0.28, font: F_HAND, transform: tr });
        });
      });
    });
    s += names;

    /* floor: concrete, a drain, a puddle that holds the bulb */
    s += K.poly(c.fy(0, XL, XR, ZN, ZB), M(conc, 0.62));
    for (let i = 0; i < 9; i++) { const X = XL + 2 + rng() * 12, Z = ZN + 2 + rng() * 14, [x, y] = c.p(X, 0, Z), sc = c.s(Z); s += K.ellipse(x, y, sc * (0.6 + rng()), sc * (0.15 + rng() * 0.2), S('#3a3630'), { opacity: 0.35 }); }
    s += K.ellipse(...c.p(1.0, 0, 7.2), 30, 7, S('#2a2824'));
    { const [px, py] = c.p(1.8, 0, 7.6), sc = c.s(7.6); s += K.ellipse(px, py, sc * 1.7, sc * 0.32, S('#2c2a28'), { opacity: 0.8 }) + K.ellipse(px, py - 1, sc * 0.18, sc * 0.05, '#fff1c8', { opacity: 0.85 }); }

    /* janitor's corner at the back: armchair + afghan, chess crate, hotplate, calendar */
    // calendar on the back wall
    { const q = c.fz(ZB, -1.2, 0.8, 4.3, 6.9), [x0, y0] = q[0], [x1, y1] = q[2], w = x1 - x0, h = y1 - y0;
      s += K.poly(q, L('#e8e0cc')) + K.rect(x0 + w * 0.08, y0 + h * 0.18, w * 0.84, h * 0.36, L('#5a7a8a')) + K.path(`M${n(x0 + w * 0.08)},${n(y0 + h * 0.48)} l${n(w * 0.3)},${n(-h * 0.16)} l${n(w * 0.2)},${n(h * 0.08)} l${n(w * 0.34)},${n(-h * 0.12)} v${n(h * 0.2)} h${n(-w * 0.84)} Z`, L('#3f5a44'));
      s += T(x0 + w / 2, y0 + h * 0.13, 'DERRY HARDWARE', { size: h * 0.08, anchor: 'middle', fill: L('#8a2a24'), weight: 700, len: w * 0.8 });
      for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) s += K.rect(x0 + w * (0.1 + k * 0.115), y0 + h * (0.6 + r * 0.09), w * 0.08, h * 0.05, L('#b9b09a'));
      s += K.line(x0 + w * 0.33, y0 + h * 0.68, x0 + w * 0.42, y0 + h * 0.74, L('#8a2a24'), 1.5) + K.line(x0 + w * 0.42, y0 + h * 0.68, x0 + w * 0.33, y0 + h * 0.74, L('#8a2a24'), 1.5);
      s += K.circle(x0 + w / 2, y0 - 2, 1.6, S('#222')); }
    // shelf with the hotplate, a coffee can, a transistor radio
    s += c.box(2.8, 5.4, 2.5, 2.62, ZB - 1.0, ZB, { front: M('#7a5a3a', 0.7), top: L('#8a6a44') });
    s += c.line([3.0, 0, ZB - 0.5], [3.0, 2.5, ZB - 0.5], S(iron), 2) + c.line([5.2, 0, ZB - 0.5], [5.2, 2.5, ZB - 0.5], S(iron), 2);
    s += c.box(3.0, 4.2, 2.62, 2.95, ZB - 0.9, ZB - 0.2, { front: L('#e6e0d0'), top: L('#d0c8b4'), left: L('#ece6d6') });
    s += K.ellipse(...c.p(3.3, 2.96, ZB - 0.55), 5, 1.6, S('#2a2622')) + K.ellipse(...c.p(3.9, 2.96, ZB - 0.55), 5, 1.6, S('#2a2622'));
    { const [kx, ky] = c.p(3.35, 2.96, ZB - 0.55), ks = c.s(ZB); s += K.path(`M${n(kx - ks * 0.25)},${n(ky)} q0,${n(-ks * 0.42)} ${n(ks * 0.25)},${n(-ks * 0.42)} q${n(ks * 0.25)},0 ${n(ks * 0.25)},${n(ks * 0.42)} Z`, L('#8a8f90')) + K.line(kx + ks * 0.25, ky - ks * 0.2, kx + ks * 0.42, ky - ks * 0.34, L('#8a8f90'), 2); }
    s += c.box(4.4, 4.85, 2.62, 3.2, ZB - 0.8, ZB - 0.35, { front: L('#b8342c'), left: M('#b8342c', 0.9), top: S('#9aa0a2') });
    s += c.box(4.9, 5.35, 2.62, 2.95, ZB - 0.7, ZB - 0.4, { front: L('#2e4a3a'), left: M('#2e4a3a', 0.9) }) + c.line([5.3, 2.95, ZB - 0.55], [5.45, 3.6, ZB - 0.55], S(iron), 1);
    // work jacket on a hook
    { const [hx, hy] = c.p(-2.4, 6.2, ZB), hs = c.s(ZB); s += K.path(`M${n(hx - hs * 0.55)},${n(hy + hs * 2.4)} L${n(hx - hs * 0.4)},${n(hy + hs * 0.2)} Q${n(hx)},${n(hy - hs * 0.1)} ${n(hx + hs * 0.4)},${n(hy + hs * 0.2)} L${n(hx + hs * 0.55)},${n(hy + hs * 2.4)} Z`, M('#2e3a52', 0.75)) + K.rect(hx - hs * 0.18, hy + hs * 0.55, hs * 0.36, hs * 0.18, L('#e8e2cc'), { opacity: 0.8 }); }
    // the armchair: cracked brown vinyl, an afghan over the back
    const ch = '#6a4a32';
    s += c.box(-1.1, 1.7, 1.2, 3.5, 16.6, 17.3, { front: M(ch, 0.8), top: L(ch) });
    s += c.box(-1.1, 1.7, 0, 1.25, 15.0, 17.2, { front: M(ch, 0.62), top: L(ch) });
    s += c.box(-1.1, -0.6, 1.25, 2.15, 15.0, 17.0, { front: M(ch, 0.7), top: L(ch), left: M(ch, 0.9) }) + c.box(1.2, 1.7, 1.25, 2.15, 15.0, 17.0, { front: M(ch, 0.7), top: L(ch), left: M(ch, 0.9) });
    s += c.box(-0.55, 1.15, 1.25, 1.55, 15.1, 16.6, { front: M(ch, 0.75), top: M(ch, 1.05) });
    { const q = [c.p(-0.9, 3.4, 16.55), c.p(1.4, 3.42, 16.55), c.p(1.25, 2.1, 16.4), c.p(0.3, 1.75, 16.2), c.p(-0.75, 2.2, 16.4)];
      s += K.poly(q, M('#7a3a3a', 0.8));
      const [ax, ay] = c.p(-0.6, 3.25, 16.5), as = c.s(16.5);
      ['#d9a441', '#2e6b6b', '#b8542e', '#e8e0cc', '#5a3a5a'].forEach((col, i) => { for (let j = 0; j < 3; j++) s += K.rect(ax + (i * 0.38 + (j % 2) * 0.1) * as, ay + j * 0.36 * as, as * 0.3, as * 0.3, L(col), { opacity: 0.85 }); }); }
    s += K.path(`M${n(c.p(0.2, 1.3, 15.05)[0])},${n(c.p(0.2, 1.3, 15.05)[1])} l6,-3 l3,4 l5,-2`, 'none', { stroke: S('#2a1a12'), strokeWidth: 1 });
    // the crate with the chessboard, and his pipe in an ashtray
    s += c.box(2.1, 3.7, 0, 1.45, 14.4, 15.9, { front: L('#9a7a4e'), left: M('#9a7a4e', 0.85), top: L('#a8885a') });
    for (let k = 1; k < 4; k++) s += K.poly(c.fz(14.4, 2.1, 3.7, k * 0.36 - 0.03, k * 0.36 + 0.03), S('#6a5232'));
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) if ((r + k) % 2) s += K.poly(c.fy(1.46, 2.2 + k * 0.16, 2.36 + k * 0.16, 14.5 + r * 0.16, 14.66 + r * 0.16), S('#2a2420'));
    s += K.poly(c.fy(1.455, 2.2, 3.48, 14.5, 15.78), L('#e0d4b4'), { opacity: 0.25 });
    for (const [X, Z, wht] of [[2.5, 14.7, 1], [2.9, 14.9, 1], [3.2, 15.4, 0], [2.6, 15.6, 0], [3.3, 14.6, 1], [2.4, 15.2, 0]]) { const [px, py] = c.p(X, 1.46, Z); s += K.rect(px - 2, py - 6, 4, 6, wht ? L('#ece4d0') : S('#1a1614')) + K.circle(px, py - 7, 2.2, wht ? L('#ece4d0') : S('#1a1614')); }
    { const [ax, ay] = c.p(3.45, 1.46, 15.6); s += K.ellipse(ax, ay, 9, 3, S('#5a5a5e')) + K.ellipse(ax, ay - 1, 6, 1.8, S('#2a2a2c')) + K.path(`M${n(ax - 8)},${n(ay - 3)} q6,2 10,-1 l3,-6 h3 v5 q-2,3 -5,3`, 'none', { stroke: L('#5a3a22'), strokeWidth: 2 }); }

    /* the boiler: brick setting, riveted shell, front plate with gauges */
    s += c.box(-9.3, -1.6, 0, 1.5, 9.0, 18.6, { front: S(brick), right: M(brick, 0.5), top: S(brick) });
    const AX = -5.4, AY = 4.4, AR = 3.0, Z0 = 9.4, Z1 = 18.2;
    const [n0x, n0y] = c.p(AX, AY, Z0), r0 = c.s(Z0) * AR, [n1x, n1y] = c.p(AX, AY, Z1), r1 = c.s(Z1) * AR;
    const ring = (x, y, r, a0, a1, k = 20) => Array.from({ length: k + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
    s += K.poly(hull(ring(n0x, n0y, r0, 0, 6.283, 40).concat(ring(n1x, n1y, r1, 0, 6.283, 40))), S(iron));
    s += K.poly(ring(n0x, n0y, r0, -1.75, 0.1).concat(ring(n1x, n1y, r1, 0.1, -1.75)), M(iron, 0.85));
    s += K.poly(ring(n0x, n0y, r0 * 0.995, -1.2, -0.45).concat(ring(n1x, n1y, r1 * 0.995, -0.45, -1.2)), L('#6a5a4a'), { opacity: 0.55 });
    for (const zz of [12.3, 15.2]) { const [sx, sy] = c.p(AX, AY, zz), rr = c.s(zz) * AR; for (let a = -2.4; a < 0.9; a += 0.11) s += K.circle(sx + Math.cos(a) * rr * 0.985, sy + Math.sin(a) * rr * 0.985, 1.5, L('#8a7a6a'), { opacity: 0.7 }); }
    for (let k = 0; k <= 16; k++) { const t = k / 16, zz = Z0 + (Z1 - Z0) * t, [sx, sy] = c.p(AX, AY, zz), rr = c.s(zz) * AR, a = -1.15; s += K.circle(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, 1.5, L('#8a7a6a'), { opacity: 0.7 }); }
    // front plate
    s += K.circle(n0x, n0y, r0, M(iron, 0.7)) + K.circle(n0x, n0y, r0 * 0.9, M(iron, 0.55));
    for (let a = 0; a < 6.283; a += 0.13) s += K.circle(n0x + Math.cos(a) * r0 * 0.95, n0y + Math.sin(a) * r0 * 0.95, 2.3, M('#8a7a6a', 0.8));
    s += K.path(`M${n(n0x - r0 * 0.9)},${n(n0y)} A${n(r0 * 0.9)},${n(r0 * 0.9)} 0 0 1 ${n(n0x + r0 * 0.9)},${n(n0y)}`, 'none', { stroke: L('#6a5a4a'), strokeWidth: 2, opacity: 0.5 });
    // fire door (lower) and smokebox door (upper)
    s += K.rect(n0x - r0 * 0.34, n0y + r0 * 0.22, r0 * 0.68, r0 * 0.42, S('#1e1c1b')) + K.rect(n0x - r0 * 0.3, n0y + r0 * 0.26, r0 * 0.6, r0 * 0.34, M(iron, 0.5));
    s += K.rect(n0x + r0 * 0.18, n0y + r0 * 0.38, r0 * 0.14, r0 * 0.05, L('#9a8a6a'));
    s += K.ellipse(n0x, n0y - r0 * 0.36, r0 * 0.36, r0 * 0.24, M(iron, 0.45)) + K.ellipse(n0x, n0y - r0 * 0.36, r0 * 0.3, r0 * 0.19, M(iron, 0.62));
    s += K.rect(n0x - r0 * 0.04, n0y - r0 * 0.38, r0 * 0.3, r0 * 0.04, L('#9a8a6a'));
    // maker's plate
    s += K.rect(n0x - r0 * 0.24, n0y + r0 * 0.72, r0 * 0.48, r0 * 0.11, L('#a8884a')) + T(n0x, n0y + r0 * 0.8, 'PENOBSCOT IRON WORKS 1923', { size: r0 * 0.05, anchor: 'middle', fill: S('#3a2a1a'), weight: 700, len: r0 * 0.42 });
    // gauges and the water glass (upper right, toward the light)
    const gauge = (x, y, r, ang) => K.circle(x, y, r * 1.18, S('#2a2622')) + K.circle(x, y, r * 1.05, L('#a8884a')) + K.circle(x, y, r, L('#ece4cc')) + K.line(x, y, x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8, '#7a1a14', 1.6) + K.circle(x, y, 1.6, '#2a2622');
    s += K.rect(n0x + r0 * 0.52, n0y - r0 * 0.98, 4, r0 * 0.3, M('#8a7a6a', 0.6));
    s += gauge(n0x + r0 * 0.53, n0y - r0 * 1.06, r0 * 0.12, -0.6) + gauge(n0x + r0 * 0.18, n0y - r0 * 0.74, r0 * 0.085, -2.2);
    s += K.rect(n0x + r0 * 0.72, n0y - r0 * 0.5, r0 * 0.06, r0 * 0.5, L('#c9d4c8'), { opacity: 0.7 }) + K.rect(n0x + r0 * 0.7, n0y - r0 * 0.53, r0 * 0.1, r0 * 0.04, M('#8a7a6a', 0.7)) + K.rect(n0x + r0 * 0.7, n0y - r0 * 0.02, r0 * 0.1, r0 * 0.04, M('#8a7a6a', 0.7));
    s += K.rect(n0x + r0 * 0.725, n0y - r0 * 0.24, r0 * 0.05, r0 * 0.22, L('#8aa0a8'), { opacity: 0.6 });
    { const [vx, vy] = [n0x + r0 * 0.86, n0y - r0 * 0.72], vr = r0 * 0.1; s += K.circle(vx, vy, vr, 'none', { stroke: L('#a8342a'), strokeWidth: 3 }) + K.line(vx - vr, vy, vx + vr, vy, L('#a8342a'), 2) + K.line(vx, vy - vr, vx, vy + vr, L('#a8342a'), 2); }

    /* pipes: steam main up from the boiler, along the ceiling; lagged returns */
    const lag = M('#cfc8b4', 0.8), lagL = L('#e6dfcc'), ir = S('#4a3a32'), irL = L('#7a5a42');
    s += pipeY(c, -4.2, 13.5, 7.2, 9.0, 0.45, M(iron, 0.6), L('#6a5a4a'));
    s += pipeZ(c, -4.2, 9.0, 3.0, 13.5, 0.45, M(iron, 0.6), L('#6a5a4a'), [-2.2, -0.9]);
    s += pipeZ(c, -1.6, 9.1, ZN, ZB, 0.32, lag, lagL, [-2.0, -0.6]);
    for (let z = 4; z < ZB; z += 1.6) { const [x, y] = c.p(-1.6, 9.1, z), rr = c.s(z) * 0.33; s += K.ellipse(x, y, rr * 0.5, rr, S('#b8b09c'), { opacity: 0.6 }); }
    s += pipeZ(c, 2.4, 9.15, ZN, ZB, 0.22, ir, irL, [-2.3, -1.0]);
    s += pipeZ(c, 4.2, 9.0, ZN, ZB, 0.28, lag, lagL, [-2.6, -1.4]);
    s += pipeZ(c, XR - 0.4, 8.95, ZN, ZB, 0.2, ir, irL, [-2.8, -1.6]);
    s += pipeY(c, XR - 0.4, 15.4, 0.4, 8.95, 0.2, ir, irL);
    s += pipeZ(c, XR - 0.4, 0.7, ZN, 15.4, 0.18, ir, irL, [-2.8, -1.6]);
    s += pipeY(c, XR - 0.35, 5.0, 0.7, 8.95, 0.17, ir, irL);
    // valve wheel on the main
    { const [vx, vy] = c.p(-4.2, 8.35, 10.5), vr = c.s(10.5) * 0.4; s += K.ellipse(vx, vy, vr, vr * 0.35, 'none', { stroke: L('#9a3a2a'), strokeWidth: 3 }); }

    /* the bulb on its cord, caged */
    s += K.line(bx, c.p(B[0], YC, B[2])[1], bx, by - 18, '#141210', 1.4);
    const bulbLite = K.glow(o, bx, by, 520, '#ffd8a0', 0.42, u('bulbg')) + K.glow(o, bx, by, 60, '#fff2d0', 0.7, u('bulbc')) + K.ellipse(bx, by, 9, 12, '#fff6dc') + K.ellipse(bx, by - 1, 5, 7, '#ffffff') +
      K.path(`M${bx - 12},${by - 10} q12,-10 24,0 M${bx - 13},${by} h26 M${bx - 11},${by + 11} q11,8 22,0 M${bx},${by - 14} v28 M${bx - 12},${by - 10} q-4,10 1,21 M${bx + 12},${by - 10} q4,10 -1,21`, 'none', { stroke: '#2a2622', strokeWidth: 1.4 }) + K.rect(bx - 5, by - 18, 10, 6, '#3a3530');

    /* light: falloff into darkness, warm pools */
    const dk = o.id(u('dark'));
    s += K.defs(K.radial(dk, [[0, '#06070c', 0], [0.2, '#06070c', 0.06], [0.45, '#06070c', 0.48], [0.7, '#06070c', 0.82], [1, '#06070c', 0.95]], bx + 170, by + 210, 960)) + K.rect(0, 0, 1600, 900, `url(#${dk})`);
    s += K.pool(o, ...c.p(XR, 5.8, 9.0), 220, 290, '#ffcf8a', 0.2, u('wallp'));
    s += K.pool(o, ...c.p(B[0], 0, B[2]), 300, 60, '#ffcf8a', 0.26, u('floorp'));
    s += K.shaft(o, [[bx - 8, by + 6], [bx + 8, by + 6], [bx + 210, c.p(B[0], 0, B[2])[1]], [bx - 190, c.p(B[0], 0, B[2])[1]]], '#ffd8a0', 0.1, u('cone'));
    s += K.band(o, 0, 160, '#06070c', 0.6, 0, u('ceil'));
    return s + bulbLite;
  };

  /* close, frontal: just the wall of names under the bulb */
  const boilerWall = (o) => {
    const rng = o.rng;
    const L = (c0) => K.tone(c0, 'evening'), S = (c0) => K.shade(c0, 'dim'), M = (c0, k) => K.mix(S(c0), L(c0), k);
    const paint = '#d2c6a6', brick = '#7a3a2e';
    const bx = 760, by = 74;
    let s = K.rect(0, 0, 1600, 900, L(paint));
    // brick courses + joints in the paint
    let crs = '';
    for (let y = 26, row = 0; y < 900; y += 26, row++) { crs += K.rect(0, y, 1600, 2, M(paint, 0.55)); for (let x = (row % 2) * 40; x < 1600; x += 80) crs += K.rect(x, y - 26, 2, 26, M(paint, 0.55)); }
    s += K.g({ opacity: 0.5 }, crs);
    for (let i = 0; i < 14; i++) { const x = Math.floor(rng() * 20) * 80 + (rng() < 0.5 ? 0 : 40), y = Math.floor(rng() * 34) * 26 + 2; s += K.rect(x + 2, y, 38 + rng() * 40, 24, M('#9a6a58', 0.72), { opacity: 0.5 }); }
    for (let i = 0; i < 10; i++) { const x = rng() * 1600, len = 120 + rng() * 380; s += K.rect(x, 56, 3 + rng() * 5, len, M('#7a5a3a', 0.8), { opacity: 0.12 + rng() * 0.12 }); }
    for (let i = 0; i < 40; i++) { const x = rng() * 1600, y = rng() * 900; s += K.rect(x, y, 2 + rng() * 6, 1.5, M(paint, 0.4), { opacity: 0.5 }); }
    // pipes along the top
    s += K.rect(-10, 0, 1620, 34, M('#cfc8b4', 0.8)) + K.rect(-10, 4, 1620, 10, L('#e6dfcc'), { opacity: 0.7 });
    for (let x = 30; x < 1600; x += 120) s += K.rect(x, 0, 14, 34, S('#b8b09c'), { opacity: 0.7 });
    s += K.rect(-10, 40, 1620, 16, S('#4a3a32')) + K.rect(-10, 42, 1620, 4, L('#7a5a42'), { opacity: 0.8 });
    for (let x = 200; x < 1600; x += 380) s += K.rect(x, 34, 6, 26, S('#2a2622'));
    // fuse box over column 4 + conduit
    s += K.rect(1075, 92, 200, 160, M('#4f5a52', 0.85)) + K.rect(1087, 104, 176, 136, 'none', { stroke: S('#2e3530'), strokeWidth: 3 }) + K.rect(1165, 56, 18, 36, M('#5f6660', 0.7));
    s += K.rect(1101, 120, 64, 26, L('#e8e2cc'), { opacity: 0.85 }) + T(1133, 138, 'MAIN', { size: 15, anchor: 'middle', fill: S('#3a3a3a'), weight: 700, len: 40 });
    s += K.rect(1247, 160, 10, 30, S('#2e3530'));
    // the names
    const colX = [250, 525, 800, 1075], rowY = (ci, ri) => (ci < 3 ? 140 + ri * (ci === 2 ? 64 : 58) : 296 + ri * 47);
    WALL_NAMES.forEach((col, ci) => col.forEach((str, ri) => {
      const x = colX[ci] + (rng() - 0.5) * 8, y = rowY(ci, ri) + (rng() - 0.5) * 4, size = (ci < 3 ? 28 : 26.5) * (0.96 + rng() * 0.08), len = str.length * size * 0.43, rt = retrace(ci, ri);
      const tr = `rotate(${n((rng() - 0.5) * 1.4)} ${n(x)} ${n(y)})`;
      s += T(x, y, str, { size, fill: GREASE, opacity: 0.88, font: F_HAND, len, ls: 1, transform: tr });
      if (rt > 0) s += T(x + 1.2, y + 0.8, str, { size, fill: GREASE, opacity: rt > 1 ? 0.45 : 0.3, font: F_HAND, len, ls: 1, transform: tr });
    }));
    // risers framing the wall at either side
    for (const [px, w] of [[96, 26], [1478, 22]]) s += K.rect(px, 56, w, 844, S('#4a3a32')) + K.rect(px + w * 0.55, 56, w * 0.25, 844, L('#7a5a42'), { opacity: 0.7 }) + K.rect(px - 4, 300, w + 8, 10, S('#2a2622')) + K.rect(px - 4, 640, w + 8, 10, S('#2a2622'));
    // a grease pencil left on the pipe ledge
    s += K.rect(430, 58, 46, 6, '#1a1612') + K.rect(470, 58, 8, 6, L('#c8b89a'));
    // the bulb + cord in front of the wall, its shadow-less glare
    s += K.line(bx, 0, bx, by - 12, '#141210', 1.6);
    const dk = o.id(u('wdark'));
    s += K.defs(K.radial(dk, [[0, '#06070c', 0], [0.3, '#06070c', 0.1], [0.62, '#06070c', 0.52], [1, '#06070c', 0.9]], bx, by + 260, 1100)) + K.rect(0, 0, 1600, 900, `url(#${dk})`);
    s += K.glow(o, bx, by, 620, '#ffd8a0', 0.4, u('wbulb'));
    s += K.ellipse(bx, by, 9, 12, '#fff6dc') + K.ellipse(bx, by - 1, 5, 7, '#ffffff');
    s += K.path(`M${bx - 12},${by - 10} q12,-10 24,0 M${bx - 13},${by} h26 M${bx - 11},${by + 11} q11,8 22,0 M${bx},${by - 14} v28 M${bx - 12},${by - 10} q-4,10 1,21 M${bx + 12},${by - 10} q4,10 -1,21`, 'none', { stroke: '#2a2622', strokeWidth: 1.5 }) + K.rect(bx - 5, by - 18, 10, 6, '#3a3530');
    s += K.band(o, 700, 200, '#06070c', 0, 0.4, u('wfloor'));
    return s;
  };

  ART.bg('boiler', {
    times: ['dim'],
    light: { dim: 'dim' },
    draw(o) { return o.variant === 'wall' ? boilerWall(o) : boilerRoom(o); }
  });
  /* ------------------------------------------------------------------ */
  /* Derry Public Library, the adult reading room. Through the back
   * doorway: the glass corridor to the children's library. */
  ART.bg('library', {
    times: ['day', 'evening'],
    light: { day: 'day', evening: 'interior_lamp' },
    draw(o) {
      const rng = o.rng, eve = o.time === 'evening';
      const tt = eve ? 'evening' : 'day';
      const L = (c0) => K.tone(c0, tt), S = (c0) => K.shade(c0, tt), M = (c0, k) => K.mix(S(c0), L(c0), k);
      const c = Cam(680, 640, 380, 5.3);
      const XL = -11, XR = 15, YC = 18, ZB = 36, ZN = 3;
      const plaster = '#e2d6b8', oak = '#7a5232', oakL = '#9a6a40', flo = '#8a5e3a', green = '#2f5a44';
      const warm = '#ffd38a';
      const BKS = ['#7a2a2a', '#2e4a5a', '#5a6a3a', '#8a6a3a', '#3a3a4a', '#9a8a6a', '#6a3a2a', '#2f4a3a', '#a8884a', '#4a2e3a'].map((b) => K.mix(K.desat(b, 0.35), '#5a3e28', 0.35));
      let s = '', lite = '';

      /* shell: plaster walls, coffered ceiling, oak floor */
      s += K.poly(c.fy(YC, XL, XR, ZN, ZB), M(plaster, 0.55));
      s += K.poly(c.fx(XL, ZN, ZB, 0, YC), M(plaster, 0.35));
      s += K.poly(c.fx(XR, ZN, ZB, 0, YC), M(plaster, 0.72));
      s += K.poly(c.fz(ZB, XL, XR, 0, YC), L(plaster));
      for (let z = 6; z < ZB; z += 5) s += K.poly(c.fy(YC - 0.01, XL, XR, z, z + 0.8), S(oak)) + K.poly(c.fz(z, XL, XR, YC - 1.0, YC), M(oak, 0.6));
      s += K.poly(c.fy(YC - 0.02, 1.0, 1.8, ZN, ZB), S(oak));
      s += K.poly(c.fz(ZB, XL, XR, YC - 1.2, YC), M(oak, 0.8)) + K.poly(c.fx(XL, ZN, ZB, YC - 1.2, YC), S(oak)) + K.poly(c.fx(XR, ZN, ZB, YC - 1.2, YC), M(oak, 0.6));
      const floorPoly = c.fy(0, XL, XR, ZN, ZB);
      s += K.poly(floorPoly, M(flo, 0.85));
      let fb = '';
      for (let X = XL + 0.6; X < XR; X += 0.6) fb += c.line([X, 0, ZN], [X, 0, ZB], S(flo), 1);
      s += K.g({ opacity: 0.35 }, fb);
      // runner rug down the aisle
      s += K.poly(c.fy(0.01, -0.4, 3.0, ZN, ZB - 1.5), L('#6e2a2a')) + K.poly(c.fy(0.015, -0.1, 2.7, ZN, ZB - 1.8), M('#7e3a2e', 0.9));
      s += K.poly(c.fy(0.02, 0.15, 2.45, ZN, ZB - 2.1), L('#6e2a2a'));

      /* back wall: shelves either side of the arched doorway */
      const DX0 = -3, DX1 = 5, DSP = 7, DR = 4;
      const arch = (X0, X1, ySpring, Z, steps = 16) => {
        const xc = (X0 + X1) / 2, r = (X1 - X0) / 2, pts = [c.p(X0, 0, Z), c.p(X0, ySpring, Z)];
        for (let i = 1; i < steps; i++) { const a = Math.PI - (Math.PI * i) / steps; pts.push(c.p(xc + Math.cos(a) * r, ySpring + Math.sin(a) * r, Z)); }
        return pts.concat([c.p(X1, ySpring, Z), c.p(X1, 0, Z)]);
      };
      const shelfWallZ = (X0, X1, Z, Y1) => {
        let r = K.poly(c.fz(Z, X0, X1, 0, Y1), M(oak, 0.75)) + K.poly(c.fz(Z, X0 + 0.2, X1 - 0.2, 0.4, Y1 - 0.3), S('#2a1e16'));
        for (let y = 0.4; y < Y1 - 1; y += 1.25) {
          for (let x = X0 + 0.2; x < X1 - 0.3;) {
            const w = Math.min(0.3 + rng() * 0.9, X1 - 0.2 - x), h = 0.75 + rng() * 0.3;
            r += K.poly(c.fz(Z, x, x + w, y + 0.05, y + h), M(rng.pick(BKS), 0.75));
            x += w + (rng() < 0.12 ? 0.25 : 0.02);
          }
          r += K.poly(c.fz(Z, X0 + 0.2, X1 - 0.2, y - 0.08, y + 0.05), L(oakL));
        }
        return r;
      };
      s += shelfWallZ(XL + 0.2, DX0 - 1.2, ZB, 11) + shelfWallZ(DX1 + 1.2, XR - 0.2, ZB, 11);
      // doorway + the glass corridor beyond
      const door = arch(DX0, DX1, DSP, ZB);
      s += K.poly(arch(DX0 - 0.7, DX1 + 0.7, DSP, ZB), L(oak));
      {
        const GX0 = -3.6, GX1 = 5.6, GY = 9.2, G0 = ZB + 0.6, G1 = 84;
        const sky = o.id(u('gsky'));
        let g = K.defs(K.linear(sky, eve ? [[0, '#0f1626'], [0.6, '#1d2a48'], [1, '#2c3a5c']] : [[0, '#c9dae4'], [0.6, '#eef0e6'], [1, '#f4e6c8']])) + K.rect(500, 230, 300, 300, `url(#${sky})`);
        // outside, seen through both glass walls
        if (!eve) {
          g += K.path(K.blob(rng, 600, 380, 60, 36, { lobes: 6, jag: 0.3 }), L(P.ember), { opacity: 0.85 }) + K.path(K.blob(rng, 712, 372, 52, 40, { lobes: 6, jag: 0.3 }), L(P.rust), { opacity: 0.85 });
          g += K.poly(c.fy(0, GX0 - 40, GX1 + 40, G0, G1), L('#7a8a4a'));
        } else {
          g += K.poly(c.fy(0, GX0 - 40, GX1 + 40, G0, G1), '#141c2a');
          g += K.glow(o, 590, 368, 30, warm, 0.5, u('olamp')) + K.circle(590, 368, 2, '#fff1c8');
        }
        // corridor floor, ceiling, mullions
        g += K.poly(c.fy(0, GX0, GX1, G0, G1), eve ? '#3a3026' : L('#c8b896'));
        g += K.poly(c.fy(GY, GX0, GX1, G0, G1), eve ? '#2a2420' : L('#e8e2d2'));
        for (const X of [GX0, GX1]) {
          g += K.poly(c.fx(X, G0, G1, 0, 1.4), eve ? '#2a2420' : M('#8a7a62', 0.8));
          g += K.poly(c.fx(X, G0, G1, GY - 0.5, GY), eve ? '#241e1a' : M('#8a7a62', 0.8));
          for (let z = G0 + 4; z < G1; z += 4.5) g += c.line([X, 0, z], [X, GY, z], eve ? '#100c0a' : S('#6a5a48'), 1.4);
          g += c.line([X, 6.4, G0], [X, 6.4, G1], eve ? '#100c0a' : S('#6a5a48'), 1.2);
        }
        for (let z = G0 + 3; z < G1; z += 6) { const [lx, ly] = c.p(1, GY - 0.05, z); g += K.ellipse(lx, ly, c.s(z) * 0.8, c.s(z) * 0.15, eve ? '#ffe2a8' : '#f6f4ea'); if (eve) g += K.pool(o, ...c.p(1, 0, z), c.s(z) * 2.6, c.s(z) * 0.5, warm, 0.35, u('gp')); }
        // the children's library at the far end
        const fd = c.fz(G1, -1.4, 3.4, 0, 7.2);
        g += K.poly(c.fz(G1, GX0, GX1, 0, GY), eve ? '#2e2620' : M('#cfc2a4', 0.8)) + K.poly(fd, eve ? '#ffcf86' : '#f6e2b4');
        const [fx0, fy0] = fd[0], [fx1, fy1] = fd[2], fw = fx1 - fx0, fh = fy1 - fy0;
        g += K.rect(fx0 + fw * 0.1, fy0 + fh * 0.2, fw * 0.25, fh * 0.3, '#c8463a', { opacity: 0.7 }) + K.rect(fx0 + fw * 0.6, fy0 + fh * 0.15, fw * 0.28, fh * 0.25, '#2e8b8b', { opacity: 0.6 }) + K.circle(fx0 + fw * 0.5, fy0 + fh * 0.6, fw * 0.12, '#d9a441', { opacity: 0.7 });
        if (eve) g += K.glow(o, (fx0 + fx1) / 2, (fy0 + fy1) / 2, 60, warm, 0.6, u('kids'));
        s += clipTo(o, door, g);
        s += K.poly(door, eve ? '#ffffff' : '#ffffff', { opacity: eve ? 0.02 : 0.06 });
      }
      // sign over the door
      { const q = c.fz(ZB, -1.2, 3.2, 11.6, 12.5), [x0, y0] = q[0], [x1, y1] = q[2]; s += K.poly(q, M(oak, 0.7)) + T((x0 + x1) / 2, y1 - (y1 - y0) * 0.28, "CHILDREN'S LIBRARY", { size: (y1 - y0) * 0.55, anchor: 'middle', fill: L('#d9b45a'), weight: 700, len: (x1 - x0) * 0.86 }); }
      // clock above, and a QUIET PLEASE card
      s += clockFace(...c.p(1.0, 14.6, ZB), 15, eve ? 7 : 10, eve ? 52 : 25, { rim: S(oak), face: L('#efe8d6') });
      { const q = c.fz(ZB, 6.6, 9.4, 12.0, 12.9), [x0, y0] = q[0], [x1, y1] = q[2]; s += K.poly(q, L('#ece4d0')) + T((x0 + x1) / 2, y1 - (y1 - y0) * 0.3, 'QUIET PLEASE', { size: (y1 - y0) * 0.5, anchor: 'middle', fill: L('#5a2a24'), weight: 700, len: (x1 - x0) * 0.82 }); }

      /* left wall: tall arched windows with shelves between */
      const wins = [[12.6, 17.0], [20.6, 25.0], [28.6, 33.0]], WS = 3.6, WSP = 11.2;
      const archX = (z0, z1, y0, ySp, steps = 14) => {
        const zc = (z0 + z1) / 2, r = (z1 - z0) / 2, pts = [c.p(XL, y0, z0), c.p(XL, ySp, z0)];
        for (let i = 1; i < steps; i++) { const a = Math.PI - (Math.PI * i) / steps; pts.push(c.p(XL, ySp + Math.sin(a) * r, zc + Math.cos(a) * r)); }
        return pts.concat([c.p(XL, ySp, z1), c.p(XL, y0, z1)]);
      };
      // shelves on the left wall between windows
      const shelfWallX = (X, z0, z1, Y1) => {
        let r = K.poly(c.fx(X, z0, z1, 0, Y1), X < 0 ? S(oak) : M(oak, 0.75)) + K.poly(c.fx(X, z0 + 0.15, z1 - 0.15, 0.4, Y1 - 0.25), S('#22180f'));
        for (let y = 0.4; y < Y1 - 1; y += 1.25) {
          for (let z = z0 + 0.15; z < z1 - 0.2;) {
            const w = Math.min(0.35 + rng() * 1.0, z1 - 0.15 - z), h = 0.75 + rng() * 0.3;
            r += K.poly(c.fx(X, z, z + w, y + 0.05, y + h), X < 0 ? S(rng.pick(BKS)) : M(rng.pick(BKS), 0.7));
            z += w + (rng() < 0.1 ? 0.3 : 0.02);
          }
          r += K.poly(c.fx(X, z0 + 0.15, z1 - 0.15, y + 0.88, y + 1.17), S('#1a120c'), { opacity: 0.35 });
          r += K.poly(c.fx(X, z0 + 0.15, z1 - 0.15, y - 0.08, y + 0.05), X < 0 ? M(oakL, 0.5) : M(oakL, 0.85));
        }
        return r;
      };
      s += shelfWallX(XL, ZN, wins[0][0] - 0.6, 9) + shelfWallX(XL, wins[0][1] + 0.6, wins[1][0] - 0.6, 9) + shelfWallX(XL, wins[1][1] + 0.6, wins[2][0] - 0.6, 9) + shelfWallX(XL, wins[2][1] + 0.6, ZB, 9);
      wins.forEach(([z0, z1], wi) => {
        s += K.poly(archX(z0 - 0.4, z1 + 0.4, WS - 0.4, WSP), M(oak, 0.4));
        const gl = archX(z0, z1, WS, WSP);
        const gid = o.id(u('lw'));
        let out = K.defs(K.linear(gid, eve ? [[0, '#0d1424'], [0.7, '#1a2644'], [1, '#2a3656']] : [[0, '#cbdbe6'], [0.65, '#eef0e6'], [1, '#f2e2c0']])) + K.poly(gl, `url(#${gid})`);
        const [ax] = c.p(XL, 6, z0), [bx2] = c.p(XL, 6, z1), [, yb] = c.p(XL, WS + 2.5, z0);
        out += K.path(K.blob(rng, (ax + bx2) / 2, yb, Math.abs(bx2 - ax) * 0.9, 50, { lobes: 6, jag: 0.3 }), eve ? '#0a0f1a' : L(wi % 2 ? P.rust : P.ember), { opacity: 0.9 });
        if (eve) out += K.circle((ax + bx2) / 2 + 6, c.p(XL, 12, z0)[1], 1.4, '#dfe6f5', { opacity: 0.7 }) + K.circle(ax + 4, c.p(XL, 9, z0)[1], 1.1, '#dfe6f5', { opacity: 0.5 });
        s += clipTo(o, gl, out);
        const zc = (z0 + z1) / 2;
        s += c.line([XL, WS, zc], [XL, WSP + (z1 - z0) / 2, zc], M(oak, 0.5), 2.4);
        for (const y of [7.4, WSP]) s += c.line([XL, y, z0], [XL, y, z1], M(oak, 0.5), 2.2);
        s += K.poly(c.fx(XL, z0 - 0.5, z1 + 0.5, WS - 0.6, WS - 0.4), L(oakL));
        // window seat/radiator cabinet below
        s += c.box(XL, XL + 1.3, 0, WS - 0.6, z0 - 0.3, z1 + 0.3, { right: M(oak, 0.62), top: L(oakL), front: M(oak, 0.7) });
        for (let z = z0; z < z1; z += 0.35) s += c.line([XL + 1.31, 0.6, z], [XL + 1.31, WS - 1.0, z], S(oak), 1, { opacity: 0.6 });
      });

      /* right wall: floor-to-ceiling stacks + rolling ladder */
      s += shelfWallX(XR, ZN, ZB, 12.5);
      s += K.poly(c.fx(XR, ZN, ZB, 12.5, 12.75), L(oakL));
      s += c.line([XR - 0.6, 12.0, 8], [XR - 0.6, 12.0, ZB], S('#a8884a'), 1.6);
      s += c.line([XR - 0.5, 12.0, 21.2], [XR - 2.6, 0, 20.6], M(oak, 0.9), 3) + c.line([XR - 0.5, 12.0, 22.6], [XR - 2.6, 0, 22.0], M(oak, 0.9), 3);
      for (let k = 1; k < 11; k++) { const t = k / 11; s += c.line([XR - 0.5 - 2.1 * t, 12 - 12 * t, 21.2 - 0.6 * t], [XR - 0.5 - 2.1 * t, 12 - 12 * t, 22.6 - 0.6 * t], M(oak, 0.9), 2); }

      /* card catalog */
      {
        const X0 = 10.5, X1 = 14.5, Z0 = 17.2, Z1 = 19.2;
        s += c.box(X0, X1, 0, 0.8, Z0 + 0.2, Z1, { front: S(oak), left: M(oak, 0.7) });
        s += c.box(X0, X1, 0.8, 4.3, Z0, Z1, { front: M(oakL, 0.82), left: M(oakL, 0.95), top: L(oakL) });
        for (let r = 0; r < 7; r++) for (let k = 0; k < 6; k++) {
          const x0 = X0 + 0.15 + k * 0.62, y0 = 0.95 + r * 0.48;
          s += K.poly(c.fz(Z0 - 0.01, x0, x0 + 0.56, y0, y0 + 0.42), M(oakL, 0.92));
          const [px, py] = c.p(x0 + 0.28, y0 + 0.12, Z0 - 0.02);
          s += K.rect(px - 4, py - 2, 8, 3, L('#c9a24a')) + K.rect(px - 5, py - 9, 10, 5, L('#efe8d6'), { opacity: 0.85 });
        }
        s += c.box(X0 - 0.1, X1 + 0.1, 4.3, 4.45, Z0 - 0.1, Z1 + 0.1, { front: L(oak), top: L(oakL), left: L(oak) });
        // a drawer pulled out, cards standing up
        s += c.box(X0 + 1.4, X0 + 1.96, 2.86, 3.28, Z0 - 0.9, Z0, { front: M(oakL, 0.85), left: M(oakL, 0.95), top: L('#efe8d6') });
      }

      /* the long oak reading table, chairs, banker's lamps */
      const TX0 = -6.6, TX1 = -1.8, TZ0 = 8, TZ1 = 30;
      const chair = (X, Z, side) => {
        let r = c.box(X - 0.75, X + 0.75, 1.5, 1.62, Z - 0.7, Z + 0.7, { top: M(oak, 0.9), front: S(oak), left: M(oak, 0.7), right: S(oak) });
        const bx = side < 0 ? X - 0.75 : X + 0.65;
        r += c.box(bx, bx + 0.12, 1.62, 3.3, Z - 0.65, Z + 0.65, { front: M(oak, 0.7), left: M(oak, 0.85), right: S(oak), top: L(oak) });
        return r;
      };
      const tchairs = [];
      for (let z = TZ1 - 2; z > TZ0 + 1; z -= 3.6) { tchairs.push([TX0 - 0.7, z, -1]); tchairs.push([TX1 + 0.7, z, 1]); }
      tchairs.sort((a, b) => b[1] - a[1]).forEach(([X, Z, sd]) => { if (sd < 0) s += chair(X, Z, sd); });
      s += c.box(TX0 + 0.4, TX0 + 0.8, 0, 2.45, TZ1 - 1.2, TZ1 - 0.8, { front: S(oak), right: S(oak) }) + c.box(TX1 - 0.8, TX1 - 0.4, 0, 2.45, TZ1 - 1.2, TZ1 - 0.8, { front: S(oak), right: S(oak) });
      s += c.box(TX0 + 0.4, TX0 + 0.8, 0, 2.45, TZ0 + 0.8, TZ0 + 1.2, { front: S(oak), right: S(oak) }) + c.box(TX1 - 0.8, TX1 - 0.4, 0, 2.45, TZ0 + 0.8, TZ0 + 1.2, { front: S(oak), right: S(oak) });
      s += c.box(TX0, TX1, 2.45, 2.62, TZ0, TZ1, { top: L(oakL), front: M(oak, 0.75), right: M(oak, 0.6) });
      s += K.poly(c.fy(2.63, TX0 + 0.3, TX1 - 0.3, TZ0 + 0.3, TZ1 - 0.3), L('#b07a4a'), { opacity: 0.25 });
      // books and papers on the table
      s += c.box(-5.6, -4.6, 2.62, 2.78, 12.6, 13.4, { top: L('#7a2a2a'), front: S('#7a2a2a'), right: S('#7a2a2a') });
      s += K.poly(c.fy(2.63, -3.6, -2.6, 13.0, 13.8), L('#efe8d6')) + K.poly(c.fy(2.64, -3.4, -2.5, 18.2, 18.9), L('#efe8d6'));
      s += c.box(-5.4, -4.5, 2.62, 2.85, 22.5, 23.2, { top: L('#2e4a5a'), front: S('#2e4a5a'), right: S('#2e4a5a') });
      tchairs.forEach(([X, Z, sd]) => { if (sd > 0) s += chair(X, Z, sd); });
      const lamps = [11, 16.5, 22, 27.5];
      lamps.forEach((z) => {
        const X = -4.2, [bx3, by3] = c.p(X, 2.62, z), sc = c.s(z);
        s += K.ellipse(bx3, by3, sc * 0.3, sc * 0.08, L('#a8884a')) + K.rect(bx3 - sc * 0.03, by3 - sc * 0.9, sc * 0.06, sc * 0.9, L('#a8884a'));
        const [sx, sy] = c.p(X, 3.65, z);
        const shade = K.path(`M${n(sx - sc * 0.55)},${n(sy + sc * 0.2)} Q${n(sx - sc * 0.5)},${n(sy - sc * 0.22)} ${n(sx)},${n(sy - sc * 0.24)} Q${n(sx + sc * 0.5)},${n(sy - sc * 0.22)} ${n(sx + sc * 0.55)},${n(sy + sc * 0.2)} Z`, eve ? '#3f8a5e' : L(green));
        s += shade + K.path(`M${n(sx - sc * 0.4)},${n(sy - sc * 0.1)} Q${n(sx)},${n(sy - sc * 0.22)} ${n(sx + sc * 0.3)},${n(sy - sc * 0.14)}`, 'none', { stroke: '#ffffff', strokeWidth: 1.4, opacity: eve ? 0.35 : 0.3 });
        if (eve) {
          lite += K.ellipse(sx, sy + sc * 0.2, sc * 0.5, sc * 0.06, '#fff1c8');
          lite += K.pool(o, ...c.p(X, 2.63, z + 0.2), sc * 1.6, sc * 0.45, warm, 0.55, u('blp'));
          lite += K.glow(o, sx, sy + sc * 0.2, sc * 1.4, warm, 0.3, u('blg'));
        }
      });

      /* the microfiche reader on its side desk (screen toward us) */
      {
        const X0 = 3.6, X1 = 7.4, Z0 = 10.5, Z1 = 12.8;
        s += c.box(X0 + 0.1, X0 + 0.3, 0, 2.4, Z0 + 0.1, Z0 + 0.3, { front: S(oak), left: M(oak, 0.7) }) + c.box(X1 - 0.3, X1 - 0.1, 0, 2.4, Z0 + 0.1, Z0 + 0.3, { front: S(oak), left: M(oak, 0.7) });
        s += c.box(X0, X1, 2.4, 2.58, Z0, Z1, { front: M(oak, 0.8), left: L(oak), top: L(oakL) });
        const beige = '#d8ceb4';
        // wide base with the film carrier sliding out toward us, a neck, the big hooded screen
        // low base, the glass fiche carrier on top of it, a lens housing, the big hooded screen
        s += c.box(4.1, 6.9, 2.58, 2.92, 10.8, 12.6, { front: M(beige, 0.72), left: L(beige), top: L(beige) });
        s += K.poly(c.fy(2.93, 4.5, 6.3, 10.9, 11.6), L('#b9c6c8')) + K.poly(c.fy(2.94, 5.0, 5.5, 11.05, 11.4), S('#3a3a44'));
        s += c.line([6.35, 2.93, 11.1], [6.75, 3.15, 10.95], S('#2a2a2a'), 2) + K.circle(...c.p(6.78, 3.17, 10.95), 3, S('#2a2a2a'));
        s += c.box(5.0, 6.0, 2.92, 3.32, 11.7, 12.3, { front: S(beige), left: M(beige, 0.8) });
        s += c.box(4.2, 6.8, 3.32, 5.15, 11.45, 12.7, { front: M(beige, 0.8), left: L(beige), top: L('#e6dcc4') });
        s += c.box(4.1, 4.32, 3.3, 5.2, 11.0, 11.5, { front: M('#bfb59c', 0.72), left: L('#cfc5ac') }) + c.box(6.68, 6.9, 3.3, 5.2, 11.0, 11.5, { front: M('#bfb59c', 0.72), left: L('#cfc5ac') });
        s += c.box(4.1, 6.9, 5.02, 5.2, 11.0, 12.7, { front: M('#bfb59c', 0.72), bottom: S('#6a6252'), top: L('#e6dcc4'), left: L('#cfc5ac') });
        for (const kz of [3.7, 4.1]) s += K.circle(...c.p(6.9, kz, 12.1), 3.2, S('#3a3a3a'));
        const scr = c.fz(11.44, 4.42, 6.58, 3.5, 4.92);
        const [qx0, qy0] = scr[0], [qx1, qy1] = scr[2];
        s += K.poly(c.fz(11.44, 4.32, 6.68, 3.4, 5.02), S('#2e2e2e'));
        const sg = o.id(u('fiche'));
        lite += K.defs(K.linear(sg, eve ? [[0, '#eef4e6'], [1, '#c4d4ca']] : [[0, '#e2ebe1'], [1, '#b4c4bb']])) + K.poly(scr, `url(#${sg})`);
        // a projected newspaper page: masthead, a photo, columns of type
        const qw = qx1 - qx0, qh = qy1 - qy0;
        lite += K.rect(qx0 + qw * 0.08, qy0 + qh * 0.08, qw * 0.84, qh * 0.1, '#4a5a54', { opacity: 0.55 });
        lite += K.rect(qx0 + qw * 0.08, qy0 + qh * 0.24, qw * 0.4, qh * 0.34, '#5a6a64', { opacity: 0.4 });
        for (let k = 0; k < 9; k++) lite += K.rect(qx0 + qw * (k < 5 ? 0.54 : 0.08), qy0 + qh * (0.25 + (k < 5 ? k : k - 5) * 0.07 + (k < 5 ? 0 : 0.38)), qw * (k < 5 ? 0.38 : 0.84) * (0.7 + rng() * 0.3), 1.8, '#4a5a54', { opacity: 0.5 });
        lite += K.glow(o, (qx0 + qx1) / 2, (qy0 + qy1) / 2, eve ? 120 : 70, '#dff0e4', eve ? 0.4 : 0.22, u('ficheg'));
        // tent card + a reel box and a stack of film boxes
        { const q = c.fz(10.75, 3.75, 4.35, 2.58, 2.95), [x0, y0] = q[0], [x1, y1] = q[2]; s += K.poly(q, L('#efe8d6')) + T((x0 + x1) / 2, y1 - (y1 - y0) * 0.32, 'MICROFICHE', { size: (y1 - y0) * 0.32, anchor: 'middle', fill: L('#5a2a24'), weight: 700, len: (x1 - x0) * 0.86 }); }
        s += c.box(3.8, 4.15, 2.58, 3.1, 11.1, 11.5, { front: L('#e8e0cc'), left: L('#f0e8d6'), top: L('#c9bfa8') }) + c.box(6.9, 7.3, 2.58, 2.9, 11.0, 11.6, { front: L('#4a5a6a'), left: L('#5a6a7a'), top: L('#6a7a8a') });
        // chair pulled up to it
        s += c.box(4.8, 6.2, 1.5, 1.62, 8.6, 9.8, { top: M(oak, 0.9), front: S(oak), left: M(oak, 0.7) }) + c.box(4.8, 6.2, 1.62, 3.3, 8.5, 8.62, { front: M(oak, 0.7), top: L(oak) });
      }

      /* pendant lamps on long rods */
      const pend = [[-4.4, 13], [-4.4, 21], [-4.4, 29], [6.4, 15], [6.4, 24], [6.4, 32]];
      pend.forEach(([X, z]) => {
        const Yg = 11.2, [gx, gy] = c.p(X, Yg, z), sc = c.s(z);
        s += c.line([X, YC - 1, z], [X, Yg + 0.5, z], S('#3a3028'), Math.max(1, sc * 0.03));
        s += K.rect(gx - sc * 0.14, gy - sc * 0.55, sc * 0.28, sc * 0.18, L('#a8884a'));
        if (eve) {
          lite += K.glow(o, gx, gy, sc * 4.5, warm, 0.42, u('pg'));
          lite += K.circle(gx, gy, sc * 0.4, '#fff4d8') + K.circle(gx, gy - sc * 0.05, sc * 0.26, '#ffffff', { opacity: 0.8 });
        } else {
          s += K.circle(gx, gy, sc * 0.4, L('#efe9da')) + K.circle(gx + sc * 0.12, gy + sc * 0.08, sc * 0.3, M('#e2dccb', 0.85), { opacity: 0.6 });
        }
      });

      /* light */
      if (!eve) {
        const dir = [1, -0.8, -0.35];
        const toF = (Y, Z) => { const t = Y / 0.8; return c.p(XL + t, 0, Z + dir[2] * t); };
        wins.forEach(([z0, z1]) => {
          s += K.poly([toF(WS, z0), toF(WS, z1), toF(WSP, z1), toF(WSP, z0)], '#fff1cf', { opacity: 0.2 });
          const pts = [c.p(XL, WS, z0), c.p(XL, WS, z1), c.p(XL, WSP + 2, z0), c.p(XL, WSP + 2, z1), toF(WS, z0), toF(WS, z1), toF(WSP, z0), toF(WSP, z1)];
          lite += K.shaft(o, hull(pts), '#fff1cf', 0.1, u('lb'), [0, 0, 1, 0.6]);
          lite += K.glow(o, ...c.p(XL, 8, (z0 + z1) / 2), 300, '#fff6e0', 0.18, u('lwg'));
        });
        s += K.band(o, 0, 220, '#3a3024', 0.25, 0, u('lceil'));
        s += K.band(o, 640, 260, '#2a2018', 0, 0.22, u('lfloor'));
      } else {
        s += K.band(o, 0, 300, '#0e0a08', 0.55, 0, u('lceil'));
        s += K.band(o, 560, 340, '#0e0a08', 0, 0.45, u('lfloor'));
        s += K.pool(o, 0, 420, 360, 560, '#0e0a08', 0.45, u('lv')) + K.pool(o, 1600, 420, 380, 560, '#0e0a08', 0.45, u('rv'));
      }
      return s + lite;
    }
  });
})();
