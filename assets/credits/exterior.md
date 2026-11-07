# Exterior aircraft module – asset credits

All exterior textures are generated procedurally at runtime (HTML canvas) by
`src/aircraft/exterior/textures.js` and `src/aircraft/exterior/liveries.js`:

* wing atlas (paint, panel lines, rivet rows, access panels, walkway, LE erosion,
  hydraulic grime, winglet paint) – colour, normal (from a height canvas) and
  roughness/metalness maps
* nacelle paint, inlet/fan details, spinner swirl, fan blur disc, reverser cascades
* tyres, stencil decal sheet (NO STEP, EXIT, walkway…), contrail puffs (shader)
* fictional liveries: Halcyon Airways, Northwind, Solaris, Coral Air, Atlas Cargo,
  Meridian Blue (all invented – no real airline branding)

No external image, model or font files are used by this module (text uses the
browser's built-in sans-serif / serif fonts).

Geometry is fully procedural (planform/airfoil lofting, lathes, lofts) and based on
public Boeing 737-800 dimensions from `src/core/constants.js`.
