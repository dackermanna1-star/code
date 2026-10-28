# Brief: builder kit + reference objects (`src/objects/lib/**`, `src/objects/reference/**`)

Owner paths: `src/objects/lib/builder.ts` (you now own it: fix bugs, add features, keep the
existing method names/semantics), `src/objects/lib/kit.ts` (+ more files in `src/objects/lib/`),
`src/objects/reference/*.ts`, `src/objects/registry.ts`, `tests/unit/objects-*.test.ts`.
PURE TypeScript (no Babylon).

The geometry module (`src/geom/**`) is being implemented concurrently; `builder.ts` calls it.
Until it is ready, write code and tests against the contracts; poll for completion (see common
rules) before running tests.

1. Review and harden `builder.ts` (read it fully): make sure group frames, rotations (Euler
   degrees, yaw-pitch-roll), uv offsets, grain handling (end-grain faces use `wood_fiber`),
   anchors, autoBond (touch detection with tolerance), lathe/torus/arc tile fusing (including
   ring wrap-around), hinge/slider grouping, feature part resolution and `build()` validation
   all work. Add useful validations (e.g. warn when a part is completely inside another,
   joints whose pivot is far from both parts, absurd masses). Add a `b.info()` that returns
   {mass, parts, bonds, bbox} for tests.
2. `kit.ts`: reusable, realistic sub-assembly helpers used by all content agents, e.g.:
   cabinetCarcass (sides, bottom, top rails, back panel of thin hardboard, shelf, toe kick;
   particleboard/MDF with screws/dowels), drawer (front, sides, back, bottom; slider bonds on two
   runners; handle), hingedDoorPanel (solid slab or hollow-core: two HDF skins + stiles/rails +
   honeycomb strips; handle; 2–3 hinges; latch/magnetic catch), shelfBoard, legs4/apron table
   base (glue+dowel), glassPaneInFrame (glass part bonded to frame bars with weak bonds),
   buttonGrid (press-fit plastic buttons), knob/handle, pcb (board + chips/capacitors as small
   parts, `sparks` feature), sheetMetalBox (welded steelSheet panels with tessellation),
   screwGrid helper (bond strength from fastener count), cushion/mattress/pillow (soft parts
   with `stuffing` feature), book (cover boards + page block, `paper` material), lathe vessels
   (plate, bowl, mug with handle, drinking glass, wine/beer bottle with `liquid` feature, vase),
   pictureFrame (frame bars + glass + art panel + hanging nail bond to world), lightBulb + socket
   (`light` feature on the bulb part), cable (copper segments), pipe (copper segments with
   `water` feature). Each helper takes a Builder, a name prefix, dimensions and a local
   position/rotation (use `b.group`), and returns the main part names for bonding.
3. Reference objects (`src/objects/reference/`), each `export function build<Name>(): AssemblyDef`,
   with realistic construction, real dimensions, plausible masses and many parts:
   - `microwave.ts` (THE showcase from the user's brief): steelSheet casing (top, left, right,
     back, bottom panels; spot welds/screws), front control panel (plastic) with display
     (`display_green`) and ~12 press-fit buttons + start/stop, hinged door (left hinges; plastic
     frame, glass window, perforated steel inner panel, latch hooks; `latch`), cavity liner
     (5 painted steel panels), turntable plate (temperedGlass) on a plastic roller ring + motor
     coupling, magnetron (steel block + fins), heavy transformer (castIron core ~3 kg + copper
     windings), capacitor, PCB with chips (sparks feature), cooling fan (plastic blades + hub),
     power cord segments, rubber feet. Total ~13–16 kg, 40–80 parts. Smash it, stomp it,
     rip its door off, pop its panels, scatter internals.
   - `chair.ts` (wooden dining chair: seat, 4 legs, stretchers, back posts, slats; glue+dowels).
   - `coffeeTable.ts` (tempered glass top resting in a wooden frame on clips/friction, lower shelf).
   - `mug.ts` (ceramic lathe mug with handle).
4. `registry.ts`: `OBJECT_REGISTRY: Record<string, () => AssemblyDef>` mapping type ids to
   builders (start with the reference objects; content agents will add theirs), plus
   `buildObject(type)`.
5. Tests: every reference object builds, masses within ranges (microwave 11–16 kg, chair 4–7 kg,
   coffee table 18–35 kg, mug 0.3–0.45 kg), all bonds valid, all parts bonded (or tagged
   loose), features reference parts, no NaN, deterministic, parts don't substantially overlap
   (sample-based check), part counts reported.

Write a short guide at the top of `kit.ts` (how to build a good destructible object) — content
agents will read it.
