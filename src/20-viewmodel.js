// First-person viewmodel built from authored rigs (arms + weapon + animation clips, CC-BY 4.0,
// see CREDITS.md). Each rig carries an animated "Head_Cam" bone: the viewmodel camera rides it,
// so reloads and draws keep their authored camera motion. Procedural layers on top: free-aim
// sway, recoil springs, ADS alignment (sight line solved from the weapon geometry), bob, wall
// avoidance, attachments, muzzle flash and ejected casings.

const VM_RIGS = {
  pistol: {
    asset: 'viewmodels/pistol', gun: 'Rif_059', arms: ['arms', 'SoldierUniformArms'], caliber: '9mm',
    adsBack: 0.4, adsNudge: [0, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'FPS_Pistol_Idle', walk: 'FPS_Pistol_Walk', fire: 'FPS_Pistol_Fire', reload: 'FPS_Pistol_Reload_easy', reloadEmpty: 'FPS_Pistol_Reload_full' },
    eye: [0, 0.02, 0.0], sightRear: 0.12, sightFront: 0.9, adsDist: 0.34, port: 0.72, fov: 52,
  },
  mp5: {
    // no Head_Cam bone in this rig: the scene root (which carries the export's scale) stands in
    asset: 'viewmodels/mp5', vmFovScale: 0.70, gun: 'bdy_86', head: 'GLTF_SceneRootNode', headAt: [-0.12, 0.178, 0.1], armsTint: 0x2b2b2e, arms: ['lambert1'], caliber: '9mm',
    adsNudge: [0, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'Arms_Idle', walk: 'Arms_Walk', run: 'Arms_Sprint', fire: 'Arms_Fire', reload: 'Arms_notfullreload', reloadEmpty: 'Arms_fullreload', draw: 'Arms_Draw', inspect: 'Arms_Inspect' },
    eye: [0, 0.021, 0.0], sightRear: 0.35, sightFront: 0.92, adsDist: 0.16, port: 0.6, fov: 52,
  },
  smg: {
    asset: 'viewmodels/smg', gun: 'Rif_059', arms: ['arms'], caliber: '9mm',
    adsNudge: [-0.008, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'KDW_DPose_Idle', walk: 'KDW_Walk', run: 'KDW_Run', fire: 'KDW_Shot', reload: 'KDW_Reload_fast', reloadEmpty: 'KDW_Reload_full', draw: 'KDW_Draw', inspect: 'KDW_Ispect' },
    eye: [0, 0.021, 0.0], sightRear: 0.35, sightFront: 0.92, adsDist: 0.16, port: 0.62, fov: 52,
  },
  ak74: {
    asset: 'viewmodels/ak74', drum: true, gun: 'Rif_059', arms: ['arms'], caliber: '556',
    adsNudge: [-0.0105, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'AK_Idle', walk: 'AK_Walk', run: 'AK_Run', fire: 'AK_Shot', reload: 'AK_Reload', reloadEmpty: 'AK_Reload_full', reloadAlt: 'AK_Reload_var2', draw: 'AK_Draw' },
    eye: [0, 0.021, -0.079], sightRear: 0.42, sightFront: 0.95, adsDist: 0.2, port: 0.6, fov: 52,
  },
  acr: {
    asset: 'viewmodels/acr', mounts: { m24: { asset: 'viewmodels/m24', length: 1.09, grip: 0.3, offset: [0.005, -0.035, 0] } }, gun: 'Rif_059', arms: ['arms'], caliber: '556',
    adsNudge: [0, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'Arms_FPS_Anim_Idle', walk: 'Arms_FPS_Anim_Walk', run: 'Arms_FPS_Anim_Run', fire: 'Arms_FPS_Anim_Shoot', fireSingle: 'Arms_FPS_Anim_OneShot', reload: 'Arms_FPS_Anim_Reload_Fast', draw: 'Arms_FPS_Anim_Draw', inspect: 'Arms_FPS_Anim_rifle_inspect' },
    eye: [0, 0.021, 0.0], sightRear: 0.4, sightFront: 0.95, adsDist: 0.16, port: 0.6, fov: 52,
    parts: { scope: 'Scope', suppressor: 'Silencer' },
  },
  saiga: {
    asset: 'viewmodels/saiga', vmFovScale: 0.84, gun: 'Rif_059', arms: ['arms'], caliber: '12ga',
    adsNudge: [-0.0125, 0, 0], hip: [0, 0, 0, 0, 0],
    clips: { idle: 'Saiga_Idle', walk: 'Saiga_Walk', fire: 'Saiga_Fire', reload: 'Saiga_Reload_Fast', reloadEmpty: 'Saiga_Reload_Full' },
    eye: [0, 0.021, 0.0], sightRear: 0.4, sightFront: 0.95, adsDist: 0.2, port: 0.6, fov: 52,
  },
  remington: {
    asset: 'viewmodels/remington', vmFovScale: 0.84, gun: 'Body_058', arms: ['material'], ignore: ['12ge'], caliber: '12ga',
    adsNudge: [0, 0, 0], hip: [0.01, 0.025, -0.04, 0, 0],
    clips: { idle: 'SG_FPS_Idle', walk: 'SG_FPS_Walk', fire: 'SG_FPS_Shot', reload: 'SG_FPS_Reload' },
    eye: [0, 0.02, 0.0], sightRear: 0.3, sightFront: 0.97, adsDist: 0.2, port: 0.55, fov: 52,
    pump: true,
  },
};

// sprint carries for rigs without a run clip: [x, y, z (m, camera space), pitch, yaw, roll (rad)]
// pistol: tucked in and canted; long guns: COD style, turned on their side and swung out with the
// muzzle up and to the left
const SPRINT_POSE = {
  pistol: [-0.028, 0.006, 0.01, -0.14, 0.28, 0.4],
  long: [0.035, -0.045, 0.02, 0.2, 0.72, 0.4],
};

const _v1 = new T3.Vector3(), _v2 = new T3.Vector3(), _q1 = new T3.Quaternion(), _m1 = new T3.Matrix4(), _m2 = new T3.Matrix4();
const ROT_Y_180 = new T3.Matrix4().makeRotationY(Math.PI);
// camera matrix at `eye` looking along `fwd` with `up` (three cameras look down -Z)
function basisCam(eye, fwd, up) {
  const z = fwd.clone().negate().normalize();
  const x = new T3.Vector3().crossVectors(up, z).normalize();
  const y = new T3.Vector3().crossVectors(z, x).normalize();
  return new T3.Matrix4().makeBasis(x, y, z).setPosition(eye);
}

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
    this.loading[rigId] = Assets.gltf(def.asset).then(async (gltf) => {
      const rig = this.buildRig(rigId, def, gltf);
      // other weapons carried by this rig's arms and animations (the rig is still in its idle, identity pose)
      rig.mounts = {};
      for (const [mid, m] of Object.entries(def.mounts || {})) {
        try { this.buildMount(rig, mid, m, await Assets.gltf(m.asset)); } catch (e) { console.warn('[viewmodel] mount', mid, e); }
      }
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
        if (def.arms.includes(m.name)) { o.userData.arms = true; if (def.armsTint !== undefined) { m.color.setHex(def.armsTint); m.roughness = 0.7; } } // bare arms read as gloves and sleeves
        else if (!(def.ignore || []).includes(m.name)) rig.gunMeshes.push(o);
        for (const [part, matName] of Object.entries(def.parts || {})) if (m.name === matName) (rig.parts[part] ||= []).push(o);
      }
      rig.meshes.push(o);
    });
    // low-poly arms that end at the shoulder: a sleeve on each upper arm runs on past it, out of view
    for (const bn of def.sleeves || []) {
      const b = root.getObjectByName(bn);
      if (!b) continue;
      const kid = b.children.find((k) => k.isBone);
      const len = kid ? kid.position.length() : 0.3;
      const mat = new T3.MeshStandardMaterial({ color: def.armsTint ?? 0x2b2b2e, roughness: 0.75 });
      const sl = new T3.Mesh(new T3.CylinderGeometry(len * 0.13, len * 0.15, len * 0.9, 12), mat);
      // along the bone's axis (towards its child), from a little inside the upper arm back past the shoulder
      const ax = kid ? kid.position.clone().normalize() : new T3.Vector3(0, 1, 0);
      sl.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), ax);
      sl.position.copy(ax).multiplyScalar(-len * 0.25);
      sl.frustumCulled = false;
      b.add(sl);
    }
    rig.player = new ClipPlayer(root, gltf.animations);
    rig.headCam = root.getObjectByName(def.head || 'Head_Cam_014');
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

  // ---- measuring a rig ---------------------------------------------------------------------------
  // Everything is solved in rig space with the rig at the origin, posed at frame 0 of its idle:
  // the barrel axis (trimmed PCA of the main weapon mesh), the sight line along its top profile,
  // muzzle / port / rear points, and from those two static cameras (hip and ADS).
  measure(rig) {
    const head = new T3.Vector3(), hq = new T3.Quaternion(), hs = new T3.Vector3();
    rig.headCam.matrixWorld.decompose(head, hq, hs);
    rig.S = hs.x || 1;
    // drop stray triangles skinned to far-away bones (they render as long streaks)
    for (const m of rig.meshes) {
      if (!m.isSkinnedMesh || !m.geometry.index) continue;
      const pos = m.geometry.attributes.position, idx = m.geometry.index.array, v = new T3.Vector3();
      const far = new Uint8Array(pos.count);
      let any = false;
      for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.distanceTo(head) > 2.4 * rig.S) { far[i] = 1; any = true; } }
      if (!any) continue;
      for (let t = 0; t < idx.length; t += 3) if (far[idx[t]] || far[idx[t + 1]] || far[idx[t + 2]]) idx[t + 1] = idx[t + 2] = idx[t];
      m.geometry.index.needsUpdate = true;
    }
    const partMeshes = new Set(Object.values(rig.parts).flat());
    const main = rig.gunMeshes.filter((m) => !partMeshes.has(m)).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
    const pts = [];
    const v = new T3.Vector3();
    const pos = main.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) { main.getVertexPosition(i, v); v.applyMatrix4(main.matrixWorld); if (v.distanceTo(head) < 2.4 * rig.S) pts.push(v.clone()); }
    // trimmed centroid and principal axis
    let c = new T3.Vector3();
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    const d2 = pts.map((p) => p.distanceToSquared(c)).sort((a, b) => a - b);
    const cut = d2[Math.floor(d2.length * 0.92)];
    const core = pts.filter((p) => p.distanceToSquared(c) <= cut);
    c = new T3.Vector3();
    for (const p of core) c.add(p);
    c.multiplyScalar(1 / core.length);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of core) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
    let ax = [0, 0, 1];
    for (let k = 0; k < 60; k++) { const nn = [0, 1, 2].map((a) => C[a][0] * ax[0] + C[a][1] * ax[1] + C[a][2] * ax[2]); const l = Math.hypot(...nn); ax = nn.map((x) => x / l); }
    const f = new T3.Vector3(...ax).normalize();
    if (f.dot(c.clone().sub(head)) < 0) f.negate(); // the muzzle points away from the eye
    const u = new T3.Vector3(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const r = new T3.Vector3().crossVectors(f, u).normalize();
    const proj = pts.map((p) => { const d = p.clone().sub(c); return { p, sf: d.dot(f), su: d.dot(u), sr: d.dot(r) }; });
    const sfs = proj.map((q) => q.sf).sort((a, b) => a - b);
    const fMin = sfs[Math.floor(sfs.length * 0.01)], fMax = sfs[Math.floor(sfs.length * 0.995)];
    const len = fMax - fMin;
    const mean = (list) => { const a = new T3.Vector3(); for (const q of list) a.add(q.p); return list.length ? a.multiplyScalar(1 / list.length) : null; };
    const muzzle = mean(proj.filter((q) => q.sf > fMax - len * 0.025)) || c.clone().addScaledVector(f, fMax);
    const rear = mean(proj.filter((q) => q.sf < fMin + len * 0.06)) || c.clone().addScaledVector(f, fMin);
    // the barrel line: muzzle centre, extended back along the axis
    const topIn = (a, b) => { let best = null; for (const q of proj) if (q.sf >= fMin + len * a && q.sf <= fMin + len * b && Math.abs(q.sr - (muzzle.clone().sub(c).dot(r))) < 0.03 * rig.S && (!best || q.su > best.su)) best = q; return best; };
    const fs = topIn(rig.def.sightFront - 0.06, Math.min(1, rig.def.sightFront + 0.04));
    const rs = topIn(rig.def.sightRear - 0.07, rig.def.sightRear + 0.07);
    // the eye sits a fixed distance behind the shooting hand, at front-sight height, in line with the bore
    let hand = null;
    rig.root.traverse((o) => { if (!hand && o.isBone && /^Hand_R/.test(o.name)) hand = o; });
    const handP = hand ? new T3.Vector3().setFromMatrixPosition(hand.matrixWorld) : rear.clone().lerp(muzzle, 0.3);
    const muzR = muzzle.clone().sub(c).dot(r), muzU = muzzle.clone().sub(c).dot(u);
    // top profile along the centre line: front post (front quarter) and rear sight (middle half)
    const N = 48, prof = new Array(N).fill(-Infinity);
    for (const q of proj) {
      if (Math.abs(q.sr - muzR) > 0.011 * rig.S) continue;
      const k = Math.floor(((q.sf - fMin) / len) * N);
      if (k >= 0 && k < N) prof[k] = Math.max(prof[k], q.su);
    }
    const best = (a, b) => { let k0 = -1; for (let k = Math.floor(a * N); k < Math.min(N, Math.ceil(b * N)); k++) if (prof[k] > -Infinity && (k0 < 0 || prof[k] > prof[k0])) k0 = k; return k0; };
    const kF = best(0.75, 0.985), kR = best(0.22, 0.72);
    const Uf = kF >= 0 ? prof[kF] : muzU + 0.03 * rig.S, Ur = kR >= 0 ? prof[kR] : Uf;
    const fR = fMin + ((kR + 0.5) / N) * len;
    // look just over the highest sight feature: an unobstructed picture with the sights sitting low
    let sightU = Math.max(Uf, Ur) + 0.005 * rig.S;
    sightU += (rig.def.sightNudge || 0) * rig.S;
    const hd = head.clone().sub(c);
    rig.frame = { c, f, u, r, len, muzzle, rear, sightFront: fs ? fs.p.clone() : null, sightRear: rs ? rs.p.clone() : null, handF: handP.clone().sub(c).dot(f), muzR, muzU, sightU, fR, headF: hd.dot(f), headU: hd.dot(u), headR: hd.dot(r) };
    // rigs without an authored head camera: put the eye relative to the gun instead
    // (headAt = [side, up, back] in metres from the rear of the bore)
    const ha = rig.def.headAt;
    if (ha) { const F0 = rig.frame; F0.headF = rear.clone().sub(c).dot(f) - ha[2] * rig.S; F0.headU = muzU + ha[1] * rig.S; F0.headR = muzR + ha[0] * rig.S; }
    // keep the muzzle, rear and port in the gun bone's frame so they follow the animation
    const gunInv = rig.gun.matrixWorld.clone().invert();
    rig.muzzleLocal = muzzle.clone().applyMatrix4(gunInv);
    rig.rearLocal = rear.clone().applyMatrix4(gunInv);
    const port = rear.clone().lerp(muzzle, rig.def.port).addScaledVector(r, 0.012 * rig.S).addScaledVector(u, 0.02 * rig.S);
    rig.portLocal = port.applyMatrix4(gunInv);
    rig.base = { muzzleLocal: rig.muzzleLocal, rearLocal: rig.rearLocal, portLocal: rig.portLocal };
    this.solveAds(rig);
    // attachments are positioned now, while the rig is in its identity idle pose
    this.ensureSuppressor(rig).visible = false;
    this.ensureRedDot(rig).visible = false;
    this.ensureLaser(rig).visible = false;
    if (rig.def.drum) this.ensureDrum(rig).visible = false;
    if (rig.parts.scope) rig.scopeSight = this.measureScope(rig);
  }

  // cameras (rig space). ADS: on the sight line, `dist` behind the rear sight. Hip: offset from it.
  solveAds(rig, sight = null) {
    const F = rig.frame, S = rig.S;
    let eye, d, up;
    if (sight) {
      // an optic: look straight down its centre line
      d = sight.front.clone().sub(sight.rear).normalize();
      up = F.u.clone().addScaledVector(d, -F.u.dot(d)).normalize();
      eye = sight.rear.clone().addScaledVector(d, -sight.dist * S);
    } else {
      // iron sights: a line parallel to the bore at front-sight height, eye at the head's depth
      d = F.f.clone();
      up = F.u.clone();
      const n = rig.def.adsNudge || [0, 0, 0];
      const eyeF = Math.max(F.headF - 0.02 * S, F.fR - (rig.def.adsBack || 0.16) * S) + n[2] * S;
      eye = F.c.clone().addScaledVector(F.f, eyeF).addScaledVector(F.u, F.sightU + 0.0012 * S + n[1] * S).addScaledVector(F.r, F.muzR + n[0] * S);
    }
    rig.camAds = basisCam(eye, d, up);
    // hip: the authored head position, looking down the bore, plus small per-rig nudges
    const h = rig.def.hip || [0, 0, 0, 0, 0];
    const hipEye = F.c.clone().addScaledVector(F.f, F.headF + h[2] * S).addScaledVector(F.u, F.headU + h[1] * S).addScaledVector(F.r, F.headR + h[0] * S);
    const hip = basisCam(hipEye, F.f, F.u);
    hip.multiply(new T3.Matrix4().makeRotationFromEuler(new T3.Euler(0, h[3], h[4], 'YXZ')));
    rig.camHip = hip;
    rig.scopedSight = !!(sight && sight.scope);
  }

  // ---- attachments ---------------------------------------------------------------------------
  // weapon: { rig, attachments: Set }
  configure(weapon) {
    const rig = this.rigs[weapon.rig];
    if (!rig) return;
    const at = weapon.attachments || new Set();
    const mount = weapon.def.mount && rig.mounts ? rig.mounts[weapon.def.mount] : null;
    for (const m of rig.gunMeshes) m.visible = !mount;
    for (const [part, meshes] of Object.entries(rig.parts)) for (const m of meshes) m.visible = !mount && at.has(part);
    for (const k of Object.keys(rig.attach)) rig.attach[k].visible = false;
    for (const mo of Object.values(rig.mounts || {})) { mo.holder.visible = false; if (mo.suppressor) mo.suppressor.visible = false; }
    if (mount) {
      mount.holder.visible = true;
      if (mount.suppressor) mount.suppressor.visible = at.has('suppressor');
      rig.muzzleLocal = mount.muzzleLocal;
      rig.rearLocal = mount.rearLocal;
      rig.portLocal = mount.portLocal;
      this.solveAds(rig, mount.sight);
    } else {
      rig.muzzleLocal = rig.base.muzzleLocal;
      rig.rearLocal = rig.base.rearLocal;
      rig.portLocal = rig.base.portLocal;
      if (at.has('suppressor') && !rig.parts.suppressor) rig.attach.suppressor.visible = true;
      if (at.has('reddot') && !at.has('scope')) rig.attach.reddot.visible = true;
      if (weapon.drum && rig.attach.drum) rig.attach.drum.visible = true;
      if (at.has('laser') && rig.attach.laser) rig.attach.laser.visible = true;
      if (at.has('scope') && rig.scopeSight) this.solveAds(rig, rig.scopeSight);
      else if (at.has('reddot')) this.solveAds(rig, rig.attach.reddot.userData.sight);
      else this.solveAds(rig);
    }
    if (rig.attach.drum && rig.drumHides) for (const m of rig.drumHides) m.visible = !weapon.drum;
    rig.suppressed = at.has('suppressor');
  }

  // sight line through a holographic optic's window (its upper part; the housing below is solid)
  measureScope(rig) {
    const F = rig.frame;
    const pts = [];
    const v = new T3.Vector3();
    for (const m of rig.parts.scope) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 3) { m.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(m.matrixWorld).sub(F.c)); } }
    if (!pts.length) return null;
    let fA = Infinity, fB = -Infinity, uA = Infinity, uB = -Infinity;
    for (const p of pts) { const sf = p.dot(F.f), su = p.dot(F.u); fA = Math.min(fA, sf); fB = Math.max(fB, sf); uA = Math.min(uA, su); uB = Math.max(uB, su); }
    const cu = uA + 0.66 * (uB - uA);
    let cr = 0, nr = 0;
    for (const p of pts) if (p.dot(F.u) > uA + 0.55 * (uB - uA)) { cr += p.dot(F.r); nr++; }
    cr = nr ? cr / nr : F.muzR;
    const at3 = (sf) => F.c.clone().addScaledVector(F.f, sf).addScaledVector(F.u, cu).addScaledVector(F.r, cr);
    return { rear: at3(fA), front: at3(fB), dist: 0.13, scope: true };
  }

  // mount a separate (static) weapon model on this rig's weapon bone: bore along the rig's bore,
  // real-world length, grip seated at the rig's shooting hand
  buildMount(rig, id, def, gltf) {
    const F = rig.frame, S = rig.S;
    const obj = gltf.scene;
    obj.updateMatrixWorld(true);
    const pts = [], mats = [];
    const v = new T3.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      o.frustumCulled = false;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(v.clone()); mats.push(o.material ? o.material.name : ''); }
    });
    let c = new T3.Vector3();
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
    let ax = [1, 0.1, 0.1];
    for (let k = 0; k < 60; k++) { const nn = [0, 1, 2].map((a) => C[a][0] * ax[0] + C[a][1] * ax[1] + C[a][2] * ax[2]); const l = Math.hypot(...nn); ax = nn.map((x) => x / l); }
    const a = new T3.Vector3(...ax).normalize();
    let up = new T3.Vector3(0, 1, 0).addScaledVector(a, -a.y).normalize();
    const sf = (p) => p.clone().sub(c).dot(a);
    const sorted = pts.map(sf).sort((x, y) => x - y);
    let fMin = sorted[Math.floor(sorted.length * 0.01)], fMax = sorted[Math.floor(sorted.length * 0.995)];
    let L = fMax - fMin;
    // the muzzle is the thin end
    const spread = (lo, hi) => { let s2 = 0, n = 0; for (const p of pts) { const t = sf(p); if (t >= lo && t <= hi) { const d = p.clone().sub(c); s2 += d.addScaledVector(a, -d.dot(a)).length(); n++; } } return n ? s2 / n : 0; };
    if (spread(fMax - L * 0.06, fMax) > spread(fMin, fMin + L * 0.06)) { a.negate(); [fMin, fMax] = [-fMax, -fMin]; }
    up = up.addScaledVector(a, -up.dot(a)).normalize();
    // the optic sits on top
    const optic = pts.filter((p, i) => /scope|lens/i.test(mats[i]));
    if (optic.length) { const oc = new T3.Vector3(); for (const p of optic) oc.add(p); oc.multiplyScalar(1 / optic.length); if (oc.sub(c).dot(up) < 0) up.negate(); }
    const rr = new T3.Vector3().crossVectors(a, up).normalize();
    const mean = (list) => { const m = new T3.Vector3(); for (const p of list) m.add(p); return list.length ? m.multiplyScalar(1 / list.length) : null; };
    const Mc = mean(pts.filter((p) => sf(p) > fMax - L * 0.015));
    const Bc = mean(pts.filter((p) => sf(p) < fMin + L * 0.04));
    const k = ((def.length || 1.09) * S) / L;
    // the grip point on the model's bore line
    const Xg = Mc.clone().addScaledVector(a, -L * (1 - (def.grip ?? 0.3)));
    let hand = null;
    rig.root.traverse((o) => { if (!hand && o.isBone && /^Hand_R/.test(o.name)) hand = o; });
    const Hr = hand ? new T3.Vector3().setFromMatrixPosition(hand.matrixWorld) : F.c.clone();
    const hf = Hr.clone().sub(F.c).dot(F.f);
    const off = def.offset || [0, 0, 0];
    const Tg = F.c.clone().addScaledVector(F.f, hf + off[2] * S).addScaledVector(F.u, F.muzU + off[1] * S).addScaledVector(F.r, F.muzR + off[0] * S);
    const Mm = new T3.Matrix4().makeBasis(rr, up, a), Mr = new T3.Matrix4().makeBasis(F.r, F.u, F.f);
    const Q = new T3.Quaternion().setFromRotationMatrix(Mr.multiply(Mm.transpose()));
    const pos = Tg.clone().sub(Xg.clone().multiplyScalar(k).applyQuaternion(Q));
    const world = new T3.Matrix4().compose(pos, Q, new T3.Vector3(k, k, k));
    const toRig = (p) => p.clone().multiplyScalar(k).applyQuaternion(Q).add(pos);
    const gunInv = rig.gun.matrixWorld.clone().invert();
    const holder = new T3.Group();
    gunInv.clone().multiply(world).decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    holder.visible = false;
    rig.gun.add(holder);
    const muzzleRig = toRig(Mc), rearRig = toRig(Bc);
    const mount = {
      id, holder,
      muzzleLocal: muzzleRig.clone().applyMatrix4(gunInv),
      rearLocal: rearRig.clone().applyMatrix4(gunInv),
      portLocal: rearRig.clone().lerp(muzzleRig, 0.42).addScaledVector(F.u, 0.03 * S).addScaledVector(F.r, 0.015 * S).applyMatrix4(gunInv),
    };
    // sight: down the middle of the optic
    if (optic.length) {
      const op = optic.map(toRig).map((p) => p.sub(F.c));
      let fA = Infinity, fB = -Infinity, cu = 0, cr = 0;
      for (const p of op) { const t = p.dot(F.f); fA = Math.min(fA, t); fB = Math.max(fB, t); cu += p.dot(F.u); cr += p.dot(F.r); }
      cu /= op.length; cr /= op.length;
      const at3 = (t) => F.c.clone().addScaledVector(F.f, t).addScaledVector(F.u, cu).addScaledVector(F.r, cr);
      mount.sight = { rear: at3(fA), front: at3(fB), dist: 0.09, scope: true };
    }
    // a suppressor sized for it, hidden unless fitted
    const g = new T3.CylinderGeometry(0.021, 0.021, 0.2, 20, 1).rotateX(Math.PI / 2).translate(0, 0, -0.1 + 0.01);
    const sup = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.7 }));
    mount.suppressor = this.attachToGun(rig, sup, muzzleRig, this.frameQuat(rig));
    mount.suppressor.visible = false;
    rig.mounts[id] = mount;
  }

  attachToGun(rig, obj, rigPos, rigQuat, bone = rig.gun) {
    const world = new T3.Matrix4().compose(rigPos, rigQuat, new T3.Vector3(rig.S, rig.S, rig.S));
    const local = bone.matrixWorld.clone().invert().multiply(world);
    const holder = new T3.Group();
    local.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    bone.add(holder);
    return holder;
  }

  frameQuat(rig) {
    const F = rig.frame;
    // object space: +Z towards the muzzle, +Y up (measured; F.f runs from muzzle to stock)
    return new T3.Quaternion().setFromRotationMatrix(new T3.Matrix4().makeBasis(F.r.clone().negate(), F.u, F.f.clone().negate()));
  }

  ensureSuppressor(rig) {
    if (rig.attach.suppressor) return rig.attach.suppressor;
    const nine = rig.def.caliber === '9mm';
    const rad = nine ? 0.016 : 0.019, L = nine ? 0.15 : 0.19;
    // attachment object space has +Z towards the muzzle: the can extends forward from it
    const g = new T3.CylinderGeometry(rad, rad, L, 20, 1).rotateX(Math.PI / 2).translate(0, 0, L / 2 - 0.01);
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.7 }));
    rig.attach.suppressor = this.attachToGun(rig, m, rig.frame.muzzle, this.frameQuat(rig));
    return rig.attach.suppressor;
  }

  ensureRedDot(rig) {
    if (rig.attach.reddot) return rig.attach.reddot;
    const F = rig.frame;
    const sr = F.sightRear || F.rear, sf = F.sightFront || F.muzzle;
    const base = sr.clone().lerp(sf, 0.12);
    const grp = new T3.Group();
    const body = new T3.MeshStandardMaterial({ color: 0x151617, roughness: 0.5, metalness: 0.6 });
    const h = 0.036;
    const tubeMat = body.clone();
    tubeMat.side = T3.DoubleSide;
    const tube = new T3.Mesh(new T3.CylinderGeometry(0.017, 0.017, 0.045, 24, 1, true).rotateX(Math.PI / 2), tubeMat);
    tube.position.set(0, h, 0);
    const mount = new T3.Mesh(new T3.BoxGeometry(0.014, h - 0.02, 0.03), body);
    mount.position.set(0, (h - 0.02) / 2, 0);
    const lens = new T3.Mesh(new T3.RingGeometry(0, 0.016, 24), new T3.MeshBasicMaterial({ color: 0x88a0b0, transparent: true, opacity: 0.1, depthWrite: false }));
    lens.position.set(0, h, -0.02);
    const dot = new T3.Mesh(new T3.SphereGeometry(0.0008, 8, 6), new T3.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
    dot.position.set(0, h, -0.022);
    grp.add(tube, mount, lens, dot);
    rig.attach.reddot = this.attachToGun(rig, grp, base, this.frameQuat(rig));
    const S = rig.S;
    rig.attach.reddot.userData.sight = {
      rear: base.clone().addScaledVector(F.u, h * S).addScaledVector(F.f, -0.025 * S),
      front: base.clone().addScaledVector(F.u, h * S).addScaledVector(F.f, 0.025 * S),
      dist: 0.13,
    };
    return rig.attach.reddot;
  }

  // laser module: on the left side rail of long guns (the side the camera sees), under the pistol
  ensureLaser(rig) {
    if (rig.attach.laser) return rig.attach.laser;
    const F = rig.frame, S = rig.S, pistol = rig.id === 'pistol';
    const at = F.rear.clone().lerp(F.muzzle, pistol ? 0.7 : (rig.def.laserAt || 0.64));
    // long guns: on top of the handguard (the hands cover the side rails); pistols: under the slide
    if (pistol) at.addScaledVector(F.u, -0.034 * S);
    else at.addScaledVector(F.u, this.surfaceAbove(rig, at) + 0.0135 * S);
    const body = new T3.MeshStandardMaterial({ color: 0x17181a, roughness: 0.55, metalness: 0.55 });
    const grp = new T3.Group();
    const box = new T3.Mesh(new T3.BoxGeometry(0.022, 0.026, 0.07), body);
    const lens = new T3.Mesh(new T3.CylinderGeometry(0.005, 0.005, 0.004, 14).rotateX(Math.PI / 2), new T3.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
    lens.position.set(0, 0.004, 0.0365); // emitter faces the muzzle (+Z)
    const lens2 = new T3.Mesh(new T3.CylinderGeometry(0.0045, 0.0045, 0.004, 14).rotateX(Math.PI / 2), new T3.MeshBasicMaterial({ color: 0x223040 }));
    lens2.position.set(0, -0.006, 0.0365);
    const btn = new T3.Mesh(new T3.BoxGeometry(0.01, 0.006, 0.016), new T3.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.7 }));
    btn.position.set(0, 0.0145, -0.02);
    grp.add(box, lens, lens2, btn);
    rig.attach.laser = this.attachToGun(rig, grp, at, this.frameQuat(rig));
    rig.attach.laser.userData.lens = lens;
    return rig.attach.laser;
  }

  // height of the gun's top surface above a point on the bore line (rig space, idle pose)
  surfaceAbove(rig, at) {
    const F = rig.frame, S = rig.S, v = new T3.Vector3(), d = new T3.Vector3();
    let best = -Infinity;
    for (const m of rig.gunMeshes) {
      const pos = m.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / 8000));
      for (let i = 0; i < pos.count; i += st) {
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld);
        d.subVectors(v, at);
        if (Math.abs(d.dot(F.f)) > 0.02 * S || Math.abs(d.dot(F.r)) > 0.03 * S) continue;
        best = Math.max(best, d.dot(F.u));
      }
    }
    return Number.isFinite(best) ? best : 0.02 * S;
  }

  ensureDrum(rig) {
    if (rig.attach.drum) return rig.attach.drum;
    // RPK-style drum hung under the receiver, riding the magazine bone during reloads
    const magBone = rig.root.getObjectByName('Pmag_062') || rig.root.getObjectByName('Pmag_061') || rig.gun;
    const F = rig.frame;
    const at = F.rear.clone().lerp(F.muzzle, 0.4).addScaledVector(F.u, -0.085 * rig.S);
    const g = new T3.CylinderGeometry(0.085, 0.085, 0.07, 28).rotateZ(Math.PI / 2);
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.55, metalness: 0.5 }));
    m.add(new T3.Mesh(new T3.TorusGeometry(0.07, 0.006, 6, 28).rotateY(Math.PI / 2), m.material));
    rig.attach.drum = this.attachToGun(rig, m, at, this.frameQuat(rig), magBone);
    return rig.attach.drum;
  }

  // ---- switching -------------------------------------------------------------------------------
  async equip(weapon, instant = false) {
    // only the latest request wins when rigs finish loading out of order
    const tok = (this.equipTok = (this.equipTok || 0) + 1);
    const rig = await this.prepare(weapon.rig);
    if (tok !== this.equipTok || !rig) return;
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

  // the sprint carry: a pose by weapon kind plus a stride-locked swing (bounce twice a stride,
  // sway and roll once), faded in and out by this.sprint
  sprintPose(dt, st, hasRun) {
    const o = this._sp || (this._sp = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, ph: 0 });
    const k = this.sprint * (1 - this.ads);
    // stride phase from the distance covered (about 2.3 m per left-right stride when sprinting)
    o.ph = (o.ph + dt * Math.max(st.speed || 0, 0) / 2.3 * TAU) % TAU;
    o.x = o.y = o.z = o.pitch = o.yaw = o.roll = 0;
    if (k < 1e-3) return o;
    const ph = o.ph, sw = Math.sin(ph), bn = Math.abs(Math.sin(ph)) - 0.64;
    const pistol = this.cur && this.cur.def.caliber === '9mm' && !this.cur.def.clips.run;
    const kp = hasRun ? 0 : k; // the pose itself only where no run clip provides one
    const pose = pistol ? SPRINT_POSE.pistol : !hasRun ? SPRINT_POSE.long : null;
    if (pose) {
      o.x = pose[0] * kp; o.y = pose[1] * kp; o.z = pose[2] * kp;
      o.pitch = pose[3] * kp; o.yaw = pose[4] * kp; o.roll = pose[5] * kp;
    }
    const swing = hasRun ? 0.35 : 1;
    o.x += sw * 0.016 * k * swing;
    o.y += bn * 0.016 * k * swing;
    o.roll += sw * 0.09 * k * swing;
    o.yaw += sw * 0.05 * k * swing;
    o.pitch += Math.cos(2 * ph) * 0.035 * k * swing;
    return o;
  }

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
    if (locoLayer && this.loco === clips.walk) locoLayer.speed = clamp(st.speed / 3.3, 0.6, st.sprint && !clips.run ? 1.1 : 1.4);
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

    // compose: P (procedural, camera space) * inverse(camera blended between hip and ADS)
    rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
    const a = this.ads;
    const hp = new T3.Vector3(), hqq = new T3.Quaternion(), ap = new T3.Vector3(), aqq = new T3.Quaternion(), tmpS = new T3.Vector3();
    rig.camHip.decompose(hp, hqq, tmpS);
    rig.camAds.decompose(ap, aqq, tmpS);
    const ease = a * a * (3 - 2 * a);
    const C = new T3.Matrix4().compose(hp.lerp(ap, ease), hqq.slerp(aqq, ease), new T3.Vector3(1, 1, 1));
    const pos = new T3.Vector3();
    const bobT = this.t * 7.5;
    const bobAmt = st.onGround ? clamp(st.speed / 4, 0, 1) * (1 - 0.85 * a) * 0.004 : 0;
    pos.x += Math.sin(bobT * 0.5) * bobAmt + this.sx.x * 0.02 * (1 - a * 0.7);
    pos.y += Math.abs(Math.cos(bobT * 0.5)) * bobAmt - this.sy.x * 0.015 + this.dip.x * 0.01 - this.lower.x * 0.28 - this.crouch * 0.008 * (1 - a) - this.wallPush * 0.07;
    pos.z += this.kz.x * 0.01 + this.wallPush * 0.035 - this.lower.x * 0.05;
    pos.x += this.wallPush * 0.03;
    // sprinting: rigs without a run clip (pistol, shotguns, bolt rifle) carry the weapon in a
    // procedural sprint pose (a pistol tucked low and canted in, a long gun swung across the
    // chest) that swings with the stride; rigs with a run clip only get the stride swing
    const sp = this.sprintPose(dt, st, !!clips.run);
    pos.x += sp.x; pos.y += sp.y; pos.z += sp.z;
    const e = new T3.Euler(
      this.kp.x * 0.012 + this.sy.x * 0.05 - this.lower.x * 0.9 - this.wallPush * 0.55 + this.aimY,
      this.ky.x * 0.01 + this.sx.x * 0.06 + this.aimX - this.wallPush * 0.25,
      this.kr.x * 0.012 + this.sr.x * 0.05 + this.crouch * 0.05 * (1 - a) - this.wallPush * 0.45,
      'YXZ',
    );
    const proc = new T3.Quaternion().setFromEuler(e);
    // rotate about a pivot behind the grip so recoil reads as a wrist rotation
    const pivot = new T3.Vector3(0.05, -0.12, 0.05).multiplyScalar(1 - a);
    // the sprint carry turns the weapon about its own middle (where it sits at the hip), so the
    // muzzle swings out while the hands stay with it rather than sweeping across the view
    const gm = this.gunMid || (this.gunMid = new T3.Vector3(0.08, -0.12, -0.35));
    const spq = new T3.Quaternion().setFromEuler(new T3.Euler(sp.pitch, sp.yaw, sp.roll, 'YXZ'));
    const P = new T3.Matrix4().makeTranslation(pos.x, pos.y, pos.z)
      .multiply(new T3.Matrix4().makeTranslation(gm.x, gm.y, gm.z))
      .multiply(new T3.Matrix4().makeRotationFromQuaternion(spq))
      .multiply(new T3.Matrix4().makeTranslation(-gm.x, -gm.y, -gm.z))
      .multiply(new T3.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(new T3.Matrix4().makeRotationFromQuaternion(proc))
      .multiply(new T3.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    // rig space is scaled; the procedural offsets are in metres
    const Sinv = 1 / rig.S;
    const R = P.multiply(new T3.Matrix4().makeScale(Sinv, Sinv, Sinv)).multiply(C.invert());
    R.decompose(rig.root.position, rig.root.quaternion, rig.root.scale);
    rig.root.updateMatrixWorld(true);
    if (this.sprint < 0.02 && a < 0.05 && rig.muzzleLocal && rig.rearLocal) {
      const m0 = rig.muzzleLocal.clone().applyMatrix4(rig.gun.matrixWorld), r0 = rig.rearLocal.clone().applyMatrix4(rig.gun.matrixWorld);
      (this.gunMid || (this.gunMid = new T3.Vector3())).copy(m0).add(r0).multiplyScalar(0.5);
    }
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
