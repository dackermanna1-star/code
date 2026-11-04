# Cubeland

A tiny voxel sandbox in a single HTML file: procedural terrain with hills, beaches, water and trees, first-person walking and flying, and breaking or placing 8 block types. Built with Three.js (loaded from cdnjs); textures are procedural pixel art drawn at startup.

## Play

Open `index.html` in a desktop browser (needs an internet connection the first time to load Three.js), then click **Click to play**.

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk |
| `Space` | Jump / swim up / fly up |
| `Shift` | Sprint / fly down |
| `F` | Toggle flying |
| Mouse (or arrow keys) | Look |
| Left / right click | Break / place block |
| `1`–`8`, mouse wheel | Pick block |
| `Esc` | Pause |

If the browser refuses mouse lock, the game switches to drag-to-look automatically.

## How it works

- **World:** a 128 × 48 × 128 block grid stored in a `Uint8Array`, generated from seeded fractal value noise. Each load gets a new random seed.
- **Meshing:** the world is split into 16 × 16 chunk columns. Each chunk becomes one mesh containing only the faces exposed to air, with per-vertex ambient occlusion. Water gets its own transparent mesh.
- **Physics:** axis-by-axis AABB collision against the voxel grid, with gravity, jumping and swimming.
- **Targeting:** a DDA voxel raycast from the camera finds the block under the crosshair (reach of 6 blocks).
