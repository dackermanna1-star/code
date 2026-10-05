// Enemies: perception, tactical AI with attack tokens, telegraphed attacks, poise/stagger,
// knockback & knockdowns (live ragdolls), status effects, elites, death ragdolls and gore.
import * as THREE from 'three';
import { buildBody, buildEnemyWeapon, blendPose, walkPose, POSES } from './rig.js';
import { ENEMIES, BOSSES, ATTACKS, ELITE_AFFIXES } from './enemy-defs.js';
import { Ragdoll, J, partOfFrame } from '../physics/ragdoll.js';
import { RigidBody } from '../physics/bodies.js';
import { addRim } from '../render/renderer.js';
import { sharedAssets } from '../render/materials.js';
import { C, TILE } from '../world/constants.js';
import { angleDiff, clamp, damp, dampAngle, easeOutCubic, easeInOutCubic, rand, randPick, raySphere, lerp } from '../core/math.js';
import { onEnemyKilled, explode } from '../game/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BLOOD = { blood: 0x5e0606, bone: 0xc8bea8, goo: 0x48a830, ichor: 0x3e1256 };

let uid = 1;

export class Enemy {
  constructor(game, kind, opts = {}) {
    this.game = game;
    this.uid = uid++;
    this.isEnemy = true;
    this.kind = kind;
    this.boss = !!opts.boss;
    const def = (this.def = this.boss ? BOSSES[kind] : ENEMIES[kind]);
    const floor = game.floor;
    this.elite = opts.elite || 0;
    this.miniboss = !!opts.miniboss;
    this.roomId = opts.roomId ?? -1;
    this.affixes = [];
    if (this.elite) {
      const keys = Object.keys(ELITE_AFFIXES).filter((k) => !(def.flying && k === 'explosive'));
      for (let i = 0; i < this.elite && keys.length; i++) this.affixes.push(keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
    }
    const hpScale = 1 + 0.38 * (floor - 1);
    const dmgScale = 1 + 0.2 * (floor - 1);
    let hp = def.hp * (this.boss ? 1 + 0.25 * (floor - 1) : hpScale);
    let dmg = def.dmg * (this.boss ? 1 + 0.12 * (floor - 1) : dmgScale);
    let scale = def.scale || 1;
    if (this.elite) { hp *= 2.3; dmg *= 1.25; scale *= 1.16; }
    if (this.miniboss) { hp *= 2.2; dmg *= 1.15; scale *= 1.15; }
    if (opts.small) { hp *= 0.45; scale *= 0.62; }
    if (opts.medium) { hp *= 0.65; scale *= 0.8; }
    this.sizeScale = scale / (def.scale || 1);
    this.maxHp = this.hp = Math.round(hp);
    this.dmg = dmg;
    this.speed = def.speed * (this.has('frenzied') ? 1.45 : 1) * rand(0.92, 1.08);
    this.atkSpeed = this.has('frenzied') ? 1.35 : 1;
    this.mass = def.mass * (this.elite ? 1.5 : 1) * (this.miniboss ? 1.5 : 1) * this.sizeScale;
    this.poiseMax = def.poise * (this.elite ? 1.8 : 1) * (this.miniboss ? 2 : 1);
    this.poise = this.poiseMax;
    this.radius = def.radius * this.sizeScale;
    this.flying = !!def.flying;
    this.splitLevel = opts.small ? 0 : opts.medium ? 1 : 2;

    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.state = opts.dormant ? 'dormant' : 'idle';
    this.stateT = 0;
    this.alerted = false;
    this.attack = null;
    this.cooldown = rand(0.6, 1.5);
    this.token = false;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.walkPhase = Math.random() * 10;
    this.moveAmt = 0;
    this.vulnerable = 0;
    this.flash = 0;
    this.react = new THREE.Vector3();
    this.reactVel = new THREE.Vector3();
    this.status = { burn: 0, burnDmg: 0, chill: 0, chillStacks: 0, frozen: 0, poison: 0, poisonDmg: 0, bleed: 0, bleedDmg: 0, tick: 0 };
    this.dead = false;
    this.ragdoll = null;
    this.knockdownT = 0;
    this.getupT = -1;
    this.kicked = 0;
    this.lastHurt = 99;
    this.hitSpheres = [];
    this.losT = 0;
    this.hasLos = false;
    this.voiceT = rand(2, 6);
    this.spawnT = opts.spawning ? 0 : -1;
    this.dropKey = !!opts.dropKey;
    this.wave = opts.wave || 0;
    this.phase = 1;
    this.lightSrc = null;
    this.airborne = false;

    this._buildVisual(opts);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    game.renderer.scene.add(this.root);
    if (this.spawnT >= 0) this.root.position.y = -2.2;
    this.attacks = def.attacks.map((a) => ({ name: a, def: ATTACKS[a], cd: 0 }));
  }

  has(affix) {
    return this.affixes.includes(affix);
  }

  get displayName() {
    if (this.boss) return this.def.name;
    const pre = this.affixes.map((a) => ELITE_AFFIXES[a].name).join(' ');
    return `${pre ? pre + ' ' : ''}${this.def.name}${this.miniboss ? ' Champion' : ''}`;
  }

  // ---------------------------------------------------------------- visuals
  _buildVisual() {
    const def = this.def;
    const kind = def.body;
    const scale = (def.scale || 1) * this.sizeScale;
    this.root = new THREE.Group();
    if (kind === 'slime') return this._buildSlime(scale);
    if (kind === 'bat') return this._buildBat(scale);
    if (kind === 'mimic') return this._buildMimic(scale);
    const baseScale = { goblin: 0.72, brute: 1.35, knight: 1.08, bomber: 0.85 }[kind] || 1;
    const rig = (this.rig = buildBody(kind, { scale: baseScale * scale, tint: def.tint, eyeColor: def.eyeColor, crown: def.crown, cape: def.cape, armor: def.armor || (kind === 'skeleton' && this.game.floor >= 3), apron: def.apron, plume: def.plume, tabard: def.tabard }));
    rig.optimize();
    this.root.add(rig.root);
    this.height = (rig.P.hipH + rig.P.torso + 0.3) * rig.scale;
    if (def.weapon) {
      const w = buildEnemyWeapon(def.weapon === 'bow' ? 'bow' : def.weapon, 1);
      this.weapon = w;
      if (def.weapon === 'bow') {
        rig.bones.handL.add(w.group);
        w.group.position.set(0, -0.06, 0.05);
        w.group.rotation.set(Math.PI / 2, 0, 0);
      } else {
        rig.bones.handR.add(w.group);
        w.group.position.set(0, -0.06, 0.02);
        w.group.rotation.set(Math.PI / 2, 0, 0);
      }
      w.group.traverse((o) => { if (o.isMesh && o.material.userData && !o.material.userData.flash) addRim(o.material, 0x8899bb, 0.25); });
    }
    if (def.offhand === 'shield') {
      const s = buildEnemyWeapon('shield', 1);
      this.shieldMesh = s.group;
      rig.bones.handL.add(s.group);
      s.group.position.set(0.02, -0.1, 0.12);
      s.group.rotation.set(0, 0, 0);
    }
    // glint sprite for attack telegraphs
    const A = sharedAssets();
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glint.scale.set(0.9, 0.9, 1);
    (this.weapon ? this.weapon.group : rig.bones.handR).add(this.glint);
    this.glint.position.set(0, this.weapon ? this.weapon.length * 0.8 : 0, 0);
    this._eliteVisuals();
  }

  _eliteVisuals() {
    const A = sharedAssets();
    let color = null;
    if (this.boss) color = this.def.rim || 0xff4422;
    else if (this.miniboss) color = 0xffaa22;
    else if (this.affixes.length) color = ELITE_AFFIXES[this.affixes[0]].color;
    if (!color) return;
    if (this.rig) this.rig.setRim(color, this.boss ? 0.9 : 0.75);
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: A.tex.glow, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    const s = this.radius * 4;
    aura.scale.set(s, s, 1);
    this.root.add(aura);
    this.aura = aura;
    this.auraColor = color;
  }

  _buildSlime(scale) {
    const g = new THREE.Group();
    const s = scale * 1.1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), addRim(new THREE.MeshStandardMaterial({ color: 0x5ad040, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.78, emissive: 0x0a3a06 }), 0xccffaa, 0.6));
    body.position.y = 0.45;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0x2a6a1a, emissive: 0x204a10, flatShading: true }));
    core.position.y = 0.42;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-0.16, 0.16]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeW);
      e.position.set(x, 0.6, 0.42);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat);
      p.position.set(x, 0.6, 0.49);
      g.add(e, p);
    }
    g.add(body, core);
    g.scale.setScalar(s);
    this.root.add(g);
    this.slime = { group: g, body, squash: 0, base: s };
    this.height = 0.9 * s;
    this.flashMats = [body.material];
  }

  _buildBat(scale) {
    const g = new THREE.Group();
    const mat = addRim(new THREE.MeshStandardMaterial({ color: 0x3a2a30, roughness: 0.8 }), 0xff8899, 0.4);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
    body.scale.set(1, 0.9, 1.3);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
    head.position.set(0, 0.06, 0.18);
    const ear = new THREE.ConeGeometry(0.035, 0.12, 4);
    const e1 = new THREE.Mesh(ear, mat); e1.position.set(-0.05, 0.16, 0.16);
    const e2 = new THREE.Mesh(ear, mat); e2.position.set(0.05, 0.16, 0.16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    eyeMat.color.multiplyScalar(2);
    const ey1 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), eyeMat); ey1.position.set(-0.04, 0.08, 0.27);
    const ey2 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), eyeMat); ey2.position.set(0.04, 0.08, 0.27);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(0.55, 0.12);
    wingShape.lineTo(0.48, -0.05);
    wingShape.lineTo(0.36, 0.02);
    wingShape.lineTo(0.26, -0.1);
    wingShape.lineTo(0.14, -0.02);
    wingShape.lineTo(0, -0.1);
    const wingGeo = new THREE.ShapeGeometry(wingShape);
    wingGeo.rotateX(-Math.PI / 2);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x2a1a20, roughness: 0.9, side: THREE.DoubleSide });
    const wl = new THREE.Group(), wr = new THREE.Group();
    const ml = new THREE.Mesh(wingGeo, wingMat); ml.scale.x = -1;
    const mr = new THREE.Mesh(wingGeo, wingMat);
    wl.add(ml); wr.add(mr);
    wl.position.x = -0.1; wr.position.x = 0.1;
    g.add(body, head, e1, e2, ey1, ey2, wl, wr);
    g.scale.setScalar(scale * 1.2);
    g.position.y = 1.8;
    this.root.add(g);
    this.bat = { group: g, wl, wr };
    this.height = 0.3;
    this.flashMats = [mat];
  }

  _buildMimic(scale) {
    const A = sharedAssets();
    const g = new THREE.Group();
    const wood = addRim(new THREE.MeshStandardMaterial({ map: A.wood.map, color: 0x9a7050, roughness: 0.8 }), 0xff6644, 0.4);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), wood);
    base.position.y = 0.25;
    const lid = new THREE.Group();
    lid.position.set(0, 0.5, -0.35);
    const lidM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.7), wood);
    lidM.position.set(0, 0.16, 0.35);
    lid.add(lidM);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xeeeedd, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), toothMat);
      t.position.set(-0.45 + i * 0.13, 0.52, 0.32);
      t.rotation.x = Math.PI;
      g.add(t);
      const t2 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), toothMat);
      t2.position.set(-0.45 + i * 0.13, -0.02, 0.7);
      lid.add(t2);
    }
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0xaa2244, roughness: 0.3 }));
    tongue.position.set(0, 0.48, 0.4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
    eyeMat.color.multiplyScalar(2);
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat); e1.position.set(-0.25, 0.26, 0.66);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat); e2.position.set(0.25, 0.26, 0.66);
    lid.add(e1, e2);
    g.add(base, lid, tongue);
    for (const x of [-0.4, 0.4]) for (const z of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0x4a2a2a }));
      leg.position.set(x, 0.02, z);
      g.add(leg);
    }
    g.scale.setScalar(scale);
    this.root.add(g);
    this.mimic = { group: g, lid, tongue };
    this.height = 0.9;
    this.flashMats = [wood];
  }

  setFlash(v) {
    if (this.rig) this.rig.setFlash(v);
    if (this.flashMats) for (const m of this.flashMats) if (m.userData.flash) m.userData.flash.value = v;
  }

  headPos(out = new THREE.Vector3()) {
    if (this.ragdoll) return out.copy(this.ragdoll.pos[J.headTop]).add(_v.set(0, 0.3, 0));
    return out.set(this.pos.x, this.root.position.y + (this.flying ? 2.1 : this.height + 0.35), this.pos.z);
  }

  chestPos(out = new THREE.Vector3()) {
    if (this.ragdoll) return out.copy(this.ragdoll.pos[J.chest]);
    if (this.flying) return out.set(this.pos.x, this.root.position.y + (this.bat ? this.bat.group.position.y : 1.5), this.pos.z);
    return out.set(this.pos.x, this.root.position.y + this.height * 0.7, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  isBehind(attackDir) {
    const f = this.forward(_v2);
    return f.x * attackDir.x + f.z * attackDir.z > 0.35;
  }

  // ---------------------------------------------------------------- hit testing
  _updateHitSpheres() {
    const hs = this.hitSpheres;
    hs.length = 0;
    if (this.rig && !this.ragdoll) {
      const b = this.rig.bones;
      const s = this.rig.scale;
      const P = this.rig.P;
      hs.push({ c: b.head.localToWorld(new THREE.Vector3(0, P.headR, 0.02)), r: P.headR * s * 1.25, part: 'head' });
      hs.push({ c: b.chest.localToWorld(new THREE.Vector3(0, 0.08, 0)), r: 0.27 * s, part: 'body' });
      hs.push({ c: b.pelvis.localToWorld(new THREE.Vector3(0, 0.05, 0)), r: 0.24 * s, part: 'body' });
      hs.push({ c: b.kneeL.localToWorld(new THREE.Vector3(0, 0, 0)), r: 0.15 * s, part: 'legs' });
      hs.push({ c: b.kneeR.localToWorld(new THREE.Vector3(0, 0, 0)), r: 0.15 * s, part: 'legs' });
    } else if (this.ragdoll) {
      for (const i of [J.headTop, J.chest, J.pelvis, J.kneeL, J.kneeR]) hs.push({ c: this.ragdoll.pos[i].clone(), r: 0.22, part: i === J.headTop ? 'head' : 'body' });
    } else {
      const c = this.chestPos();
      hs.push({ c, r: this.radius * (this.slime ? 1.1 : 1.3), part: 'body' });
    }
  }

  meleeRay(o, d, maxDist, pad) {
    if (this.dead || this.spawnT >= 0 || this.state === 'dormant') return null;
    // quick reject
    const c = this.chestPos(_v);
    if (c.distanceTo(o) > maxDist + 2.5) return null;
    let best = null;
    for (const s of this.hitSpheres) {
      const t = raySphere(o, d, s.c, s.r + pad);
      if (t >= 0 && t <= maxDist && (!best || t < best.dist)) best = { dist: t, part: s.part };
    }
    return best;
  }

  // ---------------------------------------------------------------- damage
  takeDamage(game, info) {
    if (this.dead) return { killed: false, damage: 0 };
    if (this.spawnT >= 0 || this.state === 'dormant') return { killed: false, damage: 0 };
    const p = game.player;
    // shields block light frontal hits
    if (this.def.shield && info.melee && !info.heavy && !info.kick && this.state !== 'stagger' && this.vulnerable <= 0 && !this.ragdoll && (!this.attack || this.attack.phase === 'rec' || Math.random() < 0.6)) {
      const f = this.forward(_v2);
      if (-(f.x * info.dir.x + f.z * info.dir.z) > 0.2 || this.isFacingPlayer(0.4)) {
        const sp = this.chestPos().addScaledVector(f, 0.4);
        game.fx.sparks(sp, f, 16, 0xffd890, 6);
        game.audio.block(sp);
        game.fx.numbers.add(this.headPos(), 'BLOCKED', 'block');
        this.vel.addScaledVector(info.dir, 2);
        this.reactVel.x -= 2;
        p.vm.impact(0, 1.2);
        p.addTrauma(0.1);
        game.hitstop(0.04);
        return { killed: false, damage: 0, blocked: true };
      }
    }
    if (info.kick && this.def.shield) {
      this.stagger(game, 1.3);
      game.fx.numbers.add(this.headPos(), 'GUARD BROKEN', 'neg');
    }
    let dmg = info.amount;
    if (this.has('armored')) dmg *= 0.6;
    if (this.status.frozen > 0) dmg *= 1.3;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.lastHurt = 0;
    this.flash = 0.14;
    this.setFlash(1);
    this.alert(game);

    // feedback
    const point = info.point || this.chestPos();
    const sprayDir = (info.swingDir || info.dir || _v.set(0, 1, 0)).clone();
    const blood = this.def.blood;
    const col = BLOOD[blood];
    const goreAmt = Math.min(2, (info.heavy ? 1.3 : 0.7) + (info.crit ? 0.5 : 0) + (info.gore || 0) * 0.3);
    if (info.type !== 'burn' && info.type !== 'poison' && info.type !== 'bleed') {
      if (blood === 'bone') {
        game.fx.debris(point, 'bone', info.heavy ? 8 : 4, 4);
        game.fx.sparks(point, sprayDir, 4, 0xfff0d0, 3);
        game.audio.hitBone(point, info.heavy ? 1.3 : 1);
      } else if (blood === 'goo') {
        game.fx.blood(point, sprayDir, goreAmt, 'goo');
        game.audio.slimeHit(point, info.heavy);
      } else {
        game.fx.blood(point, sprayDir, goreAmt, blood === 'ichor' ? 'ichor' : 'blood', col);
        game.audio.hitFlesh(point, info.heavy ? 1.4 : 1);
        if (this.def.armored) game.audio.clang(point, 0.8, 0.3, 0.4);
      }
      if (info.crit) game.fx.sparks(point, sprayDir, 10, 0xffffff, 5);
      // hit reaction
      const f = this.forward(_v2);
      const along = f.x * info.dir.x + f.z * info.dir.z;
      const side = f.z * info.dir.x - f.x * info.dir.z;
      const k = Math.min(3, 1 + (info.knockback || 0) * 0.15) / Math.sqrt(this.mass);
      this.reactVel.x += -along * 7 * k;
      this.reactVel.z += side * 7 * k;
      this.reactVel.y += (Math.random() - 0.5) * 5 * k;
    }

    // knockback & poise
    const knock = (info.knockback || 0) / Math.max(0.3, this.mass);
    if (!this.boss) {
      this.vel.x += info.dir.x * knock;
      this.vel.z += info.dir.z * knock;
    } else {
      this.vel.x += info.dir.x * knock * 0.15;
      this.vel.z += info.dir.z * knock * 0.15;
    }
    this.poise -= info.stagger || 0;
    if (this.hp <= 0) {
      this.die(game, info);
      return { killed: true, damage: dmg };
    }
    if (this.has('frozen') && info.melee && Math.random() < 0.3) game.player.addBuff('chilled', 1.5, { moveSpeed: -0.3 });
    // knockdown into a live ragdoll
    if (!this.boss && this.rig && !this.miniboss && (knock > 8.5 || (info.explosion && knock > 4)) && !this.ragdoll) {
      this.knockdown(game, info, knock);
    } else if (this.poise <= 0) {
      this.poise = this.poiseMax;
      this.stagger(game, info.kick ? 1.0 : 0.7);
    } else if (this.attack && this.attack.phase === 'wind' && (info.stagger || 0) > this.poiseMax * 0.6) {
      this.stagger(game, 0.45);
    }
    if (info.wallSlam) this.wallSlamArmed = 0.6;
    return { killed: false, damage: dmg };
  }

  stagger(game, dur) {
    if (this.ragdoll) return; // knocked down: getting up handles recovery
    this._endAttack();
    this.state = 'stagger';
    this.stateT = dur * (this.boss ? 0.6 : 1);
    this.vulnerable = Math.max(this.vulnerable, dur + 0.4);
    if (this.voiceT < 1.5) game.audio.voice(this.pos, this.def.voice, 'hurt');
  }

  parried(game) {
    this._endAttack();
    this.state = 'stagger';
    this.stateT = this.boss ? 1.0 : 1.5;
    this.vulnerable = this.stateT + 0.5;
    const f = this.forward(_v);
    this.vel.addScaledVector(f, -3.5 / Math.sqrt(this.mass));
    this.reactVel.x -= 9;
    game.fx.numbers.add(this.headPos(), 'STAGGERED', 'parry');
    if (this.boss) this.poise = 0;
  }

  alert(game) {
    if (this.alerted || this.state === 'dormant') return;
    this.alerted = true;
    if (this.state === 'idle') { this.state = 'alert'; this.stateT = rand(0.25, 0.5); }
    game.audio.voice(this.pos, this.def.voice, 'alert');
    game.level.alertRoom(this, game);
  }

  ignite(game, dps, dur) {
    if (this.dead) return;
    if (this.status.burn <= 0) game.audio.fire(this.pos);
    this.status.burn = Math.max(this.status.burn, dur);
    this.status.burnDmg = Math.max(this.status.burnDmg, dps);
    if (!this.lightSrc) this.lightSrc = game.renderer.addDynamic(this.chestPos(), 0xff7a30, 10, 6, 1);
  }

  chill(game, dur) {
    if (this.dead) return;
    this.status.chill = Math.max(this.status.chill, dur);
    this.status.chillStacks++;
    game.audio.freeze(this.pos);
    if (this.status.chillStacks >= 3 && !this.boss) {
      this.status.chillStacks = 0;
      this.status.frozen = 2.2;
      this._endAttack();
      game.fx.magic(this.chestPos(), 0x99eeff, 24, 3);
      game.fx.numbers.add(this.headPos(), 'FROZEN', 'shock');
    }
  }

  poison(game, dps, dur) {
    if (this.dead) return;
    this.status.poison = Math.max(this.status.poison, dur);
    this.status.poisonDmg = Math.min(dps * 4, this.status.poisonDmg + dps);
    game.audio.poison(this.pos);
  }

  bleed(game, dps, dur) {
    if (this.dead) return;
    this.status.bleed = Math.max(this.status.bleed, dur);
    this.status.bleedDmg = Math.max(this.status.bleedDmg, dps);
  }

  _endAttack() {
    if (this.attack) this.attack = null;
    if (this.token) { this.token = false; this.game.level.attackTokens--; }
    if (this.glint) this.glint.material.opacity = 0;
    this.unblockableGlow = 0;
  }

  // ---------------------------------------------------------------- knockdown
  knockdown(game, info, knock) {
    this._endAttack();
    const joints = this.rig.jointPositions();
    const vel = new THREE.Vector3(this.vel.x, Math.min(8, knock * 0.4) + 1.5, this.vel.z);
    this.ragdoll = new Ragdoll(game.renderer.scene, joints, this.rig.parts, vel, { scale: this.rig.scale, owner: this });
    if (info.point) this.ragdoll.impulse(info.point, info.dir.clone().multiplyScalar(knock * 0.6), 0.8);
    game.level.ragdolls.add(this.ragdoll);
    this.state = 'knockdown';
    this.knockdownT = rand(1.3, 1.9);
    this.vulnerable = this.knockdownT + 0.6;
    if (this.weapon) this.weapon.group.visible = true;
  }

  _getUp(game) {
    const rd = this.ragdoll;
    const pel = rd.pos[J.pelvis];
    this.pos.set(pel.x, 0, pel.z);
    game.world.collideCircle(this.pos, this.radius);
    this.yaw = rd.yaw() + (rd.faceUp() ? Math.PI : 0);
    rd.restore();
    game.level.ragdolls.delete(rd);
    this.ragdoll = null;
    this.state = 'getup';
    this.getupT = 0;
    this.stateT = 0.75;
  }

  // ---------------------------------------------------------------- death
  die(game, info) {
    if (this.dead) return;
    this.dead = true;
    this._endAttack();
    this.state = 'dead';
    game.schedule(0.08, () => this.setFlash(0));
    if (this.lightSrc) { game.renderer.removeDynamic(this.lightSrc); this.lightSrc = null; }
    game.audio.voice(this.pos, this.def.voice, 'death');
    const dir = (info.dir || _v.set(0, 0, 1)).clone();
    const knock = (info.knockback || 3) / Math.max(0.5, this.mass * 0.7);
    const gore = game.fx.gore;

    if (this.rig) {
      let rd = this.ragdoll;
      if (!rd) {
        const joints = this.rig.jointPositions();
        const vel = new THREE.Vector3(this.vel.x * 0.6 + dir.x * knock * 0.7, (info.heavy || info.explosion ? Math.min(9, knock * 0.5) + 2 : 1.5) + (info.overhead ? -2 : 0), this.vel.z * 0.6 + dir.z * knock * 0.7);
        rd = this.ragdoll = new Ragdoll(game.renderer.scene, joints, this.rig.parts, vel, { scale: this.rig.scale, owner: this });
        game.level.ragdolls.add(rd);
      }
      if (info.point) rd.impulse(info.point, dir.clone().multiplyScalar(knock * (info.heavy ? 1.2 : 0.7)), 0.9);
      // weapon clatters away
      this._dropWeapon(game, dir, knock);
      // dismemberment
      const severs = [];
      if (gore > 0) {
        const overkill = -this.hp / this.maxHp;
        const unique = game.player.stats.unique;
        let chance = 0.18 * (info.dismember || 1) * (info.crit ? 1.6 : 1) * (info.heavy ? 1.5 : 1) * (1 + Math.min(1, overkill) * 2) * gore;
        if (this.def.blood === 'bone') chance = Math.max(chance, 0.6);
        if ((info.head && (info.heavy || info.crit || info.overhead)) || (unique.decap && info.source === 'player')) severs.push('head');
        else if (Math.random() < chance * 0.6) severs.push('head');
        for (const part of ['armL', 'armR', 'legL', 'legR']) if (Math.random() < chance * (part.startsWith('arm') ? 0.5 : 0.25)) severs.push(part);
        if (info.explosion && overkill > 0.3) severs.push('armL', 'armR', 'legL', 'legR', 'head');
      }
      const col = BLOOD[this.def.blood];
      const kind = this.def.blood === 'bone' ? 'bone' : this.def.blood === 'goo' ? 'goo' : this.def.blood === 'ichor' ? 'ichor' : 'blood';
      const uniq = [...new Set(severs)];
      for (const part of uniq) {
        const s = rd.sever(part);
        if (!s) continue;
        const a = s.a, b = s.b;
        // separate the pieces with a pop
        rd.prev[b].addScaledVector(new THREE.Vector3(rand(-1, 1), rand(1.5, 3.5), rand(-1, 1)).add(dir.clone().multiplyScalar(2)), -1 / 60);
        if (kind === 'bone') {
          game.fx.debris(rd.pos[a].clone(), 'bone', 4, 3);
        } else {
          game.fx.fountain(() => rd.pos[a], () => _v2.subVectors(rd.pos[a], rd.pos[J.chest]).normalize().add(UP).normalize(), 1.4, kind, col);
          game.fx.fountain(() => rd.pos[b], () => _v2.subVectors(rd.pos[b], rd.pos[J.chest]).normalize(), 0.8, kind, col);
          game.fx.blood(rd.pos[a].clone(), UP, 1.2, kind, col);
        }
      }
      if (uniq.length) game.audio.gore(this.chestPos(), uniq.length > 1 ? 1.4 : 1);
      if (kind !== 'bone' && gore > 0) game.level.addBloodPool(rd, col);
      game.level.addCorpse(this, rd);
      // leftover non-part children (aura etc.)
    } else if (this.slime) {
      this._slimeDeath(game, info);
    } else if (this.bat) {
      const body = new RigidBody({ type: 'box', hx: 0.15, hy: 0.1, hz: 0.2 }, { mass: 0.3, mesh: this.bat.group, life: 12, fade: 2 });
      const wp = this.bat.group.getWorldPosition(new THREE.Vector3());
      this.root.remove(this.bat.group);
      game.renderer.scene.add(this.bat.group);
      body.pos.copy(wp);
      body.vel.copy(dir).multiplyScalar(knock + 2).setY(2);
      body.ang.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      game.physics.add(body);
      game.fx.blood(wp, dir, 0.6);
    } else if (this.mimic) {
      const p = this.chestPos();
      game.fx.debris(p, 'wood', 18, 6);
      game.fx.blood(p, UP, 1.5);
      game.audio.woodHit(p, true);
      this.mimic.group.visible = false;
    }
    if (this.aura) this.aura.visible = false;
    if (this.glint) this.glint.visible = false;
    if (this.def.explodes || this.has('explosive')) {
      const p = this.chestPos();
      const delay = this.def.explodes ? 0.05 : 0.5;
      if (this.has('explosive')) game.fx.magic(p, 0xff8800, 20, 2);
      game.schedule(delay, () => explode(game, p, this.def.explodes ? 3.2 : 2.6, this.def.explodes ? this.dmg : this.dmg * 1.5, { source: info.source === 'player' ? 'player' : 'enemy', color: 0xff7722 }));
    }
    onEnemyKilled(game, this, info);
    game.renderer.scene.remove(this.root);
  }

  _dropWeapon(game, dir, knock) {
    for (const wm of [this.weapon && this.weapon.group, this.shieldMesh]) {
      if (!wm || !wm.parent) continue;
      wm.updateWorldMatrix(true, false);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
      wm.matrixWorld.decompose(pos, quat, scl);
      wm.removeFromParent();
      const holder = new THREE.Group();
      holder.add(wm);
      wm.position.set(0, 0, 0);
      wm.quaternion.identity();
      wm.scale.copy(scl);
      game.renderer.scene.add(holder);
      const len = wm === this.shieldMesh ? 0.35 : (this.weapon.length || 0.8);
      const body = new RigidBody(wm === this.shieldMesh ? { type: 'cyl', r: 0.3 * scl.x, hy: 0.04 } : { type: 'box', hx: 0.06 * scl.x, hy: len * 0.5, hz: 0.03 }, { mass: 1.2, mesh: holder, restitution: 0.3, life: 40, fade: 3, collideBodies: false, onImpact: (b, sp) => game.audio.clang(b.pos, 1.4, 0.25, Math.min(0.6, sp * 0.08)) });
      // offset the mesh so the body centre sits mid-weapon
      if (wm !== this.shieldMesh) wm.position.y = -len * 0.5;
      body.pos.copy(pos);
      body.quat.copy(quat);
      body.vel.set(dir.x * knock * 0.5 + rand(-1, 1), rand(2, 4), dir.z * knock * 0.5 + rand(-1, 1));
      body.ang.set(rand(-10, 10), rand(-6, 6), rand(-10, 10));
      game.physics.add(body);
    }
  }

  _slimeDeath(game, info) {
    const p = this.chestPos();
    game.fx.blood(p, UP, 2, 'goo');
    game.fx.decal(new THREE.Vector3(p.x, game.world.floorAt(p.x, p.z), p.z), UP, 1.2 * this.sizeScale + 0.6, 0x3a9a2a);
    game.audio.slimeHit(p, true);
    this.slime.group.visible = false;
    if (this.splitLevel > 0 && !info.explosion) {
      for (let i = 0; i < (this.def.split || 2); i++) {
        const a = Math.random() * Math.PI * 2;
        game.level.spawnEnemy('slime', p.x + Math.cos(a) * 0.5, p.z + Math.sin(a) * 0.5, { roomId: this.roomId, small: this.splitLevel === 1, medium: this.splitLevel === 2, alerted: true, vel: new THREE.Vector3(Math.cos(a) * 4, 5, Math.sin(a) * 4) });
      }
    }
  }

  // ---------------------------------------------------------------- update
  isFacingPlayer(minDot = 0.5) {
    const p = this.game.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const f = this.forward(_v2);
    return (f.x * dx + f.z * dz) / d > minDot;
  }

  update(dt, game) {
    if (this.dead) return;
    const p = game.player;
    this.lastHurt += dt;
    this.vulnerable = Math.max(0, this.vulnerable - dt);
    if (this.flash > 0) { this.flash -= dt; this.setFlash(Math.max(0, this.flash / 0.14)); }
    this.voiceT -= dt;
    this._statuses(dt, game);
    if (this.dead) return;

    // arena spawn rise
    if (this.spawnT >= 0) {
      this.spawnT += dt;
      const f = Math.min(1, this.spawnT / 1.1);
      this.root.position.y = -2.2 * (1 - easeOutCubic(f));
      if (Math.random() < 0.5) game.fx.spark(this.pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0.1, rand(-0.6, 0.6))), new THREE.Vector3(0, rand(1, 3), 0), 0xaa66ff, 0.7, 0.12, { grav: -1, floor: false });
      if (f >= 1) { this.spawnT = -1; this.alert(game); this.state = 'chase'; }
      this._animate(dt);
      return;
    }
    if (this.state === 'dormant') {
      if (p.pos.distanceTo(this.pos) < 7 && game.world.los(this.pos.x, 1.2, this.pos.z, p.pos.x, 1.5, p.pos.z)) {
        this.spawnT = 0;
        game.fx.debris(this.pos.clone().setY(0.2), 'bone', 10, 3);
        game.audio.voice(this.pos, this.def.voice, 'alert');
      }
      this.root.position.y = -2.2;
      return;
    }

    if (this.state === 'knockdown') {
      const rd = this.ragdoll;
      const pel = rd.pos[J.pelvis];
      this.pos.set(pel.x, 0, pel.z);
      this.knockdownT -= dt;
      // dropped in a pit while knocked down
      const cell = game.world.cellAt(pel.x, pel.z);
      if ((cell === C.PIT && pel.y < -1.4) || (cell === C.LAVA && pel.y < 0)) { this._hazardDeath(game, cell); return; }
      if (this.knockdownT <= 0 && (rd.still > 0.1 || this.knockdownT < -0.8)) this._getUp(game);
      this._updateHitSpheres();
      return;
    }

    if (this.status.frozen > 0) {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this._integrate(dt, game);
      this._updateHitSpheres();
      return;
    }

    // perception (throttled LOS)
    const toP = _v.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = toP.length();
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2 + Math.random() * 0.1;
      this.hasLos = dist < 30 && game.world.los(this.pos.x, this.chestPos().y, this.pos.z, p.pos.x, p.pos.y + 1.5, p.pos.z);
    }
    if (!this.alerted && !p.dead) {
      const facing = this.isFacingPlayer(0.2);
      if (this.hasLos && (dist < this.def.sight * (facing ? 1 : 0.4) || dist < 3.5)) this.alert(game);
    }

    const slow = (this.status.chill > 0 ? 0.6 : 1) * (this.boss && this.phase === 2 ? 1.2 : 1);
    let moveX = 0, moveZ = 0, moveSpeed = 0;
    let faceTarget = null;
    let direct = false;

    switch (this.state) {
      case 'idle': {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.stateT = rand(2, 5);
          this.wander = Math.random() < 0.5 ? rand(0, Math.PI * 2) : null;
        }
        if (this.wander != null && !this.flying) {
          moveX = Math.sin(this.wander);
          moveZ = Math.cos(this.wander);
          moveSpeed = this.speed * 0.25;
          const ahead = _v2.set(this.pos.x + moveX * 1.2, 0, this.pos.z + moveZ * 1.2);
          if (!game.world.navCell(Math.floor(ahead.x / TILE), Math.floor(ahead.z / TILE))) this.wander = null;
          faceTarget = this.wander;
        }
        break;
      }
      case 'alert': {
        this.stateT -= dt;
        faceTarget = Math.atan2(toP.x, toP.z);
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
      case 'stagger': {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.state = 'chase'; this.cooldown = Math.max(this.cooldown, 0.3); }
        break;
      }
      case 'getup': {
        this.stateT -= dt;
        this.getupT += dt;
        if (this.stateT <= 0) { this.state = 'chase'; this.getupT = -1; }
        break;
      }
      case 'chase': {
        if (p.dead) { this.state = 'idle'; break; }
        faceTarget = Math.atan2(toP.x, toP.z);
        this.cooldown -= dt * this.atkSpeed;
        for (const a of this.attacks) a.cd -= dt;
        // choose an attack
        if (this.cooldown <= 0 && (this.hasLos || dist < 2.5)) {
          const atk = this._chooseAttack(dist, game);
          if (atk) { this._startAttack(atk, game); break; }
        }
        // movement intent
        const ranged = this.def.ranged;
        const prefer = this.def.prefer || 2.2;
        let dirX = 0, dirZ = 0;
        const direct = this.hasLos && dist < 14;
        let approach = 0;
        if (ranged) {
          if (dist > prefer + 3 || !this.hasLos) approach = 1;
          else if (dist < prefer - 3) approach = -1;
        } else if (this.def.skirmish && this.retreatT > 0) {
          this.retreatT -= dt;
          approach = -1;
        } else {
          const engage = this.token || this.boss || this.attacks.every((a) => a.def.kind === 'explode') || game.level.attackTokens < game.level.maxTokens;
          const hold = engage ? 1.6 : 3.6 + (this.uid % 3) * 0.6;
          if (dist > hold + 0.4) approach = 1;
          else if (dist < hold - 0.6) approach = -0.6;
        }
        if (approach > 0) {
          if (direct) { dirX = toP.x / dist; dirZ = toP.z / dist; }
          else {
            const fd = game.world.flowDir(this.pos.x, this.pos.z);
            if (fd) { const l = Math.hypot(fd.x, fd.z) || 1; dirX = fd.x / l; dirZ = fd.z / l; }
          }
        } else if (approach < 0) {
          dirX = -toP.x / dist * -approach;
          dirZ = -toP.z / dist * -approach;
        }
        // strafe when holding position
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = rand(1, 2.5); if (Math.random() < 0.4) this.strafeDir *= -1; }
        if (approach <= 0 && dist < 8) {
          dirX += (-toP.z / dist) * this.strafeDir * 0.7;
          dirZ += (toP.x / dist) * this.strafeDir * 0.7;
        }
        const l = Math.hypot(dirX, dirZ);
        if (l > 0.01) {
          moveX = dirX / l;
          moveZ = dirZ / l;
          moveSpeed = this.speed * (approach > 0 ? 1 : 0.55);
        }
        // occasional voice
        if (this.voiceT <= 0) { this.voiceT = rand(4, 9); game.audio.voice(this.pos, this.def.voice, 'alert'); }
        // teleport away when cornered (cultists)
        if (this.def.teleport && dist < 2.5 && Math.random() < dt * 0.6) this._teleport(game);
        break;
      }
      case 'attack': {
        const r = this._updateAttack(dt, game, toP, dist);
        if (r) { moveX = r.x; moveZ = r.z; moveSpeed = r.speed; faceTarget = r.face; direct = !!r.direct; }
        break;
      }
      default:
    }

    // separation from other enemies
    if (!direct && (moveSpeed > 0 || this.state === 'chase')) {
      for (const o of game.level.enemies) {
        if (o === this || o.dead || o.ragdoll) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
        const rr = this.radius + o.radius + 0.25;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / rr;
          moveX += (dx / d) * push * 1.4;
          moveZ += (dz / d) * push * 1.4;
          if (moveSpeed === 0) moveSpeed = this.speed * 0.4;
        }
      }
      const ml = Math.hypot(moveX, moveZ);
      if (ml > 1) { moveX /= ml; moveZ /= ml; }
    }

    // avoid walking into pits/lava voluntarily
    if (moveSpeed > 0 && !this.flying) {
      const ax = this.pos.x + moveX * 0.9, az = this.pos.z + moveZ * 0.9;
      const c = game.world.cellAt(ax, az);
      if (c === C.PIT || c === C.LAVA) { moveX = 0; moveZ = 0; moveSpeed = 0; }
    }

    // steering / velocity
    const sp = moveSpeed * slow;
    if (direct) {
      this.vel.x = moveX * moveSpeed;
      this.vel.z = moveZ * moveSpeed;
    } else {
      const ctrl = this.airborne ? 1 : 10;
      this.vel.x = damp(this.vel.x, moveX * sp, ctrl, dt);
      this.vel.z = damp(this.vel.z, moveZ * sp, ctrl, dt);
    }
    if (faceTarget != null) {
      const turn = (this.attack && this.attack.phase !== 'wind' ? 2 : 9) * (this.boss ? 0.7 : 1);
      this.yaw = dampAngle(this.yaw, faceTarget, turn, dt);
    } else if (sp > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(moveX, moveZ), 6, dt);
    this.moveAmt = damp(this.moveAmt, Math.min(1, Math.hypot(this.vel.x, this.vel.z) / Math.max(1, this.speed)), 8, dt);

    this._integrate(dt, game);
    this._animate(dt);
    this._updateHitSpheres();
  }

  _integrate(dt, game) {
    const world = game.world;
    if (this.flying) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      world.collideCircle(this.pos, this.radius);
      this.root.position.set(this.pos.x, 0, this.pos.z);
      this.root.rotation.y = this.yaw;
      return;
    }
    const prev = _v2.set(this.vel.x, 0, this.vel.z);
    const speed = prev.length();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // vertical (leaps / knock-ups)
    const fy = world.floorAt(this.pos.x, this.pos.z);
    if (this.airborne || this.pos.y > fy + 0.01 || fy < -0.1) {
      this.vel.y -= 22 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= fy) {
        this.pos.y = fy;
        if (this.airborne && this.onLand) this.onLand();
        this.airborne = false;
        this.vel.y = 0;
      }
    }
    const n = world.collideCircle(this.pos, this.radius);
    game.level.collideObstacles(this.pos, this.radius);
    if (n && speed > 6.5 && (prev.x * n.x + prev.z * n.z) / speed < -0.5) {
      // slammed into a wall
      const slam = (this.wallSlamArmed > 0 ? 3 : 1) * speed;
      this.vel.x *= -0.3;
      this.vel.z *= -0.3;
      if (this.kicked > 0 || this.wallSlamArmed > 0 || speed > 9) {
        game.fx.dust(this.chestPos(), 4, 0x8a8070, 0.3);
        game.audio.land(1);
        game.player.addTrauma(0.12);
        const dmg = Math.round(slam * 1.6);
        game.fx.numbers.add(this.headPos(), `SLAM ${dmg}`, 'heavy');
        this.takeDamage(game, { amount: dmg, dir: new THREE.Vector3(n.x, 0, n.z), knockback: 1, stagger: 50, source: 'player', point: this.chestPos() });
        this.wallSlamArmed = 0;
      }
    }
    if (this.charging && n) this.chargeHitWall = true;
    this.wallSlamArmed = Math.max(0, (this.wallSlamArmed || 0) - dt);
    this.kicked = Math.max(0, this.kicked - dt);
    // pushed into a hazard
    const cell = world.cellAt(this.pos.x, this.pos.z);
    if ((cell === C.PIT || cell === C.LAVA) && !this.airborne) {
      if (cell === C.LAVA && this.pos.y <= fy + 0.05) { this._hazardDeath(game, cell); return; }
      if (cell === C.PIT && this.pos.y < -1.2) { this._hazardDeath(game, cell); return; }
    }
    if (!this.airborne) {
      // friction for knockback slides
      if (this.state !== 'chase' && this.state !== 'idle' && this.state !== 'attack') {
        this.vel.x *= Math.exp(-6 * dt);
        this.vel.z *= Math.exp(-6 * dt);
      }
    }
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  _hazardDeath(game, cell) {
    if (this.dead) return;
    const lava = cell === C.LAVA;
    if (lava) {
      game.fx.explosion(this.chestPos(), 1.2, 0xff6020);
      game.audio.fire(this.pos, true);
    } else {
      game.fx.blood(this.chestPos(), UP, 1.5);
      game.audio.gore(this.pos, 1);
    }
    game.fx.numbers.add(this.headPos(), lava ? 'INCINERATED' : 'IMPALED', 'crit big');
    game.stats.environmentKills++;
    this.hp = 0;
    this.die(game, { amount: 999, dir: new THREE.Vector3(0, -1, 0), knockback: 1, source: 'player', type: lava ? 'fire' : 'phys', gore: 1 });
    if (lava && this.ragdoll) for (const part of this.ragdoll.parts) part.mesh.traverse((o) => { if (o.isMesh && o.material.color) { o.material = o.material.clone(); o.material.color.setRGB(0.08, 0.05, 0.04); } });
  }

  _teleport(game) {
    const p = game.player.pos;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(6, 10);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!game.world.navCell(Math.floor(x / TILE), Math.floor(z / TILE))) continue;
      if (!game.world.los(x, 1.5, z, p.x, 1.5, p.z)) continue;
      game.fx.magic(this.chestPos(), 0xff5533, 24, 3);
      game.audio.cast(this.pos, 'magic');
      this.pos.set(x, 0, z);
      this.root.position.copy(this.pos);
      game.fx.magic(this.chestPos(), 0xff5533, 24, 3);
      this.cooldown = 0.4;
      return;
    }
  }

  _statuses(dt, game) {
    const s = this.status;
    s.tick -= dt;
    const doTick = s.tick <= 0;
    if (doTick) s.tick = 0.5;
    if (s.burn > 0) {
      s.burn -= dt;
      if (Math.random() < 0.6) game.fx.fire(this.chestPos(), 0.8, 0.3);
      if (this.lightSrc) this.lightSrc.pos.copy(this.chestPos());
      if (doTick) this._dot(game, s.burnDmg * 0.5, 'burn', 0xff8833);
      if (s.burn <= 0 && this.lightSrc) { game.renderer.removeDynamic(this.lightSrc); this.lightSrc = null; }
    }
    if (s.poison > 0) {
      s.poison -= dt;
      if (Math.random() < 0.15) game.fx.spark(this.chestPos(), new THREE.Vector3(rand(-0.3, 0.3), 0.8, rand(-0.3, 0.3)), 0x66ff44, 0.8, 0.1, { grav: -0.5, floor: false });
      if (doTick) this._dot(game, s.poisonDmg * 0.5, 'poison', 0x77ff55);
      if (s.poison <= 0) s.poisonDmg = 0;
    }
    if (s.bleed > 0) {
      s.bleed -= dt;
      if (Math.random() < 0.2 && game.fx.gore) game.fx.chunk('blood', this.chestPos(), new THREE.Vector3(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)), BLOOD[this.def.blood], 2);
      if (doTick) this._dot(game, s.bleedDmg * 0.5, 'bleed', 0xff3333);
    }
    if (s.chill > 0) {
      s.chill -= dt;
      if (Math.random() < 0.15) game.fx.spark(this.chestPos(), new THREE.Vector3(rand(-0.5, 0.5), rand(0, 0.5), rand(-0.5, 0.5)), 0xaaeeff, 0.6, 0.08, { grav: 1, floor: false });
      if (s.chill <= 0) s.chillStacks = 0;
    }
    if (s.frozen > 0) {
      s.frozen -= dt;
      this.setFlash(0.25 + Math.sin(this.game.time * 10) * 0.05);
      if (s.frozen <= 0) this.setFlash(0);
    }
    // burning elite aura
    if (this.has('burning') && !this.dead) {
      if (Math.random() < 0.4) game.fx.fire(this.pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4))), 0.7, 0.2);
      if (doTick && game.player.pos.distanceTo(this.pos) < 1.8 + this.radius) game.player.takeDamage({ amount: Math.round(2 + game.floor), type: 'fire', unblockable: true, unavoidable: false, source: 'aura' });
    }
  }

  _dot(game, amount, type, color) {
    if (amount <= 0) return;
    const a = Math.max(1, Math.round(amount));
    this.hp -= a;
    game.stats.damageDealt += a;
    game.fx.numbers.add(this.headPos(), String(a), 'dot ' + type);
    this.lastHurt = 0;
    if (this.hp <= 0) this.die(game, { amount: a, dir: new THREE.Vector3(0, 0, 0), knockback: 0, type, source: 'player' });
    void color;
  }

  // ---------------------------------------------------------------- attacks
  _chooseAttack(dist, game) {
    const list = this.boss && this.phase === 2 && this.def.phase2 ? this.def.phase2.map((n) => this.attacks.find((a) => a.name === n) || { name: n, def: ATTACKS[n], cd: 0 }) : this.attacks;
    if (this.boss && this.phase === 2 && !this._p2init) {
      this._p2init = true;
      this.attacks = list;
    }
    const cands = list.filter((a) => a.cd <= 0 && dist <= a.def.range && dist >= (a.def.minRange || 0));
    if (!cands.length) return null;
    // melee attacks need a token (limits simultaneous attackers)
    const needsToken = (a) => !this.boss && ['melee', 'leap', 'charge', 'slam', 'dive', 'hop', 'spin'].includes(a.def.kind);
    const usable = cands.filter((a) => !needsToken(a) || this.token || game.level.attackTokens < game.level.maxTokens);
    if (!usable.length) return null;
    // prefer special attacks a bit when available
    const pick = usable[Math.floor(Math.random() * usable.length)];
    if (needsToken(pick) && !this.token) { this.token = true; game.level.attackTokens++; }
    return pick;
  }

  _startAttack(atk, game) {
    const d = atk.def;
    this.state = 'attack';
    const speedMul = this.atkSpeed * (this.boss && this.phase === 2 ? 1.2 : 1);
    this.attack = { a: atk, def: d, phase: 'wind', t: 0, wind: d.wind / speedMul, act: d.act, rec: d.rec / speedMul, hit: false, chain: (d.chain || 1) - 1, target: game.player.pos.clone() };
    atk.cd = rand(d.cd[0], d.cd[1]) * (this.boss ? 0.7 : 1);
    this.cooldown = rand(0.5, 1.2) * (this.def.ranged ? 1.4 : 1);
    if (d.kind !== 'projectile' || Math.random() < 0.4) game.audio.voice(this.pos, this.def.voice, d.kind === 'charge' || d.kind === 'summon' ? 'roar' : 'attack');
    if (d.unblockable) this.unblockableGlow = 1;
    if (d.kind === 'explode') game.audio.fire(this.pos, false);
  }

  _updateAttack(dt, game, toP, dist) {
    const A = this.attack;
    if (!A) { this.state = 'chase'; return null; }
    const d = A.def;
    const p = game.player;
    A.t += dt;
    let out = null;
    const face = Math.atan2(toP.x, toP.z);
    if (A.phase === 'wind') {
      // track the player; commit in the last moments
      const lock = A.t > A.wind - 0.16;
      out = { x: 0, z: 0, speed: 0, face: lock ? null : face };
      if (d.kind === 'melee' && dist > d.range * 0.7) out = { x: toP.x / dist, z: toP.z / dist, speed: this.speed * 0.5, face: lock ? null : face };
      // glint telegraph
      if (this.glint) {
        const g = Math.max(0, 1 - Math.abs(A.t - (A.wind - 0.22)) / 0.12);
        this.glint.material.opacity = g * 0.9;
        this.glint.material.color.set(d.unblockable ? 0xff2200 : 0xffffff);
        this.glint.scale.setScalar(0.6 + g * 0.8);
      }
      if (d.unblockable && Math.random() < 0.5) game.fx.spark(this.chestPos().add(new THREE.Vector3(rand(-0.4, 0.4), rand(-0.5, 0.5), rand(-0.4, 0.4))), new THREE.Vector3(0, 1, 0), 0xff2200, 0.4, 0.12, { grav: -1, floor: false });
      if (d.kind === 'explode') {
        this.setFlash(Math.sin(A.t * 30) * 0.5 + 0.5);
        if (this.rig && this.rig.glowCore) this.rig.glowCore.scale.setScalar(1 + A.t * 0.6);
      }
      if (d.kind === 'leap' && d.slam && A.t > A.wind - 0.05) A.target.copy(p.pos);
      if (A.t >= A.wind) {
        A.phase = 'act';
        A.t = 0;
        if (this.glint) this.glint.material.opacity = 0;
        this._onActStart(game, d, toP, dist);
      }
    } else if (A.phase === 'act') {
      out = this._actUpdate(dt, game, d, toP, dist);
      if (A.t >= A.act) {
        A.phase = 'rec';
        A.t = 0;
        this.charging = false;
        this.unblockableGlow = 0;
        if (d.kind === 'leap' || d.kind === 'hop' || d.kind === 'dive') this._landHit(game, d);
      }
    } else {
      out = { x: 0, z: 0, speed: 0, face: null };
      if (A.t >= A.rec) {
        if (A.chain > 0) {
          A.chain--;
          A.phase = 'wind';
          A.t = A.wind * 0.45;
          A.hit = false;
        } else {
          this._endAttack();
          this.state = 'chase';
          this.cooldown = rand(0.4, 1.1) / this.atkSpeed;
          if (this.def.skirmish) this.retreatT = rand(0.8, 1.4);
        }
      }
    }
    return out;
  }

  _onActStart(game, d, toP, dist) {
    const A = this.attack;
    const p = game.player;
    switch (d.kind) {
      case 'melee':
        game.audio.swing(1.2, 0.8);
        this._meleeHit(game, d);
        break;
      case 'slam': {
        game.audio.swing(1.8, 0.6);
        const c = this.pos.clone().addScaledVector(this.forward(_v2), 1.6 * this.sizeScale * (this.def.scale || 1) * 0.8);
        game.schedule(0.08, () => this._shockwave(game, c, d.radius * (this.def.scale || 1) * 0.75 + 0.6, d));
        break;
      }
      case 'projectile': {
        const n = d.count || 1;
        const from = this.rig ? this.rig.bones.handR.localToWorld(new THREE.Vector3(0, -0.1, 0.1)) : this.chestPos();
        if (this.def.weapon === 'bow') this.rig.bones.handL.localToWorld(from.set(0, 0, 0.1));
        if (this.def.weapon === 'staff' && this.weapon) this.weapon.group.localToWorld(from.set(0, 1.15, 0));
        const target = p.chestPos().add(new THREE.Vector3(p.vel.x, 0, p.vel.z).multiplyScalar(dist / d.speed * 0.6));
        for (let i = 0; i < n; i++) {
          const dir = target.clone().sub(from).normalize();
          if (n > 1) dir.applyAxisAngle(UP, (i - (n - 1) / 2) * (d.spread / (n - 1)) * 1.2);
          game.spawnEnemyProjectile(d.proj, from, dir.multiplyScalar(d.speed), Math.round(this.dmg * d.dmg), this);
        }
        if (d.proj === 'arrow') game.audio.bowShoot(from);
        else game.audio.cast(from, 'fire');
        break;
      }
      case 'leap': {
        game.audio.swing(1.5, 0.7);
        const tgt = A.target;
        const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        const travel = Math.max(0, dl - (d.slam ? 0.5 : 1.3));
        A.leapVel = travel / d.act;
        A.leapDir = new THREE.Vector3(dx / dl, 0, dz / dl);
        this.vel.y = d.jump || 4;
        this.airborne = true;
        break;
      }
      case 'charge':
        this.charging = true;
        this.chargeHitWall = false;
        A.chargeDir = this.forward(new THREE.Vector3());
        game.audio.voice(this.pos, this.def.voice, 'roar');
        break;
      case 'nova': {
        const r = d.radius * (d.ring ? 1 : 1);
        game.fx.ring(this.pos, 0xff5522, r, 0.45, 1);
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          game.fx.fire(this.pos.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.8, 0.2, Math.sin(a) * r * 0.8)), 1.4, 0.3);
        }
        game.renderer.flash(this.chestPos(), 0xff6622, 30, r * 2.5, 0.5);
        game.audio.fire(this.pos, true);
        const pd = p.pos.distanceTo(this.pos);
        if (pd < r && (!d.ring || pd > r - 2.2)) p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: _v.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().clone(), knock: d.knock, unblockable: true, type: 'fire', attacker: this });
        break;
      }
      case 'explode': {
        this.hp = 0;
        this.die(game, { amount: 0, dir: new THREE.Vector3(), knockback: 0, source: 'self' });
        break;
      }
      case 'hop': {
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        A.leapDir = new THREE.Vector3(dx / dl, 0, dz / dl);
        A.leapVel = Math.min(d.speed, dl / d.act);
        this.vel.y = d.jump;
        this.airborne = true;
        game.audio.voice(this.pos, 'slime', 'attack');
        break;
      }
      case 'dive':
        A.leapDir = new THREE.Vector3(toP.x / dist, 0, toP.z / dist);
        game.audio.voice(this.pos, 'bat', 'attack');
        break;
      case 'spin':
        A.spinHit = 0;
        game.audio.swing(2, 0.6);
        break;
      case 'summon': {
        const kind = this.def.summon || 'skeleton';
        const n = this.phase === 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = this.yaw + (i - (n - 1) / 2) * 1.2 + Math.PI;
          const x = this.pos.x + Math.sin(a) * 3, z = this.pos.z + Math.cos(a) * 3;
          if (!game.world.navCell(Math.floor(x / TILE), Math.floor(z / TILE))) continue;
          game.level.spawnEnemy(kind, x, z, { roomId: this.roomId, spawning: true });
        }
        game.fx.ring(this.pos, 0xaa66ff, 5, 0.6, 0.8);
        break;
      }
      default:
    }
  }

  _actUpdate(dt, game, d) {
    const A = this.attack;
    const p = game.player;
    switch (d.kind) {
      case 'leap':
      case 'hop':
        return { x: A.leapDir.x, z: A.leapDir.z, speed: A.leapVel, face: null, direct: true };
      case 'charge': {
        const dir = A.chargeDir;
        if (Math.random() < 0.4) game.fx.dust(this.pos.clone().setY(0.1), 1, 0x7a7068, 0.3);
        if (!A.hit && p.pos.distanceTo(this.pos) < this.radius + 0.8) {
          A.hit = true;
          p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: dir.clone(), knock: d.knock, unblockable: true, attacker: this, melee: true });
        }
        if (this.chargeHitWall) {
          // stunned against a wall
          this.charging = false;
          game.fx.dust(this.chestPos(), 8, 0x8a8070, 0.6);
          game.fx.debris(this.chestPos(), 'stone', 8, 4);
          game.audio.wallHit(this.pos);
          game.audio.land(1.5);
          game.player.addTrauma(0.35);
          this._endAttack();
          this.state = 'stagger';
          this.stateT = this.boss ? 2.0 : 2.4;
          this.vulnerable = this.stateT;
          game.fx.numbers.add(this.headPos(), 'STUNNED', 'parry');
          return { x: 0, z: 0, speed: 0, face: null };
        }
        return { x: dir.x, z: dir.z, speed: d.speed, face: null };
      }
      case 'dive': {
        const f = Math.min(1, A.t / d.act);
        if (this.bat) this.bat.group.position.y = 1.8 - Math.sin(f * Math.PI) * 0.8;
        if (!A.hit && p.pos.distanceTo(this.pos) < 1.2 && f > 0.3) {
          A.hit = true;
          p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: A.leapDir.clone(), knock: 2, attacker: this, melee: true });
          game.audio.hitFlesh(p.chestPos(), 0.5);
        }
        return { x: A.leapDir.x, z: A.leapDir.z, speed: d.speed, face: null };
      }
      case 'spin': {
        A.spinHit -= dt;
        this.yaw += dt * 14;
        if (Math.random() < 0.3) game.audio.swing(1.6, 0.7);
        if (A.spinHit <= 0 && p.pos.distanceTo(this.pos) < d.radius) {
          A.spinHit = 0.35;
          p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: _v.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().clone(), knock: d.knock, attacker: this, melee: true });
        }
        const toPx = p.pos.x - this.pos.x, toPz = p.pos.z - this.pos.z;
        const l = Math.hypot(toPx, toPz) || 1;
        return { x: toPx / l, z: toPz / l, speed: this.speed * 0.7, face: null };
      }
      default:
        return { x: 0, z: 0, speed: 0, face: null };
    }
  }

  _landHit(game, d) {
    const p = game.player;
    if (d.kind === 'hop' && this.slime) {
      // squelchy landing: small splash, hurts only on contact
      game.audio.slimeHit(this.pos, this.sizeScale > 0.9);
      game.fx.blood(this.pos.clone().setY(0.2), UP, 0.4, 'goo');
      const r = (d.radius || 1.5) * Math.max(0.6, this.sizeScale);
      if (p.pos.distanceTo(_v.set(this.pos.x, p.pos.y, this.pos.z)) < r && p.pos.y < 0.6) {
        p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: _v.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().clone(), knock: 3, attacker: this, melee: true });
      }
      return;
    }
    if (d.slam || d.kind === 'hop') {
      const r = d.radius || 2;
      this._shockwave(game, this.pos.clone(), r * (this.def.scale || 1) * (d.slam ? 0.8 : 1) + (d.slam ? 0.8 : 0), d);
      return;
    }
    if (d.kind === 'leap') this._meleeHit(game, d);
    void p;
  }

  _meleeHit(game, d) {
    const p = game.player;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const reach = d.range * Math.max(1, (this.def.scale || 1) * this.sizeScale * 0.85) + 0.35;
    if (dist > reach || Math.abs(p.pos.y - this.pos.y) > 2.2) return;
    const f = this.forward(_v2);
    const ang = Math.acos(clamp((f.x * dx + f.z * dz) / (dist || 1), -1, 1)) * 180 / Math.PI;
    if (ang > (d.arc || 80) / 2 + 12) return;
    const dir = new THREE.Vector3(dx / (dist || 1), 0, dz / (dist || 1));
    const res = p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir, knock: d.knock || 3, unblockable: !!d.unblockable, attacker: this, melee: true, guardBreak: d.guardBreak });
    if (res.damage > 0) {
      if (this.has('vampiric')) { this.hp = Math.min(this.maxHp, this.hp + res.damage * 0.5); game.fx.magic(this.chestPos(), 0xff2244, 8, 1.5); }
      if (this.has('burning')) game.player.addBuff('burning', 2, {});
      game.audio.hitFlesh(p.chestPos(), 0.8);
    }
    if (d.guardBreak && res.blocked) {
      p.stamina = Math.max(0, p.stamina - 30);
    }
  }

  _shockwave(game, c, r, d) {
    const p = game.player;
    game.fx.ring(c, 0xd8b890, r, 0.4, 0.9);
    game.fx.dust(c, 10, 0x8a8070, r * 0.4);
    game.fx.debris(c, 'stone', 8, 4);
    game.audio.land(1.6);
    game.audio.explosion(c, 0.4);
    const dd = p.pos.distanceTo(_v.set(c.x, p.pos.y, c.z));
    p.addTrauma(Math.max(0, 0.5 - dd * 0.04));
    if (dd < r && p.pos.y < 0.5) {
      p.takeDamage({ amount: Math.round(this.dmg * d.dmg), dir: _v.set(p.pos.x - c.x, 0, p.pos.z - c.z).normalize().clone(), knock: d.knock || 6, attacker: this, melee: true, unblockable: !!d.unblockable });
    }
    // shove props and corpses
    game.level.impulseArea(c, r * 1.2, 5);
  }

  // ---------------------------------------------------------------- animation
  _animate(dt) {
    const t = this.game.time;
    // hit reaction spring
    this.reactVel.addScaledVector(this.react, -140 * dt);
    this.reactVel.multiplyScalar(Math.exp(-10 * dt));
    this.react.addScaledVector(this.reactVel, dt);
    if (this.slime) return this._animSlime(dt);
    if (this.bat) return this._animBat(dt);
    if (this.mimic) return this._animMimic(dt);
    const rig = this.rig;
    if (!rig) return;
    rig.resetPose();
    rig.bones.pelvis.position.y = rig.P.hipH;
    const A = this.attack;
    // locomotion
    this.walkPhase += dt * (3 + this.moveAmt * 7) * (this.speed / 4);
    if (!(A && (A.def.kind === 'leap' || A.def.kind === 'charge') && A.phase === 'act')) walkPose(rig, this.walkPhase, this.moveAmt, this.moveAmt > 0.7);
    // breathing
    rig.bones.chest.rotation.x += Math.sin(t * 2 + this.uid) * 0.03;
    if (this.def.hunch) blendPose(rig, POSES.hunch, 1);
    if (this.alerted && !A) blendPose(rig, POSES.guard, 0.7);
    if (this.def.float || this.def.body === 'cultist') rig.bones.pelvis.position.y += this.def.float ? 0.35 + Math.sin(t * 2) * 0.1 : 0;
    if (A && A.def.pose) {
      const [wp, hp] = A.def.pose;
      if (A.phase === 'wind') {
        const k = easeOutCubic(Math.min(1, A.t / A.wind));
        blendPose(rig, POSES[wp], k);
        if (this.def.body === 'brute' && A.def.kind === 'charge') rig.bones.pelvis.position.y -= 0.1 * k;
      } else if (A.phase === 'act') {
        const k = Math.min(1, A.t / Math.max(0.06, Math.min(A.act, 0.12)));
        blendPose(rig, POSES[wp], 1 - k);
        blendPose(rig, POSES[hp], k);
        if (A.def.kind === 'spin') rig.bones.spine.rotation.y += 0;
      } else {
        const k = 1 - easeInOutCubic(Math.min(1, A.t / A.rec));
        blendPose(rig, POSES[hp], k);
      }
    }
    if (this.state === 'stagger') blendPose(rig, POSES.stagger, Math.min(1, this.stateT * 3));
    if (this.state === 'getup') {
      const f = Math.min(1, this.getupT / 0.75);
      const k = 1 - easeInOutCubic(f);
      blendPose(rig, POSES.crouch, Math.sin(f * Math.PI) * 0.8);
      rig.body.rotation.x = -k * 1.3;
      rig.bones.pelvis.position.y = rig.P.hipH * (1 - k * 0.75);
    } else rig.body.rotation.x = 0;
    if (this.status.frozen > 0) return;
    // additive hit reaction
    rig.bones.spine.rotation.x += this.react.x * 0.25;
    rig.bones.chest.rotation.x += this.react.x * 0.15;
    rig.bones.spine.rotation.z += this.react.z * 0.2;
    rig.bones.neck.rotation.x += this.react.x * 0.3 + this.react.y * 0.1;
    rig.bones.neck.rotation.z += this.react.z * 0.2;
    // unblockable red glow
    if (this.unblockableGlow) rig.setRim(0xff2200, 1.2 + Math.sin(t * 20) * 0.3);
    else if (this.status.chill > 0) rig.setRim(0x66ddff, 1.0);
    else if (this.auraColor) rig.setRim(this.auraColor, 0.75);
    else rig.setRim(0x6677aa, 0.35);
    if (this.aura) this.aura.material.opacity = 0.4 + Math.sin(t * 4) * 0.15;
  }

  _animSlime() {
    const s = this.slime;
    const t = this.game.time;
    const A = this.attack;
    let sq = Math.sin(t * 6 + this.uid) * 0.06;
    if (A && A.def.kind === 'hop') {
      if (A.phase === 'wind') sq = -0.25 * Math.min(1, A.t / A.wind);
      else if (A.phase === 'act') sq = 0.2;
      else sq = -0.15 * (1 - A.t / A.rec);
    } else if (this.moveAmt > 0.1) sq = Math.abs(Math.sin(t * 8 + this.uid)) * 0.18 - 0.05;
    s.group.scale.set(s.base * (1 - sq * 0.6), s.base * (1 + sq), s.base * (1 - sq * 0.6));
    s.group.rotation.x = this.react.x * 0.1;
    s.group.rotation.z = this.react.z * 0.1;
  }

  _animBat() {
    const b = this.bat;
    const t = this.game.time;
    const flap = Math.sin(t * 22 + this.uid) * 0.9;
    b.wl.rotation.z = -flap;
    b.wr.rotation.z = flap;
    if (!this.attack || this.attack.def.kind !== 'dive' || this.attack.phase !== 'act') b.group.position.y = damp(b.group.position.y, 1.8 + Math.sin(t * 3 + this.uid) * 0.25, 4, 1 / 60);
    b.group.rotation.x = this.react.x * 0.2;
  }

  _animMimic() {
    const m = this.mimic;
    const t = this.game.time;
    const A = this.attack;
    let open = 0.3 + Math.sin(t * 5) * 0.15;
    if (A && A.phase === 'wind') open = 0.9;
    else if (A && A.phase === 'act') open = 0.1;
    m.lid.rotation.x = -open;
    m.group.position.y = this.moveAmt > 0.1 ? Math.abs(Math.sin(t * 9)) * 0.2 : 0;
  }

  dispose() {
    this._endAttack();
    if (this.lightSrc) { this.game.renderer.removeDynamic(this.lightSrc); this.lightSrc = null; }
    this.root.removeFromParent();
  }
}

// A lootable/kickable corpse wrapper around a ragdoll.
export class Corpse {
  constructor(enemy, ragdoll) {
    this.isCorpse = true;
    this.enemy = enemy;
    this.ragdoll = ragdoll;
    this.blood = enemy.def.blood;
    this.age = 0;
  }

  meleeRay(o, d, maxDist, pad) {
    const rd = this.ragdoll;
    if (rd.pos[J.chest].distanceTo(o) > maxDist + 2) return null;
    let best = null;
    for (let i = 0; i < rd.n; i++) {
      const t = raySphere(o, d, rd.pos[i], rd.radius[i] + pad * 0.6);
      if (t >= 0 && t <= maxDist && (!best || t < best.dist)) best = { dist: t, part: i };
    }
    return best;
  }

  onMeleeHit(game, h, dir, power, mult) {
    const rd = this.ragdoll;
    rd.impulse(h.point, dir.clone().multiplyScalar(power * 0.9 + 2).setY(Math.max(1.5, power * 0.25)), 0.7);
    const col = BLOOD[this.blood];
    if (this.blood === 'bone') {
      game.fx.debris(h.point, 'bone', 3, 3);
      game.audio.hitBone(h.point, 0.7);
    } else {
      game.fx.blood(h.point, dir, 0.6, this.blood === 'goo' ? 'goo' : this.blood === 'ichor' ? 'ichor' : 'blood', col);
      game.audio.hitFlesh(h.point, 0.7);
    }
    // heavy blows can still take limbs off
    if (mult >= 3 && game.fx.gore > 0 && Math.random() < 0.5) {
      const [pi] = rd.nearest(h.point);
      const frameByJoint = { [J.handL]: 'armL', [J.elbowL]: 'armL', [J.handR]: 'armR', [J.elbowR]: 'armR', [J.kneeL]: 'legL', [J.footL]: 'legL', [J.kneeR]: 'legR', [J.footR]: 'legR', [J.headTop]: 'head', [J.headBase]: 'head', [J.headFront]: 'head' };
      const part = frameByJoint[pi];
      if (part) {
        const s = rd.sever(part);
        if (s && this.blood !== 'bone') {
          game.fx.fountain(() => rd.pos[s.a], () => UP, 0.8, this.blood === 'goo' ? 'goo' : 'blood', col);
          game.audio.gore(h.point, 1);
        }
      }
    }
    void partOfFrame;
  }

  onKick(game, h, dir, power) {
    this.ragdoll.impulseAll(dir.clone().multiplyScalar(power * 0.5).setY(power * 0.3));
    this.ragdoll.impulse(h.point, dir.clone().multiplyScalar(power * 0.6), 0.8);
    game.audio.kick(h.point, true);
  }
}

export { randPick, lerp };
