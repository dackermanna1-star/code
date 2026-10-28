// Probe: VolumetricLightScatteringPostProcess with the sun disc visible through the window (its precondition).
import {
  Vector3, Color3, MeshBuilder, StandardMaterial, VolumetricLightScatteringPostProcess, Texture, Mesh,
  DefaultRenderingPipeline, ImageProcessingConfiguration, SSAO2RenderingPipeline, Constants,
} from "@babylonjs/core";
import { makeEngine, renderFrames, captureCanvas } from "./render-lighting-util.ts";
import { buildShowcase, chainNames } from "./render-lighting-scene.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeEngine();
  // build without pipelines; we add SSAO -> VLS -> DRP in that order ourselves
  const s = buildShowcase(scene, engine, { ssao: false, pipeline: false });
  const cam = s.camera;
  const toSun = s.sun.direction.scale(-1).normalize();
  cam.position.set(3.95, 0.5, 2.2);
  cam.setTarget(cam.position.add(toSun.scale(10)).add(new Vector3(1.2, -1.2, 1.2)));

  const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 1 }, [cam], false, Constants.TEXTURETYPE_HALF_FLOAT);
  ssao.radius = 0.6;
  ssao.totalStrength = 1.2;
  // sun disc billboard far outside, inside the sky dome
  const disc = MeshBuilder.CreatePlane("sunDisc", { size: 8 }, scene);
  disc.position = new Vector3(2.5, 1.5, 2).add(toSun.scale(120));
  disc.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const dm = new StandardMaterial("sunDiscMat", scene);
  dm.disableLighting = true;
  dm.emissiveColor = new Color3(1, 0.85, 0.6);
  disc.material = dm;
  disc.applyFog = false;
  const vls = new VolumetricLightScatteringPostProcess("vls", 0.5, cam, disc, 64, Texture.BILINEAR_SAMPLINGMODE, engine, false, scene);
  vls.exposure = 0.6;
  vls.decay = 0.97;
  vls.weight = 0.7;
  vls.density = 0.95;
  vls.excludedMeshes.push(scene.getMeshByName("skyDome")!);

  const drp = new DefaultRenderingPipeline("drp", true, scene, [cam]);
  drp.bloomEnabled = true;
  drp.bloomThreshold = 1.0;
  drp.bloomWeight = 0.35;
  drp.fxaaEnabled = true;
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.1;
  await scene.whenReadyAsync();
  await renderFrames(scene, 8);
  return {
    png: captureCanvas(engine),
    chain: chainNames(cam).filter((n) => n !== "null"),
    drawCalls: s.si.drawCallsCounter.current,
    vlsPassRenderListNull: vls.getPass().renderList === null || vls.getPass().renderList!.length === 0,
  };
}
