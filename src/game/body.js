// Shared body-part painters used by the character art modules.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;
  const Body = (JJK.Body = {});

  // Darkened copy of a material for limbs on the far side of the body.
  Body.far = function (m, k = 0.8) {
    return {
      tones: m.tones.map((t) => [t[0] * k, t[1] * k, t[2] * k * 1.04]),
      gloss: m.gloss,
      emissive: m.emissive,
    };
  };

  Body.palette = function (def) {
    const out = {};
    for (const k in def) {
      const v = def[k];
      if (Array.isArray(v) && v.length === 4 && typeof v[0] === 'string') {
        out[k] = { tones: v.map(U.hex), gloss: 0, emissive: 0 };
      } else if (typeof v === 'string') out[k] = U.mat(v);
      else out[k] = v;
      out[k + 'F'] = Body.far(out[k]);
    }
    return out;
  };

  // point along limb A->B at fraction t, offset s (facing-space units) toward "front" (+perp)
  Body.along = function (A, B, t, s) {
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const l = Math.hypot(dx, dy) || 1;
    // perpendicular pointing "front" for a downward axis: rotate dir by +90 in y-up => (-dy, dx)
    const px = -dy / l, py = dx / l;
    return [A[0] + dx * t + px * s, A[1] + dy * t + py * s];
  };

  // Foot / shoe. ang: facing-space radians (0 = toes forward).
  Body.foot = function (P, A, ang, mat, g, style, soleCol) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pt = (u, v) => [A[0] + u * c - v * s, A[1] + u * s + v * c];
    if (style === 'sandal') {
      // bare-ish foot on a thin sole
      P.poly([pt(-4, 2), pt(4, 2.5), pt(11.5, -2), pt(12.5, -4.2), pt(-4.5, -4.2)], mat, g, { n: [0, -0.4, 0.9] });
      P.poly([pt(-5, -4), pt(13.5, -4), pt(13.5, -5.6), pt(-5, -5.6)], soleCol, g + 1, { n: [0, -0.2, 1] });
    } else {
      P.poly([pt(-4.5, 3.5), pt(3, 3.6), pt(8.5, 0.5), pt(12.5, -1.5), pt(13, -4.6), pt(-5.2, -4.6), pt(-5.6, 0)], mat, g, {
        n: [0, -0.5, 0.86],
      });
      if (soleCol) P.poly([pt(-5.4, -3.6), pt(13.2, -3.6), pt(13, -5.4), pt(-5.4, -5.4)], soleCol, g + 1, { n: [0, 0.2, 1] });
    }
  };

  // Hand painter. ang = facing-space hand direction (radians).
  Body.hand = function (P, H, ang, shape, skin, g, opts = {}) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pt = (u, v) => [H[0] + u * c - v * s, H[1] + u * s + v * c];
    const line = opts.lineCol;
    const k = opts.scale || 1;
    switch (shape) {
      case 'open':
      case 'chop': {
        // palm + fingers extended
        P.ell(pt(2.5 * k, 0), 4.2 * k, 3.6 * k, ang, skin, g);
        P.limb(pt(4 * k, 0.5 * k), pt(9.5 * k, 0.8 * k), [[0, 2.6 * k, 2.6 * k], [1, 2 * k, 2 * k]], skin, g, 1);
        P.limb(pt(2 * k, 2.5 * k), pt(5 * k, 4.6 * k), [[0, 1.5 * k, 1.5 * k], [1, 1.2 * k, 1.2 * k]], skin, g + 1, 1); // thumb
        if (line) P.line(pt(5 * k, -0.5 * k), pt(9 * k, -0.3 * k), line, g, 1, true);
        break;
      }
      case 'claw': {
        P.ell(pt(2.5 * k, 0), 4.3 * k, 3.8 * k, ang, skin, g);
        for (let i = 0; i < 3; i++) {
          const o = (i - 1) * 2.2 * k;
          const a = pt(4.5 * k, o), b = pt(8 * k, o + 0.8 * k), cc = pt(9.5 * k, o - 1.2 * k);
          P.limb(a, b, [[0, 1.3 * k, 1.3 * k], [1, 1.1 * k, 1.1 * k]], skin, g + 1, 1);
          P.limb(b, cc, [[0, 1.1 * k, 1.1 * k], [1, 0.8 * k, 0.8 * k]], skin, g + 1, 1);
        }
        P.limb(pt(1.5 * k, 2.8 * k), pt(5.5 * k, 4.8 * k), [[0, 1.4 * k, 1.4 * k], [1, 1 * k, 1 * k]], skin, g + 1, 1);
        break;
      }
      case 'point': {
        // index + middle raised (Gojo's technique hand)
        P.ell(pt(2.2 * k, -0.4 * k), 4 * k, 3.7 * k, ang, skin, g);
        P.limb(pt(4 * k, 1 * k), pt(10.5 * k, 2.2 * k), [[0, 1.5 * k, 1.5 * k], [1, 1.2 * k, 1.2 * k]], skin, g + 1, 1);
        P.limb(pt(4 * k, -0.6 * k), pt(10 * k, 0 * k), [[0, 1.5 * k, 1.5 * k], [1, 1.2 * k, 1.2 * k]], skin, g + 1, 1);
        break;
      }
      case 'sign': {
        // crossed index/middle pointing up (Unlimited Void)
        P.ell(pt(2 * k, 0), 4 * k, 3.6 * k, ang, skin, g);
        P.limb(pt(3.6 * k, 0.8 * k), pt(10.5 * k, 2.2 * k), [[0, 1.5 * k, 1.5 * k], [1, 1.2 * k, 1.2 * k]], skin, g + 1, 1);
        P.limb(pt(3.6 * k, 1.8 * k), pt(10 * k, -0.2 * k), [[0, 1.5 * k, 1.5 * k], [1, 1.2 * k, 1.2 * k]], skin, g + 2, 1);
        break;
      }
      case 'grip': {
        P.ell(pt(2.5 * k, 0), 4.6 * k, 4 * k, ang, skin, g);
        P.limb(pt(4 * k, 1.5 * k), pt(7 * k, -1.5 * k), [[0, 2.2 * k, 2.2 * k], [1, 1.8 * k, 1.8 * k]], skin, g + 1, 1);
        break;
      }
      default: {
        // fist: chunky rounded block with knuckles + thumb
        P.limb(pt(0.2 * k, 0), pt(4.6 * k, 0.2 * k), [[0, 3.6 * k, 3.9 * k], [0.5, 4.5 * k, 4.6 * k], [1, 4.2 * k, 4.3 * k]], skin, g, 1);
        P.limb(pt(1.2 * k, 3.0 * k), pt(5.2 * k, 3.2 * k), [[0, 1.7 * k, 1.7 * k], [1, 1.4 * k, 1.4 * k]], skin, g + 1, 1); // thumb
        P.line(pt(5.9 * k, 1.8 * k), pt(6.3 * k, -2.4 * k), U.pack(...skin.tones[1]), g, 1, true);
      }
    }
  };

  // Anime-style head base in 3/4 view: cranium + face profile + ear.
  // L(u,v) maps head-local coords (u forward, v up) to facing space.
  Body.head = function (P, L, a, skin, g, lineCol, shapeK = 0) {
    P.ell(L(-1.2, 2.2), 9.8, 10.4, a, skin, g);
    const sharp = shapeK; // 0 = Gojo (refined), 1 = Sukuna (heavier jaw)
    const face = [
      [6.0, 7.4], [8.4, 4.6], [8.9, 2.4], [8.5, 0.8], [9.4, -1.2], [11.1, -3.6], [9.6, -4.3], [9.5, -5.5],
      [9.9, -6.1], [9.3, -6.9], [9.6, -7.6], [9.2, -9.6 - sharp * 0.4], [7.4, -11.5 - sharp * 0.2],
      [3.6, -11.0 + sharp * 0.2], [-2.4, -6.4 + sharp * 0.4], [-5.2, -2.6], [-5.6, 4],
    ].map((q) => L(q[0], q[1]));
    const sc = L(1.5, -0.5);
    P.poly(face, skin, g, { sphere: [sc[0], sc[1], 12.5] });
    // ear
    P.ell(L(-3.0, -1.0), 2.0, 3.0, a, skin, g + 1);
    if (lineCol) {
      P.line(L(-3.3, 0.6), L(-2.6, -2.4), lineCol, g + 1, 1, true);
      // nostril + cheekbone hint
      P.dot(L(9.6, -4.0), lineCol, g, true);
    }
    // jaw shadow
    P.line(L(6.6, -11.0), L(0.2, -8.6), U.pack(...skin.tones[1]), g, 1, true);
    P.line(L(4.8, -2.8), L(6.6, -4.6), U.pack(...skin.tones[1]), g, 1, true);
  };

  // Simple dangling cloth strip (belt tails, sash ends).
  // root: facing-space anchor, dir: base direction (facing space), off: secondary offset [x,y]
  Body.strip = function (P, root, len, w0, w1, off, mat, g, bendK = 1) {
    const segs = 3;
    let prev = root;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = [root[0] + off[0] * t * t * bendK, root[1] - len * t + off[1] * t * t * bendK];
      P.limb(prev, p, [[0, U.lerp(w0, w1, (i - 1) / segs), U.lerp(w0, w1, (i - 1) / segs)], [1, U.lerp(w0, w1, t), U.lerp(w0, w1, t)]], mat, g, 1);
      prev = p;
    }
  };
})();
