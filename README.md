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
npm run build:html   # the whole simulator in one self-contained page: dist-html/infinite-cosmos.html
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end smoke test in headless Chromium (needs Playwright: npm i -D playwright && npx playwright install chromium)
```

The single-file page opens straight from disk (double-click it). It needs no server and no other files, only the
web fonts, which fall back to system fonts offline.

URL parameters: `?nomenu` skips the title screen; `?test` is the same, for automated tests.
The browser needs WebGL2. The renderer scales from the Low preset upward. Laptops and integrated GPUs (for example
Apple M1 or Intel) start on Medium. On those, these settings (Settings → Graphics) make the biggest difference:

- **Sky & cloud resolution.** The atmosphere and cloud raymarch is the most expensive part of a planet view. It
  renders at half resolution by default and is upsampled with depth awareness, so terrain edges stay sharp. A
  third is faster still.
- **Dynamic resolution** (on by default) lowers the 3D resolution when the frame rate drops below the target (30,
  45 or 60 fps) and raises it when there is headroom. The HUD shows the current scale.
- **Full Retina / HiDPI resolution** is off by default. On a high-density display it would render up to 4× the
  pixels.

## Getting started

The title screen offers two universes:

- **Known Universe.** The Solar System (J2000 orbital elements, IAU pole orientations), nearby catalogued stars with
  their confirmed exoplanets, famous nebulae, Sgr A*, and the Local Group. All of it sits inside an otherwise
  procedural cosmos.
- **Procedural Universe.** A new universe from any seed.

Click anything to select it. The info panel shows its properties; **G** travels there, **H** looks at it, **F6** orbits
it and **F7** runs a scientific scan (on a surface, it opens the field instruments). **N** spawns a spacecraft. Land, press **X** to step out, and **X** next to the ship
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
- Rogue planets (~0.3 per star) drift between the stars. They are star-less worlds warmed only by internal heat.
- Star systems are generated only when you approach them. They have binaries with Holman–Wiegert stability limits
  (S- and P-type planets), a snow line, metallicity-dependent giant planets, hot Jupiters, moons on equatorial orbits,
  resonance-forced eccentricities, asteroid and Kuiper belts, Trojan swarms at L4/L5 of giant planets, and comets.
  Active comets show a coma, an ion tail pointing away from the star, and a curved dust tail.
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
- Binary black holes: massive binaries can leave black-hole pairs 0.01–1 AU apart (about 1 system in 1500 in the
  Milky Way). Each hole lenses the sky, including its partner. The info panel gives the separation, the period and
  the time to merge by gravitational waves (Peters formula).
- Pulsars flash only when a beam sweeps across you; the beams themselves are invisible from the side. Ṗ comes from
  the dipole field, and the spin-down power is 4π²IṖ/P³. The pulsed optical light is about 2×10⁻⁵ of that, as for the
  Crab, so only young, fast pulsars are bright. Millisecond pulsars are averaged over a turn, and slow ones visibly
  blink.
- Transient events at physical rates: core-collapse and Ia supernovae, novae, tidal disruption events, kilonovae.
  - They have analytic light curves and are catalogued when observed. They are rare in real time and visible under
    time acceleration.
  - You can select an event and travel to it. Up close, its expanding ejecta (radius v·t) become a volume: first an
    optically thick, mottled photosphere whose colour cools with time, then thinning knots and filaments glowing in
    Hα, [O III] and [Fe II].
  - Brightness follows the light curve. Seen from afar, the same explosion is a point source with the same total
    flux.

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
- Meteors burn up where the air density reaches about 5×10⁻⁷ kg/m³ (about 100 km on Earth).
  - Every world with air has a sporadic background and annual showers.
  - A shower's activity is Gaussian in solar longitude. Its meteors share a radiant and speed, and the observed
    rate follows the radiant's altitude.
  - Earth has its real major showers: Quadrantids, Lyrids, η-Aquariids, Perseids, Orionids, Leonids and Geminids.
  - Magnitudes follow a population index of 2.5, and meteors are drawn through the same photometric pipeline as
    stars.
  - Each meteor has a sin^1.5 light curve and a streak the length of the eye's persistence. Fireballs leave
    persistent trains, and colour follows speed.
  - You are notified when a strong shower is active where you are.
- Aurorae appear in magnetic local time. Their colour comes from composition and their brightness is calibrated to
  terrestrial kR values.
- Rain, snow, dust and ash fall only under thick cloud read from the same weather map. Fall speed ∝ √(g/ρ).
- Rivers cut valleys in wet lowlands with a surface liquid. You can swim in them, and vegetation and animals avoid
  them. Volcanic worlds with lava or sulfur seas have molten channels instead. They look dark and crusted under a
  bright star and glow on the night side.
- Seasons follow axial tilt. Snow lines and vegetation shift with the subsolar latitude. The swing is larger on
  thin-aired, dry worlds and damped by oceans and thick atmospheres.
- Sun shadows: two cascades around the observer.

**Life (rare)**
- Life is possible only on worlds with stable liquid water, suitable temperature, pressure and radiation, and enough
  time. Even then it usually stays microbial; complex life is rarer still.
- Pigments follow the host star's spectrum (near-black, purple or crimson under red dwarfs; golden under K stars;
  green or purple under G stars; teal under F stars).
- Flora are procedural body plans (conifer, broadleaf, frond, fungal, spire, coral, crystal, shrub, tuft, microbial
  mats). They scale with gravity and are placed by the same moisture and temperature fields the terrain shader uses.
- Bioluminescent biospheres glow after dark. Glowing ground and foliage are patchy and pulse slowly, with per-plant
  hue and strength. The brightness is foxfire-like, about 10⁻⁶ of sunlit ground, so the glow dominates only once
  the eye has dark-adapted.
- Fauna are 4- or 6-legged herds. They graze, wander and flee the observer. Diurnal species rest at night and
  nocturnal ones by day; nocturnal species are more common on glowing worlds. Herds bunch up in rain or snow.
- Living worlds with dense air (above about 1 bar) host floaters: buoyant gas-filled bells trailing tentacles.
  They drift with the zonal winds (easterly trades, westerlies beyond about 30°), bob and pulse. They are translucent
  against the light and glow at night on bioluminescent worlds. Bells grow larger where the air is denser and gravity
  weaker. This is speculative biology, after Sagan & Salpeter's Jovian floaters.
- Fliers soar in flocks, circling in thermals and banking into their turns, with bouts of flapping. Wing span grows
  as gravity weakens and the air thickens. Flocks roost by night (nocturnal ones by day) and stay down in heavy rain
  or snow.
- Seas of water, brine, ammonia or hydrocarbons hold swimmers, in pods whose loops keep to water deeper than about
  10 m. Large air-breathers surface in bouts of a few breaths, showing only their backs, with a misty blow, and end
  each bout with a fluke-up dive. Where the air holds no oxygen, broad flat baskers rise to the surface instead.
  Schools of small swimmers leap clear in ballistic arcs. Launch speed is set by muscle, so a leap rises
  h = v²/2g: four times higher at a quarter of Earth's gravity. Spray from blows and splashes is lit by the local
  daylight. The sea surface is opaque, so only what breaks it is drawn.
- Some biospheres grow crystalline colonies: faceted, glassy silica-shelled prism clusters with a specular sheen.
- Fossil biosignatures and other rare anomalies are recorded.

**Spaceflight and walking**
- Ships use restricted n-body gravity in body-centred frames, with sphere-of-influence switching and Kepler rails
  under time warp. Flight includes atmospheric drag and lift, Sutton–Graves heating with a plasma sheath, hover and
  landing assist, autopilot (approach, land), and orbit readouts.
- There are five ship classes. Warp drive and hyperspace jumps are **speculative fiction** and are labelled as such.
- Ship motion is integrated with velocity Verlet, so velocity stays in step with position. Relative navigation
  relies on this.
- Docking works with the ISS and Tiangong, which fly their real orbits (Kepler about Earth's equator) in LVLH
  attitude, with ports at their real locations.
  - Within 5 km, a docking computer selects the nearest port.
  - The docking scope shows range, closing rate, lateral offset, alignment and roll.
  - Near a port, W/S fire fore/aft thrusters.
  - Auto-dock flies to a hold point on the port axis (detouring around the structure), aligns, then closes at
    0.04 + 0.22√d m/s.
  - Soft capture needs < 0.3 m lateral offset, < 0.6 m/s closing speed, < 6° misalignment and < 12° roll. The ship
    then hard-docks, rides with the target and is refuelled.
- The cruiser and the heavy explorer carry a shuttle (scout or lander). You can launch it while the mothership stays
  in orbit, fly down, land and walk, then dock back into the berth and take command of the mothership again.
- On foot, gravity is the real surface gravity, and traction is friction-limited (μg). Steep slopes make you slide.
  You can swim in any surface liquid. Jump height scales as 1/g (unit-tested: the Moon gives about 6× Earth).
  Following the project brief, walking has no spacesuit or survival restrictions.
- Caves can be entered on foot through skylights, stretches of collapsed roof with a rubble ramp at one end:
  - lava tubes on volcanic worlds, wider under low gravity (about 25 m across on the Moon)
  - ice caves in icy crusts
  - limestone caves with stalactites and stalagmites on wet worlds

  The skylight is carved into the terrain, so rendering, collisions and every LOD agree. The tunnel beyond is a
  meandering mesh that runs under intact rock and ends in a breakdown choke where its roof would grow too thin.
  The terrain shader cuts the mouth out of the skylight's far wall.

  Inside, sunlight reaches only along rays that pass through the opening. Skylight fades with distance from the
  mouth, a headlamp switches on, and living worlds have glow-worm lights on the ceiling. Walls and the ceiling hold
  you in, and the air sits at the planet's mean temperature. The field instruments report the rock overhead and
  how much radiation it blocks: a lunar lava tube cuts the dose by more than 50×. On the surface they give the
  bearing to the nearest skylight.

**Science instruments**
- Spectra appear in the info panel after a scan. Stars show a Planck continuum with the lines their temperature
  produces: He II in O stars, Balmer lines peaking near 9,500 K, Ca II H and K, the G band, Mg b and Na D in cool
  stars, TiO bands in M dwarfs and broad Balmer wings in white dwarfs. Planets with air show a reflectance spectrum.
  It has a Rayleigh blue slope and the molecular bands of the generated atmosphere (H₂O, CO₂, CH₄, O₂, O₃, NH₃, CO,
  H₂). Water vapour comes from Clausius–Clapeyron over surface water, and ozone from photochemistry wherever there is
  free O₂. A vegetation "red edge" shifts toward the infrared around cool stars. Each spectrum carries a short
  reading, such as the O₂ + CH₄ disequilibrium biosignature that the Galileo flyby saw on Earth.
- Field instruments (**F7** while on foot or landed) take live readings from the same generator as the terrain:
  - position and elevation relative to the liquid level
  - gravity, including the centrifugal term
  - local air pressure, temperature and composition
  - what lies underfoot (bedrock type, regolith, sand, ice, soil or open sea), and bulk composition
  - the dipole magnetic field at your latitude
  - seismicity per 100 km, calibrated on Earth
  - life detection, including aquatic life at sea
  - subsurface findings (groundwater, permafrost, buried oceans, lava tubes)
- The radiation dose model is shared by the instruments and the info panel. It is calibrated on measured doses:
  - Earth: 2.4 mSv/yr at sea level and about 45 at airliner altitude
  - Mars: about 230 (Curiosity)
  - the Moon: about 500 (Chang'e 4)
  - the Galilean moons: Io about 36 Sv/day, Europa 5.4, Ganymede 0.08, Callisto 0.0001

  It combines cosmic rays attenuated by the air column and screened by the magnetosphere, stellar particles,
  trapped belt particles around giant planets, and ground radioactivity.

**Presentation**
- The HDR pipeline has GPU auto-exposure (log-average metering, eye-like adaptation), bloom, AgX tone mapping, FXAA
  and white balance toward sunlight.
- Camera and lens options (Settings → Graphics), applied to the HDR image before exposure and bloom so highlights
  turn into bokeh and streaks:
  - **Depth of field** uses a thin lens on a full-frame sensor. The focal length follows the field of view and the
    aperture runs from f/0.95 to f/22. It can autofocus on the centre of the view, smoothed over time, or use a
    manual focus distance. Foreground blur spreads over sharp subjects behind it, but not the reverse.
  - **Motion blur** reprojects each pixel's depth into the previous frame, relative to the body the camera moves
    with, so the ground you stand on stays sharp while you turn. The shutter is set as a fraction of 1/24 s
    (180° is the film standard). Reduce motion turns it off.
  - **Lens effects:** chromatic aberration, film grain and vignette.
  - **Screenshots** (F9 or P) are supersampled at 2× or 4×.
- Procedural WebAudio respects the medium. Vacuum is silent apart from hull-borne engine and RCS sounds and your own
  steps. Thin air is quiet and muffled. Wind ∝ ρv². There is thunder, liquids, fauna calls and an optional cinematic
  mode.
- Interface: labels, orbits, selection reticle, info panel with provenance (catalogued, procedural or hypothetical),
  scan-gated details, search (including procedural designations such as `ICS 3p12-m4-p7-15`), a 3D map at four
  scales, a discovery catalogue with thumbnails, bookmarks, autosave and continue, cinematic camera paths with
  time-lapse and letterbox, and supersampled screenshots.
- Accessibility: UI scale and opacity, high-contrast and colour-blind palettes, reduce-motion (also disables motion
  blur), remappable controls, invert-Y and mouse sensitivity.

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
- **Light.** Sun shadow maps cover about 4 km around the observer (terrain, plants, rocks, animals, ship). Beyond that,
  surfaces get eclipses, horizon and cloud shadows and macro-normal self-shadowing, but distant mountains cast no long
  shadows. Clouds receive no shadows from terrain.
- **Terrain.** Rivers are channels carved along the zero set of a warped noise field. They are wide near the sea,
  narrow upstream, and absent where it is dry, frozen or without a surface liquid. They are not a drainage
  simulation, so they do not merge into trees of tributaries. There are no footprints or vehicle tracks. Caves are single tunnels from a skylight, without branches or chambers.
  Erosion is procedural (derivative-damped noise), not a simulation. Terrain streaming speed depends on CPU cores; it is fast
  on desktop hardware and slow under software rendering.
- **Climate.** Temperature varies with latitude, altitude, tidal locking and season. Seasons shift shading
  (snow and vegetation lines) but not the weather map or ground physics. The weather map drifts but does not evolve
  dynamically.
- **Life.** Flora and fauna are procedural illustrations constrained by the world's physics. They are not an
  ecological simulation. Alien biology is speculative by nature.
- **Known data.** Catalogue values are rounded literature estimates. Unknown properties (for example the surfaces
  of exoplanets) are modelled, and the info panel says so.
- **Stations.** Only real stations exist (the ISS and Tiangong). The procedural universe has no inhabited outposts.
  Station orbits ignore drag and J2 nodal precession. Station models are simplified, and you cannot go inside.
- **Not yet implemented.** Survival mode (omitted by design for walking) and video export. The Oort cloud is shown only as an inferred shell in the
  map.
- **Performance** has been measured only in headless Chromium with software rendering (SwiftShader). Timed with a
  forced GPU sync on Earth at 1280×720:
  - the atmosphere and cloud pass dominated the frame (≈ 75 %)
  - rendering it at half resolution, and skipping the aurora march against a lit sky, cut the whole frame by more
    than half

  Real GPUs have not been profiled, so no frame rate is promised.

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
- the ISS orbit (period, altitude, 51.6° inclination) and its LVLH attitude
- auto-docking from 120 m:
  - the ship never passes through the structure
  - it stays latched for minutes of orbit
  - it separates cleanly
- launching a mothership's shuttle, docking it back and stowing it
- nebula placement and transient-event rates
- lava channels on molten worlds
- spectra:
  - the Sun's Wien peak and Ca II lines, Vega's Balmer lines and TiO in M dwarfs
  - H₂O, O₂, O₃, the red edge and the O₂ + CH₄ biosignature on Earth; CO₂ on Mars; CH₄ on Titan
- field instruments on land and at sea, and surface radiation doses across the Solar System
- swimmers: pods only in deep water, breathers mostly submerged, and leap apex ∝ 1/g
- dynamic resolution: drops when frames are slow, recovers with headroom, holds steady near the target
- caves:
  - a skylight floor at depth, with a walkable ramp
  - a tunnel roof of rock along its length
  - an inward-facing mesh
  - walking from the skylight into the tunnel with walls and floor holding
  - the field instruments' shelter reading
- thin-lens optics for depth of field (circles of confusion, focal length from the field of view)

`npm run test:e2e` drives the real application in headless Chromium:

- the Earth start, search and go-to
- the map at all scales
- a ship in lunar orbit, then landing, walking and boarding
- bookmarks, then auto-docking to the ISS's forward port and undocking
- the Proxima Centauri system and scanning
- the intergalactic view and arrival at a procedural star

It asserts on simulation state and on rendered pixels.
