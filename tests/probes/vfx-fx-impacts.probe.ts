// Probe: small hard-hit effects up close — splinters, sparks, glass glitter, ceramic chips,
// plastic bits (wall hits), shot at their characteristic moments.
import { runShowcase, type Shot } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const W = 2.0;
  const kinds: Array<[Shot["kind"], number, number?]> = [
    ["splinters", 0.22],
    ["sparks", 0.1],
    ["glassGlitter", 0.3],
    ["ceramicChips", 0.2],
    ["plasticBits", 0.2, 0xd03a2a],
  ];
  const shots: Shot[] = kinds.map(([kind, at, tint], i) => {
    const x = -1.6 + i * 0.8;
    return { kind, at, pos: [x, 1.1, W], normal: [0, 0, -1], intensity: 1.5, tint, label: [x, 0.55, W - 0.02], labelW: 0.62 };
  });
  const { out } = await runShowcase({
    shots,
    wallZ: W,
    cam: [0, 1.25, -0.6],
    target: [0, 0.95, 2],
    seconds: 0.5,
    lights: [[0, 2.2, 1.0, 1.5]],
  });
  return out;
}
