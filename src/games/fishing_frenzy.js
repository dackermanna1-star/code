// Fishing Frenzy — a cozy day at the lake: cast, hook on the bite, reel with a tension bar,
// and fill a persistent fish collection (stored in state.flags.fishDex) across 14 species.
import { defineGame } from './index.js';
import { G } from '../game.js';

const SPECIES = [
  { id: 'minnow', name: 'Minnow', rar: 'common', w: [0.05, 0.2], pts: 10, diff: 0.6, col: '#9fb3c8', col2: '#e9ecef' },
  { id: 'bluegill', name: 'Bluegill', rar: 'common', w: [0.2, 0.8], pts: 20, diff: 0.8, col: '#4a7fc1', col2: '#f4a261' },
  { id: 'perch', name: 'Yellow Perch', rar: 'common', w: [0.3, 1.2], pts: 25, diff: 1, col: '#c9b037', col2: '#2a9d8f' },
  { id: 'carp', name: 'Common Carp', rar: 'common', w: [2, 9], pts: 30, diff: 1.1, col: '#b08850', col2: '#d4a373' },
  { id: 'boot', name: 'Soggy Boot', rar: 'junk', w: [1, 1.5], pts: 2, diff: 0.3, col: '#5c4033', col2: '#3b2a20', junk: true },
  { id: 'bass', name: 'Largemouth Bass', rar: 'uncommon', w: [1, 6], pts: 60, diff: 1.4, col: '#4f772d', col2: '#90a955' },
  { id: 'trout', name: 'Rainbow Trout', rar: 'uncommon', w: [1, 5], pts: 70, diff: 1.5, col: '#7fa7b5', col2: '#e07a5f' },
  { id: 'catfish', name: 'Channel Catfish', rar: 'uncommon', w: [2, 15], pts: 65, diff: 1.3, col: '#6b705c', col2: '#a5a58d' },
  { id: 'koi', name: 'Koi', rar: 'rare', w: [2, 8], pts: 150, diff: 1.8, col: '#ff6b35', col2: '#ffffff' },
  { id: 'pike', name: 'Northern Pike', rar: 'rare', w: [4, 20], pts: 160, diff: 2.1, col: '#6a8e6e', col2: '#e9edc9' },
  { id: 'salmon', name: 'Sockeye Salmon', rar: 'rare', w: [4, 12], pts: 170, diff: 2, col: '#e63946', col2: '#2a9d8f' },
  { id: 'goldcarp', name: 'Golden Carp', rar: 'epic', w: [3, 10], pts: 400, diff: 2.4, col: '#ffd700', col2: '#fff3b0' },
  { id: 'sturgeon', name: 'Lake Sturgeon', rar: 'epic', w: [20, 90], pts: 450, diff: 2.6, col: '#5e6472', col2: '#b8c0ff' },
  { id: 'moonfish', name: 'Moonfish', rar: 'legendary', w: [5, 12], pts: 1200, diff: 3, col: '#cdb4db', col2: '#a2d2ff', glow: true },
];
const RAR = { junk: ['Junk', '#9e9e9e', 6], common: ['Common', '#e0e6ea', 54], uncommon: ['Uncommon', '#7ae582', 26], rare: ['Rare', '#4cc9f0', 10.5], epic: ['Epic', '#c77dff', 3], legendary: ['Legendary', '#ffd166', 0.5] };
const SKY = [[6, '#f9c6a0', '#b9e2f5'], [9, '#7ec8f0', '#d8f1fb'], [13, '#4cb5e8', '#c8ecf8'], [16, '#f6b26b', '#ffe0b0'], [18, '#3d2c6e', '#f2784b']];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const DAY = 110;

defineGame({
  id: 'fishing_frenzy', title: 'Fishing Frenzy', genre: 'Cozy', icon: '🎣', color: '#2a9d8f',
  desc: 'Spend a lazy day at the lake. Cast, wait for the bite, reel it in — and complete your 14-species collection.',
  help: 'Hold Space to charge a cast, release to throw · Space when the bobber dunks · hold Space to raise the green bar over the fish',
  platforms: ['console', 'pc', 'handheld', 'vr', 'tabletop'],
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2, TIP = { x: 168, y: 196 };
    const dex = (G.state.flags.fishDex ||= {});
    const ripples = [], parts = [], caught = [];
    let state = 'idle', st = 0, power = 0, charging = false, bob = { x: 0, y: 0, tx: 0, ty: 0, dip: 0 }, castP = 0, fish = null, nibbles = 0, nextEv = 0;
    let reel = null, card = null, msg = '', msgT = 0, dayT = 0, t = 0, ended = false, endT = 0, shake = 0;
    api.music('lofi');

    const hour = () => 6 + 12 * Math.min(1, dayT / DAY);
    const skyAt = (h) => { let i = 0; while (i < SKY.length - 2 && h > SKY[i + 1][0]) i++; const a = SKY[i], b = SKY[i + 1], k = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0]))); return [mix(a[1], b[1], k), mix(a[2], b[2], k)]; };
    const say = (m, d = 1.8) => { msg = m; msgT = d; };
    function roll() {
      const w = {};
      for (const [k, v] of Object.entries(RAR)) w[k] = v[2];
      w.rare *= 1 + power; w.epic *= 1 + power * 1.5;
      w.legendary = hour() >= 16 ? 1.5 : 0.15;
      let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0), rar = 'common';
      for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { rar = k; break; } }
      const pool = SPECIES.filter((s) => s.rar === rar);
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const splash = (x, y, n = 10, col = '#e0f4ff') => { for (let i = 0; i < n; i++) { const a = -Math.PI * Math.random(), s = 40 + Math.random() * 90; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, col }); } ripples.push({ x, y, r: 2, life: 1 }); };
    function land() {
      const d = fish;
      const wgt = +(d.w[0] + Math.random() ** 2 * (d.w[1] - d.w[0])).toFixed(2);
      const isNew = !dex[d.id];
      const e = (dex[d.id] ||= { n: 0, best: 0 }); e.n++; e.best = Math.max(e.best, wgt);
      const pts = Math.round(d.pts * (0.8 + 0.6 * (wgt - d.w[0]) / (d.w[1] - d.w[0] || 1))) + (isNew ? 100 : 0);
      api.addScore(pts); caught.push({ d, wgt });
      card = { d, wgt, isNew, pts, t: 0 }; state = 'card'; st = 0;
      api.sfx(d.rar === 'legendary' ? 'legendary' : d.rar === 'epic' || d.rar === 'rare' ? 'reveal' : d.junk ? 'squish' : 'success');
      if (isNew && !d.junk) api.sfx('sparkle', { delay: 0.3 });
      splash(bob.x, bob.y, 20);
    }
    const drawFish = (ctx, d, x, y, len, ang = 0, alpha = 1) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
      if (d.junk) {
        ctx.fillStyle = d.col; ctx.beginPath(); ctx.moveTo(-len * 0.4, -len * 0.35); ctx.lineTo(-len * 0.1, -len * 0.35); ctx.lineTo(-len * 0.05, 0); ctx.lineTo(len * 0.45, len * 0.05); ctx.lineTo(len * 0.45, len * 0.25); ctx.lineTo(-len * 0.4, len * 0.25); ctx.closePath(); ctx.fill();
        ctx.fillStyle = d.col2; ctx.fillRect(-len * 0.42, len * 0.18, len * 0.9, len * 0.08);
      } else {
        if (d.glow) { ctx.shadowColor = d.col2; ctx.shadowBlur = 18; }
        ctx.fillStyle = d.col; ctx.beginPath(); ctx.moveTo(-len * 0.38, 0); ctx.lineTo(-len * 0.55, -len * 0.18); ctx.lineTo(-len * 0.55, len * 0.18); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, len * 0.42, len * (d.id === 'pike' || d.id === 'sturgeon' ? 0.13 : 0.2), 0, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = d.col2; ctx.globalAlpha = alpha * 0.8;
        if (d.id === 'koi') { ctx.beginPath(); ctx.arc(-len * 0.08, -len * 0.04, len * 0.1, 0, TAU); ctx.arc(len * 0.16, len * 0.05, len * 0.07, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(len * 0.02, len * 0.06, len * 0.3, len * 0.05, 0, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(len * 0.27, -len * 0.04, len * 0.05, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(len * 0.28, -len * 0.04, len * 0.028, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };

    return {
      get debugState() { return state; },
      get debugReel() { return reel; },
      update(dt, input) {
        t += dt; st += dt; msgT -= dt; shake = Math.max(0, shake - dt * 20);
        if (!ended && state !== 'reel') dayT += dt;
        for (const r of ripples) { r.r += 30 * dt; r.life -= dt * 0.8; }
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
        for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].life <= 0) ripples.splice(i, 1);
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        const hold = input.a || input.mouse.down, press = input.pressed.has('a') || input.mouse.clicked;
        if (ended) { endT -= dt; if (endT <= 0 || (press && endT < 3)) { endT = 99; api.gameOver(); } return; }
        if (dayT >= DAY && (state === 'idle' || state === 'card' && st > 1)) { ended = true; endT = 6; api.sfx('chime'); return; }
        if (state === 'idle') {
          if (press) { charging = true; power = 0; }
          if (charging && hold) power = 0.5 - 0.5 * Math.cos(st * 3.2);
          else if (charging) {
            charging = false; state = 'cast'; st = 0; castP = 0;
            bob.tx = 220 + power * 340; bob.ty = 330 - power * 120; api.sfx('whoosh');
          }
          if (!charging) st = 0;
        } else if (state === 'cast') {
          castP = Math.min(1, st / 0.6);
          bob.x = TIP.x + (bob.tx - TIP.x) * castP; bob.y = TIP.y + (bob.ty - TIP.y) * castP - Math.sin(castP * Math.PI) * 90;
          if (castP >= 1) { state = 'wait'; st = 0; fish = roll(); nibbles = Math.floor(Math.random() * 3); nextEv = api.rand(1.2, 3); splash(bob.x, bob.y, 8); api.sfx('pop', { pitch: 0.5 }); }
        } else if (state === 'wait') {
          bob.dip = Math.max(0, bob.dip - dt * 3);
          if (press) { state = 'idle'; st = 0; say('Too early — reel back in and recast.'); api.sfx('uiBack'); return; }
          if (st > nextEv) {
            st = 0;
            if (nibbles > 0) { nibbles--; bob.dip = 0.35; ripples.push({ x: bob.x, y: bob.y, r: 3, life: 0.6 }); api.sfx('blip', { pitch: 0.5, volume: 0.4 }); nextEv = api.rand(0.8, 2); }
            else { state = 'bite'; st = 0; bob.dip = 1; splash(bob.x, bob.y, 12); api.sfx('pop', { pitch: 0.7 }); api.sfx('squish', { pitch: 1.4 }); }
          }
        } else if (state === 'bite') {
          const win = 0.75 - fish.diff * 0.1;
          if (press && st <= win) {
            state = 'reel'; st = 0; shake = 4; api.sfx('hit');
            const d = fish.diff;
            reel = { z: 0.2, zv: 0, zone: Math.max(0.19, 0.34 - d * 0.045), f: 0.4, ft: 0.5, fT: 0, sp: 0.22 + d * 0.16, prog: 0.3 };
          } else if (st > win || press) { state = 'idle'; st = 0; say(press ? 'Missed the hook!' : 'It got away…'); api.sfx('uiBack'); }
        } else if (state === 'reel') {
          const r = reel, d = fish.diff;
          r.zv += (hold ? 2.6 : -2.2) * dt; r.zv = Math.max(-1.6, Math.min(1.6, r.zv)); r.z += r.zv * dt;
          if (r.z < 0) { r.z = 0; r.zv = Math.abs(r.zv) * 0.3; } if (r.z > 1 - r.zone) { r.z = 1 - r.zone; r.zv = 0; }
          r.fT -= dt;
          if (r.fT <= 0) { r.fT = Math.max(0.35, 1.5 - d * 0.35) * api.rand(0.6, 1.3); r.ft = Math.random() < 0.15 * d ? (r.f > 0.5 ? 0.05 : 0.95) : api.rand(0.05, 0.95); }
          r.f += Math.sign(r.ft - r.f) * Math.min(Math.abs(r.ft - r.f), r.sp * dt * (1 + Math.sin(t * 7) * 0.3));
          const inZone = r.f >= r.z && r.f <= r.z + r.zone;
          r.prog += (inZone ? 0.3 : -0.18 - d * 0.03) * dt;
          if (inZone && Math.random() < dt * 8) api.sfx('click', { pitch: 0.6, volume: 0.25 });
          if (Math.random() < dt * 4) ripples.push({ x: bob.x + api.rand(-8, 8), y: bob.y, r: 3, life: 0.5 });
          bob.dip = 0.6 + Math.sin(t * 20) * 0.2;
          if (r.prog >= 1) { reel = null; land(); }
          else if (r.prog <= 0) { reel = null; state = 'idle'; st = 0; say('The line went slack… it escaped!'); api.sfx('error'); }
        } else if (state === 'card') {
          card.t += dt;
          if ((press && st > 0.5) || st > 3.2) { state = 'idle'; st = 0; card = null; }
        }
      },
      draw(ctx) {
        const h = hour(), [top, bot] = skyAt(h);
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake), api.rand(-shake, shake));
        const sky = ctx.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, top); sky.addColorStop(1, bot);
        ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, 175);
        // sun
        const sa = (h - 6) / 12 * Math.PI, sx = W / 2 - Math.cos(sa) * 260, sy = 150 - Math.sin(sa) * 120;
        ctx.fillStyle = h > 16.5 ? '#ff9f68' : '#fff4c2'; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, TAU); ctx.fill();
        // clouds
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 4; i++) { const cx = ((i * 190 + t * 8) % (W + 160)) - 80, cy = 30 + (i % 2) * 34; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.arc(cx + 18, cy - 6, 20, 0, TAU); ctx.arc(cx + 38, cy, 14, 0, TAU); ctx.fill(); }
        // hills & trees
        ctx.fillStyle = mix('#5b8c5a', '#2b2d42', Math.max(0, (h - 15) / 3) * 0.6);
        ctx.beginPath(); ctx.moveTo(0, 160); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 130 + Math.sin(x * 0.02) * 14 + Math.sin(x * 0.051) * 8); ctx.lineTo(W, 160); ctx.fill();
        ctx.fillStyle = mix('#3a5a40', '#1b1b2f', Math.max(0, (h - 15) / 3) * 0.6);
        for (let i = 0; i < 18; i++) { const x = i * 37 + (i % 3) * 7; ctx.beginPath(); ctx.moveTo(x, 162); ctx.lineTo(x + 12, 128 - (i % 4) * 6); ctx.lineTo(x + 24, 162); ctx.fill(); }
        // water
        const wg = ctx.createLinearGradient(0, 160, 0, H); wg.addColorStop(0, bot); wg.addColorStop(0.08, '#3b8ea5'); wg.addColorStop(1, '#16425b');
        ctx.fillStyle = wg; ctx.fillRect(-10, 160, W + 20, H - 150);
        ctx.fillStyle = h > 16 ? 'rgba(255,170,110,0.25)' : 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 26; i++) { const y = 170 + (i * 37) % 220, x = ((i * 113 + t * (6 + i % 3 * 4)) % (W + 60)) - 30; ctx.fillRect(x, y, 18 + (i % 4) * 8, 2); }
        // lily pads + reeds
        for (const [x, y, r] of [[470, 360, 16], [505, 372, 11], [600, 330, 14], [380, 385, 12]]) { ctx.fillStyle = '#4c956c'; ctx.beginPath(); ctx.arc(x, y, r, 0.3, TAU - 0.1); ctx.lineTo(x, y); ctx.fill(); }
        ctx.fillStyle = '#ff8fab'; ctx.beginPath(); ctx.arc(505, 368, 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#6a994e'; ctx.lineWidth = 3; for (let i = 0; i < 9; i++) { const x = W - 50 + i * 6; ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + Math.sin(t + i) * 4, H - 40, x + Math.sin(t * 1.3 + i) * 6, H - 70 - (i % 3) * 12); ctx.stroke(); }
        for (const r of ripples) { ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.6})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, TAU); ctx.stroke(); }
        // dock + angler
        ctx.fillStyle = '#7f5539'; ctx.fillRect(0, 262, 150, 16); ctx.fillStyle = '#5e3c24'; for (const x of [20, 70, 120]) ctx.fillRect(x, 278, 10, 120);
        ctx.fillStyle = '#9c6644'; for (let x = 0; x < 150; x += 25) ctx.fillRect(x, 262, 23, 4);
        ctx.fillStyle = '#264653'; ctx.fillRect(84, 246, 12, 16); ctx.fillRect(84, 258, 30, 7);
        ctx.fillStyle = '#e76f51'; ctx.beginPath(); ctx.roundRect(78, 214, 22, 34, 6); ctx.fill();
        ctx.fillStyle = '#ffd6a5'; ctx.beginPath(); ctx.arc(90, 204, 10, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.ellipse(90, 197, 17, 5, 0, 0, TAU); ctx.fill(); ctx.fillRect(81, 186, 18, 11);
        // rod + line
        const bend = state === 'reel' ? 26 + Math.sin(t * 18) * 4 : state === 'bite' ? 14 : 0;
        const tip = { x: TIP.x, y: TIP.y + bend * 0.8 };
        const charge = state === 'idle' && charging ? power : 0;
        ctx.strokeStyle = '#3d2b1f'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(100, 236); ctx.quadraticCurveTo(140 - charge * 30, 210, tip.x - charge * 70, tip.y - charge * 20 + bend * 0.2); ctx.stroke();
        if (state !== 'idle') {
          const by = bob.y + bob.dip * 6;
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo((tip.x + bob.x) / 2, Math.max(tip.y, by) + (state === 'reel' ? 0 : 30), bob.x, by); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bob.x, by - 3, 5, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(bob.x, by - 3, 5, 0, Math.PI); ctx.fill();
          if (state === 'bite') { ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', bob.x, by - 18 - Math.sin(st * 30) * 3); }
        }
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
        ctx.globalAlpha = 1;
        if (h > 16) { ctx.fillStyle = `rgba(60,20,80,${(h - 16) / 2 * 0.25})`; ctx.fillRect(0, 0, W, H); }
        ctx.restore();
        // power meter
        if (state === 'idle' && charging) {
          ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.roundRect(60, 120, 16, 70, 6); ctx.fill();
          const pg = ctx.createLinearGradient(0, 190, 0, 120); pg.addColorStop(0, '#7ae582'); pg.addColorStop(1, '#ff595e');
          ctx.fillStyle = pg; ctx.fillRect(63, 187 - power * 64, 10, power * 64);
        }
        // reel UI
        if (reel) {
          const X = 566, Y = 84, BH = 262;
          ctx.fillStyle = '#5e3c24'; ctx.beginPath(); ctx.roundRect(X - 10, Y - 10, 64, BH + 20, 10); ctx.fill();
          ctx.fillStyle = '#1d4e64'; ctx.fillRect(X, Y, 30, BH);
          ctx.fillStyle = 'rgba(122,229,130,0.55)'; ctx.fillRect(X + 2, Y + BH * (1 - reel.z - reel.zone), 26, BH * reel.zone);
          ctx.strokeStyle = '#b7f5bb'; ctx.lineWidth = 2; ctx.strokeRect(X + 2, Y + BH * (1 - reel.z - reel.zone), 26, BH * reel.zone);
          drawFish(ctx, fish.rar === 'legendary' || fish.rar === 'epic' ? fish : { ...SPECIES[1], col: '#e9f5ff', col2: '#9fb3c8' }, X + 15, Y + BH * (1 - reel.f), 26, Math.sin(t * 10) * 0.2);
          ctx.fillStyle = '#0006'; ctx.fillRect(X + 36, Y, 8, BH);
          ctx.fillStyle = reel.prog > 0.66 ? '#7ae582' : reel.prog > 0.33 ? '#ffd166' : '#ff595e'; ctx.fillRect(X + 36, Y + BH * (1 - reel.prog), 8, BH * reel.prog);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HOLD SPACE', X + 20, Y + BH + 25);
        }
        // HUD: clock + dex
        const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
        ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.roundRect(10, 10, 196, 30, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}  ·  ${caught.length} caught`, 20, 26);
        const got = SPECIES.filter((s) => dex[s.id]).length;
        ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.roundRect(W - 238, 10, 228, 54, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`COLLECTION ${got}/${SPECIES.length}`, W - 228, 22);
        SPECIES.forEach((s, i) => { const x = W - 220 + (i % 7) * 30, y = 38 + Math.floor(i / 7) * 16; drawFish(ctx, dex[s.id] ? s : { ...s, col: '#0a1a24', col2: '#0a1a24', glow: false }, x, y, 22, 0, dex[s.id] ? 1 : 0.7); });
        ctx.textAlign = 'center';
        if (state === 'idle' && !charging && !ended && msgT <= 0) { ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); ctx.fillText('Hold SPACE to cast', W / 2, 120); ctx.globalAlpha = 1; }
        if (msgT > 0) { ctx.globalAlpha = Math.min(1, msgT * 2); ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0008'; ctx.lineWidth = 4; ctx.strokeText(msg, W / 2, 96); ctx.fillText(msg, W / 2, 96); ctx.globalAlpha = 1; }
        if (card) {
          const s = Math.min(1, card.t * 5), [rn, rc] = RAR[card.d.rar];
          ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s);
          ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.roundRect(-150, -90, 300, 180, 16); ctx.fill();
          ctx.strokeStyle = rc; ctx.lineWidth = 5; ctx.stroke();
          ctx.fillStyle = rc; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, -22, 48, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          drawFish(ctx, card.d, 0, -22, 110, Math.sin(card.t * 4) * 0.08);
          ctx.fillStyle = '#222'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(card.d.name, 0, 44);
          ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = card.d.rar === 'common' ? '#777' : rc; ctx.fillText(`${rn.toUpperCase()} · ${card.wgt} lb · +${card.pts}`, 0, 68);
          if (card.isNew) { ctx.fillStyle = '#e63946'; ctx.save(); ctx.translate(118, -76); ctx.rotate(0.3); ctx.font = 'bold 18px sans-serif'; ctx.fillText('NEW!', 0, 0); ctx.restore(); }
          ctx.restore();
        }
        if (ended) {
          ctx.fillStyle = 'rgba(25,15,45,0.85)'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#ffd6a5'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('Sunset — time to pack up', W / 2, 90);
          ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
          const best = caught.reduce((b, c) => (!b || c.d.pts * c.wgt > b.d.pts * b.wgt ? c : b), null);
          ctx.fillText(`${caught.length} catches today · collection ${got}/${SPECIES.length}`, W / 2, 130);
          if (best) ctx.fillText(`Catch of the day: ${best.d.name} (${best.wgt} lb)`, W / 2, 156);
          caught.slice(-12).forEach((c, i) => drawFish(ctx, c.d, W / 2 - 165 + i * 30, 210, 26));
          ctx.fillStyle = '#ccc'; ctx.font = '13px sans-serif'; ctx.fillText('Press Space to finish', W / 2, 300);
        }
      },
    };
  },
});
