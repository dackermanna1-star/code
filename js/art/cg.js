/* What Derry Keeps — event illustrations (CGs), title art and the Derry map. */
(function () {
  'use strict';
  const K = window.KIT, P = K.PAL, n = K.n;

  /* Embed a character portrait inside a CG at a given box. */
  function portrait(id, expr, x, y, w, extra) {
    const svg = K.renderChar(id, expr) || (id === 'june_ghost' ? K.renderChar('june', expr) : '');
    if (!svg) return '';
    return svg.replace('<svg ', `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(w * 1.5)}" ${extra || ''} `);
  }

  /* ------------------------------------------------------------------ */
  /* The red cassette recorder, top-down on the quilt under a lamp. */
  ART.cg('cg_tape', {
    draw(o) {
      const rng = o.rng, v = o.variant || 'side_a';
      let s = K.rect(0, 0, 1600, 900, '#191b24');
      // patchwork quilt
      const quilt = ['#3d3a4a', '#4a3a36', '#3a4540', '#45403a', '#36384a', '#4a4238'];
      for (let y = -40; y < 940; y += 150) for (let x = -60; x < 1660; x += 150) {
        const c = quilt[Math.floor(rng() * quilt.length)];
        s += K.rect(x, y, 150, 150, c) + K.rect(x + 6, y + 6, 138, 138, 'none', { stroke: K.adj(c, 0.08), strokeWidth: 2, strokeDasharray: '6 5', opacity: 0.6 });
      }
      s += K.glow(o, 520, 260, 900, '#ffd8a0', 0.28, 'lamp');
      const g = `rotate(-7 800 450)`;
      let r = '';
      // shadow
      r += K.rect(372, 228, 880, 520, '#07080c', { rx: 34, opacity: 0.55 });
      // body
      r += K.rect(350, 200, 880, 520, '#8e2a2a', { rx: 34 });
      r += K.rect(350, 200, 880, 60, '#a33a35', { rx: 30 });
      r += K.rect(350, 640, 880, 80, '#6e1f22', { rx: 30 });
      // worn silver corners
      for (const [cx, cy] of [[372, 222], [1208, 222], [372, 698], [1208, 698]]) r += K.circle(cx, cy, 14, '#b9b4ab', { opacity: 0.55 });
      // speaker grille (left)
      for (let yy = 300; yy < 620; yy += 22) for (let xx = 410; xx < 690; xx += 22) r += K.circle(xx, yy, 6, '#3a1214');
      r += K.text(410, 650, 'REALISTIC', { fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", fontWeight: 700, fontSize: 30, fill: '#d9b0a0', letterSpacing: 6, opacity: 0.55 });
      // piano keys on top edge
      const keys = [['REC', '#c4473c'], ['PLAY', '#2a2a2e'], ['REW', '#2a2a2e'], ['F.F', '#2a2a2e'], ['STOP', '#2a2a2e'], ['PAUSE', '#2a2a2e']];
      keys.forEach(([lab, c], i) => {
        const kx = 740 + i * 78;
        r += K.rect(kx, 168, 66, 58, c, { rx: 6 }) + K.rect(kx, 168, 66, 14, K.adj(c, 0.25), { rx: 6 });
        r += K.text(kx + 33, 250, lab, { fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", fontSize: 18, fill: '#e9d6c9', textAnchor: 'middle', opacity: 0.8 });
      });
      // cassette door + window
      r += K.rect(730, 270, 450, 330, '#2a1012', { rx: 14 });
      r += K.rect(748, 288, 414, 294, '#151417', { rx: 10 });
      const five = v === 'five';
      // the cassette
      const shell = five ? '#1b1b1f' : '#cfc7b8', lab = five ? '#d8b04a' : '#ece3cf';
      r += K.rect(770, 306, 370, 258, shell, { rx: 10 });
      r += K.rect(790, 322, 330, 150, lab, { rx: 6 });
      if (five) r += K.rect(790, 322, 330, 40, '#111', { rx: 6 }) + K.text(806, 351, 'maxell  XLII', { fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", fontWeight: 700, fontSize: 26, fill: '#d8b04a', letterSpacing: 2 });
      const hand = "'Covered By Your Grace','Comic Sans MS',cursive";
      if (five) {
        r += K.text(955, 420, '#5 — FOR GUSSIE', { fontFamily: hand, fontSize: 34, fill: '#1d2a6a', textAnchor: 'middle' });
        r += K.text(955, 456, 'PLAY AFTER', { fontFamily: hand, fontSize: 30, fill: '#1d2a6a', textAnchor: 'middle' });
      } else {
        r += K.text(955, 372, 'QUIET NIGHT', { fontFamily: hand, fontSize: 36, fill: '#2a2a6a', textAnchor: 'middle' });
        r += K.text(955, 410, '10 / 12 / 82', { fontFamily: hand, fontSize: 30, fill: '#2a2a6a', textAnchor: 'middle' });
        r += K.text(955, 448, "DON'T TAPE OVER!!", { fontFamily: hand, fontSize: 30, fill: '#a3302a', textAnchor: 'middle' });
      }
      // reels window
      r += K.rect(860, 488, 190, 56, '#2b2622', { rx: 26 });
      for (const cx of [892, 1018]) {
        r += `<g class="reel"><circle cx="${cx}" cy="516" r="24" fill="#5a4636"/><circle cx="${cx}" cy="516" r="10" fill="#ece3cf"/>` +
          [0, 60, 120, 180, 240, 300].map((a) => `<rect x="${cx - 2}" y="502" width="4" height="10" fill="#2b2622" transform="rotate(${a} ${cx} 516)"/>`).join('') + '</g>';
      }
      // glints and wear
      r += K.rect(748, 288, 414, 60, '#ffffff', { rx: 10, opacity: 0.06 });
      r += K.path('M1150,640 l40,-12 l6,14 l-40,12 Z', '#d9b0a0', { opacity: 0.25 });
      // strap
      r += K.path('M352,330 C200,320 120,420 60,520', 'none', { stroke: '#151313', strokeWidth: 18, strokeLinecap: 'round' });
      s += `<g transform="${g}">${r}</g>`;
      s += K.vignette(o, 0.7);
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* The Polaroid from the attic: June holding little Gus, July '81. */
  ART.cg('cg_polaroid', {
    draw(o) {
      const rng = o.rng;
      let s = K.rect(0, 0, 1600, 900, '#0b0c10');
      // attic floorboards under a flashlight cone
      for (let i = 0; i < 9; i++) s += K.rect(0, i * 104, 1600, 100, K.mix('#3a2e24', '#2c231c', rng()));
      for (let i = 0; i < 9; i++) s += K.rect(0, i * 104 + 100, 1600, 4, '#120e0b');
      for (let i = 0; i < 30; i++) s += K.rect(rng() * 1600, Math.floor(rng() * 9) * 104 + 30, 3, 40, '#1a1410', { opacity: 0.6 });
      s += K.glow(o, 800, 450, 620, '#fff0d0', 0.42, 'flash');
      // dust
      for (let i = 0; i < 60; i++) s += K.circle(400 + rng() * 800, 120 + rng() * 660, 1 + rng() * 2, '#fff4e0', { opacity: n(0.15 + rng() * 0.4) });
      const g = 'rotate(4 800 450)';
      let r = K.rect(548, 108, 520, 640, '#05060a', { opacity: 0.5 });
      r += K.rect(532, 92, 520, 640, '#efe9dc');
      // photo area (faded: low contrast, warm highlights, cyan shadows)
      const id = o.id('ph');
      r += `<clipPath id="${id}"><rect x="562" y="122" width="460" height="460"/></clipPath><g clip-path="url(#${id})">`;
      r += K.rect(562, 122, 460, 460, '#c9d6d4');
      r += K.rect(562, 122, 460, 180, '#d8e0d8');
      // house (green, porch) behind
      r += K.rect(640, 190, 330, 280, '#8fa592') + K.poly([[620, 200], [805, 120], [990, 200]], '#6a7270');
      r += K.rect(690, 240, 60, 80, '#5e6f78') + K.rect(860, 240, 60, 80, '#5e6f78') + K.rect(640, 360, 330, 16, '#e6e0d0');
      r += K.rect(640, 376, 330, 100, '#a3b29f');
      r += K.rect(562, 470, 460, 120, '#9fb08a');
      // June: yellow sweater, dark bob, face blown out
      r += K.path('M760,600 L770,452 Q800,420 836,452 L846,600 Z', '#c7a78a'); // jeans-ish legs area
      r += K.path('M742,470 Q745,360 803,352 Q862,360 866,470 L860,520 L748,520 Z', '#e0c25a');
      r += K.path('M770,330 Q770,268 806,264 Q846,268 846,330 L846,352 L770,352 Z', '#3e3028');
      r += K.ellipse(808, 318, 34, 40, '#fbf6ea');
      r += K.ellipse(808, 318, 46, 52, '#ffffff', { opacity: 0.5 });
      r += K.path('M790,336 q18,12 36,0', 'none', { stroke: '#b07a6a', strokeWidth: 3, opacity: 0.55 }); // the shape of her smile
      // little Gus on her hip
      r += K.path('M840,420 Q842,382 872,380 Q902,382 904,420 L904,470 L840,470 Z', '#d0d4e0');
      for (let i = 0; i < 4; i++) r += K.rect(840, 392 + i * 18, 64, 7, '#6e86b0', { opacity: 0.9 });
      r += K.circle(872, 352, 26, '#e9c3a5') + K.path('M846,348 Q848,320 872,318 Q898,320 900,346 Q886,334 872,338 Q858,334 846,348 Z', '#6a4a36');
      r += K.path('M862,360 q10,-4 20,0', 'none', { stroke: '#7a4a3a', strokeWidth: 2.5 }); // scowl
      r += K.rect(886, 466, 14, 50, '#5a6a8a') + K.rect(850, 466, 14, 44, '#5a6a8a'); // legs
      r += K.path('M766,430 Q800,470 850,440', 'none', { stroke: '#e0c25a', strokeWidth: 24, strokeLinecap: 'round' }); // arm holding her
      // fade: chemical bloom, yellowing, vignette inside the print
      r += K.rect(562, 122, 460, 460, '#fff3c8', { opacity: 0.28 });
      r += K.glow(o, 808, 318, 180, '#ffffff', 0.55, 'bloom');
      r += '</g>';
      r += K.rect(562, 122, 460, 460, 'none', { stroke: '#d8d0c0', strokeWidth: 2 });
      r += K.text(792, 680, "Me + Gussie, July '81", { fontFamily: "'Permanent Marker','Covered By Your Grace','Comic Sans MS',cursive", fontSize: 34, fill: '#2a2f60', textAnchor: 'middle', transform: 'rotate(-2 792 680)' });
      s += `<g transform="${g}">${r}</g>`;
      s += K.vignette(o, 0.75);
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* June at the window, from inside Gus's room. */
  ART.cg('cg_june_window', {
    draw(o) {
      const rng = o.rng;
      let s = K.rect(0, 0, 1600, 900, '#0d1018');
      // wallpaper wall, dark, moonlit
      s += K.rect(0, 0, 1600, 900, '#1d2230');
      for (let y = 20; y < 900; y += 60) for (let x = (y / 60) % 2 ? 30 : 0; x < 1600; x += 60) s += K.circle(x, y, 4, '#2a3042', { opacity: 0.7 });
      // window opening
      const WX = 470, WY = 90, WW = 660, WH = 700;
      const sky = o.id('sky');
      s += K.defs(K.linear(sky, [[0, '#0a0f1c'], [0.6, '#16203a'], [1, '#1f2b46']]));
      s += K.rect(WX, WY, WW, WH, `url(#${sky})`);
      // outside: stars, the Gagnons' roofline, the porch roof she stands on
      s += K.stars(rng, { count: 40, x0: WX, x1: WX + WW, y0: WY, y1: WY + 300, color: '#cfd8ea' });
      s += K.poly([[WX, WY + 330], [WX + 180, WY + 250], [WX + 360, WY + 330]], '#0b0f18');
      s += K.rect(WX, WY + 330, 360, 200, '#0e131e');
      s += K.poly([[WX, WY + WH], [WX, WY + 560], [WX + WW, WY + 540], [WX + WW, WY + WH]], '#202838');
      for (let i = 0; i < 8; i++) s += K.line(WX, WY + 575 + i * 18, WX + WW, WY + 555 + i * 18, '#2a3448', 2, { opacity: 0.7 });
      // June, waist-up, outside the glass, tinted by moonlight
      const clip = o.id('win');
      s += `<clipPath id="${clip}"><rect x="${WX}" y="${WY}" width="${WW}" height="${WH}"/></clipPath>`;
      s += `<g clip-path="url(#${clip})"><g opacity="0.97" style="filter:none">` + portrait('june_ghost', 'smile', WX + 80, WY + 40, 500) + '</g>';
      // moonlight wash over her and the glass
      s += K.rect(WX, WY, WW, WH, '#6f86c0', { opacity: 0.22, style: 'mix-blend-mode:multiply' });
      s += K.rect(WX, WY, WW, WH, '#a6e08e', { opacity: 0.05 });
      // her hand on the glass
      s += K.path(`M${WX + 470},${WY + 470} q-6,-60 8,-64 q10,0 10,40 q4,-56 16,-56 q12,0 10,58 q6,-50 18,-48 q12,4 6,56 q10,-34 20,-30 q10,6 -2,52 q-14,50 -50,62 q-30,6 -36,-70 Z`, '#d9d6e6', { opacity: 0.85 });
      s += '</g>';
      // glass reflections + faint reflection of Gus
      s += K.poly([[WX + 40, WY], [WX + 200, WY], [WX + 20, WY + WH], [WX, WY + WH], [WX, WY + 200]], '#ffffff', { opacity: 0.05 });
      s += `<g opacity="0.12">` + portrait('gus', 'afraid', WX + 260, WY + 260, 360) + '</g>';
      // window frame (inside, white painted wood) + muntins
      const fr = '#cfd2d8', frS = '#9aa0ab';
      s += K.rect(WX - 40, WY - 40, WW + 80, 40, fr) + K.rect(WX - 40, WY + WH, WW + 80, 50, fr) + K.rect(WX - 40, WY, 40, WH, fr) + K.rect(WX + WW, WY, 40, WH, frS);
      s += K.rect(WX + WW / 2 - 9, WY, 18, WH, fr) + K.rect(WX, WY + WH / 2 - 9, WW, 18, fr);
      s += K.rect(WX - 70, WY + WH + 40, WW + 140, 26, frS);
      // curtains, half drawn
      s += K.path(`M${WX - 120},${WY - 60} h200 q-40,400 10,${WH + 140} h-210 Z`, '#3a3550');
      s += K.path(`M${WX + WW + 120},${WY - 60} h-190 q40,400 -10,${WH + 140} h200 Z`, '#2c283e');
      s += K.vignette(o, 0.8);
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Title art: Derry at night from across the canal, a green light on the hill. */
  ART.cg('title', {
    draw(o) {
      const rng = o.rng;
      let s = K.sky(o, 'night');
      s += K.stars(rng, { count: 160, y1: 520 });
      s += K.circle(1260, 150, 46, '#ece6d4', { opacity: 0.9 }) + K.glow(o, 1260, 150, 260, '#c8d4f0', 0.22, 'moon');
      s += K.clouds(rng, { count: 4, y0: 120, y1: 330, color: '#26324e', shadow: '#141b2c', opacity: 0.7, w: 700 });
      // far hills and the Standpipe hill (right)
      s += K.path(K.ridge(rng, { y: 520, amp: 30, steps: 18 }), '#141c2e');
      s += K.path('M780,600 C960,420 1080,330 1200,322 C1330,318 1450,420 1640,560 L1640,900 L780,900 Z', '#0f1626');
      s += K.path('M1176,326 l4,-30 l12,6 l6,-20 l14,14 l10,-4 l8,24 l11,-8 l4,22 Z', '#2a3348');
      s += K.glow(o, 1212, 300, 120, P.lantern, 0.75, 'lamp') + K.circle(1212, 300, 5, '#eaffde');
      s += K.pines(rng, { x0: 760, x1: 1640, base: 600, hMin: 30, hMax: 70, gap: 15, fill: '#0c1220', shade: '#0a0f1a', jitterY: 30 });
      // the town: rooftops, steeples, a few warm windows
      let x = -20;
      while (x < 1640) {
        const w = 60 + rng() * 90, h = 70 + rng() * 120, base = 700;
        const c = K.mix('#0b101b', '#141b2a', rng());
        s += K.rect(x, base - h, w, h + 20, c);
        if (rng() < 0.6) s += K.poly([[x - 6, base - h], [x + w / 2, base - h - 40 - rng() * 30], [x + w + 6, base - h]], c);
        for (let k = 0; k < 3; k++) if (rng() < 0.35) s += K.rect(x + 10 + rng() * (w - 30), base - h + 20 + rng() * (h - 40), 12, 16, '#ffd38a', { opacity: n(0.5 + rng() * 0.5) });
        x += w + rng() * 10;
      }
      // steeples
      for (const sx of [380, 980]) s += K.rect(sx, 470, 26, 240, '#0b101b') + K.poly([[sx - 6, 472], [sx + 13, 380], [sx + 32, 472]], '#0b101b') + K.line(sx + 13, 380, sx + 13, 352, '#0b101b', 3);
      // canal with reflections and mist
      s += K.rect(0, 700, 1600, 200, '#0a0f1a');
      for (let i = 0; i < 40; i++) s += K.rect(rng() * 1600, 720 + rng() * 160, 20 + rng() * 60, 2, '#ffd38a', { opacity: n(0.08 + rng() * 0.2) });
      s += K.rect(1180, 720, 60, 2, P.lantern, { opacity: 0.35 }) + K.rect(1196, 760, 30, 2, P.lantern, { opacity: 0.25 });
      s += K.band(o, 600, 220, '#2a3448', 0, 0.45, 'mist');
      s += K.vignette(o, 0.6);
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* The Derry map for the free-roam hub. Landmarks sit at DATA.places. */
  ART.cg('cg_map', {
    draw(o) {
      const rng = o.rng;
      const X = (p) => p * 16, Y = (p) => p * 9;
      const ink = '#4a3f33', faint = '#b9a986';
      let s = K.rect(0, 0, 1600, 900, '#e6dbc1');
      // paper texture + fold lines + stains
      for (let i = 0; i < 260; i++) s += K.circle(rng() * 1600, rng() * 900, 1 + rng() * 2, '#c9b893', { opacity: n(0.15 + rng() * 0.2) });
      s += K.line(533, 0, 533, 900, '#cbbd9c', 2, { opacity: 0.7 }) + K.line(1066, 0, 1066, 900, '#cbbd9c', 2, { opacity: 0.7 }) + K.line(0, 450, 1600, 450, '#cbbd9c', 2, { opacity: 0.7 });
      s += K.circle(1380, 760, 70, '#d2bf95', { opacity: 0.35 }) + K.circle(1380, 760, 56, 'none', { stroke: '#c4ad7e', strokeWidth: 3, opacity: 0.4 });
      // streets (grid, slightly skewed)
      for (let i = 0; i < 14; i++) { const y = 80 + i * 60 + (rng() - 0.5) * 10; s += `<path d="M0,${n(y)} L1600,${n(y - 40)}" stroke="${faint}" stroke-width="${i % 4 === 0 ? 7 : 3}" fill="none" opacity="0.7"/>`; }
      for (let i = 0; i < 18; i++) { const x = 40 + i * 92 + (rng() - 0.5) * 12; s += `<path d="M${n(x)},0 L${n(x + 50)},900" stroke="${faint}" stroke-width="${i % 5 === 0 ? 7 : 3}" fill="none" opacity="0.7"/>`; }
      // the Barrens (woods) and the Kenduskeag
      for (let i = 0; i < 70; i++) { const cx = X(10) + rng() * 330, cy = Y(56) + rng() * 230; s += K.circle(cx, cy, 10 + rng() * 10, '#9fae84', { opacity: 0.8 }); }
      s += `<path d="M0,${Y(60)} C${X(12)},${Y(66)} ${X(22)},${Y(58)} ${X(30)},${Y(70)} S${X(44)},${Y(80)} ${X(52)},${Y(64)}" stroke="#7f98a6" stroke-width="16" fill="none" opacity="0.8"/>`;
      // the canal straight through downtown
      s += `<path d="M${X(30)},${Y(64)} C${X(44)},${Y(56)} ${X(52)},${Y(52)} ${X(66)},${Y(52)} S${X(86)},${Y(46)} 1640,${Y(44)}" stroke="#8aa1ae" stroke-width="30" fill="none"/>`;
      s += `<path d="M${X(30)},${Y(64)} C${X(44)},${Y(56)} ${X(52)},${Y(52)} ${X(66)},${Y(52)} S${X(86)},${Y(46)} 1640,${Y(44)}" stroke="#a9bcc6" stroke-width="10" fill="none"/>`;
      // downtown blocks
      for (let i = 0; i < 16; i++) s += K.rect(X(49) + (i % 4) * 46, Y(36) + Math.floor(i / 4) * 44, 36, 32, '#c7a98a', { opacity: 0.8 });
      // landmarks
      const label = (x, y, t, a = 'middle', size = 22) => K.text(x, y, t, { fontFamily: "'Special Elite','Courier New',monospace", fontSize: size, fill: ink, textAnchor: a, opacity: 0.85 });
      // Derry High
      s += K.rect(X(28) - 50, Y(30) - 26, 100, 52, '#a5574a') + K.poly([[X(28) - 56, Y(30) - 26], [X(28), Y(30) - 54], [X(28) + 56, Y(30) - 26]], '#7d3e34');
      // Library (columns)
      s += K.rect(X(44) - 46, Y(34) - 24, 92, 48, '#d9cfb8', { stroke: ink, strokeWidth: 2 }) + [0, 1, 2, 3].map((i) => K.rect(X(44) - 34 + i * 22, Y(34) - 16, 8, 34, ink, { opacity: 0.6 })).join('');
      // Standpipe hill: contour rings + broken ring
      for (let i = 0; i < 5; i++) s += K.ellipse(X(79), Y(24) + 10, 160 - i * 28, 90 - i * 16, 'none', { stroke: '#a8987a', strokeWidth: 2, opacity: 0.7 });
      s += K.circle(X(79), Y(24) + 8, 18, 'none', { stroke: ink, strokeWidth: 6, strokeDasharray: '10 6' });
      // Bassey Park: trees + tiny Paul Bunyan
      for (let i = 0; i < 12; i++) s += K.circle(X(38) - 70 + rng() * 140, Y(58) - 40 + rng() * 80, 12, '#a8b98c');
      s += K.rect(X(38) - 4, Y(58) - 40, 8, 26, '#b5532e') + K.circle(X(38), Y(58) - 46, 6, ink);
      // Larch Street house + Teddy's house
      s += K.rect(X(72) - 18, Y(70) - 16, 36, 30, '#8fa592') + K.poly([[X(72) - 22, Y(70) - 16], [X(72), Y(70) - 36], [X(72) + 22, Y(70) - 16]], '#5d6a62');
      s += K.rect(X(86) - 18, Y(56) - 16, 36, 30, '#b9a3c9') + K.poly([[X(86) - 22, Y(56) - 16], [X(86), Y(56) - 36], [X(86) + 22, Y(56) - 16]], '#7a6a8a');
      // labels for places without pins + street names
      s += label(X(52), Y(80) + 8, 'Kenduskeag Stream', 'middle', 20) + label(X(70), Y(50) - 26, 'THE CANAL', 'middle', 20);
      s += label(X(14), Y(84), 'THE BARRENS', 'middle', 20) + label(X(72), Y(70) + 40, 'Larch St.', 'middle', 18) + label(X(56), Y(30) - 10, 'Center St.', 'middle', 18);
      s += label(X(79), Y(24) + 90, 'Memorial Park', 'middle', 18) + label(X(38), Y(58) + 60, 'Bassey Park', 'middle', 18);
      // compass rose
      s += `<g transform="translate(1460 790)" opacity="0.8"><circle r="44" fill="none" stroke="${ink}" stroke-width="2"/><path d="M0,-52 L9,0 L0,52 L-9,0 Z" fill="${ink}"/><path d="M-52,0 L0,-7 L52,0 L0,7 Z" fill="${ink}" opacity="0.5"/><text y="-60" text-anchor="middle" font-family="'Special Elite','Courier New',monospace" font-size="20" fill="${ink}">N</text></g>`;
      s += K.text(1540, 880, 'drawn by G.B. (not to scale)', { fontFamily: "'Kalam','Comic Sans MS',cursive", fontSize: 18, fill: ink, textAnchor: 'end', opacity: 0.6 });
      return s;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Story moments that reuse a location with extra staging. */
  const reuse = (bgId, time, variant, extra) => ({
    draw(o) {
      const d = ART.bgs[bgId];
      let s = d ? d.draw(Object.assign({}, o, { time, variant })) : K.rect(0, 0, 1600, 900, '#0b0d14');
      return s + (extra ? extra(o) : '') + K.vignette(o, 0.65);
    }
  });
  ART.cg('cg_lanterns', reuse('canal', 'lanterns', null));
  ART.cg('cg_standpipe', reuse('standpipe', 'quiet', null, (o) => K.glow(o, 800, 330, 520, P.lantern, 0.18, 'cgl')));
  ART.cg('cg_lights_out', reuse('street_quiet', 'quiet', null, (o) => {
    // seen through Gus's window: frame and muntins
    const fr = '#1a1d26';
    return K.rect(0, 0, 1600, 70, fr) + K.rect(0, 830, 1600, 70, fr) + K.rect(0, 0, 90, 900, fr) + K.rect(1510, 0, 90, 900, fr) + K.rect(790, 0, 20, 900, fr) + K.rect(0, 440, 1600, 20, fr) +
      K.poly([[90, 70], [420, 70], [90, 830]], '#ffffff', { opacity: 0.03 });
  }));
  ART.bg('black', { times: ['night'], draw: () => K.rect(0, 0, 1600, 900, '#05060a') });
})();
