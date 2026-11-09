/**
 * World sandbox: http://localhost:5173/?sandbox=world&level=N&z=Z
 *
 *   level   level index (0..4)
 *   z       start distance along the road (m)
 *   speed   fly speed in m/s (0 = hold still), default 0
 *   view    chase (default) | top | side | low | back
 *   x       lateral camera offset from the road center (m)
 *
 * Builds the level, streams it around a camera that flies along the road.
 * `window.__level` / `window.__cam` are exposed for scripted screenshots,
 * and `window.__goto(z)` jumps the camera.
 */
import { MeshBuilder, PhysicsAggregate, PhysicsRaycastResult, PhysicsShapeType, UniversalCamera, Vector3 } from "@babylonjs/core";
import type { Game } from "../core/Game";
import { LEVELS } from "../data/levels";
import { Level } from "./Level";

export async function sandbox(game: Game): Promise<void> {
  const scene = game.resetScene();
  const p = new URLSearchParams(location.search);
  const li = Math.max(0, Math.min(LEVELS.length - 1, parseInt(p.get("level") ?? "0", 10) || 0));
  let z = parseFloat(p.get("z") ?? "0") || 0;
  const speed = parseFloat(p.get("speed") ?? "0") || 0;
  const view = p.get("view") ?? "chase";
  const xo = parseFloat(p.get("x") ?? "0") || 0;
  if (p.get("q")) game.save.data.settings.quality = p.get("q") as "low" | "medium" | "high";

  const level = new Level(game.ctx, LEVELS[li]);
  const cam = new UniversalCamera("sandboxCam", new Vector3(0, 5, -10), scene);
  cam.minZ = 0.1;
  cam.maxZ = 1500;
  cam.fov = 1.0;
  scene.activeCamera = cam;
  cam.attachControl(game.canvas, true);

  const focus = new Vector3();
  const target = new Vector3();
  const place = () => {
    const cx = level.roadCenterX(z) + xo;
    const h = level.heightAt(cx, z);
    const ahead = z + 30;
    const ax = level.roadCenterX(ahead) + xo;
    switch (view) {
      case "top":
        cam.position.set(cx, h + 90, z - 30);
        target.set(level.roadCenterX(z + 40), level.heightAt(cx, z + 40), z + 40);
        break;
      case "side":
        cam.position.set(cx + 26, h + 7, z);
        target.set(cx, h + 1, z + 4);
        break;
      case "low":
        cam.position.set(cx, h + 1.6, z);
        target.set(ax, level.heightAt(ax, ahead) + 1.2, ahead);
        break;
      case "back":
        cam.position.set(cx, h + 5, z + 14);
        target.set(level.roadCenterX(z - 20), level.heightAt(cx, z - 20) + 1, z - 20);
        break;
      default:
        cam.position.set(cx, h + 4.5, z - 9);
        target.set(ax, level.heightAt(ax, ahead) + 1, ahead);
    }
    cam.setTarget(target);
    focus.set(cx, h, z + 9);
  };
  place();

  // perf toggles for profiling: &off=shadow,weather,outline,fog,sky,props
  const off = new Set((p.get("off") ?? "").split(","));
  if (off.has("shadow")) level.atmosphere.shadows.getShadowMap()!.refreshRate = 0;
  if (off.has("weather")) scene.particlesEnabled = false;
  if (off.has("fog")) scene.fogEnabled = false;
  if (off.has("sky")) scene.getMeshByName("skyDome")?.setEnabled(false);
  scene.onNewMeshAddedObservable.add((m) => {
    if (off.has("outline")) setTimeout(() => (m.renderOutline = false));
    if (off.has("props") && /^(props|hero|glow)/.test(m.name)) setTimeout(() => m.setEnabled(false));
  });
  if (off.has("outline") || off.has("props")) for (const m of scene.meshes) {
    if (off.has("outline")) m.renderOutline = false;
    if (off.has("props") && /^(props|hero|glow)/.test(m.name)) m.setEnabled(false);
  }

  // Compare heightAt() against the physics collider (for testing).
  (window as any).__rayTest = (z0: number, z1: number, n = 200) => {
    const pe = scene.getPhysicsEngine() as unknown as { raycastToRef: (a: Vector3, b: Vector3, r: PhysicsRaycastResult, q: { collideWith: number }) => void };
    const res = new PhysicsRaycastResult();
    let maxErr = 0, misses = 0, worst = "";
    for (let i = 0; i < n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      const u = ((i * 7919) % 100) / 100 - 0.5;
      const x = level.roadCenterX(z) + u * 2 * (level.roadHalfWidth(z) + 9);
      const h = level.heightAt(x, z);
      pe.raycastToRef(new Vector3(x, h + 30, z), new Vector3(x, h - 30, z), res, { collideWith: 1 });
      if (!res.hasHit) { misses++; continue; }
      // skip ramps / wrecks / set pieces, which heightAt deliberately ignores
      if (level.features.some((f) => f.kind !== "ice" && z > f.z - 8 && z < f.z + f.len + 8)) continue;
      if (Math.abs(z - level.checkpointZ) < 6 || z > level.evacZ - 10 || z < 30) continue;
      const err = res.hitPointWorld.y - h;
      if (Math.abs(err) > Math.abs(maxErr)) { maxErr = err; worst = `x=${x.toFixed(1)} z=${z.toFixed(1)}`; }
    }
    return { maxErr: +maxErr.toFixed(3), misses, worst };
  };
  // Smash test: hurl a heavy box (stand-in car) through the next breakable.
  (window as any).__smash = (kind = "barricade") => {
    const f = level.features.find((ft) => ft.kind === kind && ft.z > z && ft.lane === 0 &&
      !level.features.some((o) => o !== ft && o.kind !== "ice" && o.z > ft.z - 35 && o.z < ft.z + 2));
    if (!f) return null;
    const sz = f.z - 16;
    const x = level.roadCenterX(f.z) + f.u;
    const box = MeshBuilder.CreateBox("smasher", { width: 1.9, height: 1.2, depth: 4.2 }, scene);
    box.position.set(x, level.heightAt(x, sz) + 1, sz);
    const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 1300, friction: 0.2 }, scene);
    agg.shape.filterMembershipMask = 2;
    agg.shape.filterCollideMask = 1 | 16 | 8;
    agg.body.setLinearVelocity(new Vector3(0, 0, 22));
    let hits = 0;
    level.ctx.events.on("explosion", () => hits++);
    (window as any).__explosions = () => hits;
    return { featureZ: f.z, x };
  };
  (window as any).__level = level;
  (window as any).__cam = cam;
  (window as any).__goto = (nz: number) => {
    z = nz;
    place();
    for (let i = 0; i < 12; i++) level.update(0.016, focus);
  };
  // Stream fully around the start position before the first frame.
  for (let i = 0; i < 12; i++) level.update(0.016, focus);

  // The boot scene has no camera while this module loads, which can throw in
  // the render loop and stop it; make sure the loop is running again.
  const g = game as unknown as { frame: () => void };
  game.engine.stopRenderLoop();
  game.engine.runRenderLoop(() => g.frame());

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    if (speed > 0) {
      z += speed * dt;
      if (z > level.def.length + 140) z = 0;
      place();
    }
    level.update(dt, focus);
  });
}
