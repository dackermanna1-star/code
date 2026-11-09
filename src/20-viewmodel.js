// First-person viewmodel built from authored rigs (arms + weapon + animation clips, CC-BY 4.0,
// see CREDITS.md). Each rig carries an animated "Head_Cam" bone: the viewmodel camera rides it,
// so reloads and draws keep their authored camera motion. Procedural layers on top: free-aim
// sway, recoil springs, ADS alignment (sight line solved from the weapon geometry), bob, wall
// avoidance, attachments, muzzle flash and ejected casings.

const VM_RIGS = {
  pistol: {
    asset: 'viewmodels/pistol', gun: 'Rif_059', arms: ['arms', 'SoldierUniformArms'], caliber: '9mm',
    clips: { idle: 'FPS_Pistol_Idle', walk: 'FPS_Pistol_Walk', fire: 'FPS_Pistol_Fire', reload: 'FPS_Pistol_Reload_easy', reloadEmpty: 'FPS_Pistol_Reload_full' },
    eye: [0, 0.02, 0.0], sightRear: 0.12, sightFront: 0.9, adsDist: 0.34, adsNudge: [0, 0, 0], port: 0.72, fov: 52,
  },
  smg: {
    asset: 'viewmodels/smg', gun: 'Rif_059', arms: ['arms'], caliber: '9mm',
    clips: { idle: 'KDW_DPose_Idle', walk: 'KDW_Walk', run: 'KDW_Run', fire: 'KDW_Shot', reload: 'KDW_Reload_fast', reloadEmpty: 'KDW_Reload_full', draw: 'KDW_Draw', inspect: 'KDW_Ispect' },
    eye: [0, 0.021, 0.0], sightRear: 0.35, sightFront: 0.92, adsDist: 0.16, adsNudge: [0, 0, 0], port: 0.62, fov: 52,
  },
  ak74: {
    asset: 'viewmodels/ak74', gun: 'Rif_059', arms: ['arms'], caliber: '556',
    clips: { idle: 'AK_Idle', walk: 'AK_Walk', run: 'AK_Run', fire: 'AK_Shot', reload: 'AK_Reload', reloadEmpty: 'AK_Reload_full', reloadAlt: 'AK_Reload_var2', draw: 'AK_Draw' },
    eye: [0, 0.021, -0.079], sightRear: 0.42, sightFront: 0.95, adsDist: 0.2, adsNudge: [0, 0, 0], port: 0.6, fov: 52,
  },
  acr: {
    asset: 'viewmodels/acr', gun: 'Rif_059', arms: ['arms'], caliber: '556',
    clips: { idle: 'Arms_FPS_Anim_Idle', walk: 'Arms_FPS_Anim_Walk', run: 'Arms_FPS_Anim_Run', fire: 'Arms_FPS_Anim_Shoot', fireSingle: 'Arms_FPS_Anim_OneShot', reload: 'Arms_FPS_Anim_Reload_Fast', draw: 'Arms_FPS_Anim_Draw', inspect: 'Arms_FPS_Anim_rifle_inspect' },
    eye: [0, 0.021, 0.0], sightRear: 0.4, sightFront: 0.95, adsDist: 0.16, adsNudge: [0, 0, 0], port: 0.6, fov: 52,
    parts: { scope: 'Scope', suppressor: 'Silencer' },
  },
  saiga: {
    asset: 'viewmodels/saiga', gun: 'Rif_059', arms: ['arms'], caliber: '12ga',
    clips: { idle: 'Saiga_Idle', walk: 'Saiga_Walk', fire: 'Saiga_Fire', reload: 'Saiga_Reload_Fast', reloadEmpty: 'Saiga_Reload_Full' },
    eye: [0, 0.021, 0.0], sightRear: 0.4, sightFront: 0.95, adsDist: 0.2, adsNudge: [0, 0, 0], port: 0.6, fov: 52,
  },
  remington: {
    asset: 'viewmodels/remington', gun: 'Body_058', arms: ['material'], ignore: ['12ge'], caliber: '12ga',
    clips: { idle: 'SG_FPS_Idle', walk: 'SG_FPS_Walk', fire: 'SG_FPS_Shot', reload: 'SG_FPS_Reload' },
    eye: [0, 0.02, 0.0], sightRear: 0.3, sightFront: 0.97, adsDist: 0.2, adsNudge: [0, 0, 0], port: 0.55, fov: 52,
    pump: true,
  },
};

const _v1 = new T3.Vector3(), _v2 = new T3.Vector3(), _q1 = new T3.Quaternion(), _m1 = new T3.Matrix4(), _m2 = new T3.Matrix4();
const ROT_Y_180 = new T3.Matrix4().makeRotationY(Math.PI);

class Viewmodel {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new T3.Scene();
    this.camera = new T3.PerspectiveCamera(52, innerWidth / innerHeight, 0.008, 20);
    this.camera.matrixAutoUpdate = false;
    const pm = new T3.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new Lab.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.environmentIntensity = 0.35;
    this.hemi = new T3.HemisphereLight(0xfff4dc, 0x40362a, 0.8);
    this.key = new T3.DirectionalLight(0xfff2d6, 1.4);
    this.key.position.set(0.3, 1, 0.4);
    this.fill = new T3.DirectionalLight(0xc8d4ff, 0.3);
    this.fill.position.set(-0.6, 0.2, -0.4);
    this.flashLight = new T3.PointLight(0xffb060, 0, 3, 2);
    this.scene.add(this.hemi, this.key, this.fill, this.flashLight);
    this.rigs = {};
    this.loading = {};
    this.cur = null; // active rig instance
    this.pending = null;
    // motion state
    this.sx = new Spring(90, 13); this.sy = new Spring(90, 13); this.sr = new Spring(80, 12);
    this.kz = new Spring(260, 24); this.kp = new Spring(180, 17); this.ky = new Spring(150, 15); this.kr = new Spring(160, 15);
    this.dip = new Spring(110, 12);
    this.lower = new Spring(60, 12); // holster / draw
    this.aimX = 0; this.aimY = 0;    // free-aim offset (radians)
    this.ads = 0; this.sprint = 0; this.crouch = 0; this.wallPush = 0;
    this.t = 0;
    this.flash = Lab.muzzleFlashMesh();
    this.flash.visible = false;
    this.flashHolder = new T3.Group();
    this.flashHolder.add(this.flash);
    this.scene.add(this.flashHolder);
    this.flashT = 0;
    this.casings = [];
    this.visible = true;
    this.light = 1;
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  async prepare(rigId) {
    if (this.rigs[rigId]) return this.rigs[rigId];
    if (this.loading[rigId]) return this.loading[rigId];
    const def = VM_RIGS[rigId];
    this.loading[rigId] = Assets.gltf(def.asset).then((gltf) => {
      const rig = this.buildRig(rigId, def, gltf);
      this.rigs[rigId] = rig;
      return rig;
    });
    return this.loading[rigId];
  }

  buildRig(id, def, gltf) {
    const root = gltf.scene;
    const rig = { id, def, root, gltf, parts: {}, meshes: [], gunMeshes: [], attach: {} };
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = o.receiveShadow = false;
      const m = o.material;
      if (m) {
        if (m.map) m.map.anisotropy = 8;
        m.envMapIntensity = 1;
        if (def.arms.includes(m.name)) o.userData.arms = true;
        else if (!(def.ignore || []).includes(m.name)) rig.gunMeshes.push(o);
        for (const [part, matName] of Object.entries(def.parts || {})) if (m.name === matName) (rig.parts[part] ||= []).push(o);
      }
      rig.meshes.push(o);
    });
    rig.player = new ClipPlayer(root, gltf.animations);
    rig.headCam = root.getObjectByName('Head_Cam_014');
    rig.gun = root.getObjectByName(def.gun) || rig.headCam;
    rig.eyeFix = new T3.Matrix4().makeTranslation(...def.eye).premultiply(new T3.Matrix4()).multiply(ROT_Y_180);
    // pose idle at t=0 and measure the weapon in camera space
    root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
    rig.player.play(def.clips.idle, { fade: 0 });
    rig.player.update(0);
    root.updateMatrixWorld(true);
    this.measure(rig);
    for (const parts of Object.values(rig.parts)) for (const o of parts) o.visible = false;
    return rig;
  }

  headMatrix(rig, out) {
    // camera matrix (rig space) = head-cam bone without scale, turned to look down -Z, plus eye offset
    rig.headCam.matrixWorld.decompose(_v1, _q1, _v2);
    out.compose(_v1, _q1, new T3.Vector3(1, 1, 1));
    // eye offset is in rig units: scale it by the bone's world scale
    const s = _v2.x;
    const fix = _m2.makeTranslation(rig.def.eye[0] * s, rig.def.eye[1] * s, rig.def.eye[2] * s).multiply(ROT_Y_180);
    return out.multiply(fix);
  }

  measure(rig) {
    const C = this.headMatrix(rig, new T3.Matrix4());
    const Cinv = C.clone().invert();
    const pts = [];
    const v = new T3.Vector3();
    for (const mesh of rig.gunMeshes) {
      const pos = mesh.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 2500));
      for (let i = 0; i < pos.count; i += step) {
        mesh.getVertexPosition(i, v);
        v.applyMatrix4(mesh.matrixWorld).applyMatrix4(Cinv);
        pts.push(v.clone());
      }
    }
    if (!pts.length) return;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const len = maxZ - minZ;
    const avg = (filter) => { const a = new T3.Vector3(); let n = 0; for (const p of pts) if (filter(p)) { a.add(p); n++; } return n ? a.multiplyScalar(1 / n) : null; };
    const muzzle = avg((p) => p.z < minZ + Math.min(0.012, len * 0.03)) || new T3.Vector3(0.1, -0.1, -0.5);
    const rear = avg((p) => p.z > maxZ - len * 0.08) || muzzle.clone().add(new T3.Vector3(0, 0, len));
    // topmost vertex in a slice along the gun (front sight / rear sight)
    const topAt = (u, w) => {
      const z0 = maxZ - len * u;
      let best = null;
      for (const p of pts) if (Math.abs(p.z - z0) < len * w && (!best || p.y > best.y)) best = p;
      return best ? best.clone() : null;
    };
    rig.cam = {
      len,
      muzzle,
      rear,
      sightRear: topAt(rig.def.sightRear, 0.05),
      sightFront: topAt(rig.def.sightFront, 0.04),
    };
    // remember the muzzle and port in the gun bone's frame so they follow the animation
    const gunInv = rig.gun.matrixWorld.clone().invert();
    const toGun = (p) => p.clone().applyMatrix4(C).applyMatrix4(gunInv);
    rig.muzzleLocal = toGun(muzzle);
    rig.rearLocal = toGun(rear);
    const port = rear.clone().lerp(muzzle, rig.def.port);
    port.x += 0.012; port.y += 0.02;
    rig.portLocal = toGun(port);
    this.solveAds(rig);
  }

  // ADS: rotate the gun so its sight line runs down the camera axis, at a comfortable distance
  solveAds(rig, sight = null) {
    const c = rig.cam;
    let rearP, frontP, dist;
    if (sight) { rearP = sight.rear; frontP = sight.front; dist = sight.dist; }
    else { rearP = c.sightRear; frontP = c.sightFront; dist = rig.def.adsDist; }
    if (!rearP || !frontP) { rig.ads = { q: new T3.Quaternion(), p: new T3.Vector3(-0.1, 0.05, 0) }; return; }
    const dir = frontP.clone().sub(rearP).normalize();
    const q = new T3.Quaternion().setFromUnitVectors(dir, new T3.Vector3(0, 0, -1));
    const rp = rearP.clone().applyQuaternion(q);
    // a hair above the sights so the front post sits in the notch rather than over it
    const p = new T3.Vector3(-rp.x, -rp.y - 0.0015, -dist - rp.z).add(new T3.Vector3(...rig.def.adsNudge));
    rig.ads = { q, p };
  }

  // ---- attachments ---------------------------------------------------------------------------
  // weapon: { rig, attachments: Set }
  configure(weapon) {
    const rig = this.rigs[weapon.rig];
    if (!rig) return;
    const at = weapon.attachments || new Set();
    for (const [part, meshes] of Object.entries(rig.parts)) for (const m of meshes) m.visible = at.has(part === 'scope' ? 'scope' : part);
    // procedural attachments for rigs that do not model them
    for (const k of Object.keys(rig.attach)) rig.attach[k].visible = false;
    if (at.has('suppressor') && !rig.parts.suppressor) this.ensureSuppressor(rig).visible = true;
    if (at.has('reddot')) this.ensureRedDot(rig).visible = true;
    if (weapon.drum) this.ensureDrum(rig).visible = true;
    if (rig.drumHides) for (const m of rig.drumHides) m.visible = !weapon.drum;
    // the sight line moves with the optic
    if (at.has('scope') && rig.parts.scope) {
      const b = new T3.Box3();
      const C = this.headMatrix(rig, new T3.Matrix4()).invert();
      for (const m of rig.parts.scope) {
        const pos = m.geometry.attributes.position, v = new T3.Vector3();
        for (let i = 0; i < pos.count; i += 7) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(C); b.expandByPoint(v); }
      }
      const ctr = b.getCenter(new T3.Vector3());
      this.solveAds(rig, { rear: new T3.Vector3(ctr.x, ctr.y + 0.004, b.max.z), front: new T3.Vector3(ctr.x, ctr.y + 0.004, b.min.z), dist: 0.07 });
      rig.scoped = true;
    } else if (at.has('reddot')) {
      const s = rig.attach.reddot.userData.sightCam;
      this.solveAds(rig, { rear: s.rear, front: s.front, dist: 0.14 });
      rig.scoped = false;
    } else { this.solveAds(rig); rig.scoped = false; }
    rig.suppressed = at.has('suppressor');
  }

  gunFrame(rig) {
    // camera-space frame of the gun at idle: origin at the muzzle, forward along the barrel
    const c = rig.cam;
    const fwd = c.muzzle.clone().sub(c.rear).normalize();
    return { fwd, muzzle: c.muzzle.clone() };
  }

  attachToGun(rig, obj, camPos, camQuat) {
    // place obj (defined in camera space at idle) under the gun bone so it follows animation
    const C = this.headMatrix(rig, new T3.Matrix4());
    const world = new T3.Matrix4().compose(camPos, camQuat, new T3.Vector3(1, 1, 1)).premultiply(C);
    const local = rig.gun.matrixWorld.clone().invert().multiply(world);
    const holder = new T3.Group();
    local.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    rig.gun.add(holder);
    return holder;
  }

  ensureSuppressor(rig) {
    if (rig.attach.suppressor) return rig.attach.suppressor;
    const { fwd, muzzle } = this.gunFrame(rig);
    const r = rig.def.caliber === '9mm' ? 0.016 : 0.019, L = rig.def.caliber === '9mm' ? 0.15 : 0.19;
    const g = new T3.CylinderGeometry(r, r, L, 20, 1).rotateX(Math.PI / 2).translate(0, 0, -L / 2 + 0.01);
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.7 }));
    const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 0, -1), fwd);
    rig.attach.suppressor = this.attachToGun(rig, m, muzzle, q);
    rig.muzzleLocalBase = rig.muzzleLocalBase || rig.muzzleLocal.clone();
    return rig.attach.suppressor;
  }

  ensureRedDot(rig) {
    if (rig.attach.reddot) return rig.attach.reddot;
    const c = rig.cam;
    const fwd = c.muzzle.clone().sub(c.rear).normalize();
    // sit it on the top of the receiver, a little ahead of the rear sight
    const base = (c.sightRear || c.rear).clone().lerp(c.sightFront || c.muzzle, 0.18);
    const grp = new T3.Group();
    const body = new T3.MeshStandardMaterial({ color: 0x151617, roughness: 0.5, metalness: 0.6 });
    const h = 0.034;
    const tube = new T3.Mesh(new T3.CylinderGeometry(0.017, 0.017, 0.05, 20, 1, true).rotateX(Math.PI / 2), body);
    tube.position.set(0, h, 0);
    const mount = new T3.Mesh(new T3.BoxGeometry(0.022, h - 0.012, 0.045), body);
    mount.position.set(0, (h - 0.012) / 2, 0);
    const lens = new T3.Mesh(new T3.CircleGeometry ? new T3.RingGeometry(0, 0.0155, 24) : new T3.PlaneGeometry(0.03, 0.03), new T3.MeshBasicMaterial({ color: 0x88a0b0, transparent: true, opacity: 0.12, depthWrite: false }));
    lens.position.set(0, h, -0.02);
    const dot = new T3.Mesh(new T3.SphereGeometry(0.0009, 8, 6), new T3.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
    dot.position.set(0, h, -0.021);
    grp.add(tube, mount, lens, dot);
    const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 0, -1), fwd);
    rig.attach.reddot = this.attachToGun(rig, grp, base, q);
    const up = new T3.Vector3(0, 1, 0).applyQuaternion(q);
    rig.attach.reddot.userData.sightCam = {
      rear: base.clone().addScaledVector(up, h).addScaledVector(fwd, 0.025),
      front: base.clone().addScaledVector(up, h).addScaledVector(fwd, -0.021 + 0.05),
    };
    return rig.attach.reddot;
  }

  ensureDrum(rig) {
    if (rig.attach.drum) return rig.attach.drum;
    // RPK-style 75-round drum hung under the receiver, following the magazine bone
    const magBone = rig.root.getObjectByName('Pmag_062') || rig.root.getObjectByName('Pmag_061') || rig.gun;
    const c = rig.cam;
    const fwd = c.muzzle.clone().sub(c.rear).normalize();
    const at = c.rear.clone().lerp(c.muzzle, 0.42);
    at.y -= 0.075;
    const g = new T3.CylinderGeometry(0.085, 0.085, 0.07, 28).rotateZ(Math.PI / 2);
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.55, metalness: 0.5 }));
    const ribs = new T3.Mesh(new T3.TorusGeometry(0.07, 0.006, 6, 28).rotateY(Math.PI / 2), m.material);
    m.add(ribs);
    const C = this.headMatrix(rig, new T3.Matrix4());
    const world = new T3.Matrix4().compose(at, new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 0, -1), fwd), new T3.Vector3(1, 1, 1)).premultiply(C);
    const local = magBone.matrixWorld.clone().invert().multiply(world);
    const holder = new T3.Group();
    local.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(m);
    magBone.add(holder);
    rig.attach.drum = holder;
    return holder;
  }

  // ---- switching -------------------------------------------------------------------------------
  async equip(weapon, instant = false) {
    const rig = await this.prepare(weapon.rig);
    if (this.cur && this.cur !== rig) this.scene.remove(this.cur.root);
    this.cur = rig;
    this.weapon = weapon;
    this.scene.add(rig.root);
    this.configure(weapon);
    const clips = rig.def.clips;
    rig.player.layers.length = 0;
    rig.player.play(clips.idle, { fade: 0 });
    this.loco = clips.idle;
    if (!instant) {
      if (clips.draw) {
        rig.player.play(clips.draw, { fade: 0, loop: false, restart: true, onEnd: () => this.backToLoco(0.2) });
        this.lower.x = 0.15;
      } else this.lower.x = 1;
    } else this.lower.x = 0;
    this.lower.v = 0;
    this.action = null;
  }

  backToLoco(fade = 0.15) {
    if (!this.cur) return;
    this.action = null;
    this.cur.player.play(this.loco, { fade, loop: true });
  }

  playAction(kind, opts = {}) {
    const rig = this.cur;
    if (!rig) return 0;
    const clips = rig.def.clips;
    let name = clips[kind];
    if (kind === 'reload' && opts.empty && clips.reloadEmpty) name = clips.reloadEmpty;
    if (kind === 'fire' && opts.single && clips.fireSingle) name = clips.fireSingle;
    if (!name) return 0;
    const dur = rig.player.duration(name);
    const speed = opts.speed || 1;
    if (kind === 'fire') {
      if (this.action && this.action !== 'fire') return dur; // keep reload/inspect running
      const ads = this.ads > 0.5;
      rig.player.play(name, { fade: 0.02, loop: false, restart: true, speed: speed * (ads ? 1.4 : 1), exclusive: !ads, weight: ads ? 0.25 : 1, onEnd: () => this.backToLoco(0.12) });
      this.action = 'fire';
    } else {
      rig.player.play(name, { fade: 0.1, loop: false, restart: true, speed, onEnd: () => this.backToLoco(0.18) });
      this.action = kind;
    }
    return dur / speed;
  }

  cancelAction() {
    if (this.action && this.action !== 'fire') this.backToLoco(0.12);
  }

  // ---- shots ---------------------------------------------------------------------------------
  fire(spec) {
    const rig = this.cur;
    if (!rig) return;
    const s = 1 - 0.45 * this.ads;
    this.kz.kick(spec.back * 60 * s);
    this.kp.kick(spec.up * 0.9 * s);
    this.ky.kick((Math.random() - 0.5) * spec.side * 1.2 * s);
    this.kr.kick((Math.random() - 0.35) * spec.roll * 1.4 * s);
    this.playAction('fire', { single: !spec.auto });
    if (!rig.suppressed) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * TAU;
      this.flash.scale.setScalar((0.8 + Math.random() * 0.5) * (spec.flash || 1));
      this.flashT = 0.05;
      this.flashLight.intensity = 6;
    } else {
      this.flashLight.intensity = 0.8;
      this.flashT = 0.03;
    }
    if (!spec.pump && !spec.bolt) this.eject(rig);
  }

  eject(rig = this.cur) {
    if (!rig || !rig.portLocal) return;
    let c = this.casings.find((k) => !k.live);
    if (!c) {
      if (this.casings.length >= 12) c = this.casings.reduce((a, b) => (a.t > b.t ? a : b));
      else {
        c = { m: Lab.casingMesh(rig.def.caliber === '12ga' ? 'shotgun' : rig.def.caliber === '9mm' ? 'pistol' : 'rifle'), v: new T3.Vector3(), w: new T3.Vector3(), t: 0, live: false };
        c.m.castShadow = c.m.receiveShadow = false;
        this.scene.add(c.m);
        this.casings.push(c);
      }
    }
    const p = rig.portLocal.clone().applyMatrix4(rig.gun.matrixWorld);
    c.m.position.copy(p);
    c.m.quaternion.setFromRotationMatrix(rig.gun.matrixWorld);
    c.v.set(1.6 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 0.4 + Math.random() * 0.3).applyQuaternion(this.camQuat || _q1.identity());
    c.w.set(18 * Math.random(), 30, 10 * Math.random());
    c.t = 0; c.live = true; c.m.visible = true;
  }

  pump() { this.kz.kick(1.2); this.kp.kick(-0.6); }

  muzzleWorld(out) {
    // muzzle in viewmodel-camera space (for the world tracer origin)
    const rig = this.cur;
    if (!rig) return out.set(0.12, -0.1, -0.6);
    out.copy(rig.muzzleLocal).applyMatrix4(rig.gun.matrixWorld).applyMatrix4(this.camera.matrixWorldInverse);
    return out;
  }

  // ---- per frame ------------------------------------------------------------------------------
  update(dt, st) {
    const rig = this.cur;
    this.t += dt;
    if (!rig) return;
    // locomotion clip by speed
    const clips = rig.def.clips;
    const want = st.sprint && clips.run ? clips.run : st.speed > 0.6 && st.onGround && st.ads < 0.5 ? clips.walk : clips.idle;
    if (want !== this.loco) {
      this.loco = want;
      if (!this.action) rig.player.play(want, { fade: 0.25, loop: true });
    }
    const locoLayer = rig.player.layer(this.loco);
    if (locoLayer && this.loco === clips.walk) locoLayer.speed = clamp(st.speed / 3.3, 0.6, 1.4);
    rig.player.update(dt);

    // springs: look sway, free aim, recoil, landing
    const look = st.look || { dx: 0, dy: 0 };
    const adsK = 1 - 0.75 * st.ads;
    this.aimX = clamp(this.aimX + look.dx * 0.55 * adsK, -0.05, 0.05);
    this.aimY = clamp(this.aimY + look.dy * 0.55 * adsK, -0.04, 0.04);
    const back = Math.exp(-dt * (st.ads > 0.5 ? 16 : 5));
    this.aimX *= back; this.aimY *= back;
    this.sx.step(dt, clamp(-look.dx * 3, -0.3, 0.3) * adsK);
    this.sy.step(dt, clamp(-look.dy * 3, -0.3, 0.3) * adsK);
    this.sr.step(dt, clamp(-look.dx * 4, -0.4, 0.4) * adsK + (st.strafe || 0) * 0.05);
    this.kz.step(dt); this.kp.step(dt); this.ky.step(dt); this.kr.step(dt);
    if (st.landed) this.dip.kick(-Math.min(3, st.landed * 0.35));
    this.dip.step(dt);
    this.lower.step(dt, st.lowered ? 1 : 0);
    this.ads = st.ads;
    this.sprint = damp(this.sprint, st.sprint ? 1 : 0, 8, dt);
    this.crouch = damp(this.crouch, st.crouch, 8, dt);
    this.wallPush = damp(this.wallPush, st.wallNear || 0, 10, dt);

    // compose: P (camera space offset) * inverse(head camera)
    rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
    rig.root.updateMatrixWorld(true);
    const C = this.headMatrix(rig, _m1);
    const ads = rig.ads;
    const a = this.ads;
    const pos = new T3.Vector3().lerpVectors(new T3.Vector3(), ads.p, a);
    const rot = new T3.Quaternion().slerpQuaternions(new T3.Quaternion(), ads.q, a);
    const bobT = this.t * 7.5;
    const bobAmt = st.onGround ? clamp(st.speed / 4, 0, 1) * (1 - 0.85 * a) * 0.004 : 0;
    pos.x += Math.sin(bobT * 0.5) * bobAmt + this.sx.x * 0.02 * (1 - a * 0.7);
    pos.y += Math.abs(Math.cos(bobT * 0.5)) * bobAmt - this.sy.x * 0.015 + this.dip.x * 0.01 - this.lower.x * 0.28 - this.crouch * 0.008 * (1 - a);
    pos.z += this.kz.x * 0.01 + this.wallPush * 0.12 - this.lower.x * 0.05;
    const e = new T3.Euler(
      this.kp.x * 0.012 + this.sy.x * 0.05 - this.lower.x * 0.9 + this.wallPush * 0.5 + this.aimY,
      this.ky.x * 0.01 + this.sx.x * 0.06 + this.aimX,
      this.kr.x * 0.012 + this.sr.x * 0.05 + this.crouch * 0.05 * (1 - a) - this.wallPush * 0.3,
      'YXZ',
    );
    const proc = new T3.Quaternion().setFromEuler(e);
    // rotate about a pivot behind the grip so recoil reads as a wrist rotation
    const pivot = new T3.Vector3(0.05, -0.12, 0.05).multiplyScalar(1 - a);
    const P = new T3.Matrix4().makeTranslation(pos.x, pos.y, pos.z)
      .multiply(new T3.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(new T3.Matrix4().makeRotationFromQuaternion(proc))
      .multiply(new T3.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
      .multiply(new T3.Matrix4().makeRotationFromQuaternion(rot));
    const R = P.multiply(C.clone().invert());
    R.decompose(rig.root.position, rig.root.quaternion, rig.root.scale);
    rig.root.updateMatrixWorld(true);
    this.camera.matrixWorld.identity();
    this.camera.matrixWorldInverse.identity();
    this.camQuat = new T3.Quaternion();

    // muzzle flash follows the muzzle
    const mz = rig.muzzleLocal.clone().applyMatrix4(rig.gun.matrixWorld);
    const rear = rig.rearLocal.clone().applyMatrix4(rig.gun.matrixWorld);
    this.flashHolder.position.copy(mz);
    this.flashHolder.lookAt(mz.clone().multiplyScalar(2).sub(rear));
    this.flashHolder.rotateY(Math.PI);
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120); }
    this.flashLight.position.copy(mz);
    // casings
    for (const c of this.casings) {
      if (!c.live) continue;
      c.t += dt;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt;
      if (c.t > 0.7) { c.live = false; c.m.visible = false; }
    }
    // lighting follows the world light at the player
    const L = clamp(st.light ?? 1, 0.04, 1.6);
    this.light = damp(this.light, L, 6, dt);
    this.hemi.intensity = 0.15 + 0.75 * this.light;
    this.key.intensity = 0.1 + 1.5 * this.light;
    this.fill.intensity = 0.05 + 0.3 * this.light;
    this.scene.environmentIntensity = 0.08 + 0.35 * this.light;
    if (st.tint) { this.key.color.copy(st.tint); this.hemi.color.copy(st.tint); }
  }

  render(renderer) {
    if (!this.cur || !this.visible) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
