// Character + Humanoid: physics controller, classic animation, health/death.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { CharacterModel } from './CharacterModel.js';
import { GROUP } from './Part.js';
import { sounds } from './Sound.js';

const STEP_HEIGHT = 1.15;       // ledges up to this height are walked onto
const BOX_HALF = new CANNON.Vec3(0.9, 2.0, 0.9); // torso/head region; legs are ray-supported
const PROBES = [[0, 0], [0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]];

let charMaterial = null;

export class Character {
  constructor(world, opts = {}) {
    this.world = world;
    this.name = opts.name || 'Player';
    this.player = opts.player || null; // owning Player record (for leaderboard)
    this.appearance = opts.appearance;
    this.isLocal = !!opts.isLocal;
    this.walkSpeed = 16;
    this.jumpPower = 50;
    this.maxHealth = 100;
    this.health = 100;
    this.alive = false;
    this.input = { move: new THREE.Vector3(), jump: false };
    this.state = 'Standing';
    this.grounded = false;
    this.groundPart = null;
    this.facing = 0; // yaw (radians); 0 = facing -Z
    this.tool = null;
    this.toolAnim = 'None';
    this.toolAnimUntil = 0;
    this.lastDamagedAt = -100;
    this.creatorTag = null; // last attacker, for KO credit
    this.forceField = null;
    this.debris = [];
    this.listeners = { died: [], touched: [] };
    this.motor = { rs: 0, ls: 0, rh: 0, lh: 0 };
    this.motorVel = { rs: 0.15, ls: 0.15, rh: 0.1, lh: 0.1 };
    this.animClock = 0;
    this.animTick = 0;
    this.sat = false;
    this.platformStand = false;
    this.teamColor = opts.teamColor ?? null;

    // 2008 Animate script: on a team the head is Bright yellow, the torso
    // takes the TeamColor and the arms and legs turn Black.
    if (opts.teamColor != null) {
      this.appearance = { ...this.appearance, colors: { head: 24, torso: opts.teamColor, leftArm: 26, rightArm: 26, leftLeg: 26, rightLeg: 26 } };
    }
    this.model = new CharacterModel(this.appearance);
    this.root = this.model.root;
    if (world.shadows) this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.visible = false;
    world.scene.add(this.root);

    if (!charMaterial) {
      charMaterial = new CANNON.Material('character');
      world.physics.addContactMaterial(new CANNON.ContactMaterial(charMaterial, world.defaultPhysMaterial, { friction: 0, restitution: 0 }));
      world.physics.addContactMaterial(new CANNON.ContactMaterial(charMaterial, charMaterial, { friction: 0, restitution: 0 }));
    }
    this.body = new CANNON.Body({ mass: 10, fixedRotation: true, material: charMaterial, linearDamping: 0, allowSleep: false });
    this.body.addShape(new CANNON.Box(BOX_HALF));
    this.body.collisionFilterGroup = GROUP.CHARACTER;
    this.body.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER;
    this.body.character = this;
    this._onPhysStep = () => this._substep();
    this._rayResult = new CANNON.RaycastResult();
    this._aabb = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  }

  on(evt, fn) { this.listeners[evt].push(fn); }
  emit(evt, ...a) { for (const f of this.listeners[evt]) f(...a); }

  get rootPosition() { return this.root.position; }
  get headPosition() { return new THREE.Vector3(this.root.position.x, this.root.position.y + 1.6, this.root.position.z); }
  get lookVector() { return new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing)); }

  spawn(position, yaw = 0, forceFieldSeconds = 0) {
    this.clearDebris();
    this.health = this.maxHealth;
    this.alive = true;
    this.state = 'Standing';
    this.facing = yaw;
    this.creatorTag = null;
    this.body.position.set(position.x, position.y + 3, position.z); // position = feet
    this.body.velocity.set(0, 0, 0);
    if (!this.world.physics.bodies.includes(this.body)) this.world.physics.addBody(this.body);
    this.world.physics.removeEventListener('postStep', this._onPhysStep);
    this.world.physics.addEventListener('postStep', this._onPhysStep);
    this.root.visible = true;
    this.root.position.copy(this.body.position);
    this.world.characters.add(this);
    if (forceFieldSeconds > 0) this.giveForceField(forceFieldSeconds);
  }

  // --- ForceField ------------------------------------------------------------
  giveForceField(seconds) {
    this.removeForceField();
    // 2008 ForceField: a box outline around every body part whose colour
    // pulses blue -> purple -> red and back about once a second.
    const boxes = [];
    const mat = new THREE.LineBasicMaterial({ color: 0x0000ff });
    for (const [mesh, size] of this.model.limbs()) {
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0] + 0.2, size[1] + 0.2, size[2] + 0.2));
      const l = new THREE.LineSegments(g, mat);
      mesh.add(l);
      boxes.push(l);
    }
    const start = this.world.time;
    const ff = { boxes, mat, until: this.world.time + seconds };
    ff.off = this.world.onUpdate((dt, t) => {
      let cyc = Math.floor((t - start) * 120) % 120;
      if (cyc > 60) cyc = 120 - cyc;
      const k = cyc / 60;
      mat.color.setRGB(k, 0, 1 - k);
      if (t > ff.until) this.removeForceField();
    });
    this.forceField = ff;
  }

  removeForceField() {
    if (!this.forceField) return;
    this.forceField.off();
    for (const b of this.forceField.boxes) { b.parent?.remove(b); b.geometry.dispose(); }
    this.forceField = null;
  }

  // --- Damage ------------------------------------------------------------------
  takeDamage(amount, attacker) {
    if (!this.alive || this.forceField) return;
    if (attacker && attacker !== this) this.creatorTag = attacker;
    this.health = Math.max(0, this.health - amount);
    this.lastDamagedAt = this.world.time;
    if (this.health <= 0) this.die();
  }

  heal(amount) {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Character:BreakJoints() -- instant death, body falls apart. */
  breakJoints(attacker, fromPos) {
    if (!this.alive) return;
    if (attacker && attacker !== this) this.creatorTag = attacker;
    this.health = 0;
    this.die(fromPos);
  }

  die(blastPos) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'Dead';
    this.unequip();
    this.removeForceField();
    sounds.play('uuhhh', this.root.position);
    // Fall apart: each limb becomes a loose brick carrying the body's momentum.
    const v = this.body.velocity;
    this.root.updateMatrixWorld(true);
    for (const [mesh, size] of this.model.limbs()) {
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
      mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq);
      const clone = mesh.clone(true);
      clone.position.copy(wp); clone.quaternion.copy(wq); clone.scale.set(1, 1, 1);
      this.world.scene.add(clone);
      const b = new CANNON.Body({ mass: size[0] * size[1] * size[2] * 0.7, material: this.world.defaultPhysMaterial });
      b.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
      b.position.set(wp.x, wp.y, wp.z);
      b.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      b.velocity.set(v.x + (Math.random() - 0.5) * 4, v.y + Math.random() * 3, v.z + (Math.random() - 0.5) * 4);
      if (blastPos) {
        const d = wp.clone().sub(blastPos).normalize();
        b.velocity.x += d.x * 80; b.velocity.y += d.y * 80 + 40; b.velocity.z += d.z * 80;
        b.angularVelocity.set(Math.random() * 16 - 8, Math.random() * 16 - 8, Math.random() * 16 - 8);
      } else {
        b.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      }
      b.collisionFilterGroup = GROUP.DEBRIS;
      b.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.DEBRIS;
      this.world.physics.addBody(b);
      this.debris.push({ mesh: clone, body: b });
    }
    this.root.visible = false;
    this.world.physics.removeEventListener('postStep', this._onPhysStep);
    this.world.physics.removeBody(this.body);
    this.world.characters.delete(this);
    const syncDebris = this.world.onUpdate(() => {
      for (const d of this.debris) {
        const p = d.body.interpolatedPosition || d.body.position, q = d.body.interpolatedQuaternion || d.body.quaternion;
        d.mesh.position.set(p.x, p.y, p.z);
        d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      if (!this.debris.length) syncDebris();
    });
    this.emit('died', this.creatorTag);
  }

  clearDebris() {
    for (const d of this.debris) {
      this.world.scene.remove(d.mesh);
      this.world.physics.removeBody(d.body);
    }
    this.debris = [];
  }

  destroy() {
    this.alive = false;
    this.unequip();
    this.removeForceField();
    this.clearDebris();
    this.world.physics.removeEventListener('postStep', this._onPhysStep);
    if (this.world.physics.bodies.includes(this.body)) this.world.physics.removeBody(this.body);
    this.world.characters.delete(this);
    this.world.scene.remove(this.root);
    this.model.dispose();
    if (this.nameTag) this.nameTag.remove();
  }

  // --- Tools -------------------------------------------------------------------
  equip(tool) {
    if (!this.alive) return;
    if (this.tool === tool) return;
    this.unequip();
    this.tool = tool;
    tool.equipped(this);
  }

  unequip() {
    if (!this.tool) return;
    const t = this.tool;
    this.tool = null;
    t.unequipped(this);
  }

  playToolAnim(name) {
    this.toolAnim = name;
    this.toolAnimUntil = this.animClock + 0.3;
  }

  // --- Physics controller (runs every physics substep) -------------------------
  _probeGround(maxDrop) {
    const p = this.body.position;
    const feet = p.y - 3;
    const top = feet + STEP_HEIGHT;
    const bottom = feet - maxDrop;
    let best = null;
    for (const [ox, oz] of PROBES) {
      const from = new CANNON.Vec3(p.x + ox, top, p.z + oz);
      const to = new CANNON.Vec3(p.x + ox, bottom, p.z + oz);
      let hit = null;
      this.world.physics.raycastAll(from, to, { collisionFilterMask: GROUP.WORLD | GROUP.DYNAMIC, skipBackfaces: true, checkCollisionResponse: true }, (r) => {
        if (r.hitNormalWorld.y < 0.45) return;
        if (!hit || r.distance < hit.distance) hit = { y: r.hitPointWorld.y, body: r.body, distance: r.distance, normal: r.hitNormalWorld.clone(), point: r.hitPointWorld.clone() };
      });
      if (hit && (!best || hit.y > best.y)) best = hit;
    }
    return best;
  }

  _substep() {
    if (!this.alive) return;
    const h = 1 / 120;
    const b = this.body;
    const vy = b.velocity.y;
    const ground = vy > 8 || this.platformLift ? null : this._probeGround(Math.max(0.3, -vy * h * 2 + 0.2));
    const move = this.input.move;
    let platformVel = null;

    if (this.platformStand) {
      this.grounded = false;
    } else if (ground && vy <= 8) {
      const feet = b.position.y - 3;
      // Snap feet onto the surface (this also performs step-ups).
      b.position.y = ground.y + 3;
      this.grounded = true;
      this.groundPart = ground.body.part || null;
      const gb = ground.body;
      if (gb.type === CANNON.Body.KINEMATIC || gb.type === CANNON.Body.DYNAMIC) {
        // velocity of the platform at the contact point (v + w x r)
        const r = new CANNON.Vec3(b.position.x - gb.position.x, ground.y - gb.position.y, b.position.z - gb.position.z);
        const w = gb.angularVelocity;
        platformVel = new CANNON.Vec3(
          gb.velocity.x + (w.y * r.z - w.z * r.y),
          gb.velocity.y + (w.z * r.x - w.x * r.z),
          gb.velocity.z + (w.x * r.y - w.y * r.x)
        );
        this.facing += w.y * h;
      } else if (gb.part?.surfaceVelocity) {
        // an anchored part with its Velocity set: a conveyor
        const sv = gb.part.surfaceVelocity;
        platformVel = new CANNON.Vec3(sv.x, 0, sv.z);
      }
      b.velocity.y = platformVel ? platformVel.y : 0;
      
    } else {
      this.grounded = false;
      this.groundPart = null;
    }

    // Climbing: walking into a truss climbs it.
    let climbing = false;
    if (move.lengthSq() > 0.01 && !this.platformStand) {
      const dir = move.clone().normalize();
      for (const hy of [-1.5, 0, 1.5]) {
        const from = new CANNON.Vec3(b.position.x, b.position.y + hy, b.position.z);
        const to = new CANNON.Vec3(b.position.x + dir.x * 1.6, b.position.y + hy, b.position.z + dir.z * 1.6);
        const r = this._rayResult; r.reset();
        this.world.physics.raycastClosest(from, to, { collisionFilterMask: GROUP.WORLD | GROUP.DYNAMIC, skipBackfaces: true }, r);
        if (r.hasHit && r.body.part && (r.body.part.shape === 'Truss' || r.body.part.tags.has('climbable'))) { climbing = true; break; }
      }
    }

    const speed = this.walkSpeed;
    let vx = move.x * speed, vz = move.z * speed;
    if (platformVel) { vx += platformVel.x; vz += platformVel.z; }
    if (this.platformStand) { vx = b.velocity.x; vz = b.velocity.z; }
    b.velocity.x = vx;
    b.velocity.z = vz;

    if (this.platformLift) {
      // sword lunge: BodyVelocity (0,10,0) holds the character up briefly
      b.velocity.y = Math.max(b.velocity.y, this.platformLift);
      this.grounded = false;
    }

    if (climbing) {
      b.velocity.y = speed * 0.7;
      this.grounded = false;
      this.climbing = true;
    } else {
      this.climbing = false;
    }

    if (this.input.jump && this.grounded && !this.platformStand) {
      b.velocity.y = this.jumpPower + (platformVel ? platformVel.y : 0);
      this.grounded = false;
      this.state = 'Jumping';
      this.jumpedAt = this.world.time;
      sounds.play('jump', this.root.position, this.isLocal ? 0.6 : 0.3);
    }
  }

  /** Called once per rendered frame after physics. */
  postStep(dt) {
    if (!this.alive) return;
    const b = this.body;
    const p = b.interpolatedPosition || b.position;
    this.root.position.set(p.x, p.y, p.z);

    // state machine
    const hv = Math.hypot(this.input.move.x, this.input.move.z);
    if (this.sat) this.state = 'Seated';
    else if (this.climbing) this.state = 'Climbing';
    else if (this.grounded) this.state = hv > 0.05 ? 'Running' : 'Standing';
    else if (this.state === 'Jumping' && this.world.time - (this.jumpedAt || 0) < 0.35) this.state = 'Jumping';
    else this.state = 'FreeFall';

    // sounds: looping plastic footsteps while running, swoosh when falling
    if (this.state === 'Running') {
      this._stepClock = (this._stepClock || 0) + dt;
      if (this._stepClock > 0.27) { this._stepClock = 0; sounds.play('step', this.root.position, this.isLocal ? 0.5 : 0.3); }
    }
    if (this.state === 'FreeFall' && this._lastState !== 'FreeFall' && this._lastState !== 'Jumping') sounds.play('swoosh', this.root.position, 0.5);
    this._lastState = this.state;

    // face the movement direction; like the 2008 humanoid, only while on the
    // ground (or climbing) -- you cannot turn in mid-air
    if (hv > 0.05 && !this.platformStand && (this.grounded || this.climbing)) {
      const target = Math.atan2(-this.input.move.x, -this.input.move.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 18);
    }
    this.root.rotation.set(0, this.facing, 0);

    // health regeneration (classic Health script: slow regen while hurt)
    if (this.health < this.maxHealth && this.world.time - this.lastDamagedAt > 1) {
      this.health = Math.min(this.maxHealth, this.health + dt * this.maxHealth * 0.01);
    }

    // fell out of the world
    if (p.y < this.world.fallenPartsDestroyHeight) this.breakJoints();

    this._animate(dt);
  }

  // Classic "Animate" script (2006-2009): sinusoidal limb swing, rate-limited
  // motors. MaxVelocity values are radians per 1/60 s physics step.
  _animate(dt) {
    this.animClock += dt;
    this.animTick += dt;
    const t = this.animClock;
    const M = this.motorVel;
    const des = {};
    const jumpMax = 0.75;
    let pose = this.state;
    if (pose === 'Jumping' || pose === 'FreeFall') {
      M.rs = M.ls = jumpMax;
      des.rs = 3.14; des.ls = -3.14; des.rh = 0; des.lh = 0;
    } else if (pose === 'Seated') {
      M.rs = M.ls = 0.15;
      des.rs = 1.57; des.ls = -1.57; des.rh = 1.57; des.lh = -1.57;
    } else {
      let amplitude, frequency, climbFudge = 0;
      if (pose === 'Running') {
        M.rs = Math.abs(this.motor.rs) > 1.5 ? jumpMax : 0.15;
        M.ls = Math.abs(this.motor.ls) > 1.5 ? jumpMax : 0.15;
        amplitude = 1; frequency = 9;
      } else if (pose === 'Climbing') {
        M.rs = M.ls = 0.5;
        amplitude = 1; frequency = 9; climbFudge = 3.14;
      } else {
        amplitude = 0.1; frequency = 1;
      }
      // The script only updated every 0.1 s (wait(0.1)); motors interpolate.
      if (this.animTick >= 0.1 || this._lastDesired === undefined) {
        this.animTick = 0;
        this._lastDesired = amplitude * Math.sin(t * frequency);
        this._lastFudge = climbFudge;
      }
      const d = this._lastDesired;
      des.rs = d + this._lastFudge; des.ls = d - this._lastFudge; des.rh = -d; des.lh = -d;
      M.rh = M.lh = 0.1;
      if (this.tool && !this.tool.hopperBin) {
        if (this.animClock > this.toolAnimUntil) this.toolAnim = 'None';
        if (this.toolAnim === 'None') des.rs = 1.57;
        else if (this.toolAnim === 'Slash') { M.rs = 0.5; des.rs = 0; }
        else if (this.toolAnim === 'Lunge') {
          M.rs = M.ls = M.rh = M.lh = 0.5;
          des.rs = 1.57; des.ls = 1.0; des.rh = 1.57; des.lh = 1.0;
        }
      }
    }
    if (pose === 'Jumping' || pose === 'FreeFall') M.rh = M.lh = 0.1;
    const steps = dt * 60;
    for (const k of ['rs', 'ls', 'rh', 'lh']) {
      const target = des[k];
      const max = M[k] * steps;
      const diff = target - this.motor[k];
      this.motor[k] += Math.max(-max, Math.min(max, diff));
    }
    this.model.setAngles(this.motor.rs, this.motor.ls, this.motor.rh, this.motor.lh);
  }

  getTouchAABB() {
    const p = this.root.position;
    this._aabb.min.set(p.x - 1, p.y - 3.05, p.z - 1);
    this._aabb.max.set(p.x + 1, p.y + 2.2, p.z + 1);
    return this._aabb;
  }

  /** Does a world-space point/sphere hit this character's body? */
  hitTest(point, radius = 0) {
    if (!this.alive) return false;
    const p = this.root.position;
    return Math.abs(point.x - p.x) < 1.1 + radius && Math.abs(point.z - p.z) < 1.1 + radius && point.y > p.y - 3 - radius && point.y < p.y + 2.2 + radius;
  }
}
