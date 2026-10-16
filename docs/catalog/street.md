# Catalog: `street` — street furniture & courtyard props

Package `src/content/street/` (order 27). `build()` places **nothing** in the real game: layout
packages call the helpers in **`src/content/street/api.js`**. (A private showcase scene is built
only with `?streettest=1&only=base,street` — never in the game.)

```js
import { placeStreetLamp, placeBench, placePlayground, placeFence } from '../street/api.js'
```

## Conventions (read first)

- **Angle / facing.** Every helper takes `angle` (radians). A model's **front is its local +Z** and
  faces direction **(sin angle, cos angle)** — the same convention as `signs.add({angle})`:
  `angle 0` → front faces **south (+z)**, `π/2` → **east (+x)**, `π` → **north**, `−π/2` → **west**.
  To face a point: `angleFacing(dx, dz)`; to run a model's local +X along a line: `angleAlong(dx, dz)`
  (both exported from `api.js`). With `world.place(..., {rot})`: rot 0 → front south, rot 1 → east,
  rot 2 → north, rot 3 → west.
- **Pivot** is bottom-centre of the footprint unless noted (wall-mounted things: back plane centre).
- `y` defaults to terrain height at (x, z). Pass `y` explicitly on raised surfaces.
- `seed`: integer, string or 0..1 float. Everything is deterministic.
- Models with **`paint` / `paint_matte`** parts take the placement `tint`. The helpers always pass a
  period-appropriate faded tint; if you `world.place` such a model directly, pass `tint` yourself
  (listed as *tint* below).
- All outdoor models carry voxel snow on exposed tops (heat pipes deliberately not: the snow melts).
- Tags set on placements: `lamp`, `bench`, `playground`, `swing`, `carousel`, `yard`, `fence`,
  `garage`, `container`, `garbage`, `litter`, `bin`, `story`, `stop`, `trolley_pole`, `sign`,
  `traffic_light`, `payphone`, `terminal`, `vending`, `mailbox`, `heatpipe`, `manhole`, `cabinet`,
  `bollard`, `billboard`, `notice`. Lights: `lamp` (all street lamps), `stop_light`, `traffic_light`,
  `screen`, `vending`, `billboard`.

## Registry keys (`ctx.registry.*`, arrays pushed by the helpers)

| key | entry |
|---|---|
| `streetLamps` | `{x, z, y, type, placement, light, lights, broken}` — the anomaly director can switch `light.enabled` |
| `benches` | `{x, z, angle, type, seat:{x,y,z}, placement}` (pavilion benches are not listed) |
| `stops` | `{x, z, angle, name, routes, kind:'trolleybus'|'bus', curb:[x,z], placement}` — `curb` is 2.2 m in front of the pavilion centre |
| `trolleyWires` | `{points:[[x,y,z]...], height}` — each contact wire polyline (for trolley poles of vehicles) |
| `steamVents` | `{x, y, z, strength 0..1, kind:'manhole'|'heatpipe'}` — **steam markers**: nature/layouts may add steam plumes here (read them in `init`) |
| `playgrounds` | `{x, z, angle, set, bounds:{w,d}}` |
| `trafficLights`, `roadSigns`, `payphones`, `noticeBoards`, `garages`, `garbage`, `heatPipes` | positions for audio/life |

`ctx.events.emit('sit', {x, z, kind})` fires when the player sits on any of our seats.

## Sounds used (owned by the `audio` package; all calls guarded with `audio.ready && audio.has(name)`)

`swing_creak` (loop, positional; created lazily within ~32 m of a swaying swing, gain follows the
amplitude; the carousel uses it too with `{pitch: 0.7, period: 1.6}`), `payphone_dial` (loop,
non-spatial while the receiver is up), `phone_key`, `phone_unavailable`, `click`.

---

## Lamps — `placeStreetLamp(ctx, opts)` → `{ placement, light, lights }`

Places the model **and** a calibrated light linked to the placement (the emissive head warms up
pink→orange, dims and flickers with the light). Registers `registry.streetLamps`, tags `lamp`.

```js
placeStreetLamp(ctx, { x: 250, z: 523.3, angle: 0, type: 'cobra' })          // sidewalk, head over the road (south)
placeStreetLamp(ctx, { x: 160, z: 330, type: 'courtyard', angle: Math.PI / 2, bulb: 'mercury' })
placeStreetLamp(ctx, { x: 60, z: 260, type: 'park' })                         // ~40 % come out smashed
placeStreetLamp(ctx, { x: 200.1, z: 410, type: 'wall', angle: Math.PI / 2, y: 2.8 })  // over an entrance door
```

opts: `{ x, z, y?, angle (direction the head reaches toward), type, height?, pole?, bulb?, broken?,
flicker?, seed, flyers?, intensity?, tag }`
- `broken`: `true/false`; **undefined → seeded chance** (cobra 8 %, courtyard 20 %, park 40 %, wall 25 %).
  Broken = head dark (`flag 0`), no light; park lanterns get the smashed-globe model.
- `flicker`: `true` (type default: sodium `'cycle'` = end-of-life cycling, mercury/park `'buzz'`, wall
  `'dying'`) or a Lights flicker name; undefined → small seeded chance.
- `flyers`: tear-off flyers on the pole at 1.5 m (readable); undefined → 30 % on cobra/courtyard.

| type | model(s) | size (m) | light |
|---|---|---|---|
| `cobra` | `street_lamp_cobra` (СВ-95 concrete pole, curved bracket, ЖКУ head) | 0.5 × 10.25 × 3.0; head bowl at 9.5 m, 2.5 m forward | sodium `0xff9a3c`, spot 55 / range 24 / cone 58 / inner 28, tilted forward, schedule `street` |
| `cobra` + `pole:'steel'` (or `height > 10`) | `street_lamp_cobra_steel` (galvanized, carries a span-wire eye at 7.25 m) | 0.5 × 11.25 × 3.0; bowl 10.5 m | same |
| `cobra_double` | `street_lamp_cobra_double` (median pole, two arms ±Z, span-wire eyes at 7.25 m both sides) | 0.5 × 11.25 × 5.75; pivot at the pole, heads ±2.25 m | two sodium spots (50) |
| `courtyard` | `street_lamp_courtyard_{metal,concrete}_{sodium,mercury}` (6.25 m pole; metal pipe is *tint*ed) | 0.5 × 7.25 × 2.0; bowl 6.5 m, 1.25 m forward | sodium 30 / range 18 / cone 62, or mercury `0xcfe6e8` 26 |
| `park` | `street_lamp_park`, `street_lamp_park_broken` (cast-iron post, frosted globe) | 0.75 × 5.0 × 0.75; globe at 4–4.5 m | point, warm `0xffb868`, 9 / range 11 |
| `wall` | `street_lamp_wall` (round «tablet» fixture), `street_lamp_wall_cage` (bulb in a cage) | 0.75³; **pivot = back plane centre, bottom** | warm incandescent `0xffc27a`, spot 8 / range 9 / cone 72, schedule `night` |

Wall lamp: `x,z` = point on the wall surface, `angle` points away from the wall, `y` = absolute
mount height of the top of the bracket (default terrain + 2.55 m).

`placeLampRow(ctx, { x0, z0, x1, z1, spacing=30, ...lampOpts })` → array of results.

## Benches — `placeBench(ctx, opts)` → `{ placement, interaction, seat }`

Adds a **'Сесть / Sit'** interaction (`player.sit`, stand-up position 0.75 m in front; the view
turns to face out from the bench). opts: `{ x, z, y?, angle (sitter faces this way), type,
sittable=true, snow: true|false|'brushed'|'auto' (auto: 20 % brushed), mittens=false, seed }`.
`mittens: true` leaves a pair of red children's mittens on the seat (`street_mittens`, tag `story`).

| model | size (m) | notes |
|---|---|---|
| `street_bench_park[_brushed|_none]` | 2.0 × 1.25 × 0.75 | cast-iron sides, wooden slats, back at local −Z |
| `street_bench_courtyard[...]` | 2.0 × 1.25 × 0.75 | concrete legs, green slats, back on steel brackets, a slat missing |
| `street_bench_entrance[...]` | 1.75 × 1.25 × 0.5 | no back (by the подъезд) |
| `street_bench_stop[...]` | 1.5 × 1.25 × 0.5 | galvanized slats |
| `street_mittens` | 0.5 × 0.25 × 0.25 | non-colliding |

Seat top is 0.5 m above the pivot. `_brushed`: snow swept off a 0.5 m stretch in the middle;
`_none`: no snow (under canopies). `addSeat(ctx, {x, z, angle, seatY, lx, lz, width, depth})` adds the
sit interaction to any seat of your own (e.g. a stairwell windowsill).

## Playground

`placePlayground(ctx, { x, z, angle, seed, set: 'full'|'small', lamp, fence=true, mittens })`
→ `{ placements, swings, carousel, benches, lamp, bounds }`. The entrance gap of the low arched fence
is at the front (local +Z). **full ≈ 22 × 16 m** (rocket, double swing, dome or monkey bars,
carousel 75 %, sandbox (fly-agaric canopy 70 %), see-saw, bars or Swedish wall, play-house 60 %,
2–3 benches facing in, two tyre swans at the gate, tyre planters, one courtyard lamp at the
front-left corner). **small ≈ 12 × 9 m** (single swing, sandbox, carousel or see-saw, Swedish
wall, bench, swan, planters). Layout mirrors left/right by seed.

| model | size (m) | pivot / facing | helper |
|---|---|---|---|
| `street_pg_rocket` | 6.5 × 7.5 × 3.25 | **pivot = cage axis**; the chute leaves toward local **+X**; fins at −X, ±Z | `placeRocketSlide` |
| `street_pg_dome` («паутинка») | 3.25 × 2.0 × 3.25 | centre | `placeClimbingDome` |
| `street_pg_swing_frame` / `_double` | 2.25 / 3.75 × 2.75 × 2.25 | bar along local X; *tint* | `placeSwing(ctx, {x,z,angle,seats:1|2,tint,still})` |
| `street_pg_swing_seat_0..12` | 0.75 × 2.5 × 2.25 | pivot under the hinge; frames of the swing (−24°…+24°) | (dynamic, used by `placeSwing`) |
| `street_pg_carousel_base` + `street_pg_carousel_disc` | 0.75 × 0.25 / 2.25 × 1.5 × 2.25 | centre; disc is **dynamic**, turns now and then by itself, 'Толкнуть карусель' pushes it | `placeCarousel(ctx, {x,z,seed,pushable})` |
| `street_pg_bars` (турник, 3 heights) | 3.25 × 2.75 × 0.25 | along X | `placeBars` |
| `street_pg_ladder` (шведская стенка) | 1.75 × 2.5 × 0.25 | along X | `placeLadder` |
| `street_pg_monkeybars` (рукоход) | 3.25 × 2.75 × 1.25 | along X | `placeMonkeyBars` |
| `street_pg_seesaw` | 3.25 × 1.5 × 0.75 | beam along X (high end +X) | `placeSeesaw` |
| `street_pg_sandbox` / `_mushroom` | 2.25 × 0.75 / 3.25 × 2.25 | snow-filled; mushroom = red-cap canopy | `placeSandbox(ctx, {..., mushroom})` |
| `street_pg_house` | 2.0 × 2.75 × 2.0 | door at +Z, roof *tint*, occludes snow | `placePlayhouse` |
| `street_tyre_planter` | 0.75 × 0.5 × 0.75 | *tint* | `placeTyrePlanter` |
| `street_tyre_half` | 0.75 × 0.5 × 0.25 | half-buried border tyre, *tint* | `placeFence({type:'tyres'})` |
| `street_tyre_swan` | 0.75 × 1.5 × 1.75 | swan faces +Z | `placeTyreSwan` |
| `street_carpet_rack` (выбивалка) | 3.25 × 2.5 × 0.25 | along X, *tint* | `placeCarpetRack(ctx, {x,z,angle,carpet})` |
| `street_carpet_draped` | 2.75 × 2.75 × 0.75 | red patterned carpet over the rack's top bar (same x,z,angle as the rack) | (via `carpet: true`) |

## Waste

`placeGarbageArea(ctx, { x, z, angle, seed, enclosure: 'brick'|'metal'|'none', count: 3..4, tree, litter })`
— open side faces the front; footprint ≈ 6.5 × 2 m plus ~2 m of litter in front (bags, a box, often
a thrown-out New Year tree with tinsel, sometimes a broken chair) and a «ДЕЗ. Не бросать мусор
мимо!» plate on the back wall.

| model | size (m) | notes / helper |
|---|---|---|
| `street_garbage_enclosure_brick` / `_metal` | 6.5 × 2.0 × 2.0 (walls 1.5 m) | open at +Z; metal one *tint* |
| `street_container` / `_open` | 1.25 × 1.75 × 1.25 (body 1.25 × 1.0 × 0.75) | *tint* (greens); open lid leans back; `placeContainer(ctx, {x,z,angle,open,tint})` |
| `street_trash_bag`, `street_trash_box` | 0.5 × 0.75 × 0.5, 0.75 × 0.75 × 0.5 | `placeTrashBag`, `placeTrashBox` |
| `street_discarded_tree` | 2.25 × 1.0 × 1.25 | lying spruce along X, tinsel, non-colliding; `placeDiscardedTree` |
| `street_bin_concrete` | 0.75 × 1.0 × 0.75 | vase urn; `placeLitterBin(ctx, {x,z,angle,type:'concrete'|'metal'})` |
| `street_bin_metal` | 1.0 × 1.0 × 0.5 | tilting urn between two posts, *tint* |
| `street_chair_broken` | 0.5 × 1.0 × 0.5 | `placeBrokenChair` |

## Garages

| model | size (m) | notes |
|---|---|---|
| `street_rakushka`, `_1` (rustier), `_2` (rusted-through corner) | 2.75 × 2.5 × 5.0 | clamshell along local Z, **front (padlock) at +Z**, *tint* |

`placeRakushka(ctx, { x, z, angle, tint, seed, sale, graffiti, notice })` — one decal on the flat
front: «ПРОДАЮ 8-916-…» (20 %), a tag (20 %) or the council's «ВЛАДЕЛЕЦ! Освободите территорию»
notice (20 %, readable).
`placeRakushkaRow(ctx, { x0, z0, x1, z1, gap=0.3, count?, seed, angle?, facing: 'right'|'left', missing=0.08 })`
— side by side along the line (2.75 m + gap each), fronts face the right of the walking direction
(x0→x1) unless `facing:'left'` or `angle`. Slight random misalignment, occasional empty slot.

## Fences — `placeFence(ctx, { points, type, seed, tint, closed, outside, graffiti, sign })` → placements

Panels are fitted along each polyline segment (count = ceil(len / panel), evenly spaced, overlapping
ends offset ±1.8 cm so they never z-fight), each standing on the terrain at its centre.
`outside: 'left'` flips the +Z face to the left of the walking direction.

| type | model(s) | panel (m) | notes |
|---|---|---|---|
| `po2` / `concrete` | `street_fence_po2`, `_chipped` | 2.5 × 2.0 (+snow) × 0.25 | rhombus relief, rust from the mounting loops; graffiti (12 % per panel, `graffiti` 0..1) |
| `lawn` | `street_fence_lawn` | 2.0 × 0.5 × 0.25 | low arched hoops, *tint* (green / yellow-green) |
| `bars` / `kindergarten` | `street_fence_bars` | 2.5 × 1.75 × 0.25 | steel bars with points, *tint* (green/black/blue) |
| `chainlink` | `street_fence_chainlink`, `_torn` | 2.5 × 1.75 × 0.25 | рабица on pipe posts, a torn hole now and then |
| `construction` | `street_fence_construction` | 2.5 × 2.0 × 0.25 | green corrugated sheet; «ВЕДУТСЯ СТРОИТЕЛЬНЫЕ РАБОТЫ» plate (`sign:false` to omit) |
| `tyres` | `street_tyre_half` | 0.8 spacing | painted half-buried tyres, alternating colours |

## Transit

`placeBusStop(ctx, { x, z, angle, name, routes, kind: 'trolleybus'|'bus', from, to, pavilion=true, lit, seed, ticket=true, ad })`
— **open side faces the road (local +Z)**. Pavilion 5 × 1.75 m: bench (sittable), double-sided ad
light box at the +X end (lit at night), «ОСТАНОВКА / <name>» fascia, faded interval timetable on the
inside of the −X glass (readable), 1–3 flyers on the rear glass (readable), tube light under the
roof (`lit`, 60 %; sometimes buzzing), a litter bin by the light box, **one discarded ticket on the
ground ('Поднять билет')**, and a stop pole at the downstream (−X) kerb end with plates facing the
approaching traffic (right-hand traffic arrives from local +X). Registers `registry.stops`.
For the spawn stop on the north sidewalk of the avenue: `placeBusStop(ctx, { x: 248, z: 520.6, angle: 0, name: 'Улица Берёзовая' })`.

| model | size (m) | notes |
|---|---|---|
| `street_stop_pavilion` / `_dark` | 5.0 × 2.75 × 1.75 | *tint* frame; occludes snow; `_dark` = dead tube |
| `street_stop_pole` | 0.75 × 3.0 × 0.75 | galvanized pole + timetable box; plates are signs |
| `street_trolley_pole` | 0.25 × 9.25 × 0.75 | span-wire eye at 7.25 m on the +Z side (toward the road) |
| `street_sign_pole` | 0.25 × 2.75 × 0.25 | road-sign post |
| `street_traffic_light` + `street_tl_red/yellow/green` | 0.25 × 4.0 × 0.75 | lenses face +Z |

`placeStopPole(ctx, { x, z, angle, kind, name, routes, from, to })` — «А» (bus) / «Т» (trolleybus)
plate, name plate, route numbers, readable timetable box.

`placeTrolleyLine(ctx, { points, poles=[-16.8, 16.8], median=null, pairs=[-12.5, 12.5], spacing=30, height=5.8, spanHeight=7.25, poleType: 'trolley'|'lamp', seed })`
— support poles every `spacing` m along the road centreline `points`, span wires across, two contact
wires per direction (0.6 m apart) at 5.8 m with droppers. Offsets are lateral to the **right** of
the direction of travel along `points` (negative = left). `median: 0` puts `cobra_double` lamps on
the median (they carry the span); `poleType: 'lamp'` makes the side poles steel cobra lamps.
Example for проспект Строителей (carriageways z 524–538 / 542–556, median 538–542):
```js
placeTrolleyLine(ctx, { points: [[0, 540], [640, 540]], poles: [-16.8, 16.8], median: 0, pairs: [-12.5, 12.5], spacing: 32 })
// → poles at z 523.2 / 556.8, westbound pair over z 527.5, eastbound pair over z 552.5
```

`placeRoadSign(ctx, { x, z, angle (face), type: 'crossing'|'children'|'noparking'|'nostopping'|'residential'|'dogs', plate?: 'children'|'dogs' })`
— 5.19 pedestrian crossing, 1.23 children (+ «ОСТОРОЖНО, ДЕТИ!» plate), 3.28 / 3.27, 5.21 «Жилая
зона», a «ВЫГУЛ СОБАК ЗАПРЕЩЁН» plate. Grey backs.

`placeTrafficLight(ctx, { x, z, angle (lenses face), phase=0, flashFrom=1320 })` — day cycle
(green 12 s, blinking green 3, yellow 3, red 10, red+yellow 2; use `phase: 15` for the crossing
direction), **flashing yellow from 22:00 to 06:00**; a small coloured light (schedule fn) tints the
snow at night.

## Utilities

| helper | model(s) | size (m) | notes |
|---|---|---|---|
| `placePayphone(ctx, {x,z,angle,offhook})` | `street_payphone`, `_offhook`, `street_payphone_handset` | 1.0 × 2.25 × 0.75 | МГТС-like grey body under a blue hood, «ТАКСОФОН», keypad panel with «Экстренные службы 01, 02, 03 — бесплатно». **E: 'Снять трубку'** → `payphone_dial` dial tone → 'Набрать номер' → key beeps + `phone_unavailable` («Абонент недоступен…») → 'Повесить трубку'. Walking away hangs up. `offhook: true` = the handset hangs on its cord and sways slightly (nobody there) |
| `placePaymentTerminal(ctx, {x,z,angle})` | `street_terminal` | 0.5 × 1.75 × 0.5 | «МОМЕНТ-ПЛАТЁЖ» (QIWI parody), lit tile screen, readable; faint blue light at night |
| `placeVendingMachine(ctx, {x,z,angle,type:'coffee'|'snack',tint})` | `street_vending_coffee`, `street_vending_snack` | 0.75 / 1.0 × 1.75 × 0.75 | *tint*; lit panels; 'Купить кофе — 20 р.' (it swallows the coin / «НЕТ СТАКАНЧИКОВ») |
| `placeMailbox(ctx, {x,z,angle,wall,y})` | `street_mailbox` (on a post), `street_mailbox_wall` (pivot back plane) | 0.5 × 1.75 × 0.5 (box 0.5 × 0.5 at 1.0–1.5 m) / 0.5 × 0.75 × 0.25 | blue «ПОЧТА» front with letter slot and collection times (readable) |
| `placeHeatPipe(ctx, {points,type:'raised'|'low',seed,melt=true,steam=0.15})` | `street_heatpipe` (pipes 0.5–1.0 m up), `street_heatpipe_low` | 5.0 × 1.25 × 1.25 per segment, along X | two tin-clad pipes on concrete supports, torn insulation, **no snow on top**; `melt` paints a thawed strip (snow_dirty/earth, only over snow) under the line; steam markers at some joints |
| `placeHeatPipeGate(ctx, {x,z,angle})` | `street_heatpipe_gate` | 5.0 × 4.75 × 1.25 | П-shaped loop over a path, 4 m clearance; ends meet raised segments at local ±2.5 m |
| `placeManhole(ctx, {x,z,wet=true,steam})` → `{placement, steam}` | `street_manhole` (thawed wet ring), `street_manhole_plain` | 1.25 × 0.25 × 1.25 | set 0.2 m into the ground (top 5 cm proud). **`steam: true|0..1` pushes a steam marker** to `registry.steamVents` |
| `placeElectricalCabinet(ctx, {x,z,angle})` | `street_elec_cabinet` | 1.0 × 1.75 × 0.5 | «НЕ ВЛЕЗАЙ! УБЬЁТ!» plate, flyers |
| `placeBollards(ctx, {x0,z0,x1,z1,spacing=1.6,type:'post'|'concrete',missing})` | `street_bollard` (striped), `street_bollard_concrete` | 0.25 × 0.75 / 0.5 × 0.75 | |
| `placeBillboard(ctx, {x,z,angle,ad,adBack,lit})` | `street_billboard` | 6.0 × 9.0 × 1.75 (board 6 × 3 at 5.5–8.5 m) | double-sided poster (ids from `POSTERS`), floodlit at night |
| `placeAdColumn(ctx, {x,z,angle})` | `street_ad_column` | 1.25 × 3.0 × 1.25 | afisha column, 4 posters |
| `placeNoticeBoard(ctx, {x,z,angle,wall,y,count,notices,lostDog})` | `street_notice_board` (on posts), `street_notice_board_wall` (pivot back plane) | 1.75 × 2.25 × 0.5 / 1.5 × 1.25 × 0.25 | «ИНФОРМАЦИЯ» + 2–4 readable notices; 25 %: the «Пропала собака» flyer with **one tear-off tab left** |
| `addPoleFlyer(ctx, {x,z,y,angle,halfWidth,seed,item})` | sign | 0.21 × 0.3 | tear-off flyer on any pole/tree, readable |

## Texts (`api.js` re-exports, all with `en` translations)

`FLYERS` (12 pole flyers with phone tabs), `NOTICES` (14 entrance/yard notices — heating cut,
residents' meeting, debtors, lost key fob, found red mittens…), `LOST_DOG`, `POSTERS` (11 period ads,
parody brands: МобиТел, Луч, МегаСвязь, ЕвроСвязь, «Клёвское» with the beer warning, 2008 — Год семьи…),
`PLATES`, `TIMETABLE(route, from, to, kind)`, `TICKET`. Drawing helpers: `drawPoster(item|id, seed)`,
`drawNotice`, `drawFlyer(item, seed, tabsLeft)`, `drawRoadSign(type)`, `drawGraffiti(text, seed, color)`,
`GRAFFITI`, `signLocal(ctx, {x,y,z,angle}, lx, ly, lz, signOpts)`.

## Notes for layout agents

- Lamps on avenue sidewalks: ~0.7 m from the kerb, head toward the road, 30–35 m apart; yards:
  courtyard poles at path corners and playgrounds (a dark gap between pools is right). Let the
  seeded `broken` default run — about one in five yard lamps should be out.
- Benches: entrance benches beside each подъезд door (`type:'entrance'`, angle = door's facing),
  courtyard benches around playgrounds, park benches along park paths. Use `mittens: true` once or
  twice in the whole district.
- Playgrounds need a flat-ish area; they sit on terrain height at each item.
- Garbage areas at the yard edge near driveways; rakushka rows along yard edges/driveways (Block C).
- Heat pipe: the PLAN has a heating main along z≈146 (ул. Заводская) — `placeHeatPipe` with
  `type:'raised'` and a `placeHeatPipeGate` where a path crosses.
- Steam: `registry.steamVents` is filled during build; consume it in `init`.
- Signs/notice boards on walls: pass the wall surface point and `wall: true`.

## Runtime behaviour (package `update()`)

- **Swings**: each seat is 13 pre-built frames (−24°…+24° in 4° steps); the visible frame is chosen
  from a wind-driven pendulum (period ≈ 3 s, amplitude from `atmos.windSpeed`, up to ~18° in a
  storm) and offset by the residual so the seat moves smoothly. Animated within 140 m; the
  `swing_creak` loop exists only within ~32 m.
- **Carousel**: every 70–260 s it gets a small push from nobody and slowly runs down; the player
  can push it. Creaks while turning.
- **Traffic lights**: lens placements' `flag` driven per frame; the light's colour follows.
- **Payphones**: dangling handsets sway; the receiver goes back when the player walks away.
- **Benches**: on sitting, the view eases round to face out from the seat for ~1 s.
- The dynamics run in the street package's `update()`; if a layout is loaded with `?only=` that
  excludes `street`, the props are still placed but stay still (lenses dark).

## Testing

- Showcase scene: `node tools/shot.mjs --query "only=base,street&streettest=1&x=300&z=333&yaw=-1.45&t=21:00&weather=light"`
  (road with trolleybus line, stop, payphone, terminal, vending, mailbox, traffic lights, signs,
  billboard, ad column, two playgrounds, garbage areas, rakushka row, every fence type, heat main
  with gate, lamps of every type, a test wall with a wall lamp, wall mailbox and notice board).
  The scene lives in `src/content/street/showcase.js` and is only imported with `?streettest=1`.

## Full model list (exact names; size W × H × D in metres = local X × Y × Z; pivot in voxels)

| model | size (m) | voxels | pivot (voxels) |
|---|---|---|---|
| `street_lamp_cobra` | 0.50 x 10.25 x 3.00 | 2x41x12 | 0.5,0,0.5 |
| `street_lamp_cobra_steel` | 0.50 x 11.25 x 3.00 | 2x45x12 | 0.5,0,0.5 |
| `street_lamp_cobra_double` | 0.50 x 11.25 x 5.75 | 2x45x23 | 0.5,0,11.5 |
| `street_lamp_courtyard_metal_sodium` | 0.50 x 7.25 x 2.00 | 2x29x8 | 0.5,0,0.5 |
| `street_lamp_courtyard_metal_mercury` | 0.50 x 7.25 x 2.00 | 2x29x8 | 0.5,0,0.5 |
| `street_lamp_courtyard_concrete_sodium` | 0.50 x 7.25 x 2.00 | 2x29x8 | 0.5,0,0.5 |
| `street_lamp_courtyard_concrete_mercury` | 0.50 x 7.25 x 2.00 | 2x29x8 | 0.5,0,0.5 |
| `street_lamp_park` | 0.75 x 5.00 x 0.75 | 3x20x3 | 1.5,0,1.5 |
| `street_lamp_park_broken` | 0.75 x 5.00 x 0.75 | 3x20x3 | 1.5,0,1.5 |
| `street_lamp_wall` | 0.75 x 0.75 x 0.75 | 3x3x3 | 1.5,0,0 |
| `street_lamp_wall_cage` | 0.75 x 0.75 x 0.75 | 3x3x3 | 1.5,0,0 |
| `street_bench_park` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_park_brushed` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_park_none` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_courtyard` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_courtyard_brushed` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_courtyard_none` | 2.00 x 1.25 x 0.75 | 8x5x3 | 4,0,1.5 |
| `street_bench_entrance` | 1.75 x 1.25 x 0.50 | 7x5x2 | 3.5,0,1 |
| `street_bench_entrance_brushed` | 1.75 x 1.25 x 0.50 | 7x5x2 | 3.5,0,1 |
| `street_bench_entrance_none` | 1.75 x 1.25 x 0.50 | 7x5x2 | 3.5,0,1 |
| `street_bench_stop` | 1.50 x 1.25 x 0.50 | 6x5x2 | 3,0,1 |
| `street_bench_stop_brushed` | 1.50 x 1.25 x 0.50 | 6x5x2 | 3,0,1 |
| `street_bench_stop_none` | 1.50 x 1.25 x 0.50 | 6x5x2 | 3,0,1 |
| `street_mittens` | 0.50 x 0.25 x 0.25 | 2x1x1 | 1,0,0.5 |
| `street_fence_po2` | 2.50 x 2.25 x 0.25 | 10x9x1 | 5,0,0.5 |
| `street_fence_po2_chipped` | 2.50 x 2.25 x 0.25 | 10x9x1 | 5,0,0.5 |
| `street_fence_lawn` | 2.00 x 0.75 x 0.25 | 8x3x1 | 4,0,0.5 |
| `street_fence_bars` | 2.50 x 2.00 x 0.25 | 10x8x1 | 5,0,0.5 |
| `street_fence_chainlink` | 2.50 x 1.75 x 0.25 | 10x7x1 | 5,0,0.5 |
| `street_fence_chainlink_torn` | 2.50 x 1.75 x 0.25 | 10x7x1 | 5,0,0.5 |
| `street_fence_construction` | 2.50 x 2.25 x 0.25 | 10x9x1 | 5,0,0.5 |
| `street_pg_rocket` | 6.50 x 7.50 x 3.25 | 26x30x13 | 6.5,0,6.5 |
| `street_pg_dome` | 3.25 x 2.00 x 3.25 | 13x8x13 | 6.5,0,6.5 |
| `street_pg_swing_frame` | 2.25 x 2.75 x 2.25 | 9x11x9 | 4.5,0,4.5 |
| `street_pg_swing_frame_double` | 3.75 x 2.75 x 2.25 | 15x11x9 | 7.5,0,4.5 |
| `street_pg_swing_seat_0` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_1` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_2` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_3` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_4` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_5` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_6` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_7` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_8` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_9` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_10` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_11` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_swing_seat_12` | 0.75 x 2.50 x 2.25 | 3x10x9 | 1.5,0,4.5 |
| `street_pg_carousel_base` | 0.75 x 0.25 x 0.75 | 3x1x3 | 1.5,0,1.5 |
| `street_pg_carousel_disc` | 2.25 x 1.50 x 2.25 | 9x6x9 | 4.5,0,4.5 |
| `street_pg_bars` | 3.25 x 2.75 x 0.25 | 13x11x1 | 6.5,0,0.5 |
| `street_pg_ladder` | 1.75 x 2.50 x 0.25 | 7x10x1 | 3.5,0,0.5 |
| `street_pg_monkeybars` | 3.25 x 2.75 x 1.25 | 13x11x5 | 6.5,0,2.5 |
| `street_pg_seesaw` | 3.25 x 1.50 x 0.75 | 13x6x3 | 6.5,0,1.5 |
| `street_pg_sandbox` | 2.25 x 0.75 x 2.25 | 9x3x9 | 4.5,0,4.5 |
| `street_pg_sandbox_mushroom` | 2.25 x 3.25 x 2.25 | 9x13x9 | 4.5,0,4.5 |
| `street_pg_house` | 2.00 x 2.75 x 2.00 | 8x11x8 | 4,0,4 |
| `street_tyre_planter` | 0.75 x 0.50 x 0.75 | 3x2x3 | 1.5,0,1.5 |
| `street_tyre_half` | 0.75 x 0.50 x 0.25 | 3x2x1 | 1.5,0,0.5 |
| `street_tyre_swan` | 0.75 x 1.50 x 1.75 | 3x6x7 | 1.5,0,3.5 |
| `street_carpet_rack` | 3.25 x 2.50 x 0.25 | 13x10x1 | 6.5,0,0.5 |
| `street_carpet_draped` | 2.75 x 2.75 x 0.75 | 11x11x3 | 5.5,0,1.5 |
| `street_container` | 1.25 x 1.75 x 1.25 | 5x7x5 | 2.5,0,2.5 |
| `street_container_open` | 1.25 x 1.75 x 1.25 | 5x7x5 | 2.5,0,2.5 |
| `street_garbage_enclosure_brick` | 6.50 x 2.00 x 2.00 | 26x8x8 | 13,0,4 |
| `street_garbage_enclosure_metal` | 6.50 x 2.00 x 2.00 | 26x8x8 | 13,0,4 |
| `street_trash_bag` | 0.50 x 0.75 x 0.50 | 2x3x2 | 1,0,1 |
| `street_trash_box` | 0.75 x 0.75 x 0.50 | 3x3x2 | 1.5,0,1 |
| `street_discarded_tree` | 2.25 x 1.00 x 1.25 | 9x4x5 | 4.5,0,2.5 |
| `street_bin_concrete` | 0.75 x 1.00 x 0.75 | 3x4x3 | 1.5,0,1.5 |
| `street_bin_metal` | 1.00 x 1.00 x 0.50 | 4x4x2 | 2,0,0.5 |
| `street_chair_broken` | 0.50 x 1.00 x 0.50 | 2x4x2 | 1,0,1 |
| `street_rakushka` | 2.75 x 2.50 x 5.00 | 11x10x20 | 5.5,0,10 |
| `street_rakushka_1` | 2.75 x 2.50 x 5.00 | 11x10x20 | 5.5,0,10 |
| `street_rakushka_2` | 2.75 x 2.50 x 5.00 | 11x10x20 | 5.5,0,10 |
| `street_stop_pavilion` | 5.00 x 2.75 x 1.75 | 20x11x7 | 10,0,3.5 |
| `street_stop_pavilion_dark` | 5.00 x 2.75 x 1.75 | 20x11x7 | 10,0,3.5 |
| `street_stop_pole` | 0.75 x 3.00 x 0.75 | 3x12x3 | 1.5,0,1.5 |
| `street_trolley_pole` | 0.25 x 9.25 x 0.75 | 1x37x3 | 0.5,0,1.5 |
| `street_sign_pole` | 0.25 x 2.75 x 0.25 | 1x11x1 | 0.5,0,0.5 |
| `street_traffic_light` | 0.25 x 4.00 x 0.75 | 1x16x3 | 0.5,0,0.5 |
| `street_tl_red` | 0.25 x 0.25 x 0.25 | 1x1x1 | 0.5,0,0.5 |
| `street_tl_yellow` | 0.25 x 0.25 x 0.25 | 1x1x1 | 0.5,0,0.5 |
| `street_tl_green` | 0.25 x 0.25 x 0.25 | 1x1x1 | 0.5,0,0.5 |
| `street_payphone` | 1.00 x 2.25 x 0.75 | 4x9x3 | 2,0,1.5 |
| `street_payphone_offhook` | 1.00 x 2.25 x 0.75 | 4x9x3 | 2,0,1.5 |
| `street_payphone_handset` | 0.25 x 0.25 x 0.25 | 1x1x1 | 0.5,0,0.5 |
| `street_terminal` | 0.50 x 1.75 x 0.50 | 2x7x2 | 1,0,1 |
| `street_vending_coffee` | 0.75 x 1.75 x 0.75 | 3x7x3 | 1.5,0,1.5 |
| `street_vending_snack` | 1.00 x 1.75 x 0.75 | 4x7x3 | 2,0,1.5 |
| `street_mailbox` | 0.50 x 1.75 x 0.50 | 2x7x2 | 1,0,1 |
| `street_mailbox_wall` | 0.50 x 0.75 x 0.25 | 2x3x1 | 1,0,0 |
| `street_heatpipe` | 5.00 x 1.25 x 1.25 | 20x5x5 | 10,0,2.5 |
| `street_heatpipe_low` | 5.00 x 1.00 x 1.25 | 20x4x5 | 10,0,2.5 |
| `street_heatpipe_gate` | 5.00 x 4.75 x 1.25 | 20x19x5 | 10,0,2.5 |
| `street_manhole` | 1.25 x 0.25 x 1.25 | 5x1x5 | 2.5,0,2.5 |
| `street_manhole_plain` | 1.25 x 0.25 x 1.25 | 5x1x5 | 2.5,0,2.5 |
| `street_elec_cabinet` | 1.00 x 1.75 x 0.50 | 4x7x2 | 2,0,1 |
| `street_bollard` | 0.25 x 0.75 x 0.25 | 1x3x1 | 0.5,0,0.5 |
| `street_bollard_concrete` | 0.50 x 0.75 x 0.50 | 2x3x2 | 1,0,1 |
| `street_billboard` | 6.00 x 9.00 x 1.75 | 24x36x7 | 12,0,3 |
| `street_ad_column` | 1.25 x 3.00 x 1.25 | 5x12x5 | 2.5,0,2.5 |
| `street_notice_board` | 1.75 x 2.25 x 0.50 | 7x9x2 | 3.5,0,1 |
| `street_notice_board_wall` | 1.50 x 1.25 x 0.25 | 6x5x1 | 3,0,0 |
