# Little Room

A very small first-person Godot 4 game: walk around a cozy room with a bed,
bookshelf, desk and chair, desk lamp, rug, potted plant, painting, door, a
window with sunlight coming in, and a few crates you can push around.

Everything is built from Godot's CSG shapes and primitive meshes, so there
are no external assets.

## Running it on a Mac

1. Download **Godot 4.6 or newer** (the standard version, not .NET) from
   <https://godotengine.org/download/macos/> and drag it into Applications.
2. Open Godot. In the Project Manager click **Import**, pick
   `little-room/project.godot` from this repo, then **Import & Edit**.
3. Press the **Play** button (top right) or **⌘B** to run the game.

To get a standalone `.app`, use **Project → Export… → Add… → macOS**. Godot
will offer to download the export templates the first time.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse / trackpad | Look around |
| Space | Jump |
| Shift | Sprint |
| Esc | Free the mouse (click the window to grab it again) |

Walk into the crates to push them. Close the window or press ⌘Q to quit.

## Files

- `main.tscn`: the room, props, lights and player.
- `player.gd`: first-person movement, mouse look and crate pushing.
- `project.godot`: project settings and key bindings.
