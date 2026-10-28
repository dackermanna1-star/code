// Viewmodel set 1 (screenshot 2x2):
//  TL: reference, tool in renderingGroup 0 -> clips into wall
//  TR: renderingGroup 1 + DefaultRenderingPipeline + SSAO2(prepass) + shadows; tool receives shadows
//  BL: renderingGroup 1, tool material excluded from the SSAO2 prepass, receiveShadows=false  (RECOMMENDED)
//  BR: second camera (layerMask) for the tool, pipeline + SSAO2(prepass) on the world camera only
import { variant, hideAllCanvases, type VariantOpts } from "./input-loop-viewmodel-lib.ts";

export async function probe() {
  hideAllCanvases();
  const set: VariantOpts[] = [
    { label: "TL group0 (reference)", vm: "group0", ssao: "prepass", pipeline: true },
    { label: "TR group1 + receiveShadows", vm: "group1", ssao: "prepass", pipeline: true, toolReceivesShadows: true },
    { label: "BL group1 + excludedFromPrepass, no shadows", vm: "group1", ssao: "prepass", pipeline: true, excludeFromPrepass: true },
    { label: "BR second camera + SSAO2 prepass", vm: "camera", ssao: "prepass", pipeline: true },
  ];
  const out = [];
  for (let i = 0; i < set.length; i++) out.push(await variant(set[i], i));
  return out;
}
