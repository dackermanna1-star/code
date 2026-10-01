// Prop catalog: name -> generator(rng, opts) => { model, parts?, meta }
// See src/props/README.md for conventions.
import { dumpster, trashCart, metalCan, plasticCan } from './containers.js';
import { trashBag, plasticBag } from './bags.js';
import { cardboardSheet } from './sheets.js';
import { cardboardBox, flatCardboard, pallet, palletStack, mattress } from './clutter.js';
import {
  shoppingCart, bucket, paintCan, tire, brokenChair, plasticChair, greaseBin, rubble, milkCrate, crateSeat,
  mopBucket, cigaretteCan, newspaperBox, bicycleFrame, shoesOnWire,
} from './misc.js';
import {
  electricMeter, meterBank, gasMeter, junctionBox, conduitRun, downspout, acUnit, exhaustFan, dryerVent, wallVent,
  hvacCondenser, sign,
} from './wall.js';
import { cageLamp, rlmLamp, wallPack, bulkhead, fluoroFixture, cobraHead } from './lamps.js';
import { windowSash, windowBars, boardedWindow, door, rollupDoor, garageDoor, slidingDoor, stoop, bollard } from './openings.js';
import { fireEscape, utilityPole } from './structures.js';
import { can, bottle, glassShard, cup, foodBox, paperScrap, cigaretteButt, bottleCap, leaf } from './debris.js';

export const PROPS = {
  // A. hero clutter
  dumpster,
  trashCart,
  metalCan,
  plasticCan,
  trashBag,
  cardboardBox,
  flatCardboard,
  cardboardSheet,
  pallet,
  palletStack,
  mattress,
  shoppingCart,
  bucket,
  paintCan,
  tire,
  brokenChair,
  milkCrate,
  greaseBin,
  rubble,
  // B. small debris
  can,
  bottle,
  cup,
  foodBox,
  paperScrap,
  cigaretteButt,
  bottleCap,
  leaf,
  glassShard,
  plasticBag,
  // C. wall infrastructure
  electricMeter,
  meterBank,
  gasMeter,
  junctionBox,
  conduitRun,
  downspout,
  acUnit,
  exhaustFan,
  dryerVent,
  wallVent,
  hvacCondenser,
  sign,
  // D. lamps
  cageLamp,
  rlmLamp,
  wallPack,
  bulkhead,
  fluoroFixture,
  cobraHead,
  // E. openings
  windowSash,
  windowBars,
  boardedWindow,
  door,
  rollupDoor,
  garageDoor,
  slidingDoor,
  stoop,
  bollard,
  // F. large structures
  fireEscape,
  utilityPole,
  // G. storytelling extras
  shoesOnWire,
  bicycleFrame,
  newspaperBox,
  plasticChair,
  mopBucket,
  cigaretteCan,
  crateSeat,
};
