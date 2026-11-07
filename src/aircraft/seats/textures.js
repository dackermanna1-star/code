// =============================================================================
// Procedural canvas artwork for the seats: headrest covers (antimacassars),
// tray tables, placards / seat-number labels (atlas), seat-pocket literature
// (atlas), the full bi-fold safety card, newspaper + headphone box.
// All airline artwork is drawn here (fictional "Halcyon Airways").
// =============================================================================
import * as THREE from 'three';
import { AIRLINE, ROWS } from '../../core/constants.js';

const NAVY = '#0b2a4a', TEAL = '#1f7a8c', GOLD = '#e8b04b', CREAM = '#f3f1ea';
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// deterministic noise
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function speckle(ctx, x, y, w, h, n, alpha, seed, dark = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = dark ? Math.floor(r() * 60) : 200 + Math.floor(r() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}

/** Halcyon emblem: a stylised kingfisher in flight over a wave, inside a circle. */
export function drawLogo(ctx, cx, cy, s, color = NAVY, accent = GOLD, ring = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  if (ring) {
    ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 47, 0, Math.PI * 2); ctx.stroke();
  }
  // wave
  ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-30, 24); ctx.bezierCurveTo(-14, 14, -2, 32, 12, 22); ctx.bezierCurveTo(22, 15, 28, 18, 32, 22); ctx.stroke();
  // bird: swept wings + body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-34, -2);
  ctx.bezierCurveTo(-18, -8, -6, -22, 4, -34);    // upper wing leading edge
  ctx.bezierCurveTo(2, -18, 0, -10, 6, -4);
  ctx.bezierCurveTo(16, -12, 26, -14, 36, -12);   // head / beak line
  ctx.lineTo(24, -4);
  ctx.bezierCurveTo(16, 4, 4, 8, -8, 8);           // belly
  ctx.bezierCurveTo(-18, 8, -26, 4, -34, -2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function wordmark(ctx, x, y, size, color = NAVY, align = 'center', sub = true) {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.18)}px`;
  ctx.fillText('HALCYON', x, y);
  if (sub) {
    ctx.font = `400 ${Math.round(size * 0.42)}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.25)}px`;
    ctx.fillText('AIRWAYS', x, y + size * 0.82);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// ---------------------------------------------------------------------------------- antimacassar
/** Headrest cover. u: across (as seen from the front), v: 0 = lower front edge .. 1 = back wrap end. */
export function coverTexture({ business = false } = {}) {
  const W = 512, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = business ? '#e9e5da' : '#efece4';
  ctx.fillRect(0, 0, W, H);
  // woven micro texture
  const r = rng(business ? 11 : 7);
  for (let y = 0; y < H; y += 2) { ctx.fillStyle = `rgba(120,110,95,${0.025 + 0.02 * r()})`; ctx.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { ctx.fillStyle = `rgba(255,255,255,${0.03 * r()})`; ctx.fillRect(x, 0, 1, H); }
  // lower band (front lower edge = canvas bottom)
  ctx.fillStyle = NAVY; ctx.fillRect(0, H - 70, W, 70);
  ctx.fillStyle = GOLD; ctx.fillRect(0, H - 76, W, 5);
  // hemmed edges (stitch lines)
  ctx.strokeStyle = 'rgba(60,50,40,0.35)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.setLineDash([]);
  // logo + wordmark on the front face (front occupies roughly v 0..0.72 -> canvas y 512..143)
  drawLogo(ctx, W / 2, 262, 104, NAVY, GOLD);
  wordmark(ctx, W / 2, 352, 34, NAVY, 'center', false);
  // top wrap: thin teal line
  ctx.fillStyle = TEAL; ctx.fillRect(0, 60, W, 6);
  return tex(c);
}

// ---------------------------------------------------------------------------------- tray table
/** Left half: usable top surface (cup recess). Right half: underside seen when stowed (placard). */
export function trayTexture() {
  const W = 1024, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  const base = '#6a6e75';
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  speckle(ctx, 0, 0, W, H, 9000, 0.25, 3, true);
  speckle(ctx, 0, 0, W, H, 5000, 0.18, 4, false);
  // --- top surface (left half). canvas top = far edge (hinge side)
  // subtle wear: lighter rubbed centre
  const g = ctx.createRadialGradient(256, 300, 30, 256, 300, 260);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, H);
  // cup recess (far right corner): a darker ring with inner highlight
  const cx = 420, cy = 110, R = 52;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5f636a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + 1, cy + 2, R - 3, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R - 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  // faint old coffee ring + scratches
  ctx.strokeStyle = 'rgba(90,70,50,0.10)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(170, 260, 40, 0.3, 5.6); ctx.stroke();
  const r = rng(21);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = 40 + r() * 430, y = 60 + r() * 400; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20); ctx.stroke(); }
  // edge darkening (moulded rim)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, H - 10);
  // --- underside (right half), canvas top = free edge (top when stowed)
  ctx.save(); ctx.translate(512, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, 0, 512, H);
  // finger recess at the free edge
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 176, 14, 160, 26, 13); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, 180, 30, 152, 8, 4); ctx.fill();
  // placard
  ctx.fillStyle = '#f1efe8'; roundRect(ctx, 136, 330, 240, 64, 6); ctx.fill();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 19px ${FONT}`; ctx.fillText('FASTEN SEAT BELT', 256, 352);
  ctx.fillText('WHILE SEATED', 256, 376);
  // seatbelt pictogram
  ctx.strokeStyle = '#f1efe8'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(256, 282, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(240, 292); ctx.lineTo(272, 272); ctx.stroke();
  ctx.font = `600 14px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('HALCYON AIRWAYS', 256, 470);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, H - 10);
  ctx.restore();
  // edge strip (u 0.495..0.505 used by the tray edges) - keep neutral
  ctx.fillStyle = '#55585e'; ctx.fillRect(506, 0, 12, H);
  return tex(c);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ---------------------------------------------------------------------------------- placard atlas
/**
 * 1024x1024 atlas. Returns { texture, rect(name) -> [u0, v0, du, dv], labelRect(row, side) }.
 * Areas outside drawn cells are fully transparent (alphaTest cut-out).
 */
export function placardAtlas() {
  const W = 1024, H = 1024, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const rects = {};
  const put = (name, x, y, w, h) => { rects[name] = [x / W, 1 - (y + h) / H, w / W, h / H]; };
  // --- seat-row labels (8 cols x 7 rows of 128x48), e.g. "16  A B C"
  const labels = [];
  for (const r of ROWS) for (const side of ['left', 'right']) labels.push({ row: r.row, side, letters: r.letters.filter((L) => (side === 'left' ? r.x[L] < 0 : r.x[L] > 0)) });
  labels.forEach((l, i) => {
    const x = (i % 8) * 128, y = Math.floor(i / 8) * 48;
    ctx.fillStyle = '#2a2e35'; roundRect(ctx, x + 4, y + 4, 120, 40, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; roundRect(ctx, x + 5, y + 5, 118, 38, 5); ctx.stroke();
    ctx.fillStyle = '#f4f2ec'; ctx.textBaseline = 'middle';
    ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(String(l.row), x + 14, y + 25);
    ctx.font = `600 17px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(l.letters.join(' '), x + 114, y + 26);
    put(`label:${l.row}:${l.side}`, x + 4, y + 4, 120, 40);
  });
  // --- life vest placard
  let y0 = 360;
  ctx.fillStyle = '#1d2026'; roundRect(ctx, 0, y0, 384, 72, 6); ctx.fill();
  ctx.fillStyle = '#f2c230'; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('LIFE VEST UNDER YOUR SEAT', 192, y0 + 26);
  ctx.fillStyle = '#e8e6e0'; ctx.font = `500 15px ${FONT}`; ctx.fillText('GILET DE SAUVETAGE SOUS VOTRE SIÈGE', 192, y0 + 52);
  put('lifevest', 0, y0, 384, 72);
  // --- exit row strip
  ctx.fillStyle = '#b5121b'; roundRect(ctx, 400, y0, 360, 40, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 22px ${FONT}`; ctx.fillText('EXIT ROW · SEAT DOES NOT RECLINE', 580, y0 + 21);
  put('exitrow', 400, y0, 360, 40);
  // --- USB / power plate decal (on black plastic): USB-A, USB-C sockets
  y0 = 450;
  ctx.fillStyle = '#121316'; roundRect(ctx, 0, y0, 256, 64, 10); ctx.fill();
  ctx.fillStyle = '#000'; roundRect(ctx, 28, y0 + 22, 54, 20, 2); ctx.fill();               // USB-A
  ctx.fillStyle = '#2c2f35'; ctx.fillRect(34, y0 + 26, 42, 6);
  ctx.fillStyle = '#000'; roundRect(ctx, 112, y0 + 25, 40, 14, 7); ctx.fill();              // USB-C
  ctx.fillStyle = '#2c2f35'; roundRect(ctx, 118, y0 + 30, 28, 4, 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(205, y0 + 32, 10, 0, Math.PI * 2); ctx.fill(); // audio jack
  ctx.fillStyle = '#9aa0a8'; ctx.font = `600 10px ${FONT}`; ctx.fillText('USB', 55, y0 + 12); ctx.fillText('USB-C', 132, y0 + 12); ctx.fillText('AUDIO', 205, y0 + 12);
  put('usb', 0, y0, 256, 64);
  // --- power outlet (universal socket with green LED)
  ctx.fillStyle = '#16181c'; roundRect(ctx, 272, y0, 128, 64, 8); ctx.fill();
  ctx.fillStyle = '#050506'; roundRect(ctx, 296, y0 + 12, 64, 40, 6); ctx.fill();
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(312, y0 + 22, 6, 16); ctx.fillRect(338, y0 + 22, 6, 16); ctx.beginPath(); ctx.arc(328, y0 + 44, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#35d06a'; ctx.beginPath(); ctx.arc(380, y0 + 32, 4, 0, Math.PI * 2); ctx.fill();
  put('power', 272, y0, 128, 64);
  // --- recline / seat control placard (small round icons)
  ctx.fillStyle = '#1b1d22'; roundRect(ctx, 416, y0, 128, 64, 8); ctx.fill();
  ctx.strokeStyle = '#cfd3d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(440, y0 + 46); ctx.lineTo(462, y0 + 46); ctx.lineTo(474, y0 + 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(492, y0 + 46); ctx.lineTo(522, y0 + 46); ctx.lineTo(528, y0 + 20); ctx.stroke();
  put('controls', 416, y0, 128, 64);
  // --- "Fasten seat belt" small sticker for armrest tops
  ctx.fillStyle = '#e9e6de'; roundRect(ctx, 560, y0, 200, 40, 5); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = `700 15px ${FONT}`; ctx.fillText('FASTEN SEAT BELT WHILE SEATED', 660, y0 + 21);
  put('fasten', 560, y0, 200, 40);
  // --- bassinet / screen mount placard
  ctx.fillStyle = '#e9e6de'; roundRect(ctx, 776, y0, 240, 40, 5); ctx.fill();
  ctx.fillStyle = '#333'; ctx.font = `600 14px ${FONT}`; ctx.fillText('BASSINET ATTACHMENT · MAX 10 kg', 896, y0 + 21);
  put('bassinet', 776, y0, 240, 40);
  // a guaranteed transparent cell
  put('none', 900, 980, 20, 20);
  const texture = tex(c);
  return {
    texture, rects,
    rect: (n) => rects[n] || rects.none,
    labelRect: (row, side) => rects[`label:${row}:${side}`] || rects.none,
  };
}

// ---------------------------------------------------------------------------------- literature atlas
/** Front faces of the seat-pocket contents (magazine, safety card, sick bag). 1024x512. */
export function literatureAtlas() {
  const W = 1024, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  const rects = {};
  const put = (name, x, y, w, h) => { rects[name] = [x / W, 1 - (y + h) / H, w / W, h / H]; };
  // --- magazine cover "Halcyon Skies" (420 x 512): sunset-over-sea cover photo
  let g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2a4f7a'); g.addColorStop(0.45, '#e58e5a'); g.addColorStop(0.62, '#f6c27a'); g.addColorStop(0.63, '#24506b'); g.addColorStop(1, '#0f2a3d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 420, 512);
  ctx.fillStyle = 'rgba(255,236,190,0.9)'; ctx.beginPath(); ctx.arc(250, 312, 34, Math.PI, 0); ctx.fill();
  for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(255,220,170,${0.35 - i * 0.012})`; ctx.fillRect(170 + Math.sin(i) * 40, 330 + i * 6, 160 - i * 4, 2); }
  // coastline silhouette
  ctx.fillStyle = '#18324a'; ctx.beginPath(); ctx.moveTo(0, 320); ctx.lineTo(60, 300); ctx.lineTo(110, 318); ctx.lineTo(140, 322); ctx.lineTo(0, 330); ctx.fill();
  // masthead
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `300 20px ${FONT}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText('HALCYON', 22, 40);
  ctx.font = `700 64px Georgia, "Times New Roman", serif`; if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  ctx.fillText('Skies', 20, 102);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = `600 13px ${FONT}`; ctx.fillText('NOVEMBER 2026 · COMPLIMENTARY COPY', 22, 128);
  ctx.font = `700 26px Georgia, serif`; ctx.fillText('Golden hour', 22, 430);
  ctx.font = `400 16px ${FONT}`; ctx.fillText('48 hours on the Port Solano coast', 22, 456);
  ctx.fillText('+ Our new routes · Inflight dining', 22, 478);
  put('magazine', 0, 0, 420, 512);
  // --- safety card cover (300 x 512)
  ctx.save(); ctx.translate(430, 0);
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, 300, 512);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 0, 300, 74);
  ctx.fillStyle = '#111'; ctx.textAlign = 'center';
  ctx.font = `800 24px ${FONT}`; ctx.fillText('SAFETY', 150, 34);
  ctx.font = `700 16px ${FONT}`; ctx.fillText('INFORMATION', 150, 58);
  ctx.fillStyle = NAVY; ctx.font = `700 22px ${FONT}`; ctx.fillText('BOEING 737-800', 150, 112);
  drawLogo(ctx, 150, 200, 90, NAVY, GOLD);
  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = '#333';
  ctx.fillText('PLEASE READ BEFORE TAKE-OFF', 150, 290);
  ctx.fillText('DO NOT REMOVE FROM AIRCRAFT', 150, 310);
  drawPlaneTop(ctx, 150, 400, 0.55);
  ctx.restore();
  put('card', 430, 0, 300, 512);
  // --- sick bag (284 x 512): white paper with blue print
  ctx.save(); ctx.translate(740, 0);
  ctx.fillStyle = '#f7f6f2'; ctx.fillRect(0, 0, 284, 512);
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < 512; y += 9) ctx.fillRect(0, y, 284, 1);
  ctx.fillStyle = TEAL; ctx.fillRect(0, 26, 284, 6);
  ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.font = `600 18px ${FONT}`;
  ctx.fillText('HALCYON', 142, 70);
  ctx.font = `400 14px ${FONT}`; ctx.fillText('Motion sickness bag', 142, 96);
  ctx.fillText('Sac pour mal de l’air', 142, 116);
  ctx.strokeStyle = NAVY; ctx.lineWidth = 2; ctx.strokeRect(40, 150, 204, 120);
  ctx.font = `400 12px ${FONT}`; ctx.fillText('Also great for', 142, 190); ctx.fillText('your souvenirs', 142, 208);
  ctx.restore();
  put('sickbag', 740, 0, 284, 512);
  return { texture: tex(c), rect: (n) => rects[n] };
}

function drawPlaneTop(ctx, cx, cy, s) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.fillStyle = '#c9ccd2'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 150, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, -10); ctx.lineTo(-150, 40); ctx.lineTo(-150, 55); ctx.lineTo(-18, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, -10); ctx.lineTo(150, 40); ctx.lineTo(150, 55); ctx.lineTo(18, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10, 110); ctx.lineTo(-60, 140); ctx.lineTo(-60, 148); ctx.lineTo(-8, 135); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, 110); ctx.lineTo(60, 140); ctx.lineTo(60, 148); ctx.lineTo(8, 135); ctx.closePath(); ctx.fill(); ctx.stroke();
  // exits
  ctx.fillStyle = '#d61f26';
  for (const [x, y] of [[-24, -118], [24, -118], [-24, -2], [24, -2], [-24, 22], [24, 22], [-24, 116], [24, 116]]) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------------------------- safety card (open bi-fold)
function person(ctx, x, y, s, pose = 'sit', color = '#2b2f36') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pose === 'brace') {
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(-10, 40); ctx.lineTo(25, 0); ctx.stroke();      // back bent forward
    ctx.beginPath(); ctx.arc(38, -10, 13, 0, Math.PI * 2); ctx.fill();            // head down
    ctx.beginPath(); ctx.moveTo(-10, 40); ctx.lineTo(30, 42); ctx.lineTo(32, 80); ctx.stroke(); // legs
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(48, -20); ctx.stroke(); // arms over head
  } else {
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(-14, 40); ctx.lineTo(-20, -8); ctx.stroke();
    ctx.beginPath(); ctx.arc(-20, -26, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 40); ctx.lineTo(28, 40); ctx.lineTo(30, 82); ctx.stroke();
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-18, 6); ctx.lineTo(10, 26); ctx.stroke();
  }
  ctx.restore();
}
function seatShape(ctx, x, y, s, color = '#7b8697') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-30, 50); ctx.lineTo(-38, -40); ctx.lineTo(-22, -42); ctx.lineTo(-14, 34); ctx.lineTo(36, 34); ctx.lineTo(36, 50); ctx.closePath(); ctx.fill();
  ctx.fillRect(-4, 50, 6, 30);
  ctx.restore();
}
function panel(ctx, x, y, w, h, num, title) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(x + 22, y + 22, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), x + 22, y + 23);
  ctx.fillStyle = '#1d2229'; ctx.textAlign = 'left'; ctx.font = `700 15px ${FONT}`; ctx.fillText(title, x + 44, y + 23);
}
function noSign(ctx, x, y, r) {
  ctx.strokeStyle = '#d61f26'; ctx.lineWidth = r * 0.18;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7); ctx.stroke();
}
function arrow(ctx, x0, y0, x1, y1, color = '#16a34a', w = 6) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * w * 2, y1 - Math.sin(a) * w * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.5) * w * 3.2, y1 - Math.sin(a - 0.5) * w * 3.2); ctx.lineTo(x1 - Math.cos(a + 0.5) * w * 3.2, y1 - Math.sin(a + 0.5) * w * 3.2); ctx.closePath(); ctx.fill();
}

/** Full open safety card, two pages side by side (1600 x 1100). Lazily created. */
export function safetyCardTexture() {
  const W = 1600, H = 1100, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, 0, 0, W, H, 6000, 0.08, 9, true);
  // fold line
  const fg = ctx.createLinearGradient(780, 0, 820, 0);
  fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(0,0,0,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
  // header bars
  for (const x0 of [0, 800]) {
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x0, 0, 800, 70);
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `800 30px ${FONT}`;
    ctx.fillText('SAFETY INFORMATION', x0 + 30, 36);
    ctx.textAlign = 'right'; ctx.font = `700 22px ${FONT}`; ctx.fillText('BOEING 737-800', x0 + 770, 36);
  }
  // ---- page 1: seat belt, brace, oxygen, exits map
  panel(ctx, 30, 95, 360, 300, 1, 'FASTEN SEAT BELT');
  ctx.fillStyle = '#8b939e'; ctx.fillRect(80, 230, 260, 30);
  ctx.fillStyle = '#c8ccd2'; roundRect(ctx, 175, 222, 70, 46, 6); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2; roundRect(ctx, 175, 222, 70, 46, 6); ctx.stroke();
  arrow(ctx, 210, 330, 210, 280, '#16a34a', 6);
  ctx.fillStyle = '#333'; ctx.font = `500 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Lift the buckle lid to release', 210, 370);
  panel(ctx, 410, 95, 360, 300, 2, 'BRACE POSITION');
  seatShape(ctx, 600, 270, 1.0); person(ctx, 520, 240, 1.25, 'brace');
  seatShape(ctx, 690, 270, 1.0);
  panel(ctx, 30, 415, 360, 300, 3, 'OXYGEN');
  ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.ellipse(210, 545, 40, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(210, 515); ctx.lineTo(210, 470); ctx.stroke();
  person(ctx, 140, 600, 1.1);
  ctx.fillStyle = '#333'; ctx.font = `500 15px ${FONT}`; ctx.fillText('Pull the mask towards you · Secure your own', 210, 670);
  ctx.fillText('mask before assisting others', 210, 690);
  panel(ctx, 410, 415, 360, 300, 4, 'EXITS');
  drawPlaneTop(ctx, 590, 575, 0.85);
  panel(ctx, 30, 735, 740, 330, 5, 'NO SMOKING · ELECTRONIC DEVICES');
  noSign(ctx, 140, 900, 60);
  ctx.fillStyle = '#333'; ctx.fillRect(100, 892, 70, 14);
  noSign(ctx, 330, 900, 60);
  ctx.fillStyle = '#333'; roundRect(ctx, 312, 862, 36, 70, 6); ctx.fill();
  ctx.fillStyle = '#1d2229'; ctx.textAlign = 'left'; ctx.font = `500 17px ${FONT}`;
  const lines1 = ['Smoking and e-cigarettes are prohibited at', 'all times, including in the lavatories.', '', 'Portable electronic devices must be in', 'flight mode. Stow laptops for take-off', 'and landing.'];
  lines1.forEach((t, i) => ctx.fillText(t, 430, 840 + i * 26));
  // ---- page 2: life vest, slides, over-wing exit, water landing
  const X = 800;
  panel(ctx, X + 30, 95, 360, 300, 6, 'LIFE VEST');
  ctx.fillStyle = '#f2c230';
  ctx.beginPath(); ctx.moveTo(X + 170, 150); ctx.lineTo(X + 140, 330); ctx.lineTo(X + 200, 330); ctx.lineTo(X + 210, 200); ctx.lineTo(X + 220, 330); ctx.lineTo(X + 280, 330); ctx.lineTo(X + 250, 150); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d61f26'; ctx.fillRect(X + 196, 320, 6, 40); ctx.fillRect(X + 218, 320, 6, 40);
  ctx.fillStyle = '#333'; ctx.font = `500 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Inflate only when leaving the aircraft', X + 210, 382);
  panel(ctx, X + 410, 95, 360, 300, 7, 'EVACUATION SLIDE');
  ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(X + 470, 190); ctx.lineTo(X + 520, 190); ctx.lineTo(X + 740, 350); ctx.lineTo(X + 680, 350); ctx.closePath(); ctx.fill();
  person(ctx, X + 560, 230, 0.8, 'sit');
  noSign(ctx, X + 700, 200, 26);
  ctx.fillStyle = '#333'; ctx.fillRect(X + 690, 188, 20, 22);
  panel(ctx, X + 30, 415, 740, 330, 8, 'OVERWING EXIT (ROWS 16 & 17)');
  for (let i = 0; i < 3; i++) {
    const x0 = X + 70 + i * 240;
    ctx.fillStyle = '#d7dbe0'; roundRect(ctx, x0, 480, 150, 200, 30); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 3; roundRect(ctx, x0, 480, 150, 200, 30); ctx.stroke();
    ctx.fillStyle = '#8ab4d8'; roundRect(ctx, x0 + 40, 520, 70, 100, 18); ctx.fill();
    ctx.fillStyle = '#d61f26'; ctx.fillRect(x0 + 60, 492, 30, 12);
    if (i === 0) arrow(ctx, x0 + 75, 560, x0 + 75, 500, '#16a34a', 5);
    if (i === 1) arrow(ctx, x0 + 75, 560, x0 + 75, 640, '#16a34a', 5);
    if (i === 2) arrow(ctx, x0 + 30, 590, x0 + 140, 590, '#16a34a', 5);
    ctx.fillStyle = '#1d2229'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String.fromCharCode(65 + i), x0 + 75, 712);
  }
  panel(ctx, X + 30, 765, 740, 300, 9, 'WATER LANDING');
  ctx.fillStyle = '#2f6f9f'; ctx.fillRect(X + 60, 960, 680, 70);
  ctx.fillStyle = '#c9ccd2'; ctx.beginPath(); ctx.ellipse(X + 400, 950, 260, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.ellipse(X + 260, 985, 50, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d2229'; ctx.font = `500 17px ${FONT}`; ctx.textAlign = 'left';
  ['Seat cushions are not flotation devices on this', 'aircraft. Use the life vest stowed under your seat.'].forEach((t, i) => ctx.fillText(t, X + 70, 840 + i * 26));
  ctx.fillStyle = fg; ctx.fillRect(780, 0, 40, H);
  // footer
  ctx.fillStyle = '#555'; ctx.font = `500 13px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(`${AIRLINE.name} · ${AIRLINE.registration} · Form HN-SC-738 rev. 7`, W - 30, H - 14);
  return tex(c, { aniso: 8 });
}

// ---------------------------------------------------------------------------------- paper atlas
/** Newspaper (left 640) + headphone box (right 384). 1024x512. */
export function paperAtlas() {
  const W = 1024, H = 512, c = canvas(W, H), ctx = c.getContext('2d');
  // newspaper front page
  ctx.fillStyle = '#ece8dc'; ctx.fillRect(0, 0, 640, 512);
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = `700 46px Georgia, "Times New Roman", serif`;
  ctx.fillText('The Cedar Bay Herald', 320, 58);
  ctx.fillRect(20, 72, 600, 3); ctx.fillRect(20, 80, 600, 1);
  ctx.font = `700 30px Georgia, serif`; ctx.fillText('Coastal rail link approved', 320, 122);
  ctx.fillStyle = '#6b6b6b'; ctx.fillRect(24, 140, 280, 170);
  ctx.fillStyle = '#9a9a9a'; ctx.fillRect(34, 150, 260, 120);
  const r = rng(5);
  for (let col = 0; col < 3; col++) {
    const x0 = col === 0 ? 24 : 320 + (col - 1) * 152;
    const yStart = col === 0 ? 325 : 140;
    for (let y = yStart; y < 500; y += 9) { ctx.fillStyle = `rgba(30,30,30,${0.55 + 0.2 * r()})`; ctx.fillRect(x0, y, (col === 0 ? 280 : 140) * (0.75 + 0.25 * r()), 4); }
  }
  // headphone box
  ctx.save(); ctx.translate(640, 0);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, 384, 512);
  ctx.fillStyle = '#fff'; drawLogo(ctx, 192, 170, 120, '#ffffff', GOLD);
  wordmark(ctx, 192, 290, 30, '#fff', 'center', false);
  ctx.font = `400 22px ${FONT}`; ctx.fillStyle = '#cfe3ea'; ctx.textAlign = 'center'; ctx.fillText('Comfort earphones', 192, 350);
  ctx.fillStyle = TEAL; ctx.fillRect(0, 460, 384, 18);
  ctx.restore();
  return { texture: tex(c), rect: (n) => (n === 'news' ? [0, 0, 0.625, 1] : [0.625, 0, 0.375, 1]) };
}

/** Webbing (seat-belt strap): fine twill with stitched edges. Repeat texture; u across, v along. */
export function webbingTexture() {
  const W = 64, H = 256, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#7d8696'; ctx.fillRect(0, 0, W, H);
  for (let y = -W; y < H + W; y += 4) { ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + W * 0.6); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
  return tex(c, { repeat: true });
}
