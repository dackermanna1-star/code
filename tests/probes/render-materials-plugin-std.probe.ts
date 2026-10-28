// Probe: StandardMaterial + WorldMaterialPlugin (same scene as the PBR probe).
import { runWorldMatScene } from "./render-materials-plugin-pbr.probe.ts";

export async function probe() {
  const { result } = await runWorldMatScene("std", { bloom: true });
  return result;
}
