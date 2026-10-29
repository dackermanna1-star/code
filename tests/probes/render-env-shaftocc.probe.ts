// Probe: light shafts are occluded by sun shadow casters — a curtain drawn across the living
// room slider must kill its beam (like it kills the sunlit floor patch), venetian-style slats
// must cut it partially, and the open window must still glow. Measures the mean luminance the
// atmosphere adds (on − off) from two views, plus screenshots.
// Run: node tests/probe.mjs tests/probes/render-env-shaftocc.probe.ts
import { MeshBuilder, type Mesh } from "@babylonjs/core";
import { Settings } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { Atmosphere } from "../../src/render/atmosphere.ts";
import { makeEngine, makeCamera, buildStandIn, registerAll, frames, look, shot, whenReady, pbr } from "./render-env-util.ts";

export async function probe(): Promise<unknown> {
  const { scene, engine, canvas } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  settings.data.quality = "high";
  const lighting = new Lighting(scene, settings);
  registerAll(lighting, buildStandIn(scene));
  const atm = new Atmosphere(scene, lighting);
  atm.build();
  await whenReady(scene, 300000);
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const meanLum = async () => {
    const px = (await engine.readPixels(0, 0, w, h, true, false)) as Uint8Array;
    let s = 0;
    for (let i = 0; i < px.length; i += 4) s += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    return s / (px.length / 4);
  };
  const fail: string[] = [];
  const out: Record<string, unknown> = {};
  const shots: Record<string, string> = {};
  const views: Record<string, [[number, number, number], [number, number, number]]> = {
    slider: [[8.6, 1.6, 4.2], [5.6, 1.0, -1.0]],
    side: [[4.6, 1.5, 3.8], [8.5, 0.8, 1.0]],
  };
  // Added luminance of the shafts per view.
  const measure = async (tag: string) => {
    const r: Record<string, number> = {};
    for (const [name, [p, t]] of Object.entries(views)) {
      look(cam, p, t);
      const v: number[] = [];
      for (const on of [true, false]) {
        atm.setEnabled(on);
        for (let i = 0; i < 3; i++) {
          lighting.update(1 / 60);
          atm.update(1 / 60);
          await frames(scene, 1);
        }
        v.push(await meanLum());
        if (on) shots[`${tag}_${name}`] = shot(canvas);
      }
      r[name] = Math.round((v[0] - v[1]) * 100) / 100;
    }
    return r;
  };
  const open = await measure("open");
  out.open = open;

  // Venetian-style slats across the slider (half the aperture blocked), inside the room.
  const slatMat = pbr(scene, 0xe8e4dc, 0.6);
  const slats: Mesh[] = [];
  for (let y = 0.05; y < 2.25; y += 0.08) {
    const s = MeshBuilder.CreateBox("slat", { width: 2.5, height: 0.04, depth: 0.05 }, scene);
    s.position.set(6.4, y, 0.22);
    s.material = slatMat;
    lighting.registerReceiver(s);
    lighting.setShadowCaster(s, true, true);
    slats.push(s);
  }
  await whenReady(scene, 120000);
  const slatted = await measure("slats");
  out.slats = slatted;
  for (const s of slats) {
    lighting.setShadowCaster(s, false);
    lighting.unregisterReceiver(s);
    s.dispose();
  }

  // Curtain drawn across the whole slider.
  const curtain = MeshBuilder.CreateBox("curtain", { width: 2.7, height: 2.3, depth: 0.03 }, scene);
  curtain.position.set(6.4, 1.15, 0.22);
  curtain.material = pbr(scene, 0x9a8a78, 0.95);
  lighting.registerReceiver(curtain);
  lighting.setShadowCaster(curtain, true, true);
  await whenReady(scene, 120000);
  const closed = await measure("curtain");
  out.curtain = closed;

  const check = (name: string, ok: boolean, info?: unknown) => {
    out[name] = info === undefined ? ok : { ok, info };
    if (!ok) fail.push(name);
  };
  check("openVisible", open.slider > 1.5 && open.side > 1.0, open);
  // The slider carries most of the light in both views; win_living still adds some.
  check("curtainKillsSlider", closed.slider < open.slider * 0.4 && closed.side < open.side * 0.4, { open, closed });
  check("slatsPartial", slatted.slider < open.slider * 0.85 && slatted.slider > closed.slider, { open, slatted, closed });
  return { fail, ...out, shots };
}
