// Simple ray-based rigid-body-ish physics for dropped / thrown items:
// gravity, bounces off walls and furniture, tumbling, rolling balls, and
// settling upright on whatever surface they land on.
import * as THREE from 'three';
import { G } from '../game.js';
import { defBounds } from './registry.js';

const UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Raycaster();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Physics {
  constructor() { this.bodies = new Map(); }

  // Launch an item (already removed from the hand) into the world
  launch(inst, pos, vel, spin = null) {
    const o = inst.object;
    G.items.root.add(o);
    o.position.copy(pos);
    o.scale.setScalar(1);
    if (inst.blob) inst.blob.visible = false;
    inst.data.loc = 'world';
    inst.data.pos = [pos.x, pos.y, pos.z];
    inst.data.parent = null;
    const b = defBounds(inst.def);
    const ball = inst.def.use?.type === 'ball' || inst.def.tags.includes('ball');
    this.bodies.set(inst, {
      inst, vel: vel.clone(),
      spin: spin || new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8),
      r: Math.max(0.02, Math.min(b.size.x, b.size.z) * 0.45),
      h: b.size.y, cy: b.center.y,
      restitution: ball ? (inst.def.use?.bounce ?? 0.72) : 0.25,
      ball, rest: 0, life: 0, lastHit: 0,
      glide: inst.def.use?.type === 'glider',
    });
    G.items.invalidateMeshes();
    G.events.emit('inventoryChanged');
  }

  remove(inst) { this.bodies.delete(inst); }
  isMoving(inst) { return this.bodies.has(inst); }

  update(dt) {
    if (!this.bodies.size) return;
    const solids = G.apartment.solids;
    for (const body of [...this.bodies.values()]) {
      const { inst } = body;
      if (!inst.built || inst.data.loc !== 'world') { this.bodies.delete(inst); continue; }
      body.life += dt;
      const o = inst.object;
      const targets = solids.concat(G.items.worldMeshes(inst));
      // rays start a little above the item's base so they never begin inside the floor
      const lift = Math.max(0.05, Math.min(body.cy, 0.15));
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        if (body.glide && !body.onGround) {
          // paper planes & frisbees: low gravity, gentle drag, lift while fast
          const sp = Math.hypot(body.vel.x, body.vel.z);
          body.vel.y -= (9.8 - Math.min(8, sp * 1.6)) * h;
          body.vel.multiplyScalar(Math.exp(-0.35 * h));
        } else body.vel.y -= 9.8 * h;
        let landed = null;
        // ---- sweep along the velocity: walls, furniture sides, landing on tops
        const step = _v.copy(body.vel).multiplyScalar(h);
        const len = step.length();
        if (len > 1e-6) {
          _o.copy(o.position).y += lift;
          _ray.set(_o, _d.copy(step).divideScalar(len));
          _ray.far = len + body.r;
          const hit = _ray.intersectObjects(targets, false).find((x) => x.face);
          if (hit) {
            const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            if (n.dot(step) > 0) n.negate();
            const vn = body.vel.dot(n);
            const impact = Math.abs(vn);
            if (n.y > 0.65) {
              const k = Math.max(0, hit.distance - body.r) / len;
              o.position.x += step.x * k; o.position.z += step.z * k;
              o.position.y = hit.point.y;
              this._land(body, impact, hit);
              landed = hit;
            } else {
              // wall / side hit: bounce
              body.vel.addScaledVector(n, -(1 + body.restitution) * vn);
              body.vel.multiplyScalar(body.ball ? 0.9 : 0.6);
              body.spin.multiplyScalar(0.6);
              o.position.addScaledVector(n, 0.01);
              if (impact > 0.6 && body.life - body.lastHit > 0.08) { this._sound(inst, impact, hit); body.lastHit = body.life; }
            }
          } else o.position.add(step);
        }
        // ---- ground probe: keeps sliding items glued to what they're on
        let ground = landed;
        if (!ground && body.vel.y <= 0.05) {
          _o.copy(o.position).y += lift;
          _ray.set(_o, DOWN);
          _ray.far = lift + 0.025 + Math.max(0, -body.vel.y * h);
          const g = _ray.intersectObjects(targets, false).find((x) => x.face && x.face.normal.clone().transformDirection(x.object.matrixWorld).y > 0.65);
          if (g) {
            const impact = Math.max(0, -body.vel.y);
            o.position.y = g.point.y;
            if (impact > 0.3) this._land(body, impact, g); else body.vel.y = 0;
            ground = g;
          }
        }
        // floor safety
        if (o.position.y <= 0) {
          o.position.y = 0;
          if (body.vel.y < 0) { if (body.ball && -body.vel.y > 0.6) body.vel.y = -body.vel.y * body.restitution; else body.vel.y = 0; }
          ground ||= { object: null, point: o.position.clone() };
        }
        body.onGround = ground && body.vel.y <= 0.05 ? ground : null;
        if (body.onGround) this._friction(body, h);
      }
      // rotation
      const grounded = !!body.onGround;
      if (body.ball && grounded) {
        // rolling: spin axis perpendicular to motion
        const hv = new THREE.Vector3(body.vel.x, 0, body.vel.z);
        const sp = hv.length();
        if (sp > 0.01) { const axis = new THREE.Vector3().crossVectors(UP, hv).normalize(); _q.setFromAxisAngle(axis, sp * dt / Math.max(0.02, body.r)); o.quaternion.premultiply(_q); }
      } else if (!grounded && body.glide) {
        const ahead = o.position.clone().add(body.vel);
        const m = new THREE.Matrix4().lookAt(ahead, o.position, UP);
        o.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 1 - Math.exp(-dt * 8));
      } else if (!grounded) {
        _v.copy(body.spin).multiplyScalar(dt);
        _q.setFromEuler(new THREE.Euler(_v.x, _v.y, _v.z));
        o.quaternion.multiply(_q);
      } else {
        // settle upright keeping yaw
        const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
        const upright = new THREE.Quaternion().setFromAxisAngle(UP, e.y);
        o.quaternion.slerp(upright, 1 - Math.exp(-dt * 14));
      }
      const speed = Math.hypot(body.vel.x, body.vel.z) + Math.abs(body.vel.y);
      if (grounded && speed < (body.ball ? 0.06 : 0.12)) body.rest += dt; else body.rest = 0;
      if (body.rest > (body.ball ? 0.3 : 0.1) || body.life > 8) this._settle(body);
    }
  }

  // touching down: balls bounce, everything else loses most of its slide on impact
  _land(body, impact, hit) {
    if (impact > 0.9 && body.life - body.lastHit > 0.08) { this._sound(body.inst, impact, hit); body.lastHit = body.life; }
    if (body.ball && impact > 0.6) { body.vel.y = impact * body.restitution; body.vel.x *= 0.95; body.vel.z *= 0.95; return; }
    body.vel.y = 0;
    if (body.ball) return;
    const sp = Math.hypot(body.vel.x, body.vel.z);
    if (sp > 0) { const k = Math.max(0, sp - 0.8 * impact) / sp; body.vel.x *= k; body.vel.z *= k; }
    body.spin.multiplyScalar(0.3);
  }

  // Coulomb friction (constant deceleration) so slides stop instead of creeping forever
  _friction(body, h) {
    const sp = Math.hypot(body.vel.x, body.vel.z);
    if (sp <= 0) return;
    const rug = body.onGround.object?.userData?.step === 'rug';
    const decel = body.ball ? (rug ? 1.2 : 0.35) : body.glide ? 9 : (rug ? 8 : 5.5);
    let ns = Math.max(0, sp - decel * h);
    if (body.ball) ns *= Math.exp(-0.4 * h);
    const k = ns / sp;
    body.vel.x *= k; body.vel.z *= k;
  }

  _sound(inst, impact, hit) {
    const soft = inst.def.tags.includes('soft') || ['clothing', 'plush'].includes(inst.def.category) || hit.object.userData.step === 'rug';
    const glassy = inst.def.tags.includes('glass');
    const pos = inst.object.position.clone();
    if (inst.def.use?.type === 'ball') G.audio.play(inst.def.use.sound || 'boing', { pos, volume: Math.min(1, impact / 4), pitch: 0.8 + Math.random() * 0.4 });
    else if (glassy) G.audio.play('clink', { pos, volume: Math.min(1, impact / 3) });
    else G.audio.play('thud', { pos, soft, impact: Math.min(1, impact / 4), pitch: 1.4 - Math.min(0.6, defBounds(inst.def).max) });
  }

  _settle(body) {
    const { inst } = body;
    this.bodies.delete(inst);
    const o = inst.object;
    const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
    const upright = new THREE.Quaternion().setFromAxisAngle(UP, e.y);
    // determine support item (to move with furniture)
    let parent = null;
    if (body.onGround?.object) {
      let ob = body.onGround.object;
      while (ob) { if (ob.userData?.item) { parent = ob.userData.item.uid; break; } ob = ob.parent; }
    }
    if (o.position.y < 0.002) o.position.y = 0;
    o.quaternion.copy(body.ball ? o.quaternion : upright);
    G.items.toWorld(inst, o.position.clone(), o.quaternion.clone(), parent);
  }
}
