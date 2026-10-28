// Kitchen object registry: type id → builder (variants through opts). The furnisher places these;
// the debug API can spawn any of them by type. The reference microwave lives in
// src/objects/reference (registered by the global registry).

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildKitchenIsland, buildKitchenWallCabinet, buildKitchenWestRun } from "./cabinets.ts";
import { buildKitchenNorthRun } from "./northRun.ts";
import { buildRange } from "./range.ts";
import { buildDishwasher } from "./dishwasher.ts";
import { buildFridge } from "./fridge.ts";
import { buildRangeHood } from "./hood.ts";
import { buildBlender, buildCarafe, buildCoffeeMaker, buildKettle, buildToaster } from "./smallAppliances.ts";
import { buildBowl, buildCutleryTray, buildKitchenMug, buildPlate, buildSidePlate, buildTumbler, buildWineGlass } from "./dishware.ts";
import {
  buildBottle,
  buildCan,
  buildCerealBox,
  buildCuttingBoard,
  buildDishRack,
  buildFoodTub,
  buildFruit,
  buildFruitBowl,
  buildJar,
  buildJuiceBottle,
  buildKnife,
  buildKnifeBlock,
  buildMilkCarton,
  buildPaperTowelHolder,
  buildSaucepan,
  buildSkillet,
  buildSpiceJar,
  buildSpiceRack,
} from "./items.ts";
import { buildBarStool, buildPedalBin, buildRecyclingBin, buildWallClock } from "./misc.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KITCHEN_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  kitchenNorthRun: buildKitchenNorthRun,
  kitchenWestRun: buildKitchenWestRun,
  kitchenIsland: buildKitchenIsland,
  kitchenWallCabinet: buildKitchenWallCabinet,
  range: buildRange,
  dishwasher: buildDishwasher,
  fridge: buildFridge,
  rangeHood: buildRangeHood,
  toaster: buildToaster,
  kettle: buildKettle,
  coffeeMaker: buildCoffeeMaker,
  carafe: buildCarafe,
  blender: buildBlender,
  plate: buildPlate,
  sidePlate: buildSidePlate,
  bowl: buildBowl,
  tumbler: buildTumbler,
  wineGlass: buildWineGlass,
  kitchenMug: buildKitchenMug,
  cutleryTray: buildCutleryTray,
  knifeBlock: buildKnifeBlock,
  knife: buildKnife,
  cuttingBoard: buildCuttingBoard,
  dishRack: buildDishRack,
  fruitBowl: buildFruitBowl,
  fruit: buildFruit,
  paperTowelHolder: buildPaperTowelHolder,
  spiceRack: buildSpiceRack,
  spiceJar: buildSpiceJar,
  wineBottle: (o?: { seed?: number; kind?: "wine" | "whiteWine" }) => buildBottle({ kind: o?.kind ?? "wine", seed: o?.seed }),
  oilBottle: (o?: { seed?: number }) => buildBottle({ kind: "oil", seed: o?.seed }),
  cerealBox: buildCerealBox,
  can: buildCan,
  skillet: buildSkillet,
  saucepan: buildSaucepan,
  stockPot: (o?: { seed?: number }) => buildSaucepan({ r: 0.12, h: 0.2, handles: "loops", seed: o?.seed }),
  milkCarton: buildMilkCarton,
  jar: buildJar,
  juiceBottle: buildJuiceBottle,
  foodTub: buildFoodTub,
  pedalBin: buildPedalBin,
  recyclingBin: buildRecyclingBin,
  wallClock: buildWallClock,
  barStool: buildBarStool,
};
