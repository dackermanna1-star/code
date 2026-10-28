// Viewmodel set 2 (screenshot 2x2): why the second-camera approach failed in set 1, and diagnostics.
//  TL: second camera, DefaultRenderingPipeline only (no SSAO2)
//  TR: second camera, SSAO2 with forceGeometryBuffer=true + pipeline on world camera
//  BL: second camera, pipeline attached to BOTH cameras (no SSAO)
//  BR: group1 + DefaultRenderingPipeline, no SSAO (e.g. 'low' quality preset)
import { variant, hideAllCanvases, type VariantOpts } from "./input-loop-viewmodel-lib.ts";

export async function probe() {
  hideAllCanvases();
  const set: VariantOpts[] = [
    { label: "TL camera + pipeline, no SSAO", vm: "camera", ssao: "none", pipeline: true },
    { label: "TR camera + SSAO2 gbuffer + pipeline", vm: "camera", ssao: "gbuffer", pipeline: true },
    { label: "BL camera + pipeline on both cams", vm: "camera", ssao: "none", pipeline: true, pipelineOnBoth: true },
    { label: "BR group1 + pipeline, no SSAO", vm: "group1", ssao: "none", pipeline: true },
  ];
  const out = [];
  for (let i = 0; i < set.length; i++) out.push(await variant(set[i], i));
  return out;
}
