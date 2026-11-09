# THE BACKROOMS — ENDLESS DESCENT

A first-person survival shooter set in the Backrooms, built on the **Ragdoll Lab** active-ragdoll
engine (balance, stepping, stagger, falls, get-up, wound physiology, ballistic penetration, gore).

**Play:** open `dist/index.html` in Chrome / Edge / Firefox (works from the file system or any static
server, e.g. `npm run serve` then http://localhost:8080). Click *Enter the Backrooms*. Add `?level=2` to the URL to start in Level 1, the warehouse
(1 lobby, 2 warehouse, 3 pipes, 4 office, 5 the Poolrooms, 6 the hotel); otherwise you descend every three waves.

See `CREDITS.md` for asset attributions.

## Controls
WASD move · Shift sprint (hold breath while scoped) · C / Ctrl crouch · Space jump / mantle ·
Left mouse fire · Right mouse sniper scope · R reload · 1-3 / Q / wheel switch weapon · V inspect ·
G grenade · H medkit · F kick · T weapon light · B shop (between waves) · Esc pause

There is no aiming down sights: every gun fires from the hip (the crosshair follows the gun's
sway); only sniper rifles raise a scope. The Laser Module tightens hip fire and shows where rounds go.

## How the enemies move
Gunmen are driven by motion capture (100STYLE "Swat": idle, walks and runs in four directions),
retargeted onto their Rocketbox skeletons by `tools/retarget.mjs`, with a shouldered aim and
reloads from Torque 3D's soldier on the arms, a two-hand IK stance for pistols, a torso that turns
until the barrel the hands hold is on target, and recoil. While undisturbed their ragdoll
is dormant and posed from the animation, so bullets hit what you see. A hit, blast or kick hands the
body to the active-ragdoll controller (stagger, stumble, fall); once they are back on their feet and
left alone they blend back into animation. Pistol carriers swing their free arm as in a natural walk
(100STYLE "Neutral", in step with the legs) and carry the gun one-handed, low at a walk and tucked
in at a run, until the two-hand stance comes up with the aim.

Getting up is motion capture too (CMU get-ups from the back and from the belly, each also mirrored):
when a body on the floor is ready to rise, the take and the moment in it that best match how it lies
are laid over the ragdoll (pelvis on pelvis, turned to its heading), the physics pose blends into the
clip and the clip, played fast (about 1.5 s for a fit fighter, slower when badly hurt, quick and
jerky for the Hollowed), flows into locomotion. A shot mid-way drops them back into the ragdoll.
Broken or severed limbs, or no room to stand, fall back to the engine's physical get-up.
Settings → Enemy movement switches to full physics.

## Building
`npm run build` concatenates `engine/ragdoll-engine.js` and `src/*.js` into `dist/index.html` and
wraps `assets/**/*.glb` as script files. Asset tools: `tools/rb2glb.mjs` (Rocketbox FBX → GLB),
`tools/prep-viewmodel.mjs` (first-person rigs), `tools/retarget.mjs` (BVH mocap → Rocketbox clips:
100STYLE loops, `--getup` one-shot clips from CMU takes, `ONLY=<bone regex>` for arm-only sets).
