// The loaded map's definition (src/map/maps/index.js, or a BSP map's maps.js entry) for code
// that has no Game at hand, such as bots.js zoneOf. Set once per page by loadWorld (world.js).
let active = null;

export function setActiveMap(def) { active = def || null; }

/** The loaded map's definition, or null before loadWorld. */
export function activeMap() { return active; }

/** The loaded map's callout boxes ([name, tag, x0, y0, x1, y1, zMin, zMax] rows), or null (bots.js: dust2's). */
export function activeZones() { return active?.zones || null; }
