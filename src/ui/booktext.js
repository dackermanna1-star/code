// Procedural prose for in-game books, seeded per title and page so each
// book reads the same every time you open it.
import { seeded, hashStr } from '../core/utils.js';

const NAMES = ['Mara', 'Theo', 'June', 'Felix', 'Iris', 'Otto', 'Nell', 'Arlo', 'Wren', 'Silas', 'Ada', 'Hugo', 'Pip', 'Rosa', 'Kit'];
const PLACES = ['the lighthouse', 'the old bakery', 'the rooftop garden', 'the night market', 'the harbor', 'the library basement', 'the 24-hour diner', 'the observatory', 'the quiet apartment on the 24th floor', 'the train station', 'the greenhouse'];
const OBJECTS = ['a brass key', 'a letter with no stamp', 'a jar of honey', 'a photograph, curled at the edges', 'a music box', 'a lantern', 'a map drawn in pencil', 'a single blue feather', 'a cup of tea gone cold', 'a recipe card'];
const WEATHER = ['Rain pattered against the window', 'The fog rolled in thick and gray', 'Snow fell in slow, lazy spirals', 'The afternoon light turned the color of marmalade', 'Wind hummed through the gaps in the frame', 'The city glittered below like spilled sugar'];

const GENRES = {
  default: {
    open: ['{W}, and {N} sat by the window with {O}.', 'It began, as most things did, at {P}.', '{N} had always believed that small things mattered most.', 'Nobody remembered exactly when {N} stopped going outside, and nobody minded.'],
    mid: ['{N} turned {O} over in their hands, thinking about everything it might mean.', 'Somewhere below, the city went on with its business, unaware.', 'There was comfort in routine: the kettle, the plants, the hum of the fridge.', 'A knock at the door. Then nothing. Then a second, softer knock.', '{N2} would have laughed at this, {N} thought, and the thought made them smile.', 'Time moved differently at {P}; slower, kinder, like honey poured from a spoon.', 'The memory arrived uninvited, as memories do, carrying the smell of {O2}.', 'They made a cup of tea and let the steam fog their glasses.'],
    close: ['And for the first time in a long time, {N} felt at home.', 'Tomorrow could wait. Tonight was enough.', 'The light in the window stayed on until morning.', 'Some stories don\'t need an ending. They just need a good chair to be read in.'],
  },
  'Cozy Mystery': {
    open: ['The croissants were missing, and {N} was determined to find out why.', 'Everyone at {P} had an alibi, which was exactly the problem.', 'The cat knew something. {N} was sure of it.'],
    mid: ['A trail of powdered sugar led from the counter to the back door.', '"Butter doesn\'t just disappear," {N2} said darkly.', '{N} jotted the clue in the notebook: {O}, found under the display case.', 'The baker\'s smile was a fraction too wide.', 'The cat blinked slowly, which {N} chose to interpret as a confession.', 'Someone had been here at 3 AM. The oven was still warm.'],
    close: ['"It was the raccoon," {N} announced. "It was always the raccoon."', 'Case closed. Pastries restored. Justice, flaky and golden.', 'The cat accepted its reward of tuna with quiet dignity.'],
  },
  'Sci-Fi': {
    open: ['The station\'s hull groaned as it turned toward the dying star.', 'Captain {N} had not slept in three cycles.', 'The signal came from {P}, which was impossible, because {P} no longer existed.'],
    mid: ['The AI\'s voice was calm. Too calm.', 'Through the viewport, a nebula bloomed like spilled ink.', '{N2} ran diagnostics for the ninth time. All green. Everything green. Something was wrong.', 'They found {O} floating in the cargo bay, untouched by vacuum.', 'Gravity flickered. For a moment, everyone was weightless and laughing.'],
    close: ['The jump drive spun up, and the stars stretched into lines of light.', 'Home was a direction, not a place.', 'Somewhere, a hundred light-years away, someone answered back.'],
  },
  Fantasy: {
    open: ['The dragon had been asleep beneath {P} for a thousand years.', '{N} was an apprentice wizard with exactly one spell: making tea.', 'The prophecy was very specific, and very inconvenient.'],
    mid: ['The forest whispered secrets nobody had asked for.', '{N2} drew a sword that hummed with pale blue light.', 'They camped under a sky full of two moons.', 'The tea spell, it turned out, was surprisingly useful against goblins.', 'A map, a riddle, and {O}: the only clues they had.'],
    close: ['And the kingdom was saved, mostly by tea.', 'The dragon, awake at last, simply asked for a blanket.', 'Some quests end in glory. This one ended in a nap.'],
  },
  Romance: {
    open: ['{N} did not believe in love at first sight. Love at first latte, perhaps.', 'They met at {P}, reaching for the same last {O}.'],
    mid: ['"After you," {N2} said, and meant it.', 'Rain caught them under the same awning, twice in one week.', 'Their texts grew longer. The silences between them, shorter.', '{N} laughed so hard they snorted, and {N2} looked at them like they were the sun.'],
    close: ['"Stay," {N} said. And {N2} did.', 'Some people are home.'],
  },
  'Self-Help': {
    open: ['Chapter one: Your apartment is a mirror of your mind.', 'You don\'t have to go out to grow.'],
    mid: ['Step one: water a plant. Notice how it responds.', 'Rest is not the absence of productivity. It is a form of it.', 'Make your bed. Then unmake it, if a nap is required.', 'Light a candle. Breathe in. Let your shoulders drop.', 'Your comfort zone can be a launchpad, not a cage.'],
    close: ['You are allowed to enjoy small things deeply.', 'The best place to start is exactly where you are.'],
  },
};

function fill(t, r) {
  const n = NAMES[Math.floor(r() * NAMES.length)];
  let n2 = NAMES[Math.floor(r() * NAMES.length)]; if (n2 === n) n2 = 'Nell';
  return t.replace(/\{N\}/g, n).replace(/\{N2\}/g, n2).replace(/\{P\}/g, PLACES[Math.floor(r() * PLACES.length)]).replace(/\{O\}/g, OBJECTS[Math.floor(r() * OBJECTS.length)]).replace(/\{O2\}/g, OBJECTS[Math.floor(r() * OBJECTS.length)]).replace(/\{W\}/g, WEATHER[Math.floor(r() * WEATHER.length)]);
}

export function bookText(def, page) {
  const g = GENRES[def.use?.genre] || GENRES.default;
  const total = def.use?.pages || 10;
  // characters stay consistent for the whole book: seed the name roll per book
  const bookR = seeded(hashStr(def.id));
  const castSeed = Math.floor(bookR() * 1e6);
  const r = seeded(castSeed + page * 7919);
  const nameR = () => { const rr = seeded(castSeed); return rr; };
  const out = [];
  const pick = (arr) => fill(arr[Math.floor(r() * arr.length)], nameR());
  if (page === 0) out.push(pick(g.open));
  const n = page === 0 ? 2 : 3;
  for (let i = 0; i < n; i++) out.push(pick(g.mid) + ' ' + pick(GENRES.default.mid));
  if (page >= total - 1) out.push(pick(g.close));
  return out;
}
