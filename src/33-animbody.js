// Animation-driven enemies, GTA IV style. While a gunman is undisturbed its ragdoll is dormant (out
// of the physics world) and motion-capture clips drive its skeleton. Every step the ragdoll bodies
// are posed from the animated bones: rotations from the animation, positions down the ragdoll's own
// joint chain from the pelvis, so the joints are exactly satisfied and bullets hit what is drawn
// (the engine traces dormant bodies too). A hit, blast or kick wakes the ragdoll with the
// animation's velocities plus the impulse, and the active-ragdoll controller takes over: stagger,
// stumble, fall, get up. Once standing, conscious and undisturbed again, the pose blends back into
// animation. A body on the floor, conscious and ready to rise, gets up on motion-captured get-ups
// (CMU) instead of the engine's slower physical get-up: the best matching take is laid over where
// the ragdoll lies, the physics pose blends into it and the body flows from it into locomotion.

const ANIM = { lib: null, libs: {}, loading: null };
// gunmen: 100STYLE "Swat" + Torque overlays; hollows: 100STYLE "Zombie", "Drunk", "LimpLeft";
// shared: CMU get-ups (on the back, on the belly, each mirrored too) and 100STYLE "Neutral" arm
// swing for a one-handed pistol carry
const ANIM_SETS = { armed: 'anims/armed', zombie: 'anims/hollow_zombie', drunk: 'anims/hollow_drunk', limp: 'anims/hollow_limpleft', getup: 'anims/getup', carry: 'anims/carry' };

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

const _qInv = new T3.Quaternion(), _eul = new T3.Euler(), _qA = new T3.Quaternion(), _qB = new T3.Quaternion(), _axis = new T3.Vector3();
const _m4 = new T3.Matrix4(), _m4b = new T3.Matrix4(), _v3 = new T3.Vector3(), _v3b = new T3.Vector3(), _q = new T3.Quaternion(), _q2 = new T3.Quaternion(), _s3 = new T3.Vector3();
const LOCO_CLIPS = ['idle', 'walk_f', 'walk_b', 'walk_l', 'walk_r', 'run_f', 'run_b', 'run_l', 'run_r'];
const ARM_BONES = ['Bip01_L_Clavicle', 'Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand', 'Bip01_R_Clavicle', 'Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand'];
// get-up matching: the bodies compared (pelvis first) and how much each counts
const GU_SEGS = ['pelvis', 'chest', 'head', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const GU_W = [0, 1.5, 1.5, 1, 1, 0.8, 0.8, 0.5, 0.5, 1, 1, 0.8, 0.8, 0.5, 0.5];

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
    // clip player on the animation skeleton (the style's clips plus the shared get-ups)
    const gl = ANIM.libs.getup;
    this.getups = gl ? [...gl.clips.keys()].filter((n) => /^getup_/.test(n)) : [];
    this.player = new ClipPlayer(skel, [...lib.clips.values(), ...(gl ? gl.clips.values() : [])]);
    for (const n of LOCO_CLIPS) if (this.player.has(n)) this.player.play(n, { fade: 0, loop: true, weight: n === 'idle' ? 1 : 0, exclusive: false, speed: 0 });
    this.pistol = ai.gun && ai.gun.hold === 'pistol';
    // a pistol leaves the off hand free: the arms swing as in a natural walk (phase-locked to the
    // legs) and the gun hand carries the pistol low (solveCarry) until the aim comes up
    const cl = ANIM.libs.carry;
    if (this.pistol && cl) {
      this.armPlayer = new ClipPlayer(skel, [...cl.clips.values()]);
      for (const n of LOCO_CLIPS) if (this.armPlayer.has(n)) this.armPlayer.play(n, { fade: 0, loop: true, weight: n === 'idle' ? 1 : 0, exclusive: false, speed: 0 });
      this.armBones = ARM_BONES.map((n) => bones.get(n)).filter(Boolean);
      this.armSave = this.armBones.map(() => new T3.Quaternion());
    }
    this.carryW = 0; this.carryEff = 0; this.runW = 0;
    this.gu = null;
    this.overlay = new Map(); // name -> { w, target, t, loop }
    // procedural state
    const P = this.pelvis.pos;
    this.pos = new T3.Vector3(P.x, 0, P.z);
    this.heading = this.p.ctl.heading;
    this.vel = new T3.Vector3();
    this.phase = Math.random();
    this.twist = 0; this.pitch = 0; this.kick = 0;
    this.fl = null; this.flinchAmt = 0; this.stagger = 0; this.lastHitT = -9; this.hits = 0;
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
    // the weapon runs from the right hand (grip) to the left (handguard), as the actor held it
    this.gunQ = new T3.Quaternion();
    this.gunDir = new T3.Vector3(0, 0, 1);
    this.corrYaw = 0; this.corrPitch = 0;
    this.neck = bones.get('Bip01_Neck');
    this.head = bones.get('Bip01_Head');
    // the controller decides when a body on the floor wants up; a motion-captured get-up takes the
    // request when it can (see startGetUp), else the engine's physical get-up goes ahead
    const c = this.p.ctl;
    if (c.wantsToGetUp && this.getups.length) {
      const orig = c.wantsToGetUp.bind(c);
      c.wantsToGetUp = (dt) => {
        const r = orig(dt);
        if (!r || this.mode !== 'physics' || this.game.time < (this.noMocapT || 0) || !this.canGetUp()) return r;
        this.getupReq = true;
        return false;
      };
    }
  }

  // the animation drives the body: locomotion, or a get-up from the floor
  get active() { return this.mode === 'anim' || this.mode === 'getup'; }

  // ---- mode switches ---------------------------------------------------------------------------
  // take over from physics: the ragdoll goes dormant, the current physics pose fades into animation
  enter(fade = 0.35) {
    const p = this.p, sb = this.game.sb, c = p.ctl;
    if (this.mode === 'anim' || !c.alive || !c.conscious || c.mode !== 'balance') return false;
    // a broken limb has extra fragment bodies the animation cannot pose, and a severed one is not
    // there to pose: stay physical
    if (this.rd.extraBodies && this.rd.extraBodies.length) return false;
    if (p.dismembered) return false;
    const P = this.pelvis.pos;
    this.pos.set(P.x, 0, P.z);
    this.unstick();
    this.heading = c.heading;
    this.vel.set(c.sens.comVel.x, 0, c.sens.comVel.z);
    this.capturePose(fade);
    sb.setDormant(p, true);
    this.mode = 'anim';
    this.calm = 0;
    for (const v of this.prev.values()) v.p.set(NaN, 0, 0);
    this.sync(0);
    return true;
  }

  // the physics pose relative to the root (this.pos, this.heading), for sync() to blend from
  capturePose(fade) {
    const inv = this.rootMatrix(_m4).invert();
    const pose = new Map();
    for (const b of this.bodies) {
      _m4b.compose(_v3.set(b.pos.x, b.pos.y, b.pos.z), _q.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w), _s3.set(1, 1, 1));
      pose.set(b, inv.clone().multiply(_m4b));
    }
    this.blend = fade > 0 ? { pose, t: 0, dur: fade } : null;
  }

  // ---- get-ups -----------------------------------------------------------------------------------
  // whether a motion-captured get-up can take this body: a broken or severed limb, or a body in no
  // state to be animated, gets up physically (or not at all)
  canGetUp() {
    const c = this.p.ctl;
    if (!this.getups.length || this.ai.downed || !c.alive || !c.conscious) return false;
    if (this.rd.extraBodies && this.rd.extraBodies.length) return false;
    if (this.p.dismembered || this.p.dormant) return false;
    return true;
  }

  // a get-up clip's first half sampled as body positions on this skeleton (root at the origin
  // facing +z), plus where its pelvis travels; cached per clip
  guTable(name) {
    const cache = this.guCache || (this.guCache = new Map());
    let tab = cache.get(name);
    if (tab) return tab;
    const clip = this.player.clips.get(name);
    if (!clip) return null;
    const segs = GU_SEGS.map((s) => this.byBody.get(this.rd.segments[s].body));
    if (segs.some((m) => !m)) return null;
    this.holder.position.set(0, 0, 0);
    this.holder.quaternion.identity();
    this.holder.scale.setScalar(this.scale);
    const pose = (t) => {
      for (const b of clip.bindings) {
        const v = b.interp.evaluate(t), pr = this.player.props.get(b.key);
        if (b.size === 4) pr.obj.quaternion.set(v[0], v[1], v[2], v[3]); else pr.obj[pr.prop].set(v[0], v[1], v[2]);
      }
      this.holder.updateMatrixWorld(true);
      const out = new Float32Array(segs.length * 3);
      segs.forEach((m, i) => { _m4.multiplyMatrices(m.bone.matrixWorld, m.K); out[i * 3] = _m4.elements[12]; out[i * 3 + 1] = _m4.elements[13]; out[i * 3 + 2] = _m4.elements[14]; });
      return out;
    };
    const meta = (ANIM.libs.getup && ANIM.libs.getup.meta[name]) || {};
    tab = { name, dur: clip.duration, kind: meta.getup || (/_up/.test(name) ? 'up' : 'down'), frames: [], path: [] };
    for (let t = 0; t <= clip.duration * 0.5; t += 1 / 15) tab.frames.push({ t, p: pose(t) });
    for (const u of [0.25, 0.5, 0.75, 1]) { const p = pose(clip.duration * u); tab.path.push([p[0], p[2]]); }
    cache.set(name, tab);
    return tab;
  }

  // choose the get-up for the way the body lies: face up or face down from the chest, then the take
  // (and the moment in it) whose pose is nearest the ragdoll's once laid over it - turned to the
  // body's heading, pelvis on pelvis - with room to stand up where it ends
  planGetUp() {
    const S = this.rd.segments, L = this.game.level;
    const bodies = GU_SEGS.map((s) => S[s] && S[s].body);
    if (bodies.some((b) => !b)) return null;
    const r = new Float32Array(bodies.length * 3);
    bodies.forEach((b, i) => { r[i * 3] = b.pos.x; r[i * 3 + 1] = b.pos.y; r[i * 3 + 2] = b.pos.z; });
    // front = left x up the spine (as the clip tables are measured)
    const front = (p, cs, sn) => {
      const lx = p[9] - p[12], ly = p[10] - p[13], lz = p[11] - p[14];
      const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2];
      let fx = ly * uz - lz * uy, fy = lz * ux - lx * uz, fz = lx * uy - ly * ux;
      const n = Math.hypot(fx, fy, fz) || 1; fx /= n; fy /= n; fz /= n;
      return [fx * cs + fz * sn, fy, -fx * sn + fz * cs];
    };
    const fr = front(r, 1, 0);
    const want = fr[1] < -0.3 ? 'down' : fr[1] > 0.3 ? 'up' : null;
    const pairs = [[0, 1], [4, 3], [0, 11], [0, 12], [0, 2]];
    const cands = [];
    for (const name of this.getups) {
      const tab = this.guTable(name);
      if (!tab || (want && tab.kind !== want)) continue;
      let best = null;
      for (const f of tab.frames) {
        const c = f.p;
        let sd = 0, sc = 0;
        for (const [a, b] of pairs) {
          const cx = c[b * 3] - c[a * 3], cz = c[b * 3 + 2] - c[a * 3 + 2], rx = r[b * 3] - r[a * 3], rz = r[b * 3 + 2] - r[a * 3 + 2];
          sd += cx * rx + cz * rz; sc += cz * rx - cx * rz;
        }
        const th = Math.atan2(sc, sd), cs = Math.cos(th), sn = Math.sin(th);
        const tx = r[0] - (c[0] * cs + c[2] * sn), tz = r[2] - (-c[0] * sn + c[2] * cs);
        let cost = 0;
        for (let i = 0; i < GU_SEGS.length; i++) {
          const px = c[i * 3] * cs + c[i * 3 + 2] * sn + tx, pz = -c[i * 3] * sn + c[i * 3 + 2] * cs + tz, py = c[i * 3 + 1];
          cost += GU_W[i] * ((px - r[i * 3]) ** 2 + (py - r[i * 3 + 1]) ** 2 * 1.5 + (pz - r[i * 3 + 2]) ** 2);
        }
        const fc = front(c, cs, sn);
        cost += 0.6 * (1 - (fc[0] * fr[0] + fc[1] * fr[1] + fc[2] * fr[2]));
        cost += 0.3 * f.t / tab.dur; // start at the start where it fits about as well
        if (!best || cost < best.cost) best = { name, t: f.t, cost, heading: th, x: tx, z: tz, tab };
      }
      if (best) cands.push(best);
    }
    // a little chance in the choice between near equals (mirrored takes, two actors)
    for (const cd of cands) cd.key = cd.cost + Math.random() * 0.05;
    cands.sort((a, b) => a.key - b.key);
    for (const cd of cands) {
      const cs = Math.cos(cd.heading), sn = Math.sin(cd.heading);
      // where the pelvis goes on the way up, and where it stands at the end (the clip's origin)
      const pts = cd.tab.path.map(([x, z]) => [x * cs + z * sn + cd.x, -x * sn + z * cs + cd.z]);
      const end = pts[pts.length - 1];
      if (!L.free(end[0], end[1], 0.26) || !pts.every(([x, z]) => L.free(x, z, 0.14))) continue;
      if (this.game.sb.people.some((o) => o !== this.p && Math.hypot(o.rd.pelvis.pos.x - end[0], o.rd.pelvis.pos.z - end[1]) < 0.55)) continue;
      return cd;
    }
    return null;
  }

  // lay the chosen get-up over the ragdoll and play it from the captured physics pose
  startGetUp(maxCost = Infinity) {
    if (!this.canGetUp()) return false;
    const plan = this.planGetUp();
    if (!plan || plan.cost > maxCost) return false;
    const p = this.p, c = p.ctl, ai = this.ai;
    this.pos.set(plan.x, 0, plan.z);
    this.heading = plan.heading;
    this.vel.set(0, 0, 0);
    // a poor match blends in a little longer
    this.capturePose(clamp(0.2 + plan.cost * 0.12, 0.2, 0.34));
    // pace: a fighter in good shape is up in about a second and a half, the badly hurt slower; the
    // hollowed come up fast and in jerks
    const fit = clamp(ai.tough / (ai.toughMax || 1), 0, 1), pain = clamp(c.pain || 0, 0, 1);
    const rate = this.melee ? 1.38 + Math.random() * 0.2 : (0.98 + 0.2 * fit) * (1 - 0.35 * pain);
    this.gu = { name: plan.name, t: plan.t, dur: this.player.duration(plan.name), rate, w: 1, out: false, jerk: 1, jerkT: 0, cost: plan.cost };
    this.player.play(plan.name, { fade: 0, loop: false, exclusive: false, weight: 1, speed: 0, startAt: plan.t, restart: true });
    // the gun stays as the hand holds it
    const hb = this.rd.segments.handR.body, gun = this.render && this.render.gun;
    this.guGunRel = gun ? new T3.Quaternion(hb.rot.x, hb.rot.y, hb.rot.z, hb.rot.w).invert().multiply(gun.quaternion) : null;
    this.game.sb.setDormant(p, true);
    this.mode = 'getup';
    this.calm = 0;
    this.fl = null; this.flinchAmt = 0; this.stagger = 0;
    this.twist = 0; this.pitch = 0; this.kick = 0; this.corrYaw = 0; this.corrPitch = 0;
    for (const v of this.prev.values()) v.p.set(NaN, 0, 0);
    this.lastGetUp = plan.name;
    this.animate(0);
    this.sync(0);
    return true;
  }

  // on the feet: locomotion and the AI take over while the get-up fades out under them
  finishGetUp() {
    const c = this.p.ctl;
    this.mode = 'anim';
    if (this.gu) this.gu.out = true;
    c.setMode('balance');
    c.restTime = 0;
    this.calm = 0;
  }

  // hand over to physics, keeping the animation's motion (plus whatever impulse just landed)
  wake(reason = 'hit') {
    if (this.mode === 'physics') return;
    const p = this.p, sb = this.game.sb;
    this.mode = 'physics';
    this.calm = 0;
    this.blend = null;
    if (this.gu) { const l = this.player.layer(this.gu.name); if (l) { l.weight = 0; l.target = 0; } this.gu = null; }
    this.fl = null; this.flinchAmt = 0; this.stagger = 0;
    for (const b of this.bodies) { b.force.setZero(); b.torque.setZero(); }
    // resetState() on waking clears what the injury model just set: carry it over
    const c = p.ctl;
    const keep = { startle: c.startle, flinch: c.flinch ? { ...c.flinch } : null, twitches: c.twitches, fencing: c.fencing };
    sb.setDormant(p, false, { mode: 'balance' });
    c.startle = Math.max(c.startle || 0, keep.startle || 0);
    if (keep.flinch && c.flinch && keep.flinch.amount > c.flinch.amount) Object.assign(c.flinch, keep.flinch);
    if (keep.twitches) c.twitches = keep.twitches;
    if (keep.fencing) c.fencing = keep.fencing;
    c.heading = this.heading;
    if (c.sens) c.sens.comVel.set(this.vel.x, 0, this.vel.z);
    void reason;
  }

  // ---- per step ---------------------------------------------------------------------------------
  step(dt) {
    const ai = this.ai, c = this.p.ctl;
    if (this.mode === 'physics' && this.getupReq) {
      // the controller wants up (see the constructor): a motion-captured get-up if one fits here,
      // else let the engine's physical get-up have the next request
      this.getupReq = false;
      if (this.startGetUp()) return;
      this.noMocapT = this.game.time + 2;
    }
    if (this.mode === 'getup') {
      if (ai.downed || !c.alive || !c.conscious) { this.wake('down'); return; }
      this.vel.set(0, 0, 0);
      this.animate(dt);
      this.sync(dt);
      c.heading = this.heading;
      if (c.sens) c.sens.comVel.set(0, 0, 0);
      // on the feet a moment before the take ends: the rest fades out under the locomotion
      const gu = this.gu;
      if (!gu || gu.t >= gu.dur - 0.12) this.finishGetUp();
      return;
    }
    if (this.mode === 'physics') {
      // a body come to rest on the floor that the controller still counts as falling (a lolling
      // head, a slow slide) is down: the rest before getting up starts now
      if (c.mode === 'falling' && (c.modeTime || 0) > 0.8 && c.alive && c.conscious && this.pelvis.pos.y < 0.32 && c.sens && c.sens.comVel.length() < 0.5) c.setMode('ground');
      // the engine's own get-up from a fall caught on the knees goes over to the mocap too, when a
      // take passes close enough to that pose
      if (c.mode === 'getup' && (c.modeTime || 0) < 0.3 && this.game.time >= (this.noMocapT || 0) && this.canGetUp()) {
        if (this.startGetUp(1.2)) return;
        this.noMocapT = this.game.time + 2;
      }
      // back to animation once standing, conscious and left alone for a moment
      const v = c.sens ? Math.hypot(c.sens.comVel.x, c.sens.comVel.z) : 0;
      // (fighters gather themselves fast: a moment on their feet and they are back in the fight)
      const ok = !ai.downed && c.alive && c.conscious && c.mode === 'balance' && (c.modeTime || 0) > 0.25 && v < 2.2 && !(c.flail > 0.2) && !(c.startle > 0.45);
      this.calm = ok ? this.calm + dt : 0;
      if (this.calm > (this.melee ? 0.3 : 0.45)) this.enter(0.28);
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

  // if the root ended up too close to a wall or prop (a stagger, a shove), step out along the way
  // with the most room, so moves are possible again
  unstick() {
    const L = this.game.level;
    if (L.free(this.pos.x, this.pos.z, 0.22)) return;
    for (const r of [0.06, 0.12, 0.2, 0.3, 0.45])
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU, x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
        if (L.free(x, z, 0.22)) { this.pos.x = x; this.pos.z = z; return; }
      }
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
    // a round ridden out on the feet costs a stride or two
    if (this.stagger > 0) { this.stagger -= dt; want *= 0.4; }
    // a claw swipe lunges in
    const atk = this.melee && this.melee.attack, tg = this.melee && this.melee.target;
    if (atk && tg && atk.t < (this.melee.def.windup + this.melee.def.strike)) {
      const lx = tg.pos.x - this.pos.x, lz = tg.pos.z - this.pos.z, ld = Math.hypot(lx, lz);
      if (ld > 0.8) { dx = lx / ld; dz = lz / ld; want = Math.max(want, 1.4); } // only to close the gap
    }
    // accelerate towards the wanted velocity
    const tvx = dx * want, tvz = dz * want;
    const k = 1 - Math.exp(-dt * (want > 0 ? (this.melee ? 7.5 : 5) : 7)); // the hollowed burst off the mark
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.z += (tvz - this.vel.z) * k;
    // separation from other people
    for (const o of this.game.sb.people) {
      if (o === this.p) continue;
      const q = o.rd.pelvis.pos, sx = this.pos.x - q.x, sz = this.pos.z - q.z, d = Math.hypot(sx, sz);
      if (d < 0.62 && d > 1e-3) { const push = (0.62 - d) * 3; this.vel.x += (sx / d) * push * dt * 8; this.vel.z += (sz / d) * push * dt * 8; }
    }
    const P = this.game.player;
    {
      // the player shoulders past: give way, but never into a wall
      const sx = this.pos.x - P.pos.x, sz = this.pos.z - P.pos.z, d = Math.hypot(sx, sz);
      if (d < 0.6 && d > 1e-3) {
        const px = this.pos.x + (sx / d) * (0.6 - d), pz = this.pos.z + (sz / d) * (0.6 - d);
        if (L.free(px, pz, 0.22)) { this.pos.x = px; this.pos.z = pz; }
      }
    }
    this.unstick();
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
    const turnRate = speed > 0.3 ? 5 : Math.abs(err) > 0.35 ? 4.5 : 1.2;
    this.heading = wrapAngle(this.heading + clamp(err, -turnRate * dt, turnRate * dt));
    this.turning = speed < 0.3 ? clamp(Math.abs(err) * 1.5, 0, 1) * (Math.abs(err) > 0.25 ? 1 : 0) : 0;
    // twist the spine towards the aim inside what the legs have not turned yet; a feedback term
    // turns the torso until the barrel the hands hold really points at the target
    const aimYawW = Math.atan2(ai.aimDir.x, ai.aimDir.z), aimPitch = Math.asin(clamp(ai.aimDir.y, -1, 1));
    const TW = 0.6; // most twist the ragdoll's lumbar + thoracic joints take; the feet turn the rest
    if (ai.aiming) {
      // learn only the steady offset between the clip's barrel and the aim: integrate while the
      // body is settled on the target (no wind-up during turns)
      const settled = Math.abs(wrapAngle(aimYawW - this.heading)) < 0.45 && Math.abs(this.twist) < TW * 0.95;
      const gy = Math.atan2(this.gunDir.x, this.gunDir.z), gp = Math.asin(clamp(this.gunDir.y, -1, 1));
      if (settled) {
        this.corrYaw = clamp(this.corrYaw + wrapAngle(aimYawW - gy) * dt * 7, -0.5, 0.5);
        this.corrPitch = clamp(this.corrPitch + (aimPitch - gp) * dt * 7, -0.8, 0.8);
      }
    } else { this.corrYaw *= Math.exp(-dt * 3); this.corrPitch *= Math.exp(-dt * 3); }
    const aimYaw = ai.aiming ? wrapAngle(aimYawW - this.heading) + this.corrYaw : 0;
    const pitchT = ai.aiming ? this.corrPitch : 0;
    this.twist += (clamp(aimYaw, -TW, TW) - this.twist) * (1 - Math.exp(-dt * 10));
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
    // a get-up in progress: its clip over everything, fading out under the locomotion at the end
    const gu = this.gu;
    let gw = 0;
    if (gu) {
      // the hollowed come up in jerks: quick stretches and near stops
      if (this.melee) {
        gu.jerkT -= dt;
        if (gu.jerkT <= 0) { gu.jerkT = 0.07 + Math.random() * 0.2; gu.jerk = Math.random() < 0.28 ? 0.3 + Math.random() * 0.3 : 1.05 + Math.random() * 0.6; }
      }
      gu.t = Math.min(gu.dur, gu.t + dt * gu.rate * gu.jerk);
      if (gu.out) gu.w = Math.max(0, gu.w - dt / 0.3);
      gw = gu.w * gu.w * (3 - 2 * gu.w);
      const l = pl.layer(gu.name);
      if (l) { l.time = gu.t; l.weight = l.target = Math.max(1e-4, gw); }
      if (gu.out && gu.w <= 0) { if (l) { l.weight = 0; l.target = 0; } this.gu = null; }
    }
    this.guW = gw;
    this.runW = (w.run_f + w.run_b + w.run_l + w.run_r) * (1 - gw);
    for (const n of LOCO_CLIPS) {
      const l = pl.layer(n);
      if (!l) continue;
      // a hair above zero keeps idle layers alive in the player (it drops weightless ones)
      l.weight = l.target = Math.max(1e-4, (w[n] || 0) * (1 - gw));
      l.time = n === 'idle' ? (l.time + dt) % l.clip.duration : this.phase * l.clip.duration;
    }
    pl.update(0);
    this.placeRoot();
    for (const f of this.fingers) f.bone.quaternion.copy(f.rest);
    // pistol holders: free arms from the natural walk, in step with the legs (under a get-up's arms)
    if (this.armPlayer) {
      const ap = this.armPlayer;
      if (gw > 0) this.armBones.forEach((b, i) => this.armSave[i].copy(b.quaternion));
      for (const n of LOCO_CLIPS) {
        const l = ap.layer(n);
        if (!l) continue;
        l.weight = l.target = Math.max(1e-4, w[n] || 0);
        l.time = n === 'idle' ? (l.time + dt) % l.clip.duration : this.phase * l.clip.duration;
      }
      ap.update(0);
      if (gw > 0) this.armBones.forEach((b, i) => b.quaternion.slerp(this.armSave[i], gw));
    }
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
      this.applyOverlay(name, o, 1 - gw);
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
    // a flinch from a round ridden out (see flinch()): fast in, a third of a second out
    let fP = 0, fR = 0, fY = 0, fH = 0;
    if (this.fl) {
      const f = this.fl;
      f.t += dt;
      const env = f.amp * Math.min(1, f.t / 0.035) * Math.exp(-Math.max(0, f.t - 0.035) / 0.13);
      fP = f.pitch * env; fR = f.roll * env; fY = f.yaw * env; fH = f.head * env;
      this.flinchAmt = env;
      if (f.t > 0.7) { this.fl = null; this.flinchAmt = 0; }
    }
    const share = [0.25, 0.35, 0.4]; // lumbar takes the least (its limit is about 0.2 rad)
    this.spine.forEach((b, i) => this.rotateWorld(b, fR * (share[i] ?? 1 / n), (this.twist + fY) * (share[i] ?? 1 / n), -this.pitch * 0.6 / n - this.kick * 0.03 + lean / n + fP * (share[i] ?? 1 / n)));
    if (this.neck) this.rotateWorld(this.neck, tR * 0.4 + fR * 0.3, tY * 0.5 + fH * 0.4, -this.pitch * 0.25 - lean * 0.45 - fP * 0.25);
    if (this.head) this.rotateWorld(this.head, tR + fR * 0.3, tY + fH, -this.pitch * 0.15 + this.kick * 0.02 - lean * 0.35 - fP * 0.3);
    // long guns: running without the aim, the muzzle drops to a low ready (both arms swing down a
    // little about the shoulders, so the gun line between the hands tips down with them)
    if (!this.pistol && !this.melee) {
      const lowT = !ai.aiming && !reloading ? clamp(this.runW * 1.25, 0, 1) : 0;
      this.lowW = (this.lowW || 0) + (lowT - (this.lowW || 0)) * (1 - Math.exp(-dt * 6));
      const a = this.lowW * 0.3 * (1 - gw);
      if (a > 0.004) for (const b of this.upperArms || (this.upperArms = ['Bip01_R_UpperArm', 'Bip01_L_UpperArm'].map((nm) => this.bones.get(nm)).filter(Boolean))) this.rotateWorld(b, 0, 0, a);
    }
    // pistol carry: one-handed, low at a walk and tucked in at a run, until the aim comes up
    this.carryW += ((this.armPlayer && !ai.aiming && !reloading ? 1 : 0) - this.carryW) * (1 - Math.exp(-dt * 9));
    this.carryEff = this.carryW * (1 - gw);
    if (this.carryEff > 0.01) this.solveCarry(this.carryEff, dt);
    // pistol stance: both arms reach to a grip on the aim line in front of the chest
    this.ikW = (this.ikW || 0) + ((this.pistol && ai.aiming && !reloading && !gu ? 1 : 0) - (this.ikW || 0)) * (1 - Math.exp(-dt * 10));
    if (this.ikW > 0.01) this.solveArms(this.ikW);
    if (this.melee && gw < 0.5) this.solveSwipe(dt);
  }

  // the one-handed pistol carry: the gun hand low in front of the right hip at a walk, a little
  // higher and tucked in at a run, keeping some of the free arm's swing; muzzle down and forward.
  // Sets the hand round the grip and this.carryQ, the gun's orientation (see sync)
  solveCarry(w, dt) {
    const B = this.bones;
    const uR = B.get('Bip01_R_UpperArm'), fR = B.get('Bip01_R_Forearm'), hR = B.get('Bip01_R_Hand');
    if (!uR || !fR || !hR) return;
    this.holder.updateMatrixWorld(true);
    const S = new T3.Vector3().setFromMatrixPosition(uR.matrixWorld), E = new T3.Vector3().setFromMatrixPosition(fR.matrixWorld), Hn = new T3.Vector3().setFromMatrixPosition(hR.matrixWorld);
    const L = S.distanceTo(E) + E.distanceTo(Hn);
    const h = this.heading, fwd = new T3.Vector3(Math.sin(h), 0, Math.cos(h)), right = new T3.Vector3(-Math.cos(h), 0, Math.sin(h)), up = new T3.Vector3(0, 1, 0);
    // the free arm's swing: how far ahead of its running mean the hand is
    const sw = Hn.sub(S).dot(fwd) / L;
    this.swingAvg = this.swingAvg === undefined ? sw : this.swingAvg + (sw - this.swingAvg) * (1 - Math.exp(-dt * 1.5));
    const swing = clamp(sw - this.swingAvg, -0.5, 0.5);
    const run = clamp(this.runW, 0, 1);
    // (the hand stays on its own side rather than across the belly)
    const target = S.clone()
      .addScaledVector(up, (-lerp(0.82, 0.62, run) + swing * 0.12) * L)
      .addScaledVector(fwd, (lerp(0.3, 0.36, run) + swing * lerp(0.35, 0.25, run)) * L)
      .addScaledVector(right, -lerp(0.0, 0.07, run) * L);
    // elbow down and back, close to the ribs
    this.reach(uR, fR, hR, target, 1, w, fwd, right, up.clone().negate().addScaledVector(right, 0.35).addScaledVector(fwd, -0.55));
    // the gun: forward and down, rocking with the swing
    const pitch = lerp(1.1, 0.92, run) - swing * 0.45;
    const F = fwd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, -Math.sin(pitch)).addScaledVector(right, -0.04).normalize();
    const U = up.clone().addScaledVector(right, 0.2);
    U.addScaledVector(F, -F.dot(U)).normalize();
    const X = new T3.Vector3().crossVectors(F, U);
    (this.carryQ || (this.carryQ = new T3.Quaternion())).setFromRotationMatrix(_m4.makeBasis(X, U, F.clone().negate()));
    // the hand round the grip: fingers (hand x) along the barrel, thumb (hand z) up the backstrap
    const hx = F.clone().applyAxisAngle(X, -0.15);
    const hz = U.clone().addScaledVector(hx, -U.dot(hx)).normalize();
    const hy = new T3.Vector3().crossVectors(hz, hx);
    const hq = new T3.Quaternion().setFromRotationMatrix(_m4.makeBasis(hx, hy, hz));
    const pw = hR.parent.getWorldQuaternion(new T3.Quaternion());
    hR.quaternion.slerp(pw.invert().multiply(hq), w);
    hR.updateMatrixWorld(true);
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

  // two-bone reach for one arm (elbow out and down, or towards poleHint)
  reach(u, f, h, target, sideSign, w, fwd, right, poleHint = null) {
    const P = (b) => new T3.Vector3().setFromMatrixPosition(b.matrixWorld);
    const a = P(u).distanceTo(P(f)), b = P(f).distanceTo(P(h));
    const S0 = P(u), toT = target.clone().sub(S0);
    const c = clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    toT.normalize();
    const hint = poleHint ? poleHint.clone() : new T3.Vector3(0, -1, 0).addScaledVector(right, 0.8).addScaledVector(fwd, -0.2);
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
  applyOverlay(name, o, k = 1) {
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
      obj.quaternion.slerp(_q, o.w * k);
    }
  }

  // rotate a bone about the character's own axes (yaw about up, pitch about right), in world terms
  rotateWorld(bone, roll, yaw, pitch) {
    const parent = bone.parent;
    parent.getWorldQuaternion(_q2); // refreshes the chain above, including earlier edits
    const right = _v3.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const delta = _q.setFromAxisAngle(_v3b.set(0, 1, 0), yaw);
    delta.multiply(_qA.setFromAxisAngle(right, pitch));
    if (roll) delta.multiply(_qA.setFromAxisAngle(_axis.set(Math.sin(this.heading), 0, Math.cos(this.heading)), roll));
    // local' = parentW^-1 * delta * parentW * local
    const inv = _qB.copy(_q2).invert();
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
        _q2.set(q.x, q.y, q.z, q.w).multiply(_qInv.copy(pr.q).invert());
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
      this.gunQ.setFromEuler(_eul.set(Math.asin(clamp(this.gunDir.y, -1, 1)), Math.atan2(this.gunDir.x, this.gunDir.z) + Math.PI, 0, 'YXZ'));
      // a pistol carried one-handed points where the carry holds it (solveCarry)
      if (this.carryEff > 0.01 && this.carryQ) {
        this.gunQ.slerp(this.carryQ, this.carryEff);
        this.gunDir.set(0, 0, -1).applyQuaternion(this.gunQ);
      }
      (this.relQ || (this.relQ = new T3.Quaternion())).copy(handQ).invert().multiply(this.gunQ); // ready for a reload
    }
    // getting up: the gun stays as the hand held it when the get-up began
    if (this.guW > 0 && this.guGunRel) this.gunQ.slerp(_qA.copy(handQ).multiply(this.guGunRel), this.guW);
    void bw;
  }

  // muzzle climb on the upper body
  onFire() { this.kick = Math.min(1.5, this.kick + 1); }

  // a round the body rides out on its feet (the manager decides which): the torso snaps away from
  // the shot and twists about the hit, the head whips, the root is shoved half a step and the
  // stride falters; all of it gone in about a third of a second
  flinch(e) {
    if (this.mode !== 'anim') return;
    const d = e.dir || { x: 0, z: 1 }, dh = Math.hypot(d.x, d.z) || 1, dx = d.x / dh, dz = d.z / dh;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const df = dx * sh + dz * ch;  // along the facing: negative when the round came from the front
    const ds = dx * ch - dz * sh;  // across, towards the rotateWorld 'right' axis
    const en = e.energy || 300;
    const amp = clamp(0.35 + en / 1000, 0.35, 0.95) * (this.melee ? 0.8 : 1) * (e.type === 'armorHit' ? 0.7 : 1);
    let yaw = 0;
    const chest = this.rd.segments.chest && this.rd.segments.chest.body.pos, at = e.entry || e.point;
    if (chest && at) { const ox = at.x - chest.x, oz = at.z - chest.z; yaw = clamp((oz * dx - ox * dz) * 7, -0.7, 0.7); }
    const seg = e.seg ? e.seg.name : 'chest';
    const gut = /^(abdomen|pelvis)$/.test(seg);
    this.fl = { t: 0, amp, pitch: df * 0.6 + (gut ? 0.45 : 0), roll: -ds * 0.5, yaw, head: (Math.random() - 0.5) * 0.6 - yaw * 0.4 };
    const push = clamp(en / 700, 0.25, 1.2) * (this.melee ? 0.6 : 0.85);
    this.vel.x += dx * push; this.vel.z += dz * push;
    this.stagger = Math.max(this.stagger || 0, this.melee ? 0.22 : 0.4);
  }
}
