// Fake HW pieces for the UI preview harness: state, maps (rooms only), game hooks, sample docs,
// a fake world backdrop and optional fake portraits (?art=fake).
import { CHARS } from '../../src/data/chars.js';
import { ITEMS } from '../../src/data/items.js';
import { DOCS } from '../../src/data/docs.js';
import { PAL } from '../../src/art/palette.js';
import { makeCanvas, ctxOf, rng, dither, rect, ellipse, hashStr } from '../../src/art/util.js';

// ---- sample documents (one per kind / hand) ------------------------------------------------------
export const SAMPLE_DOCS = {
  walt_log: { title: "Walt's Log", kind: 'handwritten', hand: 'walt', date: 'Oct. 20, 1962',
    body: "Bell rang at 9:40 tonight. School's been closed since Thursday for the teachers' thing. Nobody in the building but me.\n\nI went up to the office to see who was fooling with the board. Nobody there. The board was off.\n\nThe Kovalcik boy and Joey are not home. Joey is not home.\n\nI checked every room twice. In 104 all the chairs were pushed in neat except his.\n\n~~I am going to~~ I keep the log because a man has to write it somewhere or he will start to think he dreamed it. When the bell goes you get in a room and you sit down. You don't answer to your name. You don't answer to __nothing__.",
    footer: '—W.P.' },
  adair_note: { title: 'Note in a Mailbox', kind: 'note', hand: 'adair', date: 'Oct 18',
    body: 'Gerald —\n\nCancel the assembly. I am *begging* you. You know what Walt told us. You know what happened in \'62.\n\nIf you won\'t, give me the key to your office and I will do it myself.', footer: '—R.' },
  denise_diary: { title: "Denise's Diary Page", kind: 'note', hand: 'denise', date: 'Oct 19 1979',
    body: "If anything happens tell Mama I wasn't scared. I'm not scared of him.\n\nTell her to stop setting my plate.", footer: '—D.W.' },
  bell_schedule: DOCS.bell_schedule && { ...DOCS.bell_schedule, kind: 'print',
    body: 'HALLOWELL CONSOLIDATED SCHOOL\nBELL SCHEDULE — 1979–80\n\nHomeroom .......... 8:05 – 8:15\nPeriod 1 .......... 8:19 – 9:04\nPeriod 2 .......... 9:08 – 9:53\nPeriod 3 .......... 9:57 – 10:42\nPeriod 4 .......... 10:46 – 11:31\nLunch A ........... 11:35 – 12:05\nPeriod 5 .......... 12:09 – 12:54\nPeriod 6 .......... 12:58 – 1:43\nDismissal ......... 2:50\n\nStudents will be in their seats when the bell rings. No student may be in the halls without a pass.' },
  kinder_drawing: { title: 'Crayon Drawing', kind: 'handwritten', hand: 'kid', body: 'WHEN I GROW UP\n\nI want to stay at Hallowell forever and ever.\n\nRAYMOND O.' },
  chalk_102: { title: 'Chalkboard, Room 102', kind: 'chalk', body: 'DANIEL KOVACH — PRESENT\n\n{ no running in the halls }', date: 'Fri Oct 18' },
  plaque: { title: 'Dedication Plaque', kind: 'plaque',
    body: 'Hallowell Consolidated School\n\nErected upon the site of the Hallowell Breaker, 1894\nby the bequest of Col. Cyrus Hallowell\n\nDedicated Founder\'s Day, October 19, 1923\n\nNEMO RELINQUATUR' },
  clipping: { title: 'Nine Missing After Hallowell Gas Leak', kind: 'clipping', date: 'Saturday, October 20, 1979',
    body: 'KETTLE RUN — State and county officials searched into the night for nine students and a teacher missing after carbon monoxide from the underground mine fire forced the evacuation of Hallowell Consolidated School during a Founder\'s Day assembly Friday afternoon.\n\nPrincipal Gerald Haupt said power failed at about 1:50 p.m. "When the lights came back," he said, "the children were simply not in their seats."\n\nMine officials did not rule out that the missing had entered old workings beneath the building.' },
  signout: { title: 'Sign-Out Sheet', kind: 'form', hand: 'denise', date: 'OCT 19 1979',
    body: 'STUDENT: Denise Webb\nGRADE: 10\nREASON: dentist\nSIGNED (PARENT): I. Webb\nTIME OUT:\n\nAll students must sign out at the main office. A student who leaves without signing out is TRUANT.' },
  rollcall: { title: 'ROLLCALL.BAS', kind: 'screen',
    body: 'READY\n>LIST\n10 REM ROLLCALL -- HALLOWELL C.S.\n20 FOR I = 1 TO 9\n30 READ N$\n40 PRINT N$; " -- PRESENT"\n50 NEXT I\n60 GOTO 20\n70 DATA WEBB, HOYT, MRAZEK, DELVECCHIO\n80 DATA SZALAY, OAKES, GORSKI, BURDICK, YANCEY\nREADY' },
  yearbook: { title: 'Collier 1962 — In Memoriam', kind: 'book',
    body: 'IN MEMORIAM\n\nThe students and faculty of Hallowell Consolidated School remember those who were taken from us this year.\n\nJOSEPH PRUSZYNSKI, Grade 5. Joey loved model airplanes and his father\'s radio. He wanted to be a pilot.\n\nANNA KOVALCIK, Grade 3. Anna sang in the Christmas pageant and never missed a day.\n\nMICHAEL DUDA, Grade 7. Mike was a Safety Patrol and a Cub Scout.\n\nSTANLEY WOJCIK, Grade 8. Stan played trumpet in the Collier marching band.\n\n"Let no one be left behind."\n\nThe class of 1962 has planted four dogwood trees along the front walk. Please be careful of them.' },
  haupt_letter: { title: "Haupt's Letter", kind: 'handwritten', hand: 'haupt', date: 'November 2, 1979',
    body: 'To whoever opens this.\n\nI signed them in. God forgive me, I signed them in, every one, because he told me the school would never close and I believed that was a kindness.\n\nThe Register is under the stage.' },
  colonel_ledger: { title: 'Ledger Page, 1894', kind: 'handwritten', hand: 'colonel', date: 'Oct. 19th 1894',
    body: 'My boys. Seventeen upon the picking benches this morning, and I knew every name.\n\nNone shall be left behind.' },
  lutz_board: { title: 'BROOD II', kind: 'note', hand: 'lutz', body: 'Magicicada septendecim — 17 yrs underground!\n\n1962 — 1979 — 1996\n\nAsk Mr. Lutz about the jar.' },
  leah_zine: { title: 'STATIC #7 (draft)', kind: 'handwritten', hand: 'leah', body: 'STATIC #7: HOLLOW HELL\n\nEverybody in Kettle Run has a story about Hallowell. Here is mine: I am going in there tonight with my best friend and two idiots.' },
  tess_note: { title: 'Sketchbook margin', kind: 'note', hand: 'tess', body: "Founder's Day = Oct 19. The plaque says 1894. The breaker." },
};

// ---- fake maps: just enough for the sketchbook (id, name, floor, offset, rooms) --------------------
const R = (id, name, rect, kind = 'classroom') => ({ id, name, rect, kind });
export const FAKE_MAPS = {
  exterior: { id: 'exterior', name: 'Hallowell — Exterior', floor: 'EXT', offset: [55, 52], rooms: [R('ex_lot', 'Parking Lot', [2, 10, 46, 22], 'outside')] },
  lobby: { id: 'lobby', name: 'Lobby', floor: '1F', offset: [60, 22], rooms: [R('lb_lobby', 'Lobby', [3, 3, 24, 16], 'hall'), R('lb_vest', 'Vestibule', [9, 20, 12, 8], 'hall')] },
  west1: { id: 'west1', name: 'West Hall — First Floor', floor: '1F', offset: [-2, 22], rooms: [
    R('w1_hall', 'West Hall', [1, 12, 61, 5], 'hall'), R('w1_room101', 'Room 101', [3, 2, 12, 9]), R('w1_room102', 'Room 102', [16, 2, 12, 9]),
    R('w1_room103', 'Room 103', [29, 2, 12, 9]), R('w1_girls', 'Girls\' Restroom', [42, 2, 9, 9], 'restroom'), R('w1_stair', 'West Stair', [3, 18, 8, 9], 'stair'),
    R('w1_pa', 'PA Room', [24, 18, 5, 8], 'office'), R('w1_office', 'Main Office', [30, 18, 12, 8], 'office'), R('w1_nurse', 'Nurse', [43, 18, 6, 8], 'office'),
    R('w1_principal', "Principal's Office", [50, 18, 10, 8], 'office')] },
  library: { id: 'library', name: 'Library', floor: '1F', offset: [-30, 18], rooms: [R('lib_read', 'Reading Room', [2, 14, 24, 20], 'library'), R('lib_stacks', 'Stacks', [2, 2, 24, 11], 'library')] },
  east1: { id: 'east1', name: 'East Hall — First Floor', floor: '1F', offset: [90, 22], rooms: [
    R('e1_hall', 'East Hall', [0, 12, 61, 5], 'hall'), R('e1_boys', "Boys' Restroom", [3, 2, 8, 9], 'restroom'), R('e1_stair', 'East Stair', [12, 2, 8, 9], 'stair'),
    R('e1_cafe', 'Cafeteria', [3, 18, 26, 10], 'cafeteria'), R('e1_kitchen', 'Kitchen', [30, 18, 14, 10], 'kitchen')] },
  gym: { id: 'gym', name: 'Gymnasium', floor: '1F', offset: [152, 16], rooms: [R('gym_floor', 'Gym', [2, 2, 40, 24], 'gym'), R('gym_girls', 'Girls\' Locker Room', [2, 27, 14, 10]), R('gym_showers', 'Showers', [30, 27, 12, 10])] },
  aud: { id: 'aud', name: 'Auditorium', floor: '1F', offset: [53, -20], rooms: [R('aud_house', 'Auditorium', [4, 14, 36, 26], 'auditorium'), R('aud_stage', 'Stage', [8, 4, 28, 9], 'auditorium')] },
  basement: { id: 'basement', name: 'Basement', floor: 'B', offset: [92, 22], rooms: [
    R('b_corr', 'Maintenance Corridor', [2, 12, 56, 4], 'hall'), R('b_boiler', 'Boiler Room', [2, 2, 16, 9], 'basement'), R('b_coal', 'Coal Bin', [19, 2, 12, 9], 'basement'),
    R('b_janitor', "Janitor's Office", [32, 2, 8, 9], 'office'), R('b_storage', 'Storage', [2, 17, 14, 12], 'basement'), R('b_elec', 'Electrical', [17, 17, 8, 8], 'basement')] },
  east2: { id: 'east2', name: 'East Hall — Second Floor', floor: '2F', offset: [96, 22], rooms: [
    R('e2_hall', 'East Hall 2F', [0, 12, 55, 5], 'hall'), R('e2_205', 'Room 205', [3, 2, 12, 9]), R('e2_206', 'Room 206', [16, 2, 12, 9]), R('e2_207', 'Room 207', [29, 2, 12, 9]),
    R('e2_guid', 'Guidance', [3, 18, 10, 8], 'office')] },
  longhall: { id: 'longhall', name: 'The Long Hall', floor: '2F', offset: [56, 30], rooms: [R('lh_hall', 'Long Hall', [0, 4, 40, 6], 'hall')] },
  west2: { id: 'west2', name: 'West Hall — Second Floor', floor: '2F', offset: [-2, 22], rooms: [
    R('w2_hall', 'West Hall 2F', [1, 12, 57, 5], 'hall'), R('w2_201', 'Room 201', [3, 2, 12, 9]), R('w2_202', 'Room 202', [16, 2, 12, 9]), R('w2_203', 'Room 203', [29, 2, 10, 9]),
    R('w2_girls', 'Girls\' Restroom 2F', [47, 2, 9, 9], 'restroom')] },
};

export function fakeState() {
  const visited = {};
  for (const id of ['lb_lobby', 'lb_vest', 'w1_hall', 'w1_room101', 'w1_room102', 'w1_room103', 'w1_girls', 'w1_office', 'w1_pa', 'w1_principal', 'w1_nurse', 'w1_stair',
    'e1_hall', 'e1_cafe', 'e1_kitchen', 'e1_stair', 'b_corr', 'b_boiler', 'b_coal', 'b_janitor', 'e2_hall', 'e2_205', 'e2_206', 'lh_hall', 'lib_read']) visited[id] = true;
  return {
    version: 1, chapter: 5, map: 'west1', px: 300, py: 230, dir: 'down',
    flags: { compact_unlocked: true, colonel_named: false, bond_leah: false },
    inv: { flashlight: 1, sketchbook: 1, compact: 1, transfer_form: 1, mixtape: 1, gum: 1, house_key: 1, danny_flashlight: 1, bolt_cutters: 1, camcorder: 1, keyring: 1, hall_pass: 1, battery: 2, diary_page: 1, charter: 1 },
    docs: { walt_log: true, bell_schedule: true, plaque: true, clipping: true, adair_note: true, signout: true, chalk_102: true },
    objective: "Find the principal's stamps. Haupt's office — behind the portrait?",
    party: ['marcus'], battery: 64, flashlightOn: true, rollAnswered: 1,
    bonds: { danny: true, leah: false, marcus: false }, visited, mapState: {}, playtime: 2735,
  };
}

// ---- fake portraits (bust silhouettes) for composition checks --------------------------------------
const LOOK = {
  tess: { hair: PAL.hair_r, hairD: PAL.hair_r_d, skin: PAL.skin, top: PAL.denim, topD: PAL.denim_d },
  danny: { hair: '#7a2a20', hairD: '#4e1a0e', skin: PAL.skin, top: '#1f5a46', topD: '#123a2c', cap: '#9a2229' },
  leah: { hair: PAL.hair_k, hairD: '#000', skin: PAL.skin_l, top: '#7a7880', topD: '#55545c', glasses: true },
  marcus: { hair: PAL.hair_k, hairD: '#000', skin: PAL.dskin, top: '#4c5a34', topD: '#323c22', beanie: '#1a1a1e' },
  colonel: { hair: PAL.hair_g, hairD: PAL.hair_g_l, skin: PAL.flesh, top: PAL.navy, topD: PAL.navy_d, big: true },
  adair: { hair: PAL.hair_b, hairD: PAL.hair_b_l, skin: PAL.skin, top: '#6a4a5a', topD: '#4a3040', glasses: true },
  denise: { hair: PAL.hair_k, hairD: '#000', skin: PAL.dskin_l, top: '#2f5a32', topD: '#1e3d21' },
};
const fakeCache = new Map();
export function fakePortrait(char, expr = 'neutral', o = {}) {
  const key = `${char}|${expr}|${o.light}|${o.enrolled}`;
  if (fakeCache.has(key)) return fakeCache.get(key);
  const L = LOOK[char] || LOOK.tess;
  const c = makeCanvas(96, 120); const x = ctxOf(c);
  const r = rng(hashStr(key));
  if (L.big) { ellipse(x, 48, 120, 52, 50, L.topD); ellipse(x, 48, 116, 48, 46, L.top); rect(x, 24, 88, 48, 8, PAL.crimson); }
  else { ellipse(x, 48, 118, 40, 30, L.topD); ellipse(x, 48, 116, 36, 26, L.top); }
  rect(x, 42, 70, 12, 14, L.skin);
  const hr = L.big ? 30 : 22;
  ellipse(x, 48, 50, hr + 3, hr + 6, L.hairD);
  ellipse(x, 48, 54, hr - 4, hr, L.skin);
  if (!L.big) { ellipse(x, 48, 38, hr, 12, L.hair); rect(x, 26, 38, 6, 26, L.hair); rect(x, 64, 38, 6, 26, L.hair); }
  if (L.cap) { rect(x, 28, 28, 40, 10, L.cap); }
  if (L.beanie) { ellipse(x, 48, 34, 22, 10, L.beanie); }
  const ey = L.big ? 52 : 54;
  const shut = expr === 'eyes_shut';
  rect(x, 39, ey, 5, shut ? 1 : 3, '#1a1414'); rect(x, 52, ey, 5, shut ? 1 : 3, '#1a1414');
  if (L.glasses) { x.strokeStyle = '#c8c0a8'; x.lineWidth = 1; x.strokeRect(36.5, ey - 2.5, 10, 7); x.strokeRect(49.5, ey - 2.5, 10, 7); }
  const mouth = { smirk: [44, 66, 8, 1], scared: [45, 65, 6, 4], talk: [44, 65, 8, 3], grin: [42, 65, 12, 2], serene: [45, 66, 6, 1] }[expr] || [45, 66, 6, 1];
  rect(x, mouth[0], mouth[1], mouth[2], mouth[3], '#5a2a24');
  if (o.light === 'dark') dither(x, 48, 0, 48, 120, null, '#05060a', 0.6);
  if (o.light === 'red') dither(x, 0, 0, 96, 120, null, '#5a0a08', 0.3);
  if (o.enrolled) dither(x, 0, 0, 96, 120, null, PAL.amber_l, 0.2);
  void r;
  fakeCache.set(key, c);
  return c;
}

// ---- fake world backdrop: a dark 1F hallway with lockers, a flashlight cone -----------------------
export function fakeWorld(variant = 'hall') {
  const c = makeCanvas(480, 270); const x = ctxOf(c);
  const r = rng(42);
  rect(x, 0, 0, 480, 270, '#0b0c12');
  // walls
  rect(x, 0, 40, 480, 60, PAL.cream_d); rect(x, 0, 100, 480, 50, PAL.green_d); rect(x, 0, 98, 480, 3, PAL.wood_d);
  for (let i = 0; i < 18; i++) { rect(x, 30 + i * 22, 70, 18, 78, PAL.green); rect(x, 30 + i * 22, 70, 18, 2, PAL.green_l); rect(x, 34 + i * 22, 80, 10, 1, PAL.green_dd); rect(x, 34 + i * 22, 84, 10, 1, PAL.green_dd); }
  rect(x, 180, 46, 40, 22, '#1a1d1a'); rect(x, 182, 48, 36, 18, '#2a3d30');
  // floor checker
  for (let ty = 150; ty < 270; ty += 16) for (let tx = 0; tx < 480; tx += 16) rect(x, tx, ty, 16, 16, ((tx + ty) / 16) % 2 ? '#3d3a2c' : '#2f3a2c');
  // darkness + flashlight cone
  dither(x, 0, 0, 480, 270, null, '#05060a', 0.75);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(255,236,200,${0.035})`; x.beginPath(); x.moveTo(240, 200); x.arc(240, 200, 150 - i * 18, -Math.PI * 0.85, -Math.PI * 0.2); x.closePath(); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  // Tess (tiny placeholder sprite) + a desk prop
  rect(x, 234, 176, 12, 24, PAL.denim); rect(x, 235, 168, 10, 9, PAL.hair_r); rect(x, 236, 200, 4, 4, '#111'); rect(x, 240, 200, 4, 4, '#111');
  rect(x, 290, 182, 28, 12, PAL.maple); rect(x, 292, 194, 2, 8, '#555'); rect(x, 314, 194, 2, 8, '#555');
  void r; void variant;
  return c;
}

export const FAKE = { CHARS, ITEMS, DOCS };
