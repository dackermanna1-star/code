import * as THREE from 'three';

/**
 * Walking overlay, render only (casts no shadows, never picked: picking goes through the physics):
 * a soft ring on the support surface under the selected dummy, a goal marker (ring and pin, a
 * small flag on the final goal) at every remaining goal of everyone who is on the way somewhere,
 * and a thin dashed line along the selected walker's route that follows the floor and the
 * obstacle tops. Markers fade in and out; nothing is drawn when nobody walks.
 */

const GOAL_COLOR = 0xffb347;
const PATH_COLOR = 0xffa63d;
const LIFT = 0.006; // rings above the surface they lie on
const LINE_LIFT = 0.015;
const MAX_LINE = 2048;

const _ends = new WeakMap(); // route (path array) -> waypoint index at which each goal is reached

/**
 * Index of the route waypoint at which each goal of a walk is reached (the goals are planned one
 * after the other, each leg ending on its goal or on the nearest walkable spot to it).
 */
function goalEnds(nav) {
  let ends = _ends.get(nav.path);
  if (ends) return ends;
  ends = [];
  let k0 = 0;
  for (const g of nav.goals) {
    let best = nav.path.length - 1, bd = Infinity;
    for (let k = k0; k < nav.path.length; k++) {
      const d = Math.hypot(nav.path[k].x - g.x, nav.path[k].z - g.z);
      if (d < bd - 1e-6) {
        bd = d;
        best = k;
      }
      if (d < 0.05) break;
    }
    ends.push(best);
    k0 = Math.min(best + 1, nav.path.length - 1);
  }
  _ends.set(nav.path, ends);
  return ends;
}

/** Indices (into nav.goals) of the goals a walker has not passed yet; none once the walk is over. */
export function goalsAhead(nav) {
  if (!nav || nav.done || !nav.path || !nav.path.length || !nav.goals) return [];
  const ends = goalEnds(nav), i = nav.i || 0, out = [];
  for (let g = 0; g < ends.length; g++) if (g >= (nav.goalIndex || 0) && ends[g] >= i) out.push(g);
  return out;
}

/** Soft ring alpha (white): a bright band near the rim with a faint fill inside. */
function ringTexture(band, width, fill) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const r = Math.hypot(i + 0.5 - S / 2, j + 0.5 - S / 2) / (S / 2);
      const ring = Math.exp(-Math.pow((r - band) / width, 2));
      const inner = r < band ? fill * (r / band) : 0;
      const a = r < 1 ? Math.min(1, ring + inner) : 0;
      const o = (j * S + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function overlayMaterial(color, map = null, onSurface = true) {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    // rings lie on the floor or on an obstacle top: drawn over it without z-fighting
    polygonOffset: onSurface,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}

/** Approach `target` at `rate` per second. */
function fade(a, target, rate, dt) {
  return a < target ? Math.min(target, a + rate * dt) : Math.max(target, a - rate * dt);
}

export class WalkMarkers {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'walk-markers';
    scene.add(this.group);
    this.time = 0;
    this.selTex = ringTexture(0.82, 0.1, 0.1);
    this.goalTex = ringTexture(0.72, 0.12, 0.18);
    this.ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.poleGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.34, 6).translate(0, 0.17, 0);
    this.headGeo = new THREE.SphereGeometry(0.018, 12, 8).translate(0, 0.34, 0);
    // pennant: a small triangle off the top of the pole
    this.flagGeo = new THREE.BufferGeometry();
    this.flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.34, 0, 0, 0.25, 0, 0.12, 0.295, 0], 3));
    this.flagGeo.computeVertexNormals();
    // selection ring
    this.sel = { mesh: new THREE.Mesh(this.ringGeo, overlayMaterial(0xffffff, this.selTex)), a: 0, x: 0, y: 0, z: 0, person: null };
    this.sel.mesh.scale.setScalar(0.7);
    this.sel.mesh.renderOrder = 3;
    this.sel.mesh.visible = false;
    this.group.add(this.sel.mesh);
    // goal markers: per person, matched to goals by position so that re-plans do not flicker them
    this.walkers = new Map();
    this.pool = [];
    this._goals = [];
    // dashed route line (positions written in place; dashes anchored at the goal end)
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINE * 3), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(MAX_LINE), 1).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: PATH_COLOR, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;
    this.line.visible = false;
    this.lineA = 0;
    this.linePerson = null;
    this.group.add(this.line);
    this._pts = [];
  }

  setVisible(v) {
    this.group.visible = v;
  }

  // ------------------------------------------------------------------------------------------
  makeGoal() {
    const g = this.pool.pop();
    if (g) {
      g.a = 0;
      return g;
    }
    const obj = new THREE.Group();
    const ring = new THREE.Mesh(this.ringGeo, overlayMaterial(GOAL_COLOR, this.goalTex));
    ring.position.y = LIFT;
    ring.renderOrder = 3;
    const pinMat = overlayMaterial(GOAL_COLOR, null, false);
    const flagMat = overlayMaterial(GOAL_COLOR, null, false);
    flagMat.side = THREE.DoubleSide;
    const flag = new THREE.Mesh(this.flagGeo, flagMat);
    obj.add(ring, new THREE.Mesh(this.poleGeo, pinMat), new THREE.Mesh(this.headGeo, pinMat), flag);
    this.group.add(obj);
    return { obj, ring, flag, mats: [ring.material, pinMat, flagMat], a: 0, x: 0, y: 0, z: 0, last: false, alive: true };
  }

  releaseGoal(g) {
    g.obj.visible = false;
    this.pool.push(g);
  }

  /** Remaining goals of a walk as surface points (the planner's actual end of each leg). */
  remainingGoals(nav, world, out) {
    out.length = 0;
    const ahead = goalsAhead(nav);
    if (!ahead.length) return out;
    const ends = goalEnds(nav);
    for (const g of ahead) {
      const p = nav.path[ends[g]];
      out.push({ x: p.x, z: p.z, y: world.surfaceAt(p.x, p.z, p.y + 0.3) });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Per frame. people: everyone; selected: the selected person (or null); showSelection: draw
   * the selection ring even when the selected person is not walking (walk tool active).
   */
  update(dt, people, selected, world, showSelection = false) {
    this.time += dt;
    const pulse = 1 + 0.05 * Math.sin(this.time * 4.2);

    // selection ring under the selected dummy, on whatever it stands on
    const sel = this.sel;
    const selWalking = !!(selected && selected.ctl.nav && !selected.ctl.nav.done);
    const showSel = !!selected && (showSelection || selWalking);
    if (selected !== sel.person) {
      sel.person = selected;
      sel.a = 0;
    }
    if (selected) {
      const pel = selected.rd.pelvis.pos;
      const y = world.surfaceAt(pel.x, pel.z, pel.y);
      sel.y = sel.a > 0 ? sel.y + (y - sel.y) * (1 - Math.exp(-dt * 12)) : y;
      sel.x = pel.x;
      sel.z = pel.z;
    }
    sel.a = fade(sel.a, showSel ? 1 : 0, showSel ? 4 : 2.5, dt);
    sel.mesh.visible = sel.a > 0.002;
    if (sel.mesh.visible) {
      sel.mesh.position.set(sel.x, sel.y + LIFT, sel.z);
      sel.mesh.material.opacity = 0.55 * sel.a;
    }

    // goal markers of everyone on the way somewhere (and of walks that just ended, fading out)
    const goals = this._goals;
    for (const p of people) if (!this.walkers.has(p) && p.ctl.nav && !p.ctl.nav.done) this.walkers.set(p, { markers: [] });
    for (const [p, w] of this.walkers) {
      const present = people.includes(p);
      this.remainingGoals(present ? p.ctl.nav : null, world, goals);
      for (const m of w.markers) m.alive = false;
      goals.forEach((g, k) => {
        let m = w.markers.find((q) => !q.alive && Math.hypot(q.x - g.x, q.z - g.z) < 0.03);
        if (!m) {
          m = this.makeGoal();
          w.markers.push(m);
        }
        m.y = m.a > 0 ? m.y + (g.y - m.y) * Math.min(1, dt * 10) : g.y;
        m.x = g.x;
        m.z = g.z;
        m.alive = true;
        m.last = k === goals.length - 1;
      });
      for (const m of w.markers) {
        m.a = fade(m.a, m.alive ? 1 : 0, m.alive ? 4 : 1.6, dt);
        m.obj.visible = m.a > 0.002;
        if (!m.obj.visible) continue;
        m.obj.position.set(m.x, m.y, m.z);
        // a reached (or dropped) goal widens as it fades
        m.ring.scale.setScalar((m.last ? 0.46 : 0.34) * (m.alive ? pulse : 1 + 0.3 * (1 - m.a)));
        m.flag.visible = m.last;
        m.mats[0].opacity = 0.85 * m.a;
        m.mats[1].opacity = 0.9 * m.a;
        m.mats[2].opacity = 0.9 * m.a;
      }
      w.markers = w.markers.filter((m) => {
        if (m.alive || m.a > 0.002) return true;
        this.releaseGoal(m);
        return false;
      });
      if (!w.markers.length && (!present || !p.ctl.nav || p.ctl.nav.done)) this.walkers.delete(p);
    }

    // route line of the selected walker (keeps its last shape while it fades out)
    if (selWalking) {
      this.buildLine(selected, world);
      this.linePerson = selected;
    } else if (this.linePerson !== selected) this.lineA = 0;
    this.lineA = fade(this.lineA, selWalking ? 1 : 0, selWalking ? 3 : 1.6, dt);
    this.line.visible = this.lineA > 0.002;
    this.line.material.opacity = 0.9 * this.lineA;
  }

  /** Polyline from the walker over the rest of the route, draped over the floor and obstacles. */
  buildLine(person, world) {
    const nav = person.ctl.nav;
    const pts = this._pts;
    pts.length = 0;
    const surf = (x, z) => world.surfaceAt(x, z, 3);
    const push = (x, y, z) => {
      if (pts.length < MAX_LINE * 3) pts.push(x, y + LINE_LIFT, z);
    };
    const pel = person.rd.pelvis.pos;
    let ax = pel.x, az = pel.z, ah = surf(ax, az);
    push(ax, ah, az);
    for (let k = nav.i || 0; k < nav.path.length; k++) {
      const bx = nav.path[k].x, bz = nav.path[k].z;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
      let px = ax, pz = az, ph = ah;
      for (let s = 1; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n, h = surf(x, z);
        if (Math.abs(h - ph) > 0.02) {
          // a step edge between the samples: find it and go straight up or down on its low side
          let lo = 0, hi = 1;
          for (let it = 0; it < 6; it++) {
            const m = (lo + hi) / 2, hm = surf(px + (x - px) * m, pz + (z - pz) * m);
            if (Math.abs(hm - ph) < Math.abs(hm - h)) lo = m;
            else hi = m;
          }
          const e = h > ph ? lo : hi;
          const ex = px + (x - px) * e, ez = pz + (z - pz) * e;
          push(ex, ph, ez);
          push(ex, h, ez);
        }
        push(x, h, z);
        px = x;
        pz = z;
        ph = h;
      }
      ax = bx;
      az = bz;
      ah = ph;
    }
    // write positions; dash distances measured from the goal end so the dashes stay put
    const g = this.line.geometry;
    const pos = g.attributes.position.array, dist = g.attributes.lineDistance.array;
    const cnt = pts.length / 3;
    const seg = (i) => Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    let total = 0;
    for (let i = 1; i < cnt; i++) total += seg(i);
    let run = 0;
    for (let i = 0; i < cnt; i++) {
      if (i > 0) run += seg(i);
      pos[i * 3] = pts[i * 3];
      pos[i * 3 + 1] = pts[i * 3 + 1];
      pos[i * 3 + 2] = pts[i * 3 + 2];
      dist[i] = total - run;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.lineDistance.needsUpdate = true;
    g.setDrawRange(0, cnt);
  }
}
