// WorkHub gig: Data Entry — file incoming records into the right bin. The client changes the sorting rule every 20 s.
import { defineGame } from './index.js';

const FIELDS = {
  type: { label: 'DOCUMENT TYPE', vals: [['Invoice', '#f59e0b'], ['Receipt', '#22c55e'], ['Contract', '#6366f1'], ['Résumé', '#ec4899']] },
  region: { label: 'REGION', vals: [['N. America', '#3b82f6'], ['Europe', '#a855f7'], ['Asia', '#ef4444'], ['LATAM', '#10b981']] },
  status: { label: 'STATUS', vals: [['Paid', '#22c55e'], ['Pending', '#eab308'], ['Overdue', '#ef4444'], ['Disputed', '#8b5cf6']] },
};
const RULES = ['type', 'region', 'status'];
const CLIENTS = ['Fernwood Coffee', 'Lumen Labs', 'Pixel & Pine', 'Harbor Dental', 'Kōji Studio', 'Bramble Books', 'Northside Gym', 'Velvet Bakery', 'Orbit Bikes', 'Maple Legal', 'Juno Florals', 'Tidewater Inc.'];
const DIRS = ['left', 'up', 'right', 'down'];
const ARROWS = { left: '←', up: '↑', right: '→', down: '↓' };
const PAY = (score) => (score < 20 ? 0 : Math.min(140, 20 + score * 0.13));
const PHASE = 20;

defineGame({
  id: 'gig_sort', title: 'Data Entry', genre: 'Freelance', icon: '🗂️', color: '#6366f1', gig: true,
  desc: 'File client records into the right folders, fast. Watch out — the sorting rule changes mid-shift.',
  payText: 'Pays $20–140 · based on records filed, streaks and mistakes (60 s)',
  pay: PAY,
  help: 'Arrow keys (or click a bin) to file the record in that direction · follow the SORT BY rule',
  platforms: ['pc'],
  create(api) {
    const W = api.w, H = api.h, DUR = PHASE * RULES.length;
    const BINS = { up: { x: 220, y: 70, w: 200, h: 56 }, down: { x: 220, y: 330, w: 200, h: 56 }, left: { x: 14, y: 180, w: 160, h: 90 }, right: { x: 466, y: 180, w: 160, h: 90 } };
    let time = DUR, rec = null, flying = [], t = 0, streak = 0, best = 0, ok = 0, bad = 0, finished = false, endT = 0, banner = 0, phase = -1, shake = 0, flashBin = {}, pops = [], intro = 1.5;
    const ri = (n) => Math.floor(Math.random() * n);
    const rule = () => RULES[Math.max(0, phase)];
    function newRec() {
      rec = { type: ri(4), region: ri(4), status: ri(4), client: CLIENTS[ri(CLIENTS.length)], amt: (20 + Math.random() * 2400).toFixed(2), id: 10000 + ri(89999), slide: 0 };
    }
    function file(dir) {
      if (!rec || finished || intro > 0) return;
      const want = DIRS[rec[rule()]], b = BINS[dir], right = dir === want;
      flying.push({ rec, x: W / 2, y: 225, tx: b.x + b.w / 2, ty: b.y + b.h / 2, p: 0, right });
      flashBin[dir] = { t: 0.35, right };
      if (right) {
        ok++; streak++; best = Math.max(best, streak);
        const pts = 10 + Math.min(6, Math.floor(streak / 5)); api.addScore(pts);
        api.sfx('pop', { pitch: 1 + Math.min(0.8, streak * 0.03), volume: 0.6 }); if (streak % 10 === 0) { api.sfx('sparkle'); pops.push({ x: W / 2, y: 306, txt: `${streak} in a row!`, col: '#facc15', life: 1.2 }); }
      } else {
        bad++; streak = 0; shake = 0.3; api.addScore(-8); api.sfx('error');
        pops.push({ x: W / 2, y: 306, txt: `Wrong bin! That one was ${FIELDS[rule()].vals[rec[rule()]][0]}`, col: '#f87171', life: 1.3 });
      }
      newRec();
    }
    newRec();

    return {
      get debugState() { return rec && phase >= 0 ? DIRS[rec[rule()]] : null; },
      update(dt, input) {
        t += dt; banner = Math.max(0, banner - dt); shake = Math.max(0, shake - dt);
        for (const k in flashBin) flashBin[k].t -= dt;
        for (const f of flying) f.p = Math.min(1, f.p + dt * 5);
        flying = flying.filter((f) => f.p < 1);
        for (const p of pops) { p.y -= 20 * dt; p.life -= dt; }
        pops = pops.filter((p) => p.life > 0);
        if (rec) rec.slide = Math.min(1, rec.slide + dt * 7);
        if (finished) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        if (intro > 0) { intro -= dt; if (intro <= 0) { phase = 0; banner = 2; api.sfx('notify'); } return; }
        time -= dt;
        const ph = Math.min(RULES.length - 1, Math.floor((DUR - time) / PHASE));
        if (ph !== phase) { phase = ph; banner = 2.2; api.sfx('notify'); }
        for (const d of DIRS) if (input.pressed.has(d)) file(d);
        if (input.mouse.clicked) for (const d of DIRS) { const b = BINS[d], m = input.mouse; if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) file(d); }
        if (time <= 0) { time = 0; finished = true; endT = 3.5; api.sfx('cash'); if (api.score < 0) api.setScore(0); }
      },
      draw(ctx) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(99,102,241,0.08)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
        // top bar
        ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, W, 30);
        ctx.font = 'bold 13px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#a5b4fc'; ctx.fillText('WorkHub · Data Entry', 12, 15);
        const acc = ok + bad ? ok / (ok + bad) : 1;
        ctx.fillStyle = '#e2e8f0'; ctx.fillText(`Filed ${ok}  ·  ${Math.round(acc * 100)}%  ·  streak ${streak}`, 180, 15);
        ctx.textAlign = 'right'; ctx.fillStyle = '#22d3ee'; ctx.fillText(`Est. $${PAY(Math.max(0, api.score)).toFixed(0)}`, W - 80, 15);
        ctx.fillStyle = time < 10 ? '#f87171' : '#fff'; ctx.font = 'bold 15px monospace'; ctx.fillText(`0:${String(Math.ceil(time)).padStart(2, '0')}`, W - 12, 15);
        // rule
        const rf = FIELDS[rule()];
        ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.fillText('SORT BY', W / 2, 44);
        ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = banner > 0 && Math.floor(t * 8) % 2 ? '#facc15' : '#fff'; ctx.fillText(rf.label, W / 2, 59);
        // phase pips
        RULES.forEach((r, i) => { ctx.fillStyle = i < phase ? '#6366f1' : i === phase ? '#a5b4fc' : '#334155'; ctx.fillRect(W / 2 + 120 + i * 18, 40, 14, 4); });
        // bins
        for (const d of DIRS) {
          const b = BINS[d], [label, col] = rf.vals[DIRS.indexOf(d)], fl = flashBin[d];
          ctx.fillStyle = fl && fl.t > 0 ? (fl.right ? '#14532d' : '#7f1d1d') : '#1e293b';
          ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(b.x + 10, b.y + b.h / 2 - 11, 22, 22, 5); ctx.fill();
          ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(ARROWS[d], b.x + 21, b.y + b.h / 2 + 1);
          ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, b.x + 40, b.y + b.h / 2); ctx.textAlign = 'center';
        }
        // flying records
        for (const f of flying) {
          const e = f.p * f.p, x = f.x + (f.tx - f.x) * e, y = f.y + (f.ty - f.y) * e, s = 1 - f.p * 0.8;
          ctx.globalAlpha = 1 - f.p; ctx.fillStyle = f.right ? '#bbf7d0' : '#fecaca'; ctx.beginPath(); ctx.roundRect(x - 120 * s, y - 62 * s, 240 * s, 124 * s, 10 * s); ctx.fill(); ctx.globalAlpha = 1;
        }
        // current record
        if (rec && !finished) {
          const sx = (1 - rec.slide) * 80 + (shake > 0 ? Math.sin(t * 80) * 6 : 0), cx = W / 2 + sx, cy = 225;
          ctx.globalAlpha = rec.slide;
          ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.roundRect(cx - 120 + 3, cy - 62 + 5, 240, 124, 10); ctx.fill();
          ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.roundRect(cx - 120, cy - 62, 240, 124, 10); ctx.fill();
          const [tl, tc] = FIELDS.type.vals[rec.type];
          ctx.fillStyle = tc; ctx.beginPath(); ctx.roundRect(cx - 120, cy - 62, 240, 26, [10, 10, 0, 0]); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(tl.toUpperCase(), cx - 108, cy - 48);
          ctx.textAlign = 'right'; ctx.font = '12px monospace'; ctx.fillText(`#${rec.id}`, cx + 108, cy - 48);
          ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(rec.client, cx - 108, cy - 16);
          ctx.fillStyle = '#475569'; ctx.font = '13px sans-serif'; ctx.fillText(`$${Number(rec.amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, cx - 108, cy + 6);
          const pill = (x, y, field) => { const [l, c] = FIELDS[field].vals[rec[field]]; ctx.font = 'bold 12px sans-serif'; const w = ctx.measureText(l).width + 16; ctx.fillStyle = c + '30'; ctx.beginPath(); ctx.roundRect(x, y - 10, w, 20, 10); ctx.fill(); ctx.fillStyle = c; ctx.textAlign = 'left'; ctx.fillText(l, x + 8, y + 1); return w; };
          ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.fillText('Region', cx - 108, cy + 30); ctx.fillText('Status', cx + 8, cy + 30);
          pill(cx - 108, cy + 46, 'region'); pill(cx + 8, cy + 46, 'status');
          ctx.globalAlpha = 1;
        }
        ctx.textAlign = 'center';
        for (const p of pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y); }
        ctx.globalAlpha = 1;
        if (intro > 0 || banner > 1.2) {
          ctx.fillStyle = 'rgba(15,23,42,0.75)'; ctx.fillRect(0, 150, W, 60);
          ctx.fillStyle = '#facc15'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(intro > 0 ? 'Get ready to sort…' : phase === 0 ? `Sort by ${rf.label.toLowerCase()}` : `New rule: sort by ${rf.label.toLowerCase()}!`, W / 2, 180);
        }
        if (finished) {
          ctx.fillStyle = 'rgba(15,23,42,0.92)'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#a5b4fc'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Shift complete!', W / 2, 130);
          ctx.fillStyle = '#e2e8f0'; ctx.font = '18px sans-serif'; ctx.fillText(`${ok} records filed · ${bad} mistakes · best streak ${best}`, W / 2, 175);
          ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`Payout: $${PAY(api.score).toFixed(2)} (before mood bonus)`, W / 2, 220);
        }
      },
    };
  },
});
