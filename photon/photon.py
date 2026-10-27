"""Photon: a small layer-based image editor (Tkinter + Pillow + numpy).

Tools: soft brush, eraser, lasso fill, linear/radial gradient, eyedropper.
Layers: visibility, opacity, blend modes, clipping masks, reorder.
Filters: Gaussian blur, bloom, hue/saturation. Script > Run Script replays a
paint script (see examples/) step by step so you can watch it build up.
"""

import importlib.util
import os
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, simpledialog, ttk

import numpy as np
from PIL import Image, ImageTk

import engine
from engine import BLEND_MODES, Document, linear_gradient, polygon_mask, radial_gradient, stroke_mask

DOC_W, DOC_H = 1000, 1250
VIEW_SCALE = 0.5
UI_BG = "#2b2d33"
PANEL_BG = "#33363d"
FG = "#e4e6eb"
ACCENT = "#4c8dff"

TOOLS = [("brush", "Brush", "B"), ("eraser", "Eraser", "E"), ("lasso", "Lasso Fill", "L"),
         ("gradient", "Gradient", "G"), ("picker", "Eyedropper", "I")]


class Photon:
    def __init__(self, root):
        self.root = root
        root.title("Photon")
        root.configure(bg=UI_BG)
        self.doc = Document(DOC_W, DOC_H)
        self.active = 0
        self.tool = tk.StringVar(value="brush")
        self.size = tk.DoubleVar(value=24)
        self.hardness = tk.DoubleVar(value=0.6)
        self.opacity = tk.DoubleVar(value=1.0)
        self.grad_kind = tk.StringVar(value="linear")
        self.color = "#e05a7a"
        self.color2 = "#ffffff"
        self.points = []
        self.undo_stack = []
        self.status = tk.StringVar(value="Ready")

        self._style()
        self._menu()
        self._options_bar()
        self._toolbox()
        self._canvas()
        self._layers_panel()
        tk.Label(root, textvariable=self.status, bg=UI_BG, fg="#9aa0aa", anchor="w").grid(
            row=3, column=0, columnspan=3, sticky="ew", padx=8)
        self._keys()
        self.refresh_layers()
        self.render()

    # ---- UI construction ----------------------------------------------------

    def _style(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure(".", background=PANEL_BG, foreground=FG, fieldbackground="#24262b")
        s.configure("TCombobox", arrowcolor=FG)
        s.map("TCombobox", fieldbackground=[("readonly", "#24262b")], foreground=[("readonly", FG)],
              selectbackground=[("readonly", "#24262b")], selectforeground=[("readonly", FG)])
        s.configure("Horizontal.TScale", background=PANEL_BG)

    def _menu(self):
        bar = tk.Menu(self.root)
        m = tk.Menu(bar, tearoff=False)
        m.add_command(label="New", accelerator="Ctrl+N", command=self.new)
        m.add_command(label="Open Image...", accelerator="Ctrl+O", command=self.open_image)
        m.add_command(label="Export PNG...", accelerator="Ctrl+S", command=self.export)
        m.add_separator()
        m.add_command(label="Exit", command=self.root.destroy)
        bar.add_cascade(label="File", menu=m)
        m = tk.Menu(bar, tearoff=False)
        m.add_command(label="Undo", accelerator="Ctrl+Z", command=self.undo)
        m.add_command(label="Clear Layer", command=self.clear_layer)
        bar.add_cascade(label="Edit", menu=m)
        m = tk.Menu(bar, tearoff=False)
        m.add_command(label="New Layer", accelerator="Ctrl+Shift+N", command=self.add_layer)
        m.add_command(label="Delete Layer", command=self.delete_layer)
        m.add_command(label="Toggle Clipping Mask", accelerator="Ctrl+Alt+G", command=self.toggle_clip)
        m.add_command(label="Rename...", command=self.rename_layer)
        bar.add_cascade(label="Layer", menu=m)
        m = tk.Menu(bar, tearoff=False)
        m.add_command(label="Gaussian Blur...", command=self.filter_blur)
        m.add_command(label="Bloom", command=self.filter_bloom)
        m.add_command(label="Hue / Saturation...", command=self.filter_hue)
        bar.add_cascade(label="Filter", menu=m)
        m = tk.Menu(bar, tearoff=False)
        m.add_command(label="Run Script...", command=self.run_script_dialog)
        bar.add_cascade(label="Script", menu=m)
        self.root.config(menu=bar)

    def _options_bar(self):
        bar = tk.Frame(self.root, bg=PANEL_BG, pady=4)
        bar.grid(row=0, column=0, columnspan=3, sticky="ew")

        def slider(label, var, lo, hi, fmt):
            tk.Label(bar, text=label, bg=PANEL_BG, fg=FG).pack(side="left", padx=(10, 2))
            ttk.Scale(bar, from_=lo, to=hi, variable=var, length=90).pack(side="left")
            out = tk.Label(bar, width=4, bg=PANEL_BG, fg=FG)
            out.pack(side="left")
            var.trace_add("write", lambda *_: out.config(text=fmt(var.get())))
            out.config(text=fmt(var.get()))

        slider("Size", self.size, 1, 200, lambda v: f"{v:.0f}")
        slider("Hardness", self.hardness, 0, 1, lambda v: f"{v * 100:.0f}%")
        slider("Opacity", self.opacity, 0.05, 1, lambda v: f"{v * 100:.0f}%")
        tk.Label(bar, text="Gradient", bg=PANEL_BG, fg=FG).pack(side="left", padx=(12, 2))
        ttk.Combobox(bar, textvariable=self.grad_kind, values=["linear", "radial"], width=7,
                     state="readonly").pack(side="left")

    def _toolbox(self):
        box = tk.Frame(self.root, bg=PANEL_BG, padx=6, pady=6)
        box.grid(row=1, column=0, sticky="ns", pady=6, padx=(6, 0))
        for name, label, key in TOOLS:
            tk.Radiobutton(box, text=f"{label}  {key}", variable=self.tool, value=name, indicatoron=False,
                           width=13, anchor="w", padx=6, pady=5, bg="#3c4048", fg=FG,
                           selectcolor=ACCENT, activebackground="#474c55", activeforeground=FG,
                           relief="flat", bd=0).pack(fill="x", pady=2)
        tk.Label(box, text="Colors", bg=PANEL_BG, fg=FG).pack(pady=(14, 4))
        sw = tk.Frame(box, bg=PANEL_BG)
        sw.pack()
        self.sw1 = tk.Label(sw, width=5, height=2, bg=self.color, relief="solid", bd=1)
        self.sw1.grid(row=0, column=0, padx=2)
        self.sw2 = tk.Label(sw, width=5, height=2, bg=self.color2, relief="solid", bd=1)
        self.sw2.grid(row=0, column=1, padx=2)
        self.sw1.bind("<Button-1>", lambda _e: self.pick_color(1))
        self.sw2.bind("<Button-1>", lambda _e: self.pick_color(2))
        tk.Label(box, text="X swaps", bg=PANEL_BG, fg="#9aa0aa").pack()

    def _canvas(self):
        vw, vh = int(DOC_W * VIEW_SCALE), int(DOC_H * VIEW_SCALE)
        self.canvas = tk.Canvas(self.root, width=vw, height=vh, bg="#1e1f23", highlightthickness=0,
                                cursor="crosshair")
        self.canvas.grid(row=1, column=1, padx=6, pady=6)
        self.view = self.canvas.create_image(0, 0, anchor="nw")
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)

    def _layers_panel(self):
        panel = tk.Frame(self.root, bg=PANEL_BG, padx=6, pady=6)
        panel.grid(row=1, column=2, sticky="ns", pady=6, padx=(0, 6))
        tk.Label(panel, text="LAYERS", bg=PANEL_BG, fg=FG, font=("TkDefaultFont", 10, "bold")).pack(anchor="w")
        row = tk.Frame(panel, bg=PANEL_BG)
        row.pack(fill="x", pady=4)
        self.mode_var = tk.StringVar()
        mode = ttk.Combobox(row, textvariable=self.mode_var, values=BLEND_MODES, width=10, state="readonly")
        mode.pack(side="left")
        mode.bind("<<ComboboxSelected>>", lambda _e: self.set_layer_prop(mode=self.mode_var.get()))
        self.layer_opacity = tk.DoubleVar(value=1)
        ttk.Scale(row, from_=0, to=1, variable=self.layer_opacity, length=110,
                  command=lambda _v: self.set_layer_prop(opacity=self.layer_opacity.get())).pack(side="left", padx=4)

        self.layer_list = tk.Listbox(panel, width=30, height=26, bg="#24262b", fg=FG, bd=0,
                                     selectbackground=ACCENT, activestyle="none", highlightthickness=0,
                                     font=("TkFixedFont", 9))
        self.layer_list.pack(fill="both", expand=True)
        self.layer_list.bind("<<ListboxSelect>>", self.on_layer_select)
        self.layer_list.bind("<Double-Button-1>", lambda _e: self.toggle_visible())

        btns = tk.Frame(panel, bg=PANEL_BG)
        btns.pack(fill="x", pady=(6, 0))
        for text, cmd in (("+", self.add_layer), ("-", self.delete_layer), ("Up", lambda: self.move_layer(1)),
                          ("Down", lambda: self.move_layer(-1)), ("Eye", self.toggle_visible),
                          ("Clip", self.toggle_clip)):
            tk.Button(btns, text=text, command=cmd, bg="#3c4048", fg=FG, relief="flat", padx=6,
                      activebackground="#474c55", activeforeground=FG).pack(side="left", padx=1)

    def _keys(self):
        for name, _label, key in TOOLS:
            self.root.bind(key.lower(), lambda _e, n=name: self.tool.set(n))
        self.root.bind("x", lambda _e: self.swap_colors())
        self.root.bind("[", lambda _e: self.size.set(max(1, self.size.get() * 0.8)))
        self.root.bind("]", lambda _e: self.size.set(min(200, self.size.get() * 1.25)))
        self.root.bind("<Control-z>", lambda _e: self.undo())
        self.root.bind("<Control-n>", lambda _e: self.new())
        self.root.bind("<Control-o>", lambda _e: self.open_image())
        self.root.bind("<Control-s>", lambda _e: self.export())
        self.root.bind("<Control-N>", lambda _e: self.add_layer())
        self.root.bind("<Control-Alt-g>", lambda _e: self.toggle_clip())

    # ---- rendering ----------------------------------------------------------

    def render(self):
        img = self.doc.to_image().resize((int(DOC_W * VIEW_SCALE), int(DOC_H * VIEW_SCALE)), Image.LANCZOS)
        self.photo = ImageTk.PhotoImage(img)
        self.canvas.itemconfig(self.view, image=self.photo)
        self.canvas.delete("overlay")

    def refresh_layers(self):
        self.layer_list.delete(0, "end")
        n = len(self.doc.layers)
        for i in range(n - 1, -1, -1):
            layer = self.doc.layers[i]
            eye = "o" if layer.visible else "-"
            clip = " ↳" if layer.clip else ""
            mode = "" if layer.mode == "normal" else f" [{layer.mode}]"
            self.layer_list.insert("end", f"{eye}{clip} {layer.name}{mode}")
        self.active = min(self.active, n - 1)
        self.layer_list.selection_clear(0, "end")
        self.layer_list.selection_set(n - 1 - self.active)
        self.layer_list.see(n - 1 - self.active)
        layer = self.doc.layers[self.active]
        self.mode_var.set(layer.mode)
        self.layer_opacity.set(layer.opacity)

    # ---- layers -------------------------------------------------------------

    @property
    def layer(self):
        return self.doc.layers[self.active]

    def on_layer_select(self, _e):
        sel = self.layer_list.curselection()
        if sel:
            self.active = len(self.doc.layers) - 1 - sel[0]
            self.mode_var.set(self.layer.mode)
            self.layer_opacity.set(self.layer.opacity)

    def set_layer_prop(self, **props):
        for k, v in props.items():
            setattr(self.layer, k, v)
        self.refresh_layers()
        self.render()

    def add_layer(self):
        self.doc.add_layer(f"Layer {len(self.doc.layers)}", index=self.active + 1)
        self.active += 1
        self.refresh_layers()

    def delete_layer(self):
        if len(self.doc.layers) > 1:
            del self.doc.layers[self.active]
            self.active = max(self.active - 1, 0)
            self.refresh_layers()
            self.render()

    def move_layer(self, d):
        j = self.active + d
        if 0 <= j < len(self.doc.layers):
            ls = self.doc.layers
            ls[self.active], ls[j] = ls[j], ls[self.active]
            self.active = j
            self.refresh_layers()
            self.render()

    def toggle_visible(self):
        self.set_layer_prop(visible=not self.layer.visible)

    def toggle_clip(self):
        self.set_layer_prop(clip=not self.layer.clip)

    def rename_layer(self):
        name = simpledialog.askstring("Rename layer", "Name:", initialvalue=self.layer.name)
        if name:
            self.set_layer_prop(name=name)

    def clear_layer(self):
        self.push_undo()
        self.layer.px[:] = 0
        self.render()

    # ---- undo ---------------------------------------------------------------

    def push_undo(self):
        self.undo_stack.append((self.active, self.layer.px.copy()))
        del self.undo_stack[:-20]

    def undo(self):
        if self.undo_stack:
            i, px = self.undo_stack.pop()
            if i < len(self.doc.layers):
                self.doc.layers[i].px = px
                self.render()

    # ---- colours ------------------------------------------------------------

    def pick_color(self, which):
        c = colorchooser.askcolor(color=self.color if which == 1 else self.color2)[1]
        if c:
            self.set_color(c, which)

    def set_color(self, c, which=1):
        if which == 1:
            self.color = c
            self.sw1.config(bg=c)
        else:
            self.color2 = c
            self.sw2.config(bg=c)

    def swap_colors(self):
        a, b = self.color, self.color2
        self.set_color(b, 1)
        self.set_color(a, 2)

    # ---- mouse --------------------------------------------------------------

    def doc_xy(self, e):
        return e.x / VIEW_SCALE, e.y / VIEW_SCALE

    def on_press(self, e):
        self.points = [self.doc_xy(e)]
        if self.tool.get() == "picker":
            x, y = map(int, self.points[0])
            if 0 <= x < DOC_W and 0 <= y < DOC_H:
                rgb = (self.doc.composite()[y, x] * 255).astype(int)
                self.set_color("#%02x%02x%02x" % tuple(rgb))
            self.points = []

    def on_drag(self, e):
        if not self.points:
            return
        prev = self.points[-1]
        self.points.append(self.doc_xy(e))
        tool = self.tool.get()
        s = VIEW_SCALE
        if tool in ("brush", "eraser"):
            color = "#1e1f23" if tool == "eraser" else self.color
            w = max(self.size.get() * s, 1)
            self.canvas.create_line(prev[0] * s, prev[1] * s, e.x, e.y, fill=color, width=w,
                                    capstyle="round", tags="overlay")
        elif tool == "lasso":
            self.canvas.create_line(prev[0] * s, prev[1] * s, e.x, e.y, fill=ACCENT, width=1.5, tags="overlay")
        elif tool == "gradient":
            self.canvas.delete("overlay")
            x0, y0 = self.points[0]
            self.canvas.create_line(x0 * s, y0 * s, e.x, e.y, fill=ACCENT, width=2, arrow="last", tags="overlay")

    def on_release(self, _e):
        tool, pts = self.tool.get(), self.points
        self.points = []
        if not pts:
            return
        self.push_undo()
        layer = self.layer
        if tool == "brush":
            layer.paint(self.color, stroke_mask(DOC_W, DOC_H, pts, self.size.get(), self.hardness.get()),
                        self.opacity.get())
        elif tool == "eraser":
            layer.erase(stroke_mask(DOC_W, DOC_H, pts, self.size.get(), self.hardness.get()), self.opacity.get())
        elif tool == "lasso" and len(pts) > 2:
            layer.paint(self.color, polygon_mask(DOC_W, DOC_H, pts), self.opacity.get())
        elif tool == "gradient" and len(pts) > 1:
            stops = [(0, self.color), (1, self.color2)]
            if self.grad_kind.get() == "radial":
                field = radial_gradient(DOC_W, DOC_H, pts[0], engine.distance(pts[0], pts[-1]), stops)
            else:
                field = linear_gradient(DOC_W, DOC_H, pts[0], pts[-1], stops)
            layer.paint(field, np.ones((DOC_H, DOC_W), np.float32), self.opacity.get())
        self.render()

    # ---- filters ------------------------------------------------------------

    def filter_blur(self):
        r = simpledialog.askfloat("Gaussian Blur", "Radius (px):", initialvalue=8, minvalue=0.5, maxvalue=200)
        if r:
            self.push_undo()
            self.layer.blur(r)
            self.render()

    def filter_bloom(self):
        self.doc.bloom()
        self.active = len(self.doc.layers) - 1
        self.refresh_layers()
        self.render()

    def filter_hue(self):
        hue = simpledialog.askfloat("Hue / Saturation", "Hue shift (degrees):", initialvalue=0)
        if hue is None:
            return
        sat = simpledialog.askfloat("Hue / Saturation", "Saturation (1 = unchanged):", initialvalue=1.2)
        if sat is None:
            return
        self.push_undo()
        self.layer.adjust(hue, sat)
        self.render()

    # ---- files --------------------------------------------------------------

    def new(self):
        if messagebox.askyesno("Photon", "Start a new image? Unsaved work will be lost."):
            self.doc = Document(DOC_W, DOC_H)
            self.active = 0
            self.undo_stack.clear()
            self.refresh_layers()
            self.render()

    def open_image(self):
        p = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.webp")])
        if not p:
            return
        img = Image.open(p).convert("RGBA")
        img.thumbnail((DOC_W, DOC_H))
        layer = self.doc.add_layer(os.path.basename(p))
        canvas = Image.new("RGBA", (DOC_W, DOC_H))
        canvas.paste(img, ((DOC_W - img.width) // 2, (DOC_H - img.height) // 2))
        layer.px[:] = np.asarray(canvas, np.float32) / 255
        self.active = len(self.doc.layers) - 1
        self.refresh_layers()
        self.render()

    def export(self):
        p = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG", "*.png"), ("JPEG", "*.jpg")])
        if p:
            self.doc.to_image().save(p)
            self.status.set(f"Exported {p}")

    # ---- scripting ----------------------------------------------------------

    def run_script_dialog(self):
        here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")
        p = filedialog.askopenfilename(initialdir=here, filetypes=[("Python paint script", "*.py")])
        if p:
            self.run_script(p)

    def run_script(self, script_path, delay=0.0):
        """Run a script's paint(doc, step) on a fresh document, redrawing at every step."""
        spec = importlib.util.spec_from_file_location("paint_script", script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.doc = Document(DOC_W, DOC_H)
        self.active = 0
        self.undo_stack.clear()
        self.refresh_layers()

        def step(label):
            self.active = len(self.doc.layers) - 1
            self.status.set(f"Painting: {label}")
            self.refresh_layers()
            self.render()
            self.root.update()
            if delay:
                self.root.after(int(delay * 1000))

        self.root.config(cursor="watch")
        try:
            mod.paint(self.doc, step)
        finally:
            self.root.config(cursor="")
        self.status.set(f"Done - {len(self.doc.layers)} layers")


def main():
    import sys
    root = tk.Tk()
    root.resizable(False, False)
    app = Photon(root)
    if len(sys.argv) > 1:
        root.after(800, lambda: app.run_script(sys.argv[1], delay=float(os.environ.get("PHOTON_DELAY", "0"))))
    root.mainloop()


if __name__ == "__main__":
    main()
