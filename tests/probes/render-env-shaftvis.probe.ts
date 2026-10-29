// Probe: visibility of the light shafts in the stand-in apartment through the full post stack —
// mean luminance difference (atmosphere on − off) from the slider view, with SSAO2 (prepass)
// on and off, plus screenshots. Query: ?density=0.5
import { Settings, QUALITY } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { PostFX } from "../../src/render/postfx.ts";
import { Atmosphere } from "../../src/render/atmosphere.ts";
import { makeEngine, makeCamera, buildStandIn, registerAll, frames, look, shot, whenReady } from "./render-env-util.ts";

export async function probe(): Promise<unknown> {
  const params = new URLSearchParams(location.search);
  const { scene, engine, canvas } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  settings.data.quality = "high";
  const lighting = new Lighting(scene, settings);
  registerAll(lighting, buildStandIn(scene));
  const dens = params.get("density");
  const atm = new Atmosphere(scene, lighting, dens ? { density: Number(dens) } : {});
  atm.build();
  const post = new PostFX(scene, cam, settings);
  await whenReady(scene, 300000);
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const meanLum = async () => {
    const px = (await engine.readPixels(0, 0, w, h, true, false)) as Uint8Array;
    let s = 0;
    for (let i = 0; i < px.length; i += 4) s += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    return Math.round((s / (px.length / 4)) * 100) / 100;
  };
  const shots: Record<string, string> = {};
  const res: Record<string, number> = {};
  const views: Record<string, [[number, number, number], [number, number, number]]> = {
    slider: [[8.6, 1.6, 4.2], [5.6, 1.0, -1.0]],
    side: [[4.6, 1.5, 3.8], [8.5, 0.8, 1.0]],
  };
  for (const ssao of [true, false]) {
    post.applyQuality({ ...QUALITY.high, ssao });
    for (const [name, [p, t]] of Object.entries(views)) {
      look(cam, p, t);
      for (const on of [true, false]) {
        atm.setEnabled(on);
        for (let i = 0; i < 3; i++) {
          lighting.update(1 / 60);
          atm.update(1 / 60);
          post.update(1 / 60);
          await frames(scene, 1);
        }
        res[`${name}_${ssao ? "ssao" : "nossao"}_${on ? "on" : "off"}`] = await meanLum();
        if (on && ssao) shots[name] = shot(canvas);
      }
    }
  }
  return { res, shots, shafts: atm.shafts.map((s) => `${s.id} vol ${s.volume.toFixed(2)}`) };
}
