# Boeing 737-800 Passenger Flight

A first-person, browser-based passenger experience aboard a Boeing 737-800 of the fictional
**Halcyon Airways** (flight HN 482, Cedar Bay → Port Solano). You board an empty cabin at the gate,
push back, taxi, take off, climb through the clouds, cruise above a sea of clouds, descend over the
coast at sunset, land, and taxi to the arrival gate — free to walk around the whole time.

Built with Three.js r187 (vendored), plain ES modules, no build step and no runtime dependencies.

## Run

```bash
node scripts/serve.mjs
```

Then open http://localhost:8080/ in a recent desktop Chrome, Edge or Firefox with hardware
acceleration. Headphones are recommended. Any static file server works too.

## Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Walk |
| Mouse | Look (click the view to capture the mouse) |
| E or left click | Interact (bins, shades, tray tables, lights, lavatory, galley, seats, screens…) |
| Space / X | Stand up |
| C | Crouch |
| Mouse wheel | Lean towards the window when seated |
| V, then 1–6 | Cinematic exterior camera and its shots |
| Tab | Flight progress panel (skip to cruise / approach, begin descent, restart) |
| M | Seat map (sit in any seat) |
| H | Hide HUD |
| F | Fullscreen |
| F1 | Help |
| Esc | Pause menu and settings |

## What's in it

- **Cabin:** Boeing Sky Interior style. Sculpted sidewalls and 90 dual-pane windows with pull-down shades. Pivot overhead bins (some with luggage) and PSUs with reading lights, air vents and call buttons. LED mood lighting that changes with the flight phase. Sunlight enters through the windows as moving patches.
- **Seats:** 154 seats (business 2-2, economy 3-3) with tray tables, recline, armrests, seatbelts and seat-pocket literature.
- **Galley, lavatories and doors:**
  - Forward and aft galleys with carts, ovens and drawers.
  - Three lavatories with a lock, a working mirror, a flush and a sink.
  - The L1 door opens onto the jet bridge at the gate. The cockpit door is locked.
- **Seatback entertainment** on every seat:
  - Open movies (Blender Foundation, CC-BY) and the Caminandes episodes presented as TV.
  - Original generative music, a live moving map and flight info.
  - A safety slideshow during the safety announcement. Playback pauses for PA announcements.
- **Flight:** the full journey with realistic speeds, rotation, gear, flaps, spoilers and reverse thrust, turbulence, and cabin signs. Phases: gate → pushback → taxi → hold short (traffic lands in front of you) → takeoff → climb → cruise → descent → approach → landing → taxi-in → arrival.
- **World:** physically based sky with time of day (sunset arrival) and volumetric clouds. Terrain reaches the horizon with farmland, mountains and lakes, and there is an ocean gulf at the arrival. Both airports have lights, signs, jet bridges, ground crew, vehicles and AI traffic. The coastal city at the arrival lights up at dusk.
- **Audio:** engines, airflow, ground roll, gear, flaps and touchdown sounds are synthesized live. Chimes, foley and pre-rendered PA announcements are included, with subtitles.

Settings (Esc → Settings) cover graphics quality (auto-detected), FOV, exposure, camera shake,
volumes, subtitles, gate and cruise duration, flight pacing, time of day, weather and units.

## Development

- Architecture and module contracts: `docs/ARCHITECTURE.md`
- Headless screenshot: `node scripts/shot.mjs --out x.png --query "phase=cruise&seat=16A&look=95,-8"`
- Full-journey smoke test: `node scripts/check.mjs <outDir>`
- Debug URL parameters: `?phase=approach&progress=0.5&seat=22A&look=95,-10&tod=18.6&quality=low`

## Credits

See [CREDITS.md](CREDITS.md). Airline, airports and cities are fictional.
