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
