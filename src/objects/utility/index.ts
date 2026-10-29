// Laundry / foyer / balcony object registry (type id → builder). The bathroom's builders live
// in src/objects/bath (BATH_OBJECTS). Merged into the global registry by integration.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildDryer, buildWasher } from "./laundry.ts";
import { buildWaterHeater } from "./waterHeater.ts";
import { buildWallWireShelf, buildWireShelf } from "./shelving.ts";
import { buildBulbBox, buildDetergentJug, buildHammer, buildPaintCan, buildPliers, buildScrewdriver, buildStorageBox, buildToolbox, buildWrench } from "./supplies.ts";
import { buildBroomHolder, buildIroningBoard, buildMopBucket, buildVacuumCleaner } from "./cleaning.ts";
import { buildElectricalPanel } from "./panel.ts";
import { buildCoatCloset } from "./closet.ts";
import { buildConsoleTable, buildFoyerBench, buildFoyerMirror, buildIntercom, buildKeyBowl, buildKeyRing, buildPhotoFrame, buildShoe, buildShoeRack, buildUmbrellaStand } from "./foyer.ts";
import { buildAcCondenser, buildBistroTable, buildPatioChair, buildTerracottaPlant } from "./balcony.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const UTILITY_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  // laundry
  washer: buildWasher,
  dryer: buildDryer,
  waterHeater: buildWaterHeater,
  wireShelf: buildWireShelf,
  wallWireShelf: buildWallWireShelf,
  detergentJug: buildDetergentJug,
  paintCan: buildPaintCan,
  bulbBox: buildBulbBox,
  storageBox: buildStorageBox,
  toolbox: buildToolbox,
  hammer: buildHammer,
  screwdriver: buildScrewdriver,
  wrench: buildWrench,
  pliers: buildPliers,
  mopBucket: buildMopBucket,
  broomHolder: buildBroomHolder,
  vacuumCleaner: buildVacuumCleaner,
  ironingBoard: buildIroningBoard,
  // foyer
  electricalPanel: buildElectricalPanel,
  coatCloset: buildCoatCloset,
  consoleTable: buildConsoleTable,
  foyerMirror: buildFoyerMirror,
  keyBowl: buildKeyBowl,
  keyRing: buildKeyRing,
  photoFrame: buildPhotoFrame,
  shoeRack: buildShoeRack,
  shoe: buildShoe,
  umbrellaStand: buildUmbrellaStand,
  intercom: buildIntercom,
  foyerBench: buildFoyerBench,
  // balcony
  patioChair: buildPatioChair,
  bistroTable: buildBistroTable,
  terracottaPlant: buildTerracottaPlant,
  acCondenser: buildAcCondenser,
};
