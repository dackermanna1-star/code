import type { Chapter } from './runner';
import { CH0 } from './ch0';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import { CH4 } from './ch4';
import { CH5 } from './ch5';
import { CH6 } from './ch6';
import { CH7 } from './ch7';
import { CH8 } from './ch8';

/**
 * SCARLET: BEFORE DAWN - one night, from last call to first light: the Lantern, the docks, the
 * club's books, the roofs, the tower, the river road, Palewater and what's under it, and the dawn.
 */
export const CHAPTERS: Chapter[] = [CH0, CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8];

/** (chapters still to come, shown locked in the select: none - the night's complete) */
export const LOCKED_CHAPTERS: { title: string; place: string }[] = [];
