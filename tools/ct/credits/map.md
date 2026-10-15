# Chinatown map (CHINATWN): sources and method

Built by `tools/ct/build-map.mjs` from the layout data in `tools/ct/layout/`.
No NMRiH file is shipped or committed: no BSP, nav mesh, textures, models,
sounds or entity lumps.

## What the layout data is

`tools/ct/layout/raster.json` and `tools/ct/layout/ref.json` are our own
measurements, made once by `tools/ct/extract-layout.py` from the
`nmo_chinatown` reference data that the research pass extracted into the
session scratchpad. That data is No More Room in Hell (Torn Banner Studios /
the NMRiH team; map by SotaPoika with nay0r, based on City of Dawn). The
script records:

- **raster.json**: the walkable space of three layers (streets, the relocated
  subway, the relocated sewers) on an 8-unit grid. For each cell it stores a
  floor height, a ceiling height or "sky", coarse surface classes such as
  road, sidewalk, brick or tile, nav-mesh barriers, open water, the height
  of solid blocks and of the wall faces beside walkable space, and flags for
  cells inside nav areas, cells blocked by a prop the nav mesh went round
  and cells under a player clip. The sources are the nav mesh's walkable
  rectangles and the map's brush boxes and face planes. Texture names are
  reduced to these classes and are not kept.
- **ref.json**: point lists for vehicles (footprint centre fitted to the nav
  hole), street props, other solid props reduced to a kind (shelf, dumpster,
  pallet...), chain-link fences, signs, lights, zombie spawn volumes, item
  spawner categories, the helicopter path and the extraction box. Each entry
  is a position and a yaw, with a model reduced to a type.

`tools/ct/layout/edits.mjs` is hand-written for this project: zones and
styles, doors, objective lines and things, tags, portals, ladders, the
paifang arch and the lighting rules.

The geometry, light levels and placement are original work derived from
those measurements. All surfaces use the project's own `CT*`/`CF*` textures
(see `textures.md`); the sky flat is the IWAD's `F_SKY1`.

## Tools

- Nodes: `tools/ct/lib/bsp.mjs` (project code). The map was cross-checked
  with ZDBSP (GPL, used as an external program only; nothing of it ships).
- Validation: `tools/ct/lib/validate.mjs` and `tools/ct/check-map.mjs`
  (project code). The checker models the player as DOOM does (a 32x32 box,
  24-unit steps, 56 units of room) and walks the objective chain stage by
  stage, also proving each gate is shut before its stage; it checks zombie
  and wave-marker spawn spots, pickups, secrets and chokepoints.

## Licence

The map data produced by these scripts is part of this project and carries
the project's licence.
