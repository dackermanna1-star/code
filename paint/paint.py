"""A small MS Paint-style drawing program built with Tkinter and Pillow.

Tools: pencil, brush, spray can, eraser, line, rectangle, oval, fill bucket.
The picture lives in a Pillow image so it can be flood-filled and saved;
the Tk canvas shows it and draws live previews while you drag.
"""

import random
import tkinter as tk
from tkinter import filedialog, messagebox

from PIL import Image, ImageColor, ImageDraw, ImageTk

CANVAS_W, CANVAS_H = 900, 560
BG = "#ffffff"
UNDO_LIMIT = 30

PALETTE = [
    "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c",
    "#00a2e8", "#3f48cc", "#a349a4", "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9",
    "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7", "#0b1d3a",
    "#1f3b73", "#5a2a82", "#d94f70", "#ffd6a5", "#2e8b57", "#14532d", "#4a2c17",
]

TOOLS = [
    ("pencil", "Pencil", "p"),
    ("brush", "Brush", "b"),
    ("spray", "Spray", "s"),
    ("eraser", "Eraser", "e"),
    ("line", "Line", "l"),
    ("rect", "Rectangle", "r"),
    ("oval", "Oval", "o"),
    ("fill", "Fill", "f"),
]


class Paint:
    def __init__(self, root):
        self.root = root
        root.title("Paint")
        root.configure(bg="#dfe6ee")

        self.tool = tk.StringVar(value="brush")
        self.size = tk.IntVar(value=8)
        self.filled = tk.BooleanVar(value=True)
        self.color = "#000000"
        self.undo_stack = []
        self.start = None
        self.last = None
        self.preview = None

        self.image = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
        self.draw = ImageDraw.Draw(self.image)

        self._build_menu()
        self._build_toolbar()
        self._build_canvas()
        self._build_palette()
        self._bind_keys()
        self.refresh()

    # ---- layout -----------------------------------------------------------

    def _build_menu(self):
        bar = tk.Menu(self.root)
        file_menu = tk.Menu(bar, tearoff=False)
        file_menu.add_command(label="New", accelerator="Ctrl+N", command=self.new)
        file_menu.add_command(label="Open...", accelerator="Ctrl+O", command=self.open)
        file_menu.add_command(label="Save As...", accelerator="Ctrl+S", command=self.save)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.destroy)
        bar.add_cascade(label="File", menu=file_menu)
        edit_menu = tk.Menu(bar, tearoff=False)
        edit_menu.add_command(label="Undo", accelerator="Ctrl+Z", command=self.undo)
        bar.add_cascade(label="Edit", menu=edit_menu)
        self.root.config(menu=bar)

    def _build_toolbar(self):
        bar = tk.Frame(self.root, bg="#dfe6ee", padx=6, pady=6)
        bar.grid(row=0, column=0, sticky="ns")
        for name, label, key in TOOLS:
            tk.Radiobutton(
                bar, text=f"{label} ({key.upper()})", variable=self.tool, value=name,
                indicatoron=False, width=12, pady=4, anchor="w", padx=6,
                selectcolor="#b9d4f5", bg="#f4f7fb", relief="raised",
            ).pack(fill="x", pady=2)

        tk.Label(bar, text="Size", bg="#dfe6ee").pack(pady=(12, 0))
        tk.Scale(bar, from_=1, to=60, orient="horizontal", variable=self.size,
                 length=110, bg="#dfe6ee", highlightthickness=0).pack()
        tk.Checkbutton(bar, text="Filled shapes", variable=self.filled,
                       bg="#dfe6ee", activebackground="#dfe6ee").pack(pady=6)

        tk.Label(bar, text="Color", bg="#dfe6ee").pack(pady=(12, 2))
        self.swatch = tk.Label(bar, width=10, height=2, bg=self.color, relief="sunken")
        self.swatch.pack()
        tk.Button(bar, text="Custom...", command=self.pick_custom_color).pack(pady=4)

    def _build_canvas(self):
        self.canvas = tk.Canvas(self.root, width=CANVAS_W, height=CANVAS_H, bg=BG,
                                highlightthickness=1, highlightbackground="#9aa7b5",
                                cursor="crosshair")
        self.canvas.grid(row=0, column=1, padx=(0, 8), pady=8)
        self.canvas_img = self.canvas.create_image(0, 0, anchor="nw")
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)

    def _build_palette(self):
        pal = tk.Frame(self.root, bg="#dfe6ee", pady=4)
        pal.grid(row=1, column=0, columnspan=2, sticky="w", padx=8, pady=(0, 8))
        cols = len(PALETTE) // 2
        for i, c in enumerate(PALETTE):
            b = tk.Label(pal, bg=c, width=3, height=1, relief="raised", bd=2)
            b.grid(row=i // cols, column=i % cols, padx=1, pady=1)
            b.bind("<Button-1>", lambda _e, c=c: self.set_color(c))

    def _bind_keys(self):
        for name, _label, key in TOOLS:
            self.root.bind(key, lambda _e, n=name: self.tool.set(n))
        self.root.bind("<Control-z>", lambda _e: self.undo())
        self.root.bind("<Control-n>", lambda _e: self.new())
        self.root.bind("<Control-o>", lambda _e: self.open())
        self.root.bind("<Control-s>", lambda _e: self.save())
        self.root.bind("[", lambda _e: self.size.set(max(1, self.size.get() - 2)))
        self.root.bind("]", lambda _e: self.size.set(min(60, self.size.get() + 2)))

    # ---- state ------------------------------------------------------------

    def refresh(self):
        """Show the Pillow image on the canvas and drop live stroke items."""
        self.photo = ImageTk.PhotoImage(self.image)
        self.canvas.itemconfig(self.canvas_img, image=self.photo)
        self.canvas.delete("stroke")

    def push_undo(self):
        self.undo_stack.append(self.image.copy())
        del self.undo_stack[:-UNDO_LIMIT]

    def undo(self):
        if self.undo_stack:
            self.image = self.undo_stack.pop()
            self.draw = ImageDraw.Draw(self.image)
            self.refresh()

    def set_color(self, c):
        self.color = c
        self.swatch.config(bg=c)

    def pick_custom_color(self):
        from tkinter import colorchooser
        c = colorchooser.askcolor(color=self.color)[1]
        if c:
            self.set_color(c)

    def new(self):
        self.push_undo()
        self.image = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.refresh()

    def open(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.gif")])
        if not path:
            return
        self.push_undo()
        img = Image.open(path).convert("RGB")
        img.thumbnail((CANVAS_W, CANVAS_H))
        self.image = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
        self.image.paste(img, (0, 0))
        self.draw = ImageDraw.Draw(self.image)
        self.refresh()

    def save(self):
        path = filedialog.asksaveasfilename(defaultextension=".png",
                                            filetypes=[("PNG", "*.png"), ("JPEG", "*.jpg"), ("Bitmap", "*.bmp")])
        if path:
            self.image.save(path)
            messagebox.showinfo("Paint", f"Saved to {path}")

    # ---- drawing ----------------------------------------------------------

    def stroke_color(self):
        return BG if self.tool.get() == "eraser" else self.color

    def stroke_width(self):
        return 1 if self.tool.get() == "pencil" else self.size.get()

    def segment(self, x0, y0, x1, y1):
        """Draw a round-capped segment on both the canvas and the image."""
        c, w = self.stroke_color(), self.stroke_width()
        self.canvas.create_line(x0, y0, x1, y1, fill=c, width=w,
                                capstyle="round", joinstyle="round", tags="stroke")
        self.draw.line([x0, y0, x1, y1], fill=c, width=w)
        if w > 2:
            r = w / 2
            for x, y in ((x0, y0), (x1, y1)):
                self.draw.ellipse([x - r, y - r, x + r, y + r], fill=c)

    def spray(self, x, y):
        r = max(4, self.size.get())
        for _ in range(r):
            dx, dy = random.uniform(-r, r), random.uniform(-r, r)
            if dx * dx + dy * dy <= r * r:
                px, py = x + dx, y + dy
                self.canvas.create_rectangle(px, py, px + 1, py + 1, outline=self.color,
                                             fill=self.color, tags="stroke")
                self.draw.point((px, py), fill=self.color)

    def shape_box(self, x0, y0, x1, y1):
        return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)

    def on_press(self, e):
        tool = self.tool.get()
        self.push_undo()
        self.start = self.last = (e.x, e.y)
        if tool == "fill":
            if 0 <= e.x < CANVAS_W and 0 <= e.y < CANVAS_H:
                ImageDraw.floodfill(self.image, (e.x, e.y), ImageColor.getrgb(self.color), thresh=30)
                self.refresh()
        elif tool == "spray":
            self.spray(e.x, e.y)
        elif tool in ("pencil", "brush", "eraser"):
            self.segment(e.x, e.y, e.x, e.y)

    def on_drag(self, e):
        tool = self.tool.get()
        if self.start is None or tool == "fill":
            return
        if tool in ("pencil", "brush", "eraser"):
            self.segment(*self.last, e.x, e.y)
            self.last = (e.x, e.y)
        elif tool == "spray":
            self.spray(e.x, e.y)
        else:
            if self.preview:
                self.canvas.delete(self.preview)
            x0, y0 = self.start
            w, c = self.size.get(), self.color
            fill = c if self.filled.get() else ""
            if tool == "line":
                self.preview = self.canvas.create_line(x0, y0, e.x, e.y, fill=c, width=w, capstyle="round")
            elif tool == "rect":
                self.preview = self.canvas.create_rectangle(*self.shape_box(x0, y0, e.x, e.y), outline=c, fill=fill, width=w)
            elif tool == "oval":
                self.preview = self.canvas.create_oval(*self.shape_box(x0, y0, e.x, e.y), outline=c, fill=fill, width=w)

    def on_release(self, e):
        tool = self.tool.get()
        if self.start is None:
            return
        x0, y0 = self.start
        w, c = self.size.get(), self.color
        fill = c if self.filled.get() else None
        if tool == "line":
            self.segment(x0, y0, e.x, e.y)
        elif tool == "rect":
            self.draw.rectangle(self.shape_box(x0, y0, e.x, e.y), outline=c, fill=fill, width=w)
        elif tool == "oval":
            self.draw.ellipse(self.shape_box(x0, y0, e.x, e.y), outline=c, fill=fill, width=w)
        if self.preview:
            self.canvas.delete(self.preview)
            self.preview = None
        self.start = self.last = None
        # Bake the stroke into the displayed image so the canvas stays light.
        self.refresh()


def main():
    root = tk.Tk()
    root.resizable(False, False)
    Paint(root)
    root.mainloop()


if __name__ == "__main__":
    main()
