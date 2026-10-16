# metro — catalog

Package `src/content/metro/` (order **30**). It **places itself**: the pedestrian underpass under
проспект Строителей, the underground vestibule, three escalators, the deep platform hall of the
terminus «Заречная» (конечная), four single-track tunnels, and the trains. Layout packages only
need to read the **footprint rules** below. Optional helpers live in `api.js`.

```js
import { METRO, placeMetroSign, placeUnderpassSign, isMetroArea, metroStatus } from '../metro/api.js'
```

## Where things are (world meters: x east, z south, y up)

| what | where |
|---|---|
| surface footprint we own | **x 374–396, z 504–574** (sidewalk/road/median terrain painted here as a fallback; stair pits cut) |
| stair pits (holes) | NW x 377–381 & NE x 389–393, z 509–519 (entrance at z 509, descending south); SW x 377–381 & SE x 389–393, z 561–571 (entrance at z 571, descending north) |
| stairs | 8 steps, a 2 m landing at y −2.0, 8 steps; 1 voxel rise / 0.5 m run, 3 m wide inside; handrails, pram channels, snow on the top treads, ice and slush lower down |
| canopies | over NW and NE (steel + greenish polycarbonate, roof y ≈ 2.75–3.25, snow on top); SW/SE are open with a lamp mast over the lower flight |
| «М» pylons (lit) | (375.5, 508.6), (394.5, 508.6), (375.5, 571.4), (394.5, 571.4) — 4.25 m, «ЗАРЕЧНАЯ» plates |
| blue sign 5.17.2 posts | (385, 509.6) facing north, (385, 570.4) facing south |
| underpass | floor y −4.25, ceiling underside y −1.5. North hall x 377.5–392.5 z 519.5–524, corridor (walkway x 382.5–387.5) z 524–556, south hall z 556–560.5 |
| kiosks | west wall (front x 382.5, facing east), east wall (front x 387.5, facing west); lit: ЦВЕТЫ, САЛОН СВЯЗИ, CD•DVD (radio playing), РЕМОНТ ОБУВИ•КЛЮЧИ; shuttered: МОС-ПРЕССА, ВЫПЕЧКА•КОФЕ («АРЕНДА»), ЧУЛКИ•КОЛГОТКИ, ОПТИКА•ЧАСЫ, ФОТО НА ДОКУМЕНТЫ |
| payphone | west wall (382.5, −4.25, 538.75) |
| leak + bucket | (386.3, −4.25, 551.3), puddles at every stair foot |
| vestibule doors | corridor east wall x 390, z 537–543 (three bays, the middle one open, 1.25 m clear × 2.25 m) under «ВХОД В МЕТРО» |
| vestibule | x 390–413, z 530.5–549.5; КАССЫ (x 393–398.5, z 531–533.25), turnstile line x 401–402.5 (lanes 0–3 entry, 4–5 exit), controller booth x 400.5–402.5 z 544–546 |
| escalators | head x 412 (y −4.25) → foot x 435 (y −16); lanes z 538–539 **up**, 539.5–540.5 **stopped** (walkable), 541–542 **down**; torshery on the middle balustrades |
| lower hall | x 437–444, z 535.75–544.25, y −16; attendant booth (438.25, 542.5) |
| platform hall | x 444–544, island z 535–545 at y −16, ceiling y −12; columns at z 537 / 543 every 4 m (x 446, 450, …, 542); benches in the nave every 8 m |
| tracks | N (arrivals, terminus) axis z 533.375; S (departures to the city) axis z 546.625; rail head y −17, trench floor y −17.5 |
| tunnels | west x 380–444 (from the city), east x 544–608 (turnaround), closed far ends |
| interval clocks | over the S tunnel mouth at x 444 (facing east) and the N tunnel mouth at x 544 (facing west), y −12.5 |

`METRO` (from `api.js`) exports these numbers: `{ Y, STAIRS, UNDERPASS, VEST, ESC, PLAT, TRACK, TUNNEL, FOOTPRINT, LOWER }`.

## Notes for layout packages (avenue, blocks)

- **Leave the footprint x 374–396, z 504–574 alone.** We paint fallback sidewalk (`paintSidewalk`),
  road (`paintRoad`, lanes 527.5/531/534.5 and 545.5/549/552.5), a low snowy median (y 0.25) and curbs
  inside it with the base helpers, so your sidewalks meet it if you use the same helpers. Painting over it
  is harmless for the pits (they are re-carved right before the world finalizes), but your pattern would
  sit on top of ours.
- Keep **≥ 3 m clear** in front of each stair entrance (north: z 505–509, south: z 571–575, x 375–395):
  no snow banks, trees, lamps or benches. Trees along z 500–508 should leave a gap at x 376–394.
- Nothing tall inside the canopy outlines (x 376.75–381.25 and 388.75–393.25, z 508.5–519, up to y 3.5).
- Don't add street lamps inside the footprint: the canopies, open stairs and «М» pylons carry their own
  night lights (outdoor domain, schedule `night`).
- The underground runs under the avenue: **no basements or holes** in x 376–413, z 519–561 above y −1.5,
  nor under x 380–608, z 530–550 (deep, y < −11.75 there). Ceilings stay ≥ 1.5 m under the road.
- Pedestrians of the life package don't go underground (we push only `kind:'underpass' | 'metro' |
  'platform'` navPaths, which life ignores). Sidewalk routes should simply pass the pits on either side.
- Want another «М» at the bus terminal or a courtyard exit? `placeMetroSign(ctx, { x, z })` during build.

## Exported helpers (`src/content/metro/api.js`)

| signature | notes / example |
|---|---|
| `placeMetroSign(ctx, { x, z, y?, name? }) → placement` | red «М» pylon (4.25 m, lit lightbox on 4 faces, «ЗАРЕЧНАЯ» plates, red night glow). `placeMetroSign(ctx, { x: 532, z: 574.5 })`. Call in `build()` (signs are baked at load). |
| `placeUnderpassSign(ctx, { x, z, angle, y? }) → placement` | blue road sign 5.17.2 + «ПОДЗЕМНЫЙ ПЕРЕХОД» plate on a post; `angle` 0 faces south, π north. |
| `isMetroArea(x, y, z) → bool` | inside the stairs, underpass, vestibule or the deep station (useful for phones/no-signal, ambience). |
| `metroStatus(ctx) → { phase, trainVisible, trainTrack, trainHead, interval, nextArrivalIn, … }` | live snapshot of `ctx.registry.metro`. |
| `METRO` | frozen geometry constants (see above). |

## Models

All underground models are `indoor: true`; the big shells are authored in world meters and placed once
with the pivot at their minimum corner. "front" = local −Z unless noted. Fine models use 1/8 m voxels
(`lods: [0.5]`); the engine's AABB of those is 2× too big (harmless, culling only).

| model | size (m) x × y × z | pivot | notes |
|---|---|---|---|
| `metro_stair`, `metro_stair_covered` | 4 × 7.5 × 10 | entrance corner (stair-local origin), base y −4.5 | treads, tiled side walls, portal lintel, parapets, railings, snow; `_covered` has less snow (under a canopy). rot 0 = entrance north, rot 2 = entrance south |
| `metro_canopy` | 4.5 × 3.5 × 10.5 | corner, base y 0.5 | `occludesSnow` |
| `metro_m_pylon` | 1 × 4.5 × 1 | bottom centre | use `placeMetroSign` (adds the sign faces + light) |
| `metro_sign_post` | 0.25 × 3 × 0.25 | bottom centre | use `placeUnderpassSign` |
| `metro_stair_lamp` | 0.5 × 0.5 × 0.5 | bottom centre | bulb at the bottom |
| `metro_underpass` | 18 × 3.25 × 42 | min corner (376, −4.5, 519) | halls, corridor, bays, tiles, worn floor, puddles, ceiling stain |
| `metro_kiosk_flowers` / `_phones` / `_dvd` / `_shoes` | 2.5 × 2.75 × 2 | front centre, floor | open stall front (counter keeps people out), glowing shelves; rot 3 faces east, rot 1 west |
| `metro_kiosk_closed_press` / `_rent` / `_tights` / `_optics` / `_photo` | 2.5 × 2.75 × 2 | front centre, floor | roller shutter, padlock, rust |
| `metro_fixture` | 1.5 × 0.25 × 0.5 | top centre (hangs under the ceiling) | fluorescent tube; `flag` 0 = dead, 0.55 = dim; no collision |
| `metro_payphone` | 1 × 2.5 × 0.75 | wall plane, floor | МГТС-style card phone under a blue hood |
| `metro_bucket` | 0.6 × 0.5 × 0.6 (fine) | bottom centre | enamel bucket with water, no collision |
| `metro_vestibule` | 23 × 3.25 × 19 | min corner (390, −4.5, 530.5) | doors, kassa, fences, police door |
| `metro_turnstile`, `metro_turnstile_exit` | 1.5 × 1.25 × 0.5 | west end centre, floor | АКП-73 cabinet: amber target + green arrow / red cross |
| `metro_turnstile_flaps` | 0.25 × 0.5 × 0.75 | bottom centre | shown + solid only while slammed |
| `metro_control_booth` | 2 × 2.5 × 2 | NW corner | the controller sits inside |
| `metro_lightbox` | 0.25 × 0.75 × 2.25 | top centre (ceiling) | hanging 2000s lightbox; text faces ±x are signs; no collision |
| `metro_escalator` | 27 × 15.75 × 6.5 | min corner (410, −17, 536.75) | inclined tunnel, balustrades, the stopped middle steps, comb plates |
| `metro_esc_collide` | 23 × 12.25 × 1 | min corner | invisible collision staircase of a moving lane (placed `visible:false`) |
| `metro_esc_band_up`, `metro_esc_band_down` | 24 × 12.5 × 1 | min corner | dynamic, no collision: the moving step bands (shifted ≤ 1 step and wrapped every frame) |
| `metro_torsher` | 0.4 × 1.6 × 0.4 (fine) | stalk foot | bronze floor lamp with a globe |
| `metro_esc_booth` | 1.5 × 2.5 × 1.75 | NW corner | attendant's booth with red stop buttons, microphone, desk lamp |
| `metro_hall_a`, `metro_hall_b` | 20 × 6.25 × 19 | min corner (x0, −18, 530.5) | one platform section (5 columns per row); `_b` is shabbier (dead tubes, a fallen tile, a drip puddle) |
| `metro_lower_hall` | 7 × 5 × 9 | min corner (437, −16.75, 535.5) | foot of the escalators |
| `metro_hall_end` | 1 × 6 × 9 | min corner (544, −17.75, 535.5) | dead-end wall with the service door |
| `metro_tunnel_a`, `metro_tunnel_b` | 64 × 6 × 4.75 | min corner | single-track box tunnel, open end at local +x (lintel), cables/lamps/third rail on the outer wall (a: local −z, b: local +z) |
| `metro_bench` | 3 × 1 × 1.25 | bottom centre, long axis x | oak slats on marble blocks, back to back |
| `metro_clock_box` | 0.25 × 0.5 × 1.75 | back centre | housing of the interval clock (digits are a canvas mesh) |
| `metro_mirror` | 0.5 × 2.75 × 0.5 | bottom centre | driver's convex mirror |
| `metro_car_head_a`, `metro_car_head_b`, `metro_car_mid` | 19 × 3.75 × 2.75 | centre at rail height (floor top +1.0) | 81-717/714-style cars, dynamic. Head: cab at local +x; doors open on local +z (`_a`, `_mid`) or −z (`_b`) |
| `metro_car_leaf_l`, `metro_car_leaf_r` | 0.75 × 2.25 × 0.25 | lower −x corner | sliding door leaves (they hide inside the wall when open) |
| `metro_car_headlamps`, `metro_car_markers` | 0.25 × 0.5 × 2.75 | back centre | amber headlamps / red markers overlaid on a head car's front |
| `metro_man_stand` / `_walk1` / `_walk2`, `metro_woman_*` | ≈ 0.6 × 1.85 × 0.6 (fine) | feet centre, front −z | passenger silhouettes; coat = `tint`; face direction (dx,dz) with angle `atan2(-dx, -dz)` |
| `metro_staff_seated`, `metro_cashier_seated` | ≈ 0.6 × 1.5 × 0.75 (fine) | seat centre | staff in a uniform (tint) / cardigan |

Materials added (guarded, fall back if the palette is full): `metro_tile_yellow`, `metro_gabbro`,
`metro_granite_light`, `metro_floor_wet`, `metro_esc_step`, `metro_car_lower`, `metro_car_upper`,
`metro_car_wall`, `metro_kiosk_warm`, `metro_kiosk_cold`, `metro_soot`, `metro_signal_green`,
`metro_skin`, `metro_uniform`, `metro_polycarb` (15).

## What happens at runtime

- **Trains** (real-time clock): idle 2–9 min (night 4–9) → a 5-car train arrives on the N track from the
  city (`metro_train_arrive`), stops with its head at x 543.5 → in-car «Станция «Заречная». Конечная. Поезд
  дальше не идёт, просьба освободить вагоны» (`metro_station_announce`, terminus) with a quiet caption →
  doors open → 0–3 passengers get off and walk to the up escalator, through the exit turnstiles, the
  corridor and up a stair to the street → platform PA → doors close (`metro_door_close`) → the empty
  train leaves into the turnaround tunnel (`metro_train_depart`, `metro_rumble` while it reverses), the
  interval clock resets → 1–2.5 min later it comes back on the S track (head stops at x 444.5), doors open,
  0–2 people come down to board → `metro_doors` («Осторожно, двери закрываются…» + slam) → it leaves for the
  city, interval resets. **No riding:** if the player is inside a car or in a doorway when the doors would
  close, they stay open and «Освободите вагоны» repeats every 9 s (chime + PA speech + caption) until the
  player steps out. The platform edge keeps the player off the tracks (only open doorways let them across).
- **Service hours:** no trains 01:05–05:35 (game clock); escalators stop 01:30–05:20 (bands freeze,
  conveyors off); kassa closed and turnstiles free during the night; closing PA at 00:52–01:00.
- **Tickets:** the КАССА window sells 1-trip «УЛЬТРА-М» tickets (19 р., `ui.showNote` style `ticket`).
  `game.state.metroTrips` counts trips (also `metroTicketsBought`). Walking into an entry lane with a trip
  validates it (`turnstile` pass); without one the flaps slam (`turnstile` slam), stay shut while pressed,
  and a caption points to the kassa. Exit lanes slam for people walking in; leaving is always free.
- **Escalators:** moving step bands, conveyor zones (0.67 m/s horizontal), `escalator_step` at the comb,
  sometimes the attendant's «Держитесь за поручень» (`announcement` phrase 3).
- **Interval clock:** left half the game clock HH:MM (colon blinking), right half minutes:seconds since the
  last train left (real time; it climbs high at night and while the station is closed).
- **Culling:** underground lights are enabled per area (underpass / vestibule / deep / tunnel) and the
  underground placements are hidden while the player is far away on the surface.
- **Underground atmosphere:** while the player is past the vestibule doors or deeper, the shared sky/fog
  uniforms are darkened (no daylight reflections or grey noon fog underground) and fog density is halved.

## Sounds used (audio package; all guarded with `audio.ready && audio.has`)

`metro_train_arrive`, `metro_train_depart`, `metro_station_announce` (`terminus:true`), `metro_doors`,
`metro_chime`, `metro_rumble`, `announcement` (phrases 0 edge, 2 courtesy, 3 handrail, 4 terminus, 5
suspicious objects), `escalator_loop`, `escalator_step`, `turnstile` (`kind:'pass'|'slam'`),
`fluorescent_buzz` (`failing:true` for the dying tube), `radio_distant` (DVD kiosk), `ventilation`,
`drip`, `cashier_voice`, `kiosk_voice`, `payphone_dial`; `registry.audio.playSpeech` for «Освободите
вагоны» and «Станция закрывается». The package registers **`metro_door_open`** and **`metro_door_close`**
(pneumatic hiss + leaf thump) only if the audio package doesn't provide them.

## Tags, zones, registry

- Placement tags: `metro_stair`, `metro_canopy`, `metro_sign`, `sign`, `lamp`, `metro_underpass`, `kiosk`,
  `metro_tube`, `payphone`, `metro_prop`, `metro_vestibule`, `turnstile`, `turnstile_flap`, `metro_booth`,
  `escalator`, `escalator_collide`, `metro_torsher`, `metro_hall`, `metro_tunnel`, `bench`, `metro_car`,
  `person`. All carry `userData.pkg = 'metro'`, structural ones `noRelocate: true`.
- Light tags: `metro_stair_light`, `metro_m`, `metro_kiosk`, `metro_tube`, `metro_kassa`, `metro_torsher`,
  `metro_platform_light`, `metro_tunnel_lamp`, `metro_train`.
- Zones: `underpass_stairs` (outdoor, snow on, reverb underpass), `underpass` (indoor, snow off, reverb
  `underpass`), `metro_vestibule` (reverb `hall`), `metro_escalator` (`hall`), `metro_escalator_up` /
  `_down` (priority 5, `conveyor`, `data.escalator`), `metro_platform` (reverb `metro`), `metro_tunnel`
  (reverb `tunnel`). All have `data.pkg = 'metro'`.
- `ctx.registry.metro = { station, entrances[{id,x,z,y,bottom}], vestibule, platform, escalators, kiosks,
  payphones, benches, lowerHall, phase, trainVisible, trainTrack, trainHead, interval, nextArrivalIn }`
  (live fields updated every frame).
- `ctx.registry.manholes` += the four stair pits (`kind:'metro_stair'`) → the audio director's faint
  rumbles; `ctx.registry.payphones` += the underpass payphone.
- Interactions: kiosks («Посмотреть»), payphone, posters/notices/tear-offs («Читать»), kassa («Купить
  билет — 19 р.»), closed kassa window, fares, line map, rules, opening hours, direction board, benches
  («Сесть»), interval clocks (reach 9 m).

## Dev / screenshots

`?metro=docked` (N train at the platform, doors open), `?metro=dockedS`, `?metro=people` (passengers just
got off), `?metro=arrive[:seconds-before-stop]`, `?metro=arriveS[:s]`, `?metro=depart`. With any of these
the runtime is exposed as `window.__metroRt`. Example:
`node tools/shot.mjs --query "only=base,metro&x=495&z=538.6&yaw=0.15&y=-16&t=17:30&timescale=0&frames=8&metro=docked"`.

## Known limitations

- Train windows show the engine glass shader's frost along their edges.
- Riding an escalator, collision is a static staircase under the moving bands, so the view rises/sinks one
  voxel per step (smoothed by the camera).
- The left half of the interval clock shows the accelerated game clock while the interval counts real
  seconds.
- Three engine instance wrappers are installed at build/init (see the report's engine requests): terrain
  hole side faces limited to the crust depth inside our footprint, hole re-carve before `world.finalize`,
  and sky/fog uniform darkening while deep underground.
