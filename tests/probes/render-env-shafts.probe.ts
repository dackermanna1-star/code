// Probe: light-shaft volumes in isolation (no walls) — checks the analytic shader produces
// visible additive light from outside and from inside a beam, and that the inside switch works.
import { Settings } from "../../src/core/settings.ts";
import { Lighting } from "../../src/render/lighting.ts";
import { Atmosphere } from "../../src/render/atmosphere.ts";
import { makeEngine, makeCamera, frames, look, shot } from "./render-env-util.ts";

async function centreLum(scene: import("@babylonjs/core").Scene): Promise<number> {
  const e = scene.getEngine();
  const w = e.getRenderWidth();
  const h = e.getRenderHeight();
  const px = (await e.readPixels(0, 0, w, h, true, false)) as Uint8Array;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    sum += l;
    if (l > max) max = l;
  }
  return Math.round((sum / (px.length / 4)) * 100) / 100 + max / 1000;
}

export async function probe(): Promise<unknown> {
  const { scene, canvas } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  const lighting = new Lighting(scene, settings);
  const atm = new Atmosphere(scene, lighting, { density: 0.6 });
  atm.build();
  await scene.whenReadyAsync();
  const out: Record<string, unknown> = { shafts: atm.shafts.map((s) => s.id) };
  const shots: Record<string, string> = {};
  look(cam, [8.6, 1.6, 4.2], [5.6, 1.0, -1.0]);
  atm.update(0.016);
  await frames(scene, 3);
  out.outsideLum = await centreLum(scene);
  shots.outside = shot(canvas);
  // Inside the slider beam.
  const sl = atm.shafts.find((s) => s.id === "slider_living")!;
  const p = { x: sl.origin.x + sl.U.x * 0.5 + sl.D.x * 0.3, y: sl.origin.y + sl.V.y * 0.6 + sl.D.y * 0.3, z: sl.origin.z + sl.D.z * 0.3 };
  look(cam, [p.x, p.y, p.z], [p.x + sl.D.x, p.y + sl.D.y, p.z + sl.D.z]);
  atm.update(0.016);
  await frames(scene, 3);
  out.insideLum = await centreLum(scene);
  shots.inside = shot(canvas);
  return { ...out, shots };
}
