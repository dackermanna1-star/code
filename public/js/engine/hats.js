// Hats sold in the 2007-2008 catalog, rebuilt from primitive shapes.
// Each builder returns a THREE.Group positioned relative to the head centre
// (the head is 1.24 studs tall, so its top is at +TOP; the front faces -Z).
//
// These are recreations: the original hat meshes and textures are not
// included. Shapes and colours follow the archived Dec 2007 catalog
// thumbnails where those were seen, and the catalog descriptions otherwise
// (see docs/RESEARCH.md, "Catalog"). Hats not sold before 2009 (hair, Shaggy,
// faces, gear) are deliberately absent.
import * as THREE from 'three';
import { TeapotGeometry } from '../vendor/TeapotGeometry.js';
import { classicHead } from './headshape.js';

const TOP = 0.62;
const mat = (color, o = {}) => new THREE.MeshPhongMaterial({
  color, shininess: o.shininess ?? 25, specular: o.specular ?? 0x222222, side: o.side ?? THREE.FrontSide,
  transparent: o.opacity != null, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000, flatShading: !!o.flat,
});
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const dome = (r, seg = 24, part = 0.5) => new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1), 0, Math.PI * 2, 0, Math.PI * part);
const group = (...kids) => { const g = new THREE.Group(); if (kids.length) g.add(...kids); return g; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function canvasMat(w, h, draw, o = {}) {
  return new THREE.MeshPhongMaterial({ map: canvasTex(w, h, draw), shininess: o.shininess ?? 20, transparent: !!o.transparent, side: o.side ?? THREE.FrontSide, depthWrite: o.transparent ? false : true });
}
/** A flat decal (plane) facing -Z, for logos stuck on a hat. */
function decal(w, h, draw, size = [0.5, 0.5]) {
  const m = canvasMat(w, h, draw, { transparent: true });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), m);
  p.rotation.y = Math.PI;
  return p;
}
function drawR(x, cx, cy, s, fg = '#fff') {
  x.save();
  x.translate(cx, cy); x.rotate(-0.1);
  x.fillStyle = fg;
  x.font = `bold ${s}px Arial Black, Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('R', 0, s * 0.04);
  x.restore();
}

// --- shared shapes --------------------------------------------------------------
function baseballCap(color, logo) {
  const m = mat(color);
  const g = group();
  const crown = mesh(dome(0.68), m, 0, TOP - 0.36, 0);
  crown.scale.set(1, 0.95, 1);
  const brim = mesh(cyl(0.52, 0.52, 0.06, 24), m, 0, TOP - 0.3, -0.72);
  brim.scale.set(1, 1, 0.85); brim.rotation.x = 0.08;
  g.add(crown, brim, mesh(new THREE.SphereGeometry(0.07, 8, 6), m, 0, TOP + 0.3, 0));
  if (logo) {
    const d = decal(64, 64, logo, [0.42, 0.42]);
    d.position.set(0, TOP - 0.05, -0.6); d.rotation.x = 0.55;
    g.add(d);
  }
  return g;
}

function visor(color, trim, front) {
  const g = group();
  const band = mesh(new THREE.CylinderGeometry(0.665, 0.665, 0.24, 28, 1, true), canvasMat(256, 32, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    x.fillStyle = trim; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3);
    if (front) front(x, w, h);
  }, { side: THREE.DoubleSide }), 0, TOP - 0.2, 0);
  band.rotation.y = Math.PI / 2;
  const shade = new THREE.Shape();
  shade.absarc(0, 0, 0.67, Math.PI * 1.08, Math.PI * 1.92, false);
  shade.absarc(0, -0.05, 1.18, Math.PI * 1.92, Math.PI * 1.08, true);
  const brim = mesh(new THREE.ExtrudeGeometry(shade, { depth: 0.05, bevelEnabled: false, curveSegments: 16 }), mat(color, { side: THREE.DoubleSide }), 0, TOP - 0.28, 0);
  brim.rotation.x = Math.PI / 2 - 0.12;
  const edge = mesh(new THREE.TorusGeometry(1.18, 0.03, 6, 24, Math.PI * 0.84), mat(trim), 0, TOP - 0.28, -0.05);
  edge.rotation.x = Math.PI / 2; edge.rotation.z = Math.PI * 1.08;
  g.add(band, brim, edge);
  return g;
}

function topHat(band) {
  const black = mat(0x1b1b1b, { shininess: 40 });
  return group(
    mesh(cyl(0.98, 0.98, 0.06, 32), black, 0, TOP - 0.06, 0),
    mesh(cyl(0.62, 0.6, 1.3, 32), black, 0, TOP + 0.6, 0),
    mesh(cyl(0.625, 0.62, 0.24, 32), mat(band), 0, TOP + 0.1, 0),
  );
}

function book(cover, title, emblem) {
  const g = group();
  const coverTex = canvasMat(128, 160, (x, w, h) => {
    x.fillStyle = cover; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    emblem(x, w, h);
    x.fillStyle = '#f8f0b0'; x.font = 'bold 13px Arial'; x.textAlign = 'center';
    x.fillText(title, w / 2, 26);
  });
  const pages = canvasMat(64, 16, (x, w, h) => {
    x.fillStyle = '#e8e8e0'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#b8b8b0';
    for (let i = 2; i < h; i += 2) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  const side = mat(new THREE.Color(cover));
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const b = mesh(new THREE.BoxGeometry(1.5, 0.42, 1.9), [pages, side, coverTex, side, pages, pages], 0, TOP + 0.2, 0);
  b.rotation.y = 0.35;
  const spine = mesh(new THREE.BoxGeometry(0.08, 0.46, 1.94), side, -0.76, 0, 0);
  b.add(spine);
  g.add(b);
  return g;
}

function extraHead(scale, x, y, z) {
  const h = classicHead();
  h.scale.setScalar(scale);
  h.position.set(x, y, z);
  return h;
}

export const HATS = {
  RedBaseballCap: () => baseballCap(0xc4281c, (x, w, h) => drawR(x, w / 2, h / 2, 50, '#ffffff')),
  BlueBaseballCap: () => baseballCap(0x0d69ac, (x, w, h) => {
    // "with the Bricksmith logo": a small white brick (the logo's exact art is not documented)
    x.fillStyle = '#fff'; x.fillRect(12, 26, 40, 20);
    x.fillRect(17, 19, 10, 7); x.fillRect(37, 19, 10, 7);
  }),
  PurpleBandedTopHat: () => topHat(0x6b327c),

  VikingHelm() {
    const steel = mat(0xa3a2a5, { shininess: 80, specular: 0x888888 });
    const g = group(
      mesh(dome(0.7), steel, 0, TOP - 0.28, 0),
      mesh(cyl(0.71, 0.71, 0.14, 24), mat(0x7c5c46), 0, TOP - 0.24, 0),
    );
    for (const s of [-1, 1]) {
      const horn = mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 12, Math.PI * 0.5), mat(0xe8dcb4), s * 0.62, TOP - 0.05, 0);
      horn.rotation.y = s > 0 ? 0 : Math.PI;
      const tip = mesh(new THREE.ConeGeometry(0.11, 0.3, 8), horn.material, s * 1.04, TOP + 0.5, 0);
      g.add(horn, tip);
    }
    return g;
  },

  PoliceCap() {
    const navy = mat(0x1b2a50), black = mat(0x111111, { shininess: 80 });
    const g = group(mesh(cyl(0.66, 0.66, 0.2, 24), navy, 0, TOP - 0.12, 0));
    const top = mesh(cyl(0.82, 0.66, 0.28, 24), navy, 0, TOP + 0.12, 0); top.scale.set(1, 1, 1.05);
    const brim = mesh(cyl(0.48, 0.48, 0.05, 24), black, 0, TOP - 0.22, -0.6); brim.scale.set(1, 1, 0.7); brim.rotation.x = 0.25;
    const badge = mesh(new THREE.OctahedronGeometry(0.13), mat(0xd8b040, { shininess: 90, specular: 0x888844 }), 0, TOP + 0.06, -0.78);
    badge.scale.set(1, 1.2, 0.35);
    g.add(top, brim, badge);
    return g;
  },

  PirateCaptainsHat() {
    const black = mat(0x1b1b1b);
    const g = group(mesh(dome(0.68), black, 0, TOP - 0.28, 0));
    // a bicorne: two curved flaps meeting at the crown
    for (const s of [-1, 1]) {
      const flap = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 20, 1, true, -Math.PI / 2.4, Math.PI / 1.2), mat(0x1b1b1b, { side: THREE.DoubleSide }), 0, TOP + 0.12, s * 0.15);
      flap.rotation.y = s > 0 ? 0 : Math.PI;
      flap.scale.set(1.05, 1, 0.45);
      g.add(flap);
    }
    const skull = decal(64, 64, (x) => {
      x.fillStyle = '#f2f2f2'; x.beginPath(); x.arc(32, 24, 13, 0, 7); x.fill(); x.fillRect(25, 32, 14, 9);
      x.fillStyle = '#1b1b1b'; x.beginPath(); x.arc(27, 24, 4, 0, 7); x.arc(37, 24, 4, 0, 7); x.fill();
      x.strokeStyle = '#f2f2f2'; x.lineWidth = 5; x.lineCap = 'round';
      x.beginPath(); x.moveTo(12, 46); x.lineTo(52, 58); x.moveTo(52, 46); x.lineTo(12, 58); x.stroke();
    }, [0.5, 0.5]);
    skull.position.set(0, TOP + 0.15, -0.62);
    g.add(skull);
    return g;
  },

  Fedora() {
    const felt = mat(0x2a2a2a, { side: THREE.DoubleSide });
    const brim = mesh(cyl(1.08, 1.08, 0.04, 32), felt, 0, TOP - 0.02, 0);
    const crown = mesh(cyl(0.54, 0.66, 0.62, 24), felt, 0, TOP + 0.3, 0);
    crown.scale.set(1, 1, 1.12);
    const band = mesh(cyl(0.65, 0.67, 0.13, 24), mat(0x0e0e0e), 0, TOP + 0.08, 0);
    band.scale.set(1, 1, 1.12);
    const dent = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.92), mat(0x1c1c1c), 0, TOP + 0.6, 0);
    return group(brim, crown, band, dent);
  },

  BrownCowboyHat() {
    const brown = mat(0x7c5c46, { side: THREE.DoubleSide });
    const g = group();
    // brim curled up at the sides: a bent ring built from a lathe-like grid
    const geo = new THREE.RingGeometry(0.62, 1.25, 32, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      const curl = Math.pow(Math.abs(x) / 1.25, 2) * 0.38 * Math.max(0, (r - 0.62) / 0.63);
      pos.setZ(i, curl);
    }
    geo.computeVertexNormals();
    const brim = mesh(geo, brown, 0, TOP - 0.02, 0);
    brim.rotation.x = -Math.PI / 2;
    const crown = mesh(cyl(0.5, 0.64, 0.66, 24), brown, 0, TOP + 0.3, 0);
    crown.scale.set(0.95, 1, 1.15);
    const crease = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.95), mat(0x5e4434), 0, TOP + 0.6, 0);
    const band = mesh(cyl(0.6, 0.65, 0.1, 24), mat(0x3a2a1e), 0, TOP + 0.04, 0);
    band.scale.set(0.97, 1, 1.15);
    g.add(brim, crown, crease, band);
    return g;
  },

  StrawHat() {
    const straw = canvasMat(128, 128, (x, w, h) => {
      x.fillStyle = '#e2c27a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(140,100,40,.45)';
      for (let i = 0; i < h; i += 4) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i + 2); x.stroke(); }
    }, { side: THREE.DoubleSide });
    return group(
      mesh(cyl(1.3, 1.3, 0.05, 32), straw, 0, TOP - 0.04, 0),
      mesh(cyl(0.58, 0.66, 0.52, 24), straw, 0, TOP + 0.22, 0),
      mesh(cyl(0.665, 0.67, 0.13, 24), mat(0x3a2a1e), 0, TOP + 0.05, 0),
    );
  },

  TeapotHat() {
    const geo = new TeapotGeometry(0.62, 8, true, true, true, false, true);
    const pot = mesh(geo, mat(0xa3a2a5, { shininess: 80, specular: 0x777777 }), 0, TOP + 0.45, 0);
    pot.rotation.y = Math.PI / 2; // spout to the wearer's right
    return group(pot);
  },

  Bighead() {
    // a much larger classic head, with its own face, enclosing the real head
    const h = classicHead();
    h.scale.setScalar(1.65);
    h.position.set(0, 0.32, -0.02);
    return group(h);
  },

  WizardHat() {
    const purple = canvasMat(128, 128, (x, w, h) => {
      x.fillStyle = '#4b3a8c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f5d84a';
      for (const [px, py, r] of [[20, 30, 6], [70, 15, 4], [100, 60, 6], [40, 80, 5], [90, 105, 4], [15, 112, 4]]) {
        x.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); }
        x.fill();
      }
    }, { side: THREE.DoubleSide });
    const cone = mesh(new THREE.ConeGeometry(0.66, 1.9, 24, 1, true), purple, 0, TOP + 0.9, 0);
    return group(mesh(cyl(1.08, 1.08, 0.05, 32), purple, 0, TOP - 0.04, 0), cone);
  },

  Bucket() {
    const metal = mat(0x9ca3a8, { shininess: 70, specular: 0x777777, side: THREE.DoubleSide });
    const g = group(
      // upside-down: the open (wide) end over the head, the bottom on top
      mesh(cyl(0.62, 0.76, 1.15, 24, true), metal, 0, TOP + 0.18, 0),
      mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), metal, 0, TOP + 0.755, 0),
      mesh(new THREE.TorusGeometry(0.77, 0.035, 6, 24), mat(0x7a7f84), 0, TOP - 0.38, 0).rotateX(Math.PI / 2),
    );
    const handle = mesh(new THREE.TorusGeometry(0.78, 0.035, 6, 24, Math.PI), mat(0x555555), 0, TOP - 0.1, 0);
    handle.rotation.set(Math.PI, Math.PI / 2, 0);
    g.add(handle);
    return g;
  },

  TrafficCone() {
    const orange = mat(0xff6a1a), white = mat(0xf2f3f3, { shininess: 60 });
    return group(
      mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), orange, 0, TOP - 0.02, 0),
      mesh(cyl(0.1, 0.62, 2.0, 24), orange, 0, TOP + 1.0, 0),
      mesh(cyl(0.255, 0.315, 0.26, 24), white, 0, TOP + 1.42, 0),
    );
  },

  Headstack: () => group(extraHead(0.95, 0, TOP + 0.62, 0), extraHead(0.62, 0, TOP + 1.58, 0)),
  Headrow: () => group(extraHead(0.95, -1.9, 0.05, 0), extraHead(0.95, 1.9, 0.05, 0)),

  FirefighterHelmet() {
    const red = mat(0xe8160c, { shininess: 50 });
    const g = group(mesh(dome(0.72), red, 0, TOP - 0.3, 0));
    // the long rear brim of a fire helmet
    const brim = mesh(cyl(0.95, 0.95, 0.05, 28), red, 0, TOP - 0.3, 0.2);
    brim.scale.set(1, 1, 1.15); brim.rotation.x = -0.12;
    const ridge = mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), red, 0, TOP + 0.38, 0.05);
    const shield = decal(128, 128, (x, w, h) => {
      // white Maltese-cross shield holding an "R"
      x.fillStyle = '#fff';
      x.translate(w / 2, h / 2);
      for (let i = 0; i < 4; i++) {
        x.beginPath(); x.moveTo(-14, -16); x.lineTo(-26, -58); x.lineTo(26, -58); x.lineTo(14, -16); x.fill();
        x.rotate(Math.PI / 2);
      }
      x.beginPath(); x.arc(0, 0, 30, 0, 7); x.fill();
      x.fillStyle = '#e8160c'; x.beginPath(); x.arc(0, 0, 24, 0, 7); x.fill();
      drawR(x, 0, 0, 36, '#fff');
    }, [0.62, 0.62]);
    shield.position.set(0, TOP + 0.12, -0.7); shield.rotation.x = -0.25;
    g.add(brim, ridge, shield);
    return g;
  },

  AstronautHelmet() {
    const white = mat(0xf2f3f3, { shininess: 50 });
    const shell = mesh(new THREE.SphereGeometry(1.0, 28, 18), white, 0, 0.05, 0);
    const visorM = mesh(new THREE.SphereGeometry(1.01, 24, 12, Math.PI - 0.9, 1.8, Math.PI * 0.3, Math.PI * 0.32), mat(0x1c2433, { shininess: 120, specular: 0xaaaaaa }), 0, 0.05, 0);
    const collar = mesh(new THREE.TorusGeometry(0.72, 0.12, 8, 24), mat(0xa3a2a5), 0, -0.72, 0);
    collar.rotation.x = Math.PI / 2;
    return group(shell, visorM, collar);
  },

  BunnyEars() {
    const white = mat(0xf2f3f3), pink = mat(0xe8bac8);
    const g = group();
    const band = mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 24, Math.PI), white, 0, TOP - 0.2, 0);
    band.rotation.y = Math.PI / 2;
    g.add(band);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.2, 12, 10), white, s * 0.3, TOP + 0.75, 0);
      ear.scale.set(1, 4.6, 0.5); ear.rotation.z = -s * 0.12;
      const inner = mesh(new THREE.SphereGeometry(0.12, 10, 8), pink, s * 0.3, TOP + 0.72, -0.07);
      inner.scale.set(1, 6, 0.4); inner.rotation.z = -s * 0.12;
      g.add(ear, inner);
    }
    return g;
  },

  MushroomHat() {
    // "ONE ^": a 1-Up style mushroom cap (the archived thumbnail was blank, so the
    // colours here are a reconstruction).
    const cap = canvasMat(128, 64, (x, w, h) => {
      x.fillStyle = '#3c9a3c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f2f2f2';
      for (const [px, py, r] of [[16, 40, 10], [56, 30, 12], [96, 42, 10], [36, 8, 6], [80, 6, 7], [120, 20, 6]]) { x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
    });
    const top = mesh(dome(0.95, 28), cap, 0, TOP - 0.2, 0);
    top.scale.set(1, 0.85, 1);
    const rim = mesh(cyl(0.95, 0.95, 0.08, 28), mat(0xe8e0c8), 0, TOP - 0.2, 0);
    return group(top, rim);
  },

  Sapling() {
    const bark = mat(0xc09078, { shininess: 6 });
    const leaf = mat(0x3c9a3c, { flat: true });
    const g = group();
    const seg = (x0, y0, z0, x1, y1, z1, r0, r1) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const len = a.distanceTo(b);
      const m = mesh(cyl(r1, r0, len, 8), bark);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
      return b;
    };
    // flared, twisting trunk
    seg(0, TOP - 0.05, 0, 0.05, TOP + 0.35, 0.02, 0.42, 0.16);
    seg(0.05, TOP + 0.35, 0.02, -0.08, TOP + 0.95, 0.05, 0.16, 0.11);
    seg(-0.08, TOP + 0.95, 0.05, 0.04, TOP + 1.45, -0.02, 0.11, 0.08);
    const branches = [[-0.6, TOP + 1.55, 0.1], [0.55, TOP + 1.65, -0.1], [0.15, TOP + 1.95, 0.25]];
    for (const [x, y, z] of branches) {
      const end = seg(0.04, TOP + 1.4, -0.02, x, y, z, 0.07, 0.035);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), leaf, end.x + (i - 1) * 0.08, end.y + (i % 2) * 0.07, end.z + (i - 1) * 0.04));
    }
    return g;
  },

  Lampshade() {
    const checks = canvasMat(256, 128, (x, w, h) => {
      const n = 16, rows = 8;
      for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
        x.fillStyle = (i + j) % 2 ? '#f2f2f2' : '#d01c14';
        x.fillRect(i * w / n, j * h / rows, w / n + 1, h / rows + 1);
      }
    }, { side: THREE.DoubleSide });
    return group(mesh(cyl(0.48, 0.92, 1.55, 32, true), checks, 0, TOP + 0.38, 0));
  },

  MouseEars() {
    const black = mat(0x111111, { shininess: 40 });
    const g = group();
    for (const s of [-1, 1]) {
      const ear = mesh(cyl(0.38, 0.38, 0.1, 24), black, s * 0.62, TOP + 0.28, 0.05);
      ear.rotation.x = Math.PI / 2; ear.rotation.z = s * 0.25;
      g.add(ear);
    }
    return g;
  },

  Ribbons() {
    const magenta = mat(0xc048c0, { shininess: 40 });
    const g = group();
    for (const s of [-1, 1]) {
      const bow = group();
      for (const t of [-1, 1]) {
        const loop = mesh(new THREE.ConeGeometry(0.17, 0.32, 4), magenta, t * 0.15, 0, 0);
        loop.rotation.z = t * Math.PI / 2;
        loop.scale.set(1, 1, 0.35);
        bow.add(loop);
      }
      bow.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), magenta));
      bow.position.set(s * 0.58, TOP - 0.05, 0.1);
      bow.rotation.set(0.2, s * 0.5, s * 0.6);
      g.add(bow);
    }
    return g;
  },

  LittleFluffyCloud() {
    const cloud = mat(0xb4c8f4, { shininess: 4 });
    const g = group();
    for (const [x, y, z, r] of [[0, 0.1, 0, 0.55], [-0.6, 0, 0.05, 0.42], [0.62, -0.02, 0.05, 0.44], [-0.25, 0.32, -0.1, 0.42], [0.3, 0.3, 0.12, 0.45], [0, -0.05, -0.3, 0.42]]) {
      g.add(mesh(new THREE.SphereGeometry(r, 14, 10), cloud, x, TOP + 1.05 + y, z));
    }
    return g;
  },

  SatelliteDish() {
    const grey = mat(0xc7c8c9, { shininess: 50, side: THREE.DoubleSide });
    const dish = new THREE.Group();
    // an octagonal shallow bowl, apex at the origin, opening along -Y
    const bowl = mesh(new THREE.SphereGeometry(1.0, 8, 6, 0, Math.PI * 2, 0, 0.8), grey, 0, -1.0, 0);
    bowl.rotation.y = Math.PI / 8;
    dish.add(bowl);
    const logo = mesh(new THREE.CircleGeometry(0.26, 20), canvasMat(64, 64, (x, w, h) => {
      x.fillStyle = '#1b1b1b'; x.beginPath(); x.arc(32, 32, 32, 0, 7); x.fill();
      x.fillStyle = '#c4281c'; x.fillRect(16, 16, 32, 32);
      drawR(x, w / 2, h / 2, 30, '#1b1b1b');
    }), 0, -0.02, 0);
    logo.rotation.x = Math.PI / 2;
    dish.add(logo, mesh(cyl(0.03, 0.03, 0.55, 6), mat(0x6b6b6b), 0, -0.3, 0));
    dish.rotation.x = 2.1; // the bowl faces forward and up
    dish.position.set(0, TOP + 0.75, 0.25);
    return group(dish, mesh(cyl(0.07, 0.14, 0.55, 8), mat(0x6b6b6b), 0, TOP + 0.25, 0.25));
  },

  SantaHat() {
    const red = mat(0xc4281c), white = mat(0xf8f8f8, { shininess: 4 });
    const trim = mesh(new THREE.TorusGeometry(0.64, 0.14, 10, 24), white, 0, TOP - 0.08, 0);
    trim.rotation.x = Math.PI / 2;
    const cone = mesh(new THREE.ConeGeometry(0.62, 1.3, 20), red, 0.12, TOP + 0.5, 0.1);
    cone.rotation.z = -0.35; cone.rotation.x = 0.2;
    return group(trim, cone, mesh(new THREE.SphereGeometry(0.17, 12, 8), white, 0.38, TOP + 1.08, 0.22));
  },

  StageProp() {
    // a dagger "through the head"
    const gold = mat(0xd8a020, { shininess: 90, specular: 0x998844 });
    const g = new THREE.Group();
    const grip = mesh(cyl(0.1, 0.1, 0.8, 10), canvasMat(16, 64, (x, w, h) => {
      x.fillStyle = '#20242c'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#7c8ca8'; x.lineWidth = 2;
      for (let i = -8; i < h; i += 8) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i + 8); x.stroke(); }
    }), 0, 0.85, 0);
    const pommel = mesh(new THREE.SphereGeometry(0.15, 10, 8), gold, 0, 1.3, 0);
    const guard = mesh(new THREE.BoxGeometry(0.75, 0.1, 0.16), gold, 0, 0.42, 0);
    for (const s of [-1, 1]) {
      const curl = mesh(new THREE.ConeGeometry(0.07, 0.25, 6), gold, s * 0.42, 0.35, 0);
      curl.rotation.z = s * 2.4;
      g.add(curl);
    }
    const blade = mesh(cyl(0.02, 0.12, 0.6, 4), mat(0x8a8d90, { shininess: 90 }), 0, 0.08, 0);
    blade.scale.set(1, 1, 0.3);
    g.add(grip, pommel, guard, blade);
    g.position.set(0.05, TOP - 0.2, 0);
    g.rotation.z = -0.12;
    return group(g);
  },

  FloppyFish() {
    const g = new THREE.Group();
    const skin = canvasMat(128, 64, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#1e5aa8'); gr.addColorStop(0.5, '#3c82d0'); gr.addColorStop(0.62, '#f2c832'); gr.addColorStop(1, '#f2d84a');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    });
    // body bent over the head
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.85, TOP - 0.35, 0), new THREE.Vector3(-0.45, TOP + 0.05, 0),
      new THREE.Vector3(0, TOP + 0.14, 0), new THREE.Vector3(0.45, TOP + 0.05, 0), new THREE.Vector3(0.8, TOP - 0.3, 0),
    ]);
    const body = new THREE.TubeGeometry(curve, 20, 0.2, 10, false);
    // taper the ends
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / 11) / 20;
      const k = Math.sin(Math.PI * Math.min(1, ring * 1.05)) * 0.8 + 0.2;
      const t = Math.min(0.999, ring); const c = curve.getPoint(t);
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k * 0.7);
    }
    body.computeVertexNormals();
    g.add(mesh(body, skin));
    const tail = mesh(new THREE.ConeGeometry(0.22, 0.32, 3), mat(0x1e5aa8), 0.9, TOP - 0.5, 0);
    tail.scale.set(1, 1, 0.25);
    const eye = mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(0x111111), -0.78, TOP - 0.22, -0.11);
    g.add(tail, eye);
    g.rotation.y = 0.25;
    return group(g);
  },

  Screw() {
    const steel = mat(0xb4b8bc, { shininess: 90, specular: 0x888888 });
    const g = group();
    g.add(mesh(cyl(0.48, 0.14, 0.24, 20), steel, 0, TOP + 2.05, 0)); // countersunk head
    const slot = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.1), mat(0x555a5e), 0, TOP + 2.17, 0);
    g.add(slot);
    g.add(mesh(cyl(0.14, 0.14, 1.75, 12), steel, 0, TOP + 1.05, 0));
    for (let i = 0; i < 7; i++) {
      const t = mesh(new THREE.TorusGeometry(0.17, 0.06, 4, 16), steel, 0, TOP + 1.75 - i * 0.22, 0);
      t.rotation.x = Math.PI / 2 + 0.18;
      g.add(t);
    }
    g.add(mesh(new THREE.ConeGeometry(0.14, 0.35, 12).rotateX(Math.PI), steel, 0, TOP + 0.05, 0));
    return g;
  },

  BiologyTextbook: () => book('#1e6b3a', 'BIOLOGY', (x, w, h) => {
    x.save(); x.translate(w / 2, h / 2 + 8); x.rotate(Math.PI / 4);
    x.fillStyle = '#f2d84a'; x.fillRect(-30, -30, 60, 60);
    x.fillStyle = '#4ca84c'; x.fillRect(-22, -22, 44, 44); x.restore();
    // microscope
    x.fillStyle = '#1b1b1b'; x.fillRect(w / 2 - 12, h / 2 + 20, 24, 5); x.fillRect(w / 2 - 2, h / 2 - 6, 5, 26);
    x.save(); x.translate(w / 2 + 2, h / 2 - 8); x.rotate(-0.5); x.fillRect(-4, -14, 8, 22); x.restore();
  }),
  ChemistryTextbook: () => book('#b8201a', 'CHEMISTRY', (x, w, h) => {
    x.fillStyle = '#e870a8';
    x.beginPath(); x.moveTo(w / 2 - 7, h / 2 - 22); x.lineTo(w / 2 + 7, h / 2 - 22); x.lineTo(w / 2 + 7, h / 2 - 4);
    x.lineTo(w / 2 + 26, h / 2 + 30); x.lineTo(w / 2 - 26, h / 2 + 30); x.lineTo(w / 2 - 7, h / 2 - 4); x.fill();
    x.fillStyle = '#ffc0e0'; x.fillRect(w / 2 - 10, h / 2 - 26, 20, 5);
  }),

  GameInputDevice() {
    const dark = mat(0x3c3c3c), yellow = mat(0xf2d020);
    const g = group();
    const pad = new THREE.Group();
    pad.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 0.6), dark), mesh(new THREE.BoxGeometry(0.6, 0.18, 1.7), dark));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const tri = mesh(new THREE.ConeGeometry(0.13, 0.04, 3), yellow, Math.sin(a) * 0.62, 0.1, Math.cos(a) * 0.62);
      tri.rotation.y = a + Math.PI;
      pad.add(tri);
    }
    pad.add(mesh(cyl(0.05, 0.05, 0.8, 8), mat(0x222222), 0.15, 0.48, 0.15));
    pad.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0xc4281c), 0.15, 0.9, 0.15));
    pad.position.y = TOP + 0.09; pad.rotation.y = 0.3;
    g.add(pad);
    return g;
  },

  Hammerhead() {
    const wood = canvasMat(64, 16, (x, w, h) => {
      x.fillStyle = '#d8a070'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(120,70,30,.5)';
      for (let i = 2; i < h; i += 3) { x.beginPath(); x.moveTo(0, i); x.bezierCurveTo(w / 3, i - 2, w * 2 / 3, i + 2, w, i); x.stroke(); }
    });
    const black = mat(0x1b1b1b, { shininess: 40 });
    const g = new THREE.Group();
    const handle = mesh(cyl(0.12, 0.12, 2.0, 10), wood);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    for (const s of [-1, 1]) {
      const head = mesh(new THREE.BoxGeometry(0.45, 1.1, 0.4), black, s * 1.12, 0, 0);
      head.scale.set(1, 1, 1);
      g.add(head);
      const wedge = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 3), black, s * 1.12, -0.6, 0);
      wedge.rotation.z = Math.PI / 2; wedge.scale.set(1, 1, 0.5);
      g.add(wedge);
    }
    g.position.set(0, TOP + 0.15, 0);
    g.rotation.y = 0.2;
    return group(g);
  },

  TBoneVisor: () => visor('#4a4a4a', '#c4281c', (x, w, h) => {
    // a T-bone steak picture on the front (front of the band is at u = 0.5)
    const cx = w * 0.5, cy = h / 2;
    x.fillStyle = '#9c2a20'; x.beginPath(); x.ellipse(cx, cy, 20, 11, 0, 0, 7); x.fill();
    x.fillStyle = '#f0e8d8'; x.fillRect(cx - 2, cy - 10, 4, 20); x.fillRect(cx - 9, cy - 2, 18, 3);
    x.strokeStyle = '#f4d0b0'; x.lineWidth = 2; x.beginPath(); x.ellipse(cx, cy, 20, 11, 0, 0, 7); x.stroke();
  }),

  PumpkinHead() {
    const orange = canvasMat(256, 128, (x, w, h) => {
      x.fillStyle = '#e07a1e'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#b85a10'; x.lineWidth = 3;
      for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); }
      x.fillStyle = '#2a1400';
      const cx = w * 0.75; // sphere u = 0.75 faces -Z
      x.beginPath(); x.moveTo(cx - 30, 52); x.lineTo(cx - 17, 32); x.lineTo(cx - 4, 52); x.fill();
      x.beginPath(); x.moveTo(cx + 4, 52); x.lineTo(cx + 17, 32); x.lineTo(cx + 30, 52); x.fill();
      x.beginPath(); x.moveTo(cx - 34, 70);
      for (let i = 0; i <= 8; i++) x.lineTo(cx - 34 + i * 8.5, 70 + (i % 2 ? 8 : 0));
      x.lineTo(cx + 26, 88); x.lineTo(cx - 26, 88); x.fill();
    });
    const p = mesh(new THREE.SphereGeometry(1.0, 28, 18), orange, 0, 0.08, 0);
    p.scale.set(1.15, 0.95, 1.15);
    return group(p, mesh(cyl(0.08, 0.13, 0.38, 8), mat(0x3a6b2a), 0, 1.08, 0));
  },

  WitchHat() {
    const black = mat(0x1b1b1b, { shininess: 15, side: THREE.DoubleSide });
    const g = group(mesh(cyl(1.15, 1.15, 0.05, 32), black, 0, TOP - 0.04, 0));
    const lower = mesh(cyl(0.38, 0.64, 0.9, 24, true), black, 0, TOP + 0.42, 0);
    const upper = mesh(new THREE.ConeGeometry(0.38, 1.0, 24, 1, true), black, 0.18, TOP + 1.3, 0.05);
    upper.rotation.z = -0.35;
    g.add(lower, upper);
    return g;
  },

  ElfHat() {
    const green = mat(0x48a848), white = mat(0xf0f0f0, { shininess: 4 });
    const brim = mesh(new THREE.TorusGeometry(0.66, 0.13, 10, 24), white, 0, TOP - 0.1, 0);
    brim.rotation.x = Math.PI / 2;
    const base = mesh(cyl(0.42, 0.68, 0.75, 24), green, 0, TOP + 0.28, 0);
    const tip = mesh(new THREE.ConeGeometry(0.42, 0.9, 20), green, -0.28, TOP + 0.85, 0.05);
    tip.rotation.z = 0.95; // bent over
    const pom = mesh(new THREE.SphereGeometry(0.15, 12, 8), white, -0.72, TOP + 1.05, 0.05);
    return group(brim, base, tip, pom);
  },

  BCHardHat() {
    const yellow = mat(0xf5cd30, { shininess: 70, specular: 0x666644 });
    const shell = mesh(dome(0.72), yellow, 0, TOP - 0.3, 0);
    shell.scale.set(1, 0.95, 1.05);
    const brim = mesh(cyl(0.88, 0.88, 0.05, 28), yellow, 0, TOP - 0.3, -0.06);
    brim.scale.set(1, 1, 1.08);
    const ridge = mesh(new THREE.BoxGeometry(0.16, 0.1, 1.3), yellow, 0, TOP + 0.36, 0);
    // light-blue band, as on builderman's hard hat in the 2008 front-page figure
    const band = mesh(cyl(0.735, 0.735, 0.1, 28), mat(0x20c8f0), 0, TOP - 0.24, 0);
    band.scale.set(1, 1, 1.05);
    return group(shell, brim, ridge, band);
  },

  NinjaMask() {
    const black = mat(0x1b1b1b, { side: THREE.DoubleSide });
    const g = group(mesh(cyl(0.665, 0.665, 1.05, 28, true), black, 0, 0.05, 0));
    g.add(mesh(dome(0.665), black, 0, 0.55, 0));
    // eye slit: a band of the wearer's head colour across the front
    const slit = mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.22, 20, 1, true, Math.PI - 0.9, 1.8), mat(0xf5cd30, { side: THREE.DoubleSide }), 0, 0.14, 0);
    slit.userData.skin = true;
    const tails = [mesh(new THREE.BoxGeometry(0.14, 0.7, 0.05), black, 0.12, 0.05, 0.72), mesh(new THREE.BoxGeometry(0.14, 0.6, 0.05), black, -0.08, 0.1, 0.72)];
    tails[0].rotation.z = 0.35; tails[1].rotation.z = -0.25;
    g.add(slit, ...tails);
    return g;
  },

  BlueWinterCap() {
    const knit = canvasMat(128, 64, (x, w, h) => {
      x.fillStyle = '#2a5fb8'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(0,0,40,.25)';
      for (let i = 0; i < w; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    });
    const crown = mesh(dome(0.68), knit, 0, TOP - 0.3, 0);
    crown.scale.set(1, 1.15, 1);
    const cuff = mesh(cyl(0.7, 0.7, 0.3, 24), knit, 0, TOP - 0.28, 0);
    return group(crown, cuff);
  },

  ValkyrieHelm() {
    const steel = mat(0xc7c8c9, { shininess: 90, specular: 0x999999 });
    const g = group(mesh(dome(0.7), steel, 0, TOP - 0.28, 0), mesh(cyl(0.71, 0.71, 0.14, 24), steel, 0, TOP - 0.26, 0));
    const nose = mesh(new THREE.BoxGeometry(0.12, 0.5, 0.06), steel, 0, TOP - 0.45, -0.7);
    g.add(nose);
    const feather = mat(0xf8f8f8, { shininess: 6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const f = mesh(new THREE.SphereGeometry(0.2, 10, 8), feather, 0, 0.1 + i * 0.13, i * 0.12);
        f.scale.set(0.25, 1.6 - i * 0.18, 1);
        f.rotation.x = -0.7 + i * 0.12;
        wing.add(f);
      }
      wing.position.set(s * 0.72, TOP - 0.05, 0.05);
      wing.rotation.z = -s * 0.25;
      g.add(wing);
    }
    return g;
  },

  ChefHat() {
    const white = mat(0xf8f8f8, { shininess: 6 });
    const puff = mesh(new THREE.SphereGeometry(0.82, 20, 12), white, 0, TOP + 0.75, 0);
    puff.scale.set(1, 0.62, 1);
    return group(mesh(cyl(0.7, 0.66, 0.65, 24), white, 0, TOP + 0.18, 0), puff);
  },

  KittyEars() {
    const black = mat(0x1b1b1b), pink = mat(0xe8bac8);
    const g = group();
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.3, 0.55, 4), black, s * 0.38, TOP + 0.2, 0);
      ear.rotation.y = Math.PI / 4; ear.rotation.z = -s * 0.2; ear.scale.set(1, 1, 0.45);
      const inner = mesh(new THREE.ConeGeometry(0.18, 0.34, 4), pink, s * 0.37, TOP + 0.16, -0.08);
      inner.rotation.y = Math.PI / 4; inner.rotation.z = -s * 0.2; inner.scale.set(1, 1, 0.3);
      g.add(ear, inner);
    }
    return g;
  },

  // Modelled on the archived thumbnail of the 2007 ROBLOX Visor (the 2008
  // version was not seen).
  RobloxVisor: () => visor('#d01c14', '#f8f8f8', (x, w, h) => {
    x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ROBLOX', w * 0.5, h / 2 + 1);
  }),

  FootballHelmet() {
    const shell = mat(0xc4281c, { shininess: 90, specular: 0x777777 });
    const g = group();
    const helmet = mesh(new THREE.SphereGeometry(0.78, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), shell, 0, 0.0, 0.02);
    helmet.scale.set(1, 1.05, 1.08);
    const stripe = mesh(new THREE.SphereGeometry(0.785, 4, 16, -0.08, 0.16, 0, Math.PI * 0.55), mat(0xf2f2f2), 0, 0.0, 0.02);
    stripe.scale.copy(helmet.scale);
    g.add(helmet, stripe);
    const bar = mat(0xa3a2a5, { shininess: 60 });
    for (const y of [-0.2, -0.42]) {
      const t = mesh(new THREE.TorusGeometry(0.72, 0.035, 6, 20, Math.PI * 0.8), bar, 0, y, 0);
      t.rotation.x = Math.PI / 2; t.rotation.z = Math.PI * 1.1;
      g.add(t);
    }
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), bar, 0, -0.31, -0.74));
    return g;
  },
};

export const HAT_NAMES = Object.keys(HATS);

export function buildHat(key) {
  const fn = HATS[key];
  if (!fn) return null;
  const g = fn();
  g.name = 'Hat:' + key;
  return g;
}
