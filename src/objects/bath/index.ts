// Bathroom object registry (type id → builder). Merged into the global registry by integration.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildBathtub } from "./bathtub.ts";
import { buildShowerScreen, buildShowerSet } from "./shower.ts";
import { buildToilet } from "./toilet.ts";
import { buildVanity } from "./vanity.ts";
import { buildMirrorCabinet } from "./mirrorCabinet.ts";
import {
  buildBathBin,
  buildBathMat,
  buildBathScale,
  buildExhaustFan,
  buildHairDryer,
  buildShampooBottle,
  buildSoapDispenser,
  buildToiletPaperHolder,
  buildToiletryBottle,
  buildToothbrushCup,
  buildTowelRack,
  buildTowelRing,
} from "./accessories.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BATH_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  bathtub: buildBathtub,
  showerSet: buildShowerSet,
  showerScreen: buildShowerScreen,
  toilet: buildToilet,
  bathVanity: buildVanity,
  mirrorCabinet: buildMirrorCabinet,
  towelRing: buildTowelRing,
  towelRack: buildTowelRack,
  toiletPaperHolder: buildToiletPaperHolder,
  toothbrushCup: buildToothbrushCup,
  soapDispenser: buildSoapDispenser,
  shampooBottle: buildShampooBottle,
  toiletryBottle: buildToiletryBottle,
  hairDryer: buildHairDryer,
  bathBin: buildBathBin,
  bathScale: buildBathScale,
  bathMat: buildBathMat,
  exhaustFan: buildExhaustFan,
};
