// Level list, in order of difficulty. Each level module exports a definition:
// { id, name, blurb, theme, difficulty (1-5), seed, build(B) } — see builder.js for the DSL.
// To add a level: create levelNN.js using the course DSL and append it here.

import level01 from './level01.js';
import level02 from './level02.js';
import level03 from './level03.js';
import level04 from './level04.js';
import level05 from './level05.js';
import level06 from './level06.js';
import level07 from './level07.js';
import level08 from './level08.js';
import level09 from './level09.js';
import level10 from './level10.js';

export const LEVELS = [level01, level02, level03, level04, level05, level06, level07, level08, level09, level10];
