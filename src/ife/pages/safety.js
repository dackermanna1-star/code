// SAFETY BRIEFING slideshow (shown on every powered screen during the 'safety_demo'
// announcement, synchronised with the spoken sentences). Flat illustrated style,
// like an airline safety video / card.
import { C, text, fillRR, rr, wrap, ease, clamp01, logoMark } from '../ui/kit.js';

export const SAFETY_SLIDES = [
  { key: 'intro', title: 'Safety demonstration', match: /attention to the safety|safety demonstration/i },
  { key: 'belt', title: 'Seatbelt', match: /seatbelt|buckle|strap/i },
  { key: 'exits', title: 'Emergency exits', match: /exit/i },
  { key: 'floor', title: 'Floor-path lighting', match: /floor-path|lighting will guide/i },
  { key: 'oxygen', title: 'Oxygen masks', match: /oxygen|mask|breathe/i },
  { key: 'vest', title: 'Life vest', match: /life vest|inflate/i },
  { key: 'smoke', title: 'No smoking', match: /smoking|cigarette/i },
  { key: 'end', title: 'Thank you', match: /thank you for your attention/i },
];

/** Slide index for a sentence (keeps the previous slide when nothing matches). */
export function slideFor(sentence, prev = 0) {
  if (!sentence) return prev;
  for (let i = SAFETY_SLIDES.length - 1; i >= 0; i--) if (SAFETY_SLIDES[i].match.test(sentence)) return i;
  return prev;
}

const SKIN = '#e9b48f', SHIRT = '#2c6e8f', NAVY = '#0b2a4a', SEAT = '#355f8a', SEAT2 = '#2a4c70';

function person(ctx, x, y, s, { arm = 0, shirt = SHIRT } = {}) {
  // seated passenger seen from the front (head, torso, arms)
  ctx.fillStyle = shirt;
  rr(ctx, x - 34 * s, y - 10 * s, 68 * s, 86 * s, 24 * s); ctx.fill();
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(x, y - 40 * s, 24 * s, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a3326';
  ctx.beginPath(); ctx.arc(x, y - 46 * s, 25 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.strokeStyle = shirt; ctx.lineWidth = 16 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 30 * s, y + 4 * s); ctx.lineTo(x - 44 * s, y + 44 * s - arm * 60 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 30 * s, y + 4 * s); ctx.lineTo(x + 44 * s, y + 44 * s - arm * 60 * s); ctx.stroke();
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(x - 44 * s, y + 48 * s - arm * 60 * s, 9 * s, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 44 * s, y + 48 * s - arm * 60 * s, 9 * s, 0, 7); ctx.fill();
}

function seat(ctx, x, y, s) {
  ctx.fillStyle = SEAT2;
  rr(ctx, x - 60 * s, y - 90 * s, 120 * s, 190 * s, 26 * s); ctx.fill();
  ctx.fillStyle = SEAT;
  rr(ctx, x - 50 * s, y - 80 * s, 100 * s, 150 * s, 20 * s); ctx.fill();
  ctx.fillStyle = '#e8e4da';
  rr(ctx, x - 36 * s, y - 84 * s, 72 * s, 26 * s, 8 * s); ctx.fill();
}

function drawSlide(ctx, x, y, w, h, key, t) {
  const s = Math.min(w / 1280, h / 800);
  const cx = x + w * 0.5, cy = y + h * 0.47;
  ctx.save();
  if (key === 'intro' || key === 'end') {
    logoMark(ctx, cx - 70 * s, cy - 170 * s, 140 * s);
    text(ctx, key === 'intro' ? 'Your safety is our priority' : 'Thank you for your attention', cx, cy + 50 * s, { size: 44 * s, weight: 800, align: 'center', color: NAVY });
    text(ctx, key === 'intro' ? 'Please watch this short safety briefing' : 'Have a pleasant flight with Halcyon Airways', cx, cy + 100 * s, { size: 24 * s, align: 'center', color: '#3b5670' });
  } else if (key === 'belt') {
    // big buckle illustration: fitting slides into the buckle, then strap tightens
    const p = ease.inOutCubic(clamp01((t % 4) / 1.6));
    const tight = clamp01(((t % 4) - 1.8) / 0.8);
    ctx.fillStyle = '#5b7c9a';
    rr(ctx, cx - 420 * s, cy - 26 * s, 330 * s - tight * 30 * s, 52 * s, 8 * s); ctx.fill();
    rr(ctx, cx + 80 * s, cy - 26 * s, 340 * s, 52 * s, 8 * s); ctx.fill();
    // buckle (right)
    const bg = ctx.createLinearGradient(0, cy - 60 * s, 0, cy + 60 * s);
    bg.addColorStop(0, '#e9eef2'); bg.addColorStop(1, '#8e9aa5');
    ctx.fillStyle = bg;
    rr(ctx, cx - 10 * s, cy - 58 * s, 150 * s, 116 * s, 18 * s); ctx.fill();
    ctx.fillStyle = '#b8c3cc'; rr(ctx, cx + 10 * s, cy - 40 * s, 110 * s, 80 * s, 10 * s); ctx.fill();
    // tongue (left), moving
    const tx = cx - 200 * s + p * 180 * s;
    ctx.fillStyle = '#d6dde3';
    rr(ctx, tx - 80 * s, cy - 32 * s, 110 * s, 64 * s, 10 * s); ctx.fill();
    ctx.fillStyle = '#9aa7b2'; rr(ctx, tx - 66 * s, cy - 14 * s, 46 * s, 28 * s, 6 * s); ctx.fill();
    // arrow
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.moveTo(cx - 160 * s, cy - 120 * s); ctx.lineTo(cx - 40 * s, cy - 120 * s); ctx.lineTo(cx - 40 * s, cy - 138 * s); ctx.lineTo(cx, cy - 110 * s); ctx.lineTo(cx - 40 * s, cy - 82 * s); ctx.lineTo(cx - 40 * s, cy - 100 * s); ctx.lineTo(cx - 160 * s, cy - 100 * s); ctx.closePath(); ctx.fill();
    text(ctx, 'Insert · Tighten · Lift to release', cx, cy + 150 * s, { size: 30 * s, weight: 700, align: 'center', color: NAVY });
  } else if (key === 'exits') {
    // top view of the 737-800 with 8 exits
    const L = 900 * s, W = 120 * s;
    ctx.fillStyle = '#d9e2ea';
    // wings
    ctx.beginPath(); ctx.moveTo(cx - 40 * s, cy - W / 2); ctx.lineTo(cx + 90 * s, cy - 330 * s); ctx.lineTo(cx + 160 * s, cy - 330 * s); ctx.lineTo(cx + 120 * s, cy - W / 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 40 * s, cy + W / 2); ctx.lineTo(cx + 90 * s, cy + 330 * s); ctx.lineTo(cx + 160 * s, cy + 330 * s); ctx.lineTo(cx + 120 * s, cy + W / 2); ctx.closePath(); ctx.fill();
    // tail
    ctx.beginPath(); ctx.moveTo(cx + 340 * s, cy); ctx.lineTo(cx + 420 * s, cy - 130 * s); ctx.lineTo(cx + 460 * s, cy - 130 * s); ctx.lineTo(cx + 440 * s, cy); ctx.lineTo(cx + 460 * s, cy + 130 * s); ctx.lineTo(cx + 420 * s, cy + 130 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f7fa';
    rr(ctx, cx - L / 2, cy - W / 2, L, W, W / 2); ctx.fill();
    ctx.strokeStyle = '#9fb2c3'; ctx.lineWidth = 2 * s; ctx.stroke();
    // seats rows
    ctx.fillStyle = '#9fb7cc';
    for (let i = 0; i < 26; i++) { const sx = cx - 300 * s + i * 25 * s; for (const sy of [-40, -26, -12, 12, 26, 40]) ctx.fillRect(sx, cy + sy * s - 5 * s, 16 * s, 10 * s); }
    const exits = [[-380, -1], [-380, 1], [-45, -1], [-20, -1], [-45, 1], [-20, 1], [320, -1], [320, 1]];
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    for (const [ex, side] of exits) {
      const px = cx + ex * s, py = cy + side * (W / 2);
      ctx.fillStyle = `rgba(30,170,90,${pulse})`;
      ctx.beginPath(); ctx.arc(px, py, 16 * s, 0, 7); ctx.fill();
      ctx.fillStyle = '#1aa05a';
      ctx.beginPath(); ctx.moveTo(px - 12 * s, py + side * 26 * s); ctx.lineTo(px + 12 * s, py + side * 26 * s); ctx.lineTo(px, py + side * 50 * s); ctx.closePath(); ctx.fill();
    }
    text(ctx, '8 emergency exits — the nearest may be behind you', cx, y + h * 0.9, { size: 30 * s, weight: 700, align: 'center', color: NAVY });
  } else if (key === 'floor') {
    // aisle in perspective with floor path lights leading to an EXIT sign
    const vx = cx, vy = cy - 80 * s;
    ctx.fillStyle = '#2a3a4c'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3c5068';
    ctx.beginPath(); ctx.moveTo(vx - 30 * s, vy); ctx.lineTo(vx + 30 * s, vy); ctx.lineTo(vx + 320 * s, y + h); ctx.lineTo(vx - 320 * s, y + h); ctx.closePath(); ctx.fill();
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 14; i++) {
        const k = i / 14, kk = k * k;
        const px = vx + side * (30 + 290 * kk) * s, py = vy + (y + h - vy) * kk;
        const on = (Math.floor(t * 8) - i) % 14 === 0 ? 1 : 0.55;
        ctx.fillStyle = `rgba(255,240,170,${on})`;
        ctx.beginPath(); ctx.arc(px, py, (2 + 8 * kk) * s, 0, 7); ctx.fill();
      }
    }
    fillRR(ctx, vx - 60 * s, vy - 70 * s, 120 * s, 46 * s, 6 * s, '#1aa05a');
    text(ctx, 'EXIT', vx, vy - 36 * s, { size: 30 * s, weight: 800, align: 'center', color: '#fff' });
    text(ctx, 'Follow the floor lights to an exit', cx, y + h * 0.9, { size: 30 * s, weight: 700, align: 'center', color: '#fff' });
  } else if (key === 'oxygen') {
    const T = t % 6;
    const drop = ease.outBack(clamp01(T / 0.7));
    const pull = ease.inOutCubic(clamp01((T - 1.3) / 0.9));
    const on = ease.inOutCubic(clamp01((T - 2.4) / 0.8));
    const bx = cx - 40 * s, by = cy + 40 * s;          // hip point of the seated passenger (profile, facing right)
    // ceiling panel + open mask door
    ctx.fillStyle = '#d4dbe2'; rr(ctx, cx - 330 * s, y + 30 * s, 560 * s, 64 * s, 12 * s); ctx.fill();
    ctx.fillStyle = '#aab6c2'; ctx.save(); ctx.translate(cx + 40 * s, y + 94 * s); ctx.rotate(0.9 * drop); ctx.fillRect(0, 0, 110 * s, 8 * s); ctx.restore();
    // seat (profile)
    ctx.fillStyle = SEAT2;
    ctx.save(); ctx.translate(bx - 40 * s, by); ctx.rotate(-0.22); rr(ctx, -30 * s, -250 * s, 56 * s, 270 * s, 22 * s); ctx.fill(); ctx.restore();
    rr(ctx, bx - 70 * s, by - 10 * s, 210 * s, 46 * s, 18 * s); ctx.fill();
    ctx.fillRect(bx - 10 * s, by + 30 * s, 16 * s, 120 * s); ctx.fillRect(bx + 90 * s, by + 30 * s, 16 * s, 120 * s);
    // passenger: legs, torso, head
    ctx.strokeStyle = '#3f4f66'; ctx.lineCap = 'round'; ctx.lineWidth = 34 * s;
    ctx.beginPath(); ctx.moveTo(bx, by - 6 * s); ctx.lineTo(bx + 130 * s, by - 6 * s); ctx.lineTo(bx + 150 * s, by + 120 * s); ctx.stroke();
    ctx.strokeStyle = SHIRT; ctx.lineWidth = 52 * s;
    const sx2 = bx - 22 * s, sy2 = by - 170 * s;
    ctx.beginPath(); ctx.moveTo(bx - 4 * s, by - 20 * s); ctx.lineTo(sx2, sy2); ctx.stroke();
    const hx = sx2 + 8 * s, hy = sy2 - 52 * s;
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, 34 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a3326'; ctx.beginPath(); ctx.arc(hx - 4 * s, hy - 6 * s, 35 * s, Math.PI * 0.85, Math.PI * 1.9); ctx.fill();
    // mask position: hanging -> in hand -> on the face
    const hang = { x: cx + 120 * s, y: y + 100 * s + drop * 170 * s };
    const face = { x: hx + 34 * s, y: hy + 10 * s };
    const mx = hang.x + (face.x - hang.x) * Math.max(pull * 0.55, on), my = hang.y + (face.y - hang.y) * Math.max(pull * 0.55, on);
    // arm reaching to the mask
    const sh = { x: sx2 + 10 * s, y: sy2 + 20 * s };
    const hand = pull > 0 ? { x: mx + 4 * s, y: my + 20 * s } : { x: bx + 60 * s, y: by - 40 * s };
    ctx.strokeStyle = SHIRT; ctx.lineWidth = 22 * s;
    const el = { x: (sh.x + hand.x) / 2 + 10 * s, y: (sh.y + hand.y) / 2 + 40 * s };
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hand.x, hand.y, 11 * s, 0, 7); ctx.fill();
    // tube from the panel
    ctx.strokeStyle = '#8aa8be'; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(cx + 120 * s, y + 94 * s); ctx.bezierCurveTo(cx + 140 * s, (y + 94 * s + my) / 2, mx + 30 * s, my - 60 * s, mx + 10 * s, my - 12 * s); ctx.stroke();
    // mask (yellow cup + elastic)
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath(); ctx.ellipse(mx, my, 20 * s, 26 * s, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e0a800'; ctx.lineWidth = 3 * s; ctx.stroke();
    if (on > 0.5) { ctx.strokeStyle = 'rgba(80,80,80,0.8)'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(mx - 14 * s, my - 14 * s); ctx.lineTo(hx - 30 * s, hy - 8 * s); ctx.stroke(); }
    // reservoir bag
    ctx.fillStyle = 'rgba(240,240,236,0.95)'; rr(ctx, mx - 9 * s, my + 24 * s, 18 * s, 30 * s, 6 * s); ctx.fill();
    text(ctx, 'Pull down · Place over nose and mouth · Breathe normally', cx, y + h * 0.93, { size: 26 * s, weight: 700, align: 'center', color: NAVY });
  } else if (key === 'vest') {
    seat(ctx, cx - 260 * s, cy + 40 * s, s * 1.2);
    fillRR(ctx, cx - 320 * s, cy + 150 * s, 120 * s, 36 * s, 8 * s, '#f1c232');
    text(ctx, 'LIFE VEST UNDER SEAT', cx - 260 * s, cy + 220 * s, { size: 18 * s, weight: 700, align: 'center', color: NAVY });
    // vest
    const bob = Math.sin(t * 2) * 6 * s;
    ctx.fillStyle = '#f2b41f';
    ctx.beginPath();
    ctx.moveTo(cx + 120 * s, cy - 150 * s + bob); ctx.lineTo(cx + 190 * s, cy - 150 * s + bob); ctx.lineTo(cx + 210 * s, cy - 60 * s + bob);
    ctx.bezierCurveTo(cx + 230 * s, cy + 60 * s + bob, cx + 210 * s, cy + 120 * s + bob, cx + 160 * s, cy + 130 * s + bob);
    ctx.lineTo(cx + 160 * s, cy - 80 * s + bob); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 320 * s, cy - 150 * s + bob); ctx.lineTo(cx + 250 * s, cy - 150 * s + bob); ctx.lineTo(cx + 230 * s, cy - 60 * s + bob);
    ctx.bezierCurveTo(cx + 210 * s, cy + 60 * s + bob, cx + 230 * s, cy + 120 * s + bob, cx + 280 * s, cy + 130 * s + bob);
    ctx.lineTo(cx + 280 * s, cy - 80 * s + bob); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c98e0c'; ctx.lineWidth = 3 * s; ctx.stroke();
    ctx.fillStyle = '#c33'; ctx.fillRect(cx + 150 * s, cy + 120 * s + bob, 12 * s, 40 * s); ctx.fillRect(cx + 278 * s, cy + 120 * s + bob, 12 * s, 40 * s);
    text(ctx, 'Do not inflate inside the aircraft', cx, y + h * 0.9, { size: 30 * s, weight: 700, align: 'center', color: NAVY });
  } else if (key === 'smoke') {
    const r = 170 * s;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    fillRR(ctx, cx - 120 * s, cy - 14 * s, 200 * s, 28 * s, 6 * s, '#333');
    fillRR(ctx, cx + 80 * s, cy - 14 * s, 40 * s, 28 * s, 6 * s, '#e88a3a');
    ctx.strokeStyle = '#999'; ctx.lineWidth = 6 * s;
    ctx.beginPath(); ctx.moveTo(cx + 120 * s, cy - 30 * s); ctx.bezierCurveTo(cx + 140 * s, cy - 70 * s, cx + 100 * s, cy - 90 * s, cx + 130 * s, cy - 130 * s); ctx.stroke();
    ctx.strokeStyle = '#d42d2d'; ctx.lineWidth = 26 * s;
    ctx.beginPath(); ctx.arc(cx, cy, r - 13 * s, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - (r - 20 * s) * 0.707, cy - (r - 20 * s) * 0.707); ctx.lineTo(cx + (r - 20 * s) * 0.707, cy + (r - 20 * s) * 0.707); ctx.stroke();
    text(ctx, 'Smoking and e-cigarettes are prohibited', cx, y + h * 0.9, { size: 30 * s, weight: 700, align: 'center', color: NAVY });
  }
  ctx.restore();
}

/**
 * Full safety screen: light background, slide art, title chip and live caption.
 * state: { slide, slideT0, sentence }
 */
export function drawSafety(ctx, x, y, w, h, now, state) {
  const s = Math.min(w / 1280, h / 800);
  const sl = SAFETY_SLIDES[state.slide] || SAFETY_SLIDES[0];
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#d9dcd8'); g.addColorStop(1, '#c4d0da');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const tIn = now - (state.slideT0 || 0);
  const a = ease.outCubic(clamp01(tIn / 0.5));
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate((1 - a) * 30 * s, 0);
  drawSlide(ctx, x, y + 40 * s, w, h - 150 * s, sl.key, tIn);
  ctx.restore();
  // header band
  ctx.fillStyle = NAVY;
  ctx.fillRect(x, y, w, 64 * s);
  logoMark(ctx, x + 20 * s, y + 10 * s, 44 * s);
  text(ctx, 'SAFETY BRIEFING', x + 80 * s, y + 42 * s, { size: 24 * s, weight: 800, spacing: 2 * s });
  text(ctx, sl.title, x + w - 24 * s, y + 42 * s, { size: 24 * s, weight: 600, align: 'right', color: C.gold });
  // progress pips (in the header band)
  for (let i = 0; i < SAFETY_SLIDES.length; i++) {
    ctx.fillStyle = i <= state.slide ? C.gold : 'rgba(255,255,255,0.22)';
    rr(ctx, x + w / 2 - SAFETY_SLIDES.length * 14 * s + i * 28 * s, y + 30 * s, 20 * s, 5 * s, 2.5 * s); ctx.fill();
  }
  // caption band
  if (state.sentence) {
    const ch = 96 * s;
    ctx.fillStyle = 'rgba(11,42,74,0.92)';
    ctx.fillRect(x, y + h - ch, w, ch);
    wrap(ctx, state.sentence, x + 40 * s, y + h - ch + 38 * s, w - 80 * s, 32 * s, { size: 25 * s, weight: 500, color: '#fff', maxLines: 2 });
  }
}
