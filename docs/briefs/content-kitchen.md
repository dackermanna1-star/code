# Brief: kitchen content (`src/objects/kitchen/**`, `src/world/furnish/kitchen.ts`)

Owner paths: `src/objects/kitchen/**`, `src/world/furnish/kitchen.ts`,
`tests/unit/content-kitchen-*.test.ts`, `tests/probes/content-kitchen-*.probe.ts`.
Read `docs/briefs/_content.md` first. Part budget for the area: ~1,600 parts.

Room: kitchen x 4.0–9.2, z 5.0–8.8, open to the living room along z = 5.0 (tile floor).
Walls: north z = 8.8 (concrete party wall, finished face at 8.8), west x = 4.0 (partition to the
utility room; plumbing for the sink supply/drain runs in it near z 7.6–8.8), east x = 9.2
(partition to the foyer; cased opening at z 4.6–5.8 — keep clear).

Layout (adjust sensibly, keep the work triangle realistic):
- L-shaped run: base cabinets along the north wall from x 4.02 to ~8.3 (depth 0.6, counter
  height 0.91 incl. 3 cm stone countertop, toe kick) and along the west wall from z ~7.6 down to
  ~6.4; upper wall cabinets above the north run (bottom at 1.45 m, height 0.75, depth 0.33),
  screwed to the wall (world bonds into studs/concrete anchors) so they can be torn down.
  Sink (stainless under-mount double bowl, dentable; faucet with `water` feature and supply/
  drain pipes in the base cabinet with `water` features) centred ~x 6.0 on the north run;
  dishwasher left of the sink (x ~5.2–5.8) with racks, dishes and glasses inside; range/oven
  (freestanding, 0.76 m) at x ~7.0–7.76 with range hood above (steel, light + fan); fridge
  (full-height ~1.8 m, 0.9 wide, French or top-freezer) in the NE corner x ~8.3–9.18 against
  the east wall/north wall with doors hinged to open into the room.
- Peninsula/island: x 5.0–7.6, z ~5.9–6.6 (counter 0.91 m, stone top with overhang on the south
  side) with 3 bar stools (metal frame + wood/padded seat) on the living-room side.
- Small appliances & items: the reference microwave (import from src/objects/reference) on the
  counter, toaster, electric kettle, drip coffee maker with glass carafe, blender (glass jar),
  knife block with knives (separate grabbable knife assemblies are fine), cutting board, dish
  rack with plates, fruit bowl (ceramic) with fruit (food material, soft), paper towel holder,
  spice rack with glass jars, 2–3 wine bottles + oil bottle (glass with `liquid`), cereal boxes
  (cardboard), canned goods (steelSheet cylinders, dentable), pots & pans (steel/cast iron) on
  the range, trash can (pedal bin: plastic/steel) and recycling bin, wall clock (plastic frame,
  glass cover, `clock_face`), kitchen towel. Plates, bowls, glasses and mugs inside the upper
  cabinets (stacks of separate lathe assemblies resting on shelves — glassware realism!), cutlery
  drawer (cutlery as a few small steel parts in a tray), pots in a lower cabinet.
- Fridge interior: tempered glass shelves, plastic crisper drawers (sliders), door bins with
  bottles/jars/milk carton, food containers, interior light (`light` feature that is on only when
  the door is open is a nice touch — optional), compressor + condenser coil at the back bottom
  (heavy steel), `hum` feature.
- Range/oven: enamel steel body, glass-ceramic cooktop (temperedGlass... use glass with high
  strength or ceramic — breakable!) or gas grates (castIron), knobs (press-fit plastic),
  oven door (bottom hinge, double glass window, spring), wire racks inside, storage drawer
  (slider), heating elements, light inside oven.
- Dishwasher: steel front, plastic tub, wire racks (sliders), bottom-hinged door with latch,
  control strip, dishes inside.
- Ceiling lights over the kitchen are done by the fixtures agent; under-cabinet LED strip
  lights (small `light` features) are yours.

Masses (guides): fridge 70–95 kg, range 45–65 kg, dishwasher 35–50 kg, base cabinet unit 25–40 kg
with stone top section 30–60 kg, upper cabinet 12–20 kg (+ contents), bar stool 5–9 kg,
toaster 1.5–2.5 kg, kettle 1–1.5 kg, plate 0.4–0.6 kg, wine glass 0.15–0.2 kg, wine bottle (full)
1.2–1.5 kg.
