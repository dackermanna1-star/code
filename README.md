# Modern Apartments

A Fabric mod for **Minecraft Java 1.21.11** (Fabric Loader 0.19.2) that adds five fully furnished,
explorable modern American apartment complexes, plus the 350+ furniture, fixture and building-system
blocks they are made of.

Every apartment is generated room by room: you can walk into every home, open every door, sit on the
sofas, sleep in the beds, cook on the ranges, store things in the cabinets and ride the elevators to
every floor. Floor plans are shared per vertical stack (so windows and balconies line up like a real
building) while finishes and furniture are rolled per apartment, so no two homes look alike.

## The five complexes

| Complex | Footprint (x × z × height) | Character |
| --- | --- | --- |
| **The Metropolitan** | 64 × 60 × 116 | Luxury high-rise. Underground garage, double-height marble lobby with concierge desk, amenity level (fitness, yoga & spin, screening room, game room, co-working) opening onto a podium pool deck, 15 floors of glass-walled homes with balconies, a penthouse floor with terraces, and a rooftop sky lounge under an illuminated crown. |
| **The Skyline Towers** | 60 × 60 × 200 | 35-storey blue-glass skyscraper. Central core with four high-speed elevators and two fire stairs inside a racetrack corridor, so every home is a corner home with glass on two sides. Three-storey lobby, amenity floor, a double-height sky garden and spa halfway up, penthouses, a glass sky lounge and an open observation deck under a lantern crown and spire. |
| **The Parkside Residences** | 96 × 84 × 40 | Six-storey brick and panel mid-rise wrapped in a U around a garden courtyard. Kids' club, fitness, leasing, courtyard lounge, ground-floor homes with patios, laundry and study lounges on the upper floors, a rooftop terrace, and a park with playground, community garden, dog park, splash pad and parking. |
| **The Courtyard Apartments** | 112 × 100 × 36 | Garden-style community: three lap-sided buildings with hip roofs and a balcony or patio for every home around a resort pool deck, a turf lawn with cornhole and lounge seating, a clubhouse (leasing, fitness, lounge), dog park, playground, grilling pavilion and parking. |
| **The Urban Lofts** | 72 × 60 × 56 | Converted brick warehouse. Double-height lofts with mezzanine bedrooms, exposed brick, steel beams and tall factory windows above a ground floor of shared creative space (gallery lobby, café, maker space, boxing gym, co-working), with a roof deck and timber water tower. |

Unit mix across the complexes: studios, one- and two-bedroom apartments, penthouses with dens and big
terraces, and double-height lofts. Each home has a living room, kitchen (often with an island), dining
area, bedrooms with beds, nightstands, wardrobes and dressers, bathrooms (tub or glass shower, toilet,
vanity, mirror), walk-in closets, laundry, entry details, curtains or blinds, ceiling lights, a light
switch by every door, smoke detectors, art, plants and rugs. Unit numbers are on signs outside each door,
and every entry door is labelled for the key system.

Buildings include stair cores with floor signs and exit signs, elevator lobbies with call buttons and
floor indicators, corridors with sconces, extinguishers and sprinklers, mail and package rooms, bike
storage, resident storage, trash rooms, parking with EV chargers and accessible stalls, landscaping,
street trees, lamps and monument signs.

## Getting a complex into your world

**Blueprints (survival-friendly).** Each complex has a blueprint item (creative tab *Modern Apartments:
Blueprints*). Right-click the ground to see a preview of the footprint, height and front direction;
sneak-right-click to turn it; right-click again within ten seconds to build. The building is placed over
a few seconds without freezing the server: terrain is levelled, foundations go down to solid ground and
the surrounding land is blended in. In survival the blueprint is consumed (configurable).

**Commands (operators).**

```
/apartments place <complex> [pos] [facing] [seed]   build at a position, front facing north/east/south/west
/apartments list                                    list placed complexes in this dimension
/apartments info                                    which complex you are standing in
/apartments undo                                    demolish the most recent complex and restore the land
/apartments validate <complex> [seed]               generate in memory and prove every home is reachable
```

A **Demolition Permit** (use twice on a building) removes a placed complex and restores what was there
before.

**World generation.** Complexes also generate naturally in new chunks of plains, meadow, savanna,
forest-type and snowy plains biomes (towers only in open plains-type biomes), on reasonably flat dry land,
roughly one per 72 × 72 chunk region. Existing worlds keep working; complexes appear in newly generated
chunks. Turn it off with `"naturalGeneration": false` in `config/modernapartments.json`.

## Living there

* **Keys and locks.** Apartment doors start unlocked. Sneak-use an *Apartment Key* on a door to pair and
  lock it; use the key to lock/unlock. A *Master Keycard* opens everything.
* **Secure entry.** Lobby doors have a keycard reader (sneak-use a keycard to pair it; tap to enter) and
  an intercom that buzzes you in.
* **Elevators.** Stand on the elevator floor and jump to go up a floor or sneak to go down, or use the
  panel inside the cab (or the call button in the lobby) to pick any floor. Doors chime and slide open on
  arrival.
* **Fixtures.** Light switches toggle every connected light in the room; lamps, TVs, monitors, fireplaces,
  sinks, showers, washers, dryers, dishwashers and grills switch on and off with sound and particles.
  Cabinets, fridges, dressers, nightstands, vanities and lockers are real storage (some come stocked).
  Sofas, chairs and stools are seats. Curtains and blinds open and close as a set.
* **Amenities.** Vending machines take an emerald for a snack, coffee makers brew coffee, treadmills give
  you a workout, the pool and hot tubs are real water.

## Building from source

Requirements: JDK 21. The Gradle wrapper (9.2.1) downloads everything else.

```
./gradlew build
```

The mod jar is written to `build/libs/modern-apartments-1.0.0.jar`.

### Tests

* `./gradlew runGameTest` runs headless server game tests that generate every complex (and extra seeds)
  and fail if any home, room or amenity is unreachable from the entrance or any multi-block furniture is
  broken.
* `./gradlew runClientGameTest` launches the real client and takes screenshots. Set `MA_TEST` to choose
  what: `showroom` (every block), `units` / `lofts` (sample floors seen from above and inside), or
  `complex` with `MA_COMPLEX=metropolitan,skyline,...` (exteriors and interiors of whole complexes).
  Screenshots land in `build/run/clientGameTest/screenshots`.

### Assets

Block models, block states, item models, textures, collision shapes, loot tables and the English language
file are generated by `tools/assetgen/generate.py` (Python 3 with Pillow) into `src/main/resources`. The
generated files are committed, so you only need to run it after changing the catalog.

## Installing

1. Install Fabric Loader **0.19.2** (or newer) for Minecraft **1.21.11**.
2. Put **Fabric API** (0.141.6+1.21.11 or newer) and `modern-apartments-1.0.0.jar` into your `mods`
   folder.
3. Start the game. The mod is required on both the server and the client.

## Project layout

```
src/main/java/com/modernapartments/
  block/, block/entity/      furniture, fixtures, doors, locks, elevators, storage
  build/                     block buffer, canvas, placement pipeline, validator
  build/interior/            unit generator, room furnishers, amenities, cores, corridors, landscape, signs
  build/complex/             the five complex generators
  world/                     world-generation structure and piece
  item/, command/, network/  blueprints, keys, permits, /apartments, elevator packets
src/client/java/             elevator screen, blueprint preview, render layers
src/gametest/java/           server validation tests and client screenshot tests
tools/assetgen/              asset generator
```

## License

MIT
