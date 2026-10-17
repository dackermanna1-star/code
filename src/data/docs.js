// DOCUMENTS — every in-world readable text that is not dialogue. Format: docs/TECH.md §16.
// Content contracts: docs/DESIGN.md §11 (canon §2). Limits: ≤ 120 words each; haupt_letter, adair_note,
// charter_full ≤ 200. walt_log is the one forced exception: its §11 contract alone runs ~135 words with
// dates, so it carries nothing beyond the contract lines but a few words of R1/R4 teaching (keep ≤ 180).
//
// Reader markup: '\n\n' paragraph, '\n' line break, ~~strike~~, __underline__, *emphasis*.
// Never use a bare '*' or '__' as punctuation (they toggle styles). Footers are drawn on one line: keep short.
// `form` docs: a line 'LABEL: value' (label in capitals) renders a typed label and a handwritten field;
// an empty value leaves the field blank. Square brackets mark what is physically on the page but not part
// of the text proper ("[in pencil, in the margin: ...]").

const p = (...paras) => paras.join('\n\n');
const l = (...lines) => lines.join('\n');

export const DOCS = {
  // ---- Ch1: lobby & west hall ---------------------------------------------------------------------------
  bell_schedule: {
    title: 'Bell Schedule, 1979–80', kind: 'print', date: 'Sept. 1979',
    body: p(
      l('HALLOWELL CONSOLIDATED SCHOOL', 'BELL SCHEDULE 1979–80'),
      l(
        'Homeroom ...... 8:05 – 8:15',
        'Period 1 ...... 8:19 – 9:04',
        'Period 2 ...... 9:08 – 9:53',
        'Period 3 ...... 9:57 – 10:42',
        'Period 4 ...... 10:46 – 11:31',
        'Period 5 ...... 11:35 – 12:20 (lunch A/B)',
        'Period 6 ...... 12:24 – 1:09',
        'Period 7 ...... 1:13 – 1:58',
        'Period 8 ...... 2:02 – 2:47',
        'Dismissal ..... 2:50',
      ),
      'Four minutes passing. No student may be in the halls when the bell rings.',
      l(
        'FRIDAY, OCTOBER 19 — FOUNDER\'S DAY',
        'Early dismissal schedule. No classes after 1:30. All grades K–12 report to the auditorium.',
        'ASSEMBLY 1:45. Attendance will be taken.',
      ),
    ),
    footer: '— Office of the Principal',
  },

  plaque: {
    title: 'Lobby Plaque', kind: 'plaque',
    body: p(
      'Hallowell Consolidated School',
      'Erected upon the site of the Hallowell Breaker',
      l('Founder\'s Day, October 19', 'first kept in 1894 by Col. Cyrus Hallowell', 'in memory of the Hallowell Breaker and his boys'),
      'Dedicated October 19, 1923',
      'Nemo relinquatur',
    ),
  },

  memorial: {
    title: 'Memorial Board', kind: 'plaque',
    body: p(
      l('In loving memory', 'Founder\'s Day, October 19, 1979'),
      l(
        'Anthony Burdick, 13',
        'Thomas Delvecchio, 16',
        'Lisa Gorski, 16',
        'Kevin Hoyt, 12',
        'Carol Ann Mrazek, 17',
        'Raymond Oakes, 9',
        'Patricia Szalay, 14',
        'Denise Webb, 15',
        'Michelle Yancey, 11',
      ),
      'and Miss Ruth Adair, music, 34',
      l('"None shall leave thy rest."', 'Hallowell P.T.A., 1980'),
    ),
  },

  kinder_drawings: {
    title: 'Kindergarten Drawings', kind: 'handwritten', hand: 'kid', date: 'Oct. 1979',
    body: p(
      'I LIKE THE SLIDE — JASON',
      'MY TECHER MRS BENNER AND THE FISH — amy',
      'I LIKE NAP AND MILK AND KIKBALL — Melissa K.',
      'THIS IS THE BIG MAN IN THE PICHER. HE HAS METALS. HE NOS MY NAME — Chris',
      'I WANT TO ~~GO HOM~~ STAY AT HALOWELL FOREVR — Jenny',
    ),
  },

  // ---- Ch2–3: Room 104, basement ------------------------------------------------------------------------
  room104_board: {
    title: 'Room 104 Chalkboard', kind: 'chalk',
    body: p(
      'MR. H SAYS HI',
      '[under it, faint, half erased]',
      l('Fri. Oct. 19', 'FOUNDER\'S DAY — no homework!', 'Happy Homecoming, 7th grade'),
    ),
  },

  walt_log: {
    title: 'Custodian\'s Log', kind: 'handwritten', hand: 'walt', date: '1958 – 1979',
    body: p(
      // date inline with each entry so a date never strands at the foot of a page
      'Sept. 1958 — Six weeks on the job. The boiler runs and I never fed it.',
      l('Oct. 19, 1962 — Bell went at 2:10. Nobody rang it.', 'Joey ran. He was always running.'),
      'Nov. 1962 — Mr. H. He can\'t touch a kid sitting still in a room. I seen him stand over one an hour. When the bell goes, get in a room and SIT.',
      '1963 — It calls roll. Answer him once he pencils you in. Twice, that\'s ink. DON\'T ANSWER.',
      '1965 — Coal chute. Kids aren\'t supposed to use it, so there\'s no rule about it. Got the Mrazek boy out that way in \'62. Locked it after.',
      '1978 — Hall passes. Don\'t go past the arch upstairs without one. The Hoyt kid\'s got a book of slips.',
      'Sept. 1979 — Told Miss Adair. She\'s been in the library every night since. Told the Webb girl to sit down when the bell goes.',
      l('Oct. 21, 1979 — I went in Saturday. They\'re in the seats. All nine. Like the shells on the oak.', 'Miss Adair isn\'t with them.'),
    ),
    footer: 'W. Pruszynski',
  },

  // ---- Ch4: main office suite ---------------------------------------------------------------------------
  signout: {
    title: 'Student Sign-Out Sheet', kind: 'form', date: 'FRI. OCT. 19, 1979',
    body: p(
      l('STUDENT: Brian Kuhar (gr. 3) — fever', 'SIGNED: Mrs. D. Kuhar', 'TIME IN: 9:10', 'TIME OUT: 9:16'),
      l('STUDENT: Lori Pacholski (gr. 8) — orthodontist', 'SIGNED: J. Pacholski', 'TIME IN: 10:40', 'TIME OUT: 10:43'),
      l('STUDENT: Mark Shoener (gr. 11) — doctor', 'SIGNED: R. Shoener', 'TIME IN: 12:05', 'TIME OUT: 12:09'),
      l('STUDENT: Denise Webb (gr. 10) — dentist', 'SIGNED: I. Webb', 'TIME IN: 1:20', 'TIME OUT:'),
    ),
  },

  adair_mailbox: {
    title: 'Note in Adair\'s Mailbox', kind: 'note', hand: 'adair', date: 'Fri. a.m.',
    body: p(
      l('Gerald,', 'Cancel the assembly. I am begging you.', '—R.'),
      '[in fountain pen] Out of the question. —G.H.',
    ),
  },

  clipping: {
    title: 'Nine Students, Teacher Missing After Hallowell Assembly', kind: 'clipping', date: 'Saturday, October 20, 1979',
    body: p(
      'KETTLE RUN — State police and Bureau of Mines officials searched Hallowell Consolidated School through the night after nine students and a teacher were reported missing following Friday\'s Founder\'s Day assembly.',
      'Power to the building failed at about 1:50 p.m. while the school band played. Officials said gas from the mine fire beneath the borough may have entered the auditorium.',
      'Witnesses say several students rose in the dark to help younger children toward the exits.',
      'Principal Gerald Haupt said attendance had been taken at the start of the assembly, "as it is every Founder\'s Day."',
      'Missing is music teacher Ruth Adair, 34. The students\' names were withheld pending notification of their families.',
    ),
  },

  discipline: {
    title: 'Disciplinary Referrals', kind: 'form',
    body: p(
      l('DATE: 9/27/79 — east hall', 'STUDENT: Delvecchio, Thomas', 'INFRACTION: Running in the halls (Rule 3)', 'REPORTED BY: K. Hoyt, Safety Patrol'),
      l('DATE: 10/4/79 — west hall', 'STUDENT: Oakes, Raymond', 'INFRACTION: In the hall without a pass (Rule 4)', 'REPORTED BY: K. Hoyt, Safety Patrol'),
      l('DATE: 10/19/79 — auditorium, 1:52', 'STUDENT: Webb, Denise', 'INFRACTION: Out of seat to help a younger student', 'REPORTED BY: K. Hoyt, Safety Patrol'),
      l('DATE: 10/18/96 — west hall', 'STUDENT: Kovach, Daniel', 'INFRACTION: Running in the halls (Rule 3)', 'REPORTED BY: K. Hoyt, Safety Patrol'),
    ),
  },

  denise_file: {
    title: 'Guidance Record — D. Webb', kind: 'form', date: 'KRASD GUIDANCE',
    body: p(
      l('STUDENT: Webb, Denise Ann', 'GRADE: 10 — homeroom 202', 'BORN: 4/2/64', 'PARENT/GUARDIAN: Mrs. Ivy Webb'),
      l('ACTIVITIES: Marching band — clarinet', 'GRADES (9TH): Eng B+, Alg C, Biol A, Band A', 'CITIZENSHIP: Excellent', 'ATTENDANCE: Perfect, 1978–79'),
      'Counselor, 10/9/79 — Quiet, steady, well liked. Walks the fourth graders to their buses without being asked; says "somebody has to." Wants to be a nurse. Push the geometry. — M. Dombrowski',
    ),
  },

  // ---- Ch5: second floor --------------------------------------------------------------------------------
  brood: {
    title: 'Brood II — Mr. Lutz\'s Board', kind: 'handwritten', hand: 'lutz', date: 'Rm. 206',
    body: p(
      l('PERIODICAL CICADAS', 'Magicicada septendecim — the "17-year locust." (Not a locust.)'),
      'The nymphs live underground for seventeen years, drinking sap from tree roots. Then, one May, they all come up at once, climb the nearest trunk, split their skins and fly. They sing for about four weeks, lay eggs, and die.',
      'The exuviae — the shells they leave behind — stay hooked to the bark for months. Yes, they are harmless. No, you may not bring them to lunch.',
      l('BROOD II — Kettle Run emergences', '1928', '1945', '1962', '1979 (this past May)', '1996 (next)'),
      'every one a Founder\'s Day year? —L.',
    ),
  },

  lab_memo: {
    title: 'Computer Literacy Memo', kind: 'typed', date: 'September 5, 1978',
    body: p(
      l('KETTLE RUN AREA SCHOOL DISTRICT', 'TO: Faculty, Hallowell Consolidated', 'FROM: R. Kessler, Instructional Media', 'RE: COMPUTER LITERACY — Room 207'),
      'Six Radio Shack TRS-80 microcomputers have been installed in Room 207. Computer literacy will be offered to grades 7–12 beginning this month.',
      'The district has also written an attendance program, ROLLCALL, for homeroom use. Type RUN, then a pupil\'s surname. Records have been keyed in from the office card file back to 1923. An entry stays PROVISIONAL until confirmed at a second roll; confirmed entries become PERMANENT RECORD and cannot be edited.',
      'Machines are to be on during scheduled periods only. No games.',
    ),
    footer: 'cc: G. Haupt, Principal',
  },

  heritage: {
    title: 'Our Proud Heritage', kind: 'print', date: '8th Gr. Pa. History',
    body: p(
      'COL. CYRUS HALLOWELL (1841–1911) planned the daring 1864 mine under the Confederate lines at Petersburg, dug by Schuylkill County miners. [in pencil, in the margin: Pleasants?]',
      'Home a hero, he founded Hallowell Coal & Iron Co. in 1866 and built the Kettle Run colliery and the great Hallowell Breaker. He called his breaker boys "my boys" and knew every name.',
      'PHOTO: Breaker boys at the Hallowell Breaker, about 1890. Boys as young as eight picked slate by hand. Hard work built Kettle Run!',
      'FOUNDER\'S DAY has been kept every October 19 since 1894, in memory of the Breaker and its boys. The Colonel passed away on Founder\'s Day, 1911, and left his fortune to build our school.',
    ),
    footer: 'GO COLLIERS!',
  },

  charter_excerpt: {
    title: 'The Founder\'s Charter (excerpt)', kind: 'print', date: '1911',
    body: p(
      'FROM THE FOUNDER\'S CHARTER OF COL. CYRUS HALLOWELL',
      '"...to raise a school upon the ground of my old Breaker, that the children of Kettle Run shall never want for a place, and none shall be left behind.',
      '"...I shall be the first scholar of Hallowell School, and subject to its rules as any child..."',
      '[brass placard] Complete instrument on display — Kettle Run Historical Collection, School Library.',
    ),
  },

  charter_full: {
    title: 'The Founder\'s Charter', kind: 'handwritten', hand: 'colonel', date: 'Oct. 19, 1911',
    body: p(
      'I, Cyrus Hallowell, of Kettle Run in the County of Schuylkill, being of sound mind, make this my Charter and last Will.',
      'I give the whole of my estate, to be called the Hallowell endowment, to raise a school upon the ground of my old Breaker, that the children of Kettle Run shall never want for a place, and none shall be left behind.',
      'I direct that I be laid in a vault beneath its hall of Assembly, that I may attend.',
      'I shall be the first scholar of Hallowell School, and subject to its rules as any child; and I shall be the last to leave it.',
      'The Hallowell endowment shall sustain the school so long as the Principal, on each Founder\'s Day, holds Assembly and presents the roll to the Founder. Failing that, it lapses, and the school with it.',
      'Founder\'s Day shall be kept on the nineteenth of October, as I have kept it since 1894.',
      'Witness my hand this nineteenth day of October, 1911.',
    ),
    footer: 'C. Hallowell',
  },

  yearbook_1945: {
    title: 'The Collier, 1945–46', kind: 'book',
    body: p(
      'IN MEMORIAM',
      'This fall, five of our own did not come home.',
      'Stanley Hrinko, 15, who left on Founder\'s Day to find work in Philadelphia. Write to us, Stan.',
      'Margaret "Peggy" Dunleavy, 9, and Rose Marie Cuccia, 11, lost at the Number Six stripping. They were always together.',
      'Edward Kosko, 12, and Evan Reese, 13, who ran off the same afternoon. Come home, boys. Your seats are waiting.',
      'We remember, too, our graduates who gave their lives in the war, and we give thanks for every one who has come home.',
    ),
  },

  yearbook_1962: {
    title: 'The Collier, 1962–63', kind: 'book',
    body: p(
      'WE MISS YOU',
      'Joseph "Joey" Pruszynski, 10. Fastest boy in the fourth grade, son of our own Mr. Walt. Joey, we still save you a place in line.',
      'Gregory Yurkonis, 12, Linda Fenstermacher, 14, and Paul Dougherty, 16, not heard from since Founder\'s Day. The State Police tell us runaways often write home by Christmas. We are still watching the mailbox.',
      'It was a hard year in Kettle Run. Even the ground caught fire. We held on to each other.',
    ),
  },

  yearbook_1979: {
    title: 'The Collier, 1979–80', kind: 'book',
    body: p(
      'WE MISS YOU',
      l(
        // each entry ≤ 35 chars so it stays on one line of the book page
        'Carol Ann Mrazek, 17 — Homecoming',
        'Tommy Delvecchio, 16 — #22, always',
        'Lisa Gorski, 16 — loudest cheer',
        'Denise Webb, 15 — first clarinet',
        'Patty Szalay, 14 — this was hers',
        'Anthony Burdick, 13 — checkmate',
        'Kevin Hoyt, 12 — Patrol Captain',
        'Michelle Yancey, 11 — Safety Patrol',
        'Raymond Oakes, 9 — fourth grade',
      ),
      'and Miss Ruth Adair, who taught us the alma mater.',
      'Founder\'s Day, October 19, 1979. This is the last Collier; Hallowell closes its doors in June. We will not forget you.',
    ),
  },

  // ---- Ch6: Haupt's safe ----------------------------------------------------------------------------------
  haupt_letter: {
    title: 'Haupt\'s Letter', kind: 'handwritten', hand: 'haupt', date: 'June 13, 1980',
    body: p(
      'To whoever opens this safe:',
      'I was principal of Hallowell Consolidated School from 1959 until today. I wish it understood that I kept this school open. Under the Founder\'s Charter, the endowment sustains the school only so long as the Principal, on each Founder\'s Day, holds Assembly and presents the roll to the Founder. Without it, Kettle Run has no school. I presented the roll every year. I told myself it was a formality.',
      'At 1:20 on October 19th, Mrs. Ivy Webb came to sign Denise out for the dentist. I told her Denise was already in the assembly. Denise was sitting in my outer office. I could see her shoes.',
      'Ruth Adair took the stamps from this safe. I took them back from her in the wings while the band played the alma mater. Ruth said the Charter was the key to him. She went to the library first, for it. Edna kept it under glass.',
      'Then the lights went.',
      'The stamps are here. No one ever revoked my authority to withdraw a pupil. Use it.',
    ),
    footer: 'Gerald Haupt',
  },

  // ---- Ch7: auditorium ----------------------------------------------------------------------------------
  alma_mater: {
    title: 'Hallowell Alma Mater', kind: 'print', date: 'arr. R. Adair',
    body: p(
      l('HALLOWELL ALMA MATER', 'for band and voices — arr. R. Adair', 'Andante maestoso'),
      l(
        'Hallowell, our Hallowell, upon the valley\'s breast,',
        'where all thy children gather in, and none shall leave thy rest.',
        'Hallowell, our Hallowell, we answer to thy call —',
        'present, present, every one, and none shall leave at all.',
      ),
      '[pencil, top margin] Founder\'s Day: band only. No voices this year. —R.A.',
    ),
  },

  denise_diary: {
    title: 'Denise\'s Diary Page', kind: 'handwritten', hand: 'denise', date: 'Thurs. Oct. 18',
    body: p(
      'Band till six again. Miss Adair made us run the alma mater nine times. Lisa swears Tommy D. is asking Carol Ann to the dance. Mama kept my plate in the oven like always. Dentist tomorrow, so Mama\'s getting me at 1:20 and I miss the assembly. Good.',
      'Walt the janitor stopped me by the lockers again. He said when the bell goes sit down and don\'t get up for nothing. He looked like he was going to cry. I said okay.',
      'If anything happens tell Mama I wasn\'t scared. I\'m not scared of him. Tell her to stop setting my plate.',
    ),
  },

  // ---- Ch8: vault & breaker -------------------------------------------------------------------------------
  adair_note: {
    title: 'Adair\'s Last Note', kind: 'handwritten', hand: 'adair', date: 'Oct. 19, 1979',
    body: p(
      'Whoever comes after me —',
      'The book isn\'t here. It\'s further down. I can hear the breaker. My light\'s gone; I am writing by feel.',
      'Gerald has the stamps. A withdrawal needs a forwarding address — something of theirs the school didn\'t take, proof they belong somewhere else. Lay it on the line and stamp it.',
      'He wrote that he\'d be the last to leave. So he can\'t be made to go while a child is still on the roll. Get them out first. Then he\'s the last.',
      'He enrolled himself. He\'s on the roll like anyone — so he can be expelled like anyone. The Charter is the proof. I never got it out of the case.',
      'Don\'t answer him.',
      'My hand is getting stiff.',
    ),
    footer: '— R. Adair',
  },

  inquiry_1894: {
    title: 'Coroner\'s Inquest, 1894', kind: 'typed', date: 'November 1, 1894',
    body: p(
      l('COMMONWEALTH OF PENNSYLVANIA, COUNTY OF SCHUYLKILL', 'Inquest touching the deaths of seventeen boys, Hallowell Breaker, Kettle Run.', 'Testimony of Joseph Wasko, aged eleven, slate picker.'),
      l(
        'Q. Where were you when the fire began?',
        'A. Out at the privy, sir.',
        'Q. You were permitted to leave the bench?',
        'A. You showed your brass check to go to the privy. I had mine.',
        'Q. Why did the others not come out?',
        'A. The door was barred, sir. Mr. H\'s order: none leaves the benches before the whistle.',
        'Q. Was the whistle blown?',
        'A. After, sir.',
      ),
      'VERDICT: That the said boys came to their deaths by fire, through carelessness with a lamp. No blame attaches to the Company.',
    ),
  },

  ledger_colonel: {
    title: 'The Colonel\'s Ledger', kind: 'handwritten', hand: 'colonel', date: 'Oct. 19th, 1894',
    body: p(
      'Payroll called at six. One hundred and four boys, every one present. I know them all by name.',
      'Fire in the picking room at ten minutes past two. I watched from the office. My boys kept to their benches, as they had been taught.',
      'Seventeen. I shall not strike them from the book. A boy who has answered is mine.',
      'The locusts were up again this year, as they were in \'77, the summer they hanged the Mollies at Pottsville. Seventeen years in the dark and they come up singing. A man might learn from them.',
      'The day to be kept.',
    ),
  },

  // ---- Tess's bag ---------------------------------------------------------------------------------------
  mixtape_jcard: {
    title: 'FOR THE DRIVE', kind: 'note', hand: 'leah', date: '8/96',
    // one side per card page: A, then B
    body: p(
      l(
        'FOR THE DRIVE — side A',
        'Mazzy Star — Fade Into You',
        'Fiona Apple — Shadowboxer',
        'The Cranberries — Linger',
        'Weezer — Say It Ain\'t So',
        'Garbage — Stupid Girl',
        'Björk — Hyperballad',
      ),
      l(
        'side B',
        'Liz Phair — Never Said',
        'Pavement — Gold Soundz',
        'Belly — Feed the Tree',
        'Tori Amos — Winter',
        'Smashing Pumpkins — 1979',
        '(sorry. had to.)',
      ),
    ),
  },

  tess_draft: {
    title: 'How to Tell Leah (draft 6)', kind: 'handwritten', hand: 'tess',
    body: p(
      'HOW TO TELL LEAH (draft 6)',
      l(
        '1. ~~casually~~',
        '2. ~~after Halloween~~',
        '3. ~~in a letter~~',
        '4. ~~make Danny do it~~',
        '5. ~~"so, funny thing about Philly"~~',
        '6. ~~don\'t~~',
        '7. Monday. Homeroom. She\'ll see it on the attendance sheet. She\'s smart.',
      ),
    ),
  },
};

// The dev test map/scene (src/data/maps/test.js, src/data/scripts/test.js) still opens 'sample_note'.
// Kept as a non-enumerable alias so it resolves without showing up when DOCS is iterated.
Object.defineProperty(DOCS, 'sample_note', { value: DOCS.walt_log, enumerable: false });
