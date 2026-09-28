# Dead Air — campaign design (original recreation)

Second campaign of *The Last Four*. Structure follows the classic Dead Air
campaign: from a rooftop greenhouse in downtown **Newburg**, across the city's
rooftops, a hotel, office towers, a construction site and a power station, to
**Metro International Airport** and the last plane out. All geometry, textures,
names on signs and dialogue are original; use the real campaign only as a
structural reference.

## Mood & look (all chapters)
- Night, overcast, low orange cloud glow from city fires; distant air-raid /
  military lights, tracer fire on the horizon, circling military jets and
  airliners with blinking lights; smoke columns. A red **aircraft warning
  beacon** on the airport control tower is visible from the rooftops (the
  campaign's landmark, like Mercy Hospital in No Mercy): set `skyOpts` with no
  hospital and add your own distant tower/beacon silhouette mesh (fog: false).
- Business-district city: brick & glass towers, water tanks, AC units, antennas,
  neon, billboards (airline ads — "FLY NEWBURG", "SKYLINE AIR"), taxis, buses.
- Rooftops + interiors alternate constantly. Heights matter: long drops,
  plank bridges, fire escapes, ladders, broken walls.
- Airport: concrete, glass curtain walls, departure boards, luggage carousels,
  security checkpoint, jet bridges, aircraft, fuel trucks, baggage carts,
  runway lights, blast fences, craters, a burning crashed airliner.

## Chapter links (safe rooms continue into the next chapter)
| # | Chapter | Starts in | Ends in |
|---|---|---|---|
| 1 | The Greenhouse | back room of a rooftop greenhouse | kitchen safe room of the **Harborview Hotel** |
| 2 | The Crane | hotel kitchen safe room | storage unit in **Stor-Safe Self Storage** |
| 3 | The Construction Site | self-storage unit | airport parking garage — safe room off the **skybridge** |
| 4 | The Terminal | conference-centre office by the skybridge | departure-level safe room |
| 5 | Runway Finale | safe room overlooking the apron | C-130 escape |

## 1. The Greenhouse
Start: back room of a brick-and-glass rooftop greenhouse on an apartment roof
(table with 4 medkits, molotovs + pipe bombs, tier-1 guns, ammo pile).
Route: through the greenhouse (planters, dead plants, broken glass panes, grow
lights) → rooftop → **plank bridge** across a 6-8 m gap to the next roof
(Smokers love this spot) → down into an apartment block through a roof hatch /
stairwell → a burning or wrecked apartment floor with holes → out onto another
roof or fire escape → through an office/apartment and out a **window**, drop
onto the trailer of a **semi truck** parked in the street → across the street
(car alarm option) into the **Harborview Hotel** service entrance → kitchen
safe room. Short chapter (~200-300 m of route). Mini events: a door that
bursts open, a Witch in an apartment, a horde when crossing the planks.

## 2. The Crane
Start: hotel kitchen safe room. Route: kitchen → service dock → alley → climb a
**fire escape** up the hotel's side → hotel upper corridor/rooms → hotel roof.
**Crescendo**: a construction **crane** on the next roof; operate its controls
(hold-use) → noisy crane swings and lowers a steel **dumpster/container** to
bridge the gap between rooftops → hordes climb onto the roofs while it moves
(~40-60 s) → cross on the dumpster. Then rooftops → an office tower: open-plan
offices, cubicles, conference rooms, copy rooms → stairs down to street level
→ cross the street to **Stor-Safe Self Storage** → safe room in a storage unit
(roll-up door is the safe door). Long chapter, Tank likely.

## 3. The Construction Site
Start: storage unit. Route: alleys → an unfinished high-rise **construction
site** (rebar, formwork, scaffolding, cement mixers, pallets, portable toilets,
site trailers, floodlights, a tower crane base). The way on is blocked by a
**barricade** of debris/vehicles with **gas canisters** strapped to it:
**shooting the canisters** blows it up = crescendo (big horde, can be set off by
accident). Then alleys through **high-voltage transformer yards** (humming,
arcing, fences), through a building, across a street to the grounds of a
**power station**, and into the airport precinct: **parking garage** ramps →
stairs → **skybridge** → safe room at its end.

## 4. The Terminal
Start: conference-centre office at the end of the skybridge. Route: offices,
break rooms, conference rooms → terminal lobby (check-in desks, departure
boards, sculptures, glass) blocked by a **barricade**; a crashed **airport
van** can be started (use) → it smashes through the barricade (crescendo,
horde) → **baggage handling** (conveyors, carousels, tugs, luggage piles) →
concourse at a **security checkpoint**: a working **metal detector** — walking
through it sets off an alarm and a horde (avoidable by a side route or by
breaking it) → up escalators to the **departure level** → gates, jet bridge
windows showing the apron → safe room. Long chapter.

## 5. Runway Finale
Start: safe room overlooking the apron. As the team exits, an infected
**airliner crashes** onto the runway in a huge fireball (scripted cinematic
moment). Drop to the apron: bomb craters, wrecked planes, burning debris, jet
fuel fires, baggage carts, a **lighted taxi path** leading to the waiting
**C-130** transport (rear ramp down) and a **fuel tanker truck**. A **radio**
(on a dead crewman) contacts the pilot → he asks the survivors to start the
**fuel pump** on the truck (it's loud). Finale: waves from all directions,
two Tank waves, a mounted gun, supply tables, the pilot's fuel updates (show
progress), final wave → plane fully fuelled → board via the rear ramp →
escape cutscene: the C-130 taxis and takes off past the burning wreckage.

## Dialogue
Write chapter dialogue inline with `game.voice.script([{ who: 'bill', text: '...', d: 0 }, ...])`
(who: bill | zoey | louis | francis | pilot | radio). Keep the characters' voices:
Bill gruff veteran, Zoey film-buff wit, Louis upbeat IT guy, Francis grumpy
"I hate ..." biker. The pilot is a jittery transport pilot on the radio.
Do not edit src/audio/lines.js (shared); inline scripts only.
