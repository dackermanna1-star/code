/**
 * Sky, lighting, fog, shadows and weather for a level.
 *
 * - Gradient sky dome (vertex colors, unlit) with sun/moon disc, clouds or
 *   stars and a ring of distant silhouettes, re-centered on the camera.
 * - EXP2 fog from the palette, hemispheric ambient + directional sun with a
 *   PCF shadow generator whose ortho frustum follows the car.
 * - Weather particle systems (dust / rain / snow / ash) that follow the
 *   active camera and lead it by its velocity so fast driving stays inside.
 */
import {
  Color3, Color4, DirectionalLight, HemisphericLight, ParticleSystem, Scene, ShadowGenerator, Vector3,
  type Mesh, type Observer, type Texture,
} from "@babylonjs/core";
import type { LevelDef } from "../data/levels";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { Geo, mix, rgb, tint, Xf, type RGB } from "./Geo";
import { Rng } from "./rng";

const SKY_R = 900;

export class Atmosphere {
  readonly hemi: HemisphericLight;
  readonly sun: DirectionalLight;
  readonly shadows: ShadowGenerator;
  private sky: Mesh | null;
  private weather: ParticleSystem[] = [];
  private emitter = new Vector3();
  private camPrev = new Vector3();
  private camVel = new Vector3();
  private sunDir: Vector3;
  private target = new Vector3();
  private obs: Observer<Scene> | null = null;
  private flashT = 0;
  private flashCooldown = 6;
  private baseHemi: number;
  private rng = new Rng(4242);

  constructor(private scene: Scene, private def: LevelDef, quality: number, softTex: Texture) {
    const p = def.palette;
    const night = def.night;

    // ---- fog / clear color
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = def.fogDensity;
    scene.fogColor = Color3.FromHexString(p.fog);
    scene.clearColor = Color4.FromColor3(Color3.FromHexString(p.fog), 1);
    scene.ambientColor = Color3.Black();

    // ---- lights
    this.hemi = new HemisphericLight("hemi", new Vector3(0.1, 1, -0.2), scene);
    this.hemi.diffuse = Color3.FromHexString(p.ambient);
    this.hemi.groundColor = Color3.FromHexString(p.ambientGround);
    this.hemi.specular = Color3.Black();
    // Keep ambient below the toon shader's top band threshold so cast shadows
    // (which remove the sun term) drop into the mid band and stay visible.
    this.hemi.intensity = this.baseHemi = night ? 0.5 : 0.4;

    // Sun elevation/azimuth per biome: low dawn sun in the desert, high sun
    // elsewhere; it sits ahead-left so the disc shows in the driving view.
    const elev = { desert: 0.42, suburbs: 0.8, city: 0.75, frozen: 0.55, military: 0.62 }[def.biome];
    const azim = { desert: -0.55, suburbs: -0.9, city: 0.6, frozen: 0.5, military: -0.7 }[def.biome];
    const toSun = new Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)).normalize();
    this.sunDir = toSun.scale(-1);
    this.sun = new DirectionalLight("sun", this.sunDir.clone(), scene);
    this.sun.diffuse = Color3.FromHexString(p.sun);
    this.sun.specular = Color3.Black();
    this.sun.intensity = night ? 0.55 : 1.05;

    // ---- shadows: ortho box around the car
    const mapSize = [1024, 2048, 4096][quality] ?? 2048;
    this.sun.autoUpdateExtends = false;
    this.sun.autoCalcShadowZBounds = false;
    const ext = [32, 42, 52][quality] ?? 42;
    this.sun.orthoLeft = -ext;
    this.sun.orthoRight = ext;
    this.sun.orthoTop = ext;
    this.sun.orthoBottom = -ext;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 400;
    this.shadows = new ShadowGenerator(mapSize, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = quality >= 1 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.0015;
    this.shadows.normalBias = 0.02;
    this.shadows.darkness = 0;
    this.shadows.transparencyShadow = false;
    Shadows.set(this.shadows);
    this.follow(Vector3.ZeroReadOnly as Vector3);

    // ---- sky dome
    this.sky = this.buildSky(toSun, quality);

    // ---- weather
    this.buildWeather(quality, softTex);

    // Opaque geometry front-to-back with the sky dome last, so the big
    // full-screen layers are mostly rejected by the depth test.
    const sky = this.sky;
    scene.setRenderingOrder(0, (a, b) => {
      const am = a.getMesh() === sky, bm = b.getMesh() === sky;
      if (am !== bm) return am ? 1 : -1;
      return a._distanceToCamera - b._distanceToCamera;
    });

    this.obs = scene.onBeforeRenderObservable.add(() => this.onFrame());
  }

  /** Keep the shadow frustum centered slightly ahead of the car. */
  follow(car: Vector3): void {
    this.target.set(car.x, car.y, car.z + 14);
    // Snap to a coarse grid to reduce shimmering when moving slowly.
    const snap = 0.5;
    this.target.x = Math.round(this.target.x / snap) * snap;
    this.target.z = Math.round(this.target.z / snap) * snap;
    this.sun.position.set(this.target.x - this.sunDir.x * 200, this.target.y - this.sunDir.y * 200, this.target.z - this.sunDir.z * 200);
  }

  update(dt: number, carPos: Vector3): void {
    this.follow(carPos);
    // Night city: occasional lightning flash through the rain.
    if (this.def.weather === "rain") {
      this.flashCooldown -= dt;
      if (this.flashCooldown <= 0) {
        this.flashT = 0.35;
        this.flashCooldown = this.rng.range(7, 16);
      }
      if (this.flashT > 0) {
        this.flashT -= dt;
        const f = this.flashT > 0.22 || (this.flashT < 0.15 && this.flashT > 0.08) ? 1 : 0;
        this.hemi.intensity = this.baseHemi + f * 1.2;
      } else this.hemi.intensity = this.baseHemi;
    }
  }

  private onFrame(): void {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const cp = cam.globalPosition;
    if (this.sky) this.sky.position.copyFrom(cp);
    // camera velocity (smoothed) so particles are emitted ahead of fast motion
    const dt = Math.max(1 / 240, this.scene.getEngine().getDeltaTime() / 1000);
    const vx = (cp.x - this.camPrev.x) / dt, vy = (cp.y - this.camPrev.y) / dt, vz = (cp.z - this.camPrev.z) / dt;
    const jump = Math.abs(vx) + Math.abs(vz) > 400; // teleport, ignore
    if (!jump) {
      this.camVel.x += (vx - this.camVel.x) * 0.1;
      this.camVel.y += (vy - this.camVel.y) * 0.1;
      this.camVel.z += (vz - this.camVel.z) * 0.1;
    }
    this.camPrev.copyFrom(cp);
    const lead = 1.2;
    this.emitter.set(cp.x + this.camVel.x * lead, cp.y, cp.z + this.camVel.z * lead);
  }

  private buildSky(toSun: Vector3, quality: number): Mesh | null {
    const p = this.def.palette;
    const night = this.def.night;
    const g = new Geo();
    g.jitter = 0;
    const horizon = rgb(p.sky), top = rgb(p.skyTop), fog = rgb(p.fog), sunC = rgb(p.sun);
    const segs = 48, rings = 24;
    // Inward-facing dome: list polygons with inward normals (reverse order).
    const color = (dx: number, dy: number, dz: number): RGB => {
      let col: RGB;
      if (dy < 0) col = mix(fog, tint(fog, -0.1), Math.min(1, -dy * 3));
      else {
        const t = Math.pow(dy, 0.55);
        col = mix(mix(fog, horizon, Math.min(1, dy * 12)), top, t);
      }
      // sun halo
      const dot = dx * toSun.x + dy * toSun.y + dz * toSun.z;
      if (dot > 0) col = mix(col, night ? tint(sunC, -0.3) : tint(sunC, 0.2), Math.pow(dot, 18) * (night ? 0.35 : 0.75));
      return col;
    };
    // Smooth gradient: shared vertices with per-vertex colors.
    const R = SKY_R;
    for (let i = 0; i <= rings; i++) {
      const phi = -0.25 * Math.PI + (i / rings) * 0.75 * Math.PI; // -45deg .. +90deg elevation
      for (let k = 0; k <= segs; k++) {
        const th = (k / segs) * Math.PI * 2;
        const dx = Math.cos(phi) * Math.cos(th), dy = Math.sin(phi), dz = Math.cos(phi) * Math.sin(th);
        const col = color(dx, dy, dz);
        g.pos.push(dx * R, dy * R, dz * R);
        g.nrm.push(-dx, -dy, -dz);
        g.col.push(col[0], col[1], col[2], 1);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let k = 0; k < segs; k++) {
        const ak = i * (segs + 1) + k, aj = ak + 1, bk = ak + segs + 1, bj = bk + 1;
        g.idx.push(ak, bj, aj, ak, bk, bj);
      }
    }
    // sun / moon disc facing the center
    const sd = 0.93 * SKY_R;
    const sunPos = toSun.scale(sd);
    const yaw = Math.atan2(toSun.x, toSun.z);
    const pitch = -Math.asin(toSun.y);
    const discCol: RGB = night ? [0.93, 0.95, 1] : tint(sunC, 0.55);
    g.at(Xf.trs(sunPos.x, sunPos.y, sunPos.z, yaw, 1, pitch), () => {
      // disc in local XY plane facing -Z (toward the dome center)
      const r = night ? 28 : 40;
      const n = 16;
      const pts: number[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const a = (i / n) * Math.PI * 2;
        pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      }
      g.poly(pts, discCol, 0);
      const halo: number[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const a = (i / n) * Math.PI * 2;
        halo.push(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, 6);
      }
      g.poly(halo, mix(discCol, color(toSun.x, toSun.y, toSun.z), 0.45), 0);
    });

    const rng = new Rng(this.def.id * 31 + 5);
    if (night) {
      // stars
      for (let i = 0; i < 260; i++) {
        const th = rng.range(0, Math.PI * 2);
        const el = Math.asin(rng.range(0.12, 1));
        const d = new Vector3(Math.cos(el) * Math.cos(th), Math.sin(el), Math.cos(el) * Math.sin(th)).scaleInPlace(SKY_R * 0.95);
        const s = rng.range(1.2, 3.2);
        g.at(Xf.trs(d.x, d.y, d.z, Math.atan2(d.x, d.z), 1, -el), () => g.poly([-s, 0, 0, 0, s, 0, s, 0, 0, 0, -s, 0], [0.9, 0.9, rng.range(0.85, 1)], 0));
      }
    } else if (this.def.weather !== "ash") {
      // puffy low-poly clouds
      const cloudCol = mix([1, 1, 1], horizon, 0.25);
      const n = [6, 10, 14][quality] ?? 10;
      for (let i = 0; i < n; i++) {
        const th = rng.range(0, Math.PI * 2);
        const el = rng.range(0.1, 0.42);
        const d = SKY_R * 0.82;
        const cx = Math.cos(el) * Math.cos(th) * d, cy = Math.sin(el) * d, cz = Math.cos(el) * Math.sin(th) * d;
        g.at(Xf.trs(cx, cy, cz, th + Math.PI / 2), () => {
          const parts = rng.int(3, 6);
          for (let j = 0; j < parts; j++) {
            const r = rng.range(18, 36);
            g.blob(rng.range(-50, 50), rng.range(-6, 10), rng.range(-10, 10), r * 1.5, r * 0.75, r, j % 2 ? cloudCol : tint(cloudCol, -0.06), 7, 4, 0.1, j);
          }
          g.blob(0, -8, 0, 70, 6, 22, tint(cloudCol, -0.12), 8, 3);
        });
      }
    }

    // distant silhouettes (pre-fogged colors, not affected by scene fog)
    this.silhouettes(g, rng);

    const mat = toon(this.scene, "#ffffff", { unlit: true });
    const mesh = g.toMesh("skyDome", this.scene, mat);
    if (!mesh) return null;
    mesh.applyFog = false;
    mesh.infiniteDistance = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 0;
    mesh.isPickable = false;
    return mesh;
  }

  private silhouettes(g: Geo, rng: Rng): void {
    const p = this.def.palette;
    const fog = rgb(p.fog);
    const ground = rgb(p.ground);
    const far = mix(ground, fog, 0.72);
    const near = mix(ground, fog, 0.55);
    const R = SKY_R * 0.75;
    const biome = this.def.biome;
    const n = biome === "city" ? 70 : 28;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 + rng.range(-0.05, 0.05);
      const cx = Math.cos(th) * R, cz = Math.sin(th) * R;
      const yaw = Math.atan2(cx, cz);
      g.at(Xf.trs(cx, -30, cz, yaw), () => {
        const col = i % 2 ? far : near;
        switch (biome) {
          case "desert": {
            const h = rng.range(30, 80), w = rng.range(60, 160);
            g.box(0, h / 2, 0, w, h, 40, mix(col, rgb(p.propA), 0.15), { taper: rng.range(0.55, 0.8), top: tint(col, 0.05) });
            break;
          }
          case "frozen": {
            const h = rng.range(90, 200), w = rng.range(120, 220);
            g.cyl(0, 0, 0, w / 2, 0, h, 5, col, { angle: rng.range(0, 1) });
            g.cyl(0, h * 0.62, 0, (w / 2) * 0.38, 0, h * 0.38, 5, mix(rgb(p.ground), fog, 0.3), { angle: rng.range(0, 1) });
            break;
          }
          case "city": {
            const h = rng.range(60, 190), w = rng.range(25, 50);
            g.box(0, h / 2, 0, w, h, 20, tint(mix(rgb(p.ground), fog, 0.4), -0.1));
            for (let j = 0; j < 6; j++) {
              if (rng.chance(0.5)) g.box(rng.range(-w / 3, w / 3), rng.range(40, h - 5), -10.5, 3, 2, 0.5, mix(rgb(p.roadLine), fog, 0.35));
            }
            break;
          }
          default: {
            const h = rng.range(25, 60), w = rng.range(150, 260);
            g.blob(0, 0, 0, w / 2, h, 40, col, 8, 4, 0.08, i);
          }
        }
      });
    }
  }

  private buildWeather(quality: number, tex: Texture): void {
    const w = this.def.weather;
    if (w === "none") return;
    const s = this.scene;
    const q = [0.4, 1, 1.7][quality] ?? 1;
    const fog = rgb(this.def.palette.fog);
    const mk = (name: string, cap: number) => {
      const ps = new ParticleSystem(name, Math.round(cap * q), s);
      ps.particleTexture = tex;
      ps.emitter = this.emitter;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.minEmitPower = 1;
      ps.maxEmitPower = 1;
      ps.updateSpeed = 1 / 60;
      this.weather.push(ps);
      return ps;
    };
    if (w === "rain") {
      const ps = mk("rain", 1500);
      ps.minEmitBox = new Vector3(-35, 14, -15);
      ps.maxEmitBox = new Vector3(35, 22, 55);
      ps.direction1 = new Vector3(-1, -24, 0.5);
      ps.direction2 = new Vector3(1, -28, 1.5);
      ps.minLifeTime = 0.9;
      ps.maxLifeTime = 1.1;
      ps.emitRate = 1350 * q;
      ps.minSize = 0.06;
      ps.maxSize = 0.09;
      ps.minScaleY = 9;
      ps.maxScaleY = 14;
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      ps.color1 = new Color4(0.75, 0.82, 1, 0.45);
      ps.color2 = new Color4(0.6, 0.7, 0.95, 0.3);
      ps.colorDead = new Color4(0.6, 0.7, 0.95, 0);
    } else if (w === "snow") {
      const ps = mk("snow", 1800);
      ps.minEmitBox = new Vector3(-40, 8, -20);
      ps.maxEmitBox = new Vector3(40, 22, 60);
      ps.direction1 = new Vector3(-1.5, -2.2, -0.6);
      ps.direction2 = new Vector3(1.5, -3.2, 0.6);
      ps.minLifeTime = 4;
      ps.maxLifeTime = 6.5;
      ps.emitRate = 330 * q;
      ps.minSize = 0.12;
      ps.maxSize = 0.3;
      ps.color1 = new Color4(1, 1, 1, 0.95);
      ps.color2 = new Color4(0.9, 0.95, 1, 0.8);
      ps.colorDead = new Color4(1, 1, 1, 0);
      ps.minAngularSpeed = -2;
      ps.maxAngularSpeed = 2;
    } else if (w === "dust") {
      const ps = mk("dust", 700);
      ps.minEmitBox = new Vector3(-40, 0.5, -10);
      ps.maxEmitBox = new Vector3(40, 9, 70);
      ps.direction1 = new Vector3(4, -0.2, -1);
      ps.direction2 = new Vector3(7, 0.6, 1);
      ps.minLifeTime = 3;
      ps.maxLifeTime = 5;
      ps.emitRate = 130 * q;
      ps.minSize = 0.08;
      ps.maxSize = 0.22;
      const d = tint(fog, -0.15);
      ps.color1 = new Color4(d[0], d[1], d[2], 0.7);
      ps.color2 = new Color4(fog[0], fog[1], fog[2], 0.5);
      ps.colorDead = new Color4(fog[0], fog[1], fog[2], 0);
      // big soft drifting dust clouds near the ground
      const clouds = mk("dustClouds", 40);
      clouds.minEmitBox = new Vector3(-45, 0, 0);
      clouds.maxEmitBox = new Vector3(45, 3, 90);
      clouds.direction1 = new Vector3(2.5, 0, -0.5);
      clouds.direction2 = new Vector3(4.5, 0.3, 0.5);
      clouds.minLifeTime = 5;
      clouds.maxLifeTime = 8;
      clouds.emitRate = 5 * q;
      clouds.minSize = 5;
      clouds.maxSize = 10;
      clouds.color1 = new Color4(fog[0], fog[1], fog[2], 0.13);
      clouds.color2 = new Color4(d[0], d[1], d[2], 0.09);
      clouds.colorDead = new Color4(fog[0], fog[1], fog[2], 0);
    } else if (w === "ash") {
      const ps = mk("ash", 1400);
      ps.minEmitBox = new Vector3(-40, 6, -15);
      ps.maxEmitBox = new Vector3(40, 20, 60);
      ps.direction1 = new Vector3(-0.5, -1.4, -0.5);
      ps.direction2 = new Vector3(1.5, -2.2, 0.5);
      ps.minLifeTime = 5;
      ps.maxLifeTime = 8;
      ps.emitRate = 220 * q;
      ps.minSize = 0.1;
      ps.maxSize = 0.24;
      ps.color1 = new Color4(0.35, 0.33, 0.32, 0.9);
      ps.color2 = new Color4(0.6, 0.58, 0.55, 0.8);
      ps.colorDead = new Color4(0.5, 0.5, 0.5, 0);
      ps.minAngularSpeed = -1.5;
      ps.maxAngularSpeed = 1.5;
      const embers = mk("embers", 220);
      embers.minEmitBox = new Vector3(-35, 0, -5);
      embers.maxEmitBox = new Vector3(35, 6, 60);
      embers.direction1 = new Vector3(-0.5, 0.6, -0.5);
      embers.direction2 = new Vector3(1.2, 1.6, 0.5);
      embers.minLifeTime = 2;
      embers.maxLifeTime = 4;
      embers.emitRate = 40 * q;
      embers.minSize = 0.05;
      embers.maxSize = 0.12;
      embers.color1 = new Color4(1, 0.55, 0.15, 1);
      embers.color2 = new Color4(1, 0.3, 0.05, 1);
      embers.colorDead = new Color4(0.4, 0.1, 0, 0);
      embers.blendMode = ParticleSystem.BLENDMODE_ADD;
    }
    for (const ps of this.weather) ps.start();
  }

  dispose(): void {
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    for (const ps of this.weather) ps.dispose(false);
    this.weather = [];
    this.sky?.dispose();
    this.sky = null;
    if (Shadows.get() === this.shadows) Shadows.set(null);
    this.shadows.dispose();
    this.sun.dispose();
    this.hemi.dispose();
  }
}
