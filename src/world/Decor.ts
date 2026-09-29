import * as THREE from 'three';
import { Builder, Geo } from './Builder';
import { MaterialLib } from './Materials';
import type { Restaurant } from './Restaurant';
import type { DecorId } from '../game/Progression';
import type { CustomerManager } from '../game/CustomerManager';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';
import { ROOM } from './Layout';
import { plant } from './Dining';
import { Rng } from '../core/math';
import { ROSTER } from '../characters/Roster';

type Updater = (dt: number, t: number) => void;

/** Purchasable decorations that make the lobby cozier (and customers calmer). */
export class Decor {
  private built = new Map<DecorId, THREE.Group>();
  private updaters: Updater[] = [];
  private blocked = new Set<DecorId>();
  private time = 0;

  constructor(private world: Restaurant, private mats: MaterialLib, private customers: CustomerManager) {
    world.root.userData.decorUpdate = (dt: number) => this.update(dt);
  }

  apply(owned: DecorId[]) {
    for (const [id, g] of this.built) g.visible = owned.includes(id);
    for (const id of owned) {
      if (!this.built.has(id)) {
        const g = this.build(id);
        this.built.set(id, g);
        this.world.root.add(g);
        g.scale.setScalar(0.01);
        // grow in
        const start = performance.now();
        const grow = () => {
          const t = Math.min(1, (performance.now() - start) / 500);
          const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
          g.scale.setScalar(Math.max(0.01, e));
          if (t < 1) requestAnimationFrame(grow);
        };
        requestAnimationFrame(grow);
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    for (const u of this.updaters) u(dt, this.time);
  }

  private block(id: DecorId, x: number, z: number, r: number) {
    if (this.blocked.has(id)) return;
    this.customers.blockDecor(x, z, r);
  }

  private build(id: DecorId): THREE.Group {
    const g = new THREE.Group();
    g.name = 'decor_' + id;
    const b = new Builder(g);
    const m = this.mats;
    switch (id) {
      case 'plants': {
        for (const [x, z] of [[-0.25, 5.5], [2.65, 5.5]] as const) {
          plant(b, m, x, z, 1.6);
          this.block(id, x, z, 0.3);
        }
        this.blocked.add(id);
        break;
      }
      case 'gumball': {
        const gx = ROOM.minX + 0.55;
        const gz = 5.45;
        b.cyl(0.05, 0.08, 0.8, m.std(0xc4262e, 0.35, 0.3), gx, 0.4, gz, { seg: 16 });
        b.cyl(0.18, 0.2, 0.05, m.std(0xc4262e, 0.35, 0.3), gx, 0.025, gz, { seg: 20 });
        b.rbox(0.2, 0.18, 0.2, 0.03, m.std(0xc4262e, 0.35, 0.3), gx, 0.9, gz);
        b.box(0.05, 0.04, 0.02, m.chrome, gx, 0.9, gz + 0.105);
        const globe = b.sphere(0.18, m.phys('gumGlass', { color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.25, clearcoat: 1, depthWrite: false }), gx, 1.15, gz);
        globe.renderOrder = 6;
        const rng = new Rng('gum');
        const cols = [0xff4f7b, 0xffd23f, 0x3ad29f, 0x4fa3ff, 0xb46bff, 0xffffff, 0xff8a3a];
        for (let i = 0; i < 60; i++) {
          const a = rng.range(0, Math.PI * 2);
          const r = Math.sqrt(rng.next()) * 0.14;
          const y = rng.range(-0.15, 0.06);
          b.sphere(0.022, m.phys('gum' + (i % 7), { color: cols[i % 7], roughness: 0.3, clearcoat: 0.8 }), gx + Math.cos(a) * r, 1.15 + y, gz + Math.sin(a) * r, { cast: false });
        }
        b.cyl(0.04, 0.06, 0.05, m.std(0xc4262e, 0.35, 0.3), gx, 1.34, gz, { seg: 12 });
        this.block(id, gx, gz, 0.25);
        this.blocked.add(id);
        break;
      }
      case 'neon_burger': {
        const tex = canvasTexture(1024, 640, (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const pass = (col: string, lw: number, blur: number) => {
            ctx.shadowColor = col;
            ctx.shadowBlur = blur;
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.ellipse(w / 2, 300, 300, 200, 0, Math.PI, 0);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(w / 2 - 320, 340);
            for (let i = 0; i <= 12; i++) ctx.lineTo(w / 2 - 320 + i * 53, 340 + (i % 2 ? 26 : 0));
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(w / 2 - 310, 395, 620, 70, 35);
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(w / 2 - 300, 490, 600, 80, 40);
            ctx.stroke();
            for (let i = 0; i < 6; i++) {
              ctx.beginPath();
              ctx.ellipse(w / 2 - 200 + i * 80, 200 + (i % 2) * 30, 12, 6, 0.4, 0, Math.PI * 2);
              ctx.stroke();
            }
          };
          pass('#ffb13b', 26, 40);
          pass('#fff4d6', 8, 0);
        });
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8) });
        const sign = new THREE.Mesh(Geo.plane(1.1, 0.69), mat);
        sign.position.set(ROOM.minX + 0.05, 2.75, 2.55);
        sign.rotation.y = Math.PI / 2;
        g.add(sign);
        const light = new THREE.PointLight(0xffa040, 1.2, 3, 2);
        light.position.set(ROOM.minX + 0.4, 2.75, 2.55);
        g.add(light);
        this.updaters.push((_dt, t) => {
          const f = Math.sin(t * 50) > 0.97 ? 0.4 : 1;
          mat.color.setScalar(1.8 * f);
          light.intensity = 1.2 * f;
        });
        break;
      }
      case 'string_lights': {
        const bulbMats = [0xffd08a, 0xff9a8a, 0x9ad8ff, 0xb8ff9a, 0xffe08a].map((c, i) => this.mats.emissive(c, 3.5, 'string' + i));
        const wire = m.std(0x222222, 0.6);
        for (const z of [1.3, 2.9, 4.5]) {
          const x0 = ROOM.minX + 0.1;
          const x1 = ROOM.maxX - 0.1;
          const n = 34;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const x = x0 + (x1 - x0) * t;
            const y = ROOM.height - 0.08 - Math.sin(t * Math.PI) * 0.32 - Math.sin(t * Math.PI * 3) * 0.04;
            pts.push(new THREE.Vector3(x, y, z));
          }
          const curve = new THREE.CatmullRomCurve3(pts);
          const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.004, 4, false), wire);
          g.add(tube);
          for (let i = 1; i < n; i++) {
            const p = pts[i];
            const bulb = new THREE.Mesh(Geo.sphere(0.025, 10, 8), bulbMats[i % bulbMats.length]);
            bulb.position.set(p.x, p.y - 0.035, p.z);
            bulb.scale.y = 1.3;
            g.add(bulb);
          }
        }
        this.updaters.push((_dt, t) => {
          bulbMats.forEach((bm, i) => ((bm as THREE.MeshStandardMaterial).emissiveIntensity = 3 + Math.sin(t * 1.3 + i) * 0.8));
        });
        break;
      }
      case 'ceiling_fans': {
        for (const [x, z] of [[-3.3, 3.4], [3.2, 2.7]] as const) {
          const fan = new THREE.Group();
          fan.position.set(x, ROOM.height, z);
          g.add(fan);
          const fb = new Builder(fan);
          fb.cyl(0.015, 0.015, 0.35, m.std(0x3b2418, 0.4, 0.4), 0, -0.175, 0, { seg: 8 });
          fb.cyl(0.1, 0.12, 0.14, m.std(0x3b2418, 0.35, 0.5), 0, -0.4, 0, { seg: 20 });
          fb.sphere(0.07, m.phys('fanGlass', { color: 0xfff1d0, roughness: 0.2, transmission: 0, emissive: new THREE.Color(0xffd79a), emissiveIntensity: 1.2 }), 0, -0.5, 0);
          const blades = new THREE.Group();
          blades.position.y = -0.38;
          fan.add(blades);
          const bb = new Builder(blades);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const blade = bb.rbox(0.62, 0.012, 0.13, 0.006, m.wood(0x7a5234, 2), Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, { ry: -a });
            blade.rotation.x = 0.12;
          }
          this.updaters.push((dt) => (blades.rotation.y += dt * 2.6));
        }
        break;
      }
      case 'jukebox': {
        const jx = 5.35;
        const jz = ROOM.maxZ - 0.42;
        const jb = new Builder(g);
        const body = m.phys('jukeWood', { color: 0x7a2a1a, roughness: 0.3, clearcoat: 0.8 });
        jb.rbox(0.8, 1.05, 0.5, 0.06, body, jx, 0.525, jz, { ry: Math.PI });
        // arch top
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 32, 1, false, 0, Math.PI), body);
        arch.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        arch.rotation.set(0, 0, 0);
        arch.geometry = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 32, 1, false, -Math.PI / 2, Math.PI);
        arch.rotation.x = Math.PI / 2;
        arch.position.set(jx, 1.05, jz);
        arch.castShadow = true;
        g.add(arch);
        // glowing tubes
        const tubeMats: THREE.MeshBasicMaterial[] = [];
        const cols = [0xff4f7b, 0xffd23f, 0x3ad29f, 0x4fa3ff];
        for (let i = 0; i < 4; i++) {
          const tm = new THREE.MeshBasicMaterial({ color: cols[i], toneMapped: false });
          tubeMats.push(tm);
          const tube = new THREE.Mesh(new THREE.TorusGeometry(0.34 - i * 0.045, 0.012, 8, 40, Math.PI), tm);
          tube.position.set(jx, 1.05, jz - 0.255);
          g.add(tube);
        }
        const grill = canvasTexture(256, 256, (c, w, h) => {
          c.fillStyle = '#2a1a12';
          c.fillRect(0, 0, w, h);
          c.strokeStyle = '#d8b04a';
          c.lineWidth = 6;
          for (let x = 16; x < w; x += 22) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, h);
            c.stroke();
          }
        });
        jb.mesh(Geo.plane(0.6, 0.45), new THREE.MeshStandardMaterial({ map: grill, metalness: 0.6, roughness: 0.4 }), jx, 0.42, jz - 0.255, { ry: Math.PI });
        const window = jb.mesh(Geo.plane(0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc36b, emissiveIntensity: 0.9 }), jx, 0.85, jz - 0.255, { ry: Math.PI });
        void window;
        const light = new THREE.PointLight(0xff6fa0, 1.5, 2.5, 2);
        light.position.set(jx, 1.1, jz - 0.6);
        g.add(light);
        this.updaters.push((_dt, t) => {
          tubeMats.forEach((tm, i) => tm.color.setHex(cols[(i + Math.floor(t * 2)) % cols.length]).multiplyScalar(1.6));
          light.color.setHex(cols[Math.floor(t * 2) % cols.length]);
        });
        this.block(id, jx, jz, 0.45);
        this.blocked.add(id);
        break;
      }
      case 'photo_wall': {
        const rng = new Rng('photos');
        const pool = ROSTER.slice(0, 12);
        for (let i = 0; i < 6; i++) {
          const def = pool[i % pool.length];
          const tex = canvasTexture(192, 240, (c, w, h) => {
            c.fillStyle = '#fbf7ee';
            c.fillRect(0, 0, w, h);
            const grd = c.createLinearGradient(0, 0, 0, h);
            grd.addColorStop(0, def.app.topColor);
            grd.addColorStop(1, '#2a1d16');
            c.fillStyle = grd;
            c.fillRect(12, 12, w - 24, h - 60);
            c.fillStyle = def.app.skin;
            c.beginPath();
            c.arc(w / 2, 100, 46, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = def.app.hairColor;
            c.beginPath();
            c.arc(w / 2, 86, 48, Math.PI, 0);
            c.fill();
            c.fillStyle = '#1d1714';
            c.beginPath();
            c.arc(w / 2 - 16, 102, 5, 0, Math.PI * 2);
            c.arc(w / 2 + 16, 102, 5, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = '#1d1714';
            c.lineWidth = 4;
            c.beginPath();
            c.arc(w / 2, 114, 16, 0.2, Math.PI - 0.2);
            c.stroke();
            c.fillStyle = '#2a1d16';
            c.font = `700 22px ${FONT_DISPLAY}`;
            c.textAlign = 'center';
            c.fillText(def.name.split(' ')[0], w / 2, h - 18);
          });
          const x = 4.6 + (i % 3) * 0.72 + rng.range(-0.05, 0.05);
          const y = 2.05 + Math.floor(i / 3) * 0.62;
          const frame = b.box(0.5, 0.6, 0.03, m.std(i % 2 ? 0x2a1d16 : 0xc8a04a, 0.4, i % 2 ? 0 : 0.8), x, y, -1.08, { rz: rng.range(-0.05, 0.05) });
          const pic = b.mesh(Geo.plane(0.42, 0.52), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), x, y, -1.063, { rz: frame.rotation.z, cast: false });
          void pic;
        }
        break;
      }
      case 'fish_tank': {
        const tx = -3.3;
        const tz = ROOM.maxZ - 0.35;
        b.box(1.3, 0.75, 0.42, m.wood(0x3b2418, 2), tx, 0.375, tz);
        const water = b.box(1.2, 0.5, 0.36, m.phys('water', { color: 0x6fd3ff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }), tx, 1.0, tz, { cast: false, receive: false });
        water.renderOrder = 7;
        b.box(1.22, 0.02, 0.38, m.std(0x2a2a2a, 0.4), tx, 1.26, tz);
        b.box(1.18, 0.05, 0.34, m.std(0xd8c08a, 0.9), tx, 0.78, tz, { cast: false });
        const lamp = new THREE.PointLight(0x7fd6ff, 1.0, 2, 2);
        lamp.position.set(tx, 1.2, tz);
        g.add(lamp);
        // plants + fish
        for (let i = 0; i < 5; i++) b.mesh(Geo.cone(0.03, 0.25 + (i % 3) * 0.08), m.std(0x3f9b3a, 0.6), tx - 0.5 + i * 0.25, 0.9, tz + (i % 2 ? 0.08 : -0.06));
        const fishes: { o: THREE.Group; speed: number; phase: number; y: number }[] = [];
        const fishCols = [0xff8a3a, 0xffd23f, 0x4fa3ff, 0xff4f7b, 0xffffff];
        for (let i = 0; i < 7; i++) {
          const f = new THREE.Group();
          const fm = m.phys('fish' + (i % 5), { color: fishCols[i % 5], roughness: 0.3, clearcoat: 0.8 });
          const bodyM = new THREE.Mesh(Geo.sphere(0.035, 12, 8), fm);
          bodyM.scale.set(1.4, 0.8, 0.5);
          f.add(bodyM);
          const tail = new THREE.Mesh(Geo.cone(0.025, 0.04, 6), fm);
          tail.rotation.z = Math.PI / 2;
          tail.position.x = -0.06;
          f.add(tail);
          g.add(f);
          fishes.push({ o: f, speed: 0.3 + i * 0.07, phase: i * 1.7, y: 0.85 + (i % 4) * 0.08 });
        }
        this.updaters.push((_dt, t) => {
          for (const f of fishes) {
            const a = t * f.speed + f.phase;
            f.o.position.set(tx + Math.sin(a) * 0.5, f.y + Math.sin(a * 2.3) * 0.03, tz + Math.cos(a * 1.3) * 0.1);
            f.o.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
            (f.o.children[1] as THREE.Mesh).rotation.y = Math.sin(t * 12 + f.phase) * 0.5;
          }
        });
        this.block(id, tx, tz, 0.6);
        this.blocked.add(id);
        break;
      }
      case 'arcade': {
        const ax = -5.55;
        const az = ROOM.maxZ - 0.45;
        const cab = m.phys('arcadeCab', { color: 0x3b2a8a, roughness: 0.35, clearcoat: 0.6 });
        b.box(0.7, 1.7, 0.7, cab, ax, 0.85, az, { ry: Math.PI });
        b.box(0.72, 0.3, 0.5, m.std(0x1b1b1b, 0.4), ax, 1.05, az - 0.35, { rx: -0.35 });
        const sc = document.createElement('canvas');
        sc.width = 160;
        sc.height = 128;
        const sctx = sc.getContext('2d')!;
        const stex = new THREE.CanvasTexture(sc);
        stex.colorSpace = THREE.SRGBColorSpace;
        const screen = b.mesh(Geo.plane(0.5, 0.4), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }), ax, 1.42, az - 0.355, { ry: Math.PI, rx: 0.12, cast: false });
        void screen;
        const marquee = canvasTexture(256, 64, (c, w, h) => {
          c.fillStyle = '#12082a';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#ffd23f';
          c.font = `700 30px ${FONT_DISPLAY}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('BURGER BLASTER', w / 2, h / 2 + 2);
        });
        b.mesh(Geo.plane(0.66, 0.16), new THREE.MeshBasicMaterial({ map: marquee, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }), ax, 1.62, az - 0.356, { ry: Math.PI, cast: false });
        let acc = 0;
        let bx = 80;
        this.updaters.push((dt, t) => {
          acc += dt;
          if (acc < 1 / 15) return;
          acc = 0;
          sctx.fillStyle = '#05030f';
          sctx.fillRect(0, 0, 160, 128);
          for (let i = 0; i < 20; i++) {
            sctx.fillStyle = '#ffffff';
            sctx.fillRect((i * 37 + t * 20) % 160, (i * 53) % 128, 1, 1);
          }
          bx = 80 + Math.sin(t * 1.7) * 55;
          sctx.fillStyle = '#e9a23b';
          sctx.fillRect(bx - 10, 108, 20, 8);
          for (let i = 0; i < 5; i++) {
            const y = (t * 40 + i * 30) % 110;
            sctx.fillStyle = ['#e9a23b', '#6ab04c', '#f5c518', '#c0392b', '#e39a36'][i];
            sctx.fillRect(20 + i * 28, y, 14, 8);
          }
          sctx.fillStyle = '#7dffb0';
          sctx.font = '10px monospace';
          sctx.fillText(`HI ${String(Math.floor(t * 10) % 99999).padStart(5, '0')}`, 6, 12);
          stex.needsUpdate = true;
        });
        this.block(id, ax, az, 0.5);
        this.blocked.add(id);
        break;
      }
      case 'trophy_shelf': {
        const sx = ROOM.minX + 0.12;
        const sz = 4.9;
        b.box(0.22, 0.04, 1.2, m.wood(0x3b2418, 2), sx, 2.2, sz);
        const gold = m.phys('gold', { color: 0xf2c14e, metalness: 1, roughness: 0.2 });
        for (let i = 0; i < 4; i++) {
          const z = sz - 0.45 + i * 0.3;
          b.cyl(0.035, 0.05, 0.05, m.std(0x2a1d16, 0.4), sx, 2.245, z, { seg: 12 });
          b.cyl(0.012, 0.012, 0.08, gold, sx, 2.31, z, { seg: 8 });
          b.mesh(Geo.lathe('cup', [[0, 0], [0.02, 0], [0.05, 0.06], [0.055, 0.1], [0.05, 0.1], [0.045, 0.065], [0.015, 0.012], [0, 0.012]], 18), gold, sx, 2.35, z);
        }
        break;
      }
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).castShadow) (o as THREE.Mesh).castShadow = true;
    });
    return g;
  }
}
