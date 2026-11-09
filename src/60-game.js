// The game: owns renderer, camera, player, arsenal, the current level and its physics world,
// routes engine effects to visuals and audio, and runs the fixed-step simulation.

const SIM_DT = 1 / 60;

// extra materials for the engine's ballistic penetration model
Object.assign(Lab.penetration, {
  drywall: { cost: 1.1, solid: 0.32 },
  cardboard: { cost: 1.3, solid: 0.12 },
  ceiling: { cost: 30, solid: 1 },
  concrete: { cost: 9, solid: 1 },
  // loaded pallet racking and wrapped loads: a metre of stock stops pistol and SMG rounds, rifle
  // rounds come through spent, marksman rounds still carry
  goods: { cost: 2.4, solid: 0.3 },
});
const IMPACT_SOUND = { drywall: 'wood', cardboard: 'wood', wood: 'wood', goods: 'wood', metal: 'metal', concrete: 'ground', ceiling: 'ground', default: 'ground' };
const IMPACT_DUST = { drywall: 0xd8cfae, cardboard: 0x9a7b52, wood: 0x8a6b45, goods: 0x9a7b52, concrete: 0xa8a8a0, ceiling: 0xc9c4b0, metal: null };

class BackroomsGame {
  constructor(app) {
    this.app = app;
    const r = (this.renderer = Lab.createRenderer(app));
    r.autoClear = false;
    r.shadowMap.type = 2; // PCF soft
    r.toneMappingExposure = 1.0;
    this.settings = BackroomsGame.loadSettings();
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.quality === 'low' ? 1 : this.settings.quality === 'medium' ? 1.25 : 2));
    this.audio = new Lab.Audio({ volume: this.settings.volume });
    this.input = new Lab.Input(r.domElement, { sensitivity: 0.0022 * this.settings.sensitivity });
    this.input.onLockChange = (l) => this.onLock(l);
    this.camera = new T3.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.03, 140);
    this.camera.rotation.order = 'YXZ';
    this.vm = new Viewmodel(r);
    this.vm.setAspect(this.camera.aspect);
    this.arsenal = new Arsenal();
    this.recoil = { p: 0, y: 0, kp: new Spring(140, 16), ky: new Spring(140, 16), roll: new Spring(120, 12) };
    this.shake = 0;
    this.sway = { p: 0, y: 0 };
    this.acc = 0;
    this.time = 0;
    this.state = 'menu';
    this.renders = new Map();
    this.hooks = []; // systems added by other modules: { onLevel, step, frame, fx }
    this.perks = { damage: 1, reload: 1, speed: 1, ammoFind: 1, regen: 0, waves: {}, next: {} };
    this.armor = 0;
    this.maxArmor = 100;
    window.addEventListener('resize', () => this.resize());
  }

  static loadSettings() {
    const d = { sensitivity: 1, fov: 80, vmFov: 68, minimap: true, physicsEnemies: false, volume: 0.75, music: 0.6, quality: 'high', bodycam: 1, gore: true, adsHold: false, invertY: false, showFps: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem('backrooms-settings') || '{}') }; } catch { return d; }
  }
  saveSettings() { try { localStorage.setItem('backrooms-settings', JSON.stringify(this.settings)); } catch {} }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
    if (this.particles) this.particles.setViewportHeight(h * this.renderer.getPixelRatio(), this.camera.fov);
    for (const h2 of this.hooks) h2.resize && h2.resize(w, h);
  }

  // ---- levels ------------------------------------------------------------------------------
  buildLevel(depth, seed) {
    if (this.view) {
      for (const p of [...this.renders.keys()]) this.detachRender(p);
      this.view.dispose();
    }
    const level = (this.level = new BackroomsLevel(depth, seed));
    const view = (this.view = new LevelView(level, this.renderer, { quality: this.settings.quality }));
    const sb = (this.sb = new Lab.Sandbox({ shape: anatomy(), groundHalfSize: level.half + 1 }));
    sb.world.setGroundRect(-level.half, -level.half, level.half, level.half);
    sb.world.groundMaterial = 'carpet';
    sb.settings.reactions = 'rdr';
    sb.settings.painReactions = true;
    level.bodies = level.boxes.map((b, i) => {
      const body = Lab.staticBox(b, 'level:' + b.kind + i);
      sb.world.addBody(body);
      return body;
    });
    this.particles = new Lab.Particles(view.scene, view.decals);
    this.particles.floorAt = (x, z, y) => sb.world.surfaceAt(x, z, y);
    this.particles.setViewportHeight(innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    this.effects = new Lab.Effects(view.scene, { shardFactory: (k) => Lab.shardMesh(k) });
    this.laserDot = null; // rebuilt in the new scene on demand
    const mid = level.cellCenter(((level.n / 2) | 0) * level.n + ((level.n / 2) | 0));
    if (!this.player) this.player = new Lab.Player({ x: mid.x, z: mid.z, yaw: 0 });
    const p = this.player;
    p.pos.set(mid.x, 0, mid.z);
    p.vel.setZero();
    p.mantling = null;
    if (!p.ceilingAware) {
      // the ceiling slab is not in the spatial buckets, so cap jumps and mantles at it here
      const base = Object.getPrototypeOf(p).headroom;
      p.headroom = function (env) { return Math.min(base.call(this, env), env.ceiling ?? Infinity); };
      p.ceilingAware = true;
    }
    sb.setPlayer(p);
    this.envBoxes = [];
    for (const h of this.hooks) h.onLevel && h.onLevel(level);
  }

  playerEnv() {
    const p = this.player;
    const people = [];
    for (const t of this.sb.people) {
      if (t.ctl.mode !== 'balance' && t.ctl.mode !== 'getup') continue;
      const e = t.rd.pelvis.pos;
      if (Math.abs(e.x - p.pos.x) > 3 || Math.abs(e.z - p.pos.z) > 3) continue;
      people.push({ x: e.x, z: e.z, r: 0.27, person: t });
    }
    return {
      boxes: this.level.boxesNear(p.pos.x, p.pos.z, 2.2, this.envBoxes),
      ceiling: this.level.ceiling,
      floorAt: (x, z, y) => this.sb.world.surfaceAt(x, z, y),
      people,
      push: (t, f) => { if (!t.dormant) this.sb.pushPerson(t, f); },
    };
  }

  // ---- rendering of ragdoll people ---------------------------------------------------------
  attachRender(person, render) { this.renders.set(person, render); }
  detachRender(person) {
    const r = this.renders.get(person);
    if (r) { r.dispose(); this.renders.delete(person); }
  }

  // ---- input / modes -------------------------------------------------------------------------
  onLock(locked) {
    for (const h of this.hooks) h.onLock && h.onLock(locked);
  }

  viewDir(out, extra = true) {
    const p = this.player;
    let pitch = p.pitch + this.recoil.kp.x + this.sway.p, yaw = p.yaw + this.recoil.ky.x + this.sway.y;
    if (extra) { pitch += this.vm.aimY * 0.6; yaw += this.vm.aimX * 0.6; }
    const c = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
  }

  // ---- simulation ----------------------------------------------------------------------------
  // `inp.pressed` and `inp.wheel` hold everything since the previous step (see frame())
  step(inp, look) {
    const dt = SIM_DT, p = this.player, a = this.arsenal;
    this.time += dt;
    if (p.alive) {
      for (const code of inp.pressed) {
        if (code.startsWith('Digit')) { const i = +code.slice(5) - 1; if (i >= 0 && i < 3) a.select(i); }
        else if (code === 'KeyQ') a.select(a.prevIndex);
        else if (code === 'KeyR') a.reload();
        else if (code === 'KeyV') { if (a.state === 'idle') { const d = this.vm.playAction('inspect'); if (d > 0) a.inspect(d); } }
        else if (code === 'KeyG') this.throwGrenade();
        else if (code === 'KeyF') this.melee();
      }
      if (inp.wheel) a.cycle(inp.wheel > 0 ? 1 : -1);
    }
    // events raised by the key handlers (manual reload, holster, cancels) before update() runs
    this.drainArsenal();
    a.ads = inp.ads && p.alive;
    p.ads = a.adsAmount > 0.5;
    const stamina0 = p.stamina;
    p.update(dt, { move: inp.move, look, sprint: inp.sprint && !inp.fire, crouch: inp.crouch, jump: inp.jump }, this.playerEnv());
    // never let the head pass through the ceiling (mantling onto tall props in low rooms)
    const room = this.level.ceiling - 0.06 - p.pos.y, H = Lab.PLAYER.height, CH = Lab.PLAYER.crouchHeight;
    if (room < H) p.crouch = Math.max(p.crouch, clamp((H - room) / (H - CH), 0, 1));
    // holding breath behind a magnified optic (Shift) steadies the scope at a stamina cost
    const scoped = a.gun.zoom > 2 && a.adsAmount > 0.9 && p.alive;
    if (!inp.sprint || !scoped) this.breathSpent = false;
    this.holdingBreath = scoped && inp.sprint && !this.breathSpent && stamina0 > 0.02;
    if (this.holdingBreath) {
      p.stamina = Math.max(0, stamina0 - dt * 0.22);
      if (p.stamina <= 0.02) this.breathSpent = true;
    }
    // also hold fire until the gun in hand has its viewmodel (rigs load on first use)
    const blocked = p.sprinting || !!p.mantling || !p.alive || this.shopOpen || this.vm.weapon !== a.gun;
    const fired = a.update(dt, inp.fire && p.alive && !this.shopOpen, blocked);
    this.drainArsenal();
    if (fired) this.shoot();
    for (const h of this.hooks) h.step && h.step(dt);
    this.sb.viewer = new I(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
    this.sb.step(dt);
    for (const e of this.sb.drainFx()) this.onFx(e);
    for (const e of p.events) this.onPlayerEvent(e);
  }

  shoot() {
    const p = this.player, a = this.arsenal, g = a.gun;
    const eye = p.eye(new I());
    const dir = this.viewDir(new T3.Vector3());
    this.sb._shooter = 'player';
    const paths = this.sb.fire(g.ballisticKey, eye, new I(dir.x, dir.y, dir.z), { spreadScale: a.spreadScale(p), by: 'player' });
    this.sb._shooter = null;
    const r = a.recoil();
    const rk = (this.perks.waves && this.perks.waves.recoil) || 1;
    r.up *= rk; r.side *= rk;
    // part of the kick climbs the view (pull against it), part springs back
    p.pitch = clamp(p.pitch + r.up * 0.55, -1.45, 1.45);
    p.yaw += r.side * 0.55;
    this.recoil.kp.kick(r.up * 9);
    this.recoil.ky.kick(r.side * 9);
    this.recoil.roll.kick((Math.random() - 0.5) * r.up * 6);
    this.vm.fire({ ...g.def.vm, auto: g.def.auto });
    this.shake = Math.max(this.shake, Math.min(0.35, g.def.vm.back * 4));
    let hit = false;
    for (const path of paths) for (const h of path.hits) if (h.person.enemy || h.person.zombie) hit = true;
    for (const h of this.hooks) h.onShot && h.onShot(paths, g, hit);
    this.lastShotT = this.time;
  }

  drainArsenal() {
    const a = this.arsenal;
    if (!a.events.length) return;
    const evs = a.events.splice(0);
    for (const e of evs) this.onArsenalEvent(e);
  }

  // the reload clip sets the reload's duration (scaled by upgrades and perks)
  onReloadStart() {
    const a = this.arsenal, g = a.gun;
    const speed = g.reloadSpeed * (this.perks ? this.perks.reload : 1);
    const dur = this.vm.weapon === g ? this.vm.playAction('reload', { empty: g.ammo === 0, speed }) : 0;
    a.setReloadDuration(dur > 0 ? dur : 2.2 / speed);
  }

  onArsenalEvent(e) {
    const au = this.audio, g = e.gun;
    const type = g ? (g.def.ballistic === 'shotgun' ? 'shotgun' : g.def.cls === 'Pistol' ? 'pistol' : g.def.cls === 'SMG' ? 'smg' : 'rifle') : 'rifle';
    switch (e.type) {
      case 'reloadStart':
        au.gunHandling(g.def.perShell ? 'shell' : 'magOut', type);
        this.onReloadStart();
        break;
      case 'reloadLoop': this.onReloadStart(); break; // tube still not full: run the shell clip again
      case 'reloadEnd':
        au.gunHandling('magIn', type);
        if (type !== 'pistol') setTimeout(() => au.gunHandling('charge', type), 200);
        if (g.def.perShell) this.vm.cancelAction();
        break;
      case 'reloadCancel':
      case 'inspectCancel':
        this.vm.cancelAction();
        break;
      case 'shell': au.gunHandling('shell', type); break;
      case 'pump': setTimeout(() => { au.gunHandling('pump', 'shotgun'); this.vm.pump(); }, (e.delay || 0) * 1000); break;
      case 'bolt': setTimeout(() => { au.gunHandling('charge', 'rifle'); this.vm.pump(); this.vm.eject(); }, (e.delay || 0) * 1000); break;
      case 'dry': au.gunHandling('dry', type); break;
      case 'holster': this.vm.lower.x = Math.max(this.vm.lower.x, 0); this.holstering = true; break;
      case 'equip':
        this.holstering = false;
        this.vm.equip(g);
        au.gunHandling('equip', type);
        break;
    }
  }

  onPlayerEvent(e) {
    const au = this.audio;
    if (e.type === 'footstep') au.footstep(clamp(e.speed / 5, 0.3, 1) * (1 - 0.5 * e.crouch), null);
    else if (e.type === 'land') { au.footstep(1, null); this.shake = Math.max(this.shake, Math.min(0.5, e.speed * 0.05)); }
    else if (e.type === 'hurt') {
      au.playerHurt(clamp(e.amount / 30, 0.2, 1));
      this.shake = Math.max(this.shake, clamp(e.amount / 25, 0.2, 1));
      for (const h of this.hooks) h.onHurt && h.onHurt(e);
    } else if (e.type === 'died') for (const h of this.hooks) h.onDied && h.onDied(e);
  }

  // ---- engine effects -> visuals & sound ----------------------------------------------------
  onFx(e) {
    for (const h of this.hooks) if (h.fx && h.fx(e)) return;
    const au = this.audio, gore = this.settings.gore;
    switch (e.type) {
      case 'shot': {
        if (e.by === 'player') {
          const g = this.arsenal.gun;
          if (g.suppressed && this.sfx && this.sfx.ready) this.sfx.suppressedShot(g.def.ballistic);
          else au.gunshot(g.def.ballistic === 'marksman' || g.def.ballistic === 'whisper' ? 'sniper' : g.def.ballistic, g.suppressed ? null : e.origin);
          const m = this.vm.muzzleWorld(new T3.Vector3());
          // viewmodel camera space -> world camera space at the same screen position (the two
          // cameras share a pose but not a field of view), then to world
          const k = Math.tan((this.camera.fov * Math.PI) / 360) / Math.tan((this.vm.camera.fov * Math.PI) / 360);
          m.x *= k; m.y *= k;
          m.applyMatrix4(this.camera.matrixWorld);
          if (!g.suppressed) this.effects.muzzleLight(m, Lab.Ballistics[g.def.ballistic].recoil > 2 ? 1.4 : 1);
          for (const path of e.paths) if (Math.random() < (g.def.auto ? 0.5 : 1)) this.effects.tracer(m.clone(), new T3.Vector3(path.to.x, path.to.y, path.to.z));
        }
        break;
      }
      case 'fleshHit': this.fleshHit(e); break;
      case 'armorHit': {
        const pt = toV3(e.point);
        this.effects.puff(pt, new T3.Vector3(-e.dir.x, -e.dir.y, -e.dir.z), undefined, 12, 4, 0.25, true);
        au.bulletImpact('metal', e.point, 1);
        break;
      }
      case 'objectHit': {
        const pt = toV3(e.point), nrm = toV3(e.normal);
        const mat = e.material;
        const dust = IMPACT_DUST[mat];
        if (dust === null) this.effects.puff(pt, nrm, undefined, 10, 3, 0.25, true);
        else this.effects.puff(pt, nrm, dust ?? 0xbbbbbb, 12, 1.2, 0.6);
        if (mat !== 'ceiling' || Math.random() < 0.5) this.view.wallDecals.add('hole', pt, nrm, mat === 'metal' ? 0.035 : 0.05 + Math.random() * 0.02);
        au.bulletImpact(IMPACT_SOUND[mat] || 'ground', e.point, 0.8);
        break;
      }
      case 'groundHit': {
        this.view.decals.splat(e.point.x, e.point.z, 0.012 + Math.random() * 0.006, 1, 0.95, 1, Math.random() * 6.28, Math.random());
        const pt = new T3.Vector3(e.point.x, 0.005, e.point.z);
        this.effects.puff(pt, new T3.Vector3(-e.dir.x * 0.3, 1, -e.dir.z * 0.3).normalize(), 0x7a6a4a, 14, 1.2, 0.6);
        au.bulletImpact('ground', e.point, 0.8);
        break;
      }
      case 'impact': this.impactSound(e); break;
      case 'injury': this.injuryEvent(e.person, e.event); break;
      case 'playerHit': break;
    }
  }

  fleshHit(n) {
    const au = this.audio;
    au.bulletImpact(n.bone ? 'bone' : 'flesh', n.entry, clamp(n.energy / 600, 0.3, 1));
    for (const h of this.hooks) h.onFleshHit && h.onFleshHit(n);
    if (!this.settings.gore) return;
    const P = this.particles;
    const A = new T3.Vector3(n.dir.x, n.dir.y, n.dir.z);
    const t = toV3(n.entry), e = n.energy;
    P.spray(t, A.clone().negate(), 6 + Math.round(e / 120), 1.2 + e / 600, 0.7, 5e-4, 0.0018, 0, 0.02);
    if (n.highVelocity) P.addMist(t, A.clone().negate(), 5, 0.6, 10490386, 0.025, 0.25);
    if (n.exit) {
      const s = toV3(n.exit), k = clamp(e / 900, 0, 1.5);
      P.spray(s, A, 16 + Math.round(k * 60), 3 + 5 * k, 0.38, 7e-4, 0.0032, 0, 0.08);
      if (k > 0.25) P.spray(s, A, Math.round(k * 10), 2.5 + 3 * k, 0.45, 0.002, 0.006, 1, 0.2);
      if (n.bone) P.spray(s, A, 3 + Math.round(k * 6), 3 + 4 * k, 0.4, 0.0015, 0.004, 2, 0.05);
      P.addMist(s, A, Math.round(6 + 24 * k), 1.5 + 3 * k, 10490900, 0.03 + 0.035 * k, 0.3 + 0.3 * k);
      if (n.head && k > 0.6) { P.spray(s, A, 14, 5, 0.5, 0.003, 0.008, 1, 0.3); P.addMist(s, A, 30, 4, 11546672, 0.06, 0.6); }
      // back-spatter on the wall behind the target
      this.wallSplatter(s, A, k + (n.head ? 0.6 : 0));
    }
  }

  wallSplatter(from, dir, strength) {
    const L = this.level;
    const to = from.clone().addScaledVector(dir, 2.2);
    const hits = this.sb.world.raycastAll(toP3(from), new I(dir.x, dir.y, dir.z).normalize(), 2.2, (b) => b.userData && b.userData.level);
    const h = hits[0];
    if (!h) return;
    const pt = toV3(h.point), nrm = toV3(h.normal);
    const d = pt.distanceTo(from);
    const size = clamp(0.25 + strength * 0.35 - d * 0.08, 0.12, 0.8);
    this.view.wallDecals.add(Math.abs(nrm.y) > 0.7 ? 'blood' : Math.random() < 0.5 ? 'drip' : 'blood', pt, nrm, size);
    if (strength > 0.8) this.view.wallDecals.add('blood', pt.clone().add(new T3.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)), nrm, size * 0.6);
    void to; void L;
  }

  impactSound(n) {
    const A = clamp((n.speed - 0.7) / 7, 0, 1) * clamp(0.3 + n.impulse / 6, 0, 1);
    if (A < 0.02) return;
    const au = this.audio;
    const mat = (m) => (m === 'flesh' || m === 'shoe' ? 'flesh' : m === 'drywall' || m === 'cardboard' || m === 'goods' ? 'wood' : m === 'carpet' || m === 'concrete' ? 'ground' : m);
    if (n.ragdollA || n.ragdollB) {
      const body = n.ragdollA ? n.bodyA : n.bodyB;
      const seg = body.userData.segment ? body.userData.segment.name : '';
      if (n.ground && /chest|abdomen|pelvis|head/.test(seg) && n.speed > 1.3) au.bodyFall(clamp(n.speed / 4, 0.2, 1), n.point);
      else if (n.ground) au.impact('flesh', A * 0.7, n.point);
      else {
        const other = n.ragdollA ? n.matB : n.matA;
        if (other !== 'flesh' && other !== 'shoe') au.impact(mat(other), A, n.point);
        au.impact('flesh', A * 0.8, n.point);
      }
    } else au.impact(mat(n.matA), A, n.point);
  }

  injuryEvent(person, ev) {
    const au = this.audio, head = person.rd.segments.head.body.pos;
    const r = this.renders.get(person);
    switch (ev.type) {
      case 'wound': if (r && r.addWound) r.addWound(ev.wound); break;
      case 'bonebreak': au.boneCrack(1, ev.info.fragment.pos); break;
      case 'fracture': if (!ev.physical) au.boneCrack(0.7, ev.pointW || head); break;
      case 'grunt': au.grunt(ev.intensity, head); break;
      case 'gasp': au.grunt(0.15, head); break;
      case 'cough':
        au.grunt(0.25, head);
        if (ev.blood && this.settings.gore) {
          const b = person.rd.segments.head.body;
          const i = b.localToWorld(new I(0, -0.05, 0.09), new I()), o = b.localDirToWorld(new I(0, -0.2, 1), new I()).normalize();
          this.particles.spray(toV3(i), toV3(o), 10, 1.4, 0.5, 6e-4, 0.0018, 0, 0.03);
        }
        break;
      case 'armor': if (r && r.onArmor) r.onArmor(ev); break;
    }
    for (const h of this.hooks) h.onInjury && h.onInjury(person, ev);
  }

  melee() { for (const h of this.hooks) if (h.melee && h.melee()) return; }
  throwGrenade() { for (const h of this.hooks) if (h.throwGrenade && h.throwGrenade()) return; }

  // ---- frame ---------------------------------------------------------------------------------
  frame(now, dt) {
    const inp = this.input.poll();
    if (this.debugRun) { inp.fire = this.input.fire; inp.ads = this.input.ads; }
    const running = this.state === 'play' && (this.input.locked || this.debugRun);
    const p = this.player;
    // key presses and wheel are polled per render frame but consumed per simulation step: keep
    // them until a step actually runs (at high refresh rates most frames run none)
    const pend = this.pend || (this.pend = { pressed: new Set(), wheel: 0 });
    if (running) {
      for (const k of inp.pressed) pend.pressed.add(k);
      pend.wheel += inp.wheel;
      // mouse look goes straight to the view every frame so aim is smooth at any refresh rate
      if (p && p.alive) {
        p.yaw += inp.look.dx;
        p.pitch = clamp(p.pitch + inp.look.dy, -1.45, 1.45);
      }
    } else { pend.pressed.clear(); pend.wheel = 0; }
    let simDt = 0;
    if (running || this.state === 'dead') {
      this.acc += dt;
      let n = 0;
      const still = { dx: 0, dy: 0 };
      const si = { ...inp, pressed: pend.pressed, wheel: pend.wheel };
      if (!running) { si.move = { x: 0, z: 0 }; si.fire = false; si.jump = false; si.sprint = false; }
      const maxSteps = this.maxSteps || 3;
      while (this.acc >= SIM_DT && n < maxSteps) {
        this.step(si, still);
        if (n === 0) { pend.pressed = new Set(); pend.wheel = 0; si.pressed = new Set(); si.wheel = 0; }
        this.acc -= SIM_DT; simDt += SIM_DT; n++;
      }
      if (n === maxSteps) this.acc = 0;
    }
    for (const h of this.hooks) h.frame && h.frame(dt, simDt, inp);
    this.render(dt, simDt, inp);
  }

  render(dt, simDt, inp) {
    const p = this.player, a = this.arsenal, cam = this.camera;
    const eye = p.eye(new I());
    this.recoil.kp.step(dt); this.recoil.ky.step(dt); this.recoil.roll.step(dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake, T = performance.now() / 1000;
    const phase = p.stepPhase * Math.PI * 2;
    const bob = Math.min(1, p.speed / 3.3) * (p.onGround ? 1 : 0) * (1 - 0.7 * a.adsAmount) * (0.03 + (p.sprinting ? 0.03 : 0)) * (this.settings.bodycam ? 1.25 : 1);
    cam.position.set(eye.x + Math.cos(phase) * bob * 0.35, eye.y + Math.abs(Math.sin(phase)) * bob - bob * 0.5, eye.z);
    const lateral = (p.vel.x * Math.cos(p.yaw) - p.vel.z * Math.sin(p.yaw)) / 3.3;
    this.lean = damp(this.lean || 0, -lateral * 0.02, 6, dt);
    // scoped sway: a slow figure-eight that holding breath (Shift) calms, at a stamina cost
    const scoped = a.gun.zoom > 2 ? a.adsAmount : 0;
    if (scoped < 0.9) this.holdingBreath = false; // set per step in step()
    const swayAmp = scoped * (this.holdingBreath ? 0.0006 : 0.0045 + 0.004 * clamp(1 - p.stamina, 0, 1)) * (p.crouch > 0.5 ? 0.6 : 1);
    this.swayT = (this.swayT || 0) + dt;
    this.sway.y = damp(this.sway.y, Math.sin(this.swayT * 0.9) * swayAmp, 6, dt);
    this.sway.p = damp(this.sway.p, Math.sin(this.swayT * 1.8) * swayAmp * 0.6, 6, dt);
    cam.rotation.set(
      p.pitch + this.recoil.kp.x + this.sway.p + Math.sin(T * 37) * sh * 0.03,
      p.yaw + this.recoil.ky.x + this.sway.y + Math.sin(T * 29) * sh * 0.03,
      this.lean + this.recoil.roll.x + Math.sin(T * 23) * sh * 0.02 + (p.alive ? 0 : 0.5),
    );
    const zoom = a.gun.zoom;
    const fov = lerp(this.settings.fov, this.settings.fov / zoom, a.adsAmount) * (p.sprinting ? 1.05 : 1);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    const fwd = this.viewDir(new T3.Vector3(), false);
    this.view.update(dt, cam);
    this.updateLaser(eye, cam);
    for (const [person, r] of this.renders) r.update(simDt, dt, clamp(this.acc / SIM_DT, 0, 1), person);
    this.particles.update(simDt);
    this.effects.update(simDt || dt * 0.2);
    // viewmodel
    const light = this.view.lightAt(cam.position.x, cam.position.y - 0.3, cam.position.z);
    const near = this.level.segmentClear(p.pos.x, p.pos.z, p.pos.x + fwd.x * 0.75, p.pos.z + fwd.z * 0.75, eye.y - 0.25, 0, eye.y - 0.25) ? 0 : 1;
    this.vm.update(dt, {
      ads: a.adsAmount, sprint: p.sprinting, speed: p.speed, onGround: p.onGround, crouch: p.crouch,
      look: inp.look, landed: p.landed, light: clamp(light * 0.9 + 0.05, 0, 1.5), lowered: this.holstering || a.state === 'holster' || a.state === 'throw',
      wallNear: near && a.adsAmount < 0.5 ? 1 : 0, strafe: lateral,
    });
    p.landed = 0;
    // weapon FOV: wider = smaller gun on screen (the settings slider); a raised scope narrows it
    this.vm.camera.fov = lerp(this.settings.vmFov || 68, 52 / Math.min(zoom, 1.4), a.adsAmount);
    this.vm.camera.updateProjectionMatrix();
    this.audio.setListener(cam.position, fwd);
    for (const h of this.hooks) h.beforeRender && h.beforeRender(dt);
    const post = this.post;
    if (post && post.enabled) post.begin(this.renderer);
    this.renderer.clear();
    this.renderer.render(this.view.scene, cam);
    if (this.vm.visible && !(a.gun.zoom > 2 && a.adsAmount > 0.92)) this.vm.render(this.renderer);
    if (post && post.enabled) post.end(this.renderer, dt);
    for (const h of this.hooks) h.afterRender && h.afterRender(dt);
  }

  // laser module: a red dot wherever the barrel points (walls, floor, people)
  updateLaser(eye, cam) {
    const a = this.arsenal, g = a.gun, p = this.player;
    const on = g.attachments.has('laser') && p.alive && this.state === 'play' && a.state !== 'holster' && !p.sprinting;
    if (!this.laserDot && on) {
      const tex = Lab.cached('br:laser-tex', () => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,235,225,1)'); grd.addColorStop(0.18, 'rgba(255,60,40,0.95)');
        grd.addColorStop(0.45, 'rgba(255,20,10,0.25)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
        x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
        const t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; return t;
      });
      // HDR red (blooms in the bodycam post) with normal blending, so it reads on bright wallpaper
      const mat = new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
      mat.color.setRGB(5, 0.55, 0.4);
      const m = new T3.Mesh(new T3.PlaneGeometry(1, 1), mat);
      m.renderOrder = 8;
      this.view.scene.add(m);
      this.laserDot = m;
    }
    if (!this.laserDot) return;
    this.laserDot.visible = on;
    if (!on) return;
    const d = this.viewDir(new T3.Vector3());
    const hit = this.sb.world.raycast(eye, new I(d.x, d.y, d.z), 80);
    if (!hit) { this.laserDot.visible = false; return; }
    const dist = hit.tIn;
    this.laserDot.position.set(hit.point.x + hit.normal.x * 0.012, hit.point.y + hit.normal.y * 0.012, hit.point.z + hit.normal.z * 0.012);
    this.laserDot.quaternion.copy(cam.quaternion);
    // a touch of shimmer, and the dot stays a few pixels wide at range
    this.laserDot.scale.setScalar((0.04 + dist * 0.0042) * (0.92 + Math.random() * 0.16));
  }

  run() {
    let last = performance.now();
    const loop = (t) => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.maxFrameDt || 0.1, (t - last) / 1000);
      this.frames = (this.frames || 0) + 1;
      last = t;
      try { this.frame(t, dt); } catch (err) { console.error(err); this.lastError = String(err && err.stack || err); }
    };
    requestAnimationFrame(loop);
  }
}
