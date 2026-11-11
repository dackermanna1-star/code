# Credits

THE BACKROOMS — ENDLESS DESCENT
A first-person survival shooter built on the Ragdoll Lab active-ragdoll engine.

## Engine
- Ragdoll Lab (active ragdolls, injury physiology, ballistics, procedural audio, gore) — the engine
  this game is built on (engine/ragdoll-engine.js).
- three.js — MIT licence, https://threejs.org (bundled inside the engine build).

## First-person weapon rigs (arms, weapons and animations)
All licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Textures were resized and
re-encoded, materials converted from specular/glossiness to metal/roughness, and the meshes
quantised for the web; the suppressor, red dot sight and drum magazine on some weapons are
procedural additions.

- "FPS pistol animations" by Cransh — https://sketchfab.com/3d-models/fps-pistol-animations (sketchfab.com/ccransh)
- "SMG FPS Animations" by Cransh — https://sketchfab.com/ccransh
- "FPS AK-74m animations" by Cransh — https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14
  (obtained via github.com/Ayush-Mohanty/FPS-Arms-3D, MIT)
- "Animated FPS hands (rifle animation pack)" by Cransh — https://sketchfab.com/ccransh
- "FPS Saiga animations" by Cransh — https://sketchfab.com/ccransh
- "FPS Arms remington (shotgun)" by Cransh — https://sketchfab.com/ccransh

## Sniper rifle model
- "M24 Bounty Hunter Sniper Rifle" by Naudaff3D — CC BY 4.0,
  https://sketchfab.com/3d-models/m24-bounty-hunter-sniper-rifle-d40e74e2259549f5b025807163f1028c
  (mounted on the "Animated FPS hands (rifle animation pack)" arms by Cransh)

## Enemy motion capture
- "The 100STYLE Dataset" by Ian Mason, Franck Multon and Taku Komura - CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/), https://www.ianxmason.com/100style/
  Style "Swat" (idle; walks and runs forward, backward and sideways) for gunmen; styles "Zombie",
  "Drunk" and "LimpLeft" (shambles) with "Rushed" (the sprint) for the Hollowed; style "Neutral"
  (idle, walks and runs) for pistol carriers moving with the gun down. Retargeted from BVH to the
  Microsoft Rocketbox skeleton and cut into in-place loops (tools/retarget.mjs).

- Get-ups from the floor (on the back and on the belly; also mirrored) from the CMU Graphics Lab
  Motion Capture Database, http://mocap.cs.cmu.edu - takes 139_16 ("Get Up From Ground"), 140_01
  ("Get Up Face Down"), 140_08 and 140_09 ("Get Up From Ground Laying on Back"), in the BVH
  conversion by Bruce Hahne (cgspeed.com). "The data used in this project was obtained from
  mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." CMU: "This data is
  free for use in research and commercial projects worldwide"; the BVH conversion adds no further
  restrictions. Trimmed, time-warped (played faster), grounded and retargeted to the Rocketbox
  skeleton with tools/retarget.mjs (--getup).

- Upper-body rifle aim, rifle reload and pistol reload from the Torque 3D "Soldier" player
  animations (Lurker / Ryder sets), Copyright (c) 2012-2016 GarageGames, LLC, MIT licence,
  https://github.com/GarageGames/Torque3D (3ds Max Biped, applied to the Rocketbox arms by bone name).
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
  associated documentation files (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge, publish, distribute,
  sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions: The above copyright notice and this
  permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Characters
- Microsoft Rocketbox Avatar Library — MIT licence, (c) Microsoft Corporation,
  https://github.com/microsoft/Microsoft-Rocketbox
  Avatars used: Male_Adult_04, Male_Adult_05, Male_Adult_17, Male_Adult_18, Delivery_Male_01,
  Security_Male_01, Police_Male_02, Police_Male_06, Military_Male_01, Military_Male_03,
  Military_Male_04. Converted from FBX to glTF (tools/rb2glb.mjs) and bound to the engine's
  ragdoll skeleton.

## Everything else
Level generation, Backrooms materials and lighting, enemy AI, waves, economy, shop, HUD, bodycam
post-processing, ambience and music are procedural and written for this game.

MIT License notice (Microsoft Rocketbox):
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: The above copyright notice and this
permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Sound: Kenney "Impact Sounds" (CC0)
Footsteps (carpet, concrete, wood) and body impacts in `assets/sfx/` are from Kenney's "Impact Sounds" pack
(www.kenney.nl), released under Creative Commons Zero (CC0 1.0), converted to mono MP3.

## MP5 viewmodel
"FPS Animations LowPoly MP5" by Cransh (https://sketchfab.com/ccransh),
https://sketchfab.com/3d-models/fps-animations-lowpoly-mp5-568f00dd76944baaa5eae1a1cc871423 — CC BY 4.0.
Converted to GLB (textures resized); arms tinted dark in game.
