# HALLOWELL — Content Plan (maps, scripts, systems)

Contract for the content phase. Read with `DESIGN.md` (what happens) and `TECH.md` (formats & APIs).
Maps, scripts and systems are authored by different people in parallel; **this file is how they agree**:
anchor names, prop ids, flag names and script ids below are binding.

---

## 1. Conventions

- **Script ids** `<file prefix>.<name>`; the file that owns a prefix is listed in §3. A map object that
  should run a script sets `script: '<id>'`; a trigger sets `script`.
- **Named props** — props that scripts manipulate get explicit ids (table §2.x "Named props"). Everything
  else may use auto ids.
- **Chapter-variant geometry** is done with `cond` on objects (e.g. scattered desks vs. rows) — scripts only set
  flags and call `g.refresh()`.
- **Examine text** for ordinary props is written by the map author in Tess's voice (DESIGN §3 voice; short,
  specific, dry; 1–2 lines; vary by chapter with `{cond,text}` where the night has changed her). Add `banter`
  for party members on notable props in the prologue/Ch1 (that's where friends are established).
- **Hide spots**: every classroom has ≥6 `desk_student` (seats); every hall has ≥2 hideable lockers
  (`hide: 'locker'`) within ~10 tiles of any point, plus benches. Halls must never be a death trap.
- **Batteries**: place pickups (`item: 'battery'`) per §2 (total ≈ 10 in the game). Flashlight drains ~100% per
  300 s on; batteries refill to 100%.

---

## 2. Maps

General: follow DESIGN §12 sizes/offsets, TECH §5. North walls 3 thick. Leave a 1-cell void border. Corridors
4–5 tiles tall. Classrooms ~10–12 wide × 8–10 tall interior. Every map: `rooms` for every space (names as
shown in the sketchbook), `lights` (exit signs over doors, `fluor` lights in group `'period'` along halls and in
classrooms, windows are automatic from `W`/`U` cells), `ambience`.

### 2.1 `exterior` (EXT, ~50×34) — owner: maps-A
- North: brick facade (`B`, windows `U`) 3 rows thick across the map; **front doors** (`door_front`, state
  `chained` until `pro_doors_cut`, then `closed`; `to: { map: 'lobby', anchor: 'from_exterior' }`) centred at the
  top of granite steps (`s`); `motto_stone` above/beside the doors on the face; `flagpole` beside the steps.
- East: side yard (grass/gravel) around the corner → `chute_exit` anchor at a small coal-chute hatch prop
  (`coal_chute`, state `open` only for the TRUANT ending) in the facade.
- South half: wet asphalt lot; **Leah's wagon** (`car_wagon`, id `ext_wagon`, state `on` in the prologue);
  `start` and `car` anchors beside it; 2–3 `lamp_post` (one `flicker`); several `steam_vent` decals with steam;
  `sign_danger` near the lot entrance; `sign_school` by the south fence; the **dead oak** (`oak_dead` +
  `oak_canopy`, id `ext_oak`, anchor `oak`) on the west lawn with `cicada_shells`; chain-link `fence` along the
  south; `dumpster` east. `dawn_steps` (on the steps), `dawn_lot` (lot near the car).
- Named props/scripts: `ext_oak` → `pro.oak`; `sign_school` → `pro.sign`; `sign_danger` → `pro.danger`;
  `motto_stone` → `pro.motto`; `ext_wagon` → `pro.car`; front doors → `pro.doors` (until `pro_doors_cut`).
- Trigger `approach_doors` (rect on the steps) → `pro.doors` once.
- Ambience `exterior_rain`; map flag-driven dawn look handled by scripts (`g.set('dawn')`).

### 2.2 `lobby` (1F, ~30×30) — owner: maps-A
- **Vestibule** (south): entered from the front doors (gap in the south wall; exit rect → `exterior`
  `front_doors` — but see the Ch1 loop: exit `cond: s => !s.flags.ch1_danny_vanished` → exterior; once Danny
  has vanished, the same rect transfers **seamlessly** (`fade: false`) to `west1` `library_end` and runs
  `ch1.front_loop` the first time (`ch1_front_loop` flag); after `register_done` it leads to `exterior`
  `dawn_steps`). Two `trophy_case`s (reflective) on the vestibule's north wall flanking inner double doors.
- **Lobby**: tall room, marble inlay (`m`) under a dead chandelier (`over` prop not needed). North wall:
  **auditorium doors** (`door_double`, id `lobby_aud_doors`, state `chained` → opens with `aud_key`, `to: aud
  from_lobby`), **`portrait_colonel`** (id `lobby_portrait`, state from `flags.portrait_state` via `cond`
  variants: seated / empty / uniform), **`memorial_board`** (id `lobby_memorial`, dynamic params from flags:
  polaroids after each friend is taken + `tessFrame` from Ch7), **`plaque`** (id `lobby_plaque`, doc
  `plaque`). `bench` (anchor `bench`), Danny's **`backpack`** (id `lobby_backpack`, `cond: ch1_danny_vanished
  ⇒ pickable`, gives `bolt_cutters` via script `ch1.backpack`; before he vanishes it's just examine), a
  `water_fountain`, a dead `exit_sign` or two.
- West opening → `west1` `from_lobby`; east **double doors** (id `lobby_east_doors`, state `jammed` until
  `east_doors_open`) → `east1` `from_lobby`.
- Scripts: `lobby_portrait` → `ch1.portrait` (chapter-aware), `lobby_memorial` → `ch1.memorial`
  (chapter-aware), `lobby_plaque` → `ch1.plaque`, trophy cases → `ch1.trophy`, east doors (jammed) →
  `ch1.east_jammed`, aud doors (chained, no key) → `ch1.aud_chained`.
- Trigger `enter_lobby` (first time) → `ch1.enter_lobby`.

### 2.3 `west1` (1F, ~62×30) — owner: maps-B
- Corridor E–W (4–5 tall, `floor_lino_hall`). **North side** (west→east): **101** kindergarten (tiny chairs,
  tiny tables, cubbies, drawings_wall, alphabet_strip, a reading rug decal), **102** (desks: two sets via
  `cond` — scattered while `!ch1_102_rows`, perfect rows when set; chalkboard id `w1_chalk_102` with dynamic
  `text` — see §4), **103** (desks in rows; anchors `desk_103_tess/leah/marcus` on three adjacent desks; door
  `door_103` with window; chalkboard id `w1_chalk_103`), **girls' restroom 1F** (stalls, sinks, `mirror`
  state `grimy`). North rooms have exterior north walls with windows.
- **South side** (west→east): the collapsed **west stairwell** (rubble — a landmark visible from the corridor
  through an open doorway), the **main office suite**: reception (glass door `door_glass` id `w1_office_door`,
  `lock: 'item:keyring'`, label MAIN OFFICE; `counter`, `mailboxes` (Adair's mailbox → `ch4.mailbox`),
  sign-out clipboard (`note_paper` doc `signout`), `office_chair`s + `bench` = waiting area anchor
  `office_bench`, lost & found box with a battery), **nurse** (cot, eye_chart, `shelf_med` → `ch4.jar`,
  clipping `note_paper` doc `clipping`), **principal Haupt** (office_desk, filing_cabinet → doc
  `discipline`, bookshelf_low, **`portrait_small`** id `w1_haupt_portrait` → `ch6.portrait` (opens on/after
  `safe_seen_past`)), **PA room** (`pa_console` id `w1_pa` → `sys.pa`, `master_clock`). Inner doors between
  office rooms are plain (open).
- West end: **library doors** (two stacked `door_side` cells in the west wall, id `w1_library_doors`, state
  `jammed` until `library_door_open`; text "It won't budge. Something's wedged against it on the other side.")
  with exit → `library` `from_west1`. Anchor `library_end` just east of them (Ch1 loop arrival).
- Corridor bulletin board (`bulletin_board` state `bell_schedule`, doc `bell_schedule`, anchor `bulletin`) a few
  tiles west of 103 — **the Danny-vanish beat happens here** (`danny_vanish` anchor beside it).
- Batteries: 1 in 101 (cubby), 1 in the office lost & found.
- Patrol graph along the corridor (≥5 nodes), folds in 2–3 wall seams, peeks for 101/102/103/girls RR/office.
- Past views: `principal_safe` (Haupt's office: `portrait_small` open, a faceless Haupt `figure79` at the desk,
  `setFlag: 'safe_seen_past'`), `reception_1979` (Denise's mother at the counter signing out, clock 1:40),
  `room103_1979` (desks full of faceless students; chalkboard "FOUNDER'S DAY — ASSEMBLY 1:45").
- Triggers: `room_enter_*` for 101/102/103/RR in Ch1 (increment `ch1_rooms_entered` via `ch1.room_enter`),
  `vanish` (rect around `danny_vanish`, cond `chapter===1 && ch1_rooms_entered>=2 && !ch1_danny_vanished`) →
  `ch1.danny_vanish`; `office_first` → `ch4.office_enter`.
- Named props: `w1_chalk_102`, `w1_chalk_103`, `w1_office_door`, `w1_haupt_portrait`, `w1_pa`,
  `w1_library_doors`, `w1_door_103`, desks in 103 at the three anchors: `w1_desk_103_tess`,
  `w1_desk_103_leah`, `w1_desk_103_marcus` (Leah's desk later carries the camcorder `pickup` id
  `w1_camcorder`, cond `ch2_leah_taken && !has camcorder`).

### 2.4 `library` (1F + mezzanine, ~28×36) — owner: maps-B
- South area = **reading room** (carpet + wood): reading tables with chairs and `lamp_banker`s, **Leah's table**
  (anchor `leah_table`; a lit `lamp_banker` id `lib_leah_lamp`, `yearbook_pile`), `card_catalog` (id
  `lib_catalog` → `ch5.catalog`, anchor `card_catalog`), `display_case` (id `lib_case` → `ch5.case`, anchor
  `display_case`), `librarian_desk`, `microfiche`, `book_cart`, rows of `bookshelf_tall` (stacks that block
  light). East wall doors to `west1` (barricade: a `bookshelf_low` + chair props, id `lib_barricade`, cond
  `!library_door_open`, script `ch5.unbar`). `spiral_bottom` → exit to `spiral_top`.
- North area = **mezzanine** (separate floor region drawn above in the same map; reached only by the spiral
  stair exit): stacks, railing overlooking darkness, east door → `west2` `from_library`.
- Batteries: 1 on the mezzanine.
- Past view `librarian` (Mrs. Ostrowski figure at the catalog with drawer open, `setFlag: 'saw_catalog_past'`).
- Yearbook docs: `yearbook_1945`, `yearbook_1962`, `yearbook_1979` (note_papers / examine on the yearbook
  pile and a shelf).

### 2.5 `east1` (1F, ~62×30) — owner: maps-C
- Corridor E–W. North side: **boys' restroom 1F**, **east stairwell** (room with `^` up behind a
  `gate_accordion` id `e1_gate`, `lock: 'item:keyring'` → sets `gate_2f_open`, exit → `east2` `from_east1`;
  `v` down → exit → `basement` `from_east1`), **Room 104** (optional small classroom: battery, a drawing
  of the Colonel on the chalkboard "MR. H SAYS HI" — chilling optional), a janitor's closet.
- South side: **cafeteria** (`door_double` from the corridor; long `caf_table`s, `serving_line`, `tray_rack`,
  `milk_cooler`, `vending_machine`, the `banner` state `homecoming79`), connected **kitchen** (`stove`,
  `sink_big`, `shelf_pantry`, `mixer` id `e1_mixer` → `ch3.mixer`, `freezer_door` → small walk-in (warm; a
  pile of `cicada_shells`), `dumbwaiter` id `e1_dumbwaiter` → `ch3.dumbwaiter`).
- East end: **gym doors** (`door_double` id `e1_gym_doors`, state `jammed` until `gym_open`, exit → `gym`
  `from_east1`). West end → `lobby` `from_east1`.
- Batteries: 1 in the kitchen office, 1 in 104.
- Patrol graph, folds, peeks (caf, RR, 104). Past view `cafeteria_1979` (homecoming lunch, banner fresh).

### 2.6 `gym` (~44×40) — owner: maps-C
- Court (wood) with `court_circle` and lines; **bleachers** (state `out`) along the north wall with Denise's
  spot (anchor `denise`); the north wall face carries the `scoreboard` (id `gym_scoreboard`, state `dead` →
  `on` during the set piece); `hoop_stand`s at the west and east ends; **`colonel_hoop`** anchor under the east
  hoop; `center` anchor. Entrance from `east1` on the west side (fallen bleachers prop near the door, cond
  `!gym_open`, never matters inside since you can't enter before).
- South: **girls' locker room** (door from the court — the chase target; rows of lockers with ≥6 hideable,
  one id `gym_locker_tess` at anchor `locker_tess`; `locker_bench`es) → **showers** (tile, `shower_head`s,
  sinks with `mirror`s, anchor `shower_mirrors`); **boys' locker room** (locked/jammed, flavor).
- `marcus_photo` anchor on the court near center (photo pickup spawned by script).
- Lights: big `fluor` group `'gym'` (off until the set piece), exit signs; windows high on the north wall.
- Ambience `gym` (rain drumming).

### 2.7 `basement` (B, ~60×32) — owner: maps-C
- Stairs up at the NW (`from_east1`). **Maintenance corridor** (concrete, `~` puddles, `pipe_h/v` over,
  `cage_bulb`s group `'bsmt'` off), **boiler room** (big `boiler` id `b_boiler` lit; anchor `boiler`),
  **coal bin** (east of the boiler; `%` floor, `coal_heap` id `b_coal_heap` state from flags: `occupied` until
  `coalbin_empty`, then `hollow`; anchor `coal_heap`; `coal_chute` id `b_chute` on the north wall face, anchor
  `coal_chute`, script `ch6.chute` (locked → bolt cutters → TRUANT prompt)), **janitor's office** (door id
  `b_jan_door`, `lock: 'flag:ch3_jan_key'`, text "Padlocked. A hasp and a cheap lock."; a `note`-less ledge
  examine spot above the door: an invisible examine object at anchor `janitor_ledge` → `ch3.ledge`; inside:
  `janitor_desk`, `cot`, `calendar`, radio, `pegboard` id `b_pegboard` (state keys → empty), `keyring`
  `pickup` id `b_keyring` (item keyring, script `ch3.keyring`), Walt's log `note_paper` doc `walt_log`),
  **storage** (desk_pile, shelf_metal, battery), **electrical** (`breaker_panel` id `b_panel` → `ch3.panel`).
- Ambience `basement`; `b_boiler` has a positional loop (system sets it up on map load).
- No patrol (periods here are heard above). A system watches noise near `b_coal_heap` (§5.4).

### 2.8 `east2` (2F, ~56×30) — owner: maps-D
- Corridor E–W. North side: **205** (English: *Our Town* posters, desks in rows; **Danny's desk** anchor
  `danny_desk`, Tess's seat `desk_205_tess` two desks away; chalkboard id `e2_chalk_205`), **206** (Biology,
  Mr. Lutz: `bulletin_board` state `brood` (doc `brood`), `specimen_shelf`, `skeleton`, lab stools; **hall pass**
  `pickup` id `e2_hall_pass` (item hall_pass) on a hook by the door, anchor `hall_pass`), **207** computer lab
  (6× `computer_desk`, state `off`, `on` while `HW.periods.active` via a system; one id `e2_terminal` →
  `sys.terminal`, anchor `terminal`; poster `computer`; a `printer`), **boys' restroom 2F**.
- South side: **guidance office** (filing cabinets → doc `denise_file`, college pennants poster), stair top
  (from_east1), a small storage closet (battery).
- West end: **balcony** — the corridor opens onto a railing (`|`) over a dark void (the lobby below); anchor
  `balcony`; examine → `ch5.balcony` (the portrait's chair is empty). Exit west → `longhall` `from_east2`.
- Patrol graph, folds, peeks (205, 206, 207, RR, guidance).

### 2.9 `longhall` (2F, ~40×14) — owner: maps-D
- One straight corridor (5 tall) with doors along the north wall (fake; plates alternating 201/202; all
  `locked` with `lockedText` variations), lockers, two `clock_hall`s, a railing section on the south side
  looking down into darkness. East end `start`/`from_east2`; west end `kevin` anchor (Kevin stands here) and
  exit → `west2` `from_longhall` behind him. `loop_reset` anchor = a point ~12 tiles from the east end that
  looks identical to a point ~28 tiles from the east end (the system teleports between them seamlessly).
- The loop is run by a system (§5.5); the map provides `loopZone` metadata: `longhall: { loopFrom: [x0..x1],
  loopTo: x, kevinStop: x }` in map data (extra field, document in the map).

### 2.10 `west2` (2F, ~58×30) — owner: maps-D
- Corridor E–W. North side: **201** (false Leah: desks; anchor `false_leah` on a desk with her back to the
  door, `desk_201_tess` next to it; door id `w2_door_201`), **202** (history: `bulletin_board` state
  `heritage` doc `heritage`, framed charter excerpt `note_paper` doc `charter_excerpt`, PA map poster), **203
  chemistry lab** + **204 prep room** (lab benches, fume hood, eyewash, chem cabinet; dark window with a past
  view `chem_1979` showing the chalkboard "FOUNDER'S DAY — NO CLASSES AFTER 1:30 — ASSEMBLY 1:45"; batteries),
  **girls' restroom 2F** (mirror id `w2_mirror` state `fogged` → `ch5.mirror` trigger when Tess stands at
  `mirror_2f`).
- South side: teachers' lounge (optional: coffee maker, Adair's cardigan on a chair → examine), a supply closet.
- West end: door to the **library mezzanine** (exit → `library` `from_west2`, anchor `from_library`). East end
  ← `longhall`.
- Patrol, folds, peeks.

### 2.11 `aud` (~44×42) — owner: maps-A
- South: entrance from the lobby (`from_lobby`, south gap). **House**: ~8 rows × 2 banks of `aud_seat`s with a
  centre aisle and side aisles; seats are `occupied` by husks (variety of `occupant`s) via `cond: ch7_assembly`
  (≈70% occupied) — the front row keeps 3 empty seats at anchors `front_row_danny/leah/marcus` and one
  `denise_husk` seat beside Marcus. `back_row` anchor.
- North: **stage** (wood, raised with a `stage_front` row and steps at both ends), `lectern` at anchor
  `lectern` (centre stage), `curtain` segments (open), a `spot` light (group `'assembly'`) on the lectern.
- Stage-left wing (west) → **music room** (Miss Adair's: `piano`, `music_stand`s, `phonograph` →
  `ch7.phonograph`, desk, sheet music doc `alma_mater`, `instrument_case` id `aud_clarinet` → `ch7.clarinet`,
  `mirror` (reflective, id `aud_music_mirror`, anchor `music_mirror`) → `ch7.mirror`).
- Stage-right wing (east) → **trap room** (`rope_rail`, sandbags, `lever` id `aud_lever` → `ch7.lever`,
  `trapdoor` id `aud_trapdoor` (state from `trapdoor_open`) at anchor `trapdoor` → exit to `vault` `from_aud`
  when open).
- Ambience `auditorium` (→ `assembly` in Ch7).

### 2.12 `vault` (B2, ~36×36) — owner: maps-E
- Top: arrival `from_aud` under the stage (crawlspace: low wood floor, `stage_flat`s "HOMECOMING 1945",
  "1962", cobwebs). `stair_spiral` → `stair_bottom` (iron spiral, conceptually several storeys). A winding
  descending passage: brick → stone → coal seam (`R`), drips, warmth (ember particles near the bottom).
- **Founder's Vault** (marble, ~14×12): `sarcophagus` id `v_sarcophagus` state `burst` (anchor
  `sarcophagus`, script `ch8.sarcophagus`), `wreath`s, `flag_regimental` and `name_wall`s on the north face,
  `candle`s (unlit), `writing_desk` with `husk_kneeling` (Adair; anchor `adair`, script `ch8.adair`).
- East: passage cut through coal → exit → `breaker` `from_vault` (anchor `to_breaker`).

### 2.13 `breaker` (B3, ~60×44) — owner: maps-E
- A cavern: bottom (south) floor of gravel/coal around red-glowing `pit`s (`mine_fire` lights from below).
  The **breaker structure** rises north: plank walkways (`p`) with `railing`s zig-zagging up across the map,
  `chute`s slanting between levels, `picking_bench`es with `breakerboy` husks (as `husk_seated`-style props
  or entities) and `lamp_miner`s (17 boys in total), `beam`s, a `pulley_wheel` overhead. Stair landings
  `stairs_1`, `stairs_2` (ramps — no transfers needed). At the top (north): the **weigh-master's office**
  (timber walls, `weigh_desk` + `register_book` id `br_register` → `sys.register`, anchor `register`;
  `shelf_ledgers` → doc `ledger_colonel`; `note_paper` doc `inquiry_1894`), anchor `office`.
- `floor` anchor at the bottom; `from_vault` at the SW entrance.

---

## 3. Scripts — files, owners, ids

| File | Owner | Ids (minimum; add helpers freely under the same prefix) |
|---|---|---|
| `scripts/pro.js` | narrative-1 | `pro.start` (title card → car CG scene → exterior), `pro.car`, `pro.oak`, `pro.sign`, `pro.danger`, `pro.motto`, `pro.doors` |
| `scripts/ch1.js` | narrative-1 | `ch1.start`, `ch1.enter_lobby`, `ch1.portrait`, `ch1.memorial`, `ch1.plaque`, `ch1.trophy`, `ch1.east_jammed`, `ch1.aud_chained`, `ch1.backpack`, `ch1.room_enter`, `ch1.danny_vanish`, `ch1.voice_102`, `ch1.room102`, `ch1.front_loop`, `ch1.end` |
| `scripts/ch2.js` | narrative-2 | `ch2.start`, `ch2.sit`, `ch2.glimpse`, `ch2.after`, `ch2.vhs`, `ch2.marcus`, `ch2.end` |
| `scripts/ch3.js` | narrative-2 | `ch3.start`, `ch3.east_hall`, `ch3.dumbwaiter`, `ch3.mixer`, `ch3.freezer`, `ch3.basement`, `ch3.heap`, `ch3.stir1`, `ch3.stir2`, `ch3.jan_door`, `ch3.ledge`, `ch3.keyring`, `ch3.panel`, `ch3.first_period`, `ch3.heap_empty` |
| `scripts/ch4.js` | narrative-2 | `ch4.start`, `ch4.office_enter`, `ch4.mailbox`, `ch4.jar`, `ch4.pa_listen` (per-room handler used by `sys.pa`), `ch4.roll1`, `ch4.hide`, `ch4.end` |
| `scripts/ch5.js` | narrative-3 | `ch5.start`, `ch5.gate`, `ch5.danny`, `ch5.period205`, `ch5.hall_pass`, `ch5.balcony`, `ch5.longhall_enter`, `ch5.longhall_loop` (per loop index), `ch5.longhall_voice`, `ch5.kevin_pass`, `ch5.kevin_whistle`, `ch5.false_leah`, `ch5.room202`, `ch5.mirror`, `ch5.library_enter`, `ch5.leah`, `ch5.catalog`, `ch5.case`, `ch5.unbar`, `ch5.end` |
| `scripts/ch6.js` | narrative-4 | `ch6.start`, `ch6.portrait`, `ch6.safe_open` (contents scene), `ch6.marcus_hears`, `ch6.gym`, `ch6.chase`, `ch6.locker`, `ch6.after_locker`, `ch6.showers`, `ch6.alone`, `ch6.chute` |
| `scripts/ch7.js` | narrative-4 | `ch7.start`, `ch7.aud_enter`, `ch7.assembly_start`, `ch7.roll3`, `ch7.front_danny`, `ch7.front_leah`, `ch7.front_marcus`, `ch7.music_room`, `ch7.clarinet`, `ch7.mirror`, `ch7.phonograph`, `ch7.lever`, `ch7.trapdoor` |
| `scripts/ch8.js` | narrative-5 | `ch8.start`, `ch8.under_stage`, `ch8.vault`, `ch8.sarcophagus`, `ch8.adair`, `ch8.breaker`, `ch8.office`, `ch8.after_register`, `ch8.escape`, `ch8.dismissal` |
| `scripts/end.js` | narrative-5 | `end.dismissed`, `end.withdrawn`, `end.present`, `end.truant`, `end.coda`, `end.credits` |
| `scripts/items.js` | narrative-1 | `item.mixtape`, `item.camcorder`, `item.gum` |
| `scripts/sys.js` | systems | `sys.pa`, `sys.safe`, `sys.terminal`, `sys.register`, `sys.caught` |
| `scripts/gen.js` | systems | generic helpers (`gen.locked`, `gen.window`, `gen.clock`, `gen.nothing`) |

Each chapter's `chN.start` runs from `g.chapter(N)` flow: the previous chapter's last script calls
`await g.chapter(N)` then `await g.run('chN.start')`.

---

## 4. Dynamic text & variant tables (maps implement with `cond`, scripts flip flags)

| Prop | Behaviour |
|---|---|
| `w1_chalk_102` | blank (Ch1 start) → `DANIEL KOVACH — PRESENT` (`ch1_102_rows`) → adds `LEAH BRANDT — PRESENT` (`ch2_leah_taken`) → adds `MARCUS WEBB — PRESENT` (`ch6_marcus_taken`) → (PRESENT ending) `THERESA DOLAN — PRESENT` |
| `lobby_portrait` | `seated` until `ch5_danny_found`; `empty` after; `uniform` after `expelled` |
| `lobby_memorial` | polaroids: danny after `ch1_danny_vanished`, leah after `ch2_leah_taken`, marcus after `ch6_marcus_taken`; `tessFrame` from `ch7_assembly` |
| `b_coal_heap` | `occupied` until `coalbin_empty`; `hollow` after |
| `lobby_east_doors` | `jammed` until `east_doors_open`; `open` after |
| `e1_gym_doors` | `jammed` until `gym_open` |
| `w1_library_doors` | `jammed` until `library_door_open` |
| `e2` computers | `on` while a period is active |
| hall `clock_*` | params.time from `HW.periods` (period progress) else stopped at 1:47 |

---

## 5. Gameplay systems (owner: systems)

Files: `src/game/periods.js`, `colonel_ai.js`, `noise.js`, `patrol.js` (Kevin), `chapters.js`, `endings.js`,
`longhall.js`, `basement.js` (stir), `assembly.js`, `chase.js`, `src/data/puzzles.js`, `scripts/sys.js`,
`scripts/gen.js`. Register them with `HW.game.addSystem(...)` from a `src/game/index.js` imported by main.js
(the engine owner adds that one import line during integration).

### 5.1 Periods — `HW.periods`
Config per chapter (chapters.js): `{ maps: ['west1','east1','lobby',...], passing: [150, 210] s, length: [60, 80] s }`.
Sequence: warning (crackle + chime, optional voice line from a rotating pool: "Students will proceed to
their classrooms.", "Attendance will now be taken.", "Hall passes are required beyond this point.") → 10 s →
`school_bell` → lights group `period` on (stutter), ambience layer `period_buzz`, computers on → Colonel
spawns at a fold on the player's map if that map has `patrol` (≥ 8 tiles away, not in view) → period length
(hall clocks advance) → `school_bell` (dismissal, shorter) → Colonel withdraws (sinks at nearest unseen fold,
or where he stands if unseen) → lights off. In maps without patrol: `footstep_heavy_above` + `dust_fall` events.
Suppressed (paused) while a cutscene/menu runs; never starts within 20 s after a map transfer or a checkpoint
load; `start({ scripted: true })` for set pieces.

### 5.2 The Colonel — `HW.colonel`
Modes: `off | patrol | investigate | chase | search | scripted | assembly | escape`.
- **Patrol**: walks the map's patrol graph (drag 26 px/s, idle breathing pauses), choosing next nodes with a
  mild bias toward the player's room (not omniscient). At `peeks`, opens the door audibly (`door_creak_slow`),
  `peek_<dir>` for 2–3 s scanning the room, may step in 2 tiles if he heard noise.
- **Vision**: cone 100°, range 7 tiles (10 if `lightAt(player) > 0.45` or the player's flashlight beam hits him),
  `map.los`. **Seated & still** or **in a locker** = invisible, unless he saw the player enter that spot in the
  last 1.5 s. Seated but **not still** within 4 tiles in his cone fills detection.
- **Detection meter** 0→1 (faster: closer, lit, moving, running). On full: `colonel_hm`, 0.8 s notice pause
  (player can break line of sight), then **chase**.
- **Chase**: path toward the player; rhythm = drag 30 px/s then lunge 150 px/s for 0.5 s every ~1.4 s
  (`colonel_lunge`); lose sight 4 s → **search** (go to last seen point, `peek` around, check the spot she was
  seen entering) → back to patrol. Caught (≤ 14 px, not hidden or seen hiding) → `reach` anim + `colonel_grab`
  → `HW.game.gameOver('caught')` (respect `HW.debug.god`).
- **Hearing**: noise events within their radius → investigate (walk to the source).
- **Scripted**: scripts drive him (`walkTo`, `anim`, `face`) — Ch2, Ch5 205, Ch6 gym, Ch8.
- **Assembly** (Ch7): stands at `lectern`; cycles READ (6–9 s, `lectern_down`, page turns, names murmured) and
  SCAN (3–4 s, `lectern_scan`, telegraphed 1 s before by a page-turn + `colonel_hm` + the spot light shifting).
  During SCAN, if the player is in the house and not seated & still → catch sequence. Roll call #3 fires when the
  player first reaches row 4 (script `ch7.roll3`).
- **Escape** (Ch8 chase): relentless pursuit, lunges, rubber-band so the player stays 4–8 tiles ahead if
  moving well; catches only if the player stops/backtracks.
- Positional loop `colonel_breath` follows him; `colonel_drag` per step cycle; `colonel_jingle` occasionally.

### 5.3 Noise — `HW.noise.emit(x, y, radiusTiles, kind)`
run step 7 · walk step 1.5 · door 5 · locker 3 · item drop 8 · mixer 12 · whistle (Kevin) map-wide.

### 5.4 Basement stir (`basement.js`)
While `b_coal_heap` is `occupied`: noise events within 8 tiles of it add stir (cooldown 3 s).
Stir 1 → `ch3.stir1` (coal slides, breath quickens; Marcus whispers). Stir 2 → `ch3.stir2`: the Colonel
`rise`s out of the heap and chases (mode chase) — escapable by leaving the basement via the stairs (he doesn't
follow; the heap is `occupied` again and stir resets). Caught → game over.

### 5.5 Long hall (`longhall.js`)
Without `hall_pass`: when the player passes `loopFrom` westward, teleport seamlessly back east by the loop
distance (same-looking section), increment `longhall_loops`, darken the map ambient slightly per loop, run
`ch5.longhall_loop` (non-blocking lines by loop count; loop 4 → `ch5.longhall_voice`). Kevin stays at the far end
(visible, never reachable). Running in the long hall → `ch5.kevin_whistle` (whistle, blackout, reset to `start`,
Colonel breath close). With `hall_pass`: reaching `kevinStop` → `ch5.kevin_pass` (sets `longhall_cleared`, no
more looping).

### 5.6 Safety Patrol elsewhere (`patrol.js`)
Kevin sentinel entities can be spawned by scripts/maps at hall ends (Ch6 cameo in `east1`): head tracks the
player; if the player runs within his LOS ≤ 10 tiles → `whistle` → if a period is active the Colonel switches to
investigate the player's position; else a period starts early (3 s warning).

### 5.7 Endings — `endings.js`
Implements DESIGN §8 exactly: builds the Register model for the UI (`sys.register`), applies tools, tracks
`withdrawn_*`, `form_used_on`, `expelled`, and `resolveEnding()` → `'dismissed' | 'withdrawn' | 'present'`.

### 5.8 Puzzle data — `src/data/puzzles.js`
- `PA_ROOMS`: label + id + what is heard per chapter (text lines + sfx/loop ids) — consumed by `sys.pa`.
- `TERMINAL`: boot lines and a name database for `ROLLCALL.BAS` (`KOVACH`, `BRANDT`, `WEBB`, `DOLAN`,
  `HALLOWELL`, `ADAIR`, the Nine, Walt's son …, `LIST`, `RUN`, `HELP`, `EXIT`).
- `SAFE`: `{ label: "FOUNDER'S DAY (mo-day-yr)", combo: [10, 19, 94] }`.

---

## 6. Lore (owner: lore)

`src/data/docs.js` — every document in DESIGN §11 plus those referenced here: `bell_schedule`, `plaque`,
`memorial`, `walt_log`, `signout`, `adair_mailbox`, `clipping`, `discipline`, `kinder_drawings`, `brood`,
`heritage`, `charter_excerpt`, `charter_full`, `yearbook_1945`, `yearbook_1962`, `yearbook_1979`,
`denise_file`, `haupt_letter`, `denise_diary`, `adair_note`, `inquiry_1894`, `ledger_colonel`, `alma_mater`,
`lab_memo` (computer lab), `room104_board`, `mixtape_jcard`. Plus final in-character descriptions in
`src/data/items.js` (the lore owner may edit `desc` strings only).
