// Draws Shirts / Pants / T-Shirts. A clothing spec is either
//   { image: HTMLImageElement|HTMLCanvasElement }  -- a real 585x559 template
// or a procedural design { style, color, color2, color3, text } used for the
// recreated catalog items (original 2008 clothing images are not available).
import { REGIONS, TEMPLATE_W, TEMPLATE_H } from './template.js';
import { DESIGNS } from './tshirts.js';

function rect(ctx, r, color) { ctx.fillStyle = color; ctx.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f))); g = Math.max(0, Math.min(255, Math.round(g * f))); b = Math.max(0, Math.min(255, Math.round(b * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Fill the part of a limb region that is covered, from the shoulder down. */
function sleeve(ctx, limb, color, fraction, cuff) {
  const R = REGIONS[limb];
  rect(ctx, R.Top, color);
  for (const f of ['Front', 'Back', 'Left', 'Right']) {
    const [x, y, w, h] = R[f];
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 1, w + 2, Math.round(h * fraction) + 1);
    if (cuff) {
      ctx.fillStyle = cuff;
      ctx.fillRect(x - 1, y + Math.round(h * fraction) - 8, w + 2, 8);
    }
  }
  if (fraction >= 1) rect(ctx, R.Bottom, cuff || color);
}

function torsoAll(ctx, color) { for (const r of Object.values(REGIONS.torso)) rect(ctx, r, color); }

function seams(ctx, r, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
}

const SHIRTS = {
  tee(ctx, s) {
    torsoAll(ctx, s.color);
    sleeve(ctx, 'rightLimb', s.color, 0.32, shade(s.color, 0.85));
    sleeve(ctx, 'leftLimb', s.color, 0.32, shade(s.color, 0.85));
    collar(ctx, shade(s.color, 0.8));
    if (s.text) frontText(ctx, s.text, s.color2 || '#fff');
  },
  long(ctx, s) {
    torsoAll(ctx, s.color);
    sleeve(ctx, 'rightLimb', s.color, 1, shade(s.color, 0.85));
    sleeve(ctx, 'leftLimb', s.color, 1, shade(s.color, 0.85));
    collar(ctx, shade(s.color, 0.8));
    if (s.text) frontText(ctx, s.text, s.color2 || '#fff');
  },
  stripes(ctx, s) {
    for (const r of Object.values(REGIONS.torso)) {
      rect(ctx, r, s.color);
      ctx.fillStyle = s.color2;
      for (let y = r[1] + 6; y < r[1] + r[3]; y += 22) ctx.fillRect(r[0] - 1, y, r[2] + 2, 10);
    }
    for (const limb of ['rightLimb', 'leftLimb']) {
      sleeve(ctx, limb, s.color, 1, s.color);
      for (const f of ['Front', 'Back', 'Left', 'Right']) {
        const [x, y, w, h] = REGIONS[limb][f];
        ctx.fillStyle = s.color2;
        for (let yy = y + 6; yy < y + h; yy += 22) ctx.fillRect(x - 1, yy, w + 2, 10);
      }
    }
    collar(ctx, shade(s.color, 0.7));
  },
  jacket(ctx, s) {
    // open jacket (color) over an inner shirt (color2), long sleeves
    torsoAll(ctx, s.color);
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.fillStyle = s.color2;
    ctx.beginPath();
    ctx.moveTo(fx + fw * 0.36, fy); ctx.lineTo(fx + fw * 0.64, fy); ctx.lineTo(fx + fw * 0.6, fy + fh); ctx.lineTo(fx + fw * 0.4, fy + fh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(s.color, 0.6); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.36, fy); ctx.lineTo(fx + fw * 0.4, fy + fh); ctx.moveTo(fx + fw * 0.64, fy); ctx.lineTo(fx + fw * 0.6, fy + fh); ctx.stroke();
    // lapels
    ctx.fillStyle = shade(s.color, 0.8);
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.36, fy); ctx.lineTo(fx + fw * 0.26, fy + 30); ctx.lineTo(fx + fw * 0.39, fy + 52); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.64, fy); ctx.lineTo(fx + fw * 0.74, fy + 30); ctx.lineTo(fx + fw * 0.61, fy + 52); ctx.closePath(); ctx.fill();
    // pockets
    ctx.fillStyle = shade(s.color, 0.75);
    ctx.fillRect(fx + 12, fy + fh - 40, 26, 4); ctx.fillRect(fx + fw - 38, fy + fh - 40, 26, 4);
    sleeve(ctx, 'rightLimb', s.color, 1, shade(s.color, 0.8));
    sleeve(ctx, 'leftLimb', s.color, 1, shade(s.color, 0.8));
    if (s.color3) { // tie
      ctx.fillStyle = s.color3;
      ctx.beginPath(); ctx.moveTo(fx + fw / 2 - 5, fy + 4); ctx.lineTo(fx + fw / 2 + 5, fy + 4); ctx.lineTo(fx + fw / 2 + 8, fy + 80); ctx.lineTo(fx + fw / 2, fy + 92); ctx.lineTo(fx + fw / 2 - 8, fy + 80); ctx.closePath(); ctx.fill();
    }
  },
  hoodie(ctx, s) {
    torsoAll(ctx, s.color);
    sleeve(ctx, 'rightLimb', s.color, 1, shade(s.color, 0.85));
    sleeve(ctx, 'leftLimb', s.color, 1, shade(s.color, 0.85));
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.fillStyle = shade(s.color, 0.85);
    ctx.fillRect(fx + 24, fy + fh - 46, fw - 48, 34); // pouch
    ctx.strokeStyle = shade(s.color, 0.6); ctx.lineWidth = 2;
    ctx.strokeRect(fx + 24, fy + fh - 46, fw - 48, 34);
    ctx.strokeStyle = s.color2 || '#eee'; ctx.lineWidth = 3; // drawstrings
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.42, fy); ctx.lineTo(fx + fw * 0.42, fy + 36); ctx.moveTo(fx + fw * 0.58, fy); ctx.lineTo(fx + fw * 0.58, fy + 36); ctx.stroke();
    const [bx, by, bw] = REGIONS.torso.Back; // hood on the back
    ctx.fillStyle = shade(s.color, 0.8);
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, by, bw * 0.38, 42, 0, 0, Math.PI); ctx.fill();
    if (s.text) frontText(ctx, s.text, s.color2 || '#fff', 0.38);
  },
  plaid(ctx, s) {
    const paint = (x, y, w, h) => {
      ctx.fillStyle = s.color; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.globalAlpha = 0.55; ctx.fillStyle = s.color2;
      for (let i = x - 1; i < x + w; i += 24) ctx.fillRect(i, y - 1, 9, h + 2);
      for (let j = y - 1; j < y + h; j += 24) ctx.fillRect(x - 1, j, w + 2, 9);
      ctx.globalAlpha = 1; ctx.fillStyle = shade(s.color2, 0.6);
      for (let i = x + 3; i < x + w; i += 24) ctx.fillRect(i, y - 1, 1, h + 2);
    };
    for (const r of Object.values(REGIONS.torso)) paint(...r);
    for (const limb of ['rightLimb', 'leftLimb']) for (const r of Object.values(REGIONS[limb])) paint(...r);
    // buttons
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.fillStyle = '#eee';
    for (let y = fy + 16; y < fy + fh; y += 26) { ctx.beginPath(); ctx.arc(fx + fw / 2, y, 3, 0, 7); ctx.fill(); }
  },
  vest(ctx, s) {
    // sleeveless (arms stay skin), e.g. a sports jersey
    torsoAll(ctx, s.color);
    collar(ctx, s.color2 || shade(s.color, 0.7));
    if (s.text) frontText(ctx, s.text, s.color2 || '#fff', 0.5, 40);
  },
  camo(ctx, s) {
    SHIRTS.long(ctx, { color: s.color || '#4b5a33' });
    camoBlobs(ctx, [REGIONS.torso, REGIONS.rightLimb, REGIONS.leftLimb], s.blobs);
  },
  hawaiian(ctx, s) {
    // short-sleeved, buttoned, with a scatter of flowers
    SHIRTS.tee(ctx, { color: s.color || '#c4281c' });
    const paint = (x, y, w, h) => flowers(ctx, x, y, w, h, s.color2 || '#f2f2f2', s.color3 || '#f2d020');
    for (const r of Object.values(REGIONS.torso)) paint(...r);
    for (const limb of ['rightLimb', 'leftLimb']) for (const f of ['Front', 'Back', 'Left', 'Right']) {
      const [x, y, w, h] = REGIONS[limb][f]; paint(x, y, w, h * 0.3);
    }
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.fillStyle = shade(s.color || '#c4281c', 0.7); ctx.fillRect(fx + fw / 2 - 1, fy + 10, 2, fh - 10);
  },
  police(ctx, s) {
    const c = s.color || '#3a5a9a';
    SHIRTS.long(ctx, { color: c });
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.strokeStyle = shade(c, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy + 18); ctx.lineTo(fx + fw / 2, fy + fh); ctx.stroke();
    ctx.fillStyle = '#e8e8e8';
    for (let y = fy + 30; y < fy + fh - 8; y += 22) { ctx.beginPath(); ctx.arc(fx + fw / 2 + 5, y, 2.5, 0, 7); ctx.fill(); }
    // collar points, pocket flaps, badge and belt
    ctx.fillStyle = shade(c, 0.8);
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy + 18); ctx.lineTo(fx + fw * 0.3, fy); ctx.lineTo(fx + fw * 0.36, fy + 22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy + 18); ctx.lineTo(fx + fw * 0.7, fy); ctx.lineTo(fx + fw * 0.64, fy + 22); ctx.closePath(); ctx.fill();
    ctx.fillRect(fx + 14, fy + 36, 30, 8); ctx.fillRect(fx + fw - 44, fy + 36, 30, 8);
    star(ctx, fx + 29, fy + 58, 9, '#d8b040');
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(fx - 1, fy + fh - 12, fw + 2, 12);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(fx + fw / 2 - 6, fy + fh - 11, 12, 10);
    for (const limb of ['rightLimb', 'leftLimb']) {
      const [x, y, w] = REGIONS[limb].Left; ctx.fillStyle = '#d8b040'; ctx.fillRect(x + w / 2 - 10, y + 14, 20, 12);
    }
  },
  battle(ctx, s) {
    // dark plate armour with coloured trim and gold rivets
    const plate = s.color || '#3a3f47', trim = s.color2 || '#c4281c', gold = s.color3 || '#d8b040';
    const armour = (x, y, w, h, rows) => {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, shade(plate, 1.35)); g.addColorStop(0.5, plate); g.addColorStop(1, shade(plate, 0.75));
      ctx.fillStyle = g; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.strokeStyle = shade(plate, 0.55); ctx.lineWidth = 2;
      for (let i = 1; i < rows; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * i / rows); ctx.lineTo(x + w, y + h * i / rows); ctx.stroke(); }
      ctx.fillStyle = gold;
      for (let i = 0; i < rows; i++) for (const fx of [0.12, 0.88]) { ctx.beginPath(); ctx.arc(x + w * fx, y + h * (i + 0.5) / rows, 2.5, 0, 7); ctx.fill(); }
    };
    for (const r of Object.values(REGIONS.torso)) armour(r[0], r[1], r[2], r[3], 1);
    const [fx, fy, fw, fh] = REGIONS.torso.Front;
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.3, fy); ctx.lineTo(fx + fw / 2, fy + 34); ctx.lineTo(fx + fw * 0.7, fy); ctx.closePath(); ctx.fill();
    ctx.fillRect(fx - 1, fy + fh - 16, fw + 2, 16);
    ctx.fillStyle = gold; ctx.fillRect(fx + fw / 2 - 9, fy + fh - 16, 18, 16);
    ctx.strokeStyle = shade(plate, 0.6); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx + fw / 2, fy + 40); ctx.lineTo(fx + fw / 2, fy + fh - 20); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx + fw * 0.3, fy + 64, 22, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx + fw * 0.7, fy + 64, 22, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    for (const limb of ['rightLimb', 'leftLimb']) {
      for (const f of ['Front', 'Back', 'Left', 'Right']) { const [x, y, w, h] = REGIONS[limb][f]; armour(x, y, w, h, 4); }
      rect(ctx, REGIONS[limb].Top, trim);
      rect(ctx, REGIONS[limb].Bottom, plate);
    }
  },
  wrap(ctx, s) {
    // bandage wrappings (for The Mummy)
    const base = s.color || '#e8e2cc';
    const paint = (x, y, w, h, seedOff) => {
      ctx.fillStyle = base; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      const rnd = seeded(31 + seedOff);
      ctx.lineWidth = 2;
      for (let yy = y + 4; yy < y + h; yy += 7 + rnd() * 5) {
        ctx.strokeStyle = rnd() < 0.5 ? '#b8ae90' : '#cfc6a8';
        ctx.beginPath(); ctx.moveTo(x - 1, yy); ctx.lineTo(x + w + 1, yy + (rnd() - 0.5) * 10); ctx.stroke();
      }
    };
    let k = 0;
    for (const set of [REGIONS.torso, REGIONS.rightLimb, REGIONS.leftLimb]) for (const r of Object.values(set)) paint(...r, k++);
  },
  suit(ctx, s) { SHIRTS.jacket(ctx, { color: s.color || '#1b1b1b', color2: '#f2f2f2', color3: s.color3 || '#a01818' }); },
};

function star(ctx, cx, cy, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.fill();
}

function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function camoBlobs(ctx, sets, colors = ['#2f3a20', '#7a6b45', '#5d6b3c']) {
  const rnd = seeded(11);
  for (const set of sets) for (const [x, y, w, h] of Object.values(set)) {
    const n = Math.max(3, Math.round(w * h / 900));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.ellipse(x + rnd() * w, y + rnd() * h, 6 + rnd() * 10, 4 + rnd() * 7, rnd() * 3, 0, 7); ctx.fill();
    }
  }
}

function flowers(ctx, x, y, w, h, petal, centre) {
  const rnd = seeded(Math.round(x * 31 + y));
  ctx.save(); ctx.beginPath(); ctx.rect(x - 1, y - 1, w + 2, h + 2); ctx.clip();
  const n = Math.max(2, Math.round(w * h / 1100));
  for (let i = 0; i < n; i++) {
    const cx = x + rnd() * w, cy = y + rnd() * h, r = 5 + rnd() * 4;
    ctx.fillStyle = petal;
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.7, r * 0.45, a, 0, 7); ctx.fill(); }
    ctx.fillStyle = centre; ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function collar(ctx, color) {
  const [fx, fy, fw] = REGIONS.torso.Front;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(fx + fw / 2, fy, fw * 0.17, 10, 0, 0, Math.PI); ctx.fill();
}

function frontText(ctx, text, color, yFrac = 0.42, size = 26) {
  const [fx, fy, fw, fh] = REGIONS.torso.Front;
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, fx + fw / 2, fy + fh * yFrac, fw - 10);
}

const PANTS = {
  jeans(ctx, s) {
    const c = s.color || '#3b5b8f';
    const [tx, ty, tw, th] = REGIONS.torso.Front;
    for (const [k, r] of Object.entries(REGIONS.torso)) {
      if (k === 'Top') continue;
      const [x, y, w, h] = r;
      ctx.fillStyle = c;
      if (k === 'Bottom') ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      else ctx.fillRect(x - 1, y + h * 0.62, w + 2, h * 0.38 + 2);
      ctx.fillStyle = s.belt || '#3a2a1a';
      if (k !== 'Bottom') ctx.fillRect(x - 1, y + h * 0.62, w + 2, 8);
    }
    ctx.fillStyle = '#c8a040'; ctx.fillRect(tx + tw / 2 - 6, ty + th * 0.62 + 1, 12, 6); // buckle
    for (const limb of ['rightLimb', 'leftLimb']) {
      for (const [k, r] of Object.entries(REGIONS[limb])) {
        rect(ctx, r, c);
        if (k === 'Left' || k === 'Right') {
          ctx.strokeStyle = shade(c, 1.3); ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(r[0] + r[2] / 2, r[1]); ctx.lineTo(r[0] + r[2] / 2, r[1] + r[3]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (k === 'Bottom') rect(ctx, r, shade(c, 0.6));
      }
    }
    if (s.shoes) shoes(ctx, s.shoes);
  },
  plain(ctx, s) {
    const c = s.color;
    for (const [k, r] of Object.entries(REGIONS.torso)) {
      if (k === 'Top') continue;
      const [x, y, w, h] = r;
      ctx.fillStyle = c;
      if (k === 'Bottom') ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      else ctx.fillRect(x - 1, y + h * 0.66, w + 2, h * 0.34 + 2);
    }
    for (const limb of ['rightLimb', 'leftLimb']) for (const r of Object.values(REGIONS[limb])) rect(ctx, r, c);
    if (s.crease) {
      for (const limb of ['rightLimb', 'leftLimb']) {
        const [x, y, w, h] = REGIONS[limb].Front;
        ctx.strokeStyle = shade(c, 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
      }
    }
    if (s.shoes) shoes(ctx, s.shoes);
  },
  shorts(ctx, s) {
    const c = s.color;
    for (const [k, r] of Object.entries(REGIONS.torso)) {
      if (k === 'Top') continue;
      const [x, y, w, h] = r;
      ctx.fillStyle = c;
      if (k === 'Bottom') ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      else ctx.fillRect(x - 1, y + h * 0.66, w + 2, h * 0.34 + 2);
    }
    for (const limb of ['rightLimb', 'leftLimb']) {
      rect(ctx, REGIONS[limb].Top, c);
      for (const f of ['Front', 'Back', 'Left', 'Right']) {
        const [x, y, w, h] = REGIONS[limb][f];
        ctx.fillStyle = c; ctx.fillRect(x - 1, y - 1, w + 2, h * 0.45);
      }
    }
    if (s.shoes) shoes(ctx, s.shoes);
  },
  battle(ctx, s) {
    const plate = s.color || '#3a3f47', trim = s.color2 || '#c4281c';
    PANTS.plain(ctx, { color: plate, shoes: s.shoes || '#222222' });
    for (const [k, r] of Object.entries(REGIONS.torso)) {
      if (k === 'Top' || k === 'Bottom') continue;
      ctx.fillStyle = trim; ctx.fillRect(r[0] - 1, r[1] + r[3] * 0.66, r[2] + 2, 10);
    }
    for (const limb of ['rightLimb', 'leftLimb']) for (const f of ['Front', 'Back', 'Left', 'Right']) {
      const [x, y, w, h] = REGIONS[limb][f];
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, shade(plate, 1.3)); g.addColorStop(1, shade(plate, 0.8));
      ctx.fillStyle = g; ctx.fillRect(x - 1, y - 1, w + 2, h - 17);
      ctx.strokeStyle = shade(plate, 0.5); ctx.lineWidth = 2;
      for (const fy of [0.3, 0.55]) { ctx.beginPath(); ctx.moveTo(x, y + h * fy); ctx.lineTo(x + w, y + h * fy); ctx.stroke(); }
      if (f === 'Front') { ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.43, 9, 0, 7); ctx.fill(); }
    }
  },
  robe(ctx, s) {
    // a long robe: covers the waist and both legs to the feet, with a darker hem
    const c = s.color, hem = s.color2 || shade(c, 0.75);
    for (const [k, r] of Object.entries(REGIONS.torso)) {
      if (k === 'Top') continue;
      const [x, y, w, h] = r;
      ctx.fillStyle = c;
      if (k === 'Bottom') ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      else ctx.fillRect(x - 1, y + h * 0.6, w + 2, h * 0.4 + 2);
      if (k !== 'Bottom') { ctx.fillStyle = hem; ctx.fillRect(x - 1, y + h * 0.6, w + 2, 7); }
    }
    for (const limb of ['rightLimb', 'leftLimb']) {
      for (const [k, r] of Object.entries(REGIONS[limb])) {
        rect(ctx, r, c);
        if (k === 'Front' || k === 'Back' || k === 'Left' || k === 'Right') {
          const [x, y, w, h] = r;
          ctx.fillStyle = hem; ctx.fillRect(x - 1, y + h - 14, w + 2, 15);
          ctx.strokeStyle = shade(c, 0.82); ctx.lineWidth = 2;
          for (const fx of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(x + w * fx, y); ctx.lineTo(x + w * (fx + (fx < 0.5 ? -0.1 : 0.1)), y + h - 14); ctx.stroke(); }
        }
      }
    }
  },
  wrap(ctx, s) { SHIRTS.wrap(ctx, s); },
  camo(ctx, s) {
    PANTS.plain(ctx, { color: s.color || '#4b5a33', shoes: s.shoes || '#2a2a2a' });
    camoBlobs(ctx, [REGIONS.rightLimb, REGIONS.leftLimb], s.blobs);
  },
};

function shoes(ctx, color) {
  for (const limb of ['rightLimb', 'leftLimb']) {
    for (const f of ['Front', 'Back', 'Left', 'Right']) {
      const [x, y, w, h] = REGIONS[limb][f];
      ctx.fillStyle = color; ctx.fillRect(x - 1, y + h - 18, w + 2, 19);
    }
    rect(ctx, REGIONS[limb].Bottom, color);
  }
}

// T-shirts are a single square decal on the torso front.
const TSHIRTS = {
  design(ctx, s, S) { (DESIGNS[s.design] || DESIGNS.robuk)(ctx, S); },
  wrench(ctx, s, S) { DESIGNS.wrench(ctx, S); },
  logo(ctx, s, S) {
    ctx.fillStyle = s.bg || 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, S, S);
    ctx.font = `italic bold ${S * 0.62}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#fff'; ctx.strokeText(s.text || 'R', S / 2, S / 2);
    ctx.fillStyle = s.color || '#e2231a'; ctx.fillText(s.text || 'R', S / 2, S / 2);
  },
  text(ctx, s, S) {
    ctx.fillStyle = s.color || '#fff';
    ctx.font = `bold ${S * (s.size || 0.2)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = String(s.text).split('\n');
    lines.forEach((ln, i) => ctx.fillText(ln, S / 2, S / 2 + (i - (lines.length - 1) / 2) * S * (s.size || 0.2) * 1.15, S * 0.92));
  },
  smiley(ctx, s, S) {
    ctx.fillStyle = s.color || '#f5cd30';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.36, 0, 7); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = S * 0.03; ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(S * 0.4, S * 0.42, S * 0.03, S * 0.07, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(S * 0.6, S * 0.42, S * 0.03, S * 0.07, 0, 0, 7); ctx.fill();
    ctx.lineWidth = S * 0.035; ctx.beginPath(); ctx.arc(S / 2, S * 0.5, S * 0.19, 0.5, Math.PI - 0.5); ctx.stroke();
  },
  heart(ctx, s, S) {
    ctx.fillStyle = s.color || '#d22';
    ctx.beginPath();
    ctx.moveTo(S / 2, S * 0.78);
    ctx.bezierCurveTo(S * 0.1, S * 0.5, S * 0.22, S * 0.18, S / 2, S * 0.36);
    ctx.bezierCurveTo(S * 0.78, S * 0.18, S * 0.9, S * 0.5, S / 2, S * 0.78);
    ctx.fill();
  },
  flame(ctx, s, S) {
    const g = ctx.createLinearGradient(0, S, 0, 0);
    g.addColorStop(0, '#ff3000'); g.addColorStop(0.6, '#ffb000'); g.addColorStop(1, '#fff080');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(S * 0.2, S * 0.85);
    for (let i = 0; i <= 6; i++) { const x = S * (0.2 + i * 0.1); ctx.lineTo(x, S * (i % 2 ? 0.25 : 0.45)); }
    ctx.lineTo(S * 0.8, S * 0.85); ctx.closePath(); ctx.fill();
  },
};

export function drawClothing(ctx, spec, kind) {
  if (!spec) return;
  if (spec.image) {
    if (kind === 'tshirt') ctx.drawImage(spec.image, 0, 0, ctx.canvas.width, ctx.canvas.height);
    else ctx.drawImage(spec.image, 0, 0, TEMPLATE_W, TEMPLATE_H);
    return;
  }
  if (kind === 'tshirt') {
    (TSHIRTS[spec.style] || TSHIRTS.text)(ctx, spec, ctx.canvas.width);
    return;
  }
  const table = kind === 'pants' ? PANTS : SHIRTS;
  const fn = table[spec.style] || (kind === 'pants' ? PANTS.plain : SHIRTS.long);
  ctx.save();
  fn(ctx, spec);
  ctx.restore();
}

/** Render a full template image (used by the catalog to show "template" previews). */
export function clothingTemplateCanvas(spec, kind) {
  const c = document.createElement('canvas');
  c.width = TEMPLATE_W; c.height = TEMPLATE_H;
  drawClothing(c.getContext('2d'), spec, kind);
  return c;
}
