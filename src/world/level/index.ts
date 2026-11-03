import { LEVEL_BUILDERS } from '../arena';
import { buildTestbed } from './testbed';

/** The story's levels, registered with the arena (it builds whichever a chapter names). */
LEVEL_BUILDERS.testbed = buildTestbed;
import { buildLantern } from './lantern';
LEVEL_BUILDERS.lantern = buildLantern;
import { buildHarbor } from './harbor';
LEVEL_BUILDERS.harbor = buildHarbor;
import { buildClub } from './club';
LEVEL_BUILDERS.club = buildClub;
import { buildRoofs } from './roofs';
LEVEL_BUILDERS.roofs = buildRoofs;
import { buildMeridian } from './meridian';
LEVEL_BUILDERS.meridian = buildMeridian;
import { buildConvoy } from './convoy';
LEVEL_BUILDERS.convoy = buildConvoy;
import { buildPalewater } from './palewater';
LEVEL_BUILDERS.palewater = buildPalewater;
import { buildTanks } from './tanks';
LEVEL_BUILDERS.tanks = buildTanks;
import { buildDawn } from './dawn';
LEVEL_BUILDERS.dawn = buildDawn;
