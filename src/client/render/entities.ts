import * as THREE from 'three';
import { tryItemDef } from '../../shared/data/items';
import type { EntSnap } from '../../shared/net/protocol';
import { hash4 } from '../../shared/math';

/**
 * Blocky entity models (players, wildlife, drops, corpses, explosives) built
 * from boxes, with snapshot interpolation ~100 ms in the past.
 */

const matCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number) {
  let m = matCache.get(color);
  if (!m) matCache.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Box with its pivot at the TOP centre (limbs) or centre. */
function box(w: number, h: number, d: number, color: number, pivotTop = false): THREE.Object3D {
  const m = new THREE.Mesh(boxGeo, mat(color));
  m.scale.set(w, h, d);
  if (!pivotTop) return m;
  const g = new THREE.Group();
  m.position.y = -h / 2;
  g.add(m);
  return g;
}

const SKIN = [0xe0b48c, 0xc68e64, 0x8d5a3c, 0xf1c9a5, 0xa86f4c];

interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export class EntityView {
  snaps: Snap[] = [];
  root = new THREE.Group();
  parts: Record<string, THREE.Object3D> = {};
  last: EntSnap;
  anim = 0;
  heldId = '';
  wearSig = '';
  label: THREE.Sprite | null = null;
  skin = 0xe0b48c;
  constructor(public id: number, public kind: EntSnap['k'], first: EntSnap) {
    this.last = first;
  }
}

export class EntityRenderer {
  readonly group = new THREE.Group();
  readonly views = new Map<number, EntityView>();
  private clock = 0;

  /** Apply a snapshot entry (t = server time ms). */
  apply(e: EntSnap, t: number) {
    let v = this.views.get(e.id);
    if (!v || v.kind !== e.k) {
      if (v) this.removeView(v);
      v = new EntityView(e.id, e.k, e);
      this.build(v, e);
      this.views.set(e.id, v);
      this.group.add(v.root);
    }
    v.last = e;
    v.snaps.push({ t, x: e.x, y: e.y, z: e.z, yaw: e.yaw ?? 0, pitch: e.pitch ?? 0 });
    if (v.snaps.length > 30) v.snaps.shift();
    if (e.k === 'p') {
      const sig = (e.w ?? []).join(',');
      if (sig !== v.wearSig || (e.h ?? '') !== v.heldId) this.dressPlayer(v, e);
    }
  }

  remove(id: number) {
    const v = this.views.get(id);
    if (v) this.removeView(v);
  }

  private removeView(v: EntityView) {
    this.group.remove(v.root);
    this.views.delete(v.id);
  }

  clear() {
    for (const v of [...this.views.values()]) this.removeView(v);
  }

  // ------------------------------------------------------------ models
  private build(v: EntityView, e: EntSnap) {
    const r = v.root;
    if (e.k === 'p') {
      const skin = SKIN[hash4(e.n?.length ?? 0, e.n?.charCodeAt(0) ?? 0) % SKIN.length];
      v.skin = skin;
      const P = v.parts;
      P.body = box(0.5, 0.7, 0.26, skin);
      P.body.position.y = 0.95;
      P.head = new THREE.Group();
      P.head.position.y = 1.3;
      const head = box(0.48, 0.48, 0.48, skin);
      head.position.y = 0.24;
      P.head.add(head);
      P.headgear = box(0.52, 0.2, 0.52, 0x000000);
      P.headgear.position.y = 0.42;
      P.headgear.visible = false;
      P.head.add(P.headgear);
      for (const ex of [-0.11, 0.11]) {
        const eye = box(0.08, 0.06, 0.02, 0x2a2a3a);
        eye.position.set(ex, 0.28, -0.245);
        P.head.add(eye);
      }
      P.armL = box(0.2, 0.7, 0.2, skin, true);
      P.armR = box(0.2, 0.7, 0.2, skin, true);
      P.armL.position.set(-0.35, 1.3, 0);
      P.armR.position.set(0.35, 1.3, 0);
      P.legL = box(0.23, 0.6, 0.23, 0xb8a888, true);
      P.legR = box(0.23, 0.6, 0.23, 0xb8a888, true);
      P.legL.position.set(-0.13, 0.6, 0);
      P.legR.position.set(0.13, 0.6, 0);
      P.held = new THREE.Group();
      P.held.position.set(0, -0.62, -0.15);
      P.armR.add(P.held);
      for (const k of ['body', 'head', 'armL', 'armR', 'legL', 'legR']) r.add(P[k]);
      v.label = makeLabel(e.n ?? '?');
      v.label.position.y = 2.15;
      r.add(v.label);
      this.dressPlayer(v, e);
    } else if (e.k === 'a') {
      buildAnimal(v, e.n ?? 'boar');
    } else if (e.k === 'i') {
      const d = tryItemDef(e.n ?? '');
      const c = box(0.28, 0.28, 0.28, d?.icon.c1 ?? 0xffffff);
      c.position.y = 0.2;
      v.parts.cube = c;
      r.add(c);
    } else if (e.k === 'c') {
      const animal = (e.f ?? 0) & 1;
      if (animal) {
        buildAnimal(v, e.n ?? 'boar');
        v.root.rotation.z = Math.PI / 2;
        v.root.position.y = 0.3;
      } else {
        const bag = box(1.6, 0.32, 0.55, 0x3a4a32);
        bag.position.y = 0.16;
        r.add(bag);
        const strap = box(1.62, 0.06, 0.57, 0x222222);
        strap.position.set(0, 0.2, 0);
        r.add(strap);
      }
    } else if (e.k === 'x') {
      const d = tryItemDef(e.n ?? '');
      const b = box(0.22, 0.14, 0.3, d?.icon.c1 ?? 0x555555);
      r.add(b);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      led.position.y = 0.1;
      v.parts.led = led;
      r.add(led);
    }
  }

  private dressPlayer(v: EntityView, e: EntSnap) {
    const P = v.parts;
    const w = e.w ?? [];
    const col = (i: number) => (w[i] ? tryItemDef(w[i])?.icon.c1 : undefined);
    // wear slots: head, torso, vest, legs, feet, hands
    const torso = col(2) ?? col(1);
    const skin = v.skin;
    setColor(P.body, torso ?? skin);
    setColor(P.armL, col(1) ?? skin);
    setColor(P.armR, col(1) ?? skin);
    const legs = col(3) ?? 0xb8a888;
    setColor(P.legL, legs);
    setColor(P.legR, legs);
    P.headgear.visible = !!col(0);
    if (col(0)) setColor(P.headgear, col(0)!);
    // held item
    P.held.clear();
    const h = e.h ? tryItemDef(e.h) : undefined;
    if (h) P.held.add(heldModel(h.icon.shape, h.icon.c1, h.icon.c2 ?? h.icon.c1));
    v.wearSig = w.join(',');
    v.heldId = e.h ?? '';
  }

  // ------------------------------------------------------------ per frame
  update(serverNowMs: number, dt: number, camPos: THREE.Vector3) {
    this.clock += dt;
    const renderT = serverNowMs - 110;
    for (const v of this.views.values()) {
      const s = v.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let i = s.length - 1; i > 0; i--) {
        if (s[i - 1].t <= renderT) {
          a = s[i - 1];
          b = s[i];
          break;
        }
      }
      const k = b.t > a.t ? Math.max(0, Math.min(1.2, (renderT - a.t) / (b.t - a.t))) : 1;
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
      let dyaw = b.yaw - a.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const yaw = a.yaw + dyaw * Math.min(1, k);
      const pitch = a.pitch + (b.pitch - a.pitch) * Math.min(1, k);
      const flags = v.last.f ?? 0;
      v.root.position.set(x, y, z);
      if (v.kind === 'p') this.animatePlayer(v, yaw, pitch, flags, dt, camPos);
      else if (v.kind === 'a') this.animateAnimal(v, yaw, flags, dt);
      else if (v.kind === 'i') {
        v.parts.cube.rotation.y = this.clock * 1.5 + v.id;
        v.parts.cube.position.y = 0.25 + Math.sin(this.clock * 2 + v.id) * 0.05;
      } else if (v.kind === 'x' && v.parts.led) {
        v.parts.led.visible = Math.floor(this.clock * 4) % 2 === 0;
      }
    }
  }

  private animatePlayer(v: EntityView, yaw: number, pitch: number, f: number, dt: number, cam: THREE.Vector3) {
    const P = v.parts;
    const sleeping = (f & 8) !== 0;
    v.root.rotation.set(0, yaw, sleeping ? Math.PI / 2 : 0);
    if (sleeping) v.root.position.y += 0.3;
    const moving = (f & 2) !== 0;
    const crouch = (f & 1) !== 0;
    const attacking = (f & 4) !== 0;
    v.anim += dt * (moving ? 9 : 0);
    if (!moving) v.anim *= 0.8;
    const sw = Math.sin(v.anim) * (moving ? 0.7 : 0);
    P.legL.rotation.x = sw;
    P.legR.rotation.x = -sw;
    P.armL.rotation.x = -sw * 0.8;
    P.armR.rotation.x = attacking ? -1.4 + Math.sin(this.clock * 30) * 0.3 : P.held.children.length ? -0.6 : sw * 0.8;
    P.head.rotation.x = -pitch * 0.8;
    const cy = crouch ? -0.25 : 0;
    P.body.position.y = 0.95 + cy;
    P.body.rotation.x = crouch ? 0.35 : 0;
    P.head.position.y = 1.3 + cy;
    P.armL.position.y = P.armR.position.y = 1.3 + cy;
    if (v.label) v.label.visible = !sleeping && v.root.position.distanceTo(cam) < 18;
  }

  private animateAnimal(v: EntityView, yaw: number, f: number, dt: number) {
    v.root.rotation.y = yaw;
    const moving = (f & 2) !== 0;
    v.anim += dt * (moving ? ((f & 4) ? 14 : 7) : 0);
    const sw = Math.sin(v.anim) * (moving ? 0.6 : 0);
    const legs = ['legFL', 'legFR', 'legBL', 'legBR'];
    legs.forEach((k, i) => {
      if (v.parts[k]) v.parts[k].rotation.x = i % 3 === 0 ? sw : -sw;
    });
  }
}

function setColor(o: THREE.Object3D, color: number) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = mat(color);
  });
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 256, 48);
  g.font = 'bold 28px monospace';
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 25);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.2, 0.225, 1);
  return s;
}

function buildAnimal(v: EntityView, species: string) {
  const r = v.root;
  const P = v.parts;
  const spec: Record<string, { body: [number, number, number]; legH: number; color: number; dark: number; head: [number, number, number] }> = {
    stag: { body: [0.5, 0.55, 1.15], legH: 0.75, color: 0x9a6a3e, dark: 0x5a3a20, head: [0.3, 0.32, 0.45] },
    boar: { body: [0.55, 0.55, 1.0], legH: 0.35, color: 0x4a3a2e, dark: 0x2a2018, head: [0.42, 0.4, 0.45] },
    wolf: { body: [0.38, 0.42, 0.95], legH: 0.5, color: 0x8a8a8e, dark: 0x5a5a60, head: [0.32, 0.3, 0.42] },
    bear: { body: [0.9, 0.85, 1.5], legH: 0.55, color: 0x5a3a24, dark: 0x3a2414, head: [0.55, 0.5, 0.55] },
  };
  const s = spec[species] ?? spec.boar;
  const [bw, bh, bl] = s.body;
  const body = box(bw, bh, bl, s.color);
  body.position.y = s.legH + bh / 2;
  r.add(body);
  const head = box(s.head[0], s.head[1], s.head[2], s.color);
  head.position.set(0, s.legH + bh * 0.85, -bl / 2 - s.head[2] * 0.35);
  r.add(head);
  const snout = box(s.head[0] * 0.6, s.head[1] * 0.45, 0.15, s.dark);
  snout.position.set(0, s.legH + bh * 0.72, -bl / 2 - s.head[2] * 0.8);
  r.add(snout);
  if (species === 'stag') {
    for (const sx of [-1, 1]) {
      const a1 = box(0.05, 0.4, 0.05, 0xd8c8a0);
      a1.position.set(sx * 0.12, s.legH + bh + 0.45, -bl / 2 - 0.1);
      a1.rotation.z = sx * 0.4;
      r.add(a1);
      const a2 = box(0.05, 0.25, 0.05, 0xd8c8a0);
      a2.position.set(sx * 0.25, s.legH + bh + 0.6, -bl / 2 - 0.15);
      a2.rotation.x = -0.5;
      r.add(a2);
    }
  }
  if (species === 'boar') {
    for (const sx of [-1, 1]) {
      const t = box(0.05, 0.12, 0.05, 0xeeeedd);
      t.position.set(sx * 0.14, s.legH + bh * 0.62, -bl / 2 - s.head[2] * 0.85);
      r.add(t);
    }
  }
  if (species === 'wolf') {
    const tail = box(0.1, 0.1, 0.4, s.dark);
    tail.position.set(0, s.legH + bh * 0.8, bl / 2 + 0.15);
    tail.rotation.x = 0.5;
    r.add(tail);
    for (const sx of [-1, 1]) {
      const ear = box(0.08, 0.12, 0.05, s.dark);
      ear.position.set(sx * 0.1, s.legH + bh + 0.12, -bl / 2 - 0.05);
      r.add(ear);
    }
  }
  const lw = species === 'bear' ? 0.26 : 0.14;
  const legs: Array<[string, number, number]> = [['legFL', -1, -1], ['legFR', 1, -1], ['legBL', -1, 1], ['legBR', 1, 1]];
  for (const [k, sx, sz] of legs) {
    const leg = box(lw, s.legH, lw, s.dark, true);
    leg.position.set(sx * (bw / 2 - lw / 2), s.legH, sz * (bl / 2 - lw));
    P[k] = leg;
    r.add(leg);
  }
}

/** Third-person held item from boxes, by icon shape. */
export function heldModel(shape: string, c1: number, c2: number): THREE.Object3D {
  const g = new THREE.Group();
  const add = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, rx = 0) => {
    const b = box(w, h, d, c);
    b.position.set(x, y, z);
    b.rotation.x = rx;
    g.add(b);
  };
  switch (shape) {
    case 'pistol': add(0.08, 0.1, 0.3, c1, 0, 0, -0.1); add(0.07, 0.18, 0.08, c2, 0, -0.1, 0.02); break;
    case 'rifle': add(0.08, 0.1, 0.9, c1, 0, 0, -0.3); add(0.07, 0.16, 0.1, c2, 0, -0.1, 0.05); add(0.06, 0.12, 0.25, c2, 0, -0.02, 0.22); break;
    case 'shotgun': add(0.1, 0.1, 0.8, c1, 0, 0, -0.25); add(0.08, 0.14, 0.25, c2, 0, -0.04, 0.2); break;
    case 'bow': add(0.04, 0.9, 0.06, c1, 0, 0, -0.1); add(0.01, 0.85, 0.01, c2, 0, 0, -0.02); break;
    case 'crossbow': add(0.5, 0.05, 0.06, c1, 0, 0, -0.35); add(0.08, 0.08, 0.6, c2, 0, 0, -0.15); break;
    case 'axe': add(0.05, 0.05, 0.6, c1, 0, 0, -0.2); add(0.05, 0.2, 0.12, c2, 0, 0.08, -0.48); break;
    case 'pick': add(0.05, 0.05, 0.6, c1, 0, 0, -0.2); add(0.05, 0.08, 0.3, c2, 0, 0.0, -0.5, Math.PI / 2); break;
    case 'hammer': add(0.05, 0.05, 0.45, c1, 0, 0, -0.15); add(0.12, 0.12, 0.2, c2, 0, 0, -0.4); break;
    case 'spear': add(0.05, 0.05, 1.4, c1, 0, 0, -0.4); add(0.06, 0.06, 0.15, 0xaaaaaa, 0, 0, -1.15); break;
    case 'blade': add(0.03, 0.08, 0.55, c1, 0, 0, -0.3); add(0.05, 0.05, 0.15, c2, 0, 0, 0.05); break;
    case 'torch': add(0.06, 0.06, 0.4, c1, 0, 0, -0.1); add(0.09, 0.09, 0.09, c2, 0, 0, -0.33); break;
    case 'rock': add(0.18, 0.15, 0.2, c1); break;
    default: add(0.18, 0.18, 0.18, c1);
  }
  return g;
}
