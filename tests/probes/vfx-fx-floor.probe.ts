// Probe: soft-goods / misc effects on the floor — feathers, foam crumbs, paper scraps, soil,
// a red-wine liquid splash.
import { runShowcase, type Shot } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const kinds: Array<[Shot["kind"], number, number, number?]> = [
    ["feathers", 1.2, 0.6],
    ["foam", 0.45, 0.3],
    ["paper", 1.0, 0.6],
    ["soil", 0.35, 0.25],
    ["liquid", 0.25, 0.2, 0x7a1530],
  ];
  const shots: Shot[] = kinds.map(([kind, at, y, tint], i) => {
    const x = -1.8 + i * 0.9;
    return { kind, at, pos: [x, y, 1.2], normal: [0, 1, 0], intensity: 1.5, tint, label: [x, 0.25, 2.18], labelW: 0.7 };
  });
  const { out } = await runShowcase({
    shots,
    wallZ: 2.2,
    cam: [0, 1.5, -1.2],
    target: [0, 0.45, 1.6],
    seconds: 1.3,
    lights: [[0, 2.2, 0.8, 1.5]],
  });
  return out;
}
