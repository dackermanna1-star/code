import { LEVEL_BUILDERS } from '../arena';
import { buildTestbed } from './testbed';

/** The story's levels, registered with the arena (it builds whichever a chapter names). */
LEVEL_BUILDERS.testbed = buildTestbed;
import { buildLantern } from './lantern';
LEVEL_BUILDERS.lantern = buildLantern;
import { buildHarbor } from './harbor';
LEVEL_BUILDERS.harbor = buildHarbor;
