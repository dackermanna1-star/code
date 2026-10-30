import * as THREE from 'three';

/**
 * First-person weapon view model drawn in its own pass over the scene. The gun aims along the
 * mouse ray, kicks back and up with each shot (spring-damper recovery), shows a muzzle flash and
 * ejects casings.
 */
export class ViewModel {
  constructor(factory, aspect) {
    this.factory = factory; // { createWeaponModel, createMuzzleFlashMesh, createCasingMesh }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xeef2ff, 0x404040, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(0.5, 1, 0.6);
    this.scene.add(key);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2, 2);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};
    this.current = null;
    this.type = null;
    this.kick = 0;
    this.kickV = 0;
    this.pitch = 0;
    this.pitchV = 0;
    this.flash = null;
    this.flashT = 0;
    this.casings = [];
    this.aim = new THREE.Vector3(0, 0, -1);
    this.sway = 0;
    this.visible = false;
  }

  setEnvironment(env) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.6;
  }

  setWeapon(type) {
    if (this.type === type) return;
    if (this.current) this.root.remove(this.current);
    this.type = type;
    if (!type || !this.factory) {
      this.current = null;
      this.visible = false;
      return;
    }
    if (!this.models[type]) {
      const m = typeof this.factory.createWeaponModel === 'function' ? this.factory.createWeaponModel(type) : fallbackGun(type);
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
    if (!this.flash && typeof this.factory.createMuzzleFlashMesh === 'function') {
      this.flash = this.factory.createMuzzleFlashMesh();
      this.flash.visible = false;
    }
    const muzzle = this.current.getObjectByName('muzzle');
    if (this.flash && muzzle) muzzle.add(this.flash);
    this.visible = true;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** Aim direction in camera space (unit). */
  setAim(dirCam) {
    this.aim.copy(dirCam);
  }

  fire(recoil = 1) {
    this.action = 1; // drives the slide / pump / cylinder / bolt animation
    this.kickV += 0.9 * recoil;
    this.pitchV += 7 * recoil;
    if (this.flash) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      const s = 0.7 + Math.random() * 0.6;
      this.flash.scale.setScalar(s * (0.8 + 0.4 * recoil));
      this.flashT = 0.04;
      const mz = this.current && this.current.getObjectByName('muzzle');
      if (mz) {
        mz.getWorldPosition(this.flashLight.position);
        this.flashLight.intensity = 3;
      }
    }
    // casing
    const ej = this.current && this.current.getObjectByName('ejector');
    if (ej && typeof this.factory.createCasingMesh === 'function' && this.type !== 'revolver') {
      const c = this.factory.createCasingMesh(this.type);
      ej.getWorldPosition(c.position);
      this.root.getWorldQuaternion(c.quaternion);
      this.scene.add(c);
      const v = new THREE.Vector3(1.2 + Math.random() * 0.6, 1.4 + Math.random() * 0.5, 0.3 * (Math.random() - 0.5));
      this.casings.push({ m: c, v, w: new THREE.Vector3(20 * Math.random(), 30, 10 * Math.random()), t: 0 });
    }
  }

  /** Muzzle position in camera space (for tracers drawn in the world). */
  muzzleCameraSpace(out) {
    const mz = this.current && this.current.getObjectByName('muzzle');
    if (!mz) return out.set(0.15, -0.12, -0.5);
    this.root.updateMatrixWorld(true);
    return mz.getWorldPosition(out);
  }

  update(dt) {
    if (!this.current) return;
    // spring-damper recoil recovery
    const k = 160, c = 18;
    this.kickV += (-k * this.kick - c * this.kickV) * dt;
    this.kick += this.kickV * dt;
    this.pitchV += (-k * this.pitch - c * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.sway += dt;
    // hold the gun at the lower right, barrel converging on the aim point
    const base = new THREE.Vector3(0.22, -0.19 + Math.sin(this.sway * 1.3) * 0.002, -0.62);
    this.root.position.copy(base);
    this.root.position.z += Math.max(this.kick, -0.02) * 0.06;
    const target = this.aim.clone().multiplyScalar(6);
    const m = new THREE.Matrix4().lookAt(this.root.position, target, new THREE.Vector3(0, 1, 0));
    this.root.quaternion.setFromRotationMatrix(m);
    this.root.rotateX(this.pitch * 0.05);
    this.animateAction(dt);
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

  /** Mechanical cycling after a shot: slide blow-back, pump stroke, cylinder index, bolt throw. */
  animateAction(dt) {
    const m = this.current;
    if (!m.userData.parts) {
      const parts = {};
      for (const n of ['slide', 'pump', 'cylinder', 'bolt']) {
        const o = m.getObjectByName(n);
        if (o) parts[n] = { o, pos: o.position.clone(), rot: o.rotation.clone() };
      }
      m.userData.parts = parts;
      m.userData.cyl = 0;
    }
    const P = m.userData.parts;
    const a = this.action || 0;
    // fast stroke back, slower return
    const t = 1 - a;
    const stroke = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.75);
    const speed = { pistol: 9, smg: 14, rifle: 12, shotgun: 2.2, sniper: 1.6, revolver: 6 }[this.type] || 6;
    this.action = Math.max(0, a - dt * speed);
    if (P.slide) P.slide.o.position.z = P.slide.pos.z + 0.028 * (a > 0 ? stroke : 0);
    if (P.pump) P.pump.o.position.z = P.pump.pos.z + 0.09 * (a > 0 ? stroke : 0);
    if (P.bolt) P.bolt.o.rotation.z = P.bolt.rot.z + 1.2 * (a > 0 ? Math.min(1, stroke * 1.5) : 0);
    if (P.cylinder) {
      if (a > 0 && this._lastA !== undefined && this._lastA === 1) m.userData.cyl += Math.PI / 3;
      P.cylinder.o.rotation.z += (P.cylinder.rot.z + m.userData.cyl - P.cylinder.o.rotation.z) * Math.min(1, dt * 25);
    }
    this._lastA = a;
  }

  render(renderer) {
    if (!this.visible || !this.current) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

/** Simple stand-in gun used if the detailed weapon models are unavailable. */
function fallbackGun(type) {
  const len = { pistol: 0.19, revolver: 0.24, shotgun: 0.72, smg: 0.42, rifle: 0.82, sniper: 1.0 }[type] || 0.2;
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.7 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, len), metal);
  body.position.z = -len / 2 + 0.06;
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len * 0.3, 12), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.008, -len + 0.06 - len * 0.12);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.035), poly);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = -0.25;
  g.add(grip);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.008, -len + 0.06 - len * 0.27);
  g.add(muzzle);
  const ej = new THREE.Object3D();
  ej.name = 'ejector';
  ej.position.set(0.02, 0.02, -0.03);
  g.add(ej);
  return g;
}
