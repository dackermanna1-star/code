# DEPTHFALL

A voxel action RPG that runs in the browser. Fight down through an endless, procedurally generated dungeon as the Warden, collect loot, and see how deep you can go.

The whole game is one file, `index.html`. Graphics use Three.js, loaded from a CDN. All models are built from voxels in code, and all sound is synthesized with the Web Audio API, so there are no image, model or audio assets.

## Playing

Open `index.html` in a recent desktop or mobile browser. You need to be online the first time it loads, because Three.js and the fonts come from a CDN. You can also serve the folder, for example with `python3 -m http.server`, and open `http://localhost:8000`.

Progress (character, gear, gold, best depth and settings) is saved to `localStorage` whenever you enter a new floor. You can then continue from the title screen.

## Controls

| Action | Classic (default) | WASD scheme |
| --- | --- | --- |
| Move | Click or hold LMB on the ground; arrow keys | WASD or arrow keys |
| Cleave (primary attack) | LMB on an enemy; Shift+LMB attacks in place | same |
| Arcane Bolt | RMB | RMB |
| Shockwave Slam | Q | Q |
| Shadow Dash | W or Space | Space |
| Whirling Blades (hold) | E | E |
| Cataclysm | R | R |
| Potion | 1 | 1 |
| Inventory / Character | I / C | I / C |
| Runes | S | K |
| Map | Tab | Tab |
| Show all loot labels | Alt | Alt |
| Zoom | Mouse wheel | Mouse wheel |
| Pause / close panels | Esc | Esc |

Choose the control scheme under **Settings**. On touch screens a virtual joystick and a cluster of skill buttons appear automatically.

In the inventory you can drag items, or right-click to equip. Shift + right-click sells an item at a vendor, and Ctrl + right-click salvages it.

## What's in it

- **Dungeon.** Rooms are joined by spanning-tree corridors with extra loops. Floors include ledges, bridges over chasms, hazards that appear as you go deeper, secret breakable walls, shrines, a treasure goblin and a fog-of-war minimap.
- **Biomes.** Five biomes, each with its own palette, props and ambient sound: Crypt, Flooded Catacombs, Fungal Caverns, Molten Forge and the Abyss. After floor 20 the cycle repeats at a higher tier.
- **Bosses.** Every fifth floor is a boss arena. Bosses have two or three phases, telegraphed attacks and summoned adds.
- **Enemies.** Fifteen-plus enemy types, each with its own behaviour, plus champion and rare elite packs with affixes such as Molten, Frozen, Arcane, Waller and Teleporter.
- **The Warden.** Six skills, each with three runes. Stats are Strength, Agility, Vitality and Intellect, and you get points to spend on every level-up. Fury is the resource for most skills.
- **Loot.** Rarities run Common, Magic, Rare, Legendary and Set, with randomized affixes and legendary powers. Gear has 9 slots and changes how the Warden looks. You can sell or salvage what you don't need.
- **Combat feel.** Hit-stop, screen shake, hit-flash, knockback, ragdolls and gibs.

## Code layout

`index.html` is assembled from sections that are marked with banner comments, in this order: CONFIG, UTILS, AUDIO, RENDER, FX, RAGDOLL, DUNGEON, WORLD, PATHFINDING, MODELS, ENTITIES, ENEMIES, BOSSES, SKILLS, LOOT, UI and GAME. Balance numbers (scaling, drop rates, skill values) live in the `CONFIG` object near the top of the script.
