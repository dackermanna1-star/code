import * as THREE from 'three';
import { Builder, Geo } from './Builder';
import { MaterialLib } from './Materials';
import { COUNTER, ROOM, SEATS, Seat, TABLE_TOP_Y } from './Layout';
import { Customization } from './Structure';
import { canvasTexture, FONT_DISPLAY, FONT_BODY, roundRect } from '../render/CanvasTex';
import { Rng } from '../core/math';

export interface DiningRefs {
  pendantLights: THREE.Vector3[];
  neon: { mesh: THREE.Mesh; color: THREE.Color; pos: THREE.Vector3 }[];
  boothSeats: THREE.Mesh[];
  chairSeats: THREE.Mesh[];
  tableTops: THREE.Mesh[];
  sodaGlow: THREE.Vector3;
  posters: THREE.Mesh[];
}

const rng = new Rng('dining');

function condimentCaddy(b: Builder, mats: MaterialLib, x: number, y: number, z: number, ry = 0) {
  const g = b.group(x, y, z, ry);
  const gb = b.at(g);
  // napkin dispenser
  gb.rbox(0.11, 0.13, 0.08, 0.012, mats.chrome, 0, 0.065, 0);
  gb.box(0.07, 0.07, 0.002, mats.std(0xfbf8f0, 0.9), 0, 0.075, 0.041, { cast: false });
  // ketchup + mustard bottles
  const bottle = (color: number, capColor: number, dx: number) => {
    gb.mesh(Geo.lathe('condBottle', [[0, 0], [0.028, 0], [0.03, 0.01], [0.03, 0.12], [0.022, 0.14], [0.012, 0.15], [0, 0.15]], 16), mats.phys(`bottle${color}`, { color, roughness: 0.25, clearcoat: 0.7 }), dx, 0, 0);
    gb.cyl(0.008, 0.012, 0.03, mats.std(capColor, 0.4), dx, 0.165, 0, { seg: 10 });
  };
  bottle(0xd8261c, 0xd8261c, 0.1);
  bottle(0xf2c21b, 0xf2c21b, -0.1);
  // salt & pepper
  gb.cyl(0.018, 0.018, 0.07, mats.phys('shaker', { color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.5 }), 0.03, 0.035, 0.08, { seg: 12, cast: false });
  gb.cyl(0.019, 0.019, 0.02, mats.chrome, 0.03, 0.08, 0.08, { seg: 12 });
  gb.cyl(0.018, 0.018, 0.07, mats.std(0x2a2522, 0.5), -0.03, 0.035, 0.08, { seg: 12 });
  gb.cyl(0.019, 0.019, 0.02, mats.chrome, -0.03, 0.08, 0.08, { seg: 12 });
}

export function buildDining(root: THREE.Object3D, mats: MaterialLib, custom: Customization): DiningRefs {
  const b = new Builder(root);
  const refs: DiningRefs = { pendantLights: [], neon: [], boothSeats: [], chairSeats: [], tableTops: [], sodaGlow: new THREE.Vector3(), posters: [] };
  SEATS.length = 0;
  const vinylSeat = mats.vinyl(custom.boothColor, 5);
  vinylSeat.name = 'boothVinyl';
  const tableTop = mats.laminate(custom.counterColor);
  const chromeLeg = mats.chrome;

  const addSeat = (px: number, pz: number, face: number, tx: number, tz: number) => {
    const s: Seat = {
      pos: new THREE.Vector3(px, 0, pz),
      face,
      table: new THREE.Vector3(tx, TABLE_TOP_Y, tz),
      approach: new THREE.Vector3(px + Math.sin(face + Math.PI) * 0.0, 0, pz),
      occupied: false,
    };
    SEATS.push(s);
    return s;
  };

  // ------------------------------------------------------------ table helper
  const table = (x: number, z: number, w: number, d: number) => {
    const top = b.tbox(w, 0.035, d, 0.5, tableTop, x, TABLE_TOP_Y - 0.0175, z);
    refs.tableTops.push(top);
    // chrome edge band
    b.box(w + 0.01, 0.03, 0.012, chromeLeg, x, TABLE_TOP_Y - 0.02, z + d / 2 + 0.004, { cast: false });
    b.box(w + 0.01, 0.03, 0.012, chromeLeg, x, TABLE_TOP_Y - 0.02, z - d / 2 - 0.004, { cast: false });
    b.box(0.012, 0.03, d + 0.01, chromeLeg, x + w / 2 + 0.004, TABLE_TOP_Y - 0.02, z, { cast: false });
    b.box(0.012, 0.03, d + 0.01, chromeLeg, x - w / 2 - 0.004, TABLE_TOP_Y - 0.02, z, { cast: false });
    // pedestal
    b.cyl(0.04, 0.04, TABLE_TOP_Y - 0.05, chromeLeg, x, (TABLE_TOP_Y - 0.05) / 2 + 0.02, z, { seg: 16 });
    b.cyl(0.24, 0.26, 0.03, chromeLeg, x, 0.015, z, { seg: 28 });
    condimentCaddy(b, mats, x + w * 0.25, TABLE_TOP_Y, z - d * 0.2, rng.range(-0.3, 0.3));
  };

  const chair = (x: number, z: number, face: number) => {
    const g = b.group(x, 0, z, face);
    const gb = b.at(g);
    const seat = gb.mesh(Geo.cyl(0.21, 0.2, 0.08, 24), vinylSeat, 0, 0.47, 0);
    refs.chairSeats.push(seat);
    gb.mesh(Geo.torus(0.205, 0.012, 6, 28), chromeLeg, 0, 0.47, 0, { rx: Math.PI / 2 });
    gb.cyl(0.03, 0.03, 0.42, chromeLeg, 0, 0.22, 0, { seg: 12 });
    gb.cyl(0.2, 0.22, 0.025, chromeLeg, 0, 0.012, 0, { seg: 24 });
    // backrest
    gb.rbox(0.36, 0.26, 0.06, 0.03, vinylSeat, 0, 0.8, -0.2, { rx: -0.08 });
    gb.cyl(0.012, 0.012, 0.36, chromeLeg, -0.15, 0.62, -0.19, { seg: 8, rx: -0.08 });
    gb.cyl(0.012, 0.012, 0.36, chromeLeg, 0.15, 0.62, -0.19, { seg: 8, rx: -0.08 });
  };

  // ------------------------------------------------------------ 4-tops
  for (const [tx, tz] of [[-3.3, 2.25], [-3.3, 4.55]] as const) {
    table(tx, tz, 0.9, 0.9);
    const dirs: [number, number, number][] = [
      [0, -0.62, 0], // chair south of table facing +z
      [0, 0.62, Math.PI],
      [-0.62, 0, Math.PI / 2],
      [0.62, 0, -Math.PI / 2],
    ];
    for (const [dx, dz, f] of dirs) {
      chair(tx + dx, tz + dz, f);
      addSeat(tx + dx * 0.95, tz + dz * 0.95, f, tx + dx * 0.35, tz + dz * 0.35);
    }
  }
  // ------------------------------------------------------------ 2-tops
  for (const [tx, tz] of [[3.2, 1.5], [3.2, 3.85]] as const) {
    table(tx, tz, 0.7, 0.7);
    chair(tx - 0.55, tz, Math.PI / 2);
    chair(tx + 0.55, tz, -Math.PI / 2);
    addSeat(tx - 0.52, tz, Math.PI / 2, tx - 0.18, tz);
    addSeat(tx + 0.52, tz, -Math.PI / 2, tx + 0.18, tz);
  }

  // ------------------------------------------------------------ booths along the right wall
  const boothZ = [1.2, 2.95, 4.7];
  for (const bz of boothZ) {
    const tx = ROOM.maxX - 0.62;
    table(tx, bz, 1.0, 0.62);
    for (const side of [-1, 1]) {
      const sz = bz + side * 0.62;
      const g = b.group(tx - 0.05, 0, sz, side > 0 ? Math.PI : 0);
      const gb = b.at(g);
      // seat cushion
      const cushion = gb.rbox(1.1, 0.14, 0.46, 0.05, vinylSeat, 0, 0.44, 0.02);
      refs.boothSeats.push(cushion);
      // back
      gb.rbox(1.1, 0.62, 0.14, 0.05, vinylSeat, 0, 0.84, -0.24, { rx: -0.06 });
      // base
      gb.box(1.1, 0.37, 0.5, mats.std(0x3b2418, 0.55), 0, 0.185, 0.0);
      gb.box(1.1, 0.03, 0.02, chromeLeg, 0, 0.36, 0.25, { cast: false });
      gb.box(1.12, 0.04, 0.2, chromeLeg, 0, 1.16, -0.25);
      addSeat(tx - 0.05 + (side > 0 ? 0.0 : 0.0), sz + (side > 0 ? -0.02 : 0.02), side > 0 ? Math.PI : 0, tx - 0.05, bz + side * 0.12);
    }
    // little jukebox selector on the wall (classic diner)
    b.rbox(0.18, 0.2, 0.08, 0.02, chromeLeg, ROOM.maxX - 0.05, 0.92, bz);
    b.box(0.12, 0.08, 0.01, mats.emissive(0xffc36b, 0.8, 'juke'), ROOM.maxX - 0.09, 0.95, bz, { ry: -Math.PI / 2, cast: false });
  }
  // seat positions for booths should stand at the bench; tweak approach vectors
  for (const s of SEATS) s.approach.copy(s.pos);

  // ------------------------------------------------------------ waiting bench (left wall)
  {
    const bx = ROOM.minX + 0.3;
    const z0 = 0.35;
    const z1 = 4.25;
    const len = z1 - z0;
    const cz = (z0 + z1) / 2;
    b.rbox(0.46, 0.12, len, 0.04, vinylSeat, bx + 0.02, 0.43, cz);
    b.rbox(0.12, 0.5, len, 0.04, vinylSeat, bx - 0.19, 0.78, cz, { rz: 0.08 });
    b.box(0.44, 0.37, len, mats.std(0x3b2418, 0.55), bx + 0.02, 0.185, cz);
    b.box(0.02, 0.03, len, chromeLeg, bx + 0.25, 0.36, cz, { cast: false });
    // potted plant at the end
    plant(b, mats, ROOM.minX + 0.45, 4.85, 1.0);
    plant(b, mats, ROOM.minX + 0.45, -0.15, 0.8);
  }

  // ------------------------------------------------------------ pendant lamps
  const lampShade = mats.phys('lampShade', { color: custom.boothColor, roughness: 0.25, metalness: 0.3, clearcoat: 0.8, side: THREE.DoubleSide });
  const bulb = mats.emissive(0xffd79a, 6, 'bulb');
  const pendant = (x: number, z: number, dropY: number) => {
    b.cyl(0.004, 0.004, ROOM.height - dropY, mats.blackPlastic, x, (ROOM.height + dropY) / 2, z, { seg: 6, cast: false });
    b.mesh(Geo.lathe('shade', [[0.02, 0.2], [0.05, 0.19], [0.12, 0.1], [0.2, 0.0], [0.205, -0.01]], 28), lampShade, x, dropY - 0.2, z);
    b.sphere(0.055, bulb, x, dropY - 0.16, z, { cast: false });
    refs.pendantLights.push(new THREE.Vector3(x, dropY - 0.25, z));
  };
  pendant(-3.3, 2.25, 2.35);
  pendant(-3.3, 4.55, 2.35);
  pendant(3.2, 1.5, 2.3);
  pendant(3.2, 3.85, 2.3);
  for (const bz of boothZ) pendant(ROOM.maxX - 0.62, bz, 2.25);
  // over the counter
  for (const cx of [-4.2, -1.0, 2.2]) pendant(cx, COUNTER.z + 0.45, 2.2);

  // ------------------------------------------------------------ neon signs
  const neonSign = (text: string, color: string, w: number, h: number, x: number, y: number, z: number, ry: number, size = 120) => {
    const tex = canvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${size}px ${FONT_DISPLAY}`;
      ctx.shadowColor = color;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = color;
      ctx.lineWidth = 12;
      ctx.strokeText(text, cw / 2, ch / 2);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeText(text, cw / 2, ch / 2);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
    const mesh = b.mesh(Geo.plane(w, h), m, x, y, z, { ry, cast: false, receive: false, dynamic: true });
    // backing board
    b.rbox(w * 1.02, h * 1.05, 0.02, 0.02, mats.std(0x151515, 0.5), x - Math.sin(ry) * 0.02, y, z - Math.cos(ry) * 0.02, { ry });
    refs.neon.push({ mesh, color: new THREE.Color(color), pos: new THREE.Vector3(x, y, z) });
    return mesh;
  };
  neonSign('Order Here', '#ff4f7b', 1.1, 0.3, -1.0, 2.3, COUNTER.z + 0.31, 0, 150);
  neonSign('Pick Up', '#4fe3ff', 0.9, 0.3, 2.2, 2.3, COUNTER.z + 0.31, 0, 150);
  neonSign('Open Late', '#ffb13b', 1.2, 0.36, ROOM.minX + 0.03, 2.35, 2.3, Math.PI / 2, 150);

  // ------------------------------------------------------------ menu boards on the bulkhead (dining side)
  const menu = canvasTexture(2048, 320, (ctx, w, h) => {
    ctx.fillStyle = '#1c1512';
    ctx.fillRect(0, 0, w, h);
    const cols = [
      { t: 'CLASSIC', p: '$6.49', d: 'Beef • Cheese • Lettuce' },
      { t: 'DOUBLE STACK', p: '$8.99', d: 'Two patties, all the fixins' },
      { t: 'BBQ BLAZE', p: '$9.49', d: 'Bacon • Onion rings • BBQ' },
      { t: 'GARDEN', p: '$7.49', d: 'Veggie patty • Avocado' },
      { t: 'CLUCKER', p: '$7.99', d: 'Crispy chicken • Mayo' },
    ];
    const cw = w / cols.length;
    cols.forEach((c, i) => {
      const x = i * cw;
      ctx.fillStyle = i % 2 ? '#2a1f1a' : '#241a16';
      ctx.fillRect(x + 6, 6, cw - 12, h - 12);
      // burger doodle
      const bx = x + cw / 2;
      const by = 108;
      ctx.fillStyle = '#e9a23b';
      ctx.beginPath();
      ctx.ellipse(bx, by, 70, 42, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#6ab04c';
      ctx.fillRect(bx - 78, by + 2, 156, 12);
      ctx.fillStyle = '#f5c518';
      ctx.fillRect(bx - 72, by + 12, 144, 8);
      ctx.fillStyle = '#6b3a1e';
      roundRect(ctx, bx - 74, by + 20, 148, 22, 10);
      ctx.fill();
      ctx.fillStyle = '#e39a36';
      roundRect(ctx, bx - 72, by + 44, 144, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#fff4dd';
      ctx.font = `700 44px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(c.t, bx, 222);
      ctx.fillStyle = '#ffcf5a';
      ctx.font = `700 40px ${FONT_DISPLAY}`;
      ctx.fillText(c.p, bx, 268);
      ctx.fillStyle = '#d9c7b0';
      ctx.font = `600 22px ${FONT_BODY}`;
      ctx.fillText(c.d, bx, 300);
    });
  });
  b.mesh(Geo.plane(9.6, 0.62), new THREE.MeshStandardMaterial({ map: menu, emissive: 0xffffff, emissiveMap: menu, emissiveIntensity: 0.55, roughness: 0.5 }), -1.2, ROOM.height - 0.4, COUNTER.z + 0.305, {
    cast: false,
  });

  // ------------------------------------------------------------ soda fountain against the partition
  {
    const sx = 5.65;
    const sz = COUNTER.z + 0.45;
    b.box(1.6, 0.92, 0.6, mats.std(0x3b2418, 0.5), sx, 0.46, sz);
    b.tbox(1.64, 0.04, 0.64, 1.0, tableTop, sx, 0.94, sz);
    b.rbox(1.2, 0.62, 0.42, 0.04, mats.chrome, sx, 1.27, sz - 0.08);
    const panel = canvasTexture(512, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#ff5f6d');
      g.addColorStop(0.5, '#ffc371');
      g.addColorStop(1, '#4fd1c5');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `700 64px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIZZ BAR', w / 2, h / 2 - 20);
      ctx.font = `600 30px ${FONT_BODY}`;
      ctx.fillText('free refills!', w / 2, h / 2 + 50);
    });
    b.mesh(Geo.plane(1.1, 0.4), new THREE.MeshStandardMaterial({ map: panel, emissive: 0xffffff, emissiveMap: panel, emissiveIntensity: 0.9 }), sx, 1.4, sz + 0.135, { cast: false });
    for (let i = 0; i < 5; i++) {
      const nx = sx - 0.4 + i * 0.2;
      b.box(0.06, 0.08, 0.06, mats.blackPlastic, nx, 1.02, sz + 0.1);
      b.cyl(0.008, 0.008, 0.05, mats.chrome, nx, 0.97, sz + 0.1, { seg: 8 });
    }
    b.box(1.2, 0.02, 0.2, mats.std(0x222222, 0.3, 0.8), sx, 0.965, sz + 0.12, { cast: false });
    // cup stacks
    for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) b.cyl(0.045, 0.035, 0.1, mats.std([0xd8261c, 0xffffff, 0x2bb3a5][i], 0.5), sx + 0.62, 0.99 + k * 0.025, sz - 0.18 + i * 0.12, { seg: 16, cast: false });
    refs.sodaGlow.set(sx, 1.4, sz + 0.4);
  }

  // ------------------------------------------------------------ posters on the brick wall
  const posters: [string, string, string][] = [
    ['GRILL', 'MASTERS', '#e84a3a'],
    ['FRESH', 'DAILY', '#2bb3a5'],
    ['EST.', '1958', '#f5b83d'],
  ];
  posters.forEach(([a, c, col], i) => {
    const tex = canvasTexture(256, 360, (ctx, w, h) => {
      ctx.fillStyle = '#f6ecd6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = col;
      ctx.fillRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = '#f6ecd6';
      ctx.beginPath();
      ctx.arc(w / 2, 140, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.font = `700 60px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['🍔', '🍅', '★'][i], w / 2, 140);
      ctx.fillStyle = '#fff8ea';
      ctx.font = `700 46px ${FONT_DISPLAY}`;
      ctx.fillText(a, w / 2, 262);
      ctx.font = `700 38px ${FONT_DISPLAY}`;
      ctx.fillText(c, w / 2, 312);
    });
    const pz = 1.3 + i * 1.25;
    const poster = b.mesh(Geo.plane(0.52, 0.73), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), ROOM.minX + 0.04, 1.9, pz, { ry: Math.PI / 2, cast: false });
    refs.posters.push(poster);
    b.box(0.03, 0.77, 0.56, mats.std(0x2a1d18, 0.4), ROOM.minX + 0.02, 1.9, pz);
  });

  // ------------------------------------------------------------ ceiling fans anchors handled in decor
  // ------------------------------------------------------------ trash receptacle near door
  {
    const tx = ROOM.maxX - 0.4;
    const tz = ROOM.maxZ - 0.45;
    b.rbox(0.5, 1.0, 0.45, 0.04, mats.std(0x3b2418, 0.5), tx, 0.5, tz);
    b.box(0.34, 0.14, 0.01, mats.std(0x111111, 0.6), tx - 0.26, 0.82, tz, { ry: Math.PI / 2, cast: false });
    b.rbox(0.52, 0.04, 0.47, 0.01, tableTop, tx, 1.02, tz);
    const thanks = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#3b2418';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd35a';
      ctx.font = `700 34px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('THANK YOU', w / 2, h / 2 + 2);
    });
    b.mesh(Geo.plane(0.34, 0.085), new THREE.MeshStandardMaterial({ map: thanks, roughness: 0.6 }), tx - 0.255, 0.62, tz, { ry: -Math.PI / 2, cast: false });
    // tray stack on top
    for (let i = 0; i < 5; i++) b.rbox(0.36, 0.015, 0.28, 0.01, mats.std(0xc4262e, 0.4), tx, 1.05 + i * 0.016, tz);
  }
  return refs;
}

export function plant(b: Builder, mats: MaterialLib, x: number, z: number, scale = 1) {
  const g = b.group(x, 0, z, rng.range(0, Math.PI * 2));
  g.scale.setScalar(scale);
  const gb = b.at(g);
  gb.mesh(Geo.lathe('pot', [[0, 0], [0.16, 0], [0.2, 0.36], [0.22, 0.38], [0.22, 0.42], [0.19, 0.42], [0.17, 0.38], [0, 0.38]], 24), mats.std(0xc8643c, 0.7), 0, 0, 0);
  gb.cyl(0.18, 0.18, 0.02, mats.std(0x3a2618, 1), 0, 0.39, 0, { seg: 20 });
  const leaf = mats.get('leaf', () => new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.55, side: THREE.DoubleSide }));
  const leafGeo = (() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.09, 0.2, 0, 0.42);
    shape.quadraticCurveTo(-0.09, 0.2, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 8);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setZ(i, -y * y * 0.8);
    }
    geo.computeVertexNormals();
    return geo;
  })();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const tilt = rng.range(0.25, 0.9);
    const m = gb.mesh(leafGeo, leaf, Math.sin(a) * 0.04, 0.4, Math.cos(a) * 0.04, { ry: a, rx: -tilt, sx: rng.range(0.8, 1.3), sy: rng.range(0.9, 1.5) });
    m.rotation.order = 'YXZ';
    m.rotation.set(-tilt, a, 0);
  }
}
