import type { Chapter } from './runner';
import { CH0 } from './ch0';
import { CH1 } from './ch1';

/**
 * SCARLET: BEFORE DAWN - one night, six chapters. This build plays the first two; the rest show in
 * the chapter select as what's to come.
 */
export const CHAPTERS: Chapter[] = [CH0, CH1];

export const LOCKED_CHAPTERS: { title: string; place: string }[] = [
  { title: 'RED LEDGER', place: 'MERIDIAN TOWER · THE PENTHOUSE' },
  { title: 'RAIN', place: 'THE ROOFTOP' },
  { title: 'NIGHT SHIFT', place: 'PALEWATER · THE LAB' },
  { title: 'SUBJECT ZERO', place: 'PALEWATER · THE TANK' },
];
