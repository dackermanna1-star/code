/* What Derry Keeps — notebook content and speaker table.
 * People descriptions read Ink variables through V(name) so they change as
 * relationships do; clue/tape/theory ids match the Ink LISTs and @commands. */
(function () {
  'use strict';
  const D = window.DATA = {};
  D.nextTitle = 'The Hollow';

  /* speaker key -> display name, sprite id, nameplate color, voice notes for free-text replies */
  D.chars = {
    GUS: { name: 'Gus', sprite: 'gus', color: '#8a9a5b', voice: 'Augusta Brennan, 14, the player character' },
    MOM: { name: 'Mom', sprite: 'mom', color: '#7d97c4', voice: 'Claire, 44, ER nurse, newly divorced; sardonic, loving, exhausted, deflects with jokes' },
    MEMERE: { name: 'Mémère', sprite: 'memere', color: '#a98bb0', voice: 'Yvette, 72, Franco-American grandmother with dementia; cutting and funny when lucid, eerie when not; drops French words like ma belle, mon Dieu' },
    DAD: { name: 'Dad', color: '#9aa7b8', voice: 'Danny, 47, sound engineer in Boston; warm, guilty, distracted' },
    HANNAH: { name: 'Hannah', sprite: 'hannah', color: '#d98aa6', voice: 'Hannah Gagnon, 8, the solemn uncanny neighbor girl; literal, blunt, knows things' },
    MRSGAGNON: { name: 'Mrs. Gagnon', color: '#a0907a' },
    TEDDY: { name: 'Teddy', sprite: 'teddy', color: '#5fb7b0', voice: 'Theodora Okafor, 14, from Houston; loud, funny, nerdy (Star Trek, astronomy, ham radio), talks fast, lonely, a little jealous' },
    CAL: { name: 'Cal', sprite: 'cal', color: '#8e7aa6', voice: 'Calvin Ashgrove, 14, old Derry money; formal, morbid, precise, dry, socially reckless, obsessed with town history' },
    SLOANE: { name: 'Sloane', sprite: 'sloane', color: '#e3c27a', voice: 'Sloane Ashgrove, 14, queen bee; clipped, cutting, controlled, secretly scared, respects bluntness' },
    WES: { name: 'Wes', sprite: 'wes', color: '#c4473c', voice: 'Wesley Pike, 15, foster kid; terse, deadpan, wary, unexpectedly gentle' },
    BRETT: { name: 'Brett', sprite: 'brett', color: '#b0423a', voice: 'Brett Lindqvist, 17, quarterback; charming to adults, cruel to the weak, smiling menace' },
    DOUGIE: { name: 'Dougie', color: '#8a7a6a' },
    WHITCOMB: { name: 'Ms. Whitcomb', sprite: 'whitcomb', color: '#d9a441', voice: 'Paige Whitcomb, 23, first-year English teacher; bubbly, earnest, anxious underneath' },
    PAULSEN: { name: 'Mr. Paulsen', color: '#8a96a8', voice: 'history teacher, bored, near retirement' },
    FENWICK: { name: 'Principal Fenwick', sprite: 'fenwick', color: '#a0523a', voice: 'Dale Fenwick, 55, jovial company man, folksy, dismissive' },
    TEAGUE: { name: 'Mr. Teague', sprite: 'teague', color: '#6f86a8', voice: 'night janitor, 68, gruff old Mainer, says ayuh, haunted' },
    NATE: { name: 'Nate', sprite: 'nate', color: '#8a9a5b', voice: 'Nate Fortier, 23, record store clerk and musician; kind, scruffy, easygoing' },
    DOT: { name: 'Dot', sprite: 'dot', color: '#e08aa0', voice: 'Dot Carrier, 64, diner owner; warm, gossipy, calls everyone hon or deah' },
    CONSTANCE: { name: 'Mrs. Ashgrove', sprite: 'constance', color: '#c9a86a', voice: 'Constance Ashgrove, 48, Lantern Society president; gracious, poised, quietly menacing' },
    LIBRARIAN: { name: 'Mrs. Fennimore', sprite: 'librarian', color: '#5f9a9a', voice: 'librarian, 60, helpful, a little too interested' },
    OFFICER: { name: 'Officer Lindqvist', color: '#5a6a8a' },
    JUNE: { name: 'June', sprite: 'june', color: '#d9b040' },
    KID: { name: 'Kid', color: '#aaa' },
    KIDS: { name: 'Kids', color: '#aaa' },
    KIMBERLY: { name: 'Kimberly', color: '#d9a0b0' },
    VOICE: { name: '???', color: '#a6e08e' },
    GIRL: { name: 'Unknown voice', color: '#4fa3a3' },
    RADIO: { name: 'Radio', color: '#a6e08e' }
  };

  /* map hub locations (percent of stage) */
  D.places = {
    diner: { name: "Dot's Diner", xy: [55, 47] },
    records: { name: 'Low Tide Records', xy: [61, 40] },
    library: { name: 'Public Library', xy: [44, 34] },
    barrens: { name: 'The Barrens', xy: [24, 66] },
    standpipe: { name: 'The Standpipe', xy: [79, 24] },
    park: { name: 'Bassey Park', xy: [38, 58] },
    home: { name: 'Larch Street', xy: [72, 70] },
    school: { name: 'Derry High', xy: [28, 30] },
    teddy: { name: "Teddy's", xy: [86, 56] },
    kitchen: { name: 'Larch Street' }, larch_ext: { name: 'Larch Street' }, living: { name: 'Larch Street' }, gus_room: { name: 'Larch Street' },
    road: { name: 'The road into Derry' }, school_hall: { name: 'Derry High' }, classroom: { name: 'Derry High' }, cafeteria: { name: 'Derry High' }, school_ext: { name: 'Derry High' },
    downtown: { name: 'Downtown Derry' }, canal: { name: 'The canal' }, boiler: { name: 'Derry High, basement' }
  };

  const lvl = (v, a, b) => (v >= b ? 2 : v >= a ? 1 : v <= -2 ? -1 : 0);

  D.people = {
    mom: { name: 'Mom', role: 'Claire Thibodeau · ER nurse, 44', sprite: 'mom',
      describe: (V) => ['She\'s trying so hard it hurts to watch. You haven\'t let her in much.', 'Tired, funny, holding the whole move together with Nicorette and willpower.', 'She talks to you like a person now. Most nights she waits up.', 'You\'re the one she\'s holding onto. She knows you know.'][lvl(V('mom'), 2, 4) + 1] },
    memere: { name: 'Mémère', role: 'Yvette Thibodeau · your grandmother, 72', sprite: 'memere',
      describe: (V) => 'She calls you Junie. Some days she\'s the sharpest person in the house; some nights she stands at the window singing to the street. ' + ['She watches you like she\'s waiting for something.', 'She lights up when you come into a room.', 'When she\'s lucid, she tells you things she won\'t tell your mother.'][lvl(V('mem'), 2, 4)] },
    hannah: { name: 'Hannah Gagnon', role: 'The girl next door, 8', sprite: 'hannah',
      describe: () => 'Watches everything from her porch. Asked if you were staying for "Quiet Night," then got hauled inside before she could explain.' },
    teddy: { name: 'Teddy Okafor', role: 'Freshman · from Houston', sprite: 'teddy',
      describe: (V) => ['You hurt her. She\'s pretending she doesn\'t care, loudly.', 'Talks a mile a minute about Star Trek, radios and the sky. Decided to be your friend before you said a word.', 'Your friend. Funny, loyal, and a little scared of being left behind.', 'Best friend, no question. She\'d follow you into the dark and complain the whole way.'][lvl(V('teddy'), 2, 5) + 1] + (V('teddy_spark') >= 2 ? ' Sometimes she looks at you a second too long.' : '') },
    cal: { name: 'Cal Ashgrove', role: 'Freshman · old Derry family', sprite: 'cal',
      describe: (V) => ['He thinks you\'re just another local who doesn\'t see.', 'Carries a marbled notebook full of Derry\'s disasters. Talks like a museum placard. Knows more than he says.', 'He\'s started telling you things. Not everything.', 'He trusts you, which seems to frighten him more than anything in his notebook.'][lvl(V('cal'), 2, 5) + 1] },
    sloane: { name: 'Sloane Ashgrove', role: 'Freshman · Cal\'s twin', sprite: 'sloane',
      describe: (V) => ['She\'s decided you\'re beneath her notice, and makes sure you notice.', 'Sharp, cold, flawless. Told you nobody keeps locker 227 for long.', 'She respects you, which with Sloane looks a lot like being insulted less.', 'Under the armor she\'s terrified of something. You might be the only one who\'s seen it.'][lvl(V('sloane'), 2, 5) + 1] + (V('sloane_spark') >= 2 ? ' You keep thinking about the way she said your name.' : '') },
    wes: { name: 'Wes Pike', role: 'Sophomore · foster kid, new this summer', sprite: 'wes',
      describe: (V) => ['He\'s written you off. He\'s good at that.', 'Draws monsters and maps. Feeds a one-eyed cat in the Barrens. "Not new. Temporary."', 'He talks to you. In Wes terms, that\'s practically a parade.', 'He trusts you. He doesn\'t trust anybody.'][lvl(V('wes'), 2, 5) + 1] + (V('wes_spark') >= 2 ? ' Your stomach does something stupid when he almost smiles.' : '') },
    brett: { name: 'Brett Lindqvist', role: 'Junior · quarterback', sprite: 'brett',
      describe: (V) => (V('brett_heat') >= 3 ? 'He\'s noticed you, and he smiles every time he sees you. It\'s not a nice smile.' : 'Every adult in Derry thinks he\'s wonderful. Every kid below him knows better.') },
    whitcomb: { name: 'Ms. Whitcomb', role: 'English teacher, first year', sprite: 'whitcomb',
      describe: () => 'Big cardigans, bigger bangs, genuinely loves books. Flinched when she read your last name off the roll.' },
    fenwick: { name: 'Principal Fenwick', role: 'Derry High', sprite: 'fenwick', describe: () => 'Bow tie, walrus mustache, firm handshake. Brett Lindqvist is his nephew.' },
    teague: { name: 'Mr. Teague', role: 'Night janitor since 1957', sprite: 'teague', describe: (V) => (V('knows_wall') ? 'He keeps a wall of names in the boiler room and traces every one of them, every night, so he won\'t forget.' : 'Plays chess with Cal in the boiler room. Smells like pipe tobacco and Lysol. Says almost nothing.') },
    nate: { name: 'Nate Fortier', role: 'Low Tide Records', sprite: 'nate', describe: (V) => 'Long hair, kind eyes, plays in a band called the Static Hours. Wrote a song about a girl he says he never met.' },
    dot: { name: 'Dot Carrier', role: "Dot's Diner", sprite: 'dot', describe: () => 'Knows everyone\'s business and feeds them anyway. Makes a grilled cheese at 3:15 every afternoon and throws it away.' },
    constance: { name: 'Constance Ashgrove', role: 'Lantern Society president', sprite: 'constance', describe: (V) => (V('suspicion') >= 3 ? 'She smiles at you like she\'s measuring you for something.' : 'Runs Canal Days, the Historical Society, and, as far as you can tell, everything else.') },
    librarian: { name: 'Mrs. Fennimore', role: 'Derry Public Library', sprite: 'librarian', describe: () => 'Helpful. Remembers everything you ask her for.' },
    june: { name: (V) => (V('knows_june') ? 'June Brennan' : 'The girl on the tape'), role: '?', sprite: 'june', describe: (V) => (V('knows_june') ? 'Your sister. You didn\'t know you had one.' : 'A voice under the hiss that knows your nickname.') }
  };

  D.clues = {
    junie: { cat: 'Junie', title: '"Junie"', text: 'Mémère called you Junie the moment she saw you. "Tu es revenue." You came back.', src: 'Larch Street, Aug 31' },
    sign_voice: { cat: 'Junie', title: 'The voice on the car tape', text: 'At the moment you passed the DERRY sign, a girl\'s voice under the hiss: "If you\'re hearing this, Gussie, it means you came back."', src: 'The road into Derry' },
    rearview: { cat: 'Larch Street', title: 'The empty back seat', text: 'Mom kept checking the back seat in the rearview mirror. "You used to sit back there." You haven\'t since you were eleven.', src: 'The drive' },
    four_plates: { cat: 'Larch Street', title: 'Four plates', text: 'Mom set four plates for three people. "Math. I\'m bad at math."', src: 'Kitchen, first night' },
    height_marks: { cat: 'Larch Street', title: 'Pencil marks in the closet', text: 'Heights marked on your closet doorframe: C for Mom in the fifties, painted-over marks with a letter like J, and one low tick that says G — 1981. You don\'t remember being measured here.', src: 'Your room' },
    dad_recorder: { cat: 'Junie', title: 'The red recorder', text: 'Dad didn\'t remember giving you your recorder. You\'ve always known he did. Haven\'t you?', src: 'Phone call' },
    claire_song: { cat: 'Junie', title: '"À la claire fontaine"', text: 'Mémère sings it at the window at night. You know every note and you\'ve never known where from. "I will never forget you."', src: 'Living room, 2 a.m.' },
    mom_patch: { cat: 'Junie', title: 'Two answers', text: 'Mom says Mémère calls her by "her sister\'s name" — she has no sister. Then she says "Junie" was a pet name for her. She doesn\'t notice the answers don\'t match.', src: 'Mom' },
    hannah_quiet: { cat: 'The Quiet', title: '"Quiet Night"', text: 'Hannah next door: "Are you staying for Quiet Night? You have to be inside by eight. Everybody is." Her mother pulled her in before she could explain.', src: 'Larch Street' },
    whitcomb_flinch: { cat: 'Junie', title: 'Ms. Whitcomb and "Brennan"', text: 'When she read your last name off the roll, Ms. Whitcomb froze. "Do I know your family?" Then her nose started to bleed.', src: 'Homeroom, Sept 4' },
    locker_initials: { cat: 'Derry High', title: '"J.B. + N.F. \'82"', text: 'Scratched inside your locker door in a lopsided heart. Somebody had locker 227 in 1982.', src: 'Locker 227' },
    locker_lantern: { cat: 'The Quiet', title: 'The crossed-out lantern', text: 'Under the initials in your locker: a tiny lantern scratched into the paint, with an X through it.', src: 'Locker 227' },
    sloane_locker: { cat: 'Derry High', title: '"Nobody keeps that locker"', text: 'Sloane: people who get 227 "transfer. Or move. Or—" Then she called it the drafty one.', src: 'Sloane Ashgrove' },
    cal_october: { cat: 'The Quiet', title: 'October twelfth', text: 'Cal asked if you knew what happens on October 12th. "Ask your grandmother."', src: 'Cal Ashgrove' },
    memere_society: { cat: 'The Society', title: 'The Lantern Society', text: 'Mémère was in the Lantern Society with Cal\'s mother for thirty-six years, until 1982. "Nobody quits the Lantern Society." Members wear a little brass lantern pin. So does Mémère.', src: 'Cal Ashgrove' },
    wes_map: { cat: 'Derry', title: "Wes's map", text: 'Wes draws Derry with soft X marks on "places that feel wrong": the Standpipe hill, the woods by the stream, and a spot near the corner of Larch Street.', src: 'The bleachers' },
    library_1982: { cat: 'The Quiet', title: 'Every October thirteenth', text: 'Cal\'s printouts: every Canal Days in the Derry News is a crowd and paper lanterns on the water. Every October 13th after it is bake sales and weather. As if the town blinked.', src: 'Library' },
    rhyme: { cat: 'The Quiet', title: 'The jump-rope rhyme', text: '"Lantern, lantern, burning low — who goes walking? Who\'s to know? Close your eyes and hold your breath — never answer, never guess—" The kids stopped when they saw you.', src: 'Bassey Park' },
    daniel_carrier: { cat: 'Derry', title: 'Daniel Carrier', text: 'When you asked Dot if she knew a Daniel Carrier, she dropped the coffee pot and started crying. "I never had kids." She didn\'t know why she was crying.', src: "Dot's Diner" },
    dot_cheese: { cat: 'Derry', title: 'The 3:15 grilled cheese', text: 'Every day at 3:15 Dot makes a grilled cheese, cut corner to corner like for a kid, with pickles, in front of an empty stool. Then she throws it away. "Twenty years. You\'d think I\'d know why."', src: "Dot's Diner" },
    library_photo: { cat: 'Junie', title: 'The blurred girl', text: 'Derry News, Canal Days 1982: "Derry High freshmen enjoy the Float: Paige Whitcomb, Nate Fortier, and—" a blank. In the photo, a third girl with her arms around them both. Her face is a pale blur.', src: 'Library microfiche' },
    memere_gave: { cat: 'The Society', title: '"We only ever gave the ones nobody would miss"', text: 'Mémère, over cards: "Drifters. Runaways. People passing through. That was the rule. And then they wanted my Junie, and I—" Then she didn\'t know whose deal it was.', src: 'Kitchen, Saturday night' },
    nate_song: { cat: 'Junie', title: '"Girl in the Static"', text: 'Nate\'s song: "There\'s a girl in the static, between the stations at night. She knows the words to my songs. She won\'t tell me her name." He woke up with it two years ago. "It\'s about a girl I never met."', src: 'Low Tide Records' },
    nate_jb: { cat: 'Junie', title: 'N.F.', text: 'Nate Fortier, Derry High class of \'86. A freshman in 1982. When you said "J.B. plus N.F." he laughed — then put his hand over his heart like it hurt.', src: 'Low Tide Records' },
    rules: { cat: 'The Quiet', title: 'The rules of Lantern', text: 'Hannah: close your eyes so you don\'t see the light. Hold your breath when it goes by so it can\'t hear you. Never answer, even if it sounds like your mom. Never guess who it sounds like. "If it calls you, let it call. Derry keeps us, one and all."', src: 'Bassey Park' },
    standpipe_lantern: { cat: 'The Quiet', title: 'Lanterns on the Standpipe', text: 'The crossed-out lantern from your locker, scratched four times into the Standpipe ruin. One is old enough to have moss in it. Cal says it\'s a kids\' sign: don\'t go to the light.', src: 'The Standpipe' },
    teddy_tape: { cat: 'The Quiet', title: "Teddy's Quiet Night tape", text: 'Last Quiet Night at 1:12 a.m., Teddy\'s radio picked up a flat voice reading names for nine minutes: Peter Dunn, Marcus Lowell, Toby Mercer, Daniel Carrier… None of them are in the phone book.', src: "Teddy's room" },
    minutes_1982: { cat: 'The Society', title: 'The minutes book', text: 'Mrs. Ashgrove\'s maroon ledger. Every October since 1881 ends with one typed word, "Kept.", and a name blacked out. 1982: "Kept. (Y.T. abstained.)" Yvette Thibodeau. The only abstention in 110 years.', src: 'The Ashgrove study' },
    broken_e: { cat: 'The Society', title: 'The chipped "e"', text: 'The Lantern Society\'s typewriter has a chipped lowercase e. Every e has a little bite out of it.', src: 'The Ashgroves\' typewriter' },
    society_pins: { cat: 'The Society', title: 'The pin at sixteen', text: 'Sloane: "When I turn sixteen, my mother gives me a pin. It means you\'re responsible. For the town." She doesn\'t want it.', src: 'Sloane, on the porch' },
    starving_winter: { cat: 'The Quiet', title: 'The Starving Winter', text: 'Mémère\'s story: in 1880 the town was starving. A girl walked into the snow with a lantern. In the morning the deer came back and the river thawed. "And they never said her name again, because that was the price."', src: 'Mémère, on tape' },
    casseroles: { cat: 'The Society', title: 'The casserole committee', text: 'Dot: when someone loses somebody, the Lantern ladies come the next morning with casseroles and "take the things away so it doesn\'t hurt." Dot has had one of their casserole dishes since 1971 and doesn\'t know why.', src: "Dot's Diner" },
    the_wall: { cat: 'Junie', title: 'The wall of names', text: 'In the boiler room, Mr. Teague keeps a name for every year in grease pencil, retraced every night so they won\'t fade. ROSE TEAGUE 1961. DANIEL CARRIER 1971. TOBY MERCER 1986. JUNE BRENNAN 1982.', src: 'Boiler room' },
    teague_cost: { cat: 'The Quiet', title: '"It always gets fed"', text: 'In 1961 Mr. Teague pulled his daughter Rose out of the light. It took his wife instead. An hour later Rose walked back to it alone. "You pull one out, it takes whoever\'s closest."', src: 'Mr. Teague' },
    dad_call: { cat: 'Junie', title: '"Tell your sister—"', text: 'Dad called at 2:13 a.m., crying about a dream: you, little, in the yard on Corson Street, holding hands with a girl with bangs and a yellow sweater. "Tell your sister I—" Then he didn\'t know what he was saying.', src: 'Phone, Sept 29' },
    june_photo: { cat: 'June', title: 'The Polaroid', text: 'A teenager in a yellow sweater holding four-year-old you on her hip in front of 9 Larch Street. Her face has faded to white. On the border: "Me + Gussie, July \'81."', src: 'The attic box' },
    june_id: { cat: 'June', title: 'June Marie Brennan', text: 'Derry High student ID, 1982–83. Grade 9. The photo is bleached blank. The name isn\'t.', src: 'The attic box' },
    june_tapes: { cat: 'June', title: "June's tapes", text: 'QUIET NIGHT RESEARCH #1–#4, and GUSSIE\'S BEDTIME SONGS — DO NOT TAPE OVER (THIS MEANS YOU). Your recorder was hers. You\'ve been taping over her your whole life.', src: 'The attic box' },
    june_notes: { cat: 'June', title: "June's notebook", text: '"1961 — Rose Teague (ask Mr. T!!) · 1971 — Daniel Carrier (Dot\'s?) · The Lamp. The Standpipe. Lantern ladies = Mémère?????" Last page: "If anything happens: Gussie. Tape #5. Don\'t let them—" Torn out. There is no tape #5.', src: 'The attic box' },
    wes_note: { cat: 'The Quiet', title: "Wes's note", text: '"Wesley — I know where you are now. I\'m so sorry for everything. Meet me at the old Standpipe Saturday, October 12, after dark. Come alone. Don\'t tell the Dunmores. — Mom" Typed. Found in his locker.', src: 'Wes' },
    memere_warning: { cat: 'The Quiet', title: "Mémère's warning", text: 'At 3 a.m., perfectly clear: "Saturday night, the Quiet comes. You stay inside. You don\'t open the door. Not for anyone. Not even for her."', src: 'Your room, Oct 9' },
    yearbook_1983: { cat: 'June', title: 'Not pictured', text: 'The 1983 Tiger, freshman class: between BOUCHARD and BRIGGS, a gray placeholder silhouette and two words. "Not pictured." No name.', src: 'School library' },
    upstream_lantern: { cat: 'The Quiet', title: 'The lantern going upstream', text: 'At the Float, every lantern drifted east with the current except one, glowing green, going upstream toward the hill. Nobody else seemed to see it.', src: 'The canal, Oct 11' },
    overheard: { cat: 'The Society', title: 'Behind the tent', text: 'Mrs. Ashgrove: "The Pike boy. The Dunmores won\'t make a fuss. The state will lose the file." Brett delivered the letter. And about you: "She\'s asking questions. Like the other one did. Next year, perhaps."', src: 'Lantern Society tent' },
    radio_names: { cat: 'Junie', title: 'Names on the radio', text: 'At 3:00 a.m. your clock radio turned itself on. A flat voice read: Peter Dunn. Marcus Lowell. Toby Mercer. Daniel Carrier. Rose Teague. And one more, cut off: June—', src: 'Your room, 3 a.m.' }
  };

  D.links = [
    { need: ['junie', 'sign_voice'], text: 'Mémère calls you Junie. A girl on your tape calls you Gussie. Is it the same girl?' },
    { need: ['four_plates', 'rearview'], text: 'An extra plate. An empty back seat Mom keeps checking. As if someone is missing and only her hands remember.' },
    { need: ['height_marks', 'junie'], text: 'J on the closet doorframe. Junie.' },
    { need: ['locker_initials', 'junie'], text: 'J.B. in 1982. Junie. Your last name starts with B.' },
    { need: ['locker_lantern', 'memere_society'], text: 'A lantern crossed out in your locker. A lantern pin on Mémère\'s cardigan. Somebody in 1982 didn\'t like the Lantern Society.' },
    { need: ['radio_names', 'junie'], text: 'The radio\'s list ended with "June—". Mémère calls you Junie.' },
    { need: ['rhyme', 'hannah_quiet'], text: 'Hannah asked about Quiet Night. The kids\' rhyme is about not looking, not answering. Rules for something.' },
    { need: ['library_photo', 'locker_initials'], text: 'Paige Whitcomb, Nate Fortier, and a girl nobody can name. In your locker: J.B. + N.F. \'82.' },
    { need: ['dot_cheese', 'daniel_carrier'], text: 'A grilled cheese for a child Dot never had. Daniel Carrier. Carrier is Dot\'s name.' },
    { need: ['memere_gave', 'memere_society'], text: 'The Lantern Society "gave" people. The ones nobody would miss. Mémère quit in 1982.' },
    { need: ['teddy_tape', 'radio_names'], text: 'The same voice, the same names — on Teddy\'s radio last October, on your clock radio this September.' },
    { need: ['nate_song', 'library_photo'], text: 'Nate misses a girl he "never met." He\'s in a photo with his arm around a girl whose face is gone.' },
    { need: ['standpipe_lantern', 'locker_lantern'], text: 'The same crossed lantern in your locker and on the Standpipe. Don\'t go to the light.' },
    { need: ['broken_e', 'wes_note'], text: 'Wes\'s "mom" typed her note on a typewriter with a chipped e. So does the Lantern Society.' },
    { need: ['the_wall', 'june_id'], text: 'JUNE BRENNAN 1982 on Mr. Teague\'s wall. June Marie Brennan, Grade 9. Your sister.' },
    { need: ['minutes_1982', 'memere_gave'], text: '"Kept. (Y.T. abstained.)" — the year they wanted Mémère\'s Junie.' },
    { need: ['starving_winter', 'teague_cost'], text: 'A girl walked into the snow with a lantern and the town lived. Every year since, someone walks to a light. It always gets fed.' },
    { need: ['june_notes', 'june_tapes'], text: 'Tapes #1 to #4 in the box. The notebook says: "If anything happens: Gussie. Tape #5." Where is tape #5?' },
    { need: ['whitcomb_flinch', 'locker_initials'], text: 'Ms. Whitcomb was at Derry High in the eighties. She flinched at "Brennan." J.B., 1982.' }
  ];

  D.tapes = {
    tape_car: { title: 'RAIN #4 (THE WAGON)', when: 'Aug 31, 1991 · the road into Derry', desc: 'Rain, wipers, the rattle — and a voice at the sign.', lines: [['-', '(rain on the roof, the wipers, the rattle)'], ['-', '"You\'re taping the rain again."'], ['june', '…if you\'re hearing this, Gussie, it means you came back…'], ['-', '(rain)']] },
    tape_brett: { title: 'BEHIND THE GYM', when: 'Sept 4, 1991 · Derry High', desc: 'Brett Lindqvist, on tape, being exactly who he is.', lines: [['-', '"Draw me your mom. Oh, wait. You don\'t know what she looks like."'], ['-', '"Bet she\'s in a ditch somewhere. Bet she chose the ditch—"'], ['-', '"Brett, man, come on—" "Shut up, Dougie."']] },
    tape_wes: { title: 'WES (THE BARRENS)', when: 'Sept 7, 1991 · by the stream', desc: 'Wes, a little embarrassed, saying something for your tape.', lines: [['wes', 'This is Wes Pike. I\'m fifteen. It\'s Saturday. I\'m in Derry, Maine, which is a stupid name for a town.'], ['wes', 'And I\'m not going anywhere this time.'], ['wes', 'That\'s it. That\'s all I got. Don\'t play it for anybody.']] },
    tape_creek: { title: 'THE PIPE BREATHING', when: 'Sept 7, 1991 · the Barrens', desc: 'The culvert hums like an organ note. It breathes. Under it, far away, many voices — or water.', lines: [['-', '(a low hum, rising and falling, like breath)'], ['-', '(under it, very far away: voices, all talking at once)']] },
    tape_canal_kids: { title: 'HANNAH — "LANTERN"', when: 'Sept 7, 1991 · Bassey Park', desc: 'The rhyme, flat and fast, like the Pledge of Allegiance.', lines: [['girl', 'Lantern, lantern, burning low. Who goes walking? Who\'s to know?'], ['girl', 'Close your eyes and hold your breath. Never answer, never guess.'], ['girl', 'If it calls you, let it call. Derry keeps us, one and all.']] },
    tape_teddy_radio: { title: 'KA1TDO — 2M BAND, 1:12 A.M.', when: 'Oct 13, 1990 · Teddy\'s copy', desc: 'Nine minutes of a flat voice reading names.', lines: [['-', '(static)'], ['-', '…Peter Dunn. Marcus Lowell. Toby Mercer. Daniel Carrier…'], ['-', '(it stops in the middle of a name)']] },
    tape_memere_story: { title: 'DERRY VOICES — MÉMÈRE', when: 'Sept 25, 1991 · living room', desc: 'The Starving Winter, in your grandmother\'s voice.', lines: [['memere', 'The snow came in October and didn\'t stop. People ate their boots.'], ['memere', 'And on the worst night, a girl took a lantern and walked out into the snow.'], ['memere', 'And they never said her name again. Because that was the price.'], ['memere', 'Turn that off now.']] },
    tape_dot: { title: 'DERRY VOICES — DOT', when: 'Sept 25, 1991 · Dot\'s Diner', desc: 'Dot on the Float, and on the casserole committee.', lines: [['-', 'You write a name on your lantern and let it go.'], ['-', 'They take care of everything, so the family doesn\'t have to look at it all.'], ['-', 'Take the things away. So it doesn\'t hurt.']] },
    tape_constance: { title: 'DERRY VOICES — MRS. ASHGROVE', when: 'Sept 25, 1991 · West Broadway', desc: 'The Lantern Society, in its own words.', lines: [['-', 'Grief is a community\'s work, not a family\'s. We carry it so they don\'t have to.'], ['-', 'Derry is a town that knows the value of rest.']] },
    tape_june_bedtime: { title: "GUSSIE'S BEDTIME SONGS", when: 'Summer 1982 · June\'s handwriting', desc: 'DO NOT TAPE OVER (THIS MEANS YOU).', lines: [['june', 'Okay, Gussie. This is for when I\'m at sleepover camp and you can\'t sleep. Pinky promise. Good.'], ['june', 'À la claire fontaine, m\'en allant promener…'], ['june', '…il y a longtemps que je t\'aime, jamais je ne t\'oublierai.'], ['june', 'That means I\'ll never forget you. Not ever. Night, Gus-Gus.']] },
    tape_june_research: { title: 'QUIET NIGHT RESEARCH #3', when: 'Oct 5, 1982 · June\'s handwriting', desc: 'June, investigating.', lines: [['june', 'This is June Brennan, Derry High School, class of 1986, and this is Research Tape Number Three.'], ['june', 'One: every year on the second Saturday in October, the grown-ups go to sleep.'], ['june', 'Two: every year, somebody goes missing, and nobody notices. Not even their family.'], ['june', 'Four: the lantern ladies have a list. I\'ve seen it. And Nate says—'], ['-', '(hiss)']] },
    tape_payphone: { title: 'PAY PHONE — WITCHAM & JACKSON', when: 'Oct 12, 1991 · Quiet Night', desc: 'A call to a pay phone in a town with every light out. You didn\'t say a word.', lines: [['-', '(tape hiss, the soft endless kind)'], ['june', '…Gussie? Don\'t talk. Don\'t ever talk to it. Just listen.'], ['june', 'When you do, it\'ll turn around. It takes whoever\'s closest.'], ['june', 'So don\'t be the closest one. Please, Gussie. I can\'t have you down here.'], ['-', '(click)']] },
    tape_memere: { title: 'MÉMÈRE SINGING (2 A.M.)', when: 'Aug 31, 1991 · living room', desc: 'Your grandmother at the window, singing to Larch Street.', lines: [['memere', 'À la claire fontaine, m\'en allant promener…'], ['memere', 'Il y a longtemps que je t\'aime, jamais je ne t\'oublierai.'], ['memere', 'Bonne nuit, ma belle.']] }
  };

  D.theories = {
    voice_radio: { q: 'The girl on the car tape', a: 'Radio crosstalk. Somebody\'s ham radio. (Who knows your nickname?)' },
    voice_old_tape: { q: 'The girl on the car tape', a: 'An old recording ghosting through a reused tape. But whose?' },
    voice_impossible: { q: 'The girl on the car tape', a: 'It isn\'t possible. It happened anyway.' }
  };

  D.self = function (V) {
    const t = { warm: V('t_warm') || 0, funny: V('t_funny') || 0, bold: V('t_bold') || 0, careful: V('t_careful') || 0, sly: V('t_sly') || 0, honest: V('t_honest') || 0, curious: V('t_curious') || 0 };
    const top = Object.entries(t).sort((a, b) => b[1] - a[1]);
    const words = { warm: 'kind when it counts', funny: 'quick with a joke, especially when it hurts', bold: 'the kind who says the true thing out loud', careful: 'watchful, quiet, slow to show her hand', sly: 'good at telling people what they need to hear', honest: 'honest even when it costs her', curious: 'unable to leave a strange thing alone' };
    const s = top[0][1] === 0 ? 'New in town. Nobody knows who you are yet, including you.' : `So far in Derry you've been ${words[top[0][0]]}` + (top[1][1] > 0 ? `, and ${words[top[1][0]]}.` : '.');
    return { summary: s, lines: [] };
  };

  D.summary = function (V, eng) {
    const dec = [];
    const lunch = { teddy: 'You sat with Teddy, who had been eating alone.', sloane: 'You took the chair next to Sloane Ashgrove.', wes: 'You ate on the bleachers near Wes Pike.', cal: 'You found Cal in the library.' }[V('lunch')];
    if (lunch) dec.push(['First day, lunch', lunch]);
    const bully = { fight: 'You got between Brett and Wes.', trick: 'You lied that Mr. Fenwick was coming.', teacher: 'You ran for a teacher. The teacher was Brett\'s uncle.', record: 'You hid and taped it.', walk: 'You kept walking.' }[V('bully_choice')];
    if (bully) dec.push(['Behind the gym', bully]);
    dec.push(['The voice on the car tape', V('taped_over_sign') ? 'You recorded over it.' : V('heard_sign_voice') ? 'You listened until you could say it by heart.' : 'You stopped the tape and didn\'t listen again.']);
    const ev = { teddy: 'You went to Teddy\'s and heard her radio tape.', memere: 'You stayed home and played Kaiser with Mémère.' }[V('evening3')];
    if (ev) dec.push(['Saturday night', ev]);
    const fri = { party: 'You went to the party at the Ashgrove house.', movie: 'You saw a movie at the Aladdin.', mom: 'You stayed home with Mom.' }[V('friday')];
    if (fri) dec.push(['Friday night', fri]);
    const intv = { memere: 'Mémère told you about the Starving Winter.', dot: 'Dot told you about the casserole committee.', teague: 'Mr. Teague showed you the wall of names.', constance: 'Mrs. Ashgrove told you the Society\'s history.' }[V('interview')];
    if (intv) dec.push(['Derry Voices', intv]);
    const told = ['mom', 'teddy', 'cal', 'wes', 'sloane', 'whitcomb'].filter((k) => V('told_' + k)).map((k) => ({ mom: 'Mom', teddy: 'Teddy', cal: 'Cal', wes: 'Wes', sloane: 'Sloane', whitcomb: 'Ms. Whitcomb' }[k]));
    if (V('knows_june')) dec.push(['June', told.length ? 'You told ' + told.join(' and ') + '.' : 'You kept her to yourself.']);
    if (V('recorded_wes')) dec.push(['A tape', 'Wes let you record him. "I\'m not going anywhere this time."']);
    const allies = [V('ally_teddy') && 'Teddy', V('ally_cal') && 'Cal', V('ally_sloane') && 'Sloane'].filter(Boolean);
    const call = { listened: 'You picked up and said nothing. June begged you not to be the closest one.', recorded: 'You picked up and taped June\'s warning without saying a word.', answered: 'You said hello. The warm voice said it would see you on the hill.', ignored: 'You let it ring. Every phone on the way rang after you.' }[V('june_call')];
    const talk = { pulled: 'You pulled free of Mrs. Ashgrove without a word.', june: 'You asked Mrs. Ashgrove about June, and it cost Wes time. The Lamp used to call June out in your voice.', pin: 'You showed Mrs. Ashgrove Mémère\'s pin. For a minute she didn\'t know what you were.', me: '"Then let it take me." Mrs. Ashgrove let you go to see if you meant it.' }[V('constance_talk')];
    dec.push(['Quiet Night', V('went_out') ? 'You went out into the dark' + (allies.length ? ' with ' + allies.join(' and ') : ', alone') + '.' : 'You stayed inside.']);
    const out = { wes: 'Wes was taken. Nobody at the Dunmores\' remembers him. You do.', brett: 'You stepped aside. The light took Brett Lindqvist while his father watched.', memere: 'Mémère walked into the light in your place. Mom doesn\'t remember she ever lived here.' }[V('outcome')];
    if (call) dec.push(['The pay phone', call]);
    if (talk) dec.push(['On the hill', talk]);
    if (out) dec.push(['The Lamp', out]);
    if (V('went_out')) dec.push(['Going home', V('looked_back') ? 'You looked back, and saw her face.' : 'You didn\'t look back.']);
    const win = { open: 'You reached for the latch.', closed: 'You didn\'t open the window.', song: 'You asked her for the song. She knew it.' }[V('window_choice')];
    if (win) dec.push(['The window', win]);

    const people = [];
    const lv = (v, a, b) => (v >= b ? 2 : v >= a ? 1 : v < 0 ? -1 : 0);
    people.push(['Mom', ['You kept her at arm\'s length.', 'You\'re finding your way back to each other.', 'You\'re closer than you\'ve been in years.', 'She\'d walk through fire for you, and she\'s starting to know you\'d do the same.'][lv(V('mom'), 3, 6) + 1]]);
    if (V('outcome') !== 'memere') people.push(['Mémère', ['She watches you like she\'s waiting for something.', 'She lights up when you come in.', 'You\'re her Junie and her Augusta both. She trusts you with the truth.'][Math.max(0, lv(V('mem'), 3, 6))]]);
    else people.push(['Mémère', 'Gone. You remember her. So does Mrs. Ashgrove.']);
    people.push(['Teddy', ['She thinks you dropped her.', 'Friends, cautiously.', 'Real friends.', 'Best friends. ' + (V('teddy_spark') >= 3 ? 'Maybe more.' : 'Ride or die.')][lv(V('teddy'), 3, 7) + 1]]);
    people.push(['Cal', ['To him you\'re just another local who doesn\'t see.', 'An ally of convenience.', 'He trusts you with things he\'s never said out loud.', 'He trusts you completely, which frightens him.'][lv(V('cal'), 3, 6) + 1]]);
    people.push(['Sloane', ['Beneath her notice, on purpose.', 'A curiosity.', 'She respects you.', 'Something complicated. ' + (V('sloane_spark') >= 3 ? 'She held your hand.' : 'She covered for you.')][lv(V('sloane'), 3, 5) + 1]]);
    if (V('outcome') !== 'wes') people.push(['Wes', ['He\'d written you off.', 'Alive, shaking, owing you something he can\'t name.', 'Alive. He trusts you now.', 'Alive. ' + (V('wes_spark') >= 3 ? 'You both know what the armrest meant.' : 'He\'d follow you anywhere.')][lv(V('wes'), 3, 6) + 1]]);
    else people.push(['Wes', V('recorded_wes') ? 'Gone. You have his voice on tape.' : 'Gone. Fading, even for you.']);
    if (V('outcome') === 'brett') people.push(['Brett', 'Gone. His mother will set three plates tonight and not know why.']);
    else people.push(['Brett', V('brett_heat') >= 3 ? 'He saw what you did on the hill. He\'ll never look at you the same way.' : 'He saw something on the hill he can\'t unsee.']);
    people.push(['The Lantern Society', V('suspicion') >= 4 ? 'They know your name. "Next year, perhaps."' : V('suspicion') >= 2 ? 'They\'ve noticed you.' : 'They think you\'re just Yvette\'s granddaughter.']);
    return { decisions: dec, people };
  };
})();
