// Probe: PostFX plumbing — pass order after every kind of rebuild (PS2 toggle, SSAO on/off,
// bloom/FXAA toggles), the composite pass always last, hardware scaling for the resolution
// scale and PS2 mode, flash colour reaching the screen, shake offsets, and dispose().
// Run: node tests/probe.mjs tests/probes/render-env-post.probe.ts
import { MeshBuilder, HemisphericLight, Vector3 } from "@babylonjs/core";
import { QUALITY, Settings } from "../../src/core/settings.ts";
import { PostFX } from "../../src/render/postfx.ts";
import { makeEngine, makeCamera, pbr, frames, whenReady } from "./render-env-util.ts";

export async function probe(): Promise<unknown> {
  const { scene, engine, canvas } = makeEngine();
  const cam = makeCamera(scene);
  const settings = new Settings();
  settings.data.quality = "high";
  settings.data.ps2Mode = false;
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 1;
  const box = MeshBuilder.CreateBox("b", { size: 1 }, scene);
  box.position.set(7.4, 1.65, 4.2);
  box.material = pbr(scene, 0x808080);
  cam.setTarget(box.position);
  const baseLevel = engine.getHardwareScalingLevel();
  const post = new PostFX(scene, cam, settings);
  const fail: string[] = [];
  const out: Record<string, unknown> = {};
  const check = (name: string, ok: boolean, info?: unknown) => {
    out[name] = info === undefined ? ok : { ok, info };
    if (!ok) fail.push(name);
  };
  const chain = () => cam._postProcesses.filter((p) => !!p).map((p) => p!.name);
  const orderOk = () => {
    const c = chain();
    const last = c[c.length - 1] === "renderEnvComposite";
    const ssao = c.indexOf("ssaoCombine");
    const ip = c.indexOf("imageProcessing");
    return last && (ssao < 0 || (ip > ssao && c.indexOf("SSAOOriginalSceneColor") === 0));
  };
  await whenReady(scene, 240000);
  await frames(scene, 2);
  check("initialOrder", orderOk(), chain());
  check("initialScaling", Math.abs(engine.getHardwareScalingLevel() - baseLevel) < 1e-6, engine.getHardwareScalingLevel());

  post.setPS2(true);
  await frames(scene, 2);
  const cssH = canvas.clientHeight;
  check("ps2Order", orderOk(), chain());
  check("ps2Scaling", Math.abs(engine.getRenderHeight() - 448) <= 2, { renderH: engine.getRenderHeight(), cssH });
  check("ps2Pixelated", canvas.style.imageRendering === "pixelated");
  check("ps2NoFxaa", !chain().includes("fxaa"), chain());
  post.setPS2(false);
  await frames(scene, 2);
  check("ps2OffRestored", orderOk() && canvas.style.imageRendering !== "pixelated" && Math.abs(engine.getHardwareScalingLevel() - baseLevel) < 1e-6);

  post.applyQuality(QUALITY.low); // no SSAO, no bloom, 0.6 scale
  await frames(scene, 2);
  check("lowOrder", orderOk() && !chain().includes("ssao") && !chain().includes("bloomMerge"), chain());
  check("lowScaling", Math.abs(engine.getHardwareScalingLevel() - baseLevel / 0.6) < 1e-4, engine.getHardwareScalingLevel());
  check("prepassOffWithoutSsao", !scene.prePassRenderer || !scene.prePassRenderer.enabled);
  post.applyQuality(QUALITY.ultra);
  await frames(scene, 2);
  check("ultraOrder", orderOk() && chain().includes("ssao"), chain());
  post.setPS2(true);
  post.applyQuality(QUALITY.medium);
  post.setPS2(false);
  await frames(scene, 2);
  check("mixedOrder", orderOk(), chain());

  // Flash: full red flash reaches the screen and decays.
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const centre = async () => {
    const px = (await engine.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, true, false)) as Uint8Array;
    return [px[0], px[1], px[2]];
  };
  post.flash(1, 0xff0000);
  post.update(0);
  await frames(scene, 1);
  const red = await centre();
  for (let i = 0; i < 60; i++) post.update(1 / 60);
  await frames(scene, 1);
  const after = await centre();
  check("flashRed", red[0] > 240 && red[1] < 15 && red[2] < 15, red);
  check("flashDecays", after[0] < 200, after);

  // Shake: trauma → offsets, decays to zero; the user setting scales it.
  post.shake(0.8);
  post.update(1 / 60);
  const s1 = post.getShake();
  const mag = Math.abs(s1.rot.x) + Math.abs(s1.rot.y) + Math.abs(s1.rot.z) + Math.abs(s1.pos.x) + Math.abs(s1.pos.y);
  for (let i = 0; i < 120; i++) post.update(1 / 60);
  const s2 = post.getShake();
  check("shakeOffsets", mag > 0 && s2.rot.z === 0 && s2.pos.x === 0, { mag });
  settings.data.cameraShake = 0;
  post.shake(1);
  post.update(1 / 60);
  check("shakeSettingZero", post.getShake().rot.z === 0);

  post.dispose();
  await frames(scene, 1);
  check("disposed", chain().length === 0 && Math.abs(engine.getHardwareScalingLevel() - baseLevel) < 1e-6, chain());
  return { fail, ...out };
}
