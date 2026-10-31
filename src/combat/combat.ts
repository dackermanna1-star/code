import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from './fighter';
import { HitInfo, HitResult, makeHit, Region } from './types';
import { B } from '../anim/skeleton';
import { angleDiff, chance, clamp, pick, rand, yawFromDir } from '../core/math';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Map limb codes from clip events to bones (contact points). */
const LIMB_BONE: Record<string, [number, [number, number, number]]> = {
  lh: [B.handL, [0, 0, 0]],
  rh: [B.handR, [0, 0, 0]],
  le: [B.farmL, [0, 0, 0]],
  re: [B.farmR, [0, 0, 0]],
  lk: [B.shinL, [0, 0, 0]],
  rk: [B.shinR, [0, 0, 0]],
  lf: [B.footL, [0, -0.03, 0.08]],
  rf: [B.footR, [0, -0.03, 0.08]],
  chest: [B.chest, [0, 0.05, 0.15]],
};

export class Combat {
  constructor(public game: Game) {}

  limbPoint(f: Fighter, limb: string, out: THREE.Vector3) {
    const lb = LIMB_BONE[limb] ?? LIMB_BONE.rh;
    _v2.set(lb[1][0], lb[1][1], lb[1][2]);
    return f.anim.boneLocalToWorld(lb[0], _v2, out);
  }

  /** Region point on victim. */
  regionPoint(v: Fighter, region: Region, out: THREE.Vector3) {
    const name = region === 'legs' ? 'legs' : region === 'back' ? 'back' : region;
    v.bodyPoint(name, out);
    return out;
  }

  /** Build a HitInfo for attacker->victim with a world contact point. */
  makeStrike(attacker: Fighter, victim: Fighter, p: Partial<HitInfo> & { limb?: string }) {
    const point = new THREE.Vector3();
    if (p.limb) this.limbPoint(attacker, p.limb, point);
    else this.regionPoint(victim, p.region ?? 'head', point);
    // snap contact onto victim region point if close (cleaner effects)
    const rp = this.regionPoint(victim, p.region ?? 'head', _v);
    if (point.distanceTo(rp) < 0.6) point.lerp(rp, 0.5);
    const dir = new THREE.Vector3(victim.x - attacker.x, 0, victim.z - attacker.z);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(attacker.yaw), 0, Math.cos(attacker.yaw));
    dir.normalize();
    return makeHit({ ...p, attacker, dir, point });
  }

  /** Apply common audiovisual feedback for a resolved hit. */
  feedback(attacker: Fighter | null, victim: Fighter, h: HitInfo, res: HitResult) {
    const g = this.game;
    const a = g.audio;
    const p = h.point;
    const s = h.strength;
    if (res === 'blocked' || res === 'parried') {
      a.play(res === 'parried' ? 'parry' : 'block', { pos: p, vol: 0.9 });
      if (h.kind === 'blade' || h.kind === 'blunt') a.play('sword_clash', { pos: p, vol: 0.7 });
      g.fx.impactFlash(p, 0.5, [1, 0.95, 0.85]);
      if (h.kind === 'blade') g.fx.sparks(p, h.dir.clone().negate().setY(0.4), 14);
      g.hitStop(0.035);
      g.cam.addTrauma(0.12);
      return;
    }
    if (res === 'dodged' || res === 'ignored') return;
    // ---- sounds
    switch (h.kind) {
      case 'punch':
      case 'palm':
        a.play(s > 0.65 ? 'punch_heavy' : 'punch_light', { pos: p });
        if (h.region === 'head' && s > 0.5 && chance(0.45)) a.play('face_crunch', { pos: p, vol: 0.55 });
        if (h.region !== 'head') a.play('body_hit', { pos: p, vol: 0.6 });
        break;
      case 'kick':
        a.play('kick', { pos: p });
        a.play(h.region === 'head' ? 'face_crunch' : 'body_hit', { pos: p, vol: 0.6 });
        break;
      case 'elbow':
      case 'knee':
        a.play('punch_heavy', { pos: p });
        a.play(h.region === 'head' ? 'face_crunch' : 'body_hit', { pos: p, vol: 0.75 });
        break;
      case 'blunt':
        a.play('club_hit', { pos: p });
        a.play('punch_heavy', { pos: p, vol: 0.6 });
        break;
      case 'blade':
        a.play('blade_flesh', { pos: p });
        a.play('squish', { pos: p, vol: 0.6 });
        break;
      case 'slam':
      case 'throw':
        a.play('body_fall', { pos: p });
        a.play('punch_heavy', { pos: p, vol: 0.7 });
        break;
      case 'stomp':
        a.play('kick', { pos: p });
        a.play('face_crunch', { pos: p, vol: 0.8 });
        break;
    }
    if (s > 0.6) a.thump(s, p);
    if (h.boneBreak) {
      a.play('bone_break', { pos: p, vol: 1 });
      a.crack(p);
    }
    if (res === 'killed') a.play('death', { pos: p, vol: 0.85, delay: 0.05 });
    else if (chance(0.35 + s * 0.3)) a.play('grunt_pain', { pos: p, vol: 0.7, delay: 0.04 });

    // ---- blood & wounds
    const head = h.region === 'head';
    let bleed = h.bleed * (0.6 + s * 0.6);
    if (h.boneBreak) bleed += 0.4;
    if (h.finisher) bleed += 0.5;
    const sprayDir = h.dir.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, head ? 0.35 : 0.15, 0)).normalize();
    if (bleed > 0.08) {
      g.fx.bloodSpray(p, sprayDir, Math.min(2, bleed), 2.5 + s * 2.5, head ? 0.55 : 0.4);
      victim.woundAt(p, 0, 0.03 + bleed * 0.035, Math.min(1, 0.5 + bleed * 0.5), head ? 0.08 + bleed * 0.1 : 0.04);
      victim.bleedRate = Math.min(6, victim.bleedRate + bleed * 1.2);
      // splatter onto attacker's fists/legs/clothes occasionally
      if (attacker && chance(0.5)) {
        attacker.woundAt(p, 2, 0.06 + bleed * 0.05, 0.8, 0);
      }
      // nearby bystanders get spattered
      for (const f of g.fighters) {
        if (f === victim || f === attacker || !f.alive) continue;
        _v.set(f.x - p.x, 0, f.z - p.z);
        const d = _v.length();
        if (d < 1.4 && _v.normalize().dot(sprayDir) > 0.4) {
          f.bodyPoint('chest', _v2);
          f.woundAt(_v2, 2, 0.08, 0.7, 0);
        }
      }
    }
    if (h.kind !== 'blade') {
      // bruise where struck
      victim.woundAt(p, 1, 0.05 + s * 0.04, Math.min(1, 0.35 + s * 0.4), 0);
    }
    if (head && s > 0.5) {
      g.fx.spit(p, sprayDir, 6 + Math.round(s * 6));
      if (s > 0.9 && chance(0.25)) g.fx.teeth(p, sprayDir, 1 + (chance(0.4) ? 1 : 0));
    }
    // ---- impact flash, hitstop, camera
    g.fx.impactFlash(p, Math.min(1.4, 0.3 + s * 0.6));
    const stop = h.finisher ? 0.12 : clamp(0.03 + s * 0.05, 0.03, 0.095);
    g.hitStop(stop);
    g.cam.addTrauma(clamp(0.08 + s * 0.22 + (h.finisher ? 0.25 : 0), 0, 0.8));
    g.cam.fovKick = -1.5 * s - (h.finisher ? 2 : 0);
    if (s > 0.85 || h.finisher || h.boneBreak) g.renderer.fx.chroma = Math.max(g.renderer.fx.chroma, 0.6 * s + (h.boneBreak ? 0.6 : 0));
    if (s > 1.0) g.arena.shakeLamps(p.x, p.z, s);
    victim.anim.hitImpulse(h.dir, s * (res === 'killed' ? 1.4 : 1), h.region);
  }

  /** Choose a hit reaction clip for a victim given the incoming hit. */
  reactionClip(v: Fighter, h: HitInfo): string {
    const fromYaw = yawFromDir(-h.dir.x, -h.dir.z); // direction the hit came from
    const rel = angleDiff(v.yaw, fromYaw);
    if (Math.abs(rel) > 2.1) return 'r_back';
    if (h.strength >= 1.0) return 'r_heavy';
    if (h.region === 'gut' || h.region === 'chest') return h.strength > 0.75 ? 'r_heavy' : 'r_gut';
    // head: lateral hooks snap sideways
    if (Math.abs(rel) > 0.35) return rel > 0 ? 'r_head_l_m' : 'r_head_l';
    return pick(['r_head_back', rel > 0 ? 'r_head_l_m' : 'r_head_l', 'r_head_back']);
  }

  /** Utility: impulse vector for ragdolls from a hit. */
  impulseFor(h: HitInfo, mass = 70) {
    const k = (1.4 + h.strength * 3.2 + (h.launch ?? 0) * 0.9) * mass * 0.55;
    return h.dir.clone().multiplyScalar(k).add(new THREE.Vector3(0, mass * (0.6 + h.strength * 1.0) * 0.55, 0));
  }

  rand = rand;
}
