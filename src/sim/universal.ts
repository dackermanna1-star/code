import type { ActionDef } from './types';
import { C } from './constants';

/** Actions every god can perform regardless of weapon or loadout. */
export const UNIVERSAL: Record<'kiblast' | 'blitz' | 'beamAnswer', ActionDef> = {
  kiblast: {
    id: 'kiblast', name: 'Spirit Bolt', kind: 'universal', startup: 9, active: 1, recovery: 15, height: 'mid',
    clip: 'u.kiblast', groundOK: true, airOK: true, energyCost: C.KIBLAST_COST, cooldown: 36, range: [160, 1800],
    description: 'A quick bolt of condensed divinity.',
  },
  beamAnswer: {
    id: 'beamAnswer', name: 'Answering Beam', kind: 'universal', startup: 12, active: 46, recovery: 20, height: 'mid',
    clip: 'ab.beam', groundOK: true, airOK: true, energyCost: 34, cooldown: 900, range: [150, 2600],
    description: 'Meet an incoming beam with your own — and pray your will is stronger.',
  },
  blitz: {
    id: 'blitz', name: 'Clash of Gods', kind: 'universal', startup: 6, active: 1, recovery: 6, height: 'mid',
    clip: 'u.blitz', groundOK: true, airOK: true, energyCost: C.BLITZ_COST, cooldown: C.BLITZ_CD, range: [160, 900],
    description: 'Vanish into a speed-blitz exchange across the battlefield.',
  },
};
