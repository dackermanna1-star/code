// Interactive brush entities of an original BSP map: rotating doors (func_door_rotating,
// opened by touch or +use and swinging away from whoever opens them, like CBaseDoor),
// breakables (func_breakable: glass / wood / metal, broken by damage), buttons
// (func_button: a click, and security monitors that show a trigger_camera's view).
// Everything resets at round start.
import { TraceResult, MASK_SHOT, MASK_PLAYER } from '../engine/collision.js';
import { HULL_STAND } from '../engine/pmove.js';

const DEG = Math.PI / 180;
const SF_DOOR_ROTATE_BACKWARDS = 2, SF_DOOR_ONEWAY = 16, SF_DOOR_USE_ONLY = 256;
const BREAK_SURFACE = ['glass', 'wood', 'metal', 'flesh', 'concrete', 'concrete', 'computer', 'glass', 'concrete'];
const tr = new TraceResult();

class RotDoor {
  constructor(be) {
    this.be = be;
    const e = be.ent;
    this.flags = +(e.spawnflags || 0);
    this.speed = +(e.speed || 100);
    this.distance = +(e.distance || 90) * (this.flags & SF_DOOR_ROTATE_BACKWARDS ? -1 : 1);
    this.wait = e.wait != null ? +e.wait : 3;
    this.base = +(String(e.angles || '0 0 0').split(/\s+/)[1] || 0);
    this.reset();
  }

  reset() {
    this.angle = 0;
    this.target = 0;
    this.state = 'closed';
    this.until = 0;
    this.apply();
  }

  apply() {
    const yaw = this.base + this.angle;
    if (this.be.handle) this.be.handle.yaw = yaw;
    for (const m of this.be.meshes) m.rotation.z = yaw * DEG;
  }

  /** CBaseDoor::DoorActivate for a rotating door: open away from the activator. */
  open(p, time) {
    if (this.state === 'opening' || (this.state === 'open' && this.wait < 0)) return false;
    if (this.state === 'open') { this.until = time + this.wait; return false; }
    let sign = 1;
    if (!(this.flags & SF_DOOR_ONEWAY) && p) {
      const o = this.be.origin;
      const vx = p.pm.origin[0] - o[0], vy = p.pm.origin[1] - o[1];
      const fy = p.pm.angles[1] * DEG;
      const nx = p.pm.origin[0] + Math.cos(fy) * 10 - o[0], ny = p.pm.origin[1] + Math.sin(fy) * 10 - o[1];
      if (vx * ny - vy * nx < 0) sign = -1;
    }
    this.target = this.distance * sign;
    this.state = 'opening';
    return true;
  }

  close() {
    this.target = 0;
    this.state = 'closing';
  }
}

export class MapEntities {
  constructor(game) {
    this.game = game;
    this.doors = [];
    this.breakables = [];
    this.buttons = [];
    const W = game.W;
    const named = new Map();
    for (const e of W.map.entities) if (e.targetname) named.set(e.targetname, e);
    this.named = named;
    for (const be of W.brushEnts || []) {
      switch (be.classname) {
        case 'func_door_rotating': this.doors.push(new RotDoor(be)); break;
        case 'func_breakable': {
          const health = +(be.ent.health || 1);
          // unbreakable glass (material 7) and health 0 never break
          const b = { be, maxHealth: health, health, material: +(be.ent.material || 0), broken: false, unbreakable: health <= 0 || +(be.ent.material || 0) === 7 };
          be.breakable = b;
          this.breakables.push(b);
          break;
        }
        case 'func_button': case 'func_rot_button': {
          const b = { be, target: be.ent.target, wait: +(be.ent.wait || 1), next: 0 };
          be.button = b;
          this.buttons.push(b);
          break;
        }
        default:
      }
    }
    for (const d of this.doors) d.be.door = d;
    this.camera = null; // active trigger_camera view { pos, look, until, player }
  }

  get any() { return this.doors.length + this.breakables.length + this.buttons.length > 0; }

  reset() {
    for (const d of this.doors) d.reset();
    for (const b of this.breakables) {
      b.broken = false;
      b.health = b.maxHealth;
      if (b.be.handle) b.be.handle.active = true;
      for (const m of b.be.meshes) m.visible = true;
    }
    this.camera = null;
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    if (!this.doors.length) return;
    const g = this.game, now = g.time;
    // touching a door opens it (unless it's use-only): a short probe along the move
    const movers = g.hostages?.list?.length ? g.players.concat(g.hostages.list.filter((h) => !h.rescued)) : g.players;
    for (const p of movers) {
      if (!p.alive) continue;
      // probe along where he is trying to go (a door he's pressed against stops his velocity)
      let dx = 0, dy = 0;
      const c = p.cmd;
      if (c && (c.forwardmove || c.sidemove)) {
        const y = p.pm.angles[1] * DEG;
        dx = Math.cos(y) * c.forwardmove + Math.sin(y) * c.sidemove;
        dy = Math.sin(y) * c.forwardmove - Math.cos(y) * c.sidemove;
      } else { dx = p.pm.velocity[0]; dy = p.pm.velocity[1]; }
      const sp = Math.hypot(dx, dy);
      if (sp < 20) continue;
      const o = p.pm.origin, h = p.hull();
      const end = [o[0] + dx / sp * 6, o[1] + dy / sp * 6, o[2]];
      g.collision.trace(o, end, h.mins, h.maxs, MASK_PLAYER, tr, p.box);
      const d = tr.ent?.door;
      if (d && !(d.flags & SF_DOOR_USE_ONLY) && d.state !== 'opening') {
        if (d.open(p, now)) this.doorSound(d, true);
      }
    }
    for (const d of this.doors) {
      if (d.state === 'open') {
        if (d.wait >= 0 && now >= d.until) { d.close(); this.doorSound(d, true); }
        continue;
      }
      if (d.state === 'closed') continue;
      const step = d.speed * dt;
      const prev = d.angle;
      const diff = d.target - d.angle;
      d.angle = Math.abs(diff) <= step ? d.target : d.angle + Math.sign(diff) * step;
      d.apply();
      // somebody in the way: push him along with the door (SV_PushRotate); if he
      // can't go anywhere, the door goes back the other way (CBaseDoor::Blocked)
      const blocker = this.blocking(d);
      if (blocker && !this.push(d, blocker, prev)) {
        d.angle = prev;
        d.apply();
        if (d.wait >= 0) {
          if (d.state === 'closing') { d.state = 'opening'; d.target = d.lastTarget || d.distance; }
          else { d.state = 'closing'; d.target = 0; d.reopenAt = now + 0.5; }
        }
        continue;
      }
      if (d.angle === d.target) {
        if (d.state === 'opening') { d.state = 'open'; d.lastTarget = d.target; d.until = now + d.wait; }
        else { d.state = 'closed'; this.doorSound(d, false); }
      }
    }
  }

  /** Move a blocker the way the door's edge sweeps at his position. */
  push(d, p, prevAngle) {
    const g = this.game;
    const o = d.be.origin, po = p.pm.origin;
    const rx = po[0] - o[0], ry = po[1] - o[1];
    const da = (d.angle - prevAngle) * DEG;
    const c = Math.cos(da), s = Math.sin(da);
    const mx = rx * c - ry * s - rx, my = rx * s + ry * c - ry;
    const l = Math.hypot(mx, my) || 1;
    // the swept arc plus a little clearance
    const k = 1 + 2 / l;
    const np = [po[0] + mx * k, po[1] + my * k, po[2]];
    const h = p.hull();
    const box = p.box;
    const was = box?.active;
    if (box) box.active = false;
    const blocked = g.collision.testBox(np, h.mins, h.maxs, MASK_PLAYER);
    if (box) box.active = was;
    if (blocked) return false;
    po[0] = np[0]; po[1] = np[1];
    return true;
  }

  blocking(d) {
    const g = this.game, h = d.be.handle;
    if (!h) return null;
    const c = g.collision;
    for (const p of g.players) {
      if (!p.alive) continue;
      const o = p.pm.origin;
      const hull = p.hull();
      // only this door: trace its hull alone at the player's spot
      const t = c._traceModel(h, c.hullFor(hull.mins, hull.maxs), o[0], o[1], o[2], o[0], o[1], o[2]);
      if (t.startsolid) return p;
    }
    // hostages too
    for (const ho of g.hostages?.list || []) {
      if (!ho.alive || ho.rescued) continue;
      const o = ho.origin;
      const t = c._traceModel(h, 1, o[0], o[1], o[2] + 36, o[0], o[1], o[2] + 36);
      if (t.startsolid) return ho;
    }
    return null;
  }

  doorSound(d, moving) {
    const o = d.be.origin;
    this.game.sound?.play(moving ? 'door_move' : 'door_stop', { pos: [o[0], o[1], o[2]], volume: 0.8 });
  }

  // ---------------------------------------------------------------- +use
  /** Player pressed use: the door / button in front of him (64 units). Returns true if used. */
  use(p) {
    const g = this.game;
    const eye = p.eyePos();
    const a = p.pm.angles;
    const cp = Math.cos(a[0] * DEG);
    const f = [Math.cos(a[1] * DEG) * cp, Math.sin(a[1] * DEG) * cp, -Math.sin(a[0] * DEG)];
    const end = [eye[0] + f[0] * 64, eye[1] + f[1] * 64, eye[2] + f[2] * 64];
    g.collision.trace(eye, end, [0, 0, 0], [0, 0, 0], MASK_SHOT, tr, p.box);
    const be = tr.ent;
    if (!be) return false;
    if (be.door) {
      const d = be.door;
      if (d.state === 'open' || d.state === 'opening') { d.close(); this.doorSound(d, true); }
      else if (d.open(p, g.time)) this.doorSound(d, true);
      return true;
    }
    if (be.button) {
      const b = be.button;
      if (g.time < b.next) return true;
      b.next = g.time + Math.max(0.5, b.wait);
      g.sound?.play('button', { pos: eye, volume: 0.7 });
      const t = this.named.get(b.target);
      if (t && t.classname === 'trigger_camera' && p.isLocal) {
        const look = this.named.get(t.target);
        const pos = [t.origin[0], t.origin[1], t.origin[2]];
        this.camera = { pos, look: look ? look.origin.slice() : null, yaw: t.angle, until: g.time + Math.min(30, t.wait || 10), player: p, start: g.time };
      }
      return true;
    }
    return false;
  }

  /** The trigger_camera view ends on +use / +attack, when it times out, or if the player dies. */
  cameraActive() {
    const c = this.camera, g = this.game;
    if (!c) return null;
    if (g.time > c.until || !c.player.alive) { this.camera = null; return null; }
    return c;
  }

  // ---------------------------------------------------------------- damage
  /** A bullet / knife / blast hit a brush entity. */
  damage(be, amount, point, dir) {
    const b = be?.breakable;
    if (!b || b.broken || b.unbreakable) return;
    b.health -= amount;
    if (b.health > 0) return;
    this.breakIt(b, point, dir);
  }

  breakIt(b, point, dir) {
    const g = this.game;
    b.broken = true;
    if (b.be.handle) b.be.handle.active = false;
    for (const m of b.be.meshes) m.visible = false;
    const m = b.be.model, o = b.be.origin;
    const c = [(m.mins[0] + m.maxs[0]) / 2 + o[0], (m.mins[1] + m.maxs[1]) / 2 + o[1], (m.mins[2] + m.maxs[2]) / 2 + o[2]];
    const surf = BREAK_SURFACE[b.material] || 'concrete';
    const size = [m.maxs[0] - m.mins[0], m.maxs[1] - m.mins[1], m.maxs[2] - m.mins[2]];
    const n = Math.min(10, 3 + Math.round(Math.max(...size) / 16));
    for (let i = 0; i < n; i++) {
      const p = [c[0] + (Math.random() - 0.5) * size[0], c[1] + (Math.random() - 0.5) * size[1], c[2] + (Math.random() - 0.5) * size[2]];
      const d = dir || [0, 0, -1];
      g.effects?.impact?.(p, [-d[0], -d[1], -d[2]], surf, d);
    }
    g.sound?.play(surf === 'glass' ? 'glass' : surf === 'wood' ? 'impact_wood' : 'impact_metal', { pos: c, volume: 1 });
    g.nav?.onBrushChanged?.();
  }
}
