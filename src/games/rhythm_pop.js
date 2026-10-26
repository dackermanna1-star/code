// Rhythm Pop — 4-lane rhythm game locked to the Neon Synthwave station's beat (also the VR headset game).
// Notes are generated per bar; your hits play notes from the song's current chord.
import { defineGame } from './index.js';
import { G } from '../game.js';
import { STATIONS } from '../core/music.js';

const LANES = ['#ff4fa3', '#4cc9f0', '#ffd166', '#7ae582'];
const CODES = [['KeyD', 'ArrowLeft'], ['KeyF', 'ArrowDown'], ['KeyJ', 'ArrowUp'], ['KeyK', 'ArrowRight']];
const CHARS = { d: 0, f: 1, j: 2, k: 3 };
const JUDGE = [[0.05, 'PERFECT', 300, 1, '#fff'], [0.1, 'GREAT', 200, 0.7, '#7ae582'], [0.16, 'GOOD', 100, 0.4, '#4cc9f0']];

defineGame({
  id: 'rhythm_pop', title: 'Rhythm Pop', genre: 'Rhythm', icon: '🎵', color: '#ff4fa3',
  desc: 'Tap to the beat of a synthwave mixtape. Nail PERFECTs, build combos, chase an S rank.',
  help: 'D F J K or ← ↓ ↑ → (or click a lane) when notes cross the line',
  create(api) {
    const W = api.w, H = api.h, TAU = Math.PI * 2;
    const LW = 72, LX = W / 2 - LW * 2, HITY = 330, APPROACH = 1.35;
    const bpm = STATIONS.synth.bpm, beat = 60 / bpm;
    api.music('synth');
    const mp = G.games?.music;
    const audioNow = () => G.audio?.ctx?.currentTime;
    // lock to the music clock only when audio is really running (a suspended context's clock is frozen)
    const useAudio = !!(mp?.playing && G.audio.ctx?.state === 'running');
    const t0 = useAudio ? mp.nextTime - mp.step * beat / 4 : 0;
    let simT = -0.2, lastBeat = -1;
    const now = () => (useAudio ? audioNow() - t0 : simT);

    // ---- chart
    const notes = [];
    const BARS = 28, LEAD = 4;
    let prevLane = 0;
    const pickLane = (avoid) => { let l; do l = Math.floor(Math.random() * 4); while (l === avoid); return l; };
    for (let bar = 0; bar < BARS; bar++) {
      const lvl = bar < 4 ? 0 : bar < 12 ? 1 : bar < 20 ? 2 : 3;
      const style = Math.floor(Math.random() * 3);
      for (let e = 0; e < 8; e++) {
        const b = LEAD + bar * 4 + e / 2, onBeat = e % 2 === 0;
        let place = onBeat;
        if (lvl === 0) place = onBeat && (e !== 6 || bar % 2 === 0);
        if (lvl === 1) place = onBeat || (style === 0 && (e === 3 || e === 7)) || (style === 1 && e === 5);
        if (lvl >= 2) place = onBeat || Math.random() < (lvl === 2 ? 0.45 : 0.65);
        if (!place) continue;
        const lane = style === 2 && lvl < 2 ? (bar + e / 2) % 4 : pickLane(onBeat ? -1 : prevLane);
        notes.push({ time: b * beat, lane }); prevLane = lane;
        if (lvl >= 2 && e === 0 && Math.random() < (lvl === 3 ? 0.7 : 0.35)) notes.push({ time: b * beat, lane: (lane + 1 + Math.floor(Math.random() * 3)) % 4 });
      }
    }
    notes.sort((a, b) => a.time - b.time);
    const endTime = (LEAD + BARS * 4 + 2) * beat;

    const flash = [0, 0, 0, 0], held = [false, false, false, false], beams = [0, 0, 0, 0], parts = [];
    let prevKeys = new Set(), combo = 0, maxCombo = 0, judged = 0, accSum = 0, judgeTxt = null, finished = false, endT = 0, shake = 0, pulse = 0;
    const counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };

    const pitchFor = (lane) => {
      let midi;
      if (mp?.scale && mp.prog) {
        const deg = mp.prog[mp.bar % mp.prog.length] + [0, 2, 4, 7][lane];
        const s = mp.scale, n = s.length;
        midi = mp.root + 24 + s[((deg % n) + n) % n] + 12 * Math.floor(deg / n);
      } else midi = 69 + [0, 3, 7, 10][lane];
      return Math.pow(2, (midi - 76) / 12);
    };
    const burst = (x, y, col, n) => { for (let i = 0; i < n; i++) { const a = -Math.PI * Math.random(), s = 80 + Math.random() * 220; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, col }); } };
    const setJudge = (txt, col) => { judgeTxt = { txt, col, t: 0 }; };

    function press(lane) {
      flash[lane] = 1;
      const tn = now();
      let best = null;
      for (const n of notes) { if (n.done || n.lane !== lane) continue; if (n.time - tn > JUDGE[2][0]) break; if (Math.abs(n.time - tn) <= JUDGE[2][0]) { best = n; break; } }
      if (!best) { api.sfx('click', { pitch: 0.7, volume: 0.3 }); return; }
      const d = Math.abs(best.time - tn), j = JUDGE.find((q) => d <= q[0]);
      best.done = true; combo++; maxCombo = Math.max(maxCombo, combo); judged++; accSum += j[3]; counts[j[1]]++;
      api.addScore(Math.round(j[2] * (1 + Math.min(combo, 100) / 100)));
      setJudge(j[1], j[4]); beams[lane] = 1;
      burst(LX + lane * LW + LW / 2, HITY, LANES[lane], j[1] === 'PERFECT' ? 18 : 10);
      api.sfx('blip', { pitch: pitchFor(lane), volume: 1.2 });
      if (combo > 0 && combo % 25 === 0) { api.sfx('sparkle'); shake = 5; }
    }

    return {
      update(dt, input) {
        simT += dt;
        const tn = now();
        shake = Math.max(0, shake - dt * 25);
        for (let i = 0; i < 4; i++) { flash[i] = Math.max(0, flash[i] - dt * 6); beams[i] = Math.max(0, beams[i] - dt * 4); }
        if (judgeTxt) judgeTxt.t += dt;
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
        const b = Math.floor(tn / beat);
        if (b !== lastBeat) { lastBeat = b; pulse = 1; if (!useAudio && b >= 0) api.sfx('thud', { volume: 0.5 }); }
        pulse = Math.max(0, pulse - dt * 3);
        if (finished) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        // input
        const hits = new Set();
        CODES.forEach((codes, lane) => { held[lane] = codes.some((c) => input.keys.has(c)); for (const c of codes) if (input.keys.has(c) && !prevKeys.has(c)) hits.add(lane); });
        for (const ch of input.typed) { const l = CHARS[ch.toLowerCase()]; if (l !== undefined && !prevKeys.has(CODES[l][0])) hits.add(l); }
        if (input.mouse.clicked) { const l = Math.floor((input.mouse.x - LX) / LW); if (l >= 0 && l < 4) hits.add(l); }
        prevKeys = new Set(input.keys);
        for (const l of hits) press(l);
        // misses
        for (const n of notes) {
          if (n.done) continue;
          if (tn - n.time > JUDGE[2][0]) { n.done = true; n.miss = true; judged++; counts.MISS++; if (combo >= 10) api.sfx('error'); combo = 0; setJudge('MISS', '#ff5d5d'); }
          else if (n.time > tn) break;
        }
        if (tn > endTime) {
          finished = true; endT = 3.5;
          const acc = judged ? accSum / judged : 0;
          api.addScore(Math.round(acc * 2000 + maxCombo * 10));
          api.sfx(acc > 0.85 ? 'levelup' : 'success');
        }
      },
      draw(ctx) {
        const tn = now();
        ctx.save();
        if (shake) ctx.translate(api.rand(-shake, shake), api.rand(-shake, shake));
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0638'); g.addColorStop(1, '#3a0a4a');
        ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
        // beat rings
        for (let i = 0; i < 3; i++) {
          const r = 60 + i * 70 + pulse * 18;
          ctx.strokeStyle = `rgba(255,79,163,${0.06 + pulse * 0.12 - i * 0.02})`; ctx.lineWidth = 10;
          for (const x of [70, W - 70]) { ctx.beginPath(); ctx.arc(x, H / 2, r * 0.5, 0, TAU); ctx.stroke(); }
        }
        // EQ bars
        for (let i = 0; i < 16; i++) { const h = 10 + Math.abs(Math.sin(i * 1.7 + tn * 3)) * 40 * (0.4 + pulse); ctx.fillStyle = `hsla(${280 + i * 6},90%,60%,0.25)`; ctx.fillRect(i * (W / 16) + 4, H - h, W / 16 - 8, h); }
        // lanes
        ctx.fillStyle = 'rgba(10,0,25,0.7)'; ctx.fillRect(LX - 6, 0, LW * 4 + 12, H);
        for (let i = 0; i < 4; i++) {
          const x = LX + i * LW;
          if (held[i]) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x, 0, LW, H); }
          if (beams[i] > 0) { const bg = ctx.createLinearGradient(0, HITY, 0, 0); bg.addColorStop(0, LANES[i] + 'aa'); bg.addColorStop(1, LANES[i] + '00'); ctx.globalAlpha = beams[i]; ctx.fillStyle = bg; ctx.fillRect(x + 4, 0, LW - 8, HITY); ctx.globalAlpha = 1; }
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(LX - 6, HITY); ctx.lineTo(LX + LW * 4 + 6, HITY); ctx.stroke();
        // receptors
        for (let i = 0; i < 4; i++) {
          const x = LX + i * LW + LW / 2;
          ctx.strokeStyle = LANES[i]; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + flash[i] * 0.4;
          ctx.beginPath(); ctx.arc(x, HITY, 22 + flash[i] * 5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
          if (flash[i] > 0) { ctx.fillStyle = LANES[i] + '55'; ctx.beginPath(); ctx.arc(x, HITY, 22, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#fff9'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('DFJK'[i], x, HITY + 42);
        }
        // notes
        for (const n of notes) {
          if (n.done && !n.miss) continue;
          const dtn = n.time - tn;
          if (dtn > APPROACH) break;
          const y = HITY - (dtn / APPROACH) * (HITY + 20);
          if (y > H + 20) continue;
          const x = LX + n.lane * LW + LW / 2;
          ctx.globalAlpha = n.miss ? 0.25 : 1;
          ctx.fillStyle = LANES[n.lane]; ctx.shadowColor = LANES[n.lane]; ctx.shadowBlur = n.miss ? 0 : 12;
          ctx.beginPath(); ctx.roundRect(x - 26, y - 9, 52, 18, 9); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.roundRect(x - 20, y - 6, 40, 5, 3); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        // judgement + combo
        if (judgeTxt && judgeTxt.t < 0.6) {
          const s = 1 + Math.max(0, 0.15 - judgeTxt.t) * 3;
          ctx.save(); ctx.translate(W / 2, 200); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, (0.6 - judgeTxt.t) * 4);
          ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = judgeTxt.col; ctx.textAlign = 'center'; ctx.fillText(judgeTxt.txt, 0, 0); ctx.restore();
        }
        if (combo >= 4) { ctx.textAlign = 'center'; ctx.font = 'bold 40px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(combo, W / 2, 140); ctx.font = 'bold 11px sans-serif'; ctx.fillText('COMBO', W / 2, 168); }
        ctx.restore();
        // side HUD
        const acc = judged ? accSum / judged : 1;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#fff'; ctx.fillText('ACCURACY', 20, 20); ctx.font = 'bold 26px sans-serif'; ctx.fillText(`${(acc * 100).toFixed(1)}%`, 20, 38);
        ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#ffd166'; ctx.fillText(`MAX COMBO ${maxCombo}`, 20, 76);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText('SCORE', W - 20, 20); ctx.font = 'bold 26px sans-serif'; ctx.fillText(Math.floor(api.score), W - 20, 38);
        const prog = Math.max(0, Math.min(1, tn / endTime));
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(0, 0, W, 4); ctx.fillStyle = '#ff4fa3'; ctx.fillRect(0, 0, W * prog, 4);
        if (tn < LEAD * beat - 0.3) { ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.max(1, Math.ceil((LEAD * beat - tn) / beat))}`, W / 2, 110); }
        if (finished) {
          ctx.fillStyle = 'rgba(15,0,30,0.82)'; ctx.fillRect(0, 0, W, H);
          const grade = acc >= 0.95 ? 'S' : acc >= 0.88 ? 'A' : acc >= 0.75 ? 'B' : acc >= 0.6 ? 'C' : 'D';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = 'bold 90px sans-serif'; ctx.fillStyle = { S: '#ffd166', A: '#7ae582', B: '#4cc9f0', C: '#c77dff', D: '#ff5d5d' }[grade];
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 30; ctx.fillText(grade, W / 2, 120); ctx.shadowBlur = 0;
          ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`${(acc * 100).toFixed(1)}% accuracy · max combo ${maxCombo}`, W / 2, 200);
          ctx.font = '15px sans-serif'; ctx.fillStyle = '#ccc';
          ctx.fillText(`Perfect ${counts.PERFECT}   Great ${counts.GREAT}   Good ${counts.GOOD}   Miss ${counts.MISS}`, W / 2, 236);
        }
      },
    };
  },
});
