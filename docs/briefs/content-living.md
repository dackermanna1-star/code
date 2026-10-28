# Brief: living & dining content (`src/objects/living/**`, `src/world/furnish/living.ts`)

Owner paths: `src/objects/living/**`, `src/world/furnish/living.ts`,
`tests/unit/content-living-*.test.ts`, `tests/probes/content-living-*.probe.ts`.
Read `docs/briefs/_content.md` first. Part budget for the area: ~1,500 parts.

Room: living/dining x 4.0–9.2, z 0–5.0 (laminate). South wall (exterior) has the balcony
sliding door x 5.0–7.4 and a window x 7.8–8.8 (sill 0.9 m) — keep a 1 m clear path to the
slider. West wall x = 4.0 (partition to the master bedroom) is the TV wall; the hall opening
at x = 4.0, z 4.4–5.6 must stay clear; east wall x = 9.2 (partition to bedroom 2); the room
opens north to the kitchen at z = 5.0 (peninsula at z ~5.9–6.6 is the kitchen agent's).

Layout:
- TV wall (x ≈ 4.02): media console/TV stand (particleboard + veneer, drawers/glass doors,
  1.6–1.8 m wide, ~0.45 m tall) centred z ≈ 2.4 with a 55" flatscreen TV on a stand (or wall
  mount bonded to the wall) — TV built for destruction: LCD panel (lcd material, `screen`
  feature, spiderweb cracks), thin glass front, plastic bezel and back cover, metal backlight
  frame, power board + main board (pcb, sparks), speakers, stand; game console (plastic shell,
  PCB, fan, optical drive), 2 controllers, soundbar, Wi-Fi router (LEDs), cable box.
- Sofa (3-seat, ~2.1 m) facing the TV at x ≈ 7.2–8.2 (back towards the east), seat cushions and
  back cushions as separate soft parts with `stuffing` (foam), wooden internal frame (softwood
  rails), fabric-covered arms, legs; 2–3 throw pillows (feathers) as separate assemblies.
- Armchair (leather or fabric) angled near the window; glass-top coffee table (reference
  `coffeeTable` from src/objects/reference) between sofa and TV with magazines, remote control
  (plastic shell + buttons + batteries), candles, a ceramic bowl; side table with a table lamp
  (ceramic base + fabric shade + bulb with `light`); floor lamp (steel pole, weighted base,
  shade, bulb with `light`) in a corner; area rug (carpet, soft thin slab) under the coffee table.
- Bookshelf (tall particleboard, 5 shelves) on the west wall south of the TV or on the east
  wall, filled with books (each book a small assembly: cover boards + page block, paper; varied
  sizes/covers using book_cover_0..3), picture frames (glass), small decor (ceramic vases,
  figurines), a plant.
- Dining: table (solid hardwood top + apron + legs, glue+dowels; 1.6×0.9 m, seats 4) at
  x ≈ 6.0–7.6, z ≈ 3.6–4.5 (between living and kitchen) with 4 dining chairs (reference
  `chair`), placemats, a centrepiece vase (ceramic) with flowers (foliage), 2 place settings
  (plates, glasses) optional.
- Wall art: 2 framed paintings (painting_0/1: wood frame + glass + canvas, hanging on a nail
  bond to the wall — weak, so they fall when the wall is hit hard), a mirror; floor plants in
  ceramic pots (`soil` feature) near the window (fiddle-leaf fig: trunk + leaf clusters).
- Curtains on the slider and window: the fixtures agent does curtains/blinds; skip.
- Speakers (wood MDF boxes with paper cones, grille) on the console sides.

Masses: sofa 45–70 kg, armchair 20–35 kg, TV 14–20 kg, media console 30–50 kg, bookshelf 30–45 kg
(+ books ~0.3–1.2 kg each), dining table 30–45 kg, floor lamp 4–8 kg, table lamp 2–4 kg.
