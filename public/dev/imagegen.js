// Redraws the 2008 site images for this recreation (run tools/build-images.js).
// Each entry produces a canvas; 3D figures are rendered with the game engine.
import * as THREE from 'three';
import { CharacterModel } from '../js/engine/CharacterModel.js';
import { Part } from '../js/engine/Part.js';

const C = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const COMIC = "'Comic Sans MS','Comic Neue',cursive";

function roundRect(x, X, Y, W, H, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}

// ---------------------------------------------------------------- 3D figure renders
let renderer;
function render3d(build, w, h, camOpts = {}) {
  renderer ||= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef2ff, 0x8a8478, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-0.6, 1.1, -1); scene.add(sun);
  const obj = build(scene);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(camOpts.fov || 30, w / h, 0.1, 500);
  const dir = new THREE.Vector3(camOpts.side ?? -0.4, camOpts.up ?? 0.25, -1).normalize();
  const dist = Math.max(size.y / 2 / Math.tan((cam.fov * Math.PI) / 360), size.x / 2 / Math.tan((cam.fov * Math.PI) / 360) / cam.aspect) * (camOpts.pad || 1.15) + size.z;
  cam.position.copy(center).addScaledVector(dir, dist);
  if (camOpts.shift) cam.position.add(new THREE.Vector3(...camOpts.shift));
  cam.lookAt(center);
  renderer.render(scene, cam);
  const out = C(w, h);
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return out;
}

function figure(app) {
  return (scene) => { const m = new CharacterModel(app); scene.add(m.root); return m.root; };
}
// colours sampled from the archived NewFrontPageGuy.png
const BUILDERMAN = { colors: { head: 3, torso: 105, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 }, face: 'Smile', hats: ['BCHardHat'], shirt: null, pants: null, tshirt: { style: 'wrench' } };

// ---------------------------------------------------------------- the ROBLOX logo
function logo(w = 267, h = 70) {
  const c = C(w, h), x = c.getContext('2d');
  const letters = 'ROBLOX';
  const rots = [-0.04, 0.12, 0.02, -0.03, 0.06, -0.08];
  x.font = `900 ${h * 0.86}px 'Arial Black', Impact, sans-serif`;
  x.textBaseline = 'middle';
  let cx = 6;
  const widths = letters.split('').map((l) => x.measureText(l).width * 0.93);
  const scale = (w - 12) / widths.reduce((a, b) => a + b, 0);
  x.save(); x.scale(scale, 1);
  letters.split('').forEach((l, i) => {
    x.save();
    x.translate(cx / scale * scale / scale + widths[i] / 2, h / 2 + 3);
    x.rotate(rots[i]);
    x.lineJoin = 'round';
    x.lineWidth = 10; x.strokeStyle = '#e2231a'; x.strokeText(l, -widths[i] / 2, 0);
    x.lineWidth = 6; x.strokeStyle = '#ffffff'; x.strokeText(l, -widths[i] / 2, 0);
    x.fillStyle = '#e2231a'; x.fillText(l, -widths[i] / 2, 0);
    if (i === 1) { x.fillStyle = '#e2231a'; x.fillRect(-widths[i] / 2 + 6, -h * 0.47, widths[i] - 12, 5); }
    x.restore();
    cx += widths[i];
  });
  x.restore();
  return c;
}

// ---------------------------------------------------------------- header banner (898x72)
function banner() {
  const c = C(898, 72), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 898, 72);
  // left: dark red dusk scene with two Robloxians
  const g = x.createLinearGradient(0, 0, 0, 72);
  g.addColorStop(0, '#3a0606'); g.addColorStop(0.55, '#9a1a0e'); g.addColorStop(1, '#200404');
  x.fillStyle = g; x.fillRect(0, 0, 284, 72);
  x.fillStyle = 'rgba(255,190,120,0.35)'; x.beginPath(); x.arc(150, 30, 16, 0, 7); x.fill();
  x.fillStyle = '#1a0202';
  x.beginPath(); x.moveTo(170, 72); x.lineTo(185, 40); x.lineTo(190, 46); x.lineTo(198, 22); x.lineTo(206, 46); x.lineTo(214, 36); x.lineTo(226, 72); x.fill();
  x.fillRect(0, 62, 284, 10);
  const red = render3d(figure({ colors: { head: 24, torso: 21, leftArm: 21, rightArm: 21, leftLeg: 21, rightLeg: 21 }, face: 'Smile', hats: [], shirt: null, pants: null, tshirt: { style: 'logo', text: 'R', color: '#7b2e2f' } }), 80, 90, { side: -0.2 });
  const top = render3d(figure({ colors: { head: 24, torso: 26, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 }, face: 'Smile', hats: ['PurpleBandedTopHat'], shirt: { style: 'suit', color: '#151515' }, pants: null, tshirt: null }), 70, 90, { side: 0.3 });
  x.drawImage(red, 20, 4, 72, 82);
  x.drawImage(top, 80, 2, 64, 82);
  // right: glossy blue swoosh
  x.save();
  const bg = x.createLinearGradient(640, 0, 898, 72);
  bg.addColorStop(0, '#5a5aff'); bg.addColorStop(0.5, '#1515d8'); bg.addColorStop(1, '#00007a');
  x.fillStyle = bg;
  x.beginPath(); x.moveTo(645, 72); x.bezierCurveTo(650, 20, 680, 0, 720, 0); x.lineTo(898, 0); x.lineTo(898, 72); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.18)';
  x.beginPath(); x.moveTo(660, 30); x.bezierCurveTo(670, 8, 700, 2, 760, 2); x.lineTo(898, 2); x.lineTo(898, 26); x.bezierCurveTo(800, 30, 700, 22, 660, 30); x.fill();
  x.restore();
  x.fillStyle = '#2b2ba8'; x.font = 'bold 20px Verdana, sans-serif'; x.fillText('Think.', 562, 31);
  x.font = 'bold 22px Verdana, sans-serif'; x.fillText('Create.', 562, 58);
  return c;
}

function bannerPlay() {
  const c = C(210, 40), x = c.getContext('2d');
  roundRect(x, 33, 2, 150, 34, 6);
  const g = x.createLinearGradient(0, 2, 0, 36); g.addColorStop(0, '#9fb6ff'); g.addColorStop(0.5, '#4f6ff0'); g.addColorStop(0.52, '#3354e0'); g.addColorStop(1, '#5a7cf5');
  x.fillStyle = g; x.fill(); x.strokeStyle = '#1b2f8a'; x.lineWidth = 1.5; x.stroke();
  x.font = 'bold 21px Verdana, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#1b2f8a'; x.fillText('PLAY NOW', 109, 21); x.fillStyle = '#fff'; x.fillText('PLAY NOW', 108, 20);
  return c;
}

// ---------------------------------------------------------------- little icons
function rss() {
  const c = C(14, 14), x = c.getContext('2d');
  roundRect(x, 0, 0, 14, 14, 3); const g = x.createLinearGradient(0, 0, 14, 14); g.addColorStop(0, '#f8a050'); g.addColorStop(1, '#d05a00'); x.fillStyle = g; x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(3.5, 10.5, 1.5, 0, 7); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 1.6; x.beginPath(); x.arc(3, 11, 4.5, -Math.PI / 2, 0); x.stroke(); x.beginPath(); x.arc(3, 11, 8, -Math.PI / 2, 0); x.stroke();
  return c;
}
function gamesBullet() {
  const c = C(16, 16), x = c.getContext('2d');
  x.fillStyle = '#e8687c'; x.fillRect(2, 2, 12, 12); x.strokeStyle = '#a8384c'; x.strokeRect(2.5, 2.5, 11, 11);
  x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(3, 3, 10, 4);
  return c;
}
function robuxIcon() {
  const c = C(16, 16), x = c.getContext('2d');
  const g = x.createRadialGradient(6, 5, 1, 8, 8, 8); g.addColorStop(0, '#9be89b'); g.addColorStop(1, '#1a7a1a');
  x.fillStyle = g; x.beginPath(); x.arc(8, 8, 7.5, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 9px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('R$', 8, 8.5);
  return c;
}
function ticketsIcon() {
  const c = C(16, 16), x = c.getContext('2d');
  x.save(); x.translate(8, 8); x.rotate(-0.35);
  x.fillStyle = '#fbb117'; roundRect(x, -7, -4.5, 14, 9, 1.5); x.fill(); x.strokeStyle = '#b07000'; x.lineWidth = 1; x.stroke();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(-7, 0, 2, 0, 7); x.arc(7, 0, 2, 0, 7); x.fill();
  x.strokeStyle = '#b07000'; x.setLineDash([1.5, 1.5]); x.beginPath(); x.moveTo(-2, -4); x.lineTo(-2, 4); x.stroke();
  x.restore();
  return c;
}
function messageIcon() {
  const c = C(16, 12), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#6e99c9'; x.lineWidth = 1; x.fillRect(0.5, 0.5, 15, 11); x.strokeRect(0.5, 0.5, 15, 11);
  x.beginPath(); x.moveTo(0.5, 0.5); x.lineTo(8, 7); x.lineTo(15.5, 0.5); x.stroke();
  return c;
}
// 7x7 flat dot with a dark rim, like the 2008 OnlineStatusIndicator gifs
function dot(color) { return () => { const c = C(7, 7), x = c.getContext('2d'); x.fillStyle = '#09090a'; x.beginPath(); x.arc(3.5, 3.5, 3.5, 0, 7); x.fill(); x.fillStyle = color; x.beginPath(); x.arc(3.5, 3.5, 2.6, 0, 7); x.fill(); return c; }; }
function publicIcon() {
  const c = C(16, 16), x = c.getContext('2d');
  const g = x.createRadialGradient(6, 5, 1, 8, 8, 8); g.addColorStop(0, '#bfe0ff'); g.addColorStop(1, '#2060c0');
  x.fillStyle = g; x.beginPath(); x.arc(8, 8, 7, 0, 7); x.fill();
  x.fillStyle = '#3a9a3a'; x.beginPath(); x.ellipse(6, 7, 3, 2.5, 0.3, 0, 7); x.fill(); x.beginPath(); x.ellipse(10.5, 10.5, 2, 2.5, 0, 0, 7); x.fill();
  return c;
}
function lockIcon() {
  const c = C(16, 16), x = c.getContext('2d');
  x.strokeStyle = '#777'; x.lineWidth = 2; x.beginPath(); x.arc(8, 6, 3.5, Math.PI, 0); x.stroke();
  x.fillStyle = '#e0b030'; x.fillRect(3, 6, 10, 8); x.strokeStyle = '#806000'; x.lineWidth = 1; x.strokeRect(3.5, 6.5, 9, 7);
  return c;
}
function abuseIcon() {
  const c = C(16, 16), x = c.getContext('2d');
  const g = x.createRadialGradient(6, 5, 1, 8, 8, 8); g.addColorStop(0, '#fff9a0'); g.addColorStop(1, '#e0b000');
  x.fillStyle = g; x.beginPath(); x.arc(8, 8, 7, 0, 7); x.fill(); x.strokeStyle = '#806000'; x.lineWidth = 0.8; x.stroke();
  x.fillStyle = '#000'; x.beginPath(); x.ellipse(5.5, 6, 1.1, 1.8, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(10.5, 6, 1.1, 1.8, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(8, 11, 1.8, 2.2, 0, 0, 7); x.fill();
  return c;
}
function spinner() {
  const c = C(32, 32), x = c.getContext('2d');
  for (let i = 0; i < 12; i++) { x.save(); x.translate(16, 16); x.rotate((i / 12) * Math.PI * 2); x.fillStyle = `rgba(60,90,160,${(i + 1) / 12})`; x.fillRect(-1.5, -14, 3, 7); x.restore(); }
  return c;
}

// ---------------------------------------------------------------- front page art
function pointIcon(kind) {
  return () => {
    const c = C(50, 50), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 50, 50); x.strokeStyle = '#000'; x.strokeRect(0.5, 0.5, 49, 49);
    if (kind === 'build') {
      x.fillStyle = '#3c78d8'; roundRect(x, 6, 24, 30, 18, 5); x.fill();
      x.fillStyle = '#f5c518'; x.beginPath(); x.ellipse(21, 33, 14, 9, 0, 0, 7); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = '#9ad'; x.save(); x.translate(34, 18); x.rotate(0.6); x.fillRect(-4, -14, 8, 22); x.fillStyle = '#d08030'; x.fillRect(-2, 6, 4, 12); x.restore();
    } else if (kind === 'friends') {
      const fig = (cx, col) => { x.fillStyle = col; x.fillRect(cx - 7, 18, 14, 14); x.fillRect(cx - 11, 18, 4, 13); x.fillRect(cx + 7, 18, 4, 13); x.fillRect(cx - 7, 32, 6, 12); x.fillRect(cx + 1, 32, 6, 12); x.beginPath(); x.arc(cx, 12, 5, 0, 7); x.fill(); x.strokeStyle = '#000'; x.strokeRect(cx - 7, 18, 14, 14); };
      fig(13, '#f5c518'); fig(37, '#d02020'); fig(25, '#1a4ad8');
    } else {
      const g = x.createRadialGradient(20, 26, 2, 25, 30, 16); g.addColorStop(0, '#888'); g.addColorStop(0.35, '#222'); g.addColorStop(1, '#000');
      x.fillStyle = g; x.beginPath(); x.arc(25, 31, 15, 0, 7); x.fill();
      x.fillStyle = '#333'; x.fillRect(21, 12, 8, 6);
      x.strokeStyle = '#c8a060'; x.lineWidth = 2; x.beginPath(); x.moveTo(25, 12); x.quadraticCurveTo(28, 4, 36, 4); x.stroke();
      x.fillStyle = '#ffcc00'; x.beginPath(); x.arc(37, 4, 3, 0, 7); x.fill();
    }
    return c;
  };
}
function downloadAndPlay() {
  const c = C(400, 55), x = c.getContext('2d');
  roundRect(x, 2, 2, 396, 51, 8); x.fillStyle = '#6fc91b'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#000'; x.stroke();
  x.font = `bold 38px ${COMIC}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText('Play Now!', 200, 28);
  return c;
}
function coppa() {
  const c = C(125, 125), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 125, 125);
  x.fillStyle = '#c4c4ff'; x.strokeStyle = '#8080d0';
  x.beginPath();
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; const r = i % 2 ? 50 : 56; const px = 62 + Math.cos(a) * r, py = 56 + Math.sin(a) * r; if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); }
  x.fill(); x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#5050a0'; x.font = `bold 18px ${COMIC}`; x.fillText('Kid Safe', 62, 40);
  x.fillStyle = '#000'; x.font = `bold 11px ${COMIC}`; x.fillText('This website is', 62, 58); x.fillText('COPPA compliant', 62, 72);
  x.font = 'bold 11px Verdana, sans-serif'; x.fillText('Parents Click Here', 62, 121);
  return c;
}

// ---------------------------------------------------------------- badges (75x75)
function badgeCanvas(w = 75, h = 75) { const c = C(w, h); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); return [c, x]; }
function star(x, cx, cy, r1, r2, n = 5) { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n; const r = i % 2 ? r2 : r1; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); }
function gear(x, cx, cy, r, teeth = 8) { x.beginPath(); for (let i = 0; i < teeth * 2; i++) { const a = (i * Math.PI) / teeth; const rr = i % 2 ? r * 0.78 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); x.lineTo(cx + Math.cos(a + Math.PI / teeth * 0.6) * rr, cy + Math.sin(a + Math.PI / teeth * 0.6) * rr); } x.closePath(); }

const BADGES = {
  'Badges/Administrator-75x75.png': () => {
    const [c, x] = badgeCanvas();
    gear(x, 40, 40, 33, 9); x.fillStyle = '#111'; x.fill();
    x.font = "900 52px 'Arial Black', Arial"; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#fff'; x.strokeText('R', 36, 38); x.fillStyle = '#e2231a'; x.fillText('R', 36, 38);
    return c;
  },
  'Badges/ForumModerator-75x75.png': () => {
    const [c, x] = badgeCanvas();
    x.save(); x.translate(34, 34); x.rotate(-0.25); x.fillStyle = '#f4f4ff'; x.fillRect(-22, -24, 44, 50); x.strokeStyle = '#336'; x.strokeRect(-22, -24, 44, 50);
    x.fillStyle = '#3355aa'; for (let i = 0; i < 6; i++) x.fillRect(-16, -16 + i * 7, 32 - (i % 3) * 6, 3); x.restore();
    gear(x, 56, 56, 15, 8); x.fillStyle = '#888'; x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(56, 56, 5, 0, 7); x.fill();
    return c;
  },
  'Badges/ImageModerator-75x75.png': () => {
    const [c, x] = badgeCanvas();
    x.fillStyle = '#2a5cc8'; x.fillRect(14, 8, 52, 50); x.fillStyle = '#9fd0ff'; x.fillRect(19, 13, 42, 40);
    x.fillStyle = '#3a9a3a'; x.beginPath(); x.moveTo(19, 53); x.lineTo(34, 33); x.lineTo(44, 45); x.lineTo(52, 38); x.lineTo(61, 53); x.fill();
    gear(x, 20, 56, 15, 8); x.fillStyle = '#3399dd'; x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(20, 56, 5, 0, 7); x.fill();
    return c;
  },
  'Badges/BuildersClub-75x75.png': () => {
    const [c, x] = badgeCanvas();
    x.fillStyle = '#f5cd2f'; x.beginPath(); x.arc(37, 42, 26, Math.PI, 0); x.fill(); x.fillRect(8, 40, 59, 7); x.strokeStyle = '#a07a00'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#e8b800'; x.fillRect(33, 16, 8, 26);
    x.font = 'bold 13px Verdana'; x.fillStyle = '#1b2a6e'; x.textAlign = 'center'; x.fillText('BC', 37, 66);
    return c;
  },
  'Badges/Homestead-70x75.jpg': () => render3d((scene) => {
    const g = new THREE.Group();
    const fw = { defaultPhysMaterial: null, kinematicParts: new Set(), touchParts: new Set() };
    const add = (o) => g.add(new Part(fw, { ...o, noPhysics: true }).mesh);
    add({ size: [14, 1, 14], position: [0, 0.5, 0], color: 37 });
    add({ size: [8, 5, 8], position: [0, 3.5, 0], color: 5 });
    add({ size: [10, 1, 5.5], position: [0, 7, -2], color: 21, rotation: [32, 0, 0], top: 'Smooth' });
    add({ size: [10, 1, 5.5], position: [0, 7, 2], color: 21, rotation: [-32, 0, 0], top: 'Smooth' });
    add({ size: [2, 3, 0.4], position: [0, 2.5, -4.1], color: 192 });
    scene.add(g); return g;
  }, 70, 75, { up: 0.6, side: -0.6, pad: 1.0 }),
  'Badges/Bricksmith-54x75.jpg': () => render3d((scene) => {
    const g = new THREE.Group();
    const fw = { defaultPhysMaterial: null, kinematicParts: new Set(), touchParts: new Set() };
    const add = (o) => g.add(new Part(fw, { ...o, noPhysics: true }).mesh);
    add({ size: [4, 2.4, 2], position: [0, 1.2, 0], color: 23 });
    add({ size: [0.6, 6, 0.6], position: [0, 4.5, 0], color: 192, top: 'Smooth', bottom: 'Smooth' });
    add({ size: [3, 1.2, 1.2], position: [0, 7.6, 0], color: 199, top: 'Smooth', bottom: 'Smooth' });
    scene.add(g); return g;
  }, 54, 75, { up: 0.35, pad: 1.0 }),
  'Badges/Friendship-75x75.jpg': () => {
    const [c, x] = badgeCanvas();
    const fig = (cx, cy, s, col) => { x.fillStyle = col; x.fillRect(cx - 9 * s, cy, 18 * s, 18 * s); x.fillRect(cx - 14 * s, cy, 5 * s, 17 * s); x.fillRect(cx + 9 * s, cy, 5 * s, 17 * s); x.fillRect(cx - 9 * s, cy + 18 * s, 8 * s, 16 * s); x.fillRect(cx + 1 * s, cy + 18 * s, 8 * s, 16 * s); x.beginPath(); x.arc(cx, cy - 7 * s, 7 * s, 0, 7); x.fill(); };
    x.fillStyle = '#9fd8ff'; star(x, 40, 34, 34, 22, 14); x.fill();
    fig(20, 32, 0.9, '#f5c518'); fig(56, 32, 0.9, '#d02020'); fig(38, 24, 1.2, '#1a4ad8');
    return c;
  },
  'Badges/Inviter-75x75.png': () => {
    const [c, x] = badgeCanvas();
    const g = x.createRadialGradient(30, 30, 4, 37, 37, 34); g.addColorStop(0, '#9fe09f'); g.addColorStop(1, '#2a7ab8');
    x.fillStyle = g; x.beginPath(); x.arc(37, 37, 34, 0, 7); x.fill();
    x.save(); x.translate(40, 40); x.rotate(-0.25);
    x.fillStyle = '#fff7e0'; x.fillRect(-26, -16, 52, 34); x.strokeStyle = '#a08060'; x.strokeRect(-26, -16, 52, 34);
    x.beginPath(); x.moveTo(-26, -16); x.lineTo(0, 4); x.lineTo(26, -16); x.stroke();
    x.fillStyle = '#d02020'; x.fillRect(14, -14, 10, 8);
    x.fillStyle = '#d02020'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('@', -2, 14);
    x.restore();
    return c;
  },
  'Badges/CombatInitiation-75x75.jpg': () => {
    const [c, x] = badgeCanvas();
    x.fillStyle = '#c41a1a'; x.beginPath(); x.arc(37, 37, 34, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(37, 37, 27, 0, 7); x.fill();
    x.fillStyle = '#c41a1a'; x.beginPath(); x.arc(37, 37, 24, 0, 7); x.fill();
    const g = x.createLinearGradient(20, 15, 55, 60); g.addColorStop(0, '#f8f8f8'); g.addColorStop(1, '#808890');
    x.fillStyle = g; star(x, 37, 39, 24, 10); x.fill(); x.strokeStyle = '#555'; x.stroke();
    return c;
  },
  'Badges/Warrior-75x75.jpg': () => {
    const [c, x] = badgeCanvas();
    x.strokeStyle = '#b08030'; x.lineWidth = 7;
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { const a = Math.PI / 2 + s * (0.5 + i * 0.32); x.save(); x.translate(37 + Math.cos(a) * 30, 40 + Math.sin(a) * 30); x.rotate(a); x.fillStyle = '#c89a3a'; x.beginPath(); x.ellipse(0, 0, 6, 3, 0, 0, 7); x.fill(); x.restore(); }
    x.fillStyle = '#7a2020'; x.beginPath(); x.arc(37, 38, 22, 0, 7); x.fill(); x.fillStyle = '#e8e0d0'; x.beginPath(); x.arc(37, 38, 19, 0, 7); x.fill();
    const g = x.createLinearGradient(20, 20, 55, 60); g.addColorStop(0, '#f8f8f8'); g.addColorStop(1, '#707880');
    x.fillStyle = g; star(x, 37, 39, 18, 7.5); x.fill(); x.strokeStyle = '#444'; x.lineWidth = 1; x.stroke();
    return c;
  },
  'Badges/Bloxxer-75x75.jpg': () => {
    const [c, x] = badgeCanvas();
    x.fillStyle = '#ffd040'; star(x, 37, 37, 34, 18, 10); x.fill(); x.fillStyle = '#ff7020'; star(x, 37, 37, 24, 12, 10); x.fill();
    const brick = (bx, by, r, col) => { x.save(); x.translate(bx, by); x.rotate(r); x.fillStyle = col; x.fillRect(-8, -5, 16, 10); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(-8, -5, 16, 3); x.fillStyle = col; x.beginPath(); x.arc(-4, -6, 2.5, 0, 7); x.arc(4, -6, 2.5, 0, 7); x.fill(); x.restore(); };
    brick(18, 22, -0.6, '#d42020'); brick(56, 20, 0.5, '#e03020'); brick(14, 52, 0.4, '#c81a1a'); brick(58, 54, -0.3, '#d42020'); brick(37, 37, 0.1, '#e8301e');
    return c;
  },
};

// ---------------------------------------------------------------- Builders Club art
function joinBC() {
  // The 2008 header was a blocky italic pixel font (yellow, dark drop shadow)
  // on blue studs. Draw the text small with hard (thresholded) edges and blow
  // it up 3x with nearest-neighbour sampling, slanted like the original.
  const c = C(900, 43), x = c.getContext('2d');
  x.fillStyle = '#1f5cb0'; x.fillRect(0, 0, 900, 43);
  for (let i = 0; i < 900; i += 8) for (let j = 0; j < 43; j += 8) { x.fillStyle = 'rgba(255,255,255,.13)'; x.beginPath(); x.arc(i + 4, j + 4, 2.6, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,.16)'; x.beginPath(); x.arc(i + 5, j + 5, 2.6, 0, 7); x.fill(); }
  const text = 'JOIN BUILDERS CLUB NOW!', adv = 9;
  const mask = (color) => {
    const m = C(text.length * adv + 4, 14), mx = m.getContext('2d');
    mx.font = "bold 12px 'DejaVu Sans Mono', 'Courier New', monospace"; mx.textBaseline = 'top'; mx.fillStyle = color;
    mx.strokeStyle = color; mx.lineWidth = 0.7;
    [...text].forEach((ch, i) => { mx.fillText(ch, 1 + i * adv, 1); mx.strokeText(ch, 1 + i * adv, 1); });
    const d = mx.getImageData(0, 0, m.width, m.height);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0;
    mx.putImageData(d, 0, 0);
    return m;
  };
  const yellow = mask('#fff23c'), dark = mask('#1b1b10');
  const W = yellow.width * 3, left = (900 - W) / 2 + 8;
  x.imageSmoothingEnabled = false;
  x.save(); x.transform(1, 0, -0.25, 1, 0, 0);
  x.drawImage(dark, left + 3 + 9, 3 + 3, W, 42); x.drawImage(yellow, left + 9, 3, W, 42);
  x.restore();
  return c;
}
function bcButton(label, price, app, bestDeal) {
  return () => {
    const c = C(214, 156), x = c.getContext('2d');
    roundRect(x, 2, 2, 210, 152, 12);
    const g = x.createRadialGradient(80, 60, 10, 105, 78, 150); g.addColorStop(0, '#b9cdee'); g.addColorStop(0.55, '#5f86c8'); g.addColorStop(1, '#2a56a8');
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    const fig = render3d(figure(app), 130, 160, { side: -0.25, pad: 1.0 });
    x.drawImage(fig, 88, 34, 130, 160);
    x.restore();
    roundRect(x, 2, 2, 210, 152, 12); x.lineWidth = 3; x.strokeStyle = '#d4d4d4'; x.stroke();
    x.lineJoin = 'round';
    x.font = `italic bold 27px ${COMIC}`; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(label, 14, 38); x.fillStyle = '#ffe23a'; x.fillText(label, 14, 38);
    x.font = `bold 40px ${COMIC}`; x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(price[0], 12, 96); x.fillStyle = '#fff'; x.fillText(price[0], 12, 96);
    const w0 = x.measureText(price[0]).width;
    x.font = `bold 17px ${COMIC}`; x.lineWidth = 3; x.strokeText(price[1], 15 + w0, 76); x.fillText(price[1], 15 + w0, 76);
    x.fillStyle = '#000'; x.fillRect(15 + w0, 80, x.measureText(price[1]).width, 2);
    x.font = `italic bold 12px ${COMIC}`; x.fillStyle = '#000'; x.fillText('USD', 15 + w0, 96);
    if (bestDeal) { x.save(); x.translate(186, 26); x.rotate(Math.PI / 4); x.fillStyle = '#f5cd2f'; x.fillRect(-40, -11, 80, 22); x.fillStyle = '#000'; x.font = 'bold 12px Verdana, sans-serif'; x.textAlign = 'center'; x.fillText('BEST DEAL', 0, 5); x.restore(); }
    return c;
  };
}
function bullet(kind) {
  return () => {
    const c = C(32, 32), x = c.getContext('2d');
    if (kind === 'places') { x.fillStyle = '#3a9a3a'; x.fillRect(2, 16, 28, 10); x.fillStyle = '#f5cd2f'; x.fillRect(8, 8, 10, 10); x.fillStyle = '#c4281c'; x.beginPath(); x.moveTo(6, 9); x.lineTo(13, 2); x.lineTo(20, 9); x.fill(); }
    if (kind === 'allowance') { for (let i = 0; i < 4; i++) { x.fillStyle = '#5ab85a'; x.fillRect(4, 22 - i * 5, 24, 6); x.strokeStyle = '#1a6a1a'; x.strokeRect(4.5, 22.5 - i * 5, 23, 5); } }
    if (kind === 'sell') { x.fillStyle = '#fff'; x.strokeStyle = '#7aa'; x.beginPath(); x.moveTo(10, 4); x.lineTo(22, 4); x.lineTo(30, 10); x.lineTo(26, 15); x.lineTo(24, 13); x.lineTo(24, 29); x.lineTo(8, 29); x.lineTo(8, 13); x.lineTo(6, 15); x.lineTo(2, 10); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#d02020'; star(x, 16, 18, 6, 3); x.fill(); }
    if (kind === 'ads') { x.fillStyle = '#556'; x.beginPath(); x.moveTo(16, 2); x.lineTo(28, 7); x.lineTo(26, 20); x.lineTo(16, 30); x.lineTo(6, 20); x.lineTo(4, 7); x.closePath(); x.fill(); x.fillStyle = '#ccd'; x.fillRect(10, 10, 12, 8); }
    if (kind === 'hat') { x.fillStyle = '#f5cd2f'; x.beginPath(); x.arc(16, 20, 12, Math.PI, 0); x.fill(); x.fillRect(2, 19, 28, 4); x.strokeStyle = '#a07a00'; x.stroke(); }
    return c;
  };
}

// ---------------------------------------------------------------- parents tiles (110x110)
function parentsTile(kind) {
  return () => {
    const c = C(110, 110), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 110); g.addColorStop(0, '#e8f0ff'); g.addColorStop(1, '#9cb8e8');
    roundRect(x, 2, 2, 106, 106, 14); x.fillStyle = g; x.fill(); x.strokeStyle = '#6e99c9'; x.lineWidth = 2; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (kind === 'guide') { x.fillStyle = '#c4281c'; x.fillRect(30, 24, 50, 62); x.fillStyle = '#fff'; x.font = "900 34px 'Arial Black'"; x.fillText('R', 55, 55); }
    if (kind === 'safe') { x.fillStyle = '#3a9a3a'; x.beginPath(); x.moveTo(55, 16); x.lineTo(86, 28); x.lineTo(82, 64); x.lineTo(55, 92); x.lineTo(28, 64); x.lineTo(24, 28); x.closePath(); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.moveTo(40, 54); x.lineTo(52, 66); x.lineTo(72, 40); x.stroke(); }
    if (kind === 'faq') { x.fillStyle = '#1a4ad8'; x.font = `bold 70px ${COMIC}`; x.fillText('?', 55, 58); }
    if (kind === 'bc') { x.fillStyle = '#f5cd2f'; x.beginPath(); x.arc(55, 64, 34, Math.PI, 0); x.fill(); x.fillRect(14, 62, 82, 9); x.strokeStyle = '#a07a00'; x.lineWidth = 2; x.stroke(); }
    if (kind === 'learn') { x.fillStyle = '#c4281c'; x.fillRect(22, 30, 30, 18); x.fillStyle = '#0d69ac'; x.fillRect(52, 48, 30, 18); x.fillStyle = '#f5cd2f'; x.fillRect(30, 66, 30, 18); x.fillStyle = '#3a9a3a'; x.fillRect(58, 26, 26, 18); }
    if (kind === 'say') { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(55, 46, 38, 26, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(40, 66); x.lineTo(30, 88); x.lineTo(56, 70); x.fill(); x.fillStyle = '#6e99c9'; x.font = 'bold 26px Verdana'; x.fillText('"..."', 55, 46); }
    return c;
  };
}

// ---------------------------------------------------------------- forum skin images
function forumImg(kind) {
  return () => {
    if (kind === 'headerBg') { const c = C(4, 25), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 25); g.addColorStop(0, '#6a7cd0'); g.addColorStop(1, '#3a4aa0'); x.fillStyle = g; x.fillRect(0, 0, 4, 25); return c; }
    if (kind === 'headerBgAlt') { const c = C(4, 20), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 20); g.addColorStop(0, '#f4f6fc'); g.addColorStop(1, '#dde2f2'); x.fillStyle = g; x.fillRect(0, 0, 4, 20); return c; }
    if (kind === 'status') { const c = C(34, 34), x = c.getContext('2d'); const g = x.createRadialGradient(13, 12, 2, 17, 17, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#c8d8f8'); g.addColorStop(1, '#5a7ac8'); x.fillStyle = g; x.beginPath(); x.arc(17, 17, 15, 0, 7); x.fill(); x.fillStyle = '#f0c040'; x.fillRect(9, 13, 16, 11); x.fillStyle = '#ffe080'; x.fillRect(9, 11, 7, 3); return c; }
    if (kind === 'topic') { const c = C(19, 18), x = c.getContext('2d'); x.fillStyle = '#f0c040'; x.fillRect(2, 5, 15, 10); x.fillStyle = '#ffe080'; x.fillRect(2, 3, 7, 3); x.strokeStyle = '#a07000'; x.strokeRect(2.5, 5.5, 14, 9); return c; }
    if (kind === 'newtopic' || kind === 'newpost') {
      const label = kind === 'newtopic' ? 'new topic' : 'reply';
      const c = C(kind === 'newtopic' ? 82 : 60, 25), x = c.getContext('2d');
      roundRect(x, 1, 1, c.width - 2, 23, 5); const g = x.createLinearGradient(0, 0, 0, 25); g.addColorStop(0, '#fff'); g.addColorStop(1, '#c8d4f0'); x.fillStyle = g; x.fill(); x.strokeStyle = '#4455aa'; x.stroke();
      x.fillStyle = '#013DA4'; x.font = 'bold 11px Verdana'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, c.width / 2, 13); return c;
    }
    const c = C(12, 13), x = c.getContext('2d');
    if (kind === 'home') { x.fillStyle = '#c4281c'; x.beginPath(); x.moveTo(0, 6); x.lineTo(6, 0); x.lineTo(12, 6); x.fill(); x.fillStyle = '#f5cd2f'; x.fillRect(2, 6, 8, 6); }
    if (kind === 'search') { x.strokeStyle = '#335'; x.lineWidth = 2; x.beginPath(); x.arc(5, 5, 3.5, 0, 7); x.stroke(); x.beginPath(); x.moveTo(8, 8); x.lineTo(11, 12); x.stroke(); }
    if (kind === 'register' || kind === 'profile' || kind === 'myforums') { x.fillStyle = '#f5cd2f'; x.beginPath(); x.arc(6, 3.5, 3, 0, 7); x.fill(); x.fillStyle = kind === 'myforums' ? '#3a9a3a' : '#1a4ad8'; x.fillRect(2, 7, 8, 6); }
    if (kind === 'minitopic') { x.fillStyle = '#4455aa'; x.fillRect(1, 3, 10, 7); x.fillStyle = '#fff'; x.fillRect(2, 4, 8, 5); }
    if (kind === 'online' || kind === 'offline') { x.fillStyle = kind === 'online' ? '#2a9a2a' : '#999'; x.beginPath(); x.arc(6, 6.5, 5, 0, 7); x.fill(); }
    if (kind === 'mod') { x.fillStyle = '#d4a020'; star(x, 6, 7, 6, 2.6); x.fill(); }
    return c;
  };
}

// ---------------------------------------------------------------- house-ad art
function adArt(kind) {
  return () => {
    if (kind === 'studs') { const c = C(20, 20), x = c.getContext('2d'); x.fillStyle = '#1e4fa8'; x.fillRect(0, 0, 20, 20); x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.arc(10, 10, 5, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath(); x.arc(11, 11, 5, 0, 7); x.fill(); x.fillStyle = '#2458b4'; x.beginPath(); x.arc(10, 10, 4, 0, 7); x.fill(); return c; }
    if (kind === 'hardhat') return render3d((scene) => { const m = new CharacterModel({ ...BUILDERMAN, tshirt: null }); scene.add(m.head); m.head.position.set(0, 0, 0); return m.head; }, 80, 80, { pad: 1.0 });
    if (kind === 'shirt') return render3d(figure({ colors: { head: 24, torso: 194, leftArm: 24, rightArm: 24, leftLeg: 194, rightLeg: 194 }, face: 'Smile', hats: [], shirt: { style: 'jacket', color: '#2f6b2f', color2: '#f2f2f2' }, pants: { style: 'jeans' }, tshirt: null }), 84, 84, { pad: 1.0 });
    if (kind === 'paintball') return render3d(figure({ colors: { head: 24, torso: 21, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 }, face: 'Smile', hats: [], shirt: null, pants: null, tshirt: null }), 84, 84, { pad: 1.0 });
    if (kind === 'teapot') { const c = C(84, 70), x = c.getContext('2d'); x.fillStyle = '#e0e4e8'; x.beginPath(); x.ellipse(42, 42, 26, 20, 0, 0, 7); x.fill(); x.fillRect(16, 38, 4, 2); x.beginPath(); x.moveTo(64, 40); x.quadraticCurveTo(82, 30, 80, 18); x.lineTo(76, 20); x.quadraticCurveTo(74, 32, 62, 34); x.fill(); x.lineWidth = 5; x.strokeStyle = '#e0e4e8'; x.beginPath(); x.arc(16, 40, 9, Math.PI / 2, -Math.PI / 2); x.stroke(); x.beginPath(); x.ellipse(42, 22, 12, 5, 0, 0, 7); x.fill(); x.beginPath(); x.arc(42, 16, 3, 0, 7); x.fill(); x.strokeStyle = '#8a9098'; x.lineWidth = 1; x.beginPath(); x.ellipse(42, 42, 26, 20, 0, 0, 7); x.stroke(); return c; }
    if (kind === 'obby') { const c = C(100, 100), x = c.getContext('2d'); for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#a3a2a5' : '#f5cd2f'; x.fillRect(10 + i * 16, 80 - i * 14, 14, 6); } x.fillStyle = '#ff4020'; x.fillRect(0, 92, 100, 8); return c; }
    return C(1, 1);
  };
}

function favicon() {
  const c = C(16, 16), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 16, 16);
  x.font = "900 15px 'Arial Black', Arial"; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e2231a'; x.fillText('R', 8, 9);
  return c;
}

export const IMAGES = {
  'roblox_logo.png': () => logo(),
  'Banner.jpg': banner,
  'BannerPlay.png': bannerPlay,
  'feed-icons/feed-icon-14x14.png': rss,
  'games_bullet.png': gamesBullet,
  'Robux.png': robuxIcon,
  'Tickets.png': ticketsIcon,
  'Message.gif': messageIcon,
  'OnlineStatusIndicator_IsOnline.gif': dot('#00ff00'),
  'OnlineStatusIndicator_IsOffline.gif': dot('#ff0000'),
  'public.png': publicIcon,
  'CopyLocked.png': lockIcon,
  'locked.png': lockIcon,
  'abuse.png': abuseIcon,
  'ProgressIndicator2.gif': spinner,
  'NewFrontPageGuy.png': () => render3d(figure(BUILDERMAN), 115, 130, { pad: 1.02 }),
  'BuildIcon.png': pointIcon('build'),
  'FriendsIcon.png': pointIcon('friends'),
  'BattleIcon.png': pointIcon('battle'),
  'DownloadAndPlay.png': downloadAndPlay,
  'COPPASeal-125x125.png': coppa,
  'JoinBuildersClubNow.png': joinBC,
  'BuyBCMonthly.png': bcButton('Monthly', ['$5', '95'], { colors: { head: 24, torso: 21, leftArm: 24, rightArm: 24, leftLeg: 24, rightLeg: 24 }, face: 'Smile', hats: ['RedBaseballCap'], shirt: { style: 'hawaiian', color: '#c4281c', color2: '#f2f2f2' }, pants: null, tshirt: null }),
  'BuyBC6Months.png': bcButton('6 Months', ['$29', '95'], { colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 23, rightLeg: 23 }, face: 'Smile', hats: ['PoliceCap'], shirt: { style: 'police', color: '#3a5a9a' }, pants: { style: 'plain', color: '#2a3a6a' }, tshirt: null }),
  'BuyBC12Months.png': bcButton('12 Months', ['$57', '95'], { colors: { head: 24, torso: 26, leftArm: 24, rightArm: 24, leftLeg: 26, rightLeg: 26 }, face: 'Smile', hats: ['PurpleBandedTopHat'], shirt: { style: 'suit', color: '#3a1a5a', color3: '#6b327c' }, pants: { style: 'plain', color: '#1b1b1b' }, tshirt: null }, true),
  'MultiplePlacesBullet.png': bullet('places'),
  'AllowanceBullet.png': bullet('allowance'),
  'SellBullet.png': bullet('sell'),
  'AdSuppressionBullet.png': bullet('ads'),
  'HardHatBullet.png': bullet('hat'),
  'Parents/RobloxGuide.png': parentsTile('guide'),
  'Parents/KeepingKidsSafe.png': parentsTile('safe'),
  'Parents/FAQs.png': parentsTile('faq'),
  'Parents/BuildersClub.png': parentsTile('bc'),
  'Parents/RobloxAndLearning.png': parentsTile('learn'),
  'Parents/WhatParentsAreSaying.png': parentsTile('say'),
  'forum/forumHeaderBackground.gif': forumImg('headerBg'),
  'forum/forumHeaderBackgroundAlternate.gif': forumImg('headerBgAlt'),
  'forum/forum_status.gif': forumImg('status'),
  'forum/topic.gif': forumImg('topic'),
  'forum/newtopic.gif': forumImg('newtopic'),
  'forum/newpost.gif': forumImg('newpost'),
  'forum/icon_mini_home.gif': forumImg('home'),
  'forum/icon_mini_search.gif': forumImg('search'),
  'forum/icon_mini_register.gif': forumImg('register'),
  'forum/icon_mini_profile.gif': forumImg('profile'),
  'forum/icon_mini_myforums.gif': forumImg('myforums'),
  'forum/icon_mini_topic.gif': forumImg('minitopic'),
  'forum/user_IsOnline.gif': forumImg('online'),
  'forum/user_IsOffline.gif': forumImg('offline'),
  'forum/users_moderator.gif': forumImg('mod'),
  'ads/studs-blue.png': adArt('studs'),
  'ads/hardhat.png': adArt('hardhat'),
  'ads/teapot.png': adArt('teapot'),
  'ads/paintball.png': adArt('paintball'),
  'ads/shirt.png': adArt('shirt'),
  'ads/obby.png': adArt('obby'),
  '../favicon.ico': favicon,
  ...BADGES,
};

window.generateAll = async () => {
  // canvas text only uses faces that are already loaded
  await Promise.all(["12px 'Comic Sans MS'", "bold 12px 'Comic Sans MS'", "italic bold 12px 'Comic Sans MS'"].map((f) => document.fonts.load(f).catch(() => {})));
  await document.fonts.ready;
  const out = {};
  for (const [name, fn] of Object.entries(IMAGES)) {
    let c = await fn();
    if (name.endsWith('.jpg')) { // JPEGs have no alpha: flatten onto white like the originals
      const f = C(c.width, c.height), x = f.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height); x.drawImage(c, 0, 0); c = f;
    }
    out[name] = c.toDataURL(name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 0.92);
  }
  return out;
};
