/**
 * Hand-built set pieces: the start compound (gas station + barricade), the
 * distance signs, the checkpoint gantry, the evac zone (gate, helipad,
 * helicopter, flares, light beacon), city overpasses and the end wall.
 *
 * Static parts go into the chunk's merged Geo layers; animated parts and
 * text signs are separate meshes registered on the chunk for disposal.
 */
import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Texture, TransformNode, Vector3,
  type Scene,
} from "@babylonjs/core";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { Geo, mix, rgb, tint, toHex, Xf } from "./Geo";
import { car, chainFence, hesco, sandbags } from "./Props";
import type { Deco } from "./Biomes";
import { Rng } from "./rng";
import { HW, SHOULDER } from "./Track";

/** Extra per-chunk objects owned by landmarks. */
export interface Extras {
  scene: Scene;
  nodes: { dispose(): void }[];
  animators: ((time: number, dt: number) => void)[];
  softTexture: () => Texture;
}

// ------------------------------------------------------------ text signs

function textPlane(x: Extras, name: string, w: number, h: number, px: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void, glow = 0.95): Mesh {
  const W = px, H = Math.round((px * h) / w);
  const tex = new DynamicTexture(`${name}_tex`, { width: W, height: H }, x.scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx, W, H);
  tex.update(true);
  tex.anisotropicFilteringLevel = 4;
  const mat = new StandardMaterial(`${name}_mat`, x.scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(glow, glow, glow);
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  const plane = MeshBuilder.CreatePlane(name, { width: w, height: h }, x.scene);
  plane.material = mat;
  plane.isPickable = false;
  x.nodes.push(plane, mat, tex);
  return plane;
}

const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = "900"): void {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 8);
}

function place(m: Mesh, x: number, y: number, z: number, yaw = 0): void {
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.freezeWorldMatrix();
}

// ------------------------------------------------------------------ start

export function buildStart(k: Deco, x: Extras): void {
  const c = k.c;
  const g = k.lit;
  const rng = new Rng(k.track.seed + 99);
  const t = k.track;
  const yAt = (xx: number, zz: number) => t.heightAt(xx, zz);
  // ---- gas station on the right, beyond the shoulder
  const gx = t.rightEdge(10) + 16;
  const gy = yAt(gx, 10);
  g.at(Xf.trs(gx, gy, 10, -Math.PI / 2), () => {
    // forecourt slab
    g.box(0, 0.05, 0, 26, 0.12, 18, tint(c.concrete, -0.05));
    // canopy
    for (const px of [-6, 6]) for (const pz of [-3, 3]) g.box(px, 2.4, pz, 0.5, 4.8, 0.5, c.white);
    g.box(0, 5.1, 0, 16, 0.7, 9, c.white, { top: tint(c.white, -0.15) });
    g.box(0, 5.1, 4.52, 16.1, 0.5, 0.06, c.pal.propA);
    g.box(0, 5.1, -4.52, 16.1, 0.5, 0.06, c.pal.propA);
    // pumps
    for (const px of [-3, 3]) {
      g.box(px, 0.25, 0, 1.2, 0.5, 3.5, c.concrete);
      g.box(px, 1.3, 0, 0.8, 1.7, 0.6, c.pal.propC, { top: c.white });
      g.box(px, 1.6, 0.31, 0.5, 0.4, 0.04, c.dark);
    }
    // store
    g.box(0, 2, -8, 14, 4, 6, c.pal.propB, { top: tint(c.pal.propB, -0.2) });
    g.box(-2, 1.4, -4.95, 6, 2.2, 0.1, c.glass);
    g.box(4, 1.1, -4.95, 1.4, 2.2, 0.1, c.dark);
    g.box(0, 4.3, -4.9, 14.2, 0.6, 0.4, c.pal.propA);
    // abandoned car at the pump
    g.at(Xf.trs(0, 0.1, 1.5, 0.15), () => car(g, c, rng.pick(c.carColors), "sedan", rng, false));
  });
  // tall price sign
  const sx = t.rightEdge(28) + 12;
  g.at(Xf.trs(sx, yAt(sx, 28), 28, Math.PI), () => {
    g.box(0, 5, 0, 0.6, 10, 0.6, c.metal);
    g.box(0, 10.5, 0, 3.6, 3.2, 0.6, c.pal.propA);
  });
  const gasSign = textPlane(x, "gasSign", 3.2, 2.8, 256, (ctx, W, H) => {
    ctx.fillStyle = toHex(c.white);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = toHex(c.pal.propA);
    fitText(ctx, "GAS", W * 0.85, 120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GAS", W / 2, H * 0.34);
    ctx.fillStyle = toHex(c.dark);
    fitText(ctx, "LAST STOP", W * 0.85, 48);
    ctx.fillText("LAST STOP", W / 2, H * 0.75);
  }, 0.9);
  place(gasSign, sx, yAt(sx, 28) + 10.5, 28 - 0.32);

  // ---- barricade behind the spawn (the safe zone we're leaving)
  const zb = -14;
  for (let i = -3; i <= 3; i++) {
    const xx = t.baseCenter(zb) + i * 2.6;
    g.at(Xf.trs(xx, yAt(xx, zb), zb, Math.PI / 2), () => sandbags(g, c, 2.6, 3, rng));
  }
  for (const s of [-1, 1]) {
    const xx = s * (HW + 2.5);
    g.at(Xf.trs(xx, yAt(xx, zb - 3), zb - 3, s * 0.9), () => car(g, c, rng.pick(c.carColors), s > 0 ? "van" : "pickup", rng));
  }
  for (let i = -2; i <= 2; i++) {
    const xx = i * 6;
    g.at(Xf.trs(xx, yAt(xx, zb - 6), zb - 6, Math.PI / 2), () => chainFence(g, c, 6, true));
  }
  // flood lights over the compound
  for (const s of [-1, 1]) {
    const xx = s * (HW + 3.5);
    g.at(Xf.trs(xx, yAt(xx, -6), -6, 0), () => {
      g.box(0, 4, 0, 0.3, 8, 0.3, c.metal);
      g.box(0, 8.1, 0.2, 1.6, 0.8, 0.4, c.dark);
    });
    k.glow.at(Xf.trs(xx, yAt(xx, -6), -6, 0), () => k.glow.box(0, 8.1, 0.42, 1.4, 0.6, 0.05, c.glowWarm));
  }
  // ---- start line: open gate arms + warning sign at the edge of the compound
  const zs = 26;
  for (const s of [-1, 1]) {
    const xx = (s < 0 ? t.leftEdge(zs) : t.rightEdge(zs)) + s * 0.8;
    const yy = yAt(xx, zs);
    k.hero.at(Xf.trs(xx, yy, zs, 0), () => {
      k.hero.box(0, 0.6, 0, 0.7, 1.2, 0.7, c.concrete);
      // raised boom arm (striped)
      for (let i = 0; i < 6; i++) k.hero.at(Xf.trs(0, 1.3 + i * 0.75, -s * 0.15, 0, 1, 0, s * 0.18), () => k.hero.box(0, 0, 0, 0.18, 0.75, 0.18, i % 2 ? c.white : c.red));
    });
  }
  const warn = textPlane(x, "startSign", 5, 1.6, 512, (ctx, W, H) => {
    ctx.fillStyle = toHex(c.hazard);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = toHex(c.dark);
    ctx.fillRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = toHex(c.hazard);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, "NO SAFE ZONE PAST HERE", W * 0.88, 64);
    ctx.fillText("NO SAFE ZONE PAST HERE", W / 2, H * 0.5);
  });
  const wx = t.leftEdge(zs) - 3;
  g.at(Xf.trs(wx, yAt(wx, zs), zs + 0.2, 0), () => {
    g.box(-2, 1.6, 0, 0.2, 3.2, 0.2, c.metal);
    g.box(2, 1.6, 0, 0.2, 3.2, 0.2, c.metal);
  });
  place(warn, wx, yAt(wx, zs) + 3.2, zs);
}

// ---------------------------------------------------------- distance signs

export function buildDistanceSign(k: Deco, x: Extras, z: number): void {
  const c = k.c;
  const t = k.track;
  const left = Math.round(t.length - z);
  const xx = t.rightEdge(z) + SHOULDER - 1.6;
  const yy = t.heightAt(xx, z);
  const green = mix(c.pal.propC, rgb("#1f7a4a"), 0.6);
  k.lit.at(Xf.trs(xx, yy, z, 0), () => {
    k.lit.box(-2.3, 2.6, 0.15, 0.22, 5.2, 0.22, c.metal);
    k.lit.box(2.3, 2.6, 0.15, 0.22, 5.2, 0.22, c.metal);
    k.lit.box(0, 4.6, 0.12, 6.4, 2.8, 0.12, tint(green, -0.3));
  });
  const sign = textPlane(x, `dist_${z}`, 6.2, 2.6, 512, (ctx, W, H) => {
    ctx.fillStyle = toHex(green);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, "EVAC ZONE", W * 0.6, 50);
    ctx.fillText("EVAC ZONE", 34, H * 0.3);
    fitText(ctx, `${left} m`, W * 0.62, 104);
    ctx.fillText(`${left} m`, 34, H * 0.68);
    // arrow
    ctx.beginPath();
    const ax = W * 0.84, ay = H * 0.5;
    ctx.moveTo(ax, ay - 60);
    ctx.lineTo(ax + 44, ay);
    ctx.lineTo(ax + 16, ay);
    ctx.lineTo(ax + 16, ay + 60);
    ctx.lineTo(ax - 16, ay + 60);
    ctx.lineTo(ax - 16, ay);
    ctx.lineTo(ax - 44, ay);
    ctx.closePath();
    ctx.fill();
  });
  place(sign, xx, yy + 4.6, z - 0.01);
}

// -------------------------------------------------------------- checkpoint

export function buildCheckpoint(k: Deco, x: Extras, z: number): void {
  const c = k.c;
  const t = k.track;
  const g = k.hero;
  const xl = t.leftEdge(z) - 1.4, xr = t.rightEdge(z) + 1.4;
  const yl = t.heightAt(xl, z), yr = t.heightAt(xr, z);
  const top = Math.max(yl, yr) + 7.5;
  const frame = mix(c.pal.propC, c.metal, 0.3);
  for (const [px, py] of [[xl, yl], [xr, yr]] as const) {
    g.box(px, (py + top) / 2, z, 1, top - py, 1, frame, { top: c.hazard });
    g.box(px, py + 0.5, z, 1.6, 1, 1.6, c.concrete);
    k.boxes.push({ x: px, y: (py + top) / 2, z, sx: 1, sy: top - py, sz: 1, yaw: 0 });
    // flag on top
    g.box(px, top + 1.5, z, 0.1, 3, 0.1, c.metal);
    g.box(px + 0.6, top + 2.6, z, 1.2, 0.7, 0.04, c.pal.propA);
  }
  g.box((xl + xr) / 2, top, z, xr - xl + 1, 1.2, 1, frame);
  // checkered strip across the road
  const n = 20;
  const xa = t.leftEdge(z), xb = t.rightEdge(z);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      const x0 = xa + ((xb - xa) * i) / n;
      const x1 = xa + ((xb - xa) * (i + 1)) / n;
      const zz = z - 1 + j;
      k.decal.poly([x0, t.heightAt(x0, zz) + 0.03, zz, x0, t.heightAt(x0, zz + 1) + 0.03, zz + 1, x1, t.heightAt(x1, zz + 1) + 0.03, zz + 1, x1, t.heightAt(x1, zz) + 0.03, zz], (i + j) % 2 ? c.white : c.dark, 0);
    }
  }
  const banner = textPlane(x, "checkpoint", Math.min(16, xr - xl - 2), 2.2, 1024, (ctx, W, H) => {
    const sq = H / 4;
    for (let i = 0; i < W / sq; i++) {
      for (let j = 0; j < 4; j++) {
        if (j === 1 || j === 2) continue;
        ctx.fillStyle = (i + j) % 2 ? "#ffffff" : "#111111";
        ctx.fillRect(i * sq, j * sq, sq, sq);
      }
    }
    ctx.fillStyle = toHex(c.hazard);
    ctx.fillRect(0, sq, W, sq * 2);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, "CHECKPOINT", W * 0.9, sq * 1.8);
    ctx.fillText("CHECKPOINT", W / 2, H / 2);
  });
  place(banner, (xl + xr) / 2, top, z - 0.8);
  // blinking amber lamps (separate meshes)
  const lampMat = toon(x.scene, toHex(c.glowWarm), { emissive: 1.2 });
  const lamps: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const lamp = MeshBuilder.CreateSphere(`cpLamp${i}`, { diameter: 0.45, segments: 4 }, x.scene);
    lamp.material = lampMat;
    lamp.position.set(xl + ((xr - xl) * (i + 0.5)) / 6, top + 0.75, z - 0.2);
    lamp.isPickable = false;
    lamps.push(lamp);
    x.nodes.push(lamp);
  }
  x.animators.push((time) => {
    for (let i = 0; i < lamps.length; i++) lamps[i].isVisible = Math.floor(time * 3 + i) % 2 === 0;
  });
}

// ------------------------------------------------------------------- evac

export function buildEvac(k: Deco, x: Extras, z: number): void {
  const c = k.c;
  const t = k.track;
  const g = k.hero;
  const glow = k.glow;
  const rng = new Rng(k.track.seed + 7);
  const xl = t.leftEdge(z) - 2.2, xr = t.rightEdge(z) + 2.2;
  const y = t.heightAt(0, z);
  const green = rgb("#42f58d");
  const towerH = 10;
  // ---- gate towers
  for (const px of [xl, xr]) {
    const s = Math.sign(px);
    g.box(px, towerH / 2, z, 3.4, towerH, 3.4, c.concrete, { taper: 0.9, top: tint(c.concrete, -0.2) });
    g.box(px, towerH + 0.4, z, 4.2, 0.8, 4.2, tint(c.concrete, -0.1));
    for (let i = 0; i < 3; i++) g.box(px, 2 + i * 3, z - 1.72, 3.5, 0.3, 0.04, c.hazard);
    glow.box(px, towerH - 1.2, z - 1.75, 1.6, 0.5, 0.06, green);
    k.boxes.push({ x: px, y: y + towerH / 2, z, sx: 3.4, sy: towerH, sz: 3.4, yaw: 0 });
    // open gate leaf swung outward
    g.at(Xf.trs(px - s * 1.7, y, z + 0.5, s * 1.2), () => {
      g.box(-s * 3, 2.2, 0, 6, 4.4, 0.25, mix(c.pal.propA, c.metal, 0.3));
      for (let i = 0; i < 4; i++) g.box(-s * 3, 0.6 + i * 1.1, 0.14, 6, 0.15, 0.06, c.metal);
    });
    // flag poles
    for (const dz of [-6, 6]) {
      g.box(px + s * 3, y + 6, z + dz, 0.16, 12, 0.16, c.metal);
    }
    // HESCO walls from the towers to the boundary
    const wallLen = SHOULDER + 1;
    g.at(Xf.trs(px + s * (1.7 + wallLen / 2), y, z, Math.PI / 2), () => hesco(g, c, wallLen));
    // floodlight tower
    g.at(Xf.trs(px + s * 6, y, z + 14, 0), () => {
      g.box(0, 6, 0, 0.4, 12, 0.4, c.metal);
      g.box(0, 12.2, 0, 2.4, 1.2, 0.5, c.dark);
    });
    glow.box(px + s * 6, y + 12.2, z + 14 - 0.27, 2.1, 0.9, 0.06, c.glowWarm);
  }
  // waving flags (animated)
  const flagMat = toon(x.scene, toHex(c.pal.propC));
  const flags: Mesh[] = [];
  for (const px of [xl, xr]) {
    for (const dz of [-6, 6]) {
      const f = MeshBuilder.CreateBox("evacFlag", { width: 2.4, height: 1.5, depth: 0.05 }, x.scene);
      f.setPivotPoint(new Vector3(-1.2, 0, 0));
      f.position.set(px + Math.sign(px) * 3 + 1.2, y + 11.2, z + dz);
      f.material = flagMat;
      f.isPickable = false;
      flags.push(f);
      x.nodes.push(f);
      Shadows.cast(f);
    }
  }
  // arch beam + EVAC sign
  g.box((xl + xr) / 2, y + towerH - 0.4, z, xr - xl, 1.2, 1.2, tint(c.concrete, -0.1));
  const sign = textPlane(x, "evacSign", 12, 2.6, 1024, (ctx, W, H) => {
    ctx.fillStyle = "#0a1f12";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#42f58d";
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.fillStyle = "#7dffb2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, "EVAC ZONE", W * 0.86, H * 0.66);
    ctx.fillText("EVAC ZONE", W / 2, H * 0.53);
  }, 1.4);
  place(sign, (xl + xr) / 2, y + towerH + 1.4, z - 0.65);
  g.box((xl + xr) / 2, y + towerH + 1.4, z, 12.6, 3, 0.4, c.dark);

  // ---- helipad plaza beyond the gate
  const pz = z + 62;
  const px = 0;
  const py = t.heightAt(px, pz);
  k.decal.disc(px, py + 0.03, pz, 14, 24, tint(c.concrete, -0.08));
  k.decal.ring(px, py + 0.05, pz, 11, 12, 24, rgb("#ffd23a"));
  // the "H"
  k.decal.pad(px - 2.6, py + 0.05, pz, 1.2, 8, c.white);
  k.decal.pad(px + 2.6, py + 0.05, pz, 1.2, 8, c.white);
  k.decal.pad(px, py + 0.05, pz, 4, 1.2, c.white);
  // landing lights ring (pulsing)
  const lightMat = toon(x.scene, toHex(green), { emissive: 1.4 });
  const ringLights: Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = MeshBuilder.CreateCylinder(`padLight${i}`, { diameter: 0.5, height: 0.25, tessellation: 6 }, x.scene);
    l.position.set(px + Math.cos(a) * 13, py + 0.12, pz + Math.sin(a) * 13);
    l.material = lightMat;
    l.isPickable = false;
    ringLights.push(l);
    x.nodes.push(l);
  }
  // helicopter waiting on the pad
  const heli = new TransformNode("heli", x.scene);
  heli.position.set(px + 4, py, pz + 3);
  heli.rotation.y = -0.6;
  x.nodes.push(heli);
  const hg = new Geo();
  const hc = mix(c.pal.propA, rgb("#4b5a3a"), 0.5);
  hg.box(0, 1.9, 0, 2.6, 2.3, 5, hc, { taper: 0.85, top: tint(hc, 0.1) });
  hg.box(0, 2.2, 2.6, 2.2, 1.6, 1.4, c.glass, { taperZ: 0.6, taperX: 0.8 });
  hg.box(0, 2.3, -5, 0.7, 0.8, 6, hc, { taper: 0.7 });
  hg.box(0, 3.3, -7.6, 0.2, 2, 1.2, hc);
  hg.box(0, 3.2, 0, 1.2, 0.6, 1.6, tint(hc, -0.1));
  hg.box(0, 3.65, 0, 0.3, 0.5, 0.3, c.dark);
  for (const s of [-1, 1]) {
    hg.box(s * 1.2, 0.15, 0, 0.18, 0.18, 4.4, c.dark);
    hg.box(s * 1.0, 0.6, 1.2, 0.12, 0.9, 0.12, c.dark);
    hg.box(s * 1.0, 0.6, -1.2, 0.12, 0.9, 0.12, c.dark);
  }
  hg.box(1.32, 1.9, 0.3, 0.04, 1.2, 1.2, c.white);
  hg.box(1.33, 1.9, 0.3, 0.05, 0.9, 0.3, c.red);
  hg.box(1.33, 1.9, 0.3, 0.05, 0.3, 0.9, c.red);
  const heliMat = toon(x.scene, "#ffffff");
  const heliMesh = hg.toMesh("heliBody", x.scene, heliMat)!;
  heliMesh.parent = heli;
  heliMesh.receiveShadows = true;
  x.nodes.push(heliMesh);
  Shadows.cast(heliMesh);
  const rotorG = new Geo();
  for (let i = 0; i < 4; i++) rotorG.at(Xf.trs(0, 0, 0, (i * Math.PI) / 2), () => rotorG.box(0, 0, 3.6, 0.5, 0.08, 7, c.dark));
  rotorG.cyl(0, -0.1, 0, 0.35, 0.35, 0.25, 6, c.metal);
  const rotor = rotorG.toMesh("heliRotor", x.scene, heliMat)!;
  rotor.parent = heli;
  rotor.position.set(0, 4, 0);
  x.nodes.push(rotor);
  Shadows.cast(rotor);
  const tail = new Geo();
  for (let i = 0; i < 2; i++) tail.at(Xf.trs(0, 0, 0, 0, 1, (i * Math.PI) / 2), () => tail.box(0, 0, 0, 0.06, 2.2, 0.25, c.dark));
  const tailRotor = tail.toMesh("heliTail", x.scene, heliMat)!;
  tailRotor.parent = heli;
  tailRotor.position.set(0.3, 3.4, -7.6);
  x.nodes.push(tailRotor);
  k.boxes.push({ x: heli.position.x, y: py + 1.9, z: heli.position.z, sx: 2.6, sy: 3.4, sz: 7, yaw: -0.6 });

  // light beacon column (translucent, visible from afar)
  const beaconMat = new StandardMaterial("evacBeacon", x.scene);
  beaconMat.emissiveColor = new Color3(green[0], green[1], green[2]);
  beaconMat.diffuseColor = Color3.Black();
  beaconMat.disableLighting = true;
  beaconMat.alpha = 0.22;
  beaconMat.backFaceCulling = false;
  const beacon = MeshBuilder.CreateCylinder("evacBeam", { diameterTop: 7, diameterBottom: 4, height: 160, tessellation: 12, cap: 0 }, x.scene);
  beacon.material = beaconMat;
  beacon.position.set(px, py + 80, pz);
  beacon.isPickable = false;
  beacon.applyFog = false;
  x.nodes.push(beacon, beaconMat);

  // flares with red smoke
  const flareMat = toon(x.scene, "#ff3b2f", { emissive: 1.5 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const fx = px + Math.cos(a) * 15.5, fz = pz + Math.sin(a) * 15.5;
    const fy = t.heightAt(fx, fz);
    const flare = MeshBuilder.CreateCylinder(`flare${i}`, { diameter: 0.18, height: 0.5, tessellation: 5 }, x.scene);
    flare.material = flareMat;
    flare.position.set(fx, fy + 0.2, fz);
    flare.rotation.z = 0.5;
    flare.isPickable = false;
    x.nodes.push(flare);
    const ps = new ParticleSystem(`flareSmoke${i}`, 90, x.scene);
    ps.particleTexture = x.softTexture();
    ps.emitter = new Vector3(fx, fy + 0.4, fz);
    ps.minEmitBox = new Vector3(-0.1, 0, -0.1);
    ps.maxEmitBox = new Vector3(0.1, 0, 0.1);
    ps.color1 = new Color4(1, 0.25, 0.2, 0.55);
    ps.color2 = new Color4(1, 0.45, 0.3, 0.4);
    ps.colorDead = new Color4(0.6, 0.3, 0.3, 0);
    ps.minSize = 0.6;
    ps.maxSize = 1.6;
    ps.minLifeTime = 2;
    ps.maxLifeTime = 3.5;
    ps.emitRate = 22;
    ps.gravity = new Vector3(0.6, 1.2, 0);
    ps.direction1 = new Vector3(-0.3, 1, -0.3);
    ps.direction2 = new Vector3(0.3, 1.6, 0.3);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 1.2;
    ps.addSizeGradient(0, 0.5);
    ps.addSizeGradient(1, 2.5);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    x.nodes.push(ps);
  }
  // sandbag emplacements + parked military trucks on the plaza edges
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const zz = z + 24 + i * 26;
      const xx = s * (HW + 6);
      k.lit.at(Xf.trs(xx, t.heightAt(xx, zz), zz, rng.range(-0.3, 0.3)), () => sandbags(k.lit, c, 5, 3, rng));
    }
    const tx = s * (HW + 4), tz = z + 40;
    k.lit.at(Xf.trs(tx, t.heightAt(tx, tz), tz, 0.1 * s), () => car(k.lit, c, tint(rgb("#5b6b4f"), -0.1), "truck", rng, false));
    k.boxes.push({ x: tx, y: t.heightAt(tx, tz) + 1.8, z: tz, sx: 2.4, sy: 3.6, sz: 7.5, yaw: 0.1 * s });
  }

  x.animators.push((time, dt) => {
    rotor.rotation.y += dt * 6;
    tailRotor.rotation.x += dt * 14;
    const pulse = Math.floor(time * 8) % 16;
    for (let i = 0; i < ringLights.length; i++) ringLights[i].isVisible = (i + pulse) % 4 !== 0;
    for (let i = 0; i < flags.length; i++) flags[i].rotation.y = Math.sin(time * 3 + i) * 0.35;
    beaconMat.alpha = 0.18 + Math.sin(time * 2) * 0.05;
  });
}

// --------------------------------------------------------------- overpass

export function buildOverpass(k: Deco, z: number): void {
  const c = k.c;
  const t = k.track;
  const g = k.lit;
  const xl = t.leftEdge(z) - SHOULDER - 6, xr = t.rightEdge(z) + SHOULDER + 6;
  const y = Math.max(t.heightAt(t.laneX(z, 0), z), t.heightAt(xl, z), t.heightAt(xr, z)) + 8.5;
  const deck = tint(c.concrete, -0.1);
  g.box((xl + xr) / 2, y, z, xr - xl, 1.4, 10, deck, { bottom: tint(deck, -0.35) });
  g.box((xl + xr) / 2, y + 1.1, z - 4.8, xr - xl, 0.8, 0.4, c.concrete);
  g.box((xl + xr) / 2, y + 1.1, z + 4.8, xr - xl, 0.8, 0.4, c.concrete);
  g.box((xl + xr) / 2, y - 0.2, z - 5.02, xr - xl, 0.4, 0.06, c.hazard);
  for (const px of [t.leftEdge(z) - SHOULDER - 1.5, t.rightEdge(z) + SHOULDER + 1.5]) {
    const py = t.heightAt(px, z);
    g.box(px, (py + y) / 2, z, 2.2, y - py, 6, c.concrete, { taperZ: 0.85 });
    k.boxes.push({ x: px, y: (py + y) / 2, z, sx: 2.2, sy: y - py, sz: 6, yaw: 0 });
  }
  k.boxes.push({ x: (xl + xr) / 2, y, z, sx: xr - xl, sy: 1.4, sz: 10, yaw: 0 });
  // lamps underneath (glow)
  for (let i = 0; i < 4; i++) {
    const xx = t.leftEdge(z) + ((t.rightEdge(z) - t.leftEdge(z)) * (i + 0.5)) / 4;
    k.glow.box(xx, y - 0.75, z, 1.2, 0.1, 0.4, c.glowWarm);
  }
  // abandoned car on the deck
  const rng = new Rng(Math.floor(z));
  g.at(Xf.trs(rng.range(xl + 6, xr - 6), y + 0.7, z + rng.range(-2, 2), Math.PI / 2 + rng.range(-0.3, 0.3)), () => car(g, c, rng.pick(c.carColors), "sedan", rng));
  // green highway sign on the deck
  g.box(t.laneX(z, 0), y + 2.2, z - 5.1, 5, 2, 0.2, mix(c.pal.propC, rgb("#1f7a4a"), 0.6));
  g.box(t.laneX(z, 0), y + 2.2, z - 5.22, 4.4, 0.3, 0.04, c.white);
}

/** Wall at the very end of the road (past the evac zone). */
export function buildEndWall(k: Deco, z: number): void {
  const c = k.c;
  const t = k.track;
  const xl = t.leftEdge(z) - SHOULDER - 2, xr = t.rightEdge(z) + SHOULDER + 2;
  const y = t.heightAt(0, z);
  k.lit.at(Xf.trs((xl + xr) / 2, y, z, Math.PI / 2), () => hesco(k.lit, c, xr - xl));
  k.lit.box((xl + xr) / 2, y + 3, z + 1.5, xr - xl, 6, 1, c.concrete);
  k.boxes.push({ x: (xl + xr) / 2, y: y + 4, z: z + 1, sx: xr - xl, sy: 10, sz: 2, yaw: 0 });
}

/** Big chevron + split sign at a fork nose. */
export function buildForkSign(k: Deco, x: Extras, z: number, mainSide: number): void {
  const c = k.c;
  const t = k.track;
  const xx = t.baseCenter(z);
  const yy = t.heightAt(xx, z);
  k.hero.at(Xf.trs(xx, yy, z, 0), () => {
    k.hero.box(-1.8, 1.6, 0.1, 0.2, 3.2, 0.2, c.metal);
    k.hero.box(1.8, 1.6, 0.1, 0.2, 3.2, 0.2, c.metal);
    k.hero.box(0, 0.3, 0, 3, 0.6, 1.2, c.concrete);
  });
  const riskyLeft = mainSide > 0;
  const sign = textPlane(x, `fork_${z}`, 4.6, 2, 512, (ctx, W, H) => {
    ctx.fillStyle = toHex(c.dark);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = toHex(c.hazard);
    ctx.fillRect(W / 2 - 4, 10, 8, H - 20);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const half = (label: string, sub: string, cx: number, col: string, arrowDir: number) => {
      ctx.fillStyle = col;
      fitText(ctx, label, W * 0.4, 52);
      ctx.fillText(label, cx, H * 0.34);
      fitText(ctx, sub, W * 0.42, 30, "700");
      ctx.fillText(sub, cx, H * 0.62);
      ctx.font = `900 54px ${FONT}`;
      ctx.fillText(arrowDir < 0 ? "◀" : "▶", cx, H * 0.85);
    };
    const riskyCol = "#ff5a3c";
    const safeCol = "#ffffff";
    half(riskyLeft ? "SHORTCUT" : "DETOUR", riskyLeft ? "JUMPS!" : "SAFER", W * 0.25, riskyLeft ? riskyCol : safeCol, -1);
    half(riskyLeft ? "DETOUR" : "SHORTCUT", riskyLeft ? "SAFER" : "JUMPS!", W * 0.75, riskyLeft ? safeCol : riskyCol, 1);
  });
  place(sign, xx, yy + 2.6, z - 0.01);
}

/** Soft round particle texture, shared. */
export function makeSoftTexture(scene: Scene): Texture {
  const tex = new DynamicTexture("softDot", { width: 64, height: 64 }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  tex.hasAlpha = true;
  tex.update(true);
  return tex;
}

