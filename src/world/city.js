// Procedural downtown skyline seen from the 24th floor: towers with lit
// windows, rooftop details, blinking antennas, traffic, a river and a bridge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../game.js';
import { facade, cached, canvas, toTexture } from '../core/textures.js';
import { seeded } from '../core/utils.js';

const GROUND = -72; // street level relative to our floor

function boxGeo(w, h, d, x, y, z, uvScale = [20, 48], offset = [0, 0]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const idx = f * 4 + i;
    if (f === 2 || f === 3) { uv.setXY(idx, 0.01, 0.01); continue; } // roof: plain
    uv.setXY(idx, uv.getX(idx) * dims[f][0] / uvScale[0] + offset[0], uv.getY(idx) * dims[f][1] / uvScale[1] + offset[1]);
  }
  g.translate(x, y, z);
  return g;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'city';
    scene.add(this.root);
    this.facadeMats = [];
    this.blinkers = [];
    this._build();
  }

  _build() {
    const rnd = seeded(2403);
    const styles = [
      { base: '#5d6673', glass: '#1d2636', style: 0, cols: 8, rows: 16 },
      { base: '#8a7f73', glass: '#22201f', style: 2, cols: 6, rows: 14 },
      { base: '#3a4350', glass: '#2a3f5c', style: 1, cols: 10, rows: 20 },
      { base: '#a39b8f', glass: '#2b2b30', style: 2, cols: 7, rows: 16 },
      { base: '#2f3640', glass: '#35506e', style: 1, cols: 12, rows: 24 },
      { base: '#6e5b4e', glass: '#1e1a18', style: 0, cols: 6, rows: 12 },
    ];
    const geos = styles.map(() => []);
    const roofGeos = [];
    const placed = [];
    const tryPlace = (x, z, w, d) => {
      for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 + 3 && Math.abs(p.z - z) < (p.d + d) / 2 + 3) return false;
      placed.push({ x, z, w, d });
      return true;
    };
    // our own tower's footprint (avoid)
    placed.push({ x: 0, z: 1, w: 34, d: 30 });
    // river runs diagonally across the north-west
    const inRiver = (x, z) => { const v = x * 0.5 + z * 0.866 + 190; return Math.abs(v) < 38; };
    const block = 26;
    for (let gx = -16; gx <= 16; gx++) {
      for (let gz = -16; gz <= 16; gz++) {
        const cx = gx * block, cz = gz * block;
        const dist = Math.hypot(cx, cz);
        if (dist < 30 || dist > 470) continue;
        for (let k = 0; k < 2; k++) {
          const w = 8 + rnd() * 14, d = 8 + rnd() * 14;
          const x = cx + (rnd() - 0.5) * (block - w - 6), z = cz + (rnd() - 0.5) * (block - d - 6);
          if (inRiver(x, z)) continue;
          if (!tryPlace(x, z, w, d)) continue;
          // heights: a dense downtown cluster to the north, lower elsewhere
          const north = z < 0 ? 1 : 0.55;
          const centerBoost = Math.exp(-((x + 60) ** 2 + (z + 160) ** 2) / 30000) * 2.2;
          let h = 18 + Math.pow(rnd(), 2.2) * 120 * north + centerBoost * 90 * rnd();
          if (dist < 60) h = Math.min(h, 60 + rnd() * 20); // nearby buildings mostly below us
          const si = Math.floor(rnd() * styles.length);
          const st = styles[si];
          const uvS = [st.cols * 2.6, st.rows * 3.1];
          const off = [Math.floor(rnd() * 8) / 8, Math.floor(rnd() * 8) / 8];
          geos[si].push(boxGeo(w, h, d, x, GROUND + h / 2, z, uvS, off));
          // setback tiers on tall towers
          if (h > 90 && rnd() < 0.7) {
            const h2 = 15 + rnd() * 45;
            geos[si].push(boxGeo(w * 0.7, h2, d * 0.7, x, GROUND + h + h2 / 2, z, uvS, off));
            h += h2;
            if (rnd() < 0.5) {
              const sp = 8 + rnd() * 20;
              roofGeos.push(new THREE.CylinderGeometry(0.3, 0.6, sp, 6).translate(x, GROUND + h + sp / 2, z));
              this.blinkers.push(new THREE.Vector3(x, GROUND + h + sp, z));
            }
          }
          // rooftop clutter
          const top = GROUND + h;
          if (rnd() < 0.6) roofGeos.push(new THREE.BoxGeometry(w * 0.3, 2.5, d * 0.25).translate(x + (rnd() - 0.5) * w * 0.4, top + 1.25, z + (rnd() - 0.5) * d * 0.4));
          if (rnd() < 0.25) roofGeos.push(new THREE.CylinderGeometry(1.6, 1.6, 3, 12).translate(x - w * 0.25, top + 3.5, z + d * 0.2), new THREE.ConeGeometry(1.8, 1.2, 12).translate(x - w * 0.25, top + 5.6, z + d * 0.2));
          if (rnd() < 0.3) this.blinkers.push(new THREE.Vector3(x + w * 0.4, top + 0.6, z + d * 0.4));
          roofGeos.push(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6).translate(x, top + 0.4, z)); // parapet
        }
      }
    }
    // landmark spire tower in the downtown cluster
    const lx = -70, lz = -190;
    geos[4].push(boxGeo(26, 210, 26, lx, GROUND + 105, lz, [31, 74]));
    geos[4].push(boxGeo(18, 60, 18, lx, GROUND + 240, lz, [31, 74]));
    roofGeos.push(new THREE.CylinderGeometry(0.4, 2.2, 50, 8).translate(lx, GROUND + 295, lz));
    this.blinkers.push(new THREE.Vector3(lx, GROUND + 320, lz));
    this.landmarkTop = new THREE.Vector3(lx, GROUND + 270, lz);

    styles.forEach((st, i) => {
      if (!geos[i].length) return;
      const tex = facade({ seed: i * 7 + 3, cols: st.cols, rows: st.rows, base: st.base, glass: st.glass, style: st.style });
      const m = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.55, metalness: 0.25 });
      this.facadeMats.push(m);
      const merged = mergeGeometries(geos[i], false);
      const mesh = new THREE.Mesh(merged, m);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.9 });
    const roofs = new THREE.Mesh(mergeGeometries(roofGeos.map((g) => g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g).map((g) => { g.deleteAttribute('uv'); return g; }), false), roofMat);
    this.root.add(roofs);

    // ground & streets
    const groundTex = cached('streets', () => {
      const S = 1024; const c = canvas(S, S); const ctx = c.getContext('2d');
      ctx.fillStyle = '#3d4044'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#2a2c2f';
      const n = 1000 / block; const cell = S / n;
      for (let i = 0; i <= n; i++) { ctx.fillRect(i * cell - 3, 0, 6, S); ctx.fillRect(0, i * cell - 3, S, 6); }
      ctx.fillStyle = '#c9b25a';
      for (let i = 0; i <= n; i++) for (let k = 0; k < S; k += 12) { ctx.fillRect(i * cell - 0.5, k, 1, 5); ctx.fillRect(k, i * cell - 0.5, 5, 1); }
      return toTexture(c, { wrap: false });
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, emissive: '#ffb066', emissiveIntensity: 0, emissiveMap: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; ground.position.x = 13; ground.position.z = 13;
    this.groundMat = ground.material;
    this.root.add(ground);
    // river
    const river = new THREE.Mesh(new THREE.PlaneGeometry(1400, 76), new THREE.MeshStandardMaterial({ color: '#1d3346', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5 }));
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = -Math.atan2(0.5, 0.866) + Math.PI / 2;
    river.position.set(-0.5 * 190, GROUND + 0.3, -0.866 * 190);
    this.riverMat = river.material;
    this.root.add(river);
    // bridge with a string of lights
    const bridgeGeo = new THREE.BoxGeometry(120, 3, 14);
    const bridge = new THREE.Mesh(bridgeGeo, roofMat);
    const bc = new THREE.Vector3(-0.5 * 190 - 60, GROUND + 18, -0.866 * 190 + 35);
    bridge.position.copy(bc);
    bridge.rotation.y = Math.atan2(0.866, 0.5) - Math.PI / 2;
    this.root.add(bridge);
    const lightsGeo = new THREE.BufferGeometry();
    const lp = [];
    for (let i = 0; i < 40; i++) {
      const t = i / 39 - 0.5;
      const v = new THREE.Vector3(t * 120, 4 + Math.sin((t + 0.5) * Math.PI) * 14, 7).applyAxisAngle(new THREE.Vector3(0, 1, 0), bridge.rotation.y).add(bc);
      const v2 = new THREE.Vector3(t * 120, 4 + Math.sin((t + 0.5) * Math.PI) * 14, -7).applyAxisAngle(new THREE.Vector3(0, 1, 0), bridge.rotation.y).add(bc);
      lp.push(v.x, v.y, v.z, v2.x, v2.y, v2.z);
    }
    lightsGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.bridgeLights = new THREE.Points(lightsGeo, new THREE.PointsMaterial({ color: '#ffe2a8', size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0, fog: false }));
    this.root.add(this.bridgeLights);
    // suspension towers
    for (const s of [-0.3, 0.3]) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(3, 40, 3), roofMat);
      tw.position.copy(new THREE.Vector3(s * 120, 10, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), bridge.rotation.y).add(bc));
      this.root.add(tw);
    }
    // antenna blinkers
    const bg = new THREE.BufferGeometry().setFromPoints(this.blinkers);
    this.blinkMat = new THREE.PointsMaterial({ color: '#ff2a2a', size: 2.2, sizeAttenuation: true, transparent: true, fog: false });
    this.root.add(new THREE.Points(bg, this.blinkMat));
    this._traffic(rnd, block);
    this._planes();
  }

  _traffic(rnd, block) {
    // cars as glowing points moving along the street grid
    const N = 420;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this.cars = [];
    const n = Math.floor(900 / block);
    for (let i = 0; i < N; i++) {
      const alongX = rnd() < 0.5;
      const lane = (Math.floor(rnd() * n) - n / 2) * block + 13 - block / 2 + (rnd() < 0.5 ? -1.2 : 1.2);
      const dir = rnd() < 0.5 ? 1 : -1;
      this.cars.push({ alongX, lane, t: (rnd() - 0.5) * 900, dir, speed: 9 + rnd() * 9 });
      const head = (dir > 0) === alongX; // arbitrary split for color variety
      const c = new THREE.Color(head ? '#fff4d6' : '#ff3b30');
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.carPoints = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 1, fog: true }));
    this.carPoints.frustumCulled = false;
    this.root.add(this.carPoints);
  }

  _planes() {
    this.planes = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3), 3));
    this.planeMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: true, transparent: true, fog: false });
    this.planePoints = new THREE.Points(g, this.planeMat);
    this.planePoints.frustumCulled = false;
    this.root.add(this.planePoints);
    for (let i = 0; i < 3; i++) this.planes.push({ t: Math.random() * 200, speed: 25 + Math.random() * 15, y: 140 + Math.random() * 120, z: -250 - Math.random() * 250, dir: Math.random() < 0.5 ? 1 : -1 });
  }

  update(dt, t) {
    const sun = G.sky.info || G.clock.sun();
    const night = 1 - sun.daylight;
    const lit = 0.25 + night * 1.6;
    for (const m of this.facadeMats) m.emissiveIntensity = lit;
    this.groundMat.emissiveIntensity = night * 0.25;
    this.bridgeLights.material.opacity = 0.2 + night * 0.8;
    this.blinkMat.opacity = (Math.sin(t * 3) > 0.2 ? 1 : 0.1) * (0.4 + night * 0.6);
    this.carPoints.material.opacity = 0.35 + night * 0.65;
    this.carPoints.material.size = 0.9 + night * 0.6;
    const pos = this.carPoints.geometry.attributes.position;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      c.t += c.dir * c.speed * dt;
      if (c.t > 450) c.t = -450; if (c.t < -450) c.t = 450;
      if (c.alongX) pos.setXYZ(i, c.t, GROUND + 0.8, c.lane); else pos.setXYZ(i, c.lane, GROUND + 0.8, c.t);
    }
    pos.needsUpdate = true;
    const pp = this.planePoints.geometry.attributes.position;
    this.planes.forEach((p, i) => {
      p.t += dt * p.speed * p.dir;
      if (Math.abs(p.t) > 700) { p.t = -700 * p.dir; p.y = 140 + Math.random() * 120; p.z = -250 - Math.random() * 250; }
      pp.setXYZ(i, p.t, p.y, p.z);
    });
    pp.needsUpdate = true;
    this.planeMat.opacity = Math.sin(t * 5 + 1) > 0.6 ? 1 : 0.3;
  }
}
