# Common rules for content (furnishing) agents

You build destructible objects and place them in the apartment. Read first:
`docs/briefs/_common.md`, `docs/ARCHITECTURE.md` (§4, §10, §13), the guide at the top of
`src/objects/lib/kit.ts`, `src/objects/lib/builder.ts`, the reference objects in
`src/objects/reference/` (microwave = the quality bar), `src/destruction/model/materials.ts`,
`src/destruction/model/types.ts` (features), `src/render/surfaces.ts`, `src/world/plan.ts`,
`src/world/structure/levels.ts` (reference levels: finished floor y = 0, ceiling 2.7, wall faces).

Deliverables per area (paths in your brief):
- Object builders `src/objects/<area>/<object>.ts`, each `export function build<Object>(opts?)`
  returning an `AssemblyDef` (variants via opts: size, colour, seed), built with the DSL/kit.
- `src/objects/<area>/index.ts`: `export const <AREA>_OBJECTS: Record<string, (opts?: any) => AssemblyDef>`.
- Placements `src/world/furnish/<area>.ts`: `export function furnish<Area>(): Placement[]` with
  `import type { Placement } from "./types.ts"` where
  `interface Placement { type: string; def: AssemblyDef; xf: Xform; room: RoomId }` (create
  `src/world/furnish/types.ts` with exactly this if it does not exist yet — identical content in
  every agent's copy is fine; do not add other things to it).
- Unit tests `tests/unit/content-<area>-*.test.ts`: every builder builds and validates, masses in
  realistic ranges (state the range per object), placements inside their rooms, not intersecting
  walls (≥ 1.5 cm clearance from finished wall faces) or each other (AABB test, except intended
  stacking/containment such as plates inside a cabinet — tag them), not blocking door swings and
  openings (keep ≥ 0.85 m clear paths through doorways), resting on the floor (base at y = 0) or
  on the object they sit on (surface height ± 2 mm), deterministic.

Quality bar (the user's request is explicit): incredibly realistic, deeply interactive, fully
destructible. Model real construction — panels with real thickness, internal components,
fasteners where they are, hollow things hollow, glass that is glass, soft things soft. Every
object breaks differently because of how it is built. Use real dimensions and plausible masses
(materials provide density; check `b.mass()`). Use features: lights in lamps/fixtures (bulb part
+ `light`), screens on TVs/monitors/laptops (`screen`), water in faucets/pipes/toilet supply/tanks
(`water`), sparks in electronics (`sparks`), stuffing in cushions/pillows/mattresses
(`stuffing`), liquid in bottles/glasses (`liquid`), soil in plant pots (`soil`), motors (fan),
hums (fridge). Interactive parts get joints: doors/lids/flaps on hinges (with latches where
real), drawers on sliders, rotating knobs are just parts (press bonds). Small loose items are
separate assemblies (a mug on a table is its own assembly placed on the table top), so they can
be grabbed and thrown.

Part budget guidance: small items 1–20 parts, furniture 15–80, appliances 30–120. Keep the whole
area within the part budget in your brief. Prefer boxes/cylinders (cheap physics) and lathe tiles
for curved ceramics; hulls only where needed.

Placement: use plan.ts coordinates (x east, z north). An object's front faces +Z in its own
frame; rotate it with yaw so the front faces into the room (yaw = π → front faces −Z (south),
yaw = +π/2 → front faces +X? Verify with `qeuler(0, yaw, 0)` applied to (0,0,1) using
src/geom/vec.ts and document your helper). Place against walls with ~1.5–2 cm clearance; base at
y = 0; objects on counters/tables at the measured surface height (compute from your own builders'
dimensions, don't guess).

Testing in-engine: once the integration agent wires the game (src/main.ts), you can spawn your
area in a probe (tests/probes/content-<area>-*.probe.ts) via the debug API or by constructing the
systems the same way main.ts does; take screenshots of your rooms and judge them critically
(coherent, believable apartment). If the game isn't integrated yet when you finish building,
validate with unit tests and report.
