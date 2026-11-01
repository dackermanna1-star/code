// The cast of Gravelmouth State Penitentiary (all original). Notable characters are
// hand-authored; the rest of the population is generated from name pools and trait rolls.
import { RNG } from '../core/random.js';

export const FIRST = ['Earl', 'Dwayne', 'Marisol', 'Teodoro', 'Frankie', 'Lonnie', 'Rosalind', 'Hector', 'Bertram', 'Ike', 'Desmond', 'Wendell',
  'Augustine', 'Nell', 'Priya', 'Gus', 'Otis', 'Ramona', 'Sal', 'Vernon', 'Hollis', 'Mabel', 'Cornelius', 'Tobias', 'Lucius', 'Jojo', 'Ezekiel',
  'Opal', 'Kofi', 'Jamal', 'Boris', 'Kenji', 'Arturo', 'Mateo', 'Lars', 'Fergus', 'Abe', 'Deshawn', 'Lamar', 'Reggie', 'Petey', 'Bettina',
  'Yolanda', 'Floyd', 'Wilbur', 'Agnes', 'Thaddeus', 'Imogen', 'Rocco', 'Virgil', 'Dottie', 'Mortimer', 'Ansel', 'Calvin', 'Tula', 'Cyrus'];
export const LAST = ['Draper', 'Pickering', 'Mulcahy', 'Okafor', 'Brandt', 'Castellano', 'Whitlock', 'Gorski', 'Haskins', 'Delgado', 'Quist',
  'Bellweather', 'Sandoval', 'Featherstone', 'Larkspur', 'Gristle', 'Templeton', 'Pomeroy', 'Nakamura', 'Petrov', 'Lindqvist', 'Adeyemi',
  'Moreau', 'Higgins', 'Crumley', 'Varga', 'Oduya', 'Tremblay', 'Szabo', 'Calloway', 'Breckenridge', 'Mendez', 'Huang', 'Rasmussen', 'Ferreira',
  'Kimball', 'Ortolani', 'Puckett', 'Stroud', 'Wainwright', 'Yoder', 'Zielinski', 'Achterberg', 'Bramble', 'Culpepper', 'Dunmore'];
export const NICKS = ['Spoons', 'Tiny', 'Doc', 'Wheels', 'Biscuit', 'Pickles', 'Ironjaw', 'Slim', 'Mumbles', 'Whistles', 'Socks', 'Turbo',
  'Grits', 'Lucky', 'Cheese', 'Moth', 'Snooze', 'Bricks', 'Bones', 'Cricket', 'Noodles', 'Two-Toes', 'Hambone', 'Chalk', 'Buttons', 'Velvet',
  'Cannonball', 'Jitters', 'Meatloaf', 'Squeaky', 'Teacup', 'Domino', 'Rooster', 'Static', 'Waffles', 'Hiccup', 'Thunder', 'Pretzel', 'Goose',
  'Lefty', 'Dimples', 'Sprout', 'Gumbo', 'Tadpole', 'Brisket', 'Ladle', 'Fuse', 'Marbles'];
export const CRIMES = ['Grand Theft Lawnmower', 'Counterfeit Coupons', 'Aggravated Jaywalking', 'Smuggling Exotic Cheese', 'Impersonating a Mall Santa',
  'Robbing a Bank (with a Banana)', 'Arson of a Barbecue', 'Tax Evasion', 'Running an Illegal Bingo Hall', 'Bar Brawl', 'Insurance Fraud',
  'Hot-wiring a Zamboni', 'Unlicensed Dentistry', 'Stealing a Town Statue', 'Pigeon Racing Fraud', 'Bribing a Pie Judge', 'Burglary (of a Bakery)',
  'Forging Library Cards', 'Joyriding a Combine Harvester', 'Smuggling Fireworks', 'Disorderly Conduct at a Wedding', 'Selling Fake Lottery Tickets'];

export const CREWS = {
  suds: { id: 'suds', name: 'The Suds', color: '#e9eef2', turf: 'laundry', motto: 'Clean hands, dirty deals.' },
  kings: { id: 'kings', name: 'Kitchen Kings', color: '#c23b2b', turf: 'mess', motto: 'Nobody eats without the Kings.' },
  pit: { id: 'pit', name: 'The Iron Pit', color: '#3f8a3a', turf: 'yard', motto: 'Lift, or get lifted.' },
};

// Personality traits are 0..1. interests weight free-time activities.
export const NOTABLES = [
  { id: 'bleach', first: 'Marisol', last: 'Fontaine', nick: 'Bleach', kind: 'inmate', crew: 'suds', role: 'leader', job: 'laundry', block: 'A',
    traits: { aggression: 0.55, sociability: 0.6, greed: 0.5, bravery: 0.85, loyalty: 0.9, honesty: 0.6 }, interests: { work: 3, fitness: 1, social: 2 },
    stats: { str: 55, agi: 60, tgh: 60, smt: 65 }, app: { female: true, build: 'athletic', hair: 'ponytail' }, crime: 'Running an Illegal Bingo Hall', sentence: 6 },
  { id: 'gravy', first: 'Bartholomew', last: 'Odom', nick: 'Gravy', kind: 'inmate', crew: 'kings', role: 'leader', job: 'kitchen', block: 'B',
    traits: { aggression: 0.45, sociability: 0.85, greed: 0.9, bravery: 0.6, loyalty: 0.7, honesty: 0.3 }, interests: { social: 3, work: 2, games: 2 },
    stats: { str: 60, agi: 30, tgh: 75, smt: 50 }, app: { build: 'heavy', hair: 'bald', facial: 'beard' }, crime: 'Smuggling Exotic Cheese', sentence: 9 },
  { id: 'moose', first: 'Tomasz', last: 'Gorski', nick: 'Moose', kind: 'inmate', crew: 'pit', role: 'leader', job: null, block: 'B',
    traits: { aggression: 0.8, sociability: 0.4, greed: 0.4, bravery: 0.95, loyalty: 0.8, honesty: 0.7 }, interests: { fitness: 5, social: 1 },
    stats: { str: 85, agi: 45, tgh: 80, smt: 30 }, app: { build: 'giant', hair: 'buzz', facial: 'stubble' }, crime: 'Hot-wiring a Zamboni', sentence: 12 },
  { id: 'spoons', first: 'Lenny', last: 'Abernathy', nick: 'Two-Spoons', kind: 'inmate', role: 'fixer', job: null, block: 'A',
    traits: { aggression: 0.15, sociability: 0.95, greed: 0.95, bravery: 0.3, loyalty: 0.3, honesty: 0.2 }, interests: { social: 4, games: 3 },
    stats: { str: 25, agi: 50, tgh: 30, smt: 70 }, app: { build: 'slim', hair: 'slick', facial: 'mustache' }, crime: 'Selling Fake Lottery Tickets', sentence: 4, trader: true },
  { id: 'grandpa', first: 'Eustace', last: 'Quist', nick: 'Grandpa', kind: 'inmate', role: 'oldtimer', job: 'library', block: 'A',
    traits: { aggression: 0.1, sociability: 0.7, greed: 0.2, bravery: 0.5, loyalty: 0.6, honesty: 0.9 }, interests: { reading: 4, games: 3, social: 2 },
    stats: { str: 20, agi: 15, tgh: 35, smt: 80 }, app: { build: 'slim', age: 'old', hair: 'bald', facial: 'beard', glasses: true }, crime: 'Stealing a Town Statue', sentence: 40 },
  { id: 'knuckles', first: 'Rufus', last: 'Muldoon', nick: 'Knuckles', kind: 'inmate', role: 'bully', job: null, block: 'A',
    traits: { aggression: 0.95, sociability: 0.35, greed: 0.8, bravery: 0.7, loyalty: 0.2, honesty: 0.3 }, interests: { fitness: 2, mischief: 4 },
    stats: { str: 70, agi: 45, tgh: 65, smt: 25 }, app: { build: 'stocky', hair: 'buzz', facial: 'goatee' }, crime: 'Bar Brawl', sentence: 7, bully: true },
  { id: 'whisper', first: 'Ignatius', last: 'Culpepper', nick: 'Whisper', kind: 'inmate', role: 'snitch', job: 'janitor', block: 'B',
    traits: { aggression: 0.1, sociability: 0.5, greed: 0.6, bravery: 0.1, loyalty: 0.1, honesty: 0.05 }, interests: { social: 3, reading: 1 },
    stats: { str: 18, agi: 55, tgh: 25, smt: 55 }, app: { build: 'slim', hair: 'short', glasses: true }, crime: 'Forging Library Cards', sentence: 3, snitch: true },
  { id: 'professor', first: 'Delphine', last: 'Larkspur', nick: 'Professor', kind: 'inmate', role: 'scholar', job: 'library', block: 'B',
    traits: { aggression: 0.1, sociability: 0.75, greed: 0.2, bravery: 0.45, loyalty: 0.7, honesty: 0.85 }, interests: { reading: 5, games: 2 },
    stats: { str: 25, agi: 35, tgh: 35, smt: 90 }, app: { female: true, build: 'average', hair: 'bun', glasses: true }, crime: 'Insurance Fraud', sentence: 15 },
  // Staff
  { id: 'warden', first: 'Hollis', last: 'Pruitt', title: 'Warden', kind: 'staff', role: 'warden', app: { outfit: 'warden', build: 'stocky', age: 'old', hair: 'slick', facial: 'mustache' },
    traits: { aggression: 0.3, sociability: 0.4, greed: 0.5, bravery: 0.6, loyalty: 0.5, honesty: 0.55 }, stats: { str: 40, agi: 25, tgh: 50, smt: 75 } },
  { id: 'nurse', first: 'Dolores', last: 'Haverford', title: 'Nurse', kind: 'staff', role: 'nurse', app: { outfit: 'nurse', female: true, build: 'average', hair: 'bob' },
    traits: { aggression: 0.1, sociability: 0.8, greed: 0.2, bravery: 0.4, loyalty: 0.5, honesty: 0.9 }, stats: { str: 30, agi: 35, tgh: 40, smt: 75 } },
  { id: 'kettle', first: 'Wanda', last: 'Kettle', title: 'Sgt.', kind: 'guard', role: 'sergeant', post: 'hallDesk', corrupt: 0.05,
    traits: { aggression: 0.75, sociability: 0.3, greed: 0.2, bravery: 0.9, loyalty: 0.8, honesty: 0.9 }, stats: { str: 70, agi: 55, tgh: 75, smt: 55 }, app: { outfit: 'guard', female: true, build: 'athletic', hair: 'bun' } },
  { id: 'dooley', first: 'Floyd', last: 'Dooley', title: 'Officer', kind: 'guard', role: 'guard', post: 'mess', corrupt: 0.8,
    traits: { aggression: 0.3, sociability: 0.7, greed: 0.9, bravery: 0.35, loyalty: 0.3, honesty: 0.2 }, stats: { str: 45, agi: 30, tgh: 55, smt: 35 }, app: { outfit: 'guard', build: 'heavy', facial: 'mustache' } },
  { id: 'reyes', first: 'Ines', last: 'Reyes', title: 'Officer', kind: 'guard', role: 'guard', post: 'blockA', corrupt: 0.15,
    traits: { aggression: 0.4, sociability: 0.6, greed: 0.2, bravery: 0.8, loyalty: 0.6, honesty: 0.8 }, stats: { str: 55, agi: 60, tgh: 60, smt: 60 }, app: { outfit: 'guard', female: true, build: 'athletic', hair: 'ponytail' } },
  { id: 'murtagh', first: 'Clyde', last: 'Murtagh', title: 'Officer', kind: 'guard', role: 'guard', post: 'blockB', corrupt: 0.1,
    traits: { aggression: 0.55, sociability: 0.3, greed: 0.3, bravery: 0.75, loyalty: 0.7, honesty: 0.85 }, stats: { str: 60, agi: 45, tgh: 65, smt: 45 }, app: { outfit: 'guard', build: 'stocky', facial: 'chops' } },
  { id: 'tulley', first: 'Benny', last: 'Tulley', title: 'Officer', kind: 'guard', role: 'rookie', post: 'patrol', corrupt: 0.35,
    traits: { aggression: 0.2, sociability: 0.6, greed: 0.4, bravery: 0.3, loyalty: 0.5, honesty: 0.6 }, stats: { str: 40, agi: 50, tgh: 45, smt: 40 }, app: { outfit: 'guard', build: 'slim', age: 'young' } },
  { id: 'grubb', first: 'Opal', last: 'Grubb', title: 'Officer', kind: 'guard', role: 'guard', post: 'yard', corrupt: 0.25,
    traits: { aggression: 0.65, sociability: 0.45, greed: 0.4, bravery: 0.85, loyalty: 0.6, honesty: 0.6 }, stats: { str: 65, agi: 50, tgh: 70, smt: 45 }, app: { outfit: 'guard', female: true, build: 'stocky', hair: 'short' } },
  { id: 'vance', first: 'Hank', last: 'Vance', title: 'Officer', kind: 'guard', role: 'guard', post: 'gym', corrupt: 0.7,
    traits: { aggression: 0.6, sociability: 0.5, greed: 0.8, bravery: 0.7, loyalty: 0.4, honesty: 0.3 }, stats: { str: 60, agi: 45, tgh: 60, smt: 40 }, app: { outfit: 'guard', build: 'average', facial: 'stubble' } },
  { id: 'rourke', first: 'Seamus', last: 'Rourke', title: 'Officer', kind: 'guard', role: 'tower', post: 'tower', corrupt: 0.2,
    traits: { aggression: 0.5, sociability: 0.2, greed: 0.3, bravery: 0.7, loyalty: 0.7, honesty: 0.7 }, stats: { str: 50, agi: 40, tgh: 55, smt: 50 }, app: { outfit: 'guard', build: 'average', facial: 'beard' } },
];

const JOBS = ['laundry', 'kitchen', 'workshop', 'janitor', null, null];

/** Generate the general inmate population. */
export function generateInmates(count, seed) {
  const r = new RNG(seed);
  const out = [];
  const usedNames = new Set(NOTABLES.map((n) => `${n.first} ${n.last}`));
  const usedNicks = new Set(NOTABLES.map((n) => n.nick));
  for (let i = 0; i < count; i++) {
    let first, last;
    do { first = r.pick(FIRST); last = r.pick(LAST); } while (usedNames.has(`${first} ${last}`));
    usedNames.add(`${first} ${last}`);
    let nick = null;
    if (r.chance(0.65)) { let tries = 0; do { nick = r.pick(NICKS); } while (usedNicks.has(nick) && tries++ < 20); usedNicks.add(nick); }
    const crew = r.chance(0.45) ? r.pick(['suds', 'kings', 'pit']) : null;
    const job = crew === 'suds' ? 'laundry' : crew === 'kings' ? 'kitchen' : r.pick(JOBS);
    const traits = {
      aggression: r.range(0.05, 0.85), sociability: r.range(0.15, 0.95), greed: r.range(0.1, 0.9),
      bravery: r.range(0.1, 0.9), loyalty: r.range(0.1, 0.9), honesty: r.range(0.1, 0.9),
    };
    if (crew === 'pit') { traits.aggression = Math.min(1, traits.aggression + 0.25); traits.bravery = Math.min(1, traits.bravery + 0.2); }
    const interests = { fitness: r.range(0, 3) + (crew === 'pit' ? 3 : 0), reading: r.range(0, 2.5), social: r.range(0.5, 3), games: r.range(0, 2.5), work: r.range(0, 1.5), mischief: traits.aggression * 2 };
    const base = r.range(20, 55);
    const stats = { str: base + r.range(-10, 20) + (crew === 'pit' ? 15 : 0), agi: r.range(20, 60), tgh: base + r.range(-5, 20), smt: r.range(15, 70) };
    out.push({ id: `inm${i}`, first, last, nick, kind: 'inmate', crew, role: crew ? 'member' : 'loner', job, block: i % 2 ? 'B' : 'A', traits, interests, stats,
      app: {}, crime: r.pick(CRIMES), sentence: r.int(2, 60), seed: r.int(1, 1e9) });
  }
  return out;
}

export function displayName(def) {
  if (def.title) return `${def.title} ${def.last}`;
  return def.nick ? `${def.first} "${def.nick}" ${def.last}` : `${def.first} ${def.last}`;
}
export function shortName(def) {
  if (def.title) return `${def.title} ${def.last}`;
  return def.nick || def.first;
}
