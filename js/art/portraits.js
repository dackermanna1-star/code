/* What Derry Keeps — portrait system.
 * One shared head geometry and expression rig for the whole cast; each
 * character supplies skin, face tweaks, hair, clothing and accessories.
 * Canvas 600x900, waist-up, key light from the upper left (shadows fall
 * on the viewer's right). See docs/ART_DIRECTION.md. */
(function () {
  'use strict';
  const K = window.KIT, n = K.n;
  const P = {};
  window.PORTRAIT = P;

  /* ---------------- expressions ----------------
   * brow: lift (px up), tilt (+ = inner ends down/angry, - = inner up/sad),
   *       asym (+ raises viewer-left brow / lowers right)
   * eye: open (1 normal), look [x,y], happy (closed arcs), pupil scale
   * mouth: shape key; blush 0..1; tears */
  P.EXPR = {
    neutral:   { brow: { lift: 0, tilt: 0 }, eye: { open: 1 }, mouth: 'neutral' },
    smile:     { brow: { lift: 2, tilt: -1 }, eye: { open: 0.82 }, mouth: 'smile', blush: 0.25 },
    grin:      { brow: { lift: 5, tilt: -2 }, eye: { open: 0.72 }, mouth: 'grin', blush: 0.3 },
    laugh:     { brow: { lift: 7, tilt: -3 }, eye: { open: 0, happy: true }, mouth: 'laugh', blush: 0.4 },
    sad:       { brow: { lift: 4, tilt: -9 }, eye: { open: 0.72, look: [0, 4] }, mouth: 'frown' },
    angry:     { brow: { lift: -7, tilt: 11 }, eye: { open: 0.78 }, mouth: 'tight' },
    surprised: { brow: { lift: 13, tilt: -2 }, eye: { open: 1.22, pupil: 0.85 }, mouth: 'o' },
    afraid:    { brow: { lift: 10, tilt: -10 }, eye: { open: 1.2, pupil: 0.7 }, mouth: 'grimace' },
    worried:   { brow: { lift: 6, tilt: -8 }, eye: { open: 0.95, look: [-3, 1] }, mouth: 'wobble' },
    thinking:  { brow: { lift: 3, tilt: 2, asym: 7 }, eye: { open: 0.85, look: [7, -4] }, mouth: 'pursed' },
    smirk:     { brow: { lift: 1, tilt: 3, asym: -5 }, eye: { open: 0.78, look: [3, 0] }, mouth: 'smirk' },
    flat:      { brow: { lift: -3, tilt: 1 }, eye: { open: 0.58 }, mouth: 'line' },
    blush:     { brow: { lift: 4, tilt: -5 }, eye: { open: 0.8, look: [-7, 4] }, mouth: 'smallsmile', blush: 1 },
    cry:       { brow: { lift: 6, tilt: -13 }, eye: { open: 0.5, look: [0, 3] }, mouth: 'cry', tears: true, blush: 0.5 }
  };

  const CX = 300;

  /* Face outline for a spec. */
  P.facePath = (f) => {
    const jw = f.jaw || 1, cl = f.chin || 0, tw = f.top || 1, ch = f.cheek || 0;
    const xr = (dx, k) => CX + dx * k, xl = (dx, k) => CX - dx * k;
    const chinY = 410 + cl;
    return `M300,126 C${n(xr(52, tw))},126 ${n(xr(88, tw))},158 ${n(xr(90, tw))},214 ` +
      `C${n(xr(92 + ch, 1))},262 ${n(xr(90 + ch, jw))},300 ${n(xr(80, jw))},332 ` +
      `C${n(xr(68, jw))},${n(368 + cl * 0.6)} ${n(xr(40, jw))},${n(chinY - 8)} 300,${n(chinY)} ` +
      `C${n(xl(40, jw))},${n(chinY - 8)} ${n(xl(68, jw))},${n(368 + cl * 0.6)} ${n(xl(80, jw))},332 ` +
      `C${n(xl(90 + ch, jw))},300 ${n(xl(92 + ch, 1))},262 ${n(xl(90, tw))},214 ` +
      `C${n(xl(88, tw))},158 ${n(xl(52, tw))},126 300,126 Z`;
  };

  /* ---------- features ---------- */
  function eye(o, spec, side, ex, blinkClosed) {
    const e = spec.eyes || {};
    const size = e.size || 1, gap = 38 * (e.spacing || 1);
    const cx = CX + side * gap, cy = 284 + (e.y || 0);
    const a = 23 * size, h = 12.6 * size;
    const k = blinkClosed ? 0 : (ex.eye.open !== undefined ? ex.eye.open : 1) * (1 - (e.lid || 0) * 0.25);
    const tilt = (e.tilt || 0);
    const ix = cx - side * a, ox = cx + side * a; // inner / outer corners
    const iy = cy + tilt * 0.2, oy = cy - tilt;
    const ink = e.lash || '#2a1d1a';
    const skS = spec.skin.shadow;
    let s = '';
    if (ex.eye.happy && !blinkClosed) {
      // closed happy eye: an upward arch
      s += `<path d="M${n(ix)},${n(iy + 2)} Q${n(cx)},${n(cy - h * 1.3)} ${n(ox)},${n(oy + 2)}" fill="none" stroke="${ink}" stroke-width="3.6" stroke-linecap="round"/>`;
      return s;
    }
    if (k < 0.08) {
      // closed (blink / asleep): gentle downward curve with lashes
      s += `<path d="M${n(ix)},${n(iy)} Q${n(cx)},${n(cy + h * 0.55)} ${n(ox)},${n(oy)}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`;
      if (e.lashes) s += `<path d="M${n(ox)},${n(oy)} l${n(side * 6)},-2" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
      return s;
    }
    const up = h * k * 1.25, lo = h * Math.min(1, k) * 0.62;
    const upper = `M${n(ix)},${n(iy)} C${n(ix + side * a * 0.28)},${n(cy - up)} ${n(ox - side * a * 0.38)},${n(cy - up * 1.02)} ${n(ox)},${n(oy)}`;
    const lower = `C${n(ox - side * a * 0.3)},${n(cy + lo)} ${n(ix + side * a * 0.38)},${n(cy + lo * 0.95)} ${n(ix)},${n(iy)}`;
    const clip = o.id('eye' + side);
    s += `<clipPath id="${clip}"><path d="${upper} ${lower} Z"/></clipPath>`;
    s += `<path d="${upper} ${lower} Z" fill="${e.white || '#f3ede3'}"/>`;
    const look = ex.eye.look || [0, 0];
    const ir = 10.4 * size * (e.iris || 1), px = cx + look[0] * size * 0.9 + side * -1.2, py = cy + look[1] * size * 0.8 + h * 0.08;
    s += `<g clip-path="url(#${clip})">` +
      `<circle cx="${n(px)}" cy="${n(py)}" r="${n(ir)}" fill="${e.color || '#6b5a48'}"/>` +
      `<circle cx="${n(px)}" cy="${n(py)}" r="${n(ir)}" fill="none" stroke="${K.adj(e.color || '#6b5a48', -0.45)}" stroke-width="1.6"/>` +
      `<circle cx="${n(px)}" cy="${n(py)}" r="${n(ir * 0.46 * (ex.eye.pupil || 1))}" fill="#16110f"/>` +
      `<circle cx="${n(px - ir * 0.32)}" cy="${n(py - ir * 0.38)}" r="${n(ir * 0.24)}" fill="#ffffff" opacity="0.92"/>` +
      `<circle cx="${n(px + ir * 0.35)}" cy="${n(py + ir * 0.3)}" r="${n(ir * 0.1)}" fill="#ffffff" opacity="0.6"/>` +
      // upper lid shadow on the eyeball
      `<path d="${upper} L${n(ox)},${n(oy - 30)} L${n(ix)},${n(iy - 30)} Z" fill="${skS}" opacity="0.25" transform="translate(0,${n(3.2 * size)})"/>` +
      `</g>`;
    // lash line, crease, lower lid
    s += `<path d="${upper}" fill="none" stroke="${ink}" stroke-width="${n(3.4 * size)}" stroke-linecap="round"/>`;
    if (e.lashes) s += `<path d="M${n(ox - side * 3)},${n(oy - 1)} q${n(side * 6)},-2 ${n(side * 9)},-6" fill="none" stroke="${ink}" stroke-width="${n(2.4 * size)}" stroke-linecap="round"/>`;
    s += `<path d="M${n(ix + side * 3)},${n(iy - 6 - up * 0.3)} C${n(ix + side * a * 0.4)},${n(cy - up - 7)} ${n(ox - side * a * 0.3)},${n(cy - up - 8)} ${n(ox + side * 1)},${n(oy - 5)}" fill="none" stroke="${skS}" stroke-width="1.6" opacity="${e.lid ? 0.85 : 0.55}"/>`;
    s += `<path d="M${n(ox - side * 2)},${n(oy + 2)} ${lower.replace(/^C/, 'C')}" fill="none" stroke="${skS}" stroke-width="1.3" opacity="0.45"/>`;
    if (e.bags) s += `<path d="M${n(ix + side * 2)},${n(iy + lo + 5)} Q${n(cx)},${n(cy + lo + 11)} ${n(ox - side * 2)},${n(oy + lo + 3)}" fill="none" stroke="${skS}" stroke-width="1.6" opacity="${n(0.35 + e.bags * 0.4)}"/>`;
    if (spec.age && spec.age > 0.5) s += `<path d="M${n(ox + side * 5)},${n(oy + 2)} l${n(side * 7)},-4 M${n(ox + side * 5)},${n(oy + 6)} l${n(side * 8)},1" fill="none" stroke="${skS}" stroke-width="1.3" opacity="0.6"/>`;
    return s;
  }

  function brow(spec, side, ex) {
    const b = spec.brows || {}, e = spec.eyes || {};
    const gap = 38 * (e.spacing || 1), cx = CX + side * gap;
    const lift = ex.brow.lift + (ex.brow.asym || 0) * (side < 0 ? 1 : -1);
    const by = 254 + (b.y || 0) + (e.y || 0) - lift;
    const len = 25 * (b.len || 1), th = 6.5 * (b.thick || 1);
    const xi = cx - side * (len * 0.92), xo = cx + side * len * 1.05;
    const yi = by + ex.brow.tilt * 0.55 + 2, yo = by - ex.brow.tilt * 0.25 + 3;
    const arch = 6 * (b.arch !== undefined ? b.arch : 1);
    const xm = cx + side * len * 0.25, ym = Math.min(yi, yo) - arch;
    return `<path d="M${n(xi)},${n(yi - th / 2)} Q${n(xm)},${n(ym - th * 0.55)} ${n(xo)},${n(yo - th * 0.2)} L${n(xo + side * 1)},${n(yo + th * 0.15)} Q${n(xm)},${n(ym + th * 0.5)} ${n(xi)},${n(yi + th / 2)} Z" fill="${b.color || '#3a2a22'}"/>`;
  }

  function nose(spec) {
    const ns = spec.nose || {}, k = ns.size || 1, w = ns.width || 1;
    const sk = spec.skin.shadow;
    const ty = 336 + (ns.y || 0);
    let s = `<path d="M${n(306)},${n(292)} C${n(310 + 4 * w)},${n(312)} ${n(312 + 6 * w)},${n(ty - 8 * k)} ${n(309 + 4 * w)},${n(ty)} C${n(305)},${n(ty + 4)} ${n(300)},${n(ty + 3)} ${n(296)},${n(ty + 2)} C${n(302)},${n(ty - 2)} ${n(305)},${n(318)} 306,292 Z" fill="${sk}" opacity="0.38"/>`;
    s += `<path d="M${n(291 - 4 * w)},${n(ty)} q${n(4)},${n(4)} ${n(9)},${n(1.5)}" fill="none" stroke="${sk}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
    s += `<path d="M${n(305)},${n(ty + 1.5)} q${n(4 + 3 * w)},${n(2)} ${n(8 + 4 * w)},${n(-2)}" fill="none" stroke="${sk}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
    return s;
  }

  function mouth(spec, ex) {
    const m = spec.mouth || {};
    const mw = 21 * (m.width || 1), my = 368 + (m.y || 0) + (spec.face && spec.face.chin ? spec.face.chin * 0.45 : 0);
    const lip = m.lip || K.mix(spec.skin.base, '#b85a55', 0.45);
    const line = m.line || K.adj(lip, -0.5);
    const dark = '#4a2226', teeth = '#f2ebde', tongue = '#c0625a';
    const L = 300 - mw, R = 300 + mw;
    const stroke = (d, w = 2.8, c = line) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
    const lowerLip = (y, w = 0.55, op = 0.5) => `<path d="M${n(300 - mw * w)},${n(y)} Q300,${n(y + 5)} ${n(300 + mw * w)},${n(y)}" fill="none" stroke="${spec.skin.shadow}" stroke-width="2.4" stroke-linecap="round" opacity="${op}"/>`;
    const fullLip = (m.full || 0.4);
    const lipFill = (y0, y1, w) => `<path d="M${n(300 - mw * w)},${n(y0)} Q300,${n(y1 + 2)} ${n(300 + mw * w)},${n(y0)} Q300,${n(y0 + 1)} ${n(300 - mw * w)},${n(y0)} Z" fill="${lip}" opacity="${n(0.35 + fullLip * 0.5)}"/>`;
    switch (ex.mouth) {
      case 'smile': return lipFill(my + 3, my + 11, 0.62) + stroke(`M${n(L - 2)},${n(my - 3)} Q300,${n(my + 10)} ${n(R + 2)},${n(my - 3)}`) + `<path d="M${n(L - 6)},${n(my - 7)} q-3,4 0,9 M${n(R + 6)},${n(my - 7)} q3,4 0,9" fill="none" stroke="${spec.skin.shadow}" stroke-width="1.6" opacity="0.5"/>`;
      case 'smallsmile': return lipFill(my + 2, my + 9, 0.5) + stroke(`M${n(300 - mw * 0.62)},${n(my)} Q300,${n(my + 6)} ${n(300 + mw * 0.62)},${n(my - 1)}`);
      case 'grin': {
        const d = `M${n(L - 3)},${n(my - 4)} Q300,${n(my - 1)} ${n(R + 3)},${n(my - 4)} Q${n(300 + mw * 0.7)},${n(my + 19)} 300,${n(my + 20)} Q${n(300 - mw * 0.7)},${n(my + 19)} ${n(L - 3)},${n(my - 4)} Z`;
        return `<path d="${d}" fill="${dark}"/><clipPath id="mclip${spec._k}"><path d="${d}"/></clipPath><g clip-path="url(#mclip${spec._k})"><rect x="${L - 4}" y="${my - 6}" width="${mw * 2 + 8}" height="11" fill="${teeth}"/><ellipse cx="300" cy="${my + 20}" rx="${mw * 0.55}" ry="7" fill="${tongue}"/></g>` + stroke(d, 2.2) + lowerLip(my + 24, 0.4, 0.45);
      }
      case 'laugh': {
        const d = `M${n(L - 4)},${n(my - 5)} Q300,${n(my - 2)} ${n(R + 4)},${n(my - 5)} Q${n(300 + mw * 0.75)},${n(my + 26)} 300,${n(my + 28)} Q${n(300 - mw * 0.75)},${n(my + 26)} ${n(L - 4)},${n(my - 5)} Z`;
        return `<path d="${d}" fill="${dark}"/><clipPath id="mclip${spec._k}"><path d="${d}"/></clipPath><g clip-path="url(#mclip${spec._k})"><rect x="${L - 4}" y="${my - 7}" width="${mw * 2 + 8}" height="10" fill="${teeth}"/><ellipse cx="300" cy="${my + 27}" rx="${mw * 0.62}" ry="10" fill="${tongue}"/></g>` + stroke(d, 2.2);
      }
      case 'frown': return lipFill(my + 3, my + 8, 0.5) + stroke(`M${n(L + 2)},${n(my + 5)} Q300,${n(my - 4)} ${n(R - 2)},${n(my + 5)}`) + lowerLip(my + 11, 0.4, 0.4);
      case 'tight': return stroke(`M${n(300 - mw * 0.82)},${n(my + 3)} Q300,${n(my)} ${n(300 + mw * 0.82)},${n(my + 3)}`, 3.2) + lowerLip(my + 8, 0.4, 0.45);
      case 'o': return `<ellipse cx="300" cy="${my + 5}" rx="${n(mw * 0.36)}" ry="9" fill="${dark}"/><ellipse cx="300" cy="${my + 5}" rx="${n(mw * 0.36)}" ry="9" fill="none" stroke="${lip}" stroke-width="3"/>`;
      case 'grimace': {
        const d = `M${n(L - 4)},${n(my + 3)} Q300,${n(my - 5)} ${n(R + 4)},${n(my + 3)} Q300,${n(my + 15)} ${n(L - 4)},${n(my + 3)} Z`;
        return `<path d="${d}" fill="${teeth}"/>` + `<path d="M${n(L)},${n(my + 3)} Q300,${n(my + 6)} ${n(R)},${n(my + 3)}" stroke="${K.adj(teeth, -0.25)}" stroke-width="1.4" fill="none"/>` + stroke(d, 2.4);
      }
      case 'wobble': return lipFill(my + 3, my + 8, 0.45) + stroke(`M${n(300 - mw * 0.8)},${n(my + 2)} q${n(mw * 0.4)},-4 ${n(mw * 0.8)},0 t${n(mw * 0.8)},0`);
      case 'pursed': return `<ellipse cx="${n(306)}" cy="${my + 3}" rx="${n(mw * 0.38)}" ry="5" fill="${lip}" opacity="0.8"/>` + stroke(`M${n(306 - mw * 0.36)},${n(my + 2)} Q306,${n(my + 4)} ${n(306 + mw * 0.36)},${n(my + 1)}`, 2.4);
      case 'smirk': return lipFill(my + 3, my + 9, 0.5) + stroke(`M${n(300 - mw * 0.8)},${n(my + 3)} Q${n(304)},${n(my + 5)} ${n(R + 2)},${n(my - 6)}`) + `<path d="M${n(R + 6)},${n(my - 9)} q3,4 0,9" fill="none" stroke="${spec.skin.shadow}" stroke-width="1.6" opacity="0.55"/>`;
      case 'line': return stroke(`M${n(300 - mw * 0.76)},${n(my + 2)} L${n(300 + mw * 0.76)},${n(my + 2)}`, 3) + lowerLip(my + 8, 0.35, 0.35);
      case 'cry': {
        const d = `M${n(L + 2)},${n(my + 6)} Q300,${n(my - 4)} ${n(R - 2)},${n(my + 6)} Q300,${n(my + 18)} ${n(L + 2)},${n(my + 6)} Z`;
        return `<path d="${d}" fill="${dark}"/>` + stroke(d, 2.2);
      }
      default: return lipFill(my + 3, my + 9, 0.55) + stroke(`M${n(L)},${n(my + 1)} Q300,${n(my + 3.5)} ${n(R)},${n(my + 1)}`, 2.6) + lowerLip(my + 9);
    }
  }

  /* Shared neck with shadow under the jaw. */
  P.neck = (spec, { w = 1, len = 0 } = {}) => {
    const b = spec.skin.base, sh = spec.skin.shadow;
    const hw = 36 * w;
    return `<path d="M${n(300 - hw)},372 L${n(300 - hw - 3)},${n(470 + len)} Q300,${n(492 + len)} ${n(300 + hw + 3)},${n(470 + len)} L${n(300 + hw)},372 Z" fill="${b}"/>` +
      `<path d="M${n(300 - hw)},380 Q300,${n(436)} ${n(300 + hw)},372 L${n(300 + hw + 3)},${n(470 + len)} Q${n(300 + hw * 0.4)},${n(482 + len)} ${n(300 - hw * 0.2)},${n(478 + len)} Z" fill="${sh}"/>`;
  };

  /* Build the head: face with cel shading, ears, features, blink layer. */
  P.head = (o, spec, ex) => {
    const sk = spec.skin;
    const face = P.facePath(spec.face || {});
    const fclip = o.id('face');
    let s = `<clipPath id="${fclip}"><path d="${face}"/></clipPath>`;
    // ears
    const ey = spec.ears && spec.ears.y || 0;
    const fw = (spec.face && spec.face.top) || 1;
    s += `<path d="M${n(300 + 86 * fw)},${266 + ey} C${n(300 + 104 * fw)},${258 + ey} ${n(300 + 110 * fw)},${282 + ey} ${n(300 + 104 * fw)},${300 + ey} C${n(300 + 99 * fw)},${316 + ey} ${n(300 + 90 * fw)},${322 + ey} ${n(300 + 82 * fw)},${316 + ey} Z" fill="${sk.shadow}"/>`;
    s += `<path d="M${n(300 - 86 * fw)},${266 + ey} C${n(300 - 104 * fw)},${258 + ey} ${n(300 - 110 * fw)},${282 + ey} ${n(300 - 104 * fw)},${300 + ey} C${n(300 - 99 * fw)},${316 + ey} ${n(300 - 90 * fw)},${322 + ey} ${n(300 - 82 * fw)},${316 + ey} Z" fill="${sk.base}"/>`;
    s += `<path d="M${n(300 - 92 * fw)},${276 + ey} q-8,8 -2,22" fill="none" stroke="${sk.shadow}" stroke-width="2" opacity="0.7"/>`;
    // face: shadow color, lit face offset up-left on top = crescent shadow on the right and jaw
    s += `<path d="${face}" fill="${sk.shadow}"/>`;
    s += `<g clip-path="url(#${fclip})"><path d="${face}" fill="${sk.base}" transform="translate(-15,-9) scale(1.0)"/>`;
    // subtle warm cheek zones + cast shadow from hair fringe
    if (spec.hairShadow) s += `<path d="${spec.hairShadow}" fill="${sk.shadow}" opacity="0.9"/>`;
    const blush = Math.max(spec.blush || 0, ex.blush || 0);
    if (blush > 0) {
      const bc = sk.blush || '#d8786a';
      s += `<ellipse cx="248" cy="330" rx="26" ry="13" fill="${bc}" opacity="${n(0.12 + blush * 0.32)}"/><ellipse cx="352" cy="330" rx="26" ry="13" fill="${bc}" opacity="${n(0.12 + blush * 0.32)}"/>`;
    }
    if (spec.freckles) {
      const r = K.rng('freckles' + spec.name);
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1, fx = 300 + side * (14 + r() * 48), fy = 300 + r() * 34 - Math.abs(fx - 300) * 0.08;
        s += `<circle cx="${n(fx)}" cy="${n(fy)}" r="${n(1 + r() * 1.3)}" fill="${sk.freckle || K.adj(sk.shadow, -0.15)}" opacity="${n(0.45 + r() * 0.35)}"/>`;
      }
    }
    if (spec.age && spec.age > 0.3) {
      // nasolabial folds + forehead lines scale with age
      const a = spec.age;
      s += `<path d="M276,338 Q262,360 268,382 M324,338 Q338,360 332,382" fill="none" stroke="${sk.shadow}" stroke-width="${n(1.4 + a)}" opacity="${n(0.25 + a * 0.4)}"/>`;
      if (a > 0.6) s += `<path d="M258,214 Q300,206 342,214 M266,228 Q300,222 334,228" fill="none" stroke="${sk.shadow}" stroke-width="1.5" opacity="${n(a * 0.45)}"/>` +
        `<path d="M272,396 Q300,404 328,396" fill="none" stroke="${sk.shadow}" stroke-width="1.5" opacity="0.4"/>`;
    }
    if (spec.stubble) s += `<path d="M228,340 C240,390 270,412 300,414 C330,412 360,390 372,340 C350,372 330,392 300,394 C270,392 250,372 228,340 Z" fill="${spec.stubble}" opacity="0.28"/>`;
    s += `</g>`;
    // features
    spec._k = o.id('k');
    s += nose(spec);
    s += mouth(spec, ex);
    if (spec.marks) s += spec.marks;
    s += brow(spec, -1, ex) + brow(spec, 1, ex);
    // eyes: open set + closed set for blinking (engine toggles .blink)
    s += `<g class="eyes-open">${eye(o, spec, -1, ex, false)}${eye(o, spec, 1, ex, false)}</g>`;
    if (!ex.eye.happy) s += `<g class="eyes-closed">${eye(o, spec, -1, ex, true)}${eye(o, spec, 1, ex, true)}</g>`;
    if (ex.tears) s += `<path d="M262,300 q-6,30 -2,62 M338,300 q6,30 2,62" fill="none" stroke="#dcecf5" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`;
    return s;
  };

  /* Assemble a full portrait. Hooks are functions (o, ex, spec) -> markup,
   * drawn in this order:
   *   hairBack  (head-scaled)  hair mass behind the head
   *   body                     torso + clothing
   *   behind                   things between clothing and neck (headphone band)
   *   [neck]
   *   collar                   collars/scarves/hair over the shoulders
   *   [head]   (head-scaled)   face, features, blink layer; spec.marks adds face details
   *   hairFront (head-scaled)  hair in front of the face
   *   headwear  (head-scaled)  glasses, earrings, hats, headbands
   *   front                    anything over the chest (headphones, notebook, pins)
   * spec.headScale (default 1.06) scales the head group about the neck base. */
  P.draw = (o, spec) => {
    const ex = P.EXPR[o.expr] || P.EXPR.neutral;
    const hs = spec.headScale || 1.06;
    const tf = `translate(300 470) scale(${hs}) translate(-300 -470)`;
    let s = '';
    if (spec.hairBack) s += `<g transform="${tf}">${spec.hairBack(o, ex, spec)}</g>`;
    if (spec.body) s += spec.body(o, ex, spec);
    if (spec.behind) s += spec.behind(o, ex, spec);
    s += P.neck(spec, spec.neck || {});
    if (spec.collar) s += spec.collar(o, ex, spec);
    s += `<g transform="${tf}">${P.head(o, spec, ex)}${spec.hairFront ? spec.hairFront(o, ex, spec) : ''}${spec.headwear ? spec.headwear(o, ex, spec) : ''}</g>`;
    if (spec.front) s += spec.front(o, ex, spec);
    return `<g class="portrait">${s}</g>`;
  };

  /* Clothing helper: a torso silhouette (shoulders + hanging arms). */
  P.torso = ({ sw = 190, drop = 0, top = 444, fill, shadow, neckW = 36 } = {}) => {
    const L = 300 - sw, R = 300 + sw;
    const d = `M${n(300 - neckW)},${top} C${n(300 - neckW - 40)},${top + 8} ${n(L + 40)},${n(top + 14 + drop)} ${n(L + 6)},${n(top + 48 + drop)} C${n(L - 14)},${n(top + 90 + drop)} ${n(L - 18)},${top + 220} ${n(L - 22)},920 L${n(R + 22)},920 C${n(R + 18)},${top + 220} ${n(R + 14)},${n(top + 90 + drop)} ${n(R - 6)},${n(top + 48 + drop)} C${n(R - 40)},${n(top + 14 + drop)} ${n(300 + neckW + 40)},${top + 8} ${n(300 + neckW)},${top} Z`;
    return `<path d="${d}" fill="${fill}"/>` + (shadow ? `<path d="M${n(300 + neckW * 0.6)},${top + 30} C${n(R - 60)},${top + 40} ${n(R - 10)},${n(top + 70 + drop)} ${n(R + 4)},${n(top + 120 + drop)} L${n(R + 22)},920 L${n(R - 70)},920 C${n(R - 80)},${top + 300} ${n(R - 90)},${top + 120} ${n(300 + neckW * 0.6)},${top + 30} Z" fill="${shadow}"/>` : '');
  };

  /* ================================================================== */
  /* GUS — Augusta Brennan, 14 */
  const gus = {
    name: 'Gus',
    skin: { base: '#f0c9a6', shadow: '#d39d7c', blush: '#de7f6c', freckle: '#b9714f' },
    face: { jaw: 0.98, chin: 0, top: 1 },
    eyes: { color: '#7c8c74', size: 1.0, lashes: true, lash: '#2b1d17' },
    brows: { color: '#4a3024', thick: 1.0, arch: 0.8 },
    nose: { size: 1, width: 0.9 },
    mouth: { width: 0.95, lip: '#c98272', full: 0.45 },
    freckles: true,
    hairShadow: 'M206,236 C224,214 252,204 282,204 C320,204 356,218 384,246 L396,276 C372,250 340,232 300,230 C266,230 236,244 214,262 Z',
    hairBack(o) {
      const hs = '#3a2419';
      // pulled back: mass behind the skull, tapering to the nape
      return `<path d="M198,270 C186,176 238,100 304,98 C372,98 418,166 406,270 C402,304 392,322 380,334 L222,334 C208,320 200,300 198,270 Z" fill="${hs}"/>`;
    },
    hairFront(o) {
      const h = '#5a3a2a', hs = '#3f281d', hl = '#7d5539';
      let s = '';
      // cap + side-swept fringe as one mass, fringe edge sweeping down to the viewer's right
      s += `<path d="M203,300 C194,226 204,150 250,116 C282,96 332,96 364,112 C400,132 414,194 406,268 L404,304 C398,276 392,254 382,240 C364,216 334,202 300,200 C276,200 256,206 240,216 C230,224 222,238 218,256 C214,272 211,288 209,302 Z" fill="${h}"/>`;
      // shadow side of the head
      s += `<path d="M364,112 C400,132 414,194 406,268 L404,304 C398,276 392,254 382,240 C376,206 366,170 344,140 C352,128 358,118 364,112 Z" fill="${hs}"/>`;
      // the part, and strands sweeping from it across the forehead
      s += `<path d="M262,112 C258,140 256,170 262,196" fill="none" stroke="${hs}" stroke-width="2.4" opacity="0.7"/>`;
      s += `<path d="M266,118 C306,124 346,150 372,196 C356,172 330,152 300,144 C288,140 276,134 266,118 Z" fill="${hl}" opacity="0.75"/>`;
      s += `<path d="M262,150 C298,154 334,174 360,214 M258,176 C292,178 326,196 350,224" fill="none" stroke="${hs}" stroke-width="2" opacity="0.55"/>`;
      // loose strands framing the face
      s += `<path d="M216,250 C204,284 204,322 214,354 C214,320 218,292 228,266 Z" fill="${h}"/>`;
      s += `<path d="M386,246 C400,282 400,322 390,356 C390,322 386,294 376,268 Z" fill="${hs}"/>`;
      s += `<path d="M372,214 C380,232 384,252 382,272 C376,252 368,236 358,224 Z" fill="${h}"/>`;
      return s;
    },
    body(o, ex) {
      const jk = '#66704a', jkS = '#4b5236', jkD = '#3c4229', tee = '#7b3138', teeS = '#5e242a';
      let s = P.torso({ sw: 192, drop: 16, top: 444, fill: jk, shadow: jkS, neckW: 40 });
      // tee showing between open jacket fronts
      s += `<path d="M262,456 Q300,474 338,456 L352,920 L248,920 Z" fill="${tee}"/>`;
      s += `<path d="M300,470 Q322,468 338,458 L352,920 L310,920 Z" fill="${teeS}"/>`;
      s += `<path d="M266,560 h68 v40 h-68 Z" fill="#e9dfc8" opacity="0.18"/><path d="M276,572 h48 M276,584 h36" stroke="#e9dfc8" stroke-width="3" opacity="0.25"/>`;
      // jacket fronts / lapels
      s += `<path d="M262,454 C246,520 240,640 246,920 L190,920 C192,760 200,600 214,520 C226,486 240,466 262,454 Z" fill="${jk}"/>`;
      s += `<path d="M338,454 C354,520 360,640 354,920 L410,920 C408,760 400,600 386,520 C374,486 360,466 338,454 Z" fill="${jkS}"/>`;
      // collar
      s += `<path d="M258,446 L226,478 L250,520 L272,470 Z" fill="${jkS}"/><path d="M342,446 L374,478 L350,520 L328,470 Z" fill="${jkD}"/>`;
      // chest pockets with flaps + buttons
      s += `<path d="M168,610 h72 v70 h-72 Z" fill="${jkS}" opacity="0.6"/><path d="M164,600 h80 l-4,22 h-72 Z" fill="${jkD}"/><circle cx="204" cy="616" r="3.5" fill="#2c2f20"/>`;
      s += `<path d="M360,610 h72 v70 h-72 Z" fill="${jkD}" opacity="0.6"/><path d="M356,600 h80 l-4,22 h-72 Z" fill="${jkD}"/><circle cx="396" cy="616" r="3.5" fill="#25281b"/>`;
      // shoulder patch (a cassette) and sleeve seams
      s += `<rect x="128" y="540" width="56" height="36" rx="4" fill="#d9a441" transform="rotate(-8 156 558)"/><rect x="138" y="550" width="36" height="14" rx="3" fill="#3c4229" transform="rotate(-8 156 558)"/>`;
      s += `<path d="M118,530 C140,600 150,700 146,920" fill="none" stroke="${jkD}" stroke-width="3" opacity="0.6"/><path d="M482,530 C460,600 450,700 454,920" fill="none" stroke="${jkD}" stroke-width="3" opacity="0.6"/>`;
      // fold lines
      s += `<path d="M220,700 q10,40 4,90 M384,690 q-8,50 0,100" fill="none" stroke="${jkD}" stroke-width="2.5" opacity="0.45"/>`;
      return s;
    },
    behind(o) {
      // headphone band emerging from behind the neck
      const band = '#26262a';
      return `<path d="M266,428 C246,440 232,462 228,486" fill="none" stroke="${band}" stroke-width="8" stroke-linecap="round"/>` +
        `<path d="M334,428 C354,440 368,462 372,486" fill="none" stroke="${band}" stroke-width="8" stroke-linecap="round"/>`;
    },
    collar(o) {
      // low ponytail brought forward over her right shoulder (viewer's left)
      const h = '#5a3a2a', hs = '#3f281d', hl = '#7d5539';
      return `<path d="M246,404 C222,420 206,450 200,488 C194,532 202,580 196,626 C214,602 226,566 230,528 C236,488 246,452 262,420 Z" fill="${hs}"/>` +
        `<path d="M250,410 C232,430 220,458 216,492 C212,530 216,566 212,600 C224,576 232,544 236,512 C240,476 248,448 262,424 Z" fill="${h}"/>` +
        `<path d="M232,450 C226,480 224,520 222,556" fill="none" stroke="${hl}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>` +
        `<rect x="236" y="416" width="20" height="10" rx="4" fill="#2e6b6b" transform="rotate(32 246 421)"/>`;
    },
    front(o) {
      // orange foam headphones resting on her collarbones
      const ring = '#2a2a2e', foam = '#e2843b', foamS = '#b8622a', foamL = '#f2a35c';
      const cup = (cx, cy, rot, lit) => `<g transform="rotate(${rot} ${cx} ${cy})">` +
        `<ellipse cx="${cx}" cy="${cy}" rx="33" ry="37" fill="${lit ? foam : foamS}"/>` +
        `<ellipse cx="${cx - 4}" cy="${cy - 5}" rx="24" ry="28" fill="${lit ? foamL : foam}" opacity="0.75"/>` +
        `<ellipse cx="${cx}" cy="${cy}" rx="11" ry="12" fill="${ring}"/><ellipse cx="${cx}" cy="${cy}" rx="5" ry="5.5" fill="#55555c"/></g>`;
      return cup(226, 500, -14, true) + cup(374, 500, 14, false);
    },
    draw(o) { return P.draw(o, gus); }
  };
  ART.char('gus', gus);

  /* ================================================================== */
  /* CLAIRE — Mom, 44 */
  const mom = {
    name: 'Claire',
    age: 0.55,
    skin: { base: '#ecc2a2', shadow: '#c99a7b', blush: '#d77d6e' },
    face: { jaw: 0.96, chin: 4, top: 0.99, cheek: -2 },
    eyes: { color: '#5d4636', size: 0.96, lashes: true, lash: '#2b1d17', bags: 0.7, lid: 0.3 },
    brows: { color: '#3b2a24', thick: 0.85, arch: 1.1 },
    nose: { size: 1.08, width: 1.0, y: 2 },
    mouth: { width: 1.0, lip: '#b9706a', full: 0.3, y: 2 },
    hairShadow: 'M214,212 C236,196 262,186 300,186 C340,186 368,198 388,214 L390,236 C366,216 334,206 300,206 C268,206 238,218 214,236 Z',
    hairBack(o) {
      const h = '#3b2b26', hs = '#2a1f1b', gray = '#8a8580';
      // curls piled up and clipped at the back/top
      let s = `<path d="M206,280 C190,200 230,120 300,112 C372,108 416,180 400,282 C396,312 386,330 376,340 L224,340 C214,326 208,306 206,280 Z" fill="${hs}"/>`;
      const r = K.rng('momcurls');
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (1.05 + r() * 0.9), rr = 96 + r() * 14;
        s += `<circle cx="${n(300 + Math.cos(a) * rr)}" cy="${n(190 + Math.sin(a) * rr * 0.75)}" r="${n(16 + r() * 10)}" fill="${i % 3 ? hs : h}"/>`;
      }
      return s;
    },
    hairFront(o) {
      const h = '#3b2b26', hs = '#2a1f1b', gray = '#9a948c';
      const r = K.rng('momfront');
      let s = `<path d="M210,266 C200,180 246,124 304,124 C364,124 404,176 394,262 C388,226 372,204 350,192 C330,182 312,184 300,186 C280,184 258,190 240,204 C224,218 214,240 210,266 Z" fill="${h}"/>`;
      // the bun/clip mass on top
      s += `<path d="M236,150 C236,96 280,72 312,76 C352,80 374,112 366,152 C346,138 324,132 300,132 C278,132 256,138 236,150 Z" fill="${hs}"/>`;
      for (let i = 0; i < 9; i++) s += `<circle cx="${n(250 + i * 13 + r() * 6)}" cy="${n(96 - Math.sin((i / 8) * Math.PI) * 18 + r() * 8)}" r="${n(13 + r() * 6)}" fill="${i % 2 ? h : hs}"/>`;
      // tortoiseshell claw clip
      s += `<path d="M262,104 C280,86 320,86 338,104 L332,118 C316,104 284,104 268,118 Z" fill="#7a4a2a"/><path d="M270,110 l6,16 M286,104 l4,18 M302,103 l0,19 M318,104 l-4,18 M332,110 l-6,16" stroke="#4a2c18" stroke-width="3"/>`;
      // grey streaks
      s += `<path d="M262,142 C280,132 300,130 320,134" fill="none" stroke="${gray}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`;
      s += `<path d="M232,210 C246,196 262,190 280,188" fill="none" stroke="${gray}" stroke-width="3" opacity="0.6"/>`;
      // escaping curls at the temples (filled ringlets)
      const curl = (x, y, r, c, flip) => `<path d="M${x},${y} c${flip * r * 1.4},${r * 0.2} ${flip * r * 1.5},${r * 1.6} ${flip * r * 0.4},${r * 2} c${flip * -r * 0.9},${r * 0.3} ${flip * -r * 0.6},${r * 1.6} ${flip * r * 0.3},${r * 2.2} l${flip * -r * 0.5},${r * 0.3} c${flip * -r * 1.2},${-r * 0.8} ${flip * -r * 1},${-r * 1.9} ${flip * -r * 0.1},${-r * 2.3} c${flip * r * 0.8},${-r * 0.4} ${flip * r * 0.6},${-r * 1.4} ${flip * -r * 0.3},${-r * 1.7} Z" fill="${c}"/>`;
      s += curl(222, 232, 12, h, -1) + curl(380, 230, 11, hs, 1);
      // reading glasses pushed up on her head
      s += `<g opacity="0.95"><rect x="246" y="136" width="44" height="22" rx="8" fill="#c9d6dc" fill-opacity="0.3" stroke="#3a2a22" stroke-width="3.5"/><rect x="310" y="136" width="44" height="22" rx="8" fill="#c9d6dc" fill-opacity="0.3" stroke="#3a2a22" stroke-width="3.5"/><path d="M290,146 q10,-6 20,0" fill="none" stroke="#3a2a22" stroke-width="3"/></g>`;
      return s;
    },
    body(o, ex) {
      const scrub = '#7d97c4', scrubS = '#5f78a6', card = '#8e8a86', cardS = '#6c6864', cardD = '#57534f';
      let s = P.torso({ sw: 188, drop: 22, top: 456, fill: card, shadow: cardS, neckW: 36 });
      // scrubs V-neck
      s += `<path d="M252,458 L300,540 L348,458 L362,920 L238,920 Z" fill="${scrub}"/>`;
      s += `<path d="M300,540 L348,458 L362,920 L312,920 Z" fill="${scrubS}"/>`;
      s += `<path d="M252,458 L300,540 L348,458" fill="none" stroke="${K.adj(scrub, -0.25)}" stroke-width="5"/>`;
      s += `<path d="M314,600 h40 v48 h-40 Z" fill="${scrubS}"/><path d="M322,592 v16 M330,594 v14" stroke="#2a2a2e" stroke-width="3"/>`; // pens in pocket
      // long open cardigan fronts
      s += `<path d="M252,456 C232,540 226,700 232,920 L170,920 C172,740 180,600 196,520 C208,486 228,466 252,456 Z" fill="${card}"/>`;
      s += `<path d="M348,456 C368,540 374,700 368,920 L430,920 C428,740 420,600 404,520 C392,486 372,466 348,456 Z" fill="${cardS}"/>`;
      s += `<path d="M240,520 C236,640 236,780 240,920" fill="none" stroke="${cardD}" stroke-width="4" opacity="0.6"/><path d="M360,520 C364,640 364,780 360,920" fill="none" stroke="${cardD}" stroke-width="4" opacity="0.6"/>`;
      // ID badge clipped to the scrubs
      s += `<rect x="262" y="604" width="34" height="46" rx="3" fill="#efeadf"/><rect x="266" y="610" width="26" height="18" fill="#9fb4c8"/><path d="M268,636 h22 M268,642 h16" stroke="#555" stroke-width="2"/>`;
      return s;
    },
    draw(o) { return P.draw(o, mom); }
  };
  ART.char('mom', mom);
})();
