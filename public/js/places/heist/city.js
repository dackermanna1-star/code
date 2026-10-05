// Robloxia City around the bank: a grid of avenues and streets lined with
// office towers, brick walk-ups and shops, and the getaway route out of town
// up the highway to a tunnel in the hills. Buildings near the bank are parts
// (you can't walk through them and bullets hit them); the rest is merged
// decoration. Also returns the getaway route as a curve.
import * as THREE from 'three';
import { uvBox, mergeStatic } from '../warzone/map.js';
import { materials, textures } from './textures.js';

let seed = 4242;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];

export const AVES = [-616, -440, -264, -88, 88, 264, 440, 616, 792];
export const STREETS = [-830, -644, -458, -272, -86, 264, 450];
const RW = 18; // half the road width
const PLAY = { x0: -270, x1: 270, z0: -290, z1: 290 }; // buildings in here are solid

export function buildCity(world) {
  seed = 4242;
  const M = materials(world.renderer);
  const T = textures();
  const deco = new THREE.Group();
  world.scene.add(deco);
  const solids = [];
  const box = (x0, x1, y0, y1, z0, z1, mat, o = {}) => {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0, pos = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const near = o.solid && x1 > PLAY.x0 && x0 < PLAY.x1 && z1 > PLAY.z0 && z0 < PLAY.z1;
    if (near) {
      const p = world.add({ size: [sx, sy, sz], position: pos, color: 194, name: o.name || 'Building' });
      p.mesh.geometry = uvBox(sx, sy, sz, o.tile || 8); p.mesh.material = mat;
      p.mesh.castShadow = o.shadow !== false; p.mesh.receiveShadow = true;
      solids.push(p);
      return p.mesh;
    }
    const m = new THREE.Mesh(uvBox(sx, sy, sz, o.tile || 8), mat);
    m.position.set(...pos);
    m.castShadow = o.shadow !== false && x1 > PLAY.x0 - 200 && x0 < PLAY.x1 + 200 && z1 > PLAY.z0 - 200 && z0 < PLAY.z1 + 200; m.receiveShadow = true;
    deco.add(m);
    return m;
  };

  // ground and the city's paving
  // (the grass sits half a stud below the streets so the two never flicker)
  const ground = world.add({ size: [9000, 4, 9000], position: [500, -2.5, -1500], color: 194, name: 'Ground' });
  ground.mesh.geometry = uvBox(9000, 4, 9000, 60); ground.mesh.material = M.grass; ground.mesh.receiveShadow = true;
  const cx0 = AVES[0] - 60, cx1 = AVES[AVES.length - 1] + 60, cz0 = STREETS[0] - 60, cz1 = STREETS[STREETS.length - 1] + 60;
  const paving = world.add({ size: [cx1 - cx0, 1, cz1 - cz0], position: [(cx0 + cx1) / 2, -0.5, (cz0 + cz1) / 2], color: 194, name: 'Street' });
  paving.mesh.geometry = uvBox(cx1 - cx0, 1, cz1 - cz0, 40); paving.mesh.material = M.asphalt; paving.mesh.receiveShadow = true;

  // --- roads: lane markings and crosswalks
  const lines = [];
  const line = (x0, x1, z0, z1, mat, y = 0) => lines.push(box(x0, x1, y + 0.03, y + 0.07, z0, z1, mat, { shadow: false }));
  for (const x of AVES) {
    line(x - 0.6, x - 0.2, cz0, cz1, M.yellowLine); line(x + 0.2, x + 0.6, cz0, cz1, M.yellowLine);
    for (let z = cz0; z < cz1; z += 24) for (const o of [-9, 9]) line(x + o - 0.25, x + o + 0.25, z, z + 10, M.whiteLine);
  }
  for (const z of STREETS) {
    line(cx0, cx1, z - 0.6, z - 0.2, M.yellowLine); line(cx0, cx1, z + 0.2, z + 0.6, M.yellowLine);
    for (let x = cx0; x < cx1; x += 24) for (const o of [-9, 9]) line(x, x + 10, z + o - 0.25, z + o + 0.25, M.whiteLine);
  }
  for (const x of AVES) for (const z of STREETS) {
    // crosswalks on all four sides of the intersection
    for (let k = -14; k <= 14; k += 4) {
      line(x + k - 1, x + k + 1, z - RW - 7, z - RW - 1, M.whiteLine); line(x + k - 1, x + k + 1, z + RW + 1, z + RW + 7, M.whiteLine);
      line(x - RW - 7, x - RW - 1, z + k - 1, z + k + 1, M.whiteLine); line(x + RW + 1, x + RW + 7, z + k - 1, z + k + 1, M.whiteLine);
    }
  }
  // traffic lights at the intersections near the route
  const signalLights = [];
  const redLight = new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2010, emissiveIntensity: 2 });
  const signal = (x, z, ry) => {
    box(x - 0.3, x + 0.3, 0.5, 16, z - 0.3, z + 0.3, M.darkSteel);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 14), M.darkSteel); arm.position.set(x - Math.sin(ry) * 7, 15.5, z - Math.cos(ry) * 7); arm.rotation.y = ry; deco.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.2), M.black); head.position.set(x - Math.sin(ry) * 11, 13.5, z - Math.cos(ry) * 11); head.rotation.y = ry; deco.add(head);
    const lt = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), redLight);
    lt.position.set(head.position.x - Math.cos(ry) * 0, 14.8, head.position.z); deco.add(lt);
    signalLights.push(lt);
  };
  for (const [x, z] of [[88, -86], [-88, -86], [88, -272], [88, -458], [264, -458], [440, -458], [616, -458], [616, -644]]) {
    signal(x + RW + 2, z + RW + 2, Math.PI / 2 * 0); signal(x - RW - 2, z - RW - 2, Math.PI);
  }

  // --- blocks
  const shopNames = ['BLOXY BURGER', 'ROBLOXIA COFFEE', 'PIZZA PLACE', 'BUILDERMAN HARDWARE', 'TIX & TOKENS', 'NOOB NAILS', 'BRICK BAGELS', 'OBBY GYM', 'THE STUD SHOP', 'CROSSROADS DELI', 'TELAMON TOYS', 'PAWN & LOAN', 'LAUNDROMAT', 'ROBUX EXCHANGE'];
  const shopMat = new Map();
  const shopSign = (name) => {
    if (!shopMat.has(name)) { const t = T.sign(name, null, '#ffffff', pick(['#1a4a8a', '#8a1a1a', '#1a6a3a', '#3a3a3a', '#7a4a1a']), 512, 96); shopMat.set(name, new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 })); }
    return shopMat.get(name);
  };
  const blocks = [];
  for (let i = 0; i < AVES.length - 1; i++) for (let j = 0; j < STREETS.length - 1; j++) {
    const bx0 = AVES[i] + RW, bx1 = AVES[i + 1] - RW, bz0 = STREETS[j] + RW, bz1 = STREETS[j + 1] - RW;
    if (bx0 === -70 && bz0 === -68) {
      // the bank's block: the bank builds itself; here, the alley and the buildings south of it
      lot(-70, 70, 78, bz1, true);
      continue;
    }
    lot(bx0, bx1, bz0, bz1, false);
  }
  function lot(x0, x1, z0, z1, southOfAlley) {
    blocks.push({ x0, x1, z0, z1 });
    box(x0, x1, 0, 0.5, z0, z1, M.sidewalk, { tile: 8, shadow: false, solid: true, name: 'Sidewalk' });
    const inset = 12;
    const ax0 = x0 + inset, ax1 = x1 - inset, az0 = z0 + inset, az1 = z1 - inset;
    // split the block into 2-4 buildings
    const splitX = rand() < 0.7, splitZ = rand() < 0.7;
    const xs = splitX ? [ax0, (ax0 + ax1) / 2 + rr(-15, 15), ax1] : [ax0, ax1];
    const zs = splitZ ? [az0, (az0 + az1) / 2 + rr(-15, 15), az1] : [az0, az1];
    for (let a = 0; a < xs.length - 1; a++) for (let b = 0; b < zs.length - 1; b++) {
      const bx0 = xs[a] + 0.5, bx1 = xs[a + 1] - 0.5, bz0 = zs[b] + 0.5, bz1 = zs[b + 1] - 0.5;
      const downtown = Math.hypot((bx0 + bx1) / 2 - 300, (bz0 + bz1) / 2 + 400) < 500;
      let h = downtown ? rr(60, 210) : rr(30, 90);
      if (southOfAlley) h = rr(30, 60);
      building(bx0, bx1, bz0, bz1, h, x0, x1, z0, z1, southOfAlley && b === 0);
    }
  }
  function building(x0, x1, z0, z1, h, bx0, bx1, bz0, bz1, alleyBack) {
    const style = h > 110 ? pick([0, 0, 1, 3]) : pick([1, 2, 2, 3]);
    const mat = M.facades[style];
    box(x0, x1, 0.5, h, z0, z1, mat, { tile: 24, solid: true });
    box(x0 - 0.3, x1 + 0.3, h, h + 1.2, z0 - 0.3, z1 + 0.3, M.roof, { tile: 8 });
    // rooftop: AC units, a water tower on brick buildings, a crown on towers
    for (let k = 0; k < 3; k++) { const ux = rr(x0 + 4, x1 - 8), uz = rr(z0 + 4, z1 - 8); box(ux, ux + 4, h + 1.2, h + 4, uz, uz + 4, M.darkSteel); }
    if (style === 2 && rand() < 0.6) {
      const tx = (x0 + x1) / 2 + rr(-6, 6), tz = (z0 + z1) / 2 + rr(-6, 6);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7, 14), M.wood); t.position.set(tx, h + 9, tz); deco.add(t);
      const c = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.6, 14), M.darkSteel); c.position.set(tx, h + 13.8, tz); deco.add(c);
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) box(tx + dx - 0.2, tx + dx + 0.2, h + 1.2, h + 5.5, tz + dz - 0.2, tz + dz + 0.2, M.darkSteel);
    }
    if (h > 150) { box((x0 + x1) / 2 - 1, (x0 + x1) / 2 + 1, h + 1.2, h + 30, (z0 + z1) / 2 - 1, (z0 + z1) / 2 + 1, M.darkSteel); }
    // shopfronts and awnings on the sides that face a street
    const sides = [];
    if (Math.abs(z0 - (bz0 + 12.5)) < 1 && !alleyBack) sides.push(['n', z0]);
    if (Math.abs(z1 - (bz1 - 12.5)) < 1) sides.push(['s', z1]);
    if (Math.abs(x0 - (bx0 + 12.5)) < 1) sides.push(['w', x0]);
    if (Math.abs(x1 - (bx1 - 12.5)) < 1) sides.push(['e', x1]);
    for (const [side, v] of sides) {
      const along = side === 'n' || side === 's';
      const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
      const out = side === 'n' || side === 'w' ? -1 : 1;
      if (along) box(a0 + 1, a1 - 1, 0.5, 11, v + out * 0.05, v + out * 0.35, M.shopfront, { tile: 12, shadow: false });
      else box(v + out * 0.05, v + out * 0.35, 0.5, 11, a0 + 1, a1 - 1, M.shopfront, { tile: 12, shadow: false });
      if (rand() < 0.75) {
        // a shop sign and an awning
        const name = pick(shopNames);
        const mid = (a0 + a1) / 2, w = Math.min(a1 - a0 - 6, 30);
        const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), shopSign(name));
        const yaw = side === 'n' ? Math.PI : side === 's' ? 0 : side === 'w' ? -Math.PI / 2 : Math.PI / 2;
        s.rotation.y = yaw;
        if (along) s.position.set(mid, 13.2, v + out * 0.45); else s.position.set(v + out * 0.45, 13.2, mid);
        deco.add(s);
        const aw = new THREE.Mesh(new THREE.PlaneGeometry(w, 5), pick(M.awnings));
        aw.rotation.order = 'YXZ'; aw.rotation.y = yaw; aw.rotation.x = -Math.PI / 2 + 0.45;
        if (along) aw.position.set(mid, 10.4, v + out * 2.3); else aw.position.set(v + out * 2.3, 10.4, mid);
        deco.add(aw);
      }
    }
  }

  // street lamps and trees along the route's avenues (merged)
  for (let z = -830; z < 250; z += 46) for (const x of [88 - RW - 3, 88 + RW + 3]) { box(x - 0.3, x + 0.3, 0.5, 20, z - 0.3, z + 0.3, M.darkSteel, { shadow: false }); box(x - 1, x + 1, 19.4, 20, z - 1, z + 1, M.lamp, { shadow: false }); }
  for (let x = 88; x < 616; x += 46) for (const z of [-458 - RW - 3, -458 + RW + 3]) { box(x - 0.3, x + 0.3, 0.5, 20, z - 0.3, z + 0.3, M.darkSteel, { shadow: false }); box(x - 1, x + 1, 19.4, 20, z - 1, z + 1, M.lamp, { shadow: false }); }

  // --- the highway out of town: north from the end of 616th Avenue to a tunnel
  const HX = 616, hz0 = STREETS[0] - 60, hz1 = -3500;
  box(HX - 34, HX + 34, -1, 0.1, hz1, hz0, M.asphalt, { tile: 40, shadow: false });
  box(HX - 0.8, HX + 0.8, 0, 2.6, hz1, hz0, M.concrete, { tile: 8 }); // median barrier
  for (const o of [-1, 1]) {
    box(HX + o * 34 - 0.3, HX + o * 34 + 0.3, 1.6, 2.6, hz1, hz0, M.darkSteel, { shadow: false }); // guard rails
    for (let z = hz0; z > hz1; z -= 12) box(HX + o * 34 - 0.2, HX + o * 34 + 0.2, 0, 1.6, z - 0.2, z + 0.2, M.darkSteel, { shadow: false });
    for (let z = hz0; z > hz1; z -= 30) for (const lane of [8, 17, 25]) line(HX + o * lane - 0.25, HX + o * lane + 0.25, z - 12, z, M.whiteLine, 0.1);
    for (let z = hz0 - 40; z > hz1; z -= 110) { box(HX + o * 37 - 0.4, HX + o * 37 + 0.4, 0, 26, z - 0.4, z + 0.4, M.darkSteel, { shadow: false }); box(HX + o * 32 - 5, HX + o * 37, 25.5, 26.2, z - 0.4, z + 0.4, M.darkSteel, { shadow: false }); box(HX + o * 31 - 1.2, HX + o * 31 + 1.2, 25, 25.5, z - 0.8, z + 0.8, M.lamp, { shadow: false }); }
  }
  // overhead sign gantries and billboards
  const gantry = (z, text, sub) => {
    for (const o of [-1, 1]) box(HX + o * 36 - 0.6, HX + o * 36 + 0.6, 0, 28, z - 0.6, z + 0.6, M.darkSteel, { shadow: false });
    box(HX - 36, HX + 36, 26, 28, z - 0.6, z + 0.6, M.darkSteel, { shadow: false });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), new THREE.MeshStandardMaterial({ map: T.sign(text, sub, '#ffffff', '#1a6a3a', 640, 192), roughness: 0.6 }));
    s.position.set(HX + 16, 22, z + 0.7); deco.add(s);
  };
  gantry(-1150, 'NORTH  I-8', 'Robloxia Hills  ·  Tunnel 2 mi');
  gantry(-2400, 'TUNNEL', 'Use headlights');
  const ads = [['BLOXY COLA', 'Taste the Bricks', '#c01818', '#600808'], ['VISIT CROSSROADS', 'Free swords for everyone!', '#2a6ab8', '#103060'], ['PIZZA PLACE', 'Now hiring delivery drivers', '#e88a20', '#8a3a10'], ['BUILDERS CLUB', 'Get your hard hat today', '#3a3a3a', '#101010'], ['THE MUMMY', 'Coming soon to a pyramid near you', '#c8a050', '#5a3a10']];
  ads.forEach((a, i) => {
    const z = -1000 - i * 480, o = i % 2 ? 1 : -1;
    const x = HX + o * 70;
    box(x - 0.8, x + 0.8, 0, 30, z - 0.8, z + 0.8, M.darkSteel, { shadow: false });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(48, 24), new THREE.MeshStandardMaterial({ map: T.ad(...a), roughness: 0.7 }));
    b.position.set(x, 40, z); b.rotation.y = o > 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6; deco.add(b);
    const back = new THREE.Mesh(new THREE.BoxGeometry(49, 25, 0.6), M.darkSteel); back.position.copy(b.position); back.rotation.y = b.rotation.y; back.translateZ(-0.4); deco.add(back);
  });
  // hills and trees along the highway, the mountain with the tunnel at the end
  const rock = new THREE.MeshStandardMaterial({ color: 0x6a7a4a, roughness: 1, flatShading: true });
  const rock2 = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 1, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1, z = rr(hz1 + 200, hz0 - 100), d = rr(160, 700);
    const r = rr(80, 220), hh = rr(30, 120);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), rand() < 0.7 ? rock : rock2);
    hill.scale.set(1, hh / r, 1.3); hill.position.set(HX + side * d, -2, z); deco.add(hill);
  }
  const treeGeo = new THREE.ConeGeometry(5, 18, 7), trunkGeo = new THREE.CylinderGeometry(0.8, 0.8, 5, 6);
  const treeM = new THREE.MeshStandardMaterial({ color: 0x2e5a2a, roughness: 1, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeM, 360), trunks = new THREE.InstancedMesh(trunkGeo, M.bark, 360);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 360; i++) {
    const side = i % 2 ? 1 : -1, z = rr(hz1 + 100, hz0), x = HX + side * rr(48, 260), s = rr(0.7, 1.5);
    mtx.compose(new THREE.Vector3(x, 11 * s + 2, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trees.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(x, 2.5, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, mtx);
  }
  trees.castShadow = false; deco.add(trees); deco.add(trunks);
  const mountain = new THREE.Mesh(new THREE.SphereGeometry(520, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), rock2);
  mountain.scale.set(1.4, 0.55, 0.7); mountain.position.set(HX, -4, hz1 - 330); deco.add(mountain);
  // the tunnel portal and tube
  const portal = new THREE.Shape(); portal.moveTo(-60, 0); portal.lineTo(60, 0); portal.lineTo(60, 70); portal.lineTo(-60, 70); portal.closePath();
  const arch = new THREE.Path(); arch.moveTo(-34, 0); arch.lineTo(-34, 26); arch.absarc(0, 26, 34, Math.PI, 0, true); arch.lineTo(34, 0); arch.lineTo(-34, 0); portal.holes.push(arch);
  const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(portal, { depth: 8, bevelEnabled: false, curveSegments: 24 }), M.concrete);
  pm.position.set(HX, 0, hz1 - 8); deco.add(pm);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 900, 24, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.9, side: THREE.BackSide }));
  tube.rotation.x = Math.PI / 2; tube.position.set(HX, 26, hz1 - 450); deco.add(tube);
  for (const o of [-34, 34]) box(HX + o - 0.2, HX + o + 0.2, 0, 26, hz1 - 900, hz1, new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 }), { shadow: false });
  for (let z = hz1 - 20; z > hz1 - 900; z -= 30) box(HX - 1.5, HX + 1.5, 58, 59, z - 3, z, new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffc860, emissiveIntensity: 1.5 }), { shadow: false });
  box(HX - 34, HX + 34, -1, 0.1, hz1 - 900, hz1, M.asphalt, { tile: 40, shadow: false });

  for (const p of solids) deco.attach(p.mesh);
  mergeStatic(deco);

  // --- the getaway route: out of the alley, north up 88th Avenue, east along
  // 458th Street, north up 616th Avenue onto the highway and into the tunnel
  const P = (x, z) => new THREE.Vector3(x, 0, z);
  const path = new THREE.CurvePath();
  const pts = [P(30, 68), P(94, 68), P(94, -452), P(624, -452), P(624, hz1 - 600)];
  const R = 26;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    if (i < pts.length - 1) {
      const next = pts[i + 1];
      const a = cur.clone().addScaledVector(prev.clone().sub(cur).normalize(), R);
      const b = cur.clone().addScaledVector(next.clone().sub(cur).normalize(), R);
      path.add(new THREE.LineCurve3(prev, a));
      path.add(new THREE.QuadraticBezierCurve3(a, cur, b));
      prev = b;
    } else path.add(new THREE.LineCurve3(prev, cur));
  }
  return { deco, route: path, routeLength: path.getLength(), tunnelZ: hz1, highwayX: HX, signalLights, blocks };
}
