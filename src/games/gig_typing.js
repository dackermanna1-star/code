// WorkHub gig: Transcription — type the transcript lines accurately for 60 seconds. Pay scales with net WPM × accuracy.
import { defineGame } from './index.js';

const LINES = [
  'Welcome back to the show, today we are talking about tiny apartments.',
  'I moved downtown last spring and honestly I have never been happier.',
  'The trick is to treat every corner like it has a job to do.',
  'My plants are basically my roommates at this point, and they never complain.',
  'Can we circle back to the budget before the end of the quarter?',
  'Please send the revised invoice to the billing team by Friday.',
  'Our next guest built a recording studio inside a walk-in closet.',
  'If you enjoyed this episode, leave us a review, it really helps.',
  'The coffee place downstairs knows my order before I even say hello.',
  'We tested twelve desk chairs so you do not have to.',
  'Remember to back up your files before installing the update.',
  'Thanks for calling, your feedback has been passed to our team.',
  'The meeting has been moved to Thursday at two in the afternoon.',
  'Rent is due on the first, but the landlord is pretty relaxed about it.',
  'A good playlist can turn a boring chore into a tiny party.',
  'Let us take a quick break and we will be right back after this.',
  'The neighbors upstairs got a piano, and they are getting better.',
  'Our survey found that most people check their phone before breakfast.',
  'Small habits add up, so start with five minutes a day.',
  'The quarterly numbers look strong, especially in online sales.',
];
const MAXC = 44;
const PAY = (score) => (score < 30 ? 0 : Math.min(140, 20 + score * 0.16));

defineGame({
  id: 'gig_typing', title: 'Transcription', genre: 'Freelance', icon: '⌨️', color: '#14b8a6', gig: true,
  desc: 'Transcribe podcast and meeting audio. Fast, accurate typing earns the most.',
  payText: 'Pays $20–140 · based on words per minute × accuracy (60 s)',
  pay: PAY,
  help: 'Type each line exactly (capitals optional) · Backspace fixes mistakes · 60 seconds',
  platforms: ['pc'],
  create(api) {
    const W = api.w, H = api.h, DUR = 60;
    const order = [...LINES].sort(() => Math.random() - 0.5);
    let li = 0, text = '', layout = [], typed = '', time = DUR, okKeys = 0, badKeys = 0, correctChars = 0, done = 0, finished = false, endT = 0, flash = 0, t = 0, started = false, shakeT = 0;
    const wave = Array.from({ length: 90 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 0.75);
    function next() {
      text = order[li % order.length]; li++; typed = '';
      layout = []; let line = 0, col = 0;
      for (const word of text.split(' ')) {
        if (col > 0 && col + word.length > MAXC) { line++; col = 0; }
        for (const ch of word) layout.push({ ch, line, col: col++ });
        layout.push({ ch: ' ', line, col: col++ });
      }
      layout.pop();
    }
    next();
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const minutes = () => Math.max(1 / 60, (DUR - time) / 60);
    const stats = () => {
      const partial = [...typed].filter((c, i) => same(c, text[i])).length;
      const wpm = (correctChars + partial) / 5 / minutes(), acc = okKeys + badKeys ? okKeys / (okKeys + badKeys) : 1;
      return { wpm, acc, score: Math.round(wpm * 10 * acc * acc) };
    };
    const payFor = PAY;

    return {
      get debugState() { return { text, typed, time }; },
      update(dt, input) {
        t += dt; flash = Math.max(0, flash - dt * 2); shakeT = Math.max(0, shakeT - dt);
        if (finished) { endT -= dt; if (endT <= 0) { endT = 99; api.gameOver(); } return; }
        if (!started && t > 5) started = true;
        if (started) time -= dt;
        for (const ch of input.typed) {
          if (ch === '\b') { if (typed.length) { typed = typed.slice(0, -1); api.sfx('type', { pitch: 0.8 }); } continue; }
          if (typed.length >= text.length) continue;
          started = true;
          const ok = same(ch, text[typed.length]);
          if (ok) okKeys++; else { badKeys++; shakeT = 0.15; api.sfx('error', { volume: 0.25 }); }
          typed += ch; if (ok) api.sfx('type');
          if (typed.length === text.length) {
            const good = [...typed].filter((c, i) => same(c, text[i])).length;
            correctChars += good; done++; flash = 1;
            api.sfx(good === text.length ? 'success' : 'ding');
            next();
          }
        }
        api.setScore(stats().score);
        if (time <= 0) {
          time = 0; finished = true; endT = 3.5;
          const partial = [...typed].filter((c, i) => same(c, text[i])).length; correctChars += partial; typed = '';
          api.setScore(stats().score); api.sfx('cash');
        }
      },
      draw(ctx) {
        ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H);
        // app chrome
        ctx.fillStyle = '#111c33'; ctx.fillRect(0, 0, W, 34);
        ctx.fillStyle = '#14b8a6'; ctx.font = 'bold 14px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText('WorkHub · Transcribe', 14, 17);
        ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.fillText(`Job #${4100 + li} · Cozy Corner Podcast`, 180, 17);
        for (const [i, c] of ['#ef4444', '#f59e0b', '#22c55e'].entries()) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(W - 20 - i * 16, 17, 5, 0, 7); ctx.fill(); }
        // audio player
        ctx.fillStyle = '#16213d'; ctx.beginPath(); ctx.roundRect(20, 48, 430, 54, 10); ctx.fill();
        ctx.fillStyle = '#14b8a6'; ctx.beginPath(); ctx.arc(48, 75, 14, 0, 7); ctx.fill();
        ctx.fillStyle = '#0b1220'; ctx.fillRect(43, 68, 4, 14); ctx.fillRect(50, 68, 4, 14);
        const prog = 1 - time / DUR;
        wave.forEach((v, i) => { const x = 74 + i * 4.1, h = v * 30 * (0.8 + 0.2 * Math.sin(t * 9 + i)); ctx.fillStyle = i / wave.length < prog ? '#14b8a6' : '#334155'; ctx.fillRect(x, 75 - h / 2, 2.6, h); });
        // stats panel
        const s = stats();
        ctx.fillStyle = '#16213d'; ctx.beginPath(); ctx.roundRect(462, 48, 158, 54, 10); ctx.fill();
        ctx.textAlign = 'center'; ctx.fillStyle = time < 10 ? '#f87171' : '#e2e8f0'; ctx.font = 'bold 24px monospace'; ctx.fillText(`0:${String(Math.ceil(time)).padStart(2, '0')}`, 541, 70);
        ctx.font = '11px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.fillText(started ? 'remaining' : 'starts when you type', 541, 92);
        // transcript card
        ctx.save(); if (shakeT) ctx.translate(Math.sin(t * 90) * 3, 0);
        ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.roundRect(20, 116, 600, 150, 12); ctx.fill();
        ctx.fillStyle = '#64748b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`SPEAKER ${(li % 2) + 1} · LINE ${done + 1}`, 38, 134);
        ctx.font = '20px monospace'; ctx.textBaseline = 'alphabetic';
        const cw = ctx.measureText('M').width, lx = 38, ly = 172, lh = 34;
        layout.forEach((p, i) => {
          const x = lx + p.col * cw, y = ly + p.line * lh;
          let col = '#94a3b8';
          if (i < typed.length) {
            if (same(typed[i], text[i])) col = '#0f766e';
            else { ctx.fillStyle = '#fecaca'; ctx.fillRect(x - 1, y - 20, cw + 2, 26); col = '#dc2626'; }
          }
          ctx.fillStyle = col; ctx.fillText(i < typed.length && !same(typed[i], text[i]) && text[i] === ' ' ? '·' : p.ch, x, y);
          if (i === typed.length && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = '#14b8a6'; ctx.fillRect(x - 1, y - 21, 2.5, 27); }
        });
        ctx.restore();
        if (flash) { ctx.fillStyle = `rgba(20,184,166,${flash * 0.25})`; ctx.beginPath(); ctx.roundRect(20, 116, 600, 150, 12); ctx.fill(); }
        // footer stats
        const tile = (x, label, val, col) => { ctx.fillStyle = '#16213d'; ctx.beginPath(); ctx.roundRect(x, 282, 140, 62, 10); ctx.fill(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.fillText(label, x + 70, 298); ctx.fillStyle = col; ctx.font = 'bold 22px sans-serif'; ctx.fillText(val, x + 70, 324); };
        tile(20, 'NET WPM', started ? Math.round(s.wpm) : '–', '#e2e8f0');
        tile(173, 'ACCURACY', `${Math.round(s.acc * 100)}%`, s.acc > 0.95 ? '#4ade80' : s.acc > 0.85 ? '#facc15' : '#f87171');
        tile(326, 'LINES DONE', done, '#e2e8f0');
        tile(479, 'EST. PAY', `$${payFor(s.score).toFixed(0)}`, '#14b8a6');
        ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Capital letters are optional · mistakes cost accuracy, Backspace to fix', W / 2, 370);
        if (finished) {
          ctx.fillStyle = 'rgba(11,18,32,0.9)'; ctx.fillRect(0, 0, W, H);
          ctx.textAlign = 'center'; ctx.fillStyle = '#14b8a6'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Transcript delivered!', W / 2, 130);
          ctx.fillStyle = '#e2e8f0'; ctx.font = '18px sans-serif'; ctx.fillText(`${Math.round(s.wpm)} WPM · ${Math.round(s.acc * 100)}% accuracy · ${done} lines`, W / 2, 175);
          const stars = Math.max(1, Math.min(5, Math.round(payFor(s.score) / 28)));
          ctx.fillStyle = '#facc15'; ctx.font = '28px sans-serif'; ctx.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), W / 2, 225);
          ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.fillText(`Client payout: $${payFor(s.score).toFixed(2)} (before mood bonus)`, W / 2, 265);
        }
      },
    };
  },
});
