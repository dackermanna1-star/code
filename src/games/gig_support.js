// WorkHub gig: Customer Support Chat — pick the best reply to each customer before they lose patience.
import { defineGame } from './index.js';

// [customer, message, best, okay, bad]
const TICKETS = [
  ['Priya', 'Hi, my order #4471 arrived with a cracked mug. Kind of sad about it.', 'So sorry! A free replacement is on its way, no need to send the broken one back.', 'Please send photos of the damage and we will review it within 5-7 business days.', 'Mugs are fragile. Maybe open the box more carefully next time?'],
  ['Marcus', 'How do I reset my password? The reset email never arrives.', 'I just resent it. Please check your spam folder too, I will stay here until it works!', 'Try again later, sometimes our emails are slow.', 'Have you thought about just making a new account?'],
  ['Lena', 'Can I change my delivery address? I am moving tomorrow!', 'Congrats on the move! I updated the address, so it will go to your new place.', 'It already shipped, but you can pick it up at the local depot.', 'That is not really my department.'],
  ['Tomás', 'I was charged twice for my subscription this month.', 'You are right, I see the duplicate. I refunded it, expect it in 3-5 days.', 'Please contact your bank about the duplicate charge.', 'Our system does not make mistakes.'],
  ['Aiko', 'Do you ship to Canada?', 'Yes! Canada takes 5-8 days and shipping is free over $50.', 'I think so? The FAQ page should say.', 'lol no idea'],
  ['Dev', 'The app keeps crashing when I open my cart.', 'Sorry about that! Version 4.2 fixes it, and your cart is saved. Here is the link.', 'Have you tried turning it off and on again?', 'Works fine on my phone.'],
  ['Grace', 'Tracking says delivered, but there is no package here.', 'That is stressful! I opened a trace with the courier and will reship if it is not found in 48 h.', 'Maybe check with your neighbors, it might be with them.', 'Tracking says delivered, so it was delivered.'],
  ['Owen', 'Any chance of a discount? It is my birthday today!', 'Happy birthday! Here is a 15% code: BDAY15. Enjoy your day!', 'No birthday discounts, sorry, but our newsletter has deals.', 'Everyone has a birthday though.'],
  ['Sofia', 'I would like to cancel my order, please.', 'No problem, it is cancelled and your refund is on its way. Anything else?', 'Cancellations can take up to 10 days to process.', 'Are you sure? Like, really sure? Really really?'],
  ['Ben', 'Just wanted to say your lamp changed my apartment. Thank you!', 'That made our whole team smile. Thank you for telling us!', 'Ok, noted.', 'Is there a problem with your order?'],
  ['Mei', 'Which size should I get? I am between M and L.', 'Our sizes run small, so I would pick L. Exchanges are free if it does not fit.', 'Both sizes are really popular!', 'Just buy both, problem solved.'],
  ['Jonah', 'Your website shows "error 502". Is everything okay?', 'Thanks for the heads up! We had a short outage, it is back now. Sorry!', 'Try using a different browser.', 'Error 502 usually means user error.'],
];
const REACT = { best: ['Wow, thank you so much!', 'Perfect, exactly what I needed.', 'You are the best, have a great day!'], okay: ['Hmm... okay, I guess.', 'Fine. Not super helpful though.', 'Alright...'], bad: ['Excuse me?! I want a manager.', 'Wow. Leaving a 1-star review.', 'That is incredibly rude.'], timeout: ['(customer left the chat)'] };
const N = 8, LIMIT = 12;
const PAY = (score) => (score < 150 ? 0 : Math.min(140, 20 + (score - 150) * 0.15));
const COLORS = ['#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#eab308', '#3b82f6', '#ef4444'];

defineGame({
  id: 'gig_support', title: 'Customer Support Chat', genre: 'Freelance', icon: '💬', color: '#0ea5e9', gig: true,
  desc: 'Staff the support desk for a cozy home-goods shop. Pick the kindest, most helpful reply before customers lose patience.',
  payText: 'Pays $20–140 · based on reply quality and response time (8 chats)',
  pay: PAY,
  help: 'Press 1 / 2 / 3 or click a reply · ↑ ↓ + Space also work · faster good replies earn a bonus',
  platforms: ['pc'],
  create(api) {
    const W = api.w, H = api.h, PX = 150;
    const queue = [...TICKETS].sort(() => Math.random() - 0.5).slice(0, N).map((tk, i) => {
      const opts = [['best', tk[2]], ['okay', tk[3]], ['bad', tk[4]]].sort(() => Math.random() - 0.5);
      return { name: tk[0], msg: tk[1], opts, col: COLORS[i % COLORS.length] };
    });
    let lastM = { x: 0, y: 0 }, idx = 0, time = LIMIT, phase = 'typing', pt = 0, sel = 0, picked = null, reaction = '', stars = 0, results = [], finished = false, endT = 0, t = 0, hover = -1;
    const ctxM = document.createElement('canvas').getContext('2d');
    const wrap = (text, width, font) => { ctxM.font = font; const out = []; let line = ''; for (const w of text.split(' ')) { const tst = line ? line + ' ' + w : w; if (ctxM.measureText(tst).width > width && line) { out.push(line); line = w; } else line = tst; } if (line) out.push(line); return out; };
    const optRect = (i) => ({ x: PX + 10, y: 250 + i * 48, w: W - PX - 20, h: 42 });
    const cur = () => queue[idx];
    function choose(i) {
      if (phase !== 'open') return;
      const [q] = cur().opts[i]; picked = i; phase = 'sent'; pt = 0;
      const pts = q === 'best' ? 100 + Math.round(time * 2) : q === 'okay' ? 40 : -30;
      api.addScore(pts); results.push(q);
      reaction = REACT[q][Math.floor(Math.random() * REACT[q].length)]; stars = q === 'best' ? 5 : q === 'okay' ? 3 : 1;
      api.sfx('message');
    }
    function timeout() { phase = 'sent'; pt = 0; picked = -1; results.push('timeout'); reaction = REACT.timeout[0]; stars = 0; api.sfx('error'); }

    return {
      get debugState() { return phase === 'open' ? cur().opts.findIndex((o) => o[0] === 'best') : -1; },
      update(dt, input) {
        t += dt; pt += dt;
        if (finished) { endT -= dt; if (endT <= 0 || (input.pressed.has('a') && endT < 3)) { endT = 99; api.gameOver(); } return; }
        const m = input.mouse;
        hover = -1;
        for (let i = 0; i < 3; i++) { const r = optRect(i); if (m.x > r.x && m.x < r.x + r.w && m.y > r.y && m.y < r.y + r.h) hover = i; }
        if (hover >= 0 && (m.x !== lastM.x || m.y !== lastM.y)) sel = hover;
        lastM = { x: m.x, y: m.y };
        if (phase === 'typing') { if (pt > 0.9) { phase = 'open'; pt = 0; time = LIMIT; sel = hover >= 0 ? hover : 0; api.sfx('notify'); } return; }
        if (phase === 'open') {
          time -= dt;
          for (const ch of input.typed) if ('123'.includes(ch)) choose(+ch - 1);
          if (phase === 'open' && input.pressed.has('up')) { sel = (sel + 2) % 3; api.sfx('hover'); }
          if (phase === 'open' && input.pressed.has('down')) { sel = (sel + 1) % 3; api.sfx('hover'); }
          if (phase === 'open' && input.pressed.has('a')) choose(sel);
          if (phase === 'open' && m.clicked && hover >= 0) choose(hover);
          if (phase === 'open' && time <= 0) timeout();
        } else if (phase === 'sent') {
          if (pt > 0.7 && !cur().reacted) { cur().reacted = true; const q = results[results.length - 1]; api.sfx(q === 'best' ? 'success' : q === 'okay' ? 'blip' : 'error', { volume: 0.7 }); }
          if (pt > 2.1) {
            idx++;
            if (idx >= N) { finished = true; endT = 4.5; api.sfx('cash'); if (api.score < 0) api.setScore(0); }
            else { phase = 'typing'; pt = 0; picked = null; }
          }
        }
      },
      draw(ctx) {
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0c4a6e'; ctx.fillRect(0, 0, W, 30);
        ctx.font = 'bold 13px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#7dd3fc'; ctx.fillText('WorkHub · Support Desk', 12, 15);
        ctx.fillStyle = '#e0f2fe'; ctx.fillText(`Chat ${Math.min(N, idx + 1)}/${N} · Hearth & Home Goods`, 190, 15);
        ctx.textAlign = 'right'; ctx.fillStyle = '#5eead4'; ctx.fillText(`Est. $${PAY(Math.max(0, api.score)).toFixed(0)}`, W - 12, 15);
        // sidebar queue
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 30, PX, H - 30);
        ctx.fillStyle = '#64748b'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('QUEUE', 12, 46);
        queue.forEach((c, i) => {
          const y = 66 + i * 40, active = i === idx && !finished, r = results[i];
          if (active) { ctx.fillStyle = '#bae6fd'; ctx.fillRect(0, y - 17, PX, 36); }
          ctx.globalAlpha = i < idx ? 0.5 : 1;
          ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(24, y, 13, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(c.name[0], 24, y + 1);
          ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = (active ? 'bold ' : '') + '12px sans-serif'; ctx.fillText(c.name, 44, y);
          if (r) { ctx.fillStyle = { best: '#16a34a', okay: '#ca8a04', bad: '#dc2626', timeout: '#64748b' }[r]; ctx.font = 'bold 12px sans-serif'; ctx.fillText({ best: '★★★', okay: '★★', bad: '★', timeout: '–' }[r], 96, y); }
          ctx.globalAlpha = 1;
        });
        if (finished) {
          const best = results.filter((r) => r === 'best').length;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(PX, 30, W - PX, H - 30); ctx.textAlign = 'center';
          ctx.fillStyle = '#0c4a6e'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('Shift complete!', PX + (W - PX) / 2, 120);
          ctx.fillStyle = '#334155'; ctx.font = '16px sans-serif'; ctx.fillText(`${best}/${N} perfect replies · CSAT ${Math.round(results.reduce((a, r) => a + ({ best: 5, okay: 3, bad: 1, timeout: 0 }[r]), 0) / N * 20)}%`, PX + (W - PX) / 2, 160);
          ctx.fillStyle = '#0d9488'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`Payout: $${PAY(api.score).toFixed(2)} (before mood bonus)`, PX + (W - PX) / 2, 205);
          return;
        }
        const c = cur();
        // chat header
        ctx.fillStyle = '#fff'; ctx.fillRect(PX, 30, W - PX, 210);
        ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(PX + 24, 54, 14, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(c.name[0], PX + 24, 55);
        ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(c.name, PX + 46, 54);
        // patience meter with face
        const pat = phase === 'open' ? time / LIMIT : phase === 'typing' ? 1 : Math.max(0, time / LIMIT);
        const mood = picked === null || picked === -1 ? pat : { best: 1, okay: 0.5, bad: 0 }[c.opts[picked][0]];
        const fx = W - 30, fy = 54;
        ctx.fillStyle = mood > 0.6 ? '#fde047' : mood > 0.3 ? '#fdba74' : '#fca5a5'; ctx.beginPath(); ctx.arc(fx, fy, 13, 0, 7); ctx.fill();
        ctx.fillStyle = '#1e293b'; ctx.fillRect(fx - 5, fy - 4, 2.5, 3); ctx.fillRect(fx + 3, fy - 4, 2.5, 3);
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.beginPath(); const curve = (mood - 0.5) * 10; ctx.moveTo(fx - 6, fy + 4); ctx.quadraticCurveTo(fx, fy + 4 + curve, fx + 6, fy + 4); ctx.stroke();
        ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.roundRect(PX + 200, 50, 220, 8, 4); ctx.fill();
        ctx.fillStyle = pat > 0.5 ? '#22c55e' : pat > 0.25 ? '#eab308' : '#ef4444'; ctx.beginPath(); ctx.roundRect(PX + 200, 50, 220 * pat, 8, 4); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif'; ctx.fillText('patience', PX + 200, 66);
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(PX, 76, W - PX, 1);
        // messages
        const bubble = (text, right, y, bg, fg) => {
          const lines = wrap(text, 300, '14px sans-serif'); ctx.font = '14px sans-serif';
          const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24, h = lines.length * 18 + 14, x = right ? W - 14 - w : PX + 14;
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
          ctx.fillStyle = fg; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, x + 12, y + 16 + i * 18));
          return y + h + 8;
        };
        let y = 86;
        if (phase === 'typing') { ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.roundRect(PX + 14, y, 58, 28, 12); ctx.fill(); for (let i = 0; i < 3; i++) { ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(PX + 30 + i * 13, y + 14 + Math.sin(t * 10 + i) * 2, 3.5, 0, 7); ctx.fill(); } }
        else {
          y = bubble(c.msg, false, y, '#e2e8f0', '#0f172a');
          if (picked !== null) {
            if (picked >= 0) y = bubble(c.opts[picked][1], true, y, '#0ea5e9', '#fff');
            if (pt > 0.7) { y = bubble(reaction, false, y, picked >= 0 && c.opts[picked][0] === 'bad' ? '#fee2e2' : '#e2e8f0', '#0f172a'); }
          }
        }
        // replies
        for (let i = 0; i < 3; i++) {
          const r = optRect(i), o = c.opts[i], on = phase === 'open', isSel = on && i === sel;
          let bg = on ? (isSel ? '#e0f2fe' : '#fff') : '#f8fafc';
          if (picked === i) bg = { best: '#dcfce7', okay: '#fef9c3', bad: '#fee2e2' }[o[0]];
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
          ctx.strokeStyle = isSel ? '#0ea5e9' : '#cbd5e1'; ctx.lineWidth = isSel ? 2 : 1; ctx.stroke();
          ctx.fillStyle = on ? '#0ea5e9' : '#94a3b8'; ctx.beginPath(); ctx.roundRect(r.x + 8, r.y + 10, 22, 22, 6); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), r.x + 19, r.y + 22);
          const lines = wrap(o[1], r.w - 52, '13px sans-serif');
          ctx.fillStyle = on || picked === i ? '#0f172a' : '#94a3b8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
          lines.slice(0, 2).forEach((l, k) => ctx.fillText(l, r.x + 40, r.y + (lines.length > 1 ? 14 + k * 15 : 22)));
        }
      },
    };
  },
});
