# Лиминальная Москва · Liminal Moscow

> **Development is paused mid-way** — see [`docs/RESUME.md`](docs/RESUME.md) for the current state and how to continue.

A first-person voxel walking simulator set in a Moscow residential district (спальный район) in the
winter of 2008. No objectives, no HUD, no enemies — just a long solitary walk through snow-covered
courtyards, an empty avenue, a frozen park and stairwells that smell of whitewash, under orange
sodium street lamps, with an old phone in your pocket.

Everything is generated procedurally at load: voxel buildings, trees, cars and props, the terrain,
signage and posters (in Russian, with optional English translations), and **all audio is
synthesized in real time with the Web Audio API** — there are no texture or sound files.

## Play

```bash
npm install
npm run dev        # open the printed URL (Chrome / Edge / Firefox, a discrete GPU is recommended)
```

`npm run build` produces a static site in `dist/`; `npm run build:single` produces one
self-contained `dist-single/index.html`.

### Controls

| | |
|---|---|
| **W A S D** / arrows | walk |
| **Shift** | walk faster |
| **Mouse** | look (click to capture the mouse) |
| **E** / click | interact — read notices, open doors, sit on benches, call the lift, buy bread |
| **Q** / Tab | take out the phone (arrows to navigate, E to select, Backspace back) |
| **F** | the phone's flashlight |
| **Esc** | pause menu & settings (mouse, FOV, head bob, volumes, quality, translations, retro pixels) |

Headphones recommended.

### Useful URL parameters

`?t=21:00` start time · `?weather=still|light|steady|heavy|clear|fog` · `?quality=low|medium|high` ·
`?stats=1` frame stats · `?x=..&z=..&yaw=..` start position.

## How it is built

- **Engine** (`src/core`, `src/render`, `src/player`, `src/audio`, `src/game`): Three.js r170.
  Greedy voxel meshing with per-vertex ambient occlusion in Web Workers; instanced models with
  LODs; a 0.25 m heightfield terrain with contact shadows; nearest-N point/spot lights with
  analytic in-scattering through height fog (computed once per pixel from the depth buffer);
  procedurally lit apartment windows with parallax room interiors; GPU snowfall that stops at
  roofs; footprints that fill with fresh snow; breath vapour; filmic grading with grain and
  ordered dithering; zone-based reverb, occlusion and eye adaptation.
- **Content** (`src/content/<package>`): self-contained packages discovered at load —
  residential panel blocks with walkable stairwells and lifts, public buildings and an enterable
  shop, street furniture, trees, vehicles and traffic, the underpass and metro station, the
  synthesized soundscape and music, the phone, pedestrians, and four district layouts.
- **Docs** (`docs/`): the creative brief, the master plan (map and conventions), the engine guide,
  the research bible on late-2000s Moscow, package specs and per-package catalogs.
- **Tools**: `node tools/shot.mjs` renders headless screenshots (model viewer or in-world).

Everything in the game — street names, brands, people — is fictional.
