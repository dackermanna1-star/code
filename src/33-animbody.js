// Animation-driven enemies, GTA IV style. While a gunman is undisturbed its ragdoll is dormant (out
// of the physics world) and motion-capture clips drive its skeleton. Every step the ragdoll bodies
// are posed from the animated bones: rotations from the animation, positions down the ragdoll's own
// joint chain from the pelvis, so the joints are exactly satisfied and bullets hit what is drawn
// (the engine traces dormant bodies too). A hit, blast or kick wakes the ragdoll with the
// animation's velocities plus the impulse, and the active-ragdoll controller takes over: stagger,
// stumble, fall, get up. Once standing, conscious and undisturbed again, the pose blends back into
// animation.

const ANIM = { lib: null, libs: {}, loading: null };
// gunmen: 100STYLE "Swat" + Torque overlays; hollows: 100STYLE "Zombie", "Drunk", "LimpLeft"
const ANIM_SETS = { armed: 'anims/armed', zombie: 'anims/hollow_zombie', drunk: 'anims/hollow_drunk', limp: 'anims/hollow_limpleft' };

// clips (on the Rocketbox skeleton) and their metadata, from assets/anims/*.glb
function loadAnimLibrary() {
  if (ANIM.loading) return ANIM.loading;
  const one = (key, asset) => Assets.gltf(asset)
    .then((g) => {
      if (!g || !g.animations || !g.animations.length) return;
      const extras = (g.asset && g.asset.extras) || {};
      const clips = new Map();
      for (const c of g.animations) clips.set(c.name.replace(/^.*\|/, ''), c);
      ANIM.libs[key] = { key, clips, meta: extras.clips || {}, gltf: g };
    })
    .catch((e) => console.warn('[anim] set unavailable', key, e));
  ANIM.loading = Promise.all(Object.entries(ANIM_SETS).map(([k, a]) => one(k, a))).then(() => {
    ANIM.lib = ANIM.libs.armed || null;
    return ANIM.lib;
  });
  return ANIM.loading;
}

// a shambling style for a hollow: mostly zombies, some drunk stumblers and limpers
function hollowAnimSet() {
  const r = Math.random();
  const want = r < 0.6 ? 'zombie' : r < 0.8 ? 'drunk' : 'limp';
  return ANIM.libs[want] || ANIM.libs.zombie || null;
}

const _m4 = new T3.Matrix4(), _m4b = new T3.Matrix4(), _v3 = new T3.Vector3(), _v3b = new T3.Vector3(), _q = new T3.Quaternion(), _q2 = new T3.Quaternion(), _s3 = new T3.Vector3();
const LOCO_CLIPS = ['idle', 'walk_f', 'walk_b', 'walk_l', 'walk_r', 'run_f', 'run_b', 'run_l', 'run_r'];

class AnimBody {
  // opts.melee: the engine's zombie brain (hollows), whose attacks become claw swipes
  // opts.maxRate: how much faster than captured a clip may play before speed is capped
  constructor(ai, render, gltf, lib, opts = {}) {
    this.ai = ai;
    this.melee = opts.melee || null;
    this.maxRate = opts.maxRate || 1.45;
    this.swipeW = 0;
    this.game = ai.game;
    this.p = ai.p;
    this.render = render;
    this.lib = lib;
    const binder = render.binder;
    this.scale = binder.scale;
    // the animation skeleton: a clone of the character's own bones, never drawn
    const skel = ThreeUtils.cloneSkinned(gltf.scene);
    skel.traverse((o) => { if (o.isMesh) o.visible = false; });
    this.holder = new T3.Group();
    this.holder.add(skel);
    this.holder.updateMatrixWorld(true);
    const bones = new Map();
    skel.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    this.bones = bones;
    // per ragdoll body: world = boneWorld * K with K the exact inverse of the binder's
    // body->bone matrix, so bodies line up with the animated bones and the binder then draws the
    // animation pose itself
    this.byBody = new Map();
    this.locals = []; // unmapped bones (fingers, clavicles, toes): their animated local goes to the binder
    for (const e of binder.plan) {
      const bone = bones.get(e.b.name);
      if (!bone) continue;
      if (e.body) {
        if (this.byBody.has(e.body)) continue;
        const K = new T3.Matrix4().copy(e.C).invert();
        this.byBody.set(e.body, { bone, K, q: new T3.Quaternion(), p: new T3.Vector3() });
      } else if (e.parent && e.L) this.locals.push({ e, bone, bind: e.L.clone() });
    }
    // ragdoll joint chain (parent first) for positions
    this.rd = this.p.rd;
    this.joints = this.rd.jointList.filter((j) => this.byBody.has(j.parent) && this.byBody.has(j.child));
    this.pelvis = this.rd.pelvis;
    this.bodies = this.rd.allBodies();
    // clip player on the animation skeleton
    this.player = new ClipPlayer(skel, [...lib.clips.values()]);
    for (const n of LOCO_CLIPS) if (this.player.has(n)) this.player.play(n, { fade: 0, loop: true, weight: n === 'idle' ? 1 : 0, exclusive: false, speed: 0 });
    this.overlay = new Map(); // name -> { w, target, t, loop }
    // procedural state
    const P = this.pelvis.pos;
    this.pos = new T3.Vector3(P.x, 0, P.z);
    this.heading = this.p.ctl.heading;
    this.vel = new T3.Vector3();
    this.phase = Math.random();
    this.twist = 0; this.pitch = 0; this.kick = 0;
    this.mode = 'physics';
    this.calm = 0;
    this.blend = null;
    this.prev = new Map(this.bodies.map((b) => [b, { p: new T3.Vector3(), q: new T3.Quaternion() }]));
    this.spine = ['Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2'].map((n) => bones.get(n)).filter(Boolean);
    // the clips carry no fingers: close both hands round the weapon (biped fingers bend about +Z)
    const Z = new T3.Vector3(0, 0, 1);
    this.fingers = [];
    for (const [name, bone] of bones) {
      const m = /^Bip01_[LR]_Finger(\d)(\d)?$/.exec(name);
      if (!m) continue;
      const seg = m[2] ? +m[2] : 0;
      const ang = m[1] === '0' ? [0.15, 0.35, 0.3][seg] : [0.95, 1.15, 0.7][seg];
      bone.quaternion.multiply(new T3.Quaternion().setFromAxisAngle(Z, ang));
      this.fingers.push({ bone, rest: bone.quaternion.clone() }); // overlays blend from here each step
    }
    this.pistol = ai.gun && ai.gun.hold === 'pistol';
    // the weapon runs from the right hand (grip) to the left (handguard), as the actor held it
    this.gunQ = new T3.Quaternion();
    this.gunDir = new T3.Vector3(0, 0, 1);
    this.corrYaw = 0; this.corrPitch = 0;
    this.neck = bones.get('Bip01_Neck');
    this.head = bones.get('Bip01_Head');
  }

  get active() { return this.mode === 'anim'; }

  // ---- mode switches ---------------------------------------------------------------------------
  // take over from physics: the ragdoll goes dormant, the current physics pose fades into animation
  enter(fade = 0.35) {
    const p = this.p, sb = this.game.sb, c = p.ctl;
    if (this.mode === 'anim' || !c.alive || !c.conscious || c.mode !== 'balance') return false;
    const P = this.pelvis.pos;
    this.pos.set(P.x, 0, P.z);
    this.heading = c.heading;
    this.vel.set(c.sens.comVel.x, 0, c.sens.comVel.z);
    // capture the physics pose relative to the root, to blend from
    const inv = this.rootMatrix(_m4).invert();
    const pose = new Map();
    for (const b of this.bodies) {
      _m4b.compose(_v3.set(b.pos.x, b.pos.y, b.pos.z), _q.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w), _s3.set(1, 1, 1));
      pose.set(b, inv.clone().multiply(_m4b));
    }
    this.blend = fade > 0 ? { pose, t: 0, dur: fade } : null;
    sb.setDormant(p, true);
    this.mode = 'anim';
    this.calm = 0;
    for (const v of this.prev.values()) v.p.set(NaN, 0, 0);
    this.sync(0);
    return true;
  }

  // hand over to physics, keeping the animation's motion (plus whatever impulse just landed)
  wake(reason = 'hit') {
    if (this.mode !== 'anim') return;
    const p = this.p, sb = this.game.sb;
    this.mode = 'physics';
    this.calm = 0;
    this.blend = null;
    sb.setDormant(p, false, { mode: 'balance' });
    const c = p.ctl;
    c.heading = this.heading;
    if (c.sens) c.sens.comVel.set(this.vel.x, 0, this.vel.z);
    void reason;
  }

  // ---- per step ---------------------------------------------------------------------------------
  step(dt) {
    const ai = this.ai, c = this.p.ctl;
    if (this.mode === 'physics') {
      // back to animation once standing, conscious and left alone for a moment
      const v = c.sens ? Math.hypot(c.sens.comVel.x, c.sens.comVel.z) : 0;
      const ok = !ai.downed && c.alive && c.conscious && c.mode === 'balance' && (c.modeTime || 0) > 0.4 && v < 1.6 && !(c.flail > 0.2) && !(c.startle > 0.3);
      this.calm = ok ? this.calm + dt : 0;
      if (this.calm > 1.0) this.enter();
      return;
    }
    if (ai.downed || !c.alive || !c.conscious) { this.wake('down'); return; }
    this.locomote(dt);
    this.animate(dt);
    this.sync(dt);
    // the AI and its accuracy model read these from the controller
    c.heading = this.heading;
    if (c.sens) { c.sens.comVel.set(this.vel.x, 0, this.vel.z); }
  }

  rootMatrix(out) {
    return out.compose(_v3.set(this.pos.x, 0, this.pos.z), _q.setFromAxisAngle(_v3b.set(0, 1, 0), this.heading), _s3.set(1, 1, 1));
  }

  // follow the controller's route kinematically, steer, keep clear of walls and other people
  locomote(dt) {
    const ai = this.ai, c = this.p.ctl, L = this.game.level;
    const nav = c.nav;
    let want = 0, dx = 0, dz = 0;
    if (c.walking && nav && nav.path && nav.path.length) {
      while (nav.i < nav.path.length) {
        const t = nav.path[nav.i];
        const ex = t.x - this.pos.x, ez = t.z - this.pos.z, d = Math.hypot(ex, ez);
        const last = nav.i === nav.path.length - 1;
        if (d < (last ? 0.18 : 0.4)) { nav.i++; continue; }
        dx = ex / d; dz = ez / d;
        want = Math.min(nav.speed || c.loco.maxSpeed || 1.4, c.loco.maxSpeed || 3.5);
        if (last) want = Math.min(want, d * 2.2 + 0.3); // ease into the final spot
        break;
      }
      if (nav.i >= nav.path.length) { c.stopWalk('arrived'); want = 0; }
    }
    if (ai.aiming) want = Math.min(want, 1.6); // moving and shooting: walk, do not run
    // the clips set the top speed: a jog played much faster than captured looks comic
    const meta = this.lib.meta;
    want = Math.min(want, ((meta.run_f && meta.run_f.speed) || (meta.walk_f && meta.walk_f.speed) || 1.4) * this.maxRate);
    // a claw swipe lunges in
    const atk = this.melee && this.melee.attack, tg = this.melee && this.melee.target;
    if (atk && tg && atk.t < (this.melee.def.windup + this.melee.def.strike)) {
      const lx = tg.pos.x - this.pos.x, lz = tg.pos.z - this.pos.z, ld = Math.hypot(lx, lz);
      if (ld > 0.8) { dx = lx / ld; dz = lz / ld; want = Math.max(want, 1.4); } // only to close the gap
    }
    // accelerate towards the wanted velocity
    const tvx = dx * want, tvz = dz * want;
    const k = 1 - Math.exp(-dt * (want > 0 ? 5 : 7));
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.z += (tvz - this.vel.z) * k;
    // separation from other people
    for (const o of this.game.sb.people) {
      if (o === this.p) continue;
      const q = o.rd.pelvis.pos, sx = this.pos.x - q.x, sz = this.pos.z - q.z, d = Math.hypot(sx, sz);
      if (d < 0.62 && d > 1e-3) { const push = (0.62 - d) * 3; this.vel.x += (sx / d) * push * dt * 8; this.vel.z += (sz / d) * push * dt * 8; }
    }
    const P = this.game.player;
    { const sx = this.pos.x - P.pos.x, sz = this.pos.z - P.pos.z, d = Math.hypot(sx, sz); if (d < 0.6 && d > 1e-3) { this.pos.x += (sx / d) * (0.6 - d); this.pos.z += (sz / d) * (0.6 - d); } }
    // move, but never into walls or props
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (L.free(nx, nz, 0.22)) { this.pos.x = nx; this.pos.z = nz; }
    else if (L.free(nx, this.pos.z, 0.22)) { this.pos.x = nx; this.vel.z = 0; }
    else if (L.free(this.pos.x, nz, 0.22)) { this.pos.z = nz; this.vel.x = 0; }
    else this.vel.set(0, 0, 0);
    // facing: the aim when aiming, else the way we walk; turning on the spot shuffles the feet
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let face = this.heading;
    const tgt = c.lookTarget;
    if (ai.aiming) face = Math.atan2(ai.aimDir.x, ai.aimDir.z);
    else if (atk && tg) face = Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z);
    else if (speed > 0.3) face = Math.atan2(this.vel.x, this.vel.z);
    else if (ai.knows && tgt) face = Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z);
    const err = wrapAngle(face - this.heading);
    // the torso twists first, the feet follow once the twist runs out
    const turnRate = speed > 0.3 ? 5 : Math.abs(err) > 0.5 ? 4 : 1.2;
    this.heading = wrapAngle(this.heading + clamp(err, -turnRate * dt, turnRate * dt));
    this.turning = speed < 0.3 ? clamp(Math.abs(err) * 1.5, 0, 1) * (Math.abs(err) > 0.25 ? 1 : 0) : 0;
    // twist the spine towards the aim inside what the legs have not turned yet; a feedback term
    // turns the torso until the barrel the hands hold really points at the target
    const aimYawW = Math.atan2(ai.aimDir.x, ai.aimDir.z), aimPitch = Math.asin(clamp(ai.aimDir.y, -1, 1));
    if (ai.aiming) {
      const gy = Math.atan2(this.gunDir.x, this.gunDir.z), gp = Math.asin(clamp(this.gunDir.y, -1, 1));
      this.corrYaw = clamp(this.corrYaw + wrapAngle(aimYawW - gy) * dt * 7, -0.7, 0.7);
      this.corrPitch = clamp(this.corrPitch + (aimPitch - gp) * dt * 7, -0.8, 0.8);
    } else { this.corrYaw *= Math.exp(-dt * 3); this.corrPitch *= Math.exp(-dt * 3); }
    const aimYaw = ai.aiming ? wrapAngle(aimYawW - this.heading) + this.corrYaw : 0;
    const pitchT = ai.aiming ? this.corrPitch : 0;
    this.twist += (clamp(aimYaw, -1.2, 1.2) - this.twist) * (1 - Math.exp(-dt * 10));
    this.pitch += (clamp(pitchT, -0.8, 0.8) - this.pitch) * (1 - Math.exp(-dt * 10));
  }

  // locomotion blend by velocity relative to the facing, phase-locked so feet stay in step
  animate(dt) {
    const pl = this.player, meta = this.lib.meta;
    const sinh = Math.sin(this.heading), cosh = Math.cos(this.heading);
    const vf = this.vel.x * sinh + this.vel.z * cosh;      // forward
    const vr = -(this.vel.x * cosh - this.vel.z * sinh);   // character's right is -x when facing +z
    const speed = Math.hypot(vf, vr);
    const w = { idle: 0, walk_f: 0, walk_b: 0, walk_l: 0, walk_r: 0, run_f: 0, run_b: 0, run_l: 0, run_r: 0 };
    const moving = clamp((speed - 0.08) / 0.35, 0, 1);
    const shuffle = this.turning * 0.35 * (1 - moving);
    w.idle = Math.max(0, 1 - moving - shuffle);
    if (speed > 1e-3) {
      const fx = vf / speed, rx = vr / speed;
      const m = Math.max(moving, shuffle);
      // each direction blends its walk into its run as the speed passes the walk's natural pace
      const dirW = { f: Math.max(0, fx), b: Math.max(0, -fx), r: Math.max(0, rx), l: Math.max(0, -rx) };
      for (const d of ['f', 'b', 'l', 'r']) {
        const ws = (meta['walk_' + d] && meta['walk_' + d].speed) || 0.9, rs = (meta['run_' + d] && meta['run_' + d].speed) || 0;
        const runK = this.has('run_' + d) && rs > ws ? clamp((speed - ws * 1.05) / Math.max(0.2, rs - ws * 1.05), 0, 1) : 0;
        w['walk_' + d] = dirW[d] * m * (1 - runK);
        w['run_' + d] = dirW[d] * m * runK;
      }
    } else if (shuffle > 0) {
      w.walk_f = shuffle; // feet shuffle round on the spot
    }
    // fold missing clips into what exists
    if (!this.has('walk_b')) { w.walk_f += w.walk_b; w.walk_b = 0; }
    if (!this.has('walk_l')) { w.walk_f += w.walk_l; w.walk_l = 0; }
    if (!this.has('walk_r')) { w.walk_f += w.walk_r; w.walk_r = 0; }
    // stride rate: the clip's natural speed sets how fast the phase runs
    let rate = 0, tw = 0;
    for (const n of ['walk_f', 'walk_b', 'walk_l', 'walk_r', 'run_f', 'run_b', 'run_l', 'run_r']) {
      if (!w[n] || !this.has(n)) continue;
      const cs = (meta[n] && meta[n].speed) || 1.4, dur = pl.duration(n);
      const sp = n === 'walk_f' && shuffle > 0 && speed < 0.2 ? 0.6 : Math.max(speed, 0.3);
      rate += w[n] * (sp / cs) / dur; tw += w[n];
    }
    this.phase = (this.phase + dt * (tw > 0 ? rate / tw : 0)) % 1;
    for (const n of LOCO_CLIPS) {
      const l = pl.layer(n);
      if (!l) continue;
      // a hair above zero keeps idle layers alive in the player (it drops weightless ones)
      l.weight = l.target = Math.max(1e-4, w[n] || 0);
      l.time = n === 'idle' ? (l.time + dt) % l.clip.duration : this.phase * l.clip.duration;
    }
    pl.update(0);
    this.placeRoot();
    for (const f of this.fingers) f.bone.quaternion.copy(f.rest);
    // upper-body overlays: a shouldered aim while aiming, a reload timed to the AI's reload
    const ai = this.ai;
    // pistols: a procedural two-hand stance (solveArms) instead of an overlay
    const aimClip = this.pistol ? null : this.has('aim') ? 'aim' : null;
    const relClip = this.pistol && this.has('reload_pistol') ? 'reload_pistol' : this.has('reload') ? 'reload' : null;
    const reloading = ai.reloadT > 0;
    if (relClip) {
      if (reloading && !this.reloadRun) {
        this.reloadRun = true;
        const o = this.setOverlay(relClip, 1, true);
        o.t = 0; o.once = true;
        o.rate = this.player.duration(relClip) / Math.max(0.5, ai.reloadT);
      } else if (!reloading && this.reloadRun) { this.reloadRun = false; this.setOverlay(relClip, 0); }
    }
    if (aimClip) this.setOverlay(aimClip, ai.aiming && !reloading ? 1 : 0);
    for (const [name, o] of this.overlay) {
      o.w += (o.target - o.w) * (1 - Math.exp(-dt * 9));
      o.t += dt * (o.rate || 1);
      if (o.w < 0.01 && o.target === 0) { this.overlay.delete(name); continue; }
      this.applyOverlay(name, o);
    }
    // procedural: torso twist and pitch towards the aim, recoil
    this.kick = Math.max(0, this.kick - dt * 9);
    const n = this.spine.length || 1;
    // hollows: hunch into a charge with the head held up at the prey, and twitch
    let lean = 0, tY = 0, tR = 0;
    if (this.melee) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.lean = (this.lean || 0) + (clamp((sp - 1.2) / 1.6, 0, 1) * 0.42 - (this.lean || 0)) * (1 - Math.exp(-dt * 4));
      lean = this.lean;
      this.twitchT = (this.twitchT ?? Math.random()) - dt;
      if (this.twitchT <= 0) {
        this.twitchT = 0.35 + Math.random() * 1.4;
        this.twitch = { y: (Math.random() - 0.5) * 0.7, r: (Math.random() - 0.5) * 0.6, t: 0 };
      }
      if (this.twitch) {
        this.twitch.t += dt;
        const k = Math.exp(-this.twitch.t * 9) * Math.min(1, this.twitch.t * 40);
        tY = this.twitch.y * k; tR = this.twitch.r * k;
      }
    }
    for (const b of this.spine) this.rotateWorld(b, 0, this.twist / n, -this.pitch * 0.6 / n - this.kick * 0.03 + lean / n);
    if (this.neck) this.rotateWorld(this.neck, tR * 0.4, tY * 0.5, -this.pitch * 0.25 - lean * 0.45);
    if (this.head) this.rotateWorld(this.head, tR, tY, -this.pitch * 0.15 + this.kick * 0.02 - lean * 0.35);
    // pistol stance: both arms reach to a grip on the aim line in front of the chest
    this.ikW = (this.ikW || 0) + ((this.pistol && ai.aiming && !reloading ? 1 : 0) - (this.ikW || 0)) * (1 - Math.exp(-dt * 10));
    if (this.ikW > 0.01) this.solveArms(this.ikW);
    if (this.melee) this.solveSwipe(dt);
  }

  // a hollow's attack, timed by its brain: the arm cocks back and up, rakes through the target and
  // recovers; the brain's own hit test then reads the hand
  solveSwipe(dt) {
    const br = this.melee, atk = br.attack, tg = br.target;
    if (!atk || !tg) { this.swipeW = Math.max(0, this.swipeW - dt * 4); if (this.swipeW <= 0) return; }
    const B = this.bones, side = (atk && atk.side) || this.swipeSide || 'R';
    this.swipeSide = side;
    const u = B.get(`Bip01_${side}_UpperArm`), f = B.get(`Bip01_${side}_Forearm`), h = B.get(`Bip01_${side}_Hand`);
    if (!u || !f || !h) return;
    this.holder.updateMatrixWorld(true);
    const S0 = new T3.Vector3().setFromMatrixPosition(u.matrixWorld);
    const fwd = new T3.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const out = new T3.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(side === 'R' ? 1 : -1); // away from the body
    const arm = S0.distanceTo(new T3.Vector3().setFromMatrixPosition(f.matrixWorld)) + new T3.Vector3().setFromMatrixPosition(f.matrixWorld).distanceTo(new T3.Vector3().setFromMatrixPosition(h.matrixWorld));
    const cocked = S0.clone().addScaledVector(out, arm * 0.45).addScaledVector(fwd, -arm * 0.15).add(new T3.Vector3(0, arm * 0.45, 0));
    const aim = tg ? new T3.Vector3(tg.aim.x, tg.aim.y, tg.aim.z) : S0.clone().addScaledVector(fwd, arm);
    const toT = aim.sub(S0);
    const hit = S0.clone().addScaledVector(toT.normalize(), arm * 0.98).addScaledVector(out, -arm * 0.25);
    let target = hit, w = this.swipeW;
    if (atk) {
      const wu = br.def.windup, st = br.def.strike, t = atk.t;
      if (t < wu) { target = cocked; w = Math.min(1, t / wu * 1.4); }
      else if (t < wu + st) { const k = (t - wu) / st; target = cocked.clone().lerp(hit, k * k * (3 - 2 * k)); w = 1; }
      else { target = hit; w = clamp(1 - (t - wu - st) / 0.3, 0, 1); }
      this.swipeW = w;
    }
    this.reach(u, f, h, target, side === 'R' ? 1 : -1, w, fwd, out);
  }

  // two-bone reach for one arm (elbow out and down)
  reach(u, f, h, target, sideSign, w, fwd, right) {
    const P = (b) => new T3.Vector3().setFromMatrixPosition(b.matrixWorld);
    const a = P(u).distanceTo(P(f)), b = P(f).distanceTo(P(h));
    const S0 = P(u), toT = target.clone().sub(S0);
    const c = clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    toT.normalize();
    const hint = new T3.Vector3(0, -1, 0).addScaledVector(right, 0.8).addScaledVector(fwd, -0.2);
    const pole = hint.addScaledVector(toT, -toT.dot(hint)).normalize();
    const cosA = clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const elbow = S0.clone().addScaledVector(toT, a * cosA).addScaledVector(pole, a * sinA);
    const end = S0.clone().addScaledVector(toT, c);
    this.aimBone(u, P(f).sub(S0).normalize(), elbow.sub(S0).normalize(), w);
    u.updateMatrixWorld(true);
    this.aimBone(f, P(h).sub(P(f)).normalize(), end.sub(P(f)).normalize(), w);
    f.updateMatrixWorld(true);
    void sideSign;
  }

  // two-bone IK for both arms towards a two-handed pistol grip
  solveArms(w) {
    const B = this.bones;
    const uR = B.get('Bip01_R_UpperArm'), fR = B.get('Bip01_R_Forearm'), hR = B.get('Bip01_R_Hand');
    const uL = B.get('Bip01_L_UpperArm'), fL = B.get('Bip01_L_Forearm'), hL = B.get('Bip01_L_Hand');
    if (!uR || !fR || !hR || !uL || !fL || !hL) return;
    this.holder.updateMatrixWorld(true);
    const P = (b) => new T3.Vector3().setFromMatrixPosition(b.matrixWorld);
    const sR = P(uR), sL = P(uL), mid = sR.clone().add(sL).multiplyScalar(0.5);
    const arm = P(uR).distanceTo(P(fR)) + P(fR).distanceTo(P(hR));
    const aim = new T3.Vector3(this.ai.aimDir.x, this.ai.aimDir.y, this.ai.aimDir.z).normalize();
    const right = new T3.Vector3().crossVectors(aim, new T3.Vector3(0, 1, 0)).normalize(); // character's right
    const grip = mid.clone().addScaledVector(aim, arm * 0.82).add(new T3.Vector3(0, -0.06 * this.scale, 0));
    const reach = (u, f, h, target, side) => {
      const a = P(u).distanceTo(P(f)), b = P(f).distanceTo(P(h));
      const S0 = P(u), toT = target.clone().sub(S0);
      const c = clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
      toT.normalize();
      // elbows out and down
      const pole = new T3.Vector3(0, -1, 0).addScaledVector(right, side * 0.8).addScaledVector(toT, -toT.dot(new T3.Vector3(0, -1, 0).addScaledVector(right, side * 0.8))).normalize();
      const cosA = clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      const elbow = S0.clone().addScaledVector(toT, a * cosA).addScaledVector(pole, a * sinA);
      const end = S0.clone().addScaledVector(toT, c);
      this.aimBone(u, P(f).sub(S0).normalize(), elbow.clone().sub(S0).normalize(), w);
      u.updateMatrixWorld(true);
      this.aimBone(f, P(h).sub(P(f)).normalize(), end.sub(P(f)).normalize(), w);
      f.updateMatrixWorld(true);
    };
    reach(uR, fR, hR, grip.clone().addScaledVector(right, 0.01 * this.scale), 1);
    reach(uL, fL, hL, grip.clone().addScaledVector(right, -0.035 * this.scale).add(new T3.Vector3(0, -0.02 * this.scale, 0)), -1);
  }

  // turn a bone so its world direction `from` becomes `to` (blended by w)
  aimBone(bone, from, to, w) {
    const d = new T3.Quaternion().setFromUnitVectors(from, to);
    if (w < 1) d.slerp(new T3.Quaternion(), 1 - w);
    const pw = bone.parent.getWorldQuaternion(new T3.Quaternion());
    const bw = bone.getWorldQuaternion(new T3.Quaternion());
    bone.quaternion.copy(pw.invert().multiply(d.multiply(bw)));
  }

  has(n) { return this.player.has(n); }

  setOverlay(name, target, create = false) {
    let o = this.overlay.get(name);
    if (!o) { if (!target && !create) return null; o = { w: 0, target, t: 0 }; this.overlay.set(name, o); }
    o.target = target;
    return o;
  }

  // blend an upper-body clip over the locomotion (spine2 and up, both arms)
  applyOverlay(name, o) {
    const clip = this.player.clips.get(name);
    if (!clip) return;
    if (!o.bind) {
      o.bind = clip.bindings.filter((b) => {
        const prop = this.player.props.get(b.key);
        const nm = prop.obj.name;
        return prop.prop === 'quaternion' && /Spine2|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Finger/.test(nm);
      }).map((b) => ({ b, obj: this.player.props.get(b.key).obj }));
    }
    const t = clip.duration > 0 ? (o.once ? Math.min(o.t, clip.duration) : o.t % clip.duration) : 0;
    for (const { b, obj } of o.bind) {
      const v = b.interp.evaluate(t);
      _q.set(v[0], v[1], v[2], v[3]);
      obj.quaternion.slerp(_q, o.w);
    }
  }

  // rotate a bone about the character's own axes (yaw about up, pitch about right), in world terms
  rotateWorld(bone, roll, yaw, pitch) {
    const parent = bone.parent;
    parent.getWorldQuaternion(_q2); // refreshes the chain above, including earlier edits
    const right = _v3.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const delta = _q.setFromAxisAngle(_v3b.set(0, 1, 0), yaw);
    delta.multiply(new T3.Quaternion().setFromAxisAngle(right, pitch));
    if (roll) delta.multiply(new T3.Quaternion().setFromAxisAngle(new T3.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), roll));
    // local' = parentW^-1 * delta * parentW * local
    const inv = _q2.clone().invert();
    bone.quaternion.premultiply(inv.multiply(delta).multiply(_q2));
  }

  placeRoot() {
    this.holder.position.set(this.pos.x, 0, this.pos.z);
    this.holder.quaternion.setFromAxisAngle(_v3.set(0, 1, 0), this.heading);
    this.holder.scale.setScalar(this.scale);
  }

  // pose the ragdoll bodies from the animated skeleton
  sync(dt) {
    this.placeRoot();
    this.holder.updateMatrixWorld(true);
    // rotations (and the pelvis position) from the animation
    for (const [, m] of this.byBody) {
      _m4.multiplyMatrices(m.bone.matrixWorld, m.K);
      _m4.decompose(m.p, m.q, _s3);
    }
    // blending in from a captured physics pose
    let bw = 1;
    if (this.blend) {
      this.blend.t += dt;
      bw = clamp(this.blend.t / this.blend.dur, 0, 1);
      bw = bw * bw * (3 - 2 * bw);
      const root = this.rootMatrix(_m4b);
      for (const [body, m] of this.byBody) {
        const rel = this.blend.pose.get(body);
        if (!rel) continue;
        _m4.multiplyMatrices(root, rel).decompose(_v3, _q, _s3);
        m.q.copy(_q.slerp(m.q, bw));
        m.p.lerp(_v3, 0); // positions come from the chain below
        if (body === this.pelvis) m.p.copy(_v3.lerp(m.p, bw));
      }
      if (bw >= 1) this.blend = null;
    }
    const pm = this.byBody.get(this.pelvis);
    const set = (body, px, py, pz, q) => {
      const pr = this.prev.get(body);
      if (body.framePos) body.framePos.copy(body.pos);
      if (body.frameRot) body.frameRot.copy(body.rot);
      if (pr) { pr.p.set(body.pos.x, body.pos.y, body.pos.z); pr.q.set(body.rot.x, body.rot.y, body.rot.z, body.rot.w); }
      body.pos.set(px, py, pz);
      body.rot.set(q.x, q.y, q.z, q.w);
      if (dt > 0 && pr && Number.isFinite(pr.p.x)) {
        body.vel.set((px - pr.p.x) / dt, (py - pr.p.y) / dt, (pz - pr.p.z) / dt);
        // angular velocity from the rotation step
        _q2.set(q.x, q.y, q.z, q.w).multiply(pr.q.clone().invert());
        if (_q2.w < 0) { _q2.x = -_q2.x; _q2.y = -_q2.y; _q2.z = -_q2.z; _q2.w = -_q2.w; }
        const s = Math.sqrt(Math.max(0, 1 - _q2.w * _q2.w)), ang = 2 * Math.acos(clamp(_q2.w, -1, 1));
        if (s > 1e-6) body.angVel.set((_q2.x / s) * ang / dt, (_q2.y / s) * ang / dt, (_q2.z / s) * ang / dt);
        else body.angVel.set(0, 0, 0);
      } else { body.vel.set(0, 0, 0); body.angVel.set(0, 0, 0); }
      body.computeAABB(0, 0);
    };
    set(this.pelvis, pm.p.x, pm.p.y, pm.p.z, pm.q);
    // down the joint chain: child = parent + parentRot*anchorP - childRot*anchorC
    for (const j of this.joints) {
      const cm = this.byBody.get(j.child);
      const pb = j.parent;
      _q.set(pb.rot.x, pb.rot.y, pb.rot.z, pb.rot.w);
      _v3.set(j.anchorP.x, j.anchorP.y, j.anchorP.z).applyQuaternion(_q).add(_v3b.set(pb.pos.x, pb.pos.y, pb.pos.z));
      _v3b.set(j.anchorC.x, j.anchorC.y, j.anchorC.z).applyQuaternion(cm.q);
      set(j.child, _v3.x - _v3b.x, _v3.y - _v3b.y, _v3.z - _v3b.z, cm.q);
    }
    // fingers, clavicles and the rest follow their animated local transform
    for (const { e, bone } of this.locals) e.L.copy(bone.matrix);
    // weapon orientation: a long gun runs from the right hand (grip) to the left (handguard); a
    // pistol points along the extended right arm; mid-reload the gun stays fixed in the right hand
    // while the left fetches the magazine
    const seg = this.rd.segments, hRb = seg.handR.body, hR = hRb.pos;
    const handQ = _q2.set(hRb.rot.x, hRb.rot.y, hRb.rot.z, hRb.rot.w);
    if (this.reloadRun && this.relQ) {
      this.gunQ.copy(handQ).multiply(this.relQ);
      this.gunDir.set(0, 0, -1).applyQuaternion(this.gunQ);
    } else {
      if (this.pistol) {
        // two-hand grip: from between the shoulders through the hands
        const a = seg.upperArmR.body.pos, b = seg.upperArmL.body.pos, l = seg.handL.body.pos;
        this.gunDir.set((hR.x + l.x - a.x - b.x) / 2, (hR.y + l.y - a.y - b.y) / 2, (hR.z + l.z - a.z - b.z) / 2);
      } else {
        const l = seg.handL.body.pos;
        this.gunDir.set(l.x - hR.x, l.y - hR.y, l.z - hR.z);
      }
      if (this.gunDir.lengthSq() < 1e-4) this.gunDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.gunDir.normalize();
      this.gunQ.setFromEuler(new T3.Euler(Math.asin(clamp(this.gunDir.y, -1, 1)), Math.atan2(this.gunDir.x, this.gunDir.z) + Math.PI, 0, 'YXZ'));
      this.relQ = handQ.clone().invert().multiply(this.gunQ); // ready for a reload
    }
    void bw;
  }

  // muzzle climb on the upper body
  onFire() { this.kick = Math.min(1.5, this.kick + 1); }
}
