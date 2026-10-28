// Bedroom object registry (master bedroom + bedroom 2): type id → builder, merged into
// OBJECT_REGISTRY by the integration step. Type ids are unique across the content areas.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildMetalBed, buildQueenBed } from "./bed.ts";
import { buildBedPillow, buildClothes, buildDuvet, buildMattress } from "./bedding.ts";
import { buildBookshelf } from "./bookshelf.ts";
import { buildBeanbag, buildChevalMirror, buildFramedPrint, buildLaundryBasket, buildPoster } from "./decor.ts";
import { buildDesk } from "./desk.ts";
import { buildDresser } from "./dresser.ts";
import { buildGuitar, buildGuitarStand } from "./guitar.ts";
import { buildDeskLamp, buildTableLamp } from "./lamps.ts";
import { buildLaptop } from "./laptop.ts";
import { buildNightstand } from "./nightstand.ts";
import { buildOfficeChair } from "./officeChair.ts";
import { buildPcTower } from "./pcTower.ts";
import { buildKeyboard, buildMonitor, buildMouse, buildSpeaker } from "./peripherals.ts";
import { buildAlarmClock, buildBook, buildCoffeeMug, buildJewelryBox, buildPaperStack, buildPerfumeBottle, buildSmartphone, buildWaterGlass } from "./smalls.ts";
import { buildShoeBox, buildWardrobe } from "./wardrobe.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Opts = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BEDROOM_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  // beds & bedding
  queenBed: buildQueenBed,
  metalBed: buildMetalBed,
  mattress: buildMattress,
  duvet: buildDuvet,
  bedPillow: (o?: Opts) => buildBedPillow({ ...(o ?? {}), kind: "sleep" }),
  decoPillow: (o?: Opts) => buildBedPillow({ ...(o ?? {}), kind: "deco" }),
  foldedClothes: (o?: Opts) => buildClothes({ ...(o ?? {}), style: "folded" }),
  laundryPile: (o?: Opts) => buildClothes({ ...(o ?? {}), style: "crumpled" }),
  // master bedroom furniture & decor
  nightstand: buildNightstand,
  bedsideLamp: buildTableLamp,
  dresser: buildDresser,
  wardrobe: buildWardrobe,
  shoeBox: buildShoeBox,
  laundryBasket: buildLaundryBasket,
  framedPrint: buildFramedPrint,
  chevalMirror: buildChevalMirror,
  // small items
  alarmClock: buildAlarmClock,
  smartphone: buildSmartphone,
  waterGlass: buildWaterGlass,
  book: buildBook,
  perfume: buildPerfumeBottle,
  jewelryBox: buildJewelryBox,
  coffeeMug: buildCoffeeMug,
  paperStack: buildPaperStack,
  // bedroom 2: desk setup
  desk: buildDesk,
  pcTower: buildPcTower,
  monitor: buildMonitor,
  keyboard: buildKeyboard,
  mouse: buildMouse,
  speaker: buildSpeaker,
  deskLamp: buildDeskLamp,
  laptop: buildLaptop,
  officeChair: buildOfficeChair,
  // bedroom 2: the rest
  bookshelf: buildBookshelf,
  guitar: buildGuitar,
  guitarStand: buildGuitarStand,
  poster: buildPoster,
  beanbag: buildBeanbag,
};
