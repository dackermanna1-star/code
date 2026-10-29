// Probe: layered shadow caches (src/render/shadowCache.ts) — a frame rendered from the
// incrementally maintained maps must equal a frame rendered after a full redraw of every map.
// Stand-in apartment; first with the sun + the nearest ceiling lamp promoted to cube shadows
// (high quality), then with the sun map alone (medium). Crates are moved (small steps, big
// jumps, a rotation, sub-epsilon jitter), left to settle into the static layers, removed /
// re-added, rebuilt in place and disposed, and after each phase the canvas is compared pixel by
// pixel with a frame drawn right after lighting.invalidateShadows().
// Run: node tests/probe.mjs tests/probes/render-env-shadowcache.probe.ts
import { MeshBuilder, type Mesh } from "@babylonjs/core";
import { QUALITY, Settings } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { makeEngine, makeCamera, pbr, buildStandIn, addCeilingLights, registerAll, look, whenReady } from "./render-env-util.ts";

export async function probe(): Promise<unknown> {
  const { scene, engine } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  settings.data.quality = "high"; // one shadowed point light
  const lighting = new Lighting(scene, settings);
  const s = buildStandIn(scene);
  registerAll(lighting, s);
  for (const l of addCeilingLights(scene)) {
    const room = (l as unknown as { metadata: { room: string } }).metadata.room;
    lighting.addLight(l, room, true);
  }
  const crateMat = pbr(scene, 0x8a6a4a, 0.7);
  const makeCrates = (tag: string): Mesh[] => {
    const out: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const c = MeshBuilder.CreateBox(`crate${tag}${i}`, { size: 0.35 + 0.07 * i }, scene);
      c.position.set(5.2 + (i % 3) * 0.9, 0.3, 1.0 + Math.floor(i / 3) * 1.1);
      c.material = crateMat;
      lighting.registerReceiver(c);
      lighting.setShadowCaster(c, true);
      out.push(c);
    }
    return out;
  };
  let crates = makeCrates("H");
  await whenReady(scene, 240000);

  const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl;
  const w = gl.drawingBufferWidth,
    h = gl.drawingBufferHeight;
  const read = (): Uint8Array => {
    const b = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return b;
  };
  // yield between frames like a real loop (new shadow generators load their shaders asynchronously)
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const frame = async (dt = 1 / 60): Promise<void> => {
    lighting.update(dt);
    scene.render();
    await tick();
  };
  const out: Record<string, unknown> = {};
  const fail: string[] = [];
  /** Incremental frame vs. a frame after a full redraw of every cached map. */
  const diffCount = (a: Uint8Array, b: Uint8Array): number => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 2) n++;
    return n;
  };
  /** `tolerance`: largest per-channel difference accepted (sub-epsilon motion is deliberately not redrawn). */
  const compare = async (name: string, tolerance = 2): Promise<void> => {
    scene.render();
    const a = read();
    scene.render();
    const a2 = read();
    // live maps rebuilt from the cached static layers only
    const sunLayer = (lighting as unknown as { _sunLayer: { markLiveFaces(m: number): void } })._sunLayer;
    sunLayer.markLiveFaces(1);
    scene.render();
    const c = read();
    lighting.invalidateShadows();
    scene.render();
    const b = read();
    await tick();
    out[name + ".dbg"] = { noise: diffCount(a, a2), liveOnly: diffCount(a, c), staticVsFull: diffCount(c, b) };
    let diff = 0,
      max = 0,
      x0 = w,
      y0 = h,
      x1 = -1,
      y1 = -1;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > tolerance) {
        diff++;
        const px = (i / 4) % w,
          py = h - 1 - Math.floor(i / 4 / w);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      if (d > max) max = d;
    }
    const st = lighting.shadowCacheStats;
    out[name] = { diff, max, at: diff ? [x0, y0, x1, y1] : undefined, static: st.staticCasters, dynamic: st.dynamicCasters, retries: st.points.map((p) => p.stats.retries) };
    if (diff > 0) fail.push(name);
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 45; i++) await frame();
  };

  const phases = async (tag: string): Promise<void> => {
    look(cam, [8.6, 1.7, 0.6], [5.2, 0.6, 3.6]);
    scene.render(); // camera world position for the nearest-lamp choice
    for (let i = 0; i < 20; i++) await frame();
    out[`${tag}.shadowed`] = lighting.shadowedLights.map((l) => l.name);
    await settle();
    await compare(`${tag}.settled`);
    // small continuous motion (a sliding crate)
    for (let i = 0; i < 6; i++) {
      crates[0].position.x += 0.03;
      await frame();
    }
    await compare(`${tag}.sliding`);
    // big jumps across the room, a rotation, a crate lifted to the ceiling
    crates[1].position.set(7.6, 0.4, 3.0);
    crates[2].rotation.y = 0.7;
    crates[3].position.y += 1.2;
    await frame();
    await compare(`${tag}.jumps`);
    // settle → static layers; then a static crate starts moving again (leaves the static layer)
    await settle();
    await compare(`${tag}.resettled`);
    crates[4].position.z -= 0.4;
    await frame();
    await compare(`${tag}.demoted`);
    // sub-epsilon jitter (1 mm) is not redrawn at all; the stale pose may shift a shadow edge by a
    // fraction of a texel (a few levels at most)
    await settle();
    const before = lighting.shadowCacheStats;
    crates[5].position.x += 0.001;
    await frame();
    const after = lighting.shadowCacheStats;
    const redrawn = after.sun.liveRenders !== before.sun.liveRenders || after.points.some((p, i) => p.stats.liveRenders !== before.points[i]?.stats.liveRenders);
    out[`${tag}.jitterRedrawn`] = redrawn;
    if (redrawn) fail.push(`${tag}.jitterRedrawn`);
    await compare(`${tag}.jitter`, 12);
    // removed caster, re-added caster, geometry rebuilt in place (same mesh, same world matrix)
    lighting.setShadowCaster(crates[0], false);
    await frame();
    await compare(`${tag}.removed`);
    lighting.setShadowCaster(crates[0], true);
    await frame();
    await compare(`${tag}.readded`);
    const pos = crates[1].getVerticesData("position");
    if (pos) {
      for (let i = 0; i < pos.length; i++) pos[i] *= 1.4;
      crates[1].setVerticesData("position", pos);
      crates[1].refreshBoundingInfo();
      lighting.casterGeometryChanged(crates[1]);
    }
    await frame();
    await compare(`${tag}.rebuilt`);
    // a disposed caster leaves the maps at once
    crates[2].dispose();
    await frame();
    await compare(`${tag}.disposed`);
    // camera into the kitchen (another lamp is promoted on high), then a crate moves near it
    look(cam, [6.6, 1.65, 4.6], [6.6, 0.9, 8.0]);
    scene.render();
    for (let i = 0; i < 40; i++) await frame();
    out[`${tag}.shadowed2`] = lighting.shadowedLights.map((l) => l.name);
    crates[3].position.set(6.4, 0.5, 6.4);
    await frame();
    await compare(`${tag}.kitchen`);
  };

  await phases("high");
  // the sun map alone: point shadows off, a fresh set of crates
  for (const c of crates) if (!c.isDisposed()) c.dispose();
  lighting.applyQuality(QUALITY.medium);
  crates = makeCrates("M");
  await whenReady(scene, 240000);
  await phases("medium");

  // fallback without the copy (WebGL1 / a failed blit): the live map alone, redrawn whole when
  // something changed, and not at all once everything is at rest
  const layered = lighting.shadowCacheStats.layered;
  const sunLayer = (lighting as unknown as { _sunLayer: { layered: boolean } })._sunLayer;
  sunLayer.layered = false;
  crates[0].position.x -= 0.2;
  await frame();
  await compare("fallback.moved");
  await settle();
  await settle();
  const r0 = lighting.shadowCacheStats.sun.liveRenders;
  for (let i = 0; i < 10; i++) await frame();
  out["fallback.idleRenders"] = lighting.shadowCacheStats.sun.liveRenders - r0;
  if (lighting.shadowCacheStats.sun.liveRenders !== r0) fail.push("fallback.idleRenders");

  out.stats = lighting.shadowCacheStats;
  if (!layered) fail.push("layered");
  out.fail = fail;
  lighting.dispose();
  engine.dispose();
  return out;
}
