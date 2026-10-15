// Zombie rig assembly: look → body type, outfit, skeleton, geometry, the
// detachable pieces (prop, riot plates, apron, medal), ragdoll spec and the
// animation function.
import * as THREE from 'three';
import { PLATE_CHEST, PLATE_HELMET, PLATE_SHIELD, type ZombieKind } from '../../../config/ids';
import { RigBuilder, animator } from '../common';
import { MATERIALS, applyCharred, charredLevel, charredMaterial } from '../kit';
import type { AnimInput, BoneSpec, ZombieRig } from '../types';
import { createZombiePose } from './anim';
import { DIMS, HEAD, buildBody, humanSpec, makeSkeleton, type BodyType } from './body';
import { outfit } from './dress';
import { decodeLook, skinPal, type Look } from './looks';

export interface ZombieRigExt extends ZombieRig {
  /** Decoded look (outfit, palette, personality). */
  readonly lookInfo: Look;
  /** Jogger only: show the gold medal (the 40th Marathon runner). */
  setMedal?(on: boolean): void;
  /** Glowing eyes on/off (call with false when the body is dead for good, before baking). */
  setEyeGlow(on: boolean): void;
  /**
   * Single-body ragdoll specs for the detachable pieces, in the piece's own
   * local frame (use with a one-bone fake rig, like Seal Hunter's dropped cub):
   * the hand-held prop, each riot plate (by PLATE_* flag) and Big Dave's apron.
   */
  propSpec?: BoneSpec;
  plateSpec?: Record<number, BoneSpec>;
  apronSpec?: BoneSpec;
  medal?: THREE.Object3D;
}

/** Bloaters are the fat body scaled up by this factor; Big Dave even more (≈3 m to the top of his head). */
export const BLOATER_SCALE = 1.27;
export const BIG_DAVE_SCALE = 1.9;
/** Riot brutes: the bulky body a little bigger than a shambler (≈1.95 m, the logic height). */
export const RIOT_SCALE = 1.06;

export function bodyTypeFor(kind: ZombieKind, look: Look): BodyType {
  switch (kind) {
    case 'jogger':
      return 'slim';
    case 'bloater':
    case 'bigdave':
      return 'fat';
    case 'riot':
      return 'bulky';
    default:
      return look.outfit === 'granny' ? 'granny' : 'normal';
  }
}

export function createZombie(kind: ZombieKind, lookSeed: number): ZombieRigExt {
  const look = decodeLook(kind, lookSeed >>> 0);
  const d = DIMS[bodyTypeFor(kind, look)];
  const scale = kind === 'bigdave' ? BIG_DAVE_SCALE : kind === 'bloater' ? BLOATER_SCALE : kind === 'riot' ? RIOT_SCALE : 1;
  const sp = skinPal(look.tint);
  const { dress, extras, hat } = outfit(look, d, sp);
  const rb = new RigBuilder(`zombie:${look.key}`);
  rb.root.name = `zombie_${kind}`;
  const B = makeSkeleton(rb, d, scale);
  buildBody(rb, B, d, sp, dress);

  // ---- hand-held prop
  let prop: THREE.Group | undefined;
  if (extras.prop) {
    prop = new THREE.Group();
    prop.name = `prop_${extras.prop.kind}`;
    prop.position.set(...extras.prop.at);
    if (extras.prop.rot) prop.rotation.set(...extras.prop.rot);
    B[extras.prop.bone].add(prop);
    rb.part(prop, extras.prop.build);
  }
  // ---- riot armour
  let plates: Record<number, THREE.Object3D> | undefined;
  let plateMask = PLATE_HELMET | PLATE_SHIELD | PLATE_CHEST;
  if (extras.plates) {
    plates = {};
    for (const pl of extras.plates) {
      const g = new THREE.Group();
      g.name = pl.flag === PLATE_HELMET ? 'helmet' : pl.flag === PLATE_SHIELD ? 'shield' : 'chestPlate';
      if (pl.at) g.position.set(...pl.at);
      if (pl.rot) g.rotation.set(...pl.rot);
      B[pl.bone].add(g);
      rb.part(g, pl.build);
      plates[pl.flag] = g;
    }
  }
  // ---- Big Dave's apron
  let apron: THREE.Group | undefined;
  if (extras.apron) {
    apron = new THREE.Group();
    apron.name = 'apron';
    B.pelvis.add(apron);
    rb.part(apron, extras.apron);
  }
  // ---- gold medal
  let medal: THREE.Group | undefined;
  if (extras.medal) {
    medal = new THREE.Group();
    medal.name = 'medal';
    medal.visible = false;
    B.chest.add(medal);
    rb.part(medal, extras.medal);
  }

  // ---- ragdoll
  const massK = kind === 'bigdave' ? 5 : kind === 'bloater' ? 1.5 : kind === 'riot' ? 1.3 : kind === 'jogger' ? 0.85 : 1;
  Object.assign(rb.spec, humanSpec(d, massK));

  // ---- animation
  const pose = createZombiePose({
    B,
    d,
    look,
    kind,
    scale,
    root: rb.root,
    prop: prop && extras.prop ? { obj: prop, kind: extras.prop.kind } : undefined,
    apron,
    plates: plates ? () => plateMask : undefined,
    shield: plates?.[PLATE_SHIELD],
  });
  const run = animator(rb.bones, pose, 0.22);
  let charred = 0;
  /** Quantised level last applied (charredMaterial has 8 levels): re-traverse only when it changes. */
  let appliedLevel = 0;
  const setCharred = (t: number, force = false) => {
    const v = Math.max(0, Math.min(1, t));
    charred = v;
    const lvl = charredLevel(v);
    if (lvl === appliedLevel && !force) return;
    appliedLevel = lvl;
    applyCharred(rb.root, v);
  };
  const animate = (a: AnimInput) => {
    const c = a.params?.charred;
    if (typeof c === 'number') setCharred(c);
    run(a);
  };

  const height = (d.hipY + d.chestY + d.neckY + (HEAD.top + hat) * d.head) * scale;
  const base = rb.finish('head', animate);
  const setEyeGlow = (on: boolean) => {
    for (const m of eyeMeshes) {
      m.userData.matClass = on ? 'glow' : 'eye';
      m.material = on ? MATERIALS.glow : charred > 0 ? charredMaterial('eye', charred) : MATERIALS.eye;
    }
  };
  const propSpecs: Record<string, BoneSpec> = {
    tray: { shape: 'box', size: [0.2, 0.05, 0.2], offset: [0, 0.04, 0], mass: 1.5 },
    handbag: { shape: 'box', size: [0.1, 0.1, 0.045], offset: [0, -0.17, 0], mass: 1.2 },
    fish: { shape: 'box', size: [0.055, 0.17, 0.03], offset: [0, -0.2, 0], mass: 1 },
  };
  const hs = d.head;
  const rig: ZombieRigExt = {
    ...base,
    setEyeGlow,
    propSpec: extras.prop ? propSpecs[extras.prop.kind] : undefined,
    plateSpec: plates
      ? {
          [PLATE_HELMET]: { shape: 'sphere', size: [0.19 * hs], offset: [0, 0.19 * hs, 0], mass: 1.5 },
          [PLATE_CHEST]: { shape: 'box', size: [d.torsoD + 0.04, 0.19, d.torsoW * 0.95], offset: [0, 0.14, 0], mass: 4 },
          [PLATE_SHIELD]: { shape: 'box', size: [0.08, 0.64, 0.38], offset: [-0.08, 0, 0], mass: 6 },
        }
      : undefined,
    apronSpec: apron ? { shape: 'box', size: [0.16, 0.5, d.waistW + 0.05], offset: [d.waistD * 1.32 + 0.05, -0.05, 0], mass: 3 } : undefined,
    kind,
    look: lookSeed,
    lookInfo: look,
    height,
    setCharred,
    prop,
    apron,
    plates,
    medal,
  };
  if (plates) {
    rig.setPlates = (mask: number) => {
      plateMask = mask;
      for (const [flag, obj] of Object.entries(plates!)) obj.visible = (mask & Number(flag)) !== 0;
    };
  }
  if (medal) rig.setMedal = (on: boolean) => void (medal!.visible = on);
  const eyeMeshes: THREE.Mesh[] = [];
  B.head.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.matClass === 'glow' && m.parent === B.head) eyeMeshes.push(m);
  });
  animate({ state: kind === 'patient' ? 'carried' : 'walk', stateTime: 1, time: 0, distance: 0, speed: 0, dt: 0, params: {} });
  return rig;
}
