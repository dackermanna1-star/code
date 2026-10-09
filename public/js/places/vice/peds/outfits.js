// What the people of Vice City wear: one big painted picture (the outfit
// atlas, 2048 x 2048: 8 x 10 cells of 256 x 192 px), one cell per outfit,
// painted procedurally when the game starts. Beachwear (Hawaiian shirts, tank
// tops, bikinis), tourists with cameras and socks in their sandals, suits,
// joggers, old Cuban men in guayaberas, Caribbean colours, club-goers,
// construction workers, the VCPD, SWAT, the four gangs and a few faces from
// the missions. Faces are drawn the 2008 way: two black eyes and a smile.
//
//   buildAtlas() -> {canvas, tex}            (once; shared)
//   OUTFITS[i] = {name, cat, gender, hat (bitmask of HAT bits), items: [...], skinTone}
//   OUTFIT_BY_NAME[name] -> index
//   SETS[set] -> [outfit indices]            beach, street, tourist, business, old, caribbean, club, worker,
//                                            jogger, cop, swat, gang:kings, gang:cubans, gang:haitians, gang:dockers, mission
//   CELL_W, CELL_H, COLS, ROWS, ATLAS        (atlas layout, for the crowd's shader)
//   REG                                      the regions of a cell (head strip, torso faces, limbs, hat, hair, glasses)
//   HAT                                      bits for the head mesh's hats/hair/glasses
import * as THREE from 'three';
import { rng } from '../../outbreak/noise.js';

export const CELL_W = 256, CELL_H = 192, COLS = 8, ROWS = 10, ATLAS = 2048;

// regions of a cell: [x, y, w, h] px
export const REG = {
  head: { strip: [0, 0, 192, 64], top: [192, 0, 64, 64] },
  torso: { front: [0, 64, 64, 64], back: [64, 64, 64, 64], side: [128, 64, 32, 64], top: [160, 64, 64, 32], bottom: [128, 96, 32, 32] },
  hat: { crown: [160, 96, 32, 32], brim: [192, 96, 32, 32] },
  hair: [224, 64, 32, 32], glass: [224, 96, 32, 32],
  arm: { front: [0, 128, 32, 64], side: [32, 128, 32, 64], back: [64, 128, 32, 64], top: [96, 128, 32, 32], bottom: [96, 160, 32, 32] },
  leg: { front: [128, 128, 32, 64], side: [160, 128, 32, 64], back: [192, 128, 32, 64], top: [224, 128, 32, 32], bottom: [224, 160, 32, 32] },
};

// hats, hair and glasses: extra geometry on the head mesh, switched on per person by a bitmask
export const HAT = {
  cap: 1, police: 2, fedora: 4, sunhat: 8, hardhat: 16, helmet: 32, bucket: 64, beanie: 128,
  longhair: 256, bun: 512, afro: 1024, bandana: 2048, headwrap: 4096, glasses: 8192, capback: 16384,
};

export const OUTFITS = [];
export const OUTFIT_BY_NAME = {};
export const SETS = {};

const SKIN = ['#f6d7bf', '#efc4a2', '#e2ad86', '#d39b72', '#c08259', '#a66a43', '#8d5432', '#734226', '#5a321c', '#46261a'];
const HAIR = { black: '#18120e', dark: '#33221a', brown: '#5c3b22', auburn: '#7a3a1c', blonde: '#d9b768', plat: '#ece0c4', grey: '#9c9a96', white: '#e6e4de', red: '#a8461e', pink: '#ff6fb0', blue: '#3fa8ff' };

function shade(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return '#' + c.getHexString(); }

// ---- the painter --------------------------------------------------------------------------------------------------
/** Paint outfit o into cell i of the atlas context g. */
function paint(g, i, o) {
  const ox = (i % COLS) * CELL_W, oy = Math.floor(i / COLS) * CELL_H;
  const r = rng(o.seed ?? i * 977 + 13);
  const fill = (reg, col) => { g.fillStyle = col; g.fillRect(ox + reg[0], oy + reg[1], reg[2], reg[3]); };
  const rect = (reg, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(ox + reg[0] + x, oy + reg[1] + y, w, h); };
  const ell = (reg, x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(ox + reg[0] + x, oy + reg[1] + y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const clip = (reg, fn) => { g.save(); g.beginPath(); g.rect(ox + reg[0], oy + reg[1], reg[2], reg[3]); g.clip(); fn(); g.restore(); };
  const grain = (reg, a = 0.07) => { for (let k = 0; k < reg[2] * reg[3] / 10; k++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * a})` : `rgba(255,255,255,${r() * a * 0.7})`; g.fillRect(ox + reg[0] + r() * reg[2], oy + reg[1] + r() * reg[3], 2, 2); } };
  const T = REG.torso, A = REG.arm, L = REG.leg, H = REG.head;
  const skin = o.skin, top = o.topCol || '#ffffff', bot = o.botCol || '#3a4a6a', shoes = o.shoes || '#2a2420';

  // --- head: skin, hair, face ---
  fill(H.strip, skin); fill(H.top, skin);
  const S = H.strip;
  // a little shading towards the back so the head reads round
  clip(S, () => { const gr = g.createLinearGradient(ox + S[0], 0, ox + S[0] + S[2], 0); gr.addColorStop(0, 'rgba(0,0,0,0.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)'); g.fillStyle = gr; g.fillRect(ox + S[0], oy + S[1], S[2], S[3]); });
  const hair = o.hair, hs = o.hairStyle || (hair ? 'short' : 'bald');
  if (hair && hs !== 'bald') {
    fill(H.top, hair);
    // the hairline: low at the back, sideburns at the sides, a fringe at the front
    g.fillStyle = hair; g.beginPath();
    const front = hs === 'buzz' ? 7 : hs === 'long' || hs === 'bun' ? 12 : hs === 'afro' ? 14 : 9;
    const back = hs === 'buzz' ? 26 : hs === 'long' ? 64 : 40;
    g.moveTo(ox, oy);
    for (let x = 0; x <= 192; x += 4) {
      const t = Math.abs(x - 96) / 96;           // 0 front .. 1 back
      const side = Math.exp(-((t - 0.5) ** 2) / 0.006) * (hs === 'buzz' ? 8 : 16); // sideburns
      const y = front + (back - front) * t * t + side + (hs === 'messy' ? r() * 4 : 0);
      g.lineTo(ox + x, oy + y);
    }
    g.lineTo(ox + 192, oy); g.closePath(); g.fill();
    if (hs === 'buzz') { g.globalAlpha = 0.3; fill(H.top, skin); g.globalAlpha = 1; }
  }
  if (o.hairCol2) { g.fillStyle = o.hairCol2; for (let k = 0; k < 6; k++) g.fillRect(ox + 80 + r() * 30, oy, 3, 10); }
  // the face (front = x 96)
  const fx = ox + 96, fy = oy;
  const face = o.face || 'smile';
  if (o.beard) { g.fillStyle = o.beardCol || hair || '#2a1a10'; g.beginPath(); g.ellipse(fx, fy + 52, 26, 14, 0, 0, Math.PI * 2); g.fill(); g.fillRect(fx - 26, fy + 40, 6, 14); g.fillRect(fx + 20, fy + 40, 6, 14); }
  if (o.stubble) { for (let k = 0; k < 140; k++) { g.fillStyle = 'rgba(30,20,15,0.25)'; g.fillRect(fx - 22 + r() * 44, fy + 40 + r() * 20, 1.5, 1.5); } }
  // eyes: the classic black ovals (sunglasses go on as geometry)
  const ey = fy + 27;
  if (face === 'old') { g.fillStyle = '#111'; g.fillRect(fx - 15, ey + 1, 8, 4); g.fillRect(fx + 7, ey + 1, 8, 4); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(fx - 16, ey + 8, 10, 1); g.fillRect(fx + 6, ey + 8, 10, 1); }
  else if (face === 'stern' || face === 'mean') { g.fillStyle = '#111'; g.beginPath(); g.ellipse(fx - 11, ey + 2, 3.5, 5, 0, 0, Math.PI * 2); g.ellipse(fx + 11, ey + 2, 3.5, 5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(fx - 17, ey - 6); g.lineTo(fx - 5, ey - 3); g.moveTo(fx + 17, ey - 6); g.lineTo(fx + 5, ey - 3); g.stroke(); }
  else { g.fillStyle = '#111'; g.beginPath(); g.ellipse(fx - 10, ey, 3.5, 6, 0, 0, Math.PI * 2); g.ellipse(fx + 10, ey, 3.5, 6, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(fx - 11, ey - 4, 1.5, 2); g.fillRect(fx + 9, ey - 4, 1.5, 2); }
  if (o.gender === 'f' && face !== 'old') { g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx - 15, ey - 6); g.lineTo(fx - 12, ey - 4); g.moveTo(fx + 15, ey - 6); g.lineTo(fx + 12, ey - 4); g.stroke(); }
  // mouth
  g.strokeStyle = '#111'; g.lineWidth = 2.5; g.lineCap = 'round';
  if (face === 'smile' || face === 'old') { g.beginPath(); g.arc(fx, fy + 36, 11, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke(); }
  else if (face === 'grin') { g.fillStyle = '#111'; g.beginPath(); g.arc(fx, fy + 38, 11, 0, Math.PI); g.fill(); g.fillStyle = '#fff'; g.fillRect(fx - 9, fy + 38, 18, 3); }
  else if (face === 'chill') { g.beginPath(); g.moveTo(fx - 8, fy + 46); g.quadraticCurveTo(fx + 2, fy + 49, fx + 10, fy + 43); g.stroke(); }
  else if (face === 'stern' || face === 'mean') { g.beginPath(); g.moveTo(fx - 8, fy + 47); g.lineTo(fx + 8, fy + 47); g.stroke(); }
  else if (face === 'lips') { g.fillStyle = o.lipCol || '#c0283a'; g.beginPath(); g.ellipse(fx, fy + 45, 8, 3.5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = shade(o.lipCol || '#c0283a', 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(fx - 7, fy + 45); g.lineTo(fx + 7, fy + 45); g.stroke(); }
  else if (face === 'o') { g.fillStyle = '#111'; g.beginPath(); g.ellipse(fx, fy + 45, 4, 5, 0, 0, Math.PI * 2); g.fill(); }
  if (o.moustache) { g.fillStyle = o.beardCol || hair || '#2a1a10'; g.beginPath(); g.ellipse(fx - 6, fy + 41, 8, 3, 0.2, 0, Math.PI * 2); g.ellipse(fx + 6, fy + 41, 8, 3, -0.2, 0, Math.PI * 2); g.fill(); }
  if (o.blush) { g.fillStyle = 'rgba(230,90,90,0.25)'; g.beginPath(); g.ellipse(fx - 18, fy + 38, 5, 3, 0, 0, Math.PI * 2); g.ellipse(fx + 18, fy + 38, 5, 3, 0, 0, Math.PI * 2); g.fill(); }
  if (o.sunburn) { g.fillStyle = 'rgba(230,60,40,0.22)'; g.fillRect(ox + 60, oy + 14, 72, 30); }
  if (o.facepaint) { g.fillStyle = o.facepaint; g.fillRect(fx - 20, ey - 3, 40, 3); }
  if (o.mask) { g.fillStyle = o.mask; g.fillRect(ox, oy + 36, 192, 28); if (o.maskFull) { g.fillRect(ox, oy, 192, 22); g.fillRect(ox, oy + 22, 74, 14); g.fillRect(ox + 118, oy + 22, 74, 14); } }
  // hat, hair and lens swatches (the head mesh's extra geometry samples these)
  fill(REG.hat.crown, o.hatCol || '#ffffff'); fill(REG.hat.brim, o.hatCol2 || shade(o.hatCol || '#ffffff', 0.7));
  if (o.hatPattern === 'straw') for (const reg of [REG.hat.crown, REG.hat.brim]) { for (let k = 0; k < 60; k++) rect(reg, r() * 32, r() * 32, 3, 1, 'rgba(120,90,40,0.35)'); }
  if (o.hatPattern === 'floral') for (let k = 0; k < 8; k++) ell(REG.hat.crown, r() * 32, r() * 32, 3, 3, '#ff6fa8');
  fill(REG.hair, hair || skin); grain(REG.hair, 0.12);
  fill(REG.glass, o.lens || '#14161c');
  rect(REG.glass, 0, 0, 32, 4, 'rgba(255,255,255,0.35)');

  // --- torso ---
  const kind = o.top || 'tee';
  const torsoBase = kind === 'shirtless' || kind === 'bikini' ? skin : top;
  for (const k of ['front', 'back', 'side', 'top']) fill(T[k], torsoBase);
  fill(T.bottom, o.bottom === 'bikini' || o.bottom === 'trunks' ? (o.botCol || top) : bot);
  const TF = T.front, TB = T.back;
  if (kind === 'shirtless') {
    // a little definition, and the waistband of whatever's below
    ell(TF, 20, 22, 9, 5, shade(skin, 0.9)); ell(TF, 44, 22, 9, 5, shade(skin, 0.9)); rect(TF, 31, 30, 2, 22, shade(skin, 0.88));
    if (o.chest) for (let k = 0; k < 40; k++) rect(TF, 18 + r() * 28, 14 + r() * 26, 1.5, 1.5, 'rgba(40,25,15,0.35)');
  }
  if (kind === 'bikini') {
    const bc = o.topCol;
    for (const reg of [TF]) { g.fillStyle = bc; g.beginPath(); g.moveTo(ox + reg[0] + 10, oy + reg[1] + 18); g.lineTo(ox + reg[0] + 30, oy + reg[1] + 18); g.lineTo(ox + reg[0] + 24, oy + reg[1] + 30); g.lineTo(ox + reg[0] + 14, oy + reg[1] + 30); g.fill(); g.beginPath(); g.moveTo(ox + reg[0] + 34, oy + reg[1] + 18); g.lineTo(ox + reg[0] + 54, oy + reg[1] + 18); g.lineTo(ox + reg[0] + 50, oy + reg[1] + 30); g.lineTo(ox + reg[0] + 40, oy + reg[1] + 30); g.fill(); }
    rect(TF, 30, 18, 4, 4, bc); rect(TB, 0, 20, 64, 5, bc); rect(T.side, 0, 20, 32, 5, bc);
    rect(TF, 14, 0, 2, 18, bc); rect(TF, 48, 0, 2, 18, bc);
    if (o.topCol2) for (let k = 0; k < 10; k++) ell(TF, 12 + r() * 40, 20 + r() * 8, 1.5, 1.5, o.topCol2);
  }
  if (kind === 'swim') { // one-piece
    for (const reg of [TF, TB]) { g.fillStyle = top; g.beginPath(); g.moveTo(ox + reg[0] + 12, oy + reg[1]); g.lineTo(ox + reg[0] + 52, oy + reg[1]); g.lineTo(ox + reg[0] + 58, oy + reg[1] + 64); g.lineTo(ox + reg[0] + 6, oy + reg[1] + 64); g.fill(); }
    for (const reg of [TF, TB]) { rect(reg, 0, 0, 12, 64, skin); rect(reg, 52, 0, 12, 64, skin); rect(reg, 12, 0, 40, 12, skin); rect(reg, 14, 0, 4, 12, top); rect(reg, 46, 0, 4, 12, top); }
    fill(T.side, skin); rect(T.side, 0, 26, 32, 38, top); fill(T.top, skin);
    if (o.topCol2) for (const reg of [TF]) { rect(reg, 12, 30, 40, 5, o.topCol2); }
  }
  if (kind === 'tank') { for (const reg of [TF, TB]) { rect(reg, 0, 0, 12, 14, skin); rect(reg, 52, 0, 12, 14, skin); g.fillStyle = skin; g.beginPath(); g.ellipse(ox + reg[0] + 32, oy + reg[1], 13, reg === TF ? 9 : 5, 0, 0, Math.PI * 2); g.fill(); } fill(T.top, skin); rect(T.top, 6, 0, 10, 32, top); rect(T.top, 48, 0, 10, 32, top); }
  if (kind === 'hawaiian' || o.pattern === 'floral') {
    for (const reg of [TF, TB, T.side, A.front, A.side, A.back]) clip(reg, () => {
      const n = reg[2] * reg[3] / 220;
      for (let k = 0; k < n; k++) {
        const x = ox + reg[0] + r() * reg[2], y = oy + reg[1] + r() * reg[3], s = 3 + r() * 4;
        g.fillStyle = o.topCol3 || shade(top, 0.75); g.beginPath(); g.ellipse(x + s, y + s * 0.4, s * 1.4, s * 0.5, r() * 3, 0, Math.PI * 2); g.fill(); // leaf
        g.fillStyle = o.topCol2 || '#ffffff';
        for (let p = 0; p < 5; p++) { const a = p * 1.2566 + r() * 0.3; g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, s * 0.6, s * 0.4, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffd23a'; g.fillRect(x - 1, y - 1, 2, 2);
      }
    });
    // an open collar and buttons
    if (kind === 'hawaiian') { g.fillStyle = skin; g.beginPath(); g.moveTo(ox + TF[0] + 22, oy + TF[1]); g.lineTo(ox + TF[0] + 42, oy + TF[1]); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 14); g.fill(); rect(TF, 31, 14, 2, 50, shade(top, 0.8)); }
  }
  if (kind === 'guayabera') {
    for (const reg of [TF, TB]) for (const x of [12, 18, 46, 52]) rect(reg, x, 4, 2, 58, shade(top, 0.86));
    for (const [x, y] of [[6, 20], [40, 20], [6, 42], [40, 42]]) { rect(TF, x, y, 18, 13, shade(top, 0.92)); rect(TF, x, y, 18, 2, shade(top, 0.8)); }
    rect(TF, 31, 4, 2, 60, shade(top, 0.85)); for (let y = 10; y < 60; y += 9) rect(TF, 30, y, 4, 3, '#f4f0e6');
    g.fillStyle = skin; g.beginPath(); g.moveTo(ox + TF[0] + 25, oy + TF[1]); g.lineTo(ox + TF[0] + 39, oy + TF[1]); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 8); g.fill();
  }
  if (kind === 'tee' || kind === 'polo' || kind === 'jersey' || kind === 'longtee') {
    g.fillStyle = skin; g.beginPath(); g.ellipse(ox + TF[0] + 32, oy + TF[1], 9, 5, 0, 0, Math.PI * 2); g.fill();
    rect(TF, 22, 0, 20, 2, shade(top, 0.8));
    if (kind === 'polo') { g.fillStyle = shade(top, 0.85); g.fillRect(ox + TF[0] + 20, oy + TF[1], 24, 5); rect(TF, 31, 4, 2, 12, shade(top, 0.75)); for (const y of [7, 12]) rect(TF, 30, y, 4, 2, '#eee'); }
    if (o.logo === 'palm') { rect(TF, 30, 22, 3, 22, '#2a6a3a'); for (let k = 0; k < 5; k++) ell(TF, 31 + (k - 2) * 5, 22 + Math.abs(k - 2) * 2, 6, 2, o.logoCol || '#2a8a4a', (k - 2) * 0.4); }
    if (o.logo === 'sun') { ell(TF, 32, 30, 10, 10, o.logoCol || '#ff7a2a'); for (let y = 32; y < 42; y += 3) rect(TF, 22, y, 20, 1.5, top); }
    if (o.logo === 'text') { g.fillStyle = o.logoCol || '#fff'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.fillText(o.text || 'VICE', ox + TF[0] + 32, oy + TF[1] + 34); }
    if (o.logo === 'stripe') { rect(TF, 0, 22, 64, 8, o.logoCol || '#fff'); rect(TB, 0, 22, 64, 8, o.logoCol || '#fff'); rect(T.side, 0, 22, 32, 8, o.logoCol || '#fff'); }
    if (o.logo === 'heart') { ell(TF, 28, 28, 5, 5, o.logoCol || '#e02a5a'); ell(TF, 36, 28, 5, 5, o.logoCol || '#e02a5a'); g.fillStyle = o.logoCol || '#e02a5a'; g.beginPath(); g.moveTo(ox + TF[0] + 23, oy + TF[1] + 30); g.lineTo(ox + TF[0] + 41, oy + TF[1] + 30); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 40); g.fill(); }
    if (kind === 'jersey') { g.fillStyle = o.topCol2 || '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText(o.text || '23', ox + TF[0] + 32, oy + TF[1] + 44); g.fillText(o.text || '23', ox + TB[0] + 32, oy + TB[1] + 44); rect(TF, 0, 0, 10, 16, skin); rect(TF, 54, 0, 10, 16, skin); }
  }
  if (o.pattern === 'stripes') for (const reg of [TF, TB, T.side]) for (let y = 4; y < 64; y += 9) rect(reg, 0, y, reg[2], 4, o.topCol2 || shade(top, 1.3));
  if (o.pattern === 'vstripes') for (const reg of [TF, TB]) for (let x = 3; x < 64; x += 8) rect(reg, x, 0, 3, 64, o.topCol2 || shade(top, 1.3));
  if (o.pattern === 'check') for (const reg of [TF, TB, T.side, A.front, A.side, A.back]) { for (let x = 0; x < reg[2]; x += 10) rect(reg, x, 0, 4, reg[3], 'rgba(0,0,0,0.18)'); for (let y = 0; y < reg[3]; y += 10) rect(reg, 0, y, reg[2], 4, 'rgba(0,0,0,0.18)'); }
  if (o.pattern === 'sequin') for (const reg of [TF, TB, T.side]) for (let k = 0; k < 90; k++) ell(reg, r() * reg[2], r() * reg[3], 1.4, 1.4, r() < 0.5 ? shade(top, 1.6) : '#ffffff');
  if (o.pattern === 'kente') for (const reg of [TF, TB, T.side, A.front, A.side, A.back]) { const cols = ['#e8b81c', '#1c8a3a', '#c8281e', '#1a1a1a']; for (let y = 0; y < reg[3]; y += 8) for (let x = 0; x < reg[2]; x += 8) rect(reg, x, y, 8, 8, cols[(x / 8 + y / 8 * 3 + (r() * 2 | 0)) % 4]); }
  if (kind === 'dress') {
    // a fitted dress (strapless or with thin straps), the skirt continues on the legs
    for (const reg of [TF, TB]) { rect(reg, 0, 0, 64, 14, skin); if (o.straps) { rect(reg, 14, 0, 3, 14, top); rect(reg, 47, 0, 3, 14, top); } }
    rect(T.side, 0, 0, 32, 14, skin); fill(T.top, skin);
  }
  if (kind === 'suit' || kind === 'blazer') {
    const shirt = o.shirtCol || '#f4f4f0';
    g.fillStyle = shirt; g.beginPath(); g.moveTo(ox + TF[0] + 18, oy + TF[1]); g.lineTo(ox + TF[0] + 46, oy + TF[1]); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 36); g.fill();
    g.strokeStyle = shade(top, 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(ox + TF[0] + 18, oy + TF[1]); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 36); g.lineTo(ox + TF[0] + 46, oy + TF[1]); g.stroke();
    if (o.tie) { g.fillStyle = o.tie; g.beginPath(); g.moveTo(ox + TF[0] + 30, oy + TF[1] + 2); g.lineTo(ox + TF[0] + 34, oy + TF[1] + 2); g.lineTo(ox + TF[0] + 36, oy + TF[1] + 30); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 35); g.lineTo(ox + TF[0] + 28, oy + TF[1] + 30); g.fill(); }
    rect(TF, 31, 38, 2, 26, shade(top, 0.72)); rect(TF, 27, 44, 3, 3, shade(top, 0.6)); rect(TF, 27, 54, 3, 3, shade(top, 0.6));
    rect(TF, 6, 40, 12, 2, shade(top, 0.7)); rect(TF, 46, 40, 12, 2, shade(top, 0.7));
    if (o.pocketSq) rect(TF, 46, 14, 8, 4, o.pocketSq);
  }
  if (kind === 'jacket') { // a leather/denim jacket, open over a tee
    rect(TF, 18, 0, 28, 64, o.shirtCol || '#e8e8e8'); rect(TF, 17, 0, 2, 64, shade(top, 0.6)); rect(TF, 45, 0, 2, 64, shade(top, 0.6));
    if (o.logo === 'text') { g.fillStyle = o.logoCol || '#c00'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.fillText(o.text || 'VC', ox + TF[0] + 32, oy + TF[1] + 32); }
  }
  if (kind === 'police') {
    rect(TF, 31, 0, 2, 64, shade(top, 0.82)); for (let y = 8; y < 58; y += 10) rect(TF, 30, y, 4, 3, '#e8e8f0');
    ell(TF, 16, 18, 5, 6, '#d8b848'); rect(TF, 15, 16, 3, 4, '#a88a28'); // badge
    rect(TF, 40, 16, 14, 4, '#1a2240'); rect(TF, 42, 23, 10, 3, '#e8e8e8');  // name bar
    rect(TF, 6, 28, 18, 12, shade(top, 0.9)); rect(TF, 40, 28, 18, 12, shade(top, 0.9));
    rect(TF, 22, 0, 20, 4, shade(top, 0.8));
    for (const reg of [A.side]) { rect(reg, 6, 4, 20, 14, '#1a2a5a'); rect(reg, 10, 7, 12, 8, '#d8b848'); }
    g.fillStyle = '#fff'; g.font = 'bold 9px Arial'; g.textAlign = 'center'; g.fillText('VCPD', ox + TB[0] + 32, oy + TB[1] + 20);
  }
  if (kind === 'swat') {
    for (const reg of [TF, TB]) { rect(reg, 6, 4, 52, 54, o.vestCol || '#1a1d22'); for (let k = 0; k < 3; k++) rect(reg, 10 + k * 16, 34, 12, 14, shade(o.vestCol || '#1a1d22', 1.4)); }
    g.fillStyle = '#e8e8e8'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('SWAT', ox + TB[0] + 32, oy + TB[1] + 22); g.font = 'bold 9px Arial'; g.fillText('POLICE', ox + TF[0] + 32, oy + TF[1] + 18);
  }
  if (kind === 'hivis') {
    const vc = o.vestCol || '#ff8a1a';
    for (const reg of [TF, TB]) { rect(reg, 4, 0, 56, 60, vc); if (reg === TF) rect(reg, 28, 0, 8, 60, top); for (const y of [30, 44]) rect(reg, 4, y, 56, 5, '#d8dce0'); }
    rect(T.side, 0, 0, 32, 60, vc); for (const y of [30, 44]) rect(T.side, 0, y, 32, 5, '#d8dce0');
  }
  if (kind === 'overalls') {
    const ov = o.botCol;
    for (const reg of [TF, TB]) { rect(reg, 10, 20, 44, 44, ov); rect(reg, 12, 0, 6, 20, ov); rect(reg, 46, 0, 6, 20, ov); rect(reg, 18, 26, 28, 12, shade(ov, 0.85)); }
    rect(T.side, 0, 34, 32, 30, ov); rect(TF, 13, 18, 4, 4, '#c8c8c8'); rect(TF, 47, 18, 4, 4, '#c8c8c8');
  }
  if (kind === 'tracksuit') { for (const reg of [T.side]) { rect(reg, 10, 0, 4, 64, o.topCol2 || '#fff'); rect(reg, 18, 0, 4, 64, o.topCol2 || '#fff'); } rect(TF, 31, 0, 2, 64, shade(top, 0.7)); }
  if (kind === 'apron') { rect(TF, 10, 14, 44, 50, o.topCol2 || '#f0f0f0'); }
  // accessories on the torso
  if (o.camera) { g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(ox + TF[0] + 10, oy + TF[1]); g.lineTo(ox + TF[0] + 32, oy + TF[1] + 34); g.lineTo(ox + TF[0] + 54, oy + TF[1]); g.stroke(); rect(TF, 22, 32, 20, 13, '#222'); ell(TF, 32, 39, 5, 5, '#555'); ell(TF, 32, 39, 3, 3, '#88a'); rect(TF, 24, 30, 6, 3, '#333'); }
  if (o.chain) { g.strokeStyle = '#e8c040'; g.lineWidth = 2; g.beginPath(); g.ellipse(ox + TF[0] + 32, oy + TF[1] + 4, 11, 16, 0, 0.1, Math.PI - 0.1); g.stroke(); if (o.chain === 2) ell(TF, 32, 21, 3, 4, '#e8c040'); }
  if (o.bandanaArm) { rect(A.front, 0, 16, 32, 6, o.bandanaArm); rect(A.side, 0, 16, 32, 6, o.bandanaArm); rect(A.back, 0, 16, 32, 6, o.bandanaArm); }
  if (o.backpack) { rect(TB, 10, 8, 44, 40, o.backpack); rect(TB, 14, 30, 36, 14, shade(o.backpack, 0.75)); rect(TF, 12, 0, 5, 30, shade(o.backpack, 0.8)); rect(TF, 47, 0, 5, 30, shade(o.backpack, 0.8)); }
  if (o.belt !== false && kind !== 'bikini' && kind !== 'swim' && kind !== 'dress' && o.bottom !== 'trunks' && kind !== 'shirtless') {
    const bc = o.beltCol || '#1e1812';
    for (const reg of [TF, TB]) rect(reg, 0, 59, 64, 5, bc); rect(T.side, 0, 59, 32, 5, bc);
    rect(TF, 28, 59, 8, 5, o.buckle || '#c8b070');
  }
  if (kind === 'shirtless' && o.bottom === 'trunks') { for (const reg of [TF, TB]) rect(reg, 0, 56, 64, 8, bot); rect(T.side, 0, 56, 32, 8, bot); }
  if (o.bottom === 'bikini') { for (const reg of [TF, TB]) rect(reg, 0, 56, 64, 8, o.botCol); rect(T.side, 0, 58, 32, 6, o.botCol); }
  if (kind === 'dress' || kind === 'swim') { /* (the dress/swimsuit covers the hips) */ }
  grain(TF, 0.06); grain(TB, 0.06);

  // --- arms: sleeves, skin, hands ---
  const sleeves = o.sleeves || (kind === 'tank' || kind === 'bikini' || kind === 'swim' || kind === 'shirtless' || kind === 'dress' || kind === 'hivis' && o.under === 'tank' ? 'none' : kind === 'suit' || kind === 'blazer' || kind === 'swat' || kind === 'tracksuit' || kind === 'longtee' || kind === 'jacket' ? 'long' : 'short');
  const sleeveCol = kind === 'hivis' || kind === 'overalls' ? top : kind === 'jacket' ? top : top;
  for (const k of ['front', 'side', 'back']) {
    const a = A[k];
    fill(a, skin);
    if (sleeves === 'short') rect(a, 0, 0, 32, 22, sleeveCol);
    else if (sleeves === 'long') { rect(a, 0, 0, 32, 54, sleeveCol); if (kind === 'suit' || kind === 'blazer') rect(a, 0, 50, 32, 4, o.shirtCol || '#f4f4f0'); }
    else if (sleeves === 'elbow') rect(a, 0, 0, 32, 34, sleeveCol);
    if (o.gloves) rect(a, 0, 52, 32, 12, o.gloves);
    if (o.watch && k !== 'back') rect(a, 0, 48, 32, 3, o.watch);
    if (kind === 'tracksuit') { rect(a, 12, 0, 3, 52, o.topCol2 || '#fff'); rect(a, 18, 0, 3, 52, o.topCol2 || '#fff'); }
    if (kind === 'hawaiian' && sleeves === 'short') clip([a[0], a[1], 32, 22], () => { for (let q = 0; q < 4; q++) ell(a, r() * 32, r() * 22, 3, 3, o.topCol2 || '#fff'); });
    if (o.tattoo && sleeves !== 'long' && k !== 'back') { g.strokeStyle = 'rgba(20,30,60,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox + a[0] + 16, oy + a[1] + 34, 6, 0, 5); g.stroke(); }
  }
  fill(A.top, sleeves === 'none' ? skin : sleeveCol);
  fill(A.bottom, o.gloves || skin);
  // dark shading near the hand (reads as a fist)
  for (const k of ['front', 'side', 'back']) rect(A[k], 0, 61, 32, 3, 'rgba(0,0,0,0.12)');

  // --- legs: trousers, shorts, skirts, shoes ---
  const bk = o.bottom || 'jeans';
  for (const k of ['front', 'side', 'back']) {
    const l = L[k];
    fill(l, skin);
    let cover = 64;
    if (bk === 'shorts' || bk === 'boardshorts') cover = bk === 'boardshorts' ? 32 : 26;
    else if (bk === 'skirt') cover = 24;
    else if (bk === 'trunks' || bk === 'bikini') cover = bk === 'trunks' ? 10 : 5;
    else if (bk === 'capri') cover = 44;
    const legCol = kind === 'dress' ? top : kind === 'swim' ? top : bot;
    if (kind === 'dress') cover = o.dressLen ?? 30;
    if (kind === 'swim') cover = 4;
    rect(l, 0, 0, 32, cover, legCol);
    if (kind === 'dress' && o.pattern === 'sequin') for (let q = 0; q < 14; q++) ell(l, r() * 32, r() * cover, 1.3, 1.3, '#ffffff');
    if (kind === 'dress' && o.pattern === 'floral') clip([l[0], l[1], 32, cover], () => { for (let q = 0; q < 5; q++) ell(l, r() * 32, r() * cover, 3, 3, o.topCol2 || '#fff'); });
    if (bk === 'jeans' && k === 'front') { rect(l, 0, 0, 32, 64, 'rgba(255,255,255,0.0)'); grain(l, 0.18); }
    if (bk === 'boardshorts' && o.botCol2) { rect(l, 0, 14, 32, 4, o.botCol2); rect(l, 0, 22, 32, 3, o.botCol2); }
    if (bk === 'cargo' && k === 'side') rect(l, 6, 24, 20, 14, shade(bot, 0.85));
    if ((bk === 'trousers' || bk === 'suit') && k === 'front') rect(l, 15, 0, 2, 56, shade(bot, 0.8));
    if (o.stripe && k === 'side') rect(l, 13, 0, 6, cover, o.stripe);
    if (bk === 'swat' || bk === 'camo') { /* plain */ }
    // socks (tourists wear them with sandals), shoes
    if (o.socks) rect(l, 0, 44, 32, 12, o.socks);
    if (o.feet === 'bare') { /* skin */ } else if (o.feet === 'sandals') { rect(l, 0, 60, 32, 4, shoes); rect(l, 12, 54, 8, 6, shoes); }
    else if (o.feet === 'heels') { rect(l, 0, 58, 32, 6, shoes); }
    else rect(l, 0, 54, 32, 10, shoes);
    if (o.feet === 'boots') rect(l, 0, 46, 32, 18, shoes);
    if (o.feet === 'sneakers' && k === 'side') { rect(l, 0, 60, 32, 4, '#f0f0f0'); rect(l, 8, 55, 14, 3, o.shoeAccent || '#e03a3a'); }
  }
  const legTop = kind === 'dress' || kind === 'swim' ? top : bk === 'bikini' ? o.botCol : bot;
  fill(L.top, legTop);
  fill(L.bottom, o.feet === 'bare' ? skin : shoes);
  grain(L.front, 0.08); grain(L.side, 0.06);
  // blood (a few cells are painted bloody for corpses on the street? no: the shader adds blood per person)
}

// ---- the catalogue ----------------------------------------------------------------------------------------------------
function catalogue() {
  const r = rng(1984);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const chance = (p) => r() < p;
  const out = [];
  const add = (cat, sets, o) => out.push({ cat, sets, ...o });
  const skinAny = () => pick(SKIN);
  const skinLight = () => pick(SKIN.slice(0, 5));
  const skinLatin = () => pick(SKIN.slice(2, 7));
  const skinDark = () => pick(SKIN.slice(6));
  const hairM = () => pick([HAIR.black, HAIR.dark, HAIR.brown, HAIR.black, HAIR.brown, HAIR.blonde, HAIR.auburn]);
  const hairF = () => pick([HAIR.black, HAIR.dark, HAIR.brown, HAIR.blonde, HAIR.blonde, HAIR.auburn, HAIR.plat, HAIR.red]);
  const PASTEL = ['#7fd1d6', '#f2b6c6', '#f4e04d', '#b8e6a8', '#c8b6f2', '#ffc896', '#a8d8ff'];
  const BRIGHT = ['#ff2a6d', '#05d9e8', '#ff9f1c', '#2ec4b6', '#e71d36', '#7b2cbf', '#f4d35e', '#3a86ff', '#ff5d8f'];
  const DARK = ['#1e2230', '#2a2a2a', '#3a3f4a', '#2a3550', '#4a3a2a'];
  const SHORTS = ['#d8c8a0', '#3a5a8a', '#6a7a4a', '#e8e0d0', '#2a4a7a', '#c86a3a', '#5a5a62'];
  const JEANS = ['#2a3d66', '#344a78', '#24324f', '#5a6a8a', '#1e1e24'];

  // beach: Hawaiian shirts, tank tops, board shorts, bikinis, one-pieces, sun hats
  for (let k = 0; k < 4; k++) add('beach', ['beach', 'street', 'tourist'], { gender: 'm', skin: skinAny(), hair: hairM(), face: pick(['smile', 'chill', 'grin']), top: 'hawaiian', topCol: ['#1c6ab8', '#e8402a', '#2a9a7a', '#f2a81e'][k], topCol2: ['#ffffff', '#ffe08a', '#ffd0e0', '#ffffff'][k], topCol3: ['#0e4a8a', '#2a7a3a', '#10604a', '#2a7a3a'][k], bottom: 'shorts', botCol: pick(SHORTS), feet: 'sandals', shoes: '#4a3020', hats: [0, HAT.glasses, HAT.cap | HAT.glasses, HAT.fedora], hatCol: pick(['#e8dcb0', '#f4f0e0', '#1c6ab8']), hatPattern: 'straw', items: ['drink', 'phone', 'none', 'none'] });
  for (let k = 0; k < 3; k++) add('beach', ['beach', 'street', 'jogger'], { gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: pick(['short', 'buzz', 'messy']), face: pick(['smile', 'chill', 'grin']), top: 'tank', topCol: pick(['#ffffff', '#f2b6c6', '#05d9e8', '#f4e04d', '#1e1e24']), bottom: 'boardshorts', botCol: pick(BRIGHT), botCol2: '#ffffff', feet: 'sandals', shoes: '#1e1e1e', hats: [0, HAT.glasses, HAT.capback], hatCol: pick(BRIGHT), tattoo: chance(0.4), items: ['surfboard', 'none', 'drink'] });
  for (let k = 0; k < 3; k++) add('beach', ['beach'], { gender: 'm', skin: skinAny(), hair: hairM(), face: pick(['smile', 'chill']), top: 'shirtless', chest: chance(0.4), bottom: 'trunks', botCol: pick(BRIGHT), feet: 'bare', hats: [0, HAT.glasses, HAT.glasses], tattoo: chance(0.5), items: ['surfboard', 'none', 'none'] });
  for (let k = 0; k < 5; k++) add('beach', ['beach'], { gender: 'f', skin: skinAny(), hair: hairF(), hairStyle: 'long', face: pick(['lips', 'smile', 'lips']), lipCol: pick(['#c0283a', '#e0508a', '#a82a2a']), top: 'bikini', topCol: pick(BRIGHT), topCol2: chance(0.5) ? '#ffffff' : null, bottom: 'bikini', botCol: null, feet: 'bare', hats: [HAT.longhair, HAT.longhair | HAT.glasses, HAT.longhair | HAT.sunhat, HAT.longhair | HAT.sunhat | HAT.glasses], hatCol: pick(['#f0e2b8', '#ffffff', '#f2b6c6']), hatCol2: pick(BRIGHT), hatPattern: 'straw', items: ['none', 'drink', 'phone'] });
  for (const o of out) if (o.top === 'bikini') o.botCol = o.topCol;
  for (let k = 0; k < 2; k++) add('beach', ['beach'], { gender: 'f', skin: skinAny(), hair: hairF(), hairStyle: 'bun', face: 'lips', lipCol: '#c84a5a', top: 'swim', topCol: pick(['#1a1a1a', '#e8402a', '#2a6ab8']), topCol2: chance(0.5) ? '#ffffff' : null, feet: 'bare', hats: [HAT.bun, HAT.bun | HAT.glasses, HAT.sunhat | HAT.glasses], hatCol: '#f4e8c8', hatCol2: '#1a1a1a', hatPattern: 'straw', items: ['none'] });
  // tourists: loud shirts, khaki shorts, socks and sandals, cameras, sunburn, bucket hats
  for (let k = 0; k < 6; k++) {
    const f = k % 3 === 2;
    add('tourist', ['tourist', 'street', 'beach'], { gender: f ? 'f' : 'm', skin: skinLight(), sunburn: chance(0.6), hair: f ? hairF() : pick([HAIR.grey, HAIR.brown, HAIR.blonde, HAIR.white]), hairStyle: f ? 'long' : pick(['short', 'bald', 'short']), face: f ? 'lips' : pick(['smile', 'grin', 'o']), top: f ? pick(['tee', 'hawaiian']) : pick(['hawaiian', 'tee', 'polo']), topCol: pick([...PASTEL, '#e8402a', '#ffffff']), topCol2: '#ffffff', logo: pick(['palm', 'sun', 'text', null]), text: pick(['I♥VC', 'VICE', 'MIAMI']), logoCol: pick(['#e02a5a', '#1c6ab8', '#ff7a2a']), bottom: f ? pick(['shorts', 'skirt', 'capri']) : 'shorts', botCol: pick(['#d8c8a0', '#c8b890', '#e8e0d0', '#6a7a4a']), socks: f ? null : '#f4f4f4', feet: f ? 'sandals' : 'sandals', shoes: '#5a4030', camera: chance(0.6), backpack: chance(0.3) ? pick(['#2a4a7a', '#7a2a2a']) : null, hats: f ? [HAT.longhair | HAT.sunhat, HAT.longhair | HAT.glasses] : [HAT.bucket, HAT.cap, HAT.bucket | HAT.glasses, 0], hatCol: pick(['#e8dcb0', '#ffffff', '#3a6a3a', '#1c6ab8']), hatPattern: chance(0.3) ? 'floral' : null, items: ['shopbag', 'camera', 'phone', 'none'] });
  }
  // business: suits (navy, grey, black, the pastel Miami suit over a tee), skirt suits, briefcases
  const suits = [['#1e2a44', '#9a1a2a'], ['#4a4c52', '#1a3a7a'], ['#16161a', '#6a1a1a'], ['#d8d2c0', null], ['#f2b6c6', null], ['#2a3a2a', '#c8a030']];
  for (let k = 0; k < 6; k++) { const [c, tie] = suits[k]; const pastel = !tie; add('business', ['business', 'street'], { gender: 'm', skin: skinAny(), hair: pick([HAIR.black, HAIR.dark, HAIR.grey, HAIR.brown]), hairStyle: pick(['short', 'short', 'buzz']), face: pick(['stern', 'smile', 'chill']), top: 'suit', topCol: c, shirtCol: pastel ? pick(['#7fd1d6', '#ffffff', '#f4e04d']) : pick(['#f4f4f0', '#dce8f4', '#f0e8f4']), tie, bottom: 'trousers', botCol: c, feet: pastel ? 'shoes' : 'shoes', shoes: pastel ? '#e8e0d0' : '#141210', socks: null, pocketSq: chance(0.4) ? '#e8402a' : null, watch: '#d8c060', hats: [0, 0, HAT.glasses], items: ['briefcase', 'phone', 'briefcase', 'none'] }); }
  for (let k = 0; k < 2; k++) add('business', ['business', 'street'], { gender: 'f', skin: skinAny(), hair: hairF(), hairStyle: pick(['long', 'bun']), face: 'lips', lipCol: '#a82a3a', top: 'blazer', topCol: ['#2a2a34', '#c82a3a'][k], shirtCol: '#f4f4f0', bottom: 'skirt', botCol: ['#2a2a34', '#2a2a2a'][k], feet: 'heels', shoes: '#141210', hats: [HAT.longhair, HAT.bun], items: ['briefcase', 'phone'] });
  // joggers and gym people
  for (let k = 0; k < 4; k++) { const f = k % 2 === 1; add('jogger', ['jogger', 'beach', 'street'], { gender: f ? 'f' : 'm', skin: skinAny(), hair: f ? hairF() : hairM(), hairStyle: f ? 'bun' : 'buzz', face: f ? 'lips' : 'chill', top: f ? 'tank' : pick(['tank', 'tee']), topCol: pick(['#ff2a6d', '#b8ff3d', '#05d9e8', '#f4f4f4', '#ff9f1c']), logo: 'stripe', logoCol: '#1e1e24', bottom: f ? 'shorts' : 'shorts', botCol: pick(['#1e1e24', '#2a3a6a', '#e8e8e8']), feet: 'sneakers', shoes: '#f0f0f0', shoeAccent: pick(BRIGHT), socks: '#ffffff', hats: f ? [HAT.bun, HAT.bun | HAT.glasses] : [0, HAT.cap, HAT.glasses], hatCol: pick(BRIGHT), watch: '#1e1e1e', items: ['none', 'none', 'phone'] }); }
  // old Cuban men: guayaberas, straw fedoras, white moustaches
  for (let k = 0; k < 4; k++) add('old', ['old', 'street'], { gender: 'm', skin: skinLatin(), hair: pick([HAIR.white, HAIR.grey]), hairStyle: pick(['short', 'bald']), face: 'old', moustache: chance(0.7), beardCol: HAIR.white, top: 'guayabera', topCol: ['#f4f0e2', '#e8e2c8', '#cfe2f0', '#f2e8f0'][k], bottom: 'trousers', botCol: pick(['#2a2a30', '#5a4a3a', '#e0d8c0', '#3a3f4a']), feet: 'shoes', shoes: pick(['#3a2418', '#f0ece0']), hats: [HAT.fedora, HAT.fedora, HAT.fedora | HAT.glasses, 0], hatCol: '#e8d8a0', hatCol2: '#2a1a14', hatPattern: 'straw', items: ['cigar', 'none', 'newspaper'] });
  // Caribbean / Haitian colours: kente-like prints, bright shirts, headwraps
  for (let k = 0; k < 4; k++) { const f = k >= 2; add('caribbean', ['caribbean', 'street'], { gender: f ? 'f' : 'm', skin: skinDark(), hair: HAIR.black, hairStyle: f ? 'short' : pick(['buzz', 'short']), face: f ? 'lips' : pick(['smile', 'grin']), lipCol: '#8a2a2a', top: f ? 'dress' : pick(['tee', 'hawaiian']), straps: true, dressLen: 44, pattern: k % 2 ? 'kente' : 'floral', topCol: pick(['#e8b81c', '#1c8a3a', '#c8281e', '#1c4aa8']), topCol2: '#ffd23a', topCol3: '#1c6a2a', bottom: f ? 'skirt' : pick(['jeans', 'shorts']), botCol: pick(JEANS), feet: f ? 'sandals' : 'sneakers', shoes: '#2a1e18', hats: f ? [HAT.headwrap, HAT.headwrap] : [0, HAT.cap, HAT.beanie], hatCol: pick(['#e8b81c', '#c8281e', '#1c8a3a']), hatCol2: '#1c4aa8', hatPattern: 'floral', items: ['none', 'shopbag', 'phone'] }); }
  // club-goers (nights on Ocean Drive): sequins, silk shirts, gold chains
  for (let k = 0; k < 3; k++) add('club', ['club'], { gender: 'f', skin: skinAny(), hair: pick([HAIR.black, HAIR.blonde, HAIR.plat, HAIR.pink, HAIR.dark]), hairStyle: 'long', face: 'lips', lipCol: pick(['#e0205a', '#c0283a', '#ff3a8a']), blush: true, top: 'dress', topCol: ['#e0e0f0', '#ff2a6d', '#05d9e8'][k], pattern: 'sequin', dressLen: 22, straps: chance(0.5), feet: 'heels', shoes: pick(['#141210', '#e8c040', '#ff2a6d']), hats: [HAT.longhair, HAT.longhair], items: ['drink', 'phone', 'none'] });
  for (let k = 0; k < 3; k++) add('club', ['club', 'street'], { gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: pick(['short', 'buzz']), face: pick(['chill', 'grin']), top: pick(['tee', 'polo']), logo: null, topCol: pick(['#f4f4f4', '#ff2a6d', '#7b2cbf', '#1e1e24', '#05d9e8']), pattern: chance(0.4) ? 'vstripes' : null, topCol2: '#ffffff', bottom: 'trousers', botCol: pick(['#16161a', '#f4f0e8', '#2a2a34']), feet: 'shoes', shoes: pick(['#f4f0e8', '#141210']), chain: 1 + (k % 2), watch: '#d8c060', hats: [0, HAT.glasses], items: ['drink', 'none'] });
  // casual: tees, jeans, polos, sundresses, students with backpacks
  for (let k = 0; k < 9; k++) {
    const f = k >= 5;
    add('casual', ['street', 'beach'], {
      gender: f ? 'f' : 'm', skin: skinAny(), hair: f ? hairF() : hairM(), hairStyle: f ? pick(['long', 'bun', 'short']) : pick(['short', 'buzz', 'messy', 'bald', 'afro']), face: f ? pick(['lips', 'smile']) : pick(['smile', 'chill', 'grin', 'stern']), lipCol: '#b03a4a', stubble: !f && chance(0.3),
      top: f ? pick(['dress', 'tee', 'tank']) : pick(['tee', 'polo', 'tee', 'jersey', 'longtee']), pattern: f && chance(0.5) ? 'floral' : !f && chance(0.25) ? pick(['stripes', 'check']) : null, straps: true, dressLen: 40,
      topCol: pick([...PASTEL, ...BRIGHT, '#ffffff', '#1e1e24', '#5a6a3a']), topCol2: pick(['#ffffff', '#1e1e24', '#f4e04d']), logo: pick(['palm', 'sun', 'text', 'heart', null, null]), text: pick(['VICE', '305', 'SURF', 'PLAY', '84']), logoCol: pick(['#ffffff', '#1e1e24', '#e8402a']),
      bottom: f ? pick(['jeans', 'shorts', 'skirt', 'capri']) : pick(['jeans', 'jeans', 'shorts', 'cargo']), botCol: pick([...JEANS, ...SHORTS]), feet: pick(['sneakers', 'shoes', 'sandals']), shoes: pick(['#f0f0f0', '#2a2420', '#1e1e24', '#8a5a3a']), shoeAccent: pick(BRIGHT),
      backpack: chance(0.2) ? pick(['#2a4a7a', '#7a2a2a', '#1e1e24']) : null,
      hats: f ? [HAT.longhair, HAT.bun, HAT.longhair | HAT.glasses, 0] : [0, 0, HAT.cap, HAT.capback, HAT.glasses, HAT.beanie], hatCol: pick(BRIGHT), hatCol2: '#1e1e24',
      items: ['phone', 'none', 'none', 'shopbag', 'drink'],
    });
  }
  // construction workers
  for (let k = 0; k < 3; k++) add('worker', ['worker', 'street'], { gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: 'short', face: pick(['stern', 'chill']), stubble: true, top: 'hivis', topCol: pick(['#f4f4f4', '#5a6a8a', '#8a8a8a']), vestCol: ['#ff8a1a', '#d8f020', '#ff8a1a'][k], bottom: 'jeans', botCol: pick(JEANS), feet: 'boots', shoes: '#5a3a1e', gloves: chance(0.5) ? '#c8a878' : null, hats: [HAT.hardhat, HAT.hardhat | HAT.glasses], hatCol: pick(['#f4d020', '#f4f4f4', '#ff8a1a']), items: ['none', 'cup'] });
  // VCPD
  for (let k = 0; k < 3; k++) add('cop', ['cop'], { gender: k === 2 ? 'f' : 'm', skin: pick(SKIN.slice(1, 9)), hair: k === 2 ? HAIR.dark : hairM(), hairStyle: k === 2 ? 'bun' : 'buzz', face: k === 2 ? 'lips' : 'stern', moustache: k === 1, top: 'police', topCol: '#8ab4e0', bottom: 'trousers', botCol: '#1a2240', stripe: '#3a4a7a', beltCol: '#141414', buckle: '#d8d8d8', feet: 'shoes', shoes: '#0e0e10', hats: [HAT.police | HAT.glasses, HAT.police, k === 2 ? HAT.police | HAT.bun : HAT.police | HAT.glasses], hatCol: '#1a2240', hatCol2: '#0e0e10', items: ['none'] });
  // SWAT
  for (let k = 0; k < 2; k++) add('swat', ['swat'], { gender: 'm', skin: pick(SKIN), hair: HAIR.black, face: 'stern', mask: '#16181c', maskFull: k === 1, top: 'swat', topCol: '#22262e', vestCol: '#16181c', bottom: 'cargo', botCol: '#22262e', feet: 'boots', shoes: '#0e0e10', gloves: '#16181c', hats: [HAT.helmet | (k === 0 ? HAT.glasses : 0)], hatCol: '#16181c', hatCol2: '#22262e', lens: '#1a1a1a', items: ['none'] });
  // the gangs: Kings (purple and gold), Cubans (white and red), Haitians (green and black), Dockers (denim and orange)
  add('gang', ['gang:kings'], { gender: 'm', skin: skinDark(), hair: HAIR.black, hairStyle: 'buzz', face: 'mean', top: 'jersey', topCol: '#5a2a8a', topCol2: '#e8c040', text: '1', bottom: 'jeans', botCol: '#1e1e24', feet: 'sneakers', shoes: '#f0f0f0', shoeAccent: '#5a2a8a', chain: 2, hats: [HAT.bandana, HAT.capback, HAT.bandana | HAT.glasses], hatCol: '#5a2a8a', hatCol2: '#e8c040', bandanaArm: '#e8c040', items: ['none'] });
  add('gang', ['gang:kings'], { gender: 'm', skin: skinAny(), hair: HAIR.black, hairStyle: 'short', face: 'mean', top: 'tank', topCol: '#e8c040', bottom: 'cargo', botCol: '#5a2a8a', feet: 'sneakers', shoes: '#1e1e24', chain: 1, tattoo: true, hats: [HAT.cap, HAT.beanie, HAT.bandana], hatCol: '#5a2a8a', hatCol2: '#e8c040', items: ['none'] });
  add('gang', ['gang:cubans'], { gender: 'm', skin: skinLatin(), hair: HAIR.black, hairStyle: 'short', face: 'mean', moustache: true, top: 'tank', topCol: '#f4f4f0', bottom: 'trousers', botCol: '#2a2a30', feet: 'shoes', shoes: '#141210', chain: 2, tattoo: true, bandanaArm: '#c8201e', hats: [HAT.bandana, HAT.fedora, HAT.bandana | HAT.glasses], hatCol: '#c8201e', hatCol2: '#2a1a14', items: ['cigar', 'none'] });
  add('gang', ['gang:cubans'], { gender: 'm', skin: skinLatin(), hair: HAIR.dark, hairStyle: 'short', face: 'stern', top: 'hawaiian', topCol: '#c8201e', topCol2: '#f4f4f0', topCol3: '#7a1010', bottom: 'trousers', botCol: '#f4f0e8', feet: 'shoes', shoes: '#f4f0e8', chain: 1, hats: [HAT.fedora, HAT.glasses], hatCol: '#f4f0e8', hatCol2: '#c8201e', items: ['none'] });
  add('gang', ['gang:haitians'], { gender: 'm', skin: skinDark(), hair: HAIR.black, hairStyle: 'buzz', face: 'mean', top: 'tee', topCol: '#1c6a2a', logo: 'text', text: 'H', logoCol: '#f4d020', bottom: 'cargo', botCol: '#1e1e24', feet: 'boots', shoes: '#2a2018', bandanaArm: '#f4d020', hats: [HAT.bandana, HAT.beanie, HAT.cap], hatCol: '#1c6a2a', hatCol2: '#1e1e24', items: ['none'] });
  add('gang', ['gang:haitians'], { gender: 'm', skin: skinDark(), hair: HAIR.black, hairStyle: 'afro', face: 'stern', top: 'tank', topCol: '#1e1e24', bottom: 'cargo', botCol: '#2a5a2a', feet: 'boots', shoes: '#2a2018', chain: 1, hats: [HAT.afro, HAT.bandana | HAT.glasses], hatCol: '#1c6a2a', items: ['none'] });
  add('gang', ['gang:dockers'], { gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: 'short', face: 'stern', beard: chance(0.6), top: 'overalls', topCol: '#d86a20', botCol: '#2a4a78', feet: 'boots', shoes: '#3a2418', gloves: '#c8a878', hats: [HAT.beanie, HAT.hardhat, HAT.beanie], hatCol: '#d86a20', hatCol2: '#2a4a78', items: ['none'] });
  add('gang', ['gang:dockers'], { gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: 'buzz', face: 'mean', stubble: true, top: 'jacket', topCol: '#2a4a78', shirtCol: '#d86a20', bottom: 'jeans', botCol: '#24324f', feet: 'boots', shoes: '#3a2418', tattoo: true, hats: [HAT.beanie, HAT.cap], hatCol: '#d86a20', hatCol2: '#1e1e24', items: ['none'] });
  // faces from the missions
  add('mission', ['mission'], { name: 'boss', gender: 'm', skin: SKIN[3], hair: HAIR.black, hairStyle: 'short', face: 'stern', top: 'suit', topCol: '#f4f2ea', shirtCol: '#c8201e', tie: null, bottom: 'trousers', botCol: '#f4f2ea', feet: 'shoes', shoes: '#f4f2ea', chain: 1, watch: '#d8c060', hats: [HAT.glasses], lens: '#2a1a10', items: ['cigar'] });
  add('mission', ['mission'], { name: 'lawyer', gender: 'm', skin: SKIN[1], hair: HAIR.brown, hairStyle: 'messy', face: 'grin', top: 'suit', topCol: '#f2a6c6', shirtCol: '#ffffff', tie: '#7fd1d6', bottom: 'trousers', botCol: '#f2a6c6', feet: 'shoes', shoes: '#ffffff', hats: [0], items: ['briefcase'] });
  add('mission', ['mission'], { name: 'dealer', gender: 'm', skin: SKIN[5], hair: HAIR.black, hairStyle: 'long', face: 'chill', beard: true, top: 'blazer', topCol: '#e8e0c8', shirtCol: '#05d9e8', bottom: 'trousers', botCol: '#e8e0c8', feet: 'shoes', shoes: '#c8a878', chain: 2, hats: [HAT.longhair | HAT.glasses], lens: '#ff2a6d', items: ['none'] });
  add('mission', ['mission'], { name: 'biker', gender: 'm', skin: SKIN[2], hair: HAIR.grey, hairStyle: 'long', face: 'mean', beard: true, beardCol: HAIR.grey, top: 'jacket', topCol: '#16161a', shirtCol: '#5a5a62', logo: 'text', text: 'ANGELS', logoCol: '#c8201e', bottom: 'jeans', botCol: '#24324f', feet: 'boots', shoes: '#141210', tattoo: true, hats: [HAT.longhair | HAT.bandana | HAT.glasses], hatCol: '#16161a', items: ['none'] });
  // misc: paramedic, chef, postman, a classic noob
  add('casual', ['street'], { name: 'medic', gender: 'm', skin: skinAny(), hair: hairM(), hairStyle: 'short', face: 'smile', top: 'tee', topCol: '#f4f4f4', logo: 'text', text: '✚', logoCol: '#c8201e', bottom: 'trousers', botCol: '#2a3a5a', feet: 'shoes', shoes: '#141210', hats: [0], items: ['none'] });
  add('casual', ['street'], { name: 'noob', gender: 'm', skin: '#f5cd30', hair: null, hairStyle: 'bald', face: 'smile', top: 'tee', topCol: '#0d69ac', logo: null, sleeves: 'none', bottom: 'jeans', botCol: '#a4bd47', feet: 'bare', hats: [0], items: ['none'] });
  return out;
}

let atlas = null;
/** Paint every outfit (once) and make the texture. */
export function buildAtlas() {
  if (atlas) return atlas;
  const cat = catalogue();
  const c = document.createElement('canvas'); c.width = ATLAS; c.height = ATLAS;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, ATLAS, ATLAS);
  cat.forEach((o, i) => {
    if (i >= COLS * ROWS) return;
    paint(g, i, { seed: i * 131 + 7, ...o });
    const name = o.name || `${o.cat}${i}`;
    const rec = { name, cat: o.cat, gender: o.gender, hats: o.hats || [0], items: o.items || ['none'], skin: o.skin, sets: o.sets };
    OUTFITS.push(rec); OUTFIT_BY_NAME[name] = i;
    for (const s of o.sets) (SETS[s] ||= []).push(i);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.flipY = true;
  atlas = { canvas: c, g, tex: t };
  return atlas;
}

/** Pick an outfit from a set (rand: () => [0,1)). Returns the cell index. */
export function pickOutfit(set, rand = Math.random) {
  buildAtlas();
  const a = SETS[set] || SETS.street;
  return a[Math.floor(rand() * a.length)];
}
