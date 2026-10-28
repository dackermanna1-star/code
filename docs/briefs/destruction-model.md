# Brief: destruction model (`src/destruction/model/**`, tests `tests/unit/damage-*.test.ts`)

Owner paths: `src/destruction/model/damage.ts` (implement), `src/destruction/model/materials.ts`
(tune values; keep the exported types/shape), new files under `src/destruction/model/`,
`tests/unit/damage-*.test.ts`. PURE TypeScript (no Babylon) — must run under `node --test`.

Implement every function in `damage.ts` following docs/ARCHITECTURE.md §4.2–4.7 and the
contract's doc comments. This is the physics-of-damage brain of the game: it decides, for an
impact on a part, how much energy the part absorbs and whether it dents, cracks, chips, breaks
out locally, snaps/shatters globally, and how its bonds are loaded. The runtime (another
agent) applies your outcomes to rigid bodies and meshes.

Key behaviours:
- `impactEnergy`: reduced mass with Infinity for static, `E = loss·J²/(2μ)` where loss blends
  the two materials' `loss`; `shareA = kB/(kA+kB)` (softer absorbs more); null matB = rigid world
  (concrete-like stiffness 10).
- `effectiveEnergy`: fatigue from damage points within ~3× contact radius / part-size-aware
  radius, weighted by distance; damage points merge when close; decay is handled by callers.
- `respond`: per material `mode` (shatter, dice, splinter, crumble, crack, bend, soft) as in the
  architecture: global failure via `globalFailureEnergy` (u·V / clamp(aspect/6, 0.5, 4); not for
  `supported` parts except glass/lcd; Infinity for bend/soft), local breakout via
  `breakoutRadius` (solve E = G·2π r·min(t, r) — closed form or a few Newton steps; t = part
  width along dir), sub-threshold accumulation + cracks (`crackFraction`), chips for materials
  with `chip` > 0 (tiny micro pieces from the surface near the point), dents for `bend` (and
  small dents for plastic) with accumulation (merge with nearby dents, cap depth via `maxDent`
  × smallest extent; mark `crumpled` when accumulated deformation is large), soft materials
  absorb (no fracture from blunt; sharp (sharpness ≥ 2) strikes may "tear": represent as a crack
  + chips of the material's micro kind). Tool `contactRadius` matters (small radius → smaller,
  deeper breakout; large → wider). Strength multiplier `part.strength` scales u and G.
- Fracture planning: build the `FracturePlan` with `generateSeeds` + `voronoiFracture` from
  `src/geom/fracture.ts` (implemented concurrently by the geometry agent — code against the
  contract; poll until available to test). Seed pattern by mode: shatter → "radial" for
  glass/lcd, "chunks" for ceramic/tile/stone/castIron; dice → "dice" (cell 2–3 cm: most cells
  become micro, some small loose); splinter → "splinter" + anisotropy along grain; crumble →
  "crumble"; crack → "crack". Local breakout: inner seeds within radius + far seeds; cells whose
  centroid lies within ~1.1×radius of the impact are `loose` (or micro by size), others
  `remain`. Global: all cells loose except cells that hold the part's bonds (nearest cell to each
  bond anchor) — they `remain` (a snapped table leg leaves a stub; window glass leaves jagged
  shards in the frame with weakened bonds). `internalBonds` between adjacent remaining cells
  with `fusedStrength(mat, area)`; `bondTransfer`: each part bond → the nearest non-micro cell to
  its anchor, or −1 if that cell is loose/micro (bond breaks). Kicks: 10–25 % of the breakout
  energy converted to kinetic energy of loose/micro cells, directed along the impact dir with
  radial spread (glass more, crumble less), heavier cells slower. `brokenVolume` = sum of
  loose+micro volumes.
- `inertialBondDamage`: J²·m_far/(2·M²) × kind factor.
- `bondKindFactor`, `fusedStrength` (G × area × factor so a fused ceramic seam is weaker than
  the bulk but strong enough that bowls don't fall apart when touched), `hardness` 0..1 per
  material (glass/ceramic/stone/concrete/steel high, wood mid, drywall/plastic low-mid, soft ~0).
- Performance: `respond` < 2 ms typical; fracture planning < 6 ms for 40 cells (measure).
- Determinism: same inputs + same rng seed → same outcome.

Tune `materials.ts` so these GAMEPLAY EXPECTATIONS hold (encode each as a unit test with
realistic part geometry built via `src/geom/poly.ts` boxes/cylinders once available; until
then write the tests and keep them pending/skipped with a clear marker, then enable them):
1. Punch (~60 J, contact r 4 cm, flesh) on a 12.5 mm drywall sheet → local breakout radius
   4–9 cm; sledgehammer (~200 J, r 3 cm) → 15–25 cm; three punches at the same spot grow the hole.
2. Hammer (~70 J, r 1.5 cm) on a 4 mm 1×1.2 m annealed window pane → global shatter (radial),
   most shards loose, a few remain at bonded edges; a thrown tennis-ball-like 5 J → crack only.
3. Mug (0.35 kg ceramic) dropped 1 m (J from v=4.4 m/s) on tile (stiff) → fractures; on the
   same drop onto a wood/soft floor (stiffness 4) → usually survives or chips.
4. 15 kg steelSheet microwave panel hit at 5 m/s against concrete → visible dent (1–3 cm) and
   meaningful damage to its weld bonds; repeated hits crumple.
5. Pine table top (1.2×0.7×0.025) struck repeatedly by a hammer at one spot → cracks first, then
   local breakout after several hits (fatigue); a sledgehammer charged hit (~300 J) in the middle
   → global snap into elongated splinter pieces along the grain.
6. Concrete wall cell: sledgehammer 200 J → small crater/chips only (rMin ~2 cm), many hits needed.
7. Tempered glass shower panel: hammer 70 J mid-panel → survives (crack-free or minor), hit within
   3 cm of an edge (×0.3 threshold) or 300 J → dice into many micro cubes.
8. Soft (foam/fabric) never fractures from blunt hits; axe (sharpness 2.2) tears.
9. Axe (~120 J, sharp) on a softwood stud splinters it; a punch does almost nothing.
10. Thin plastic casing (ABS 2 mm) cracks into 2–5 pieces at ~40–80 J.
