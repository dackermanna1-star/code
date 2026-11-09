// Armed enemies on the engine's active ragdolls: rendering (Rocketbox characters, wounds,
// held weapons, lights), the combat AI and the manager that spawns, scores and cleans them up.

const WOUND_MAX = 14;
const SEG_MULT = { head: 3.6, neck: 2.6, chest: 1.2, abdomen: 1.0, pelvis: 0.9, upperArmL: 0.55, upperArmR: 0.55, forearmL: 0.45, forearmR: 0.45, handL: 0.35, handR: 0.35, thighL: 0.7, thighR: 0.7, shinL: 0.5, shinR: 0.5, footL: 0.35, footR: 0.35 };

const WOUND_GLSL = /* glsl */ `
uniform vec4 uWoundA[${WOUND_MAX}];
uniform vec4 uWoundB[${WOUND_MAX}];
uniform int uWoundN;
uniform vec4 uTint;
float woundWet = 0.0;
`;

// ---- rendering ---------------------------------------------------------------------------------
class CharacterRender {
  constructor(game, person, gltf, opts = {}) {
    this.game = game;
    this.person = person;
    const scene = game.view.scene;
    this.scene = scene;
    this.binder = new Lab.RocketboxBinder(gltf, person, scene);
    this.wounds = [];
    this.uA = { value: Array.from({ length: WOUND_MAX }, () => new T3.Vector4(0, -99, 0, 0)) };
    this.uB = { value: Array.from({ length: WOUND_MAX }, () => new T3.Vector4()) };
    this.uN = { value: 0 };
    this.uTint = { value: new T3.Vector4(...(opts.tint || [1, 1, 1, 0])) };
    for (const mesh of this.binder.meshes) {
      const m = mesh.material.clone();
      if (m.map) m.map.anisotropy = 4;
      if (m.name && /hair|opacity/i.test(m.name)) { m.alphaTest = 0.4; m.transparent = false; m.side = T3.DoubleSide; }
      patchLattice(m, game.view.shared, {
        key: 'character',
        uniforms: { uWoundA: this.uA, uWoundB: this.uB, uWoundN: this.uN, uTint: this.uTint },
        fragmentHead: WOUND_GLSL,
        color: /* glsl */ `
          {
            diffuseColor.rgb *= uTint.rgb;
            vec3 P = vLatP;
            vec3 N = normalize(vLatN);
            float hole = 0.0, soak = 0.0, rim = 0.0;
            for (int i = 0; i < ${WOUND_MAX}; i++) {
              if (i >= uWoundN) break;
              vec4 A = uWoundA[i]; vec4 B = uWoundB[i];
              vec3 d = P - A.xyz;
              float dn = length(d);
              if (dn > 0.4) continue;
              if (dot(N, B.xyz) < -0.35) continue;
              float r = A.w;
              // blood runs down from the wound
              vec3 dd = vec3(d.x, d.y > 0.0 ? d.y * 1.6 : d.y * 0.32, d.z);
              float sr = r * (2.6 + min(B.w, 25.0) * 0.32);
              soak = max(soak, smoothstep(sr, sr * 0.25, length(dd)));
              rim = max(rim, smoothstep(r * 2.0, r * 0.9, dn));
              hole = max(hole, smoothstep(r * 0.95, r * 0.35, dn));
            }
            float gore = uTint.a;
            vec3 blood = mix(vec3(0.24, 0.018, 0.012), vec3(0.08, 0.008, 0.006), 0.45);
            diffuseColor.rgb = mix(diffuseColor.rgb, blood, soak * 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.01, 0.01), rim);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.0, 0.0), hole);
            woundWet = max(soak * 0.8, rim);
            if (gore > 0.0) {
              float n = fract(sin(dot(floor(P * 18.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
              float splat = smoothstep(0.7, 0.95, n) * gore;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.01, 0.01), splat * 0.7);
            }
          }`,
        roughness: 'roughnessFactor = mix(roughnessFactor, 0.22, woundWet);',
      });
      mesh.material = m;
    }
    this.gun = null;
    this.flashT = 0;
    this.visibleGun = false;
  }

  addWound(w) {
    if (!w || !w.body) return;
    const kind = w.kind;
    if (kind !== 'entry' && kind !== 'exit' && kind !== 'laceration') return;
    const r = kind === 'exit' ? 0.022 + Math.min(0.03, (w.radius || 0.01) * 1.2) : kind === 'laceration' ? 0.018 : 0.011;
    this.wounds.push({ body: w.body, local: w.local.clone(), normal: (w.normal || new I(0, 0, 1)).clone(), r, t: 0 });
    if (this.wounds.length > WOUND_MAX) this.wounds.shift();
  }

  setGun(type, extras = {}) {
    const m = Lab.weaponModel(type).clone();
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // per-instance meshes to free later: [mesh, its material is ours too]
    const own = (this.owned = []);
    if (extras.drum) {
      const drum = new T3.Mesh(new T3.CylinderGeometry(0.08, 0.08, 0.07, 22).rotateZ(Math.PI / 2), new T3.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6, metalness: 0.5 }));
      drum.position.set(0, -0.08, -0.18);
      m.add(drum);
      own.push([drum, true]);
    }
    const muzzle = new T3.Vector3(...(m.userData.muzzle || [0, 0.08, -0.5]));
    this.muzzleLocal = muzzle;
    if (extras.light) {
      const cone = new T3.Mesh(new T3.CylinderGeometry(0.75, 0.015, 5, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -2.5), CharacterRender.beamMaterial());
      cone.position.set(0, muzzle.y - 0.035, muzzle.z + 0.14);
      cone.renderOrder = 6;
      const lens = new T3.Mesh(new T3.SphereGeometry(0.014, 10, 8), new T3.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      lens.position.copy(cone.position);
      const glare = new T3.Mesh(new T3.PlaneGeometry(1, 1), CharacterRender.glareMaterial());
      glare.renderOrder = 7;
      this.scene.add(glare);
      m.add(cone, lens);
      own.push([cone, false], [lens, true], [glare, true]);
      this.beam = cone;
      this.lens = lens;
      this.glare = glare;
    }
    if (extras.laser) {
      const g = new T3.BufferGeometry().setFromPoints([new T3.Vector3(), new T3.Vector3(0, 0, -1)]);
      this.laser = new T3.Line(g, new T3.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
      this.laser.frustumCulled = false;
      this.laser.position.copy(muzzle);
      m.add(this.laser);
      this.laserDot = new T3.Mesh(new T3.SphereGeometry(0.018, 8, 6), new T3.MeshBasicMaterial({ color: 0xff3030, toneMapped: false, fog: false }));
      this.scene.add(this.laserDot);
      own.push([this.laser, true], [this.laserDot, true]);
    }
    const flash = Lab.muzzleFlashMesh();
    flash.visible = false;
    flash.position.copy(muzzle);
    flash.rotation.y = Math.PI; // the flash mesh points down -z already; keep it pointing out of the barrel
    flash.scale.setScalar(1.2);
    m.add(flash);
    this.flash = flash;
    this.scene.add(m);
    this.gun = m;
    this.visibleGun = true;
  }

  static beamMaterial() {
    return Lab.cached('br:beam-mat', () => new T3.ShaderMaterial({
      uniforms: { uColor: { value: new T3.Color(1.0, 0.94, 0.8) }, uOpacity: { value: 0.16 } },
      vertexShader: `varying vec3 vW; varying vec3 vN; varying float vAlong;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vAlong = uv.y;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vW; varying vec3 vN; varying float vAlong;
        void main() { vec3 V = normalize(cameraPosition - vW); float facing = abs(dot(normalize(vN), V));
          float camD = length(cameraPosition - vW);
          float a = uOpacity * facing * facing * pow(1.0 - vAlong, 1.6) * smoothstep(0.4, 2.5, camD);
          gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true, depthWrite: false, blending: T3.AdditiveBlending, side: T3.DoubleSide,
    }));
  }

  static glareMaterial() {
    const tex = Lab.cached('br:glare-tex', () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,250,1)'); grd.addColorStop(0.08, 'rgba(255,248,225,0.9)');
      grd.addColorStop(0.3, 'rgba(255,230,180,0.22)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(0, 62, 128, 4);
      const t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; return t;
    });
    return new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, blending: T3.AdditiveBlending, toneMapped: false, opacity: 0, fog: false });
  }

  dropGun() {
    if (!this.gun) return null;
    const g = this.gun;
    this.gun = null;
    const loose = (this.owned || []).filter(([o]) => o === this.glare || o === this.laserDot);
    if (this.glare) { this.scene.remove(this.glare); this.glare = null; }
    if (this.laserDot) { this.scene.remove(this.laserDot); this.laserDot = null; }
    disposeTree(null, loose);
    // what stays on the dropped weapon is freed with the pickup
    g.userData.owned = (this.owned || []).filter((x) => !loose.includes(x));
    this.owned = [];
    if (this.beam) this.beam.visible = false;
    if (this.laser) this.laser.visible = false;
    return g;
  }

  muzzleWorld(out) {
    if (!this.gun) return null;
    return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
  }

  update(simDt, dt, alpha, person) {
    this.binder.update(alpha);
    // wounds follow their bodies
    const n = this.wounds.length;
    for (let i = 0; i < n; i++) {
      const w = this.wounds[i];
      w.t += dt;
      const b = w.body;
      const p = b.localToWorld(w.local, new I());
      const nn = b.localDirToWorld(w.normal, new I());
      this.uA.value[i].set(p.x, p.y, p.z, w.r);
      this.uB.value[i].set(nn.x, nn.y, nn.z, w.t);
    }
    this.uN.value = n;
    // weapon in the hands
    const ai = person.enemy;
    if (this.gun && ai) {
      const hand = person.rd.segments.handR.body;
      const fp = hand.framePos || hand.pos;
      const hp = new T3.Vector3(fp.x + (hand.pos.x - fp.x) * alpha, fp.y + (hand.pos.y - fp.y) * alpha, fp.z + (hand.pos.z - fp.z) * alpha);
      if (ai.anim && ai.anim.active) {
        // animated: the hands hold it, grip to handguard
        this.gun.quaternion.slerp(ai.anim.gunQ, 1 - Math.exp(-dt * 30));
      } else if (ai.aiming && person.ctl.mode === 'balance') {
        this.gun.quaternion.slerp(ai.aimQ, 1 - Math.exp(-dt * 25));
      } else {
        const r = hand.rot;
        const hq = new T3.Quaternion(r.x, r.y, r.z, r.w);
        // low ready: muzzle down and forward from the hand
        const low = new T3.Quaternion().setFromEuler(new T3.Euler(-0.55, person.ctl.heading + Math.PI, 0, 'YXZ'));
        this.gun.quaternion.slerp(person.ctl.mode === 'balance' ? low : hq, 1 - Math.exp(-dt * 10));
      }
      this.gun.position.copy(hp).add(new T3.Vector3(0, -0.015, 0));
      this.gun.updateMatrixWorld(true);
      // sniper laser: length set by the AI's last ray
      if (this.laser) {
        const on = ai.lasing > 0 && person.ctl.mode === 'balance';
        this.laser.visible = on;
        this.laserDot.visible = on;
        if (on) {
          this.laser.scale.set(1, 1, ai.laserLen || 20);
          const m = this.muzzleWorld(new T3.Vector3());
          const d = new T3.Vector3(0, 0, -1).applyQuaternion(this.gun.quaternion);
          this.laserDot.position.copy(m).addScaledVector(d, (ai.laserLen || 20) - 0.02);
          this.laser.material.opacity = 0.5 + 0.4 * Math.min(1, ai.lasing);
        }
      }
      if (this.glare) {
        // a torch pointed at the camera flares; less so in a lit room
        const cam = this.game.camera.position;
        const lp = this.lens.getWorldPosition(new T3.Vector3());
        const fwd = new T3.Vector3(0, 0, -1).applyQuaternion(this.gun.quaternion);
        const toCam = cam.clone().sub(lp);
        const dist = toCam.length();
        const facing = Math.max(0, fwd.dot(toCam.normalize()));
        const dark = clamp(1.2 - this.game.view.lightAt(lp.x, 1.2, lp.z), 0.25, 1);
        this.glare.position.copy(lp).addScaledVector(toCam, 0.05);
        this.glare.quaternion.copy(this.game.camera.quaternion);
        this.glare.scale.setScalar(0.25 + 0.9 * facing ** 6 * Math.min(1, dist / 6));
        this.glare.material.opacity = facing ** 10 * dark * (person.ctl.mode === 'balance' ? 1 : 0.3);
      }
    }
    if (this.flash) {
      this.flashT -= dt;
      this.flash.visible = this.flashT > 0;
    }
  }

  muzzleFlash() {
    if (!this.flash) return;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * TAU;
    this.flash.scale.setScalar(1 + Math.random() * 0.6);
  }

  dispose() {
    this.binder.dispose();
    for (const m of this.binder.meshes) m.material.dispose();
    if (this.gun) this.scene.remove(this.gun);
    if (this.laserDot) this.scene.remove(this.laserDot);
    if (this.glare) this.scene.remove(this.glare);
    disposeTree(null, this.owned || []);
    this.owned = [];
  }
}

// ---- AI ----------------------------------------------------------------------------------------
const _ta = new T3.Vector3(), _tb = new T3.Vector3();

class Gunman {
  constructor(mgr, person, type, gunId, scale) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.p = person;
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.gunId = gunId;
    this.gun = ENEMY_GUNS[gunId];
    this.scale = scale; // wave difficulty multipliers
    this.toughMax = this.def.tough * scale.tough;
    this.tough = this.toughMax;
    this.ammo = this.gun.mag;
    this.reloadT = 0;
    this.cool = 0.5 + Math.random();
    this.burstLeft = 0;
    this.burstPause = 0;
    this.thinkT = Math.random() * 0.3;
    this.perceiveT = Math.random() * 0.2;
    this.knows = false;
    this.visible = false;
    this.visT = 0;
    this.lastSeen = null;
    this.lastSeenT = -99;
    this.goal = null;
    this.goalSpeed = 0;
    this.pathT = 0;
    this.mode = 'hunt';
    this.modeT = 0;
    this.cover = null;
    this.suppressed = 0;
    this.aiming = false;
    this.aimQ = new T3.Quaternion();
    this.aimDir = new T3.Vector3(0, 0, 1);
    this.lasing = 0;
    this.laserLen = 20;
    this.token = false;
    this.downed = false;
    this.target = null; // engine compatibility (walker crowd logic)
    this.lastHit = null;
    this.turnT = 0;
    this.grenadeT = 6 + Math.random() * 8;
    this.barkT = 2 + Math.random() * 4;
    this.flankSide = Math.random() < 0.5 ? -1 : 1;
    const c = person.ctl;
    c.fearless = this.def.role === 'rush' || this.def.role === 'push';
    c.driveGain = 2.4;
    c.driveMax = 0.18;
    c.walkLean = 0.1;
    c.assistTilt = 0.2;
    c.loco.catchMargin = 0.28;
    c.violationAssist = 1.6;
    c.loco.maxSpeed = this.def.speed * scale.speed;
    if (this.def.strength) c.strengthScale = this.def.strength;
    c.armDriver = (dt) => this.driveArms(dt);
    this.applyAssist();
  }

  applyAssist() {
    const c = this.p.ctl;
    c.assistGain *= 1.35;
    c.vAssist *= 2;
  }

  get pos() { return this.p.rd.pelvis.pos; }
  get headPos() { return this.p.rd.segments.head.body.pos; }

  combatEffective() {
    const c = this.p.ctl, inj = this.p.injury;
    if (this.downed || !c.alive || !c.conscious || this.tough <= 0) return false;
    if (inj.status === 'critical' && c.mode !== 'balance') return false;
    if (Math.min(c.armStrength.L, c.armStrength.R) < 0.12 && c.mode !== 'balance') return false;
    return true;
  }

  // called from the sandbox every simulation step
  update(dt) {
    const c = this.p.ctl;
    if (this.downed) { this.aiming = false; this.lasing = 0; return; }
    if (!this.combatEffective()) { this.mgr.down(this); return; }
    const game = this.game, P = game.player;
    this.modeT += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.suppressed = Math.max(0, this.suppressed - dt * 0.4);
    this.grenadeT -= dt;
    this.barkT -= dt;
    if (c.mode !== 'balance') { this.aiming = false; this.lasing = 0; this.releaseToken(); return; }
    // perception at ~6 Hz
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.16 + Math.random() * 0.06; this.perceive(); }
    if (this.visible) this.visT += dt; else this.visT = 0;
    // reloading
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.aiming = false;
      if (this.reloadT <= 0) this.ammo = this.gun.mag;
    }
    // think at ~3 Hz
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.15; this.think(); }
    // look and aim
    const eyeT = P.eye(new I());
    if (this.knows) c.lookTarget = this.visible ? eyeT : new I(this.lastSeen.x, 1.5, this.lastSeen.z);
    this.updateAim(dt);
    this.updateFire(dt);
  }

  perceive() {
    const game = this.game, P = game.player, L = game.level;
    if (!P.alive) { this.visible = false; return; }
    const head = this.headPos;
    const eye = P.eye(new I());
    const d = Math.hypot(eye.x - head.x, eye.z - head.z);
    const c = this.p.ctl;
    const ang = Math.abs(wrapAngle(Math.atan2(eye.x - head.x, eye.z - head.z) - c.heading));
    let canSee = d < 48 && (ang < 1.3 || d < 5 || this.knows) && L.visible(head, eye);
    if (canSee && !this.knows) {
      // darkness and distance make an unaware enemy slower to spot the player
      const light = game.view.lightAt(eye.x, 1.2, eye.z);
      const firing = game.time - (game.lastShotT || -9) < 1.2;
      const chance = clamp((light * 0.9 + 0.15) * (1.4 - d / 35) + (firing ? 0.6 : 0), 0.05, 1);
      if (Math.random() > chance) canSee = false;
    }
    const was = this.visible;
    this.visible = canSee;
    if (canSee) {
      const fresh = !this.knows || !was;
      this.knows = true;
      this.lastSeen = new I(P.pos.x, 0, P.pos.z);
      this.lastSeenT = game.time;
      if (fresh) this.mgr.spotted(this); // the callout carries where the player is now
    }
  }

  hear(pos, noise = 2) {
    if (this.downed) return;
    this.knows = true;
    if (!this.visible) {
      this.lastSeen = new I(pos.x + (Math.random() - 0.5) * noise, 0, pos.z + (Math.random() - 0.5) * noise);
      this.lastSeenT = this.game.time - 0.5;
    }
  }

  // ---- decisions ----
  think() {
    const game = this.game, L = game.level, P = game.player, def = this.def;
    const pos = this.pos;
    const dist = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
    const recent = game.time - this.lastSeenT < 5;
    const eye = P.eye(new I());
    this.wantFire = false;
    this.suppressFire = null;
    if (!this.knows || !this.lastSeen) {
      // wander towards the noise of the fight
      if (!this.p.ctl.walking || this.modeT > 6) {
        const hint = this.mgr.playerHint(this);
        this.moveTo(hint, def.speed * 0.6);
        this.modeT = 0;
      }
      return;
    }
    if (this.reloadT > 0) {
      if (def.cover > 0.3 && this.visible && !this.inCover()) this.seekCover(eye, true);
      return;
    }
    // grenades flush a player who hides
    if (def.grenade && this.grenadeT <= 0 && !this.visible && recent && dist > 5 && dist < 20 && Math.random() < def.grenade) {
      this.grenadeT = 12 + Math.random() * 10;
      this.mgr.launchGrenade(this, this.lastSeen);
      return;
    }
    switch (def.role) {
      case 'rush':
      case 'push':
        this.moveTo(this.visible && dist < 2.2 ? null : this.lastSeen, def.speed * this.scale.speed, 1.4);
        this.wantFire = this.visible && dist < this.gun.range;
        if (def.role === 'push') this.wantFire = this.visible;
        break;
      case 'sniper':
        this.thinkSniper(dist, eye, recent);
        break;
      case 'suppress':
        if (this.visible) {
          this.wantFire = true;
          if (dist > 16) this.moveTo(this.lastSeen, def.speed * 0.6, 3);
          else this.stop();
        } else if (recent && game.time - this.lastSeenT < 2.5 && this.mgr.lineToPoint(this, this.lastSeen)) {
          this.suppressFire = new I(this.lastSeen.x, 1.1, this.lastSeen.z);
          this.wantFire = true;
          this.stop();
        } else this.moveTo(this.lastSeen, def.speed * this.scale.speed, 2);
        break;
      default:
        this.thinkSkirmish(dist, eye, recent);
    }
    if (!this.wantFire) this.releaseToken();
    // radio chatter between tactical units
    if (this.barkT <= 0 && this.def.voice && this.visible) {
      this.barkT = 5 + Math.random() * 8;
      this.mgr.bark(this);
    }
  }

  thinkSkirmish(dist, eye, recent) {
    const def = this.def, game = this.game;
    const aggressive = this.mgr.aggression(this);
    if (this.visible) {
      const wantCover = Math.random() < def.cover * (0.5 + this.suppressed) && dist > 6 && !this.inCover();
      if (this.mode === 'peek') {
        this.wantFire = true;
        if (this.modeT > 1.4 + Math.random() * 1.2 && this.cover) { this.mode = 'cover'; this.modeT = 0; this.moveTo(this.cover.pos, def.speed); }
        return;
      }
      if (wantCover && this.mode !== 'cover') { this.seekCover(eye); if (this.cover) { this.wantFire = Math.random() < 0.5; return; } }
      if (this.mode === 'cover' && !this.inCover() && this.cover && this.modeT < 4) { this.wantFire = true; return; } // shoot while moving to cover
      // a cover the player can see into is no cover: fight from it
      // stand and fight; close the distance if out of range, now and then shift position
      this.wantFire = true;
      if (dist > this.gun.range * 0.8) this.moveTo(this.lastSeen, def.speed * 0.7, 6);
      else if (dist > 6 && Math.random() < 0.08 * (1 - def.skill * 0.5) && this.modeT > 2.5) { this.moveTo(this.strafePoint(eye), def.speed * 0.6); this.modeT = 0; }
      else if (!this.p.ctl.walking || this.modeT > 1.2) this.stop();
      this.mode = 'fight';
    } else if (this.mode === 'cover' && this.cover && this.inCover()) {
      // peek out on a rhythm
      if (this.modeT > 1.2 + Math.random() * 2 && this.cover.peek) { this.mode = 'peek'; this.modeT = 0; this.moveTo(this.cover.peek, def.speed); }
      else if (this.modeT > 7 || !recent) { this.mode = 'hunt'; this.modeT = 0; }
    } else if (recent) {
      // advance, some flank wide
      if (this.mode !== 'flank' && Math.random() < def.flank * 0.5 && this.mgr.engagedCount() > 0) {
        this.mode = 'flank';
        this.modeT = 0;
      }
      if (this.mode === 'flank' && this.modeT < 9) {
        const f = this.flankPoint();
        this.moveTo(f, def.speed * this.scale.speed, 1.5);
      } else this.moveTo(this.lastSeen, def.speed * this.scale.speed * (aggressive ? 1 : 0.8), 2.5);
    } else {
      this.mode = 'hunt';
      const hint = this.mgr.playerHint(this);
      this.moveTo(hint, def.speed * 0.75, 3);
    }
  }

  thinkSniper(dist, eye, recent) {
    const def = this.def;
    if (this.visible && dist > 6) {
      this.stop();
      this.wantFire = true;
      return;
    }
    if (!this.post || this.modeT > 16 || (this.visible && dist < 6)) {
      const spots = this.game.level.coverSpots(this.pos, eye, { radius: 12, minDist: 12, maxDist: 34, count: 3 });
      const s = spots.find((x) => x.peek);
      this.post = s || null;
      this.modeT = 0;
    }
    if (this.post) this.moveTo(recent ? this.post.peek || this.post.pos : this.post.pos, def.speed);
    else this.moveTo(this.lastSeen, def.speed * 0.6, 14);
  }

  inCover() {
    return this.cover && Math.hypot(this.pos.x - this.cover.pos.x, this.pos.z - this.cover.pos.z) < 0.8;
  }

  seekCover(eye, force = false) {
    const spots = this.game.level.coverSpots(this.pos, eye, { radius: 7, minDist: 4, maxDist: 26, count: 4 });
    if (!spots.length) { this.cover = null; return; }
    spots.sort((a, b) => Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) - Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z));
    this.cover = spots[0];
    this.mode = 'cover';
    this.modeT = 0;
    this.moveTo(this.cover.pos, this.def.speed * this.scale.speed);
    void force;
  }

  backOff(eye) {
    const d = new I(this.pos.x - eye.x, 0, this.pos.z - eye.z).normalize();
    for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
      const x = this.pos.x + (d.x * Math.cos(a) - d.z * Math.sin(a)) * 2.5, z = this.pos.z + (d.x * Math.sin(a) + d.z * Math.cos(a)) * 2.5;
      if (this.game.level.free(x, z, 0.4)) return new I(x, 0, z);
    }
    return null;
  }

  strafePoint(eye) {
    const dx = eye.x - this.pos.x, dz = eye.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    const s = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.5);
    const x = this.pos.x + (-dz / l) * s, z = this.pos.z + (dx / l) * s;
    return this.game.level.free(x, z, 0.4) && this.game.level.segmentClear(this.pos.x, this.pos.z, x, z, 1, 0.3, 0.3) ? new I(x, 0, z) : null;
  }

  flankPoint() {
    const P = this.game.player, L = this.game.level;
    const yaw = P.yaw;
    // the player's side, offset sideways and a little behind
    const sx = Math.cos(yaw) * this.flankSide, sz = -Math.sin(yaw) * this.flankSide;
    const bx = Math.sin(yaw), bz = Math.cos(yaw);
    for (const k of [7, 5, 9, 4]) {
      const x = P.pos.x + sx * k + bx * 2.5, z = P.pos.z + sz * k + bz * 2.5;
      if (L.free(x, z, 0.4)) return new I(x, 0, z);
    }
    return this.lastSeen;
  }

  moveTo(pt, speed, stopDist = 0.6) {
    const c = this.p.ctl;
    if (!pt) { this.stop(); return; }
    const pos = this.pos;
    if (Math.hypot(pt.x - pos.x, pt.z - pos.z) < stopDist) { this.stop(); return; }
    const now = this.game.time;
    if (this.goal && Math.hypot(this.goal.x - pt.x, this.goal.z - pt.z) < 0.9 && c.walking && now - this.pathT < 1.6) {
      if (c.nav) c.nav.speed = speed;
      return;
    }
    const path = this.game.level.findPath(pos, pt, 0.34);
    if (!path || !path.length) return;
    this.goal = new I(pt.x, 0, pt.z);
    this.pathT = now;
    if (c.walking) { c.updateRoute(path); c.nav.goals = [path[path.length - 1].clone()]; c.nav.speed = speed; }
    else c.walkTo(path, null, { speed });
  }

  stop() {
    const c = this.p.ctl;
    if (this.game.time < (this.turnUntil || 0)) return; // let a turn-in-place step finish
    if (c.walking) c.stopWalk('arrived');
    this.goal = null;
  }

  // turn in place by taking a short step towards the target when it is far off to the side
  face(tx, tz, dt) {
    const c = this.p.ctl;
    if (this.anim && this.anim.active) return; // animation turns on the spot by itself
    if (c.walking) return;
    this.turnT -= dt;
    const pos = this.pos;
    const yawErr = wrapAngle(Math.atan2(tx - pos.x, tz - pos.z) - c.heading);
    if (Math.abs(yawErr) > 0.45 && this.turnT <= 0) {
      this.turnT = 0.55;
      this.turnUntil = this.game.time + 0.7;
      this.goal = null;
      const a = c.heading + clamp(yawErr, -1.4, 1.4);
      c.walkTo([new I(pos.x + Math.sin(a) * 0.32, 0, pos.z + Math.cos(a) * 0.32)], null, { speed: 0.6 });
    }
  }

  aimPoint(out) {
    const P = this.game.player;
    if (this.suppressFire) return out.set(this.suppressFire.x, this.suppressFire.y, this.suppressFire.z);
    const crouch = P.crouch;
    // chest by default; elites and snipers go for the head sometimes
    const y = P.pos.y + (this.aimHead ? P.eyeHeight + 0.02 : lerp(1.25, 0.85, crouch));
    return out.set(P.pos.x, y, P.pos.z);
  }

  updateAim(dt) {
    const c = this.p.ctl;
    const shouldAim = (this.wantFire || this.visible) && this.reloadT <= 0 && this.knows;
    this.aiming = shouldAim;
    if (!shouldAim) { this.lasing = Math.max(0, this.lasing - dt * 2); return; }
    const tgt = this.aimPoint(new T3.Vector3());
    const r = this.mgr.renderOf(this);
    const from = (r && r.gun && r.muzzleWorld(_tb)) || toV3(this.p.rd.segments.chest.body.pos, _tb);
    const want = tgt.clone().sub(from).normalize();
    // tracking lag: skilled enemies turn their aim faster
    const rate = (2.5 + 6 * this.def.skill) * (1 - 0.5 * clamp(this.suppressed, 0, 1));
    this.aimDir.lerp(want, 1 - Math.exp(-dt * rate)).normalize();
    this.aimQ.setFromEuler(new T3.Euler(Math.asin(clamp(this.aimDir.y, -1, 1)), Math.atan2(this.aimDir.x, this.aimDir.z) + Math.PI, 0, 'YXZ'));
    this.face(tgt.x, tgt.z, dt);
    if (this.gun.laser) {
      this.lasing = this.visible ? Math.min(1, this.lasing + dt / this.gun.aimTime) : Math.max(0, this.lasing - dt);
      const hit = this.game.sb.world.raycast(toP3(from), new I(this.aimDir.x, this.aimDir.y, this.aimDir.z), 80, (b) => b.userData && b.userData.level);
      this.laserLen = hit ? hit.tIn : 80;
      const P = this.game.player, eye = P.eye(new I());
      // the beam may stop on the player
      const dp = new T3.Vector3(eye.x - from.x, eye.y - 0.25 - from.y, eye.z - from.z);
      const t = dp.dot(this.aimDir);
      if (t > 0 && t < this.laserLen && dp.addScaledVector(this.aimDir, -t).length() < 0.35) this.laserLen = t;
    }
  }

  updateFire(dt) {
    if (!this.wantFire || this.reloadT > 0 || this.cool > 0 || !this.aiming) return;
    if (!this.visible && !this.suppressFire) return;
    if (this.visible && this.visT < this.reactionTime()) return;
    if (this.gun.laser && this.lasing < 1) return;
    // fairness: only a few enemies may shoot at the player at once
    if (!this.suppressFire && !this.def.boss && !this.token && !this.mgr.requestToken(this)) return;
    const err = this.aimDir.angleTo(this.desiredDir(_ta));
    if (err > 0.25) return;
    if (this.burstLeft <= 0) {
      if (this.burstPause > 0) { this.burstPause -= dt; return; }
      const [a, b] = this.gun.burst;
      this.burstLeft = a + Math.floor(Math.random() * (b - a + 1));
      this.aimHead = (this.def.elite || this.def.role === 'sniper') && Math.random() < 0.3;
    }
    this.fire();
    this.burstLeft--;
    this.cool = 60 / this.gun.rpm * (0.9 + Math.random() * 0.25);
    if (this.burstLeft <= 0) {
      this.burstPause = 0.35 + Math.random() * 0.8 * (1.4 - this.def.skill);
      this.cool += this.burstPause;
      if (Math.random() < 0.35) this.releaseToken();
    }
    if (this.gun.laser) this.lasing = 0.2;
    this.ammo--;
    if (this.ammo <= 0) {
      this.reloadT = this.gun.reload * (1.25 - this.def.skill * 0.4);
      this.releaseToken();
      this.mgr.bark(this, 'reload');
    }
  }

  desiredDir(out) {
    const r = this.mgr.renderOf(this);
    const from = (r && r.gun && r.muzzleWorld(new T3.Vector3())) || toV3(this.p.rd.segments.chest.body.pos);
    return out.copy(this.aimPoint(new T3.Vector3())).sub(from).normalize();
  }

  reactionTime() {
    const [a, b] = this.def.react;
    if (this._react === undefined || this.visT < 0.05) this._react = (a + Math.random() * (b - a)) * this.scale.react;
    return this._react;
  }

  fire() {
    const game = this.game, P = game.player, g = this.gun;
    const r = this.mgr.renderOf(this);
    const muzzle = (r && r.gun && r.muzzleWorld(new T3.Vector3())) || toV3(this.p.rd.segments.chest.body.pos);
    // accuracy: base spread grows with player motion, own motion, suppression, wounds and darkness
    const pv = Math.hypot(P.vel.x, P.vel.z);
    const own = Math.hypot(this.p.ctl.sens.comVel.x, this.p.ctl.sens.comVel.z);
    const light = game.view.lightAt(P.pos.x, 1.2, P.pos.z);
    let sigma = g.spread * (1.75 - this.def.skill) * this.scale.spread;
    sigma *= 1 + 0.45 * clamp(pv / 3.3, 0, 1.6) + 0.6 * clamp(own / 1.5, 0, 1) + 0.9 * clamp(this.suppressed, 0, 1) + 0.6 * this.p.ctl.pain;
    if (this.visT < 1) sigma *= 1.5 - 0.5 * this.visT;
    if (light < 0.2) sigma *= 1.35;
    if (P.crouch > 0.5) sigma *= 1.1;
    if (this.suppressFire) sigma *= 2.2;
    const base = this.aimDir.clone();
    const pellets = g.pellets || 1;
    const paths = [];
    for (let k = 0; k < pellets; k++) {
      const s = g.pelletSpread ? Math.hypot(sigma, g.pelletSpread) : sigma;
      const dir = jitterDir(base, s);
      paths.push(this.mgr.traceEnemyShot(this, muzzle, dir));
    }
    if (r) r.muzzleFlash();
    if (this.anim) this.anim.onFire();
    this.shotsFired = (this.shotsFired || 0) + 1;
    this.mgr.onEnemyShot(this, muzzle, paths);
  }

  // arms: shoulder the weapon towards the aim, or carry it at low ready
  driveArms(dt) {
    const c = this.p.ctl;
    if (!c.alive || !c.conscious || c.mode !== 'balance' || this.downed) return;
    if ((c.flail || 0) > 0.35 || (c.wmAmount || 0) > 0.05) return;
    const chest = this.p.rd.segments.chest.body;
    const sh = (side) => chest.localToWorld(c.geo['shoulderAnchor' + side], new I());
    const sR = sh('R'), sL = sh('L');
    const fwd = new I(Math.sin(c.heading), 0, Math.cos(c.heading));
    const right = new I(-fwd.z, 0, fwd.x); // character's right (the rig faces +z with its left on +x)
    let aim = fwd.clone();
    if (this.aiming) {
      aim = new I(this.aimDir.x, this.aimDir.y, this.aimDir.z);
      // keep the arms within reach of the torso's facing
      const flat = new I(aim.x, 0, aim.z);
      const fl = Math.hypot(flat.x, flat.z) || 1;
      const yawOff = wrapAngle(Math.atan2(flat.x / fl, flat.z / fl) - c.heading);
      if (Math.abs(yawOff) > 1.25) {
        const ya = c.heading + Math.sign(yawOff) * 1.25;
        aim = new I(Math.sin(ya) * fl, aim.y, Math.cos(ya) * fl).normalize();
      }
    } else aim = new I(fwd.x, -0.55, fwd.z).normalize();
    const pistol = this.gun.hold === 'pistol';
    const k = this.aiming ? 1.2 : 0.7;
    let gripR, gripL;
    if (pistol) {
      const mid = new I().addVectors(sR, sL).scale(0.5);
      gripR = mid.clone().addScaled(aim, this.aiming ? 0.48 : 0.3).addScaled(new I(0, 1, 0), -0.06).addScaled(right, 0.02);
      gripL = gripR.clone().addScaled(right, -0.035).addScaled(new I(0, 1, 0), -0.025);
    } else {
      gripR = sR.clone().addScaled(aim, 0.22).addScaled(new I(0, 1, 0), -0.1).addScaled(right, -0.04);
      gripL = gripR.clone().addScaled(aim, 0.34).addScaled(new I(0, 1, 0), -0.03).addScaled(right, -0.09);
    }
    c.reachArm('R', gripR, new I(right.x * 0.7, -0.7, right.z * 0.7).addScaled(fwd, -0.3).normalize(), k * Math.max(0.3, c.armStrength.R));
    c.reachArm('L', gripL, new I(-right.x * 0.6, -0.8, -right.z * 0.6).addScaled(fwd, -0.2).normalize(), k * Math.max(0.3, c.armStrength.L));
  }

  releaseToken() { if (this.token) { this.token = false; this.mgr.tokensUsed--; } }
}

function jitterDir(dir, sigma) {
  const up = Math.abs(dir.y) < 0.95 ? new T3.Vector3(0, 1, 0) : new T3.Vector3(1, 0, 0);
  const a = new T3.Vector3().crossVectors(dir, up).normalize();
  const b = new T3.Vector3().crossVectors(a, dir).normalize();
  const r = Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-9))) * sigma * 0.7, th = Math.random() * TAU;
  return dir.clone().addScaledVector(a, Math.cos(th) * r).addScaledVector(b, Math.sin(th) * r).normalize();
}

// melee "hollowed": the engine's zombie brain wrapped so the manager can treat it like the others
class HollowWrap {
  constructor(mgr, person, type, scale) {
    this.mgr = mgr; this.p = person; this.type = type; this.def = ENEMY_TYPES[type];
    this.toughMax = this.def.tough * scale.tough; this.tough = this.toughMax; this.downed = false; this.hollow = true;
    this.aiming = false;
    person.ctl.loco.maxSpeed *= scale.speed;
  }
  get pos() { return this.p.rd.pelvis.pos; }
  get headPos() { return this.p.rd.segments.head.body.pos; }
  combatEffective() { const c = this.p.ctl; return !this.downed && c.alive && c.conscious && this.tough > 0; }
  hear() {}
  releaseToken() {}
}
