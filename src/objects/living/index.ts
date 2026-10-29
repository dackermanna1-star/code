// Living & dining room object registry: type id → builder (merged into OBJECT_REGISTRY by the
// integration step). The glass coffee table and dining chair are the reference objects. Type ids
// are unique across the area registries (the kitchen owns `wineGlass`, the foyer `photoFrame`, so
// ours are `stemWineGlass` / `easelPhotoFrame`).

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildChair } from "../reference/chair.ts";
import { buildCoffeeTable } from "../reference/coffeeTable.ts";
import { buildAreaRug, buildBook, buildCandleTray, buildCeramicVase, buildDecorBowl, buildDinnerPlate, buildFigurine, buildFlowerVase, buildFramedPainting, buildMagazine, buildPhotoFrame, buildPillarCandle, buildPlacemat, buildThrowPillow, buildWallMirror, buildWineGlass } from "./decor.ts";
import { buildCableBox, buildGameConsole, buildGameController, buildRemoteControl, buildSoundbar, buildWifiRouter } from "./electronics.ts";
import { buildBookcase, buildDiningTable, buildSideTable } from "./furniture.ts";
import { buildFloorLamp, buildTableLamp } from "./lamps.ts";
import { buildMediaConsole } from "./mediaConsole.ts";
import { buildFiddleLeafFig, buildSnakePlant, buildSucculent } from "./plants.ts";
import { buildArmchair, buildSofa } from "./sofa.ts";
import { buildBookshelfSpeaker } from "./speaker.ts";
import { buildTv } from "./tv.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LIVING_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  // TV wall
  mediaConsole: buildMediaConsole,
  tv55: buildTv,
  gameConsole: buildGameConsole,
  gameController: buildGameController,
  soundbar: buildSoundbar,
  wifiRouter: buildWifiRouter,
  cableBox: buildCableBox,
  bookshelfSpeaker: buildBookshelfSpeaker,
  // seating & tables
  sofa3: buildSofa,
  armchair: buildArmchair,
  throwPillow: buildThrowPillow,
  coffeeTable: buildCoffeeTable,
  sideTable: buildSideTable,
  diningTable: buildDiningTable,
  chair: buildChair,
  // lighting
  tableLamp: buildTableLamp,
  floorLamp: buildFloorLamp,
  // storage & books
  bookcase: buildBookcase,
  hardcoverBook: (o?: Parameters<typeof buildBook>[0]) => buildBook({ size: "hardcover", ...o }),
  paperbackBook: (o?: Parameters<typeof buildBook>[0]) => buildBook({ ...o, size: "paperback" }),
  magazine: buildMagazine,
  // decor
  remoteControl: buildRemoteControl,
  pillarCandle: buildPillarCandle,
  candleTray: buildCandleTray,
  decorBowl: buildDecorBowl,
  ceramicVase: buildCeramicVase,
  figurine: buildFigurine,
  easelPhotoFrame: buildPhotoFrame,
  flowerVase: buildFlowerVase,
  framedPainting: buildFramedPainting,
  wallMirror: buildWallMirror,
  areaRug: buildAreaRug,
  placemat: buildPlacemat,
  dinnerPlate: buildDinnerPlate,
  stemWineGlass: buildWineGlass,
  fiddleLeafFig: buildFiddleLeafFig,
  snakePlant: buildSnakePlant,
  succulent: buildSucculent,
};
