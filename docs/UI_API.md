# UI ⇄ Game contract

The UI is plain DOM (HTML/CSS) layered over the WebGL canvas. Entry: `src/ui/UI.js` exporting `class UI`.
Styles in `src/ui/ui.css` (import it from UI.js: `import './ui.css'`). Fonts: `import '@fontsource/vt323'`
and `import '@fontsource/silkscreen'` (pixel fonts). Item icons: `getItemIcon / getItemIconURL` from
`src/items/icons.js` (16×16 – display with `image-rendering: pixelated`).

Visual style: Minecraft-like chunky pixel UI (bevelled slot boxes, dark translucent panels) mixed with the grim
DayZ / Project Zomboid survival HUD (moodle icons, subtle status bars). Readable, compact, never cluttered.
Must work at 1280×720 up to 2560×1440.

## The UI object (implemented by the ui owner)
```js
const ui = new UI(game, rootElement)   // builds DOM inside rootElement (#ui)
ui.update(dt)                // called every frame while playing: refresh HUD from game state (cheap!)
ui.handleKey(e) -> bool      // keydown while game is running; return true if consumed
     // UI owns these keys: Tab / I = inventory, C = crafting, H = health, M = map, K = skills/character,
     // Esc = close the open panel (return false if nothing was open so the game opens pause)
ui.isBlocking() -> bool      // true while any panel / menu / dialog needs the mouse cursor (game releases pointer lock)
ui.openInventory(lootSources?)   // lootSources: array of container descriptors (else uses game.getLootSources())
ui.openPanel(name)           // 'inventory'|'crafting'|'health'|'map'|'skills'
ui.closeAll()
ui.refresh()                 // inventory/containers changed – re-render open panels
ui.showMainMenu(); ui.hideMainMenu()
ui.showLoading(label, frac01); ui.hideLoading()
ui.showPause(); ui.hidePause()
ui.showDeath({name, profession, daysSurvived, kills, cause, skills})   // "This is how you died"
ui.showNote({title, text})   // readable notes / books
ui.showDialog({title, text, buttons:[{label, run}]})
ui.toast(text, type='info'|'good'|'warn'|'danger')
ui.locationBanner(name, subtitle?)      // DayZ-like location reveal when entering a POI
ui.subtitle(text, seconds)              // radio transmissions / thoughts
ui.hitMarker(kind)                      // 'hit'|'kill'|'headshot'
ui.damageIndicator(angleRad)            // red arc showing hit direction, 0 = in front, +PI/2 = right
ui.setCrosshair(spread01)               // dynamic crosshair gap
```

## Game object (provided by core – mock it in `dev/ui-mock.js` for testing)
```js
game.state            // 'menu'|'loading'|'playing'|'paused'|'dead'
game.settings         // {sensitivity, fov, renderDistance (4..16 chunks), quality: 'low'|'medium'|'high',
                      //  masterVolume, sfxVolume, musicVolume, invertY, showFps, headBob}
game.applySettings()  // call after changing game.settings (persists them)
game.PROFESSIONS      // [{id, name, desc, perks:[string], skills:{}}]  (src/player/professions.js)
game.SKILLS           // {id: {name, desc}}
game.newGame({name, seed, profession})   // start a new run (seed string may be '')
game.hasSave() -> Promise<bool>;  game.getSaveInfo() -> Promise<{name, day, profession, savedAt}|null>
game.continueGame();  game.saveGame();  game.quitToMenu();  game.resume()
game.audio.play('ui_click')   // also 'ui_hover', 'zipper', 'ui_open', 'ui_close', 'item_pickup', 'item_drop', 'equip'

game.player = {
  name, profession /*id*/, professionName,
  health, maxHealth,                 // 0..100
  hunger, thirst,                    // satiety / hydration 0..100 (100 = full, 0 = starving)
  stamina, maxStamina,               // 0..100
  energy,                            // rest 0..100 (0 = exhausted)
  bodyTemp,                          // °C, 37 normal (<35 hypothermia, >38.5 fever/overheating)
  wetness,                           // 0..100
  sickness,                          // 0..100 (food poisoning / dirty water)
  panic,                             // 0..100
  pain,                              // 0..100
  infection, infectionKnown,         // zombie infection 0..100; only show when infectionKnown
  weight, maxWeight,                 // kg carried / comfortable limit
  wounds: [{part, type, bleeding, bandaged, bandageDirty, disinfected, infected, splinted, heal /*0..1*/, severity}],
       // part: 'head'|'torso'|'armL'|'armR'|'legL'|'legR'
       // type: 'scratch'|'laceration'|'bite'|'deep'|'bullet'|'fracture'|'burn'
  moodles: [{id, label, level /*1..4*/, desc, bad /*bool*/}],   // PZ-style status icons; draw icons by id
       // ids: hungry thirsty bleeding injured pain infected sick cold hot wet tired exhausted heavy panic
       //      stressed drunk full hydrated(warm)… draw a generic icon for unknown ids
  skills: {aiming: {level, xp, next}, melee, strength, fitness, sneaking, firstAid, maintenance, scavenging},
  kills, daysSurvived,
  x, y, z, yaw, pitch,               // camera yaw (Three.js): forward = (-sin(yaw), 0, -cos(yaw)); yaw 0 looks north (-Z)
  flashlightOn, hasWatch, hasCompass, scopeActive /*draw scope overlay*/, aiming,
  inv,                               // PlayerInventory (src/inventory/Inventory.js)
  armor: {bite, scratch}, insulation // summary from clothing 0..1
}
// compass bearing in degrees = ((-yaw * 180/Math.PI) % 360 + 360) % 360   (0 = north/-Z, 90 = east/+X)

game.hud = {
  interaction: {key, text, sub?} | null,   // e.g. {key:'E', text:'Open Kitchen Cabinet'} — show above the hotbar
  progress: {label, t /*0..1*/} | null,     // timed actions (looting, crafting, bandaging, reloading)
  ammo: {loaded, reserve, mode, name, jammed} | null,   // when holding a firearm
  heldName: string | null,
  durability: 0..1 | null,
}
game.time = {day, hour, minute, totalHours, isNight, phase: 'dawn'|'day'|'dusk'|'night'}
game.weather = {type: 'clear'|'cloudy'|'overcast'|'fog'|'rain'|'storm', label, temperature /*°C air*/, wind}
game.location = {name, zone}          // current POI name ('Millbrook General Hospital') or zone label
game.fps

// Inventory & looting
game.getLootSources() -> [containerDescriptor]   // nearby world containers / floor / corpse / car (see Inventory.js)
game.getItemActions(desc, index) -> [{label, run(), disabled?}]   // context menu for a slot (right click)
game.onItemMoved(srcDesc, si, dstDesc, di)    // call after every successful moveStack/quickMove (sounds, equip logic, floor sync)
game.dropItem(desc, index, count?)            // drop to floor
game.useItem(desc, index)                     // double-click: eat/drink/equip/read/...
game.describeItem(stack) -> {name, lines:[string], rarity, condition /*0..1|null*/}   // tooltip text

// Crafting
game.getRecipes() -> [{recipe:{id,name,category,desc,time,result:{id,count}}, canCraft, missing:[{label, have, need}],
                       inputs:[{label, have, need, ok}], tools:[{label, ok}], station?: {label, ok}}]
game.craft(recipeId)                           // starts a timed craft (progress shown via game.hud.progress)

// Health panel
game.getTreatments(woundIndex) -> [{label, run(), disabled?}]

// Map
game.getMapCanvas() -> HTMLCanvasElement       // 1024×1024 top-down colour map of the world (1px = 1 block)
game.mapExplored -> Uint8Array(128*128)        // 1 = explored (cells of 8×8 blocks); unexplored = dark fog
game.mapRevealed -> bool                       // true once the player read a town map: show everything
game.getPOIs() -> [{name, type, x, z, discovered}]
game.world.SX / SZ                             // 1024
game.markers -> [{x, z, label, type}]          // e.g. airdrop smoke
```

The UI calls `game.audio.play(...)` for clicks / zippers. Every inventory mutation goes through
`moveStack` / `quickMove` / `splitStack` from `src/inventory/Inventory.js` followed by
`game.onItemMoved(...)`, or through the action callbacks.

Inventory screen layout (Tab): left = character paper-doll with the 9 equipment slots + weight bar + armour /
insulation summary; middle = hotbar row + one slot grid per carried container (pockets of each clothing item,
backpack) with headers showing name and fill; right = loot panel listing `game.getLootSources()` (containers in
reach, "Ground" floor container, corpse, vehicle trunk). Drag & drop (left drag = whole stack,
right-drag/ctrl = half, shift-click = quick move to the other side), right-click context menu
(`getItemActions`), hover tooltips (`describeItem`) with rarity colours, durability bars on slots, stack counts,
double click = `useItem`. Equipment slots show greyed silhouettes when empty.
