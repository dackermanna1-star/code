// Entities: the player (Tess), NPCs and party followers.
//
// Position = feet point in world px. Animation names follow TECH §12: idle_<dir>, walk_<dir>,
// run_<dir>, sit_<dir> plus per-sprite specials; a missing animation falls back gracefully.
// Followers trail the player along a breadcrumb path (RPG-Maker caterpillar), without collision.
import HW from './hw.js';
import { CHARS } from '../data/chars.js';

export const TILE = 16;
export const WALK_SPEED = 60;   // CONTENT §5.1
export const RUN_SPEED = 112;
export const DIRS = ['up', 'down', 'left', 'right'];
export const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// Collision box at the feet: [x-5, x+5) × [y-4, y+2) — 10×6 px.
const BOX_HW = 5;
const BOX_TOP = 4;
const BOX_BOTTOM = 2;
const NUDGE = 7;              // max sideways correction (px) when clipping a doorway corner
const STRIDE_WALK = 18;       // px travelled per footstep
const STRIDE_RUN = 26;
const NOISE_WALK = 1.5;       // HW.noise.emit radius in tiles (CONTENT §5.4)
const NOISE_RUN = 7;

// Interned animation names so per-frame lookups never build strings.
const ANIM = {};
for (const base of ['idle', 'walk', 'run', 'sit']) {
  ANIM[base] = {};
  for (const d of DIRS) ANIM[base][d] = `${base}_${d}`;
}

/** Facing for a movement vector, keeping the current facing on diagonals when it still fits. */
export function dirFromVec(dx, dy, cur = 'down', hysteresis = 1) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1e-6 && ay < 1e-6) return cur;
  if (ax > ay * hysteresis) return dx > 0 ? 'right' : 'left';
  if (ay > ax * hysteresis) return dy > 0 ? 'down' : 'up';
  const h = dx > 0 ? 'right' : 'left';
  const v = dy > 0 ? 'down' : 'up';
  return cur === h || cur === v ? cur : h;
}

// Attached-light spec fields the lighting system reads live every frame (everything else — type,
// shape, shadows, glow, cage, flicker, … — is baked when the light is created).
const LIGHT_LIVE_KEYS = ['color', 'intensity', 'power', 'radius', 'cone'];
const LIGHT_IGNORE_KEYS = new Set([...LIGHT_LIVE_KEYS, 'on', 'angle', 'dir', 'x', 'y', 'px', 'py']);

/** Does switching an entity light from spec a to spec b need a fresh light (not just new live values)? */
export function lightNeedsRebuild(a, b) {
  if (!a || !b) return true;
  if ((a.type || 'flashlight') !== (b.type || 'flashlight')) return true;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'type' || LIGHT_IGNORE_KEYS.has(k)) continue;
    if (a[k] !== b[k]) return true;
  }
  return false;
}

// Shared drop shadow (soft ellipse) under every character.
let shadowCanvas = null;
function shadow() {
  if (shadowCanvas) return shadowCanvas;
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 5;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(3, 0, 8, 5);
  g.fillRect(1, 1, 12, 3);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 2, 14, 1);
  shadowCanvas = c;
  return c;
}

export class Entity {
  constructor(spec = {}) {
    this.kind = 'entity';
    this.etype = spec.etype || 'npc'; // 'player' | 'npc' | 'follower'
    this.id = spec.id;
    this.spriteId = spec.sprite ?? CHARS[spec.id]?.sprite ?? spec.id;
    this.name = spec.name || CHARS[spec.id]?.name || spec.id;
    this.x = spec.x ?? 0;
    this.y = spec.y ?? 0;
    this.dir = spec.dir || 'down';
    this.visible = spec.visible !== false;
    this.alpha = spec.alpha ?? 1;
    this.solid = !!spec.solid;
    this.script = spec.script || null;   // interaction script (Talk)
    this.shadow = spec.shadow !== false;
    this.moving = false;
    this.running = false;
    this.sitDir = null;
    // Animation override (g.anim): name, once (play then release), hold (keep last frame).
    this.animName = spec.anim || null;
    this.animOnce = false;
    this.animHold = false;
    this._animResolve = null;
    this.animTime = 0;
    this._curName = null;
    this._cur = null;
    this._animCache = new Map();
    this._sheet = undefined;
    this._shadowW = 14;
    this.tall = false;
    // Scripted path following.
    this.path = null;
    this.pathIdx = 0;
    this.pathSpeed = WALK_SPEED;
    this.pathRun = false;
    this._pathResolve = null;
    this.footDist = 0;
    this.sortBias = 0;
    this.sortKey = this.y;
    this.promptX = this.x;
    this.promptY = this.y - 30;
    this.seat = null;          // seat prop while an NPC/follower sits (HW.hiding.seatNpc)
    this.lightSpec = spec.light || null;   // attached light (e.g. Danny's flashlight), see syncLight()
    this._light = null;
    this._lightFrom = null;                // the spec the live light was built from
  }

  /** Attach / detach a light that travels with this entity (HW.lighting.addLight). */
  setLight(spec) {
    this.lightSpec = spec || null;
    this.syncLight();
  }

  /**
   * Create/update/remove the attached light. Coordinates: x/y tile units (centre = x*16+8), px/py world px.
   * A new spec (g.light(id, spec) on an entity that already carries a light) updates the live light in
   * place when only its level/colour/size changed, and rebuilds it when its shape changed (type, shape,
   * shadows, glow, cage, flicker, …) — the lighting system bakes those when a light is created.
   */
  syncLight() {
    const L = HW.lighting;
    if (!this.lightSpec || !this.visible || !L?.addLight) {
      this._dropLight();
      return;
    }
    if (this._light && this._lightFrom !== this.lightSpec) {
      if (lightNeedsRebuild(this._lightFrom, this.lightSpec)) this._dropLight();
      else {
        for (const k of LIGHT_LIVE_KEYS) this._light[k] = this.lightSpec[k];
        this._lightFrom = this.lightSpec;
      }
    }
    if (!this._light) {
      try {
        this._light = L.addLight({ type: 'flashlight', ...this.lightSpec, entity: this.id }) || null;
      } catch (e) {
        console.error('[entities] addLight failed', e);
        this.lightSpec = null;
        return;
      }
      if (!this._light) return;
      this._lightFrom = this.lightSpec;
    }
    const l = this._light;
    l.px = this.x;
    l.py = this.y - 9;
    l.x = l.px / TILE - 0.5;
    l.y = l.py / TILE - 0.5;
    l.angle = DIR_ANGLE[this.dir];
    l.on = true;
  }

  _dropLight() {
    if (this._light) {
      try { HW.lighting?.removeLight?.(this._light); } catch (e) { console.error('[entities] removeLight failed', e); }
    }
    this._light = null;
    this._lightFrom = null;
  }

  get sheet() {
    if (this._sheet === undefined) this.setSprite(this.spriteId);
    return this._sheet;
  }

  setSprite(id) {
    this.spriteId = id;
    this._animCache.clear();
    this._curName = null;
    this._sheet = null;
    if (!id) return;
    try {
      this._sheet = HW.art?.sprite?.(id) || null;
    } catch (e) {
      console.error(`[entities] sprite '${id}' failed`, e);
      this._sheet = null;
    }
    this.tall = !!this._sheet && this._sheet.fh > 40;
    // Shadow width follows the sprite (the Colonel casts a much bigger one than Tess).
    this._shadowW = this._sheet ? Math.max(14, Math.round(this._sheet.fw * 0.6)) : 14;
  }

  face(dir) {
    if (DIR_VEC[dir]) this.dir = dir;
  }

  /** Play an animation override. once → resolves when it finishes (then releases unless hold). */
  playAnim(name, { once = false, hold = false } = {}) {
    this._finishAnim();
    this.animName = name || null;
    this.animOnce = !!once && !!name;
    this.animHold = !!hold;
    this._curName = null;
    if (!this.animOnce) return Promise.resolve();
    return new Promise((resolve) => { this._animResolve = resolve; });
  }

  clearAnim() {
    this._finishAnim();
    this.animName = null;
    this.animOnce = false;
  }

  _finishAnim() {
    const r = this._animResolve;
    this._animResolve = null;
    if (r) r();
  }

  /** The animation name the entity should show right now. */
  animNameNow() {
    if (this.animName) return this.animName;
    if (this.sitDir) return ANIM.sit[this.sitDir];
    if (this.moving) return this.running ? ANIM.run[this.dir] : ANIM.walk[this.dir];
    return ANIM.idle[this.dir];
  }

  /** Resolve an animation by name with fallbacks (run→walk, sit→idle, any→idle_<dir>→first). */
  resolveAnim(name) {
    let a = this._animCache.get(name);
    if (a !== undefined) return a;
    const sheet = this.sheet;
    a = null;
    if (sheet && sheet.anims) {
      const anims = sheet.anims;
      a = anims[name] || null;
      if (!a && name.startsWith('run_')) a = anims[`walk_${name.slice(4)}`] || null;
      if (!a && name.includes('_')) {
        const d = name.slice(name.lastIndexOf('_') + 1);
        if (DIR_VEC[d]) a = anims[`idle_${d}`] || null;
      }
      if (!a) a = anims[`idle_${this.dir}`] || anims.idle_down || null;
      if (!a) for (const k in anims) { a = anims[k]; break; }
      if (a && (!a.frames || !a.frames.length)) a = null;
    }
    this._animCache.set(name, a);
    return a;
  }

  updateAnim(dt) {
    const name = this.animNameNow();
    if (name !== this._curName) {
      this._curName = name;
      this._cur = this.resolveAnim(name);
      this.animTime = 0;
    } else {
      this.animTime += dt;
    }
    if (this.animOnce && this._cur) {
      const dur = this._cur.frames.length / (this._cur.fps || 6);
      if (this.animTime >= dur) {
        this.animOnce = false;
        if (!this.animHold) this.animName = null;
        else this.animTime = dur; // rest on the last frame
        this._finishAnim();
      }
    }
  }

  frameImage() {
    const a = this._cur;
    if (!a) return null;
    const n = a.frames.length;
    let i = Math.floor(this.animTime * (a.fps || 6));
    if (a.loop === false || this.animHold || (this.animOnce && this.animName)) i = Math.min(i, n - 1);
    else i %= n;
    return a.frames[i];
  }

  // ---- scripted movement -------------------------------------------------------------------
  /** Follow world-px waypoints; resolves true on arrival, false if interrupted. */
  walkPath(points, { speed = WALK_SPEED, run = false } = {}) {
    this.stopPath(false);
    if (!points || !points.length) return Promise.resolve(true);
    this.path = points;
    this.pathIdx = 0;
    this.pathSpeed = speed;
    this.pathRun = run;
    if (this.animName && !this.animHold) this.clearAnim();
    return new Promise((resolve) => { this._pathResolve = resolve; });
  }

  stopPath(result = false) {
    const r = this._pathResolve;
    this.path = null;
    this._pathResolve = null;
    this.moving = false;
    if (r) r(result);
  }

  updatePath(dt) {
    if (!this.path) return;
    const map = HW.map;
    let budget = this.pathSpeed * dt;
    while (budget > 0 && this.path) {
      const [tx, ty] = this.path[this.pathIdx];
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        this.dir = dirFromVec(dx, dy, this.dir, 1.05);
        if (this.etype === 'player') { this.aimX = dx / d; this.aimY = dy / d; } // the beam follows a scripted walk
        if (map) openDoorAhead(this, map, dx / d, dy / d);
      }
      if (d <= budget) {
        this._advanceFeet(tx - this.x, ty - this.y);
        this.x = tx;
        this.y = ty;
        budget -= d;
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) {
          const r = this._pathResolve;
          this.path = null;
          this._pathResolve = null;
          this.moving = false;
          if (r) r(true);
          return;
        }
      } else {
        const k = budget / d;
        this._advanceFeet(dx * k, dy * k);
        this.x += dx * k;
        this.y += dy * k;
        budget = 0;
      }
    }
    this.moving = !!this.path;
    this.running = this.moving && this.pathRun;
  }

  /** Accumulate distance for footsteps (NPCs and followers make sound too). */
  _advanceFeet(dx, dy) {
    this.footDist += Math.hypot(dx, dy);
    const stride = this.running ? STRIDE_RUN : STRIDE_WALK;
    if (this.footDist >= stride) {
      this.footDist -= stride;
      this.onFootstep();
    }
  }

  onFootstep() {
    const map = HW.map;
    if (!map || !this.visible) return;
    try {
      HW.audio?.footstep?.(map.surfaceAt(this.x, this.y), { run: this.running, x: this.x, y: this.y, npc: this.etype !== 'player', id: this.id });
    } catch (e) {
      console.error('[entities] footstep failed', e);
    }
  }

  // ---- drawing -----------------------------------------------------------------------------
  /** Draw at the camera offset. `clipY` (screen px) limits drawing to rows above it (tall pass). */
  draw(ctx, camX, camY, alphaMul = 1, clipY = null) {
    if (!this.visible) return;
    const sheet = this.sheet;
    if (!sheet) return;
    const img = this.frameImage();
    if (!img) return;
    const fx = Math.round(this.x) - camX;
    const fy = Math.round(this.y) - camY;
    const dx = fx - sheet.ax;
    const dy = fy - sheet.ay;
    if (dx > ctx.canvas.width || dy > ctx.canvas.height || dx + sheet.fw < 0 || dy + sheet.fh < 0) return;
    const a = this.alpha * alphaMul;
    if (a <= 0) return;
    if (a < 1) ctx.globalAlpha = a;
    if (clipY !== null) {
      const h = Math.min(sheet.fh, clipY - dy);
      if (h > 0) ctx.drawImage(img, 0, 0, sheet.fw, h, dx, dy, sheet.fw, h);
    } else {
      if (this.shadow && !this.sitDir) {
        const sw = this._shadowW;
        ctx.drawImage(shadow(), fx - (sw >> 1), fy - 2, sw, 5);
      }
      ctx.drawImage(img, dx, dy);
    }
    if (a < 1) ctx.globalAlpha = 1;
  }

  updatePrompt() {
    this.promptX = this.x;
    this.promptY = this.y - (this._sheet ? this._sheet.ay : 30) - 2;
  }
}

/** NPCs and the scripted player open closed, unlocked doors in front of them as they walk. */
function openDoorAhead(e, map, ux, uy) {
  const px = e.x + ux * 10;
  const py = e.y + uy * 10 - 1;
  const p = map.solidPropAt(Math.floor(px / TILE), Math.floor(py / TILE));
  if (p && p.def.interact === 'door' && p.state !== 'open' && map.doorPassable(p)) {
    HW.interact?.openDoor?.(p, { by: e.id });
  }
}

// =============================================================================================
export class Player extends Entity {
  constructor(spec = {}) {
    super({ id: 'tess', sprite: 'tess', ...spec, etype: 'player' });
    this.hidden = null;      // 'locker' while inside a hiding spot
    this.hideProp = null;
    this.seated = null;      // the seat prop while sitting
    this.still = true;       // no movement input for ≥ 0.5 s (game/hiding.js)
    this.busy = false;       // short engine-driven moves (sitting down, climbing into a locker)
    this.inputActive = false;
    this.aimX = 0;
    this.aimY = 1;
    this.aimSeq = 0;         // ++ on every explicit face() (game/flashlight.js re-aims in cutscenes)
    this.speed = 0;
    this.blockedBy = null;   // solid prop bumped this step
    this.sitTime = -10;      // HW.time when she last sat down (the Colonel notices sitting, DESIGN R2)
    this.eyesShut = false;   // holding Confirm while seated (DESIGN §4.1)
  }

  animNameNow() {
    if (this.eyesShut && this.seated && !this.animName && this.sheet?.anims?.heads_down) return 'heads_down';
    return super.animNameNow();
  }

  face(dir) {
    super.face(dir);
    const v = DIR_VEC[this.dir];
    this.aimX = v[0];
    this.aimY = v[1];
    this.aimSeq++; // the flashlight re-aims on every explicit turn, even in cutscenes
  }

  /** Face toward a world point and aim (the flashlight) exactly at it (hand height → point). */
  faceToward(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    this.face(dirFromVec(dx, dy, this.dir));
    const ax = x - this.x;
    const ay = (y - 6) - (this.y - 9);
    const d = Math.hypot(ax, ay);
    if (d > 0.5) { this.aimX = ax / d; this.aimY = ay / d; }
  }

  /** Reset transient states (map load, new game). */
  resetTransient() {
    this.stopPath(false);
    this.clearAnim();
    this.hidden = null;
    this.hideProp = null;
    if (this.seated) this.seated.seatedBy = null;
    this.seated = null;
    this.sitDir = null;
    this.eyesShut = false;
    this.busy = false;
    this.visible = true;
    this.alpha = 1;
    this.sortBias = 0;
    this.moving = false;
    this.running = false;
    this.inputActive = false;
  }

  /** Box test against tiles, solid props and solid entities. */
  free(x, y) {
    const map = HW.map;
    const x0 = Math.floor((x - BOX_HW) / TILE);
    const x1 = Math.floor((x + BOX_HW - 0.001) / TILE);
    const y0 = Math.floor((y - BOX_TOP) / TILE);
    const y1 = Math.floor((y + BOX_BOTTOM - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (map.isSolid(tx, ty)) return false;
    const list = HW.entities.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === this || !e.solid || !e.visible) continue;
      if (x - BOX_HW < e.x + BOX_HW && x + BOX_HW > e.x - BOX_HW && y - BOX_TOP < e.y + BOX_BOTTOM && y + BOX_BOTTOM > e.y - BOX_TOP) return false;
    }
    return true;
  }

  /** Input-driven movement for one fixed step (only called when the player has control). */
  control(dt) {
    const input = HW.input;
    const ax = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    const ay = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    this.inputActive = ax !== 0 || ay !== 0;
    this.blockedBy = null;
    if (this.hidden || this.busy) { this.moving = false; return; }
    if (this.seated) {
      this.moving = false;
      if (this.inputActive) HW.hiding?.stand?.();
      return;
    }
    if (!this.inputActive) {
      this.moving = false;
      this.running = false;
      this.speed = 0;
      return;
    }
    if (this.animName && !this.animHold) this.clearAnim();
    const run = input.down('run');
    const speed = run ? RUN_SPEED : WALK_SPEED;
    let vx = ax;
    let vy = ay;
    if (ax && ay) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    this.dir = dirFromVec(ax, ay, this.dir);
    this.aimX = vx;
    this.aimY = vy;
    const ox = this.x;
    const oy = this.y;
    const step = speed * dt;
    this._moveAxis(vx * step, 0, ay === 0);
    this._moveAxis(0, vy * step, ax === 0);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.moving = true; // walk in place against walls, like the classics
    this.running = run && moved > 0.01;
    this.speed = moved / dt;
    if (moved > 0) this._footsteps(moved, run);
    if (this.blockedBy) HW.interact?.bump?.(this.blockedBy);
  }

  _moveAxis(dx, dy, allowNudge) {
    if (!dx && !dy) return;
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (this.free(nx, ny)) { this.x = nx; this.y = ny; return; }
    // Close the gap to the obstacle in whole pixels.
    const len = Math.abs(dx || dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let k = Math.floor(len); k >= 1; k--) {
      if (this.free(this.x + sx * k, this.y + sy * k)) { this.x += sx * k; this.y += sy * k; break; }
    }
    this._noteBlocker(sx, sy);
    if (allowNudge) this._nudge(sx, sy, len);
  }

  /** Slide around a corner when only a few pixels short of a 1-tile opening. */
  _nudge(sx, sy, amount) {
    for (let k = 1; k <= NUDGE; k++) {
      for (let s = 1; s >= -1; s -= 2) {
        const ox = sy ? s * k : 0;
        const oy = sx ? s * k : 0;
        if (this.free(this.x + ox + sx, this.y + oy + sy) && this.free(this.x + Math.sign(ox), this.y + Math.sign(oy))) {
          const m = Math.min(amount, k);
          this.x += Math.sign(ox) * m;
          this.y += Math.sign(oy) * m;
          return;
        }
      }
    }
  }

  _noteBlocker(sx, sy) {
    const map = HW.map;
    if (sx) {
      const tx = Math.floor((this.x + sx * (BOX_HW + 1)) / TILE);
      for (let ty = Math.floor((this.y - BOX_TOP) / TILE); ty <= Math.floor((this.y + BOX_BOTTOM - 0.001) / TILE); ty++) {
        const p = map.solidPropAt(tx, ty);
        if (p) { this.blockedBy = p; return; }
      }
    } else {
      const ty = Math.floor((sy > 0 ? this.y + BOX_BOTTOM + 1 : this.y - BOX_TOP - 1) / TILE);
      for (let tx = Math.floor((this.x - BOX_HW) / TILE); tx <= Math.floor((this.x + BOX_HW - 0.001) / TILE); tx++) {
        const p = map.solidPropAt(tx, ty);
        if (p) { this.blockedBy = p; return; }
      }
    }
  }

  _footsteps(moved, run) {
    this.footDist += moved;
    const stride = run ? STRIDE_RUN : STRIDE_WALK;
    if (this.footDist < stride) return;
    this.footDist -= stride;
    this.onFootstep();
    try {
      HW.noise?.emit?.(this.x, this.y, run ? NOISE_RUN : NOISE_WALK, run ? 'run' : 'walk');
    } catch (e) {
      console.error('[entities] noise.emit failed', e);
    }
  }
}

// =============================================================================================
const TRAIL_N = 512;          // breadcrumb ring buffer size (points)
const TRAIL_STEP = 2;         // px between breadcrumbs
const FOLLOW_GAP = 9;         // breadcrumbs between party members (= 18 px)
const FOLLOW_TELEPORT = 120;  // px: snap a follower that fell far behind

export const entities = {
  list: [],
  byId: new Map(),
  player: null,
  followers: [],
  _trail: new Float32Array(TRAIL_N * 2),
  _trailHead: 0,
  _trailCount: 0,
  _tp: { x: 0, y: 0 },

  /** Remove everything (new game / title). */
  reset() {
    for (const e of this.list) {
      e.stopPath(false);
      e.clearAnim();
      if (e._light) { e.lightSpec = null; e.syncLight(); }
    }
    this.list.length = 0;
    this.byId.clear();
    this.followers.length = 0;
    this.player = null;
    HW.player = null;
  },

  get(id) {
    if (id === 'player' || id === 'tess') return this.player;
    return this.byId.get(id) || null;
  },

  _add(e) {
    if (this.byId.has(e.id)) this.despawn(e.id);
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  },

  ensurePlayer() {
    if (!this.player) {
      this.player = new Player();
      this.list.unshift(this.player);
      this.byId.set('tess', this.player);
      HW.player = this.player;
    }
    return this.player;
  },

  /**
   * Spawn an NPC. spec: { id, sprite, at (anchor | [tx,ty]) | x,y (tiles) | px,py (world px), dir,
   * anim, solid, follow (join the caterpillar without changing the party), script (Talk), visible }.
   */
  spawn(spec) {
    if (!spec || !spec.id) throw new Error('spawn: id required');
    if (spec.id === 'tess' || spec.id === 'player') throw new Error('spawn: the player already exists');
    const pos = resolvePoint(spec.at ?? (spec.px !== undefined ? { x: spec.px, y: spec.py } : spec.x !== undefined ? [spec.x, spec.y] : null));
    const e = new Entity({ ...spec, x: pos?.x ?? this.player?.x ?? 0, y: pos?.y ?? this.player?.y ?? 0, dir: spec.dir || pos?.dir || 'down' });
    if (!e.lightSpec && HW.state?.entityLights?.[e.id]) e.lightSpec = HW.state.entityLights[e.id];
    this._add(e);
    e.sortKey = e.y;
    if (spec.follow) {
      e._adhoc = true; // follows without being in HW.state.party
      this._makeFollower(e);
    }
    return e;
  },

  despawn(id) {
    const e = this.byId.get(id);
    if (!e || e === this.player) return false;
    e.stopPath(false);
    e.clearAnim();
    if (e.seat) { e.seat.seatedBy = null; e.seat = null; }
    if (e._light) { e.lightSpec = null; e.syncLight(); }
    this.byId.delete(id);
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    const f = this.followers.indexOf(e);
    if (f >= 0) this.followers.splice(f, 1);
    return true;
  },

  _makeFollower(e) {
    e.etype = 'follower';
    e.solid = false;
    if (!this.followers.includes(e)) this.followers.push(e);
  },

  /** Make the follower list match HW.state.party (spawning missing members behind the player). */
  syncParty() {
    const party = HW.state?.party || [];
    for (const f of [...this.followers]) {
      if (!party.includes(f.id) && !f._adhoc) {
        // Leaving the party: stay where they are as an ordinary NPC.
        f.etype = 'npc';
        this.followers.splice(this.followers.indexOf(f), 1);
      }
    }
    for (const id of party) {
      let e = this.byId.get(id);
      if (!e) {
        const p = this._trailPoint((this.followers.length + 1) * FOLLOW_GAP);
        e = this._add(new Entity({ id, x: p.x, y: p.y, dir: this.player?.dir || 'down', light: HW.state?.entityLights?.[id] }));
      }
      this._makeFollower(e);
    }
    // Keep follower order = party order (ad-hoc followers last).
    this.followers.sort((a, b) => rank(a) - rank(b));
    function rank(e) { const i = party.indexOf(e.id); return i < 0 ? 99 : i; }
  },

  /** Place the player for a fresh map; NPCs are cleared, party followers re-created behind. */
  onMapLoad(map, x, y, dir) {
    const p = this.ensurePlayer();
    for (const e of [...this.list]) if (e !== p) this.despawn(e.id);
    p.resetTransient();
    p.x = x;
    p.y = y;
    p.face(dir || p.dir);
    p.sortKey = p.y;
    this.syncParty();
    this.onPlayerMoved();
  },

  /** The player was placed by a script/teleport: re-lay the trail and line the party up behind. */
  onPlayerMoved() {
    const p = this.player;
    if (!p) return;
    this._resetTrail();
    this.followers.forEach((f, i) => {
      const t = this._trailPoint((i + 1) * FOLLOW_GAP);
      f.x = t.x;
      f.y = t.y;
      f.dir = p.dir;
      f.moving = false;
      f.sortKey = f.y;
    });
  },

  /** Lay a straight breadcrumb line behind the player (opposite their facing). */
  _resetTrail() {
    const p = this.player;
    if (!p) return;
    const v = DIR_VEC[p.dir] || DIR_VEC.down;
    const map = HW.map;
    // Line the party up behind the player; if that's blocked (wall, desk) try the sides, then in front.
    const options = [[-v[0], -v[1]], [v[1], v[0]], [-v[1], -v[0]], [v[0], v[1]]];
    const clear = (dx, dy) => {
      if (!map) return true;
      for (const d of [16, 32]) if (map.isSolid(Math.floor((p.x + dx * d) / TILE), Math.floor((p.y + dy * d) / TILE))) return false;
      return true;
    };
    const [bx, by] = options.find(([dx, dy]) => clear(dx, dy)) || options[0];
    for (let k = 0; k < TRAIL_N; k++) {
      const back = TRAIL_N - 1 - k;
      const d = Math.min(back * TRAIL_STEP, 40);
      this._trail[k * 2] = p.x + bx * d;
      this._trail[k * 2 + 1] = p.y + by * d;
    }
    this._trailHead = TRAIL_N - 1;
    this._trailCount = TRAIL_N;
  },

  _recordTrail() {
    const p = this.player;
    const hx = this._trail[this._trailHead * 2];
    const hy = this._trail[this._trailHead * 2 + 1];
    const dx = p.x - hx;
    const dy = p.y - hy;
    if (dx * dx + dy * dy < TRAIL_STEP * TRAIL_STEP) return;
    this._trailHead = (this._trailHead + 1) % TRAIL_N;
    this._trail[this._trailHead * 2] = p.x;
    this._trail[this._trailHead * 2 + 1] = p.y;
    if (this._trailCount < TRAIL_N) this._trailCount++;
  },

  /** Breadcrumb `back` points behind the head (shared result object). */
  _trailPoint(back) {
    const tp = this._tp;
    if (!this._trailCount) {
      tp.x = this.player?.x ?? 0;
      tp.y = this.player?.y ?? 0;
      return tp;
    }
    const b = Math.min(back, this._trailCount - 1);
    const i = (this._trailHead - b + TRAIL_N) % TRAIL_N;
    tp.x = this._trail[i * 2];
    tp.y = this._trail[i * 2 + 1];
    return tp;
  },

  _updateFollowers(dt) {
    const p = this.player;
    for (let i = 0; i < this.followers.length; i++) {
      const f = this.followers[i];
      if (f.path || f.animHold || f.seat) continue; // scripted moves, poses and seats take over
      const t = this._trailPoint((i + 1) * FOLLOW_GAP);
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > FOLLOW_TELEPORT) {
        f.x = t.x;
        f.y = t.y;
        f.moving = false;
        continue;
      }
      if (d < 0.6) {
        f.moving = false;
        f.running = false;
        continue;
      }
      const base = p.running ? RUN_SPEED : WALK_SPEED;
      const sp = (d > 22 ? base * 1.3 : base) * dt;
      const k = Math.min(1, sp / d);
      f._advanceFeet(dx * k, dy * k);
      f.x += dx * k;
      f.y += dy * k;
      f.moving = true;
      f.running = p.running;
      f.dir = dirFromVec(dx, dy, f.dir, 1.25);
    }
  },

  update(dt) {
    const p = this.player;
    if (!p || !HW.map) return;
    if (HW.game.controllable && !p.path) p.control(dt);
    else if (!p.path) { p.moving = false; p.running = false; p.inputActive = false; }
    for (let i = 0; i < this.list.length; i++) this.list[i].updatePath(dt);
    this._recordTrail();
    this._updateFollowers(dt);
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      e.updateAnim(dt);
      e.sortKey = e.y + e.sortBias;
      e.updatePrompt();
      if (e.lightSpec || e._light) e.syncLight();
    }
  },
};

/**
 * Resolve a position spec to { x, y, dir? } in world px (feet):
 * anchor name | [tx, ty] | { x, y } (world px) | entity id ('@id') | entity object.
 */
export function resolvePoint(t) {
  if (t === null || t === undefined) return null;
  const map = HW.map;
  if (typeof t === 'string') {
    if (t.startsWith('@')) {
      const e = entities.get(t.slice(1));
      return e ? { x: e.x, y: e.y, dir: e.dir } : null;
    }
    const a = map?.anchor(t);
    if (!a) console.warn(`[entities] unknown anchor '${t}' on map ${map?.id}`);
    return a;
  }
  if (Array.isArray(t)) return { x: t[0] * TILE + 8, y: t[1] * TILE + 12, dir: t[2] };
  if (t instanceof Entity) return { x: t.x, y: t.y, dir: t.dir };
  if (typeof t === 'object' && Number.isFinite(t.x) && Number.isFinite(t.y)) return { x: t.x, y: t.y, dir: t.dir };
  return null;
}

export default entities;
