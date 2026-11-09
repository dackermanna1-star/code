/**
 * World materials: the procedural asphalt texture and the few private toon
 * materials the world needs (textured road, z-offset decals). Shared props
 * use the cached `toon()` materials from fx/Materials.ts with vertex colors.
 */
import { Color3, Constants, DynamicTexture, StandardMaterial, Texture, type Material, type Scene } from "@babylonjs/core";
import type { LevelDef } from "../data/levels";
import { shade, toon } from "../fx/Materials";
import { Rng } from "./rng";

/** Length of road (m) covered by one repeat of the asphalt texture. */
export const ROAD_TILE = 26;

/**
 * A private StandardMaterial with the same cel-shading plugin as `toon()`.
 * (The plugin class isn't exported, so we borrow its constructor from a
 * cached toon material.) Used where we need our own textures/settings.
 */
export function ownToon(scene: Scene, name: string): StandardMaterial {
  const ref = toon(scene, "#ffffff");
  const plugin = ref.pluginManager?.getPlugin("Toon");
  const m = new StandardMaterial(name, scene);
  m.specularColor = Color3.Black();
  m.diffuseColor = Color3.White();
  if (plugin) new (plugin.constructor as new (mat: Material) => unknown)(m);
  return m;
}

export interface WorldMaterials {
  lit: StandardMaterial;
  /** Additive soft light pools on the ground under lamps (night levels). */
  pool: StandardMaterial;
  glow: StandardMaterial;
  road: StandardMaterial;
  decal: StandardMaterial;
  sky: StandardMaterial;
  dispose(): void;
}

export function createMaterials(scene: Scene, def: LevelDef, quality: number, soft: Texture): WorldMaterials {
  const lit = toon(scene, "#ffffff");
  const glow = toon(scene, "#ffffff", { emissive: 1 });
  const sky = toon(scene, "#ffffff", { unlit: true });
  const road = ownToon(scene, "worldRoad");
  const tex = roadTexture(scene, def, quality);
  road.diffuseTexture = tex;
  const decal = ownToon(scene, "worldDecal");
  decal.zOffset = -2;
  const pool = new StandardMaterial("worldLightPool", scene);
  pool.disableLighting = true;
  pool.emissiveColor = Color3.White();
  pool.opacityTexture = soft;
  pool.alphaMode = Constants.ALPHA_ADD;
  pool.zOffset = -4;
  pool.backFaceCulling = false;
  pool.fogEnabled = true;
  return {
    lit, glow, road, decal, sky, pool,
    dispose() {
      pool.dispose();
      tex.dispose();
      road.dispose();
      decal.dispose();
    },
  };
}

/**
 * Asphalt texture: u spans one 13 m branch (edge lines at both sides, dashed
 * center line), v spans ROAD_TILE meters. Cracks, patches, tire wear and
 * biome grime (sand drifts, snow, puddles, tracks) are painted procedurally.
 */
function roadTexture(scene: Scene, def: LevelDef, quality: number): DynamicTexture {
  const W = quality === 0 ? 256 : 512;
  const H = W * 2;
  const tex = new DynamicTexture("roadTex", { width: W, height: H }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const p = def.palette;
  const rng = new Rng(def.id * 977 + 3);
  const mPerPxU = 13 / W;
  const px = (m: number) => m / mPerPxU; // meters across -> px
  const py = (m: number) => (m / ROAD_TILE) * H; // meters along -> px

  ctx.fillStyle = p.road;
  ctx.fillRect(0, 0, W, H);
  // aggregate speckle
  for (let i = 0; i < W * H * 0.012; i++) {
    ctx.fillStyle = rng.chance(0.5) ? shade(p.road, rng.range(0.04, 0.12)) : shade(p.road, -rng.range(0.05, 0.18));
    const s = rng.range(1, 3);
    ctx.fillRect(rng.range(0, W), rng.range(0, H), s, s);
  }
  // tire wear bands
  for (const u of [3.2, 9.8]) {
    const grd = ctx.createLinearGradient(px(u - 1.2), 0, px(u + 1.2), 0);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.12)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(px(u - 1.2), 0, px(2.4), H);
  }
  // patches (tar repairs)
  for (let i = 0; i < 3; i++) {
    const w = px(rng.range(1.2, 3)), h = py(rng.range(1.2, 3.5));
    const x = rng.range(px(0.8), W - w - px(0.8)), y = rng.range(0, H - h);
    ctx.fillStyle = shade(p.road, rng.chance(0.5) ? -0.07 : 0.05);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = shade(p.road, -0.22);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }
  // cracks
  const crack = (x: number, y: number, len: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = rng.range(0, Math.PI * 2);
    for (let i = 0; i < len; i++) {
      a += rng.range(-0.8, 0.8);
      x += Math.cos(a) * rng.range(6, 18);
      y += Math.sin(a) * rng.range(6, 18);
      ctx.lineTo(x, y);
      if (rng.chance(0.15)) crack(x, y, Math.floor(len / 3));
    }
    ctx.stroke();
  };
  ctx.strokeStyle = shade(p.road, -0.45);
  ctx.lineWidth = Math.max(1.5, W / 256);
  for (let i = 0; i < 9; i++) crack(rng.range(0, W), rng.range(0, H), rng.int(5, 12));
  // paint: worn edge lines + dashed center
  const line = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = p.roadLine;
    ctx.fillRect(x, y, w, h);
    // wear: chip bits out of the paint
    ctx.fillStyle = shade(p.road, 0.02);
    for (let i = 0; i < (w * h) / 220; i++) ctx.fillRect(x + rng.range(0, w), y + rng.range(0, h), rng.range(1, 4), rng.range(1, 5));
  };
  const lw = px(0.18);
  line(px(0.45), 0, lw, H);
  line(W - px(0.45) - lw, 0, lw, H);
  const dash = py(3), period = H / 4;
  for (let i = 0; i < 4; i++) line(W / 2 - lw / 2, i * period + period * 0.2, lw, dash);
  // skid marks
  for (let i = 0; i < 2; i++) {
    const x = rng.range(px(2), W - px(3));
    const y = rng.range(0, H - py(8));
    ctx.strokeStyle = "rgba(10,10,12,0.35)";
    ctx.lineWidth = px(0.22);
    for (const o of [0, px(1.6)]) {
      ctx.beginPath();
      ctx.moveTo(x + o, y);
      ctx.bezierCurveTo(x + o + px(0.3), y + py(3), x + o - px(0.4), y + py(5), x + o + px(0.8), y + py(8));
      ctx.stroke();
    }
  }
  // biome grime at the edges
  const edge = (color: string, alpha: number, width: number, blobs: number) => {
    for (const side of [0, 1]) {
      const grd = ctx.createLinearGradient(side ? W : 0, 0, side ? W - px(width) : px(width), 0);
      grd.addColorStop(0, hexA(color, alpha));
      grd.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(side ? W - px(width) : 0, 0, px(width), H);
      for (let i = 0; i < blobs; i++) {
        const y = rng.range(0, H);
        const r = px(rng.range(0.1, 0.35));
        ctx.fillStyle = hexA(color, alpha * rng.range(0.2, 0.45));
        ctx.beginPath();
        ctx.ellipse(side ? W - rng.range(0, px(width * 0.6)) : rng.range(0, px(width * 0.6)), y, r, r * rng.range(3, 7), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  switch (def.biome) {
    case "desert":
      edge(p.ground, 0.6, 1.1, 10);
      break;
    case "frozen":
      edge(p.ground, 0.9, 1.6, 18);
      // slush streaks in the wheel tracks
      ctx.fillStyle = hexA(p.ground, 0.12);
      for (let i = 0; i < 30; i++) ctx.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 6), rng.range(20, 60));
      break;
    case "city":
      // puddles reflecting the neon
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = hexA(p.sky, 0.55);
        ctx.beginPath();
        ctx.ellipse(rng.range(px(1), W - px(1)), rng.range(0, H), px(rng.range(0.4, 1.2)), py(rng.range(0.6, 1.6)), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // manhole
      ctx.fillStyle = shade(p.road, -0.3);
      ctx.beginPath();
      ctx.arc(px(9.5), py(13), px(0.4), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "military":
      edge(p.ground, 0.55, 1.0, 10);
      // tank tread marks
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 6) {
        ctx.fillRect(px(4), y, px(0.6), 3);
        ctx.fillRect(px(6.2), y, px(0.6), 3);
      }
      break;
    case "suburbs":
      edge(p.ground, 0.25, 0.6, 6);
      break;
  }
  tex.update(true);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = quality === 0 ? 2 : 8;
  return tex;
}

function hexA(hex: string, a: number): string {
  const c = Color3.FromHexString(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
