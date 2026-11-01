// What happens when a character uses a furniture spot. Activities drive animation, needs,
// training gains, job pay and a few instant interactions (vending, meals, books...).
// The same rules apply to the player and NPCs.

// posture: looping full-body posture; clip: looping action clip; stat gains are per "rep"
// (animation rep events) or per game minute; job: pays per rep while on shift.
export const ACTIVITIES = {
  sleep: { posture: 'lie', perMin: { energy: 0.3 }, label: 'Sleeping' },
  heal: { posture: 'lie', perMin: { hp: 0.9, energy: 0.05 }, label: 'Resting' },
  toilet: { posture: 'sit', minutes: [3, 8], label: 'On the toilet' },
  wash: { clip: 'work', minutes: [2, 5], label: 'Washing up' },
  write: { posture: 'sit', clip: 'work', perRep: { smt: 0.05 }, label: 'Writing letters' },
  hangout: { posture: 'sit', social: true, minutes: [8, 25], label: 'Hanging out' },
  rest: { posture: 'sit', minutes: [5, 15], label: 'Sitting' },
  phone: { clip: 'phone', minutes: [3, 8], perMin: { morale: 1 }, label: 'On the phone' },
  watchTV: { posture: 'sit', minutes: [15, 45], label: 'Watching TV' },
  eat: { posture: 'sit', clip: 'eat', perRep: { hunger: 6 }, minutes: [10, 18], label: 'Eating' },
  pool: { clip: 'pool', minutes: [8, 20], perRep: { agi: 0.02 }, social: true, label: 'Playing pool' },
  cards: { posture: 'sit', clip: 'talk', minutes: [10, 30], social: true, gamble: true, label: 'Playing cards' },
  pingPong: { clip: 'punchBag', minutes: [6, 15], perRep: { agi: 0.04 }, label: 'Playing ping-pong' },
  chess: { posture: 'sit', clip: 'talk', minutes: [10, 30], perRep: { smt: 0.06 }, label: 'Playing chess' },
  read: { posture: 'sit', clip: 'read', minutes: [15, 40], perMin: { smt: 0.025 }, label: 'Reading' },
  shower: { clip: 'shower', minutes: [4, 8], perMin: { morale: 0.6 }, label: 'Showering' },
  benchPress: { posture: 'benchPress', perRep: { str: 0.12 }, energyPerRep: 0.5, minutes: [6, 15], label: 'Bench pressing' },
  squat: { posture: 'squat', perRep: { str: 0.08, tgh: 0.04 }, energyPerRep: 0.5, minutes: [5, 12], label: 'Squatting' },
  pullup: { posture: 'pullup', perRep: { str: 0.07, agi: 0.05 }, energyPerRep: 0.5, minutes: [4, 10], label: 'Doing pull-ups' },
  situps: { posture: 'situps', perRep: { tgh: 0.1 }, energyPerRep: 0.4, minutes: [4, 10], label: 'Doing sit-ups' },
  punchBag: { clip: 'punchBag', perRep: { tgh: 0.05, str: 0.05 }, energyPerRep: 0.4, minutes: [5, 12], label: 'Working the bag' },
  treadmill: { run: 3.8, perMin: { agi: 0.06 }, energyPerMin: 0.5, minutes: [6, 15], label: 'Running' },
  hoops: { clip: 'shoot', perRep: { agi: 0.06 }, minutes: [8, 20], social: true, label: 'Shooting hoops' },
  // Jobs (pay while on shift)
  laundry: { clip: 'work', job: 'laundry', label: 'Running the machines' },
  fold: { clip: 'work', job: 'laundry', label: 'Folding laundry' },
  cook: { clip: 'mop', job: 'kitchen', label: 'Cooking' },
  prep: { clip: 'work', job: 'kitchen', label: 'Prepping food' },
  serve: { clip: 'work', job: 'kitchen', label: 'Serving' },
  washDishes: { clip: 'work', job: 'kitchen', label: 'Washing dishes' },
  stamp: { clip: 'stamp', job: 'workshop', label: 'Stamping plates' },
  tinker: { clip: 'work', job: 'workshop', label: 'Workbench' },
  shelve: { posture: 'sit', clip: 'work', job: 'library', perRep: { smt: 0.03 }, label: 'Cataloguing books' },
  // Staff
  staffNurse: { posture: 'sit', clip: 'work', label: 'On duty' },
  staffWarden: { posture: 'sit', clip: 'work', label: 'On duty' },
  staffRest: { posture: 'sit', label: 'On break' },
  staffMonitor: { posture: 'sit', clip: 'work', label: 'Watching monitors' },
  towerWatch: { label: 'On watch' },
  // Instant interactions are resolved by the game (UI or immediate effect)
  vend: { instant: true }, getFood: { instant: true }, browse: { instant: true }, raidFridge: { instant: true },
  nurse: { instant: true }, warden: { instant: true }, askGuard: { instant: true }, jobBoard: { instant: true },
};

export const JOBS = {
  laundry: { name: 'Laundry', where: 'laundry', pay: 1, perUnits: 4, desc: 'Wash and fold the facility linen.' },
  kitchen: { name: 'Kitchen', where: 'kitchen', pay: 1, perUnits: 4, desc: 'Cook and serve in the kitchen. Food perks.' },
  workshop: { name: 'Workshop', where: 'workshop', pay: 2, perUnits: 5, desc: 'Stamp license plates. Tools within reach.' },
  library: { name: 'Library', where: 'library', pay: 1, perUnits: 3, desc: 'Catalogue books. Good for the mind.' },
  janitor: { name: 'Janitor', where: 'hall', pay: 1, perUnits: 3, desc: 'Mop the halls. Keys to nothing, sadly.' },
};

/** Training gain with diminishing returns. */
export function trainGain(stat, base, energy) {
  const e = energy < 10 ? 0.25 : energy < 30 ? 0.7 : 1;
  return base * Math.max(0.05, 1 - stat / 110) * e;
}
