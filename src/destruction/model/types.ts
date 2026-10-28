// Blueprint types for destructible assemblies (pure data). Object builders produce these via
// the DSL in src/objects/lib; the destruction runtime instantiates them. PURE MODULE.

import type { Vec3 } from "../../geom/vec.ts";
import type { ConvexPoly } from "../../geom/poly.ts";
import type { MaterialId } from "./materials.ts";

export type BondKind =
  | "glue" // wood glue / adhesive joints (strong shear, weak peel)
  | "screw" // wood/sheet screws
  | "nail" // framing nails, brads
  | "dowel" // dowels, mortise & tenon
  | "weld" // spot/seam welds
  | "bolt" // heavy bolts (toilet to floor, appliance feet)
  | "press" // press-fit / friction (buttons, knobs, keycaps, lids)
  | "clip" // plastic snap-fits (covers, bezels, trims)
  | "mortar" // thinset / mortar / grout (tiles)
  | "fused" // same-material continuity (tiles of one ceramic shell, cells of one concrete wall)
  | "friction" // things resting/wedged together that should move as one until disturbed
  | "hinge" // joint: door/lid/cabinet hinges (becomes a physics constraint)
  | "slider" // joint: drawer slides, sliding doors
  | "latch"; // locks/latches holding a jointed part closed (motor/limit), breaks to free it

export const JOINT_KINDS: ReadonlySet<BondKind> = new Set<BondKind>(["hinge", "slider"]);

export interface JointDef {
  /** Joint axis in assembly space (hinge rotation axis / slide direction), unit. */
  axis: Vec3;
  /** Pivot point in assembly space (hinge pin centre / slide anchor). */
  pivot: Vec3;
  /** Limits: radians for hinges (relative to the built pose), metres for sliders. */
  min: number;
  max: number;
  /** Joint friction (0 = free). */
  friction?: number;
  /** Bonds with the same group id between the same two islands form one constraint (3 hinges of one door). */
  group?: string;
  /** Spring returning to 0 (self-closing doors, oven door counter-spring), N·m/rad or N/m. */
  spring?: number;
}

export interface BondDef {
  a: string;
  /** Part name or "world" (anchored to the static building). */
  b: string;
  kind: BondKind;
  /** Energy capacity in joules; defaults per kind when omitted (see materials.ts BOND_DEFAULTS). */
  strength?: number;
  /** Assembly-space anchor point; default = midpoint of closest points between the two parts. */
  anchor?: Vec3;
  /** Required for hinge/slider; for latch: the jointed part is `a`. */
  joint?: JointDef;
}

export type FeatureDef =
  | {
      type: "light";
      /** The bulb / LED part; breaking it kills the light. */
      part: string;
      /** Light position (assembly space) and kind. */
      pos: Vec3;
      kind: "point" | "spot";
      dir?: Vec3;
      color: number; // 0xRRGGBB
      intensity: number;
      range: number;
      angle?: number; // spot cone
      castShadows?: boolean;
      /** Needs mains power (dies on power cut). */
      mains?: boolean;
      /** Initially on. */
      on?: boolean;
    }
  | { type: "screen"; part: string; content: "tv" | "monitor" | "laptop" | "phone" | "microwave"; on?: boolean; mains?: boolean }
  | {
      type: "water";
      /** Part that holds the water (pipe/faucet/supply line/tank); breaking it or its bonds starts a leak. */
      part: string;
      pos: Vec3;
      dir: Vec3;
      /** 0..1 spray strength. */
      pressure: number;
      /** Finite volume in litres (tanks); omit for mains supply. */
      litres?: number;
    }
  | { type: "sparks"; part: string; /** chance of a spark burst when damaged */ chance?: number }
  | { type: "power"; part: string } // the electrical panel; destroying it cuts mains
  | { type: "stuffing"; part: string; kind: "feathers" | "foam" | "fiber" | "paper" }
  | { type: "liquid"; part: string; color: number; litres: number }
  | { type: "soil"; part: string }
  | { type: "motor"; part: string; /** hinge group id driven by the motor (ceiling fan, turntable) */ joint: string; speed: number; mains?: boolean }
  | { type: "hum"; part: string; sound: string; mains?: boolean } // fridge/aquarium hum loop
  | { type: "alarm"; part: string; sound: string }; // smoke detector chirp when damaged

export interface PartDef {
  name: string;
  mat: MaterialId;
  /** Convex hull in ASSEMBLY space with per-face appearance attributes. */
  poly: ConvexPoly;
  /** Wood grain axis in assembly space (unit). */
  grain?: Vec3;
  /** Render tessellation cell size (m) for deformable parts (metal/plastic sheets); 0/undefined = none. */
  tessCell?: number;
  /** Sheet held by many fasteners (drywall, tiles, skins): fails locally, never snaps globally (except glass). */
  supported?: boolean;
  /** Multiplier on the material's strength (G and u). */
  strength?: number;
  /** Override computed mass (kg) — for hollow/stuffed parts whose hull volume overstates mass. */
  mass?: number;
  /** Does not collide (purely visual detail that is still destructible through its bonds). */
  noCollide?: boolean;
  tags?: string[];
}

export type AssemblyCategory =
  | "structure"
  | "fixture"
  | "appliance"
  | "electronics"
  | "furniture"
  | "kitchenware"
  | "decor"
  | "soft"
  | "tool"
  | "misc";

export interface AssemblyDef {
  /** Type id, e.g. "microwave". */
  type: string;
  /** Display name, e.g. "Microwave Oven". */
  name: string;
  category: AssemblyCategory;
  /** Replacement value in dollars (feeds the HUD repair bill). */
  value: number;
  parts: PartDef[];
  bonds: BondDef[];
  features?: FeatureDef[];
  /** Room id from the floor plan (set by the furnisher). */
  room?: string;
  /** Start asleep (furniture resting on the floor). Default true for dynamic islands. */
  startAsleep?: boolean;
}
