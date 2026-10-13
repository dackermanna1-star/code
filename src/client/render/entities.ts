import * as THREE from 'three';
import { tryItemDef } from '../../shared/data/items';
import type { EntSnap } from '../../shared/net/protocol';
import { hash4 } from '../../shared/math';
import { buildAnimalRig, buildHumanoidRig, hairFor, playerOutfit, SCAVENGER_OUTFIT, speciesOf, type Rig } from './creatures';
import { buildHeld } from './helditems';
import { blockCube } from './blockitems';
import { hurtMaterial } from './voxelmodel';

/**
 * Blocky entity models (players, wildlife, scavenger NPCs, drops, corpses,
 * explosives) with snapshot interpolation ~100 ms in the past and
 * procedural animation (gaits driven by the interpolated ground speed,
 * head bob/grazing, tail wag, aiming poses, hurt flash).
 */

const SKIN = [0xe0b48c, 0xc68e64, 0x8d5a3c, 0xf1c9a5, 0xa86f4c];
const TAU = Math.PI * 2;

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
  /** Animated skeleton (players, animals, scavengers, corpses). */
  rig: Rig | null = null;
  /** Item pitch for the third-person held item (radians, world). */
  heldPitch = 0;
  seed = 0;
  speed = 0;
  private px = NaN;
  private pz = NaN;
  moveBlend = 0;
  runBlend = 0;
  aimBlend = 0;
  hurt = 0;
  tinted = false;
  flames: THREE.Object3D[] = [];
  constructor(public id: number, public kind: EntSnap['k'], first: EntSnap) {
    this.last = first;
    this.seed = (hash4(id, 77) % 1000) / 159;
  }

  /** Smoothed horizontal speed from the interpolated position (m/s). */
  trackSpeed(x: number, z: number, dt: number) {
    if (dt > 0 && this.px === this.px) {
      const v = Math.min(14, Math.hypot(x - this.px, z - this.pz) / dt);
      this.speed += (v - this.speed) * Math.min(1, dt * 8);
    }
    this.px = x;
    this.pz = z;
  }
}

/** Third-person held item from boxes, by icon shape (grip at origin, pointing -Z). */
export function heldModel(shape: string, c1: number, c2: number): THREE.Object3D {
  return buildHeld(shape, c1, c2);
}

const TOOLISH = new Set(['axe', 'pick', 'hammer', 'blade', 'spear', 'rock']);
const GUNS = new Set(['pistol', 'rifle', 'shotgun', 'crossbow', 'bow']);
let ledMat: THREE.MeshBasicMaterial | null = null;
let ledGeo: THREE.BoxGeometry | null = null;

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
    } else if (e.hp !== undefined && v.last.hp !== undefined && e.hp < v.last.hp - 1e-3) {
      v.hurt = 0.28;
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
  private setRig(v: EntityView, rig: Rig) {
    if (v.rig) v.root.remove(v.rig.inst.root);
    v.rig = rig;
    v.tinted = false;
    v.root.add(rig.inst.root);
    v.parts = { ...rig.inst.nodes };
  }

  private build(v: EntityView, e: EntSnap) {
    const r = v.root;
    if (e.k === 'p') {
      v.skin = SKIN[hash4(e.n?.length ?? 0, e.n?.charCodeAt(0) ?? 0) % SKIN.length];
      v.label = makeLabel(e.n ?? '?');
      v.label.position.y = 2.15;
      r.add(v.label);
      this.dressPlayer(v, e);
    } else if (e.k === 'a') {
      const sp = speciesOf(e.n);
      if (sp === 'scavenger') {
        this.setRig(v, buildHumanoidRig(SCAVENGER_OUTFIT));
        v.rig!.held!.add(buildHeld('pistol', 0x6a6a72, 0x8a6034));
        v.heldPitch = 0;
      } else this.setRig(v, buildAnimalRig(sp ?? 'boar'));
    } else if (e.k === 'i') {
      const d = tryItemDef(e.n ?? '');
      const holder = new THREE.Group();
      let model: THREE.Object3D | null = d?.placeBlock && d.icon.shape === 'block' ? blockCube(d.placeBlock) : null;
      if (model) model.scale.setScalar(0.28);
      else {
        model = buildHeld(d?.icon.shape ?? 'block', d?.icon.c1 ?? 0xffffff, d?.icon.c2 ?? d?.icon.c1 ?? 0xffffff);
        fitTo(model, 0.4, 0.62);
      }
      holder.add(model);
      holder.position.y = 0.25;
      v.parts.cube = holder;
      r.add(holder);
    } else if (e.k === 'c') {
      const animal = ((e.f ?? 0) & 1) !== 0;
      const sp = speciesOf(e.n);
      if (animal) this.setRig(v, buildAnimalRig(sp && sp !== 'scavenger' ? sp : 'boar', true));
      else if (sp === 'scavenger') this.setRig(v, buildHumanoidRig({ ...SCAVENGER_OUTFIT, dead: true }));
      else {
        const skin = SKIN[hash4(e.n?.length ?? 0, e.n?.charCodeAt(0) ?? 0) % SKIN.length];
        this.setRig(v, buildHumanoidRig(playerOutfit(skin, hairFor(hash4(e.n?.length ?? 0, 3)), [], true)));
      }
      // corpses have no yaw: give each a stable random heading
      r.rotation.y = (hash4(e.id, 911) / 4294967296) * TAU;
    } else if (e.k === 'x') {
      const d = tryItemDef(e.n ?? '');
      const b = buildHeld(d?.icon.shape ?? 'charge', d?.icon.c1 ?? 0x555555, d?.icon.c2 ?? d?.icon.c1 ?? 0x555555);
      b.position.y = 0.06;
      r.add(b);
      ledMat ??= new THREE.MeshBasicMaterial({ color: 0xff2020 });
      ledGeo ??= new THREE.BoxGeometry(0.05, 0.05, 0.05);
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.y = 0.2;
      v.parts.led = led;
      r.add(led);
    }
  }

  private dressPlayer(v: EntityView, e: EntSnap) {
    const w = e.w ?? [];
    const wear = [0, 1, 2, 3, 4, 5].map((i) => {
      const d = w[i] ? tryItemDef(w[i]) : undefined;
      return d ? { key: d.key, c: d.icon.c1 } : undefined;
    });
    const hair = hairFor(hash4(e.n?.length ?? 0, e.n?.charCodeAt(1) ?? 5));
    const rig = buildHumanoidRig(playerOutfit(v.skin, hair, wear));
    this.setRig(v, rig);
    const h = e.h ? tryItemDef(e.h) : undefined;
    v.flames = [];
    if (h) {
      const m = buildHeld(h.icon.shape, h.icon.c1, h.icon.c2 ?? h.icon.c1);
      m.scale.setScalar(0.8);
      rig.held!.add(m);
      v.flames = m.userData.flames ?? [];
      const s = h.icon.shape;
      v.heldPitch = s === 'torch' ? 1.2 : TOOLISH.has(s) ? 0.45 : 0;
    }
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
      if (v.kind === 'p' || v.kind === 'a') v.trackSpeed(x, z, dt);
      if (v.kind === 'p') this.animatePlayer(v, yaw, pitch, flags, dt, camPos);
      else if (v.kind === 'a') {
        if (v.rig?.biped) this.animateBiped(v, yaw, 0, flags, dt, false);
        else this.animateAnimal(v, yaw, flags, dt);
      } else if (v.kind === 'i') {
        v.parts.cube.rotation.y = this.clock * 1.5 + v.id;
        v.parts.cube.position.y = 0.28 + Math.sin(this.clock * 2 + v.id) * 0.05;
      } else if (v.kind === 'x' && v.parts.led) {
        v.parts.led.visible = Math.floor(this.clock * 4) % 2 === 0;
      }
      if (v.hurt > 0 || v.tinted) {
        v.hurt -= dt;
        setTint(v, v.hurt > 0);
      }
    }
  }

  private animatePlayer(v: EntityView, yaw: number, pitch: number, f: number, dt: number, cam: THREE.Vector3) {
    const sleeping = (f & 8) !== 0;
    v.root.rotation.set(0, yaw, sleeping ? Math.PI / 2 : 0);
    if (sleeping) v.root.position.y += 0.3;
    this.animateBiped(v, yaw, pitch, f, dt, true);
    if (v.label) v.label.visible = !sleeping && v.root.position.distanceTo(cam) < 18;
  }

  /** Humanoids: players and scavenger NPCs (flag 4 = aiming for NPCs, swinging for players). */
  private animateBiped(v: EntityView, yaw: number, pitch: number, f: number, dt: number, player: boolean) {
    const r = v.rig;
    if (!r) return;
    if (!player) v.root.rotation.y = yaw;
    const moving = (f & 2) !== 0;
    const crouch = player && (f & 1) !== 0;
    const gun = player ? GUNS.has(tryItemDef(v.heldId)?.icon.shape ?? '') : true;
    const aiming = player ? gun : (f & 4) !== 0;
    const attacking = player && !gun && (f & 4) !== 0;
    const spd = Math.max(v.speed, moving ? r.walk * 0.9 : 0);
    v.moveBlend += ((spd > 0.25 ? 1 : 0) - v.moveBlend) * Math.min(1, dt * 8);
    v.aimBlend += ((aiming ? 1 : 0) - v.aimBlend) * Math.min(1, dt * 7);
    v.anim += Math.min(14, (spd / (r.legLen * 2.3)) * TAU) * dt;
    const mb = v.moveBlend, ab = v.aimBlend;
    const amp = Math.min(0.85, 0.35 + spd * 0.12) * mb;
    const sw = Math.sin(v.anim) * amp;
    const legs = r.legs, arms = r.arms;
    legs[0].rotation.x = sw;
    legs[1].rotation.x = -sw;
    const breathe = Math.sin(this.clock * 1.6 + v.seed) * 0.03;
    const cy = crouch ? -0.22 : 0;
    r.body!.position.y = r.bodyY + cy + Math.abs(Math.cos(v.anim)) * 0.035 * mb;
    r.body!.rotation.x = crouch ? -0.35 : 0;
    // arms: relaxed swing vs. two-handed aim
    const aimX = Math.PI / 2 + (player ? pitch : 0.05);
    const relaxR = player && v.heldId ? 0.35 + sw * 0.2 : -sw * 0.9;
    let armRX = relaxR + (aimX - relaxR) * ab;
    const armLX = sw * 0.9 * (1 - ab) + (aimX - 0.05) * ab;
    if (attacking) armRX = 1.5 + Math.sin(this.clock * 16) * 0.7;
    arms[1].rotation.set(armRX, 0.15 * ab, 0.04 + breathe * (1 - ab));
    arms[0].rotation.set(armLX, -0.75 * ab, -0.04 - breathe * (1 - ab));
    const relaxPitch = player ? v.heldPitch : -0.55;
    if (r.held) r.held.rotation.x = attacking ? -0.4 : -armRX + relaxPitch * (1 - ab);
    // head: players look where they aim; NPCs glance around when idle
    r.head.rotation.x = player ? Math.max(-1.2, Math.min(1.2, pitch)) * 0.85 : -0.05 * (1 - ab);
    r.head.rotation.y = player ? 0 : Math.sin(this.clock * 0.5 + v.seed * 3) * 0.45 * (1 - ab) * (1 - mb * 0.6);
    for (const fl of v.flames) fl.scale.setScalar(1 + Math.sin(this.clock * 23 + fl.id) * 0.08 + Math.sin(this.clock * 37) * 0.05);
  }

  private animateAnimal(v: EntityView, yaw: number, f: number, dt: number) {
    const r = v.rig;
    if (!r) return;
    v.root.rotation.y = yaw;
    const moving = (f & 2) !== 0;
    const alert = (f & 4) !== 0;
    const nominal = moving ? (alert ? r.run : r.walk) : 0;
    const spd = Math.max(v.speed, nominal * 0.85);
    v.moveBlend += ((spd > 0.2 ? 1 : 0) - v.moveBlend) * Math.min(1, dt * 7);
    v.runBlend += ((spd > (r.walk + r.run) * 0.5 ? 1 : 0) - v.runBlend) * Math.min(1, dt * 5);
    v.aimBlend += ((alert ? 1 : 0) - v.aimBlend) * Math.min(1, dt * 4);
    v.anim += Math.min(22, (spd / (r.legLen * 2.6)) * TAU) * dt;
    const p = v.anim, mb = v.moveBlend, rb = v.runBlend, al = v.aimBlend;
    const amp = (0.45 + 0.4 * rb) * mb;
    // trot (diagonal pairs) blending into a gallop (front pair / back pair)
    const L = r.legs;
    L[0].rotation.x = Math.sin(p) * amp;
    L[1].rotation.x = Math.sin(p + Math.PI + (0.5 - Math.PI) * rb) * amp;
    L[2].rotation.x = Math.sin(p + Math.PI) * amp;
    L[3].rotation.x = Math.sin(p + (Math.PI + 0.5) * rb) * amp;
    const body = r.body!;
    body.position.y = r.bodyY + Math.abs(Math.sin(p)) * 0.035 * mb * (1 + rb);
    body.rotation.x = Math.cos(p) * 0.07 * rb;
    body.rotation.z = Math.sin(p) * 0.035 * mb * (1 - rb);
    // head: bob while moving, graze / look around when idle, lowered when hunting
    const idle = 1 - mb;
    const g = r.graze ? smooth01((Math.sin(this.clock * 0.23 + v.seed * 2.1) - 0.35) / 0.4) * idle * (1 - al) : 0;
    const huntDip = r.graze === 0 ? -0.18 * al : 0;
    r.head.rotation.x = r.headRX + Math.sin(p * 2) * 0.06 * mb - r.graze * g + huntDip + Math.sin(this.clock * 1.3 + v.seed) * 0.02;
    r.head.rotation.y = Math.sin(this.clock * 0.45 + v.seed * 3) * 0.35 * idle * (1 - g);
    if (r.jaw) {
      // bears roar when angry
      const want = al > 0.5 ? -0.32 - 0.18 * Math.max(0, Math.sin(this.clock * 2.6 + v.seed)) : -0.03 - g * 0.15;
      r.jaw.rotation.x += (want - r.jaw.rotation.x) * Math.min(1, dt * 10);
    }
    if (r.tail) {
      const wag = r.tailRX ? 0.25 + 0.35 * mb : 0.4;
      r.tail.rotation.y = Math.sin(this.clock * (r.tailRX ? 4 : 7) + v.seed) * wag * (1 - al * 0.7);
      r.tail.rotation.x = r.tailRX * (1 - al * 0.85) + Math.sin(p) * 0.15 * mb;
    }
    for (let i = 0; i < r.ears.length; i++) {
      const twitch = Math.max(0, Math.sin(this.clock * 0.9 + v.seed * 5 + i * 2.3) - 0.92) * 6;
      r.ears[i].rotation.x = -0.35 * al + twitch * 0.3;
      r.ears[i].rotation.z = (i ? -1 : 1) * (0.25 * al + twitch * 0.15);
    }
  }
}

function smooth01(t: number) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** Uniformly scale an object so its largest dimension lands in [min, max] (about half its real size), centred on the origin. */
function fitTo(o: THREE.Object3D, min: number, max: number) {
  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3());
  const big = Math.max(0.05, s.x, s.y, s.z);
  const k = Math.min(max, Math.max(min, big * 0.55)) / big;
  const c = b.getCenter(new THREE.Vector3());
  o.scale.setScalar(k);
  o.position.set(-c.x * k, -c.y * k, -c.z * k);
}

/** Swap all meshes of a view to their red "hurt" material (or back). */
function setTint(v: EntityView, on: boolean) {
  if (v.tinted === on) return;
  v.tinted = on;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.glow) return;
    if (on) {
      m.userData.mat0 = m.material;
      m.material = hurtMaterial(m.material as THREE.Material);
    } else if (m.userData.mat0) m.material = m.userData.mat0;
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
