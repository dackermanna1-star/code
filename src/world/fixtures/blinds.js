// Roller blinds on every window. Closing them really blocks sunlight (they cast shadows).
import * as THREE from 'three';
import { G } from '../../game.js';
import { Interactable } from '../interactable.js';
import { mat, box, cyl, at } from '../../items/kit.js';
import { fabric } from '../../core/textures.js';
import { tween, Ease } from '../../core/tween.js';

class Blind extends Interactable {
  constructor(apt, win, group) {
    super(group === 'living' ? 'Living Room Blinds' : 'Bedroom Blinds', 'blinds');
    this.group = group; this.win = win;
    const len = win.b - win.a, top = win.top, bottom = win.bottom;
    this.len = len; this.drop = top - bottom - 0.02;
    const root = new THREE.Group();
    const cassette = box(len, 0.09, 0.09, mat('#e9e6e0', { rough: 0.6 }));
    at(cassette, 0, top + 0.03, 0.12);
    root.add(cassette);
    const fabMat = new THREE.MeshStandardMaterial({ color: '#efe8dc', map: fabric({ base: '#ffffff', seed: 77, scale: 3 }), roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.96, emissive: '#fff1dc', emissiveIntensity: 0 });
    this.fabMat = fabMat;
    const geo = new THREE.PlaneGeometry(len - 0.04, 1);
    geo.translate(0, -0.5, 0);
    const sheet = new THREE.Mesh(geo, fabMat);
    sheet.castShadow = true;
    sheet.position.set(0, top - 0.01, 0.1);
    root.add(sheet);
    const bar = cyl(0.012, 0.012, len - 0.04, mat('#c8c4bc', { rough: 0.4, metal: 0.4 }), 10);
    bar.rotation.z = Math.PI / 2;
    root.add(bar);
    this.sheet = sheet; this.bar = bar;
    if (win.axis === 'x') root.position.set((win.a + win.b) / 2, 0, win.c);
    else { root.rotation.y = win.id === 'bed_e' ? -Math.PI / 2 : Math.PI / 2; root.position.set(win.c, 0, (win.a + win.b) / 2); }
    apt.root.add(root);
    this.root = root;
    this.attach(root);
    this.outline = false;
    this.set(G.state.home.blinds[group] || 0, true);
  }
  set(amount, instant = false) {
    const from = this.amount ?? 0;
    this.amount = amount;
    const apply = (a) => {
      const h = Math.max(0.001, a * this.drop);
      this.sheet.scale.y = h;
      this.sheet.visible = a > 0.01;
      this.bar.position.set(0, this.win.top - 0.01 - h, 0.1);
    };
    if (instant) { apply(amount); return; }
    tween({ duration: 1.2, ease: Ease.inOutQuad, update: (t, e) => apply(from + (amount - from) * e) });
  }
  getActions() {
    const cur = G.state.home.blinds[this.group] || 0;
    return [
      { key: 'E', label: cur > 0.5 ? 'Raise blinds' : 'Lower blinds', run: () => setBlinds(this.group, cur > 0.5 ? 0 : 1) },
      { key: 'F', label: 'Half-way', run: () => setBlinds(this.group, 0.5) },
    ];
  }
}

export function setBlinds(group, amount) {
  G.state.home.blinds[group] = amount;
  for (const b of G.apartment.blinds) if (b.group === group) b.set(amount);
  G.audio.play('zipper', { pos: G.camera.position, pitch: 0.6 });
  G.events.emit('blindsChanged', group, amount);
}

export function buildBlinds(apt) {
  apt.blinds = [];
  for (const w of apt.windows) apt.blinds.push(new Blind(apt, w, w.room));
}
