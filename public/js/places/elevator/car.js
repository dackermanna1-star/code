// The elevator car: wood panelling, a brass handrail, a mirror, a red
// carpet, a light in the ceiling, the floor display over the doors (inside
// and out), a panel of buttons (Door Open holds the doors for stragglers,
// the bell rings the alarm), and the doors themselves. It never really
// moves: while the doors are shut, the floor outside is swapped.
import * as THREE from 'three';
import { V, liveTex, textTex } from './kit.js';
import * as A from './audio.js';

export const CAR = { x: 10, z0: -8, z1: 8, h: 13 };

export class Car {
  constructor(world) {
    this.world = world;
    this.parts = [];
    const add = (size, pos, color, o = {}) => { const p = world.add({ size, position: pos, color, top: 'Smooth', bottom: 'Smooth', ...o }); this.parts.push(p); return p; };
    const box = (x0, y0, z0, x1, y1, z1, color, o) => add([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color, o);
    this.add = add; this.box = box;
    const wood = 192, light = 12, steel = 199, brass = 127;
    // shell
    box(-11, -1.2, -9, 11, 0, 9, 26); // floor slab
    box(-10, 0, -8, 10, 0.06, 8, 154, { canCollide: false }); // the carpet
    for (const [x0, x1, z0, z1] of [[-10, 10, -8, -7.6], [-10, 10, 7.6, 8], [-10, -9.6, -7.6, 7.6], [9.6, 10, -7.6, 7.6]]) box(x0, 0.06, z0, x1, 0.12, z1, 24, { canCollide: false }); // gold border
    box(-11, 13, -9, 11, 14.2, 9, steel); // roof
    box(-11, 0, 8, 11, 13, 9, wood); // back wall
    box(-11, 0, -9, -10, 13, 8, wood); box(10, 0, -9, 11, 13, 8, wood); // side walls
    // the front wall, in two skins with the doors sliding between them
    for (const [z0, z1, c] of [[-8.25, -8, wood], [-9, -8.75, steel]]) {
      box(-10, 0, z0, -5, 13, z1, c); box(5, 0, z0, 10, 13, z1, c); box(-5, 10, z0, 5, 13, z1, c);
    }
    box(-10, 0, -8.75, -9.6, 13, -8.25, steel); box(9.6, 0, -8.75, 10, 13, -8.25, steel); box(-10, 12.6, -8.75, 10, 13, -8.25, steel);
    // inside: the panelling's top half is lighter, a brass rail, a mirror on the back wall, the light
    box(-9.98, 6, -7.9, -9.9, 12.8, 7.9, light, { canCollide: false }); box(9.9, 6, -7.9, 9.98, 12.8, 7.9, light, { canCollide: false });
    box(-9.5, 6, 7.92, 9.5, 12.5, 7.98, 208, { reflectance: 0.6, canCollide: false }); // mirror
    for (const [x0, x1, z0, z1] of [[-9.5, 9.5, 7.3, 7.6], [-9.6, -9.3, -7.4, 7.6], [9.3, 9.6, -7.4, 7.6]]) box(x0, 3.4, z0, x1, 3.7, z1, brass, { reflectance: 0.4, canCollide: false });
    box(-9.9, 5.8, -7.9, -9.86, 6.1, 7.9, brass, { canCollide: false }); box(9.86, 5.8, -7.9, 9.9, 6.1, 7.9, brass, { canCollide: false }); box(-9.8, 5.8, 7.88, 9.8, 6.1, 7.92, brass, { canCollide: false });
    box(-4, 12.8, -3, 4, 13, 3, 1, { material: 'Neon', canCollide: false }); // ceiling light panel
    for (const x of [-7, 7]) for (const z of [-5, 5]) add([1, 0.2, 1], [x, 12.9, z], 226, { material: 'Neon', canCollide: false, shape: 'Cylinder', rotation: [0, 0, 90] });
    this.lamp = new THREE.PointLight(0xfff0d8, 45, 38, 2); this.lamp.position.set(0, 11.5, 0); world.scene.add(this.lamp);
    // the door frame (brass) on both faces
    for (const z of [-8.02, -9.02]) { box(-5.4, 0, z - 0.1, -5, 10.4, z + 0.1, brass, { reflectance: 0.3, canCollide: false }); box(5, 0, z - 0.1, 5.4, 10.4, z + 0.1, brass, { reflectance: 0.3, canCollide: false }); box(-5.4, 10, z - 0.1, 5.4, 10.4, z + 0.1, brass, { reflectance: 0.3, canCollide: false }); }
    // the doors
    this.doors = [-1, 1].map((s) => { const p = add([5.2, 10, 0.4], [s * 2.6, 5, -8.5], 131, { reflectance: 0.35 }); p.setKinematic(); return { p, s }; });
    this.k = 0; this.target = 0;
    // displays: inside over the doors (facing in) and outside (facing the landing)
    this.disp = liveTex(256, 96);
    for (const [z, face] of [[-7.95, 'in'], [-9.05, 'out']]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), new THREE.MeshBasicMaterial({ map: this.disp.tex, fog: false }));
      m.position.set(0, 11.6, z); if (face === 'out') m.rotation.y = Math.PI;
      world.scene.add(m);
    }
    this.setDisplay('G', null);
    // the button panel (inside, right of the doors) - a texture on a thin plate, clickable
    this.panel = add([2.2, 5.4, 0.12], [7.3, 5.2, -7.88], 131, { reflectance: 0.3 });
    this.panelTex = liveTex(128, 320);
    this.lit = new Set();
    this.panel.addDecal('Back', this.panelTex.tex);
    this.drawPanel();
    // signs and plaques
    const plaque = (text, x, y, z, w, h, o = {}) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhongMaterial({ map: textTex(text, { bg: o.bg || '#e8dcb0', fg: o.fg || '#3a2a10', w: 256, h: Math.round(256 * h / w), border: o.border || '#8a6a2a', font: o.font }), shininess: 30 }));
      m.position.set(x, y, z); m.rotation.y = o.ry || 0; world.scene.add(m);
    };
    plaque('CAPACITY\n12 PERSONS\n2000 LBS', 7.3, 9.1, -7.9, 1.8, 1.3, { ry: 0 });
    plaque('ELEVATOR\nINSPECTION\nCERTIFICATE\n· PASSED ·', -9.88, 8.4, -4.5, 1.6, 1.9, { ry: Math.PI / 2, bg: '#f4f0e0', border: '#2a4a8a', fg: '#1a2a5a' });
    plaque('NO SMOKING', -9.88, 8.4, 4.5, 1.8, 0.6, { ry: Math.PI / 2, bg: '#ffffff', fg: '#b01010', border: '#b01010' });
    plaque('IN CASE OF FIRE\nUSE STAIRS', 9.88, 8.4, -2, 1.9, 1.1, { ry: -Math.PI / 2, bg: '#c01818', fg: '#ffffff', border: '#ffffff' });
    // the speaker grille in the ceiling corner, the emergency phone box
    box(-8.8, 12.5, 6.4, -7.4, 12.98, 7.8, 26, { canCollide: false });
    const phone = add([1.2, 1.6, 0.25], [9.85 - 0.12, 4.8, 3], 21, { canCollide: false }); void phone;
    // outside: a little roof and the cable going up out of sight (an elevator on a beach is still an elevator)
    box(-11.6, 14.2, -9.6, 11.6, 14.8, 9.6, 199);
    box(-1, 14.8, -1, 1, 16, 1, 26);
    add([0.6, 600, 0.6], [0, 316, 0], 26, { canCollide: false });
    box(-11.2, -1.8, -9.2, 11.2, -1.2, 9.2, 199);
    // the inside box (for "is this person in the elevator?")
    this.box3 = new THREE.Box3(V(-10, -2.5, -8.4), V(10, 14, 8));
    this.spawnBox = [-8, -5, 8, 6];
    this.shakeT = 0;
  }
  inside(p) { return p.x > -10.2 && p.x < 10.2 && p.z > -8.65 && p.z < 8.2 && p.y > -3 && p.y < 16; }
  /** In the doorway, where the doors would close on you. */
  inDoorway(p) { return Math.abs(p.x) < 5.6 && p.z > -10 && p.z < -7.3 && p.y > -3 && p.y < 14; }
  /** A random place to stand inside. */
  spot(i) {
    if (i != null) { const cols = 4, row = Math.floor(i / cols) % 3, col = i % cols; return V(-6 + col * 4 + (Math.random() - 0.5), 0, -3 + row * 4 + (Math.random() - 0.5)); }
    const [x0, z0, x1, z1] = this.spawnBox; return V(x0 + Math.random() * (x1 - x0), 0, z0 + Math.random() * (z1 - z0));
  }
  open(fast = false) { if (this.target !== 1) { this.target = 1; if (!fast) A.doors(true); } }
  close() { if (this.target !== 0) { this.target = 0; A.doors(false); } }
  get closed() { return this.k <= 0.001; }
  get opened() { return this.k >= 0.999; }
  update(dt) {
    const sp = dt / 1.4;
    if (this.k !== this.target) this.k = this.target > this.k ? Math.min(this.target, this.k + sp) : Math.max(this.target, this.k - sp);
    const e = this.k * this.k * (3 - 2 * this.k);
    for (const d of this.doors) d.p.setPosition(d.s * (2.6 + 5 * e), 5, -8.5);
  }
  /** The floor display: label ('12', 'G', 'PH'), arrow 'up' | 'down' | null. */
  setDisplay(label, arrow) {
    const key = `${label}|${arrow}`;
    if (this._disp === key) return;
    this._disp = key;
    this.disp.redraw((x, w, h) => {
      x.fillStyle = '#120804'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,140,30,0.08)'; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);
      x.shadowColor = '#ff8a1a'; x.shadowBlur = 14; x.fillStyle = '#ffa030';
      if (arrow) { x.beginPath(); const ax = 52, ay = h / 2, s = 26; if (arrow === 'up') { x.moveTo(ax, ay - s); x.lineTo(ax + s, ay + s * 0.7); x.lineTo(ax - s, ay + s * 0.7); } else { x.moveTo(ax, ay + s); x.lineTo(ax + s, ay - s * 0.7); x.lineTo(ax - s, ay - s * 0.7); } x.fill(); }
      x.font = 'bold 66px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(label, arrow ? 165 : w / 2, h / 2 + 4);
    });
  }
  drawPanel() {
    const lit = this.lit;
    this.panelTex.redraw((x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#b8bcc0'); g.addColorStop(0.5, '#e4e6e8'); g.addColorStop(1, '#9ea2a6'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#6a6e72'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4);
      const btn = (cx, cy, label, on, col = '#ffb030') => {
        x.fillStyle = '#5a5e62'; x.beginPath(); x.arc(cx, cy, 14, 0, 7); x.fill();
        x.fillStyle = on ? col : '#2a2c2e'; x.beginPath(); x.arc(cx, cy, 11, 0, 7); x.fill();
        if (on) { x.shadowColor = col; x.shadowBlur = 10; x.fill(); x.shadowBlur = 0; }
        x.fillStyle = on ? '#2a1400' : '#d8dcdf'; x.font = 'bold 11px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx, cy + 1);
      };
      const labels = ['PH', '50', '40', '30', '20', '10', '5', 'G'];
      labels.forEach((l, i) => btn(i % 2 ? 88 : 40, 34 + Math.floor(i / 2) * 36, l, lit.has(l)));
      btn(40, 190, '◀▶', lit.has('open'), '#7cf07c'); btn(88, 190, '▶◀', lit.has('close'), '#7cf07c');
      btn(64, 236, '🔔', lit.has('alarm'), '#ff5040');
      x.fillStyle = '#3a3e42'; x.font = 'bold 10px Arial'; x.textAlign = 'center'; x.fillText('OPEN    CLOSE', 64, 214); x.fillText('ALARM', 64, 260);
      x.fillStyle = '#1a1c1e'; x.font = 'bold 9px Arial'; x.fillText('OTIS-ISH LIFT CO.', 64, 295);
    });
  }
  /** Which button is at a world point on the panel ('open', 'close', 'alarm', a floor label) or null. */
  buttonAt(point) {
    const p = this.panel.position;
    const u = 0.5 - (point.x - p.x) / 2.2, v = 0.5 - (point.y - p.y) / 5.4; // the decal faces +z: its left is at +x
    const px = (1 - u) * 128, py = v * 320;
    const hit = (cx, cy) => Math.hypot(px - cx, py - cy) < 16;
    if (hit(40, 190)) return 'open';
    if (hit(88, 190)) return 'close';
    if (hit(64, 236)) return 'alarm';
    const labels = ['PH', '50', '40', '30', '20', '10', '5', 'G'];
    for (let i = 0; i < 8; i++) if (hit(i % 2 ? 88 : 40, 34 + Math.floor(i / 2) * 36)) return labels[i];
    return null;
  }
  light(label, on, secs = 0) {
    if (on) this.lit.add(label); else this.lit.delete(label);
    this.drawPanel();
    if (secs) setTimeout(() => { this.lit.delete(label); this.drawPanel(); }, secs * 1000);
  }
}
