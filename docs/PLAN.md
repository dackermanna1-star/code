# Liminal Moscow — Master Plan

A slow, lonely first-person walk through a Moscow residential district (spalny rayon) on a winter
evening in 2008. No objectives, no HUD. The city is the protagonist. The feeling: walking home
alone at dusk with an old phone in your pocket, snow falling under orange street lamps. Quiet,
melancholic, nostalgic, subtly uncanny — never horror, no jump scares, no monsters.

Read `docs/ENGINE.md` (API) and the research in `docs/research/*.md` (architecture, streets, metro,
soundscape, mood: real dimensions, hex colours, Russian texts with translations, sound synthesis
recipes, anomaly ideas). `docs/ATMOSPHERE.md`, if present, is a merged digest of the same.

## Art direction rules (apply to everything)
- Restrained, realistic, low-res voxel look. Not cartoonish, not colourful. Palette: dirty whites,
  blue-grey snow shadow, desaturated cyan, faded concrete grey, muted brown, dull green, and
  occasional warm amber light. Saturated colour only in small doses (a red sign, a yellow curtain).
- Everything outdoors carries snow: add `addSnow` to tops of every outdoor model; snow piles at
  walls, on car roofs/hoods, benches, playground bars, rooftops, window sills, canopies.
- Real proportions. Buildings are enormous next to the player (eye height 1.62 m). Doors ~1 m wide,
  2.1 m tall; ceilings 2.5–2.7 m; steps 1 voxel high.
- Weathering: rust streaks, patched panels, uneven glazing of balconies, broken lamps, graffiti tags,
  torn notices. Repetition is intentional (identical buildings), but every instance gets a `seed`.
- Period: 2007–2009. No smartphones, no LED screens, no modern cars. CRT TVs, Lada/Moskvich/Volga,
  early foreign cars, payment terminals, kiosks, payphones, paper notices.
- All signage in Russian (Cyrillic). Give every readable thing an English translation (`en`).
  Use plausible fictional brand names (parodies), never real trademarks.

## Map (meters; x east, z south; ground y = 0.25 unless noted)
```
z=0    ┌──────────────────────────────────────────────────────────────────┐ open snow (wrap band)
z=40   │ RAILWAY embankment z 40–56 (track bed y≈1.25, double track along x)│  pkg: north
z=60   │ INDUSTRIAL EDGE z 60–128: garages (x40–200), boiler house+chimney  │  pkg: north
       │ (x220–300, chimney at 262,95), warehouse base (x330–460),          │
       │ substation & wasteland (x480–600)                                  │
z=132  │ ул. Заводская (2-lane street) z 132–144, x 24–616, heat pipe z≈146 │  pkg: north
z=144  ├────────┬──┬─────────────┬───┬──────────────┬───┬──────────────────┤
       │ PARK   │Бе│  BLOCK A    │ d │   BLOCK B    │ d │    BLOCK C       │
       │ x24–140│рё│ x150–302    │ r │  x308–456    │ r │   x462–600       │
       │        │зо│ school,     │ i │  2 towers,   │ i │   long 9-storey, │
       │ birch  │ва│ 5-storeys   │ v │  kindergarten│ v │   rakushki       │
z=322  │ grove, │я │─────────────┴───┴── E–W driveway z 322–328 ─────┴──────│
       │ frozen │  │  BLOCK D    │   │   BLOCK E    │   │    BLOCK F       │
       │ pond   │ул│ HOME court- │   │  17-storeys, │   │  repeat of D's   │
       │        │  │ yard        │   │  shop        │   │  layout          │
z=508  ├────────┴──┴─────────────┴───┴──────────────┴───┴──────────────────┤
z=508  │ north sidewalk z 508–524 (trolleybus stop at x 240–256)            │  pkg: avenue
z=524  │ ПРОСПЕКТ СТРОИТЕЛЕЙ: carriageway z 524–538, median 538–542,         │  pkg: avenue
       │ carriageway 542–556 (road y = 0.0). Underpass under x 378–392.      │  pkg: metro
z=556  │ south sidewalk z 556–572                                           │  pkg: avenue
z=572  │ SOUTH STRIP: kiosks (x395–440), shop pavilion (x450–470), 9-storey │  pkg: avenue
       │ row facing north (z 580–596), BUS TERMINAL loop x 530–600 z 574–606│
z=600  └──────────────────────────────────────────────────────────────────┘ open snow (wrap band)
```
Driveways (проезды, 6 m, asphalt/packed snow, y=0): N–S at x 302–308 and x 456–462 (z 144–524),
E–W at z 322–328 (x 150–600). ул. Берёзовая N–S street x 140–150 (z 132–524).
The avenue and the railway continue through the east/west wrap bands so you can walk along them
forever. Everything else in the bands is open snow at y = 0.5 (deep snow).

Street names (fictional, typical): проспект Строителей, ул. Заводская, ул. Берёзовая,
3-й Молодёжный проезд. District: микрорайон «Восточный». Metro station: «Заречная».
House numbers: Block D buildings are ул. Берёзовая д. 12 корп. 1–3; Block F is д. 14 корп. 1–3.

## Spawn & soft narrative
- Spawn: 16:38, light snow, at the trolleybus stop on the north sidewalk (≈ x 248, z 515), facing
  north toward the district. A trolleybus is pulling away.
- Home is Block D, building корп. 2, подъезд 3 (enterable, with elevator). The phone has an SMS from
  mum: «Ты где? Купи хлеба.» (Where are you? Buy bread.) — the shop is in Block E. Nothing forces it.
- Anomalies / supernatural events are OUT OF SCOPE for now (lead decision). The uncanny mood comes only
  from ordinary things: emptiness, repetition, fog, silence, distant sounds, long waits.

## Packages & ownership (one folder each under src/content/)
Phase A (assets & systems):
| pkg | owns |
|---|---|
| `base` | (lead) base terrain fill, world bands, spawn, sky/time defaults |
| `residential` | panel/brick residential sections (P-44 9 & 17 floors, II-49, 1-515, P-44T, khrushchyovka K-7/brick 5-storey), roofs, balconies, entrances, entrance doors (dynamic), porch lamps, plates; enterable stairwells with elevator; API `placeResidential(ctx, opts)` |
| `public` | school, kindergarten, shop pavilion «Продукты» with interior, small kiosks (ларьки), pharmacy, boiler house + chimney, brick garage rows, warehouse, substation, bus-terminal dispatcher booth, hockey box; APIs per building |
| `street` | street lamps (cobra on concrete pole, double-arm median pole, courtyard pole lamp, park lantern), benches, playground set, carpet rack, sandbox, garbage container area, rakushka garages, fences (concrete diamond panel ПО-2, low metal, kindergarten bars), bus/trolleybus stop pavilion, payphone, payment terminal, mailbox, road signs, trolleybus poles + wires, heat pipe, manholes (with steam), tire planters/swans, notice boards; APIs `placeStreetLamp`, etc. |
| `nature` | trees (birch, poplar, maple, spruce, apple), bushes (lilac), dry weeds, snow piles/drifts helpers, frozen pond kit, crows (animated, flying off), steam plume particles |
| `vehicles` | parked cars (VAZ-2107, 2109, 2110, Moskvich-2141, GAZ-3110 Volga, a foreign hatchback, Gazelle van, UAZ «буханка»), snow-buried variants; LiAZ bus, ZiU trolleybus, KAMAZ snowplow, elektrichka train; traffic system on the avenue (sparse, headlights as lights, wrapping), trolleybus that stops at the spawn stop, train passing on the railway; API `placeParkedCar(ctx, x, z, angle, opts)` |
| `metro` | underpass under the avenue (x 378–392, stair pits on both sidewalks z 509–518 and z 560–569, kiosks inside, tiles, fluorescent lights), metro vestibule + turnstiles + escalators down to «Заречная» platform hall (deep, y ≈ −16), interval clock, trains arriving rarely at the end-of-line platform (no riding), surface «М» entrance signs. Places itself in the world. |
| `audio` | every sound: footsteps per surface, wind, distant traffic, trolleybus, metro rumble, hums (50 Hz), elevator, intercom, doors, dogs, crows, muffled TV/conversations, janitor scraping, breathing in silence, phantom footsteps, sparse ambient music (analog drones), distant radio; the ambience director (zone/time/weather aware, occasional total silence). Exposes named sounds other packages `audio.play()` |
| `phone` | the period phone (`game.phone`): Q to take out, clock/date, operator, battery, SMS inbox + rare new SMS, contacts/calls («Абонент недоступен»), Snake, flashlight (F), settings; plus `ui` helpers for readable notices and an extensive library of Russian texts (notices, posters, ads, graffiti) with translations |
| `life` | rare distant pedestrians (voxel people, walk cycles) using `navPaths`, a stray dog, environmental-storytelling props helper (no anomalies) |

Phase B (layout, uses Phase A catalogs in `docs/catalog/*.md`):
| pkg | region |
|---|---|
| `avenue` | z 500–600 all x (except the underpass/metro footprint owned by `metro`), bus terminal, south strip, wrap continuation |
| `blocks_west` | Blocks A, D, F (F repeats D's layout), ул. Берёзовая |
| `blocks_east` | Blocks B, C, E, driveways |
| `north` | park (x 24–140), ул. Заводская, industrial edge, railway |

## Conventions
- Material/model names: snake_case, prefixed by package where ambiguous (`street_bench_park`).
- Each Phase A package writes `docs/catalog/<pkg>.md`: every model name with size in meters, pivot,
  facing, options, and every exported helper with a usage example. Phase B relies on it.
- Tag placements meaningfully (`tag: 'entrance'`, `'lamp'`, `'building'`, `'car'`) — audio and
  life use tags. Register useful things in `ctx.registry` (e.g.
  `registry.entrances = [...]`, `registry.stops = [...]`, `registry.windowsLit = ...`).
- Use `ctx.rng(seed)` / `RNG` for all randomness (deterministic city).
- Performance budget: aim for < 600 draw calls and < 3 M triangles in view; prefer instancing the
  same model many times over many unique models; keep big models in sections.
- Never leave debug geometry or console spam.
