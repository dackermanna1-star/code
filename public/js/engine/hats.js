// Hats, rebuilt from primitive shapes. Each builder returns a THREE.Group
// positioned relative to the head centre (head is ~1.24 studs tall, top at +0.62).
// These are clearly-labelled recreations: the original hat meshes/textures are
// not included. Shapes/colours follow catalog descriptions of the 2007-2008 items.
import * as THREE from 'three';

const TOP = 0.62;
const mat = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: o.shininess ?? 25, specular: o.specular ?? 0x222222, side: o.side ?? THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000, flatShading: !!o.flat });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

function canvasMat(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhongMaterial({ map: t, shininess: o.shininess ?? 20, transparent: !!o.transparent });
}

export const HATS = {
  RedBaseballCap() {
    const g = new THREE.Group();
    const red = mat(0xc4281c);
    const crown = mesh(new THREE.SphereGeometry(0.66, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, TOP - 0.3, 0);
    crown.scale.set(1, 0.85, 1);
    const brim = mesh(cyl(0.5, 0.5, 0.06, 24), red, 0, TOP - 0.28, -0.72);
    brim.scale.set(1, 1, 0.9);
    const button = mesh(new THREE.SphereGeometry(0.07, 8, 6), red, 0, TOP + 0.26, 0);
    g.add(crown, brim, button);
    return g;
  },
  BlueBaseballCap() { const g = HATS.RedBaseballCap(); g.traverse((o) => { if (o.material) o.material = mat(0x0d69ac); }); return g; },
  TrafficCone() {
    const g = new THREE.Group();
    const orange = mat(0xff6a1a), white = mat(0xf2f3f3);
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), orange, 0, TOP + 0.04, 0));
    g.add(mesh(cyl(0.12, 0.62, 2.0, 24), orange, 0, TOP + 1.08, 0));
    const band1 = mesh(cyl(0.38, 0.46, 0.28, 24), white, 0, TOP + 0.9, 0); band1.scale.setScalar(1.02);
    const band2 = mesh(cyl(0.24, 0.31, 0.22, 24), white, 0, TOP + 1.4, 0); band2.scale.setScalar(1.03);
    g.add(band1, band2);
    return g;
  },
  Bucket() {
    const g = new THREE.Group();
    const metal = mat(0x9ca3a8, { shininess: 70, specular: 0x777777, side: THREE.DoubleSide });
    g.add(mesh(cyl(0.72, 0.6, 1.1, 24, true), metal, 0, TOP + 0.3, 0));
    g.add(mesh(new THREE.CircleGeometry(0.72, 24).rotateX(-Math.PI / 2), metal, 0, TOP + 0.85, 0));
    const handle = mesh(new THREE.TorusGeometry(0.7, 0.03, 6, 24, Math.PI), mat(0x555555), 0, TOP + 0.85, 0);
    handle.rotation.z = Math.PI; handle.rotation.y = Math.PI / 2;
    g.add(handle);
    return g;
  },
  Tophat() {
    const g = new THREE.Group();
    const black = mat(0x1b1b1b, { shininess: 40 });
    g.add(mesh(cyl(0.95, 0.95, 0.06, 32), black, 0, TOP - 0.02, 0));
    g.add(mesh(cyl(0.6, 0.58, 1.1, 32), black, 0, TOP + 0.53, 0));
    g.add(mesh(cyl(0.605, 0.6, 0.2, 32), mat(0x6b1a1a), 0, TOP + 0.12, 0));
    return g;
  },
  DominoCrown() {
    const g = new THREE.Group();
    const white = mat(0xf4f4f4, { shininess: 60 });
    g.add(mesh(cyl(0.72, 0.72, 0.18, 24), mat(0x1b1b1b), 0, TOP + 0.05, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = canvasMat(32, 64, (x, w, h) => {
        x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#111'; x.fillRect(0, h / 2 - 1, w, 2);
        const dots = [[w / 2, h / 4], [w / 4, h * 0.65], [w * 0.75, h * 0.85]];
        for (const [px, py] of dots) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
      }, { shininess: 60 });
      const dom = mesh(new THREE.BoxGeometry(0.34, 0.66, 0.1), [white, white, white, white, d, d], Math.sin(a) * 0.66, TOP + 0.45, Math.cos(a) * 0.66);
      dom.rotation.y = a;
      g.add(dom);
    }
    return g;
  },
  NinjaMask() {
    const g = new THREE.Group();
    const black = mat(0x1b1b1b, { side: THREE.DoubleSide });
    const wrap = mesh(cyl(0.66, 0.66, 1.0, 28, true), black, 0, 0.05, 0);
    g.add(wrap);
    g.add(mesh(new THREE.SphereGeometry(0.66, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, 0.5, 0));
    // eye slit: a band of head colour drawn over the front
    const slit = mesh(new THREE.CylinderGeometry(0.665, 0.665, 0.22, 20, 1, true, Math.PI - 0.9, 1.8), mat(0xf5cd30, { side: THREE.DoubleSide }), 0, 0.12, 0);
    slit.userData.skin = true;
    g.add(slit);
    const tail = mesh(new THREE.BoxGeometry(0.12, 0.6, 0.06), black, 0.1, 0.1, 0.72); tail.rotation.z = 0.3;
    g.add(tail);
    return g;
  },
  PirateCaptainsHat() {
    const g = new THREE.Group();
    const black = mat(0x1b1b1b);
    const crown = mesh(new THREE.SphereGeometry(0.66, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, TOP - 0.2, 0);
    g.add(crown);
    const brim = mesh(new THREE.BoxGeometry(2.0, 0.55, 0.12), black, 0, TOP + 0.18, -0.15);
    brim.rotation.x = -0.25;
    g.add(brim);
    const skull = canvasMat(64, 64, (x, w, h) => {
      x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f2f2f2'; x.beginPath(); x.arc(32, 26, 14, 0, 7); x.fill(); x.fillRect(24, 34, 16, 10);
      x.fillStyle = '#1b1b1b'; x.beginPath(); x.arc(26, 26, 4, 0, 7); x.arc(38, 26, 4, 0, 7); x.fill();
      x.strokeStyle = '#f2f2f2'; x.lineWidth = 4; x.beginPath(); x.moveTo(12, 50); x.lineTo(52, 58); x.moveTo(52, 50); x.lineTo(12, 58); x.stroke();
    });
    const plate = mesh(new THREE.PlaneGeometry(0.55, 0.55), skull, 0, TOP + 0.2, -0.23);
    plate.rotation.y = Math.PI; plate.rotation.x = 0.25;
    g.add(plate);
    const trim = mesh(new THREE.BoxGeometry(2.02, 0.05, 0.13), mat(0xd8b040), 0, TOP + 0.45, -0.22);
    trim.rotation.x = -0.25;
    g.add(trim);
    return g;
  },
  VikingHelm() {
    const g = new THREE.Group();
    const steel = mat(0x9ca3a8, { shininess: 80, specular: 0x888888 });
    g.add(mesh(new THREE.SphereGeometry(0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, TOP - 0.25, 0));
    g.add(mesh(cyl(0.71, 0.71, 0.14, 24), mat(0x7a5a2a), 0, TOP - 0.22, 0));
    const horn = (side) => {
      const h = mesh(new THREE.ConeGeometry(0.16, 0.9, 12), mat(0xf0e6c8), side * 0.82, TOP + 0.25, 0);
      h.rotation.z = -side * 0.9;
      return h;
    };
    g.add(horn(1), horn(-1));
    return g;
  },
  WitchesHat() {
    const g = new THREE.Group();
    const black = mat(0x1b1b1b, { shininess: 15 });
    g.add(mesh(cyl(1.1, 1.1, 0.06, 32), black, 0, TOP, 0));
    const cone = mesh(new THREE.ConeGeometry(0.62, 1.7, 24), black, 0, TOP + 0.85, 0);
    cone.rotation.z = 0.12;
    g.add(cone);
    g.add(mesh(cyl(0.63, 0.63, 0.16, 24), mat(0x6b327c), 0, TOP + 0.1, 0));
    return g;
  },
  TeapotHat() {
    const g = new THREE.Group();
    // a small teapot sitting on the head (the hat clockwork made, 2007)
    const body = mesh(new THREE.SphereGeometry(0.55, 20, 14), mat(0xd8dde2, { shininess: 90, specular: 0xaaaaaa }), 0, TOP + 0.42, 0);
    body.scale.set(1.15, 0.85, 1.15);
    const lid = mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), body.material, 0, TOP + 0.82, 0);
    const knob = mesh(new THREE.SphereGeometry(0.08, 8, 6), body.material, 0, TOP + 1.12, 0);
    const spout = mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.7, 10), body.material, 0, TOP + 0.55, -0.72);
    spout.rotation.x = -0.9;
    const handle = mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 16, Math.PI * 1.3), body.material, 0, TOP + 0.45, 0.62);
    handle.rotation.y = Math.PI / 2; handle.rotation.z = -Math.PI * 0.15;
    g.add(body, lid, knob, spout, handle);
    return g;
  },
  Bighead() {
    // a giant version of the head shape worn over the head
    const g = new THREE.Group();
    const big = mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 28), mat(0xf5cd30), 0, 0.35, 0);
    big.userData.skin = true;
    g.add(big);
    return g;
  },
  Shaggy() {
    const g = new THREE.Group();
    const hair = mat(0x6b4220, { flat: true });
    const top = mesh(new THREE.SphereGeometry(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, TOP - 0.35, 0.04);
    g.add(top);
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.1 + (i / 13) * Math.PI * 1.8;
      const s = mesh(new THREE.ConeGeometry(0.16, 0.55, 5), hair, Math.sin(a) * 0.62, TOP - 0.45, Math.cos(a) * 0.62);
      s.rotation.x = Math.PI; s.rotation.z = Math.sin(a) * 0.3; s.rotation.y = a;
      g.add(s);
    }
    return g;
  },
  Headphones() {
    const g = new THREE.Group();
    const black = mat(0x222222, { shininess: 60 });
    const band = mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 24, Math.PI), black, 0, 0, 0);
    band.rotation.y = Math.PI / 2;
    g.add(band);
    for (const s of [-1, 1]) {
      const cup = mesh(cyl(0.32, 0.32, 0.22, 20), black, s * 0.72, 0, 0);
      cup.rotation.z = Math.PI / 2;
      const pad = mesh(cyl(0.26, 0.26, 0.1, 20), mat(0xc4281c), s * 0.6, 0, 0);
      pad.rotation.z = Math.PI / 2;
      g.add(cup, pad);
    }
    return g;
  },
  KittyEars() {
    const g = new THREE.Group();
    const black = mat(0x1b1b1b), pink = mat(0xe8bac8);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.28, 0.5, 4), black, s * 0.38, TOP + 0.18, 0);
      ear.rotation.y = Math.PI / 4; ear.rotation.z = -s * 0.2;
      const inner = mesh(new THREE.ConeGeometry(0.16, 0.32, 4), pink, s * 0.38, TOP + 0.14, -0.08);
      inner.rotation.y = Math.PI / 4; inner.rotation.z = -s * 0.2;
      g.add(ear, inner);
    }
    g.add(mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24, Math.PI), black, 0, TOP - 0.1, 0));
    g.children[g.children.length - 1].rotation.y = Math.PI / 2;
    return g;
  },
  ChefHat() {
    const g = new THREE.Group();
    const white = mat(0xf8f8f8);
    g.add(mesh(cyl(0.64, 0.64, 0.5, 24), white, 0, TOP + 0.1, 0));
    const puff = mesh(new THREE.SphereGeometry(0.8, 20, 12), white, 0, TOP + 0.65, 0);
    puff.scale.set(1, 0.65, 1);
    g.add(puff);
    return g;
  },
  SantaHat() {
    const g = new THREE.Group();
    const red = mat(0xc4281c), white = mat(0xf8f8f8);
    g.add(mesh(new THREE.TorusGeometry(0.64, 0.14, 10, 24), white, 0, TOP - 0.05, 0));
    g.children[0].rotation.x = Math.PI / 2;
    const cone = mesh(new THREE.ConeGeometry(0.62, 1.3, 20), red, 0.12, TOP + 0.55, 0.1);
    cone.rotation.z = -0.35; cone.rotation.x = 0.2;
    g.add(cone);
    g.add(mesh(new THREE.SphereGeometry(0.17, 12, 8), white, 0.38, TOP + 1.12, 0.22));
    return g;
  },
  PumpkinHead() {
    const g = new THREE.Group();
    const orange = canvasMat(128, 64, (x, w, h) => {
      x.fillStyle = '#e07a1e'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#b85a10'; x.lineWidth = 2;
      for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); }
      // jack-o-lantern face at u=0.5 (front)
      x.fillStyle = '#1b1000';
      const cx = w * 0.75;
      x.beginPath(); x.moveTo(cx - 14, 22); x.lineTo(cx - 8, 14); x.lineTo(cx - 2, 22); x.fill();
      x.beginPath(); x.moveTo(cx + 2, 22); x.lineTo(cx + 8, 14); x.lineTo(cx + 14, 22); x.fill();
      x.beginPath(); x.moveTo(cx - 16, 34); x.lineTo(cx + 16, 34); x.lineTo(cx + 10, 44); x.lineTo(cx - 10, 44); x.fill();
    });
    const p = mesh(new THREE.SphereGeometry(1.0, 24, 16), orange, 0, 0.1, 0);
    p.scale.set(1.15, 0.95, 1.15);
    g.add(p);
    g.add(mesh(cyl(0.08, 0.12, 0.35, 8), mat(0x3a6b2a), 0, 1.1, 0));
    return g;
  },
  Halo() {
    const g = new THREE.Group();
    const halo = mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 32), mat(0xffe680, { emissive: 0x806a20, shininess: 90 }), 0, TOP + 0.55, 0);
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
    return g;
  },
  PoliceCap() {
    const g = new THREE.Group();
    const navy = mat(0x1b2a50), black = mat(0x111111, { shininess: 80 });
    g.add(mesh(cyl(0.78, 0.64, 0.42, 24), navy, 0, TOP + 0.08, 0));
    const brim = mesh(cyl(0.45, 0.45, 0.05, 24), black, 0, TOP - 0.1, -0.62); brim.scale.set(1, 1, 0.75); brim.rotation.x = 0.2;
    g.add(brim);
    const badge = mesh(new THREE.BoxGeometry(0.2, 0.22, 0.04), mat(0xd8b040, { shininess: 90 }), 0, TOP + 0.1, -0.76);
    g.add(badge);
    return g;
  },
  StrawHat() {
    const g = new THREE.Group();
    const straw = mat(0xe8d08a, { side: THREE.DoubleSide });
    g.add(mesh(cyl(1.25, 1.25, 0.05, 32), straw, 0, TOP - 0.02, 0));
    g.add(mesh(cyl(0.6, 0.66, 0.5, 24), straw, 0, TOP + 0.22, 0));
    g.add(mesh(cyl(0.665, 0.67, 0.12, 24), mat(0xc4281c), 0, TOP + 0.08, 0));
    return g;
  },
  WizardHat() {
    const g = new THREE.Group();
    const blue = mat(0x23478b);
    g.add(mesh(cyl(1.0, 1.0, 0.06, 32), blue, 0, TOP, 0));
    g.add(mesh(new THREE.ConeGeometry(0.62, 1.9, 24), blue, 0, TOP + 0.95, 0));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const star = mesh(new THREE.OctahedronGeometry(0.08), mat(0xffe050, { emissive: 0x554400 }), Math.sin(a) * (0.5 - i * 0.07), TOP + 0.35 + i * 0.28, Math.cos(a) * (0.5 - i * 0.07));
      g.add(star);
    }
    return g;
  },
  Fedora() {
    const g = new THREE.Group();
    const c = mat(0x2a2a2a);
    g.add(mesh(cyl(1.05, 1.05, 0.05, 32), c, 0, TOP + 0.02, 0));
    const crown = mesh(cyl(0.58, 0.64, 0.6, 24), c, 0, TOP + 0.3, 0);
    g.add(crown);
    g.add(mesh(cyl(0.645, 0.645, 0.13, 24), mat(0x111111), 0, TOP + 0.1, 0));
    const dent = mesh(new THREE.BoxGeometry(0.15, 0.1, 0.9), mat(0x1e1e1e), 0, TOP + 0.6, 0);
    g.add(dent);
    return g;
  },
  Hair() {
    // the brown "Pal Hair"-style mop
    const g = new THREE.Group();
    const hair = mat(0x5a3a1a);
    const top = mesh(new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, TOP - 0.28, 0.05);
    top.scale.set(1.02, 0.9, 1.06);
    g.add(top);
    const back = mesh(cyl(0.68, 0.68, 0.5, 20, false), hair, 0, 0.05, 0.1);
    back.scale.set(1, 1, 0.98);
    g.add(back);
    const fringe = mesh(new THREE.BoxGeometry(1.1, 0.22, 0.2), hair, 0, TOP - 0.1, -0.6);
    fringe.rotation.x = -0.4;
    g.add(fringe);
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
