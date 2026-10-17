# HALLOWELL — Content Plan v2 (maps, scripts, systems)

Contract for the content phase. Read with `DESIGN.md` v2 (what happens) and `TECH.md` (formats & APIs).
Maps, scripts and systems are authored by different people in parallel; **this file is how they agree**: anchor
names, prop ids, flag names and script ids below are binding. Where DESIGN v2 and this file disagree, DESIGN wins —
report it.

---

## 1. Conventions

- **Script ids** `<prefix>.<name>`; owners in §3. Props/triggers reference scripts by id.
- **Named props** (scripts manipulate them) use the explicit ids below; others may use auto ids.
- **Chapter-variant geometry** = objects with `cond` (e.g. scattered vs rows); scripts set flags + `g.refresh()`.
- **Gates** are conditions, never bare items (DESIGN §9.2). Door `lock` may be a function `(s) => bool` (true = locked)
  with `lockedText` — a function of state is allowed: `lockedText: (s) => ...`. Use the in-voice refusals from DESIGN §9.2.
- **Examine text** for ordinary props: written by the map author in Tess's voice (DESIGN §3: short, specific, dry, 1–2
  lines; later chapters literal and frightened — use `{cond, text}` variants by chapter). Ch1 examinables need
  `banter` for every friend present (≥ 14 examinables across lobby + west1). Dwell floor: ≥ 1 examinable per 40 corridor
  tiles; every room ≥ 2 examinables.
- **Seats (hide spots)**: from any hall tile a seat must be reachable within ~8 s of walking (≈ 8 tiles). Classrooms ≥ 6
  desks; benches in halls; restrooms/kitchen have none (Tess: "No seats in here."). **Lockers are not hide spots**
  (except `gym_locker_tess`, scripted).
- **Batteries**: the guaranteed ones (DESIGN §9.5) + 4–5 optional. Item id `battery`.
- **World alignment**: every E–W corridor occupies world rows y 35–39 (= local rows 13–17 for maps with offset y 22).
  East stair core at world x 104–108 north side on 1F/2F/B.

---

## 2. Maps

General: DESIGN §12 sizes/offsets; TECH §5 format. North walls 3 thick; 1-cell void border; corridors 5 tall
(local rows 13–17); classrooms ~10–12 × 8–10 interior. Every map: `rooms` (names as shown in the sketchbook; library
mezzanine rooms set `floor: '2F'`), `lights` (EXIT signs over doors, `fluor` in group `'period'` along halls and in
classrooms), `ambience`, `patrol` where periods happen (lobby, west1, east1, east2, west2), plus `folds` (wall seams) and
`peeks`. Each map file starts with a comment block summarizing its layout.

### 2.1 `exterior` (50×34, offset (50,52)) — maps-A
- North: brick facade (`B`, windows `U`) 3 rows thick; **front doors** `ext_front_doors` (`door_front`) at local x≈25 atop
  granite steps; state `chained` until `pro_doors_cut`; then interact → `to: lobby/from_exterior`. `motto_stone` on the face
  beside the doors; `flagpole`. Anchors `front_doors` (below the steps), `dawn_steps` (on the steps).
- East lawn: grass/gravel; a small `coal_chute` hatch prop (state `open` only in TRUANT) at the facade's east end; anchor
  `chute_exit` near local x≈48.
- South: wet asphalt lot; **Leah's wagon** `ext_wagon` (`car_wagon`, state `on` in the prologue); anchors `start`, `car`,
  `dawn_lot`; 2–3 `lamp_post` (one `flicker`); `steam_vent` decals; `sign_danger` near the lot entrance; `sign_school` by the
  south fence; the **dead oak** `ext_oak` (`oak_dead` + `oak_canopy`, `cicada_shells` decal) on the west lawn, anchor `oak`;
  chain-link `fence` along the south; `dumpster`.
- Scripts: `ext_oak` → `pro.oak`; sign_school → `pro.sign`; sign_danger → `pro.danger`; motto → `pro.motto`; wagon → `pro.car`;
  front doors (chained) → `pro.doors`. Trigger `approach_doors` (steps) → `pro.doors` once.

### 2.2 `lobby` (30×30, offset (60,22)) — maps-A
- **Vestibule** (south): south-wall gap with an exit rect: cond `!ch1_danny_vanished` → refusal script `ch1.vestibule_refuse`
  (no transfer; implement as a trigger that runs the refusal and pushes Tess back); after the vanish and before
  `register_done` → **seamless** transfer (`fade:false`) to `west1/library_end` running `ch1.front_loop` (first time) or
  `gen.front_loop` (later: a one-line repeat); after `register_done` → `exterior/dawn_steps` (handled by ending scripts).
  Two `trophy_case`s (reflective) on the vestibule north wall flanking inner double doors; `trophy` anchor.
- **Lobby**: marble inlay; north wall: **auditorium doors** `lobby_aud_doors` (`door_double`, state `chained`; lock gate
  DESIGN §9.2; script `ch7.aud_doors` handles chain/bolt cutters/key; `to: aud/from_lobby`), **`lobby_portrait`**
  (`portrait_colonel`; state from flags: `seated` until `ch5_danny_found`, `empty` after, `uniform` after `expelled` — three
  objects with conds or one with a state set by scripts), **`lobby_memorial`** (`memorial_board`, dynamic params from flags),
  **`lobby_plaque`** (doc `plaque`). `bench` (anchor `bench`), Danny's **`lobby_backpack`** (`backpack`, after the vanish
  gives `bolt_cutters` via `ch1.backpack`; Ch6 breather seat via `ch6.breather`), `water_fountain`, dead `exit_sign`s.
  A **fold** at the portrait wall.
- West opening → `west1/from_lobby`; east **double doors** `lobby_east_doors` (state `jammed` until `east_doors_open`) →
  `east1/from_lobby`. NE corner: **stage door** `lobby_stage_door` (door_side, state `locked` → opened from the aud side by
  `ch7.stage_door`) → `aud/stage_door`.
- Scripts: portrait → `ch1.portrait`; memorial → `ch1.memorial`; plaque → `ch1.plaque`; trophy → `ch1.trophy`; east doors
  jammed → `ch1.east_jammed`. Trigger `enter_lobby` (first time, Ch1) → `ch1.enter_lobby`; trigger `ch7_start` (cond
  `ch6_marcus_taken && !ch7_started`) → `ch7.start`; trigger `ch6_breather` (cond `safe_open && !ch6_breather_done`) →
  `ch6.breather`.

### 2.3 `west1` (62×30, offset (-2,22)) — maps-B
- Corridor (local rows 13–17). **North side west→east:** **103** (desks in rows; anchors `desk_103_tess`, `desk_103_leah`,
  `desk_103_marcus` on adjacent desks; door `w1_door_103`; chalkboard `w1_chalk_103`; teacher desk), **bulletin board**
  (`bulletin_board` state `bell_schedule`, doc `bell_schedule`; anchors `bulletin`, `danny_vanish` beside it), **102**
  (desks: scattered set cond `!ch1_102_rows`, rows set cond `ch1_102_rows`; chalkboard `w1_chalk_102` dynamic text §4;
  battery in the teacher's desk = Ch1 guaranteed), **101** kindergarten (tiny chairs/tables, cubbies, drawings_wall doc
  `kinder_drawings`, alphabet strip; one `tiny_chair` id `w1_tiny_chair` → `ch1.tiny_chair`), cloakroom door 101–102,
  **girls' restroom 1F** (stalls, sinks, `mirror` grimy). North rooms have exterior north walls with windows.
- **South side west→east:** the collapsed **west stairwell** (rubble, opposite 103, visible through an open doorway), the
  **main office suite** near the lobby: reception (glass door `w1_office_door`, lock `item:keyring` → sets `office_open`;
  `counter`, `mailboxes` → `ch4.mailbox`, sign-out clipboard `note_paper` doc `signout` → script `ch4.signout`, waiting
  chairs + `bench` anchor `office_bench`, lost & found box (battery; Ch4 guaranteed)), **nurse** (cot, eye chart,
  `shelf_med` → `ch4.jar`, `note_paper` doc `clipping`), **Haupt's office** (office_desk with a battery in the drawer = Ch6
  guaranteed — pickup cond chapter ≥ 6, filing_cabinet doc `discipline`, `portrait_small` id `w1_haupt_portrait` → `ch6.portrait`
  (gate chapter ≥ 6), anchor `principal_portrait`), **PA room** (`pa_console` id `w1_pa` → `sys.pa`, anchor `pa_console`;
  `master_clock`). A window in the reception's north wall looks into the corridor (glass) — used in Ch4.
- West end: **library doors** `w1_library_doors` (two stacked `door_side`, state `jammed` until `library_door_open`; text
  "It won't budge. Something's wedged against it on the other side."; after open → `library/from_west1`). Anchor
  `library_end` just east of them (Ch1 loop arrival). `from_library` = same spot.
- Batteries: 102 teacher's desk (guaranteed), office lost & found (guaranteed), Haupt's desk (Ch6 guaranteed), 1 optional (101 cubby).
- Patrol graph ≥ 6 nodes along the corridor + office reception; folds in 3 wall seams (one visible from the reception glass,
  anchor `colonel_fold_hall`); peeks for 101/102/103/girls RR/office reception.
- Past views: `principal_safe` (Haupt's office: portrait_small open, a `figure79` at the desk; cond chapter ≥ 6; setFlag
  `safe_seen_past`), `reception_1979` (a woman at the counter signing, clock 1:20), `room103_1979` (desks of faceless students;
  chalkboard "FOUNDER'S DAY — ASSEMBLY 1:45").
- Triggers: `room_enter_101/102/103/rr` (Ch1) → `ch1.room_enter`; `vanish` (rect around `danny_vanish`, cond per DESIGN §6 I.4;
  script `ch1.danny_vanish`); `office_first` → `ch4.office_enter`; `ch2_103` (cond chapter 2 && !ch2_bell1) — handled by script.

### 2.4 `library` (28×36, offset (-30,18)) — maps-B
- South = **reading room** (1F): carpet + wood; reading tables + chairs + `lamp_banker`s; **Leah's table** (anchor `leah_table`,
  `lib_leah_lamp` lit, `yearbook_pile` docs yearbook_*; after `ch5_leah_found` the table shows checkout cards); `card_catalog`
  `lib_catalog` → `ch5.catalog` (anchor `card_catalog`); `display_case` `lib_case` → `ch5.case` (anchor `display_case`);
  `librarian_desk`; `microfiche`; `book_cart`; rows of `bookshelf_tall` (opaque stacks). East wall doors to `west1`
  (barricade props `lib_barricade` cond `!library_door_open`, script `ch5.unbar` — and the knock trigger `ch5.marcus_knock`).
  Spiral `stair_spiral` at the NW → exit to `spiral_top`.
- North = **mezzanine** (2F region; `rooms[].floor = '2F'`): stacks, railing over darkness, battery (optional), east door →
  `west2/from_library` (anchor `from_west2`).
- Past view `librarian` (Mrs. Ostrowski `figure79` at the catalog with a drawer open; setFlag `saw_catalog_past`).

### 2.5 `east1` (62×30, offset (90,22)) — maps-C
- Corridor (rows 13–17). **North side:** boys' RR 1F, **east stairwell** (local x 14–18): `gate_accordion` `e1_gate`
  (lock: `s => !(s.inv.keyring && s.flags.roll1_done)`, script `ch5.gate` handles refusal/bolt cutters/unlock → sets
  `gate_2f_open`), `^` exit → `east2/from_east1`; `v` exit → `basement/from_east1`; **104** (optional: battery, chalkboard
  "MR. H SAYS HI" — `e1_chalk_104`, doc `room104_board`), janitor's closet.
- **South side:** **cafeteria** (`door_double`; long `caf_table`s, `serving_line`, `tray_rack`, `milk_cooler`, `vending_machine`,
  `banner` state `homecoming79`; past view `cafeteria_1979`), connected **kitchen** (`stove`, `sink_big`, `shelf_pantry`,
  `mixer` `e1_mixer` → `ch3.mixer`, `freezer_door` → walk-in with `cicada_shells` (examine `ch3.freezer`), `dumbwaiter`
  `e1_dumbwaiter` → `ch3.dumbwaiter`), cloakroom-style door cafeteria↔kitchen for a loop.
- East end: **gym doors** `e1_gym_doors` (`door_double`, `jammed` until `gym_open`) → `gym/from_east1`. West → `lobby/from_east1`.
- Batteries: 104 (optional), kitchen office (optional).
- Patrol graph, folds, peeks (cafeteria, RR, 104). Trigger `first_period` (cond `ch3_keyring && !ch3_period_done`, at the top
  of the basement stairs) → `ch3.first_period`. Trigger `ch3_east` (first entry Ch3) → `ch3.east_hall`.

### 2.6 `gym` (44×40, offset (152,16)) — maps-C
- Court with `court_circle` + lines; **bleachers** (`out`) along the north wall; anchor `denise` on them; `scoreboard`
  `gym_scoreboard` (`dead` → `on`); `hoop_stand`s west and east; anchor **`colonel_hoop`** under the east hoop with a dark
  heap examinable (`gym_heap`, `examine` "Gym mats. {p} ...Just gym mats.", cond `!ch6_gym_lights`); `center`. Entrance on
  the west wall (`from_east1`).
- **Four light banks**: `fluor` lights in groups `'gym1'`..`'gym4'` ordered near (west) → far (east).
- South: **girls' locker room** (door from the court; locker rows; `gym_locker_tess` at anchor `locker_tess` — `hide:'locker'`,
  script `ch6.locker`; others plain; `locker_bench`es; Ch6 battery optional), **showers** (tile, `shower_head`s, sinks + `mirror`s
  ids `gym_mirror_1..4`, anchor `shower_mirrors`, trigger → `ch6.showers`), boys' locker room (jammed, flavor).
- `marcus_photo` anchor on the court near center. Exit back to east1 gated on `denise_photo`.
- Ambience `gym` (rain drumming).

### 2.7 `basement` (60×32, offset (92,22), floor B) — maps-C
- Stairs up at local x 12–16, north (`from_east1`). **Maintenance corridor** (concrete, `~` puddles, `pipe_h/v` over,
  `cage_bulb`s group `'bsmt'` off), **boiler room** (`boiler` `b_boiler` lit, anchor `boiler`), **coal bin SW** (local x 2–14:
  `%` floor, `coal_heap` `b_coal_heap` state `occupied` until `coalbin_empty`, then `hollow`; anchor `coal_heap`; `coal_chute`
  `b_chute` on its north wall face, anchor `coal_chute`, script `ch6.chute`), **janitor's office** (≥ 10 tiles from the heap;
  door `b_jan_door` lock `s => !s.flags.ch3_jan_key`, script `ch3.jan_door` (bolt cutters alt); an invisible examine spot at
  anchor `janitor_ledge` → `ch3.ledge`; inside: `janitor_desk` (battery = Ch3 guaranteed), `cot`, `calendar` → `ch3.calendar`,
  radio, `pegboard` `b_pegboard`, key ring `pickup` `b_keyring` → `ch3.keyring`, Walt's log `note_paper` doc `walt_log`),
  **storage** (desk_pile, shelf_metal, battery optional), **electrical** (`breaker_panel` `b_panel` → `ch3.panel`).
- No patrol. `b_boiler` positional loop (system). Trigger `basement_enter` → `ch3.basement` (checkpoint).

### 2.8 `east2` (56×30, offset (96,22), 2F) — maps-D
- Corridor. **North side:** **205** (English: *Our Town* posters, desks; `danny_desk`, `desk_205_tess` two desks away;
  chalkboard `e2_chalk_205`; after `ch5_danny_found` Danny's desk shows pages), cloakroom door 205–206, **206** (biology:
  `bulletin_board` `brood` doc `brood`, `specimen_shelf`, `skeleton`, lab stools; **hall pass** `pickup` `e2_hall_pass`
  (item hall_pass) at anchor `hall_pass` → `ch5.hall_pass`; battery beside it = Ch5 guaranteed), **207** computer lab (6×
  `computer_desk` `off`/`on` per period; `e2_terminal` → `sys.terminal`, anchor `terminal`; `printer` with a battery in the
  tray given by the terminal), **boys' RR 2F**, **stair top** (local x 8–12, `from_east1`).
- **South side:** storage closet (battery optional), teachers' workroom (flavor, mimeograph).
- West end → `longhall/from_east2` (exit gated: cond `ch5_danny_found` else `ch5.longhall_refuse`).
- Patrol, folds, peeks (205, 206, 207, RR). Trigger `room205_enter` → `ch5.danny`.

### 2.9 `longhall` (40×14, offset (56,30), 2F) — maps-D
- One straight corridor. **North side:** gallery railing (`|`) over darkness (the lobby far below); across the void, a
  `portrait_colonel` (state `empty`) mounted on the far wall face so it reads as the lobby portrait seen from the gallery —
  examine `ch5.gallery`. **South side:** painted 201/202 doors (props `door_class` state `locked`, lockedText "It's painted
  on." — one id `lh_voice_door` for the voice beat), lockers, two `clock_hall`s. East end: archway sign (`banner` or `plaque`
  with text "HALL PASS REQUIRED BEYOND THIS POINT — BY ORDER OF THE PRINCIPAL"), anchors `start`, `from_east2`. West end:
  `kevin` anchor, exit → `west2/from_longhall` behind him.
- Map data extra field `longhall: { loopFromX, loopToX, kevinStopX }` for the system (document in the file).

### 2.10 `west2` (58×30, offset (-2,22), 2F) — maps-D
- Corridor. **North side west→east:** **girls' RR 2F** at the far west beside the mezzanine door (door ajar; `mirror`
  `w2_mirror` fogged; positional faucet loop; trigger at anchor `mirror_2f` → `ch5.mirror`), **201** (desks; `false_leah`
  anchor on a desk facing away from the door, `desk_201_tess` beside; door `w2_door_201` (the hold-shut door); trigger at the
  threshold → `ch5.false_leah` cond `adair_met && !false_leah_done`; past view `room201_1979` (chair empty, the mound in the
  far corner)), **202** (history: `bulletin_board` `heritage` doc `heritage`, PA map poster), cloakroom door 202–203,
  **203** chemistry lab + **204** prep (lab benches, fume hood, eyewash, chem cabinet, battery; dark window; past view
  `chem_1979` chalkboard "FOUNDER'S DAY — NO CLASSES AFTER 1:30 — ASSEMBLY 1:45").
- **Corridor:** the framed Charter excerpt `w2_charter_excerpt` (`note_paper`/`plaque` doc `charter_excerpt`) on the
  corridor wall outside 202. A railed hole where the west stair collapsed (at the same world x as west1's rubble).
- **South side:** teachers' lounge (Adair's cardigan on a chair → examine), supply closet.
- West end: **library mezzanine door** `w2_mezz_door` (lock `s => !s.flags.compact_unlocked`, lockedText "Locked. Behind me,
  a faucet is running.") → `library/from_west2`; anchor `from_library`. East end ← `longhall` (`from_longhall`).
- Patrol, folds, peeks (201, 202, 203).

### 2.11 `aud` (44×42, offset (53,-20)) — maps-A
- South: entrance from the lobby (`from_lobby`). **House**: 8 rows × 2 banks of `aud_seat`s, centre and side aisles; Ch7
  occupants via `cond` (≈ 70% husks with varied `occupant`); every aisle tile within 2 tiles of an empty seat. Front row:
  friends' seats at `front_row_danny/leah/marcus` with an **empty seat beside each** (anchors `beside_danny`, `beside_leah`,
  `beside_marcus`) and `denise_husk` beside Marcus. Rows numbered 1 (front) to 8 (back) — store row index in the seat
  object's `row` field. `back_row` anchor.
- North: **stage** (wood; `stage_front` row with steps at both ends), `lectern` at anchor `lectern` (centre), `curtain`s,
  a `spot` light group `'assembly'`; **upstage crossover** corridor behind the backdrop linking both wings (anchors
  `stage_left` = west, `stage_right` = east).
- **West wing → music room** (anchor `music_room`): `piano`, `music_stand`s, `phonograph` → `ch7.phonograph`, Adair's desk
  (sheet music doc `alma_mater`), `instrument_case` `aud_clarinet` → `ch7.clarinet` (anchor `clarinet_case`), `mirror`
  `aud_music_mirror` → `ch7.mirror` (anchor `music_mirror`), battery (Ch7 guaranteed).
- **East wing → trap room** (anchor `trap_room`): `rope_rail`, `lever` `aud_lever` → `ch7.lever`, `trapdoor` `aud_trapdoor`
  (state from `trapdoor_open`) at anchor `trapdoor` → exit to `vault/from_aud` when open (two-way exit back up exists:
  `vault` → `aud/trapdoor`); **stage door** `aud_stage_door` → `lobby` NE (`ch7.stage_door` unbars it).
- Ambience `auditorium` (Ch7: `assembly`).

### 2.12 `vault` (36×36, offset (57,-20), B2) — maps-E
- Top: `from_aud` (under-stage crawl: low wood floor, `stage_flat`s "HOMECOMING 1945"/"1962", cobwebs); trigger
  `last_roll` → `ch8.last_roll`. `stair_spiral` → `stair_bottom` (exits; conceptually several storeys). Winding descent with
  floor surfaces changing brick (`.`→ use concrete/stone tiles) → stone → coal (`%`/`;`), drips, embers near the bottom.
- **Founder's Vault** (marble ~14×12): `sarcophagus` `v_sarcophagus` `burst` (anchor `sarcophagus`, → `ch8.sarcophagus`),
  `wreath`s, `flag_regimental`, `name_wall`s, unlit `candle`s, `writing_desk` + `husk_kneeling` (anchor `adair`, → `ch8.adair`).
- East: coal passage → exit `breaker/from_vault` (cond `red_pen`; else `ch8.no_light`), anchor `to_breaker`. Trigger
  `vault_enter` → `ch8.vault`.

### 2.13 `breaker` (60×44, offset (45,-30), B3) — maps-E
- Cavern floor (south) of gravel/coal around red-glowing `pit`s (`mine_fire` lights). The breaker rises north: plank
  walkways with `railing`s zig-zagging up, `chute`s, `picking_bench`es with 17 breaker-boy husks (`husk_seated` props or
  `breakerboy` entities) each with a `lamp_miner` light in group `'lamp_1'..'lamp_17'` (lit one by one by the system as Tess
  climbs), `beam`s, a `pulley_wheel` overhead. Landings `stairs_1`, `stairs_2`. Top: **weigh-master's office** (timber;
  `weigh_desk` + `register_book` `br_register` → `sys.register`, anchor `register`; `shelf_ledgers` doc `ledger_colonel`;
  `note_paper` doc `inquiry_1894`; anchor `office`; trigger `office_enter` → `ch8.office`). `floor` anchor at the bottom;
  `from_vault` at the SW entrance; trigger `breaker_enter` → `ch8.breaker`.
- Chase route for the escape: clear path from `register` back down to `from_vault`.

---

## 3. Scripts — files, owners, ids

| File | Owner | Ids (minimum; add helpers under the same prefix) |
|---|---|---|
| `scripts/pro.js` | narrative-1 | `pro.start`, `pro.car`, `pro.oak`, `pro.sign`, `pro.danger`, `pro.motto`, `pro.doors` |
| `scripts/ch1.js` | narrative-1 | `ch1.start`, `ch1.enter_lobby`, `ch1.portrait`, `ch1.memorial`, `ch1.plaque`, `ch1.trophy`, `ch1.east_jammed`, `ch1.vestibule_refuse`, `ch1.backpack`, `ch1.room_enter`, `ch1.tiny_chair`, `ch1.danny_vanish`, `ch1.voice_102`, `ch1.room102`, `ch1.front_loop`, `ch1.end` |
| `scripts/items.js` | narrative-1 | `item.mixtape`, `item.camcorder`, `item.gum` |
| `scripts/ch2.js` | narrative-2 | `ch2.start`, `ch2.sit`, `ch2.glimpse`, `ch2.after`, `ch2.vhs`, `ch2.marcus`, `ch2.end` |
| `scripts/ch3.js` | narrative-2 | `ch3.start`, `ch3.east_hall`, `ch3.dumbwaiter`, `ch3.mixer`, `ch3.freezer`, `ch3.basement`, `ch3.heap`, `ch3.stir1`, `ch3.stir2`, `ch3.jan_door`, `ch3.ledge`, `ch3.calendar`, `ch3.keyring`, `ch3.panel`, `ch3.first_period`, `ch3.end` |
| `scripts/ch4.js` | narrative-2 | `ch4.start`, `ch4.office_enter`, `ch4.signout`, `ch4.mailbox`, `ch4.jar`, `ch4.pa_listen`, `ch4.roll1`, `ch4.hide`, `ch4.end` |
| `scripts/ch5.js` | narrative-3 | `ch5.start`, `ch5.gate`, `ch5.danny`, `ch5.period205`, `ch5.hall_pass`, `ch5.longhall_refuse`, `ch5.longhall_enter`, `ch5.gallery`, `ch5.longhall_loop`, `ch5.longhall_voice`, `ch5.kevin_pass`, `ch5.kevin_whistle`, `ch5.mirror`, `ch5.room202`, `ch5.false_leah`, `ch5.library_enter`, `ch5.leah`, `ch5.catalog`, `ch5.case`, `ch5.marcus_knock`, `ch5.unbar`, `ch5.end` |
| `scripts/ch6.js` | narrative-4 | `ch6.start`, `ch6.portrait`, `ch6.safe_open`, `ch6.breather`, `ch6.gym`, `ch6.chase`, `ch6.locker`, `ch6.after_locker`, `ch6.showers`, `ch6.alone`, `ch6.chute` |
| `scripts/ch7.js` | narrative-4 | `ch7.start`, `ch7.aud_doors`, `ch7.aud_enter`, `ch7.roll3`, `ch7.front_danny`, `ch7.front_leah`, `ch7.front_marcus`, `ch7.clarinet`, `ch7.mirror`, `ch7.phonograph`, `ch7.stage_door`, `ch7.lever`, `ch7.trapdoor` |
| `scripts/ch8.js` | narrative-5 | `ch8.start`, `ch8.last_roll`, `ch8.vault`, `ch8.sarcophagus`, `ch8.adair`, `ch8.no_light`, `ch8.breaker`, `ch8.office`, `ch8.after_register`, `ch8.escape`, `ch8.escape_present`, `ch8.dismissal` |
| `scripts/end.js` | narrative-5 | `end.dismissed`, `end.withdrawn`, `end.present`, `end.truant`, `end.coda`, `end.credits` |
| `scripts/sys.js` | systems | `sys.pa`, `sys.safe`, `sys.terminal`, `sys.register`, `sys.caught` |
| `scripts/gen.js` | systems | `gen.locked`, `gen.no_seats`, `gen.front_loop`, `gen.locker_not_hide`, `gen.nothing` |

Flow: each chapter's last script calls `await g.chapter(N)` then `await g.run('chN.start')`. Every scene sets `seen_<id>` the
first time and checks it on replay (DESIGN §9.3). Speaker rules: mimic lines use `g.say('voice', null, text, { name: 'Danny?' })`;
Adair never uses `say` — her fog lines are `g.narrate('{dim}DON\'T ANSWER HIM{/dim}')` style plus `g.sfx('glass_write')`; the
Colonel uses `'voice'` styling (name `???`) until the gym, then his own speaker with a bust in at most 3 beats.

---

## 4. Dynamic text & variant tables

| Prop | Behaviour |
|---|---|
| `w1_chalk_102` | blank → `DANIEL KOVACH — PRESENT` (ch1_102_rows) → + `LEAH BRANDT — PRESENT` (ch2_leah_taken) → + `THERESA DOLAN — ABSENT` or `— PRESENT` after roll #1 (by answer) → + `MARCUS WEBB — PRESENT` (ch6_marcus_taken) |
| `lobby_portrait` | `seated` until `ch5_danny_found`; `empty`; `uniform` after `expelled` |
| `lobby_memorial` | polaroids: danny after `ch1_danny_vanished`, leah after `ch2_leah_taken`, marcus after `ch6_marcus_taken`; `tessFrame` from `ch7_started`; params `inkDanny/inkLeah/inkMarcus` (true if unbonded) and `tessState` (0/1/2 by rollAnswered) |
| `b_coal_heap` | `occupied` until `coalbin_empty`; `hollow` after |
| `lobby_east_doors` | `jammed` until `east_doors_open` |
| `e1_gym_doors` | `jammed` until `gym_open` |
| `w1_library_doors` | `jammed` until `library_door_open` |
| `e2` computers | `on` while a period is active |
| hall `clock_*` | params.time from `HW.periods.clockTime()` (1:40→1:45 passing, 1:45→1:46 period) else 1:40 |
| `e2_chalk_205` | after `ch5_danny_found`: `I WILL NOT LEAVE` ×n (or `I WILL NOT LEA` if bond_danny) |

---

## 5. Gameplay systems (owner: systems) — `src/game/*`

Files: `periods.js`, `colonel_ai.js`, `noise.js`, `patrol.js` (Kevin), `chapters.js`, `endings.js`, `longhall.js`,
`basement.js`, `assembly.js`, `chase.js`, `breaker.js` (lamps), `index.js` (registers all with `HW.game.addSystem`; main.js
imports it), `src/data/puzzles.js`, `src/data/scripts/sys.js`, `src/data/scripts/gen.js`.

### 5.1 Numbers
Player walk **60 px/s**, run **112 px/s**. Colonel drag 26 px/s (patrol), chase = drag 30 + lunge 150 px/s for 0.5 s every
~1.4 s (avg ≈ 73 px/s). Detection per second = lerp(2.0 at ≤ 2 tiles, 0.5 at range edge) × 1.5 moving × 2 running × 1.5 lit;
decays 0.4/s unseen. Cue at 0.35 (soft "hm?", breath catch, vignette tightens). At 1.0 → "Who is out of their seat?" (only the
first time per chapter; otherwise just the hm) + 0.8 s notice → chase. Vision 100° cone, 7 tiles (10 if flashlight on or
`lightAt(player) > 0.45`). Catch radius 14 px.

### 5.2 Periods — `HW.periods` (DESIGN §4.1)
`enable({ maps, passing, length, max })`, `disable()`, `start({ scripted, length, guided })`, `end()`, `active`,
`timeLeft`, `clockTime()`, hooks `onStart/onEnd`. Warning → 10 s → bell (free: short + lowpassed) → lights group `period`
on (stutter) → `period_buzz` layer → computers on → Colonel spawns at a fold ≥ 12 tiles away, out of view, if the map has
`patrol` (else overhead footsteps + dust) → ends 10 s after he peeked into Tess's room, or at 60 s → dismissal bell → he sinks
→ lights off. Followers sit on the warning. Hold-confirm-while-seated = ×4 time. Guards per DESIGN §4.1. Entering a patrol
map mid-period: he spawns 6 s later at a fold ≥ 12 tiles away.

### 5.3 The Colonel — `HW.colonel`
Modes `off | patrol | investigate | chase | search | scripted | assembly | escape | sleep`. Patrol on the map graph with peek
memory (no room twice per period, ≤ 3 peeks); peeks open the door audibly (`door_creak_slow`), `peek_<dir>`, scan 2–3 s;
escalation by chapter (Ch3 shadow only — no entry; Ch4 doorway; Ch5 steps in one row). **Seated + still = invisible**
unless he saw Tess *sit* in the last 1.5 s; seated but moving within 4 tiles in his cone fills detection. Close-pass
micro-beat (DESIGN §4.1). A map transfer ends a chase (he reappears at the next bell). Caught → `reach` + `colonel_grab` →
`HW.game.gameOver(reason)` (reason by context: `hall_after_bell`, `out_of_seat`, `woke`, `chase`). Respect `HW.debug.god`.
**Shroud** ("the light dies where he is", until `ch6_gym_lights`): expose `HW.colonel.shrouded` + position; lighting dims
`period` lights within 3.5 tiles; renderer draws him near-black with an emissive mask (brass/gold/crimson pixels).
**Assembly**: READ 7–9 s → telegraph 2.0 s (`page_turn`, "Hm." at −1.0, spotlight drift) → SCAN 3 s (4.5 after a silent roll
#3); running anywhere in the aud → immediate scan; sitting is safe at once in this mode; front-row scenes pause the cycle.
**Escape**: relentless pursuit; rubber-band to keep Tess 4–8 tiles ahead when moving well; `cannotCatch` flag for
`ch8.escape_present`.

### 5.4 Noise — `HW.noise.emit(x, y, radiusTiles, kind)`
run 7 · walk 1.5 · door 5 · item 8 · mixer 12 · panel 10 · bolt_cutters 6 · whistle map-wide.

### 5.5 Basement (`basement.js`)
While `b_coal_heap` is `occupied`: noise of kinds {run, door, item, mixer, panel, bolt_cutters} whose source is ≤ 8 tiles from
the heap adds stir (cooldown 3 s; **walk never stirs**; decays 1 per 20 s quiet). Panel only sets stir 1 when it is 0. Stir 1 →
`ch3.stir1`; stir 2 → `ch3.stir2` (rise → chase; escapable via the stairs; caught → `woke`). Positional boiler loop; ambience
ducks −18 dB within 10 tiles of the occupied heap.

### 5.6 Long hall (`longhall.js`)
Per DESIGN §6 V.4. Without `hall_pass`: passing `loopFromX` westward teleports seamlessly to `loopToX`; `longhall_loops`++;
strip one ambience layer per loop; hall clocks +1 min per loop; non-blocking `ch5.longhall_loop` (loop index) and loop 4 →
`ch5.longhall_voice`. Running → `ch5.kevin_whistle`. With the pass: reaching `kevinStopX` → `ch5.kevin_pass`. Walking east
exits normally. After `longhall_cleared`, the system turns off.

### 5.7 Safety Patrol (`patrol.js`)
Kevin sentinels: spawned by scripts/maps (Ch4 glimpse in west1; Ch5+ at the far end of east2 or west2 per map load, never
visible at load; Ch6 east1 on the walk back). Head tracks Tess; if she runs in LOS ≤ 10 tiles → `whistle` → standard warning
starts now (or, during a period, the Colonel investigates the whistle position). Never a death source. In DISMISSED: belt off.

### 5.8 Assembly (`assembly.js`), chase (`chase.js`), breaker lamps (`breaker.js`)
Assembly per §5.3; roll #3 when Tess first *sits* in rows 1–4 (`row` field). Chase set pieces: gym chase (scripted lunge
across half the court, then route to the locker room; rubber-band), Ch8 escape with per-map checkpoints. Breaker: lamps light
one by one ahead of Tess as she climbs (by y thresholds); in DISMISSED they go out peacefully.

### 5.9 Endings (`endings.js`)
DESIGN §8 exactly: Register model for the UI (lines, ink, tools, provisional apply + start over, previews, refusals in voice,
grounds, hold-to-write expulsion), `commit()` sets `withdrawn_*`, `form_used_on`, `expelled`, `register_done`;
`resolveEnding()`. Keepsake missing → treat as present and `console.warn`.

### 5.10 Puzzle data (`src/data/puzzles.js`)
`PA_ROOMS` (16 switches: 101 102 103 104 201 202 203 205 206 207 LIB GYM CAF AUD BSMT OFFICE; per-chapter text/sfx; ALL CALL
rules); `TERMINAL` (boot lines; commands RUN, LIST, HELP, EXIT, surname lookups with statuses PROVISIONAL/PERMANENT/ABSENT/
WITHDRAWN/NOT DISMISSED per DESIGN; HALLOWELL → Charter pointer; ADAIR → "LAST ENTRY: \"H, FOR HALLOWELL\""; printer battery
once); `SAFE` `{ label: 'FIRST FOUNDER\'S DAY (mo-day-yr)', combo: [10, 19, 94], wrong: { '10-19-23': ..., '10-19-11': ..., ... } }`.

---

## 6. Lore (owner: lore)
`src/data/docs.js` — every doc in DESIGN §11 (content contracts there), plus `tess_draft` (in Notes from the start). Word
limits as DESIGN §11. Final item descriptions in `src/data/items.js` (`desc` only).

---

## 7. Engine/UI deltas required by DESIGN v2 (integration owner)
- Player speeds 60/112 px/s. Classroom/office doors auto-close 1.5 s after the player passes (unless a script holds them open).
- `g.gameOver(reason)` → UI referral slip with infraction text by reason (DESIGN §9.4).
- Screens: `vhs` (modal frame scrubber over `vhs_frames`), `write` (hold-confirm meter variant of `breath`, label + progress
  callback), `register` per DESIGN §8 (provisional, start over, previews, grounds prompt, reason text, close confirm).
- Tess portrait `enrolled` levels: `opts.enrolled` = 0 / 1 / 2 (catchlight / sheen) — UI passes `HW.state.rollAnswered`-derived
  level for Tess automatically.
- Renderer: Colonel shroud (near-black + emissive mask from brass/gold/crimson palette pixels) while `HW.colonel.shrouded`.
- Lighting: dim `period` lights within 3.5 tiles of `HW.colonel` while shrouded.
- `seen_` fast-forward: holding Cancel 0.75 s fast-forwards dialogue whose scene was already seen (choices still stop).
- Assist: after 2 deaths at the same checkpoint label, telegraphs/meters +30% (`HW.state.assist`).
- Follower light: Danny's red flashlight cone (Ch1) as a light attached to the follower; `danny_flashlight` usable as a weak light.
- Battery drain 600 s; dregs at 0%.
