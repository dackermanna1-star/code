# LAST LOOKOUT — module contracts

A tower-defence sniper game on the Ragdoll Lab engine. You sit in a fire-lookout cabin 22 m up
a steel tower in a dead farm valley and never move: look 360°, scope in, shoot. Zombies walk in
from the edges of the valley toward the fenced compound at the tower's foot and batter its
gate; climbers go up the tower legs. Waves, bosses, cash, a shop between waves.

**The core trick.** Zombies are *animated* (retargeted CC0 motion-capture clips) while unhurt:
their ragdoll bodies are posed kinematically from the clip every frame and are NOT in the
physics world ("dormant"). Bullets still hit their exact anatomy (the ballistics ray-cast the
posed segments). The moment one is hit (or blasted, or trips on wire) it becomes a full physical
ragdoll driven by the Euphoria-style controller and injury model; if it recovers it blends back
into the animation (limping, or crawling with broken legs). Corpses settle and are frozen out of
the physics. Only ~10 ragdolls are physical at any time.

Target: 60 fps on an Apple M1 laptop (Chrome / Safari) with ~80 zombies on screen.

## Ground rules for every module

- Units: metres, seconds, radians. Y up. Flat walkable ground at **y = 0** over the playfield
  (|x|, |z| <= 260). The tower stands at the origin. Three.js r186 (`three` package), plain ES
  modules, no new npm dependencies.
- Everything lives under `src/tower/` (plus `tools/` and `test/`). Do not edit the engine
  (`src/physics`, `src/human`, `src/game`) or the sandbox app (`src/main.js`, `src/modes`,
  `src/render` existing files) unless your brief says so; read and import them freely.
- No allocations in per-frame hot paths (reuse vectors / arrays). Prefer shared materials,
  merged / instanced geometry.
- Retro look (late-90s / PS2): low internal resolution with nearest upscale, ordered dithering,
  quantised colour, fog, flat-ish lighting, small nearest-filtered pixel textures generated on
  canvases. Modern physics and simulation underneath.
- Procedural assets only (canvas textures, code geometry, Web Audio synthesis) except the CC0
  animation clips (Quaternius, Universal Animation Library 1 & 2, CC0 1.0).
- Every module that runs in Node tests must not touch `window` / `document` at import time.

## Ownership

| Area | Owner | Files |
| --- | --- | --- |
| Retro renderer, textures, level layout + scene, tower, sky & time of day, world ambience (crows, fireflies, rain), defence meshes | World agent | `src/tower/render/{retro,textures,levelScene,sky,props,ambience}.js`, `src/tower/level/layout.js` |
| Animation clips (retarget), AnimPlayer, procedural clips, zombie looks per type | Characters agent | `tools/anim/*`, `src/tower/anim/*`, `src/tower/render/zombieLook.js` |
| HUD, scope overlay, shop, menus, settings, audio, combat FX | Interface agent | `src/tower/ui/*`, `src/tower/audio/*`, `src/tower/fx/*` |
| Game loop, zombies (dormant/active), waves, economy, ballistics, camera, defences logic, explosions, kill cam, performance, integration | Core (lead) | `src/tower/main.js`, `src/tower/game/*`, `src/tower/catalog.js` |

## 1. Level layout — `src/tower/level/layout.js` (data + pure helpers, no THREE)

```js
export const LAYOUT = {
  bounds: { minX, maxX, minZ, maxZ },        // walkable playfield (<= ±260)
  tower: {
    pos: [0, 0, 0],
    eye: [x, y, z],                           // the sniper's eye (cabin, ~22.6 m up)
    cabin: { floorY, half: [hx, hz] },        // cabin footprint (player can't leave it)
    legs: [[x, z], ...],                      // 4 leg feet (climbers go up these)
    legTop: [[x, y, z], ...],                 // where each leg meets the cabin
  },
  compound: {                                 // fenced yard round the tower foot
    rect: { minX, maxX, minZ, maxZ },
    gates: [{ id, a: [x, z], b: [x, z], normal: [nx, nz] }],   // gate segments (attack spots)
    fenceHeight,
  },
  colliders: [{ c: [x, y, z], h: [hx, hy, hz], yaw, kind, material }],  // static boxes (<= 150)
  water: [{ minX, maxX, minZ, maxZ }],        // not walkable (river), bridges are colliders/free
  spawns: [{ id, pos: [x, z], dir: [dx, dz], label }],              // >= 6, 170–250 m out
  cover: { cornfield: [{ minX, maxX, minZ, maxZ }] },  // zombies inside are half hidden
  rangeMarkers: [{ pos: [x, z], dist }],
  trapZones: [{ minX, maxX, minZ, maxZ }],    // where the player may place traps
  floodlightMounts: [{ id, pos: [x, y, z] }], // fixed spots a bought floodlight goes
  sentryMount: { pos: [x, y, z], arc: [yawMin, yawMax] },
  barrelSpots: [[x, z], ...],                 // explosive barrels can be placed here
};
export function isWalkable(x, z) {}           // inside bounds, not in a collider (grown 0.35 m),
                                              // not in water (bridges walkable)
```

## 2. Retro renderer & world scene — World agent

```js
// src/tower/render/retro.js
export class RetroRenderer {
  constructor(canvasParent, opts)             // creates its WebGLRenderer (antialias off)
  renderer                                    // the THREE.WebGLRenderer
  setQuality(level)                           // 'low' | 'medium' | 'high' internal heights 270/360/480
  setSize(w, h)
  render(scene, camera)                       // low-res target -> dither/quantise -> nearest upscale
  renderOverlay(scene, camera)                // extra pass on top, same low-res target (optional)
}
// src/tower/render/levelScene.js
export function buildLevelScene(LAYOUT, opts) -> {
  scene, update(dt, camera), setTimeOfDay(t /* 0 dusk .. 1 night */), sunDir,
  setRain(amount), addFloodlight(mountId) -> light, removeFloodlight(mountId),
  placeTrapMesh(kind /* 'wire'|'mine'|'barrel'|'sentry' */, pos, yaw) -> Object3D, removeTrapMesh(obj),
  gateMesh(gateId) -> { setDamage(0..1), break() },
  scare(pos)                                   // crows lift off near pos (a gunshot)
}
```

## 3. Animation — Characters agent

Clips are retargeted offline onto the ragdoll's own 16-segment skeleton and baked into
`src/tower/anim/clips.js` (compact, <= 400 KB). Names: `walk` (Zombie_Walk_Fwd_Loop), `idle`
(Zombie_Idle_Loop), `attack` (Zombie_Scratch), `push` (Push_Loop), `jog` (Jog_Fwd_Loop),
`sprint` (Sprint_Loop), `walk2` (Walk_Loop), `vault` (ClimbUp_1m_RM), `getup` (LayToIdle, from
lying on the back) and the procedural `crawl` (prone, arms pull), `climb` (vertical ladder/leg
climb loop, root moves up) and `limpL` / `limpR` (walk with a stiff leg).

```js
// src/tower/anim/animPlayer.js
export const CLIP_INFO = { walk: { speed /* m/s at rate 1 */, duration, loop, rootMotion }, ... };
export class AnimPlayer {
  constructor(ragdoll, opts = { seed })       // per-zombie variation (lean, arm reach, phase)
  play(name, { fade = 0.25, rate = 1, phase })  // cross-fade to a clip
  setRate(r)
  update(dt, root /* { pos: Vec3 (ground point under the pelvis), yaw } */)
      // poses every segment body: body.framePos/frameRot <- previous pose, body.pos/rot <- new,
      // body.vel/angVel <- finite difference (for the hand-off to physics). Feet kept on y = 0.
  blendFromPhysics(duration)                  // capture the current body poses; blend into the clip
  rootFromBodies(out /* {pos, yaw} */)        // root of the current physical pose (for hand-back)
  get clip(); get time(); events              // e.g. { type: 'footstep', foot } / 'hit' (attack contact)
}
```

## 4. Zombie looks — Characters agent

```js
// src/tower/render/zombieLook.js
export async function prepareZombieMeshes()  // builds the low-poly body (shared), in a worker
export function createZombieVisual(person, kind, scene) -> {
  object, update(alpha), setWounds(list), setPhysiology(pallor, cyanosis),
  addFracture(seg, fragment, pointBind, axisBind), setHidden(on), dispose()
}
// kinds: walker, runner, crawler, climber, bloater, screamer, armored, brute, juggernaut
```

## 5. Interface, audio, FX — Interface agent

```js
// src/tower/ui/hud.js
export class TowerHud {
  constructor(parent, handlers /* { onResume, onQuit, onSetting(k, v), onShopBuy(id), onShopClose(),
    onPlace(kind), onStart(), onRestart() } */)
  update(dt, S)    // S: HUD state, below
  event(e)         // { type: 'hit', head, kill } | { type: 'bonus', text, cash } | { type: 'wave', n, boss }
                   // | { type: 'gateHit' } | { type: 'playerHurt' } | { type: 'killfeed', text }
  showShop(shopState) / hideShop()
  showTitle(meta) / showPause() / showGameOver(stats) / hideScreens()
}
// S = { cash, wave, phase: 'intro'|'fight'|'cleared'|'shop'|'over', alive, toKill,
//       gate: { hp, max }, player: { hp, max }, rifle: { name, mag, ammo, reloading, bolting },
//       ammoType: { id, name, count }, scope: 0..1 (how far in), zoom, rangeM (rangefinder, null),
//       wind: { speed, dirScreen /* rad, 0 = right */ }, breath: 0..1, holding, sway: 0..1,
//       focus: 0..1, focusActive, boss: null | { name, hp, max }, placing: null | kind,
//       timeOfDay: 0..1, fps }
// src/tower/audio/towerAudio.js
export class TowerAudio {   // wraps / extends the sandbox's AudioEngine (src/game/audio.js)
  unlock(); setVolume(v); setListener(pos, forward)
  rifle(id, { suppressed }); bolt(id); magOut(id); magIn(id); dryFire()
  bulletImpact(material, pos, dist); headshotCrack(pos); distantThump(pos)
  zombieGroan(kind, pos); zombieScream(pos); bossRoar(kind, pos); gateHit(intensity); gateBreak()
  explosion(pos, power); fire(pos, on); bodyFall(pos, i); boneCrack(pos, i)
  ambience(timeOfDay, wind, rain); horde(count, nearest); waveSiren(); waveCleared(); cash(); ui(kind)
  heartbeat(rate); breathHold(on); slowMo(on); music(state /* 'calm'|'fight'|'boss'|'off' */)
}
// src/tower/fx/towerFx.js
export class TowerFx {
  constructor(scene)
  update(dt, camera)
  explosion(pos, power); fire(pos, radius, dur); gasCloud(pos, radius, dur)
  muzzle(pos, dir); tracer(from, to); impact(pos, normal, material); bloodMist(pos, dir, amount)
  dust(pos); shellCasing(pos, dir)
}
```

## 6. Catalog — `src/tower/catalog.js` (Core)

Rifles, ammo, upgrades, defences, enemy kinds and wave rules as plain data; the shop UI reads it.
See the file for the shape.

## 7. Core (lead) — `src/tower/main.js`, `src/tower/game/*`

Owns the loop, the physics sandbox, zombies, waves, economy and persistence (localStorage key
`lastLookout.v1`), ballistics (drop, flight time, wind), the scope camera (sway, hold breath,
zoom), defence logic, explosions, the kill cam, the performance budget and all integration.
