import { LEVEL_BUILDERS } from '../arena';
import { buildTestbed } from './testbed';

/** The story's levels, registered with the arena (it builds whichever a chapter names). */
LEVEL_BUILDERS.testbed = buildTestbed;
