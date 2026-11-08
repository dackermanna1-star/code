# City & settlements module — asset credits

The city module (`src/world/city/`) uses **no external assets**. Everything is generated at runtime:

| Content | How it is made |
|---|---|
| Building facades (curtain walls, punched / ribbon windows, residential, industrial, shop fronts) | Procedural GLSL in `materials.js`: analytically box-filtered window grids driven by per-vertex facade coordinates, PBR glass (sky reflections from the scene environment map), mullions, spandrels, grime; per-window night lighting (warm / cool / TV flicker, lit office floors) |
| Roofs (flat membrane / gravel, clay tiles, asphalt shingles), lawns, pools, containers | Procedural GLSL (value noise + filtered stripes) |
| Roads, lane markings, railway, pier boards, street-light pools | Procedural GLSL in `createRoadMaterial` |
| Houses, barns, boats, trees, palms, conifers | Procedural unit meshes (`shapes.js`), custom GPU instancing |
| Towers, mid-rises, port (cranes, ships, stacks), marina, pier + Ferris wheel, stadium, church, water tower, grain elevator, pylons, wind turbines | Procedural geometry (`buildings.js`, `landmarks.js`, `departure.js`) merged per region |
| Traffic (cars, trucks, buses, freight trains) and their lights | GPU-animated instances along road splines stored in a float texture (`traffic.js`) |
| Street lights, warning lights, yard lights | Additive point sprites (`roads.js`, `materials.js`) |
| Sun shadows of buildings / houses / trees | Projected shadow geometry (`shadows.js`) |

Layout data comes from the shared geography contract (`src/world/geo.js`) and the airport layout
(`src/world/layout.js`). No third-party code or data was copied.
