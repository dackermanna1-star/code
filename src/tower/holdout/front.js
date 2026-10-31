// HOLDOUT — the browser side of the on-foot mode: the first-person controls, camera and hands, the
// valley drawn through Last Lookout's retro renderer with the mode's props, the zombies' meshes,
// sound and effects for everything the game core (game.js) reports, the HUD. main.js hands over
// the shared pieces (renderer, level, camera, hands, audio, effects, menus) and the frame loop
// while the mode runs.
import * as THREE from 'three';
import { Vec3, clamp, lerp, makeRng } from '../../physics/math.js';
import { FpsInput } from '../../fps/input.js';
import { MELEE_MOVES } from '../../render/fpsView.js';
import { LAYOUT, buildWalkGrid, isWater } from '../level/layout.js';
import { ENEMIES } from '../catalog.js';
import { HoldoutGame } from './game.js';
import { HoldoutProps } from './props.js';
import { HoldoutHud } from './hud.js';
import { GUNS, PICKUPS } from './areas.js';

const FIXED = 1 / 60;
const BASE_FOV = 76;
const ZERO_LOOK = { dx: 0, dy: 0 };
const WOUND_KIND = { entry: 0, exit: 1, laceration: 2, bruise: 3, stab: 2, incised: 2 };
const ZOOM = { pistol: 1.2, revolver: 1.25, smg: 1.3, shotgun: 1.15, rifle: 1.5, sniper: 1 };
const SCOPE_CSS = `
.hold .scopev { position: absolute; inset: 0; display: none; pointer-events: none;
  background: radial-gradient(circle at center, transparent 0, transparent 36vmin, #000 36.4vmin); }
.hold .scopev::before, .hold .scopev::after { content: ''; position: absolute; background: rgba(0,0,0,.85); }
.hold .scopev::before { left: 50%; top: calc(50% - 36vmin); width: 2px; height: 72vmin; margin-left: -1px; }
.hold .scopev::after { top: 50%; left: calc(50% - 36vmin); height: 2px; width: 72vmin; margin-top: -1px; }
`;

/**
 * ctx: { retro, level, camera, view (FpsView), audio (TowerAudio), fx (TowerFx), hud (TowerHud),
 *        OM, shape (BodyShape), createZombieVisual, prepareZombieMeshes, save, writeSave,
 *        quality(), onQuit() }
 */
export class HoldoutFront {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.built = false;
    this.paused = false;
    this.acc = 0;
    this.visuals = new Map();
    this.shake = 0;
    this.lean = 0;
    this.roll = 0;
    this.groanT = new Map();
    this.hordeSoundT = 0;
    this.pendingKeys = new Set();
    this.pendingWheel = 0;
    this.eyePrev = new Vec3();
    this.eyeCur = new Vec3();
    this.overT = -1;
    this.boss = null;
    this.floods = [];
  }

  build() {
    const c = this.ctx;
    const walkGrid = buildWalkGrid(1, 0.35, { skip: (k) => k.kind === 'gate' });
    const q = c.quality ? c.quality() : 'medium';
    this.game = new HoldoutGame({
      layout: LAYOUT, shape: c.shape, walkGrid, rng: makeRng((Math.random() * 1e9) | 0),
      maxPhysical: q === 'low' ? 6 : q === 'high' ? 11 : 8, maxCorpses: q === 'low' ? 24 : q === 'high' ? 48 : 36,
    });
    // the hands' moves time the kick (the hit window: when the boot can land)
    const moves = {};
    for (const [k, m] of Object.entries(MELEE_MOVES)) moves[k] = { windup: m.windup, strike: m.strike, recover: m.recover, chargeTime: m.charge, hitWindow: m.hitWindow };
    this.game.arsenal.setMoves(moves);
    this.props = new HoldoutProps(c.level.scene, c.level.materials, c.OM);
    this.props.setVisible(false);
    this.hud = new HoldoutHud(document.body);
    if (!document.getElementById('ll-hold-scope')) {
      const st = document.createElement('style');
      st.id = 'll-hold-scope';
      st.textContent = SCOPE_CSS;
      document.head.appendChild(st);
    }
    this.scopeEl = document.createElement('div');
    this.scopeEl.className = 'scopev';
    this.hud.c.insertBefore(this.scopeEl, this.hud.c.firstChild.nextSibling);
    this.input = new FpsInput(c.retro.renderer.domElement);
    this.input.onLockChange = (locked) => this.onLock(locked);
    this.built = true;
  }

  applySettings() {
    const s = this.ctx.save.settings;
    this.input.sensitivity = 0.0022 * (s.mouseSens ?? 1);
    this.input.invertY = !!s.invertY;
  }

  // -------------------------------------------------------------------------------------------
  enter() {
    if (!this.built) this.build();
    this.active = true;
    const c = this.ctx;
    this.applySettings();
    // the valley for the mode: the compound's gates hang open, its floodlights burn
    for (const gt of LAYOUT.compound.gates) c.level.gateMesh(gt.id).break();
    for (const id of ['north', 'south', 'east', 'west']) {
      c.level.addFloodlight(id);
      this.floods.push(id);
    }
    c.hud.hud.style.display = 'none';
    c.hud.hideScreens();
    this.props.setVisible(true);
    this.hud.show(true);
    this.input.enabled = true;
    this.newRun();
  }

  newRun() {
    for (const z of [...this.visuals.keys()]) this.detach(z);
    const g = this.game;
    g.newRun();
    for (const e of g.drainEvents()) void e;
    this.props.reset(g);
    this.hud.reset();
    this.ctx.view.setWeapon(g.gun.type);
    this.eyeCur.copy(g.player.eye(new Vec3()));
    this.eyePrev.copy(this.eyeCur);
    this.acc = 0;
    this.overT = -1;
    this.roll = 0;
    this.boss = null;
    this.paused = false;
    this.lockWait = 1.2;
    this.ctx.hud.hideScreens();
    this.ctx.level.setRain(0);
    this.input.lock();
    this.ctx.audio.music('calm');
    this.hud.bannerShow('HOLDOUT', 'HOLD OUT AS LONG AS YOU CAN');
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    const c = this.ctx;
    this.input.unlock();
    this.input.enabled = false;
    this.hud.show(false);
    this.props.setVisible(false);
    for (const z of [...this.visuals.keys()]) this.detach(z);
    this.game.horde.clear();
    for (const e of this.game.drainEvents()) void e;
    for (const gt of LAYOUT.compound.gates) c.level.gateMesh(gt.id).setDamage(0);
    for (const id of this.floods) c.level.removeFloodlight(id);
    this.floods.length = 0;
    c.hud.hud.style.display = '';
    c.view.setWeapon('sniper');
    c.camera.rotation.z = 0;
  }

  resume() {
    this.paused = false;
    this.ctx.hud.hideScreens();
    this.input.lock();
  }

  pause() {
    if (this.paused || this.game.over) return;
    this.paused = true;
    this.ctx.hud.showPause({ round: this.game.round || 1, controls: CONTROLS });
  }

  onLock(locked) {
    if (!this.active) return;
    if (locked) {
      this.lockWait = 0;
      if (this.paused) this.resume();
    } else if (!this.game.over) this.pause();
  }

  // -------------------------------------------------------------------------------------------
  frame(now, dtReal) {
    const c = this.ctx, g = this.game, pl = g.player;
    const inp = this.input.poll();
    for (const k of inp.pressed) this.pendingKeys.add(k);
    this.pendingWheel += inp.wheel;
    if (inp.pressed.has('Escape')) this.pause();
    if (this.lockWait > 0 && !this.input.locked) {
      this.lockWait -= dtReal;
      if (this.lockWait <= 0) this.pause();
    }
    const running = !this.paused && (this.input.locked || g.over);
    let n = 0;
    if (running) {
      this.acc += dtReal;
      let look = inp.look;
      while (this.acc >= FIXED && n < 4) {
        const stepInp = {
          move: inp.move, look, sprint: inp.sprint, crouch: inp.crouch, jump: inp.jump, fire: inp.fire, ads: inp.ads,
          pressed: n === 0 ? this.pendingKeys : EMPTY, wheel: n === 0 ? this.pendingWheel : 0,
        };
        this.eyePrev.copy(this.eyeCur);
        g.step(FIXED, g.over ? null : stepInp);
        pl.eye(this.eyeCur);
        if (n === 0) {
          this.pendingKeys = new Set();
          this.pendingWheel = 0;
        }
        look = ZERO_LOOK;
        for (const e of g.drainEvents()) this.onEvent(e);
        this.acc -= FIXED;
        n++;
      }
      if (n === 4) this.acc = 0;
      // (the mouse still turns the view between physics steps)
      if (n === 0 && pl.alive) {
        pl.yaw += look.dx;
        pl.pitch = clamp(pl.pitch + look.dy, -1.45, 1.45);
      }
    }
    const alpha = clamp(this.acc / FIXED, 0, 1);
    this.updateVisuals(alpha, dtReal);
    this.props.update(running ? dtReal : 0, g, c.camera);
    // the round's light: dusk deepening into night over the first rounds
    const tod = Math.min(0.62, 0.16 + 0.045 * Math.max(0, g.round - 1));
    c.level.setTimeOfDay(tod);
    c.level.setRain(g.round >= 8 && g.round % 4 === 0 ? 0.6 : 0);
    c.level.setWind(0.6, 0.3, 1.5);
    c.level.update(dtReal, c.camera);
    c.fx.update(running ? dtReal : 0, c.camera);
    this.updateCamera(dtReal, inp, alpha);
    this.updateSound(dtReal, now, tod);
    this.updateHud(dtReal);
    // the game over screen, a few seconds after the end
    if (g.over && this.overT >= 0) {
      this.overT += dtReal;
      if (this.overT > 3.8 && !this.overShown) this.showOver();
    }
    this.render();
  }

  updateCamera(dt, inp, alpha) {
    const c = this.ctx, g = this.game, pl = g.player, ar = g.arsenal, cam = c.camera;
    const ex = lerp(this.eyePrev.x, this.eyeCur.x, alpha), ey = lerp(this.eyePrev.y, this.eyeCur.y, alpha), ez = lerp(this.eyePrev.z, this.eyeCur.z, alpha);
    const ph = pl.stepPhase * Math.PI * 2;
    const move = Math.min(1, pl.speed / 3.3) * (pl.onGround ? 1 : 0) * (1 - 0.7 * ar.adsAmount);
    const bob = (0.03 + 0.03 * (pl.sprinting ? 1 : 0)) * move;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const t = performance.now() / 1000;
    cam.position.set(ex + Math.cos(ph) * bob * 0.35, ey + Math.abs(Math.sin(ph)) * bob - bob * 0.5, ez);
    const side = (pl.vel.x * Math.cos(pl.yaw) - pl.vel.z * Math.sin(pl.yaw)) / 3.3;
    this.lean = lerp(this.lean, -side * 0.02, Math.min(1, dt * 6));
    if (!pl.alive) this.roll = lerp(this.roll, 0.55, Math.min(1, dt * 1.5));
    cam.rotation.set(pl.pitch + g.recoil.p + Math.sin(t * 37) * sh * 0.03, pl.yaw + g.recoil.y + Math.sin(t * 29) * sh * 0.03, this.lean + this.roll + Math.sin(t * 23) * sh * 0.02, 'YXZ');
    const gun = g.gun;
    const scope = c.view.scopeAmount ? c.view.scopeAmount() : 0;
    const zoom = gun ? (gun.type === 'sniper' ? lerp(1.35, 4.5, scope) : ZOOM[gun.type] || 1.2) : 1;
    const fov = lerp(BASE_FOV, BASE_FOV / zoom, ar.adsAmount) * (pl.sprinting ? 1.06 : 1);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.scope = scope;
    // the hands
    const M = ar.melee;
    if (gun) {
      c.view.update(dt, {
        ads: ar.adsAmount, sprint: pl.sprinting, speed: pl.speed, step: pl.stepPhase, onGround: pl.onGround, crouch: pl.crouch,
        look: inp.look, landed: pl.landed, state: ar.state, stateT: ar.t, reloadTime: gun.reload || 1, perShell: !!gun.perShell,
        melee: M ? { move: M.move, phase: M.phase, t: M.t, charge: M.charge, hit: M.hit } : null,
        empty: gun.ammo === 0, pitch: pl.pitch,
      });
    }
    pl.landed = 0;
    c.view.setLighting(lerp(1, 0.45, this.ctx.level.timeOfDay));
  }

  render() {
    const c = this.ctx, g = this.game;
    c.retro.setScopeBoost(1);
    const hands = g.player.alive && this.scope < 0.98;
    c.retro.render(c.level.scene, c.camera, !hands);
    if (hands) c.retro.renderOverlay(c.view.scene, c.view.camera);
  }

  // -------------------------------------------------------------------------------------------
  // zombie meshes
  attach(z) {
    if (this.visuals.has(z)) return;
    const v = this.ctx.createZombieVisual(z.person, z.kind, this.ctx.level.scene);
    v.zombie = z;
    this.visuals.set(z, { v, decals: [], dirty: false, t: 0, frozen: false });
  }

  detach(z) {
    const r = this.visuals.get(z);
    if (!r) return;
    r.v.dispose();
    this.visuals.delete(z);
  }

  addWound(z, w) {
    const r = this.visuals.get(z);
    if (!r) return;
    const shape = this.ctx.shape, seg = w.seg;
    const bindPos = w.body.userData.fragment ? w.body.userData.bindPos : seg.bindPos;
    const modelPos = shape.localToModel(seg.name, bindPos, w.local, new Vec3());
    const mp = shape.modelPose[seg.name];
    const dir = w.dir ? w.dir.clone().applyQuat(mp.q) : null;
    r.decals.push({ wound: w, modelPos, radius: w.radius, kind: WOUND_KIND[w.kind] ?? 0, age: 0, severity: w.severity ?? 0.5, seed: w.seed ?? Math.random(), dir });
    r.dirty = true;
  }

  updateVisuals(alpha, dt) {
    for (const [z, r] of this.visuals) {
      if (z.state === 'frozen') {
        if (!r.frozen) {
          r.v.update(1);
          r.frozen = true;
        }
      } else r.v.update(alpha, dt);
      r.t -= dt;
      if (r.dirty && r.t <= 0) {
        for (const d of r.decals) d.age = d.wound.age;
        r.v.setWounds(r.decals);
        r.dirty = false;
        r.t = 0.25;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  onEvent(e) {
    const c = this.ctx, A = c.audio, E = A.eng, g = this.game, pl = g.player, H = this.hud;
    switch (e.type) {
      case 'zombieSpawned':
        this.attach(e.zombie);
        break;
      case 'corpseRemoved':
      case 'zombieRemoved':
        this.detach(e.zombie);
        break;
      case 'rise': {
        const p = e.pos;
        c.fx.dust(new Vec3(p.x, 0.05, p.z), 0.5);
        c.fx.impact(new Vec3(p.x + (Math.random() - 0.5) * 0.4, 0.02, p.z + (Math.random() - 0.5) * 0.4), new Vec3(0, 1, 0), 'dirt');
        if (Math.random() < 0.6) A.zombieGroan(e.zombie.kind, p);
        break;
      }
      case 'attack':
        if (Math.random() < 0.45) A.zombieGroan(e.zombie.kind, e.zombie.root.pos);
        break;
      case 'fire': {
        E.gunshot(e.gun, null);
        c.view.fire(e.recoil, g.arsenal.adsAmount);
        const mz = e.origin.clone().addScaled(e.dir, 0.55);
        mz.y -= 0.1;
        c.fx.muzzle(mz, e.dir, { noFlash: true });
        for (const p of e.paths) if (!p.hits.length || Math.random() < 0.3) c.fx.tracer(mz, p.to);
        c.level.scare(e.origin);
        if (e.gun !== 'shotgun' && e.gun !== 'sniper' && e.gun !== 'revolver') {
          const cp = e.origin.clone().addScaled(e.dir, 0.3);
          cp.y -= 0.15;
          c.fx.shellCasing(cp, new Vec3(Math.cos(pl.yaw), 0.5, -Math.sin(pl.yaw)));
        }
        break;
      }
      case 'arsenal':
        this.onArsenal(e.e);
        break;
      case 'gunChanged':
        c.view.setWeapon(e.gun.type);
        E.gunHandling('equip', e.gun.type);
        break;
      case 'player':
        if (e.e.type === 'footstep') E.footstep(clamp(e.e.speed / 5, 0.3, 1) * (1 - 0.5 * e.e.crouch), null);
        else if (e.e.type === 'land') {
          E.footstep(1, null);
          this.shake = Math.max(this.shake, Math.min(0.5, e.e.speed * 0.05));
        }
        break;
      case 'hit':
        H.hit(e.kill ? 'kill' : e.head ? 'head' : 'hit');
        A.hitMarker(e.head, e.kill);
        if (e.head && !e.armor) A.headshotCrack(e.zombie.person.rd.segments.head.body.pos);
        break;
      case 'kill':
        H.hit('kill');
        if (e.zombie === this.boss) this.boss = null;
        break;
      case 'points':
        H.points(e.amount);
        break;
      case 'hurt': {
        const dx = e.from.x - pl.pos.x, dz = e.from.z - pl.pos.z;
        let a = Math.atan2(-dx, -dz) - pl.yaw; // 0 = ahead
        a = -Math.atan2(Math.sin(a), Math.cos(a));
        H.hurt(a);
        A.playerHurt(clamp(e.amount / 50, 0.3, 1));
        this.shake = Math.min(1, this.shake + 0.35);
        break;
      }
      case 'roundStart':
        H.bannerShow(`ROUND ${e.n}`, e.bosses.length ? `${e.bosses.join(' & ').toUpperCase()} AMONG THEM` : e.n === 1 ? 'THEY ARE COMING' : '');
        E.sting(e.bosses.length ? 'boss' : 'wave');
        A.music(e.bosses.length ? 'boss' : 'fight');
        break;
      case 'roundEnd':
        H.bannerShow(`ROUND ${e.n} SURVIVED`, 'CATCH YOUR BREATH');
        A.waveCleared();
        A.music('calm');
        break;
      case 'doorOpened':
        this.props.onEvent(e, g);
        if (!e.auto) {
          const p = new Vec3(e.door.pos[0], 0.4, e.door.pos[1]);
          E.impact('wood', 1, p);
          c.fx.dust(p);
          c.fx.dust(p.clone().add(new Vec3(1, 0, 0)));
          if (e.areas.length) H.bannerShow(e.areas[0].name, 'NEW GROUND · MORE OF THEM');
        }
        break;
      case 'bought':
        A.cash();
        H.points(-e.price);
        break;
      case 'denied':
        A.ui('error');
        H.denied();
        break;
      case 'upgraded':
        H.bannerShow(e.gun.name, 'REBUILT AT THE BENCH');
        E.gunHandling('charge', e.gun.type);
        E.sting('clear');
        break;
      case 'perk':
        this.props.onEvent(e, g);
        H.bannerShow(e.name, PERK_LINE[e.id] || '');
        E.sting('clear');
        break;
      case 'crate':
        this.props.onEvent(e, g);
        if (e.state === 'rolling') E.whoosh(9, null);
        else if (e.state === 'offer') A.ui('buy');
        else if (e.state === 'leaving') {
          H.alert('THE CRATE HAS MOVED ON');
          E.sting('boss');
        } else if (e.state === 'taken') E.gunHandling('equip', g.gun ? g.gun.type : 'pistol');
        break;
      case 'pickupDrop':
        this.props.onEvent(e, g);
        A.ui('place');
        break;
      case 'pickupGone':
        this.props.onEvent(e, g);
        break;
      case 'pickup':
        this.props.onEvent(e, g);
        H.bannerShow(PICKUPS[e.kind].name, PICKUP_LINE[e.kind]);
        if (e.kind === 'ammo') E.gunHandling('magIn', g.gun ? g.gun.type : 'pistol');
        else E.sting(e.kind === 'fury' ? 'boss' : 'clear');
        break;
      case 'buffEnd':
        H.alert(`${e.kind === 'fury' ? 'FURY' : 'BOUNTY'} IS OVER`);
        break;
      case 'shockwave':
        c.fx.explosion(e.pos, 0.5);
        A.explosion(e.pos, 0.6);
        this.shake = Math.min(1.2, this.shake + 0.6);
        break;
      case 'grenadeThrow':
        this.props.onEvent(e, g);
        E.whoosh(11, null);
        break;
      case 'grenadeBounce':
        E.impact('metal', clamp(e.speed / 8, 0.15, 0.6), e.grenade.pos);
        break;
      case 'explosion': {
        this.props.onEvent(e, g);
        c.fx.explosion(e.pos, e.power);
        if (e.kind === 'bloater') c.fx.gasCloud(e.pos, e.radius, 8);
        A.explosion(e.pos, e.power);
        const d = e.pos.distanceTo(pl.pos);
        this.shake = Math.min(1.2, this.shake + e.power * clamp(1 - d / 40, 0.1, 1));
        c.level.scare(e.pos);
        break;
      }
      case 'scream':
        A.zombieScream(e.pos);
        break;
      case 'boss':
        this.boss = e.zombie;
        A.bossRoar(e.zombie.kind, e.zombie.root.pos);
        H.alert(e.zombie.kind === 'juggernaut' ? 'A JUGGERNAUT · TAKE OUT ITS LEGS' : 'A BRUTE · HELMET AND VEST · AIM LOW');
        break;
      case 'over':
        this.overT = 0;
        this.overShown = false;
        A.music('off');
        A.playerHurt(1);
        break;
      case 'sandbox':
        this.onSandboxFx(e.fx);
        break;
    }
  }

  onArsenal(e) {
    const E = this.ctx.audio.eng, view = this.ctx.view;
    switch (e.type) {
      case 'reloadStart':
        E.gunHandling(e.gun.perShell ? 'shell' : 'magOut', e.gun.type);
        break;
      case 'reloadEnd':
        E.gunHandling('magIn', e.gun.type);
        if (e.gun.type !== 'pistol' && e.gun.type !== 'revolver') setTimeout(() => E.gunHandling('charge', e.gun.type), 180);
        break;
      case 'shell':
        E.gunHandling('shell', e.gun.type);
        break;
      case 'pump':
        setTimeout(() => {
          E.gunHandling('pump', 'shotgun');
          view.pump();
        }, (e.delay || 0) * 1000);
        break;
      case 'dry':
        E.gunHandling('dry', e.gun.type);
        break;
      case 'equip':
        view.setWeapon(e.gun.type);
        E.gunHandling('equip', e.gun.type);
        break;
      case 'meleeStrike':
        E.whoosh(9, null);
        break;
    }
  }

  onSandboxFx(f) {
    const c = this.ctx, A = c.audio;
    if (f.type === 'fleshHit') {
      c.fx.bloodMist(f.entry, new Vec3(-f.dir.x, -f.dir.y, -f.dir.z), clamp(f.energy / 900, 0.3, 1.2));
      if (f.exit) c.fx.bloodMist(f.exit, f.dir, clamp(f.energy / 600, 0.5, 2));
    } else if (f.type === 'injury') {
      const z = f.person.towerZombie;
      if (!z) return;
      const ev = f.event;
      if (ev.type === 'wound') this.addWound(z, ev.wound);
      else if (ev.type === 'bonebreak') {
        const r = this.visuals.get(z);
        const info = ev.info;
        if (r) r.v.addFracture(info.seg, info.fragment, info.pointBind, info.axisBind);
        A.boneCrack(f.person.rd.pelvis.pos, 0.8);
      } else if (ev.type === 'armor') {
        A.bulletImpact('metal', f.person.rd.segments.head.body.pos, 6);
        if (ev.part === 'helmet' && ev.left === 0) {
          const r = this.visuals.get(z);
          if (r && r.v.dropHelmet) r.v.dropHelmet(new Vec3(Math.random() - 0.5, 1, Math.random() - 0.5), () => 0);
        }
      }
    } else if (f.type === 'objectHit' || f.type === 'groundHit') {
      const mat = f.type === 'groundHit' ? (isWater(f.point.x, f.point.z) ? 'water' : 'dirt') : f.material === 'chainlink' ? 'metal' : f.material || 'concrete';
      c.fx.impact(f.point, f.normal || new Vec3(0, 1, 0), mat);
      A.bulletImpact(mat, f.point, f.point.distanceTo(this.game.player.pos));
    } else if (f.type === 'impact' && (f.ragdollA || f.ragdollB) && f.ground && f.speed > 2.5) {
      A.bodyFall(f.point, clamp(f.speed / 6, 0.3, 1));
      c.fx.bodyDust(f.point, f.speed);
    } else if (f.type === 'meleeHit') {
      A.eng.impact('flesh', 0.8, f.point || null);
      this.shake = Math.max(this.shake, 0.3);
    }
  }

  // -------------------------------------------------------------------------------------------
  updateSound(dt, now, tod) {
    const A = this.ctx.audio, g = this.game, pl = g.player;
    const eye = g.player.eye(new Vec3());
    const f = g.viewDir(new Vec3());
    A.setListener(eye, f);
    this.hordeSoundT -= dt;
    if (this.hordeSoundT > 0) return;
    this.hordeSoundT = 0.5;
    let count = 0, nearest = Infinity;
    for (const z of g.horde.list) {
      if (!z.alive) continue;
      count++;
      const d = Math.hypot(z.root.pos.x - pl.pos.x, z.root.pos.z - pl.pos.z);
      nearest = Math.min(nearest, d);
      const t = this.groanT.get(z) || 0;
      if (z.animated && d < 40 && now - t > 3500 + Math.random() * 6000) {
        this.groanT.set(z, now);
        if (Math.random() < 0.35) A.zombieGroan(z.kind, z.root.pos);
      }
    }
    A.horde(count, nearest);
    A.ambience(tod, 1.5, this.ctx.level.rain || 0);
    A.heartbeat(pl.alive && pl.health < pl.maxHealth * 0.4 ? 90 + (pl.maxHealth * 0.4 - pl.health) * 2 : 0);
  }

  updateHud(dt) {
    const g = this.game, pl = g.player, ar = g.arsenal, gun = g.gun;
    const cam = this.ctx.camera;
    const spreadRad = gun ? (gun.w.spread || 0) * ar.spreadScale(pl) : 0;
    const px = (spreadRad / Math.tan((cam.fov * Math.PI) / 360)) * (window.innerHeight / 2);
    const b = this.boss && this.boss.alive ? { name: ENEMIES[this.boss.kind].name, hp: Math.max(0, this.boss.person.injury.hp), max: this.boss.person.injury.hpMax } : null;
    this.hud.update(dt, {
      round: g.round, phase: g.phase, timer: g.timer, remaining: g.remaining, points: g.points, x2: g.buffs.bounty > g.time,
      hp: pl.health, maxHp: pl.maxHealth, dead: !pl.alive,
      gun: gun ? { name: gun.name, up: gun.up, ammo: gun.ammo, mag: gun.mag, spare: gun.spare, state: ar.state } : null,
      grenades: g.grenades, perks: [...g.perks],
      buffs: { fury: Math.max(0, g.buffs.fury - g.time), bounty: Math.max(0, g.buffs.bounty - g.time) },
      prompt: g.prompt, spreadPx: 6 + px, ads: ar.adsAmount, boss: b,
    });
    this.scopeEl.style.display = this.scope > 0.98 && pl.alive ? 'block' : 'none';
  }

  showOver() {
    this.overShown = true;
    const g = this.game, c = this.ctx, s = g.over.stats;
    this.input.unlock();
    const best = c.save.holdoutBest || 0;
    const rounds = s.rounds;
    const newBest = rounds > best;
    c.save.holdoutBest = Math.max(best, rounds);
    c.writeSave(c.save);
    c.hud.showGameOver({
      mode: 'holdout', round: g.over.round, rounds, kills: s.kills, headshots: s.headshots, earned: s.earned, doors: s.doors,
      accuracy: s.shots ? s.hits / s.shots : 0, best: { round: c.save.holdoutBest }, newBest,
    });
  }
}

const EMPTY = new Set();
const CONTROLS = [
  ['WASD', 'MOVE'], ['SHIFT', 'SPRINT'], ['SPACE', 'JUMP · CLIMB'], ['C', 'CROUCH'], ['LMB', 'FIRE'], ['E / RMB', 'AIM'], ['R', 'RELOAD'],
  ['1-3 · Q', 'SWITCH GUNS'], ['F', 'USE · BUY'], ['V', 'KICK · STOMP'], ['G', 'GRENADE'], ['ESC', 'PAUSE'],
];

const PERK_LINE = {
  kevlar: 'TWICE THE BEATING BEFORE YOU GO DOWN', quick: 'RELOADS IN HALF THE TIME', thirdArm: 'A THIRD GUN ON YOUR BACK', adrenaline: 'LONGER SPRINTS · FASTER HEALING',
};
const PICKUP_LINE = { ammo: 'EVERY GUN FULL · GRENADES TOO', fury: 'ONE HIT KILLS · 20 SECONDS', bounty: 'DOUBLE POINTS · 20 SECONDS', shockwave: 'EVERY ONE OF THEM DOWN' };

void GUNS;
void THREE;
