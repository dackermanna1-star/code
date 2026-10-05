// Textures and materials for the bank and the city (drawn on canvases).
import * as THREE from 'three';
import { canvas, noise, blotches, toTex } from '../warzone/map.js';
import { envMap } from './models.js';

function veins(x, w, h, n, color, width = 1.5) {
  x.strokeStyle = color; x.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let px = Math.random() * w, py = Math.random() * h;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 10; k++) { px += (Math.random() - 0.3) * 40; py += (Math.random() - 0.5) * 30; x.lineTo(px, py); }
    x.stroke();
  }
}
function text(x, str, px, py, font, color, align = 'center') { x.font = font; x.fillStyle = color; x.textAlign = align; x.fillText(str, px, py); }

const T = {};
export function textures() {
  if (T.marble) return T;
  T.marble = toTex(canvas(512, 512, (x, w, h) => {
    // a checkerboard of white and grey marble tiles
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      x.fillStyle = (r + c) % 2 ? '#d8d6d2' : '#f2f0ec'; x.fillRect(c * 256, r * 256, 256, 256);
    }
    veins(x, w, h, 26, 'rgba(120,118,115,0.25)', 1.2);
    veins(x, w, h, 10, 'rgba(90,90,95,0.18)', 3);
    noise(x, w, h, 10);
    x.strokeStyle = 'rgba(70,65,60,0.5)'; x.lineWidth = 2; x.strokeRect(1, 1, 255, 255); x.strokeRect(257, 257, 254, 254); x.strokeRect(257, 1, 254, 255); x.strokeRect(1, 257, 255, 254);
  }));
  T.wallMarble = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#e8dcc4'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 30, 'rgba(210,190,160,0.4)', 30, 90);
    veins(x, w, h, 16, 'rgba(160,130,90,0.25)', 1.2);
    noise(x, w, h, 8);
    x.strokeStyle = 'rgba(150,130,100,0.45)'; x.lineWidth = 2;
    for (let i = 0; i <= h; i += 128) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    for (let r = 0; r < 4; r++) for (let i = (r % 2) * 128; i <= w; i += 256) { x.beginPath(); x.moveTo(i, r * 128); x.lineTo(i, r * 128 + 128); x.stroke(); }
  }));
  T.plaster = toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = '#e6e0d4'; x.fillRect(0, 0, w, h); noise(x, w, h, 10); blotches(x, w, h, 10, 'rgba(200,190,170,0.25)', 20, 60); }));
  T.wood = toTex(canvas(256, 512, (x, w, h) => {
    x.fillStyle = '#5a3420'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${30 + Math.random() * 30},${14 + Math.random() * 14},6,0.35)`; x.lineWidth = 1 + Math.random() * 2; const px = Math.random() * w; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 10, h * 0.3, px - 10, h * 0.6, px + 4, h); x.stroke(); }
    for (let i = 0; i < w; i += 64) { x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(i, 0, 3, h); x.fillStyle = 'rgba(255,220,180,0.08)'; x.fillRect(i + 3, 0, 2, h); }
    noise(x, w, h, 12);
  }));
  T.carpet = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#6a1a22'; x.fillRect(0, 0, w, h); noise(x, w, h, 26, 1.4);
    x.strokeStyle = 'rgba(200,160,80,0.35)'; x.lineWidth = 3;
    for (let i = 0; i < w; i += 64) for (let j = 0; j < h; j += 64) { x.beginPath(); x.moveTo(i + 32, j + 8); x.lineTo(i + 56, j + 32); x.lineTo(i + 32, j + 56); x.lineTo(i + 8, j + 32); x.closePath(); x.stroke(); }
  }));
  T.carpetBlue = toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = '#2e3a4e'; x.fillRect(0, 0, w, h); noise(x, w, h, 26, 1.2); for (let i = 0; i < w; i += 32) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(i, 0, 16, h); } }));
  T.lino = toTex(canvas(256, 256, (x, w, h) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { x.fillStyle = (r + c) % 2 ? '#b8b6ae' : '#c8c6be'; x.fillRect(c * 64, r * 64, 64, 64); }
    noise(x, w, h, 18); for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(60,60,60,0.3)'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.strokeStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i <= w; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  }));
  T.concrete = toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = '#9c9a96'; x.fillRect(0, 0, w, h); noise(x, w, h, 28); blotches(x, w, h, 16, 'rgba(70,68,64,0.2)', 10, 40); }));
  T.polished = toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = '#8a8c8e'; x.fillRect(0, 0, w, h); noise(x, w, h, 16); blotches(x, w, h, 20, 'rgba(180,180,185,0.2)', 20, 60); x.strokeStyle = 'rgba(30,30,30,0.3)'; x.strokeRect(0, 0, w, h); }));
  T.steel = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#8c9096'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; x.fillRect(0, i, w, 1); }
    x.strokeStyle = 'rgba(30,32,36,0.6)'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4);
    x.fillStyle = '#5a5e64'; for (const [px, py] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12], [w / 2, 12], [w / 2, h - 12]]) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
  }));
  T.limestone = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#d8ccb2'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      x.fillStyle = `rgb(${210 + Math.random() * 18},${198 + Math.random() * 16},${172 + Math.random() * 14})`;
      x.fillRect(c * 128 + (r % 2) * 64 + 2, r * 64 + 2, 124, 60);
    }
    noise(x, w, h, 16); blotches(x, w, h, 18, 'rgba(120,110,90,0.18)', 20, 60);
  }));
  T.granite = toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = '#6e6c6a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const v = 40 + Math.random() * 140; x.fillStyle = `rgb(${v},${v},${v * 0.98})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }));
  T.asphalt = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#3a3a3c'; x.fillRect(0, 0, w, h); noise(x, w, h, 34);
    blotches(x, w, h, 14, 'rgba(20,20,22,0.35)', 20, 70); blotches(x, w, h, 10, 'rgba(110,110,110,0.15)', 20, 70);
    x.strokeStyle = 'rgba(15,15,15,0.6)'; x.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; x.lineTo(px, py); } x.stroke(); }
  }));
  T.sidewalk = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#b4b0a8'; x.fillRect(0, 0, w, h); noise(x, w, h, 20); blotches(x, w, h, 10, 'rgba(90,85,80,0.18)', 10, 40);
    x.strokeStyle = 'rgba(60,58,55,0.55)'; x.lineWidth = 2; for (let i = 0; i <= w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  }));
  T.grass = toTex(canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#5a7a3a'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 40, 'rgba(110,130,60,0.4)', 30, 90); blotches(x, w, h, 30, 'rgba(60,80,30,0.4)', 20, 80); blotches(x, w, h, 14, 'rgba(140,120,80,0.35)', 20, 60);
    noise(x, w, h, 30);
  }));
  T.ceiling = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#e8e6e0'; x.fillRect(0, 0, w, h); noise(x, w, h, 10);
    x.strokeStyle = '#b8b4ac'; x.lineWidth = 3; for (let i = 0; i <= w; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  }));
  T.coffer = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(160,130,90,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.0)');
    x.fillStyle = g; x.fillRect(24, 24, w - 48, h - 48);
    x.strokeStyle = '#c8a860'; x.lineWidth = 6; x.strokeRect(24, 24, w - 48, h - 48);
    x.fillStyle = '#d8c090'; x.beginPath(); x.arc(w / 2, h / 2, 16, 0, 7); x.fill();
  }));
  T.brick = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#8a8478'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) { x.fillStyle = `rgb(${130 + Math.random() * 40},${52 + Math.random() * 20},${40 + Math.random() * 14})`; x.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); }
    noise(x, w, h, 18);
  }));
  T.deposit = toTex(canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#6a5a3a'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const px = c * 64 + 3, py = r * 64 + 3;
      const g = x.createLinearGradient(px, py, px + 58, py + 58); g.addColorStop(0, '#e2c27a'); g.addColorStop(1, '#a8823a');
      x.fillStyle = g; x.fillRect(px, py, 58, 58);
      x.fillStyle = '#3a2a14'; x.beginPath(); x.arc(px + 44, py + 29, 4, 0, 7); x.fill(); x.fillRect(px + 43, py + 29, 2, 8);
      text(x, String(100 + r * 4 + c + Math.floor(Math.random() * 3) * 16), px + 18, py + 34, 'bold 13px Arial', '#4a3414');
    }
  }));
  T.screens = [0, 1, 2, 3, 4, 5].map((i) => toTex(canvas(128, 96, (x, w, h) => {
    x.fillStyle = '#0a1410'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#34443e'); g.addColorStop(1, '#1a2420'); x.fillStyle = g; x.fillRect(4, 4, w - 8, h - 8);
    x.fillStyle = 'rgba(160,200,170,0.25)'; x.fillRect(10 + i * 7, 30, 40, 40); x.fillRect(70, 20 + i * 4, 20, 50);
    for (let k = 0; k < h; k += 3) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, k, w, 1); }
    text(x, 'CAM 0' + (i + 1), 8, 16, 'bold 11px monospace', '#e0ffe0', 'left');
    text(x, '● REC', w - 8, 16, 'bold 10px monospace', '#ff4040', 'right');
  })));
  T.vaultDoor = toTex(canvas(512, 512, (x, w, h) => {
    // brushed steel turned in circles, like a real vault door
    const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, '#c8ccd0'); g.addColorStop(0.6, '#a8aeb4'); g.addColorStop(1, '#8a9096');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let r = 4; r < w / 2; r += 2) { x.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`; x.lineWidth = 1.5; x.beginPath(); x.arc(w / 2, h / 2, r, 0, 7); x.stroke(); }
    x.strokeStyle = 'rgba(40,44,50,0.7)'; x.lineWidth = 6; for (const r of [120, 190, 246]) { x.beginPath(); x.arc(w / 2, h / 2, r, 0, 7); x.stroke(); }
    x.fillStyle = '#4a4e54'; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; x.beginPath(); x.arc(w / 2 + Math.cos(a) * 220, h / 2 + Math.sin(a) * 220, 7, 0, 7); x.fill(); }
    x.font = 'bold 22px Georgia'; x.fillStyle = 'rgba(40,40,40,0.75)'; x.textAlign = 'center'; x.fillText('ROBLOXIA SAFE CO.', w / 2, h / 2 + 160); x.fillText('TIME LOCK', w / 2, h / 2 - 150);
  }));
  T.money = null;
  T.sign = (str, sub, color = '#d8b048', bg = '#1c1a16', w = 1024, h = 128) => toTex(canvas(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    text(x, str, w / 2, sub ? h * 0.58 : h * 0.68, `bold ${Math.round(h * (sub ? 0.46 : 0.56))}px Georgia, serif`, color);
    if (sub) text(x, sub, w / 2, h * 0.88, `${Math.round(h * 0.18)}px Georgia, serif`, color);
  }));
  // the city: four facade styles (one floor = 12 studs, one window bay = 8 studs)
  const facade = (bg, draw) => toTex(canvas(256, 256, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); draw(x, w, h); noise(x, w, h, 10); }));
  T.facades = [
    facade('#4a5868', (x, w, h) => { // glass curtain wall
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const g = x.createLinearGradient(c * 128, r * 128, c * 128 + 128, r * 128 + 128); g.addColorStop(0, '#7a9ab8'); g.addColorStop(1, '#34485c');
        x.fillStyle = g; x.fillRect(c * 128 + 4, r * 128 + 4, 120, 120);
      }
      x.fillStyle = '#2a323a'; for (let i = 0; i <= w; i += 128) { x.fillRect(i - 3, 0, 6, h); x.fillRect(0, i - 3, w, 6); }
    }),
    facade('#bcb4a4', (x, w) => { // concrete office block, ribbon windows
      for (let r = 0; r < 2; r++) { const g = x.createLinearGradient(0, r * 128 + 30, 0, r * 128 + 100); g.addColorStop(0, '#5a6a78'); g.addColorStop(1, '#2a3440'); x.fillStyle = g; x.fillRect(0, r * 128 + 34, w, 64); x.fillStyle = '#9a9488'; for (let i = 0; i < w; i += 64) x.fillRect(i, r * 128 + 34, 4, 64); }
    }),
    facade('#8a4a34', (x, w) => { // brick with punched windows
      for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) { x.fillStyle = `rgb(${120 + Math.random() * 30},${58 + Math.random() * 16},${42 + Math.random() * 10})`; x.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); }
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { x.fillStyle = '#d8d0c0'; x.fillRect(c * 128 + 30, r * 128 + 22, 68, 90); const g = x.createLinearGradient(0, r * 128 + 26, 0, r * 128 + 108); g.addColorStop(0, '#4a5a6a'); g.addColorStop(1, '#1c242c'); x.fillStyle = g; x.fillRect(c * 128 + 35, r * 128 + 26, 58, 80); x.fillStyle = '#d8d0c0'; x.fillRect(c * 128 + 62, r * 128 + 26, 4, 80); }
      void w;
    }),
    facade('#d0c4a8', (x) => { // stone with tall windows
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { x.fillStyle = '#a89c80'; x.fillRect(c * 128 + 26, r * 128 + 16, 76, 104); const g = x.createLinearGradient(0, r * 128 + 20, 0, r * 128 + 116); g.addColorStop(0, '#6a7a88'); g.addColorStop(1, '#2a3038'); x.fillStyle = g; x.fillRect(c * 128 + 30, r * 128 + 20, 68, 96); }
    }),
  ];
  T.shopfront = toTex(canvas(256, 128, (x, w, h) => {
    x.fillStyle = '#2a2a2c'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 20, 0, h); g.addColorStop(0, '#8aa0b0'); g.addColorStop(1, '#2a3a44'); x.fillStyle = g; x.fillRect(8, 24, w - 16, h - 30);
    x.fillStyle = '#2a2a2c'; x.fillRect(w / 2 - 3, 24, 6, h - 30);
    noise(x, w, h, 10);
  }));
  T.ad = (title, sub, c1, c2) => toTex(canvas(512, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, w, h);
    text(x, title, w / 2, h * 0.5, 'bold 64px Arial', '#ffffff'); text(x, sub, w / 2, h * 0.78, 'bold 26px Arial', '#ffffffcc');
  }));
  return T;
}

const MAT = {};
export function materials(renderer) {
  if (MAT.marble && MAT.renderer === renderer) return MAT;
  MAT.renderer = renderer;
  const t = textures();
  const env = envMap(renderer);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  MAT.marble = std({ map: t.marble, roughness: 0.25, envMap: env, envMapIntensity: 0.35 });
  MAT.wallMarble = std({ map: t.wallMarble, roughness: 0.45, envMap: env, envMapIntensity: 0.2 });
  MAT.plaster = std({ map: t.plaster });
  MAT.paintGrey = std({ map: t.plaster, color: 0xc0c4c8 });
  MAT.wood = std({ map: t.wood, roughness: 0.55, envMap: env, envMapIntensity: 0.15 });
  MAT.carpet = std({ map: t.carpet, roughness: 1 });
  MAT.carpetBlue = std({ map: t.carpetBlue, roughness: 1 });
  MAT.lino = std({ map: t.lino, roughness: 0.5, envMap: env, envMapIntensity: 0.15 });
  MAT.concrete = std({ map: t.concrete });
  MAT.polished = std({ map: t.polished, roughness: 0.35, envMap: env, envMapIntensity: 0.3 });
  MAT.steel = std({ map: t.steel, roughness: 0.4, metalness: 0.45, envMap: env, envMapIntensity: 0.8 });
  MAT.vaultDoor = std({ map: t.vaultDoor, roughness: 0.28, metalness: 0.6, envMap: env, envMapIntensity: 1.1 });
  MAT.darkSteel = std({ color: 0x3a3e44, roughness: 0.4, metalness: 0.8, envMap: env });
  MAT.brass = std({ color: 0xc8a040, roughness: 0.25, metalness: 1, envMap: env });
  MAT.limestone = std({ map: t.limestone });
  MAT.granite = std({ map: t.granite, roughness: 0.5, envMap: env, envMapIntensity: 0.2 });
  MAT.asphalt = std({ map: t.asphalt, roughness: 0.95 });
  MAT.sidewalk = std({ map: t.sidewalk });
  MAT.grass = std({ map: t.grass, roughness: 1 });
  MAT.ceiling = std({ map: t.ceiling, side: THREE.DoubleSide });
  MAT.coffer = std({ map: t.coffer, side: THREE.DoubleSide });
  MAT.brick = std({ map: t.brick });
  MAT.deposit = std({ map: t.deposit, roughness: 0.35, metalness: 0.6, envMap: env });
  MAT.glass = std({ color: 0x9ab8c8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, envMap: env, envMapIntensity: 1.2, depthWrite: false });
  MAT.frosted = std({ color: 0xe8f0f4, roughness: 0.5, transparent: true, opacity: 0.72, depthWrite: false });
  MAT.darkGlass = std({ color: 0x1a2430, roughness: 0.08, metalness: 0.5, envMap: env, envMapIntensity: 1 });
  MAT.black = std({ color: 0x18181a, roughness: 0.5 });
  MAT.white = std({ color: 0xf0f0ec, roughness: 0.6 });
  MAT.red = std({ color: 0x9a1818, roughness: 0.7 });
  MAT.green = std({ color: 0x2a5a2a, roughness: 0.8 });
  MAT.leaf = std({ color: 0x3a6a28, roughness: 0.85, flatShading: true });
  MAT.bark = std({ color: 0x4a3626, roughness: 1 });
  MAT.pot = std({ color: 0x6a4a3a, roughness: 0.8 });
  MAT.leather = std({ color: 0x2a1a14, roughness: 0.45, envMap: env, envMapIntensity: 0.2 });
  MAT.fabric = std({ color: 0x2c3a4a, roughness: 1 });
  MAT.lamp = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2d8, emissiveIntensity: 1.4 });
  MAT.fluoro = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xeaf2ff, emissiveIntensity: 1.2 });
  MAT.exit = new THREE.MeshStandardMaterial({ color: 0x20a040, emissive: 0x30ff60, emissiveIntensity: 1.2 });
  MAT.yellowLine = std({ color: 0xe8c030, roughness: 0.8 });
  MAT.whiteLine = std({ color: 0xf0f0ea, roughness: 0.8 });
  MAT.hazard = std({ map: (() => { const tx = toTex(canvas(64, 64, (x) => { x.fillStyle = '#e8c020'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#1a1a1a'; for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); } })); return tx; })() });
  MAT.facades = t.facades.map((m) => std({ map: m, roughness: 0.6, envMap: env, envMapIntensity: 0.35 }));
  MAT.shopfront = std({ map: t.shopfront, roughness: 0.3, envMap: env, envMapIntensity: 0.6 });
  MAT.roof = std({ map: t.concrete, color: 0x8a8a88 });
  MAT.screens = t.screens.map((m) => new THREE.MeshStandardMaterial({ map: m, emissive: 0xffffff, emissiveMap: m, emissiveIntensity: 0.9 }));
  MAT.awnings = ['#a01818', '#1a4a8a', '#2a6a2a', '#c87818', '#5a2a6a'].map((c) => std({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  return MAT;
}
