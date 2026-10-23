/* What Derry Keeps — core cast portraits.
 * Memere, Teddy, Cal, Sloane, Wes, June, and June's last appearance, built on
 * the shared rig in portraits.js (one head geometry, 14 expressions, blink).
 * Same hand as Gus and Claire: flat fills with one shadow tone, key light from
 * the upper left (shadow on the viewer's right), outlines only on facial
 * features and a few clothing folds. See docs/ART_DIRECTION.md. */
(function () {
  'use strict';
  const P = window.PORTRAIT, K = window.KIT, n = K.n;

  /* ================================================================== */
  /* shared helpers                                                      */

  /* o.id(name) is deterministic within a render, so number every id. */
  const uid = (o, name) => { o._cc = (o._cc || 0) + 1; return o.id(`cc${name}${o._cc}`); };
  const fp = (d, fill, op) => `<path d="${d}" fill="${fill}"${op !== undefined && op < 1 ? ` opacity="${op}"` : ''}/>`;
  const sp = (d, stroke, w = 2, op = 1, cap = 'round') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
  const clipTo = (o, d, inner, name = 'clip') => {
    const id = uid(o, name);
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
  };
  /* Cel shading for a free-standing mass (bun, puff, scrunchie): the shadow
   * fill, then the lit fill shifted up-left inside it — the same trick the
   * rig uses on the face. */
  const cel = (o, d, lit, shadow, dx = -9, dy = -7) =>
    fp(d, shadow) + clipTo(o, d, `<path d="${d}" fill="${lit}" transform="translate(${dx},${dy})"/>`, 'cel');

  /* P.torso's outline and shadow, so patterns and overlays can be clipped to them. */
  const torsoD = ({ sw = 190, drop = 0, top = 444, neckW = 36 } = {}) => {
    const L = 300 - sw, R = 300 + sw;
    return `M${n(300 - neckW)},${top} C${n(300 - neckW - 40)},${top + 8} ${n(L + 40)},${n(top + 14 + drop)} ${n(L + 6)},${n(top + 48 + drop)} ` +
      `C${n(L - 14)},${n(top + 90 + drop)} ${n(L - 18)},${top + 220} ${n(L - 22)},920 L${n(R + 22)},920 ` +
      `C${n(R + 18)},${top + 220} ${n(R + 14)},${n(top + 90 + drop)} ${n(R - 6)},${n(top + 48 + drop)} ` +
      `C${n(R - 40)},${n(top + 14 + drop)} ${n(300 + neckW + 40)},${top + 8} ${n(300 + neckW)},${top} Z`;
  };
  const torsoShadowD = ({ sw = 190, drop = 0, top = 444, neckW = 36 } = {}) => {
    const R = 300 + sw;
    return `M${n(300 + neckW * 0.6)},${top + 30} C${n(R - 60)},${top + 40} ${n(R - 10)},${n(top + 70 + drop)} ${n(R + 4)},${n(top + 120 + drop)} ` +
      `L${n(R + 22)},920 L${n(R - 70)},920 C${n(R - 80)},${top + 300} ${n(R - 90)},${top + 120} ${n(300 + neckW * 0.6)},${top + 30} Z`;
  };

  /* The rig's ear outline (head space), for drawing things tucked behind an ear. */
  const earD = (side, fw = 1, ey = 0) => {
    const x = (d) => n(300 + side * d * fw);
    return `M${x(86)},${266 + ey} C${x(104)},${258 + ey} ${x(110)},${282 + ey} ${x(104)},${300 + ey} C${x(99)},${316 + ey} ${x(90)},${322 + ey} ${x(82)},${316 + ey} Z`;
  };

  /* Where a brow sits at a given x for an expression (mirrors the rig's brow()). */
  function browAt(spec, ex, side, x) {
    const b = spec.brows || {}, e = spec.eyes || {};
    const cx = 300 + side * 38 * (e.spacing || 1);
    const lift = ex.brow.lift + (ex.brow.asym || 0) * (side < 0 ? 1 : -1);
    const by = 254 + (b.y || 0) + (e.y || 0) - lift;
    const len = 25 * (b.len || 1), th = 6.5 * (b.thick || 1);
    const xi = cx - side * len * 0.92, xo = cx + side * len * 1.05;
    const yi = by + ex.brow.tilt * 0.55 + 2, yo = by - ex.brow.tilt * 0.25 + 3;
    const xm = cx + side * len * 0.25, ym = Math.min(yi, yo) - 6 * (b.arch !== undefined ? b.arch : 1);
    const q = (a, m, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * m + t * t * c;
    let lo = 0, hi = 1;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if ((q(xi, xm, xo, mid) < x) === (side > 0)) lo = mid; else hi = mid;
    }
    const t = (lo + hi) / 2;
    const top = q(yi - th / 2, ym - th * 0.55, yo - th * 0.2, t), bot = q(yi + th / 2, ym + th * 0.5, yo + th * 0.15, t);
    return { top, bot, mid: (top + bot) / 2 };
  }

  /* Glasses (head space): frames, a faint tint and one rim reflection kept
   * clear of the iris, so eyes and brows read straight through the lenses. */
  function glasses(o, g) {
    const y = g.y || 287, gap = g.gap || 38, rx = g.rx || 22, ry = g.ry || rx, w = g.w || 2.2;
    const fr = g.frame, frS = g.frameS || g.frame;
    const tL = g.templeL === undefined ? 18 : g.templeL, tR = g.templeR === undefined ? 18 : g.templeR;
    let s = '';
    for (const side of [-1, 1]) {
      const cx = 300 + side * gap;
      s += `<ellipse cx="${n(cx)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${g.tint || '#dfe9ee'}" opacity="${g.tintOp === undefined ? 0.07 : g.tintOp}"/>`;
      s += `<path d="M${n(cx - rx * 0.78)},${n(y - ry * 0.1)} A${n(rx * 0.8)},${n(ry * 0.8)} 0 0 1 ${n(cx - rx * 0.18)},${n(y - ry * 0.78)}" fill="none" stroke="#ffffff" stroke-width="${n(g.shineW || 1.8)}" stroke-linecap="round" opacity="${g.shine === undefined ? 0.3 : g.shine}"/>`;
    }
    const ty = y - ry * 0.32;
    if (tL) s += sp(`M${n(300 - gap - rx)},${n(ty)} L${n(300 - gap - rx - tL)},${n(ty - 3)}`, fr, w * 0.9);
    if (tR) s += sp(`M${n(300 + gap + rx)},${n(ty)} L${n(300 + gap + rx + tR)},${n(ty - 3)}`, frS, w * 0.9);
    const bx = gap - rx * 0.96, by = y - ry * 0.3;
    s += sp(`M${n(300 - bx)},${n(by)} Q300,${n(by - (g.arch || 6))} ${n(300 + bx)},${n(by)}`, fr, w);
    for (const side of [-1, 1]) {
      const cx = 300 + side * gap, c = side > 0 ? frS : fr;
      const el = (stroke, sw, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}"${extra}/>`;
      s += el(c, w);
      if (g.tortoise) {
        // mottled shell: amber and honey flecks along the rim
        s += el(g.tortoise[0], w * 0.5, ` stroke-dasharray="8 5 3 10 6 4 2 7" stroke-dashoffset="${side > 0 ? 11 : 0}"`);
        s += el(g.tortoise[1], w * 0.28, ` stroke-dasharray="2 14 3 9 1 12" stroke-dashoffset="${side > 0 ? 5 : 0}"`);
      }
    }
    return s;
  }

  /* A small stud (pearl, gold) with a shadow crescent and a glint. */
  const stud = (x, y, r, c, cS, glint = '#ffffff') =>
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${c}"/>` +
    `<path d="M${n(x + r)},${n(y)} A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y + r)} A${n(r * 0.7)},${n(r * 0.7)} 0 0 0 ${n(x + r)},${n(y)} Z" fill="${cS}"/>` +
    `<circle cx="${n(x - r * 0.35)}" cy="${n(y - r * 0.35)}" r="${n(r * 0.33)}" fill="${glint}" opacity="0.9"/>`;

  /* Points along a cubic Bezier. */
  const bez = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };

  /* Cable-knit rope: a column of slanted raised twists between two purl channels. */
  function cable(x, y0, y1, w, hi, sh, line, step = 22) {
    let s = sp(`M${n(x - w / 2 - 4)},${n(y0)} V${n(y1)} M${n(x + w / 2 + 4)},${n(y0)} V${n(y1)}`, line, 1.8, 0.6);
    let shad = '', lit = '';
    for (let y = y0; y < y1; y += step) {
      const cy = y + step / 2, rx = n(w * 0.66), ry = n(step * 0.3);
      shad += `<ellipse cx="${n(x + 1.2)}" cy="${n(cy + 1.8)}" rx="${rx}" ry="${ry}" transform="rotate(-40 ${n(x + 1.2)} ${n(cy + 1.8)})"/>`;
      lit += `<ellipse cx="${n(x)}" cy="${n(cy)}" rx="${rx}" ry="${ry}" transform="rotate(-40 ${n(x)} ${n(cy)})"/>`;
    }
    return s + `<g fill="${sh}">${shad}</g><g fill="${hi}">${lit}</g>`;
  }

  /* Buffalo-check pattern from flat, overlapping bands (opaque cells, so tile
   * seams never show): red, one dark band (dark red), two bands (near black). */
  const plaid = (id, red, blk, size, angle, cx, cy, ox = 0) => {
    const t = size * 2, c1 = K.mix(red, blk, 0.6), c2 = K.mix(red, blk, 0.88), e = 0.5;
    return `<pattern id="${id}" width="${t}" height="${t}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle} ${cx} ${cy}) translate(${ox} 0)">` +
      `<rect x="0" y="0" width="${t}" height="${t}" fill="${red}"/>` +
      `<rect x="0" y="0" width="${size + e}" height="${t}" fill="${c1}"/>` +
      `<rect x="0" y="0" width="${t}" height="${size + e}" fill="${c1}"/>` +
      `<rect x="0" y="0" width="${size + e}" height="${size + e}" fill="${c2}"/></pattern>`;
  };

  /* Herringbone tweed texture (transparent, laid over flat fills). */
  const tweedTex = (o, light, dark) => {
    const id = uid(o, 'tweed');
    return { id, def: `<defs><pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse">` +
      `<path d="M0,6 L6,0 M0,12 L6,6 M6,0 L12,6 M6,6 L12,12" stroke="${light}" stroke-width="1.4" opacity="0.55"/>` +
      `<path d="M0,8 L6,2 M0,14 L6,8 M6,2 L12,8 M6,8 L12,14" stroke="${dark}" stroke-width="1.2" opacity="0.4"/></pattern></defs>` };
  };

  /* ================================================================== */
  /* MEMERE — Yvette Thibodeau, 72                                       */
  const MEM = {
    hair: '#e9e3da', hairS: '#c2bab1', hairL: '#f8f5ef',
    card: '#9b6e87', cardS: '#7b526a', cardD: '#5f3e52', band: '#6f4862',
    blouse: '#f2ebe0', blouseS: '#d5cab9', lace: '#f8f3ea', laceS: '#dcd2c3',
    button: '#efe6da', buttonS: '#c5b6a3', skirt: '#4b4247', skirtS: '#3a3237',
    gold: '#c9a24c', goldS: '#987634', brass: '#c8a04a', brassS: '#8c6a2c', glass: '#f3dfa0',
    skinS: '#d5aa9b'
  };
  const memere = {
    name: 'M\u00e9m\u00e8re',
    age: 0.95,
    headScale: 1.0,
    blush: 0.34,
    skin: { base: '#f3d9ca', shadow: MEM.skinS, blush: '#e48678' },
    face: { jaw: 0.95, chin: 2, top: 0.97, cheek: -3 },
    eyes: { color: '#8fa1ae', size: 0.9, lid: 0.4, bags: 0.6, lashes: true, lash: '#3e302c', white: '#f2e8e3' },
    brows: { color: '#978880', thick: 0.72, arch: 1.15, len: 0.95, y: -1 },
    nose: { size: 1.1, width: 1.05, y: 3 },
    mouth: { width: 0.9, lip: '#c78c84', full: 0.12, y: 3 },
    neck: { w: 0.86 },
    hairShadow: 'M216,262 C218,226 238,192 270,176 C284,170 300,169 300,169 C300,169 316,170 330,176 C362,192 382,226 384,262 L385,270 C377,232 358,200 330,184 C316,178 300,177 300,177 C300,177 284,178 270,184 C242,200 223,232 215,270 Z',
    marks: sp('M268,199 Q300,193 332,199', MEM.skinS, 1.4, 0.32) +
      sp('M282,380 q-5,12 -13,21 M318,380 q5,12 13,21', MEM.skinS, 1.6, 0.34) +
      sp('M243,305 q19,8 38,1 M319,306 q19,7 38,-1', MEM.skinS, 1.2, 0.26) +
      sp('M231,352 q6,19 21,29 M369,352 q-6,19 -21,29', MEM.skinS, 1.4, 0.26),
    hairBack(o) {
      const c = MEM;
      let s = fp('M204,300 C190,214 226,128 300,122 C374,128 410,214 396,300 C392,318 384,328 376,334 L224,334 C216,328 208,318 204,300 Z', c.hairS);
      // the bun, coiled high at the back of the head
      const bun = 'M254,106 C254,80 276,67 300,67 C324,67 348,80 348,104 C348,126 326,140 300,140 C274,140 254,128 254,106 Z';
      s += cel(o, bun, c.hair, c.hairS, -8, -6);
      s += sp('M264,96 C278,78 318,76 338,90 M260,113 C282,96 322,96 344,112 M270,128 C292,114 318,114 336,125', c.hairS, 2, 0.75);
      s += sp('M268,86 C280,76 300,72 316,74', c.hairL, 2.4, 0.85);
      s += sp('M321,131 l13,-9 M328,135 l12,-8', '#6d655e', 2, 0.8);
      // wisps escaping the bun
      s += sp('M340,90 c7,-6 15,-6 20,0 M334,80 c5,-7 12,-9 19,-6 M262,96 c-6,-5 -14,-5 -19,1 M296,68 c1,-8 6,-12 12,-12', c.hair, 1.3, 0.85);
      return s;
    },
    hairFront(o) {
      const c = MEM;
      let s = fp('M212,286 C200,262 194,232 198,204 C202,160 236,118 300,110 C364,118 398,160 402,204 C406,232 400,262 388,286 C386,262 384,236 376,214 C362,184 334,168 300,166 C266,168 238,184 224,214 C216,236 214,262 212,286 Z', c.hair);
      // shadow side
      s += fp('M350,124 C384,140 402,170 402,204 C406,232 400,262 388,286 C386,262 384,236 376,214 C370,190 360,172 346,160 C350,148 352,136 350,124 Z', c.hairS);
      // swept-back waves
      s += sp('M228,214 C236,186 260,168 290,160 M220,250 C224,222 238,200 260,186 M248,170 C262,150 284,138 306,134', c.hairS, 1.8, 0.6);
      s += sp('M372,214 C364,188 342,170 314,162 M380,250 C376,222 362,200 342,186', c.hairS, 1.8, 0.75);
      s += fp('M240,148 C258,128 286,118 314,118 C290,126 266,138 250,158 Z', c.hairL, 0.9);
      // fine wisps escaping at the temples and the nape
      s += sp('M214,252 C207,264 205,280 210,296 M220,262 c-5,10 -5,20 -2,28 M388,250 C395,264 397,282 392,296 M223,224 c-10,4 -15,11 -16,21 M262,171 c-7,5 -11,12 -12,21 M352,176 c8,2 14,8 16,16', c.hair, 1.2, 0.85);
      return s;
    },
    headwear(o) {
      // small oval gold wire glasses
      return glasses(o, { y: 288, gap: 38, rx: 22, ry: 15.5, frame: '#b0904f', frameS: '#8f7238', w: 2.2, templeL: 10, templeR: 10, arch: 4, shine: 0.32 });
    },
    body(o) {
      const c = MEM;
      const T = { sw: 158, drop: 50, top: 440, neckW: 34 };
      let s = P.torso({ ...T, fill: c.card, shadow: c.cardS });
      // the crew neck doesn't meet: she buttoned it one hole off, so the
      // blouse shows in a lopsided gap at the throat
      s += fp('M240,440 L360,440 L348,472 C340,488 326,498 310,500 L310,566 L318,566 C290,546 262,508 252,472 Z', c.blouse);
      s += sp('M341,476 C333,490 320,498 304,500', c.blouseS, 5, 0.8);
      // her left front (viewer's right): the neckline turns down at its corner,
      // and its top button sits there with no buttonhole over it
      s += sp('M348,472 C340,488 326,498 310,500 L310,600', c.band, 13);
      // her right front hangs a button low: its neckline sweeps down past that
      // orphan button, and the pulled band runs off plumb
      s += fp('M252,472 C262,508 290,546 318,566 L326,920 L190,920 L190,600 L200,480 Z', c.card);
      s += sp('M263,476 C273,512 301,550 329,568 L337,856', c.cardD, 6, 0.3);
      s += sp('M252,472 C262,508 290,546 318,566 L326,920', c.band, 13);
      // ...so at the hem her left front stops a button short and the skirt shows
      s += fp('M330,860 L437,852 L441,920 L330,920 Z', c.skirt) + fp('M392,856 L437,852 L441,920 L392,920 Z', c.skirtS);
      s += sp('M331,857 L437,849', c.band, 10);
      // drag folds pulling from the misbuttoned front up to her shoulder, a pucker opposite
      s += sp('M311,580 C292,566 270,546 250,520 M312,628 C292,612 268,594 246,568 M313,676 C292,662 270,646 250,628', c.cardD, 2.4, 0.5);
      s += sp('M334,586 q9,6 19,3 M335,634 q9,6 19,3', c.cardD, 2, 0.45);
      // sleeve seams and folds
      s += sp('M150,556 C162,620 166,720 164,920 M450,556 C438,620 434,720 436,920', c.cardD, 2.6, 0.5);
      s += sp('M206,730 q8,40 2,90 M392,690 q-8,50 0,100', c.cardD, 2.2, 0.4);
      // buttons: the orphan at her left front's corner, then the rest
      const btn = (x, y) => `<circle cx="${x}" cy="${y}" r="6.2" fill="${c.button}"/><path d="M${x + 6.2},${y} A6.2,6.2 0 0 1 ${x},${y + 6.2} A4.6,4.6 0 0 0 ${x + 6.2},${y} Z" fill="${c.buttonS}"/><circle cx="${x - 1.8}" cy="${y}" r="0.9" fill="${c.cardD}"/><circle cx="${x + 1.8}" cy="${y}" r="0.9" fill="${c.cardD}"/>`;
      s += btn(309, 512);
      for (let y = 578; y < 900; y += 48) s += btn(n(318 + 8 * (y - 566) / 354), y);
      return s;
    },
    behind(o) {
      const c = MEM;
      // a rounded upper back rising behind the neck: she stoops
      return fp('M224,480 C228,436 258,410 300,407 C342,410 372,436 376,480 Z', c.card) + fp('M300,407 C342,410 372,436 376,480 L300,480 Z', c.cardS);
    },
    collar(o) {
      const c = MEM, sh = c.skinS;
      // an old neck: cords and a crease
      let s = sp('M286,404 C285,414 284,424 283,434 M314,404 C315,414 316,424 317,434', sh, 1.4, 0.4) + sp('M281,420 Q300,427 319,420', sh, 1.3, 0.3);
      // lace Peter Pan collar: rounded flaps, scalloped edges, pierced holes
      const flap = (m) => {
        const X = (x) => (m ? 600 - x : x);
        const p0 = [X(232), 438], p1 = [X(228), 454], p2 = [X(238), 472], p3 = [X(254), 479];
        const q1 = [X(270), 485], q2 = [X(290), 482], q3 = [X(300), 465];
        const col = m ? c.laceS : c.lace, hole = m ? K.adj(c.laceS, -0.12) : c.laceS;
        let f = '';
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push(bez(p0, p1, p2, p3, i / 6));
        for (let i = 1; i <= 6; i++) pts.push(bez(p3, q1, q2, q3, i / 6));
        for (const p of pts.slice(0, -1)) f += `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="3.6" fill="${col}"/>`;
        f += fp(`M${X(300)},465 C${X(292)},464 ${X(278)},456 ${X(270)},444 L${X(264)},434 C${X(254)},433 ${X(242)},434 ${X(232)},438 C${X(228)},454 ${X(238)},472 ${X(254)},479 C${X(270)},485 ${X(290)},482 ${X(300)},465 Z`, col);
        for (const p of pts.slice(1, -1)) {
          const dx = 300 - p[0], dy = 444 - p[1], L = Math.hypot(dx, dy);
          f += `<circle cx="${n(p[0] + dx / L * 6.5)}" cy="${n(p[1] + dy / L * 6.5)}" r="1.3" fill="${hole}"/>`;
        }
        return f;
      };
      s += flap(true) + flap(false);
      return s;
    },
    front(o) {
      const c = MEM;
      // thin gold chain, a small crucifix resting on the lace
      let s = sp('M280,436 C284,452 292,464 300,468 C308,464 316,452 320,436', c.gold, 1.3, 0.95);
      s += `<rect x="298.4" y="467" width="3.4" height="17" fill="${c.gold}"/><rect x="294.2" y="471.5" width="11.8" height="3.2" fill="${c.gold}"/><rect x="300.4" y="467" width="1.4" height="17" fill="${c.goldS}"/>`;
      // the small brass lantern pin
      s += `<g transform="translate(234 560) scale(1.15)">` +
        `<circle cx="0" cy="-21" r="3.2" fill="none" stroke="${c.brass}" stroke-width="1.6"/>` +
        fp('M-9,-11 L9,-11 L4.5,-18 L-4.5,-18 Z', c.brass) + fp('M2,-11 L9,-11 L4.5,-18 L1,-18 Z', c.brassS) +
        `<rect x="-7.5" y="-11" width="15" height="20" fill="${c.glass}"/><rect x="1" y="-11" width="6.5" height="20" fill="${K.adj(c.glass, -0.18)}"/>` +
        `<rect x="-7.5" y="-11" width="15" height="20" fill="none" stroke="${c.brassS}" stroke-width="1.6"/>` + sp('M0,-11 V9', c.brassS, 1.4) +
        `<rect x="-10" y="8.5" width="20" height="4.5" rx="1" fill="${c.brass}"/><rect x="2" y="8.5" width="8" height="4.5" fill="${c.brassS}"/>` +
        `<circle cx="-3.6" cy="-5" r="1.4" fill="#ffffff" opacity="0.8"/></g>`;
      return s;
    },
    draw(o) { return P.draw(o, memere); }
  };
  ART.char('memere', memere);

  /* ================================================================== */
  /* TEDDY — Theodora Okafor, 14                                         */
  const TED = {
    hair: '#241a16', hairS: '#16100d', hairL: '#4a382e',
    teal: '#2f8f8d', tealS: '#21706f', tealL: '#55b3ad',
    pur: '#6b4e9d', purS: '#4f3a80', pink: '#dc739f', pinkS: '#b5577f',
    tee: '#f0ece4', teeS: '#cfc8bc', zip: '#2a2533', zipL: '#c9c4bc',
    shell: '#4b2a17', shellA: '#93582a', shellH: '#cf9a58',
    gold: '#dcb14a', goldS: '#a37d2c', seam: '#1d1336'
  };
  const tedPuff = K.blob(K.rng('teddy-puff'), 300, 76, 84, 48, { lobes: 17, jag: 0.045, scallop: 0.07 });
  const tedCoils = (() => {
    const r = K.rng('teddy-coils');
    let lit = '', dark = '';
    for (let i = 0; i < 96; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r());
      const x = 300 + Math.cos(a) * 76 * rr, y = 76 + Math.sin(a) * 42 * rr, k = 1.3 + r() * 1.6;
      const d = `M${n(x - k)},${n(y)} a${n(k)},${n(k)} 0 1 1 ${n(k * 1.4)},${n(k * 0.9)} `;
      if (x + (y - 76) * 1.6 < 290 + r() * 50) lit += d; else dark += d;
    }
    return { lit, dark };
  })();
  const tedScrunchie = K.blob(K.rng('teddy-scrunchie'), 300, 125, 42, 12.5, { lobes: 9, jag: 0.06, scallop: 0.24 });
  const teddy = {
    name: 'Teddy',
    headScale: 1.04,
    skin: { base: '#7d4c34', shadow: '#5a3424', blush: '#b0594a' },
    face: { jaw: 1.08, chin: -7, top: 1.03, cheek: 7 },
    eyes: { color: '#3b2216', size: 1.04, lashes: true, lash: '#1a110e', white: '#f1e9de' },
    brows: { color: '#1d130f', thick: 1.22, arch: 1.15, len: 1.06 },
    nose: { size: 1.0, width: 1.28 },
    mouth: { width: 1.03, lip: '#6c3631', full: 0.75 },
    hairShadow: 'M214,262 C218,228 236,198 266,182 C278,177 290,175 300,175 C310,175 322,177 334,182 C364,198 382,228 386,262 L386,270 C378,236 360,209 334,194 C322,188 310,186 300,186 C290,186 278,188 266,194 C240,209 222,236 214,270 Z',
    hairBack(o) {
      const c = TED;
      let s = fp('M206,290 C196,210 232,132 300,126 C368,132 404,210 394,290 L380,300 L220,300 Z', c.hairS);
      // the high round puff
      s += cel(o, tedPuff, c.hair, c.hairS, -12, -9);
      s += clipTo(o, tedPuff, sp(tedCoils.lit, c.hairL, 1.1, 0.5) + sp(tedCoils.dark, '#30251f', 1.1, 0.55), 'coil');
      return s;
    },
    hairFront(o) {
      const c = TED;
      // hair pulled up tight from the hairline into the scrunchie
      let s = fp('M210,266 C200,222 204,170 236,140 C256,124 278,118 300,118 C322,118 344,124 364,140 C396,170 400,222 390,266 C386,238 380,216 369,201 C352,183 328,175 300,175 C272,175 248,183 231,201 C220,216 214,238 210,266 Z', c.hair);
      s += fp('M346,128 C380,146 398,186 396,228 L390,266 C386,238 380,216 369,201 C362,182 352,162 340,148 Z', c.hairS);
      s += sp('M236,200 C248,170 272,142 294,129 M258,178 C270,156 284,140 297,129 M222,238 C226,202 250,162 290,131', c.hairL, 1.5, 0.5);
      s += sp('M364,200 C352,170 328,142 306,129 M378,238 C374,202 350,162 310,131', '#0c0807', 1.5, 0.6);
      // laid edges at the temples
      s += sp('M217,242 c3,-6 9,-7 11,-2 c1,4 -3,5 -5,3 M383,242 c-3,-6 -9,-7 -11,-2 c-1,4 3,5 5,3', c.hair, 1.3, 0.9);
      // teal scrunchie at the base of the puff
      s += cel(o, tedScrunchie, c.teal, c.tealS, -6, -4);
      s += sp('M272,117 q-4,8 0,16 M288,114 q-3,10 0,21 M310,114 q3,10 0,21 M327,117 q4,8 0,16', c.tealS, 1.6, 0.8);
      s += sp('M268,119 C278,113 292,112 302,113', c.tealL, 2, 0.8);
      return s;
    },
    headwear(o) {
      const c = TED, fw = 1.03;
      let s = stud(300 - 95 * fw, 313, 4, c.gold, c.goldS) + stud(300 + 95 * fw, 313, 3.8, c.goldS, '#7d5e22', '#f3e2b0');
      s += glasses(o, { y: 291, gap: 37, rx: 31, ry: 30, frame: c.shell, w: 5, tortoise: [c.shellA, c.shellH], templeL: 20, templeR: 20, arch: 3, shine: 0.28, shineW: 2.4 });
      return s;
    },
    body(o) {
      const c = TED;
      const T = { sw: 206, drop: 24, top: 446, neckW: 42 };
      const td = torsoD(T);
      let w = fp(td, c.pur);
      // color blocks on a 1991 diagonal: teal yoke, pink sash, purple body
      w += fp('M-20,-20 L620,-20 L620,470 L-20,600 Z', c.teal);
      w += fp('M-20,600 L620,470 L620,508 L-20,638 Z', c.pink);
      w += sp('M-20,600 L620,470 M-20,638 L620,508', c.seam, 1.6, 0.35);
      // raglan seams from the collar to the underarms, sleeve seams
      w += sp('M262,452 C220,500 180,560 150,640 M338,452 C380,500 420,560 450,640', c.seam, 2, 0.35);
      w += sp('M128,560 C142,640 150,740 148,920 M472,560 C458,640 450,740 452,920', c.seam, 2.2, 0.3);
      // white tee in the half-zipped V
      w += fp('M254,446 L346,446 L300,546 Z', c.tee) + fp('M300,470 L346,446 L300,546 Z', c.teeS);
      w += sp('M262,448 L300,540 L338,448', c.pinkS, 4);
      w += sp('M300,540 L300,920', c.zip, 3.2);
      // crinkled nylon folds
      w += sp('M214,690 q12,40 4,92 M178,620 l26,16 M188,650 l20,10 M380,660 q-10,50 0,110 M420,600 l-24,18', c.seam, 2, 0.3);
      // one shadow tone over every panel
      w += fp(torsoShadowD(T), '#1e1240', 0.34);
      let s = clipTo(o, td, w, 'wb');
      s += `<rect x="295" y="538" width="10" height="20" rx="3" fill="${c.zipL}"/><rect x="298" y="543" width="4" height="9" rx="2" fill="${c.zip}"/>`;
      return s;
    },
    behind(o) {
      // back of the popped collar, standing behind the neck
      return fp('M226,454 C230,428 248,414 270,410 L330,410 C352,414 370,428 374,454 Z', '#3c2b62');
    },
    collar(o) {
      const c = TED;
      // tee's crew neck
      let s = fp('M258,452 Q300,494 342,452 L336,452 Q300,484 264,452 Z', c.tee) + fp('M300,473 Q324,468 336,452 L342,452 Q326,480 300,483 Z', c.teeS);
      // popped collar: two stand-up flaps flaring beside the jaw
      s += fp('M284,460 L270,404 L226,412 L218,452 C240,448 264,452 284,460 Z', c.pur);
      s += fp('M316,460 L330,404 L374,412 L382,452 C360,448 336,452 316,460 Z', c.purS);
      s += sp('M270,404 L226,412 M330,404 L374,412', c.pink, 3.2);
      s += sp('M258,424 L240,446 M342,424 L360,446', '#2e2050', 1.8, 0.5);
      return s;
    },
    front(o) {
      // Saturn enamel pin
      let s = `<g transform="translate(234 526) scale(1.2) rotate(-16)">`;
      const ring = (sweep) => `<path d="M-19,0 A19,6 0 0 ${sweep} 19,0" fill="none" stroke="#c9a03a" stroke-width="5"/><path d="M-19,0 A19,6 0 0 ${sweep} 19,0" fill="none" stroke="#efe2c4" stroke-width="2.6"/>`;
      s += ring(1);
      s += `<circle r="10.5" fill="#c9a03a"/><circle r="9" fill="#e9a84a"/>`;
      s += `<path d="M-8.6,2.6 Q0,5.2 8.6,2.6 L7.4,5.2 Q0,7.6 -7.4,5.2 Z" fill="#c9783a"/>`;
      s += `<path d="M9,0 A9,9 0 0 1 0,9 A6.6,6.6 0 0 0 9,0 Z" fill="#b8722e" opacity="0.7"/>`;
      s += ring(0);
      s += `<circle cx="-3.5" cy="-4" r="2" fill="#fff4d6" opacity="0.9"/></g>`;
      return s;
    },
    draw(o) { return P.draw(o, teddy); }
  };
  ART.char('teddy', teddy);

  /* ================================================================== */
  /* CAL — Calvin Ashgrove, 14                                           */
  const CAL = {
    hair: '#1d1c22', hairS: '#101015', hairL: '#3e4252', hairM: '#2c2d37',
    tw: '#6f5643', twS: '#523e31', twD: '#3b2c23', twL: '#8a6e57',
    tee: '#1e1c22', teeS: '#141317', moon: '#ebe5d8',
    gold: '#c9a457', goldS: '#9c7d3c',
    skin: '#efdccd', skinS: '#cdb2a4'
  };
  /* black-and-white marbled cover, generated once: irregular splotches of
   * mixed size (many specks, a few big patches), each a 7-point smoothed
   * blob, gathered into two compound paths to keep the markup light */
  const calMarble = (() => {
    const r = K.rng('cal-notebook');
    let w = '', g = '';
    for (let i = 0; i < 290; i++) {
      const x = 156 + r() * 144, y = 520 + r() * 184, rr = 1.8 + r() * r() * 11;
      const sx = 0.8 + r() * 0.9, sy = 0.45 + r() * 0.6, a0 = r() * 6.28, N = 7, k = [];
      for (let j = 0; j < N; j++) {
        const a = a0 + (j / N) * Math.PI * 2, q = rr * (0.5 + r() * 0.85);
        k.push([x + Math.cos(a) * q * sx, y + Math.sin(a) * q * sy]);
      }
      const mid = (a, b) => n((a[0] + b[0]) / 2) + ',' + n((a[1] + b[1]) / 2);
      let d = 'M' + mid(k[N - 1], k[0]);
      for (let j = 0; j < N; j++) d += 'Q' + n(k[j][0]) + ',' + n(k[j][1]) + ' ' + mid(k[j], k[(j + 1) % N]);
      if (r() < 0.85) w += d + 'Z'; else g += d + 'Z';
    }
    return `<path d="${w}" fill="#ebeae5"/><path d="${g}" fill="#8e8e8b"/>`;
  })();
  const cal = {
    name: 'Cal',
    skin: { base: CAL.skin, shadow: CAL.skinS, blush: '#d99a90' },
    face: { jaw: 0.88, chin: 12, top: 0.95, cheek: -6 },
    eyes: { color: '#6f8191', size: 0.95, lid: 0.3, bags: 0.9, lashes: false, lash: '#1e1a1c' },
    brows: { color: '#1b1a1f', thick: 0.95, arch: 0.6 },
    nose: { size: 1.12, width: 0.85, y: 4 },
    mouth: { width: 0.9, lip: '#c08a86', full: 0.25 },
    hairShadow: 'M262,240 C272,234 284,230 296,226 C312,220 330,211 346,203 L360,213 C378,234 384,262 386,300 L376,302 C374,270 366,246 352,229 C336,233 318,239 302,245 C288,250 276,254 266,257 Z ' +
      'M250,240 C254,256 256,274 256,292 C256,316 251,346 245,370 L253,372 C260,348 264,318 264,292 C264,270 261,252 258,240 Z',
    marks: '<path d="M242,296 C252,307 272,309 285,298 C272,305 254,304 242,296 Z M315,298 C328,309 348,307 358,296 C346,304 328,305 315,298 Z" fill="#86697a" opacity="0.34"/>',
    hairBack(o) {
      const c = CAL;
      // straight black hair hanging behind the neck down to his shoulders
      return fp('M190,300 C176,196 222,100 298,96 C376,100 418,196 404,300 C406,360 410,420 404,452 L196,452 C188,420 188,360 190,300 Z', c.hairS);
    },
    hairFront(o) {
      const c = CAL;
      // cap with a part on his left; straight hair falls past the jaw to rest
      // on the jacket's shoulders, the ends left uneven
      let s = fp('M199,452 C190,400 186,340 188,262 C190,170 236,100 300,98 C364,100 402,152 406,226 C410,290 412,360 408,420 L404,446 L398,430 L392,448 L387,428 L382,440 C384,400 388,330 382,262 C378,236 366,214 348,198 C330,206 312,214 296,220 C282,225 270,230 262,234 C248,236 234,238 226,244 C220,270 218,330 222,390 L228,440 L222,458 L216,438 L210,462 L205,440 Z', c.hair);
      s += fp('M352,106 C390,124 404,170 406,226 C410,290 412,360 408,420 L404,446 L398,430 L392,448 L387,428 L382,440 C384,400 388,330 382,262 C378,236 366,214 348,198 C352,166 354,136 352,106 Z', c.hairS);
      s += sp('M328,108 C336,140 340,170 345,196', c.hairS, 2.4, 0.9);
      s += sp('M330,124 C300,130 262,150 236,192 M336,150 C306,158 274,178 250,214 M322,182 C298,190 276,204 258,228', c.hairM, 1.8, 0.85);
      s += sp('M352,140 C368,172 382,222 390,282 M354,176 C370,212 380,262 384,322 M398,250 C400,330 400,390 398,434 M200,270 C200,340 204,400 212,446 M392,330 L392,420', c.hairM, 1.6, 0.7);
      // cool sheen across the crown
      s += fp('M232,156 C252,128 286,114 320,116 C296,124 266,140 246,170 Z', c.hairL, 0.85);
      return s;
    },
    headwear(o) {
      const c = CAL;
      let s = glasses(o, { y: 287, gap: 38, rx: 21.5, ry: 21, frame: c.gold, frameS: c.goldS, w: 2.1, templeL: 8, templeR: 9, arch: 5, shine: 0.3 });
      // the long fringe falls over his right eye, in front of the glasses
      s += fp('M268,229 C256,231 242,234 234,242 C222,256 219,284 220,314 C221,346 228,378 237,406 C240,390 243,378 246,366 C249,352 252,334 254,312 C256,292 254,276 253,262 C252,250 257,240 268,229 Z', c.hair);
      s += sp('M240,246 C232,268 230,300 234,340 M246,254 C242,284 242,316 238,356', c.hairM, 1.4, 0.8);
      return s;
    },
    body(o) {
      const c = CAL;
      // oversized jacket: broad, square, padded shoulders
      const T = { sw: 214, drop: 6, top: 444, neckW: 38 };
      const td = torsoD(T), tex = tweedTex(o, c.twL, c.twD);
      let s = tex.def + P.torso({ ...T, fill: c.tw, shadow: c.twS });
      s += fp(td, `url(#${tex.id})`, 0.7);
      // black tee between the open fronts, with a small white crescent moon
      s += fp('M262,448 Q300,472 338,448 L330,690 L336,920 L264,920 L270,690 Z', c.tee);
      s += fp('M300,470 Q324,466 338,448 L330,690 L336,920 L304,920 Z', c.teeS);
      s += `<path d="M318,526 A13,13 0 1 0 318,552 A9.5,13 0 1 1 318,526 Z" fill="${c.moon}" transform="rotate(-22 318 539)"/>`;
      // notched lapels: left lit, right in shadow
      const lapL = 'M262,446 L270,690 L222,516 L233,507 L224,498 L240,460 Z';
      const lapR = 'M338,446 L330,690 L378,516 L367,507 L376,498 L360,460 Z';
      s += fp(lapL, c.twL) + fp(lapR, c.twS);
      s += fp(lapL, `url(#${tex.id})`, 0.6) + fp(lapR, `url(#${tex.id})`, 0.6);
      s += sp('M222,516 L270,690 M378,516 L330,690', c.twD, 2.4, 0.8);
      s += sp('M226,522 L268,684', c.twS, 5, 0.5);
      s += sp('M233,507 L224,498 M367,507 L376,498', c.twD, 2, 0.8);
      // sleeve seams and folds
      s += sp('M104,512 C124,590 134,700 130,920 M496,512 C476,590 466,700 470,920', c.twD, 2.8, 0.55);
      s += sp('M112,500 C150,486 200,474 244,466 M488,500 C450,486 400,474 356,466', c.twD, 2, 0.35);
      s += sp('M380,690 q-8,50 0,100 M420,600 q6,30 2,60', c.twD, 2.4, 0.45);
      return s;
    },
    front(o) {
      const c = CAL;
      // composition notebook pressed to his chest by his right hand
      let s = `<path d="M170,532 L308,516 L330,704 L192,720 Z" fill="#1a1110" opacity="0.32"/>`;
      s += `<g transform="rotate(-8 228 612)">`;
      s += `<rect x="163" y="527" width="136" height="176" rx="2" fill="#e6dec8"/>`;
      const cov = 'M160,524 H296 V700 H160 Z';
      s += fp(cov, '#141416') + clipTo(o, cov, calMarble, 'nb');
      s += `<rect x="160" y="524" width="17" height="176" fill="#0b0b0d"/><path d="M177,524 V700" stroke="#2a2a2e" stroke-width="1.2"/>`;
      s += `<rect x="206" y="547" width="64" height="36" rx="3" fill="#efeadf"/><rect x="206" y="547" width="64" height="7" rx="2" fill="#1d1d22"/><path d="M212,565 h52 M212,575 h52" stroke="#9a948a" stroke-width="1.1"/><path d="M214,571 q4,-6 7,0 t7,0 q3,-5 6,-1" fill="none" stroke="#3a3a48" stroke-width="1.2"/>`;
      // his right hand comes round the spine from behind: knuckles at the edge,
      // four fingers curled over the cover
      s += fp('M163,586 C155,584 150,589 150,595 C147,599 147,605 150,608 C147,612 147,618 150,620 C147,624 147,630 150,633 C148,640 151,646 159,647 L165,647 Z', c.skin);
      s += sp('M151,608 C155,609 158,609 161,608 M151,620 C155,621 158,621 161,620 M151,633 C155,634 158,634 161,633', c.skinS, 1.2, 0.8);
      const finger = (y, len, th) => `<path d="M158,${n(y - th / 2)} H${n(158 + len - th / 2)} A${n(th / 2)},${n(th / 2)} 0 0 1 ${n(158 + len - th / 2)},${n(y + th / 2)} H158 Z" fill="${c.skin}"/>`;
      s += finger(595.5, 28, 10.5) + finger(607, 31, 11) + finger(618.5, 29, 10.5) + finger(629.5, 23, 9.5);
      s += sp('M161,601 h24 M161,612.5 h27 M161,624 h22', c.skinS, 1.3, 0.9);
      s += sp('M160,634.5 h18', c.skinS, 2, 0.55);
      s += sp('M181,592 q3,1 3,4 M187,603 q3,1 3,4 M185,615 q3,1 3,4', '#f7ebe2', 1.2, 0.8);
      s += `</g>`;
      return s;
    },
    draw(o) { return P.draw(o, cal); }
  };
  ART.char('cal', cal);

  /* ================================================================== */
  /* SLOANE — Sloane Ashgrove, 14                                        */
  const SLO = {
    hair: '#c99b5d', hairS: '#a27845', hairL: '#ebcd96', hairD: '#8a6236',
    band: '#1b181e', bandL: '#433c48', bandS: '#0f0d11',
    cream: '#ece0c8', creamS: '#cdbd9f', creamD: '#b6a383',
    blouse: '#f8f5f0', blouseS: '#dcd6cb',
    pearl: '#f6f1e8', pearlS: '#d3cabc'
  };
  const sloane = {
    name: 'Sloane',
    skin: { base: '#f5dccb', shadow: '#d8b3a1', blush: '#e39486' },
    face: { jaw: 0.91, chin: 8, top: 0.96, cheek: -3 },
    eyes: { color: '#7a91a8', size: 1.0, tilt: 3.5, lashes: true, lash: '#2a1f1c', lid: 0.12 },
    brows: { color: '#6c4c30', thick: 0.86, arch: 1.8, len: 1.05, y: -1 },
    nose: { size: 0.95, width: 0.8 },
    mouth: { width: 0.92, lip: '#d0867e', full: 0.55 },
    hairShadow: 'M210,262 C216,230 238,198 270,184 C282,179 292,178 300,178 C308,178 318,179 330,184 C362,198 384,230 390,262 L390,269 C380,238 360,208 330,194 C318,189 308,188 300,188 C292,188 282,189 270,194 C240,208 220,238 210,269 Z',
    hairBack(o) {
      const c = SLO;
      // sleek chin-length bob tucked behind the ears, ends turning in at the jaw
      const bob = 'M207,252 C203,178 240,110 300,106 C360,110 397,178 393,252 C391,290 395,326 399,354 C403,384 399,408 380,420 C366,424 354,418 345,412 L255,412 C246,418 234,424 220,420 C201,408 197,384 201,354 C205,326 209,290 207,252 Z';
      let s = fp(bob, c.hair);
      s += fp('M300,106 C360,110 397,178 393,252 C391,290 395,326 399,354 C403,384 399,408 380,420 C366,424 354,418 345,412 L300,412 Z', c.hairS);
      s += sp('M203,400 C209,413 222,420 238,418 M397,400 C391,413 378,420 362,418', c.hairD, 2.6, 0.8);
      s += sp('M209,330 C206,356 207,380 215,400', c.hairL, 3, 0.8);
      return s;
    },
    hairFront(o) {
      const c = SLO;
      let s = fp('M207,266 C196,222 200,166 233,133 C253,113 277,104 300,104 C323,104 347,113 367,133 C400,166 404,222 393,266 C389,244 381,218 366,200 C348,184 326,180 300,180 C274,180 252,184 234,200 C219,218 211,244 207,266 Z', c.hair);
      s += fp('M352,113 C390,134 404,184 402,232 L393,266 C389,244 381,218 366,200 C362,170 358,140 352,113 Z', c.hairS);
      // smooth, swept back to the headband
      s += sp('M244,196 C252,174 266,156 286,144 M226,236 C228,214 238,196 254,182 M356,196 C348,174 334,156 314,144 M374,236 C372,214 362,196 346,182', c.hairS, 1.5, 0.5);
      s += fp('M232,206 C244,176 268,156 302,150 C278,162 258,180 248,208 Z', c.hairL, 0.9);
      // padded black velvet headband (very 1991), riding up over the crown
      s += fp('M202,248 C196,166 238,104 300,96 C362,104 404,166 398,248 L388,250 C388,182 354,124 300,117 C246,124 212,182 212,250 Z', c.band);
      s += fp('M356,112 C388,136 402,184 398,248 L388,250 C388,204 376,166 350,136 Z', c.bandS);
      s += fp('M213,204 C218,160 250,116 297,104 C262,120 234,156 224,204 Z', c.bandL, 0.9);
      return s;
    },
    headwear(o) {
      const c = SLO;
      return stud(300 - 95 * 0.96, 313, 4.4, c.pearl, c.pearlS) + stud(300 + 95 * 0.96, 313, 4.2, c.pearlS, '#b4ab9e', '#f6f1e8');
    },
    body(o) {
      const c = SLO;
      const T = { sw: 178, drop: 20, top: 448, neckW: 36 };
      let s = P.torso({ ...T, fill: c.cream, shadow: c.creamS });
      // white blouse in the V
      s += fp('M262,450 L338,450 L300,566 Z', c.blouse) + fp('M300,474 L338,450 L300,566 Z', c.blouseS);
      // raised cables down each front and sleeve
      const cl = K.adj(c.cream, 0.3), cd = K.mix(c.cream, c.creamD, 0.7);
      s += cable(244, 500, 920, 20, cl, cd, c.creamD, 22) + cable(356, 500, 920, 20, cl, cd, c.creamD, 22);
      s += cable(152, 560, 920, 14, cl, cd, c.creamD, 18) + cable(450, 560, 920, 14, K.adj(c.creamS, 0.1), K.adj(c.creamS, -0.1), K.adj(c.creamS, -0.16), 18);
      // ribbed V-neck and button band, pearl buttons
      s += sp('M262,450 L300,566 L338,450', c.creamD, 12);
      s += sp('M262,450 L300,566 L338,450', c.cream, 7);
      s += `<rect x="291" y="562" width="18" height="360" fill="${c.creamD}"/><rect x="294" y="562" width="12" height="360" fill="${c.cream}"/>`;
      for (let y = 590; y < 910; y += 48) s += stud(300, y, 4.6, c.pearl, c.pearlS);
      s += sp('M124,540 C144,600 152,700 148,920 M476,540 C456,600 448,700 452,920', c.creamD, 2.2, 0.5);
      return s;
    },
    collar(o) {
      const c = SLO;
      // pointed blouse collar laid over the cardigan's neckline
      return fp('M300,480 L268,452 L256,458 L246,514 L290,490 Z', c.blouse) +
        fp('M300,480 L332,452 L344,458 L354,514 L310,490 Z', c.blouseS) +
        sp('M248,512 L290,490 M352,512 L310,490', K.adj(c.blouseS, -0.12), 1.6, 0.8);
    },
    draw(o) { return P.draw(o, sloane); }
  };
  ART.char('sloane', sloane);

  /* ================================================================== */
  /* WES — Wesley Pike, 15                                               */
  const WES = {
    hair: '#3b2b22', hairS: '#2a1e18', hairL: '#5b473b',
    red: '#a8322b', blk: '#1b1416',
    th: '#8f9195', thS: '#707276', thD: '#5c5e62',
    pencil: '#e5b23c', pencilS: '#b98a24', ferrule: '#c9c3b4', eraser: '#d98a83',
    skin: '#e4ba98', skinS: '#c19275'
  };
  /* where the lower lip sits for each mouth shape (x, dy below the mouth line) */
  const LIP = { neutral: [309, 7], smile: [309, 7.5], grin: [311, 22.5], laugh: [311, 29], frown: [309, 6.5], tight: [309, 6.5], o: [306, 17.5], grimace: [309, 13.5], wobble: [309, 7.5], pursed: [310, 11.5], smirk: [309, 6], line: [309, 6.5], smallsmile: [307, 6], cry: [309, 16] };
  const wesHair = (() => {
    const r = K.rng('wes-buzz');
    let lit = '', dark = '', fuzzL = '', fuzzD = '';
    for (let i = 0; i < 170; i++) {
      const a = Math.PI * (1.04 + r() * 0.92), rr = 0.3 + r() * 0.66;
      const x = 300 + Math.cos(a) * 88 * rr, y = 212 + Math.sin(a) * 86 * rr;
      if (y > 236 || (Math.abs(x - 300) < 70 && y > 176)) continue;
      const ang = Math.atan2(y - 150, x - 300), L = 1.8 + r() * 2.2;
      const d = `M${n(x)},${n(y)} l${n(Math.cos(ang) * L)},${n(Math.sin(ang) * L)} `;
      if (x < 330) lit += d; else dark += d;
    }
    // a short, fuzzy silhouette instead of a hard helmet edge
    for (let i = 0; i <= 64; i++) {
      const t = -0.1 * Math.PI + (i / 64) * 1.2 * Math.PI;
      const x = 300 + 91 * Math.cos(t) + (r() - 0.5) * 2, y = 212 - 94 * Math.sin(t) + (r() - 0.5) * 2;
      const c = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(2 + r() * 1.4)}"/>`;
      if (x > 340) fuzzD += c; else fuzzL += c;
    }
    return { lit, dark, fuzzL, fuzzD };
  })();
  const wesBruise = (() => {
    const r = K.rng('wes-bruise');
    return `<path d="${K.blob(r, 246, 313, 18, 10, { lobes: 5, jag: 0.25, scallop: 0.1 })}" transform="rotate(-14 246 313)" fill="#b3a24e" opacity="0.2"/>` +
      `<path d="${K.blob(r, 249, 314, 9, 5.5, { lobes: 4, jag: 0.3 })}" transform="rotate(-14 249 314)" fill="#8b6878" opacity="0.15"/>`;
  })();
  const wes = {
    name: 'Wes',
    skin: { base: WES.skin, shadow: WES.skinS, blush: '#d27d6a' },
    face: { jaw: 0.97, chin: 6, top: 0.98, cheek: -7 },
    eyes: { color: '#7d7046', size: 0.95, lid: 0.6, bags: 0.55, lashes: false, lash: '#2a1e18' },
    brows: { color: '#3a2a20', thick: 1.1, arch: 0.35, len: 1.05 },
    nose: { size: 1.08, width: 1.0, y: 2 },
    mouth: { width: 0.98, lip: '#b9766a', full: 0.35 },
    hairShadow: 'M218,250 C222,216 248,190 300,184 C352,190 378,216 382,250 L382,255 C376,222 352,196 300,191 C248,196 224,222 218,255 Z',
    // hollow cheeks and a fading bruise on his right cheekbone
    marks: fp('M224,298 C226,326 236,350 256,368 C249,346 245,326 245,306 C238,300 230,297 224,298 Z', WES.skinS, 0.3) +
      fp('M376,298 C374,326 364,350 344,368 C351,346 355,326 355,306 C362,300 370,297 376,298 Z', WES.skinS, 0.34) +
      wesBruise,
    hairBack(o) {
      return fp('M206,272 C198,190 236,124 300,120 C364,124 402,190 394,272 L380,280 L220,280 Z', WES.hairS);
    },
    hairFront(o) {
      const c = WES;
      const scalp = K.mix(c.hair, c.skin, 0.35);
      // growing-out buzz cut: a thin veil at the hairline and sideburns, then the solid cap
      const veil = 'M209,258 C201,212 209,164 240,139 C260,123 280,117 300,117 C320,117 340,123 360,139 C391,164 399,212 391,258 L388,280 L382,280 C382,250 380,224 371,208 C355,192 330,184 300,183 C270,184 245,192 229,208 C220,224 218,250 218,280 L212,280 Z';
      const core = 'M211,240 C204,204 212,164 241,142 C261,127 281,121 300,121 C319,121 339,127 359,142 C388,164 396,204 389,240 L383,240 C381,224 377,212 368,202 C352,187 328,179 300,178 C272,179 248,187 232,202 C223,212 219,224 217,240 Z';
      let s = fp(veil, scalp, 0.6) + fp(core, c.hair);
      s += `<g fill="${c.hair}">${wesHair.fuzzL}</g><g fill="${c.hairS}">${wesHair.fuzzD}</g>`;
      s += fp('M354,128 C386,148 398,190 393,236 L387,240 C384,214 378,200 368,192 C364,170 360,148 354,128 Z', c.hairS);
      s += fp('M240,152 C258,134 282,126 306,126 C284,134 264,146 250,164 Z', c.hairL, 0.5);
      s += sp(wesHair.lit, c.hairL, 1.2, 0.55) + sp(wesHair.dark, '#1c1410', 1.2, 0.55);
      return s;
    },
    headwear(o, ex, spec) {
      const c = WES;
      let s = '';
      // scar through his left brow (viewer's right)
      const b = browAt(spec, ex, 1, 350);
      s += `<path d="M348.5,${n(b.top - 2)} L352.5,${n(b.top - 2)} L351.5,${n(b.bot + 2)} L347.5,${n(b.bot + 2)} Z" fill="${c.skin}"/>`;
      s += sp(`M347,${n(b.top - 7)} L352.5,${n(b.bot + 6)}`, '#f2d2bb', 1.5, 0.85);
      // healing split on the lower lip
      const my = 368 + 6 * 0.45, L = LIP[ex.mouth] || LIP.neutral, lx = L[0], ly = my + L[1];
      s += `<ellipse cx="${n(lx)}" cy="${n(ly)}" rx="5" ry="2.9" fill="#a2504a" opacity="0.38"/>`;
      s += sp(`M${n(lx - 0.6)},${n(ly - 2)} L${n(lx + 0.6)},${n(ly + 2)}`, '#6a2524', 1.8, 0.9);
      // pencil tucked behind his right ear (viewer's left)
      s += `<g transform="rotate(-34 205 268)"><rect x="200" y="210" width="9" height="74" fill="${c.pencil}"/><rect x="205" y="210" width="4" height="74" fill="${c.pencilS}"/>` +
        `<rect x="199.5" y="202" width="10" height="9" fill="${c.ferrule}"/><path d="M199.5,205 h10 M199.5,208 h10" stroke="#8e897e" stroke-width="1"/>` +
        `<path d="M199.5,202 v-7 a5,4 0 0 1 10,0 v7 Z" fill="${c.eraser}"/></g>`;
      s += fp(earD(-1, 0.98), c.skin) + sp(`M${n(300 - 92 * 0.98)},276 q-8,8 -2,22`, c.skinS, 2, 0.7);
      return s;
    },
    body(o) {
      const c = WES;
      const T = { sw: 208, drop: 30, top: 446, neckW: 40 };
      const td = torsoD(T);
      const pB = uid(o, 'plaid'), pL = uid(o, 'plaid'), pR = uid(o, 'plaid'), pS = uid(o, 'plaid'), pK = uid(o, 'plaid'), pC = uid(o, 'plaid');
      let s = `<defs>${plaid(pB, c.red, c.blk, 28, 0, 300, 600)}${plaid(pL, c.red, c.blk, 28, 3, 220, 600, 9)}${plaid(pR, c.red, c.blk, 28, -4, 380, 600, 17)}` +
        `${plaid(pS, c.red, c.blk, 28, -8, 140, 700, 5)}${plaid(pK, c.red, c.blk, 28, 0, 300, 600, 14)}${plaid(pC, c.red, c.blk, 28, 45, 300, 470)}</defs>`;
      let w = fp(td, c.red) + fp(td, `url(#${pB})`);
      // sleeves are their own pieces
      w += fp('M-20,440 L150,480 C140,520 136,560 140,600 C152,700 158,800 156,920 L-20,920 Z', `url(#${pS})`);
      w += fp('M620,440 L450,480 C460,520 464,560 460,600 C448,700 442,800 444,920 L620,920 Z', `url(#${pS})`);
      w += sp('M150,480 C140,520 136,560 140,600 C152,700 158,800 156,920 M450,480 C460,520 464,560 460,600 C448,700 442,800 444,920', c.blk, 2.4, 0.5);
      // grey thermal henley between the open fronts
      const henD = 'M258,448 Q300,474 342,448 L358,920 L242,920 Z';
      w += fp(henD, c.th) + fp('M300,472 Q326,468 342,448 L358,920 L306,920 Z', c.thS);
      const waf = uid(o, 'waffle');
      w += `<defs><pattern id="${waf}" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0,0 H7 M0,0 V7" stroke="#55575b" stroke-width="1"/></pattern></defs>` + fp(henD, `url(#${waf})`, 0.3);
      w += `<rect x="293" y="470" width="14" height="80" fill="${c.thD}"/><rect x="295" y="470" width="10" height="78" fill="${c.th}"/>`;
      for (const y of [486, 508, 530]) w += `<circle cx="300" cy="${y}" r="2.6" fill="#d9d5cc"/>`;
      // open fronts, cut from the same cloth but hanging out of register
      w += fp('M150,480 L262,446 C250,520 244,640 248,920 L156,920 C158,800 152,700 140,600 C136,560 140,520 150,480 Z', `url(#${pL})`);
      w += fp('M450,480 L338,446 C350,520 356,640 352,920 L444,920 C442,800 448,700 460,600 C464,560 460,520 450,480 Z', `url(#${pR})`);
      // chest pockets with flaps
      w += fp('M172,566 H236 V626 H172 Z', `url(#${pK})`) + sp('M172,566 V626 H236 V566', c.blk, 1.6, 0.55);
      w += fp('M364,566 H428 V626 H364 Z', `url(#${pK})`) + sp('M364,566 V626 H428 V566', c.blk, 1.6, 0.55);
      w += fp('M168,556 H240 L238,580 H170 Z', `url(#${pC})`) + fp('M360,556 H432 L430,580 H362 Z', `url(#${pC})`);
      w += fp('M170,580 H238 V586 H170 Z M362,580 H430 V586 H362 Z', c.blk, 0.35);
      w += `<circle cx="204" cy="572" r="3.2" fill="#e8e1d3"/><circle cx="396" cy="572" r="3.2" fill="#e8e1d3"/>`;
      // placket edges and folds
      w += sp('M262,446 C250,520 244,640 248,920 M338,446 C350,520 356,640 352,920', c.blk, 2.2, 0.55);
      w += sp('M206,700 q10,44 4,96 M388,690 q-10,50 0,104 M232,520 q-12,30 -10,64', c.blk, 2.4, 0.4);
      // one shadow tone over the whole shirt
      w += fp(torsoShadowD(T), '#14060c', 0.36);
      s += clipTo(o, td, w, 'shirt');
      // flannel collar points
      s += fp('M262,444 L226,470 L246,522 L276,474 Z', `url(#${pC})`) + fp('M338,444 L374,470 L354,522 L324,474 Z', `url(#${pC})`);
      s += fp('M338,444 L374,470 L354,522 L324,474 Z', '#14060c', 0.36);
      s += sp('M226,470 L246,522 L276,474 M374,470 L354,522 L324,474', c.blk, 2, 0.55);
      return s;
    },
    collar(o) {
      const c = WES;
      // the henley's ribbed neckband
      return fp('M260,454 C268,492 332,492 340,454 L333,455 C324,481 276,481 267,455 Z', c.th) +
        fp('M300,481 C318,481 328,472 333,455 L340,454 C336,478 320,492 300,492 Z', c.thS) +
        sp('M261,457 C270,493 330,493 339,457', c.thD, 1.4, 0.6);
    },
    draw(o) { return P.draw(o, wes); }
  };
  ART.char('wes', wes);

  /* ================================================================== */
  /* JUNE — June Brennan, 14 forever (and her last appearance)          */
  /* Her colors are picked the way an old photo keeps them: a little less
   * saturated, a little cooler. Shadow keys end in S or D. */
  const JUNE_BASE = {
    skin: '#efc8a6', skinS: '#d09d7e', blush: '#da8170', freckle: '#b9805f',
    hair: '#45302a', hairS: '#2f211c', hairL: '#674b3d',
    eye: '#7a5234', lash: '#2b1d17', brow: '#43302a', lip: '#c77f72',
    sw: '#d6a13f', swS: '#b07f2c', swD: '#936821', rib: '#c69435',
    strap: '#1f1d22', strapL: '#3c3a42', buckle: '#a6a39b', buckleD: '#6c6a64'
  };
  const remap = (pal, lit, shade) => {
    const out = {};
    for (const k in pal) out[k] = (/[SD]$/.test(k) ? shade : lit)(pal[k]);
    return out;
  };
  const photo = (c) => K.mix(K.desat(c, 0.22), '#8796ab', 0.07);
  const JP = remap(JUNE_BASE, photo, photo);
  /* the ghost: lit colors paler and greyer; shadows keep their depth but take
   * a faint lantern green */
  const GP = remap(JUNE_BASE, (c) => K.mix(K.desat(photo(c), 0.5), '#e4eaee', 0.18), (c) => K.mix(K.desat(photo(c), 0.5), '#a6e08e', 0.15));
  const juneMarks = (pal, ghost) => {
    const r = K.rng('june-freckles');
    let s = '';
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, fx = 300 + side * (16 + r() * 40), fy = 302 + r() * 26 - Math.abs(fx - 300) * 0.08;
      s += `<circle cx="${n(fx)}" cy="${n(fy)}" r="${n(0.9 + r() * 1.1)}" fill="${pal.freckle}" opacity="${n(ghost ? 0.3 : 0.5 + r() * 0.25)}"/>`;
    }
    if (ghost) s += `<path d="M241,295 C252,307 272,309 285,297 C272,305 254,304 241,295 Z M315,297 C328,309 348,307 359,295 C346,304 328,305 315,297 Z" fill="${K.mix(pal.skinS, '#4a5a6a', 0.35)}" opacity="0.4"/>`;
    return s;
  };
  const june = {
    name: 'June',
    pal: JP,
    skin: { base: JP.skin, shadow: JP.skinS, blush: JP.blush, freckle: JP.freckle },
    face: { jaw: 0.97, chin: 1, top: 1, cheek: 1 },
    eyes: { color: JP.eye, size: 1.02, lashes: true, lash: JP.lash, lid: 0.12 },
    brows: { color: JP.brow, thick: 1.0, arch: 1.05, y: -2 },
    nose: { size: 0.98, width: 0.9 },
    mouth: { width: 0.95, lip: JP.lip, full: 0.45 },
    hairShadow: 'M212,236 C242,233 270,232 300,232 C330,232 358,233 388,236 L388,245 C358,242 330,241 300,241 C270,241 242,242 212,245 Z M216,236 L228,240 C230,270 232,300 230,330 L222,330 Z M384,236 L372,240 C370,270 368,300 370,330 L378,330 Z',
    marks: juneMarks(JP, false),
    hairBack(o, ex, spec) {
      const c = spec.pal;
      return fp('M188,300 C178,200 224,110 300,104 C376,110 422,200 412,300 C414,340 416,374 410,398 C404,412 392,416 380,412 C364,408 350,402 336,398 L264,398 C250,402 236,408 220,412 C208,416 196,412 190,398 C184,374 186,340 188,300 Z', c.hairS);
    },
    hairFront(o, ex, spec) {
      const c = spec.pal;
      // full, round chin-length bob (ends turned under), blunt bangs cut straight across
      let s = fp('M194,404 C184,368 182,320 184,276 C184,196 222,116 300,106 C378,116 416,196 416,276 C418,320 416,368 406,404 C400,414 390,418 378,416 C380,406 380,394 380,382 C379,352 380,320 384,290 C386,262 386,246 384,234 ' +
        'L370,233 L362,235.5 L350,233 L338,235 L326,233 L312,235 L300,233 L288,235 L274,233 L262,235 L250,233 L238,235.5 L228,233 L216,234 ' +
        'C214,246 214,262 216,290 C220,320 221,352 220,382 C220,394 220,406 222,416 C210,418 200,414 194,404 Z', c.hair);
      s += fp('M352,120 C394,142 416,204 416,276 C418,320 416,368 406,404 C400,414 390,418 378,416 C380,406 380,394 380,382 C379,352 380,320 384,290 C388,250 386,212 372,180 C366,160 358,138 352,120 Z', c.hairS);
      s += sp('M252,190 C250,206 249,220 250,232 M276,182 C275,200 274,216 274,232 M300,178 L300,232 M326,182 C327,200 327,216 326,232 M350,190 C351,206 351,220 350,232', c.hairS, 1.5, 0.45);
      s += sp('M222,330 C222,360 222,388 220,408 M378,330 C378,360 378,388 380,408', c.hairS, 1.6, 0.5);
      s += fp('M230,168 C250,140 282,126 316,126 C290,136 262,154 246,180 Z', c.hairL, 0.75);
      s += sp('M200,300 C198,340 200,372 206,402', c.hairL, 2.4, 0.55);
      return s;
    },
    body(o, ex, spec) {
      const c = spec.pal;
      const T = { sw: 186, drop: 18, top: 448, neckW: 38 };
      let s = P.torso({ ...T, fill: c.sw, shadow: c.swS });
      // knit wales, folds, sleeve seams
      let k = '';
      for (let x = 128; x < 480; x += 11) k += `M${x},470 V920 `;
      s += clipTo(o, torsoD(T), sp(k, c.swD, 1.2, 0.14), 'knit');
      s += sp('M124,540 C144,600 152,700 148,920 M476,540 C456,600 448,700 452,920', c.swD, 2.4, 0.5);
      s += sp('M210,720 q10,40 4,90 M386,700 q-8,50 0,100', c.swD, 2.2, 0.4);
      return s;
    },
    collar(o, ex, spec) {
      const c = spec.pal;
      // ribbed crew neck
      let s = fp('M252,450 C264,497 336,497 348,450 L336,452 C326,480 274,480 264,452 Z', c.rib);
      s += fp('M300,480 C318,480 330,470 336,452 L348,450 C342,478 324,496 300,496 Z', c.swS);
      let r = '';
      for (let i = 1; i < 18; i++) {
        const t = i / 18;
        const a = bez([264, 452], [274, 480], [326, 480], [336, 452], t), b = bez([252, 450], [264, 497], [336, 497], [348, 450], t);
        r += `M${n(a[0])},${n(a[1])} L${n(b[0])},${n(b[1])} `;
      }
      s += sp(r, c.swD, 1.3, 0.5);
      return s;
    },
    front(o, ex, spec) {
      const c = spec.pal;
      // cassette-recorder strap across her chest
      let s = sp('M186,470 L474,920', c.strap, 9, 1, 'butt') + sp('M182,472 L470,922', c.strapL, 1.4, 0.7, 'butt');
      s += `<g transform="rotate(57.4 262 590)"><rect x="252" y="582" width="20" height="16" rx="2" fill="${c.buckle}"/><rect x="256" y="586" width="12" height="8" fill="${c.buckleD}"/></g>`;
      return s;
    },
    draw(o) { return P.draw(o, june); }
  };
  ART.char('june', june);

  /* JUNE, last appearance: the same girl, paler, lantern green in her shadows. */
  const june_ghost = Object.assign({}, june, {
    pal: GP,
    skin: { base: GP.skin, shadow: GP.skinS, blush: GP.blush, freckle: GP.freckle },
    eyes: Object.assign({}, june.eyes, { color: GP.eye, lash: GP.lash, bags: 0.85, lid: 0.16 }),
    brows: Object.assign({}, june.brows, { color: GP.brow }),
    mouth: Object.assign({}, june.mouth, { lip: GP.lip, full: 0.3 }),
    marks: juneMarks(GP, true),
    draw(o) { return P.draw(o, june_ghost); }
  });
  ART.char('june_ghost', june_ghost);
})();
