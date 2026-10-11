// Bullet wounds on player models: small entry holes, torn exit wounds where the bullet
// came out, knife cuts, and blood that soaks into the clothes and runs down from each
// wound over the next couple of seconds.
//
// Wounds are painted into a per-player overlay texture laid out like the skin (the studio
// shader blends it over the skin, src/assets/pm/gslight.js), so they stretch and bend with
// the body, stay on the ragdoll, and cost nothing to draw. The bullet ray is cast against
// the skinned body mesh itself, which gives the exact triangle and UV under the hole; that
// triangle's UV gradient turns world units into texture pixels, so a wound has the same
// size wherever it lands and its blood runs downhill on the body.
//
//   const w = new WoundSystem(game)
//   w.add(victim, point, dir, { head, exit, damage, knife })   GoldSrc point / unit dir
//   w.update(dt)                                               uploads changed layers
import * as THREE from 'three';
import { canvasTexture } from '../assets/pm/gslight.js';

const SIZE = 512;          // overlay resolution = skin resolution
const MAX_PER_BODY = 40;   // later wounds still paint, they just stop growing blood
const rnd = (a, b) => a + (b - a) * Math.random();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3();
const _T = new THREE.Vector3(), _Bt = new THREE.Vector3(), _X = new THREE.Vector3(), _Y = new THREE.Vector3();
const _down = new THREE.Vector3(), _m = new THREE.Matrix4();

export class WoundSystem {
  constructor(game) {
    this.game = game;
    this.rc = new THREE.Raycaster();
    this.queue = [];   // delayed paint passes (blood running, soaking)
    this.dirty = new Set();
    this.time = 0;
  }

  enabled() {
    const v = this.game.settings?.get?.('violence_hblood');
    return v === undefined || v === null || Number(v) !== 0;
  }

  layer(model) {
    if (model.woundLayer) return model.woundLayer;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const tex = canvasTexture(canvas);
    tex.name = 'wounds';
    const L = { canvas, ctx, tex, n: 0 };
    model.woundLayer = L;
    model.setWoundMap(tex);
    model.onReset = () => this.clearModel(model);
    model.onDispose = () => { this.queue = this.queue.filter((q) => q.L !== L); this.dirty.delete(L); tex.dispose(); model.woundLayer = null; };
    return L;
  }

  clearModel(model) {
    const L = model.woundLayer;
    if (!L) return;
    L.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L.ctx.clearRect(0, 0, SIZE, SIZE);
    L.n = 0;
    this.queue = this.queue.filter((q) => q.L !== L);
    this.dirty.add(L);
  }

  clearAll() {
    for (const p of this.game.players) if (p.model) this.clearModel(p.model);
  }

  /** First front face of the body mesh along a GoldSrc ray (skips the GIGN visor). */
  cast(model, from, dir, far) {
    const rc = this.rc;
    rc.ray.origin.set(from[0], from[2], -from[1]);
    rc.ray.direction.set(dir[0], dir[2], -dir[1]).normalize();
    rc.near = 0;
    rc.far = far;
    const hits = rc.intersectObject(model.mesh, false);
    for (const h of hits) if (h.uv && h.face && (h.face.materialIndex | 0) === 0) return h;
    return null;
  }

  /**
   * Texture frame at a hit: an affine map from surface units (x = down the body along
   * the surface, y = across) to overlay pixels, centred on the hit.
   */
  frame(model, h) {
    const mesh = model.mesh, uv = mesh.geometry.attributes.uv;
    const { a, b, c } = h.face;
    mesh.getVertexPosition(a, _A);
    mesh.getVertexPosition(b, _B);
    mesh.getVertexPosition(c, _C);
    _e1.subVectors(_B, _A);
    _e2.subVectors(_C, _A);
    const du1 = uv.getX(b) - uv.getX(a), dv1 = uv.getY(b) - uv.getY(a);
    const du2 = uv.getX(c) - uv.getX(a), dv2 = uv.getY(c) - uv.getY(a);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-9) return null;
    const r = 1 / det;
    _T.copy(_e1).multiplyScalar(dv2).addScaledVector(_e2, -dv1).multiplyScalar(r);   // dP/du
    _Bt.copy(_e2).multiplyScalar(du1).addScaledVector(_e1, -du2).multiplyScalar(r);  // dP/dv
    _n.crossVectors(_e1, _e2).normalize();
    // world down in the mesh's frame, flattened onto the surface
    _m.copy(mesh.matrixWorld).invert();
    _down.set(0, -1, 0).transformDirection(_m);
    _X.copy(_down).addScaledVector(_n, -_down.dot(_n));
    if (_X.lengthSq() < 0.04) _X.copy(_T).addScaledVector(_n, -_T.dot(_n)); // facing up/down: any direction
    _X.normalize();
    _Y.crossVectors(_n, _X);
    // pixel offset (px, py) -> surface offset T*px/S - B*py/S (canvas y runs against v)
    const m11 = _T.dot(_X) / SIZE, m21 = _T.dot(_Y) / SIZE;
    const m12 = -_Bt.dot(_X) / SIZE, m22 = -_Bt.dot(_Y) / SIZE;
    const d2 = m11 * m22 - m12 * m21;
    if (!(Math.abs(d2) > 1e-8)) return null;
    const upp = Math.sqrt(Math.abs(d2)); // surface units per pixel
    if (upp > 2.5) return null; // a sliver of texture (seam): skip
    return {
      a: m22 / d2, b: -m21 / d2, c: -m12 / d2, d: m11 / d2,
      cx: h.uv.x * SIZE, cy: (1 - h.uv.y) * SIZE, upp,
    };
  }

  // ---------------------------------------------------------------- public
  add(victim, point, dir, o = {}) {
    const model = victim?.model;
    if (!model?.mesh || !point || !dir || !this.enabled()) return;
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d = [dir[0] / l, dir[1] / l, dir[2] / l];
    const dmg = clamp(o.damage || 20, 5, 150);
    const entry = this.cast(model, [point[0] - d[0] * 32, point[1] - d[1] * 32, point[2] - d[2] * 32], d, 72);
    if (!entry) return;
    const L = this.layer(model);
    const busy = L.n++ >= MAX_PER_BODY;
    const F = this.frame(model, entry);
    if (F) this.paintWound(L, F, o.knife ? 'cut' : 'entry', { dmg, head: !!o.head, busy, dir: this.surfaceDir(F, d, model) });
    if (!o.exit || o.knife) return;
    // the far side: cast back along the shot from beyond the body
    const ep = entry.point; // three world
    const ent = [ep.x, -ep.z, ep.y];
    const far = [ent[0] + d[0] * 40, ent[1] + d[1] * 40, ent[2] + d[2] * 40];
    const ex = this.cast(model, far, [-d[0], -d[1], -d[2]], 39.5);
    if (!ex || ex.distance < 1) return;
    const F2 = this.frame(model, ex);
    if (F2) this.paintWound(L, F2, 'exit', { dmg, head: !!o.head, busy, dir: this.surfaceDir(F2, d, model) });
  }

  /** The shot direction flattened onto the surface, in the frame's (x down, y across) units. */
  surfaceDir(F, d, model) {
    // d in mesh space, dotted with the frame axes (_X/_Y are still the last frame's)
    _m.copy(model.mesh.matrixWorld).invert();
    _down.set(d[0], d[2], -d[1]).transformDirection(_m);
    const x = _down.dot(_X), y = _down.dot(_Y), l = Math.hypot(x, y);
    return l > 0.15 ? [x / l, y / l] : null;
  }

  // ---------------------------------------------------------------- painting
  /** Run fn with the context mapped to surface units around the wound. */
  draw(L, F, fn) {
    const ctx = L.ctx;
    ctx.save();
    ctx.setTransform(F.a, F.b, F.c, F.d, F.cx, F.cy);
    fn(ctx, F.upp);
    ctx.restore();
    this.dirty.add(L);
  }

  paintWound(L, F, kind, o) {
    const { dmg, head, busy } = o;
    const big = clamp(dmg / 40, 0.6, 1.6);
    if (kind === 'entry') {
      const r = clamp(0.75 + dmg * 0.006, 0.75, 1.25);
      this.draw(L, F, (ctx, upp) => {
        soak(ctx, (head ? 3.4 : 2.6) * big, 'rgba(78,4,3,0.5)');
        blob(ctx, 0, 0, Math.max(r * 1.25, upp * 1.4), 0.28, '#5a0806');
        blob(ctx, 0, 0, Math.max(r * 0.62, upp * 0.8), 0.18, '#120101');
      });
    } else if (kind === 'exit') {
      const r = clamp(1.6 + dmg * 0.022, 1.8, 3.4) * (head ? 1.2 : 1);
      this.draw(L, F, (ctx, upp) => {
        soak(ctx, r * 2.1, 'rgba(84,4,3,0.62)');
        // flecks blown out along the shot
        const sd = o.dir || [0, 1];
        for (let i = 0; i < 10; i++) {
          const t = rnd(r * 1.0, r * 2.6), s = rnd(-0.9, 0.9);
          const x = sd[0] * t - sd[1] * s * t * 0.6, y = sd[1] * t + sd[0] * s * t * 0.6;
          blob(ctx, x, y, Math.max(rnd(0.18, 0.45), upp * 0.6), 0.3, '#6e0907');
        }
        blob(ctx, 0, 0, Math.max(r, upp * 2), 0.45, '#640906');
        blob(ctx, 0, 0, Math.max(r * 0.66, upp * 1.4), 0.4, '#9a1610');
        blob(ctx, 0, 0, Math.max(r * 0.32, upp * 0.8), 0.3, '#1c0202');
      });
    } else { // knife cut across the surface
      const len = rnd(5, 8), ang = rnd(-0.6, 0.6) + Math.PI / 2;
      this.draw(L, F, (ctx, upp) => {
        const cx = Math.cos(ang) * len / 2, cy = Math.sin(ang) * len / 2;
        soak(ctx, len * 0.6, 'rgba(78,4,3,0.4)');
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#5c0806';
        ctx.lineWidth = Math.max(0.9, upp * 1.5);
        ctx.beginPath(); ctx.moveTo(-cx, -cy); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.strokeStyle = '#160101';
        ctx.lineWidth = Math.max(0.35, upp * 0.8);
        ctx.beginPath(); ctx.moveTo(-cx * 0.85, -cy * 0.85); ctx.lineTo(cx * 0.85, cy * 0.85); ctx.stroke();
      });
    }
    if (busy) return;
    // blood running down from the wound, in two stages, then a wider soak
    const n = kind === 'exit' ? 2 + (Math.random() < 0.5 ? 1 : 0) : kind === 'cut' ? 2 : 1 + (Math.random() < 0.35 + dmg / 150 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const pts = runPath(rnd(4, 9) * big * (kind === 'exit' ? 1.5 : 1), (i - (n - 1) / 2) * (kind === 'exit' ? 1.1 : 0.8));
      const w = rnd(0.55, 0.85) * (kind === 'exit' ? 1.25 : 1);
      const k1 = Math.ceil(pts.length * 0.35);
      this.draw(L, F, (ctx, upp) => run(ctx, pts, 0, k1, Math.max(w, upp * 1.1)));
      this.queue.push({ L, F, t: this.time + rnd(0.5, 0.9), fn: (ctx, upp) => run(ctx, pts, k1 - 1, pts.length, Math.max(w, upp * 1.1), true) });
    }
    this.queue.push({ L, F, t: this.time + rnd(1.8, 2.6), fn: (ctx) => soak(ctx, (kind === 'exit' ? 5.5 : 3.8) * big, 'rgba(70,3,2,0.28)') });
  }

  update(dt) {
    this.time += dt;
    if (this.queue.length) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        if (this.time < q.t) continue;
        this.queue.splice(i, 1);
        this.draw(q.L, q.F, q.fn);
      }
    }
    if (this.dirty.size) {
      for (const L of this.dirty) L.tex.needsUpdate = true;
      this.dirty.clear();
    }
  }
}

// ---------------------------------------------------------------- shapes (surface units)
/** Soft round stain. */
function soak(ctx, r, col) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, col);
  g.addColorStop(0.55, col.replace(/[\d.]+\)$/, (a) => (parseFloat(a) * 0.6).toFixed(3) + ')'));
  g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Irregular filled disc. */
function blob(ctx, x, y, r, jag, col) {
  const n = 11;
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * Math.PI * 2;
    const rr = r * (1 + (Math.random() - 0.5) * 2 * jag);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** A wobbly line running down (+x) from near the wound, offset sideways by `side`. */
function runPath(len, side) {
  const pts = [];
  const steps = Math.max(4, Math.round(len / 0.8));
  let y = side * 0.5 + rnd(-0.3, 0.3);
  for (let i = 0; i <= steps; i++) {
    const x = 0.6 + (len * i) / steps;
    y += rnd(-0.22, 0.22);
    pts.push([x, y]);
  }
  return pts;
}

/** Draw a run segment pts[i0..i1), tapering towards the end; ends in a drop. */
function run(ctx, pts, i0, i1, w, end = false) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(92,6,5,0.93)';
  const N = pts.length - 1;
  for (let i = Math.max(1, i0 + 1); i < i1; i++) {
    ctx.lineWidth = w * (1 - 0.45 * (i / N));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  if (end) {
    const p = pts[pts.length - 1];
    ctx.fillStyle = 'rgba(80,4,3,0.95)';
    ctx.beginPath();
    ctx.ellipse(p[0] + w * 0.3, p[1], w * 0.85, w * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
