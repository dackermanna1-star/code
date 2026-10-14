// Title screen backdrop: the loaded map at dusk behind the main menu.
//
//   const title = new TitleScene({ game, renderer, sound, container });
//   title.start();  per frame while no game is up: title.update(dt);  title.stop();
//
// Every shot is picked from the bots' nav graph: a camera spot with a long clear view down
// a walkable route, a slow dolly along it, and a few zombies shambling up that route
// toward the camera (they walk the nav path, so they never go through walls). Shots
// last SHOT_LEN s and cross through black. The dusk look is CSS over the game canvas
// (multiply / screen gradients, a vignette, film grain, drifting dust and embers), so the
// world's baked lighting is untouched and nothing of it remains once a game starts.
// Maps too small for a nav-graph shot fall back to a slow look around from a spawn. An
// original map can place its own shots instead (MAP.titleShots: night and underground maps
// have no sunlit, open-sky spots for the random picker).
import { createPlayerModel } from '../assets/playermodels.js';
import { lightCurve } from '../map/meshbuilder.js';
import { MASK_SHOT } from '../engine/collision.js';

const SHOT_LEN = 16; // s a shot lasts
const FADE = 1.3; // s through black between shots
const ZOMBIES = 6; // models kept for the backdrop (one may be a special)
const SPECIALS = ['boomer', 'hunter', 'charger', 'smoker'];
const EYE = 70; // camera height over the floor (a bit above a player's eye)
const MOTES = 70;

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (u) => u * u * (3 - 2 * u);
const DEG = Math.PI / 180;

export class TitleScene {
  constructor({ game, renderer, sound, container }) {
    this.game = game;
    this.renderer = renderer;
    this.sound = sound;
    this.active = false;
    this.t = 0;
    this.shot = null;
    this.lastSpot = null;
    this.models = []; // { m, skin }
    this.theme = null;
    this.groanAt = 0;
    this.light = [1, 1, 1];
    this.vpKey = '';
    this._buildOverlay(container);
  }

  // ---------------------------------------------------------------- public

  start() {
    if (this.active) return;
    this.active = true;
    this.root.hidden = false;
    this.shot = null;
    this.t = 0;
    this.renderer.canvas.style.filter = `${this.renderer.canvas.dataset.grade || ''} saturate(1.12) contrast(1.06)`.trim(); // (on top of the map's grade: engine/fog.js)
    try { if (!this.theme) this.theme = this.sound.loop('title_theme', { volume: 0.55, fadeIn: 2.5 }); } catch { /* sound not ready */ }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.root.hidden = true;
    this.renderer.canvas.style.filter = this.renderer.canvas.dataset.grade || '';
    for (const z of this.models) z.m.object3D.visible = false;
    this.theme?.stop?.(0.8);
    this.theme = null;
  }

  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.1);
    this._fitOverlay();
    // a previous game's people stay where they were: keep them out of the shot
    for (const p of this.game.players) if (p.model) p.model.object3D.visible = false;
    if (!this.shot || this.t >= SHOT_LEN) this._newShot();
    this.t += dt;
    const s = this.shot;
    if (s.still) this._stillView(); else this._camera(s);
    for (const z of s.zombies) this._walk(z, dt);
    // fade through black at both ends of a shot
    const a = Math.max(0, 1 - this.t / FADE, (this.t - (SHOT_LEN - FADE)) / FADE);
    this.fade.style.opacity = Math.min(1, a).toFixed(3);
    this._groan(s);
    this._motes(dt);
  }

  // ---------------------------------------------------------------- shots

  _newShot() {
    this.t = 0;
    for (const z of this.models) z.m.object3D.visible = false;
    this.shot = this._pickShot() || { still: true, zombies: [] };
  }

  /** A camera spot with a clear view down a walkable route, and zombies coming up it. */
  _pickShot() {
    const g = this.game, nav = g.nav, N = nav?.nodes;
    if (!N || N.length < 60) return null;
    const placed = g.W?.mapDef?.titleShots; // (an original map's hand-placed shots: src/map/maps/*)
    if (placed?.length) { const s = this._placedShot(placed); if (s) return s; }
    const W = g.collision;
    const box = [-14, -14, -14], boxM = [14, 14, 14];
    for (let tries = 0; tries < 200; tries++) {
      const a = N[(Math.random() * N.length) | 0];
      if (this.lastSpot && Math.hypot(a.x - this.lastSpot[0], a.y - this.lastSpot[1]) < 700) continue;
      const eye = [a.x, a.y, a.z + EYE + rnd(0, 26)];
      if (W.testBox(eye, box, boxM, MASK_SHOT)) continue;
      // outdoors (open sky overhead): tunnels and rooms make dark, cramped shots
      if (W.occluded(eye, [eye[0], eye[1], eye[2] + 900], MASK_SHOT)) continue;
      // b: somewhere 650-1300 u away, in view, reached by a fairly straight route
      let b = null, path = null;
      for (let k = 0; k < 24 && !path; k++) {
        const c = N[(Math.random() * N.length) | 0];
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d < 650 || d > 1300 || Math.abs(c.z - a.z) > 140) continue;
        if (W.occluded(eye, [c.x, c.y, c.z + 40], MASK_SHOT)) continue;
        // ...looking toward the sun-lit end of the route, where the horde reads against the ground
        if (g.W.sampler.sample([c.x, c.y, c.z + 8], this.light)[1] < 0.5) continue;
        const p = nav.findPath(c, a);
        if (!p || p.length < 8 || nav.pathLength(p) > d * 1.45) continue;
        b = c; path = p;
      }
      if (!path) continue;
      // the dolly: drift 120-200 u toward b (or stay put when that would clip)
      const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy);
      const yaw = Math.atan2(dy, dx) / DEG;
      const side = rnd(-0.35, 0.35);
      const len = rnd(120, 200);
      const end = [eye[0] + (dx / dl + side * -dy / dl) * len, eye[1] + (dy / dl + side * dx / dl) * len, eye[2] + rnd(-10, 14)];
      const clear = !W.occluded(eye, end, MASK_SHOT) && !W.testBox(end, box, boxM, MASK_SHOT);
      // zombies: on the route, where the camera sees them, 380-1150 u out
      const pts = path.map((n) => [n.x, n.y, n.z]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const spots = [];
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], de = Math.hypot(q[0] - eye[0], q[1] - eye[1]);
        if (de < 380 || de > 1150) continue;
        if (W.occluded(eye, [q[0], q[1], q[2] + 46], MASK_SHOT)) continue;
        spots.push(i);
      }
      if (spots.length < 3) continue;
      this.lastSpot = eye;
      const zombies = [];
      const n = Math.min(ZOMBIES, 4 + ((Math.random() * 3) | 0));
      const used = [];
      for (let k = 0; k < 40 && zombies.length < n; k++) {
        // spread out along the route: a straggling line, not a clump
        const at = cum[spots[(Math.random() * spots.length) | 0]] + rnd(-16, 16);
        if (used.some((u) => Math.abs(u - at) < 70)) continue;
        used.push(at);
        zombies.push(this._zombie(zombies.length, pts, cum, at, eye, zombies.length === 0 && Math.random() < 0.35));
      }
      if (zombies.length < 2) continue;
      return {
        still: false, eye0: eye, eye1: clear ? end : eye.slice(), yaw0: yaw + rnd(-9, 9), yawDrift: rnd(-6, 6),
        pitch: rnd(-4, 3), zombies,
      };
    }
    return null;
  }

  /**
   * The map's own shots in turn ({ eye, look, dolly? }): the camera at eye facing look, a slow
   * dolly toward it (or to dolly), zombies walking the nav path from look toward the camera.
   */
  _placedShot(list) {
    const g = this.game, nav = g.nav, W = g.collision;
    this.placedIdx = ((this.placedIdx ?? -1) + 1) % list.length;
    const sh = list[this.placedIdx];
    const eye = sh.eye.slice(), look = sh.look;
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dl = Math.hypot(dx, dy) || 1;
    const end = sh.dolly ? sh.dolly.slice() : [eye[0] + dx / dl * 150, eye[1] + dy / dl * 150, eye[2]];
    const box = [-14, -14, -14], boxM = [14, 14, 14];
    const clear = !W.occluded(eye, end, MASK_SHOT) && !W.testBox(end, box, boxM, MASK_SHOT);
    const a = nav.nearestXY([eye[0], eye[1], eye[2] - EYE], 400, 400), b = nav.nearestXY([look[0], look[1], look[2]], 400, 200);
    const path = a && b ? nav.findPath(b, a) : null;
    const zombies = [];
    if (path && path.length > 3) {
      const pts = path.map((n) => [n.x, n.y, n.z]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const spots = [];
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], de = Math.hypot(q[0] - eye[0], q[1] - eye[1]);
        if (de > 300 && de < 1500 && !W.occluded(eye, [q[0], q[1], q[2] + 46], MASK_SHOT)) spots.push(i);
      }
      const used = [];
      for (let k = 0; k < 40 && spots.length && zombies.length < 5; k++) {
        const at = cum[spots[(Math.random() * spots.length) | 0]] + rnd(-16, 16);
        if (used.some((u) => Math.abs(u - at) < 70)) continue;
        used.push(at);
        zombies.push(this._zombie(zombies.length, pts, cum, at, eye, zombies.length === 0 && Math.random() < 0.35));
      }
    }
    return { still: false, eye0: eye, eye1: clear ? end : eye.slice(), yaw0: Math.atan2(dy, dx) / DEG, yawDrift: rnd(-5, 5), pitch: Math.atan2(eye[2] - look[2], dl) / DEG, zombies };
  }

  /** The old backdrop: a slow look around from a spawn (maps without a usable nav graph). */
  _stillView() {
    const g = this.game, t = performance.now() / 1000;
    const s = g.spawns.CT[0] || g.spawns.T[0];
    const o = s ? s.origin : [0, 0, 0];
    this.renderer.setView([o[0], o[1], o[2] + 28], 4, (s?.angle || 0) + Math.sin(t * 0.05) * 25, 0);
  }

  _camera(s) {
    const u = smooth(Math.min(1, this.t / SHOT_LEN));
    const e = this._eye || (this._eye = [0, 0, 0]);
    for (let i = 0; i < 3; i++) e[i] = s.eye0[i] + (s.eye1[i] - s.eye0[i]) * u;
    e[2] += Math.sin(this.t * 0.7) * 1.2; // a hand-held breath
    const yaw = s.yaw0 + s.yawDrift * (u - 0.5) + Math.sin(this.t * 0.31) * 1.5;
    const pitch = s.pitch + Math.sin(this.t * 0.23) * 0.8;
    this.renderer.setView(e, pitch, yaw, Math.sin(this.t * 0.19) * 0.6);
    this.sound.setListener?.(e, yaw, pitch);
  }

  // ---------------------------------------------------------------- zombies

  _model(i, special) {
    while (this.models.length <= i) this.models.push(null);
    let z = this.models[i];
    const skin = special ? SPECIALS[(Math.random() * SPECIALS.length) | 0] : 'zombie';
    if (z && z.skin !== skin) { this.renderer.world.remove(z.m.object3D); z.m.dispose(); z = null; }
    if (!z) {
      const m = createPlayerModel(skin);
      this.renderer.world.add(m.object3D);
      z = this.models[i] = { m, skin };
    }
    z.m.reset?.();
    return z;
  }

  _zombie(i, pts, cum, along, eye, special) {
    const z = this._model(i, special);
    return {
      m: z.m, pts, cum, s: Math.max(0, along), speed: rnd(26, 44) * (special ? 1.25 : 1), lurch: rnd(0, 6),
      side: (i & 1 ? 1 : -1) * rnd(4, 22), yaw: null, eye, pos: [0, 0, 0], idle: rnd(0, 1),
    };
  }

  /** Shamble along the route toward the camera; stop short of it. */
  _walk(z, dt) {
    const { pts, cum } = z;
    const end = cum[cum.length - 1];
    const near = Math.hypot(z.pos[0] - z.eye[0], z.pos[1] - z.eye[1]);
    // a lurching gait: the pace swells and sags with each step
    const pace = z.speed * (0.65 + 0.35 * Math.sin(this.t * 2.1 + z.lurch));
    const moving = z.s < end && !(z.yaw != null && near < 150);
    if (moving) z.s = Math.min(end, z.s + pace * dt);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < z.s) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (z.s - cum[i - 1]) / seg));
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    z.pos[0] = a[0] + dx * f - dy / dl * z.side;
    z.pos[1] = a[1] + dy * f + dx / dl * z.side;
    z.pos[2] = a[2] + (b[2] - a[2]) * f;
    // heading: the route ahead, eased (the grid path zigzags)
    const want = moving ? Math.atan2(dy, dx) : Math.atan2(z.eye[1] - z.pos[1], z.eye[0] - z.pos[0]);
    if (z.yaw == null) z.yaw = want;
    let d = want - z.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    z.yaw += d * Math.min(1, dt * 2.5);
    const o = z.m.object3D;
    o.visible = true;
    o.position.set(z.pos[0], z.pos[1], z.pos[2]);
    o.rotation.set(0, 0, z.yaw);
    z.m.update(dt, { speed: moving ? pace : 0, onGround: true, pitch: 8 + Math.sin(this.t * 0.9 + z.idle * 6) * 6 });
    const l = this.game.W.sampler.sample([z.pos[0], z.pos[1], z.pos[2] + 8], this.light);
    const r = lightCurve(l[0]), gg = lightCurve(l[1]), bb = lightCurve(l[2]);
    z.m.setLight([r * 0.55 + 0.1, gg * 0.55 + 0.1, bb * 0.55 + 0.1], [r * 0.5, gg * 0.5, bb * 0.5], this.game.W.lighting.sunDir);
  }

  /** Now and then one of them moans (positional: louder as they close in). */
  _groan(s) {
    if (!s.zombies.length || this.t < this.groanAt) return;
    this.groanAt = this.t + rnd(2.5, 6);
    const z = s.zombies[(Math.random() * s.zombies.length) | 0];
    try { this.sound.play('zombie_idle', { pos: [z.pos[0], z.pos[1], z.pos[2] + 60], volume: 0.75 }); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- dusk overlay

  _buildOverlay(container) {
    // not a stacking context itself, so the blend layers mix with the game canvas below
    const root = document.createElement('div');
    root.className = 'ts-grade';
    root.hidden = true;
    const layer = (cls) => { const d = document.createElement('div'); d.className = cls; root.appendChild(d); return d; };
    layer('ts-mul');
    layer('ts-glow');
    layer('ts-haze');
    this.motes = document.createElement('canvas');
    this.motes.className = 'ts-motes';
    root.appendChild(this.motes);
    layer('ts-vig');
    const grain = layer('ts-grain');
    grain.style.backgroundImage = `url(${grainTexture()})`;
    this.fade = layer('ts-fade');
    container.appendChild(root);
    this.root = root;
    this.mote = [];
    for (let i = 0; i < MOTES; i++) this.mote.push(this._spawnMote({}, true));
  }

  _fitOverlay() {
    const vp = this.renderer.viewport;
    if (!vp) return;
    const key = `${vp.x},${vp.y},${vp.w},${vp.h}`;
    if (key === this.vpKey) return;
    this.vpKey = key;
    Object.assign(this.root.style, { left: vp.x + 'px', top: vp.y + 'px', width: vp.w + 'px', height: vp.h + 'px' });
    this.motes.width = Math.max(1, Math.round(vp.w / 2));
    this.motes.height = Math.max(1, Math.round(vp.h / 2));
  }

  _spawnMote(m, anywhere) {
    // embers rise from the bottom edge, dust drifts in from the left
    const ember = Math.random() < 0.28;
    m.x = anywhere || ember ? Math.random() : -0.02;
    m.y = anywhere || !ember ? Math.random() : 1.05;
    m.vx = rnd(0.004, 0.02) * (ember ? 0.6 : 1);
    m.vy = ember ? -rnd(0.012, 0.03) : -rnd(-0.004, 0.008);
    m.r = ember ? rnd(0.6, 1.5) : rnd(0.5, 1.2);
    m.a = rnd(0.25, 0.8);
    m.ember = ember;
    m.ph = rnd(0, 6.3);
    return m;
  }

  _motes(dt) {
    const c = this.motes, g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (const m of this.mote) {
      m.x += (m.vx + Math.sin(this.t * 0.6 + m.ph) * 0.003) * dt;
      m.y += m.vy * dt;
      if (m.x > 1.03 || m.y < -0.05 || m.y > 1.1) this._spawnMote(m, false);
      const tw = 0.6 + 0.4 * Math.sin(this.t * (m.ember ? 5 : 1.3) + m.ph);
      g.fillStyle = m.ember ? `rgba(255,${120 + (tw * 60) | 0},40,${(m.a * tw).toFixed(3)})` : `rgba(255,214,170,${(m.a * 0.45 * tw).toFixed(3)})`;
      g.beginPath();
      g.arc(m.x * w, m.y * h, m.r, 0, 6.2832);
      g.fill();
    }
  }
}

/** A small tile of film grain (data URL). */
function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
