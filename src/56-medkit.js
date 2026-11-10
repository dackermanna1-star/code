// Medkits: carried auto-injectors (bought in the shop, sometimes found on the dead) used with H.
// The weapon goes down, a gloved hand brings the injector up, the thumb flicks the safety cap off
// and the hand jabs it into the thigh below the view. The jab is the point of no return: before it,
// firing or switching weapons calls the medkit off and the kit is kept; after it the kit is spent
// and health comes back over a few seconds. While the kit is in hand the player walks (no sprint).
const MEDKIT = {
  dur: 1.75, inject: 0.92, // seconds: whole action, and the moment of the jab
  heal: 60, over: 3.2,     // HP restored, over this many seconds
  price: 300,
};

class Medkits {
  constructor(game) {
    this.game = game;
    this.hot = null;      // heal over time: { left, rate }
    this.anim = null;     // { t, cancel, capT }
    this.kit = null;      // the viewmodel hand + injector (built on first use)
    this.flash = 0;
    game.hooks.push(this);
  }

  // a new run brings a new Arsenal: drop whatever was left from the last one. Going down a level
  // keeps a heal that is still working and the kit in hand (the viewmodel scene outlives the level)
  onLevel() {
    if (this.runArsenal === this.game.arsenal) return;
    this.runArsenal = this.game.arsenal;
    this.hot = null; this.queued = 0; this.stop();
  }

  // dying with the kit in hand before the jab calls it off: no injection on the death cam
  onDied() {
    const a = this.game.arsenal;
    if (a.state === 'heal' && !a.injected) a.endHeal('healCancel');
    this.hot = null; this.queued = 0;
  }

  // the H key (via BackroomsGame.useMedkit)
  useMedkit() {
    const g = this.game, a = g.arsenal, P = g.player;
    if (!P.alive || g.state !== 'play' || g.shopOpen) return true;
    if (a.state === 'heal') return true;
    if (a.medkits <= 0) { g.hud.toast('NO MEDKITS'); return true; }
    if (P.health >= P.maxHealth - 0.5) { g.hud.toast('HEALTH FULL'); return true; }
    // mid-pump, mid-switch or mid-throw: hold the press for a moment and start once the hands are free
    if (!a.useMedkit(MEDKIT.dur, MEDKIT.inject)) this.queued = 0.6;
    return true;
  }

  onArsenalEvent(e) {
    const g = this.game;
    switch (e.type) {
      case 'healStart':
        this.ensureKit();
        this.useHands();
        this.anim = { t: 0, cancel: -1, capOff: false, cap: { p: new T3.Vector3(), v: new T3.Vector3(), r: new T3.Vector3() } };
        this.kit.root.visible = true;
        this.kit.cap.visible = true;
        this.kit.cap.position.copy(this.kit.capRest);
        this.kit.cap.rotation.set(0, 0, 0);
        if (g.sfx) g.sfx.medkit('open');
        break;
      case 'healCancel':
        if (this.anim) this.anim.cancel = this.anim.t;
        break;
      case 'healInject': {
        const P = g.player;
        if (!P.alive) break;
        // a second kit while the first is still working adds to it
        const left = (this.hot ? this.hot.left : 0) + MEDKIT.heal;
        this.hot = { left, rate: Math.max(MEDKIT.heal / MEDKIT.over, left / MEDKIT.over) };
        this.flash = 1;
        g.shake = Math.max(g.shake || 0, 0.25);
        if (g.sfx) g.sfx.medkit('inject');
        if (g.stats) g.stats.medkits = (g.stats.medkits || 0) + 1;
        void P;
        break;
      }
      case 'healEnd':
        break;
    }
  }

  step(dt) {
    const g = this.game, P = g.player;
    if (this.queued > 0) {
      this.queued -= dt;
      if (g.arsenal.state === 'idle' || g.arsenal.state === 'reload' || g.arsenal.state === 'inspect') { this.queued = 0; this.useMedkit(); }
    }
    if (!this.hot) return;
    if (!P.alive) { this.hot = null; return; }
    const h = Math.min(this.hot.left, this.hot.rate * dt);
    P.heal(h);
    this.hot.left -= h;
    if (this.hot.left <= 1e-3 || P.health >= P.maxHealth) {
      this.hot = null;
      if (g.sfx) g.sfx.medkit('relief');
    }
  }

  get healing() { return !!this.hot; }

  frame(dt) {
    const g = this.game, e = g.hud && g.hud.e;
    if (!this.handsLoading && g.vm && g.state === 'play') this.loadHands();
    if (this.anim && this.hands && this.kit && this.kit.handsOn) {
      this.hands.rig.player.update(dt);
      if (this.hands.offArm) this.hands.offArm.scale.setScalar(0.001);
    }
    if (e && e.vitals) e.vitals.classList.toggle('healing', !!this.hot);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (g.hud && g.hud.healFlash) g.hud.healFlash(this.flash);
    if (!this.anim || !this.kit) return;
    const A = this.anim, K = this.kit, a = g.arsenal;
    // while the kit is in hand the hand runs on the Arsenal's clock (plus the part-step since the
    // last simulation step), so it holds still behind the pause menu or the shop and the jab on
    // screen is the jab that spends the kit; a called-off drop-out just plays out
    const t0 = A.t;
    A.t = a.state === 'heal' && A.cancel < 0 ? Math.max(A.t, a.t + g.acc) : A.t + dt;
    const adt = A.t - t0;
    if (!g.player.alive || g.state !== 'play') { this.stop(); return; }
    // where the hand is: [x, y, z, pitch, yaw, roll] in camera space (camera looks down -z)
    const low = [0.17, -0.46, -0.34, -0.25, 0.2, -0.45];
    const up = [0.075, -0.125, -0.33, 0.05, 0.25, -0.08];
    const cock = [0.085, -0.095, -0.31, 0.25, 0.24, -0.05];
    const jab = [0.12, -0.6, -0.26, -0.55, 0.3, -0.25];
    const t = A.t, ease = (x) => x * x * (3 - 2 * x);
    let pose;
    if (A.cancel >= 0) {
      // called off: drop back out of view quickly from wherever it was
      const k = clamp((t - A.cancel) / 0.18, 0, 1);
      pose = lerpPose(A.from || up, low, ease(k));
      if (k >= 1) { this.stop(); return; }
    } else if (t < 0.32) pose = lerpPose(low, up, ease(t / 0.32));
    else if (t < 0.6) pose = up;
    else if (t < 0.76) pose = lerpPose(up, cock, ease((t - 0.6) / 0.16));
    else if (t < MEDKIT.inject) { const k = (t - 0.76) / (MEDKIT.inject - 0.76); pose = lerpPose(cock, jab, k * k); }
    else { pose = jab; if (t > MEDKIT.inject + 0.1) { this.stop(); return; } }
    if (A.cancel < 0) A.from = pose;
    // a little life in the hand
    const wob = Math.sin(t * 11) * 0.004 * (t < 0.6 ? 1 : 0);
    K.root.position.set(pose[0], pose[1] + wob, pose[2]);
    K.root.rotation.set(pose[3], pose[4], pose[5], 'YXZ');
    // the thumb pushes the safety cap off at ~0.42 s; it spins away and falls out of view
    const flick = clamp((t - 0.36) / 0.08, 0, 1);
    K.thumb.rotation.z = K.thumbRest - 0.5 * Math.sin(flick * Math.PI);
    if (!A.capOff && t > 0.42 && A.cancel < 0) {
      A.capOff = true;
      if (g.sfx) g.sfx.medkit('cap');
      // detach into camera space with a flick velocity
      K.cap.getWorldPosition(A.cap.p);
      K.root.remove(K.cap); K.vmScene.add(K.cap);
      K.cap.position.copy(A.cap.p);
      A.cap.v.set(0.35 + Math.random() * 0.2, 0.9 + Math.random() * 0.3, 0.15);
      A.cap.r.set(Math.random() * 18 - 9, Math.random() * 18 - 9, 14);
    }
    if (A.capOff && K.cap.visible) {
      A.cap.v.y -= 9.8 * adt;
      K.cap.position.addScaledVector(A.cap.v, adt);
      K.cap.rotation.x += A.cap.r.x * adt; K.cap.rotation.y += A.cap.r.y * adt; K.cap.rotation.z += A.cap.r.z * adt;
      if (K.cap.position.y < -0.7) K.cap.visible = false;
    }
  }

  // put the kit away and the cap back on the injector
  stop() {
    this.anim = null;
    const K = this.kit;
    if (!K) return;
    K.root.visible = false;
    if (K.cap.parent !== K.injector) { K.cap.removeFromParent(); K.injector.add(K.cap); }
    K.cap.position.copy(K.capRest); K.cap.rotation.set(0, 0, 0); K.cap.visible = true;
  }

  // the real gloved arms: a second copy of the pistol rig with everything but the arms hidden, its
  // grip put on the kit's pivot, holding the injector where the pistol grip was
  loadHands() {
    this.handsLoading = true;
    const g = this.game, vm = g.vm, def = typeof VM_RIGS !== 'undefined' && VM_RIGS.pistol;
    if (!vm || !def) return;
    Assets.bytes(def.asset)
      .then((buf) => new Promise((res, rej) => new Lab.GLTFLoader().parse(buf.slice(0), '', res, rej)))
      .then((gltf) => {
        const rig = vm.buildRig('pistol', def, gltf);
        for (const m of rig.meshes) if (!m.userData.arms) m.visible = false;
        // rig space -> camera space at the hip view (as the viewmodel composes it)
        const M = new T3.Matrix4().makeScale(1 / rig.S, 1 / rig.S, 1 / rig.S).multiply(rig.camHip.clone().invert());
        const root = rig.root;
        root.updateMatrixWorld(true);
        const P = (o) => new T3.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(M);
        const trig = root.getObjectByName('Trigger_060') || rig.gun;
        const tc = P(trig);
        const mz = rig.muzzleLocal.clone().applyMatrix4(rig.gun.matrixWorld).applyMatrix4(M);
        const rr = rig.rearLocal.clone().applyMatrix4(rig.gun.matrixWorld).applyMatrix4(M);
        const f = mz.sub(rr).normalize();
        const u = new T3.Vector3(0, 1, 0).addScaledVector(f, -f.y).normalize();
        // the grip: just behind and below the trigger, raked back about 18 degrees
        const grip = tc.clone().addScaledVector(f, -0.028).addScaledVector(u, -0.04);
        const down = u.clone().multiplyScalar(-Math.cos(0.31)).addScaledVector(f, -Math.sin(0.31)).normalize();
        // one hand, held like an injector: turn the arm about the grip so the fist stands upright
        // (thumb and cap up, the needle end out of the bottom of the fist) with the forearm running
        // down to the lower right corner of the view, instead of the pistol's forward-pointing grip
        const fa = root.getObjectByName('Forearm_R_010');
        const a0 = down.clone().negate();
        const b0 = (fa ? P(fa) : grip.clone().add(new T3.Vector3(0.1, -0.1, 0.25))).sub(grip).normalize();
        const a1 = new T3.Vector3(-0.08, 1, 0.12).normalize();
        const b1 = new T3.Vector3(0.55, -0.62, 0.55).normalize();
        const frame = (a, b) => { const bb = b.clone().addScaledVector(a, -a.dot(b)).normalize(); const c = new T3.Vector3().crossVectors(a, bb); return new T3.Matrix4().makeBasis(a, bb, c); };
        const Rm = frame(a1, b1).multiply(frame(a0, b0).invert());
        const holder = new T3.Group();
        holder.matrixAutoUpdate = false;
        holder.matrix.copy(Rm).multiply(new T3.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z)).multiply(M);
        root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
        holder.add(root);
        // the off arm is not needed: collapse it to the shoulder, out of view
        const offArm = root.getObjectByName('Arm_L_02') || root.getObjectByName('UpArm_L_03');
        this.hands = { rig, holder, up: a1.clone(), offArm };
        if (this.anim) this.useHands();
      })
      .catch((err) => console.warn('[medkit] hands', err));
  }

  // swap the primitive fist for the real arms once they are ready
  useHands() {
    const K = this.kit, H = this.hands;
    if (!K || !H || K.handsOn) return;
    K.handsOn = true;
    for (const o of K.fist) o.visible = false;
    K.root.add(H.holder);
    K.injector.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), H.up);
    H.rig.player.play(H.rig.def.clips.idle, { fade: 0 });
  }

  // a gloved right hand with a sleeve, gripping an auto-injector (needle end down, safety cap up),
  // built from primitives in the viewmodel scene
  ensureKit() {
    if (this.kit) return;
    const vm = this.game.vm;
    const glove = new T3.MeshStandardMaterial({ color: 0x17171a, roughness: 0.55, metalness: 0.05 });
    const sleeve = new T3.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.95 });
    const body = new T3.MeshStandardMaterial({ color: 0x9a9c8c, roughness: 0.45 });
    const label = new T3.MeshStandardMaterial({ color: 0xd7b028, roughness: 0.5 });
    const capM = new T3.MeshStandardMaterial({ color: 0x2c61c2, roughness: 0.4 });
    const tipM = new T3.MeshStandardMaterial({ color: 0xe0621c, roughness: 0.45 });
    const root = new T3.Group();
    root.visible = false;
    // the injector, vertical, centred on the grip
    const injector = new T3.Group();
    const R = 0.0118;
    const cyl = (r0, r1, h, m, y) => { const o = new T3.Mesh(new T3.CylinderGeometry(r0, r1, h, 18), m); o.position.y = y; injector.add(o); return o; };
    cyl(R, R, 0.15, body, 0);
    cyl(R * 1.012, R * 1.012, 0.05, label, -0.012);
    cyl(R * 0.92, R * 0.8, 0.026, tipM, -0.088);
    const cap = new T3.Group();
    const c1 = new T3.Mesh(new T3.CylinderGeometry(R * 1.05, R * 1.05, 0.028, 18), capM);
    const c2 = new T3.Mesh(new T3.CylinderGeometry(R * 0.6, R * 0.75, 0.01, 14), capM);
    c2.position.y = 0.019;
    cap.add(c1, c2);
    const capRest = new T3.Vector3(0, 0.089, 0);
    cap.position.copy(capRest);
    injector.add(cap);
    root.add(injector);
    // the fist: four curled fingers wrapped round the body, a palm behind, the thumb over the top
    // (thick and close enough to merge into one fist rather than read as separate rings)
    const fingerR = 0.0122, fist = [];
    for (let i = 0; i < 4; i++) {
      const f = new T3.Mesh(new T3.TorusGeometry(R + fingerR * 0.9, fingerR * (i === 3 ? 0.85 : 1), 8, 18, Math.PI * 1.3), glove);
      f.rotation.set(Math.PI / 2, 0, Math.PI * 0.85);
      f.position.y = 0.024 - i * 0.0205;
      root.add(f); fist.push(f);
    }
    const palm = new T3.Mesh(new T3.SphereGeometry(0.036, 14, 10), glove);
    palm.scale.set(0.8, 1.45, 0.75);
    palm.position.set(0.03, -0.012, 0.004);
    root.add(palm); fist.push(palm);
    const thumbPivot = new T3.Group();
    thumbPivot.position.set(0.008, 0.04, 0.012);
    const thumb = new T3.Mesh(new T3.SphereGeometry(0.0118, 10, 8), glove);
    thumb.scale.set(1, 2.2, 1);
    thumb.position.set(-0.008, 0.016, 0);
    thumb.rotation.z = 0.6;
    thumbPivot.add(thumb);
    thumbPivot.rotation.z = 0.35;
    root.add(thumbPivot); fist.push(thumbPivot);
    // wrist and sleeve run down, right and back towards the body, out of the corner of the view
    const wrist = new T3.Mesh(new T3.CylinderGeometry(0.027, 0.031, 0.08, 12), glove);
    wrist.position.set(0.03, -0.045, 0.03);
    wrist.rotation.set(-0.9, 0, 0.5);
    root.add(wrist); fist.push(wrist);
    const arm = new T3.Mesh(new T3.CylinderGeometry(0.037, 0.047, 0.32, 14), sleeve);
    arm.position.set(0.126, -0.154, 0.167);
    arm.rotation.set(-0.9, 0, 0.5);
    root.add(arm); fist.push(arm);
    vm.scene.add(root);
    this.kit = { root, injector, cap, capRest, thumb: thumbPivot, thumbRest: 0.35, vmScene: vm.scene, fist };
  }
}

function lerpPose(a, b, k) { return a.map((v, i) => v + (b[i] - v) * k); }
