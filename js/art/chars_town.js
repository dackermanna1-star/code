/* What Derry Keeps — townsfolk portraits.
 * Ms. Whitcomb, Mr. Teague, Nate Fortier, Dot Carrier, Constance Ashgrove,
 * Brett Lindqvist, Principal Fenwick, Hannah Gagnon, Mrs. Fennimore.
 * Built on the shared rig in portraits.js: same head geometry, expression set,
 * blink layer and one-tone cel shading (key light upper left, shadow on the
 * viewer's right). hairBack / hairFront / headwear / marks are head-local
 * coordinates (the rig scales that group by headScale about the neck base
 * 300,470); body / behind / collar / front are canvas coordinates. */
(function () {
  'use strict';
  const P = window.PORTRAIT, K = window.KIT, n = K.n;
  const FONT = "'Barlow Condensed','Arial Narrow',sans-serif";

  /* ---------------- shared helpers ---------------- */

  /* The rig's head transform, for collar-level shapes that must sit in head space. */
  const headTf = (spec) => { const hs = spec.headScale || 1.06; return `translate(300 470) scale(${hs}) translate(-300 -470)`; };

  /* Point on a quadratic Bezier. */
  const qpt = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; };

  /* Beads strung along a quadratic curve a -> b (control c). */
  const beads = (a, c, b, count, r, colors) => {
    let s = '';
    for (let i = 0; i <= count; i++) {
      const [x, y] = qpt(a, c, b, i / count);
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${colors[i % colors.length]}"/>`;
    }
    return s;
  };

  /* Scalloped runs for curly edges. Points go clockwise around the shape and
   * each edge bulges outward by amp x its length (a point may carry its own
   * amp as a third value). scallops() continues a path from pts[0]. */
  const scallops = (pts, amp = 0.25) => {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], a = p[2] !== undefined ? p[2] : amp;
      const dx = q[0] - p[0], dy = q[1] - p[1];
      d += ` Q${n((p[0] + q[0]) / 2 + dy * a)},${n((p[1] + q[1]) / 2 - dx * a)} ${n(q[0])},${n(q[1])}`;
    }
    return d;
  };
  const bumpy = (pts, amp = 0.2) => `M${n(pts[0][0])},${n(pts[0][1])}${scallops([...pts, pts[0]], amp)} Z`;

  /* Condensed label for name tags, patches and tee prints. textLength pins the
   * width whatever font the browser falls back to. */
  const label = (x, y, str, { size = 20, w, fill = '#222', weight = 700, op = 1 } = {}) =>
    `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${fill}"` +
    (w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : '') + (op !== 1 ? ` opacity="${op}"` : '') + `>${K.esc(str)}</text>`;

  /* Five-point star. */
  const star = (cx, cy, r, fill, inner = 0.45) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * inner : r;
      d += (i ? 'L' : 'M') + n(cx + Math.cos(a) * rr) + ',' + n(cy + Math.sin(a) * rr);
    }
    return `<path d="${d}Z" fill="${fill}"/>`;
  };

  /* Small brass lantern pin: the Lantern Society's badge. */
  const lanternPin = (x, y, s = 1) => {
    const br = '#dcb65c', brS = '#a57f36', brD = '#5e4519', glass = '#f7ebc4';
    const u = (v) => n(v * s);
    return `<g transform="translate(${n(x)} ${n(y)})">` +
      `<circle cx="0" cy="${u(-16)}" r="${u(3.4)}" fill="none" stroke="${br}" stroke-width="${u(2)}"/>` +
      `<path d="M${u(-9)},${u(-8)} L0,${u(-14)} L${u(9)},${u(-8)} Z" fill="${br}"/>` +
      `<path d="M0,${u(-14)} L${u(9)},${u(-8)} L${u(2)},${u(-8)} Z" fill="${brS}"/>` +
      `<rect x="${u(-8)}" y="${u(-8)}" width="${u(16)}" height="${u(18)}" fill="${brD}"/>` +
      `<rect x="${u(-5.6)}" y="${u(-5.6)}" width="${u(11.2)}" height="${u(13.2)}" fill="${glass}"/>` +
      `<rect x="${u(-1)}" y="${u(-5.6)}" width="${u(2)}" height="${u(13.2)}" fill="${brS}"/>` +
      `<rect x="${u(-10)}" y="${u(10)}" width="${u(20)}" height="${u(4.5)}" rx="${u(1.2)}" fill="${br}"/>` +
      `<rect x="${u(2)}" y="${u(10)}" width="${u(8)}" height="${u(4.5)}" fill="${brS}"/>` +
      `</g>`;
  };

  /* Yellow pencil from the eraser end (x0,y0) toward the point (x1,y1). */
  const pencil = (x0, y0, x1, y1, w = 7) => {
    const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, h = w / 2;
    return `<g transform="translate(${n(x0)} ${n(y0)}) rotate(${n(a)})">` +
      `<rect x="0" y="${-h}" width="8" height="${w}" rx="2.5" fill="#df8d8a"/>` +
      `<rect x="7" y="${-h}" width="7" height="${w}" fill="#bdb8ad"/>` +
      `<rect x="14" y="${-h}" width="${n(L - 28)}" height="${w}" fill="#ebbd40"/>` +
      `<rect x="14" y="${n(h * 0.3)}" width="${n(L - 28)}" height="${n(h * 0.7)}" fill="#c69529"/>` +
      `<path d="M${n(L - 14)},${-h} L${n(L - 3)},-1 L${n(L - 3)},1 L${n(L - 14)},${h} Z" fill="#ecd3a6"/>` +
      `<path d="M${n(L - 6)},-1.6 L${n(L)},0 L${n(L - 6)},1.6 Z" fill="#3a3430"/></g>`;
  };

  /* How far below the mouth line each rig mouth reaches (lips, teeth, lower-lip
   * shading), so facial hair drawn in `marks` can tuck under the mouth. */
  const MOUTH_LOW = { neutral: 13, smile: 10, smallsmile: 8, grin: 28, laugh: 30, frown: 15, tight: 12, o: 16, grimace: 11, wobble: 8, pursed: 9, smirk: 9, line: 12, cry: 14 };
  const mouthLine = (spec) => 368 + ((spec.mouth && spec.mouth.y) || 0) + ((spec.face && spec.face.chin) || 0) * 0.45;

  /* Stippled stubble over the jaw for `marks`; keeps clear of everything the
   * rig's mouths can reach. */
  const stubbleDots = (seed, spec, { count = 140, color = '#6a6670', op = 0.5, r0 = 0.8, r1 = 1.4 } = {}) => {
    const r = K.rng(seed), my = mouthLine(spec), jw = (spec.face && spec.face.jaw) || 1;
    let s = '';
    for (let i = 0, tries = 0; i < count && tries < count * 10; tries++) {
      const x = 300 + (r() * 2 - 1) * 80 * jw, y = 336 + r() * 80;
      if (((x - 300) / (80 * jw)) ** 2 + ((y - 330) / (84 + ((spec.face && spec.face.chin) || 0))) ** 2 > 0.9) continue;
      if (Math.abs(x - 300) < 38 && y > my - 13 && y < my + 34) continue;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r0 + r() * (r1 - r0))}" fill="${color}" opacity="${op}"/>`;
      i++;
    }
    return s;
  };

  /* ================================================================== */
  /* MS. WHITCOMB — Paige Whitcomb, 23, first-year English teacher */
  const WH = { h: '#a84c2a', hs: '#7b321d', hd: '#62281a', hl: '#d27a4b' };
  // bottom edge of the curled bangs, right to left; each span is one curl
  const WH_FRINGE = [[394, 212], [350, 201], [302, 211], [254, 202], [210, 214]];
  const whitcomb = {
    name: 'Ms. Whitcomb',
    skin: { base: '#f5d3b8', shadow: '#dca98c', blush: '#e68a7b' },
    face: { jaw: 1.03, chin: -3, top: 1.0, cheek: 3 },
    eyes: { color: '#8d7b3e', size: 1.07, lashes: true, lash: '#2b1d17' },
    brows: { color: '#7c3b22', thick: 0.88, arch: 1.25, y: -1 },
    nose: { size: 0.9, width: 0.86 },
    mouth: { width: 1.0, lip: '#d0716b', full: 0.6 },
    // the curled bangs cast a scalloped band across the forehead
    hairShadow: 'M206,196 L398,196 L397,228' + scallops(WH_FRINGE.map(([x, y]) => [x + 3, y + 16]), 0.34) + ' Z',
    hairBack(o) {
      const { h, hs, hd } = WH;
      const outline = [
        [300, 78, 0.05], [352, 82, 0.07], [398, 100, 0.09], [430, 138, 0.1], [448, 188, 0.14], [455, 244, 0.2], [458, 300, 0.22],
        [460, 356, 0.22], [460, 410, 0.24], [448, 452, 0.26], [416, 474, 0.2], [384, 460, 0], [300, 452, 0],
        [216, 460, 0.2], [184, 474, 0.26], [152, 452, 0.24], [140, 410, 0.22], [140, 356, 0.22], [142, 300, 0.2],
        [145, 244, 0.14], [152, 188, 0.1], [170, 138, 0.09], [202, 100, 0.07], [248, 82, 0.05]
      ];
      let s = `<path d="${bumpy(outline)}" fill="${h}"/>`;
      // shadow side: the same outer edge on the right, a soft inner boundary
      const right = outline.slice(1, 12).concat([[372, 396, 0], [382, 300, 0], [378, 200, 0], [356, 116, 0]]);
      s += `<path d="${bumpy(right)}" fill="${hs}"/>`;
      // depth behind the jaw and neck
      s += `<path d="M246,340 C250,400 268,444 300,448 C332,444 350,400 354,340 Z" fill="${hd}"/>`;
      // curl hints
      s += `<path d="M166,250 q-12,22 0,46 M158,322 q-12,26 2,52 M170,396 q-10,24 8,44" fill="none" stroke="${hs}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
      s += `<path d="M434,250 q12,22 0,46 M442,322 q12,26 -2,52 M430,396 q10,24 -8,44" fill="none" stroke="${hd}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
      return s;
    },
    hairFront(o) {
      const { h, hs, hd, hl } = WH;
      let s = '';
      // crown behind the bangs; the temples sweep back above the ears so the earrings show
      s += `<path d="M206,272 C186,240 178,176 200,136 C220,100 256,86 300,86 C344,86 384,100 404,136 C426,178 420,242 394,272 C392,252 390,232 386,212 L214,212 C210,232 208,252 206,272 Z" fill="${h}"/>`;
      s += `<path d="M404,136 C426,178 420,242 394,272 C392,252 390,232 386,212 L372,212 C382,184 380,148 360,108 C380,112 396,122 404,136 Z" fill="${hs}"/>`;
      // big teased bangs: a wall of hair standing up off the forehead, its ends rolled under
      const wall = 'M210,214 C196,168 204,108 240,80 C266,60 300,54 334,58 C374,64 402,94 406,138 C409,170 404,196 394,212';
      s += `<path d="${wall}${scallops(WH_FRINGE, 0.34)} Z" fill="${h}"/>`;
      s += `<path d="M334,58 C374,64 402,94 406,138 C409,170 404,196 394,212${scallops(WH_FRINGE.slice(0, 2), 0.34)} C376,160 378,100 334,58 Z" fill="${hs}"/>`;
      // teased roots: strands rising from the roll
      s += `<path d="M236,160 C232,128 244,98 268,80 M262,152 C262,120 276,92 302,76 M292,148 C296,118 312,94 336,82 M324,150 C334,124 352,106 374,100" fill="none" stroke="${hs}" stroke-width="2.2" opacity="0.5"/>`;
      // the roll: separate curls, each turning under, each catching its own light
      const up = WH_FRINGE.slice().reverse().map(([x, y]) => [x, y - 17, -0.28]);
      s += `<path d="M${up[0][0]},${up[0][1]}${scallops(up)} L${WH_FRINGE[0][0]},${WH_FRINGE[0][1]}${scallops(WH_FRINGE, 0.34)} Z" fill="${hs}"/>`;
      let curls = '', splits = '', shine = '';
      for (let i = 0; i < WH_FRINGE.length - 1; i++) {
        const [x0, y0] = WH_FRINGE[i], [x1, y1] = WH_FRINGE[i + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, w = (x0 - x1) / 2;
        curls += `M${n(mx + 13)},${n(my - 9)} C${n(mx + 2)},${n(my - 16)} ${n(mx - 13)},${n(my - 8)} ${n(mx - 7)},${n(my + 5)} `;
        if (i > 0) splits += `M${n(x0)},${n(y0 + 2)} C${n(x0 + 2)},${n(y0 - 14)} ${n(x0 + 6)},${n(y0 - 30)} ${n(x0 + 12)},${n(y0 - 44)} `;
        if (i < 3) shine += `M${n(mx - w * 0.75)},${n(my - 20)} C${n(mx - w * 0.4)},${n(my - 34)} ${n(mx + w * 0.3)},${n(my - 36)} ${n(mx + w * 0.7)},${n(my - 28)} C${n(mx + w * 0.3)},${n(my - 30)} ${n(mx - w * 0.3)},${n(my - 28)} ${n(mx - w * 0.75)},${n(my - 20)} Z `;
      }
      s += `<path d="${splits}" fill="none" stroke="${hs}" stroke-width="2.8" stroke-linecap="round" opacity="0.8"/>`;
      s += `<path d="${curls}" fill="none" stroke="${hd}" stroke-width="2.6" stroke-linecap="round" opacity="0.75"/>`;
      // the highlight, broken across the curls of the roll
      s += `<path d="${shine}" fill="${hl}" opacity="0.9"/>`;
      return s;
    },
    body(o) {
      const c = '#d7a33f', cS = '#ae7f2c', cD = '#8d6423';
      const fl = o.id('floral'), flS = o.id('floralS');
      const flower = (x, y, petal, mid, r) => [0, 72, 144, 216, 288].map((a) => {
        const t = a * Math.PI / 180;
        return `<circle cx="${n(x + Math.cos(t) * r)}" cy="${n(y + Math.sin(t) * r)}" r="${n(r * 0.8)}" fill="${petal}"/>`;
      }).join('') + `<circle cx="${x}" cy="${y}" r="${n(r * 0.6)}" fill="${mid}"/>`;
      const tile = (bg, a, b, leaf) => `<rect width="44" height="44" fill="${bg}"/>` + flower(11, 12, a, b, 3.6) + flower(33, 32, b, a, 3.2) +
        `<ellipse cx="22" cy="20" rx="4.5" ry="2" fill="${leaf}" transform="rotate(-30 22 20)"/><ellipse cx="4" cy="36" rx="4" ry="1.8" fill="${leaf}" transform="rotate(25 4 36)"/>`;
      let s = `<defs><pattern id="${fl}" width="44" height="44" patternUnits="userSpaceOnUse">${tile('#2c3b63', '#d98f8c', '#ebe0c6', '#6f805e')}</pattern>` +
        `<pattern id="${flS}" width="44" height="44" patternUnits="userSpaceOnUse">${tile('#1f2b4b', '#a46a70', '#b3a993', '#4c5a44')}</pattern></defs>`;
      s += P.torso({ sw: 206, drop: 30, top: 452, fill: c, shadow: cS, neckW: 38 });
      // navy floral dress between the open cardigan fronts
      s += `<path d="M256,452 Q300,480 344,452 L364,920 L236,920 Z" fill="url(#${fl})"/>`;
      s += `<path d="M300,476 Q326,472 344,452 L364,920 L312,920 Z" fill="url(#${flS})"/>`;
      // big open cardigan fronts with ribbed button bands
      s += `<path d="M256,452 C238,520 232,700 236,920 L168,920 C170,740 180,600 196,520 C210,484 230,462 256,452 Z" fill="${c}"/>`;
      s += `<path d="M344,452 C362,520 368,700 364,920 L432,920 C430,740 420,600 404,520 C390,484 370,462 344,452 Z" fill="${cS}"/>`;
      s += `<path d="M252,470 C238,540 234,700 238,920 M348,470 C362,540 366,700 362,920" fill="none" stroke="${cD}" stroke-width="2.4" opacity="0.5"/>`;
      s += `<path d="M242,490 C232,560 228,720 230,920" fill="none" stroke="${cD}" stroke-width="2" opacity="0.4"/>`;
      for (let y = 560; y < 900; y += 78) s += `<circle cx="${n(236 - (y - 560) * 0.012)}" cy="${y}" r="5.5" fill="#efe1bd"/><circle cx="${n(236 - (y - 560) * 0.012)}" cy="${y}" r="5.5" fill="none" stroke="${cD}" stroke-width="1.4" opacity="0.6"/>`;
      // cable knit columns
      const cable = (x, col, op) => {
        let d = '';
        for (let y = 520; y < 900; y += 30) d += `M${x},${y} c9,8 9,22 0,30 M${x},${y} c-9,8 -9,22 0,30 `;
        return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" opacity="${op}"/>`;
      };
      s += cable(206, cD, 0.42) + cable(394, cD, 0.5);
      // dropped shoulder seams, folds
      s += `<path d="M150,486 C170,560 172,700 166,920 M450,486 C430,560 428,700 434,920" fill="none" stroke="${cD}" stroke-width="3" opacity="0.5"/>`;
      s += `<path d="M118,640 q14,50 6,110 M478,630 q-12,56 -2,120" fill="none" stroke="${cD}" stroke-width="2.6" opacity="0.45"/>`;
      return s;
    },
    collar(o) {
      const { h, hs, hd } = WH;
      const cr = '#efe6d2', crS = '#cdbfa6';
      let s = '';
      // Peter Pan collar on the dress
      s += `<path d="M262,454 C270,470 284,480 300,482 C300,494 292,506 278,506 C262,506 250,494 250,478 C250,468 254,460 262,454 Z" fill="${cr}"/>`;
      s += `<path d="M338,454 C330,470 316,480 300,482 C300,494 308,506 322,506 C338,506 350,494 350,478 C350,468 346,460 338,454 Z" fill="${crS}"/>`;
      // curls resting on the shoulders
      s += `<path d="${bumpy([[206, 430, 0.18], [226, 452, 0.2], [222, 488, 0.24], [206, 520, 0.24], [182, 532, 0.2], [164, 508, 0.2], [164, 470, 0.2], [180, 440, 0.18]])}" fill="${h}"/>`;
      s += `<path d="M196,452 q-12,24 -2,50" fill="none" stroke="${hs}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
      s += `<path d="${bumpy([[394, 430, 0.18], [420, 440, 0.18], [436, 470, 0.2], [436, 508, 0.2], [418, 532, 0.2], [394, 520, 0.24], [378, 488, 0.24], [374, 452, 0.2]])}" fill="${hs}"/>`;
      s += `<path d="M404,452 q12,24 2,50" fill="none" stroke="${hd}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
      return s;
    },
    headwear(o) {
      // dangly moon-and-star earrings
      const drop = (x, y, g, gD) => {
        const mx = x + 4;
        return `<path d="M${x},${y} v10" stroke="${gD}" stroke-width="1.8"/>` +
          `<path d="M${mx},${y + 10} A12,12 0 1 0 ${mx},${y + 32} A14,14 0 0 1 ${mx},${y + 10} Z" fill="${g}"/>` +
          `<path d="M${x - 3},${y + 33} v7" stroke="${gD}" stroke-width="1.5"/>` + star(x - 3, y + 46, 7, g);
      };
      return drop(205, 318, '#f2c95c', '#9a7428') + drop(395, 318, '#c99a3c', '#7a5a1e');
    },
    draw(o) { return P.draw(o, whitcomb); }
  };
  ART.char('whitcomb', whitcomb);

  /* ================================================================== */
  /* MR. TEAGUE — night janitor, 68, Korean War vet */
  const teague = {
    name: 'Mr. Teague',
    age: 1.0,
    blush: 0.3,
    skin: { base: '#d9a285', shadow: '#b47c63', blush: '#c55f56' },
    face: { jaw: 1.02, chin: 7, top: 0.98, cheek: -3 },
    eyes: { color: '#9dbcd2', size: 0.88, lid: 0.7, bags: 0.9, lash: '#2a1d1a', y: 2 },
    brows: { color: '#a29d95', thick: 1.5, len: 1.14, arch: 0.35, y: 4 },
    nose: { size: 1.24, width: 1.45, y: 5 },
    mouth: { width: 0.9, lip: '#b47566', full: 0.08, y: 3 },
    stubble: '#5f5c66',
    neck: { w: 1.08 },
    hairShadow: 'M236,182 C258,170 280,166 300,168 C320,166 342,170 364,182 L366,192 C344,182 322,178 300,180 C278,178 256,182 234,192 Z',
    hairBack(o) {
      const sk = teague.skin;
      let s = '';
      // scalp under the thinning crew cut
      s += `<path d="M206,250 C200,164 242,114 300,114 C358,114 400,164 394,250 Z" fill="${sk.base}"/>`;
      s += `<path d="M350,122 C384,140 400,190 394,250 L376,250 C380,200 372,154 350,122 Z" fill="${sk.shadow}"/>`;
      // big ears (the rig's ears draw over these, so only the extra size shows)
      s += `<path d="M380,262 C398,236 426,252 424,290 C423,320 410,342 392,338 C386,336 382,330 381,324 Z" fill="${sk.shadow}"/>`;
      s += `<path d="M220,262 C202,236 174,252 176,290 C177,320 190,342 208,338 C214,336 218,330 219,324 Z" fill="${sk.base}"/>`;
      return s;
    },
    hairFront(o) {
      const g = '#aaa69f', gS = '#7f7b75', gL = '#dcd8d0', gD = '#66625d';
      // thinning grey crew cut: short bristle over the scalp, hairline receding at the temples
      const cap = 'M212,252 C206,212 208,166 230,138 C250,122 276,117 300,117 C324,117 350,122 370,138 C392,166 394,212 388,252 L382,250 C382,228 378,208 368,196 C356,190 346,192 338,180 C328,166 314,160 300,162 C286,160 272,166 262,180 C254,192 244,190 232,196 C222,208 218,228 218,250 Z';
      const clip = o.id('crew');
      let s = `<clipPath id="${clip}"><path d="${cap}"/></clipPath>`;
      s += `<path d="${cap}" fill="${g}" opacity="0.62"/>`;
      s += `<g clip-path="url(#${clip})"><path d="M348,112 C390,140 402,200 392,262 L430,262 L430,100 Z" fill="${gS}" opacity="0.75"/>`;
      const r = K.rng('teague-crew');
      let lit = '', dark = '';
      for (let y = 118; y < 254; y += 5) {
        for (let x = 206; x < 396; x += 5) {
          const xx = x + (r() - 0.5) * 3, yy = y + (r() - 0.5) * 3, seg = `M${n(xx)},${n(yy)} l${n((xx - 300) * 0.012)},-3.6 `;
          if (xx > 352 + (yy - 118) * 0.12) dark += seg; else lit += seg;
        }
      }
      s += `<path d="${lit}" stroke="${gL}" stroke-width="1.3" stroke-linecap="round" opacity="0.42"/><path d="${dark}" stroke="${gD}" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/></g>`;
      // bristles standing up along the flat top
      let br = '', brS = '';
      for (let x = 240; x <= 360; x += 4) {
        const t = (x - 300) / 64, y = 118 + t * t * 14;
        const seg = `M${x},${n(y + 3)} l${n(t * 1.5)},-5 `;
        if (x < 344) br += seg; else brS += seg;
      }
      s += `<path d="${br}" stroke="${gL}" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/><path d="${brS}" stroke="${gS}" stroke-width="1.8" stroke-linecap="round"/>`;
      return s;
    },
    body(o) {
      const sh = '#33425f', shS = '#25314a', shD = '#1a2337', tee = '#e6e0d3', teeS = '#c4beb2';
      let s = P.torso({ sw: 200, drop: 34, top: 452, fill: sh, shadow: shS, neckW: 38 });
      // inside of the collar band behind the neck
      s += `<path d="M260,430 C272,416 328,416 340,430 L344,466 L256,466 Z" fill="${shD}"/>`;
      // undershirt in the open collar
      s += `<path d="M264,452 L300,526 L336,452 Z" fill="${tee}"/><path d="M300,470 L336,452 L300,526 Z" fill="${teeS}"/>`;
      // placket and buttons
      s += `<path d="M294,526 L294,920 M306,526 L306,920" stroke="${shD}" stroke-width="2" opacity="0.6"/>`;
      for (const y of [556, 636, 716, 796]) s += `<circle cx="300" cy="${y}" r="4.6" fill="#c9cdd3"/>`;
      // a pipe in the left pocket, its bent stem poking out
      s += `<path d="M241,610 L241,566 C241,560 245,557 249,557 C253,557 257,560 257,566 L257,610 Z" fill="#76412a"/>`;
      s += `<path d="M251,557 C255,558 257,561 257,566 L257,610 L251,610 Z" fill="#4e2918"/>`;
      s += `<rect x="242.5" y="549" width="13" height="9" rx="2.5" fill="#cfc9bc"/>`;
      s += `<path d="M244.5,551 C244,537 240,526 231,516 L238,510 C248,520 253,535 254,551 Z" fill="#1d1a18"/>`;
      s += `<path d="M228,518 l10,-10 l3.5,3.5 l-10,10 Z" fill="#1d1a18"/>`;
      s += `<path d="M247.5,546 C247,535 244,527 238,519" fill="none" stroke="#77716a" stroke-width="1.6"/>`;
      // left pocket (no flap)
      s += `<path d="M196,584 h70 v68 l-35,8 l-35,-8 Z" fill="${sh}"/><path d="M196,584 h70" stroke="${shD}" stroke-width="3"/>`;
      s += `<path d="M196,584 v68 l35,8 l35,-8 v-68" fill="none" stroke="${shD}" stroke-width="1.6" opacity="0.6"/>`;
      // right pocket with flap
      s += `<path d="M336,596 h70 v62 l-35,8 l-35,-8 Z" fill="${shD}" opacity="0.55"/><path d="M332,584 h78 l-2,22 l-37,6 l-37,-6 Z" fill="${shD}"/><circle cx="371" cy="602" r="3.4" fill="#8d939b"/>`;
      // sleeve seams + folds
      s += `<path d="M126,520 C146,600 154,700 150,920 M474,520 C454,600 446,700 450,920" fill="none" stroke="${shD}" stroke-width="3" opacity="0.55"/>`;
      s += `<path d="M232,700 q10,40 4,90 M368,690 q-8,50 0,100 M300,560 q-26,30 -40,40" fill="none" stroke="${shD}" stroke-width="2.6" opacity="0.5"/>`;
      return s;
    },
    collar(o) {
      const sh = '#33425f', shS = '#25314a', shD = '#1a2337', tee = '#e6e0d3', teeS = '#c4beb2', sk = teague.skin;
      let s = '';
      // neck folds
      s += `<path d="M284,404 C282,420 284,436 288,450 M316,404 C318,420 316,436 312,450" fill="none" stroke="${sk.shadow}" stroke-width="2.4" opacity="0.7"/>`;
      // crew neck of the undershirt
      s += `<path d="M262,444 Q300,472 338,444 L341,458 Q300,490 259,458 Z" fill="${tee}"/><path d="M300,476 Q322,470 338,444 L341,458 Q322,482 300,486 Z" fill="${teeS}"/>`;
      // spread work-shirt collar
      s += `<path d="M266,418 C256,436 244,456 236,472 L222,526 L262,506 L296,488 C282,474 272,452 272,430 Z" fill="${sh}"/>`;
      s += `<path d="M334,418 C344,436 356,456 364,472 L378,526 L338,506 L304,488 C318,474 328,452 328,430 Z" fill="${shS}"/>`;
      s += `<path d="M236,472 L222,526 L262,506" fill="none" stroke="${shD}" stroke-width="2" opacity="0.5"/>`;
      return s;
    },
    front(o) {
      let s = '';
      // oval name patch over the right pocket
      s += `<ellipse cx="371" cy="552" rx="40" ry="18" fill="#9c362e"/><ellipse cx="371" cy="552" rx="36.5" ry="14.5" fill="#d9d3c4"/>`;
      s += label(371, 559.5, 'TEAGUE', { size: 21, w: 52, fill: '#9c362e' });
      // ring of keys clipped to the pocket flap
      const x = 344, y = 600, ring = '#b7bcc2', steel = '#a3aab1', brass = '#c9a24e', dark = '#4d535a';
      s += `<rect x="${x - 3.5}" y="${y - 14}" width="7" height="16" rx="2.5" fill="${dark}"/>`;
      s += `<circle cx="${x}" cy="${y + 12}" r="11" fill="none" stroke="${ring}" stroke-width="2.6"/>`;
      const key = (ang, len, col, round) => `<g transform="rotate(${ang} ${x} ${y + 23})">` +
        (round ? `<circle cx="${x}" cy="${y + 30}" r="6.5" fill="${col}"/>` : `<rect x="${x - 6}" y="${y + 24}" width="12" height="12" rx="3" fill="${col}"/>`) +
        `<circle cx="${x}" cy="${y + 29}" r="2" fill="${dark}"/>` +
        `<path d="M${x - 2.2},${y + 35} h4.4 v${len} l-2.2,3 l-2.2,-3 Z" fill="${col}"/>` +
        `<path d="M${x + 2.2},${y + 43} h3 v3 h-3 Z M${x + 2.2},${y + 50} h4 v3 h-4 Z" fill="${col}"/></g>`;
      s += key(32, 22, steel, true) + key(14, 26, brass, false) + key(-2, 24, steel, false) + key(-18, 20, brass, true) + key(-34, 18, steel, true);
      return s;
    },
    draw(o) { return P.draw(o, teague); }
  };
  // deep-set eyes, bulbous nose, the folds of his big ears, grey stubble
  teague.marks = '<ellipse cx="262" cy="276" rx="27" ry="12" fill="#b47c63" opacity="0.5"/><ellipse cx="338" cy="276" rx="27" ry="12" fill="#a06a54" opacity="0.6"/>' +
    '<ellipse cx="304" cy="336" rx="15" ry="11" fill="#c55f56" opacity="0.26"/><ellipse cx="297" cy="331" rx="5" ry="3.2" fill="#f0c4a6" opacity="0.6"/>' +
    '<path d="M190,264 C180,280 182,312 196,326" fill="none" stroke="#b47c63" stroke-width="2.4" opacity="0.8"/>' +
    '<path d="M410,264 C420,280 418,312 404,326" fill="none" stroke="#8f5e4a" stroke-width="2.4" opacity="0.8"/>' +
    stubbleDots('teague-stubble', teague, { count: 170, color: '#7a7680', op: 0.5, r0: 0.7, r1: 1.2 });
  ART.char('teague', teague);

  /* ================================================================== */
  /* NATE FORTIER — 23, behind the counter at Low Tide Records */
  const NT = { h: '#5f4431', hs: '#432f22', hd: '#33241a', hl: '#80604a' };
  const nateBeard = (spec, ex) => {
    const my = mouthLine(spec), low = my + (MOUTH_LOW[ex.mouth] || 14) + 2, chinY = 410 + spec.face.chin;
    const c = '#553a29', cS = '#3f2a1d';
    let s = '';
    // mustache: kept above the mouth line
    s += `<path d="M274,${n(my - 9)} C280,${n(my - 18)} 290,${n(my - 22)} 300,${n(my - 19)} C310,${n(my - 22)} 320,${n(my - 18)} 326,${n(my - 9)} C318,${n(my - 12)} 308,${n(my - 13)} 300,${n(my - 11)} C292,${n(my - 13)} 282,${n(my - 12)} 274,${n(my - 9)} Z" fill="${c}"/>`;
    s += `<path d="M300,${n(my - 19)} C310,${n(my - 22)} 320,${n(my - 18)} 326,${n(my - 9)} C318,${n(my - 12)} 308,${n(my - 13)} 300,${n(my - 11)} Z" fill="${cS}"/>`;
    // chin goatee, tucked under whatever the mouth is doing
    if (chinY - low > 5) {
      const mid = low + (chinY - low) * 0.45;
      s += `<path d="${bumpy([[284, low, 0.12], [300, low - 1, 0.12], [316, low, 0.14], [323, mid, 0.14], [318, chinY + 1, 0.14], [300, chinY + 5, 0.14], [282, chinY + 1, 0.14], [277, mid, 0.14]])}" fill="${c}"/>`;
      s += `<path d="M306,${n(low + 2)} C318,${n(low + 6)} 322,${n(chinY - 6)} 316,${n(chinY + 1)} C312,${n(chinY + 4)} 306,${n(chinY + 4)} 300,${n(chinY + 5)} C306,${n(chinY - 6)} 310,${n(low + 10)} 306,${n(low + 2)} Z" fill="${cS}"/>`;
    }
    return s;
  };
  const nate = {
    name: 'Nate',
    skin: { base: '#e9c09e', shadow: '#c6957a', blush: '#d98272' },
    face: { jaw: 1.0, chin: 6, top: 0.98, cheek: -2 },
    eyes: { color: '#6b4025', size: 0.96, lid: 0.3, lash: '#2a1d1a' },
    brows: { color: '#4b3222', thick: 1.1, arch: 0.75, y: 1 },
    nose: { size: 1.06, width: 1.02, y: 1 },
    mouth: { width: 1.0, lip: '#c07a6c', full: 0.35, y: 1 },
    stubble: '#4a3426',
    hairShadow: 'M200,208 C240,200 360,200 400,208 L400,232 C360,222 240,222 200,232 Z',
    hairBack(o) {
      const { h, hs } = NT;
      let s = `<path d="M200,196 C192,250 190,320 192,380 C194,420 190,450 186,478 L414,478 C410,450 406,420 408,380 C410,320 408,250 400,196 Z" fill="${hs}"/>`;
      s += `<path d="M200,196 C192,250 190,320 192,380 C194,420 190,450 186,478 L228,478 C222,420 220,320 224,214 Z" fill="${h}"/>`;
      return s;
    },
    hairFront(o) {
      const { h, hs, hd } = NT;
      let s = '';
      // left side tucked behind the ear (the hoop shows); right side falls over the ear
      s += `<path d="M202,212 C214,212 222,218 224,230 C218,246 212,256 208,268 C202,252 200,232 202,212 Z" fill="${h}"/>`;
      s += `<path d="M376,212 C398,214 404,250 404,300 C404,350 400,390 396,430 L372,430 C378,388 382,340 382,296 C382,262 380,236 376,212 Z" fill="${hs}"/>`;
      s += `<path d="M388,240 C392,290 392,350 386,420" fill="none" stroke="${hd}" stroke-width="2" opacity="0.6"/>`;
      // a few strands loose under the cuff
      s += `<path d="M268,212 C260,224 254,238 252,252 M330,212 C340,226 346,240 348,254" fill="none" stroke="${h}" stroke-width="3" stroke-linecap="round"/>`;
      s += `<path d="M282,212 C278,222 276,230 276,240" fill="none" stroke="${hs}" stroke-width="2.2" stroke-linecap="round"/>`;
      return s;
    },
    body(o) {
      const pl = o.id('plaid'), plS = o.id('plaidS');
      const tile = (bg, tan, dk, ln) => `<rect width="60" height="60" fill="${bg}"/>` +
        `<rect width="16" height="60" fill="${tan}" opacity="0.5"/><rect width="60" height="16" fill="${tan}" opacity="0.5"/>` +
        `<rect x="30" width="10" height="60" fill="${dk}" opacity="0.6"/><rect y="30" width="60" height="10" fill="${dk}" opacity="0.6"/>` +
        `<rect x="50" width="2.4" height="60" fill="${ln}" opacity="0.6"/><rect y="50" width="60" height="2.4" fill="${ln}" opacity="0.6"/>`;
      let s = `<defs><pattern id="${pl}" width="60" height="60" patternUnits="userSpaceOnUse">${tile('#536e49', '#b19b72', '#334a2f', '#c8b690')}</pattern>` +
        `<pattern id="${plS}" width="60" height="60" patternUnits="userSpaceOnUse">${tile('#3c5236', '#86744f', '#24331f', '#9a8a66')}</pattern></defs>`;
      s += P.torso({ sw: 196, drop: 22, top: 448, fill: `url(#${pl})`, shadow: `url(#${plS})`, neckW: 38 });
      // faded black band tee
      const tee = '#312f34', teeS = '#252328';
      s += `<path d="M258,450 Q300,474 342,450 L362,920 L238,920 Z" fill="${tee}"/>`;
      s += `<path d="M300,472 Q324,468 342,450 L362,920 L314,920 Z" fill="${teeS}"/>`;
      s += `<path d="M262,452 Q300,480 338,452" fill="none" stroke="#3e3c42" stroke-width="6"/>`;
      // band print, its right edge tucked under the flannel
      s += `<path d="M268,524 l12,-10 l9,12 l11,-14 l9,14 l11,-12 l9,12 l11,-10 l9,8 l11,-6 l10,6" fill="none" stroke="#cfc6b4" stroke-width="3" opacity="0.6"/>`;
      s += label(308, 568, 'STATIC', { size: 34, w: 124, fill: '#d2c9b6', op: 0.72 });
      s += label(306, 602, 'HOURS', { size: 30, w: 102, fill: '#d2c9b6', op: 0.72 });
      // open flannel fronts
      s += `<path d="M256,448 C240,520 236,660 240,920 L176,920 C178,740 186,600 200,520 C212,484 230,462 256,448 Z" fill="url(#${pl})"/>`;
      s += `<path d="M344,448 C360,520 364,660 360,920 L424,920 C422,740 414,600 400,520 C388,484 370,462 344,448 Z" fill="url(#${plS})"/>`;
      s += `<path d="M252,462 C238,530 234,670 238,920 M348,462 C362,530 366,670 362,920" fill="none" stroke="#2a3a26" stroke-width="2.4" opacity="0.6"/>`;
      for (const y of [560, 640, 720, 800]) s += `<circle cx="${n(230 - (y - 560) * 0.02)}" cy="${y}" r="4" fill="#d8d0bc"/>`;
      // seams and folds
      s += `<path d="M124,520 C144,600 152,700 148,920 M476,520 C456,600 448,700 452,920" fill="none" stroke="#24331f" stroke-width="3" opacity="0.6"/>`;
      s += `<path d="M206,690 q10,40 4,90 M392,680 q-8,50 0,100" fill="none" stroke="#24331f" stroke-width="2.6" opacity="0.5"/>`;
      return s;
    },
    collar(o) {
      const { h, hs, hd, hl } = NT;
      const pl = o.id('plaidC'), plS = o.id('plaidCS');
      let s = `<defs><pattern id="${pl}" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#536e49"/><rect width="8" height="30" fill="#b19b72" opacity="0.5"/><rect width="30" height="8" fill="#b19b72" opacity="0.5"/><rect x="16" width="5" height="30" fill="#334a2f" opacity="0.6"/></pattern>` +
        `<pattern id="${plS}" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#3c5236"/><rect width="8" height="30" fill="#86744f" opacity="0.5"/><rect width="30" height="8" fill="#86744f" opacity="0.5"/><rect x="16" width="5" height="30" fill="#24331f" opacity="0.6"/></pattern></defs>`;
      // flannel collar points
      s += `<path d="M262,438 C250,454 238,468 228,482 L216,532 L252,508 L272,480 C266,468 262,454 264,440 Z" fill="url(#${pl})"/>`;
      s += `<path d="M338,438 C350,454 362,468 372,482 L384,532 L348,508 L328,480 C334,468 338,454 336,440 Z" fill="url(#${plS})"/>`;
      // long straight hair falling in front of the shoulders
      s += `<path d="M190,376 C180,436 182,522 190,598 L199,610 L207,597 L215,612 L224,598 L234,607 C238,520 236,448 240,402 Z" fill="${h}"/>`;
      s += `<path d="M204,410 C200,470 202,540 208,600 M222,420 C220,480 222,540 226,600" fill="none" stroke="${hs}" stroke-width="2" opacity="0.55"/>`;
      s += `<path d="M195,392 C191,430 191,470 195,510" fill="none" stroke="${hl}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
      s += `<path d="M410,376 C420,436 418,522 410,598 L401,610 L393,597 L385,612 L376,598 L366,607 C362,520 364,448 360,402 Z" fill="${hs}"/>`;
      s += `<path d="M396,410 C400,470 398,540 392,600 M378,420 C380,480 378,540 374,600" fill="none" stroke="${hd}" stroke-width="2" opacity="0.6"/>`;
      return s;
    },
    headwear(o) {
      const b = '#45474e', bS = '#30323a', bD = '#26272d', bL = '#5d5f67';
      let s = '';
      // knit beanie: dome, ribs, folded cuff
      s += `<path d="M196,204 C188,138 230,82 300,80 C370,80 412,138 404,204 Z" fill="${b}"/>`;
      s += `<path d="M300,80 C370,80 412,138 404,204 L366,204 C378,150 356,104 300,80 Z" fill="${bS}"/>`;
      s += `<path d="M250,92 C236,124 230,160 232,196 M276,84 C268,120 266,160 268,196 M324,84 C332,120 334,160 332,196 M350,92 C364,124 370,160 368,196" fill="none" stroke="${bD}" stroke-width="2" opacity="0.6"/>`;
      s += `<path d="M236,112 C252,94 274,86 296,84 C276,94 258,106 246,124 Z" fill="${bL}" opacity="0.8"/>`;
      s += `<path d="M192,192 C232,172 368,172 408,192 L410,226 C368,208 232,208 190,226 Z" fill="${b}"/>`;
      s += `<path d="M356,178 C380,181 396,186 408,192 L410,226 C396,219 378,213 352,209 Z" fill="${bS}"/>`;
      let rib = '';
      for (let x = 200; x <= 400; x += 8) {
        const t = (x - 300) / 110, y0 = 176 + t * t * 18, y1 = 208 + t * t * 18;
        rib += `M${x},${n(y0)} L${x},${n(y1)} `;
      }
      s += `<path d="${rib}" stroke="${bD}" stroke-width="1.6" opacity="0.55"/>`;
      // one small silver hoop in his right ear
      s += `<circle cx="206" cy="327" r="6.5" fill="none" stroke="#d9dee2" stroke-width="2.6"/><path d="M201,323 a6.5,6.5 0 0 1 6,-2.4" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.8"/>`;
      return s;
    },
    // the goatee follows the mouth, so `marks` is rebuilt for each expression
    draw(o) { nate.marks = nateBeard(nate, P.EXPR[o.expr] || P.EXPR.neutral); return P.draw(o, nate); }
  };
  nate.marks = nateBeard(nate, P.EXPR.neutral);
  ART.char('nate', nate);

  /* ================================================================== */
  /* DOT CARRIER — 64, owner of Dot's Diner */
  const DT = { r: '#c8412d', rS: '#952a1e', rD: '#731e15', rL: '#e4673f', root: '#bab1a8' };
  const dot = {
    name: 'Dot',
    age: 0.85,
    blush: 0.35,
    skin: { base: '#f0c6aa', shadow: '#d09c82', blush: '#e27a74' },
    face: { jaw: 1.05, chin: 1, top: 1.0, cheek: 5 },
    eyes: { color: '#6b4c34', size: 0.95, lashes: true, lash: '#1e1416', lid: 0.2, bags: 0.4 },
    brows: { color: '#9a4a34', thick: 0.7, arch: 1.5, y: -3 },
    nose: { size: 1.0, width: 1.05 },
    mouth: { width: 1.04, lip: '#e2705c', full: 0.85, line: '#b24a3c' },
    hairShadow: 'M212,200 C240,184 270,178 300,178 C330,178 360,184 388,200 L390,214 C362,198 330,192 300,192 C270,192 240,198 212,214 Z',
    // powder-blue eyeshadow (drawn under the eyes and brows)
    marks: '<path d="M240,284 C244,266 256,258 268,258 C280,258 290,266 292,278 C284,270 274,268 264,268 C254,268 246,274 240,284 Z" fill="#6f9fd0" opacity="0.55"/>' +
      '<path d="M360,284 C356,266 344,258 332,258 C320,258 310,266 308,278 C316,270 326,268 336,268 C346,268 354,274 360,284 Z" fill="#5d8bbb" opacity="0.6"/>',
    hairBack(o) {
      const { r, rS, rD } = DT;
      // teased bouffant: wide at the temples, the ends curled under at the jaw
      let s = `<path d="M300,42 C380,40 436,96 438,172 C440,224 432,262 420,292 C412,314 414,332 404,344 C392,356 372,352 366,336 L234,336 C228,352 208,356 196,344 C186,332 188,314 180,292 C168,262 160,224 162,172 C164,96 220,40 300,42 Z" fill="${r}"/>`;
      s += `<path d="M300,42 C380,40 436,96 438,172 C440,224 432,262 420,292 C412,314 414,332 404,344 C392,356 372,352 366,336 L362,304 C394,264 406,196 392,132 C380,86 346,56 300,42 Z" fill="${rS}"/>`;
      s += `<path d="M232,320 L368,320 L366,336 L234,336 Z" fill="${rD}"/>`;
      s += `<path d="M184,298 C190,326 206,344 232,338 M416,298 C410,326 394,344 368,338" fill="none" stroke="${rD}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`;
      s += `<path d="M174,186 C170,226 176,266 188,292 M426,186 C430,226 424,266 412,292" fill="none" stroke="${rD}" stroke-width="2.4" opacity="0.45"/>`;
      // pencil resting behind her right ear
      s += pencil(164, 246, 226, 274, 7.5);
      return s;
    },
    hairFront(o) {
      const { r, rS, rL, root } = DT;
      let s = '';
      // the dome swept up and back off the forehead
      s += `<path d="M212,232 C196,184 200,104 252,66 C282,46 328,46 356,60 C406,86 416,170 390,232 C388,212 382,198 372,190 C350,178 326,174 300,174 C272,174 248,180 228,192 C218,202 214,216 212,232 Z" fill="${r}"/>`;
      s += `<path d="M356,60 C406,86 416,170 390,232 C388,212 382,198 372,190 C386,150 382,102 340,58 C346,58 351,59 356,60 Z" fill="${rS}"/>`;
      // grey roots showing at the hairline
      s += `<path d="M213,228 C215,210 222,198 232,191 C254,180 276,176 300,176 C326,176 350,180 372,191 C382,198 387,210 389,228 C383,212 375,202 365,197 C344,188 322,184 300,184 C278,184 256,188 236,197 C224,204 217,214 213,228 Z" fill="${root}"/>`;
      // backcombed sweep and one highlight
      s += `<path d="M236,170 C246,120 280,86 330,74 M262,172 C268,128 298,98 346,88 M300,174 C306,138 332,110 372,102" fill="none" stroke="${rS}" stroke-width="2.4" opacity="0.55"/>`;
      s += `<path d="M230,124 C244,90 276,66 314,60 C290,76 268,98 252,126 C246,136 234,136 230,124 Z" fill="${rL}" opacity="0.85"/>`;
      return s;
    },
    headwear(o) {
      const fr = '#2a1a1d', gem = '#f4f1ea';
      const lens = (side) => {
        const cx = 300 + side * 38, xi = cx - side * 22, xo = cx + side * 25;
        return `M${n(xi)},${n(274)} C${n(cx)},${n(270)} ${n(xo - side * 8)},${n(268)} ${n(xo + side * 3)},${n(259)} C${n(xo + side * 1)},${n(276)} ${n(xo - side * 3)},${n(291)} ${n(cx + side * 10)},${n(297)} C${n(cx - side * 4)},${n(301)} ${n(xi + side * 1)},${n(298)} ${n(xi)},${n(286)} Z`;
      };
      let s = '';
      // beaded chain from behind the ears, looping down behind the neck
      s += beads([205, 324], [208, 404], [262, 440], 20, 2.3, ['#f1ece2', '#d9b55c']);
      s += beads([395, 324], [392, 404], [338, 440], 20, 2.3, ['#d8d1c6', '#b7963f']);
      // cat-eye frames: tinted lens, heavy upswept rims
      for (const side of [-1, 1]) {
        s += `<path d="${lens(side)}" fill="#d6e4ea" fill-opacity="0.13" stroke="${fr}" stroke-width="3.6" stroke-linejoin="round"/>`;
        const cx = 300 + side * 38, xo = cx + side * 25;
        s += `<path d="M${n(cx - side * 22)},${n(273)} C${n(cx)},${n(268)} ${n(xo - side * 8)},${n(266)} ${n(xo + side * 4)},${n(257)} L${n(xo + side * 1)},${n(268)} C${n(xo - side * 8)},${n(272)} ${n(cx)},${n(274)} ${n(cx - side * 22)},${n(277)} Z" fill="${fr}"/>`;
        s += `<circle cx="${n(xo - side * 1)}" cy="263" r="1.7" fill="${gem}"/><circle cx="${n(xo - side * 6)}" cy="266" r="1.4" fill="${gem}"/>`;
        s += `<path d="M${n(cx - side * 12)},${n(279)} l${n(side * 8)},-5" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.35"/>`;
        s += `<path d="M${n(xo + side * 2)},${n(262)} L${n(300 + side * 92)},${n(270)}" stroke="${fr}" stroke-width="3"/>`;
      }
      s += `<path d="M285,276 Q300,268 315,276" fill="none" stroke="${fr}" stroke-width="3.2"/>`;
      return s;
    },
    body(o) {
      const pk = '#e6a0ad', pkS = '#c47f8d', pkD = '#a3626f', wh = '#f4efe7', whS = '#d6d0c6', sk = dot.skin;
      let s = P.torso({ sw: 198, drop: 26, top: 452, fill: pk, shadow: pkS, neckW: 38 });
      // short puffed sleeves with white cuffs; bare forearms below
      s += `<path d="M86,650 C88,724 88,820 84,920 L142,920 C142,820 144,724 146,650 Z" fill="${sk.base}"/>`;
      s += `<path d="M130,650 C132,724 134,820 132,920 L142,920 C142,820 144,724 146,650 Z" fill="${sk.shadow}"/>`;
      s += `<path d="M454,650 C456,724 456,820 458,920 L516,920 C512,820 512,724 514,650 Z" fill="${sk.shadow}"/>`;
      s += `<path d="M84,628 C104,636 132,636 154,628 L154,652 C132,660 104,660 84,652 Z" fill="${wh}"/>`;
      s += `<path d="M446,628 C468,636 494,636 516,628 L516,652 C494,660 468,660 446,652 Z" fill="${whS}"/>`;
      s += `<path d="M150,490 C164,540 162,600 156,630 M450,490 C436,540 438,600 444,630" fill="none" stroke="${pkD}" stroke-width="3" opacity="0.55"/>`;
      // button front
      s += `<path d="M300,486 L300,920" stroke="${pkD}" stroke-width="2" opacity="0.5"/>`;
      for (const y of [508, 548]) s += `<circle cx="300" cy="${y}" r="4.6" fill="${wh}"/>`;
      // white bib apron on halter straps, ruffled top edge
      s += `<path d="M262,466 L246,574 L256,574 L272,470 Z M338,466 L354,574 L344,574 L328,470 Z" fill="${whS}"/>`;
      const ruf = [[240, 572], [256, 566], [272, 572], [288, 566], [304, 572], [320, 566], [336, 572], [352, 566], [362, 572]];
      s += `<path d="M240,572${scallops(ruf.map(([x, y]) => [x, y, -0.25]))} L366,920 L234,920 Z" fill="${wh}"/>`;
      s += `<path d="M306,580 L314,580 L334,920 L366,920 L362,572 Z" fill="${whS}"/>`;
      // pocket with an order pad
      s += `<rect x="268" y="626" width="34" height="22" rx="2" fill="#fbf8f1"/><path d="M272,634 h26 M272,640 h20" stroke="#8fa6c4" stroke-width="1.6"/>`;
      s += `<path d="M262,640 h56 v54 h-56 Z" fill="${wh}"/><path d="M262,640 h56 v54 h-56 Z" fill="none" stroke="${whS}" stroke-width="2.4"/>`;
      // name tag
      s += `<rect x="186" y="526" width="60" height="26" rx="3" fill="#5a1f2a"/><rect x="186" y="526" width="60" height="26" rx="3" fill="none" stroke="#d9b55c" stroke-width="1.6"/>`;
      s += label(216, 546, 'DOT', { size: 21, w: 36, fill: '#f6efe2' });
      // folds
      s += `<path d="M214,690 q10,40 4,90 M392,690 q-8,50 0,100" fill="none" stroke="${pkD}" stroke-width="2.6" opacity="0.45"/>`;
      return s;
    },
    collar(o) {
      const wh = '#f4efe7', whS = '#d4cec4';
      return `<path d="M264,440 C258,456 250,468 238,482 L222,522 L270,502 L298,478 C282,472 270,460 268,444 Z" fill="${wh}"/>` +
        `<path d="M336,440 C342,456 350,468 362,482 L378,522 L330,502 L302,478 C318,472 330,460 332,444 Z" fill="${whS}"/>`;
    },
    draw(o) { return P.draw(o, dot); }
  };
  ART.char('dot', dot);

  /* ================================================================== */
  /* CONSTANCE ASHGROVE — 48, Historical Society, Lantern Society */
  const CN = { h: '#c9a064', hs: '#9c7743', hd: '#7e5e32', hl: '#e9ca90' };
  const constance = {
    name: 'Constance',
    age: 0.45,
    skin: { base: '#f2d5c1', shadow: '#d1ad97', blush: '#dc8c84' },
    face: { jaw: 0.94, chin: 5, top: 0.97, cheek: -3 },
    eyes: { color: '#7b92a6', size: 0.94, tilt: 3.5, lashes: true, lid: 0.22, lash: '#231817' },
    brows: { color: '#8b6b45', thick: 0.78, arch: 2.0, len: 1.05, y: -1 },
    nose: { size: 0.96, width: 0.78 },
    mouth: { width: 0.94, lip: '#b02a30', full: 0.85, line: '#7c1a20' },
    neck: { w: 0.92, len: 4 },
    hairShadow: 'M222,200 C236,178 262,164 300,160 C336,160 366,174 386,204 L390,220 C370,190 338,176 300,176 C266,176 240,190 222,214 Z',
    hairBack(o) {
      const { hs, hd } = CN;
      let s = `<path d="M206,276 C194,196 226,100 298,92 C372,88 416,168 404,258 C400,290 392,312 380,326 L220,326 C210,312 206,294 206,276 Z" fill="${hs}"/>`;
      // the French twist: a smooth vertical roll at the back of the head, seen past the right side
      s += `<path d="M346,88 C400,86 442,140 442,210 C442,268 424,310 394,332 L378,322 C398,290 406,252 404,208 C402,158 384,116 346,88 Z" fill="${hs}"/>`;
      s += `<path d="M366,102 C396,122 414,164 414,212 C414,250 406,282 394,308 C404,278 406,246 404,212 C402,170 390,132 366,102 Z" fill="${CN.h}" opacity="0.75"/>`;
      s += `<path d="M392,98 C422,120 436,164 434,212 C432,258 416,296 392,320" fill="none" stroke="${hd}" stroke-width="2.6" opacity="0.9"/>`;
      return s;
    },
    hairFront(o) {
      const { h, hs, hl } = CN, sk = constance.skin;
      let s = '';
      // swept smoothly back from a side part; ears left bare
      s += `<path d="M212,262 C198,196 210,124 250,96 C278,78 332,76 364,96 C402,118 414,184 398,262 C396,240 392,222 386,210 C374,188 352,170 324,160 C306,154 286,154 268,158 C248,164 232,180 222,198 C216,214 214,236 212,262 Z" fill="${h}"/>`;
      s += `<path d="M364,96 C402,118 414,184 398,262 C396,240 392,222 386,210 C380,198 372,188 362,180 C382,148 378,118 348,90 C354,91 359,93 364,96 Z" fill="${hs}"/>`;
      // the part
      s += `<path d="M266,158 C264,134 266,110 274,90" fill="none" stroke="${sk.shadow}" stroke-width="2.2"/>`;
      // combed lines sweeping back toward the twist
      s += `<path d="M280,158 C304,140 340,134 372,146 M238,186 C246,154 270,130 304,118 M352,172 C370,182 384,200 392,226 M226,214 C226,190 234,170 246,154" fill="none" stroke="${hs}" stroke-width="2" opacity="0.6"/>`;
      // the soft wave: one long highlight
      s += `<path d="M276,130 C300,106 338,100 368,114 C338,114 308,122 286,140 C280,144 272,138 276,130 Z" fill="${hl}" opacity="0.9"/>`;
      return s;
    },
    headwear(o) {
      const pearl = (x, y, lit) => `<rect x="${x - 2.5}" y="${y - 3}" width="5" height="5" rx="1.5" fill="#c9a04e"/>` +
        `<circle cx="${x}" cy="${y + 8}" r="5.6" fill="${lit ? '#f4efe6' : '#d6cfc3'}"/><circle cx="${x + 1.6}" cy="${y + 9.6}" r="4" fill="${lit ? '#d9d1c4' : '#b9b1a5'}" opacity="0.7"/><circle cx="${x - 1.8}" cy="${y + 6}" r="1.6" fill="#ffffff"/>`;
      return pearl(205, 320, true) + pearl(395, 320, false);
    },
    body(o) {
      const ct = '#b98b53', ctS = '#93693c', ctD = '#77542f', bl = '#efe5d2', blS = '#d5c7ac', sk = constance.skin;
      let s = P.torso({ sw: 202, drop: 8, top: 450, fill: ct, shadow: ctS, neckW: 36 });
      // the coat's collar standing up behind the neck
      s += `<path d="M244,456 C246,426 272,410 300,410 C328,410 354,426 356,456 L338,458 C334,440 318,430 300,430 C282,430 266,440 262,458 Z" fill="${ct}"/>`;
      s += `<path d="M300,410 C328,410 354,426 356,456 L338,458 C334,440 318,430 300,430 Z" fill="${ctS}"/>`;
      // cream silk blouse in the coat's opening
      s += `<path d="M258,452 Q300,470 342,452 L360,920 L240,920 Z" fill="${bl}"/>`;
      s += `<path d="M300,470 Q324,468 342,452 L360,920 L306,920 Z" fill="${blS}"/>`;
      // throat in the blouse's open neck
      s += `<path d="M270,452 L300,516 L330,452 Z" fill="${sk.base}"/><path d="M300,470 L330,452 L300,516 Z" fill="${sk.shadow}"/>`;
      s += `<path d="M268,452 L300,518 L288,524 L256,462 Z" fill="${bl}"/><path d="M332,452 L300,518 L312,524 L344,462 Z" fill="${blS}"/>`;
      s += `<path d="M282,560 C290,620 288,700 292,780 M318,570 C314,630 316,700 312,780" fill="none" stroke="#fffaf0" stroke-width="3" opacity="0.5"/>`;
      // notched lapels of the camel coat
      s += `<path d="M258,450 C250,470 238,486 224,498 L212,506 L222,522 C232,580 260,630 290,670 C282,600 274,520 270,456 Z" fill="${K.adj(ct, 0.12)}"/>`;
      s += `<path d="M342,450 C350,470 362,486 376,498 L388,506 L378,522 C368,580 340,630 310,670 C318,600 326,520 330,456 Z" fill="${ctD}"/>`;
      s += `<path d="M222,522 C232,580 260,630 290,670 M212,506 L230,494" fill="none" stroke="${ctD}" stroke-width="3" opacity="0.85"/>`;
      // seams, folds
      s += `<path d="M138,500 C156,580 160,700 156,920 M462,500 C444,580 440,700 444,920" fill="none" stroke="${ctD}" stroke-width="3" opacity="0.5"/>`;
      s += `<path d="M206,700 q10,40 4,90 M394,690 q-8,50 0,100" fill="none" stroke="${ctD}" stroke-width="2.6" opacity="0.45"/>`;
      return s;
    },
    collar(o) {
      let s = '';
      const N = 17;
      for (let i = 0; i <= N; i++) {
        const [x, y] = qpt([266, 452], [300, 512], [334, 452], i / N), lit = x < 312;
        s += `<circle cx="${n(x)}" cy="${n(y)}" r="4.6" fill="${lit ? '#f3eee4' : '#d3ccc0'}"/><circle cx="${n(x - 1.4)}" cy="${n(y - 1.5)}" r="1.4" fill="#ffffff" opacity="0.9"/>`;
      }
      return s;
    },
    front(o) { return lanternPin(242, 548, 1.15); },
    draw(o) { return P.draw(o, constance); }
  };
  ART.char('constance', constance);

  /* ================================================================== */
  /* BRETT LINDQVIST — 17, junior, quarterback */
  const BR = { h: '#ba945a', hs: '#8b693b', hl: '#e8cf98' };
  const brett = {
    name: 'Brett',
    skin: { base: '#efc29c', shadow: '#cc9676', blush: '#dd8670' },
    face: { jaw: 1.1, chin: 9, top: 1.0, cheek: 1 },
    eyes: { color: '#3c8ad0', size: 0.94, lid: 0.12, lash: '#2a1d1a' },
    brows: { color: '#9b7642', thick: 1.1, arch: 0.75, y: -1 },
    nose: { size: 1.04, width: 0.96, y: 1 },
    mouth: { width: 1.06, lip: '#c77c6c', full: 0.4, y: 1 },
    neck: { w: 1.14 },
    hairShadow: 'M222,212 C236,198 262,190 300,188 C338,188 366,196 382,208 L386,220 C368,206 340,200 300,200 C264,200 240,208 224,222 Z',
    marks: '<path d="M300,407 q-1.6,5 0,9.5" fill="none" stroke="#cc9676" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>',
    hairBack(o) {
      return `<path d="M204,262 C194,180 236,108 302,104 C368,102 410,168 400,262 C396,292 388,310 378,320 L222,320 C212,308 206,290 204,262 Z" fill="${BR.hs}"/>`;
    },
    hairFront(o) {
      const { h, hs, hl } = BR;
      let s = '';
      // short at the sides; on top it is swept up off the forehead and back
      s += `<path d="M210,256 C202,214 204,168 220,140 C236,114 262,98 300,96 C340,96 374,112 392,140 C406,166 406,212 394,256 C392,236 388,220 380,208 C368,196 350,190 330,190 C312,190 296,188 280,190 C258,192 238,202 226,216 C218,228 212,242 210,256 Z" fill="${h}"/>`;
      s += `<path d="M372,108 C396,128 408,166 404,212 C402,232 398,248 394,256 C392,236 388,220 380,208 C390,180 388,144 372,108 Z" fill="${hs}"/>`;
      // the quiff, lifting from the hairline and rolling back
      s += `<path d="M236,200 C226,166 232,122 262,98 C286,80 322,76 350,86 C372,94 388,110 394,130 C378,116 356,108 334,110 C312,112 296,122 286,136 C276,150 270,170 268,190 C256,192 244,196 236,200 Z" fill="${h}"/>`;
      s += `<path d="M334,110 C356,108 378,116 394,130 C400,146 404,166 404,190 C396,166 384,146 366,134 C356,126 346,118 334,110 Z" fill="${hs}"/>`;
      s += `<path d="M252,196 C246,160 258,124 290,104 M276,190 C276,156 292,126 324,110 M300,188 C306,160 324,138 352,128 M330,190 C340,170 356,156 378,150" fill="none" stroke="${hs}" stroke-width="2.4" opacity="0.55"/>`;
      // strand tips breaking the silhouette where the quiff rolls back
      s += `<path d="M350,86 C364,84 376,88 386,96 C378,94 370,94 362,96 Z M372,98 C384,98 394,104 400,112 C392,110 386,110 380,112 Z" fill="${h}"/>`;
      // sun-bleached streaks and one highlight
      s += `<path d="M262,186 C258,150 272,118 304,100 M314,186 C320,160 336,140 362,130" fill="none" stroke="${hl}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;
      s += `<path d="M244,160 C248,128 266,104 294,92 C276,108 264,128 258,154 C256,164 246,168 244,160 Z" fill="${hl}" opacity="0.9"/>`;
      return s;
    },
    body(o) {
      const m = '#7d2535', mS = '#5e1b28', mD = '#48131e', g = '#d4a644', gS = '#a97f2e', gD = '#8a6622', tee = '#f2efe8', teeS = '#d4d0c6';
      let s = P.torso({ sw: 216, drop: 6, top: 446, fill: m, shadow: mS, neckW: 42 });
      // gold leather sleeves
      s += `<path d="M150,466 C124,470 102,482 90,500 C70,542 66,666 62,920 L162,920 C164,800 168,680 172,600 C174,540 166,494 150,466 Z" fill="${g}"/>`;
      s += `<path d="M450,466 C476,470 498,482 510,500 C530,542 534,666 538,920 L438,920 C436,800 432,680 428,600 C426,540 434,494 450,466 Z" fill="${gS}"/>`;
      s += `<path d="M96,560 C88,640 84,760 82,920 M504,560 C512,640 516,760 518,920" fill="none" stroke="${gD}" stroke-width="2.6" opacity="0.5"/>`;
      s += `<path d="M104,700 q14,30 8,70 M494,690 q-12,36 -6,76" fill="none" stroke="${gD}" stroke-width="2.4" opacity="0.5"/>`;
      // white tee in the open front
      s += `<path d="M262,450 Q300,474 338,450 L332,920 L268,920 Z" fill="${tee}"/>`;
      s += `<path d="M300,472 Q322,468 338,450 L332,920 L306,920 Z" fill="${teeS}"/>`;
      // jacket fronts with snaps
      s += `<path d="M262,448 C272,500 278,600 274,920 L168,920 C170,780 172,640 176,560 C186,500 220,462 262,448 Z" fill="${m}"/>`;
      s += `<path d="M338,448 C328,500 322,600 326,920 L432,920 C430,780 428,640 424,560 C414,500 380,462 338,448 Z" fill="${mS}"/>`;
      for (const y of [600, 680, 760, 840]) s += `<circle cx="${n(268 - (y - 600) * 0.01)}" cy="${y}" r="5" fill="#ece5d6"/><circle cx="${n(332 + (y - 600) * 0.01)}" cy="${y}" r="5" fill="#c9c1b2"/>`;
      // the chenille D
      const D = (extra) => `<text x="214" y="586" font-family="${FONT}" font-size="86" font-weight="800" text-anchor="middle" textLength="58" lengthAdjust="spacingAndGlyphs" ${extra}>D</text>`;
      s += D(`fill="#f1e9d6" stroke="#f1e9d6" stroke-width="12" stroke-linejoin="round"`);
      s += D(`fill="${mD}" stroke="${mD}" stroke-width="5" stroke-linejoin="round"`);
      s += D(`fill="#e3b64e"`);
      // folds
      s += `<path d="M210,700 q10,40 4,90 M392,690 q-8,50 0,100" fill="none" stroke="${mD}" stroke-width="2.6" opacity="0.5"/>`;
      return s;
    },
    collar(o) {
      const m = '#7d2535', mS = '#5e1b28', g = '#d4a644', gS = '#a97f2e';
      let s = '';
      // striped knit collar standing round the neck
      s += `<path d="M284,490 C262,486 246,474 240,456 L240,432 C248,446 262,458 282,464 Z" fill="${m}"/>`;
      s += `<path d="M316,490 C338,486 354,474 360,456 L360,432 C352,446 338,458 318,464 Z" fill="${mS}"/>`;
      s += `<path d="M240,442 C248,456 262,466 283,472 M240,450 C248,464 262,474 283,480" fill="none" stroke="${g}" stroke-width="3"/>`;
      s += `<path d="M360,442 C352,456 338,466 317,472 M360,450 C352,464 338,474 317,480" fill="none" stroke="${gS}" stroke-width="3"/>`;
      return s;
    },
    draw(o) { return P.draw(o, brett); }
  };
  ART.char('brett', brett);

  /* ================================================================== */
  /* PRINCIPAL DALE FENWICK — 55 */
  const FW = { g: '#aca79f', gS: '#827d77', gD: '#6b6660', gL: '#cbc6be' };
  /* Walrus mustache: bushy under the nose, the bottom edge kept above the mouth
   * line and the droops outside the mouth corners, so every mouth still reads. */
  const walrus = (my) => {
    const { g, gS, gD, gL } = FW;
    const top = 341, bot = my - 9;
    // the shape: under the nose to wide drooping ends; the bottom is a ragged fringe of strands
    const fringe = (x0, x1, y0, y1, k) => {
      let d = '';
      for (let i = 1; i <= k; i++) {
        const t = i / k, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, xm = x0 + (x1 - x0) * (t - 0.5 / k), ym = y0 + (y1 - y0) * (t - 0.5 / k);
        d += ` L${n(xm)},${n(ym + (i % 2 ? 2.2 : 3.8))} L${n(x)},${n(y)}`;
      }
      return d;
    };
    const right = `M300,${top} C318,${top - 4} 340,${top + 1} 352,${top + 12} C362,${top + 22} 362,${n(my)} 356,${n(my + 10)} L350,${n(my + 4)} L344,${n(my + 8)} C340,${n(my - 2)} 336,${n(bot - 1)} 330,${n(bot)}${fringe(330, 300, bot, bot, 5)}`;
    const left = ` L300,${n(bot)}${fringe(300, 270, bot, bot, 5)} C264,${n(bot - 1)} 260,${n(my - 2)} 256,${n(my + 8)} L250,${n(my + 4)} L244,${n(my + 10)} C238,${n(my)} 238,${top + 22} 248,${top + 12} C260,${top + 1} 282,${top - 4} 300,${top} Z`;
    let s = `<path d="${right}${left}" fill="${g}"/>`;
    s += `<path d="${right} C308,${n(bot - 10)} 306,${top + 8} 300,${top} Z" fill="${gS}"/>`;
    s += `<path d="M258,${top + 14} l-7,12 M270,${top + 11} l-5,14 M284,${top + 9} l-3,14 M316,${top + 9} l3,14 M330,${top + 11} l5,14 M342,${top + 14} l7,12" stroke="${gD}" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>`;
    s += `<path d="M256,${top + 11} C268,${top + 1} 284,${top - 2} 296,${top} C282,${top + 4} 270,${top + 10} 262,${top + 18} Z" fill="${gL}" opacity="0.85"/>`;
    return s;
  };
  const fenwick = {
    name: 'Principal Fenwick',
    age: 0.65,
    blush: 0.5,
    skin: { base: '#efbfa0', shadow: '#cd977c', blush: '#d9665a' },
    face: { jaw: 1.1, chin: 2, top: 1.0, cheek: 6 },
    eyes: { color: '#5e6e7e', size: 0.9, lid: 0.3, bags: 0.6, lash: '#2a1d1a' },
    brows: { color: '#8f8a84', thick: 1.1, arch: 0.9, y: -1 },
    nose: { size: 1.12, width: 1.25, y: 2 },
    mouth: { width: 1.0, lip: '#c06a62', full: 0.35, y: 3 },
    neck: { w: 1.12 },
    hairBack(o) {
      const { g, gS } = FW;
      // horseshoe fringe round the back of the head
      return `<path d="M212,200 C192,222 186,262 190,298 C194,324 206,340 222,348 L378,348 C394,340 406,324 410,298 C414,262 408,222 388,200 C360,192 240,192 212,200 Z" fill="${gS}"/>` +
        `<path d="M212,200 C192,222 186,262 190,298 C194,324 206,340 222,348 L240,348 C226,320 220,280 222,240 C222,224 218,210 212,200 Z" fill="${g}"/>`;
    },
    hairFront(o) {
      const { g, gS } = FW;
      let s = '';
      // shine on the bald dome
      s += `<ellipse cx="262" cy="162" rx="30" ry="12" fill="#fde6d2" opacity="0.55" transform="rotate(-24 262 162)"/>`;
      // a few combed-over wisps
      s += `<path d="M222,198 C246,168 290,154 342,158 M226,210 C254,184 296,172 338,176" fill="none" stroke="${g}" stroke-width="1.8" opacity="0.5"/>`;
      // puffs of fringe over the temples
      s += `<path d="${bumpy([[220, 196, 0.2], [214, 222, 0.25], [212, 250, 0.25], [204, 268, 0.2], [190, 258, 0.25], [188, 230, 0.25], [198, 204, 0.2]])}" fill="${g}"/>`;
      s += `<path d="${bumpy([[380, 196, 0.2], [402, 204, 0.2], [412, 230, 0.25], [410, 258, 0.25], [396, 268, 0.2], [388, 250, 0.25], [386, 222, 0.25]])}" fill="${gS}"/>`;
      s += `<path d="M206,210 q-6,12 -2,26 M200,236 q-4,10 0,20" fill="none" stroke="${gS}" stroke-width="2" opacity="0.6"/>`;
      return s;
    },
    headwear(o) {
      const w = '#b48f4f', wS = '#8a6c3a';
      let s = '';
      for (const side of [-1, 1]) {
        const cx = 300 + side * 38, cy = 286, col = side < 0 ? w : wS;
        s += `<circle cx="${cx}" cy="${cy}" r="24" fill="#dfe9ee" fill-opacity="0.1" stroke="${col}" stroke-width="2.4"/>`;
        s += `<path d="M${cx - 14},${cy - 8} l9,-8" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.35"/>`;
        s += `<path d="M${cx + side * 24},${cy - 4} L${300 + side * 90},${cy - 12}" stroke="${col}" stroke-width="2.2"/>`;
      }
      s += `<path d="M286,283 Q300,274 314,283" fill="none" stroke="${w}" stroke-width="2.2"/>`;
      return s;
    },
    body(o) {
      const tw = '#7c5b3d', twS = '#5d432c', twD = '#4a3423', sh = '#f1ede4', shS = '#d2ccc0';
      const tx = o.id('tweed');
      let s = `<defs><pattern id="${tx}" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0,10 L7,0 L14,10" stroke="#2a1e14" stroke-width="1.1" fill="none" opacity="0.25"/><path d="M3.5,10 L10.5,0" stroke="#d2b088" stroke-width="0.9" opacity="0.2"/></pattern></defs>`;
      s += P.torso({ sw: 206, drop: 18, top: 450, fill: tw, shadow: twS, neckW: 40 });
      s += P.torso({ sw: 206, drop: 18, top: 450, fill: `url(#${tx})`, neckW: 40 });
      // white shirt in the V
      s += `<path d="M260,450 Q300,470 340,450 L318,660 L282,660 Z" fill="${sh}"/>`;
      s += `<path d="M300,468 Q324,466 340,450 L318,660 L300,660 Z" fill="${shS}"/>`;
      s += `<path d="M300,486 L300,660" stroke="${shS}" stroke-width="1.6"/>`;
      // lapels
      const lapL = 'M260,448 C250,468 238,484 222,496 L208,504 L218,520 C230,578 256,626 286,664 C278,594 272,520 270,456 Z';
      const lapR = 'M340,448 C350,468 362,484 378,496 L392,504 L382,520 C370,578 344,626 314,664 C322,594 328,520 330,456 Z';
      s += `<path d="${lapL}" fill="${K.adj(tw, 0.12)}"/><path d="${lapL}" fill="url(#${tx})"/>`;
      s += `<path d="${lapR}" fill="${twD}"/><path d="${lapR}" fill="url(#${tx})"/>`;
      s += `<path d="M218,520 C230,578 256,626 286,664 M208,504 L226,492" fill="none" stroke="${twD}" stroke-width="3" opacity="0.9"/>`;
      // breast pocket welt, seams, folds
      s += `<path d="M352,604 l52,-4" stroke="${twD}" stroke-width="3.4" opacity="0.8"/>`;
      s += `<path d="M134,500 C152,580 156,700 152,920 M466,500 C448,580 444,700 448,920" fill="none" stroke="${twD}" stroke-width="3" opacity="0.55"/>`;
      s += `<path d="M206,700 q10,40 4,90 M394,690 q-8,50 0,100" fill="none" stroke="${twD}" stroke-width="2.6" opacity="0.5"/>`;
      return s;
    },
    collar(o, ex, spec) {
      const sk = spec.skin, sh = '#f1ede4', shS = '#d2ccc0', bow = '#b8302c', bowS = '#8a221f';
      let s = '';
      // a hint of double chin under the jaw (head space, tucked behind the face)
      s += `<g transform="${headTf(spec)}"><path d="M240,372 C246,410 272,430 300,430 C328,430 354,410 360,372 Z" fill="${sk.base}"/>` +
        `<path d="M300,430 C328,430 354,410 360,372 L366,372 C364,412 338,438 300,438 C284,438 272,435 262,428 C274,432 288,431 300,430 Z" fill="${sk.shadow}"/></g>`;
      // shirt collar
      s += `<path d="M266,432 C258,446 252,456 246,466 L256,490 L294,470 C282,462 272,450 270,436 Z" fill="${sh}"/>`;
      s += `<path d="M334,432 C342,446 348,456 354,466 L344,490 L306,470 C318,462 328,450 330,436 Z" fill="${shS}"/>`;
      // red bow tie
      s += `<path d="M300,466 L270,450 C264,462 264,476 270,486 Z" fill="${bow}"/><path d="M300,466 L330,450 C336,462 336,476 330,486 Z" fill="${bowS}"/>`;
      s += `<path d="M276,458 l14,6 M276,478 l14,-6" stroke="${bowS}" stroke-width="1.8" opacity="0.7"/>`;
      s += `<rect x="292" y="458" width="16" height="16" rx="4" fill="${bow}"/><rect x="300" y="458" width="8" height="16" rx="3" fill="${bowS}"/>`;
      return s;
    },
    front(o) { return lanternPin(238, 548, 0.95); },
    draw(o) { return P.draw(o, fenwick); }
  };
  // ruddy nose + the walrus mustache
  fenwick.marks = '<ellipse cx="303" cy="334" rx="13" ry="9" fill="#d9665a" opacity="0.22"/>' + walrus(mouthLine(fenwick));
  ART.char('fenwick', fenwick);

  /* ================================================================== */
  /* HANNAH GAGNON — 8, the neighbor girl. Child proportions: a bigger head
   * for her body (headScale 1.25), narrow shoulders, short neck. The whole
   * figure is drawn at `stature` and `drop` lower in the frame, so on stage
   * she stands a head shorter than the teens instead of having a head bigger
   * than theirs. */
  const HN = { h: '#a37c55', hs: '#7c5a3b', hd: '#644830', hl: '#c9a273', pk: '#d9a7b1', pkS: '#b88894', pkD: '#9b6c78' };
  const hannah = {
    name: 'Hannah',
    headScale: 1.25,
    stature: 0.9,
    drop: 36,
    skin: { base: '#f3d8c6', shadow: '#d7b19c', blush: '#e7998c' },
    face: { jaw: 1.02, chin: -12, top: 1.02, cheek: 5 },
    eyes: { color: '#33251f', size: 1.1, iris: 1.18, lashes: true, lash: '#2a1d1a', y: 8, spacing: 1.02, bags: 0.25 },
    brows: { color: '#8a6648', thick: 0.75, arch: 0.7 },
    nose: { size: 0.72, width: 0.72, y: -2 },
    mouth: { width: 0.8, lip: '#cf8e86', full: 0.45, y: -2 },
    neck: { w: 0.74, len: -24 },
    hairShadow: 'M214,206 C240,186 270,178 300,178 C330,178 360,186 386,206 L388,218 C362,198 330,190 300,190 C270,190 240,198 212,218 Z',
    hairBack(o) {
      const { h, hs, hd } = HN;
      let s = `<path d="M204,270 C194,182 238,110 302,108 C368,108 410,176 400,270 C396,300 388,318 378,326 L226,326 C214,316 206,296 204,270 Z" fill="${hs}"/>`;
      // uneven pigtails hanging behind the ears: one sits low, the other high
      s += `<path d="M210,246 C188,250 172,266 170,294 C168,322 172,350 178,376 C180,386 186,394 192,398 C186,382 186,366 188,350 C190,326 196,304 202,286 C206,274 212,262 218,254 Z" fill="${h}"/>`;
      s += `<path d="M178,378 l-6,16 M186,384 l2,14 M174,360 l-8,10" stroke="${h}" stroke-width="2.2" stroke-linecap="round"/>`;
      s += `<path d="M186,300 C182,326 182,350 186,374" fill="none" stroke="${hs}" stroke-width="2" opacity="0.6"/>`;
      s += `<path d="M392,218 C416,220 432,236 436,262 C440,290 436,316 428,338 C426,346 420,352 414,356 C420,340 422,324 420,306 C418,284 412,262 404,248 C400,240 396,232 390,226 Z" fill="${hs}"/>`;
      s += `<path d="M426,340 l6,14 M418,350 l-2,12 M434,322 l8,8" stroke="${hs}" stroke-width="2.2" stroke-linecap="round"/>`;
      s += `<path d="M424,270 C428,294 426,316 420,334" fill="none" stroke="${hd}" stroke-width="2" opacity="0.6"/>`;
      return s;
    },
    hairFront(o) {
      const { h, hs, hl } = HN, sk = hannah.skin;
      let s = '';
      // pulled back from a centre part, wisps escaping
      s += `<path d="M206,262 C196,196 216,132 262,112 C280,104 320,104 340,112 C386,132 406,194 396,256 C392,232 384,212 372,198 C354,182 330,174 300,174 C270,174 246,182 228,198 C218,210 210,234 206,262 Z" fill="${h}"/>`;
      s += `<path d="M340,112 C386,132 406,194 396,256 C392,232 384,212 372,198 C366,192 358,186 350,182 C368,156 360,128 330,108 C334,109 337,110 340,112 Z" fill="${hs}"/>`;
      s += `<path d="M300,176 C298,150 298,128 302,108" fill="none" stroke="${sk.shadow}" stroke-width="2.6"/>`;
      // strands drawn back toward the elastics
      s += `<path d="M292,116 C262,126 232,160 214,238 M290,140 C262,150 238,180 222,230 M310,116 C340,124 374,150 392,214 M312,140 C340,150 364,170 384,206" fill="none" stroke="${hs}" stroke-width="2" opacity="0.55"/>`;
      s += `<path d="M246,128 C262,116 280,112 294,112 C280,120 266,132 256,146 Z" fill="${hl}" opacity="0.8"/>`;
      // flyaways
      s += `<path d="M232,190 C226,182 222,178 214,178 M262,178 C258,170 252,166 246,166 M300,174 C302,166 306,162 312,160 M352,180 C360,172 366,170 374,172 M222,224 C214,222 208,226 204,232 M386,212 C394,206 400,206 406,210 M246,118 C240,110 234,108 228,110" fill="none" stroke="${h}" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>`;
      // plastic bobbles on the elastics
      const bob = (x, y, col) => `<circle cx="${x}" cy="${y}" r="7.6" fill="${K.adj(col, -0.22)}"/><circle cx="${x - 1.4}" cy="${y - 1.4}" r="6" fill="${col}"/><circle cx="${x - 2.8}" cy="${y - 3}" r="1.8" fill="#ffffff" opacity="0.85"/>`;
      s += `<path d="M210,240 q-6,8 0,16" fill="none" stroke="#4a3a40" stroke-width="3"/>` + bob(202, 238, '#e8719f') + bob(206, 258, '#e8719f');
      s += `<path d="M392,212 q7,8 0,16" fill="none" stroke="#4a3a40" stroke-width="3"/>` + bob(400, 210, '#5c9edb') + bob(398, 230, '#5c9edb');
      return s;
    },
    behind(o) {
      const { pk, pkS } = HN;
      // the hood, bunched behind her neck
      return `<path d="M238,436 C236,408 262,392 300,392 C338,392 364,408 362,436 C358,456 346,468 330,472 L270,472 C254,468 242,456 238,436 Z" fill="${pkS}"/>` +
        `<path d="M238,436 C236,408 262,392 300,392 C320,392 338,396 348,404 C322,402 292,406 270,416 C254,424 246,432 244,446 Z" fill="${pk}"/>`;
    },
    body(o) {
      const { pk, pkS, pkD } = HN;
      let s = P.torso({ sw: 140, drop: 26, top: 420, fill: pk, shadow: pkS, neckW: 30 });
      // cracked unicorn iron-on, faded
      const cx = 0, cy = 0, uw = '#efe8df';
      let u = '';
      u += `<path d="M${cx + 4},${cy - 30} C${cx + 30},${cy - 24} ${cx + 44},${cy} ${cx + 46},${cy + 44} L${cx + 30},${cy + 46} C${cx + 30},${cy + 20} ${cx + 22},${cy} ${cx + 8},${cy - 12} Z" fill="#e7a2bb"/>`;
      u += `<path d="M${cx + 2},${cy - 26} C${cx + 24},${cy - 18} ${cx + 34},${cy + 2} ${cx + 36},${cy + 44} L${cx + 24},${cy + 46} C${cx + 24},${cy + 22} ${cx + 18},${cy + 2} ${cx + 4},${cy - 10} Z" fill="#ead27e"/>`;
      u += `<path d="M${cx},${cy - 22} C${cx + 18},${cy - 12} ${cx + 26},${cy + 6} ${cx + 26},${cy + 44} L${cx + 16},${cy + 46} C${cx + 16},${cy + 24} ${cx + 12},${cy + 6} ${cx},${cy - 8} Z" fill="#93bde0"/>`;
      u += `<path d="M${cx - 8},${cy - 24} C${cx - 22},${cy - 20} ${cx - 34},${cy - 6} ${cx - 42},${cy + 6} C${cx - 46},${cy + 12} ${cx - 42},${cy + 18} ${cx - 34},${cy + 18} C${cx - 26},${cy + 18} ${cx - 20},${cy + 16} ${cx - 14},${cy + 20} C${cx - 6},${cy + 28} ${cx + 2},${cy + 40} ${cx + 6},${cy + 46} L${cx + 18},${cy + 46} C${cx + 16},${cy + 22} ${cx + 10},${cy} ${cx + 2},${cy - 16} L${cx + 4},${cy - 32} L${cx - 4},${cy - 24} Z" fill="${uw}"/>`;
      u += `<path d="M${cx - 12},${cy - 22} L${cx - 26},${cy - 54} L${cx - 3},${cy - 25} Z" fill="#e3bf5c"/><path d="M${cx - 21},${cy - 42} l6,-1 M${cx - 17},${cy - 34} l7,-1" stroke="#b8923a" stroke-width="1.4"/>`;
      u += `<path d="M${cx - 20},${cy - 6} q4,-3 8,0" fill="none" stroke="#5a4a50" stroke-width="2"/><circle cx="${cx - 37}" cy="${cy + 9}" r="1.6" fill="#8a7076"/>`;
      u += star(cx - 40, cy - 34, 6, '#ead27e', 0.4) + star(cx + 46, cy - 20, 5, '#93bde0', 0.4) + star(cx - 30, cy + 40, 4, '#e7a2bb', 0.4);
      // cracks: the pink of the shirt showing through the print
      const r = K.rng('hannah-cracks');
      let cr = '';
      for (let i = 0; i < 16; i++) {
        let x = cx - 40 + r() * 86, y = cy - 40 + r() * 86;
        cr += `M${n(x)},${n(y)}`;
        for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 16; y += (r() - 0.5) * 16; cr += ` L${n(x)},${n(y)}`; }
        cr += ' ';
      }
      s += `<g transform="translate(296 566) scale(1.3)"><g opacity="0.82">${u}</g><path d="${cr}" fill="none" stroke="${pk}" stroke-width="1.3" stroke-linejoin="round"/></g>`;
      // kangaroo pocket, cuffs, folds
      s += `<path d="M226,690 C240,670 360,670 374,690 L384,790 M226,690 L216,790" fill="none" stroke="${pkD}" stroke-width="2.6" opacity="0.6"/>`;
      s += `<path d="M170,510 C182,600 186,700 182,920 M430,510 C418,600 414,700 418,920" fill="none" stroke="${pkD}" stroke-width="2.6" opacity="0.5"/>`;
      return s;
    },
    collar(o) {
      const { pk, pkS } = HN;
      let s = '';
      // hood edges meeting at the neckline, drawstrings
      s += `<path d="M272,420 C270,444 282,462 300,470 L296,480 C276,472 262,452 262,426 Z" fill="${pk}"/>`;
      s += `<path d="M328,420 C330,444 318,462 300,470 L304,480 C324,472 338,452 338,426 Z" fill="${pkS}"/>`;
      s += `<path d="M287,468 C285,484 286,500 283,514 M313,468 C315,482 314,494 316,506" fill="none" stroke="#efe7de" stroke-width="3.6" stroke-linecap="round"/>`;
      s += `<rect x="280" y="512" width="6" height="10" rx="2" fill="#cfc6bc"/><rect x="313" y="504" width="6" height="10" rx="2" fill="#bfb6ac"/>`;
      return s;
    },
    draw(o) {
      const k = hannah.stature;
      return `<g transform="translate(${n(300 * (1 - k))} ${n(900 * (1 - k) + hannah.drop * k)}) scale(${k})">${P.draw(o, hannah)}</g>`;
    }
  };
  ART.char('hannah', hannah);

  /* ================================================================== */
  /* MRS. FENNIMORE — 60, Derry Public Library */
  const LB = { g: '#878d96', gS: '#5f656e', gD: '#4b5058', gL: '#adb4bd' };
  const librarian = {
    name: 'Mrs. Fennimore',
    age: 0.7,
    skin: { base: '#edcab3', shadow: '#c9a38e', blush: '#d68c84' },
    face: { jaw: 0.92, chin: 7, top: 0.97, cheek: -5 },
    eyes: { color: '#7a858c', size: 0.92, lid: 0.1, lashes: true, lash: '#2a1d1a', bags: 0.5 },
    brows: { color: '#76706a', thick: 0.72, arch: 1.5, y: -4 },
    nose: { size: 1.18, width: 0.74, y: 3 },
    mouth: { width: 0.88, lip: '#b8796f', full: 0.08, y: 3 },
    hairShadow: 'M258,146 C270,166 296,180 326,188 C348,194 368,198 382,214 L386,226 C368,208 346,204 322,198 C294,190 268,176 254,156 Z',
    marks: '<path d="M302,296 C304,310 306,322 306,330" fill="none" stroke="#fbe4d4" stroke-width="2" opacity="0.6"/>',
    hairBack(o) {
      const { gS } = LB;
      return `<path d="M296,86 C382,82 428,150 426,232 C425,288 422,330 412,364 C406,382 394,390 380,388 L220,388 C206,390 194,382 188,364 C178,330 177,290 176,236 C174,156 214,90 296,86 Z" fill="${gS}"/>`;
    },
    hairFront(o) {
      const { g, gS, gD, gL } = LB;
      let s = '';
      // side-parted bob with a full crown, the ends turning under at the jaw
      s += `<path d="M218,386 C198,382 180,362 179,330 C177,280 176,222 190,168 C206,120 248,90 296,87 C356,86 404,116 416,176 C424,222 420,288 416,330 C414,360 404,380 384,388 C380,372 380,352 382,330 C384,290 384,254 378,226 C372,206 360,196 344,190 C318,184 292,176 274,162 C266,156 260,150 258,144 C254,166 242,188 228,204 C220,218 216,240 216,270 C216,310 220,350 218,386 Z" fill="${g}"/>`;
      s += `<path d="M352,96 C392,108 410,140 416,176 C424,222 420,288 416,330 C414,360 404,380 384,388 C380,372 380,352 382,330 C384,290 384,254 378,226 C376,214 372,204 366,198 C380,160 374,124 352,100 Z" fill="${gS}"/>`;
      // the ends curling under
      s += `<path d="M182,346 C188,372 202,386 220,388 C218,374 216,362 218,346 C206,352 194,352 182,346 Z" fill="${gD}"/>`;
      s += `<path d="M414,348 C410,372 400,386 384,388 C382,374 380,362 382,346 C392,352 404,354 414,348 Z" fill="${gD}"/>`;
      s += `<path d="M258,144 C258,126 262,110 268,98" fill="none" stroke="${gD}" stroke-width="2.2"/>`;
      s += `<path d="M274,140 C300,124 338,122 370,138 M206,232 C198,280 200,328 212,370 M216,262 C212,300 214,334 220,364" fill="none" stroke="${gS}" stroke-width="2" opacity="0.6"/>`;
      s += `<path d="M398,226 C404,276 402,326 390,368 M388,258 C390,296 388,330 382,362" fill="none" stroke="${gD}" stroke-width="2" opacity="0.6"/>`;
      s += `<path d="M184,352 C192,372 204,384 220,386" fill="none" stroke="${gL}" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>`;
      s += `<path d="M198,214 C192,252 192,292 198,326 M206,180 C200,200 198,214 198,226" fill="none" stroke="${gL}" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>`;
      // one highlight, combed along the sweep from the part
      s += `<path d="M264,126 C292,104 338,102 374,128 C338,114 298,116 272,134 C268,137 262,132 264,126 Z" fill="${gL}" opacity="0.85"/>`;
      return s;
    },
    headwear(o) {
      const fr = '#a88a4c', frS = '#806838';
      const lens = (cx) => `M${cx - 20},318 L${cx + 20},318 C${cx + 20},330 ${cx + 11},338 ${cx},338 C${cx - 11},338 ${cx - 20},330 ${cx - 20},318 Z`;
      let s = '';
      // beaded chain looping down from the temple tips, behind the neck
      s += beads([212, 300], [212, 400], [262, 444], 20, 2.2, ['#3e2c27', '#c58e3e']);
      s += beads([388, 300], [388, 400], [338, 444], 20, 2.2, ['#33241f', '#a07432']);
      // half-moon readers low on the nose
      s += `<path d="${lens(270)}" fill="#e2ecf0" fill-opacity="0.14" stroke="${fr}" stroke-width="2.4"/>`;
      s += `<path d="${lens(330)}" fill="#e2ecf0" fill-opacity="0.14" stroke="${frS}" stroke-width="2.4"/>`;
      s += `<path d="M258,324 l6,-4 M318,324 l6,-4" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.4"/>`;
      s += `<path d="M290,320 Q300,312 310,320" fill="none" stroke="${fr}" stroke-width="2.2"/>`;
      s += `<path d="M250,319 L212,298 M350,319 L388,298" stroke="${fr}" stroke-width="2.2"/>`;
      return s;
    },
    body(o) {
      const t = '#5f8a87', tS = '#476a69', tD = '#365353', bl = '#ebe3d3', blS = '#cfc5b2';
      let s = P.torso({ sw: 188, drop: 24, top: 456, fill: t, shadow: tS, neckW: 34 });
      // blouse in the cardigan's V
      s += `<path d="M262,456 Q300,470 338,456 L304,624 L296,624 Z" fill="${bl}"/>`;
      s += `<path d="M300,470 Q324,466 338,456 L304,624 L300,624 Z" fill="${blS}"/>`;
      for (const y of [500, 540, 580]) s += `<circle cx="300" cy="${y}" r="3.2" fill="#f7f2e8"/><circle cx="300.8" cy="${y + 0.8}" r="3.2" fill="none" stroke="${blS}" stroke-width="1"/>`;
      // cardigan fronts with ribbed bands, buttoned from mid-chest
      s += `<path d="M262,456 L300,628 L300,920 L190,920 C194,760 200,620 212,540 C222,494 240,466 262,456 Z" fill="${t}"/>`;
      s += `<path d="M338,456 L300,628 L300,920 L410,920 C406,760 400,620 388,540 C378,494 360,466 338,456 Z" fill="${tS}"/>`;
      s += `<path d="M262,456 L300,628 L300,920 M338,456 L300,628" fill="none" stroke="${tD}" stroke-width="2.4" opacity="0.6"/>`;
      s += `<path d="M252,470 L288,630 L288,920 M348,470 L312,630 L312,920" fill="none" stroke="${tD}" stroke-width="1.6" opacity="0.4"/>`;
      for (const y of [652, 724, 796, 868]) s += `<circle cx="294" cy="${y}" r="5" fill="#e3dccb"/>`;
      // seams, folds
      s += `<path d="M140,506 C158,580 162,700 158,920 M460,506 C442,580 438,700 442,920" fill="none" stroke="${tD}" stroke-width="3" opacity="0.5"/>`;
      s += `<path d="M214,700 q10,40 4,90 M390,690 q-8,50 0,100" fill="none" stroke="${tD}" stroke-width="2.6" opacity="0.45"/>`;
      return s;
    },
    collar(o) {
      const bl = '#ebe3d3', blS = '#cfc5b2';
      let s = '';
      // high band collar with a small ruffle
      s += `<path d="M266,428 Q300,438 334,428 L338,468 Q300,480 262,468 Z" fill="${bl}"/>`;
      s += `<path d="M300,436 Q320,434 334,428 L338,468 Q320,476 300,478 Z" fill="${blS}"/>`;
      s += `<path d="M264,430${scallops([[264, 430, -0.4], [272, 434, -0.4], [280, 436, -0.4], [288, 437, -0.4], [296, 438, -0.4], [304, 438, -0.4], [312, 437, -0.4], [320, 436, -0.4], [328, 434, -0.4], [336, 430]])} L336,424 Q300,434 264,424 Z" fill="${bl}"/>`;
      return s;
    },
    front(o) { return lanternPin(232, 552, 0.95); },
    draw(o) { return P.draw(o, librarian); }
  };
  ART.char('librarian', librarian);
})();
