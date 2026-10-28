# Brief: fixtures & electrics content (`src/objects/fixtures/**`, `src/world/furnish/fixtures.ts`)

Owner paths: `src/objects/fixtures/**`, `src/world/furnish/fixtures.ts`,
`tests/unit/content-fixtures-*.test.ts`, `tests/probes/content-fixtures-*.probe.ts`.
Read `docs/briefs/_content.md` first. Part budget for the area: ~900 parts.

These are the apartment-wide fixtures that make the place feel lived-in and react to
destruction (lights die, fans fly apart, blinds bend):
- Ceiling light fixtures at every `lights` position in `ROOMS` (plan.ts), y = 2.7 (ceiling):
  a different believable style per room (flush-mount glass dome in the hall/foyer/bathroom with
  a steel base, a pendant with fabric shade in the master bedroom, a 3-bulb track/spot bar in the
  kitchen (2 positions), a schoolhouse globe in bedroom 2, a utility batten with a bare bulb in
  the laundry). Each bulb is a glass part with a `light` feature (warm 2700–3000 K colour,
  intensity/range tuned for a cosy evening interior with the golden-hour sun; `mains: true`),
  bolted/screwed to the ceiling (world bonds) — knock them down, smash the bulbs.
- Living room CEILING FAN with light kit at the living room light position: motor housing
  (steel), 5 blades (plywood/MDF) on blade irons (steel) bonded with screws, a hinge joint on the
  vertical axis driven by a `motor` feature (spins at ~2–3 rev/s when powered; blades break off
  and fly when hit!), downrod bolted to the ceiling, light kit globe + bulbs.
- Window coverings for every window (plan.ts WALLS openings of kind window): venetian blinds
  (aluminium head rail + many thin aluminium slats bonded weakly to ladder cords (fabric) — they
  bend/dent/tear off; tilt wand) in the bedrooms and kitchen-facing window, fabric curtains on
  a steel rod with rings for the living room window and the balcony slider (curtain panels as
  a few soft vertical fabric strips hinged/bonded to rings so they swing a little and tear).
- Smoke detectors (plastic, `alarm` feature) on the ceilings of the hall, bedrooms and kitchen;
  thermostat (plastic + lcd) in the hall; baseboard electric heaters (steel housing + fins)
  under the bedroom windows; mini-split AC indoor unit (plastic casing, louvers on a hinge,
  fan, fins) high on the living room east wall; doorbell chime box; a wall clock in the hall.
- Door hardware extras: door stops (rubber), coat hooks on the bathroom door, a full-length
  mirror on the master bedroom door (glass bonded to the door, if the door parts are known —
  otherwise on a wall).

Masses: ceiling fan 6–9 kg, flush-mount fixture 1–2.5 kg, pendant 1.5–3 kg, blinds 1.5–3 kg per
window, curtain panel 1–2 kg, baseboard heater 4–7 kg, AC indoor unit 9–13 kg.
