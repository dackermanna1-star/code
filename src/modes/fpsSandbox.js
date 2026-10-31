import * as THREE from 'three';
import { Vec3, clamp, lerp } from '../physics/math.js';
import { FpsPlayer } from '../fps/player.js';
import { Arsenal, SANDBOX_LOADOUT } from '../fps/arsenal.js';
import { FpsView, MELEE_MOVES } from '../render/fpsView.js';
import { FpsInput } from '../fps/input.js';
import { SurvivalHud } from '../ui/survivalHud.js';
import { WEAPONS } from '../game/weapons.js';
import { meleeParams } from '../game/melee.js';

const FIXED = 1 / 60;
// what strikes in each move
const MOVE_WEAPON = { slash: 'knife', stab: 'knife', swing: 'bat', jab: 'fists', haymaker: 'fists', stomp: 'boot', kick: 'boot' };
const _v = new THREE.Vector3();
const Y = new Vec3(0, 1, 0);
const _f = new THREE.Vector3();

/**
 * First person in the sandbox: walk the arena among the dummies with every gun, a knife, a bat
 * and your fists (kicks and stomps with anything in hand). It shares the player, guns, hands and
 * input with the survival mode; the world is the sandbox's own. Sniper hits go to the kill cam.
 */
export class FpsSandboxMode {
  constructor(host) {
    this.host = host;
    this.active = false;
    this.built = false;
    this.acc = 0;
    this.recoil = { p: 0, y: 0 };
    this.shake = 0;
    this.fov = 78;
    this.lean = 0;
    this.strike = null; // the blow under way: { M, weapon, charge, mode, s: MeleeStriker, pose }
  }

  build() {
    const h = this.host;
    this.player = new FpsPlayer({ x: 0, z: 4.5, yaw: 0 });
    this.player.maxHealth = this.player.health = 100;
    this.arsenal = new Arsenal(SANDBOX_LOADOUT, { infinite: true });
    this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.03, 200);
    this.view = new FpsView(h.OM, this.camera.aspect);
    this.view.setEnvironment(h.envMap);
    // the moves' timing comes from their animations (the hit window: when the blow can land)
    const moves = {};
    for (const [k, m] of Object.entries(MELEE_MOVES)) moves[k] = { windup: m.windup, strike: m.strike, recover: m.recover, chargeTime: m.charge, hitWindow: m.hitWindow };
    this.arsenal.setMoves(moves);
    this.view.setWeapon(this.arsenal.gun.type);
    // build every gun and melee item now rather than on the first switch to each
    setTimeout(() => this.view.preload && this.view.preload(), 0);
    this.input = new FpsInput(h.renderer.domElement);
    this.input.onLockChange = (locked) => this.onLock(locked);
    this.hud = new SurvivalHud(document.body, {
      resume: () => this.resume(),
      exit: () => this.host.exitFps(),
      setting: (k, v) => this.setting(k, v),
    }, { sandbox: true });
    window.addEventListener('resize', () => this.resize());
    this.built = true;
  }

  resize() {
    if (!this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.view.setAspect(this.camera.aspect);
  }

  enter() {
    if (!this.built) this.build();
    const h = this.host, sb = h.sandbox();
    sb.setPlayer(this.player);
    this.player.alive = true;
    this.player.health = this.player.maxHealth;
    // start a few metres in front of the dummies, looking at them
    const c = sb.people[0] ? sb.people[0].rd.pelvis.pos : new Vec3(0, 0, 0);
    if (!this.placed) {
      this.player.pos.set(c.x, 0, c.z + 4.5);
      this.player.yaw = 0;
      this.player.pitch = -0.05;
      this.placed = true;
    }
    h.ui.root.style.display = 'none';
    this.hud.show(true);
    this.hud.screen('start');
    if (this.hud.rdrBox) this.hud.rdrBox.checked = sb.settings.reactions === 'rdr';
    if (this.hud.camSel) this.hud.camSel.value = h.killCam.mode;
    this.input.enabled = true;
    this.active = true;
    this.resize();
  }

  exit() {
    this.endStrike();
    this.input.unlock();
    this.input.enabled = false;
    this.hud.show(false);
    this.host.ui.root.style.display = '';
    this.host.sandbox().setPlayer(null);
    this.active = false;
  }

  resume() {
    this.host.audio.unlock();
    this.input.lock();
  }

  onLock(locked) {
    if (!this.active) return;
    if (locked) this.hud.screen(null);
    else this.hud.screen('pause');
  }

  setting(k, v) {
    const h = this.host;
    if (k === 'sensitivity') this.input.sensitivity = 0.0022 * v;
    else if (k === 'fov') this.fov = v;
    else if (k === 'volume') h.audio.setVolume(v);
    else if (k === 'adsHold') this.input.adsHold = v;
    else if (k === 'rdr') h.sandbox().setReactions(v ? 'rdr' : 'realistic');
    else if (k === 'killcam') h.killCam.mode = v;
  }

  /** Collision for the player: the props (as boxes), the arena's edge, the dummies standing. */
  env() {
    const sb = this.host.sandbox();
    const boxes = [];
    for (const o of sb.obstacles) {
      const b = o.body;
      b.computeAABB(0, 0);
      boxes.push({ min: b.aabbMin, max: b.aabbMax });
    }
    const H = sb.world.groundHalfSize - 0.2;
    if (!this._walls) {
      this._walls = [
        { min: new Vec3(H, -1, -H - 1), max: new Vec3(H + 1, 4, H + 1) },
        { min: new Vec3(-H - 1, -1, -H - 1), max: new Vec3(-H, 4, H + 1) },
        { min: new Vec3(-H - 1, -1, H), max: new Vec3(H + 1, 4, H + 1) },
        { min: new Vec3(-H - 1, -1, -H - 1), max: new Vec3(H + 1, 4, -H) },
      ];
    }
    boxes.push(...this._walls);
    const people = [];
    for (const p of sb.people) {
      if (p.ctl.mode !== 'balance' && p.ctl.mode !== 'getup') continue;
      const q = p.rd.pelvis.pos;
      people.push({ x: q.x, z: q.z, r: 0.27, person: p });
    }
    return {
      boxes,
      floorAt: (x, z, from) => sb.world.surfaceAt(x, z, from),
      people,
      push: (person, force) => sb.pushPerson(person, force),
    };
  }

  viewDir(out) {
    const pl = this.player;
    const p = pl.pitch + this.recoil.p, y = pl.yaw + this.recoil.y, cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }

  // ------------------------------------------------------------------------------------------
  frame(now, dtReal) {
    const h = this.host;
    const inp = this.input.poll();
    let simDt = 0;
    const kc = h.killCam;
    if (kc.active) {
      // the kill cam owns time and the camera; any key or click skips it
      if (inp.pressed.size || inp.fire) kc.skip();
      const ts = kc.update(dtReal);
      this.acc += dtReal * ts;
      while (this.acc >= FIXED) {
        h.stepSim(FIXED);
        this.acc -= FIXED;
        simDt += FIXED;
      }
      h.afterSim(simDt, dtReal, kc.active ? kc.camera : this.camera);
      if (kc.active) {
        h.renderWorld(kc.camera);
        return;
      }
    } else if (this.input.locked) {
      // (a bone-breaking blow can slow everything down for a beat)
      this.acc += dtReal * kc.momentScale(dtReal);
      let n = 0, look = inp.look;
      while (this.acc >= FIXED && n < 3) {
        this.step(inp, look);
        look = { dx: 0, dy: 0 };
        if (kc.active) break;
        h.stepSim(FIXED);
        this.acc -= FIXED;
        simDt += FIXED;
        n++;
      }
      if (n === 3) this.acc = 0;
      // the mouse still looks around in slow motion
      if (n === 0) {
        this.player.yaw += look.dx;
        this.player.pitch = clamp(this.player.pitch + look.dy, -1.45, 1.45);
      }
      h.afterSim(simDt, dtReal, this.camera);
    } else h.afterSim(0, dtReal, this.camera);
    this.render(dtReal, inp);
  }

  step(inp, look) {
    const h = this.host, pl = this.player, ar = this.arsenal, sb = h.sandbox();
    for (const k of inp.pressed) {
      if (k.startsWith('Digit')) ar.select(+k.slice(5) - 1);
      else if (k === 'KeyQ') ar.swapLast();
      else if (k === 'KeyR') ar.reload();
      else if (k === 'KeyF') ar.kick(this.stompTarget() !== null);
      else if (k === 'KeyN') h.spawnInFront(pl);
      else if (k === 'Tab') {
        h.exitFps();
        return;
      }
    }
    if (inp.wheel) ar.select((ar.index + (inp.wheel > 0 ? 1 : ar.guns.length - 1)) % ar.guns.length);
    const alt = inp.pressed.has('KeyE');
    inp.pressed.clear();
    inp.wheel = 0;
    ar.ads = inp.ads && !ar.gun.melee;
    pl.ads = ar.adsAmount > 0.5;
    pl.update(FIXED, { move: inp.move, look, sprint: inp.sprint, crouch: inp.crouch, jump: inp.jump }, this.env());
    const fired = ar.update(FIXED, inp.fire, pl.sprinting || !!pl.mantling, alt);
    for (const e of ar.events) this.onArsenalEvent(e);
    if (fired) this.shoot();
    if (ar.melee && ar.melee.phase === 'strike') this.meleeStep();
    else this.endStrike();
    const k = Math.exp(-FIXED * 9);
    this.recoil.p *= k;
    this.recoil.y *= k;
    for (const e of pl.events) {
      if (e.type === 'footstep') h.audio.footstep(clamp(e.speed / 5, 0.3, 1) * (1 - 0.5 * e.crouch), null);
      else if (e.type === 'land') {
        h.audio.footstep(1, null);
        this.shake = Math.max(this.shake, Math.min(0.5, e.speed * 0.05));
      }
    }
  }

  /** Someone lying on the floor just in front (a kick becomes a stomp on them). */
  stompTarget() {
    const pl = this.player, sb = this.host.sandbox();
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    let best = null, bd = 1.3;
    for (const p of sb.people) {
      if (p.ctl.mode === 'balance') continue;
      for (const n of ['head', 'chest', 'abdomen']) {
        const q = p.rd.segments[n].body.pos;
        if (q.y > 0.45) continue;
        const dx = q.x - pl.pos.x, dz = q.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / Math.max(d, 1e-3) > 0.3) {
          bd = d;
          best = { person: p, seg: n, point: q };
        }
      }
    }
    return best;
  }

  shoot() {
    const h = this.host, pl = this.player, ar = this.arsenal, sb = h.sandbox();
    const eye = pl.eye();
    const d = this.viewDir(new Vec3());
    const type = ar.gun.type;
    // the camera pose the kill cam returns to
    const view = { pos: this.camera.position, quat: this.camera.quaternion, fov: this.camera.fov };
    if (h.killCam.tryStart(type, eye, d, view)) {
      this.view.fire(ar.gun.w.recoil, ar.adsAmount);
    } else {
      sb.fire(type, eye, d, { spreadScale: ar.spreadScale(pl), by: 'player' });
      this.view.fire(ar.gun.w.recoil, ar.adsAmount);
    }
    const rc = ar.recoil();
    pl.pitch = clamp(pl.pitch + rc.up * 0.5, -1.45, 1.45);
    pl.yaw += rc.side * 0.5;
    this.recoil.p += rc.up * 0.5;
    this.recoil.y += rc.side * 0.5;
  }

  /** Strike phase of a melee move: sweep the striking point through the world. */
  /**
   * One physics step of a blow: the striking geometry of the move where it is now goes to the
   * sandbox's melee striker, which finds what it hits and resolves the impacts physically. The swing
   * goes on at the speed it has left (a bat stops dead on a head, carries on through an arm).
   */
  meleeStep() {
    const h = this.host, ar = this.arsenal, M = ar.melee;
    const weapon = MOVE_WEAPON[M.move] || 'fists';
    if (!this.strike || this.strike.M !== M) {
      this.endStrike();
      const mode = M.move === 'stab' ? 'stab' : M.move === 'slash' ? 'slash' : null;
      const charge = mode ? 0.7 : clamp((M.power - 0.45) / 0.55, 0, 1);
      this.strike = { M, weapon, charge, mode, s: h.sandbox().meleeStriker(weapon, { charge, mode, by: 'player' }), pose: { a: new Vec3(), b: new Vec3() }, target: M.move === 'stomp' ? this.stompTarget() : null };
    }
    const S = this.strike;
    if (M.done) return;
    // only while the drawn weapon is where it can connect (the move's hit window)
    const T = this.arsenal.moves[M.move], hw = (T && T.hitWindow) || [0, 1];
    const u = clamp(M.t / (T ? T.strike : 0.2), 0, 1);
    if (u < hw[0] || u > hw[1]) return;
    S.u = (u - hw[0]) / Math.max(1e-3, hw[1] - hw[0]);
    this.strikePose(S, S.pose);
    const prm = meleeParams(weapon, S.charge);
    const r = S.s.update(S.pose, FIXED, { speed: (S.mode === 'stab' ? prm.stabSpeed : prm.speed) * S.s.speedLeft });
    if (r.hits.length) {
      M.hit = true;
      const strength = clamp(r.hits.reduce((acc, x) => acc + (x.energy || 100), 0) / 300, 0.2, 1);
      if (this.view.meleeImpact) this.view.meleeImpact(strength, r.stopped);
      this.shake = Math.max(this.shake, 0.2 + 0.55 * strength);
      M.rate = r.stopped ? 0 : Math.max(0.3, r.speedLeft);
      if (r.stopped) M.done = true;
    }
  }

  endStrike() {
    if (!this.strike) return;
    this.strike.s.end();
    this.strike = null;
  }

  /**
   * World pose of the striking geometry where the move has it now: the bat's barrel (start -> tip),
   * the blade (guard -> point), the knuckles, the boot's sole (heel -> toe). The viewmodel can supply
   * it (meleePose) to match its animation; otherwise each move follows its own path through the
   * crosshair.
   */
  strikePose(S, out) {
    const pl = this.player, M = S.M;
    const u = S.u ?? 0; // progress through the hit window
    const e = pl.eye(), E = new Vec3(e.x, e.y, e.z);
    const cy = Math.cos(pl.yaw), sy = Math.sin(pl.yaw), cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
    const f = new Vec3(-sy * cp, sp, -cy * cp), r = new Vec3(cy, 0, -sy), up = new Vec3().crossVectors(r, f);
    const fh = new Vec3(-sy, 0, -cy), side = M.side || 1;
    const arc = (th, rad) => new Vec3().copy(f).scale(Math.cos(th)).addScaled(r, Math.sin(th)).scale(rad);
    switch (M.move) {
      case 'swing': {
        // a flat arc that reaches the crosshair while the bat is still coming round (66 degrees
        // before the end of its sweep): it meets the body squarely, driving into it, instead of
        // brushing across the front and catching the hanging arm. The barrel lies along the radius.
        const R = 0.95, tc = 1.15 * side;
        const C = E.clone().addScaled(up, -0.1).addScaled(f, R * (1 - Math.cos(tc))).addScaled(r, -R * Math.sin(tc));
        const d = arc(side * lerp(1.7, -0.6, u), 1);
        const P = C.addScaled(d, R);
        out.a.copy(P).addScaled(d, -0.34);
        out.b.copy(P).addScaled(d, 0.16);
        return out;
      }
      case 'slash': {
        const d = arc(side * lerp(1.0, -0.95, u), 1);
        out.b.copy(E).addScaled(up, -0.12).addScaled(d, 0.66);
        out.a.copy(out.b).addScaled(d, -0.17);
        return out;
      }
      case 'stab':
        out.b.copy(E).addScaled(up, -0.08).addScaled(r, 0.05).addScaled(f, lerp(0.25, 0.8, u));
        out.a.copy(out.b).addScaled(f, -0.17);
        return out;
      case 'jab':
        out.a.copy(E).addScaled(up, lerp(-0.14, -0.04, u)).addScaled(r, 0.12 * side * (1 - u)).addScaled(f, lerp(0.2, 0.74, u));
        out.b.copy(out.a);
        return out;
      case 'haymaker':
        // a hook: in from the side on a curve, through the crosshair and a little past it
        out.a.copy(E).addScaled(up, -0.06).add(arc(side * lerp(1.4, -0.2, u), 0.7));
        out.b.copy(out.a);
        return out;
      case 'kick': {
        // a front kick: the sole comes up and forward, toes up
        const P = new Vec3(pl.pos.x, pl.pos.y, pl.pos.z).addScaled(fh, lerp(0.15, 0.85, u));
        P.y += lerp(0.35, 0.95, u);
        out.a.copy(P).addScaled(Y, -0.08);
        out.b.copy(P).addScaled(Y, 0.19);
        return out;
      }
      case 'stomp': {
        // straight down on whatever is lying in front, the foot along the look direction
        const t = S.target ? S.target.point : new Vec3(pl.pos.x, pl.pos.y, pl.pos.z).addScaled(fh, 0.7);
        const P = new Vec3(t.x, pl.pos.y + lerp(0.6, -0.05, u), t.z);
        if (S.target) P.y = Math.max(P.y, t.y - 0.25);
        out.a.copy(P).addScaled(fh, -0.08);
        out.b.copy(P).addScaled(fh, 0.19);
        return out;
      }
    }
    out.a.copy(E).addScaled(f, 0.6);
    out.b.copy(out.a);
    return out;
  }

  onArsenalEvent(e) {
    const h = this.host;
    switch (e.type) {
      case 'reloadStart':
        h.audio.gunHandling(e.gun.perShell ? 'shell' : 'magOut', e.gun.type);
        break;
      case 'reloadEnd':
        h.audio.gunHandling('magIn', e.gun.type);
        if (e.gun.type !== 'pistol' && e.gun.type !== 'revolver') setTimeout(() => h.audio.gunHandling('charge', e.gun.type), 180);
        break;
      case 'shell':
        h.audio.gunHandling('shell', e.gun.type);
        break;
      case 'pump':
        setTimeout(() => {
          h.audio.gunHandling('pump', 'shotgun');
          this.view.pump();
        }, (e.delay || 0) * 1000);
        break;
      case 'dry':
        h.audio.gunHandling('dry', e.gun.type);
        break;
      case 'equip':
        this.view.setWeapon(e.gun.type);
        h.audio.gunHandling('equip', e.gun.type);
        break;
      case 'meleeStrike':
        h.audio.whoosh(e.move === 'swing' ? 14 + 18 * (e.power ?? 0.5) : e.move === 'haymaker' ? 11 : 8, null);
        break;
    }
  }

  // ------------------------------------------------------------------------------------------
  render(dt, inp) {
    const h = this.host, pl = this.player, ar = this.arsenal;
    const eye = pl.eye();
    const ph = pl.stepPhase * Math.PI * 2;
    const move = Math.min(1, pl.speed / 3.3) * (pl.onGround ? 1 : 0) * (1 - 0.7 * ar.adsAmount);
    const bob = (0.03 + 0.03 * (pl.sprinting ? 1 : 0)) * move;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const t = performance.now() / 1000;
    this.camera.position.set(eye.x + Math.cos(ph) * bob * 0.35, eye.y + Math.abs(Math.sin(ph)) * bob - bob * 0.5, eye.z);
    const side = (pl.vel.x * Math.cos(pl.yaw) - pl.vel.z * Math.sin(pl.yaw)) / 3.3;
    this.lean = lerp(this.lean, -side * 0.02, Math.min(1, dt * 6));
    this.camera.rotation.set(pl.pitch + this.recoil.p + Math.sin(t * 37) * sh * 0.03, pl.yaw + this.recoil.y + Math.sin(t * 29) * sh * 0.03, this.lean + Math.sin(t * 23) * sh * 0.02, 'YXZ');
    const g = ar.gun;
    const scope = this.view.scopeAmount ? this.view.scopeAmount() : 0;
    const zoom = g.type === 'sniper' ? lerp(1.35, 4.5, scope) : g.type === 'rifle' ? 1.45 : g.type === 'smg' ? 1.3 : g.melee ? 1 : 1.2;
    const fov = lerp(this.fov, this.fov / zoom, ar.adsAmount) * (pl.sprinting ? 1.06 : 1);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.viewDir(_f);
    h.audio.setListener(eye, _f);
    const M = ar.melee;
    this.view.update(dt, {
      ads: ar.adsAmount, sprint: pl.sprinting, speed: pl.speed, step: pl.stepPhase, onGround: pl.onGround, crouch: pl.crouch,
      look: inp.look, landed: pl.landed, state: ar.state, stateT: ar.t, reloadTime: g.reload || 1, perShell: !!g.perShell,
      melee: M ? { move: M.move, phase: M.phase, t: M.t, charge: M.charge, hit: M.hit } : null,
      empty: !g.melee && g.ammo === 0, pitch: pl.pitch,
    });
    pl.landed = 0;
    this.view.setLighting(1);
    this.view.visible = scope < 0.98;
    const spreadRad = (g.w.spread || 0) * ar.spreadScale(pl);
    const px = (spreadRad / Math.tan((this.camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
    this.hud.update(dt, { player: pl, arsenal: ar, game: null, spread: clamp(4 + px, 4, 80), showHealth: false });
    this.hud.target.textContent = this.targetInfo();
    h.setScope(scope);
    h.renderWorld(this.camera);
    this.view.render(h.renderer);
  }

  /** The dummy in the sights: who, and how they are doing. */
  targetInfo() {
    const h = this.host, sb = h.sandbox();
    const eye = this.player.eye(), d = this.viewDir(new Vec3());
    const hit = sb.pick(eye, d, 60);
    if (!hit || !hit.person) return '';
    const p = hit.person, inj = p.injury;
    const state = !inj.alive ? 'DEAD' : !inj.conscious ? 'UNCONSCIOUS' : p.ctl.mode === 'balance' ? 'STANDING' : p.ctl.mode === 'getup' ? 'GETTING UP' : 'DOWN';
    const bleed = inj.bleedRate ? ` · BLEEDING ${Math.round(inj.bleedRate * 60)} mL/min` : '';
    return `DUMMY #${p.id} · ${state}${bleed}`;
  }
}
