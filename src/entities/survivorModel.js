// Third-person survivor model: character-specific rig, weapon-holding IK,
// locomotion, crouch, incapacitated / pinned / healing / reviving poses,
// ragdoll on death, and x-ray teammate silhouettes.
import * as THREE from 'three';
import { Body, Poser, Ragdoll, J, PROPS, animateHumanoid, poseLying } from './body.js';
import { buildHumanoid, RigModel } from './rig.js';
import { setCharacterDetail, prewarmCharacters } from './charlooks.js';
import { cloneModel } from '../combat/weaponModels.js';
import { clamp, damp } from '../core/math.js';

const MODEL_OF = {
  pistol: 'pistol', magnum: 'magnum', smg: 'smg', silencedSmg: 'silencedSmg', pumpShotgun: 'pumpShotgun', chromeShotgun: 'chromeShotgun',
  autoShotgun: 'autoShotgun', rifle: 'rifle', scar: 'scar', huntingRifle: 'huntingRifle', m60: 'm60', grenadeLauncher: 'grenadeLauncher',
  fireaxe: 'fireaxe', crowbar: 'crowbar', machete: 'machete', molotov: 'molotov', pipebomb: 'pipebomb', bile: 'bile', medkit: 'medkit', pills: 'pills', adrenaline: 'adrenaline',
};

// Look descriptor for a survivor: the id selects the character recipe in
// charlooks.js (sculpted head, clothing layers, painted atlases); the colour
// fields remain for any generic / modded characters without a recipe.
export function lookFor(char) {
  const b = char.body || {};
  return {
    id: char.look || char.id, skin: char.skin, shirt: b.shirt, pants: b.pants, shoes: b.shoes, hair: b.hair, female: !!b.female,
  };
}

export class SurvivorModel {
  constructor(game, s) {
    this.game = game;
    this.s = s;
    setCharacterDetail(game.quality?.texSize >= 512 ? 1024 : 512);
    const look = lookFor(s.char);
    const parts = buildHumanoid(look);
    // build the special infected assets in idle time so first spawns don't hitch
    prewarmCharacters(['hunter', 'smoker', 'boomer', 'witch', 'tank']);
    this.rig = new RigModel(game.scene, parts, { name: 'survivor:' + s.name, xray: s.isHuman ? null : new THREE.Color(0x3a7aff) });
    this.body = new Body(s.char.body.scale ?? 1, s.char.body.build ?? 1);
    this.poser = new Poser();
    this.phase = 0;
    this.weaponObj = null;
    this.weaponType = null;
    this.hidden = false;
    this.anim = {};
    this.ragdoll = null;
    this.shoveT = 0;
    this.speedS = 0;
    this._m = new THREE.Vector3();
    s.model = this;
  }
  setHidden(h) {
    this.hidden = h;
    this.rig.setVisible(!h);
    if (this.weaponObj) this.weaponObj.visible = !h;
  }
  setWeapon(type) {
    if (type === this.weaponType) return;
    this.weaponType = type;
    if (this.weaponObj) { this.weaponObj.parent?.remove(this.weaponObj); this.weaponObj = null; }
    const mt = MODEL_OF[type];
    if (!mt) return;
    const m = cloneModel(mt);
    if (!m) return;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.game.scene.add(m);
    m.visible = !this.hidden;
    this.weaponObj = m;
  }
  onEvent(e) {
    if (e === 'shove') this.shoveT = 0.35;
  }
  update(dt) {
    const s = this.s;
    const g = this.game;
    const b = this.body;
    if (s.dead) {
      if (!this.ragdoll) {
        this.ragdoll = new Ragdoll(b, s.phys.vx, 0, s.phys.vz);
        b.ragdoll = this.ragdoll;
        this.setWeapon(null);
        this.rig.setXray(false);
      }
      this.ragdoll.step(dt, g.level.col);
      this.rig.update(b);
      if (s.isHuman && this.hidden) this.setHidden(false);
      return;
    }
    if (this.ragdoll) { this.ragdoll = null; b.ragdoll = null; }
    b.storePrev();
    const sp = Math.hypot(s.phys.vx, s.phys.vz);
    this.speedS = damp(this.speedS, s.phys.onGround ? sp : 1.5, 10, dt);
    this.phase += dt * (this.speedS / (0.85 + this.speedS * 0.12)) * 2.2;
    this.shoveT = Math.max(0, this.shoveT - dt);
    // Facing: body yaw follows aim yaw (plus move direction when sprinting)
    const yaw = s.yaw;
    this.poser.frame(s.pos.x, s.pos.y, s.pos.z, yaw);
    const a = this.anim;
    const P = PROPS;
    a.time = g.time; a.seed = s.id * 7.3;
    // local velocity for strafing: use forward speed sign for phase direction
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const fwdSpeed = s.phys.vx * fx + s.phys.vz * fz;
    a.speed = this.speedS;
    a.phase = fwdSpeed < -0.3 ? -this.phase : this.phase;
    a.crouch = s.crouchT;
    a.lean = 0.02; a.runLean = 0.6; a.hunch = 0; a.sink = 0; a.legs = null;
    a.hitS = 0; a.hitF = 0; a.twitch = 0; a.sway = 0.012; a.twist = 0;
    a.headPitch = -s.pitch * 0.45;
    a.footS = 0; a.footF = 0;
    const item = s.activeItem;
    const wdef = s.weapon?.def;
    const scale = b.scale;
    const pitch = clamp(s.pitch + s.aimPitchOff, -1.2, 1.2);
    const cp = Math.cos(pitch), sp2 = Math.sin(pitch);
    const pivU = (1.4 - s.crouchT * 0.42) * scale, pivS = 0.1, pivF = 0.05;
    const along = (d, os, ou) => [pivS + os, pivU + sp2 * d + ou, pivF + cp * d];
    let handR, handL, poleL = null, poleR = null;
    let showWeapon = true;
    if (s.incapped) {
      a.legs = 'sit'; a.sink = 0.62; a.lean = -0.35; a.speed = 0; a.headPitch = -0.2;
      handR = [0.15, 0.62 + sp2 * 0.3, 0.45 * cp];
      handL = [-0.25, 0.08, -0.25];
      poleL = [-1, 0, 0.3];
    } else if (s.pinned && s.pinType === 'hunter') {
      poseLying(b, P, this.poser, true, g.time * 6);
      // flailing arms
      const t = g.time * 9;
      this.poser.set(b, J.LHA, -0.25 + Math.sin(t) * 0.1, 0.45 + Math.sin(t * 1.3) * 0.15, 0.55);
      this.poser.set(b, J.RHA, 0.25 + Math.cos(t) * 0.1, 0.45 + Math.cos(t * 1.1) * 0.15, 0.55);
      this.finish(dt, false);
      return;
    } else if (s.pinned && s.pinType === 'smoker') {
      a.legs = s.phys.onGround ? null : 'air';
      a.speed = Math.hypot(s.phys.vx, s.phys.vz);
      a.lean = -0.3;
      handR = [0.08, pivU + 0.12, 0.12];
      handL = [-0.08, pivU + 0.12, 0.12];
      showWeapon = false;
    } else if (s.pinned && s.pinType === 'jockey') {
      // staggering where the Jockey steers, clawing at the thing on their head
      a.speed = Math.hypot(s.phys.vx, s.phys.vz) * 0.8;
      a.lean = -0.12 + Math.sin(g.time * 3.1) * 0.08; a.twist = Math.sin(g.time * 2.3) * 0.2;
      a.headPitch = 0.25; a.twitch = 0.4;
      const w = Math.sin(g.time * 8) * 0.06;
      handR = [0.14 + w, 1.62 * scale, 0.02 - w];
      handL = [-0.14 + w, 1.6 * scale, 0.04 + w];
      poleL = [-1, 0.3, 0.5]; poleR = [1, 0.3, 0.5];
      showWeapon = false;
    } else if (s.pinned && s.pinType === 'charger' && s.pinned.carrying) {
      // scooped up under the Charger's arm, legs kicking
      a.legs = 'air'; a.speed = 0; a.lean = 0.35; a.headPitch = 0.3;
      const t = g.time * 10;
      handR = [0.3 + Math.sin(t) * 0.1, 1.2 * scale + Math.cos(t * 1.2) * 0.12, 0.2];
      handL = [-0.3 - Math.cos(t) * 0.1, 1.15 * scale + Math.sin(t * 1.3) * 0.12, 0.25];
      poleL = [-1, 0, 0.3]; poleR = [1, 0, 0.3];
      showWeapon = false;
    } else if (s.pinned) {
      poseLying(b, P, this.poser, false, g.time * 4);
      this.finish(dt, false);
      return;
    } else if (s.action && (s.action.type === 'heal' || s.action.type === 'revive')) {
      a.legs = 'kneel'; a.sink = 0.5; a.lean = 0.35; a.speed = 0;
      const w = Math.sin(g.time * 7) * 0.05;
      handR = [0.12 + w, 0.55, 0.45];
      handL = [-0.12 - w, 0.58, 0.45];
      showWeapon = s.action.type === 'revive' ? false : true;
    } else if (this.shoveT > 0) {
      const k = Math.sin((1 - this.shoveT / 0.35) * Math.PI);
      handR = along(0.3 + k * 0.35, 0.02, -0.05);
      handL = along(0.2 + k * 0.4, -0.2, -0.05);
    } else if (wdef && !wdef.melee) {
      if (wdef.kind === 'pistol') {
        handR = along(0.5, -0.07, -0.02);
        handL = s.inv.secondary.dual ? along(0.5, -0.3, -0.02) : along(0.45, -0.11, -0.05);
      } else {
        const d0 = s.weapon.reloading ? 0.12 : 0.2;
        handR = along(d0, -0.03, -0.08);
        const gripL = s.weapon.reloading ? [-0.02, pivU - 0.25, 0.3] : along(0.55, -0.12, -0.1);
        handL = gripL;
      }
      if (s.sprinting) { handR = [0.2, 1.1 * scale, 0.25]; handL = [-0.05, 1.15 * scale, 0.35]; }
    } else if (wdef && wdef.melee) {
      handR = [0.22, 1.1 * scale, 0.28];
      handL = [0.12, 1.02 * scale, 0.26];
    } else {
      handR = [0.2, 1.05 * scale, 0.25];
      handL = [-0.22, 0.85 * scale, 0.05];
    }
    a.arms = 'custom';
    a.handR = handR; a.handL = handL;
    a.poleL = poleL; a.poleR = poleR;
    animateHumanoid(b, P, this.poser, a);
    this.finish(dt, showWeapon);
  }
  finish(dt, showWeapon) {
    const s = this.s;
    const b = this.body;
    this.rig.update(b);
    // xray colour: blue normally, red when in trouble
    if (this.rig.xray) {
      const trouble = s.incapped || s.pinned;
      this.rig.setXray(!s.dead && !this.hidden, trouble ? 0xff3020 : s.blackAndWhite ? 0xffffff : 0x3a7aff);
    }
    const item = s.activeItem;
    this.setWeapon(showWeapon ? (s.slot === 1 && s.inv.secondary.dual ? 'pistol' : item) : null);
    const w = this.weaponObj;
    if (w) {
      const hx = b.jx(J.RHA), hy = b.jy(J.RHA), hz = b.jz(J.RHA);
      w.position.set(hx, hy, hz);
      const def = s.weapon?.def;
      if (def && def.melee) {
        w.rotation.set(-0.6, s.yaw, -0.4, 'YXZ');
      } else if (!def) {
        w.rotation.set(0, s.yaw, 0, 'YXZ');
      } else {
        w.rotation.set(s.pitch + s.aimPitchOff, s.yaw, 0, 'YXZ');
      }
    }
  }
  muzzleWorld(out) {
    const w = this.weaponObj;
    if (w && w.userData.muzzle) {
      w.updateMatrixWorld(true);
      return w.userData.muzzle.getWorldPosition(out);
    }
    return this.s.eye(out);
  }
  dispose() {
    this.rig.dispose();
    if (this.weaponObj) this.weaponObj.parent?.remove(this.weaponObj);
  }
}
