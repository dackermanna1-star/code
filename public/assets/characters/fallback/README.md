# Character fallback (Characters module)

`Soldier.glb` — three.js example model (Mixamo "Vanguard" soldier, Mixamo rig `mixamorig:*`, clips Idle/Walk/Run/TPose),
from https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Soldier.glb (distributed with the three.js
examples). Used by `src/characters/anim/CharacterLibrary.ts` only when `public/assets/characters/manifest.json`
(the real character set) is missing or fails to load. Missing locomotion clips (crouch, prone, strafe, …) are synthesized
procedurally by the animation layer.
