// The ROBLOX-made T-shirts on sale in December 2007, redrawn. The originals
// were small uploaded pictures; these follow what the archived catalog
// thumbnails showed (docs/RESEARCH.md, "T-shirts") but are new drawings.
// Each design paints a square S x S decal; transparent areas show the torso.

const font = (S, f, w = 'bold', fam = 'Arial, Helvetica, sans-serif') => `${w} ${Math.round(S * f)}px ${fam}`;
function centred(ctx, text, x, y, maxW) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y, maxW); }
function figure(ctx, x, y, s, torso, legs) {
  // a tiny classic Robloxian seen from the front
  ctx.fillStyle = '#f5cd30';
  ctx.fillRect(x - s * 0.3, y, s * 0.6, s * 0.55); // head
  ctx.fillRect(x - s * 1.05, y + s * 0.6, s * 0.5, s);
  ctx.fillRect(x + s * 0.55, y + s * 0.6, s * 0.5, s);
  ctx.fillStyle = torso; ctx.fillRect(x - s * 0.5, y + s * 0.6, s, s);
  ctx.fillStyle = legs; ctx.fillRect(x - s * 0.5, y + s * 1.6, s * 0.48, s); ctx.fillRect(x + s * 0.02, y + s * 1.6, s * 0.48, s);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - s * 0.12, y + s * 0.15, s * 0.05, s * 0.12); ctx.fillRect(x + s * 0.07, y + s * 0.15, s * 0.05, s * 0.12);
}
function tank(ctx, S, color, trim) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(S * 0.22, 0); ctx.lineTo(S * 0.36, 0);
  ctx.quadraticCurveTo(S * 0.5, S * 0.22, S * 0.64, 0); ctx.lineTo(S * 0.78, 0);
  ctx.quadraticCurveTo(S * 0.8, S * 0.3, S, S * 0.4); ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.lineTo(0, S * 0.4);
  ctx.quadraticCurveTo(S * 0.2, S * 0.3, S * 0.22, 0); ctx.fill();
  if (trim) { ctx.strokeStyle = trim; ctx.lineWidth = S * 0.02; ctx.stroke(); }
}
function stripes(ctx, S, a, b, n) { for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(0, i * S / n, S, S / n + 1); } }
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

export const DESIGNS = {
  brew(ctx, S) {
    // a dark brick building with a green top, "Do the Brew"
    ctx.fillStyle = '#5a3a2a'; ctx.fillRect(S * 0.18, S * 0.3, S * 0.64, S * 0.5);
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1;
    for (let y = S * 0.3; y < S * 0.8; y += S * 0.05) {
      ctx.beginPath(); ctx.moveTo(S * 0.18, y); ctx.lineTo(S * 0.82, y); ctx.stroke();
      const off = Math.round(y / (S * 0.05)) % 2 ? 0 : S * 0.05;
      for (let x = S * 0.18 + off; x < S * 0.82; x += S * 0.1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + S * 0.05); ctx.stroke(); }
    }
    ctx.fillStyle = '#287f47'; ctx.fillRect(S * 0.14, S * 0.22, S * 0.72, S * 0.1);
    ctx.fillStyle = '#e8c860'; ctx.fillRect(S * 0.42, S * 0.6, S * 0.16, S * 0.2);
    ctx.fillStyle = '#fff'; ctx.font = font(S, 0.13, 'bold', 'Georgia, serif'); centred(ctx, 'Do the Brew', S / 2, S * 0.1, S * 0.95);
  },
  bloxxer(ctx, S) {
    // red/yellow brick explosion
    const r = rng(5);
    ctx.save(); ctx.translate(S / 2, S / 2);
    for (const [col, rad] of [['#c4281c', 0.48], ['#f2a020', 0.34], ['#f5e050', 0.2]]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, rr = S * rad * (i % 2 ? 0.55 : 1) * (0.85 + r() * 0.3); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill();
    }
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * 0.8 + r()); ctx.translate(S * 0.32, 0);
      ctx.fillStyle = i % 2 ? '#c4281c' : '#f5cd30'; ctx.fillRect(-S * 0.05, -S * 0.03, S * 0.1, S * 0.06);
      ctx.restore();
    }
    ctx.restore();
  },
  viking(ctx, S) {
    // bare yellow torso under a brown fur, with a belt
    ctx.fillStyle = '#f5cd30'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#c8a020'; ctx.lineWidth = S * 0.02;
    ctx.beginPath(); ctx.arc(S * 0.33, S * 0.42, S * 0.15, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(S * 0.67, S * 0.42, S * 0.15, 0.2, Math.PI - 0.2); ctx.stroke();
    for (const y of [0.62, 0.72]) { ctx.beginPath(); ctx.moveTo(S * 0.42, S * y); ctx.lineTo(S * 0.58, S * y); ctx.stroke(); }
    ctx.fillStyle = '#7c5c46'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, 0);
    for (let i = 0; i <= 12; i++) ctx.lineTo(S - i * S / 12, S * (i % 2 ? 0.3 : 0.22));
    ctx.fill();
    ctx.fillStyle = '#4a3020'; ctx.fillRect(0, S * 0.82, S, S * 0.1);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(S * 0.44, S * 0.8, S * 0.12, S * 0.14);
  },
  vest(ctx, S) { tank(ctx, S, '#f2f2f2', '#d0d0d0'); },
  assert(ctx, S) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#000'; ctx.font = font(S, 0.075, 'bold', 'Courier New, monospace');
    centred(ctx, 'findHax0r() ?', S / 2, S * 0.12, S * 0.95);
    centred(ctx, 'gift() : lol();', S / 2, S * 0.22, S * 0.95);
    ctx.fillStyle = '#2f9a3c'; ctx.fillRect(S * 0.32, S * 0.38, S * 0.36, S * 0.3);
    ctx.fillStyle = '#c4281c'; ctx.fillRect(S * 0.47, S * 0.38, S * 0.06, S * 0.3); ctx.fillRect(S * 0.32, S * 0.5, S * 0.36, S * 0.06);
    ctx.beginPath(); ctx.ellipse(S * 0.44, S * 0.35, S * 0.06, S * 0.03, -0.4, 0, 7); ctx.ellipse(S * 0.56, S * 0.35, S * 0.06, S * 0.03, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = font(S, 0.09, 'bold', 'Courier New, monospace');
    centred(ctx, '0x5f3759df', S / 2, S * 0.84, S * 0.95);
  },
  friends(ctx, S) {
    figure(ctx, S * 0.22, S * 0.28, S * 0.17, '#c4281c', '#0d69ac');
    figure(ctx, S * 0.5, S * 0.18, S * 0.19, '#0d69ac', '#287f47');
    figure(ctx, S * 0.78, S * 0.28, S * 0.17, '#f5cd30', '#c4281c');
  },
  catsuit(ctx, S) {
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, S, S);
    const r = rng(9);
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath(); ctx.moveTo(S * 0.3, S * 0.12);
    for (let i = 0; i <= 16; i++) { const t = i / 16; ctx.lineTo(S * (0.3 + 0.4 * t), S * (0.12 + Math.sin(t * Math.PI) * 0.62) + r() * S * 0.04); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4281c';
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.12); ctx.lineTo(S * 0.36, S * 0.04); ctx.lineTo(S * 0.36, S * 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.12); ctx.lineTo(S * 0.64, S * 0.04); ctx.lineTo(S * 0.64, S * 0.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(S / 2, S * 0.12, S * 0.035, 0, 7); ctx.fill();
  },
  robot(ctx, S) {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#c8cacc'); g.addColorStop(1, '#7c7f82');
    ctx.fillStyle = g; ctx.fillRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92);
    ctx.strokeStyle = '#55585b'; ctx.lineWidth = S * 0.02; ctx.strokeRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92);
    ctx.fillStyle = '#3a3c3e'; ctx.fillRect(S * 0.2, S * 0.2, S * 0.6, S * 0.28);
    const lights = ['#c4281c', '#f5cd30', '#4b974b', '#0d69ac'];
    lights.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(S * (0.29 + i * 0.14), S * 0.34, S * 0.04, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#55585b';
    for (let i = 0; i < 4; i++) ctx.fillRect(S * 0.2, S * (0.58 + i * 0.08), S * 0.6, S * 0.03);
    ctx.fillStyle = '#9a9c9e';
    for (const [x, y] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) { ctx.beginPath(); ctx.arc(S * x, S * y, S * 0.025, 0, 7); ctx.fill(); }
  },
  inmate(ctx, S) {
    stripes(ctx, S, '#f2f2f2', '#1b1b1b', 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(S * 0.52, S * 0.27, S * 0.36, S * 0.14);
    ctx.fillStyle = '#000'; ctx.font = font(S, 0.1); centred(ctx, '23768', S * 0.7, S * 0.345, S * 0.34);
  },
  ballerina(ctx, S) { tank(ctx, S, '#f0a8c8', '#e078a8'); },
  erik(ctx, S) {
    ctx.fillStyle = '#e8892a'; ctx.fillRect(S * 0.06, S * 0.06, S * 0.88, S * 0.88);
    ctx.fillStyle = '#f0dca0'; ctx.font = font(S, 0.15);
    centred(ctx, 'Erik', S / 2, S * 0.3, S * 0.8); centred(ctx, 'is my', S / 2, S * 0.5, S * 0.8);
    ctx.font = font(S, 0.2); centred(ctx, 'HERO', S / 2, S * 0.72, S * 0.8);
  },
  camo(ctx, S) {
    ctx.fillStyle = '#5d6b3c'; ctx.fillRect(0, 0, S, S);
    const r = rng(3);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = ['#2f3a20', '#7a6b45', '#3f4a2a', '#8a8a5a'][i % 4];
      ctx.beginPath(); ctx.ellipse(r() * S, r() * S, S * (0.06 + r() * 0.08), S * (0.04 + r() * 0.05), r() * 3, 0, 7); ctx.fill();
    }
  },
  predator(ctx, S) {
    ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#555';
    for (let i = 1; i < 7; i++) ctx.fillRect(i * S / 7 - S * 0.02, 0, S * 0.04, S);
    ctx.fillRect(0, S * 0.04, S, S * 0.04); ctx.fillRect(0, S * 0.92, S, S * 0.04);
    ctx.fillStyle = '#c4281c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = S * 0.03; ctx.font = font(S, 0.18);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('Free', S / 2, S * 0.36, S * 0.9); ctx.fillText('Free', S / 2, S * 0.36, S * 0.9);
    ctx.strokeText('Predator', S / 2, S * 0.62, S * 0.9); ctx.fillText('Predator', S / 2, S * 0.62, S * 0.9);
  },
  cowboyvest(ctx, S) {
    ctx.fillStyle = '#8a5a32';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S * 0.3, 0); ctx.lineTo(S * 0.44, S * 0.62); ctx.lineTo(S * 0.4, S * 0.85); ctx.lineTo(0, S * 0.85); ctx.fill();
    ctx.beginPath(); ctx.moveTo(S, 0); ctx.lineTo(S * 0.7, 0); ctx.lineTo(S * 0.56, S * 0.62); ctx.lineTo(S * 0.6, S * 0.85); ctx.lineTo(S, S * 0.85); ctx.fill();
    ctx.fillStyle = '#d8b040'; for (const y of [0.3, 0.45, 0.6]) { ctx.beginPath(); ctx.arc(S * 0.36, S * y, S * 0.025, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#4a3020'; ctx.fillRect(0, S * 0.85, S, S * 0.1);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(S * 0.42, S * 0.83, S * 0.16, S * 0.14);
  },
  dusek(ctx, S) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#000'; ctx.font = font(S, 0.15, 'bold', 'Comic Sans MS, cursive');
    centred(ctx, 'Matt Dusek', S / 2, S * 0.18, S * 0.95); centred(ctx, 'Rox', S / 2, S * 0.36, S * 0.9);
    ctx.strokeStyle = '#000'; ctx.lineWidth = S * 0.02;
    const cx = S / 2, cy = S * 0.66;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * S * 0.1, cy + Math.sin(a) * S * 0.1, S * 0.07, S * 0.04, a, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.04, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + S * 0.15); ctx.quadraticCurveTo(cx + S * 0.05, cy + S * 0.25, cx, S * 0.98); ctx.stroke();
  },
  raven(ctx, S) {
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.46, 0, 7); ctx.fill();
    ctx.fillStyle = '#f5cd30'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.38, 0, 7); ctx.fill();
    // a black bird with spread wings
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.36);
    ctx.quadraticCurveTo(S * 0.32, S * 0.26, S * 0.16, S * 0.36); ctx.quadraticCurveTo(S * 0.3, S * 0.42, S * 0.4, S * 0.5);
    ctx.lineTo(S * 0.44, S * 0.72); ctx.lineTo(S * 0.5, S * 0.66); ctx.lineTo(S * 0.56, S * 0.72); ctx.lineTo(S * 0.6, S * 0.5);
    ctx.quadraticCurveTo(S * 0.7, S * 0.42, S * 0.84, S * 0.36); ctx.quadraticCurveTo(S * 0.68, S * 0.26, S * 0.5, S * 0.36);
    ctx.fill();
    ctx.beginPath(); ctx.arc(S * 0.5, S * 0.33, S * 0.05, 0, 7); ctx.fill();
  },
  iheartbm(ctx, S) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#000'; ctx.font = font(S, 0.26); centred(ctx, 'I', S * 0.2, S / 2);
    centred(ctx, 'BM', S * 0.76, S / 2, S * 0.4);
    ctx.fillStyle = '#d01c14'; ctx.beginPath();
    const x = S * 0.43, y = S * 0.5, s = S * 0.16;
    ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9); ctx.fill();
  },
  hawaiian(ctx, S) {
    ctx.fillStyle = '#c4281c'; ctx.fillRect(0, 0, S, S);
    const r = rng(17);
    for (let i = 0; i < 9; i++) {
      const cx = r() * S, cy = r() * S, rad = S * 0.06;
      ctx.fillStyle = '#f8f0f0';
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, rad * 0.75, rad * 0.45, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#f5cd30'; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#8a1a12'; ctx.fillRect(S * 0.49, 0, S * 0.02, S);
  },
  robuk(ctx, S) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2f9a3c'; ctx.font = font(S, 0.24);
    centred(ctx, '1', S / 2, S * 0.22); centred(ctx, 'ROBUK', S / 2, S * 0.5, S * 0.92); centred(ctx, 'SHIRT', S / 2, S * 0.78, S * 0.92);
  },
  police(ctx, S) {
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = S * 0.025;
    ctx.beginPath(); ctx.moveTo(S * 0.25, 0); ctx.lineTo(S / 2, S * 0.28); ctx.lineTo(S * 0.75, 0); ctx.moveTo(S / 2, S * 0.28); ctx.lineTo(S / 2, S); ctx.stroke();
    ctx.fillStyle = '#f5cd30'; for (const y of [0.42, 0.6, 0.78]) { ctx.beginPath(); ctx.arc(S * 0.56, S * y, S * 0.025, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#d8a020'; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 - Math.PI / 2, rr = i % 2 ? S * 0.05 : S * 0.09; ctx.lineTo(S * 0.27 + Math.cos(a) * rr, S * 0.45 + Math.sin(a) * rr); }
    ctx.fill();
  },
  // builderman's shirt in the 2008 front-page figure: a red pipe wrench
  // across the chest and a small "R" logo
  wrench(ctx, S) {
    ctx.save(); ctx.translate(S * 0.45, S * 0.52); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c8201a'; ctx.strokeStyle = '#7a1210'; ctx.lineWidth = S * 0.015;
    ctx.beginPath(); ctx.rect(-S * 0.045, -S * 0.22, S * 0.09, S * 0.62); ctx.fill(); ctx.stroke();
    // jaw
    ctx.fillStyle = '#9a9ea2'; ctx.strokeStyle = '#4a4e52';
    ctx.beginPath(); ctx.rect(-S * 0.1, -S * 0.42, S * 0.2, S * 0.08); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(-S * 0.1, -S * 0.3, S * 0.17, S * 0.07); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(-S * 0.04, -S * 0.36, S * 0.08, S * 0.16); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#1b1b1b'; ctx.font = `bold ${Math.round(S * 0.16)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R', S * 0.8, S * 0.18);
  },
};
