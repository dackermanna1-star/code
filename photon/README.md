# Photon

A small layer-based image editor in Python, in the spirit of Photoshop.

![Anime-style portrait painted with Photon](examples/anime_girl.png)

## Run it

```
pip install pillow numpy
python photon.py                          # open the editor
python photon.py examples/anime_girl.py   # open it and watch the example paint itself
python examples/anime_girl.py out.png     # render the example without the GUI
```

Tkinter ships with Python on Windows and macOS. On Debian/Ubuntu install it with `sudo apt install python3-tk`.

## Features

- **Tools:** soft round brush (size, hardness, opacity), eraser, lasso fill, linear and radial gradients, eyedropper.
- **Layers:** add, delete, reorder, show/hide, per-layer opacity, clipping masks, and blend modes (normal, multiply, screen, overlay, soft light, add).
- **Filters:** Gaussian blur, bloom, hue/saturation.
- **Scripts:** *Script > Run Script...* runs a Python file with a `paint(doc, step)` function and redraws after every step, so you can watch a painting build up layer by layer. `examples/anime_girl.py` is a 33-layer example.
- **Files:** open images as layers; export PNG or JPEG.

Shortcuts: B brush, E eraser, L lasso, G gradient, I eyedropper, X swap colors, `[` `]` brush size, Ctrl+Z undo.

`engine.py` holds the image engine (layers, compositing, brushes, masks, filters) and has no GUI dependency.
