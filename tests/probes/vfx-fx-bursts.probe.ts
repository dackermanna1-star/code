// Probe: wall-hit dust effects (drywall, concrete, generic dust, insulation, wood chips) at a
// characteristic moment each, plus a static row of every atlas cell (bits + puff) to verify
// the sprite-sheet mapping (cells 0..15 left to right; bits: 4 chips, 2 splinters, 2 crumbs,
// 2 paper, 2 feathers, drop, streak, star, dot; puff: 8 dust, 4 smoke, 4 fibre tufts).
import { PROFILES, type ParticleProfile } from "../../src/vfx/profiles.ts";
import { runShowcase, type Shot } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const W = 2.6;
  const kinds: Array<[Shot["kind"], number]> = [
    ["drywallDust", 1.4],
    ["concreteDust", 1.0],
    ["dust", 0.9],
    ["insulationFluff", 1.1],
    ["woodChips", 0.3],
  ];
  const shots: Shot[] = kinds.map(([kind, at], i) => {
    const x = -3.2 + i * 1.6;
    return { kind, at, pos: [x, 1.3, W], normal: [0, 0, -1], intensity: 1.5, label: [x, 0.35, W - 0.02], labelW: 1.3 };
  });
  const still = (group: "bits" | "puff", cell: number): ParticleProfile => ({
    ...PROFILES.dust, id: `still_${group}_${cell}`, group, cells: [cell], count: 1, countExp: 0, maxCount: 1, life: [100, 100],
    size: [group === "bits" ? 0.2 : 0.26, group === "bits" ? 0.2 : 0.26], sizeExp: 0, grow: [1, 1], speed: [0, 0], radius: 0,
    offset: 0, drag: 0, gravity: 0, turb: 0, collide: 0, color: group === "bits" ? [0.95, 0.72, 0.4] : [0.95, 0.95, 0.95],
    colorVar: 0, tintMix: 0, alpha: 1, fadeIn: 0, fadeOut: 0, spin: 0, lit: 0,
  });
  const { out } = await runShowcase({
    shots,
    wallZ: W,
    cam: [0, 1.6, -3.6],
    target: [0, 1.25, 1.5],
    seconds: 1.6,
    lights: [
      [-2, 2.4, 1.4, 2],
      [2, 2.4, 1.4, 2],
    ],
    setup: (_fx, vfx) => {
      for (let c = 0; c < 16; c++) {
        vfx.fx.layer(still("bits", c), { x: -3.9 + c * 0.24, y: 2.55, z: W - 0.05 }, { x: 0, y: 0, z: -1 }, 1, { exact: 1 });
        vfx.fx.layer(still("puff", c), { x: 0.2 + c * 0.26, y: 2.55, z: W - 0.05 }, { x: 0, y: 0, z: -1 }, 1, { exact: 1 });
      }
    },
  });
  return out;
}
