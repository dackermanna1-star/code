# THE BACKROOMS — ENDLESS DESCENT

A first-person survival shooter set in the Backrooms, built on the **Ragdoll Lab** active-ragdoll
engine (balance, stepping, stagger, falls, get-up, wound physiology, ballistic penetration, gore).

**Play:** open `dist/index.html` in Chrome / Edge / Firefox (works from the file system or any static
server, e.g. `npm run serve` then http://localhost:8080). Click *Enter the Backrooms*. Add `?level=2` to the URL to start in Level 1, the warehouse
(1 lobby, 2 warehouse, 3 pipes, 4 office); otherwise you descend every three waves.

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

## Dismemberment
`src/58-dismember.js`. Buckshot up close (the pellets of one shot summed per body segment, by
deposited energy, pellet count and range), a very heavy round point blank, or a grenade at
someone's feet can take off a head, an arm (at the shoulder, elbow or wrist) or a leg (hip, knee or
ankle); a single heavy round to the head may blow the top of the skull open instead. The ragdoll
joint is removed, so the part tumbles away as a real body with the hit's impulse and stays with the
corpse; the controller balances only what is still attached. The skinned mesh is split along the
bone weights into the body and a separate piece (both share the character's vertex buffers, each with
its own index), and both openings are closed by skinned cut faces (meat, fat, bone and marrow; a
neck shows vertebra and windpipe). Gore: blood burst and mist, pulsing arterial spurts, pools,
pooled gib chunks, wall splatter and a wet tear. Gunmen who lose a limb are out of the fight (most
writhe and bleed out); the hollowed keep coming one-armed, or claw themselves along the floor without
a leg. Settings → gore off disables it.

## Building
`npm run build` concatenates `engine/ragdoll-engine.js` and `src/*.js` into `dist/index.html` and
wraps `assets/**/*.glb` as script files. Asset tools: `tools/rb2glb.mjs` (Rocketbox FBX → GLB),
`tools/prep-viewmodel.mjs` (first-person rigs), `tools/retarget.mjs` (BVH mocap → Rocketbox clips).
