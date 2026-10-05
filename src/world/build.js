// Turns dungeon grid data into merged, vertex-AO-shaded meshes (floors, walls, ceilings, trims,
// pilasters, beams, door frames, pit spikes, lava and water surfaces).
import * as THREE from 'three';
import { C, DIRS, TILE, PIT_DEPTH, LAVA_DEPTH } from './constants.js';
import { F } from './dungeon-gen.js';

class Geo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
  }

  vert(x, y, z, nx, ny, nz, u, v, ao) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, v);
    this.c.push(ao, ao, ao);
    return this.p.length / 3 - 1;
  }

  // Grid patch: origin o + ua*us[i] + va*vs[j]. uvf(x,y,z)->[u,v], aof(x,y,z)->ao
  patch(o, ua, va, us, vs, n, uvf, aof) {
    const base = this.p.length / 3;
    const nu = us.length, nv = vs.length;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const x = o[0] + ua[0] * us[i] + va[0] * vs[j];
        const y = o[1] + ua[1] * us[i] + va[1] * vs[j];
        const z = o[2] + ua[2] * us[i] + va[2] * vs[j];
        const [u, v] = uvf(x, y, z);
        this.vert(x, y, z, n[0], n[1], n[2], u, v, aof ? aof(x, y, z) : 1);
      }
    }
    // winding: ensure (ua x va) aligns with n
    const cx = ua[1] * va[2] - ua[2] * va[1];
    const cy = ua[2] * va[0] - ua[0] * va[2];
    const cz = ua[0] * va[1] - ua[1] * va[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
        if (!flip) this.i.push(a, b, c, a, c, d);
        else this.i.push(a, c, b, a, d, c);
      }
    }
  }

  // Axis-aligned box (no bottom face) with world-space UVs.
  box(x0, y0, z0, x1, y1, z1, uvScale = 1 / TILE, aoBottom = 0.6, faces = 'all') {
    const uvx = (x, y, z) => [z * uvScale, y * uvScale];
    const uvz = (x, y, z) => [x * uvScale, y * uvScale];
    const uvy = (x, y, z) => [x * uvScale, z * uvScale];
    const aoy = (x, y) => 1 - (1 - aoBottom) * Math.max(0, 1 - (y - y0) / 0.6);
    const h = y1 - y0;
    if (faces === 'all' || faces.includes('+x')) this.patch([x1, y0, z0], [0, 0, 1], [0, 1, 0], [0, z1 - z0], [0, h], [1, 0, 0], uvx, aoy);
    if (faces === 'all' || faces.includes('-x')) this.patch([x0, y0, z0], [0, 0, 1], [0, 1, 0], [0, z1 - z0], [0, h], [-1, 0, 0], uvx, aoy);
    if (faces === 'all' || faces.includes('+z')) this.patch([x0, y0, z1], [1, 0, 0], [0, 1, 0], [0, x1 - x0], [0, h], [0, 0, 1], uvz, aoy);
    if (faces === 'all' || faces.includes('-z')) this.patch([x0, y0, z0], [1, 0, 0], [0, 1, 0], [0, x1 - x0], [0, h], [0, 0, -1], uvz, aoy);
    if (faces === 'all' || faces.includes('+y')) this.patch([x0, y1, z0], [1, 0, 0], [0, 0, 1], [0, x1 - x0], [0, z1 - z0], [0, 1, 0], uvy, null);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  get empty() { return this.i.length === 0; }
}

const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function buildDungeonMeshes(d, mats, shared) {
  const { W, H, cells, ceil, flags, roomOf } = d;
  const idx = (x, y) => y * W + x;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? C.SOLID : cells[idx(x, y)]);
  const walkable = (x, y) => at(x, y) !== C.SOLID;
  const solidAO = (wx, wz) => {
    const cx = Math.floor(wx / TILE), cy = Math.floor(wz / TILE);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    const i = idx(cx, cy);
    return cells[i] === C.SOLID || (flags[i] & F.SECRET) !== 0;
  };
  const floorY = (t) => (t === C.PIT ? -PIT_DEPTH : t === C.LAVA ? -LAVA_DEPTH - 0.6 : 0);

  const floorGeo = new Geo();
  const wallGeo = new Geo();
  const ceilGeo = new Geo();
  const trimGeo = new Geo();
  const beamGeo = new Geo();
  const pitGeo = new Geo();
  const lavaGeo = new Geo();
  const waterGeo = new Geo();

  const sub = [0, 0.55, TILE - 0.55, TILE];
  const sampleOffs = [];
  for (let k = 0; k < 8; k++) sampleOffs.push([Math.cos((k / 8) * Math.PI * 2) * 0.5, Math.sin((k / 8) * Math.PI * 2) * 0.5]);

  const floorAO = (strength, tone) => (x, y, z) => {
    let s = 0;
    for (const [ox, oz] of sampleOffs) if (solidAO(x + ox, z + oz)) s++;
    return Math.max(0.3, (1 - (s / 8) * strength) * tone);
  };

  const pitSpikePositions = [];
  const lavaCells = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t === C.SOLID) continue;
      const i = idx(x, y);
      const x0 = x * TILE, z0 = y * TILE;
      const fy = floorY(t);
      const cy = ceil[i] || 3.4;
      const tone = 0.86 + hash(x, y) * 0.2;
      const geo = t === C.FLOOR ? floorGeo : pitGeo;
      // floor
      geo.patch([x0, fy, z0], [1, 0, 0], [0, 0, 1], sub, sub, [0, 1, 0], (px, py, pz) => [px / (TILE * 2), pz / (TILE * 2)], floorAO(t === C.FLOOR ? 0.95 : 0.5, t === C.FLOOR ? tone : 0.6));
      // ceiling
      ceilGeo.patch([x0, cy, z0], [1, 0, 0], [0, 0, 1], sub, sub, [0, -1, 0], (px, py, pz) => [px / 4, pz / 4], floorAO(0.7, 0.9 + hash(y, x) * 0.15));
      if (t === C.PIT) for (let k = 0; k < 7; k++) pitSpikePositions.push([x0 + 0.3 + hash(x * 3 + k, y) * (TILE - 0.6), fy, z0 + 0.3 + hash(x, y * 5 + k) * (TILE - 0.6)]);
      if (t === C.LAVA) lavaCells.push([x, y]);
      if (flags[i] & F.WATER) waterGeo.patch([x0, 0.12, z0], [1, 0, 0], [0, 0, 1], [0, TILE], [0, TILE], [0, 1, 0], (px, py, pz) => [px / 6, pz / 6], null);

      // walls on each side
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        const nt = at(nx, ny);
        const ni = nx >= 0 && ny >= 0 && nx < W && ny < H ? idx(nx, ny) : -1;
        // boundary plane & tangent
        let o, ua, n;
        if (dx === 1) { o = [x0 + TILE, 0, z0]; ua = [0, 0, 1]; n = [-1, 0, 0]; }
        else if (dx === -1) { o = [x0, 0, z0]; ua = [0, 0, 1]; n = [1, 0, 0]; }
        else if (dy === 1) { o = [x0, 0, z0 + TILE]; ua = [1, 0, 0]; n = [0, 0, -1]; }
        else { o = [x0, 0, z0]; ua = [1, 0, 0]; n = [0, 0, 1]; }
        const along = (px, pz) => (ua[0] ? px : pz);
        const uvw = (px, py, pz) => [along(px, pz) / TILE * (dx + dy > 0 ? 1 : -1), py / TILE];
        const wallAO = (yb, yt) => (px, py, pz) => {
          const fb = Math.min(1, Math.max(0, (py - yb) / 0.9));
          const ft = Math.min(1, Math.max(0, (yt - py) / 0.8));
          let ao = (0.45 + 0.55 * fb * fb * (3 - 2 * fb)) * (0.7 + 0.3 * ft);
          // inner corners
          const sx = px + n[0] * 0.3, sz = pz + n[2] * 0.3;
          if (solidAO(sx + ua[0] * 0.35, sz + ua[2] * 0.35) || solidAO(sx - ua[0] * 0.35, sz - ua[2] * 0.35)) ao *= 0.72;
          return ao;
        };
        const addWall = (g, yb, yt) => {
          if (yt - yb < 0.01) return;
          const vs = yt - yb > 1.8 ? [0, 0.7, yt - yb - 0.6, yt - yb] : [0, yt - yb];
          g.patch([o[0], yb, o[2]], ua, [0, 1, 0], [0, 0.45, TILE - 0.45, TILE], vs, n, uvw, wallAO(yb, yt));
        };
        if (nt === C.SOLID) {
          addWall(wallGeo, fy, cy);
          // skirting trim in rooms
          if (roomOf[i] >= 0 && t === C.FLOOR) {
            const off = 0.07, th = 0.3;
            const ox = o[0] + n[0] * off, oz = o[2] + n[2] * off;
            trimGeo.patch([ox, fy, oz], ua, [0, 1, 0], [0, TILE], [0, th], n, uvw, (px, py) => (py < fy + 0.05 ? 0.5 : 0.85));
            trimGeo.patch([o[0], fy + th, o[2]], ua, [n[0], 0, n[2]], [0, TILE], [0, off], [0, 1, 0], uvw, null);
          }
        } else {
          const nfy = floorY(nt);
          // step down into pit / lava
          if (nfy > fy + 0.01) addWall(t === C.FLOOR ? wallGeo : pitGeo, fy, nfy);
          // ceiling height change
          const ncy = ceil[ni] || 3.4;
          if (ncy < cy - 0.01) {
            const vs = [0, cy - ncy];
            wallGeo.patch([o[0], ncy, o[2]], ua, [0, 1, 0], [0, TILE], vs, n, uvw, (px, py) => (py > cy - 0.2 ? 0.75 : 0.9));
          }
        }
      }
    }
  }

  // pilasters, inner-corner columns and ceiling beams for rooms
  for (const r of d.rooms) {
    if (r.type === 'secret') continue;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (at(x, y) !== C.FLOOR || roomOf[idx(x, y)] !== r.id) continue;
        const fy = 0, cy = r.ceil;
        // vertical walls (x boundaries)
        for (const [dx, dy] of DIRS) {
          if (at(x + dx, y + dy) !== C.SOLID) continue;
          // pilaster at the start vertex of this wall face if the previous cell along the wall also has a wall
          const tx = dy !== 0 ? 1 : 0, ty = dx !== 0 ? 1 : 0;
          const px = x - tx, py = y - ty;
          const prevHasWall = at(px, py) === C.FLOOR && at(px + dx, py + dy) === C.SOLID && roomOf[idx(px, py)] === r.id;
          const parity = (tx ? x : y) % 3 === 0;
          let vx, vz;
          if (dx === 1) { vx = (x + 1) * TILE; vz = y * TILE; }
          else if (dx === -1) { vx = x * TILE; vz = y * TILE; }
          else if (dy === 1) { vx = x * TILE; vz = (y + 1) * TILE; }
          else { vx = x * TILE; vz = y * TILE; }
          if (prevHasWall && parity) {
            const w = 0.3, dpt = 0.22;
            if (dx !== 0) trimGeo.box(vx - (dx > 0 ? dpt : 0), fy, vz - w, vx + (dx < 0 ? dpt : 0), cy, vz + w, 1 / TILE, 0.55, dx > 0 ? ['-x', '+z', '-z'] : ['+x', '+z', '-z']);
            else trimGeo.box(vx - w, fy, vz - (dy > 0 ? dpt : 0), vx + w, cy, vz + (dy < 0 ? dpt : 0), 1 / TILE, 0.55, dy > 0 ? ['-z', '+x', '-x'] : ['+z', '+x', '-x']);
          }
        }
        // inner corner columns
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (at(x + dx, y) === C.SOLID && at(x, y + dy) === C.SOLID) {
            const cxw = (dx > 0 ? x + 1 : x) * TILE, czw = (dy > 0 ? y + 1 : y) * TILE;
            const s = 0.42;
            trimGeo.box(Math.min(cxw, cxw - dx * s), fy, Math.min(czw, czw - dy * s), Math.max(cxw, cxw - dx * s), cy, Math.max(czw, czw - dy * s), 1 / TILE, 0.55, [dx > 0 ? '-x' : '+x', dy > 0 ? '-z' : '+z']);
          }
        }
      }
    }
    // beams
    if (r.ceil >= 4.6 && r.type !== 'boss') {
      const alongX = r.w <= r.h;
      const count = alongX ? r.h : r.w;
      for (let k = 1; k < count; k += 2) {
        const yb = r.ceil - 0.34, yt = r.ceil;
        if (alongX) {
          const z = (r.y + k) * TILE;
          beamGeo.box(r.x * TILE, yb, z - 0.17, (r.x + r.w) * TILE, yt, z + 0.17, 0.4, 1, ['+z', '-z']);
          beamGeo.patch([r.x * TILE, yb, z - 0.17], [1, 0, 0], [0, 0, 1], [0, r.w * TILE], [0, 0.34], [0, -1, 0], (px, py, pz) => [px * 0.4, pz * 0.4], null);
        } else {
          const x = (r.x + k) * TILE;
          beamGeo.box(x - 0.17, yb, r.y * TILE, x + 0.17, yt, (r.y + r.h) * TILE, 0.4, 1, ['+x', '-x']);
          beamGeo.patch([x - 0.17, yb, r.y * TILE], [1, 0, 0], [0, 0, 1], [0, 0.34], [0, r.h * TILE], [0, -1, 0], (px, py, pz) => [px * 0.4, pz * 0.4], null);
        }
      }
    }
  }

  // door / entrance frames
  for (const e of d.entrances) {
    if (e.valid === false) continue;
    const r = d.rooms[e.roomId];
    // boundary between the corridor cell (e.cx,e.cy) and the room cell
    let bx, bz;
    if (e.side === 'E') { bx = e.cx * TILE; bz = e.cy * TILE; }
    else if (e.side === 'W') { bx = (e.cx + 1) * TILE; bz = e.cy * TILE; }
    else if (e.side === 'S') { bx = e.cx * TILE; bz = e.cy * TILE; }
    else { bx = e.cx * TILE; bz = (e.cy + 1) * TILE; }
    const post = 0.42, depth = 0.32, top = 2.95, lintelTop = Math.min(3.4, r.ceil);
    if (e.side === 'E' || e.side === 'W') {
      trimGeo.box(bx - depth, 0, bz, bx + depth, lintelTop, bz + post, 1 / TILE, 0.55);
      trimGeo.box(bx - depth, 0, bz + TILE - post, bx + depth, lintelTop, bz + TILE, 1 / TILE, 0.55);
      trimGeo.box(bx - depth, top, bz + post, bx + depth, lintelTop + 0.02, bz + TILE - post, 1 / TILE, 1);
      trimGeo.patch([bx - depth, top, bz + post], [1, 0, 0], [0, 0, 1], [0, depth * 2], [0, TILE - post * 2], [0, -1, 0], (px, py, pz) => [px / TILE, pz / TILE], null);
    } else {
      trimGeo.box(bx, 0, bz - depth, bx + post, lintelTop, bz + depth, 1 / TILE, 0.55);
      trimGeo.box(bx + TILE - post, 0, bz - depth, bx + TILE, lintelTop, bz + depth, 1 / TILE, 0.55);
      trimGeo.box(bx + post, top, bz - depth, bx + TILE - post, lintelTop + 0.02, bz + depth, 1 / TILE, 1);
      trimGeo.patch([bx + post, top, bz - depth], [1, 0, 0], [0, 0, 1], [0, TILE - post * 2], [0, depth * 2], [0, -1, 0], (px, py, pz) => [px / TILE, pz / TILE], null);
    }
  }

  // lava surface
  for (const [x, y] of lavaCells) {
    lavaGeo.patch([x * TILE, -LAVA_DEPTH, y * TILE], [1, 0, 0], [0, 0, 1], [0, TILE], [0, TILE], [0, 1, 0], (px, py, pz) => [px / 5, pz / 5], null);
  }

  const group = new THREE.Group();
  const add = (geo, mat, name) => {
    if (geo.empty) return null;
    const m = new THREE.Mesh(geo.build(), mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    return m;
  };
  add(floorGeo, mats.floor, 'floor');
  add(wallGeo, mats.wall, 'walls');
  add(ceilGeo, mats.ceiling, 'ceiling');
  add(trimGeo, mats.trim, 'trim');
  add(beamGeo, shared.darkWood, 'beams');
  add(pitGeo, mats.wall, 'pits');
  const lavaMesh = add(lavaGeo, shared.lava, 'lava');
  const waterMesh = add(waterGeo, shared.water, 'water');
  if (waterMesh) waterMesh.renderOrder = 2;

  if (pitSpikePositions.length) {
    const spikeGeo = new THREE.ConeGeometry(0.09, 1.1, 5);
    spikeGeo.translate(0, 0.55, 0);
    const spikes = new THREE.InstancedMesh(spikeGeo, shared.rust, pitSpikePositions.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    pitSpikePositions.forEach(([x, y, z], k) => {
      e.set((hash(x, z) - 0.5) * 0.4, 0, (hash(z, x) - 0.5) * 0.4);
      q.setFromEuler(e);
      const s = 0.7 + hash(k, x) * 0.6;
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      spikes.setMatrixAt(k, m4);
    });
    spikes.computeBoundingSphere();
    group.add(spikes);
  }

  return { group, lavaMesh, waterMesh, lavaCells };
}
