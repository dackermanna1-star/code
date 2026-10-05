// The First Robloxia Bank and the city block around it. The bank: a marble
// lobby with the tellers' counter, the manager's office, the security room,
// a staff corridor behind a keycard door, the vault behind a barred gate and
// a 14-stud round vault door, a break room and the cash room with the back
// door to the alley. Everything people walk on or shoot at is a part;
// decoration is merged into a few meshes. Returns a navigation graph,
// restricted zones, NPC spots, doors and the places you interact with.
//
// Coordinates: +X east, -Z north. The bank faces north onto Main Street.
import * as THREE from 'three';
import { uvBox, mergeStatic } from '../warzone/map.js';
import { materials, textures } from './textures.js';
import { cashStack, goldStack, buildSedan, mats as modelMats } from './models.js';

export const FL = 2; // the bank's floor level

export function buildBank(world) {
  const M = materials(world.renderer);
  const deco = new THREE.Group();
  world.scene.add(deco);
  const solids = [];
  const glass = [];
  const solid = (size, pos, mat, o = {}) => {
    const p = world.add({ size, position: pos, color: 194, top: 'Smooth', bottom: 'Smooth', name: o.name || 'Wall' });
    p.mesh.geometry = uvBox(size[0], size[1], size[2], o.tile || 8);
    p.mesh.material = mat;
    p.mesh.castShadow = o.shadow !== false; p.mesh.receiveShadow = true;
    if (o.metal) p.userData.metal = true;
    if (o.keep) return p; // moving parts (doors) are not merged
    solids.push(p);
    return p;
  };
  const box = (size, pos, mat, o = {}) => {
    const m = new THREE.Mesh(o.geo || uvBox(size[0], size[1], size[2], o.tile || 8), mat);
    m.position.set(...pos);
    if (o.ry) m.rotation.y = o.ry;
    m.castShadow = o.shadow !== false; m.receiveShadow = true;
    (o.parent || deco).add(m);
    return m;
  };
  // the same, by bounds
  const rects = []; // walls, for the minimap
  const B = (x0, x1, y0, y1, z0, z1, mat, o) => {
    if (y1 - y0 > 3 && y0 < FL + 3) rects.push({ x0, x1, z0, z1, col: '#e8e2d4' });
    return solid([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], mat, o);
  };
  const D = (x0, x1, y0, y1, z0, z1, mat, o) => box([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], mat, o);
  const pane = (x0, x1, y0, y1, z0, z1, frosted = false) => {
    const p = world.add({ size: [x1 - x0, y1 - y0, z1 - z0], position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color: 194, name: 'Glass' });
    p.mesh.material = frosted ? M.frosted : M.glass; p.mesh.castShadow = false; p.mesh.renderOrder = 2;
    p.userData.glass = true; p.userData.frosted = frosted;
    glass.push(p);
    return p;
  };
  const cyl = (r, h, pos, mat, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; deco.add(m); return m; };
  const floor = (x0, x1, z0, z1, mat, tile = 8, y = FL) => D(x0, x1, y, y + 0.02, z0, z1, mat, { tile, shadow: false });
  const ceiling = (x0, x1, z0, z1, y, mat, tile = 8) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile); deco.add(m); return m; };
  const sign = (tex, w, h, pos, ry = 0, emissive = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.2, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive }));
    m.position.set(...pos); m.rotation.y = ry; deco.add(m); return m;
  };
  const T = textures();

  // --- the bank's shell ------------------------------------------------------------------------------------
  B(-52, 52, 0, FL, -42, 58, M.granite, { tile: 8, shadow: false, name: 'Floor' });
  // front wall with the entrance, back wall with the back door, sides
  B(-52, -7, FL, 34, -42, -40, M.limestone, { tile: 16 }); B(7, 52, FL, 34, -42, -40, M.limestone, { tile: 16 }); B(-7, 7, 16, 34, -42, -40, M.limestone, { tile: 16 });
  B(-52, 34, FL, 34, 56, 58, M.limestone, { tile: 16 }); B(40, 52, FL, 34, 56, 58, M.limestone, { tile: 16 }); B(34, 40, 12, 34, 56, 58, M.limestone, { tile: 16 });
  B(-52, -50, FL, 34, -40, 56, M.limestone, { tile: 16 }); B(50, 52, FL, 34, -40, 56, M.limestone, { tile: 16 });
  D(-53, 53, 34, 35.5, -43, 59, M.granite, { tile: 8, shadow: false });
  for (const [x0, x1, z0, z1] of [[-53, 53, -43, -42], [-53, 53, 58, 59], [-53, -52, -43, 59], [52, 53, -43, 59]]) D(x0, x1, 35.5, 37.5, z0, z1, M.limestone, { tile: 8 });
  // interior faces of the outer walls
  D(-50, -7, FL, 30, -40, -39.9, M.wallMarble, { tile: 16 }); D(7, 50, FL, 30, -40, -39.9, M.wallMarble, { tile: 16 }); D(-7, 7, 16, 30, -40, -39.9, M.wallMarble, { tile: 16 });
  D(49.9, 50, FL, 30, -40, -14, M.wallMarble, { tile: 16 });

  // --- lobby (and the open lounge to the east) --------------------------------------------------------------
  floor(-28, 50, -40, -14, M.marble, 8);
  ceiling(-28, 50, -40, -12, 30, M.coffer, 8);
  // west wall: the manager's office behind glass, then the security room door
  B(-30, -28, FL, 4.5, -40, -33, M.wood); pane(-29.4, -28.6, 4.5, 12, -40, -33, true); B(-30, -28, 12, 30, -40, -33, M.wallMarble, { tile: 16 });
  B(-30, -28, 12, 30, -33, -28, M.wallMarble, { tile: 16 });
  B(-30, -28, FL, 30, -28, -12, M.wallMarble, { tile: 16 });
  B(-30, -28, FL, 18, -12, -10, M.plaster); B(-30, -28, 12, 18, -10, -5, M.plaster); B(-30, -28, FL, 18, -5, -2, M.plaster);
  // pillars between the lobby and the lounge
  for (const z of [-31, -21]) { B(29, 31, FL, 30, z - 1.2, z + 1.2, M.wallMarble, { tile: 8 }); D(28.4, 31.6, FL, FL + 1.2, z - 1.8, z + 1.8, M.granite); D(28.4, 31.6, 28.6, 30, z - 1.8, z + 1.8, M.granite); }
  B(30, 50, FL, 30, -14, -12, M.wallMarble, { tile: 16 });
  B(30, 50, FL, 18, -12, -2, M.plaster); // staff toilets (closed)
  // wood wainscot around the lobby
  for (const [x0, x1, z0, z1] of [[-27.9, -27.7, -40, -14], [-28, 29, -39.9, -39.6], [49.6, 49.9, -40, -14], [31, 50, -14.3, -14]]) D(x0, x1, FL, FL + 4, z0, z1, M.wood, { tile: 6 });

  // the tellers' counter: wood, marble top, glass screens, brass
  B(-28, 22, FL, 6, -14, -12, M.wood, { tile: 6 });
  D(-28.3, 22.3, 6, 6.35, -14.4, -11.6, M.marble, { tile: 8 });
  for (let i = 0; i <= 8; i++) { const x = -28 + i * 6.25; D(x - 0.15, x + 0.15, 6.35, 11, -13.15, -12.85, M.brass); }
  for (let i = 0; i < 8; i++) { const x = -28 + i * 6.25; pane(x + 0.15, x + 6.1, 6.9, 11, -13.08, -12.92); D(x + 2.2, x + 4.0, 6.35, 6.6, -13.6, -12.4, M.black); }
  B(-28, 30, 11, 12.5, -14, -12, M.wood, { tile: 6 });
  B(-28, 30, 12.5, 30, -14, -12, M.wallMarble, { tile: 16 });
  // the name over the tellers and a big clock
  sign(T.sign('FIRST ROBLOXIA BANK', 'EST. 2006   ·   MEMBER FDIC'), 40, 5, [0, 21, -14.06], Math.PI);
  // gate in the counter (swung open) for staff
  const gate = D(22, 22.3, FL, FL + 3.6, -14, -10.5, M.wood); gate.rotation.y = 0;
  floor(-28, 30, -12, -2, M.carpetBlue, 8);
  ceiling(-28, 30, -12, -2, 16, M.ceiling, 4);
  ceiling(-50, 50, -2, 56, 18, M.ceiling, 4);
  ceiling(-50, -30, -40, -2, 18, M.ceiling, 4);

  // lobby furniture: columns, the island desk, benches, queue posts, plants, chandeliers, flags
  for (const [x, z] of [[-14, -33], [14, -33], [-14, -22], [14, -22]]) {
    cyl(1.35, 27, [x, FL + 13.5 + 0.6, z], M.wallMarble, 20);
    D(x - 1.8, x + 1.8, FL, FL + 1.2, z - 1.8, z + 1.8, M.granite); D(x - 1.9, x + 1.9, 28.4, 30, z - 1.9, z + 1.9, M.wallMarble);
    solid([2.6, 28, 2.6], [x, FL + 14, z], M.wallMarble).mesh.visible = false;
  }
  B(-3, 3, FL, FL + 4, -29, -25, M.wood, { tile: 6 }); D(-3.4, 3.4, FL + 4, FL + 4.3, -29.4, -24.6, M.marble);
  for (const [x, z] of [[-21, -37.5], [21, -37.5]]) { B(x - 5, x + 5, FL, FL + 1.8, z - 1.2, z + 1.2, M.wood, { tile: 6 }); D(x - 5, x + 5, FL + 1.8, FL + 4.2, z + 0.8, z + 1.2, M.wood); }
  for (let i = 0; i < 6; i++) { const z = -34 + i * 3.5; for (const x of [-9, -5]) { cyl(0.12, 3.2, [x, FL + 1.6, z], M.brass, 8); cyl(0.3, 0.2, [x, FL + 0.1, z], M.brass, 10); } }
  for (let i = 0; i < 5; i++) { for (const x of [-9, -5]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6), M.red); r.rotation.x = Math.PI / 2; r.position.set(x, FL + 2.7, -32.25 + i * 3.5); deco.add(r); } }
  const plant = (x, z, s = 1) => { B(x - 1.1 * s, x + 1.1 * s, FL, FL + 2.4 * s, z - 1.1 * s, z + 1.1 * s, M.pot, { tile: 3 }); for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 0), M.leaf); l.position.set(x + (Math.random() - 0.5) * 1.6 * s, FL + 3.2 * s + Math.random() * 2.6 * s, z + (Math.random() - 0.5) * 1.6 * s); l.castShadow = true; deco.add(l); } };
  plant(-26, -38); plant(26, -38); plant(47, -38); plant(-26, -16); plant(47, -16, 0.9);
  for (const x of [-12, 12]) {
    const ch = new THREE.Group(); ch.position.set(x, 24, -27); deco.add(ch);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 8, 24), M.brass); ring.rotation.x = Math.PI / 2; ch.add(ring);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), M.lamp); b.position.set(Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6); ch.add(b); }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), M.brass); rod.position.y = 3; ch.add(rod);
  }
  for (const [x, flag] of [[-24, '#1a3a8a'], [24, '#a01818']]) {
    cyl(0.12, 12, [x, FL + 6, -15.5], M.brass, 8);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshStandardMaterial({ color: flag, side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.set(x + (x < 0 ? 2 : -2), FL + 10.4, -15.5); deco.add(f);
  }
  // paintings
  const art = (draw) => { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d'); draw(x, 256, 160); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const landscape = art((x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f0b070'); g.addColorStop(0.5, '#e07850'); g.addColorStop(1, '#3a5a30'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#2a3a28'; x.beginPath(); x.moveTo(0, h * 0.7); for (let i = 0; i <= w; i += 16) x.lineTo(i, h * 0.6 - Math.sin(i / 30) * 14); x.lineTo(w, h); x.lineTo(0, h); x.fill(); x.fillStyle = '#ffe8b0'; x.beginPath(); x.arc(w * 0.7, h * 0.35, 14, 0, 7); x.fill(); });
  const portrait = art((x, w, h) => { x.fillStyle = '#3a2a1a'; x.fillRect(0, 0, w, h); x.fillStyle = '#f5cd30'; x.fillRect(w / 2 - 24, 30, 48, 44); x.fillStyle = '#111'; x.fillRect(w / 2 - 12, 44, 5, 8); x.fillRect(w / 2 + 7, 44, 5, 8); x.beginPath(); x.arc(w / 2, 58, 9, 0.2, Math.PI - 0.2); x.stroke(); x.fillStyle = '#1a4a9a'; x.fillRect(w / 2 - 40, 76, 80, 84); x.fillStyle = '#e8c030'; x.fillRect(w / 2 - 28, 18, 56, 14); x.font = 'bold 13px Georgia'; x.textAlign = 'center'; x.fillText('OUR FOUNDER', w / 2, h - 8); });
  for (const [tex, pos, ry] of [[landscape, [49.85, FL + 12, -26], -Math.PI / 2], [portrait, [-27.85, FL + 13, -21], Math.PI / 2]]) {
    const fr = box([0.3, 7, 10], [pos[0] + (ry < 0 ? 0.1 : -0.1), pos[1], pos[2]], M.brass); void fr;
    sign(tex, 9.2, 6.2, [pos[0] + (ry < 0 ? -0.1 : 0.1), pos[1], pos[2]], ry);
  }
  // the lounge: two loan desks and a sofa
  const desk = (x, z, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, FL, z); g.rotation.y = ry; deco.add(g);
    box([7, 0.35, 3.4], [0, 3.6, 0], M.wood, { parent: g }); box([0.3, 3.4, 3.2], [-3.3, 1.7, 0], M.wood, { parent: g }); box([0.3, 3.4, 3.2], [3.3, 1.7, 0], M.wood, { parent: g }); box([6.4, 2.6, 0.2], [0, 2.0, 1.4], M.wood, { parent: g });
    box([2.2, 1.5, 0.15], [-1, 5.0, -0.6], M.black, { parent: g }); box([0.25, 0.9, 0.25], [-1, 4.1, -0.6], M.black, { parent: g }); box([1.8, 0.1, 0.7], [-1, 3.82, 0.3], M.black, { parent: g });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.3), M.screens[(Math.random() * 6) | 0]); s.position.set(-1, 5.0, -0.52); s.rotation.y = Math.PI; g.add(s);
    const turned = Math.abs(Math.sin(ry)) > 0.5;
    solid(turned ? [3.4, 4, 7] : [7, 4, 3.4], [x, FL + 2, z], M.wood).mesh.visible = false;
    return g;
  };
  desk(40, -32, Math.PI / 2); desk(40, -22, Math.PI / 2);
  B(44, 49, FL, FL + 2, -38, -35, M.leather, { tile: 4 }); D(48, 49, FL + 2, FL + 4.5, -38, -35, M.leather);
  // security cameras (with a blinking light)
  const cams = [];
  for (const [x, y, z, ry] of [[-26, 26, -38.5, -2.4], [48, 26, -38.5, 2.4], [-26, 14.5, -11, -0.6], [0, 16.5, 1, 0], [-12, 16.5, 13.5, 0.4], [44, 16.5, 54, 2.6]]) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; deco.add(g);
    box([0.9, 0.7, 1.8], [0, 0, 0], M.white, { parent: g }); box([0.5, 0.5, 0.2], [0, 0, -0.95], M.black, { parent: g }); box([0.2, 0.8, 0.2], [0, 0.6, 0.4], M.white, { parent: g });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 2 })); led.position.set(0.3, 0.2, -0.92); g.add(led);
    cams.push({ g, led });
  }

  // --- behind the counter ------------------------------------------------------------------------------------------
  const tellers = [];
  for (const x of [-18, -6, 6]) {
    D(x - 3, x + 3, FL, FL + 3.2, -11.5, -9.6, M.wood);
    D(x - 3.1, x + 3.1, FL + 3.2, FL + 3.4, -11.6, -9.4, M.marble);
    box([1.6, 1.1, 0.12], [x, FL + 4.4, -11.2], M.black); const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.95), M.screens[(Math.random() * 6) | 0]); s.position.set(x, FL + 4.4, -11.13); deco.add(s);
    D(x + 1.2, x + 2.6, FL + 2.3, FL + 3.1, -9.62, -9.5, M.darkSteel); // cash drawer
    tellers.push([x, -9]);
  }
  // keycard reader and the STAFF ONLY door
  sign(T.sign('STAFF ONLY', 'KEYCARD REQUIRED', '#f0f0f0', '#7a1010', 512, 128), 5.5, 1.4, [11, FL + 11, -2.06], Math.PI);
  D(15.2, 16.4, FL + 4.2, FL + 6.2, -2.25, -2.0, M.black);
  const readerLed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 1.5 }));
  readerLed.position.set(15.8, FL + 5.7, -2.28); deco.add(readerLed);
  const keyDoor = solid([6, 10, 0.8], [11, FL + 5, -1], M.darkSteel, { keep: true, metal: true, name: 'Door' });
  keyDoor.setKinematic();
  keyDoor.mesh.material = M.steel;

  // --- manager's office --------------------------------------------------------------------------------------------
  floor(-50, -30, -40, -24, M.carpet, 6);
  D(-49.9, -49.8, FL, 18, -40, -24, M.wood, { tile: 6 });
  const mdesk = new THREE.Group(); mdesk.position.set(-41, FL, -33); deco.add(mdesk);
  box([9, 0.4, 4], [0, 3.7, 0], M.wood, { parent: mdesk }); box([8.6, 3.5, 0.3], [0, 1.8, -1.6], M.wood, { parent: mdesk }); box([0.4, 3.5, 3.6], [-4.2, 1.8, 0], M.wood, { parent: mdesk }); box([0.4, 3.5, 3.6], [4.2, 1.8, 0], M.wood, { parent: mdesk });
  box([2.4, 1.6, 0.15], [-2, 5.2, 0.8], M.black, { parent: mdesk }); const ms = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), M.screens[2]); ms.position.set(-2, 5.2, 0.885); mdesk.add(ms);
  box([0.3, 1.4, 0.3], [-2, 4.3, 0.8], M.black, { parent: mdesk });
  B(-45.5, -36.5, FL, FL + 3.9, -35, -31, M.wood).mesh.visible = false;
  B(-44, -40, FL, FL + 4.5, -29, -27, M.leather, { tile: 3 }); // chair
  B(-49.6, -48, FL, 14, -39, -30, M.wood, { tile: 4 }); // bookshelf
  for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) D(-49.4, -48.4, FL + 1.2 + r * 3, FL + 3.4 + r * 3 - Math.random() * 0.8, -38.6 + k * 1.2, -37.8 + k * 1.2, [M.red, M.green, M.black, M.fabric][(r + k) % 4]);
  B(-36, -32, FL, FL + 6, -39.6, -37, M.darkSteel, { metal: true }); // filing cabinet
  plant(-33, -26.5, 0.8);
  // the keycard on the desk
  const keycard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a6ad8, emissive: 0x1a4aa8, emissiveIntensity: 0.6 }));
  keycard.position.set(-39, FL + 3.95, -33.5); keycard.rotation.y = 0.4; world.scene.add(keycard);

  // --- security room --------------------------------------------------------------------------------------------------
  floor(-50, -30, -22, -2, M.lino, 8);
  B(-49.5, -38, FL, FL + 3.6, -21.5, -18.5, M.darkSteel, { metal: true });
  for (let i = 0; i < 6; i++) { const x = -48 + (i % 3) * 3.6, y = FL + 6 + Math.floor(i / 3) * 2.6; D(x - 1.7, x + 1.7, y - 1.2, y + 1.2, -21.9, -21.6, M.black); const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), M.screens[i]); s.position.set(x, y, -21.55); deco.add(s); }
  B(-49.8, -46, FL, 14, -10, -6, M.black, { metal: true }); // server rack
  const rackLeds = [];
  for (let i = 0; i < 14; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x002000, emissive: Math.random() < 0.5 ? 0x20ff40 : 0xffa020, emissiveIntensity: 1.5 })); l.position.set(-45.96, FL + 2 + i * 0.8, -9 + (i % 3) * 0.9); deco.add(l); rackLeds.push(l); }
  const alarmPanel = new THREE.Group(); alarmPanel.position.set(-31.1, FL + 6, -16); alarmPanel.rotation.y = -Math.PI / 2; deco.add(alarmPanel);
  box([3, 3.6, 0.4], [0, 0, 0], M.red, { parent: alarmPanel }); box([2.2, 1.2, 0.1], [0, 0.6, -0.22], M.black, { parent: alarmPanel });
  sign(T.sign('ALARM', null, '#ffffff', '#9a1818', 256, 96), 2, 0.7, [-31.35, FL + 4.8, -16], -Math.PI / 2);
  B(-44, -40, FL, FL + 4.5, -16, -14, M.leather, { tile: 3 });

  // --- staff corridor ----------------------------------------------------------------------------------------------------
  floor(-50, 50, -2, 10, M.lino, 8);
  B(-50, 8, FL, 18, -2, 0, M.plaster); B(14, 50, FL, 18, -2, 0, M.plaster); B(8, 14, 12, 18, -2, 0, M.plaster);
  for (const [x0, x1] of [[-50, -30], [-24, -5], [5, 24], [30, 50]]) B(x0, x1, FL, 18, 10, 12, M.plaster);
  B(-30, -24, 12, 18, 10, 12, M.plaster); B(-5, 5, 14, 18, 10, 12, M.plaster); B(24, 30, 12, 18, 10, 12, M.plaster);
  for (const x of [-40, -20, 0, 20, 40]) D(x - 3, x + 3, 17.8, 17.95, 4, 6, M.fluoro, { shadow: false });
  D(-48, -46.8, FL + 3, FL + 5.5, 8.8, 9.9, M.red); // fire extinguisher
  D(32, 34, FL, FL + 5, 8.2, 9.9, M.white); D(32.3, 33.7, FL + 5, FL + 7, 8.6, 9.6, new THREE.MeshStandardMaterial({ color: 0x8ac0f0, transparent: true, opacity: 0.6 }));
  // the gate terminal (hacked to open the vault gate)
  const term = new THREE.Group(); term.position.set(8.5, FL + 5.5, 9.75); deco.add(term);
  box([2.4, 3, 0.5], [0, 0, 0], M.darkSteel, { parent: term }); const tsc = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshStandardMaterial({ color: 0x002010, emissive: 0x20ff60, emissiveIntensity: 0.6 })); tsc.position.set(0, 0.4, -0.27); tsc.rotation.y = Math.PI; term.add(tsc);
  box([1.8, 0.6, 0.3], [0, -0.9, -0.3], M.black, { parent: term });
  sign(T.sign('VAULT', 'AUTHORIZED PERSONNEL ONLY', '#e8c040', '#1a1a1a', 512, 128), 8, 2, [0, 15.5, 9.94], Math.PI);
  // the vault gate: steel bars that slide up
  const gateBars = solid([10, 12, 0.6], [0, FL + 6, 11], M.darkSteel, { keep: true, metal: true, name: 'Gate' });
  gateBars.setKinematic();
  gateBars.mesh.material = new THREE.MeshStandardMaterial({ visible: false });
  const bars = new THREE.Group(); gateBars.mesh.add(bars);
  for (let i = 0; i < 13; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 12, 8), M.steel); b.position.set(-4.8 + i * 0.8, 0, 0); b.castShadow = true; bars.add(b); }
  for (const y of [-5.5, 0, 5.5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 0.3), M.darkSteel); b.position.y = y; bars.add(b); }

  // --- the vault -----------------------------------------------------------------------------------------------------------
  floor(-14, 14, 12, 28, M.polished, 8);
  D(-6.5, 6.5, FL + 0.03, FL + 0.05, 24, 27.8, M.hazard, { tile: 4, shadow: false });
  B(-16, -14, FL, 18, 12, 28, M.concrete); B(14, 16, FL, 18, 12, 28, M.concrete);
  B(-18, -6, FL, 18, 28, 32, M.concrete); B(6, 18, FL, 18, 28, 32, M.concrete); B(-6, 6, FL + 12, 18, 28, 32, M.concrete);
  B(-18, -16, FL, 18, 32, 56, M.steel, { metal: true }); B(16, 18, FL, 18, 32, 56, M.steel, { metal: true });
  for (const x of [-10, 0, 10]) D(x - 2.5, x + 2.5, 17.8, 17.95, 19, 21, M.fluoro, { shadow: false });
  // the frame around the round door
  const frameShape = new THREE.Shape(); frameShape.moveTo(-9, FL - 0.0); frameShape.lineTo(9, FL); frameShape.lineTo(9, FL + 16); frameShape.lineTo(-9, FL + 16); frameShape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, FL + 7.2, 7.25, 0, Math.PI * 2, true); frameShape.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.6, bevelEnabled: false, curveSegments: 40 }), M.steel);
  frame.position.set(0, 0, 27.4); frame.castShadow = true; deco.add(frame);
  { const uv = frame.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6); }
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.35, 10, 48), M.brass); ringM.position.set(0, FL + 7.2, 27.35); deco.add(ringM);
  // the vault door: a kinematic part that swings on its hinge
  const vaultDoor = solid([12.6, 12.6, 3], [0, FL + 7.2, 29.5], M.steel, { keep: true, metal: true, name: 'VaultDoor' });
  vaultDoor.setKinematic();
  vaultDoor.mesh.material = new THREE.MeshStandardMaterial({ visible: false });
  const vd = new THREE.Group(); vaultDoor.mesh.add(vd);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(7.15, 7.15, 3, 48), [M.darkSteel, M.vaultDoor, M.vaultDoor]); disc.rotation.x = Math.PI / 2; disc.castShadow = true; vd.add(disc);
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2 + k * 1.7, 0.12, 6, 40), M.darkSteel); r.position.z = -1.52; vd.add(r); }
  const wheelG = new THREE.Group(); wheelG.position.z = -2.2; vd.add(wheelG);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 16), M.brass); hub.rotation.x = Math.PI / 2; wheelG.add(hub);
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), M.brass); s.rotation.z = k * Math.PI / 3; wheelG.add(s); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3, 0.18, 8, 32), M.brass); wheelG.add(rim);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), M.chrome || M.steel); bolt.rotation.z = Math.PI / 2; bolt.rotation.y = a; bolt.position.set(Math.cos(a) * 7.0, Math.sin(a) * 7.0, 0); vd.add(bolt); bolt.rotation.set(0, 0, a); bolt.rotation.z = a + Math.PI / 2; }
  const hingeM = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 10, 12), M.darkSteel); hingeM.position.set(7.4, 0, -1); vd.add(hingeM);
  // inside the vault: shelves of cash, gold on pallets, safe deposit boxes
  floor(-16, 16, 32, 56, M.steel, 8);
  for (const x of [-12, 0, 12]) D(x - 2.5, x + 2.5, 17.8, 17.95, 43, 45, M.fluoro, { shadow: false });
  const VL = new THREE.PointLight(0xe8f0ff, 120, 60, 1.2); VL.position.set(0, 14, 44); world.scene.add(VL);
  const loot = [];
  for (const [i, x] of [-11, -4, 4, 11].entries()) {
    B(x - 3, x + 3, FL, FL + 11, 55, 55.6, M.darkSteel, { metal: true, tile: 4 });
    for (const sx of [-1, 1]) B(x + sx * 2.9 - 0.12, x + sx * 2.9 + 0.12, FL, FL + 11, 52.4, 55.6, M.darkSteel, { metal: true });
    for (const y of [FL + 1, FL + 5.5]) {
      D(x - 3, x + 3, y - 0.2, y, 52.4, 55.6, M.steel);
      const st = cashStack(18, 6, 3); st.position.set(x, y, 53.9); deco.add(st);
      loot.push({ kind: 'cash', pos: new THREE.Vector3(x, y + 1, 52), mesh: st, value: 45000, weight: 1, grabs: 1, room: 'vault', label: 'cash' });
    }
    void i;
  }
  for (const [x, z] of [[-8, 41], [8, 41], [0, 47]]) {
    const gs = goldStack(4); gs.position.set(x, FL, z); deco.add(gs);
    solid([5.2, 2.4, 3.8], [x, FL + 1.2, z], M.wood).mesh.visible = false;
    loot.push({ kind: 'gold', pos: new THREE.Vector3(x, FL + 2.5, z - 2.6), mesh: gs, value: 120000, weight: 3, grabs: 4, room: 'vault', label: 'gold bars' });
  }
  for (const sx of [-1, 1]) {
    D(sx * 15.9 - 0.05, sx * 15.9 + 0.05, FL + 0.5, FL + 12.5, 33, 51, M.deposit, { tile: 4 });
    for (const z of [35, 38.5, 42, 45.5, 49]) loot.push({ kind: 'box', pos: new THREE.Vector3(sx * 14.6, FL + 4, z), value: 0, weight: 0.4, grabs: 1, room: 'vault', label: 'safe deposit box', side: sx });
  }

  // --- break room (west) and cash room (east) ------------------------------------------------------------------------------
  floor(-50, -16, 12, 56, M.lino, 8);
  floor(16, 50, 12, 56, M.lino, 8);
  for (const [x, z] of [[-40, 24], [-28, 40], [-40, 44]]) { B(x - 3, x + 3, FL, FL + 3.4, z - 2, z + 2, M.white, { tile: 4 }); for (const dx of [-2.2, 2.2]) D(x + dx - 0.8, x + dx + 0.8, FL, FL + 2.2, z - 3.2, z - 2.4, M.fabric); }
  B(-49.6, -46, FL, FL + 9, 14, 18, M.red, { tile: 4 }); // Bloxy Cola machine
  sign(T.sign('BLOXY COLA', 'ICE COLD', '#ffffff', '#c01818', 256, 256), 3.2, 3.2, [-45.95, FL + 6, 16], Math.PI / 2, 0.6);
  B(-49.6, -46, FL, FL + 8, 20, 24, M.white, { tile: 4 }); // fridge
  B(-49.6, -45, FL, FL + 3.6, 30, 40, M.wood, { tile: 4 }); D(-49.6, -45, FL + 3.6, FL + 3.8, 30, 40, M.granite);
  D(-48.5, -46, FL + 3.8, FL + 5.2, 32, 35, M.black); // microwave
  // first aid kits (break room counter, security room wall)
  const medkit = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); world.scene.add(g); box([1.6, 1.1, 1.0], [0, 0, 0], M.white, { parent: g }); box([0.9, 0.25, 1.02], [0, 0, 0], M.red, { parent: g }); box([0.25, 0.8, 1.02], [0, 0, 0], M.red, { parent: g }); return g; };
  const medkits = [medkit(-47, FL + 4.4, 37), medkit(-49.3, FL + 5, -14)];
  medkits[1].rotation.y = Math.PI / 2;
  B(-30, -20, FL, FL + 2.4, 52, 55.5, M.fabric, { tile: 4 }); D(-30, -20, FL + 2.4, FL + 5, 54.8, 55.5, M.fabric);
  D(-28, -22, FL + 7, FL + 10.5, 55.7, 55.9, M.black);
  for (const x of [-40, -24]) for (const z of [20, 40]) D(x - 3, x + 3, 17.8, 17.95, z - 1, z + 1, M.fluoro, { shadow: false });
  // cash room: counting tables with loose cash, carts, shelving
  for (const [x, z] of [[24, 22], [24, 36], [40, 22], [40, 36]]) {
    B(x - 4, x + 4, FL, FL + 3.4, z - 2.4, z + 2.4, M.darkSteel, { metal: true, tile: 4 });
    D(x - 1.2, x + 1.2, FL + 3.4, FL + 4.6, z - 1.0, z + 1.0, M.black); // money counter
    const st = cashStack(8, 4, 2); st.position.set(x + 2.2, FL + 3.4, z); deco.add(st);
    loot.push({ kind: 'cash', pos: new THREE.Vector3(x, FL + 4, z - 3.2), mesh: st, value: 18000, weight: 0.5, grabs: 1, room: 'cash room', label: 'loose cash' });
  }
  B(46, 49.6, FL, FL + 12, 14, 30, M.darkSteel, { metal: true, tile: 4 });
  for (let i = 0; i < 6; i++) { const bg = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.9 })); bg.rotation.z = Math.PI / 2; bg.position.set(47.8, FL + 1 + (i % 3) * 4, 17 + Math.floor(i / 3) * 8); deco.add(bg); }
  for (const x of [-4, 4]) D(16 + 12 + x - 2.5, 16 + 12 + x + 2.5, 17.8, 17.95, 29, 31, M.fluoro, { shadow: false });
  D(40, 46, 17.8, 17.95, 29, 31, M.fluoro, { shadow: false });
  // the back door (push bar) and its EXIT sign
  const backDoor = solid([6, 10, 0.5], [37, FL + 5, 56.8], M.darkSteel, { keep: true, metal: true, name: 'Door' });
  backDoor.setKinematic();
  D(34.6, 39.4, FL + 4.2, FL + 4.6, 56.3, 56.5, M.steel);
  const exitSign = box([3, 1, 0.3], [37, FL + 11, 55.8], M.exit); void exitSign;

  // tellers' drawers: a little loose cash up front
  for (const [x, z] of tellers) loot.push({ kind: 'cash', pos: new THREE.Vector3(x + 1.9, FL + 3, z - 0.6), value: 6000, weight: 0.2, grabs: 1, room: 'teller drawers', label: 'teller drawer' });

  // --- outside: the portico, columns and the name ------------------------------------------------------------------------------
  B(-30, 30, 0, 1.0, -57, -42, M.granite, { tile: 8 });
  B(-29, 29, 0, 1.5, -56, -42, M.granite, { tile: 8 });
  B(-28, 28, 0, FL, -55, -42, M.granite, { tile: 8 });
  for (const x of [-25, -15, -5, 5, 15, 25]) {
    cyl(1.5, 26.8, [x, FL + 1.2 + 13.4, -50], M.limestone, 20);
    D(x - 2, x + 2, FL, FL + 1.2, -52, -48, M.limestone); D(x - 2.2, x + 2.2, 28, 30, -52.2, -47.8, M.limestone);
    solid([3, 28, 3], [x, FL + 14, -50], M.limestone).mesh.visible = false;
  }
  D(-30, 30, 30, 34, -54, -42, M.limestone, { tile: 16 });
  sign(T.sign('FIRST ROBLOXIA BANK', null, '#3a3020', '#d8ccb2', 1024, 128), 44, 3.2, [0, 32, -54.05], Math.PI);
  const ped = new THREE.Shape(); ped.moveTo(-31, 0); ped.lineTo(31, 0); ped.lineTo(0, 9); ped.closePath();
  const pedM = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 12, bevelEnabled: false }), M.limestone); pedM.position.set(0, 34, -54); pedM.castShadow = true; deco.add(pedM);
  const uvp = pedM.geometry.attributes.uv; for (let i = 0; i < uvp.count; i++) uvp.setXY(i, uvp.getX(i) / 16, uvp.getY(i) / 16);
  D(-7.6, -7, FL, 16.6, -42.4, -41.9, M.brass); D(7, 7.6, FL, 16.6, -42.4, -41.9, M.brass); D(-7.6, 7.6, 16, 16.6, -42.4, -41.9, M.brass);
  // the front doors: glass, swung open
  for (const sx of [-1, 1]) { const dm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 13, 6), M.glass); dm.position.set(sx * 7 + sx * 0.2, FL + 6.5, -37); dm.renderOrder = 2; deco.add(dm); D(sx * 7 + sx * 0.05, sx * 7 + sx * 0.35, FL, FL + 13, -40, -34, M.brass, { geo: new THREE.BoxGeometry(0.3, 0.4, 6) }).position.y = FL + 13; }
  // tall windows on the front
  for (const x of [-42, -34, 34, 42]) { D(x - 3, x + 3, 6, 26, -42.2, -42, M.darkGlass, { tile: 6 }); D(x - 3.4, x + 3.4, 5.4, 6, -42.6, -42, M.limestone); }
  for (const z of [-30, -10, 10, 30, 46]) for (const sx of [-1, 1]) { D(sx * 52 - 0.1, sx * 52 + 0.1, 8, 24, z - 3, z + 3, M.darkGlass, { tile: 6 }); }
  // ATMs on the east wall
  for (const z of [-28, -20]) { B(52, 53.5, 0.5, 8.5, z - 2, z + 2, M.darkSteel, { metal: true }); const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), M.screens[4]); s.position.set(53.55, 6, z); s.rotation.y = Math.PI / 2; deco.add(s); }
  sign(T.sign('ATM', '24 HOURS', '#ffffff', '#1a4a9a', 256, 128), 3, 1.5, [52.15, 11, -24], Math.PI / 2);
  // the loading dock steps at the back door
  B(33, 41, 0, 1.5, 58, 61, M.concrete); B(33, 41, 0, FL, 58, 59.5, M.concrete); B(33, 41, 0, 0.75, 61, 62.5, M.concrete);
  D(34, 40, 13.5, 14, 58, 61, M.darkSteel); // canopy

  // --- the block, the alley and the streets right around the bank -----------------------------------------------------
  B(-70, 70, 0, 0.5, -68, 58, M.sidewalk, { tile: 8, shadow: false, name: 'Sidewalk' });
  // alley clutter: dumpsters, pallets, a fire escape on the building behind
  for (const [x, z, c] of [[-30, 74, 0x2a5a2a], [-10, 74.5, 0x2a4a7a], [58, 74, 0x2a5a2a]]) { B(x - 4, x + 4, 0, 5, z - 2.6, z + 2.6, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3 }), { metal: true }); D(x - 4.2, x + 4.2, 5, 5.4, z - 2.8, z + 2.8, M.black); }
  for (const [x, z] of [[-50, 61], [10, 61.5]]) { D(x - 2, x + 2, 0, 0.6, z - 1.5, z + 1.5, M.wood); D(x - 2, x + 2, 0.6, 1.2, z - 1.5, z + 1.5, M.wood); }
  const parked = [];
  // parked cars along Main Street (good cover)
  for (const [x, paint] of [[-48, 0x2a4a7a], [-30, 0xd8d8d0], [34, 0x1a1a1a], [52, 0x8a2a24]]) {
    const car = buildSedan({ paint }); car.position.set(x, 0, -73.5); car.rotation.y = Math.PI / 2; world.scene.add(car);
    const p = solid([16, 5, 7], [x, 2.8, -73.5], M.black, { keep: true, metal: true, name: 'Car' }); p.mesh.visible = false;
    parked.push(car);
  }
  // street lamps, trees, hydrants, a bus stop, newspaper boxes
  const lamp = (x, z, ry) => {
    cyl(0.3, 22, [x, 11.5, z], M.darkSteel, 8);
    const arm = box([0.3, 0.3, 6], [x, 22, z - 2.8], M.darkSteel, { ry }); arm.position.set(x - Math.sin(ry) * 2.8, 22, z - Math.cos(ry) * 2.8);
    const head = box([1.6, 0.6, 2.4], [x - Math.sin(ry) * 5.5, 21.7, z - Math.cos(ry) * 5.5], M.darkSteel, { ry }); void head;
    box([1.2, 0.1, 2.0], [x - Math.sin(ry) * 5.5, 21.35, z - Math.cos(ry) * 5.5], M.lamp, { ry, shadow: false });
    solid([0.8, 22, 0.8], [x, 11.5, z], M.darkSteel).mesh.visible = false;
  };
  for (const x of [-60, -20, 20, 60]) lamp(x, -67, 0);
  for (const z of [-40, 0, 40]) { lamp(-67, z, Math.PI / 2); lamp(67, z, -Math.PI / 2); }
  const tree = (x, z) => {
    D(x - 2, x + 2, 0.5, 0.6, z - 2, z + 2, M.darkSteel, { shadow: false });
    cyl(0.4, 9, [x, 5, z], M.bark, 8);
    for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + Math.random(), 0), M.leaf); l.position.set(x + (Math.random() - 0.5) * 3, 10 + Math.random() * 3, z + (Math.random() - 0.5) * 3); l.castShadow = true; deco.add(l); }
    solid([0.8, 9, 0.8], [x, 5, z], M.bark).mesh.visible = false;
  };
  for (const x of [-62, -40, 40, 62]) tree(x, -62);
  for (const [x, z] of [[-12, -65], [64, -30]]) { cyl(0.6, 2.6, [x, 1.8, z], M.red, 10); cyl(0.75, 0.4, [x, 3.2, z], M.red, 10); }
  const busStop = new THREE.Group(); busStop.position.set(-38, 0.5, -62.5); deco.add(busStop);
  box([10, 0.3, 4], [0, 8.5, 0], M.darkSteel, { parent: busStop }); for (const x of [-4.7, 4.7]) box([0.3, 8.5, 0.3], [x, 4.25, 1.5], M.darkSteel, { parent: busStop });
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 7), new THREE.MeshStandardMaterial({ map: T.ad('BLOXY COLA', 'Taste the Bricks', '#c01818', '#600808'), emissive: 0xffffff, emissiveMap: T.ad('BLOXY COLA', 'Taste the Bricks', '#c01818', '#600808'), emissiveIntensity: 0.3 })); ad.position.set(5, 4.2, 0); ad.rotation.y = -Math.PI / 2; busStop.add(ad);
  box([8, 0.4, 1.4], [0, 2.2, 1.0], M.wood, { parent: busStop });
  for (const [x, c] of [[8, 0x1a4a9a], [10.5, 0xc01818]]) B(x - 0.9, x + 0.9, 0.5, 4.5, -65.5, -64, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3 }));
  // road blocks at the ends of the play area (invisible walls behind them)
  const barrier = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; deco.add(g);
    for (const off of [-12, 0, 12]) { box([10, 1, 0.5], [off, 3.5, 0], M.hazard, { parent: g, tile: 2 }); for (const s of [-4.5, 4.5]) box([0.4, 3.8, 0.4], [off + s, 1.9, 0], M.white, { parent: g }); }
  };
  barrier(-150, -86, Math.PI / 2); barrier(150, -86, Math.PI / 2); barrier(88, -160, 0); barrier(-88, -160, 0); barrier(88, 160, 0); barrier(-88, 160, 0);
  for (const [x, z, sx, sz] of [[-152, -86, 2, 60], [152, -86, 2, 60], [88, -162, 60, 2], [-88, -162, 60, 2], [88, 162, 60, 2], [-88, 162, 60, 2]]) world.add({ size: [sx, 40, sz], position: [x, 20, z], transparency: 1, name: 'Boundary' });

  // walls keep their physics bodies; only drawing is merged
  for (const p of solids) deco.attach(p.mesh);
  mergeStatic(deco);
  void modelMats;

  // --- navigation graph -------------------------------------------------------------------------------------------------
  const nodes = [];
  const id = {};
  const N = (name, x, z, extra = {}) => { id[name] = nodes.length; nodes.push({ name, x, z, n: [], ...extra }); };
  const L = (a, b, door = null) => { const A = id[a], Bn = id[b]; nodes[A].n.push({ to: Bn, door }); nodes[Bn].n.push({ to: A, door }); };
  // outside
  N('main_w', -55, -86); N('main_c', 0, -86); N('main_e', 55, -86); N('main_wx', -120, -86); N('main_ex', 120, -86);
  N('walk_w', -40, -62); N('walk_c', 0, -61); N('walk_e', 40, -62); N('portico', 0, -47); N('door', 0, -40);
  N('ave_e', 88, -86); N('ave_e_s', 88, 0); N('ave_w', -88, -86); N('ave_w_s', -88, 0);
  N('alley_ex', 88, 68); N('alley_e', 58, 68); N('dock', 37, 64); N('alley_c', 0, 68); N('alley_w', -58, 68); N('alley_wx', -88, 68);
  // lobby
  N('l_c', 0, -34); N('l_w', -21, -32); N('l_e', 21, -32); N('l_sw', -21, -18); N('l_s', 0, -19); N('l_se', 20, -18);
  N('lounge', 38, -27); N('lounge_s', 38, -17); N('gate_l', 26, -16.5); N('gate_t', 26, -8);
  N('off_out', -25, -30.5); N('off_in', -34, -30.5); N('office', -40, -27);
  // behind the counter
  N('t_e', 18, -6.5); N('t_c', 0, -6.5); N('t_w', -20, -6.5); N('sec_out', -25, -7.5); N('sec_in', -34, -7.5); N('security', -40, -12);
  N('kc_t', 11, -5); N('kc_c', 11, 4);
  // staff corridor and beyond
  N('c_w', -40, 5); N('c_bw', -27, 5); N('c_c', 0, 5); N('c_ce', 27, 5); N('c_e', 42, 5);
  N('gate_c', 0, 8); N('ante', 0, 16); N('ante_n', 0, 22); N('vault_in', 0, 35); N('vault', 0, 44);
  N('break_d', -27, 15); N('break', -34, 30); N('cash_d', 27, 15); N('cash', 32, 30); N('back_in', 37, 51); N('back_out', 37, 60.5);
  for (const [a, b] of [['main_wx', 'ave_w'], ['ave_w', 'main_w'], ['main_w', 'main_c'], ['main_c', 'main_e'], ['main_e', 'ave_e'], ['ave_e', 'main_ex'],
    ['main_w', 'walk_w'], ['main_c', 'walk_c'], ['main_e', 'walk_e'], ['walk_w', 'walk_c'], ['walk_c', 'walk_e'], ['walk_c', 'portico'], ['portico', 'door'], ['door', 'l_c'],
    ['ave_e', 'ave_e_s'], ['ave_e_s', 'alley_ex'], ['ave_w', 'ave_w_s'], ['ave_w_s', 'alley_wx'], ['alley_ex', 'alley_e'], ['alley_e', 'dock'], ['dock', 'alley_c'], ['alley_c', 'alley_w'], ['alley_w', 'alley_wx'],
    ['l_c', 'l_w'], ['l_c', 'l_e'], ['l_w', 'l_sw'], ['l_e', 'l_se'], ['l_sw', 'l_s'], ['l_s', 'l_se'], ['l_c', 'l_s'], ['l_e', 'lounge'], ['lounge', 'lounge_s'], ['lounge_s', 'l_se'], ['l_se', 'gate_l'], ['gate_l', 'gate_t'],
    ['l_w', 'off_out'], ['l_sw', 'off_out'], ['off_out', 'off_in'], ['off_in', 'office'],
    ['gate_t', 't_e'], ['t_e', 't_c'], ['t_c', 't_w'], ['t_w', 'sec_out'], ['sec_out', 'sec_in'], ['sec_in', 'security'], ['t_e', 'kc_t'], ['t_c', 'kc_t'],
    ['c_w', 'c_bw'], ['c_bw', 'c_c'], ['c_c', 'kc_c'], ['kc_c', 'c_ce'], ['c_ce', 'c_e'], ['c_c', 'gate_c'], ['ante', 'ante_n'], ['vault_in', 'vault'],
    ['c_bw', 'break_d'], ['break_d', 'break'], ['c_ce', 'cash_d'], ['cash_d', 'cash'], ['cash', 'back_in'], ['back_out', 'dock']]) L(a, b);
  L('kc_t', 'kc_c', 'keycard'); L('gate_c', 'ante', 'gate'); L('ante_n', 'vault_in', 'vault'); L('back_in', 'back_out', 'back');

  return {
    deco, glass, nodes, id, cams, medkits, rackLeds, readerLed, keycard, parked, rects,
    doors: { keycard: keyDoor, gate: gateBars, vault: vaultDoor, back: backDoor },
    vaultWheel: wheelG,
    loot,
    zones: [
      { name: 'teller', x0: -28, x1: 30, z0: -14, z1: -2 },
      { name: 'office', x0: -50, x1: -28.5, z0: -40, z1: -24 },
      { name: 'security', x0: -50, x1: -28.5, z0: -22, z1: -2 },
      { name: 'staff', x0: -50, x1: 50, z0: -2, z1: 56 },
    ],
    spots: {
      customers: [[-7, -21, 0], [-7, -24.5, 0], [-7, -28, 0], [-21, -36.5, Math.PI], [21, -36.5, Math.PI], [36.5, -32, -Math.PI / 2], [12, -36, 0.4], [-2, -31, 2.5]],
      tellers: tellers.map(([x, z]) => [x, z, 0]),
      manager: [-40, -30.5, 0],
      loanOfficer: [43.5, -22, Math.PI / 2],
      guards: [[9, -37, 2.6], [26, -19, -0.4], [-40, -14, 0]],
    },
    interact: {
      keycard: new THREE.Vector3(-39, FL + 4, -33.5),
      alarm: new THREE.Vector3(-32, FL + 4, -16),
      reader: new THREE.Vector3(15.8, FL + 4, -3),
      term: new THREE.Vector3(8.5, FL + 4, 9),
      vault: new THREE.Vector3(0, FL + 4, 26.5),
      back: new THREE.Vector3(37, FL + 4, 54.8),
    },
    spawn: { x: 0, z: -78, yaw: 0 },
    thumbnail: { cam: [52, 18, -98], look: [0, 16, -46] },
  };
}
