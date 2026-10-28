// Probe: PBR world material with a network-free environment (render-once ReflectionProbe -> scene.environmentTexture).
import { runWorldMatScene } from "./render-materials-plugin-pbr.probe.ts";

export async function probe() {
  const { result } = await runWorldMatScene("pbr", { bloom: true, env: true });
  return result;
}
