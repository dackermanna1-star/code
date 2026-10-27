# Paint

A small MS Paint-style drawing program written in Python with Tkinter and Pillow.

![Synthwave sunset painted with this app](synthwave-sunset.png)

## Run it

```
pip install pillow
python paint.py
```

Tkinter ships with Python on Windows and macOS. On Debian/Ubuntu install it with `sudo apt install python3-tk`.

## Tools

| Tool | Key | What it does |
|------|-----|--------------|
| Pencil | P | 1-pixel freehand line |
| Brush | B | Round freehand brush at the chosen size |
| Spray | S | Airbrush-style speckles |
| Eraser | E | Paints white |
| Line | L | Straight line |
| Rectangle | R | Rectangle, filled or outline |
| Oval | O | Ellipse, filled or outline |
| Fill | F | Paint-bucket flood fill |

- `[` and `]` shrink and grow the brush size.
- Click a palette swatch, or **Custom...**, to pick a color.
- Ctrl+Z undoes, Ctrl+N clears, Ctrl+O opens an image, Ctrl+S saves as PNG, JPEG or BMP.
