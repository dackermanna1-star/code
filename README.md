# Infinite Cosmos

A procedurally generated, seamlessly explorable universe simulator that runs in the browser (TypeScript, Three.js, WebGL2).
You can fly continuously from a pebble on an alien world, through its atmosphere and clouds, past its moons and across its
star system, between stars and nebulae and out of the galaxy into the cosmic web, with no loading screens and no boundaries.
You can also spawn a spacecraft and fly it with Newtonian physics, land, step out and walk anywhere on a solid surface.

The universe is deterministic. Every galaxy, star, planet, mountain, plant and animal comes from coordinates and seeds,
so a world you leave and return to is the same world. Planetary appearance follows physical properties (mass, composition,
irradiation, atmosphere, climate, life) rather than random cosmetics. Most worlds are barren and life is rare.

## Running

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end smoke test in headless Chromium (needs Playwright: npm i -D playwright && npx playwright install chromium)
```

URL parameters: `?nomenu` skips the title screen; `?test` is the same, for automated tests.
The browser needs WebGL2. A discrete GPU is recommended. The renderer scales from the Low preset upward.

## Getting started

The title screen offers two universes:

- **Known Universe.** The Solar System (J2000 orbital elements, IAU pole orientations), nearby catalogued stars with
  their confirmed exoplanets, famous nebulae, Sgr A*, and the Local Group. All of it sits inside an otherwise
  procedural cosmos.
- **Procedural Universe.** A new universe from any seed.

Click anything to select it. The info panel shows its properties; **G** travels there, **H** looks at it, **F6** orbits
it and **F7** runs a scientific scan. **N** spawns a spacecraft. Land, press **X** to step out, and **X** next to the ship
boards it again. **M** opens the 3D map, **F3** search, **F4** the discovery catalogue, **F5** bookmarks the current
location, **F10** opens cinematic camera paths, **F1** shows all controls and **Esc** opens settings (graphics,
accessibility, simulation, audio, key rebinding).

## What is simulated

**Scale and precision**
- Hierarchical universe coordinates: 2⁴⁰ m integer cells plus float64 offsets, with a floating origin. The camera is
  always at the origin and every object is placed camera-relative in float64. This gives sub-millimetre precision
  across gigaparsecs (unit-tested).
- Reference frames are relative to a body (rotating or inertial) or the universe frame. Re-anchoring is lossless, so
  you can stand on a spinning planet without jitter.
- A logarithmic depth buffer covers ranges from centimetres to 10²⁷ m.

**Universe structure**
- A cosmic web of ridged-noise filaments and cellular clusters. Galaxies are drawn from a Schechter luminosity
  function, and the morphology–density relation sets their types.
- Galaxy morphologies: grand-design and barred spirals, ellipticals, lenticulars, dwarfs, irregulars, rings, and
  interacting systems with warps. Volumes are ray-marched from the same density model that places their stars, with
  analytic vertical integration for dust lanes.
- Stars are generated lazily in hierarchical, magnitude-banded sectors (12 levels) in a worker. Populations (young
  arm stars, old disk, bulge, halo) come from population libraries built with a Kroupa IMF and stellar-evolution
  tracks.
- Star systems are generated only when you approach them. They have binaries with Holman–Wiegert stability limits
  (S- and P-type planets), a snow line, metallicity-dependent giant planets, hot Jupiters, moons on equatorial orbits,
  resonance-forced eccentricities, asteroid and Kuiper belts, and comets.
- Nebulae are catalogued plus procedural (per 1500-ly cell, following star formation and dust). Types are H II
  regions, planetary nebulae, supernova remnants, reflection and dark nebulae. All are volumetric, and dark clouds
  absorb background light.

**Stars and compact objects**
- Mass–luminosity–radius relations, main-sequence lifetimes, and post-main-sequence phases (subgiant, red giant,
  horizontal branch, AGB, white dwarf, neutron star, black hole).
- Photopic visual efficacy, so red dwarfs look as dim as they really are. Blackbody colours, limb darkening,
  granulation, starspots, and a K-corona falloff.
- Stellar flares: their rate scales with activity², they are strong on red dwarfs, and they brighten both the star and
  its planets' illumination.
- Black holes: per-pixel Schwarzschild null-geodesic integration near the hole (shadow, photon ring, Einstein ring),
  with weak-field deflection further out. Accretion disks follow a Novikov–Thorne temperature profile with Doppler
  beaming and gravitational redshift.
- Transient events at physical rates: core-collapse and Ia supernovae, novae, tidal disruption events, kilonovae.
  They have analytic light curves and are catalogued when observed. They are rare in real time and visible under
  time acceleration.

**Planets**
- Bulk composition sets the radius. Each world gets irradiation and equilibrium temperature, tidal locking, Jeans
  escape (XUV-enhanced), a greenhouse fit, phase-limited surface liquids (water, brines, methane, ammonia, nitrogen,
  sulfur, lava), tidal heating, a magnetic field, and radiation.
- The classification and every visual parameter (terrain modules, palette, atmosphere optics, clouds, gas-giant bands,
  rings) are derived from these physics. Catalogue values override them where measured, and the result is labelled.
- Terrain is a cube-sphere quadtree built in Web Workers, with geomorphing, skirts and horizon culling. Its modules
  are plates, ridged mountains, eroded hills, maria, canyons, terraces, volcanoes, ice lineae, power-law crater
  populations, dunes and fractal detail. Relief scales with gravity, and octaves fade fractionally so there is no
  LOD popping.
- Atmospheres use the Hillaire-2020 model (transmittance, multiple-scattering and sky-irradiance LUTs). Composition
  sets Rayleigh scattering, coloured aerosols, ozone and methane absorption. Gas giants use oblate ray stretching.
- Volumetric clouds come from a GPU weather cubemap (cyclones with the correct Coriolis sense, zonal flow), a
  Worley/Perlin detail texture, two-stream diffuse lighting, lightning and cloud shadows. The surface below goes grey
  and diffuse under overcast.
- Aurorae appear in magnetic local time. Their colour comes from composition and their brightness is calibrated to
  terrestrial kR values.
- Rain, snow, dust and ash fall only under thick cloud read from the same weather map. Fall speed ∝ √(g/ρ).

**Life (rare)**
- Life is possible only on worlds with stable liquid water, suitable temperature, pressure and radiation, and enough
  time. Even then it usually stays microbial; complex life is rarer still.
- Pigments follow the host star's spectrum (near-black, purple or crimson under red dwarfs; golden under K stars;
  green or purple under G stars; teal under F stars).
- Flora are procedural body plans (conifer, broadleaf, frond, fungal, spire, coral, shrub, tuft, microbial mats). They
  scale with gravity and are placed by the same moisture and temperature fields the terrain shader uses.
- Fauna are 4- or 6-legged herds. They graze, wander and flee the observer.
- Fossil biosignatures and other rare anomalies are recorded.

**Spaceflight and walking**
- Ships use restricted n-body gravity in body-centred frames, with sphere-of-influence switching and Kepler rails
  under time warp. Flight includes atmospheric drag and lift, Sutton–Graves heating with a plasma sheath, hover and
  landing assist, autopilot (approach, land), and orbit readouts.
- There are five ship classes. Warp drive and hyperspace jumps are **speculative fiction** and are labelled as such.
- On foot, gravity is the real surface gravity, and traction is friction-limited (μg). Steep slopes make you slide.
  You can swim in any surface liquid. Jump height scales as 1/g (unit-tested: the Moon gives about 6× Earth).
  Following the project brief, walking has no spacesuit or survival restrictions.

**Presentation**
- The HDR pipeline has GPU auto-exposure (log-average metering, eye-like adaptation), bloom, AgX tone mapping, FXAA
  and white balance toward sunlight.
- Procedural WebAudio respects the medium. Vacuum is silent apart from hull-borne engine and RCS sounds and your own
  steps. Thin air is quiet and muffled. Wind ∝ ρv². There is thunder, liquids, fauna calls and an optional cinematic
  mode.
- Interface: labels, orbits, selection reticle, info panel with provenance (catalogued, procedural or hypothetical),
  scan-gated details, search (including procedural designations such as `ICS 3p12-m4-p7-15`), a 3D map at four
  scales, a discovery catalogue with thumbnails, bookmarks, autosave and continue, cinematic camera paths with
  time-lapse and letterbox, and screenshots.
- Accessibility: UI scale and opacity, high-contrast and colour-blind palettes, reduce-motion, remappable controls,
  invert-Y and mouse sensitivity.

## Architecture

```
src/core      precision coordinates (UPos), deterministic RNG and noise, constants
src/astro     physics and generation: stars, planets, systems, galaxies, sectors, nebulae, catalogues (known/)
src/terrain   surface generator, cube-sphere quadtree, mesh builder, worker pool
src/render    HDR pipeline, atmosphere/clouds, planets, gas giants, rings, stars, galaxies, nebulae, black holes,
              comets, scatter (rocks/flora/fauna), precipitation, ships
src/sim       world and reference frames, spectator, ship, walker, cosmos (lazy activation), targets, events,
              discoveries, saved locations, cinematic paths
src/ui        HUD, overlay (labels/orbits), info panel, search, map, catalogue, settings/help, title screen
src/audio     procedural WebAudio engine
tests/unit    Vitest suites (determinism, precision, orbits, terrain seams, physics, UI logic, events)
tests/e2e     headless browser smoke test and screenshot/probe tools
```

**Simulation tiers.**
1. The immediate environment (terrain, scatter, ship physics, weather) runs at full fidelity.
2. The active star system is updated analytically on Kepler orbits every frame.
3. Other systems exist only as sector entries: a position, a luminosity, and a seed for the deterministic generator.
4. The rest of the universe is evaluated on demand from the cosmic-web field.

## Approximations and limitations

These are deliberate simplifications. Where a model is an approximation, it is documented in the code at the point
of use.

- **Orbits.** Bodies follow Keplerian orbits (nested two-body), so there are no mutual perturbations or secular
  evolution between planets. Ships do feel all bodies through restricted n-body gravity.
- **Relativity.** Black holes are non-rotating (Schwarzschild). Lensing beyond the strong-field region uses the
  weak-field angle, and background lensing is screen-space. Light-travel time is ignored for transient events.
- **Light.** Planets have no shadow maps. Surfaces get star occlusion by eclipses, horizon and cloud shadows, and
  macro-normal self-shadowing, but mountains cast no long shadows. Clouds receive no shadows from terrain.
- **Terrain.** There are no explicit river networks or caves, and no footprints or vehicle tracks. Erosion is
  procedural (derivative-damped noise), not a simulation. Terrain streaming speed depends on CPU cores; it is fast
  on desktop hardware and slow under software rendering.
- **Climate.** Temperature varies with latitude, altitude, and tidal locking. Seasons are not simulated, and the
  weather map drifts but does not evolve dynamically.
- **Life.** Flora and fauna are procedural illustrations constrained by the world's physics. They are not an
  ecological simulation. Alien biology is speculative by nature.
- **Known data.** Catalogue values are rounded literature estimates. Unknown properties (for example the surfaces
  of exoplanets) are modelled, and the info panel says so.
- **Not yet implemented.** Rogue planets, Trojans, Oort clouds, binary black holes, docking, survival mode (omitted by
  design for walking), depth of field and motion blur, and video export.
- **Performance** has been verified only in headless Chromium with software rendering (SwiftShader), where it is
  functional at reduced frame rates. Real GPUs have not been profiled yet, so no frame rate is promised.

## Testing

`npm test` runs unit tests covering:

- RNG determinism and UPos precision at gigaparsec scale
- noise derivatives and fractional-octave continuity
- the Kepler solver, energy and angular-momentum conservation, and orbit round-trips
- stellar evolution and the IMF
- the Solar System ephemeris
- procedural determinism, diversity and the rarity of life
- moon Hill stability and terrain seams across cube faces
- Milky Way density calibration and deterministic star sectors
- rebuilding systems from their ids
- info-panel provenance and scan gating, and search ranking
- ship orbit stability, surface gravity and jump heights
- nebula placement and transient-event rates

`npm run test:e2e` drives the real application in headless Chromium:

- the Earth start, search and go-to
- the map at all scales
- a ship in lunar orbit, then landing, walking and boarding
- bookmarks, the Proxima Centauri system and scanning
- the intergalactic view and arrival at a procedural star

It asserts on simulation state and on rendered pixels.
