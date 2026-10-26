// Procedurally animated TV channels drawn into a canvas texture.
import { G } from '../game.js';
import { ITEMS } from '../items/registry.js';
import { thumb } from './thumbs.js';
import { fmtMoney } from '../core/utils.js';

const imgCache = new Map();
function img(src) { let i = imgCache.get(src); if (!i) { i = new Image(); i.src = src; imgCache.set(src, i); } return i; }

function headline() {
  const w = G.weather?.info;
  const drop = G.market?.currentDrop?.();
  const lines = [
    `WEATHER: ${w ? w.label.toUpperCase() : 'CLEAR'} — PERFECT DAY TO STAY IN`,
    'LOCAL HOMEBODY ORDERS THIRD BUBBLE TEA, EXPERTS "NOT CONCERNED"',
    'CITY COUNCIL DEBATES MORE BENCHES FOR PIGEONS',
    `MARKETS: SNEAKER INDEX ${(Math.sin(G.clock.day) * 3 + 1).toFixed(1)}% TODAY`,
    drop ? `LIMITED DROP TONIGHT AT 6PM: ${ITEMS[drop.id]?.name?.toUpperCase() || 'MYSTERY ITEM'}` : 'NO DROPS TODAY — SAVE YOUR MONEY (YOU WON\'T)',
    'STUDY: PEOPLE WHO OWN 12+ PLANTS 40% COZIER',
    'DELIVERY DRONES NOW AVAILABLE ON FLOORS 20 AND UP',
  ];
  return lines.join('   •   ');
}

export const CHANNELS = [
  {
    name: 'City News 24', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0b2545'); g.addColorStop(1, '#13315c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // skyline backdrop
      ctx.fillStyle = '#1d4e89'; for (let i = 0; i < 14; i++) { const bh = 40 + ((i * 37) % 90); ctx.fillRect(i * 40, h * 0.62 - bh, 32, bh); }
      // desk & anchor
      ctx.fillStyle = '#e0e1dd'; ctx.fillRect(w * 0.2, h * 0.62, w * 0.6, h * 0.2);
      ctx.fillStyle = '#2b2d42'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.36, 26, 0, 7); ctx.fill();
      ctx.fillRect(w * 0.5 - 45, h * 0.44, 90, h * 0.2);
      ctx.fillStyle = '#c1121f'; ctx.fillRect(w * 0.5 - 6, h * 0.45, 12, h * 0.12);
      const talk = Math.sin(t * 14) > 0 ? 4 : 1; ctx.fillStyle = '#111'; ctx.fillRect(w * 0.5 - 6, h * 0.38, 12, talk);
      ctx.fillStyle = '#c1121f'; ctx.fillRect(0, h * 0.84, w, h * 0.16);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Inter, sans-serif'; ctx.textBaseline = 'middle';
      const text = headline(); const tw = ctx.measureText(text).width;
      const x = w - ((t * 90) % (tw + w));
      ctx.fillText(text, x, h * 0.92);
      ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, 110, 30); ctx.fillStyle = '#c1121f'; ctx.font = 'bold 18px Inter'; ctx.fillText('LIVE ● CN24', 18, 25);
      return '#4a78c2';
    },
  },
  {
    name: 'Nature HD', sound: 'birds',
    draw(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffb4a2'); g.addColorStop(0.5, '#ffd6a5'); g.addColorStop(0.51, '#2a6f97'); g.addColorStop(1, '#013a63');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.48, 40, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 18; i++) { ctx.fillStyle = `rgba(255,240,200,${0.25 + 0.2 * Math.sin(t * 2 + i)})`; ctx.fillRect(w * 0.62 - 50 + Math.sin(t + i) * 30, h * 0.53 + i * 7, 100 - i * 4, 2); }
      for (let i = 0; i < 4; i++) { const bx = ((t * 40 + i * 140) % (w + 60)) - 30, by = 60 + i * 18 + Math.sin(t * 2 + i) * 8; ctx.strokeStyle = '#3d2c2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx - 4, by - 6 * Math.abs(Math.sin(t * 8 + i)), bx, by); ctx.quadraticCurveTo(bx + 4, by - 6 * Math.abs(Math.sin(t * 8 + i)), bx + 8, by); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '600 16px Inter'; ctx.fillText('Episode 4: The Patient Sea', 16, h - 18);
      return '#ffb88c';
    },
  },
  {
    name: 'Toon Town', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#90e0ef'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#80ed99'; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      const cx = w * 0.35 + Math.sin(t * 1.5) * 80, cy = h * 0.62 - Math.abs(Math.sin(t * 4)) * 50;
      ctx.fillStyle = '#ff006e'; ctx.beginPath(); ctx.ellipse(cx, cy, 34, 30 + Math.sin(t * 8) * 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 10, cy - 8, 9, 0, 7); ctx.arc(cx + 12, cy - 8, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx - 8, cy - 7, 4, 0, 7); ctx.arc(cx + 14, cy - 7, 4, 0, 7); ctx.fill();
      const ex = w * 0.7 + Math.cos(t) * 40, ey = h * 0.58;
      ctx.fillStyle = '#ffbe0b'; ctx.beginPath(); ctx.moveTo(ex, ey - 40); ctx.lineTo(ex + 36, ey + 30); ctx.lineTo(ex - 36, ey + 30); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex - 8, ey + 4, 4, 0, 7); ctx.arc(ex + 8, ey + 4, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(20, 20, 180, 44); ctx.fillStyle = '#222'; ctx.font = 'bold 18px Inter'; ctx.fillText(['BOING!', 'WHEEE!', 'Hey, Triangle!', 'Not again...'][Math.floor(t / 2) % 4], 34, 48);
      return '#9be7ff';
    },
  },
  {
    name: 'Weather Now', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#1b4965'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#62b6cb'; ctx.font = 'bold 28px Inter'; ctx.fillText('5-HOUR OUTLOOK', 20, 40);
      const fc = G.weather?.forecast?.() || [];
      const W = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', snow: '🌨️', fog: '🌫️' };
      fc.forEach((f, i) => {
        const x = 30 + i * ((w - 60) / 5);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, 70, (w - 60) / 5 - 10, h - 120);
        ctx.font = '42px serif'; ctx.fillText(W[f.kind] || '☀️', x + 18, 140 + Math.sin(t * 2 + i) * 4);
        ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter'; ctx.fillText(G.clock.fmt(f.time), x + 10, 190);
        ctx.fillStyle = '#bee9e8'; ctx.font = '14px Inter'; ctx.fillText(f.kind, x + 10, 214);
      });
      return '#3a7ca5';
    },
  },
  {
    name: 'ShopTV Live', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      const list = Object.values(ITEMS).filter((d) => !d.hidden && d.stores.length && d.price > 20);
      if (!list.length) return '#000';
      const idx = Math.floor(t / 6) % list.length;
      const d = list[(idx * 37) % list.length];
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#7b2cbf'); g.addColorStop(1, '#ff6d00');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const im = img(thumb(d, 192));
      if (im.complete) { const s = h * 0.7 + Math.sin(t * 2) * 6; ctx.drawImage(im, w * 0.06, h * 0.12, s, s); }
      ctx.fillStyle = '#fff'; ctx.font = '900 30px Inter'; ctx.fillText(d.name.length > 20 ? d.name.slice(0, 19) + '…' : d.name, w * 0.5, h * 0.3);
      ctx.font = '900 54px Inter'; ctx.fillStyle = '#ffe066'; ctx.fillText(fmtMoney(G.market?.price(d) ?? d.price), w * 0.5, h * 0.55);
      ctx.fillStyle = '#fff'; ctx.font = '600 18px Inter'; ctx.fillText(Math.sin(t * 6) > 0 ? 'ORDER NOW ON YOUR PHONE!' : 'LIMITED TIME!!!', w * 0.5, h * 0.72);
      return '#b5179e';
    },
  },
  {
    name: 'Cooking w/ Chef Remy', sound: 'sizzle',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#f1e3d3'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d6ccc2'; for (let i = 0; i < 10; i++) ctx.fillRect(i * 56, 0, 52, h * 0.5);
      ctx.fillStyle = '#3d3d3d'; ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.66, 110, 26, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#f4a261', '#e76f51', '#2a9d8f', '#e9c46a'][i % 4]; ctx.beginPath(); ctx.arc(w * 0.5 - 70 + i * 20, h * 0.65 - Math.abs(Math.sin(t * 6 + i)) * 30, 9, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.2, h * 0.3, 30, 0, 7); ctx.fill(); ctx.fillRect(w * 0.2 - 22, h * 0.02, 44, 40);
      ctx.fillStyle = '#222'; ctx.font = 'italic 18px Georgia'; ctx.fillText('"A little butter... a little more butter..."', 20, h - 16);
      return '#ffcf99';
    },
  },
  {
    name: 'Chill Beats Radio', music: 'lofi',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#22223b'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 32; i++) { const v = (Math.sin(t * 3 + i * 0.6) * 0.5 + 0.5) * (Math.sin(t * 1.3 + i) * 0.3 + 0.7); ctx.fillStyle = `hsl(${260 + i * 3},70%,${50 + v * 20}%)`; const bh = v * h * 0.5; ctx.fillRect(20 + i * ((w - 40) / 32), h * 0.8 - bh, (w - 40) / 32 - 3, bh); }
      ctx.fillStyle = '#f2e9e4'; ctx.font = '600 22px Inter'; ctx.fillText('🎧 lo-fi beats to stay inside to', 20, 40);
      return '#6c63ff';
    },
  },
  {
    name: 'Classic Movies', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
      const sx = Math.sin(t * 0.3) * 30;
      ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, h * 0.6, w, h * 0.4);
      ctx.fillStyle = '#d0d0d0'; ctx.beginPath(); ctx.arc(w * 0.3 + sx, h * 0.4, 22, 0, 7); ctx.fill(); ctx.fillRect(w * 0.3 + sx - 18, h * 0.45, 36, 80);
      ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.arc(w * 0.65 - sx, h * 0.38, 22, 0, 7); ctx.fill(); ctx.fillRect(w * 0.65 - sx - 18, h * 0.43, 36, 84);
      for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      if (Math.random() < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(Math.random() * w, 0, 2, h); }
      ctx.fillStyle = '#fff'; ctx.font = 'italic 18px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(['"We\'ll always have the apartment."', '"Frankly my dear, I ordered delivery."', '"Here\'s looking at you, couch."'][Math.floor(t / 5) % 3], w / 2, h - 20);
      ctx.textAlign = 'left';
      return '#8a8a8a';
    },
  },
  {
    name: 'Fireplace 24/7', sound: 'fire',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5a2e1a'; ctx.fillRect(w * 0.2, h * 0.78, w * 0.6, 20);
      for (let i = 0; i < 40; i++) {
        const x = w * 0.25 + (i / 40) * w * 0.5 + Math.sin(t * 5 + i) * 6;
        const fh = 60 + Math.sin(t * 7 + i * 1.7) * 30 + Math.sin(t * 13 + i) * 15;
        const g = ctx.createLinearGradient(0, h * 0.78 - fh, 0, h * 0.78);
        g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.4, 'rgba(255,150,40,0.7)'); g.addColorStop(1, 'rgba(255,80,20,0.9)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, h * 0.78 - fh / 2, 10, fh / 2, 0, 0, 7); ctx.fill();
      }
      return '#ff7b29';
    },
  },
  {
    name: 'Sports Center', sound: 'tvchatter',
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#2d6a4f'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 60); ctx.beginPath(); ctx.moveTo(w / 2, 20); ctx.lineTo(w / 2, h - 40); ctx.stroke(); ctx.beginPath(); ctx.arc(w / 2, h / 2 - 10, 40, 0, 7); ctx.stroke();
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i < 5 ? '#e63946' : '#f1faee'; ctx.beginPath(); ctx.arc(w / 2 + Math.sin(t * 0.8 + i * 1.3) * (w * 0.35), h / 2 - 10 + Math.cos(t * 0.6 + i * 2.1) * (h * 0.28), 7, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2 + Math.sin(t * 1.7) * w * 0.38, h / 2 - 10 + Math.cos(t * 2.3) * h * 0.25, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#000a'; ctx.fillRect(w - 170, h - 36, 160, 30); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Inter'; ctx.fillText(`HOME ${Math.floor(t / 37) % 5}  -  ${Math.floor(t / 53) % 4} AWAY`, w - 160, h - 16);
      return '#40916c';
    },
  },
];

export function drawChannel(ctx, w, h, ch, t) {
  ctx.save();
  const c = CHANNELS[ch % CHANNELS.length];
  let col = '#666';
  try { col = c.draw(ctx, w, h, t); } catch (e) { console.warn(e); }
  // scanline sheen
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();
  return col;
}
