// ITEM SCRIPTS (narrative-1). CONTENT §3 · DESIGN §3, §10 · TECH §6.
//
//   item.mixtape    Examine: the J-card (doc mixtape_jcard), then Tess — what she reads into it changes
//                   with the night: before Leah is taken / while she's gone / after the library
//                   (bond_leah: the truth was told; otherwise not).
//   item.camcorder  Examine: Leah's tape in the 'vhs' screen. The lobby group shot on its own, or the
//                   whole tape (no stinger on a rewatch; the hard stinger belongs to ch2.vhs, once).
//   item.gum        Use: a stick of Big Red. Five sticks; friends nearby get offered one.
import HW from '../../engine/hw.js';
import { here } from './pro.js';

const ch = (g) => g.state.chapter || 0;
const alone = (g) => !here(g, 'danny') && !here(g, 'leah') && !here(g, 'marcus');

export default {
  /** Leah's mixtape — FOR THE DRIVE (8/96). */
  'item.mixtape': async (g) => {
    await g.doc('mixtape_jcard');
    const f = (k) => !!g.flag(k);
    if (f('ch5_leah_found')) {
      if (f('bond_leah')) {
        await g.think('sad', 'FOR THE DRIVE. She meant Philly. {p} She made it in August and carried it around for two months, waiting for me to say it.');
      } else {
        await g.think('look_away', 'FOR THE DRIVE. 8/96. {p} I still haven\'t said it. Not even to her face, not even down there.');
      }
      return;
    }
    if (f('ch2_leah_taken')) {
      await g.think('sad', "There's a date in the corner of the J-card. 8/96. {p} August. She made a tape in August for a drive at Thanksgiving.");
      await g.think('look_away', "Leah plans ahead. That's all. {p} That's all it is.");
      return;
    }
    // She's right here.
    await g.think('smirk', "Side B ends on '1979.' (sorry. had to.) {p} She is not sorry.");
    if (here(g, 'leah')) await g.say('leah', 'annoyed', "Don't read the J-card in front of me. It's like watching someone read your diary.");
  },

  /** Leah's camcorder: the tape (vhs screen). */
  'item.camcorder': async (g) => {
    if (!g.flag('ch2_vhs_seen') && HW.scripts?.has?.('ch2.vhs')) { await g.run('ch2.vhs'); return; }
    const c = await g.choice([
      'The lobby. Before.',
      'All of it.',
      "Don't.",
    ], { prompt: 'The red light is still on.' });
    if (c === 2 || c < 0) return;
    if (c === 0) {
      // Frame 0 only: the four of them under the portrait. Everybody say Hollow Hell.
      await g.screen('vhs', { start: 0, min: 0, max: 0 });
      g.inc('tape_lobby_watched');
      if (g.flag('withdrawn_danny') || g.flag('expelled')) {
        await g.think('smile', "Danny's doing the ears. {p} He's always going to be doing the ears.");
      } else if (ch(g) >= 6 && alone(g)) {
        await g.think('crying', 'All four of us. {p} I look like I think this is funny.');
      } else {
        await g.think('sad', "Danny's doing the ears. {p} He thinks I don't know.");
      }
      return;
    }
    // The whole tape, again. No stinger: the first time was the only time.
    const r = await g.screen('vhs', { start: 0 });
    g.inc('tape_full_watched');
    if (r && r.held >= 2) {
      await g.think('disgusted', "I held it on his face. {p} I don't know why I did that.");
    } else {
      await g.think('scared', 'Still him. Still smiling. {p} Still on the tape.');
    }
  },

  /** Big Red. Mom says it makes the car smell like a candle shop. */
  'item.gum': async (g) => {
    const left = g.flag('gum_sticks') ?? 5;
    if (left <= 0) {
      g.take('gum');
      await g.think('neutral', 'Empty pack.');
      return;
    }
    g.sfx('paper_rustle', { vol: 0.4 });
    let n = left - 1;
    if (here(g, 'danny') && n > 0) {
      await g.say('danny', 'grin', 'Dolan. Share.');
      n -= 1;
      await g.say('danny', 'talk', "Cinnamon. You're a monster.");
    } else if (here(g, 'marcus') && n > 0 && !here(g, 'leah')) {
      n -= 1;
      await g.say('marcus', 'soft_smile', 'Thanks.');
    } else if (here(g, 'leah')) {
      await g.say('leah', 'deadpan', "No thanks. It tastes like your mom's car.");
    } else if (ch(g) >= 6) {
      await g.think('exhausted', "Cinnamon. Like Mom's car. {p} Like the drive home from her shift, with the windows down.");
    } else {
      await g.think('neutral', 'Cinnamon. Mom says it makes the car smell like a candle shop.');
    }
    g.set('gum_sticks', n);
    if (n <= 0) {
      g.take('gum');
      g.toast('Big Red — the last stick.');
    }
  },
};
