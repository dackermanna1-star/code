// Registry of the apartment-wide fixtures & electrics (type id → builder). PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildBatten, buildFlushMount, buildPendant, buildSchoolhouse, buildTrackLight } from "./ceilingLights.ts";
import { buildCeilingFan } from "./ceilingFan.ts";
import { buildCurtains, buildVenetianBlind } from "./windowCoverings.ts";
import { buildBaseboardHeater, buildDoorChime, buildMiniSplit, buildSmokeDetector, buildThermostat } from "./electrics.ts";
import { buildDoorStop, buildFullLengthMirror, buildRobeHooks, buildWallClock } from "./hardware.ts";

export * from "./ceilingLights.ts";
export * from "./ceilingFan.ts";
export * from "./windowCoverings.ts";
export * from "./electrics.ts";
export * from "./hardware.ts";

/** Default curtain set (the living-room window: 1.25 m rod, two 3-strip panels). */
function defaultCurtains(opts: any = {}): AssemblyDef {
  return buildCurtains({
    rodLen: 1.25,
    brackets: [-0.575, 0.575],
    panels: [
      { x0: -0.515, dir: 1, strips: 3 },
      { x0: 0.515, dir: -1, strips: 3 },
    ],
    rodHeight: 2.42,
    ...opts,
  });
}

export const FIXTURES_OBJECTS: Record<string, (opts?: any) => AssemblyDef> = {
  flushMountLight: buildFlushMount,
  pendantLight: buildPendant,
  trackLight: buildTrackLight,
  schoolhouseLight: buildSchoolhouse,
  battenLight: buildBatten,
  ceilingFan: buildCeilingFan,
  venetianBlind: buildVenetianBlind,
  curtains: defaultCurtains,
  smokeDetector: buildSmokeDetector,
  thermostat: buildThermostat,
  baseboardHeater: buildBaseboardHeater,
  miniSplitAC: buildMiniSplit,
  doorChime: buildDoorChime,
  wallClock: buildWallClock,
  doorStop: buildDoorStop,
  robeHooks: buildRobeHooks,
  fullLengthMirror: buildFullLengthMirror,
};
