# Catalog: `public` — public & non-residential buildings

Package `src/content/public/` (order 26). `build()` places nothing in the city: layout packages call
the helpers in **`src/content/public/api.js`** (also reachable at runtime as `ctx.registry.publicApi`).

```js
import {
  placeShop, placeKiosk, placePharmacy, placeSchool, placeKindergarten,
  placeBoilerHouse, placeHeatPipe, boilerCenterForChimney, placeGarageRow,
  placeWarehouse, placeGuardBooth, placeSubstation, placeDispatcherBooth, placeHockeyBox,
} from '../public/api.js'
```

## Conventions (read this first)

- **Front = local −Z.** Every building's entrance / main facade is its local −Z side, so with
  `rot: 0` it faces **north**, `rot: 1` west, `rot: 2` south, `rot: 3` east (ENGINE convention).
- `x, z` = **centre of the building footprint** (or of the whole site for school / kindergarten /
  hockey box), in meters. `y` defaults to the terrain height at `(x, z)`.
- **Big composites take `rot` (quarter turns) only** — school, kindergarten, boiler house,
  warehouse, hockey box. Shop, pharmacy, kiosks, garages, substation, dispatcher and guard booths
  accept `rot` **or** `angle` (radians). Zones are axis-aligned, so keep enterable buildings
  (shop, pharmacy) on quarter turns.
- **Terrain:** each helper flattens the terrain under its footprints (and a small apron at the
  doors) to the base `y` so snow never pokes through floors. Paint your ground (roads, sidewalks,
  yards) **first**, then call the helper; don't raise terrain inside a footprint afterwards. Small
  yard objects (fences, goals, play equipment) sit on the terrain height at their spot.
- `seed` (any number) makes every instance different (tints, rust, which garage is open, which
  lamp is dying…). Everything is deterministic.
- Every placement carries `userData: { pkg: 'public', kind, noRelocate: true }`. Main shells are
  tagged `'building'` (school sections, kindergarten, boiler hall, warehouse, substation,
  dispatcher, guard booth), `'shop'` (shop, pharmacy), `'kiosk'`, `'landmark'` (chimney).
  **Anomaly code:** most of these carry static signs/lights or are parts of a composite — please
  respect `userData.noRelocate` (relocating a school wing would leave its gym and signs behind).
- Interiors are lit with `domain:'indoor'` lights; facades use outdoor lights that spill onto snow.
- **navPaths:** door approaches are `kind:'entrance'` stubs (first point at the door, 6–12 m out) for
  the shop, pharmacy, school (through the gate), kindergarten (3 porches → a yard `'path'` to the
  gate), boiler house and dispatcher booth; kiosks, garage rows, the warehouse gate and the hockey
  box push short `'path'` spurs. The life package links entrance stubs to any walkable path within
  32 m and loose path ends within 2.6 m — run your sidewalks/paths past them.
- All signage is Cyrillic with an `{ru, en}` readable interaction (prompt «Читать»).

---

## 1. `placeShop(ctx, o)` — «ПРОДУКТЫ 24 ЧАСА» (fully enterable)

```js
const shop = placeShop(ctx, { x: 460, z: 584, rot: 0, seed: 3 })     // entrance faces north
// → { placement, door, cashier, frame, interior: {min, max}, entrance: [x, z] }
```
`o: { x, z, rot | angle, y, seed, tint (facade paint, default faded beige/grey-green), name ('ПРОДУКТЫ'), flatten=true }`

- **Footprint 14 × 10 m** centred on (x, z), 4.25 m high; porch + canopy + sign box stick out
  **1.5 m** in front (local −Z). Door at local x ≈ −4.5 m (the right-hand end of the facade as seen
  by someone standing in front of it).
- Outside: granite porch with a ribbed plate, handrail, cigarette-butt urn, steel canopy, and the
  snow shovelled off the porch heaped against the far end of the facade (terrain mound).
- Inside: tambour (outer heavy steel door + inner opening, rubber mat, wet cardboard, air curtain),
  tiled floor with muddy tracks, L-shaped counters (Гастрономия with sausages & cheese, Молочные
  продукты, Вино-водка · Табак), cash desk with register, scales (red LED) and money tray, back
  shelves of tins/bottles/boxes, gondola shelf (Бакалея), steel bread rack (rye «кирпичики» below,
  batons above, gaps where it sold out, printed price strips, bread crates on top) with the hand-written
  «Хлеб — 18 руб.» notice, three drink coolers (Колокольчик / Пиво / Живая вода), ice-cream chest,
  payment terminal «МОМЕНТ-ПЛАТЁЖ», «Уголок покупателя» with the complaints book, staff door.
- **Cashier** = separate model `pub_cashier` (tag `'person'`, `userData.role = 'cashier'`) standing
  behind the cash desk facing the customer — the life package may swap/animate her.
- Fluorescent tubes (one flickering `'buzz'` = separate `pub_tube_fixture` placement), warm window
  spill onto the snow, a soft downlight from the light box onto the facade (night), entrance bulb
  under the canopy, lit light-box sign (emissive, always).
- **Interactions:** door (open/close — opens outward just past 90°, solid when closed or open,
  passable only while swinging; auto-closes after ~7 s once you're ≥ 3 m clear), «Купить хлеб —
  18 руб.» / «Купить батон — 16 руб.» on the bread rack, «Обратиться к продавщице», «Смотреть
  ценники» on each department, terminal screen, hours plate, posters, notices.
- **Game state:** buying sets `game.state.boughtBread = true`, pushes `'hleb' | 'baton'` to
  `game.state.bread`, adds to `game.state.breadSpent` (roubles) and emits `game.events 'bought'`
  `{ item, where: 'shop' }`. Caption «— Пакет нужен?» (Need a bag?) + `cashier_voice`.
- **Zone** `name:'shop', type:'shop', reverb:'shop', indoor, snow:false, priority 2`.
- **Sound emitters** (started lazily near the player): `fridge_hum` ×2, `fluorescent_buzz`,
  `shop_ambience`, `radio_distant` (cashier's radio, low), `ventilation` ×2 (air curtain, roof unit).
- Registry: `registry.shops.push({ kind:'produkty', name, x, z, y, angle, entrance:[x,z], door,
  interior:{min,max}, open24:true, placement, cashier })`, `registry.entrances.push({x,y,z,angle,
  kind:'shop', enterable:true})`. navPaths: an `'entrance'` stub (first point at the door, 7 m
  outward — the life package turns it into a door node and links its outer end to the nearest path)
  and an `'indoor'` path (with `y`) from the door to the counter.

## 2. `placeKiosk(ctx, o)` — ларёк

```js
placeKiosk(ctx, { x: 400, z: 578, rot: 0, type: 'tabak', seed: 1 })
['tabak','pechat','flowers','shawarma','produkty','closed'].forEach((type, i) =>
  placeKiosk(ctx, { x: 396 + i * 4, z: 578, rot: 0, type, seed: i }))
// → { placement, light, frame }
```
`o: { x, z, rot | angle, y, type, seed, tint (body colour), sign (text override, e.g. for 'closed'), drifts=true }`

- **Footprint 3.0 × 2.75 m**, 3.5 m high + roof snow (sign band at 2.75–3.25 m). Glazed front + serving hatch
  with a coin ledge on local −Z; side window on local +X.
- `tabak` «ТАБАК» (cigarette packs, red LED ticker), `pechat` «ПЕЧАТЬ» (white/blue, «Мос-Пресса»,
  magazines on wires), `flowers` «ЦВЕТЫ 24» (glazed flanks, warm lamp, buckets of roses and
  carnations), `shawarma` «ШАУРМА» (vertical spit, glowing grill, hand-written menu with prices,
  roof vent steam), `produkty` «ПРОДУКТЫ 24 ЧАСА» (beer, bottles, chips), `closed` (roller shutter,
  padlock, «СДАЁТСЯ В АРЕНДУ» note, graffiti, unlit sign — default text «ПЕЧАТЬ»).
- A seated vendor in a fur hat inside (not in `closed`), fluorescent tube, heater glow.
- One light per lit kiosk (under the sign box, lights the display and the snow in front).
- Weathered sheet steel (rust along the bottom and from the roof corners, a patch sheet), snow on
  the roof, and terrain snow drifts against the back and flanks (`drifts:false` to skip; place the
  kiosk after painting the sidewalk).
- Interactions: read sign (with translation), «Постучать в окошко» → a short vendor line + `kiosk_voice`.
- Emitters: `radio_distant` (quiet) or `ventilation` (shawarma). Tag `'kiosk'`; `registry.kiosks`.

## 3. `placePharmacy(ctx, o)` — «АПТЕКА»

```js
placePharmacy(ctx, { x: 476, z: 584, rot: 0, seed: 2 })   // → { placement, door, cross, frame, interior }
```
`o: { x, z, rot | angle, y, seed, tint, name ('АПТЕКА'), flatten=true }`

- **Footprint 7 × 5 m**, 4 m high, glass storefront with green frames, lit «АПТЕКА» box and a
  **green cross** light-box on a bracket over the door (`pub_pharmacy_cross`, green light on the snow).
- **Enterable 8:00–22:00** (glass door, pharmacist in a white coat, glass counter, shelves of boxes,
  medical scale, flu poster). After 22:00 the door is locked from outside («Дверь заперта»), the
  interior drops to a night light, and you ring the **night window** («Позвонить в ночное окно»
  → `doorbell`, then «— Слушаю. Что вам?»).
- Zone `name:'pharmacy', reverb:'shop'`. `registry.shops` (`kind:'pharmacy', hours:[8,22]`), `registry.entrances`.

## 4. `placeSchool(ctx, o)` — ГОУ СОШ (1970s typical school)

```js
placeSchool(ctx, { x: 226, z: 233, rot: 0, seed: 7, number: 1048 })
// → { wing, entry, gym, frame, entrance: [x,z], site: {min,max} }
```
`o: { x, z, rot (quarter turns), y, seed, number (1048), floors (4 | 3), fence=true, yard=true, fenceTint }`

- **Site 85 × 72.5 m** centred on (x, z) with a 1.75 m steel-bar fence (gate + open wicket in the
  middle of the front side, «Выгул собак запрещён»). Local layout (meters from the site centre,
  front = −Z): classroom wing 56 × 13 m at z −24…−11 (4 storeys, 14.75 m; or 3 storeys 11.5 m);
  entrance block 14 × 6 m at z −30…−24 with porch, columns, concrete canopy and the forecourt to
  the gate at z −36; gym 12 × 24 m at x +16…+28, z −11…+13 (9.25 m, tall gridded windows).
  Yard behind: football goal frames at x −36 and +8 (z +13), basketball hoop, pull-up bars,
  flagpole by the gate, a trail of old footprints across the pitch.
- White silicate brick, white three-part windows with transoms, sills with snow, downpipes with
  ice, mosaic panel (children with a book, a rocket, the sun — tiles missing) on the west end.
- **Night:** all windows dark except the caretaker's room in the entrance block (warm bulb,
  flickering TV, a watchman in a chair — always lit at night) and **one classroom on the 3rd floor**
  (fluorescent, chairs upturned on the desks, a cleaner with mop and bucket — lit 16:30–22:15).
- Signs: «ШКОЛА № n» letters on the entrance block, the official plaque «Департамент образования
  г. Москвы · ГОУ средняя общеобразовательная школа № n», a winter-holiday notice on the locked door.
- Registry: `schools`, `entrances` (`enterable:false`), `landmarks`. Emitter: `tv_muffled` (caretaker).

## 5. `placeKindergarten(ctx, o)` — детский сад

```js
placeKindergarten(ctx, { x: 380, z: 230, rot: 0, seed: 4, number: 1543 })
// → { main, verandas, frame, entrance: [x,z], site }
```
`o: { x, z, rot (quarter turns), y, seed, number (1543), fence=true, verandas (≤4, default 4), fenceTint }`

- **Site 65 × 52.5 m.** Red-brick 2-storey building 40 × 13 m at the back of the site (centre
  z +10, facade at z +3.5) with **three group entrances** (porches with canopies; one lamp dead,
  one dying), cream tile band, paper snowflakes in some windows, a watchman's lit room with a cat on
  the sill, and a **faded painted mural** (sun, hedgehog, balloon) on the west end wall.
- Yard: 4 **verandas** (open pavilions 6 × 3 m, mono-pitch roofs, faded murals inside) along the
  side fences, play-houses, a «boat» climbing frame, fly-agaric mushroom sandboxes.
- 1.5 m painted bar fence with gate; «Выгул собак запрещён» and «Детский сад № n · Приём с 7.00
  до 19.00» plates. Registry: `kindergartens`, `entrances` (×3, `enterable:false`).

## 6. `placeBoilerHouse(ctx, o)` — котельная + 55 m striped chimney (landmark)

```js
// PLAN: chimney at (262, 95), front facing ул. Заводская (south):
const [bx, bz] = boilerCenterForChimney(262, 95, 2)          // → [268, 109.4]
placeBoilerHouse(ctx, { x: bx, z: bz, rot: 2, seed: 5,
  pipes: [[250, 128], [250, 146], [330, 146]], arches: [[250, 138]] })
// → { hall, chimney, frame, chimneyPos: [x, z] }
```
`o: { x, z, rot (quarter turns), y, seed, number (3), pipes: [[x,z],...] (optional heat-pipe run), arches: [[x,z]] }`

- Red-brick hall **30 × 16 m**, 12 m high (+ roof lantern), centred on (x, z); operator annex 8 m
  to local +X (personnel door, lit office window, sign «КОТЕЛЬНАЯ № 3 · ГУП «МосТеплоСеть»»);
  equipment gate on the local −X end («ПОСТОРОННИМ ВХОД ВОСПРЕЩЁН», danger plate).
- Tall steel-framed windows: panes dark, some lit cold from inside (24 h), boarded, bricked or broken.
- **Chimney** 55 m (`pub_chimney`, 5.25 m wide at the base): brick base, red/white bands, ladder,
  two service platforms. `CHIMNEY_OFFSET = [6, 14.4]` m from the hall centre (local, behind the
  hall); flue duct connects them. **Aviation lights:** 3 red lamps blinking on the top platform
  (custom schedule fn), 3 steady on the middle one (one dead); big fog halos — visible over the roofs.
  maxDistance 1400 m with LODs.
- A steam/smoke plume from the chimney top via the nature package (`addSteam kind:'chimney'`),
  added in this package's `init()` if `nature/api.js` exists.
- Cold yard floodlight (street schedule, sometimes dying), door lamp. Emitters `boiler_hum`, `ventilation`.
- Registry: `landmarks` (`kind:'chimney', height: 55`), `industrial`.

### `placeHeatPipe(ctx, { points, arches, seed })`
Insulated twin heat pipes on concrete П-supports in **6 m segments** along a world polyline,
topped up with 1 m fillers (`pub_heat_pipe_short`) so every leg ends exactly at its corner / end
point (nothing overshoots); `arches` (world points within 3 m of a leg) become 10 m **П-shaped
arches** centred on that point, lifting the pipes 6.25 m over a driveway. Patchy snow on the
insulation (the mains leak heat). Paints a melted dirty strip below; occasionally a leaking joint
steams (nature `kind:'pipe'`). Returns the placements. Registry `heatPipes`.

```js
placeHeatPipe(ctx, { points: [[250, 128], [250, 146], [330, 146]], arches: [[250, 138]] })
```

## 7. `placeGarageRow(ctx, o)` — ГСК brick garages

```js
placeGarageRow(ctx, { x: 120, z: 70, rot: 2, count: 14, seed: 9, numberStart: 41 })
// → { boxes, doors, open: index, frame }
```
`o: { x, z, rot | angle, y, count (10, max 60), seed, brick: 'white' | 'red', openIndex (-1 = none), numberStart (1), name ('Мотор-n') }`

- Row of `count` boxes, each **3.25 m wide × 6.5 m deep × 3.0 m** (total width `count × 3.25`),
  centred on (x, z); doors on local −Z. Flat felt roofs with uneven snow; a 5 m packed apron in front.
- Steel swing doors in faded colours (tinted, 3 variants: wicket + lock, ribs + padlock, patched),
  rust, stencilled numbers, occasional «ПРОДАМ 8-916-…»; terrain snow drifts banked up against the
  closed doors (taper ~1 m out onto the apron).
- **One open garage** (seeded or `openIndex`): leaves swung open, bulb on a cord (warm light spilling
  out on the snow), shelves of jars, tyres, workbench, canisters, an old **classic Lada**
  (`pub_car_classic`, tinted), `radio_distant` playing; zone `name:'garage', reverb:'room'`.
- Cooperative sign «ГСК «МОТОР-n»» and a «членские взносы» notice on the west end wall.
  Registry `garageRows`, `storySpots` (`kind:'open_garage'`).

## 8. `placeWarehouse(ctx, o)` + `placeGuardBooth(ctx, o)` — база

```js
placeWarehouse(ctx, { x: 395, z: 92, rot: 2, seed: 2 })   // → { placement, gate, booth, frame, gatePos }
placeGuardBooth(ctx, { x: 500, z: 120, rot: 0 })           // stand-alone booth → { placement, frame }
```
`placeWarehouse o: { x, z, rot (quarter turns), y, seed, gate=true, name ('СКЛАД № 2') }`

- Corrugated-steel shed **36 × 18 m**, 7 m eaves / 8.5 m ridge, centred on (x, z); a **3 m
  loading dock** (1.25 m high, rubber bumpers, canopy, side stair, pallets & boxes) along the
  local −Z side; three roll-up doors (middle one half open), «СКЛАД № 2», «НЕ КУРИТЬ!».
- Base gate (6.5 m, barbed wire) **14 m in front of the dock** (local x +1.75…+8.25, centre `gatePos`) with a
  «ВЪЕЗД ПО ПРОПУСКАМ» plate, and the guard booth just inside, right of the gate.
- **Guard booth** 2.5 × 2.25 m (`pub_guard_booth`, tinted): lit window (warm bulb, TV, kettle,
  a guard), fluorescent tube lamp on a bracket (cold, buzzing or dying), «ОХРАНА» sign,
  «Постучать в окно» → «— Куда? Закрыто…». Emitters `tv_muffled`, `fluorescent_buzz`.
- The perimeter fence is not included — use the street package's `placeFence` (concrete ПО-2).

## 9. `placeSubstation(ctx, o)` — ТП

```js
placeSubstation(ctx, { x: 540, z: 110, rot: 0, seed: 1, number: 2417 })  // → { placement, frame, number }
```
Brick box **6 × 4.5 m**, 3.75 m high, two pairs of grey louvred steel doors (local −Z), «ТП-2417»
stencil, two «НЕ ВЛЕЗАЙ — УБЬЁТ!» plates, utility plate, graffiti. Emitter `transformer_hum`
(100 Hz). Registry `substations`.

## 10. `placeDispatcherBooth(ctx, o)` — диспетчерская (bus terminal)

```js
placeDispatcherBooth(ctx, { x: 565, z: 590, rot: 0, route: '648' })   // → { placement, frame }
```
White/blue hut **6.5 × 3.5 m**, 3 m high: one lit window (desk lamp, kettle, red phone, logbook,
a dispatcher in a cardigan), door, lamp, «ДИСПЕТЧЕРСКАЯ», interval **timetable** for bus 648
(readable), 2008 calendar inside, stovepipe on the roof (steam via nature `kind:'vent'`).
«Постучать в окно» → «— Скоро. Скоро будет.» Emitter `radio_distant`. Registry `dispatchers`.

## 11. `placeHockeyBox(ctx, o)` — хоккейная коробка

```js
placeHockeyBox(ctx, { x: 520, z: 430, rot: 0, w: 24, d: 44, seed: 3 })
// → { boards, lamps, goals, frame, ice: {min,max} }
```
`o: { x, z, rot (quarter turns), y, w (inner width, 4 m steps, ≥ 12), d (inner length, ≥ 20), seed, boardTint }`

Inner rink `w × d` (long axis along local Z) of flooded glossy ice (terrain `ice`, footsteps ICE),
1.25 m plank boards (painted outside, white inside) with 2 m rounded corners, a gate on the local
−X side, two goals with nets, snow banks thrown over the boards, players' bench, notice «КАТОК ·
Работает с 16 до 22 ч.», graffiti. **Two 8 m lamp poles** at the middle of the long sides with
cold floodlights aimed at the ice — on from dusk until 22:30, one of them dying. Registry `hockeyBoxes`.

---

## Models (all placeable with `world.place` too)

Sizes W × H × D in meters (1 voxel = 0.25 m). Pivot = bottom centre of the footprint unless noted.
"tint" = the placement `tint` colours its `paint`/`paint_matte` voxels.

| model | size (m) | pivot / facing / notes |
|---|---|---|
| `pub_shop` | 14 × 4.5 × 11.5 | pivot = centre of the 14 × 10 building footprint; porch extends 1.5 m at −Z; tint = facade |
| `pub_shop_door` | 1.0 × 2.25 × 0.25 | **dynamic**; pivot = hinge (left edge, outer face, bottom) |
| `pub_tube_fixture` | 1.5 × 0.25 × 0.5 | ceiling fluorescent (link to a light via `placement` to flicker) |
| `pub_lamp_wall_bulb` | 0.25 × 0.25 × 0.5 | pivot at the wall face (back), bulb toward −Z; `lamp_bulb` emissive |
| `pub_cashier` | 0.75 × 1.75 × 0.75 | woman, white blouse, blue apron, burgundy bun; faces −Z |
| `pub_kiosk_tabak` / `_pechat` / `_flowers` / `_shawarma` / `_produkty` / `_closed` | 3.0 × 4.0 × 2.75 | 3.5 m body + roof snow; front −Z; tint = body |
| `pub_pharmacy` | 7 × 4 × 5.5 | pivot = centre of the 7 × 5 building (step 0.5 m at −Z); tint = facade |
| `pub_glass_door` | 1.0 × 2.25 × 0.25 | **dynamic**; hinge pivot like `pub_shop_door` |
| `pub_pharmacy_cross` | 0.25 × 1.25 × 1.75 | pivot = wall end of the bracket; cross sticks out toward −Z; `pub_lamp_green` |
| `pub_school_wing` / `pub_school_wing3` | 56 × 15.5 × 13 / 56 × 12.25 × 13 | 4 / 3 storeys (roof 13.5 / 10.25 m + parapet, roof-exit box); front −Z |
| `pub_school_entry` | 14 × 8.75 × 8 | pivot = centre of the 14 × 6 block; porch 2 m at −Z |
| `pub_school_gym` | 12 × 9.25 × 24 | doors on +X and +Z sides |
| `pub_fence_school` | 2.5 × 2.0 × 0.25 | pivot = panel start; runs along +X; tint |
| `pub_gate_school` | 4.5 × 2.25 × 0.25 | pivot = left post; tint |
| `pub_goal_frame` | 5.25 × 2.25 × 1.25 | mouth −Z |
| `pub_basket_hoop` | 1.75 × 4.0 × 1.5 | board faces −Z |
| `pub_pullup_bars` | 3.25 × 2.75 × 0.25 | bars at 1.5 / 2.0 / 2.5 m |
| `pub_flagpole` | 0.75 × 8.25 × 0.75 | |
| `pub_kg_main` | 40 × 8.5 × 13 | front −Z |
| `pub_kg_porch` | 2.5 × 3.75 × 1.75 | pivot = back edge centre (against the wall); steps toward −Z |
| `pub_kg_veranda` | 6 × 3 × 3.25 | pivot (centre of floor); open front −Z; tint |
| `pub_kg_house` / `pub_kg_boat` / `pub_kg_mushroom` | 1.5 × 2.25 × 1.5 / 3.5 × 3 × 1.5 / 2.25 × 2.5 × 2.25 | play equipment; house & boat tinted |
| `pub_fence_kg` | 2.5 × 1.75 × 0.25 | 1.5 m panel + snow; pivot = panel start; runs along +X; tint |
| `pub_boiler` | 38 × 14.5 × 20 | pivot = centre of the 30 × 16 hall; annex to +X, flue duct to +Z |
| `pub_chimney` | 5.25 × 56 × 5.25 | 55 m tall; maxDistance 1400 |
| `pub_aviation_light` | 0.25 × 0.5 × 0.25 | `lamp_red`; link to a blinking light |
| `pub_heat_pipe` | 6 × 2 × 2 | pivot = segment start (centre line); runs along +X |
| `pub_heat_pipe_short` | 1 × 2 × 2 | 1 m filler (pipes only); pivot = start; runs along +X |
| `pub_heat_pipe_arch` | 10 × 7.5 × 2 | pivot = start; runs along +X; 6.25 m clearance |
| `pub_garage_box` / `pub_garage_box_red` | 3.25 × 3.5 × 6.75 | one unit (left wall included); doors −Z |
| `pub_garage_end` / `_red` | 0.25 × 3.5 × 6.75 | closes the +X end of a row |
| `pub_garage_door` / `_b` / `_c` | 2.5 × 2.25 × 0.25 | closed swing doors; tint |
| `pub_garage_doors_open` | 2.5 × 2.5 × 1.5 | leaves swung open (+ snow on their edges); pivot at the opening (facade plane) |
| `pub_garage_interior` | 3.25 × 2.75 × 6.75 | shelves, tyres, bench, bulb; same pivot as the box |
| `pub_car_classic` | 1.75 × 1.5 × 4.0 | classic Lada, no snow (for garages); nose −Z; tint |
| `pub_warehouse` | 36 × 9.25 × 21 | pivot = centre of the 36 × 18 shed; dock 3 m at −Z |
| `pub_gate_base` | 6.5 × 3.0 × 0.25 | pivot = left post |
| `pub_guard_booth` | 2.5 × 3.25 × 2.25 | window −Z, door +Z; tint |
| `pub_lamp_tube_bracket` | 0.25 × 0.5 × 1.0 | pivot = mounting point; tube toward −Z |
| `pub_barrier` | 4.5 × 1.5 × 0.5 | boom barrier (lowered); pivot = post; arm along +X |
| `pub_substation` | 6.5 × 4.25 × 5 | doors −Z |
| `pub_dispatcher` | 6.5 × 3.75 × 3.75 | pivot = centre of the 6.5 × 3.5 hut; window/door −Z |
| `pub_hockey_board` / `_gate` | 4 × 1.75 × 0.75 | pivot = start; runs along +X; ice side −Z; tint |
| `pub_hockey_corner` | 2.5 × 1.75 × 2.5 | 2 m radius quarter turn |
| `pub_hockey_goal` | 2 × 1.5 × 1 | 1.25 m frame + snow; mouth −Z, non-solid net |
| `pub_hockey_lamp` | 1.75 × 8.5 × 1 | floodlights toward −Z |
| `pub_hockey_bench` | 3 × 0.75 × 0.5 | |

## Materials added (18)
`pub_glass_dark` (non-emissive dark window glass), `pub_glass_cold` / `pub_glass_warm` (clear glass
whose far LOD is a lit pane following the placement `flag`), `pub_win_lit_cold` / `pub_win_lit_warm`
(EMIT_CONST lit panes), `pub_win_lit_dirty` (dim greenish lit industrial glazing — the boiler hall,
whose lit panes follow a night-weighted light so they read as dark glass by day), `pub_glass_goods`
(opaque glossy "glass" for bottles, jars and thin counter guards — the engine's transparent glass
frosts and glows on small indoor panes), `pub_lamp_green`, `pub_screen`, `pub_sausage`, `pub_cheese`, `pub_bread`,
`pub_bread_dark`, `pub_cardboard`, `pub_skin`, `pub_fabric_blue`, `pub_paint_white`, `pub_net` (non-solid).

## Sounds used (names from the audio package; fallbacks are synthesized here only if missing)
Loops (started lazily within ~15–70 m, stopped beyond): `fridge_hum`, `fluorescent_buzz`,
`shop_ambience`, `radio_distant`, `ventilation`, `tv_muffled`, `transformer_hum`, `boiler_hum`.
One-shots: `door_metal_open`, `door_metal_slam`, `shop_bell`, `cashier_voice`, `kiosk_voice`,
`door_wood`, `doorbell`, `phone_key`, `scale_beep`.

## Registry keys
`publicApi` (the API module), `shops`, `kiosks`, `entrances` (appended: `{x, y, z, angle, kind, enterable}`),
`schools`, `kindergartens`, `landmarks` (`{kind, name, x, z, height}` — chimney, school),
`industrial`, `heatPipes`, `garageRows`, `storySpots`, `substations`, `dispatchers`, `hockeyBoxes`.
Plus nature's `steam` entries for the plumes added in `init()`.

## Tags
Placements: `'shop'`, `'kiosk'`, `'building'`, `'landmark'`, `'entrance'` (doors), `'person'`
(cashier), `'lamp'`, `'aviation_light'`, `'fence'`, `'gate'`, `'sport'`, `'porch'`, `'veranda'`,
`'play'`, `'garage'`, `'garage_door'`, `'car'`, `'heat_pipe'`, `'hockey'`.
Lights: `'shop_light'`, `'shop_spill'`, `'lamp'`, `'kiosk_light'`, `'pharmacy_cross'`,
`'aviation_light'`, `'garage_bulb'`, `'booth_light'`.
Interactions: `'door'`, `'notice'`, `'buy'`, `'cashier'`, `'terminal'`, `'kiosk'`, `'pharmacist'`,
`'bell'`, `'guard'`, `'dispatcher'`.

## Notes for layout agents (where things fit, per PLAN)
- **Shop** (Block E or the south strip x 450–470): 14 m wide + 1.5 m porch; leave ~4 m of sidewalk
  in front of the door. Mum's SMS sends the player here — put it where the warm window glow is
  visible from the approach.
- **Kiosks** (south strip x 395–440): 3.0 m wide each; place them 3.5–4 m apart in a loose row,
  mixing types, with one `closed`. They can share the sidewalk with a bus stop.
- **School** (Block A, x 150–302): site 85 × 72.5 m. **Kindergarten** (Block B): 65 × 52.5 m.
  Courtyard paths should end at the gates (front centre of the site, local −Z).
- **Boiler house** (x 220–300): use `boilerCenterForChimney(262, 95, 2)` → (268, 109.4) with
  `rot: 2` so the chimney stands at (262, 95) and the hall faces ул. Заводская; pass `pipes` to run
  the heating main toward z ≈ 146 (PLAN's heat pipe), with an `arches` point where it crosses a road.
- **Garages** (x 40–200, z 60–128): two or three rows of 12–20 boxes, doors facing each other
  across a 7–8 m lane (rot 0 and rot 2).
- **Warehouse** (x 330–460): 36 × 21 m incl. dock + 14 m yard to the gate; put the street-package
  concrete fence around it, leaving the 6.5 m gate gap at `gatePos`.
- **Substation** (x 480–600 or any courtyard): 6.5 × 5 m. **Dispatcher booth**: on the island of
  the bus-terminal loop (x 530–600, z 574–606). **Hockey box**: any courtyard, 28 × 48 m with boards.

## Testing
`?pubtest=1` builds a private test lot (never in the real game); `&pubonly=shop,kiosks,pharmacy,
school,kindergarten,boiler,garages,warehouse,substation,dispatcher,hockey` limits it.
Locations: shop (320,300) · kiosks z 281 · pharmacy (345,300) · school (200,200) · kindergarten
(420,200) · boiler (200,420) · garages (300,420) · warehouse (430,440) · substation (360,360) ·
dispatcher (280,360) · hockey (520,330).
`&pubonly=rot` adds every composite at a non-zero rotation on the west strip (boiler rot 2 with a
pipe run and arch, garages rot 2, school rot 1, pharmacy rot 3, kindergarten rot 2, hockey rot 1,
warehouse rot 3, dispatcher rot 2, substation rot 1); `shoprot` / `kioskrot` add a rot-1 shop at
(150, 300) and a kiosk at angle 0.4.
