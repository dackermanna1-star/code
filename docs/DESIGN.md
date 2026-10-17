# HALLOWELL — *the things left behind*

> Design bible **v2** (revised after a three-critic design review). Source of truth for story, characters,
> rules, chapters, maps, puzzles and endings. Engineering contract: `docs/TECH.md`. Content contract (maps,
> script ids, systems): `docs/CONTENT.md`. If they disagree on *what happens*, this file wins; on *how it is
> coded*, TECH.md wins.

---

## 0. Pillars (read these first, every agent)

1. **The building is the monster's body of rules.** Every horror obeys a school rule (bells, seats, hall
   passes, attendance, no running). Players survive by *learning the rules*. Nothing kills arbitrarily — and
   when it does kill, the game-over slip names the rule that was broken.
2. **Restraint.** Long quiet stretches. Silence before events. The Colonel is shown in fragments; **every
   appearance must reveal one new thing** (exposure ledger §5.1) or be cut. Stinger and silence budgets are
   hard numbers (§14).
3. **Caring is the horror.** The friends are funny, specific and *playable company* before they vanish. Their
   absence is the soundtrack of the middle game. The ending is decided by how Tess treated them.
4. **Spatial truth.** The school is a real 1923 Pennsylvania K–12 building. Players should be able to draw it
   from memory. Rooms change on revisits; the *layout* never lies — except where the school deliberately lies
   (front doors, the long hall), and those lies are rules too.
5. **Nostalgic, not derivative.** 1996 detail is texture, never a punchline. Dialogue is understated:
   interruptions, half-jokes, evasions. No forced slang, no exposition dumps, no thesis statements.
6. **No retry costs more than ~60 s or replays dialogue you've seen** (checkpoints §9.3, `seen_` flags).

---

## 1. Title, tone, frame

- **Title:** HALLOWELL. Subtitle on the title screen: *the things left behind*.
- **Kids' nickname for the school:** "Hollow Hell."
- **Setting:** Kettle Run, Schuylkill County, Pennsylvania (fictional anthracite coal-region town). Friday night
  **October 18, 1996**, 9:47 PM, through dawn of **Saturday October 19** — Founder's Day. The school eats
  time: the night passes in what feels like an hour or two (Leah notices on the tape: "We got here at nine
  forty-seven. That's an hour, T. Where's the hour?"; Tess at dawn: "It's morning. How is it *morning*?").
- **Look:** RPG-Maker-style 3/4 top-down pixel art at 480×270, 16 px tiles, VN portraits, strong darkness with a
  flashlight cone, dust in beams, rain on windows, fluorescents that only come on when the school "wakes."
- **Palette:** dirty institutional green, nicotine cream, faded mustard, cold moonlight blue, rust brown, wet
  black. Unnatural accents only for the supernatural: the Colonel's crimson sash and brass, husk amber,
  mine-fire red, safety-patrol orange.
- **Playtime target:** ~90 min first run (80–100). Budgets per chapter in §6. Four endings.

---

## 2. The truth (canon — players piece this together; never state it all in one place)

- **Colonel Cyrus Hallowell (1841–1911).** An officer of the Schuylkill County miners' regiment that dug the mine
  beneath Petersburg in 1864 — the idea was Lt. Col. Pleasants's; Hallowell took the credit and the statue
  (Leah: "Technically the mine was Pleasants's idea. Hallowell just got the statue."). He came home a hero,
  founded **Hallowell Coal & Iron Co.** (1866), built the Kettle Run colliery and the great **Hallowell
  Breaker**, and owned the town. Legendary appetite; grew immense. Miners' children (8–14) worked his breaker as
  **breaker boys**, sitting on benches over the coal chutes picking slate. He called them "my boys," knew every
  name, and kept a ledger of every boy on his payroll — the first **Register**. The breaker's rules: the shift
  whistle starts and ends work; boys stay on their benches; no running on the chutes; you show your **brass
  check** to leave the bench (to go to the privy); the payroll is called every morning.
- **October 19, 1894 — the first roll.** A lamp fire in the picking room. The doors were barred on the Colonel's
  standing order — *none leaves the benches before the whistle*. Seventeen boys died at their benches. The
  Colonel watched from the weigh-master's office at the top. The inquiry blamed "carelessness with a lamp." The
  breaker was never rebuilt; it was buried under culm with not all the boys recovered. That autumn the Colonel
  instituted **Founder's Day**, "kept in memory of the Hallowell Breaker and his boys" — the town has held
  Homecoming on the anniversary of the day its children burned ever since. His ledger, Oct 19 1894: *"The
  locusts were up again this year, as they were in '77, the summer they hanged the Mollies at Pottsville. Seventeen years in the dark and they come up
  singing. A man might learn from them."*
- **1911 — the timed death.** Seventeen years to the day, at his Founder's Day banquet, he dies "of a surfeit."
  He timed it. No children are taken. He goes under. His will — the **Founder's Charter** — endows a school
  "upon the ground of my old Breaker, that the children of Kettle Run shall never want for a place, and none
  shall be left behind," orders his entombment in a vault beneath it, enrolls **himself** as its first pupil
  ("I shall be the first scholar of Hallowell School, and subject to its rules as any child; and I shall be the
  last to leave it"), and contains the **endowment clause**: *the Hallowell endowment shall sustain the school
  so long as the Principal, on each Founder's Day, holds Assembly and presents the roll to the Founder.* Kettle
  Run could never have afforded the school without it.
- **1923.** Hallowell Consolidated School (K–12) opens on the buried breaker. Motto over the door: **NEMO
  RELINQUATUR** — *Let no one be left behind.*
- **The cycle.** Since 1911 the Colonel has slept underground and woken every 17 years on Founder's Day:
  **1928, 1945, 1962, 1979, 1996** (real Brood II cicada years; Mr. Lutz's biology board lists them in a plain
  table and the player makes the connection). Each waking, the school "holds session": bells nobody rings, roll
  calls, children taken into the Register. Explained away as runaways, a strip-pit drowning, "went to work in
  Philadelphia." The 1962 waking coincided with the start of the underground mine fire.
- **The school's rules are the breaker's rules:** bell = shift whistle · seat = bench · hall pass = brass check ·
  roll call = payroll · no leaving before dismissal = barred doors.
- **What "taken" means.** A taken child is physically in the building, entranced and "in session" (Danny at a
  desk, Leah in the library). Their name is in the Register. **Pencil** = enrolled but not yet kept. **Ink** =
  the child has *agreed to stay* (answered the roll). At **dismissal** — the dawn bell — every name still on the
  roll molts: the body hardens into an amber husk, like the cicada shells on the oak, and the child is kept.
  The Nine of 1979 are husks in the auditorium seats. The school takes the ones who *stand up* — in 1979 the
  Safety Patrol kids and Denise rose in the dark to help younger children to the exits (breaking R2).
- **Walter "Walt" Pruszynski,** custodian 1958–1979. His son **Joey (10) was taken in 1962** — "Joey ran. He was
  always running." Walt stayed seventeen more years to learn the rules and kept a log. Died 1988.
- **Miss Ruth Adair,** music teacher, 34 in 1979, pieced it together from Walt and the records and the Charter.
  On Founder's Day 1979 she took the principal's stamps from his safe. **Principal Gerald Haupt** took them back
  from her in the wings while the band played the alma mater, and locked them in the safe. Then the power failed.
  Adair went down under the stage anyway with only a red pen; her light died short of the breaker; her husk kneels
  in the vault. Nine students and Adair were gone. Official story: carbon monoxide from the mine fire. Haupt had
  "presented the roll" every Founder's Day to keep the endowment — to keep the school open. That afternoon **Ivy
  Webb** came at 1:20 to sign Denise out for a dentist appointment; Haupt told her Denise was already in the
  assembly. Denise was sitting in his outer office; he could see her shoes. The district closed the school
  anyway. Haupt resigned; died 1991. His letter remains in the safe.
- **1984.** Federal buyout; most of Kettle Run relocated. Steam still rises from cracks in Route 61.
- **1996.** Brood II came up in May; their empty shells still cling to the oaks. Tonight is the next waking.

### Earlier rolls (for the name wall, Register pages, yearbooks, ROLLCALL.BAS)
1894: the seventeen breaker boys (names: Polish, Slovak, Lithuanian, Irish, Welsh, Italian, German — invent).
1911: one line, `HALLOWELL, CYRUS — ENROLLED`. 1928 (2). 1945 (5). 1962 (4, incl. **Joseph "Joey" Pruszynski, 10**;
"the Mrazek boy" was *saved* — Walt got him out the coal chute). 1979: the Nine.

### The Homecoming Nine (1979)
| Name | Age | Detail |
|---|---|---|
| Denise Webb | 15 | clarinet, marching band — **Marcus's aunt**; stood to help a 4th grader |
| Kevin Hoyt | 12 | Safety Patrol captain — becomes **the Safety Patrol** |
| Carol Ann Mrazek | 17 | homecoming court (cousin of the boy Walt saved in '62) |
| Thomas "Tommy" Delvecchio | 16 | football |
| Patricia "Patty" Szalay | 14 | yearbook club |
| Raymond Oakes | 9 | 4th grade |
| Lisa Gorski | 16 | cheer |
| Anthony Burdick | 13 | chess club |
| Michelle Yancey | 11 | 6th grade, Safety Patrol |
| *Miss Ruth Adair* | 34 | music teacher — **the Reflection** |

---

## 3. Characters

### Theresa "Tess" Dolan — protagonist (16)
- **Look (must read at 24×32 px):** copper-red hair, shoulder length, messy, tucked behind her left ear with
  loose strands in her face; freckles; pale; gray-green eyes. **Oversized, worn, light-wash denim jacket** (her
  dad's; sleeves pushed up), black T-shirt, **black jeans**, **black canvas high-top sneakers with white side
  stripe and white soles**. Olive canvas shoulder bag. Black Maglite. Slightly hunched; hands in pockets idle.
- **Personality:** observant, dry, deflects with sarcasm, avoids hard conversations ("later"), draws in a
  sketchbook, loyal, braver than she believes. Not a hero; not helpless. **Quip budget:** her jokes thin out as
  the night goes on; none after she's alone in Ch6 until the epilogue — fear makes her literal.
- **Secret:** she and her mom (Maureen, an ER nurse on nights at Pottsville) move to **Philadelphia** after
  Christmas. In her bag: a **PA Student Withdrawal/Transfer Form**, signed by her mom, to hand in Monday. Her plan
  was to let homeroom find out from the attendance sheet. Parents divorced; dad in Pittsburgh (she's due there for
  Thanksgiving). Her sketchbook has a page: "HOW TO TELL LEAH (draft 6): 1. ~~casually~~ 2. ~~after Halloween~~
  3. ~~in a letter~~" (doc `tess_draft`, in Notes from the start).
- **Names:** "Tess" (Danny: "Dolan"; Leah: "T"). **Nobody calls her Theresa** — except the school, and her mom when
  it's bad ("Theresa Marie Dolan" when it's *really* bad).
- **Starting inventory:** Maglite, sketchbook, her mom's cracked **compact**, the **transfer form**, **Leah's
  mixtape** (given in the car), Big Red gum, house key (pink rubber cap).
- **Voice:** "Great. A haunted school. And I wore the good sneakers." / "That's not a rat. Rats don't sigh." /
  (to herself) "Okay. Okay okay okay. Walk. Don't run." / "I'm not leaving without them."

### Danny Kovach (16) — the instigator
- **Look:** green/silver Eagles Starter jacket, backwards red cap, ripped jeans, big white sneakers, backpack. Stocky.
  Always moving — he walks backward, jogs, bounces.
- **Personality:** class clown with a big heart; fills every silence; impressions (Mulder: "The truth is out there,
  Scully"). Dad laid off from the strip mine. Terrified he'll never get out ("Kovaches don't leave Kettle Run. We
  just get buried in it."). Secretly carries a folded **Navy recruiting pamphlet** in his backpack. Calls Tess
  "Dolan." Regionalisms capped: "heyna" ≤ 2 and "youse" ≤ 2 in the whole game; texture comes from nouns
  (Yuengling, Acme, Tastykakes, the Legion, Route 61).
- **Why he's here:** organized the dare; **Uncle Frank** ("four Yuenglings deep at the Legion") swears the Colonel
  was buried with his medals and a gold sword. Brought Frank's **bolt cutters**, Herr's chips, Butterscotch Krimpets.
- **The joke that lands wrong (car):** "Nine kids walk into an assembly. Zero walk out. It's like the worst math
  problem ever." (Leah: "Danny." Marcus says nothing.)
- **Things left behind:** his cheap **red flashlight** (tape label "DANNY K.") — still on — and his **backpack**
  (bolt cutters, Krimpets, the pamphlet) in the lobby.

### Leah Brandt (16) — best friend since second grade
- **Look:** dark chin-length bob, round wire glasses, oversized gray cardigan, plaid skirt, black tights,
  **cherry-red Doc Martens**. Her dad's **VHS-C camcorder** (red record LED). She drove (her mom's '86 Taurus wagon;
  "Keys are in the visor. Nobody steals anything in Kettle Run." Danny: "There's nobody *in* Kettle Run.").
- **Personality:** sharp, skeptical, ambitious, deadpan; zine *STATIC*; narrates into the camcorder ("STATIC field
  report. Room 101. The chairs are tiny. Danny is not."). Corrects facts. Calls Tess "T."
- **Secret:** she **already knows** Tess is moving (Tess's mom told Leah's mom in August — "In the Acme. By the
  *lunchmeat*, T."). She made the mixtape **"FOR THE DRIVE"** in August — the drive to Philly. In the car Tess misreads
  it: "Pittsburgh's not till Thanksgiving." Leah: "So you'll have it." Her older sister left for college and never calls.
- **Camcorder intro (establishes full names):** "This is Leah Brandt for STATIC. It is nine forty-seven P.M., Friday,
  October eighteenth, 1996. With me are Daniel Kovach—" "Danny." "—Daniel Kovach, Marcus Webb, and Theresa Dolan."
  "Never call me Theresa on tape." "Noted. For the tape."
- **Thing left behind:** the **camcorder**, still recording on her desk in Room 103.

### Marcus Webb (16) — the quiet one
- **Look:** tall, close-cropped hair, dark-skinned, olive field jacket, black knit beanie, headphones around his
  neck. Plays trumpet in the Mount Tabor band.
- **Personality:** few words, deliberate, kind; when he jokes it lands. Hums the old Hallowell alma mater when
  nervous (his grandmother sang it). Calls Tess "Tess."
- **Secret:** his aunt **Denise Webb** was one of the Nine. Born December 1979; his grandmother **Ivy Webb** says he
  has Denise's eyes, kept Denise's room the same, and still sets her a plate at Thanksgiving with the good fork
  (Ivy is in a nursing home in Pottsville now). He carries Ivy's **photo of Denise** ("My girl. Fall 1979. —Mama").
  He reveals Denise in pieces (Ch2: one line; Ch3 calendar; Ch4 sign-out sheet), not in one speech.
- **Thing left behind:** the **photo of Denise**, on the gym floor.

### The Colonel ("the Benefactor"; Walt's log calls him "Mr. H.")
- **Silhouette:** aristocratic warlord of impossible mass: rotted navy Union colonel's frock coat stretched over a
  vast swollen torso, brass buttons popped or sunk into folds of pale blubbery flesh, gold epaulettes half-swallowed
  by the shoulders, a crimson officer's sash straining across the belly, medals pinned into skin, heavy arms, huge
  ringed hands, a lower mass he drags, cavalry boots split open. ~3 tiles wide, 3–4 tall.
- **Face:** a small, serene, almost-human face — his portrait's face, gray mutton chops, half-lidded eyes, polite
  closed smile — set too small in a huge head like a doll's face pressed into dough. Too smooth; eyes don't blink in
  sync; on "Theresa?" the mouth opens too far, vertically. **At the very end (true ending) his eyes blink in sync for
  the first time — he is, finally, just a child who doesn't want to go home.** No fangs, glowing eyes or gore.
- **Movement:** drags himself; motionless for minutes (mistaken for coal, gym mats); folds into spaces too small;
  lurches with horrible speed once he notices you.
- **Speech:** **≤ 15 lines in the whole game.** No contractions, only school language, always full legal names. Under
  his text: a low wet murmur. Lines bank: "Good evening, students. You will proceed to your homerooms. Attendance will
  now be taken." · "Theresa Dolan... absent." *(pen scratch)* "Absences will be made up." · "Thank you, Theresa." ·
  "Good boy. I knew your grandfather's name." (patting Danny) · "Theresa. Those belong to the principal. ...Put them
  back." · "Who is out of their seat?" · "Theresa. Put down the pen." · "Theresa... the bell. I was to be the last to leave."
- **Smell (text only):** pennies, wet wool, Christmas ham.

### Miss Ruth Adair — the Reflection
- 1979 music teacher, brown hair pinned up, cardigan, cat-eye glasses. **Never speaks.** Appears only in mirrors,
  glass, dark CRTs and the compact; communicates by **writing in the fog** (UI: `narrate` in caps + `glass_write`
  sfx) and pointing. Kind, frantic, exhausted. First glimpse (Ch1): a single frame behind Tess in the trophy-case
  glass. Last (DISMISSED): she smiles in the trophy glass at dawn and fogs **GO HOME, TESS** — the only time anything
  supernatural uses "Tess."

### Kevin Hoyt — the Safety Patrol
- 12, blue windbreaker, **fluorescent orange Safety Patrol belt** across the chest, silver whistle. A pale husk-boy who
  stands at the ends of halls. Turns his head to follow you; never walks while observed; never kills — he reports.
  Disciplinary slips "reported by K. Hoyt, Safety Patrol". In DISMISSED he lowers the whistle and takes off the belt.

### Denise Webb — the lure
- 15, 1979 band uniform (green & gold, shako in her lap), clarinet. One husk the school moves (bleachers in Ch6,
  front row in Ch7). Built from Marcus's hopes. Her real voice is the diary page: brave and plain.

### Off-screen
Walt Pruszynski (log), Gerald Haupt (letter), Mr. Lutz (biology board), **Mrs. Edna Ostrowski** (librarian; kept the
case key in the card catalog, drawer HA–HE), Maureen Dolan (signature; *her voice is imitated once*), Ivy Webb,
Uncle Frank.

---

## 4. The rules of the school (diegetic; the design hangs on these)

| # | Rule (in-world) | Mechanic | Taught by → reinforced → tested |
|---|---|---|---|
| R1 | "No student may be in the halls when the bell rings." | During a **period** the Colonel walks halls and peeks into rooms. | Marcus Ch2 → guided period Ch3 → office Ch4 → free periods Ch5 |
| R2 | "Students will be seated and quiet during class." | **Seated + still = safe**, even if he looks right at you. Moving while he watches = caught. **Sitting down while he can see you counts as moving.** | Leah lifts the camera (Ch2), Marcus: "She moved." → Ch4/205 → Assembly |
| R3 | "No running in the halls." | Running is loud (he investigates; the coal heap stirs); **Safety Patrol** whistles if you run in its sight. Running is free in passing time except in Kevin's sight / near the occupied heap; suspended during chases. | Danny jogs backward and is taken (Ch1) → coal bin → Kevin |
| R4 | "Hall passes are required." | The long hall loops until you carry the pass. **Kevin keeps the pass** (one pass, one student). | sign over the archway → long hall |
| R5 | "Attendance is mandatory." | Three roll calls ask "Theresa Dolan?" Answering marks you present (§7). | Walt's log ("DON'T ANSWER") → Marcus silent at roll #1 → Adair's fog → roll #2 → roll #3 |
| R6 | "No student may leave before dismissal." | Front doors loop back inside until dismissal. **Loophole:** the coal chute — "Nobody ever made a rule about coal going *out*." | Ch1 loop → Walt's log (TRUANT) → DISMISSED doors open by themselves |
| R7 | (unwritten) "Only the school uses your full name." | Voices with full legal names are **the school**. Mimics are built from **what Tess believes** about the person, not the truth. | Leah (Ch1) → Marcus (dumbwaiter) → long-hall door → False Leah (alone) → Mom's voice (Ch7) |
| R8 | (Adair's) "Mirrors remember the last day." | The **compact** shows the room as it was Oct 19, 1979. | Ch5 restroom mirror → 202/203 → 201 → safe, catalog |

**Hiding = seats only.** In free play, only seats protect (desks, chairs, benches, bleachers, auditorium seats). Hall
lockers are *not* hide spots ("No. Seats. Marcus said seats."). The gym locker is the single scripted exception.

### 4.1 Periods (cadence is fixed and readable)
- **Sequence:** intercom crackle → two-tone chime (drops a semitone per act) → optional voice line → **10 s** → the
  **bell** → hall fluorescents stutter on → the Colonel emerges from a wall seam (≥ 12 tiles away, out of view) →
  patrol → **dismissal bell** → lights die → he sinks back into the walls.
- **Ends early:** 10 s after he has peeked into the room where Tess is seated ("attendance taken for this room"), or at
  60 s. Every period is one encounter, not a wait. While seated & still, **holding Confirm** makes Tess shut her eyes
  and fast-forwards time ×4 (peeks still play at normal speed).
- **Hall clocks** relive the minutes before the 1979 assembly: in passing time the minute hand advances from **1:40
  toward 1:45** (bell at 1:45); during a period 1:45→1:46; after dismissal it snaps back to 1:40. Readable timer.
- **Cadence:** Ch2 scripted only · Ch3 one *guided* period (after the keyring, Marcus: "Cafeteria. Go.") · Ch4
  scripted (after roll #1) · **Ch5 free periods on east2 and west2: passing 150 s, period ≤ 60 s, max 3**; none in the
  long hall or library, none while a scene is active · Ch6 none (the gym is the event) · Ch7 assembly mode · Ch8 none.
  A Kevin whistle forces a standard warning immediately. Never start a warning within 20 s of a map load (that guard may
  defer a bell once per interval), or during a doc/menu/dialogue/cutscene.
- **Followers on the chime** path to the nearest free seat in Tess's room (or crouch beside her). The AI never sees or
  catches followers; they warp to Tess on map transfer. Marcus: "Sit." / "Room. Now."
- **Peek escalation:** Ch3 a shadow crosses the door window · Ch4 the door opens, the coat fills the doorway, "hm?" ·
  Ch5 he steps in and drags along one row; medal jingle beside your desk.
- **Close pass:** when he passes within 1 tile of a seated, still Tess: 2.5 s micro-beat (no input lock) — vignette
  closes, breath right beside her, his hand rests on the next desk.
- **"The light dies where he is"** (until flag `ch6_gym_lights`): every `period` light within 3.5 tiles of him stutters
  off (`fluor_off`) and recovers 1 s after he passes; his sprite renders near-black except an emissive mask (brass
  buttons, epaulette and ring glints, sash fringe). Players see a moving hole in the light with brass winking in it.
  **Dying tubes ahead = he's coming.** In the gym the rule breaks — the lights stay on around him — and stays broken.

---

## 5. Entities

| Entity | Visual | Audio | Behavior | History | Purpose |
|---|---|---|---|---|---|
| **The Colonel** | navy mass, crimson sash, brass glints, tiny face; until the gym: a hole in the light | wet breathing; drag + floor creak; medal jingle; soft "hm?"; door creak; overhead footsteps + dust when he's on another floor | patrols in periods; investigates noise; lurches when he sees you; checks a seat only if he *saw you sit*; sleeps in the coal heap (Ch3); conducts the Assembly (Ch7) | founder, breaker, Register | primary threat |
| **Safety Patrol (Kevin)** | small figure, bright orange belt | rubber-sole squeak, breathy pre-whistle, whistle | stands at hall ends; head tracks you; whistles if you run in sight → period warning / Colonel investigates; guards & keeps the hall pass | 1979 patrol captain | enforces R3/R4 |
| **The Reflection (Adair)** | only in mirrors/glass/compact | glass-harmonica tone; finger on fogged glass | fog-writes warnings, points to clues | the teacher who tried | guide; R5/R8 |
| **The Voice (mimic)** | none — intercom grille, dumbwaiter, a closed door, a borrowed body | intercom crackle + hum; a voice too clear and too slow | imitates friends **and Mom**, using full names; built from Tess's beliefs; UI shows `INTERCOM` styling with the borrowed name + "?" (e.g. "Danny?") — never the real speaker id | the school taking attendance | dread; R7 tests |
| **Husks** | translucent amber child-shells, seated upright | dry rustle; very sparse cicada click | inert; a head has turned when you look back | every child kept | environment; Assembly; Breaker |

### 5.1 Colonel exposure ledger (contract — any added appearance must name its new information or be cut)
| # | Appearance | New information |
|---|---|---|
| 1 | Ch1 lobby portrait (seated) | who he was; his scale |
| 2 | Ch2 Room 103: coat hem, sash, boots, the hand (CG) | enormous; he touches; *still* means spared |
| 3 | Ch2 VHS face (scrubbable) | his face is the portrait's face, tiny and serene → `colonel_named` |
| 4 | Ch3 coal-heap mound | he sleeps below; noise wakes him |
| 5 | Ch3 body-shaped hollow | he's up, loose in the building |
| 6 | Ch4 through the reception glass: he pours out of a wall seam (`emerge`), tubes dying around him | he lives in the walls; the light dies where he is |
| 7 | Free periods | a moving hole in the light; dying tubes are the tell |
| 8 | Ch5 Room 205, pats Danny | the taken are kept and *cherished* — alive, savable |
| 9 | Ch5 long-hall reset, breath at the neck | breaking rules summons him |
| 10 | Ch5 False Leah's shadow (and the mound in the compact) | the mimic is him |
| 11 | Ch5 longhall gallery: portrait chair empty | environmental |
| 12 | Ch6 gym | light no longer hides him; full body; speed |
| 13 | Ch6 locker | the mouth opens too far on "Theresa?" — the face is a mask |
| 14 | Ch7 lectern | his own name heads the roll: "HALLOWELL, CYRUS — FIRST PUPIL" (seeds expulsion) |
| 15a | Ch8 true path | the hand on the desk again (callback to #2); at the stage edge his eyes blink in sync |
| 15b | Ch8 other paths | "WHO IS OUT OF THEIR SEAT" — full face, fury |
**Portrait rule:** no Colonel VN bust before the gym (his lines before that use `say('voice')` styling / `???`). After
the gym, a bust in at most 3 beats: Ch7 lectern "Theresa Dolan?", Ch8 "Put down the pen.", the stage-edge dissolve.

---

## 6. Story structure (chapters, beats, maps, gates)

Chapter cards: `PROLOGUE — Kettle Run`, `I — After Hours`, `II — First Period`, `III — Custodial`, `IV — Attendance`,
`V — Upstairs`, `VI — Passing Time`, `VII — Assembly`, `VIII — The Register`, `EPILOGUE`. Budgets (median minutes,
spoken lines): Pro 6/30 · Ch1 9/35 · Ch2 6/30 · Ch3 11/30 · Ch4 8/25 · Ch5 18/70 · Ch6 11/35 · Ch7 9/35 · Ch8 11/40 ·
Epilogue 3/15 → ≈ 92 min, ≈ 400 lines + ~120 examine texts. Script ids and owners: CONTENT.md.

### PROLOGUE — *Kettle Run* (exterior)
1. Black. "Kettle Run, Pennsylvania. October 18, 1996." Rain, idling engine, wipers.
2. **Car scene** (CG `car_interior`): the radio plays something normal; Danny switches it off — "Mood lighting." Danny's
   legend (the Nine, Uncle Frank's gold sword, "Hollow Hell"), Leah's camcorder intro (full names; "Never call me
   Theresa on tape"), Marcus quiet, looking at the school; Danny's bad joke; "Kovaches don't leave Kettle Run. We just
   get buried in it." Leah hands Tess the tape: "For the drive." Tess: "Pittsburgh's not till Thanksgiving." Leah: "So
   you'll have it." Tess's private thought about the folded form in her bag. Engine off → 2 s silence → rain louder.
3. **Exterior** (party of 4): rain; steam from cracks; `DANGER — UNDERGROUND MINE FIRE`; the dead oak covered in cicada
   shells (Leah: "Brood Two. They came up in May. Seventeen years underground."); flagpole rope clanking; the sign with
   letters missing; **NEMO RELINQUATUR** (Leah translates; Danny: "Aw. That's sweet. Creepy, but sweet."). Uncle Frank #1
   at the doors (the gold sword).
4. Front doors chained → Danny's bolt cutters (scripted). In. Checkpoint.

### I — *After Hours* (lobby, west1) — objective "Look around."
1. **Vestibule:** trophy case — for one frame **Adair** stands behind Tess in the glass.
2. **Lobby:** the portrait (seated) — Danny: "He ate the Civil War." Leah: "Technically the mine was Pleasants's idea."
   **Leah reads the plaque aloud:** "'Founder's Day, October nineteenth, first kept in 1894, in memory of the boys of
   the Hallowell Breaker.' He made the day they died a holiday. Cool. Normal." (Notes: "Founder's Day — Oct 19, first
   kept 1894.") Memorial board: Marcus lingers at Denise. Leah sets the camcorder on the bench for a **group shot**:
   "Everybody say Hollow Hell." (Danny does bunny ears — this becomes VHS frame 0.) Danny drops his backpack by the bench.
   East doors jammed; auditorium doors chained. Vestibule exit refused (Leah: "We've been here four minutes. Danny'll
   never let us live it down.").
3. **West hall** (north side west→east: 103 · bulletin board · 102 · 101 · girls' RR · lobby). **101** kindergarten:
   Danny wedges into a tiny chair — "Dolan. Dolan. I'm stuck." "You're not stuck." "I'm a little stuck. I'm the guy who
   gets stuck. That's my whole thing." (`ch1_danny_stuck`); Uncle Frank #2 ("cubbies were the best part of his
   education"). Leah narrates one line per room into the camera. 102 desks scattered. Main office locked; through the
   reception window a single **red light** on the PA console. Girls' RR mirror grimy. Library doors stuck from inside.
   Collapsed west stairwell. Every examinable in Ch1 has banter for everyone present (≥ 14 examinables).
4. **Danny breaks R3** (trigger near the bulletin board; cond: `ch1_rooms_entered ≥ 2`, or ≥ 1 and > 90 s in west1):
   Danny jogging backward ahead of the group, flashlight under his chin. Marcus: "Quit running, man. Floor's rotten."
   Danny: "I'm *jogging*. Backwards. It's different." — "So Uncle Frank, right, four Yuenglings deep at the Legion,
   grabs my arm, goes, Danny. *Danny.* They buried him with the sword. And whoever finds it gets to—" For one frame in
   Tess's beam, far down the hall: a small figure with an **orange belt**. The breathy pre-whistle. Tess's Maglite
   flickers and dies (1.6 s); darkness to ~0.98; the only light is **Danny's red-handled flashlight cone** — it jerks up
   to the ceiling, swings once, drops, spins across the floor (`flashlight_roll`). **3 s of total silence.** Tess's light
   returns: Danny is gone; his flashlight rocks to a stop at her feet, beam pointed at her. Leah (whisper): "Danny.
   {p} Not funny." Beat. "I'm *recording*, Danny." Tess (think): "He was right there. He was mid-sentence. He's never
   not mid-sentence." Tess takes the flashlight (item; usable weak light that never dies).
5. From Room 102: Danny's voice — "Guys? ...Theresa? In here." (INTERCOM styling, name "Danny?") Leah: "*Theresa?* He
   never calls you that." Room 102: **desks now in perfect rows**; chalkboard in fresh chalk `DANIEL KOVACH — PRESENT`.
   Marcus: "Danny can't spell 'present.'" Objective "Get out. Get help." Tess takes the **bolt cutters** from Danny's
   backpack on the way ("He'll want these back.").
6. Lobby → vestibule → front doors → a **scripted 2-tile walk** out of the library doors at the far west end of the west
   hall (seamless). Tess: "That's the stairwell. The collapsed one." Leah films: "We walked in a straight line." Marcus:
   "Yeah." The library doors stay jammed.
7. Intercom crackle. Chapter ends.

### II — *First Period* (west1)
1. Chime. The voice: "Good evening, students. You will proceed to your homerooms. Attendance will now be taken." The
   other west1 doors **slam** one by one; only **103** (nearest) stays open. Marcus (first time he's ever raised his
   voice): "Get in a room. Sit down. Now." The bell waits until Tess sits (any 103 desk snaps to `desk_103_tess`).
2. **The heads-down scene:** "Hold [confirm] — keep your head down." The `heads_down` overlay tightens while held. If
   released, Tess's eyes open: the overlay widens on the coat inches away and the hand sliding toward her face; she
   squeezes shut again automatically (no death in a tutorial). Fragments under fluorescent flicker: navy coat hem,
   sash fringe, split boots. **CG `colonel_hand`**: the ringed hand rests on her desk beside her face. A long breath.
   The click of Leah's record button. The hand lifts. A soft wet sound; a chair scrapes. Silence (~4 s). Dismissal
   bell. Lights die.
3. Leah's desk is empty; Tess takes the **camcorder** (scripted give), red LED still on. **VHS playback** (`vhs` screen,
   scrubbable): frame 0 the lobby group shot (warmth), then Tess & Marcus heads-down; Leah's whispered narration:
   "This is Leah Brandt for STATIC. Ten forty-one. For the record— it's real. T, don't look up—"; a dark mass; a hand
   settling on her shoulder; tilt, static; **the Colonel's small serene face filling the lens** (`stinger_hard` #1);
   blue screen `▶ PLAY`. Choice [Rewind it.] / [Don't.] — rewind lets the player step frames and hold on the face.
   Tess: "That's him. The portrait." (`colonel_named`). Leah's voice on the tape earlier: "Where's the hour?" (time skip).
4. Marcus (≤ 8 lines): "She moved. {p} That's all she did. She lifted the camera." Tess: "So we don't move." "We don't
   move." Then only: "My aunt was one of them. Denise." Objective: "The main office. The intercom." Marcus: "Janitor
   would've had keys." The lobby's east doors now hang open. Checkpoint.

### III — *Custodial* (lobby, east1, basement; party Marcus)
1. **East hall:** cafeteria (1979 banner `GO COLLIERS! HOMECOMING '79`), kitchen (warm walk-in freezer full of cicada
   shells; mixer; **dumbwaiter**: "Theresa... it's so dark down here..." in Danny's voice — Marcus: "That's not him."),
   boys' RR, Room 104 (optional; chalkboard "MR. H SAYS HI"), **gym doors jammed** (bleachers fallen inside), **east
   stairwell**: up = padlocked accordion gate, down = basement.
2. **Basement** (checkpoint at the bottom of the stairs): dripping, steam hissing, puddles, dead caged bulbs. The boiler is
   **lit**. Impossible. The **coal bin** (SW): a heap and, in it, **something enormous half-buried, breathing very
   slowly** (examine: "Old gym mats? {p} ...It's breathing."). Ambience ducks near it — only breath and drips. Marcus
   whispers: "Walk. Don't run." **Stir rule:** walking never stirs. Running / doors / bolt cutters / dropped items
   within 8 tiles add stir (decays after 20 s): stir 1 → coal slides, breath quickens; stir 2 → it **rises** and chases;
   escapable by fleeing up the stairs (he doesn't follow; the heap re-settles). The breaker panel's CLUNK sets stir to 1
   (only if 0) — Tess: "...Okay. No more noise. Not one more."
3. **Janitor's office** (≥ 10 tiles from the heap; padlocked hasp; spare key on the ledge above the door — examine the
   doorframe; Marcus hints after 40 s; bolt cutters also work but are loud): Walt's cot, radio, calendar **OCTOBER
   1979** with the 19th circled (Marcus: "That's the day."), **Walt's log** (auto-opens; teaches R1, R2, R3, R5, pencil/
   ink, the coal chute), a pegboard of labeled hooks — mostly empty — and the **janitor's key ring** (`OFFICE`, `2F
   GATE`), a battery in the desk. Checkpoint. Storage (battery), electrical (panel) optional.
4. **Guided period** as they come up: crackle, chime; Marcus: "Cafeteria. Go." He hurries in and sits at a bench; Tess
   follows. Peek: a shadow crosses the door window. Dismissal. Back downstairs later the heap is a **body-shaped hollow**.
   The stair gate refuses until roll #1 (Marcus: "Not up. We don't even know where they are." Tess: "The intercom.").

### IV — *Attendance* (west1 office suite, lobby)
1. **Main office** (OFFICE key): reception — **sign-out sheet** Oct 19 1979 (Marcus reads: "Denise Webb. Dentist. Signed
   I. Webb." {p} "That's Grandma's handwriting." {p=1} "Time out's blank." — he shows Tess the photo here), mailboxes
   (Adair's: "Gerald, cancel the assembly. I am begging you. —R."), lost & found (battery). **Nurse:** jar `BROOD II —
   1979 — MR. LUTZ`, newspaper clipping ("...witnesses say several students rose in the dark to help younger children
   toward the exits."). **Haupt's office:** small portrait of the Colonel, filing cabinet (discipline slips "reported by
   K. Hoyt"). Through the reception glass, at the far end of the hall: Kevin, for a moment; gone on a second look.
2. **PA room** (UI `pa`, 16 switches): LISTEN to rooms — 205 Danny muttering "...i will not leave..."; LIB soft crying,
   "...T?"; AUD crowd murmur, old applause, a band tuning; GYM slow wet breathing; 101 small voices singing the alma
   mater; BSMT boiler roar; OFFICE your own breathing; others static. Checkpoint before ALL CALL.
3. **ALL CALL** fires after the 3rd LISTEN, 45 s at the console, or on closing it. **Roll call #1**: "Daniel Kovach."
   (faint) "...present." — the **205 lamp** lights. "Leah Brandt." (crying) "...present." — the **LIB lamp** lights.
   "Marcus Webb." Marcus stares, silent. "Marcus Webb." Marcus to Tess: "Don't." "**Theresa Dolan?**" → [Here.] /
   [(Say nothing.)]. Here → "Thank you, Theresa." Silence → "Theresa Dolan... absent." *(pen)* "Absences will be made
   up." Notes: "Danny — 205? Leah — library?" Checkpoint.
4. Standard warning → scripted period. Marcus: "Sit. Anywhere." Any seat in the suite works. **Through the reception
   glass, the Colonel pours out of a wall seam** (`emerge`), tubes dying around him; he comes down the hall, the door
   opens, the coat fills the doorway, "hm?"; he leans over the counter; leaves.
5. Marcus: "Danny's upstairs. Two-oh-five." Objective. Checkpoint.

### V — *Upstairs* (east1, east2, longhall, west2, library)
1. **205** (English; *Our Town* posters): **Danny** at a desk writing `I WILL NOT LEAVE` over and over, pale. Real Danny
   flickers through: "It wrote my name, Dolan. In a big book. Under the school." "He smells like pennies. And, like,
   Christmas ham." "I can't get up, Dolan. I tried. My legs are, like... enrolled." "I'm the guy who gets stuck. That's
   my whole thing." → **BOND (Danny):** [I'm coming back for you. Promise.] / [Hang in there. You're gonna be fine.] /
   [I'm sorry, Danny.] Promise → "You can't promise that." "Watch me." — his pencil stops mid-word: `I WILL NOT LEA`.
   Otherwise he keeps writing. Checkpoint.
2. **Scripted period in 205** (Tess auto-sits; no fail): he steps in and drags along a row under strobing tubes, **pats
   Danny's head**: "Good boy. I knew your grandfather's name." Pauses beside Tess (close pass). Leaves. Checkpoint.
3. **206** (biology): Lutz's BROOD II board (doc), specimen jars, the wooden **HALL PASS — RM 206** on a hook, a battery.
   **207** computer lab: terminals glow only during periods → `ROLLCALL.BAS` (optional; a readout of Register status and a
   Charter pointer; battery in the printer tray). Free periods now run on east2/west2.
4. **The long hall** (entry gated on `ch5_danny_found`). Archway sign: `HALL PASS REQUIRED BEYOND THIS POINT — BY ORDER OF
   THE PRINCIPAL`. The gallery: a railing over the dark lobby; across the void the portrait — **the carved chair is empty**.
   Far end: **Kevin**. Without the pass the hall loops (doors repeat 201/202, painted on; ambience layers strip away one
   per loop; the clocks gain a minute per loop; loop 1 "That's the same door." loop 2 "He's wearing a Safety Patrol belt.
   Those kids checked passes." loop 3 Marcus: "There was a pass on a hook in 206." loop 4 a voice behind a painted door:
   "Theresa? Is that you? Open the door." (Leah's voice). Walking east always exits normally. Running → whistle →
   blackout → reset, breath at the neck. **With the pass:** Kevin holds out his hand — "...pass." Tess hands it over; he
   **keeps it** — "...one pass." The hall snaps to normal length *in front of* Tess but stays long *behind* her: Marcus
   tiny at the far end, Kevin's hand raised between them. Marcus (calling): "One student. Right. {p} Go. I'll go around —
   east stairs. Find Leah." Tess: "He kept it. Of course he kept it." Checkpoint. **Tess is alone.**
5. **West2** — the **girls' restroom** is the first door past the long hall, beside the mezzanine door (ajar, a faucet
   running): **the Reflection.** Tess sees herself — and a woman behind her. Turns: nobody. Looks back: **Adair** fogs
   `DON'T ANSWER HIM` (if roll #1 answered: `YOU ANSWERED. DON'T AGAIN.`) and points at Tess's bag → her mom's
   **compact**. Tutorial: [Q] → the room as it was Oct 19, 1979. `adair_met`, `compact_unlocked`. Checkpoint.
6. **The compact lull** (apparent safety + a new toy): 202 history (OUR PROUD HERITAGE; the Charter excerpt hangs in the
   corridor outside with a brass placard: "Complete instrument on display — Kettle Run Historical Collection, School
   Library."), 203/204 chemistry (compact shows the 1979 board: "FOUNDER'S DAY — NO CLASSES AFTER 1:30 — ASSEMBLY 1:45";
   battery).
7. **201 — THE FALSE LEAH** (spawns only after `adair_met`; checkpoint at the threshold). Leah sits with her back to the
   door, perfectly calm, the **camcorder in her lap with the red LED on** (Tess, think: "That's in my bag. That's in my
   *bag*."). She calls Tess **"Theresa."** "I got out of the library, Theresa. I came to find you." In the flashlight, her
   **shadow on the wall is enormous and corpulent**. Through the compact: the chair is empty in 1979, and in the far
   corner sits the mound. Options: [Ask about the tape] → "For the drive, silly. Pittsburgh. Thanksgiving." (Tess's own
   misreading — the fake is made of what Tess believes.) / [Sit down] → caught (slip: PRESENT) / [Back out slowly] → her
   head turns too far (`stinger_hard` #2); Tess backs out and **holds the door shut** (hold confirm; first release → the
   door opens an inch and a huge hand curls around the edge — grip again; second release = caught). Silence. Reopened,
   the room is empty.
8. **Library** (mezzanine door, locked until `compact_unlocked` — "Locked. Behind me, a faucet is running."): stacks →
   spiral stair down → **Leah**, real, at a reading table under a green lamp, writing her own name on checkout cards.
   Leah (not looking up): "There's no due date. Every card. Nobody ever has to bring anything back." / "My sister's like
   that. You check out, they stamp you, you just... keep going. Nobody calls." / "Where were you gonna go, T? After."
   → **BOND (Leah):** [Philly. Mom took a job. We leave at Christmas.] / [Let's talk about it when we're out.] / [Nowhere.
   I'm right here.] Truth → Leah: "I know." Beat. "Since August. Your mom told my mom. In the Acme. By the *lunchmeat*,
   T." / "I kept waiting. I made the tape in August." Tess: "I thought you meant Pittsburgh." Leah: "I know what you
   thought." — she closes the yearbook. Then the clue (her source: a 1949 *Pennsylvania School Code* checkout card
   "ADAIR, R. — DUE OCT 26 1979", withdrawals section dog-eared): "Adair checked out the School Code. Withdrawals. You can
   *withdraw* people. Like a transfer." Beat. "Like you." Deferral → "Sure. Later. You're good at later." and, cold:
   "WITHDRAWN. It's what they'll stamp on you too." Lie → she goes back to writing her name. Either way: "My hand won't
   stop, T. {p} Go. Come back." Checkpoint. (`adair_named` here.)
9. **Optional (true-ending key):** the locked display case. Compact → Mrs. Ostrowski at the card catalog; drawer `HA–HE`
   → small brass key → case → **the Founder's Charter** (item `charter`, doc). Without the past view: "Hundreds of
   drawers. I'd need to know which one."
10. **Marcus knocks** on the barricaded 1F library doors: "Tess? It's Marcus." Tess: "Say my name." "...Tess." She unbars
    the doors (shortcut). Objective: "Haupt's office. The safe." Checkpoint.

### VI — *Passing Time* (west1, lobby, gym; party Marcus until taken)
1. **Haupt's office:** the compact (1979) shows the small portrait **swung open on hinges** with a wall safe behind it
   (fallback if the compact was somehow skipped: Adair appears in the office window and runs the compact tutorial). Haupt's
   label: **FIRST FOUNDER'S DAY (mo-day-yr)** → **10-19-94** (lobby plaque, read aloud by Leah in Ch1; Notes). Wrong
   tries: 10-19-23 "That's when the school opened. Founder's Day is older than the school." 10-19-11 "That's when he died.
   It started before that." 79/96 "No. Not *that* day." 3rd wrong: "First Founder's Day. The plaque had the year."
2. **Inside:** the WITHDRAWN **stamp + ink pad**, the **auditorium key**, **Haupt's letter** (confession; endowment clause;
   Ivy at 1:20 and Denise's shoes; "I took them back from her in the wings"; "Ruth said the Charter was the key to him —
   she went to the library first, for it. Edna kept it under glass."; "No one ever revoked my authority to withdraw a
   pupil. Use it."). Stamp *thunk*. **The intercom crackles. For the first time the Colonel speaks to Tess outside a roll
   call**, quietly: "Theresa. {p=1.2} Those belong to the principal." {p} "Put them back." Tess pockets them: "No." The goal
   flips from escape to rescue. Tess, at the label: "Founder's Day. The day the boys burned. He made it a holiday."
   Checkpoint.
3. **The breather** (lobby): Danny's backpack by the bench → [Sit]. Marcus pulls out Danny's Butterscotch Krimpets. Tess:
   "He'd kill us." Marcus: "He'd want us to." Beat. Marcus: "You've been weird since August." → [Tell him about Philly] /
   [It's nothing.] (flavor; told → "Philly's not that far." "It's two hours." "Like I said."). Tess (if she told Leah or
   Marcus, think): "I was gonna let homeroom find out from the attendance sheet. Just gone, and a chalkboard says why.
   Like *him*." Marcus hums the alma mater — stops — the tune goes on without him, on a clarinet, from the east. Marcus:
   "That's not me." The gym doors stand open. Periods are off; Marcus walks ahead, waiting at each exit. Checkpoint at the
   gym doors.
4. **GYM:** dark, huge, rain drumming on the roof. A dark heap under the far hoop (examine: "Gym mats. {p} ...Just gym
   mats."). **Denise** on the bleachers, faintly glowing, playing. Marcus walks to her. [Marcus, wait—] / [Grab his arm.].
   Denise: "**Marcus Webb.**" (smile) "Look at you. You got my eyes. Mama always said." Marcus: "...She still says it."
   "Is she still setting my plate?" "Every Thanksgiving." "Then sit with me. Just till the song's done." — **Four light banks
   bang on near→far, 0.45 s apart**, the last lighting the hoop: **him**, seated on the floor, facing them, there the whole
   time (`stinger_hard` #3 on the last bank; the roof rain cuts out for 2 s). He **rises** — slowly (~2 s), bigger than the
   player has ever seen him (`ch6_gym_lights`: the light no longer dies around him). His first lunge covers half the court.
   Marcus: "TESS. RUN."
5. **Chase** to the girls' locker room (route breaks his line of sight); **hide in a locker** (prompt; the only locker that
   works). Checkpoint inside the locker.
6. **THE LOCKER** (overlay `locker`): through the slits — navy wool, a brass button sunk in a fold, the sash, pale flesh, a
   ringed hand **tapping the lockers one by one**, closer. Heartbeat only once the face enters. His **small face slides into
   the slit**; the mouth opens too far, vertically (`stinger_hard` #4): "**Theresa?**" = **Roll call #2** → [Here.] /
   [Hold your breath.] (breath screen 6 s; first early release = a gasp → he taps again and asks again, choice re-offered;
   second = caught). Here → "Thank you, Theresa." and he leaves. Breath → a long wait; he moves on.
7. Tess emerges. Marcus is gone. Tess kneels and takes **his photo of Denise** (scripted give). Showers: every mirror holds
   Adair, pointing down; fog by count: 0 `NOT GONE. KEPT.` · 1 `NOT GONE. KEPT. NOT AGAIN.` · ≥2 `YOU'RE IN INK.` (if no
   Charter, the last mirror adds `THE CHARTER. LIBRARY.`). Tess: "The lights didn't go out. They always go out around him."
8. **Alone** (no drone; rain and a clock tick; then the phonograph alma mater on the intercom). Portrait exhausted →
   devastated. Short monologue. Tess thinks: "The coal chute. Danny's bolt cutters. {p} I could just go home."
   `truant_available`. Objective: "The auditorium." Checkpoint. On the east-hall walk back, Kevin stands at the far end.
9. **Optional TRUANT** (window: `truant_available && !ch7_assembly`): the empty coal bin; the chute grate + bolt cutters →
   "Coal goes in this way. Nobody ever made a rule about coal going out." → [Climb out.] → **TRUANT** / [Not without them.]

### VII — *Assembly* (lobby, aud; alone)
1. Lobby (trigger, cond `ch6_marcus_taken`) → `ch7.start`. Intercom: "All students will report to the auditorium for the
   Founder's Day Assembly." The memorial board now has **Polaroids** of Danny, Leah and Marcus labeled "1996" (label in
   pencil if bonded, ink if not) — and a frame labeled `THERESA DOLAN` (0 answers: empty · 1: a faint pencil sketch of Tess
   at a desk · ≥2: a developed Polaroid of her at a desk). **Mom's voice** over the intercom: "Theresa." {p} "Theresa Marie
   Dolan. You answer me when I call you." Tess: "...She only does the middle name when it's bad." {p=1.2} "She's on nights
   at Pottsville. She doesn't know I'm here." {p} "Nice try." (no choice, no fail). Checkpoint.
2. **The Assembly:** seats filled with **husks** (1928–1979) facing the stage; one spotlight; the Colonel at the lectern
   reading names from a long roll; husks whisper "present". The roll's first line, which he reads every cycle:
   "Hallowell, Cyrus. First pupil." — "Present." (seeds expulsion). **Front row: Danny, Leah, Marcus** (entranced), Marcus
   holding the hand of **Denise's husk** (the same one from the gym). An empty seat beside each friend.
3. **Stealth (R2):** READ 7–9 s (move, walking) → telegraph **2.0 s** (page turn, "Hm." at −1.0 s, spotlight drifts) → SCAN
   3 s (4.5 s after a silent roll #3; running anywhere = immediate scan). In assembly mode sitting is safe instantly. An
   empty seat within 2 tiles of every aisle tile. An upstage **crossover** behind the backdrop links the west wing (music
   room) and the east wing (trap room) — walk only.
4. **Roll call #3** fires the first time Tess *sits* in rows 1–4: "**Theresa Dolan?**" (his bust, light `under`) →
   [Here.] / [(Say nothing.)]. Checkpoint.
5. **Front row** (sit in the empty seat beside a friend; cutscene pauses the cycle): Danny and Leah, entranced, reflect bond
   state (unbonded friends slip into the school's naming: "Sit down, Theresa— ...T. Sorry. It keeps doing that.").
   **Marcus:** "She's so cold, Tess. Her hand's so cold." Without the diary page: [She's gone, Marcus.] → "You don't know
   that." (he doesn't look at her) "You're leaving too. Everybody says it like it's nothing."
6. **Music room** (west wing): Adair's room — sheet music *Hallowell Alma Mater (arr. R. Adair)*, phonograph, **Denise's
   clarinet case** → **diary page**: "If anything happens tell Mama I wasn't scared. I'm not scared of him. Tell her to stop
   setting my plate." Adair in the mirror points east; fog `FINISH IT` (or, without the Charter: `HE IS ON THE ROLL. THE
   CHARTER. LIBRARY.`); battery. Checkpoint.
7. Back to Marcus with the page (Tess thinks: "Marcus needs to read this.") → **BOND (Marcus):** he reads; long pause. "She
   puts the good fork out. Every year." / "I never met her, Tess. I came here to meet her." / (lets go of the husk's hand)
   "Okay. Okay, Aunt Denise."
8. **Trap room** (east wing): lever → trapdoor. If no Charter, a one-time choice: "Adair said the Charter. {p} If I go down
   there, I'm not coming back up for it." [Go down.] / [Go back for it.] (A stage door from the trap room to the lobby's NE
   corner makes the return trip skip the house.) **The trapdoor is the point of no return.** Checkpoint.

### VIII — *The Register* (vault, breaker; then aud, lobby, exterior)
1. **Under the stage — the last roll.** Through the floorboards, faint, the Assembly's roll reaches 1996: "Daniel
   Kovach?" — bonded: a long silence, then a whisper: "...Dolan said she's coming back." / unbonded: "...present." "Leah
   Brandt?" — bonded: "...She said Philly. She actually said it." / unbonded: "...present." "Marcus Webb?" — bonded: "I'm
   just visiting." / unbonded: "...present." **This is where friends' names become pencil or ink** — the Register will
   match what the player just heard. Stage flats from past assemblies (`HOMECOMING 1945`, `1962`).
2. The iron spiral goes deeper than the basement — footsteps change brick → stone → coal; warmth rises; no music.
3. **The Founder's Vault:** the sarcophagus **split open from inside** — its cavity far too big for a man; wreaths, the
   regimental flag, name walls 1894–1979 (1911: `HALLOWELL, CYRUS — ENROLLED`). **Adair's husk** kneels at a writing desk
   with a **red pen** (item). Her **last note**: "The book isn't here. It's further down. I can hear the breaker. My light's
   gone." / "A withdrawal needs a forwarding address — something of theirs the school didn't take, proof they belong
   somewhere else. Lay it on the line and stamp it." / "He wrote that he'd be the last to leave. So he can't be made to go
   while a child is still on the roll. Get them out first. Then he's the last." / "He enrolled himself. He's on the roll
   like anyone — so he can be expelled like anyone. The Charter is the proof." The passage onward requires the red pen.
   Checkpoint.
4. **THE BREAKER.** The school bell sounds from below, pitched down two octaves with steam: a shift whistle. A vast black
   wooden breaker in a cavern lit red from below; chutes; along the picking benches **seventeen small husks with cap-lamps
   that light one by one ahead of Tess as she climbs** (the dead lighting her way — apparent safety). Realization in four
   fragments, no more: "The bells. That's the whistle." / "Roll call's the payroll." / "Hall pass. Brass check." / "...It
   never stopped running." Docs at the top: the 1894 inquiry ("The door was barred, sir. Mr. H's order: none leaves the
   benches before the whistle." / "You showed your brass check to go to the privy."), the Colonel's ledger (the locusts).
   Checkpoint at the weigh-master's office.
5. **THE REGISTER** (screen `register`, §8). Theater: the faint roll continues above through the stone; each withdrawal
   plays that friend's real voice far above ("...Dolan?" / "T?" / "Tess?") and the name lifts off the page like pencil dust.
   Expulsion is a performed act: grounds → hold to write → at ~70% the **ringed hand slides onto the desk beside the book**
   (CG `colonel_hand`, light `red` — the exact composition of Ch2): "Theresa. {p} Put down the pen." Releasing only pauses;
   no death. On finishing, `EXPELLED`; the hand goes slack and withdraws.
6. **Consequences** (resolved at Close the Book; checkpoint immediately after):
   - **Expelled → DISMISSED.** The dismissal bell rings everywhere, on and on. No chase. Climbing back, the breaker boys'
     lamps go out one by one, peacefully. In the auditorium the Colonel sits on the stage edge (bust, `confused`), his eyes
     blinking in sync for the first time: "Theresa. {p} ...The bell." / "I was to be the last to leave." Tess: "You are."
     He comes apart into coal dust and wet wool; **his empty uniform is the last thing left behind**. Husks crumble into
     slow amber motes; Denise's husk turns toward Marcus and is gone. The front doors swing open by themselves on the bell's
     last ring. At the trophy case Adair smiles in the glass and fogs `GO HOME, TESS`.
   - **Tess free, not expelled → WITHDRAWN.** "WHO IS OUT OF THEIR SEAT." (`stinger_hard` #5; full face, fury). He pours down
     the breaker's chutes behind her. **Escape chase**: breaker stairs → vault → spiral → under-stage → auditorium (freed
     friends wake and run with her; unfreed friends stay seated — "Leah. Leah, get up." "Class is starting, T.") → lobby →
     front doors, now open to gray dawn. Per-map checkpoints. Caught → retry at the last checkpoint.
   - **Tess not free, ≥ 1 friend freed → PRESENT (with escape).** The chase plays but cannot catch. At the vestibule the
     friends cross into dawn; Tess's input locks; the intercom: "Theresa." She turns. The doors close. → Room 102.
   - **Tess not free, no friend freed → PRESENT (direct).** The book closes. The dismissal bell rings once. "Thank you,
     Theresa." Her hand sets the pen down on its own. → Room 102.

### EPILOGUES (text cards + in-engine dawn + CGs)
Ending cards in the style of attendance codes: `DISMISSED`, `WITHDRAWN`, `PRESENT`, `TRUANT`.
- **DISMISSED:** dawn steps (CG `ending_dawn`, all four; `uniform` visible through the open doors). Leah: "You gonna tell
  them, or am I?" Tess: "I'm moving. To Philly. After Christmas." Danny: "...Philly. Dolan. They booed *Santa*." Leah: "Took
  you long enough." Danny: "Wait. *You* knew?" Leah: "Since August." Danny: "Since AUGUST?" Marcus (quietly): "You'll call."
  Tess: "I'll call." Leah: "Side B's better. For the record." → car CG at dawn, Leah pushes in the tape: "Side A. Track one."
  (`ending_true`). If the form went unused, Tess looks at Mom's signature: "Monday." Card: "In 1997, Hallowell Consolidated
  School was demolished. Nothing was found beneath it. In the spring of 2013, the cicadas came back. Nobody went missing."
- **WITHDRAWN:** dawn steps with the saved friends (the confession scene if ≥ 1 friend saved, trimmed to who's present);
  Tess carries out the keepsakes of the friends she couldn't free — the things left behind (Danny unfreed: his red
  flashlight finally dies on the steps; Leah unfreed: Tess alone in the wagon, the camcorder on the passenger seat, red LED
  on; she pushes in the tape). Modular per-friend cards: Danny saved "Danny Kovach enlisted in 1998. His postcards say one
  thing: STILL NOT STUCK." / lost "Daniel Kovach was listed as a runaway. His uncle Frank still says he went looking for the
  sword." · Leah saved "STATIC #9: HOLLOW HELL, A CORRECTION. Circulation: four." / lost "The last issue of STATIC was never
  printed." · Marcus saved "That Thanksgiving, Ivy Webb set the table for two." / lost "That Thanksgiving, Ivy Webb set two
  extra plates." Then the **2013 coda**.
- **PRESENT:** room tone only. Room 102 at dawn: Tess seated in the rows, hands folded; chalkboard `THERESA DOLAN —
  PRESENT` (CG `ending_present`). Last think: "Nobody gets left behind." Friends' cards for those freed. Coda 2013: Kaylee's
  flashlight crosses a husk in an oversized denim jacket in Room 102; the intercom, in a calm girl's voice: "Kaylee Ann
  Brooks?" Cut.
- **TRUANT:** Tess in Leah's wagon (keys in the visor). She doesn't drive. She plays the tape; dawn comes; the doors never
  open. Card: "Theresa Dolan handed in her transfer form on Monday. The secretary asked if she wanted to say goodbye to
  anyone. She said no." Coda: the 102 chalkboard: `DOLAN, THERESA — ABSENT` and below, fresh: `ABSENCES WILL BE MADE UP`.
- **2013 coda** (WITHDRAWN, PRESENT): "October 19, 2013." A phone flashlight on the front doors; a girl's voice: "Okay,
  we're live. This is Kaylee, and this is Hollow Hell." Cut to black.

---

## 7. Roll calls, bonds, pencil & ink (one rule)

**Pencil = enrolled, not yet kept. Ink = agreed to stay.**
- **Tess agrees by answering.** `rollAnswered` (0–3; roll calls #1 PA room, #2 locker, #3 Assembly). Her line: absent (0),
  **pencil** (1 — *the first answer is a warning*), **ink** (≥ 2 — *the second is permanent*). Walt's log teaches it ("Answer
  him once and he pencils you in. Answer twice, that's ink. DON'T ANSWER.").
- **Friends agree at the last roll** (Ch8 under-stage): a friend with a bond has a reason not to answer → pencil; without one
  → "present" → ink. Bonds: `bond_danny` (promise, Ch5), `bond_leah` (truth, Ch5), `bond_marcus` (diary page, Ch7).
- **Visible before the Register:** Walt's log; the 102 chalkboard; the Ch7 memorial Polaroid labels (pencil/ink) and Tess's
  frame; Tess's `enrolled` portrait (1 answer: an amber catchlight; ≥2: plus a faint husk sheen); Adair's fog lines;
  ROLLCALL.BAS statuses (PROVISIONAL / PERMANENT); unbonded friends slipping into the school's names.
- **Keepsakes** are forwarding addresses (Adair): Danny's flashlight, Leah's camcorder, Denise's photo (Marcus), Tess's house
  key. All are **given by script** on the critical path. The stamp uses the matching keepsake automatically.

## 8. The Register — exact rules

Page 1996 lists `KOVACH, DANIEL` · `BRANDT, LEAH` · `WEBB, MARCUS` · `DOLAN, THERESA` (only if `rollAnswered ≥ 1`). At the
top of every page in red: `HALLOWELL, CYRUS — FIRST PUPIL`.
```
ink(id) = id==='tess' ? (R>=2 ? 'ink' : 'pencil') : (bonds[id] ? 'pencil' : 'ink')
stamp(id)        ok iff listed(id) && ink(id)==='pencil' && !withdrawn(id)      (auto keepsake; Tess → house key)
form(id)         ok iff !formUsed && !withdrawn(id) && ink(id)==='ink'          (one use; Reason field written by Tess)
pen('founder')   ok iff has(red_pen) && has(charter) && every listed line withdrawn && grounds ∈ {R1, R2, R3}
resolveEnding(): truant → 'truant'; expelled → 'dismissed'; (R>=1 && !withdrawn.tess) → 'present'; else 'withdrawn'
```
- **Everything is provisional until Close the Book**, with [Start over] ("Okay. Think."). Selecting a tool + line previews
  Tess's prediction ("Danny's in pencil. The stamp'll take."). Refusals in voice: form on pencil — "Her name's only in
  pencil. The stamp'll take. I'm not wasting Mom's signature."; form on founder — "Transfer him where? Nobody would take
  him."; stamp on ink — "It beads up like water on wax. Real ink."; stamp on founder — "Red ink. Nothing takes on it."; pen
  before the roll is clear — "Not yet. Clear the roll first."; pen without Charter — "Expel him? On what grounds? ...The
  Charter. Adair said the Charter."
- **Transfer form Reason** (Tess writes): on Danny "Reason: he has somewhere to be." · on Leah "Reason: she was right. I should
  have said." · on Marcus "Reason: somebody's still setting a plate." · on herself "Reason: moving to Philadelphia. I'm sorry I
  didn't say." When Tess is in ink and uses the form on a friend: "That's my way out. {p} Use it on Leah?" [Yes]/[No].
- **Stamping lines:** Danny "He'll say I broke it. He's gonna want it back so he can say I broke it." · Leah "Leah Brandt, for
  STATIC. ...Still recording." · Marcus "Grandma Ivy's handwriting. Somebody's still waiting up. Not for Denise. For him." ·
  Tess "Dolan. Kettle Run. For now."
- **Expulsion:** GROUNDS prompt lists R1–R6 — valid: R2 "out of his seat" (the empty portrait chair; his own "Who is out of
  their seat?"), R1 "in the halls during the bell", R3 "running"; others: "He never did that. Not that I saw." Then hold to
  write (6 s): `HALLOWELL, CYRUS — EXPELLED — out of his seat. Reported by T. Dolan.` (the hand, §6 VIII.5).
- **Close** confirm lists what remains in Tess's voice ("Danny's still there. In ink.") → [Close it.] / [Not yet.].

QA matrix (R = rollAnswered, B = bonds, C = charter): R 0/1 → DISMISSED iff C && B ≥ 2 (form on the one ink friend) ·
R ≥ 2, form on self → WITHDRAWN with B saved, DISMISSED iff C && B = 3 · R ≥ 2, form on a friend → PRESENT with min(3, B+1)
saved. Cases: (0,3,C)→DISMISSED, form unused · (1,2,C)→DISMISSED · (2,2,C)→WITHDRAWN-2 or PRESENT-3 · (3,0,!C)→WITHDRAWN alone or
PRESENT-1 · (0,0,!C)→WITHDRAWN-1.

---

## 9. Puzzles, gates, checkpoints

### 9.1 Puzzles (all fair; solutions discoverable in-world)
| Puzzle | Where | Solution / source |
|---|---|---|
| Front doors chained | exterior | scripted: Danny's bolt cutters |
| Janitor's padlock | basement | spare key on the ledge above the door (Marcus hint 40 s); or bolt cutters (loud) |
| Main office | west1 | key ring `OFFICE` |
| Sleeping Colonel | basement | walk, don't run (R3) |
| PA console | west1 | LISTEN; the roll lights the 205 and LIB lamps |
| Long hall | longhall | the hall pass from 206 (R4); don't run |
| False Leah | west2 201 | tells: Theresa, the camcorder in Tess's bag, the shadow, the tape answer, the compact |
| Compact | anywhere | past view where a `past` rect exists (HUD sparkle) |
| Display case / Charter (opt.) | library | compact → card catalog `HA–HE` → key → case |
| Haupt's safe | west1 | compact shows the portrait-safe; `FIRST FOUNDER'S DAY` → 10-19-94 |
| ROLLCALL.BAS (opt.) | east2 207 | type surnames during a period |
| Assembly crossing | aud | move while he reads; sit when he scans |
| Marcus bond | aud | Denise's diary page from the clarinet case |
| The Register | breaker | §8 |

### 9.2 Gates (every lock is a condition with an in-voice refusal)
| Gate | Condition | Refusal |
|---|---|---|
| vestibule exit (Ch1) | `ch1_danny_vanished` | Leah: "We've been here four minutes. Danny'll never let us live it down." |
| e1 stair gate (up) | keyring && `roll1_done` | Marcus: "Not up. We don't even know where they are." Tess: "The intercom." |
| bolt cutters on the stair gate | never | "No shackle to cut. The lock's built into the gate." |
| longhall entry from east2 | `ch5_danny_found` | Marcus: "Two-oh-five first. He's right there, Tess." |
| library mezzanine door | `compact_unlocked` | "Locked. Behind me, a faucet is running." |
| Haupt's portrait / safe | chapter ≥ 6 | "Just a painting. He's watching the door." |
| auditorium doors | aud_key && `ch6_marcus_taken` | "Marcus went toward the gym. I'm not doing this without him." Bolt cutters: "Chain's off. Doors are still locked. Old keyhole." |
| gym exit after the locker | `denise_photo` (given by script) | — |
| coal chute | `truant_available && !ch7_assembly` + bolt cutters | before: Marcus "I'm not leaving." / alone "Not without them." / no cutters "Danny's uncle's bolt cutters would go through that." |
| vault → breaker | `red_pen` | "My light won't reach. Not without— no. Her pen." |

### 9.3 Checkpoints (`g.checkpoint`) — and every roll-call/bond choice is followed by one
Pro: doors cut · Ch1: start · Ch2: start, after the Marcus talk · Ch3: basement stairs bottom, after the keyring · Ch4: before
ALL CALL, after the roll #1 choice, chapter end · Ch5: after the Danny bond, after the 205 period, long hall start, after
the long hall, after `adair_met`, 201 threshold, after the Leah bond, after Marcus knocks · Ch6: after the safe, at the gym
doors, inside the locker (reload opens on the slit view, tapping phase 0.4), after `ch6.alone` · Ch7: lobby, after roll #3,
music room, before the trapdoor · Ch8: vault, weigh-master's office, **immediately after Close the Book**, each chase map.
Retry abbreviation: scripts set `seen_<scene>`; on reload a seen scene jumps to its decision point, and holding Cancel 0.75 s
fast-forwards seen dialogue (choices still stop). Game over → playable in < 2 s. After 2 deaths at the same checkpoint,
telegraphs and meters get 30% more time.

### 9.4 Game over — the disciplinary referral
A pink slip: `HALLOWELL CONSOLIDATED SCHOOL — DISCIPLINARY REFERRAL — Student: DOLAN, THERESA — Infraction: ____ —
Reported by: ____ — Disposition: DETAINED`. Reasons: `hall_after_bell` "In hall after bell (Rule 1)" · `out_of_seat` "Out
of seat during class (Rule 2)" · `running` "Running in the halls (Rule 3)", reported by "K. Hoyt, Safety Patrol" · `breath`
"Disrupting attendance" · `chase` "Leaving before dismissal (Rule 6)" · `woke` "Disturbing the Founder" · `present` (False
Leah) → the slip just says `PRESENT`.

### 9.5 Resources
Flashlight: 100 → 0 in **600 s** on; flicker under 20%; at 0% "dregs" (power 0.15, irregular dropouts, never black).
Batteries: one guaranteed per chapter in a critical room (Ch1 102 teacher's desk · Ch3 janitor's desk · Ch4 lost & found ·
Ch5 206 beside the pass · Ch6 Haupt's desk · Ch7 music room) + 4–5 optional. **Danny's flashlight** is a usable weak light that
never dies (power 0.35, narrow cone): "It's still on. It's been on this whole time." Flashlight ON during a period = seen at
10 tiles; OFF = 7.

---

## 10. Items (ids are contracts; see `src/data/items.js`)
`flashlight` · `sketchbook` · `compact` · `transfer_form` · `mixtape` · `gum` · `house_key` · `danny_flashlight` (usable) ·
`bolt_cutters` · `camcorder` (examine = tape playback; after each chapter one new clip appears — optional) · `keyring` ·
`hall_pass` (taken by Kevin) · `withdrawn_stamp` · `aud_key` · `case_key` · `charter` · `denise_photo` · `diary_page` ·
`red_pen` · `battery`.
**Mixtape J-card (Leah's hand), side A:** Mazzy Star "Fade Into You" · Fiona Apple "Shadowboxer" · The Cranberries "Linger" ·
Weezer "Say It Ain't So" · Garbage "Stupid Girl" · Björk "Hyperballad". Side B: Liz Phair "Never Said" · Pavement "Gold Soundz" ·
Belly "Feed the Tree" · Tori Amos "Winter" · Smashing Pumpkins "1979" "(sorry. had to.)" — titles only, never lyrics.

## 11. Documents (original prose; ≤ 120 words each, Haupt's letter / Adair's note / full Charter ≤ 200)
| Doc | Content contract |
|---|---|
| `walt_log` | 7 entries: 1958 hired, "the boiler runs and I never fed it" · Oct 1962 "Bell went at 2:10. Nobody rang it." / "Joey ran. He was always running." · Nov 1962 "He can't touch a kid sitting still in a room. I seen him stand over one an hour." · 1963 "It calls roll. Answer him once he pencils you in. Twice, that's ink. DON'T ANSWER." · 1965 "Coal chute. Kids aren't supposed to use it, so there's no rule about it. Got the Mrazek boy out that way in '62. Locked it after." · 1971 "Hall passes. The Hoyt kid's got a book of slips." · Sept 1979 "Told Miss Adair. Told the Webb girl to sit down when the bell goes." · Oct 20 1979 "I went in Saturday. They're in the seats. All nine. Like the shells on the oak." |
| `plaque` | "HALLOWELL CONSOLIDATED SCHOOL · Erected upon the site of the Hallowell Breaker · FOUNDER'S DAY, OCTOBER 19, first kept in 1894 by Col. Cyrus Hallowell in memory of the Hallowell Breaker and his boys · Dedicated October 19, 1923 · NEMO RELINQUATUR" |
| `charter_excerpt` | the harmless half + placard pointing to the library collection |
| `charter_full` | first-pupil clause, last-to-leave clause, endowment clause (Assembly + presenting the roll) |
| `haupt_letter` | §6 VI.2 content |
| `adair_note` | §6 VIII.3 content |
| `inquiry_1894` | testimony: barred door, "none leaves the benches before the whistle", the brass check |
| `ledger_colonel` | the locust entry; "my boys"; payroll |
| `brood` | Lutz's board: periodical cicadas, Brood II emergence years table (1945 1962 1979 1996), exuviae ("the shells they leave behind"); his aside "every one a Founder's Day year? —L." |
| others | bell schedule, memorial, signout, adair_mailbox, clipping (incl. "rose in the dark to help"), discipline slips, kinder drawings ("I want to stay at Hallowell forever"), heritage, yearbooks 1945/1962/1979, denise_file, denise_diary, alma_mater, lab_memo, room104_board, mixtape_jcard, tess_draft |
Mystery → source map: why rules bind him (Charter excerpt; Walt Nov 1962) · pencil/ink (Walt 1963; ROLLCALL.BAS) · physical
fate (Walt Oct 1979; Lutz) · Haupt (letter; full Charter) · 1894 (inquiry; ledger) · keepsakes / clear the roll (Adair note).
**Alma mater (original lyrics):**
> Hallowell, our Hallowell, upon the valley's breast,
> where all thy children gather in, and none shall leave thy rest.
> Hallowell, our Hallowell, we answer to thy call —
> present, present, every one, and none shall leave at all.

---

## 12. The school — spatial plan

A 1923 brick Collegiate-Gothic K–12 school, two floors + basement, H-shaped: a central block (lobby with the auditorium
behind it) and two wings joined by a long east–west corridor. **Every E–W corridor occupies world rows y 35–39** (so floors
stack in the sketchbook). The **east stair core** is at world x 104–108 on the north side of every floor. North is up.

```
                          ┌──────────── AUDITORIUM (aud) ────────────┐
                          │ music rm (W wing) │ STAGE │ trap rm (E wing)│──stage door──┐
       LIBRARY            └───────────── seats ── doors ──────────────┘              │
  (1F + mezzanine 2F)  ┌── WEST HALL 1F (west1) ──┬─ LOBBY ─┬──── EAST HALL 1F (east1) ────┐   GYM
     doors ────────────┤ 103 bulletin 102 101 RR  │ portrait│ boys RR  E-STAIR(104-108) 104 ├─ doors ─ locker rms
                       │ ─────── corridor ─────── │ memorial│ ─────────── corridor ──────── │          showers
                       │ W-stair(rubble)  office  │vestibule│ cafeteria         kitchen     │
                       └──────────────────────────┴─ doors ─┴───────────────────────────────┘
                                               (exterior: lot, steps, oak, sign; chute hatch on the east lawn)
```
| Map id | What it contains | Size (tiles) | Floor offset |
|---|---|---|---|
| `exterior` | lot, wagon, oak, sign, flagpole, steps, front doors (local x≈25), east lawn with the coal-chute hatch | 50×34 | (50, 52) |
| `lobby` | vestibule (trophy cases), lobby (portrait, plaque, memorial, bench, aud doors), corridor mouths | 30×30 | (60, 22) |
| `west1` | corridor; N: 103, bulletin, 102, 101, girls RR; S: W-stair rubble (opposite 103), office suite (reception, nurse, principal, PA); W end: library doors | 62×30 | (-2, 22) |
| `library` | 1F reading room + 2F mezzanine (same map; `rooms[].floor` marks the mezzanine 2F) | 28×36 | (-30, 18) |
| `east1` | corridor; N: boys RR, east stairwell (x 104–108), 104; S: cafeteria, kitchen; E end: gym doors | 62×30 | (90, 22) |
| `gym` | court, bleachers, hoops, scoreboard; girls'/boys' locker rooms; showers | 44×40 | (152, 16) |
| `basement` | NW... stairs at x 104–108 (local 12–16), corridor, boiler room, **coal bin SW** (local x 2–14) + chute, janitor's office (≥ 10 tiles from the heap), storage, electrical | 60×32 | (92, 22) B |
| `east2` | corridor; N: 205, 206, 207, boys RR, stair top (x 104–108); S: storage closet (battery); W end → longhall | 56×30 | (96, 22) 2F |
| `longhall` | 2F central corridor over the lobby; N side: gallery railing over the dark lobby (portrait visible across the void); S side: painted 201/202 doors; archway sign at the east end | 40×14 | (56, 30) 2F |
| `west2` | corridor; N: 201, 202, 203 chem + 204 prep; W end: **girls RR 2F beside the mezzanine door**; S: teachers' lounge; railed hole of the collapsed W-stair at the same world x as west1's rubble | 58×30 | (-2, 22) 2F |
| `aud` | house seats + aisles, stage + lectern, upstage crossover, W wing music room, E wing trap room + stage door to the lobby NE | 44×42 | (53, -20) |
| `vault` | under-stage crawl, iron spiral, descending passage, Founder's Vault, coal passage | 36×36 | (57, -20) B2 |
| `breaker` | cavern, red seams, chutes, picking benches, stairways, weigh-master's office | 60×44 | (45, -30) B3 |

Classrooms that share a wall get a connecting **cloakroom door** (101–102, 205–206, 202–203) so periods have chase loops.
**Doors** (classroom/office) close by themselves 1.5 s after Tess passes; the Colonel closes doors behind his peeks.
**Landmarks:** the portrait (lobby; visible from the longhall gallery); the collapsed west stair (west1, and its railed hole in
west2); the trophy cases; the cafeteria banner; the boiler's glow; hallway clocks; red EXIT signs; the green banker's lamp.
**Rooms change on revisit:** 102 desks → rows + chalkboard updates; east doors jammed → open; coal heap occupied → hollow;
portrait seated → empty (Ch5) → uniform (DISMISSED); memorial board gains Polaroids and Tess's frame; gym doors blocked → open;
library 1F doors barred → open; 205 after Danny → pages of `I WILL NOT LEAVE`; library table after Leah → checkout cards; 103 →
a camcorder-shaped dust outline on Leah's desk; halls dark → fluorescent in periods.

---

## 13. Art direction (all art)
- World 480×270, 16 px tiles, characters 24×32, the Colonel 64×64 (the gym `rise` may be taller), portraits 96×120 (2× in UI),
  CGs 480×270. Crisp pixels, dithering, limited palette (`src/art/palette.js`), top-left light, 1-px dark outlines on characters.
- Tactile decay: peeling two-tone paint, cracked checker linoleum, water stains, rust, carved desks, curling posters, dead
  tubes, dust, leaf litter, graffiti ("HOLLOW HELL", "KR '91", a badly drawn pentagram). Every tile/prop has a clean 1979 variant.
- Animation: dying lights, dripping, steam, rain on windows, dust motes, idles, the Colonel's breathing.
- Portraits: one rig per character; lighting variants `normal`, `dark`, `under`, `fluor`, `red`, `dawn`; grime 0–2 across the
  night; `enrolled` (friends: entranced; Tess: amber catchlight at 1 answer, + husk sheen at ≥ 2).
- Horror visuals are selective: distort/chroma only for mimic lines and when the Colonel is within 3 tiles; a vignette that
  tightens near him; VHS filter for tapes; the compact's round cracked frame; "reduce flashing" option.

## 14. Audio direction
- WebAudio synthesis only. Buses: master, music, sfx, ambience, ui. Ambience per area; footsteps by surface.
- **Stinger budget:** `stinger_hard` ≤ 5 in the whole game (VHS face · False Leah's head turn · gym last light bank · locker
  face · "WHO IS OUT OF THEIR SEAT"); `stinger_soft` ≤ 1 per chapter.
- **Bells:** scripted bells full length (~4.5 s); free-period bells 2.5 s and low-passed (distant), so the scripted ones stay
  big. The intercom chime drops a semitone per act (Act I = Pro–Ch2, II = Ch3–5, III = Ch6–8).
- **Music:** title only until Ch3; drones only in passing time from Ch3 (Act II `drone_1`→`drone_2`, Act III `drone_3`); never
  during scripted Colonel scenes; phonograph alma mater in Ch6; Leah's tape (`ending_good`/`ending_true`) at the end.
- **Silence ledger:** car engine off 2 s · Danny's vanish 3 s total silence · Room 103 after the wet sound until the bell ·
  coal heap: ambience −18 dB within 10 tiles · long hall: each loop strips one layer (wind, creaks, drips) · gym: roof rain cuts
  2 s on the last bank · locker: only breath, taps, rain; heartbeat only when the face enters · Ch6 alone: no drone, rain + a
  clock, then the phonograph · descent: no music, footsteps brick→stone→coal · Register: room tone + the faint roll through
  stone; on Close, 2 s of nothing, then the bell or the scream · PRESENT: room tone only.
- Spatial: pan + distance + occlusion. Some sounds must make the player *stop and listen* (overhead footsteps; a door two rooms away).
