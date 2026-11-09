// Level 1 dressing: pallet racking and its stock, loose stock and machines, steel columns, roller
// doors, the roof structure and the sodium high-bay lamps with their glow and light shafts. All of
// it is generated here from boxes and cylinders, coloured per vertex and merged by material into
// one mesh per 4 x 4-cell chunk, so the two shadow-casting spot lights only draw nearby chunks.
// The colliders are the level's (10-level.js): what is drawn here stays inside them.

const WH = {
  upright: 0x23508f, beam: 0xe2601b, foot: 0x4a4744,
  pallet: 0xb48c5c, palletDark: 0x8a6942,
  card: [0xa87d4e, 0xb68b57, 0x9c7147, 0xc39b66, 0x8f6943],
  print: [0xd9d2c3, 0x9e2c1f, 0x2c517c, 0x3f6b3c, 0xd8a531],
  wrapTint: [0xb08756, 0xc49c68, 0xd8d3c9, 0x9b7a52, 0xa98250, 0xbf9a6a, 0x7c2a22, 0x2f4f6e, 0xd0c8b4, 0x3a3634],
  tote: [0x2c5aa0, 0xb02a20, 0x5e6266, 0x2f7a3a, 0xd09a20],
  drum: [0x1f4f9a, 0xa02218, 0x222222, 0xc89a28, 0x3d6b3a],
  sack: [0xe6dcc8, 0xd8c8a6, 0xc8b48c],
  crate: 0x9a7448, crateDark: 0x6f5233,
  forklift: [0xd9a016, 0xd2601a, 0xc9a227], black: 0x161514, darkMetal: 0x2f2e2c,
  column: 0xc8941c, girder: 0x6b3325, joist: 0x65605a, pipe: 0x9a1e14, galv: 0x8c867a,
  lampBody: 0x3a3836, reflector: 0xb0aca2, jack: 0xb3301e, cone: 0xe0560f, white: 0xe8e4da,
};

const WH_V1 = new T3.Vector3(), WH_UP = new T3.Vector3(0, 1, 0), WH_Q = new T3.Quaternion(), WH_M = new T3.Matrix4(), WH_ONE = new T3.Vector3(1, 1, 1);
function whBox(w, h, d, x, y, z) { return new T3.BoxGeometry(w, h, d).translate(x, y, z); }
function whCyl(rt, rb, h, seg, x, y, z, open = false) { return new T3.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z); }
// a square bar from a to b
function whStrut(ax, ay, az, bx, by, bz, t) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  WH_Q.setFromUnitVectors(WH_UP, WH_V1.set(dx / len, dy / len, dz / len));
  return new T3.BoxGeometry(t, len, t).applyMatrix4(WH_M.compose(new T3.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), WH_Q, WH_ONE));
}

class WarehouseDressing {
  constructor(view) {
    this.view = view;
    const L = (this.level = view.level);
    this.rng = Lab.rng(((L.seed * 2654435761) ^ 0x5eed) >>> 0);
    this.bins = new Map();
    this.colors = new Map();
    this.chunk = L.cell * 4;
    this.nChunk = Math.ceil(L.size / this.chunk);
    this.textures = [];
    this.makeMaterials();
    this.buildRacks();
    this.buildProps();
    this.buildColumns();
    this.buildDoors();
    this.buildRoof();
    this.buildLamps();
    this.buildSigns();
    this.buildLitter();
    this.flush();
  }

  // flattened cartons, loose boards and scraps of wrap on the floor (flat: no colliders needed)
  buildLitter() {
    const L = this.level, R = this.rng;
    for (let c = 0; c < L.n * L.n; c++) {
      if (R() > 0.3) continue;
      const ctr = L.cellCenter(c);
      for (let k = 0; k < 1 + Math.floor(R() * 2); k++) {
        const x = ctr.x + (R() - 0.5) * L.cell * 0.85, z = ctr.z + (R() - 0.5) * L.cell * 0.85;
        if (!L.free(x, z, 0.5)) continue;
        const a = R() * TAU, r = R();
        if (r < 0.6) this.add('carton', whBox(0.5 + R() * 0.4, 0.01, 0.4 + R() * 0.35, 0, 0.005, 0).rotateY(a).translate(x, 0, z), this.pick(WH.card));
        else if (r < 0.8) this.add('matte', whBox(1.2, 0.02, 0.1, 0, 0.01, 0).rotateY(a).translate(x, 0, z), WH.pallet);
        else this.add('wrap', whBox(0.35, 0.05, 0.25, 0, 0.02, 0).rotateZ(0.2).rotateY(a).translate(x, 0, z), 0xd8d6cc);
      }
    }
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  // ---- materials ---------------------------------------------------------------------------
  makeMaterials() {
    const sh = this.view.shared, th = this.level.theme;
    const std = (key, o, extra = {}) => patchLattice(new T3.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...o }), sh, { key: 'wh-' + key, ...extra });
    this.mats = {
      paint: std('paint', { roughness: 0.5, metalness: 0.3 }),
      matte: std('matte', { roughness: 0.92 }),
      // stretch wrap: a glossy, slightly milky skin over layers of cartons
      wrap: std('wrap', { roughness: 0.28 }, {
        color: /* glsl */ `{
          vec3 N = normalize(vLatN);
          vec2 f = abs(N.y) > 0.5 ? vLatP.xz : abs(N.x) > 0.5 ? vLatP.zy : vLatP.xy;
          vec2 s = f / vec2(0.41, 0.32);
          vec2 g = abs(fract(s + 0.5) - 0.5), fw = fwidth(s);
          float seam = smoothstep(0.455, 0.49, max(g.x, g.y)) * (1.0 - smoothstep(0.08, 0.3, max(fw.x, fw.y)));
          diffuseColor.rgb *= 1.0 - 0.3 * seam;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.8), 0.14) * (0.95 + 0.05 * sin(vLatP.y * 9.0 + vLatP.x * 2.0 + vLatP.z * 1.3));
        }`,
      }),
      // stacked cartons (and totes, sacks): one box per block, seams and per-carton tone drawn
      carton: std('carton', { roughness: 0.9 }, {
        color: /* glsl */ `{
          vec3 N = normalize(vLatN);
          vec2 f = abs(N.y) > 0.5 ? vLatP.xz : abs(N.x) > 0.5 ? vLatP.zy : vLatP.xy;
          vec2 s = f / vec2(0.41, 0.32) + 0.5;
          vec2 g = abs(fract(s) - 0.5), fw = fwidth(s);
          float seam = smoothstep(0.44, 0.485, max(g.x, g.y)) * (1.0 - smoothstep(0.08, 0.3, max(fw.x, fw.y)));
          float tone = fract(sin(dot(floor(s) + floor(vLatP.y * 0.1), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= (0.88 + 0.18 * tone) * (1.0 - 0.38 * seam);
          // packing tape across the tops and down the middle of the faces
          float tape = abs(N.y) > 0.5 ? smoothstep(0.03, 0.02, abs(fract(s.x) - 0.5)) : smoothstep(0.025, 0.015, abs(fract(s.x) - 0.5)) * step(0.36, g.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + 0.03, tape * 0.6);
        }`,
      }),
      steel: std('steel', { roughness: 0.6, metalness: 0.45 }),
      // yellow and black safety stripes (the vertex colour is the yellow)
      hazard: std('hazard', { roughness: 0.55, metalness: 0.2 }, {
        color: 'diffuseColor.rgb *= mix(1.0, 0.06, step(0.5, fract((vLatP.x + vLatP.y + vLatP.z) * 2.6)));',
      }),
      // roller shutter slats
      shutter: std('shutter', { roughness: 0.5, metalness: 0.4 }, {
        color: 'diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.35, abs(fract(vLatP.y / 0.1) - 0.5) * 2.0);',
      }),
      lamp: std('lamp', { roughness: 0.32, metalness: 0.75, side: T3.DoubleSide }),
      // lit panels (vending machines): unlit, a little over white so they bloom
      glow: new T3.MeshBasicMaterial({ vertexColors: true, color: new T3.Color(1.9, 1.9, 1.9) }),
    };
    this.cast = { paint: true, matte: true, wrap: true, carton: true, steel: false, hazard: true, shutter: false, lamp: false, sign: false, glow: false };
    // lamp lenses glow with their fixture's level (flicker, outages, blackouts)
    const lc = new T3.Color(...th.lightCol);
    const lens = new T3.MeshBasicMaterial({ color: lc.clone().multiplyScalar(2.3) });
    lens.onBeforeCompile = (s) => {
      s.uniforms.uFix = sh.uFix;
      s.uniforms.uGrid = sh.uGrid;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFix; uniform sampler2D uFix; uniform vec4 uGrid; varying float vLvl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ int nn = int(uGrid.z); int k = int(aFix + 0.5); vLvl = texelFetch(uFix, ivec2(k % nn, k / nn), 0).r; }');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLvl;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.05, 0.045, 0.04), diffuseColor.rgb, vLvl);');
    };
    lens.customProgramCacheKey = () => 'wh-lens';
    this.mats.lens = lens;
    // glow around each lamp and a faint shaft of light under it, in the haze
    const glowVS = /* glsl */ `
      attribute float aFix;
      uniform sampler2D uFix; uniform vec4 uGrid; uniform float uFogD;
      varying float vA; varying vec2 vC; varying vec3 vN; varying vec3 vP; varying float vT;
      float fixLevel() { int nn = int(uGrid.z); int k = int(aFix + 0.5); return texelFetch(uFix, ivec2(k % nn, k / nn), 0).r; }`;
    const fogOf = 'exp(-uFogD * uFogD * dist * dist)';
    this.mats.halo = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uFogD: { value: th.fogDensity }, uCol: { value: lc.clone().multiplyScalar(0.55) } },
      vertexShader: glowVS + /* glsl */ `
        attribute vec3 aCenter; attribute float aSize;
        void main() {
          vec4 mv = viewMatrix * vec4(aCenter, 1.0);
          float dist = -mv.z;
          mv.xy += position.xy * aSize;
          vC = position.xy * 2.0;
          vA = fixLevel() * smoothstep(0.8, 3.5, dist) * ${fogOf};
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying vec2 vC;
        void main() {
          float r2 = dot(vC, vC);
          if (r2 > 1.0) discard;
          float a = exp(-r2 * 9.0) * 0.8 + exp(-r2 * 3.0) * 0.25 * (1.0 - r2);
          gl_FragColor = vec4(uCol * a * vA, 1.0);
        }`,
      blending: T3.AdditiveBlending, transparent: true, depthWrite: false,
    });
    this.mats.shaft = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uFogD: { value: th.fogDensity }, uCol: { value: lc.clone().multiplyScalar(0.15) } },
      vertexShader: glowVS + /* glsl */ `
        attribute float aT;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vP = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          vT = aT;
          vec4 mv = viewMatrix * wp;
          float dist = -mv.z;
          vA = fixLevel() * smoothstep(0.5, 4.0, dist) * ${fogOf};
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vP; varying float vT;
        void main() {
          vec3 V = normalize(cameraPosition - vP);
          // a cone of haze reads thickest through its middle and fades towards the floor
          float thick = pow(abs(dot(normalize(vN), V)), 1.6);
          float a = thick * (1.0 - vT) * (1.0 - vT) * smoothstep(0.0, 0.06, vT) * vA;
          gl_FragColor = vec4(uCol * a, 1.0);
        }`,
      blending: T3.AdditiveBlending, transparent: true, depthWrite: false, side: T3.DoubleSide,
    });
  }

  // ---- geometry bins -------------------------------------------------------------------------
  rgb(hex) {
    let c = this.colors.get(hex);
    if (!c) { const k = new T3.Color(hex); c = [k.r, k.g, k.b]; this.colors.set(hex, c); }
    return c;
  }

  // a world-space part: coloured, binned by material and chunk
  add(key, geo, hex = 0xffffff) {
    const n = geo.attributes.position.count, [r, g, b] = this.rgb(hex), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
    geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    if (key !== 'sign') geo.deleteAttribute('uv');
    const p = geo.attributes.position.array, L = this.level;
    // the chunk of the part's first and last vertex midpoint (parts are small, or long and straight)
    const mx = (p[0] + p[p.length - 3]) / 2, mz = (p[2] + p[p.length - 1]) / 2;
    const ci = clamp(Math.floor((mx + L.half) / this.chunk), 0, this.nChunk - 1), cj = clamp(Math.floor((mz + L.half) / this.chunk), 0, this.nChunk - 1);
    const k = key + ':' + (cj * this.nChunk + ci);
    if (!this.bins.has(k)) this.bins.set(k, []);
    this.bins.get(k).push(geo);
  }

  flush() {
    for (const [k, list] of this.bins) {
      const key = k.split(':')[0];
      const geo = ThreeUtils.mergeGeometries(list);
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const mesh = new T3.Mesh(geo, this.mats[key]);
      mesh.castShadow = !!this.cast[key];
      mesh.receiveShadow = key !== 'lamp';
      this.view.scene.add(mesh);
    }
    this.bins.clear();
  }

  // a part placer for a frame turned by yaw about (x0, z0): (lx, lz) local, +z forward
  placer(x0, z0, yaw) {
    const m = new T3.Matrix4().makeRotationY(yaw).setPosition(x0, 0, z0);
    return (key, geo, hex) => this.add(key, geo.applyMatrix4(m), hex);
  }

  // ---- pallet racking ------------------------------------------------------------------------
  buildRacks() {
    const L = this.level, R = this.rng;
    const beams = [1.5, 2.95, 4.4], bh = 0.11, upH = 4.95;
    for (const rk of L.racks) {
      const { alongX, a0, a1, c, depth: D } = rk;
      // rack space: u along the run, v across it, y up
      const B = (key, hex, du, dy, dv, u, y, v) => this.add(key, alongX ? whBox(du, dy, dv, u, y, c + v) : whBox(dv, dy, du, c + v, y, u), hex);
      const S = (key, hex, u0, y0, v0, u1, y1, v1, t) => this.add(key, alongX ? whStrut(u0, y0, c + v0, u1, y1, c + v1, t) : whStrut(c + v0, y0, u0, c + v1, y1, u1, t), hex);
      const Cy = (key, hex, r, h, u, y, v, seg = 12) => this.add(key, alongX ? whCyl(r, r, h, seg, u, y, c + v) : whCyl(r, r, h, seg, c + v, y, u), hex);
      const len = a1 - a0, nb = Math.max(1, Math.round(len / 2.7)), bay = len / nb, hv = D / 2 - 0.045;
      for (let k = 0; k <= nb; k++) {
        const u = a0 + k * bay;
        for (const s of [-1, 1]) {
          B('paint', WH.upright, 0.08, upH, 0.075, u, upH / 2, s * hv);
          B('steel', WH.foot, 0.17, 0.014, 0.15, u, 0.007, s * hv);
        }
        // frame bracing in the cross-section plane
        for (let y = 0.2, z = 0; y < upH - 0.4; y += 1.1, z++) {
          B('paint', WH.upright, 0.035, 0.035, 2 * hv, u, y, 0);
          const y2 = Math.min(upH - 0.1, y + 1.1), s = z % 2 ? 1 : -1;
          S('paint', WH.upright, u, y, -s * hv, u, y2, s * hv, 0.03);
        }
      }
      // beams run the length of the row on both faces
      for (const yb of beams) for (const s of [-1, 1]) B('paint', WH.beam, len + 0.06, bh, 0.05, (a0 + a1) / 2, yb + bh / 2, s * (hv + 0.01));
      // end guards (inside the collider, which overhangs the end frames by 0.1 m)
      for (const [u, s] of [[a0, -1], [a1, 1]]) B('hazard', WH.column, 0.07, 0.42, D - 0.04, u + s * 0.06, 0.21, 0);
      // stock: two pallet positions per bay on the floor and on each beam level. The two lower
      // levels are always full (they are solid to the collider at eye height); the top ones vary
      const fam = this.rackFamily();
      for (let k = 0; k < nb; k++)
        for (let l = 0; l < 4; l++) {
          const base = l === 0 ? 0 : beams[l - 1] + bh, top = l < 3 ? beams[l] - 0.07 : rk.height - 0.02;
          for (let s = 0; s < 2; s++) {
            const u = a0 + (k + 0.25 + 0.5 * s) * bay;
            const W = Math.min(1.2, bay / 2 - 0.14), Dd = Math.min(1.0, D - 0.1);
            let type = this.pick(fam);
            if (l >= 2 && R() < (l === 3 ? 0.3 : 0.14)) type = 'empty';
            else if (l >= 2 && R() < 0.35) type = this.pick(['drums', 'sacks', 'crate', 'wrapped']);
            this.palletLoad(type, B, Cy, u, base, W, Dd, top - base, l);
          }
        }
    }
  }

  // each run of racking holds mostly one kind of stock
  rackFamily() {
    return this.pick([
      ['wrapped', 'wrapped', 'wrapped', 'cartons'],
      ['cartons', 'cartons', 'wrapped'],
      ['totes', 'totes', 'wrapped'],
      ['wrapped', 'cartons', 'totes', 'wrapped'],
    ]);
  }

  // one pallet and what is on it, centred at (u, v = 0) in rack space, filling up to hMax. Level
  // 0 is the floor: pallets above it are drawn as plain slabs, the top levels may be part-picked
  palletLoad(type, B, Cy, u, y0, W, Dd, hMax, level) {
    const R = this.rng;
    if (type === 'empty') return;
    let y = y0;
    if (type !== 'crate') {
      if (level >= 1) B('matte', WH.pallet, W, 0.14, Dd, u, y + 0.07, 0);
      else this.pallet(B, u, y, W, Dd);
      y += 0.145;
    }
    const h = hMax - (y - y0);
    if (h < 0.3) return;
    switch (type) {
      case 'wrapped': {
        const hh = h - R() * Math.min(0.12, h * 0.1);
        B('wrap', this.pick(WH.wrapTint), W - 0.04, hh, Dd - 0.04, u, y + hh / 2, 0);
        if (R() < 0.5) B('matte', this.pick(WH.card), W - 0.02, 0.012, Dd - 0.02, u, y + hh + 0.006, 0); // top sheet
        break;
      }
      case 'cartons': {
        // a block of cartons; up high, a part-picked top layer
        const tone = R() < 0.3 ? this.pick(WH.print) : this.pick(WH.card);
        const hh = h - R() * Math.min(0.1, h * 0.1);
        if (level < 2 || hh < 0.7) { B('carton', tone, W - 0.03, hh, Dd - 0.03, u, y + hh / 2, 0); break; }
        const lh = 0.32, lo = hh - lh;
        B('carton', tone, W - 0.03, lo, Dd - 0.03, u, y + lo / 2, 0);
        const su = R() < 0.5 ? -1 : 1;
        B('carton', tone, W / 2 - 0.02, lh - 0.01, Dd - 0.03, u + su * W / 4, y + lo + lh / 2, 0);
        if (R() < 0.5) B('carton', tone, W / 2 - 0.02, lh - 0.01, Dd / 2 - 0.02, u - su * W / 4, y + lo + lh / 2, (R() < 0.5 ? -1 : 1) * Dd / 4);
        break;
      }
      case 'totes': {
        // four columns of stacking totes
        const th = 0.31, hh = Math.max(1, Math.min(4, Math.floor(h / th))) * th, col = this.pick(WH.tote);
        for (const su of [-1, 1]) for (const sv of [-1, 1]) B('carton', col, W / 2 - 0.03, hh - 0.01, Dd / 2 - 0.03, u + su * W / 4, y + hh / 2, sv * Dd / 4);
        break;
      }
      case 'drums': {
        const col = this.pick(WH.drum), dh = Math.min(0.88, h - 0.02);
        for (const su of [-1, 1]) for (const sv of [-1, 1]) Cy('paint', col, Math.min(W, Dd) / 4 - 0.01, dh, u + su * W / 4, y + dh / 2, sv * Dd / 4, 10);
        break;
      }
      case 'sacks': {
        const hh = Math.min(h, 0.15 * (3 + Math.floor(R() * 4))), col = this.pick(WH.sack);
        B('carton', col, W - 0.06, hh - 0.15, Dd - 0.06, u, y + (hh - 0.15) / 2, 0);
        B('carton', col, W - 0.12, 0.14, Dd - 0.1, u + (R() - 0.5) * 0.06, y + hh - 0.075, 0);
        break;
      }
      case 'crate': {
        const hh = Math.min(h, 0.95);
        B('matte', WH.crate, W - 0.04, hh, Dd - 0.04, u, y + hh / 2, 0);
        for (const yy of [0.06, hh - 0.06]) B('matte', WH.crateDark, W - 0.01, 0.08, Dd - 0.01, u, y + yy, 0);
        break;
      }
    }
  }

  // a timber pallet: top deck, three blocks across, bottom boards (fork pockets between)
  pallet(B, u, y, W, Dd) {
    B('matte', WH.pallet, W, 0.024, Dd, u, y + 0.133, 0);
    for (const o of [-1, 0, 1]) B('matte', WH.palletDark, 0.1, 0.098, Dd, u + o * (W / 2 - 0.05), y + 0.072, 0);
    for (const o of [-1, 1]) B('matte', WH.pallet, W, 0.022, 0.12, u, y + 0.011, o * (Dd / 2 - 0.06));
  }

  // ---- loose stock and machines --------------------------------------------------------------
  buildProps() {
    for (const p of this.level.props) {
      if (p.kind === 'rack') continue;
      const put = this.placer(p.x, p.z, p.yaw);
      // local helpers (u = local x, v = local z)
      const B = (key, hex, du, dy, dv, u, y, v) => put(key, whBox(du, dy, dv, u, y, v), hex);
      const Cy = (key, hex, r, h, u, y, v, seg = 12) => put(key, whCyl(r, r, h, seg, u, y, v), hex);
      const { w, d, h } = p.def;
      switch (p.kind) {
        case 'load':
          this.palletLoad('wrapped', B, Cy, 0, 0, w, d, h, 0);
          break;
        case 'cartons': {
          // a loose heap: a few cartons of different sizes on top of each other
          let y = 0;
          while (y < h - 0.2) {
            const bh = Math.min(h - y, 0.25 + this.rng() * 0.25), bw = w * (0.55 + this.rng() * 0.45), bd = d * (0.55 + this.rng() * 0.45);
            B('matte', this.pick(WH.card), bw, bh, bd, (this.rng() - 0.5) * (w - bw), y + bh / 2, (this.rng() - 0.5) * (d - bd));
            y += bh;
          }
          break;
        }
        case 'pallets':
          for (let k = 0; k < (p.def.count || 1); k++) this.pallet(B, (this.rng() - 0.5) * 0.04, k * 0.145, w, d);
          break;
        case 'drums':
          this.palletLoad('drums', B, Cy, 0, 0, w, d, h, 0);
          break;
        case 'stack': {
          // block-stacked loads, one or two tiers, sharing the stack's footprint
          const nu = Math.max(1, Math.round(w / 1.25)), nv = Math.max(1, Math.round(d / 1.05));
          for (let t = 0; t < (p.def.tiers || 1); t++)
            for (let a = 0; a < nu; a++)
              for (let b = 0; b < nv; b++) {
                const u = -w / 2 + (a + 0.5) * (w / nu), v = -d / 2 + (b + 0.5) * (d / nv);
                const type = this.rng() < 0.7 ? 'wrapped' : 'cartons';
                // palletLoad centres its load across at v = 0: shift this row to its own v
                const Bv = (key, hex, du, dy, dv, uu, y, vv) => B(key, hex, du, dy, dv, uu, y, vv + v);
                const Cv = (key, hex, r, hh, uu, y, vv, seg) => Cy(key, hex, r, hh, uu, y, vv + v, seg);
                this.palletLoad(type, Bv, Cv, u + (this.rng() - 0.5) * 0.03, t * 1.3, w / nu - 0.05, d / nv - 0.05, 1.28, t);
              }
          break;
        }
        case 'crate':
          this.palletLoad('crate', B, Cy, 0, 0, w, d, h, 0);
          break;
        case 'barrel':
          Cy('paint', this.pick(WH.drum), w / 2, h, 0, h / 2, 0, 14);
          Cy('steel', WH.darkMetal, w / 2 + 0.01, 0.03, 0, h * 0.33, 0, 14);
          Cy('steel', WH.darkMetal, w / 2 + 0.01, 0.03, 0, h * 0.66, 0, 14);
          break;
        case 'cone':
          B('matte', WH.black, w, 0.03, d, 0, 0.015, 0);
          put('matte', whCyl(0.03, 0.15, h - 0.03, 12, 0, 0.03 + (h - 0.03) / 2, 0), WH.cone);
          put('matte', whCyl(0.075, 0.1, 0.08, 12, 0, 0.3, 0), WH.white);
          break;
        case 'bollard':
          Cy('hazard', WH.column, w / 2 - 0.01, h - 0.04, 0, (h - 0.04) / 2, 0, 12);
          Cy('paint', WH.black, w / 2 - 0.02, 0.04, 0, h - 0.02, 0, 12);
          break;
        case 'jack':
          this.palletJack(B, put);
          break;
        case 'vending': {
          // front is local +z
          B('paint', this.pick([0x8a1c14, 0x1d2a3c, 0x2a2622]), w, h, d, 0, h / 2, 0);
          B('glow', 0xf3dcb4, w * 0.6, h * 0.55, 0.012, -w * 0.12, h * 0.56, d / 2 + 0.006);
          // shelves of snacks behind the glass
          for (let k = 0; k < 5; k++) {
            const sy = h * 0.32 + k * h * 0.105;
            B('paint', WH.darkMetal, w * 0.58, 0.018, 0.02, -w * 0.12, sy, d / 2 + 0.016);
            for (let m = 0; m < 5; m++) B('matte', this.pick(WH.print), 0.07, 0.11, 0.012, -w * 0.12 + (m - 2) * w * 0.11, sy + 0.065, d / 2 + 0.014);
          }
          B('glow', 0xd8382a, w * 0.86, 0.16, 0.012, 0, h - 0.14, d / 2 + 0.006);
          B('paint', WH.darkMetal, w * 0.18, h * 0.3, 0.02, w * 0.33, h * 0.62, d / 2 + 0.01);
          B('paint', WH.black, w * 0.6, 0.14, 0.04, -w * 0.12, 0.3, d / 2 + 0.02);
          break;
        }
        case 'bench': {
          B('matte', 0xa07a4c, w, 0.04, d, 0, h - 0.02, 0);
          B('matte', 0x8a6a44, w - 0.1, 0.03, d - 0.1, 0, 0.18, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('paint', WH.darkMetal, 0.05, h - 0.04, 0.05, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
          // things left on it
          B('carton', this.pick(WH.card), 0.45, 0.32, 0.36, -0.5, h + 0.16, -0.05);
          B('carton', this.pick(WH.card), 0.38, 0.2, 0.3, -0.48, h + 0.42, -0.02);
          B('matte', WH.white, 0.24, 0.005, 0.32, 0.2, h + 0.0025, 0.1);
          put('wrap', whCyl(0.06, 0.06, 0.5, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(0.55, h + 0.06, -0.15), 0xd8d6cc);
          B('paint', WH.jack, 0.08, 0.1, 0.22, 0.15, h + 0.05, -0.2);
          B('carton', this.pick(WH.card), 0.5, 0.3, 0.4, 0.3, 0.35, 0);
          break;
        }
        case 'bin':
          B('paint', this.pick([0x2f4a2c, 0x3a3f44, 0x6a2a1c]), w - 0.04, h - 0.12, d - 0.04, 0, (h - 0.12) / 2 + 0.08, 0);
          B('paint', WH.black, w, 0.05, d, 0, h - 0.025, 0);
          for (const s of [-1, 1]) put('matte', whCyl(0.08, 0.08, 0.05, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(s * (w / 2 - 0.08), 0.08, -d / 2 + 0.1), WH.black);
          break;
        case 'forklift':
          this.forklift(B, Cy, put);
          break;
      }
    }
  }

  palletJack(B, put) {
    // forks towards -z, the pump body and steering wheel at +z, the handle leaning back
    for (const s of [-1, 1]) B('paint', WH.darkMetal, 0.16, 0.075, 1.15, s * 0.19, 0.0375, -0.2);
    B('paint', WH.jack, 0.5, 0.3, 0.3, 0, 0.17, 0.55);
    put('matte', whCyl(0.09, 0.09, 0.08, 12, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 0.09, 0.62), WH.black);
    put('paint', whStrut(0, 0.3, 0.62, 0, 1.18, 0.76, 0.035), WH.jack);
    B('paint', WH.black, 0.3, 0.05, 0.05, 0, 1.18, 0.76);
  }

  forklift(B, Cy, put) {
    const body = this.pick(WH.forklift);
    B('paint', body, 1.12, 0.5, 1.9, 0, 0.42, -0.18);           // chassis
    B('paint', body, 1.14, 0.6, 0.45, 0, 0.62, -0.92);          // counterweight
    B('hazard', WH.column, 1.0, 0.16, 0.012, 0, 0.72, -1.15);   // striped rear
    B('paint', body, 0.9, 0.35, 0.8, 0, 0.84, -0.45);           // engine cover
    B('paint', body, 0.95, 0.38, 0.32, 0, 0.86, 0.45);          // cowl
    B('matte', WH.black, 0.5, 0.1, 0.46, 0, 1.07, -0.45);       // seat
    B('matte', WH.black, 0.5, 0.42, 0.08, 0, 1.33, -0.7);
    put('paint', whStrut(0, 1.0, 0.42, 0, 1.38, 0.24, 0.05), WH.darkMetal);
    put('matte', whCyl(0.17, 0.17, 0.03, 14, 0, 0, 0).rotateX(-0.5).translate(0, 1.4, 0.22), WH.black);
    // wheels
    for (const s of [-1, 1]) {
      put('matte', whCyl(0.27, 0.27, 0.22, 14, 0, 0, 0).rotateZ(Math.PI / 2).translate(s * 0.46, 0.27, 0.48), WH.black);
      put('matte', whCyl(0.22, 0.22, 0.18, 14, 0, 0, 0).rotateZ(Math.PI / 2).translate(s * 0.47, 0.22, -0.82), WH.black);
    }
    // overhead guard: four posts and a slatted roof
    for (const s of [-1, 1]) {
      put('paint', whStrut(s * 0.5, 0.67, 0.6, s * 0.5, 2.15, 0.36, 0.06), WH.darkMetal);
      put('paint', whStrut(s * 0.5, 0.92, -0.8, s * 0.5, 2.15, -0.8, 0.06), WH.darkMetal);
      B('paint', WH.darkMetal, 0.06, 0.06, 1.22, s * 0.5, 2.15, -0.22);
    }
    for (let k = 0; k < 5; k++) B('paint', WH.darkMetal, 1.0, 0.035, 0.06, 0, 2.17, -0.75 + k * 0.27);
    Cy('paint', 0xe07a10, 0.06, 0.09, 0, 2.23, -0.75, 10); // beacon
    // mast, carriage and forks
    for (const s of [-1, 1]) B('paint', WH.darkMetal, 0.1, 2.15, 0.12, s * 0.36, 1.12, 0.98);
    for (const y of [0.35, 1.3, 2.15]) B('paint', WH.darkMetal, 0.82, 0.08, 0.1, 0, y, 0.98);
    B('paint', WH.darkMetal, 0.95, 0.42, 0.06, 0, 0.36, 1.08);
    for (const y of [0.85, 1.15]) B('paint', WH.darkMetal, 0.95, 0.04, 0.04, 0, y, 1.08);
    for (const s of [-1, 0, 1]) B('paint', WH.darkMetal, 0.04, 0.6, 0.04, s * 0.45, 0.9, 1.08);
    for (const s of [-1, 1]) {
      B('paint', WH.darkMetal, 0.12, 0.05, 1.08, s * 0.3, 0.035, 1.66);
      B('paint', WH.darkMetal, 0.12, 0.45, 0.05, s * 0.3, 0.25, 1.12);
    }
  }

  // ---- columns, doors ------------------------------------------------------------------------
  buildColumns() {
    const L = this.level, H = L.ceiling, colH = H - 1.3;
    for (const p of L.pillars) {
      const { x, z } = p;
      for (const s of [-1, 1]) this.add('paint', whBox(0.3, colH, 0.024, x, colH / 2, z + s * 0.138), WH.column);
      this.add('paint', whBox(0.018, colH, 0.26, x, colH / 2, z), WH.column);
      this.add('steel', whBox(0.4, 0.03, 0.4, x, colH - 0.015, z), WH.darkMetal);
      this.add('hazard', whBox(0.42, 1.1, 0.42, x, 0.55, z), WH.column); // guard sleeve
    }
  }

  buildDoors() {
    const L = this.level, th = L.theme, t = L.wallT, door = L.doorWidth(), lintel = th.lintel, R = this.rng;
    this.exitSigns = [];
    for (const d of L.doorways) {
      const ax = d.axis === 'x'; // wall at constant x: the opening runs along z
      const P = (along, y, across) => (ax ? [d.x + across, y, d.z + along] : [d.x + along, y, d.z + across]);
      const Bx = (key, hex, dl, dy, da, along, y, across) => { const [x, yy, z] = P(along, y, across); this.add(key, ax ? whBox(da, dy, dl, x, yy, z) : whBox(dl, dy, da, x, yy, z), hex); };
      // striped jambs
      for (const s of [-1, 1]) Bx('hazard', WH.column, 0.012, 1.6, t + 0.02, s * (door / 2 - 0.006), 0.8, 0);
      // roller shutter drum and guide rails on one face, an exit sign on the other
      const f = R() < 0.5 ? -1 : 1;
      const [x, y, z] = P(0, lintel + 0.32, f * (t / 2 + 0.26));
      const drum = whCyl(0.25, 0.25, door + 0.5, 14, 0, 0, 0);
      if (ax) drum.rotateX(Math.PI / 2); else drum.rotateZ(Math.PI / 2);
      this.add('steel', drum.translate(x, y, z), WH.galv);
      for (const s of [-1, 1]) Bx('steel', WH.galv, 0.08, lintel + 0.3, 0.1, s * (door / 2 + 0.04), (lintel + 0.3) / 2, f * (t / 2 + 0.05));
      Bx('shutter', WH.galv, door, 0.12, 0.05, 0, lintel - 0.0, f * (t / 2 + 0.06)); // bottom rail of the rolled-up curtain
      if (R() < 0.45) this.exitSigns.push({ pos: P(0, lintel + 0.45, -f * (t / 2 + 0.03)), nx: ax ? -f : 0, nz: ax ? 0 : -f });
    }
    // loading-dock doors on the outside walls
    for (const dd of L.dockDoors) {
      const ax = dd.nx !== 0; // the wall runs along z
      const P = (along, y, out) => (ax ? [dd.x + dd.nx * out, y, dd.z + along] : [dd.x + along, y, dd.z + dd.nz * out]);
      const Bx = (key, hex, dl, dy, dout, along, y, out) => { const [x, yy, z] = P(along, y, out); this.add(key, ax ? whBox(dout, dy, dl, x, yy, z) : whBox(dl, dy, dout, x, yy, z), hex); };
      Bx('shutter', WH.galv, 3.0, 3.5, 0.06, 0, 1.75, 0.03);
      Bx('paint', WH.darkMetal, 3.0, 0.08, 0.1, 0, 0.04, 0.05);
      for (const s of [-1, 1]) {
        Bx('hazard', WH.column, 0.14, 3.6, 0.1, s * 1.57, 1.8, 0.05);
        Bx('matte', WH.black, 0.26, 0.42, 0.12, s * 1.0, 1.12, 0.06);
      }
      Bx('paint', WH.darkMetal, 3.4, 0.22, 0.12, 0, 3.66, 0.06);
    }
  }

  // ---- roof ----------------------------------------------------------------------------------
  buildRoof() {
    const L = this.level, H = L.ceiling, n = L.n, C = L.cell, half = L.half, S = L.size;
    // primary girders (red-oxide primer) along z on every grid line, resting on the columns
    for (let i = 1; i < n; i++) {
      const x = -half + i * C;
      this.add('steel', whBox(0.22, 0.025, S, x, H - 1.3 + 0.0125, 0), WH.girder);
      this.add('steel', whBox(0.014, 0.55, S, x, H - 1.0, 0), WH.girder);
      this.add('steel', whBox(0.22, 0.025, S, x, H - 0.7 - 0.0125, 0), WH.girder);
    }
    // open-web joists along x over every row of cells (the lamps hang from them)
    const step = 1.2;
    for (let j = 0; j < n; j++) {
      const z = L.cx(j), yt = H - 0.06, yb = H - 0.68;
      this.add('steel', whBox(S, 0.07, 0.1, 0, yt, z), WH.joist);
      this.add('steel', whBox(S, 0.06, 0.08, 0, yb, z), WH.joist);
      for (let x = -half; x < half - 0.01; x += step) {
        const xm = Math.min(half, x + step / 2), x1 = Math.min(half, x + step);
        this.add('steel', whStrut(x, yb, z, xm, yt, z, 0.032), WH.joist);
        this.add('steel', whStrut(xm, yt, z, x1, yb, z, 0.032), WH.joist);
      }
    }
    // sprinkler mains between the joists, with heads every few metres
    for (let j = 1; j < n; j += 2) {
      const z = -half + j * C, y = H - 0.3;
      this.add('steel', whCyl(0.05, 0.05, S, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, y, z), WH.pipe);
      for (let x = -half + 1.6; x < half; x += 3.2) {
        this.add('steel', whCyl(0.015, 0.015, 0.16, 6, x, y - 0.1, z), WH.pipe);
        this.add('steel', whCyl(0.035, 0.02, 0.025, 8, x, y - 0.19, z), WH.galv);
      }
    }
  }

  // ---- lamps ---------------------------------------------------------------------------------
  buildLamps() {
    const L = this.level, H = L.ceiling, ly = this.view.lamp.y;
    const lens = [], halo = { pos: [], ctr: [], fix: [], size: [], idx: [] }, shafts = [];
    L.fixtures.forEach((f, k) => {
      const { x, z } = f;
      this.add('steel', whBox(0.02, H - 0.68 - (ly + 0.62), 0.02, x, (H - 0.68 + ly + 0.62) / 2, z), WH.darkMetal);
      this.add('paint', whCyl(0.12, 0.15, 0.26, 8, x, ly + 0.49, z), WH.lampBody);
      this.add('lamp', whCyl(0.16, 0.38, 0.36, 14, x, ly + 0.18, z, true), WH.reflector);
      const g = whCyl(0.37, 0.37, 0.02, 14, x, ly + 0.01, z);
      g.deleteAttribute('uv');
      g.setAttribute('aFix', new T3.BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1));
      lens.push(g);
      // glow quad (expanded to face the camera in the shader)
      const b = halo.pos.length / 3;
      for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        halo.pos.push(cx, cy, 0);
        halo.ctr.push(x, ly - 0.08, z);
        halo.fix.push(k);
        halo.size.push(2.6);
      }
      halo.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      // light shaft: an open cone from the lens to the floor
      const s = whCyl(0.36, 2.3, ly - 0.05, 16, x, (ly - 0.05) / 2 + 0.05, z, true);
      const pos = s.attributes.position, aT = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) aT[i] = 1 - (pos.getY(i) - 0.05) / (ly - 0.05);
      s.setAttribute('aT', new T3.BufferAttribute(aT, 1));
      s.setAttribute('aFix', new T3.BufferAttribute(new Float32Array(pos.count).fill(k), 1));
      s.deleteAttribute('uv');
      shafts.push(s);
    });
    const lm = new T3.Mesh(ThreeUtils.mergeGeometries(lens), this.mats.lens);
    lens.forEach((g) => g.dispose());
    const hg = new T3.BufferGeometry();
    hg.setAttribute('position', new T3.Float32BufferAttribute(halo.pos, 3));
    hg.setAttribute('aCenter', new T3.Float32BufferAttribute(halo.ctr, 3));
    hg.setAttribute('aFix', new T3.Float32BufferAttribute(halo.fix, 1));
    hg.setAttribute('aSize', new T3.Float32BufferAttribute(halo.size, 1));
    hg.setIndex(halo.idx);
    const hm = new T3.Mesh(hg, this.mats.halo);
    hm.frustumCulled = false; // vertices move in the shader
    hm.renderOrder = 6;
    const sm = new T3.Mesh(ThreeUtils.mergeGeometries(shafts), this.mats.shaft);
    shafts.forEach((g) => g.dispose());
    sm.renderOrder = 5;
    this.view.scene.add(lm, hm, sm);
    this.glow = [hm, sm];
  }

  // ---- signs ---------------------------------------------------------------------------------
  // one canvas atlas per level: rack row numbers on the end frames, zone letters painted on the
  // walls, dock numbers, and exit signs over some of the doorways (lit, leading nowhere)
  buildSigns() {
    const L = this.level, signs = [];
    const hallOf = (x, z) => {
      const c = L.cellOf(x, z);
      if (c < 0) return null;
      const i = c % L.n, j = (c / L.n) | 0;
      return L.halls.find((h) => i >= h.i0 && i < h.i0 + h.w && j >= h.j0 && j < h.j0 + h.d) || null;
    };
    // rack rows, numbered per hall
    const count = new Map();
    const runs = L.racks.filter((r) => !r.wallSide).sort((a, b) => a.c - b.c || a.a0 - b.a0);
    for (const r of runs) {
      const hl = hallOf(r.alongX ? (r.a0 + r.a1) / 2 : r.c, r.alongX ? r.c : (r.a0 + r.a1) / 2);
      const letter = hl ? hl.letter : 'X', k = (count.get(letter) || 0) + 1;
      count.set(letter, k);
      const text = `${letter}-${String(k).padStart(2, '0')}`;
      for (const [u, s] of [[r.a0, -1], [r.a1, 1]]) {
        const pos = r.alongX ? [u + s * 0.1, 3.72, r.c] : [r.c, 3.72, u + s * 0.1];
        signs.push({ text, style: 'plate', pos, nx: r.alongX ? s : 0, nz: r.alongX ? 0 : s, w: 0.62, h: 0.31 });
      }
    }
    // zone letters on a wall of each hall, facing into it
    for (const hl of L.halls) {
      const cands = [];
      const tryEdge = (i, j, dir) => { if (L.edgeVal(i, j, dir) === 1) cands.push([i, j, dir]); };
      for (let i = hl.i0; i < hl.i0 + hl.w; i++) { tryEdge(i, hl.j0, 3); tryEdge(i, hl.j0 + hl.d - 1, 2); }
      for (let j = hl.j0; j < hl.j0 + hl.d; j++) { tryEdge(hl.i0, j, 1); tryEdge(hl.i0 + hl.w - 1, j, 0); }
      // prefer walls the racking does not stand against
      const free = cands.filter(([i, j, dir]) => !L.racks.some((r) => r.wallSide && (r.alongX ? dir >= 2 : dir < 2) && Math.abs(r.c - (dir < 2 ? -L.half + (i + (dir === 0)) * L.cell : -L.half + (j + (dir === 2)) * L.cell)) < 1.5));
      const pool = free.length ? free : cands;
      for (let m = 0; m < Math.min(2, pool.length); m++) {
        const [i, j, dir] = pool[Math.floor(this.rng() * pool.length)];
        const nx = dir === 0 ? -1 : dir === 1 ? 1 : 0, nz = dir === 2 ? -1 : dir === 3 ? 1 : 0;
        const x = dir < 2 ? -L.half + (i + (dir === 0)) * L.cell + nx * (L.wallT / 2 + 0.01) : L.cx(i);
        const z = dir >= 2 ? -L.half + (j + (dir === 2)) * L.cell + nz * (L.wallT / 2 + 0.01) : L.cx(j);
        signs.push({ text: `ZONE ${hl.letter}`, style: 'paint', pos: [x, 3.1, z], nx, nz, w: 3.2, h: 1.0 });
      }
    }
    for (const dd of L.dockDoors) signs.push({ text: `DOCK ${String(dd.num).padStart(2, '0')}`, style: 'plate', pos: [dd.x + dd.nx * 0.08, 4.05, dd.z + dd.nz * 0.08], nx: dd.nx, nz: dd.nz, w: 1.2, h: 0.4 });
    // department boards hung from the girders over the open floor
    const names = ['SHIPPING', 'RECEIVING', 'STAGING', 'RETURNS', 'OVERFLOW', 'QUARANTINE', 'DISPATCH'];
    for (const hl of L.halls) {
      if (hl.type === 'racks' || hl.w < 3) continue;
      for (let m = 0; m < (hl.w * hl.d > 40 ? 2 : 1); m++) {
        const i = hl.i0 + 1 + Math.floor(this.rng() * (hl.w - 1)), j = hl.j0 + Math.floor(this.rng() * hl.d);
        const x = -L.half + i * L.cell, z = L.cx(j), text = names.splice(Math.floor(this.rng() * names.length), 1)[0];
        if (!text) break;
        for (const s of [-1, 1]) signs.push({ text, style: 'hang', pos: [x + s * 0.012, 4.6, z], nx: s, nz: 0, w: 2.4, h: 0.6 });
        this.add('paint', whBox(0.03, 0.03, 2.3, x, 4.91, z), WH.darkMetal);
        for (const s of [-1, 1]) this.add('steel', whBox(0.015, L.ceiling - 1.3 - 4.9, 0.015, x, (L.ceiling - 1.3 + 4.9) / 2, z + s * 0.95), WH.darkMetal);
      }
    }
    for (const e of this.exitSigns) signs.push({ text: 'EXIT', style: 'exit', pos: e.pos, nx: e.nx, nz: e.nz, w: 0.56, h: 0.24 });
    if (!signs.length) return;
    // the atlas: 256 x 128 tiles, four to a row
    const tw = 256, tht = 128, cols = 4, rows = Math.ceil(signs.length / cols);
    const cv = document.createElement('canvas');
    cv.width = tw * cols;
    cv.height = tht * rows;
    const g = cv.getContext('2d');
    signs.forEach((s, k) => {
      const x0 = (k % cols) * tw, y0 = ((k / cols) | 0) * tht;
      g.save();
      g.translate(x0, y0);
      if (s.style === 'plate') {
        g.fillStyle = '#e0a21c'; g.fillRect(4, 4, tw - 8, tht - 8);
        g.strokeStyle = '#1a1612'; g.lineWidth = 6; g.strokeRect(10, 10, tw - 20, tht - 20);
        g.fillStyle = '#16120e';
      } else if (s.style === 'exit') {
        g.fillStyle = '#1a0806'; g.fillRect(4, 4, tw - 8, tht - 8);
        g.fillStyle = '#ff3a26';
      } else if (s.style === 'hang') {
        g.fillStyle = '#6e1a10'; g.fillRect(0, 0, tw, tht);
        g.strokeStyle = '#e8dcc0'; g.lineWidth = 5; g.strokeRect(9, 9, tw - 18, tht - 18);
        g.fillStyle = '#efe4c8';
      } else g.fillStyle = 'rgba(236, 226, 200, 0.93)';
      g.font = `900 ${s.style === 'paint' ? 82 : 76}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.text, tw / 2, tht / 2 + 4, tw - 28);
      if (s.style === 'paint') {
        // stencil bridges and flaking paint
        g.globalCompositeOperation = 'destination-out';
        for (let m = 0; m < 70; m++) { g.globalAlpha = 0.3 + Math.random() * 0.7; g.fillRect(Math.random() * tw, Math.random() * tht, 2 + Math.random() * 7, 2 + Math.random() * 5); }
      }
      g.restore();
    });
    const tex = new T3.CanvasTexture(cv);
    tex.colorSpace = T3.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    const mat = patchLattice(new T3.MeshStandardMaterial({ map: tex, roughness: 0.7, alphaTest: 0.5 }), this.view.shared, { key: 'wh-sign' });
    const exitMat = new T3.MeshBasicMaterial({ map: tex });
    exitMat.color.setRGB(2.4, 1.6, 1.5);
    const byMat = [[], []];
    signs.forEach((s, k) => {
      const geo = new T3.PlaneGeometry(s.w, s.h);
      const uv = geo.attributes.uv, c = k % cols, r = (k / cols) | 0;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (c + uv.getX(i)) / cols, 1 - (r + 1 - uv.getY(i)) / rows);
      geo.rotateY(Math.atan2(s.nx, s.nz)).translate(...s.pos);
      byMat[s.style === 'exit' ? 1 : 0].push(geo);
    });
    for (const [list, m] of [[byMat[0], mat], [byMat[1], exitMat]]) {
      if (!list.length) continue;
      const mesh = new T3.Mesh(ThreeUtils.mergeGeometries(list), m);
      list.forEach((g2) => g2.dispose());
      mesh.receiveShadow = true;
      this.view.scene.add(mesh);
    }
  }

  // ---- per frame -----------------------------------------------------------------------------
  update() {
    const fog = this.view.scene.fog;
    for (const m of this.glow || []) m.material.uniforms.uFogD.value = fog ? fog.density : 0;
  }

  dispose() { for (const t of this.textures) t.dispose(); }
}
