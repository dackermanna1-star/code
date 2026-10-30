import * as THREE from 'three';
import { Vec3, clamp, lerp } from '../physics/math.js';
import { SurvivalGame } from '../game/survival.js';
import { STATION } from '../game/subway.js';
import { ZOMBIE_KINDS } from '../human/zombie.js';
import { WEAPONS } from '../game/weapons.js';
import { FloorDecals } from '../render/floorDecals.js';
import { SubwayScene } from '../render/subwayScene.js';
import { BloodParticles } from '../render/blood.js';
import { Effects } from '../render/effects.js';
import { FpsView } from '../render/fpsView.js';
import { FpsInput } from '../fps/input.js';
import { SurvivalHud } from '../ui/survivalHud.js';

const FIXED = 1 / 60;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

/**
 * The first-person survival mode, hosted by the sandbox app (main.js): it brings its own world
 * (the station, its Sandbox, decals, particles, effects) and swaps it in with host.useWorld, so the
 * host's people rendering, gore and sound handling serve both modes. Runs while the pointer is
 * locked; Escape pauses.
 */
export class SurvivalMode {
  constructor(host) {
    this.host = host;
    this.ctx = null;
    this.active = false;
    this.acc = 0;
    this.recoil = { p: 0, y: 0 };
    this.shake = 0;
    this.fov = 78;
    this.best = 0;
    try {
      this.best = +(localStorage.getItem('ragdoll-survival-best') || 0);
    } catch (e) {
      this.best = 0;
    }
  }

  build() {
    const h = this.host;
    const S = STATION;
    this.game = new SurvivalGame({ shape: h.shape });
    this.decals = new FloorDecals(h.renderer, { rect: { minX: -S.halfLen, maxX: S.halfLen, minZ: -S.wallZ, maxZ: S.wallZ }, size: 4096 });
    this.view = new SubwayScene(h.renderer, this.decals, h.envMap);
    const scene = this.view.scene;
    this.particles = new BloodParticles(scene, this.decals);
    this.particles.floorAt = (x, z, from) => this.game.sb.world.surfaceAt(x, z, from);
    this.effects = new Effects(scene, { shardFactory: typeof h.OM.createShardMesh === 'function' ? h.OM.createShardMesh : null });
    this.ctx = { sandbox: this.game.sb, scene, decals: this.decals, particles: this.particles, effects: this.effects, renders: new Map(), propMeshes: new Map(), obstacleMeshes: new Map() };
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.03, 300);
    this.fpsView = new FpsView(h.OM, this.camera.aspect);
    this.fpsView.setEnvironment(h.envMap);
    this.input = new FpsInput(h.renderer.domElement);
    this.input.onLockChange = (locked) => this.onLock(locked);
    this.hud = new SurvivalHud(document.body, {
      resume: () => this.resume(),
      restart: () => this.restart(),
      exit: () => this.host.exitSurvival(),
      setting: (k, v) => this.setting(k, v),
    });
    this.game.opts.maxAlive = 10;
    this.fpsView.setWeapon(this.game.arsenal.gun.type);
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.fpsView.setAspect(this.camera.aspect);
    this.particles.setViewportHeight(window.innerHeight * this.host.renderer.getPixelRatio(), this.camera.fov);
  }

  enter() {
    if (!this.ctx) this.build();
    this.host.useWorld(this.ctx);
    for (const p of this.game.sb.people) this.host.attachRender(p);
    this.host.ui.root.style.display = 'none';
    this.hud.show(true);
    this.hud.screen(this.started ? 'pause' : 'start');
    this.input.enabled = true;
    this.active = true;
    this.resize();
  }

  exit() {
    this.input.unlock();
    this.input.enabled = false;
    this.hud.show(false);
    this.host.ui.root.style.display = '';
    for (const t of this.game.level.trains) this.host.audio.trainStop('t' + t.id);
    this.active = false;
  }

  resume() {
    this.host.audio.unlock();
    if (this.game.state === 'over') this.restart();
    this.input.lock();
  }

  restart() {
    this.game.reset();
    for (const e of this.game.drainEvents()) this.onGameEvent(e);
    for (const e of this.game.sb.drainFx()) this.host.handleFx(e);
    this.decals.clear();
    this.particles.clear();
    this.effects.clearDebris();
    this.fpsView.setWeapon(this.game.arsenal.gun.type);
    this.recoil.p = this.recoil.y = 0;
    this.overShown = false;
    this.started = false;
    this.input.lock();
  }

  onLock(locked) {
    if (!this.active) return;
    if (locked) {
      this.hud.screen(null);
      this.started = true;
    } else if (this.game.state !== 'over') {
      this.hud.pauseWave.textContent = this.game.wave ? `WAVE ${this.game.wave} · ${this.game.score.toLocaleString()} POINTS` : '';
      this.hud.screen('pause');
    }
  }

  setting(k, v) {
    if (k === 'sensitivity') this.input.sensitivity = 0.0022 * v;
    else if (k === 'fov') this.fov = v;
    else if (k === 'maxAlive') this.game.opts.maxAlive = v;
    else if (k === 'volume') this.host.audio.setVolume(v);
    else if (k === 'adsHold') this.input.adsHold = v;
  }

  // ------------------------------------------------------------------------------------------
  frame(now, dtReal) {
    const g = this.game, pl = g.player, ar = g.arsenal;
    const inp = this.input.poll();
    const running = this.input.locked && g.state !== 'over';
    let simDt = 0;
    if (running) {
      this.acc += dtReal;
      let n = 0;
      let look = inp.look;
      while (this.acc >= FIXED && n < 3) {
        this.step(inp, look);
        look = { dx: 0, dy: 0 };
        this.acc -= FIXED;
        simDt += FIXED;
        n++;
      }
      if (n === 3) this.acc = 0;
    } else if (g.state === 'over') {
      // the world carries on a little after death (the camera slumps, the dead keep coming)
      this.acc += dtReal;
      while (this.acc >= FIXED) {
        this.acc -= FIXED;
        pl.update(FIXED, { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 } }, g.playerEnv());
        g.update(FIXED);
        for (const e of g.sb.drainFx()) this.onFx(e);
        for (const e of g.drainEvents()) this.onGameEvent(e);
        simDt += FIXED;
      }
      if (!this.overShown && g.stateT > 1.6) {
        this.overShown = true;
        this.input.unlock();
        if (g.score > this.best) {
          this.best = g.score;
          try {
            localStorage.setItem('ragdoll-survival-best', String(this.best));
          } catch (e) {
            /* private mode */
          }
        }
        this.hud.gameOver({ wave: g.wave, kills: g.kills, headshots: g.headshots, accuracy: g.shots ? Math.round((100 * g.hits) / g.shots) : 0, score: g.score.toLocaleString(), best: this.best.toLocaleString() });
      }
    }
    this.render(dtReal, simDt, inp);
  }

  /** One fixed step of play. */
  step(inp, look) {
    const g = this.game, pl = g.player, ar = g.arsenal, h = this.host;
    // weapons
    for (const k of inp.pressed) {
      if (k.startsWith('Digit')) ar.select(+k.slice(5) - 1);
      else if (k === 'KeyQ') ar.swapLast();
      else if (k === 'KeyR') ar.reload();
      else if (k === 'KeyF') this.melee();
    }
    if (inp.wheel) ar.select((ar.index + (inp.wheel > 0 ? 1 : ar.guns.length - 1)) % ar.guns.length);
    inp.pressed.clear();
    inp.wheel = 0;
    ar.ads = inp.ads;
    pl.ads = ar.adsAmount > 0.5;
    pl.update(FIXED, { move: inp.move, look, sprint: inp.sprint, crouch: inp.crouch, jump: inp.jump }, g.playerEnv());
    const fired = ar.update(FIXED, inp.fire && pl.alive, pl.sprinting || !!pl.mantling);
    for (const e of ar.events) this.onArsenalEvent(e);
    if (fired) this.shoot();
    // recoil recovers (half of each kick stays: the player pulls it back down)
    const k = Math.exp(-FIXED * 9);
    this.recoil.p *= k;
    this.recoil.y *= k;
    g.update(FIXED);
    for (const e of g.sb.drainFx()) this.onFx(e);
    for (const e of g.drainEvents()) this.onGameEvent(e);
    for (const e of pl.events) this.onPlayerEvent(e);
    // zombie footfalls close by
    for (const z of g.sb.people) {
      for (const e of z.ctl.events) {
        if (e.type === 'land') {
          const q = z.rd.pelvis.pos;
          const d = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z);
          if (d < 7) h.audio.footstep(z.zombie && z.zombie.kind === 'brute' ? 0.8 : 0.4, q);
        }
      }
    }
  }

  viewDir(out) {
    const pl = this.game.player;
    const p = pl.pitch + this.recoil.p, y = pl.yaw + this.recoil.y, cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }

  shoot() {
    const g = this.game, pl = g.player, ar = g.arsenal, h = this.host;
    const eye = pl.eye();
    const d = this.viewDir(new Vec3());
    const paths = g.fire(eye, d);
    const rc = ar.recoil();
    // half of the kick moves the aim for good, half is a punch that springs back
    pl.pitch = clamp(pl.pitch + rc.up * 0.5, -1.45, 1.45);
    pl.yaw += rc.side * 0.5;
    this.recoil.p += rc.up * 0.5;
    this.recoil.y += rc.side * 0.5;
    this.fpsView.fire(ar.gun.w.recoil, ar.adsAmount);
    // hit marker on any zombie hit
    let hit = false;
    for (const p of paths) for (const x of p.hits) if (x.person.zombie) hit = true;
    if (hit) {
      this.hud.hit(false);
      h.audio.hitTick(false);
    }
    this.lastPaths = paths;
  }

  melee() {
    const z = this.game.shove();
    this.fpsView.kickZ.v -= 2.2; // a quick jab forward of the whole rig
    if (z) this.host.audio.impact('flesh', 0.7, z.rd.segments.chest.body.pos);
    this.host.audio.whoosh(9, null);
  }

  // ------------------------------------------------------------------------------------------
  onFx(e) {
    const h = this.host;
    switch (e.type) {
      case 'shot': {
        h.audio.gunshot(e.weapon, e.origin);
        this.fpsView.muzzleCameraSpace(_v);
        this.camera.localToWorld(_v);
        this.effects.muzzleLight(_v, WEAPONS[e.weapon].recoil > 2 ? 1.4 : 1);
        for (const p of e.paths) this.effects.tracer(_v.clone(), new THREE.Vector3(p.to.x, p.to.y, p.to.z));
        break;
      }
      case 'armorHit': {
        const p = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
        this.effects.puff(p, new THREE.Vector3(-e.dir.x, -e.dir.y, -e.dir.z), undefined, 12, 4, 0.25, true);
        h.audio.bulletImpact('metal', e.point, 1);
        break;
      }
      case 'zombieGroan':
        if (e.near < 22) h.audio.zombieGroan(e.kind, e.person.rd.segments.head.body.pos, clamp(1.2 - e.near / 20, 0.3, 1));
        break;
      case 'zombieSwing':
        h.audio.zombieSnarl(e.kind, e.person.rd.segments.head.body.pos);
        break;
      case 'playerHit':
        break;
      case 'personFrozen':
        break;
      default:
        h.handleFx(e);
    }
  }

  onArsenalEvent(e) {
    const h = this.host;
    switch (e.type) {
      case 'reloadStart':
        h.audio.gunHandling(e.gun.perShell ? 'shell' : 'magOut', e.gun.type);
        break;
      case 'reloadEnd':
        h.audio.gunHandling('magIn', e.gun.type);
        if (e.gun.type !== 'pistol') setTimeout(() => h.audio.gunHandling('charge', e.gun.type), 180);
        break;
      case 'shell':
        h.audio.gunHandling('shell', e.gun.type);
        break;
      case 'pump':
        setTimeout(() => {
          h.audio.gunHandling('pump', 'shotgun');
          this.fpsView.pump();
        }, (e.delay || 0) * 1000);
        break;
      case 'dry':
        h.audio.gunHandling('dry', e.gun.type);
        break;
      case 'equip':
        this.fpsView.setWeapon(e.gun.type);
        h.audio.gunHandling('equip', e.gun.type);
        break;
    }
  }

  onPlayerEvent(e) {
    const h = this.host;
    if (e.type === 'footstep') h.audio.footstep(clamp(e.speed / 5, 0.3, 1) * (1 - 0.5 * e.crouch), null);
    else if (e.type === 'land') {
      h.audio.footstep(1, null);
      this.shake = Math.max(this.shake, Math.min(0.5, e.speed * 0.05));
    } else if (e.type === 'hurt') {
      this.hud.hurt();
      h.audio.playerHurt(clamp(e.amount / 30, 0.2, 1));
      this.shake = Math.max(this.shake, clamp(e.amount / 25, 0.2, 1));
    } else if (e.type === 'died') this.hud.message('YOU DIED', '', false, 3);
  }

  onGameEvent(e) {
    const h = this.host, hud = this.hud;
    switch (e.type) {
      case 'waveStart':
        hud.message(`WAVE ${e.wave}`, e.boss ? 'SOMETHING BIG IS ON THE NEXT TRAIN' : `${e.count} INBOUND`, e.boss);
        h.audio.sting(e.boss ? 'boss' : 'wave');
        break;
      case 'waveCleared':
        hud.message('WAVE CLEARED', `+${e.bonus} · AMMO RESTOCKED`);
        h.audio.sting('clear');
        break;
      case 'trainIncoming':
        if (e.brute) hud.message('BRUTE INCOMING', e.side > 0 ? 'NORTH PLATFORM' : 'SOUTH PLATFORM', true, 2.2);
        break;
      case 'doorsOpening':
        h.audio.doorChime(false, { x: e.train.x, y: 1.5, z: e.train.z });
        break;
      case 'doorsClosing':
        h.audio.doorChime(true, { x: e.train.x, y: 1.5, z: e.train.z });
        break;
      case 'trainRemoved':
        h.audio.trainStop('t' + e.train.id);
        break;
      case 'trainHit':
        h.audio.bodyFall(1, e.person.rd.pelvis.pos);
        h.audio.impact('metal', 1, e.person.rd.pelvis.pos);
        break;
      case 'kill': {
        if (!e.byPlayer && !e.train) break;
        const label = ZOMBIE_KINDS[e.kind].label;
        hud.killFeed(`+${e.points}  ${label}${e.train ? ' · HIT BY A TRAIN' : e.head ? ' · HEADSHOT' : ''}`, e.head);
        if (e.byPlayer) {
          hud.hit(true, e.head);
          h.audio.hitTick(true, e.head);
        }
        if (e.kind === 'brute') hud.message('BRUTE DOWN', `+${e.points}`, true, 2.4);
        break;
      }
      case 'corpseRemoved':
        h.detachRender(e.person);
        break;
      case 'gameOver':
        this.overShown = false;
        break;
      case 'reset':
        for (const [p] of this.ctx.renders) if (!this.game.sb.people.includes(p)) h.detachRender(p);
        break;
    }
  }

  // ------------------------------------------------------------------------------------------
  render(dt, simDt, inp) {
    const h = this.host, g = this.game, pl = g.player, ar = g.arsenal;
    // camera: eye, view kick, head bob, shake, a lean into strafes; zoom when aimed
    const eye = pl.eye();
    const ph = pl.stepPhase * Math.PI * 2;
    const move = Math.min(1, pl.speed / 3.3) * (pl.onGround ? 1 : 0) * (1 - 0.7 * ar.adsAmount);
    const bob = (0.03 + 0.03 * (pl.sprinting ? 1 : 0)) * move;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const t = performance.now() / 1000;
    this.camera.position.set(eye.x + Math.cos(ph) * bob * 0.35, eye.y + Math.abs(Math.sin(ph)) * bob - bob * 0.5, eye.z);
    const side = (pl.vel.x * Math.cos(pl.yaw) - pl.vel.z * Math.sin(pl.yaw)) / 3.3;
    this.lean = lerp(this.lean || 0, -side * 0.02, Math.min(1, dt * 6));
    this.camera.rotation.set(
      pl.pitch + this.recoil.p + Math.sin(t * 37) * sh * 0.03,
      pl.yaw + this.recoil.y + Math.sin(t * 29) * sh * 0.03,
      this.lean + Math.sin(t * 23) * sh * 0.02 + (pl.alive ? 0 : 0.4),
      'YXZ',
    );
    const zoom = ar.gun.type === 'rifle' ? 1.45 : ar.gun.type === 'smg' ? 1.3 : 1.2;
    const fov = lerp(this.fov, this.fov / zoom, ar.adsAmount) * (pl.sprinting ? 1.06 : 1);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    // world
    this.viewDir(_f);
    this.view.update(dt, { x: pl.pos.x, z: pl.pos.z, fx: _f.x, fz: _f.z }, g.level.trains);
    for (const tr of g.level.trains) {
      if (tr.state === 'gone') continue;
      const fx = clamp(pl.pos.x, tr.x - tr.len / 2, tr.x + tr.len / 2);
      h.audio.train('t' + tr.id, { x: fx, y: 0.5, z: tr.z }, tr.v, tr.state === 'arriving');
    }
    h.updateRenders(simDt, dt, this.input.locked ? clamp(this.acc / FIXED, 0, 1) : 1);
    this.particles.update(simDt);
    this.effects.update(simDt);
    this.decals.flush();
    // hands and gun
    const st = ar.state;
    this.fpsView.update(dt, {
      ads: ar.adsAmount, sprint: pl.sprinting, speed: pl.speed, step: pl.stepPhase, onGround: pl.onGround, crouch: pl.crouch,
      look: inp.look, landed: pl.landed, state: st, stateT: ar.t, reloadTime: ar.gun.perShell ? ar.gun.reload : ar.gun.reload, perShell: !!ar.gun.perShell,
    });
    pl.landed = 0;
    this.fpsView.setLighting(0.75);
    this.fpsView.visible = pl.alive;
    // HUD: the crosshair gap follows the actual spread on screen
    const spreadRad = ar.gun.w.spread * ar.spreadScale(pl);
    const px = (spreadRad / Math.tan((this.camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
    this.hud.update(dt, { player: pl, arsenal: ar, game: g, spread: clamp(4 + px, 4, 80) });
    h.audio.setListener(eye, _f);
    const r = h.renderer;
    r.clear();
    r.render(this.view.scene, this.camera);
    this.fpsView.render(r);
  }
}
