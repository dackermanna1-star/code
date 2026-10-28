# Brief: bathroom, laundry, foyer, balcony content (`src/objects/bath/**`, `src/objects/utility/**`, `src/world/furnish/utility.ts`)

Owner paths: `src/objects/bath/**`, `src/objects/utility/**`, `src/world/furnish/utility.ts`,
`tests/unit/content-utility-*.test.ts`, `tests/probes/content-utility-*.probe.ts`.
Read `docs/briefs/_content.md` first. Part budget for the area: ~1,600 parts.

Bathroom x 0–2.5, z 5.6–8.8 (tile floor, glazed wall tiles by the structure agent): door on the
south wall z = 5.6 at x 1.4–2.2 swinging in (hinge at x 1.4); west wall x = 0 concrete; north
wall z = 8.8 concrete; east wall x = 2.5 plumbing partition.
- Bathtub along the north wall x 0.02–1.72, z 8.05–8.78 (acrylic or enamelled steel shell built
  from arc/lathe-like tiles or boxes: rim, walls, bottom; apron front), tub filler + shower mixer
  and shower head on the wall (chrome, `water` features), tempered glass shower screen panel
  (temperedGlass, hinged to the wall — dices spectacularly), bath mat, shampoo bottles (plastic,
  `liquid`).
- Toilet against the west wall at z ≈ 7.0 facing east: porcelain bowl (ceramic lathe tiles, the
  pedestal/trapway as tiles), tank (ceramic box walls) with a separate ceramic tank LID (classic
  smash item, resting with friction), internal flush mechanism (plastic float + valve), seat and
  lid (plastic, hinged), bolted to the floor (bolt world bonds), supply line (`water`).
- Vanity on the east wall (x ≈ 2.48) z ≈ 6.0–6.9: MDF cabinet with hinged doors, ceramic basin
  top, faucet (`water`), drain pipe; mirror cabinet above (hinged mirror door, glass shelves,
  bottles); toothbrush cup (ceramic), soap dispenser, hair dryer, towel ring with towel (fabric),
  towel rack near the tub, toilet paper holder + roll, small trash bin, digital scale (glass top),
  exhaust fan grille (the fixtures agent does ceiling lights; the fan grille is yours).

Laundry/utility x 2.5–4.0, z 5.6–8.8 (tile): door on the south wall at x 2.85–3.65 swinging in.
- Front-load washer and dryer side by side against the north wall (each ~0.6 m wide, 0.85 high):
  steel cabinet panels, washer drum (stainless) on springs, CONCRETE counterweight blocks (heavy!),
  motor, door with thick glass porthole (hinged), control panel with knob and display, detergent
  drawer (slider); dryer similar but lighter with lint filter.
- Water heater (tank ~0.5 m dia, 1.5 m tall, steel shell + insulation + inner tank + pipes with
  `water` features, finite litres ~150) in the corner; shelves (steel wire) with detergent
  bottles (plastic + liquid), paint cans (steelSheet, dentable, `liquid`), a toolbox (steel)
  containing tool-looking items, mop + bucket (plastic), broom, vacuum cleaner (plastic), ironing
  board (folding steel legs), light bulbs box (cardboard).

Foyer x 9.2–12.8, z 4.4–8.8 (laminate): front door on the north wall x 10.4–11.4 (structure
agent), bedroom-2 door at x 9.6–10.5 on z = 4.4, cased opening at x = 9.2, z 4.6–5.8.
- ELECTRICAL PANEL on the east wall near the door (x ≈ 12.78, z ≈ 7.6, y 1.2–1.8): steel box
  with hinged door, breakers (plastic, press-fit), bus bar (copper), cables, `power` feature on
  the main breaker/bus bar part (destroying it cuts power to the apartment!), `sparks`.
- Coat closet in the NE corner (x 11.6–12.78, z 7.2–8.78): MDF frame with bifold doors
  (hollow-core panels on hinges), hanging rod, coats (fabric soft parts), shelf with boxes; console
  table against the west part of the north wall with a mirror, a ceramic key bowl with keys,
  a framed photo; shoe rack with shoes (rubber/leather/fabric); umbrella stand with umbrellas;
  intercom panel (plastic + pcb) next to the door; a small bench (wood).

Balcony x 4.4–9.0, z −1.6–−0.2 (outdoor, slab top y = −0.02): 2 outdoor chairs (aluminium +
plastic slats), small round table (aluminium frame + tempered glass top), 2–3 potted plants
(terracotta = ceramic, `soil`), AC condenser unit (steel cabinet with fan grille + fan blades +
compressor, heavy ~35 kg) against the wall, a small grill (steel, optional).

Masses: toilet 25–40 kg (tank lid 3–5 kg), bathtub 25–60 kg (acrylic lighter), vanity 30–45 kg,
washer 65–85 kg, dryer 35–50 kg, water heater 45–70 kg (empty shell; water weight is a feature),
electrical panel 8–15 kg, outdoor chair 4–7 kg, AC condenser 30–45 kg.
