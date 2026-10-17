# Catalog: `avenue` — проспект Строителей, the south strip and the bus terminal

Package `src/content/avenue/` (order 32, district layout). Region: z 500–600 for every x 0–640
(the avenue, its sidewalks, median, lamps and wires also run through the east/west wrap bands),
except the metro footprint x 374–396, z 504–574 (the metro package's; we only meet its edges).
The package is still listed in the `WIP` set of `src/content/index.js`; load it with `?wip=1` or
name it in `?only=…` until the lead removes it from that set.

```js
import { AVENUE_GEO, AVENUE_STATIONS } from '../avenue/api.js'
// AVENUE_GEO = { Z, LANES_W, LANES_E, PERIOD, STOP_N, STOP_S, ZEBRA, TERM, METRO, NAV_N, NAV_S, WALK_LAMPS }
// AVENUE_STATIONS = [0, 37, 74, …, 629]  (x of every median lamp / trolley span)
```

Files: `layout.js` (every coordinate — read this first), `ground.js` (terrain), `overhead.js`
(median lamps, trolley poles, span and contact wires, sidewalk lamps, terminal wires),
`north.js`, `south.js`, `terminal.js`, `details.js` (notices, graffiti, story props, crows),
`nav.js` (nav paths, zones, registry), `trails.js` (old footprint trails, added in `init`),
`api.js`.

(draft — completed at the end of the layout pass)
