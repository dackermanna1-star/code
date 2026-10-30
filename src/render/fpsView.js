import * as THREE from 'three';

/**
 * First-person hands and gun, drawn in their own pass over the scene (so the gun never pokes into
 * a wall). The right hand holds the firing grip (the weapon models have their origin there), the
 * left the handguard / pump / the other hand on a pistol; the forearms run back out of view.
 *
 * Poses (in the view camera's space, which looks down -z): from the hip, aimed (the weapon's sight
 * line on the eye's axis), sprinting (lowered and canted), reloading (tipped over, the left hand
 * going to the magazine well), switching (dropped out of view). On top: sway against the mouse,
 * bob with the walk cycle, a landing dip, breathing, and the recoil spring.
 */
const GRIP = {
  // hip: grip position; ads: grip position with the sight on the axis; support: left hand on the
  // weapon (model space); sight: sight-line height above the grip; elbow offsets per hand
  pistol: { hip: [0.15, -0.165, -0.36], ads: [0, -0.083, -0.4], support: [-0.012, -0.03, 0.012], twoHand: true, roll: 0 },
  rifle: { hip: [0.17, -0.16, -0.27], ads: [0, -0.143, -0.17], support: [0, 0.06, -0.29] },
  shotgun: { hip: [0.17, -0.15, -0.26], ads: [0, -0.052, -0.2], support: [0, 0.005, -0.34], pump: true },
  smg: { hip: [0.16, -0.16, -0.28], ads: [0, -0.118, -0.2], support: [0, 0.065, -0.2] },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function gloveMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.78, metalness: 0.02 });
}
function sleeveMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x3a4032, roughness: 0.9, metalness: 0 });
}

/**
 * A gloved hand closed round a grip. Local frame: the grip axis along y (index finger at +y), the
 * gun's forward -z; the back of the hand on the outside (+x for the right hand, -x for the left),
 * the fingers wrapping round the front of the grip to the far side, the thumb along that side.
 */
function makeHand(side, glove) {
  const g = new THREE.Group();
  const s = side === 'L' ? -1 : 1;
  const P = (x, y, z) => new THREE.Vector3(s * x, y, z);
  const blob = (rx, ry, rz, x, y, z, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glove);
    m.scale.set(rx, ry, rz);
    m.position.copy(P(x, y, z));
    m.rotation.x = rotX;
    g.add(m);
    return m;
  };
  const tube = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, r, 7, false), glove);
    g.add(m);
    // rounded tip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), glove);
    tip.position.copy(pts[pts.length - 1]);
    g.add(tip);
    return m;
  };
  // back of the hand and the heel of the palm behind the grip
  blob(0.017, 0.046, 0.044, 0.023, -0.004, 0.012, 0.15);
  blob(0.022, 0.03, 0.022, 0.006, -0.03, 0.03);
  // web between thumb and index, high on the back strap
  blob(0.016, 0.014, 0.02, 0.004, 0.034, 0.028);
  // four fingers round the front of the grip (index highest, little finger thinnest)
  [0.019, 0.0, -0.019, -0.036].forEach((y, k) => {
    const r = k === 3 ? 0.0083 : 0.0097;
    tube([P(0.026, y, -0.004), P(0.024, y, -0.028), P(0.006, y - 0.002, -0.04), P(-0.014, y - 0.004, -0.032), P(-0.02, y - 0.004, -0.018)], r);
  });
  // thumb along the far side of the frame, pointing forward
  tube([P(0.004, 0.028, 0.026), P(-0.016, 0.034, 0.008), P(-0.022, 0.04, -0.016), P(-0.02, 0.044, -0.036)], 0.0095);
  // wrist and cuff, running back from the heel of the hand
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.06, 14), glove);
  cuff.rotation.x = Math.PI / 2 - 0.35;
  cuff.position.copy(P(0.016, -0.03, 0.07));
  g.add(cuff);
  return g;
}

function makeForearm(sleeve) {
  // unit length along +z (scaled per frame between the wrist and the elbow)
  const geo = new THREE.CylinderGeometry(0.031, 0.041, 1, 14, 1, true);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const m = new THREE.Mesh(geo, sleeve);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 8), sleeve);
  m.add(cap);
  m.userData.cap = cap;
  return m;
}

class Spring {
  constructor(k, c) {
    this.k = k;
    this.c = c;
    this.x = 0;
    this.v = 0;
  }
  step(dt, target = 0) {
    this.v += (-this.k * (this.x - target) - this.c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class FpsView {
  constructor(factory, aspect) {
    this.factory = factory;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfe6ff, 0x302820, 1.1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff2dd, 1.6);
    this.key.position.set(0.4, 1, 0.3);
    this.scene.add(this.key);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group(); // pose (sway, bob, kick) applied here
    this.scene.add(this.root);
    this.glove = gloveMaterial();
    this.sleeve = sleeveMaterial();
    this.handR = makeHand('R', this.glove);
    this.handL = makeHand('L', this.glove);
    this.armR = makeForearm(this.sleeve);
    this.armL = makeForearm(this.sleeve);
    this.scene.add(this.armR, this.armL);
    this.models = {};
    this.current = null;
    this.type = null;
    this.kickZ = new Spring(220, 22);
    this.kickP = new Spring(170, 16);
    this.kickY = new Spring(140, 15);
    this.swayX = new Spring(60, 12);
    this.swayY = new Spring(60, 12);
    this.dip = new Spring(90, 11);
    this.flash = null;
    this.flashT = 0;
    this.casings = [];
    this.action = 0;
    this.t = 0;
    this.visible = true;
    this.pose = { ads: 0, sprint: 0, reload: 0, swap: 0 };
  }

  setEnvironment(env) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.5;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** Light level of the scene around the player (0..1.5) so the hands are not lit like daylight. */
  setLighting(level, tint = 0xffffff) {
    this.hemi.intensity = 0.35 + 0.8 * level;
    this.key.intensity = 0.4 + 1.2 * level;
    this.key.color.set(tint);
  }

  setWeapon(type) {
    if (this.type === type) return;
    if (this.current) this.root.remove(this.current);
    this.type = type;
    if (!this.models[type]) {
      const m = this.factory.createWeaponModel(type);
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      this.models[type] = m;
    }
    this.current = this.models[type];
    this.root.add(this.current);
    // hands ride on the weapon
    this.current.add(this.handR);
    this.current.add(this.handL);
    const G = GRIP[type] || GRIP.rifle;
    this.handR.position.set(0, 0, 0);
    this.handR.rotation.set(0.28, 0, 0);
    this.handL.position.set(...G.support);
    if (G.twoHand) this.handL.rotation.set(0.28, 0, 0.25);
    else {
      // along the handguard (index finger forward), palm against its left side and the fingers
      // curled under it, rolled a little under
      // (hand axes in the gun's frame: back of the hand down, index forward, wrist to the left -
      // then rolled so the palm is on the lower left of the handguard)
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));
      this.handL.quaternion.setFromRotationMatrix(m);
      this.handL.quaternion.premultiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.45));
    }
    this.handL.userData.base = this.handL.position.clone();
    if (!this.flash && typeof this.factory.createMuzzleFlashMesh === 'function') {
      this.flash = this.factory.createMuzzleFlashMesh();
      this.flash.visible = false;
    }
    const muzzle = this.current.getObjectByName('muzzle');
    if (this.flash && muzzle) muzzle.add(this.flash);
    this.parts = null;
  }

  fire(recoil = 1, ads = 0) {
    this.action = 1;
    const k = 1 - 0.45 * ads;
    this.kickZ.v += 1.5 * recoil * k;
    this.kickP.v += 9 * recoil * k;
    this.kickY.v += (Math.random() - 0.5) * 3 * recoil * k;
    if (this.flash) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flash.scale.setScalar((0.7 + Math.random() * 0.6) * (0.8 + 0.4 * recoil));
      this.flashT = 0.045;
      const mz = this.current && this.current.getObjectByName('muzzle');
      if (mz) {
        mz.getWorldPosition(this.flashLight.position);
        this.flashLight.intensity = 4;
      }
    }
    const ej = this.current && this.current.getObjectByName('ejector');
    if (ej && typeof this.factory.createCasingMesh === 'function' && this.type !== 'shotgun') this.eject(ej);
  }

  eject(ej) {
    const c = this.factory.createCasingMesh(this.type);
    ej.getWorldPosition(c.position);
    this.current.getWorldQuaternion(c.quaternion);
    this.scene.add(c);
    const v = new THREE.Vector3(1.3 + Math.random() * 0.6, 1.5 + Math.random() * 0.5, 0.4 * (Math.random() - 0.5));
    this.casings.push({ m: c, v, w: new THREE.Vector3(20 * Math.random(), 30, 10 * Math.random()), t: 0 });
  }

  /** The pump of a shotgun / a shell case on a pump stroke. */
  pump() {
    this.pumpT = 0.0001;
    const ej = this.current && this.current.getObjectByName('ejector');
    if (ej && this.type === 'shotgun' && typeof this.factory.createCasingMesh === 'function') this.eject(ej);
  }

  /** Muzzle in view-camera space (tracers start there, mapped into the world by the caller). */
  muzzleCameraSpace(out) {
    const mz = this.current && this.current.getObjectByName('muzzle');
    if (!mz) return out.set(0.15, -0.12, -0.5);
    this.root.updateMatrixWorld(true);
    return mz.getWorldPosition(out);
  }

  /**
   * Per frame. s: { ads, sprint (0..1), speed, step (walk cycle), onGround, crouch, look: {dx, dy},
   * landed, state ('idle'|'reload'|'equip'|'holster'|'pump'), stateT, reloadTime, perShell, empty }
   */
  update(dt, s) {
    if (!this.current) return;
    this.t += dt;
    const G = GRIP[this.type] || GRIP.rifle;
    const P = this.pose;
    const ease = (cur, tgt, r) => cur + (tgt - cur) * Math.min(1, dt * r);
    P.ads = s.ads;
    P.sprint = ease(P.sprint, s.sprint ? 1 : 0, 8);
    const reloading = s.state === 'reload' ? 1 : 0;
    P.reload = ease(P.reload, reloading, 10);
    const swap = s.state === 'holster' ? Math.min(1, s.stateT / 0.28) : s.state === 'equip' ? Math.max(0, 1 - s.stateT / 0.42) : 0;
    P.swap = swap;
    const a = P.ads, still = 1 - 0.8 * a;

    // sway: the gun lags behind the view's turn
    const sx = this.swayX.step(dt, clamp(-s.look.dx * 2.2, -0.06, 0.06));
    const sy = this.swayY.step(dt, clamp(s.look.dy * 2.2, -0.05, 0.05));
    // bob with the walk cycle (a figure of eight), stronger sprinting
    const ph = s.step * Math.PI * 2;
    const move = Math.min(1, s.speed / 3.3) * (s.onGround ? 1 : 0.2);
    const bobA = (0.008 + 0.014 * P.sprint) * move * still;
    const bx = Math.sin(ph) * bobA, by = -Math.abs(Math.cos(ph)) * bobA * 1.2;
    const breathe = Math.sin(this.t * 1.6) * 0.0018 * still;
    if (s.landed) this.dip.v -= Math.min(0.6, s.landed * 0.08);
    const dip = this.dip.step(dt);
    const kz = this.kickZ.step(dt), kp = this.kickP.step(dt), ky = this.kickY.step(dt);

    // base pose: hip -> aimed
    const hip = G.hip, ads = G.ads;
    let x = hip[0] + (ads[0] - hip[0]) * a, y = hip[1] + (ads[1] - hip[1]) * a, z = hip[2] + (ads[2] - hip[2]) * a;
    let pitch = 0, yaw = 0, roll = 0;
    // sprint: down and canted across the body
    x -= 0.05 * P.sprint;
    y -= 0.06 * P.sprint;
    z += 0.04 * P.sprint;
    yaw += 0.75 * P.sprint;
    roll += 0.35 * P.sprint;
    pitch -= 0.15 * P.sprint;
    // reload: tipped over to show the magazine well, a little lower
    const rl = P.reload;
    const wob = reloading ? Math.sin(Math.min(1, s.stateT / Math.max(0.2, s.reloadTime)) * Math.PI) : 0;
    y -= 0.04 * rl;
    roll -= (G.twoHand ? 0.35 : 0.55) * rl;
    pitch += 0.18 * rl + 0.05 * wob;
    // switching: dropped out of view, turned down
    y -= 0.32 * swap;
    pitch -= 1.0 * swap;
    // sway, bob, kick
    x += sx * still + bx;
    y += sy * still + by + breathe + dip;
    z += Math.max(kz, -0.01) * 0.055;
    pitch += kp * 0.06 + sy * 0.6 * still;
    yaw += ky * 0.03 + sx * 0.8 * still;
    this.root.position.set(x, y, z);
    _e.set(pitch, yaw, roll, 'YXZ');
    this.root.quaternion.setFromEuler(_e);

    // left hand during a reload: off the gun to the magazine (or the shell port) and back
    const base = this.handL.userData.base;
    if (base) {
      this.handL.position.copy(base);
      if (reloading) {
        const u = clamp(s.stateT / Math.max(0.25, s.reloadTime), 0, 1);
        const away = s.perShell ? Math.sin(u * Math.PI) : u < 0.5 ? Math.sin(u * Math.PI) : Math.sin(u * Math.PI) * 0.9;
        this.handL.position.y -= 0.12 * away;
        this.handL.position.z += (s.perShell ? 0.12 : 0.08) * away;
        this.handL.position.x -= 0.04 * away;
      }
      if (G.pump && this.pumpT !== undefined) {
        this.pumpT += dt;
        const u = this.pumpT / 0.32;
        const stroke = u < 0.45 ? u / 0.45 : Math.max(0, 1 - (u - 0.45) / 0.55);
        this.handL.position.z += 0.085 * stroke;
        if (this.parts && this.parts.pump) this.parts.pump.o.position.z = this.parts.pump.pos.z + 0.085 * stroke;
        if (u > 1) this.pumpT = undefined;
      }
    }

    this.animateAction(dt);
    this.updateArms();
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.flash) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const cs = this.casings[i];
      cs.t += dt;
      cs.v.y -= 9.81 * dt;
      cs.m.position.addScaledVector(cs.v, dt);
      cs.m.rotation.x += cs.w.x * dt;
      cs.m.rotation.y += cs.w.y * dt;
      if (cs.t > 0.7) {
        this.scene.remove(cs.m);
        this.casings.splice(i, 1);
      }
    }
  }

  /** Forearms from each wrist back and down to an elbow out of view. */
  updateArms() {
    this.root.updateMatrixWorld(true);
    const set = (arm, hand, ex, ey, ez) => {
      hand.getWorldPosition(_v);
      // the wrist is just behind the hand along the forearm
      _v2.set(_v.x + ex, _v.y + ey, _v.z + ez);
      const len = _v.distanceTo(_v2);
      arm.position.copy(_v);
      arm.lookAt(_v2);
      arm.scale.set(1, 1, len);
      arm.userData.cap.scale.set(1, 1, 1 / Math.max(len, 1e-3));
    };
    const sp = this.pose.sprint;
    // (elbows below the bottom of the view, still in front of the eye)
    set(this.armR, this.handR, 0.07 - 0.04 * sp, -0.3, 0.2);
    set(this.armL, this.handL, -0.13 + 0.06 * sp, -0.28, 0.22);
  }

  animateAction(dt) {
    const m = this.current;
    if (!this.parts) {
      this.parts = {};
      for (const n of ['slide', 'pump', 'cylinder', 'bolt']) {
        const o = m.getObjectByName(n);
        if (o) this.parts[n] = { o, pos: o.position.clone(), rot: o.rotation.clone() };
      }
    }
    const P = this.parts;
    const a = this.action || 0;
    const t = 1 - a;
    const stroke = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.75);
    const speed = { pistol: 9, smg: 14, rifle: 12, shotgun: 6, sniper: 1.6, revolver: 6 }[this.type] || 6;
    this.action = Math.max(0, a - dt * speed);
    if (P.slide) P.slide.o.position.z = P.slide.pos.z + 0.028 * (a > 0 ? stroke : 0);
    if (P.bolt) P.bolt.o.rotation.z = P.bolt.rot.z + 1.2 * (a > 0 ? Math.min(1, stroke * 1.5) : 0);
  }

  render(renderer) {
    if (!this.visible || !this.current) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

export { GRIP };
