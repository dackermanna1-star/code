// PUZZLE DATA — PA console, ROLLCALL terminal, Haupt's safe. CONTENT.md §5.10; DESIGN §6 IV.2–3, VI.1, §9.
// Pure data plus small pure helpers. No engine imports; the systems scripts (sys.pa / sys.terminal /
// sys.safe) own the side effects (sfx, lamps, flags, checkpoints, the printer battery).
//
// Text uses the dialogue markup from TECH §5.3: {p} {p=1.2} {dim}…{/dim} *emphasis*.

// ---- PA console (Ch4, main office) -------------------------------------------------------------------------
// 16 bat-handle switches, in panel order. Labels are what's on the label tape.
export const PA_ROOMS = [
  '101', '102', '103', '104', '201', '202', '203', '205', '206', '207',
  'LIB', 'GYM', 'CAF', 'AUD', 'BSMT', 'OFFICE',
].map((id) => ({ id, label: id }));

// LISTEN results, keyed by room id. Chapter-agnostic.
//   lines: [{ text, sfx?, loop? }] — what Tess hears, played in order as narration (g.narrate).
//          sfx = a TECH §10 SFX id, fired as the line appears; loop = a TECH §10 ambience id to run
//          quietly under the line (stop it when the listen ends).
//   think: Tess's one-line reaction afterwards (g.think), optional.
export const PA_LISTEN = {
  '101': {
    lines: [
      { text: 'A hiss. Then, far off and very small, children singing. Little kids, half a beat behind each other.', loop: 'classroom' },
      { text: '{dim}...we answer to thy call... present, present, every one...{/dim}' },
    ],
    think: 'That\'s the kindergarten. There\'s nobody in the kindergarten.',
  },
  '102': {
    lines: [{ text: 'Room tone. Then chalk, slow, one letter at a time, pressed hard enough to squeak.', sfx: 'chalk', loop: 'classroom' }],
    think: 'The board with Danny\'s name on it.',
  },
  '103': {
    lines: [{ text: 'Room tone. A desk creaks, the way one does when somebody shifts their weight.', sfx: 'desk_creak', loop: 'classroom' }],
    think: 'That\'s where we sat.',
  },
  '104': {
    lines: [{ text: 'Static.' }],
  },
  '201': {
    lines: [{ text: 'Room tone. Something settles into a chair, slowly. The chair complains about it.', sfx: 'chair_scrape', loop: 'classroom' }],
    think: 'That was a lot of sound for one chair.',
  },
  '202': {
    lines: [{ text: 'Static.' }],
  },
  '203': {
    lines: [{ text: 'A faucet dripping into a steel sink. Plink. {p} Plink.', sfx: 'drip' }],
  },
  '205': {
    lines: [
      { text: 'Right up against the microphone, a pencil, scratching without stopping.', sfx: 'pen_scratch', loop: 'classroom' },
      { text: '{dim}...i will not leave. i will not leave. i will not leave...{/dim}' },
    ],
    think: 'Danny. That\'s Danny. He sounds like he\'s reading it off the board.',
  },
  '206': {
    lines: [{ text: 'Static. One dry click, like a fingernail on glass.', sfx: 'cicada_click' }],
  },
  '207': {
    lines: [{ text: 'A thin electric whine, like a TV left on in another room.', loop: 'period_buzz' }],
    think: 'Something up there has power.',
  },
  LIB: {
    lines: [
      { text: 'Soft crying. Somebody trying very hard to be quiet about it.', loop: 'library' },
      { text: '{dim}...T?{/dim}' },
    ],
    think: 'Leah. {p} Leah doesn\'t cry.',
  },
  GYM: {
    lines: [
      { text: 'Rain, drumming on a big roof.', loop: 'gym' },
      { text: 'Under it, breathing. Slow. Wet. Very big.', sfx: 'colonel_breath' },
    ],
    think: 'Not the gym. Okay. Never the gym.',
  },
  CAF: {
    lines: [{ text: 'Static, and under it a cooler humming. Nothing in this building should have power.', loop: 'cafeteria' }],
  },
  AUD: {
    lines: [
      { text: 'A crowd. Hundreds of people in a big room, murmuring, settling into their seats.', sfx: 'crowd_murmur', loop: 'auditorium' },
      { text: 'Under it, a band tuning. A clarinet finds its note and holds it.' },
      { text: 'Applause, thin and crackly, like off an old record.', sfx: 'applause_old' },
    ],
    think: 'There\'s an assembly. {p} There\'s an assembly going on.',
  },
  BSMT: {
    lines: [{ text: 'The boiler. A roar like standing inside the firebox.', sfx: 'boiler_door', loop: 'boiler_room' }],
    think: 'Still lit. Nobody feeds it.',
  },
  OFFICE: {
    lines: [{ text: 'Static. Then breathing, right up against the microphone. Quick and shallow.', sfx: 'breath_hold', loop: 'office' }],
    think: 'I hold my breath. {p} It stops. {p=0.8} ...That\'s me.',
  },
};

// ALL CALL = roll call #1 (DESIGN §6 IV.3). Fires after the 3rd LISTEN, after 45 s at the console, or when
// the player closes it. Sequence for ch4.roll1 / sys.pa:
//   start  — the console takes over ({ text: '' } = sound only)
//   roll   — { who: 'voice' } is the school (say('voice', null, text, { name: '???' }));
//            { who: friendId, via: 'intercom' } is that friend's own faint reply through the speaker, and
//            `lamp` is the room lamp that lights on that reply; { beat } is narration; { who: 'marcus' } is
//            Marcus beside Tess.
//   tess   — the question, the choice, and the two outcomes (then set roll1_done / roll1_answered).
//   note   — sketchbook Notes line added afterwards.
export const PA_ALL_CALL = {
  trigger: { listens: 3, seconds: 45, onClose: true },
  lamps: ['205', 'LIB'],
  start: [
    { text: 'Every switch on the console drops at once. The ALL CALL key goes down by itself.', sfx: 'intercom_crackle' },
    { text: '', sfx: 'intercom_chime' },
  ],
  roll: [
    { who: 'voice', text: 'Daniel Kovach.' },
    { who: 'danny', via: 'intercom', text: '{dim}...present.{/dim}', lamp: '205' },
    { who: 'voice', text: 'Leah Brandt.' },
    { who: 'leah', via: 'intercom', text: '{dim}...present.{/dim}', lamp: 'LIB', note: 'crying' },
    { who: 'voice', text: 'Marcus Webb.' },
    { beat: 'Marcus stares at the grille. He doesn\'t make a sound.' },
    { who: 'voice', text: 'Marcus Webb.' },
    { who: 'marcus', text: 'Don\'t.' },
  ],
  tess: {
    call: { who: 'voice', text: 'Theresa Dolan?' },
    choices: ['Here.', '(Say nothing.)'],
    here: [{ who: 'voice', text: 'Thank you, Theresa.' }],
    silent: [
      { who: 'voice', text: 'Theresa Dolan... {p} absent.' },
      { text: '', sfx: 'pen_scratch' },
      { who: 'voice', text: 'Absences will be made up.' },
    ],
  },
  note: 'Danny — 205? Leah — library?',
};

// Convenience: the console data travels with the switch list too (PA_ROOMS.listen / PA_ROOMS.allCall).
PA_ROOMS.listen = PA_LISTEN;
PA_ROOMS.allCall = PA_ALL_CALL;

// ---- ROLLCALL terminal (Room 207, optional) ------------------------------------------------------------------
// TRS-80 Model I, district attendance program. Screen is 64 columns, upper case (the UI uppercases and adds
// the '>' cursor). Input: letters, digits, space, comma, period. EXIT / Esc are handled by the UI.
//
// lookup[KEY] is an array of lines or a function (state) => lines. Keys are surnames (plus a few first
// names, nicknames and years). TERMINAL.respond(input, state) resolves a typed line to output lines.
//
// REWARD: a lookup of 'HALLOWELL' is what triggers the printer battery (once) — the systems code
// (sys.terminal) detects the HALLOWELL lookup and gives the battery from the printer tray; nothing here
// has side effects.

const COLS = 64;
const row = (name, meta = '') => (meta ? name.padEnd(24) + meta : name);
const f = (s) => (s && s.flags) || {};
const lastRollDone = (s) => !!(f(s).ch8_vault || f(s).register_done);

/** A 1996 friend's record: pencil (PROVISIONAL) until the last roll, then by bond. */
function friend(s, { id, name, takenFlag, homeroom }) {
  const fl = f(s);
  const out = [row(name, 'AGE 16')];
  if (fl[`withdrawn_${id}`]) out.push('STATUS: WITHDRAWN - FORWARDING ADDRESS ON FILE');
  else if (!fl[takenFlag]) return null;
  else if (lastRollDone(s) && !(s.bonds && s.bonds[id])) out.push('STATUS: ENROLLED 1996 - PERMANENT RECORD');
  else out.push('STATUS: ENROLLED 1996 - PROVISIONAL');
  if (!fl[`withdrawn_${id}`]) out.push(`HOMEROOM: ${homeroom}`);
  return out;
}

const kept = (name, meta, year, ...extra) => [row(name, meta), `ENROLLED ${year} - NOT DISMISSED`, ...extra];
const staff = (name, meta, ...extra) => [row(name, meta), ...extra];
const didYouMean = (typed, full) => [`NO PUPIL NAMED ${typed}.`, `DID YOU MEAN: ${full}?`];

const DENISE = kept('WEBB, DENISE ANN', 'AGE 15  GR 10', 1979, 'SIGNED OUT 1:20 PM BY I. WEBB - NOT RELEASED');

function marcus(s) {
  const rec = friend(s, { id: 'marcus', name: 'WEBB, MARCUS', takenFlag: 'ch6_marcus_taken', homeroom: 'AUD' });
  if (rec) return rec;
  return [row('WEBB, MARCUS', 'AGE 16'), ...absent(s)];
}

/** Not (yet) in the Register: called at a roll and silent = ABSENT (CONTENT §5.10 vocabulary). */
function absent(s) {
  return f(s).roll1_done
    ? ['STATUS: ABSENT - CALLED 10/19/96, DID NOT ANSWER', 'NOTE: ABSENCES WILL BE MADE UP.']
    : ['STATUS: EXPECTED'];
}

function dolan(s) {
  const fl = f(s);
  const r = (s && s.rollAnswered) || 0;
  const out = [row('DOLAN, THERESA MARIE', 'AGE 16')];
  if (fl.withdrawn_tess) out.push('STATUS: WITHDRAWN - FORWARDING ADDRESS ON FILE');
  // r = 0: not in the Register (DESIGN §8 lists Tess only at rollAnswered >= 1). No 'N OF 3': the
  // terminal is only reachable in Ch5, after one roll, and must not announce how many rolls there are.
  else if (r <= 0) out.push(...absent(s));
  else if (r === 1) out.push('STATUS: PROVISIONAL', 'NOTE: ANSWERED ONCE. A SECOND ANSWER IS PERMANENT.');
  else out.push('STATUS: PERMANENT RECORD', `NOTE: ANSWERED ${r} TIMES.`);
  out.push(fl.form_used_on === 'tess' ? 'TRANSFER: ON FILE - PHILADELPHIA' : 'TRANSFER: NONE ON FILE');
  return out;
}

const NINE = [
  ['BURDICK, ANTHONY', 'AGE 13  GR 8'],
  ['DELVECCHIO, THOMAS', 'AGE 16  GR 11'],
  ['GORSKI, LISA', 'AGE 16  GR 11'],
  ['HOYT, KEVIN', 'AGE 12  GR 6'],
  ['MRAZEK, CAROL ANN', 'AGE 17  GR 12'],
  ['OAKES, RAYMOND', 'AGE 9  GR 4'],
  ['SZALAY, PATRICIA', 'AGE 14  GR 9'],
  ['WEBB, DENISE ANN', 'AGE 15  GR 10'],
  ['YANCEY, MICHELLE', 'AGE 11  GR 6'],
];
const yearRoll = (year, names) => [`ROLL OF 10/19/${String(year).slice(2)} - FOUNDER'S DAY`, ...names.map(([n]) => `  ${n.padEnd(24)}NOT DISMISSED`)];

const LOOKUP = {
  // 1996
  KOVACH: (s) => [
    ...(friend(s, { id: 'danny', name: 'KOVACH, DANIEL', takenFlag: 'ch1_danny_vanished', homeroom: '205' })
      || [row('KOVACH, DANIEL', 'AGE 16'), 'STATUS: EXPECTED']),
    '',
    row('KOVACH, ANDREW', 'ENROLLED 1925 - DISMISSED 1935'),
  ],
  BRANDT: (s) => friend(s, { id: 'leah', name: 'BRANDT, LEAH', takenFlag: 'ch2_leah_taken', homeroom: 'LIBRARY' })
    || [row('BRANDT, LEAH', 'AGE 16'), 'STATUS: EXPECTED'],
  WEBB: (s) => [...DENISE, '', ...marcus(s)],
  DOLAN: dolan,

  // The Founder
  HALLOWELL: (s) => [
    'HALLOWELL, CYRUS',
    'FIRST PUPIL - ENROLLED 1923 - SUBJECT TO ALL RULES PER',
    'FOUNDER\'S CHARTER - STATUS: ' + (f(s).expelled ? 'EXPELLED' : 'OUT OF SEAT'),
    'CHARTER ON FILE: LIBRARY - HIST. COLL. CASE',
  ],

  // 1979 — the Nine, and staff
  BURDICK: kept(...NINE[0], 1979),
  DELVECCHIO: kept(...NINE[1], 1979),
  GORSKI: kept(...NINE[2], 1979),
  HOYT: kept(...NINE[3], 1979, 'DUTY: SAFETY PATROL CAPTAIN - ON DUTY'),
  MRAZEK: [...kept(...NINE[4], 1979), '', row('MRAZEK, STEPHEN', 'AGE 11  GR 5'), 'ENROLLED 1962 - TRUANT'],
  OAKES: kept(...NINE[5], 1979),
  SZALAY: kept(...NINE[6], 1979),
  YANCEY: kept(...NINE[8], 1979, 'DUTY: SAFETY PATROL'),
  ADAIR: staff('ADAIR, RUTH E.', 'STAFF - MUSIC', 'STATUS: HELD', 'LAST ENTRY: "H, FOR HALLOWELL"'),
  HAUPT: staff('HAUPT, GERALD F.', 'STAFF - PRINCIPAL 1959-1980', 'ROLL PRESENTED TO THE FOUNDER: 21 OF 21', 'STATUS: RESIGNED'),
  LUTZ: staff('LUTZ, HAROLD', 'STAFF - BIOLOGY 1964-1980'),
  OSTROWSKI: staff('OSTROWSKI, EDNA', 'STAFF - LIBRARIAN 1946-1980'),

  // 1962
  PRUSZYNSKI: [...kept('PRUSZYNSKI, JOSEPH', 'AGE 10  GR 4', 1962), '', row('PRUSZYNSKI, WALTER', 'STAFF - CUSTODIAN 1958-1979')],
  YURKONIS: kept('YURKONIS, GREGORY', 'AGE 12  GR 6', 1962),
  FENSTERMACHER: kept('FENSTERMACHER, LINDA', 'AGE 14  GR 8', 1962),
  DOUGHERTY: kept('DOUGHERTY, PAUL', 'AGE 16  GR 10', 1962),

  // 1945
  HRINKO: kept('HRINKO, STANLEY', 'AGE 15  GR 9', 1945),
  DUNLEAVY: kept('DUNLEAVY, MARGARET', 'AGE 9  GR 4', 1945),
  CUCCIA: kept('CUCCIA, ROSE MARIE', 'AGE 11  GR 5', 1945),
  KOSKO: kept('KOSKO, EDWARD', 'AGE 12  GR 6', 1945),
  REESE: kept('REESE, EVAN', 'AGE 13  GR 7', 1945),

  // 1928
  BENDIK: kept('BENDIK, ANNA', 'AGE 8  GR 2', 1928),
  MULHALL: kept('MULHALL, FRANCIS', 'AGE 11  GR 5', 1928),

  // Years
  1894: ['NO RECORDS BEFORE 1923.', 'SEE FOUNDER\'S REGISTER.'],
  1911: ['NO RECORDS BEFORE 1923.', 'SEE FOUNDER\'S REGISTER.'],
  1923: ['10/19/23 - SCHOOL DEDICATED', 'FIRST PUPIL: HALLOWELL, CYRUS'],
  1928: yearRoll(1928, [['BENDIK, ANNA'], ['MULHALL, FRANCIS']]),
  1945: yearRoll(1945, [['CUCCIA, ROSE MARIE'], ['DUNLEAVY, MARGARET'], ['HRINKO, STANLEY'], ['KOSKO, EDWARD'], ['REESE, EVAN']]),
  1962: yearRoll(1962, [['DOUGHERTY, PAUL'], ['FENSTERMACHER, LINDA'], ['PRUSZYNSKI, JOSEPH'], ['YURKONIS, GREGORY']]),
  1979: yearRoll(1979, NINE),

  // First names and nicknames: the program only knows legal surnames.
  TESS: didYouMean('TESS', 'DOLAN, THERESA MARIE'),
  THERESA: didYouMean('THERESA', 'DOLAN, THERESA MARIE'),
  DANNY: didYouMean('DANNY', 'KOVACH, DANIEL'),
  DANIEL: didYouMean('DANIEL', 'KOVACH, DANIEL'),
  LEAH: didYouMean('LEAH', 'BRANDT, LEAH'),
  MARCUS: didYouMean('MARCUS', 'WEBB, MARCUS'),
  DENISE: didYouMean('DENISE', 'WEBB, DENISE ANN'),
  JOEY: didYouMean('JOEY', 'PRUSZYNSKI, JOSEPH'),
  KEVIN: didYouMean('KEVIN', 'HOYT, KEVIN'),
  RUTH: ['NO PUPIL NAMED RUTH.', 'DID YOU MEAN: ADAIR, RUTH E. (STAFF)?'],
  WALT: ['NO PUPIL NAMED WALT.', 'DID YOU MEAN: PRUSZYNSKI, WALTER (STAFF)?'],
  CYRUS: didYouMean('CYRUS', 'HALLOWELL, CYRUS'),
  'MR H': didYouMean('MR. H', 'HALLOWELL, CYRUS'),
  'MR. H': didYouMean('MR. H', 'HALLOWELL, CYRUS'),
};

const BANNER = [
  'KETTLE RUN AREA SCHOOL DISTRICT',
  'ROLLCALL - ATTENDANCE REGISTER - REV. 2  (9/78)',
  'HALLOWELL CONSOLIDATED SCHOOL',
  'ROLL IN SESSION: 10/19/96',
  'TYPE A SURNAME, LIST, OR HELP.',
];

export const TERMINAL = {
  boot: [
    'TRSDOS - DISK OPERATING SYSTEM',
    'DATE (MM/DD/YY)? 10/19/96',
    'TIME (HH:MM:SS)? 13:45:00',
    'TRSDOS READY',
    'BASIC',
    'RADIO SHACK DISK BASIC',
    'READY',
    '>RUN "ROLLCALL/BAS"',
    '',
    ...BANNER,
  ],
  // Printed after each response, before the UI's '>' cursor.
  prompt: 'SURNAME?',
  run: ['', ...BANNER],
  help: [
    'COMMANDS',
    '  (SURNAME)   SHOW A PUPIL OR STAFF RECORD',
    '  (YEAR)      SHOW THE FOUNDER\'S DAY ROLL FOR THAT YEAR',
    '  LIST        PRINT TODAY\'S ROLL',
    '  RUN         RESTART PROGRAM',
    '  HELP        THIS SCREEN',
    '  EXIT        LOG OFF',
    'STATUS: EXPECTED / ABSENT / PROVISIONAL / PERMANENT RECORD /',
    '        WITHDRAWN / DISMISSED / NOT DISMISSED',
  ],
  list: [
    'ROLL OF 10/19/96 - FOUNDER\'S DAY ASSEMBLY',
    '  1  HALLOWELL, CYRUS          FIRST PUPIL',
    '  2  KOVACH, DANIEL',
    '  3  BRANDT, LEAH',
    '  4  WEBB, MARCUS',
    '  5  DOLAN, THERESA MARIE',
    '5 ON ROLL.  0 DISMISSED.',
  ],
  lookup: LOOKUP,
  unknown: ['NO RECORD FOUND.', 'EVERY PUPIL IS ON THE ROLL. CHECK SPELLING.'],

  /** Resolve one typed line to output lines (pure). EXIT is handled by the UI. */
  respond(input, state = {}) {
    const T = TERMINAL;
    const cmd = String(input || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/[.,\s]+$/, '');
    if (cmd === 'HELP') return T.help.slice();
    if (cmd === 'LIST' || cmd === '1996') return T.list.slice();
    if (cmd === 'RUN') return T.run.slice();
    const surname = cmd.split(',')[0].trim();
    const hit = [cmd, surname, surname.split(' ')[0]].map((k) => T.lookup[k]).find((v) => v !== undefined);
    if (hit === undefined) return T.unknown.slice();
    const out = typeof hit === 'function' ? hit(state || {}) : hit;
    return out.map((ln) => (ln.length > COLS ? ln.slice(0, COLS) : ln));
  },
};

// ---- Haupt's safe (Ch6) -----------------------------------------------------------------------------------
// Label inside the portrait frame; answer from the lobby plaque (and OUR PROUD HERITAGE): 10-19-94.
// wrong[key] (key = 'mo-day-yr', two digits each) is Tess's line (g.think) for a specific wrong guess;
// otherwise wrongGeneric[tries - 1] (clamped); on the third wrong try, `third` instead.
export const SAFE = {
  label: 'FIRST FOUNDER\'S DAY (mo-day-yr)',
  combo: [10, 19, 94],
  wrong: {
    '10-19-23': 'That\'s when the school opened. Founder\'s Day is older than the school.',
    '10-19-11': 'That\'s when he died. It started before that.',
    '10-19-79': 'No. Not *that* day.',
    '10-19-96': 'No. Not *that* day.',
    '10-18-96': 'That\'s tonight. It\'s older than tonight.',
    '10-19-28': 'Older than that. The *first* one.',
    '10-19-45': 'Older than that. The *first* one.',
    '10-19-62': 'Older than that. The *first* one.',
  },
  wrongGeneric: [
    'No.',
    'Month, day, year. Founder\'s Day is October nineteenth. It\'s the year.',
    'Think. Where did I see it?',
  ],
  third: 'First Founder\'s Day. The plaque had the year.',

  /** Key for the `wrong` table from three dial numbers. */
  key(a, b, c) { return [a, b, c].map((n) => String(n).padStart(2, '0')).join('-'); },
  /** Tess's line for a wrong try (tries counts this one, from 1). */
  wrongLine(a, b, c, tries) {
    if (tries === 3) return SAFE.third;
    const g = SAFE.wrongGeneric;
    return SAFE.wrong[SAFE.key(a, b, c)] || g[Math.max(1, Math.min(tries, g.length)) - 1];
  },
};
