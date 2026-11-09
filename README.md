# THE BACKROOMS — ENDLESS DESCENT

A first-person survival shooter set in the Backrooms, built on the **Ragdoll Lab** active-ragdoll
engine (balance, stepping, stagger, falls, get-up, wound physiology, ballistic penetration, gore).

**Play:** open `dist/index.html` in Chrome / Edge / Firefox (works from the file system or any static
server, e.g. `npm run serve` then http://localhost:8080). Click *Enter the Backrooms*. Add `?level=2` to the URL to start in Level 1, the warehouse
(1 lobby, 2 warehouse, 3 pipes, 4 office, 5 hotel); otherwise you descend every three waves.

See `CREDITS.md` for asset attributions.

## Controls
WASD move · Shift sprint (hold breath while scoped) · C / Ctrl crouch · Space jump / mantle ·
Left mouse fire · Right mouse sniper scope · R reload · 1-3 / Q / wheel switch weapon · V inspect ·
G grenade · F kick · T weapon light · B shop (between waves) · Esc pause

There is no aiming down sights: every gun fires from the hip (the crosshair follows the gun's
sway); only sniper rifles raise a scope. The Laser Module tightens hip fire and shows where rounds go.

## How the enemies move
Gunmen are driven by motion capture (100STYLE "Swat": idle, walks and runs in four directions),
retargeted onto their Rocketbox skeletons by `tools/retarget.mjs`, with a shouldered aim and
reloads from Torque 3D's soldier on the arms, a two-hand IK stance for pistols, a torso that turns
until the barrel the hands hold is on target, and recoil. While undisturbed their ragdoll
is dormant and posed from the animation, so bullets hit what you see. A hit, blast or kick hands the
body to the active-ragdoll controller (stagger, stumble, fall, get up); once they are back on their
feet and left alone they blend back into animation. Settings → Enemy movement switches to full physics.

## Building
`npm run build` concatenates `engine/ragdoll-engine.js` and `src/*.js` into `dist/index.html` and
wraps `assets/**/*.glb` as script files. Asset tools: `tools/rb2glb.mjs` (Rocketbox FBX → GLB),
`tools/prep-viewmodel.mjs` (first-person rigs), `tools/retarget.mjs` (BVH mocap → Rocketbox clips).
