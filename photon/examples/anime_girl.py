"""Paints an original anime-style portrait with Photon's layers and brushes.

Run it inside Photon with Script > Run Script..., or headless:
    python examples/anime_girl.py out.png
"""

import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from engine import (Document, bezier, ellipse_mask, flip_x, linear_gradient,  # noqa: E402
                    path, polygon_mask, radial_gradient, stroke_mask)

W, H = 1000, 1250


def paint(doc, step=lambda label: None):
    def fill(layer, pts, color, feather=0, opacity=1.0, lock=False):
        layer.paint(color, polygon_mask(W, H, pts, feather), opacity, lock)

    def ell(layer, cx, cy, rx, ry, color, feather=0, opacity=1.0, lock=False):
        layer.paint(color, ellipse_mask(W, H, cx, cy, rx, ry, feather), opacity, lock)

    def line(layer, pts, size, color, hardness=0.85, taper=(0.3, 0.3), opacity=1.0, lock=False):
        layer.paint(color, stroke_mask(W, H, pts, size, hardness, taper), opacity, lock)

    def strand(rx, rw, tip, bend, root_y=330):
        """Pointed hair clump from a root span down to a tip."""
        l, r = (rx - rw / 2, root_y), (rx + rw / 2, root_y)
        mid = ((l[0] + tip[0]) / 2 + bend, (l[1] + tip[1]) / 2)
        mid2 = ((r[0] + tip[0]) / 2 + bend, (r[1] + tip[1]) / 2)
        return bezier(l, mid, tip, n=20) + bezier(tip, mid2, r, n=20)[1:]

    hair_grad = linear_gradient(W, H, (0, 170), (0, 1150),
                                [(0, "#1b1f3b"), (0.45, "#2b4466"), (1, "#5e9ab0")])
    rng = random.Random(11)

    # ---- background: dusk sky with city bokeh ---------------------------------
    sky = doc.layers[0]
    sky.name = "Sky"
    sky.px[..., :3] = linear_gradient(W, H, (0, 0), (0, H),
                                      [(0, "#131a3e"), (0.4, "#45387a"), (0.72, "#c3618a"), (1, "#f6a66c")])
    step("Sky gradient")

    stars = doc.add_layer("Stars", mode="screen")
    for _ in range(70):
        x, y = rng.uniform(0, W), rng.uniform(0, 420)
        r = rng.uniform(0.8, 2.2)
        ell(stars, x, y, r, r, "#ffffff", opacity=rng.uniform(0.4, 0.9))
    step("Stars")

    bokeh = doc.add_layer("Bokeh", mode="screen")
    for _ in range(34):
        x, y = rng.uniform(0, W), rng.uniform(560, 1250)
        r = rng.uniform(18, 60)
        c = rng.choice(["#ffb36b", "#ff7fa8", "#ffd98a", "#8fd4ff", "#ff9a5e"])
        ell(bokeh, x, y, r, r, c, feather=2, opacity=rng.uniform(0.25, 0.6))
        ell(bokeh, x, y, r * 0.8, r * 0.8, c, feather=6, opacity=0.25)
    bokeh.blur(3)
    step("Bokeh lights")

    # ---- back hair ------------------------------------------------------------
    hair_back = doc.add_layer("Hair (back)")
    back = path((500, 160), ((330, 150), (250, 300), (250, 520)),
                ((250, 760), (180, 980), (140, 1250)), ((400, 1250), (600, 1250), (860, 1250)),
                ((820, 980), (750, 760), (750, 520)), ((750, 300), (670, 150), (500, 160)))
    fill(hair_back, back, hair_grad)
    shade = doc.add_layer("Hair back shade", mode="multiply", clip=True)
    ell(shade, 500, 820, 230, 330, "#3c3f6e", feather=60, opacity=0.9)
    for x in (230, 290, 700, 760):
        line(shade, bezier((x, 500), (x - 30, 800), (x - 40, 1250)), 22, "#2c2f58", 0.3, (0.2, 0.1), 0.6)
    step("Back hair")

    # ---- skin -----------------------------------------------------------------
    skin = doc.add_layer("Skin")
    face = path((372, 380), ((360, 450), (358, 540), (366, 600)),
                ((378, 680), (452, 752), (500, 772)), ((548, 752), (622, 680), (634, 600)),
                ((642, 540), (640, 450), (628, 380)), ((600, 280), (400, 280), (372, 380)))
    neck = path((452, 690), ((448, 760), (446, 830), (430, 900)), ((470, 920), (530, 920), (570, 900)),
                ((554, 830), (552, 760), (548, 690)))
    fill(skin, neck, "#f7d7c8")
    fill(skin, [(420, 890), (580, 890), (500, 1020)], "#f7d7c8")
    fill(skin, face, "#fde8dc")
    step("Skin base")

    skin_shade = doc.add_layer("Skin shadow", mode="multiply", clip=True)
    jaw = [p for p in face if p[1] > 600]
    under_chin = [(410, 690), (590, 690)] + [(x, y + 55) for x, y in reversed(jaw)]
    fill(skin_shade, under_chin, "#e3a9a1", feather=6)
    skin_shade.erase(polygon_mask(W, H, face, 1.5))
    fill(skin_shade, [(430, 880), (570, 880), (560, 940), (440, 940)], "#e7b2a8", feather=10, opacity=0.7)
    for side in (1, -1):
        cx = 372 if side == 1 else 628
        ell(skin_shade, cx, 500, 40, 150, "#efbcb2", feather=30, opacity=0.6)
    step("Skin shading")

    blush = doc.add_layer("Blush", clip=True)
    for cx in (405, 595):
        ell(blush, cx, 655, 58, 26, "#ff8ea3", feather=20, opacity=0.55)
        for k in range(3):
            x = cx - 22 + k * 18
            line(blush, [(x + 6, 642), (x - 4, 664)], 4, "#ff6f8d", 0.8, (0.4, 0.4), 0.55)
    step("Blush")

    # ---- clothes --------------------------------------------------------------
    clothes = doc.add_layer("Blazer")
    blazer = path((440, 880), ((380, 900), (300, 915), (250, 960)), ((190, 1010), (150, 1120), (128, 1250)),
                  ((400, 1250), (600, 1250), (872, 1250)), ((850, 1120), (810, 1010), (750, 960)),
                  ((700, 915), (620, 900), (560, 880)), ((540, 960), (520, 1060), (500, 1250)),
                  ((480, 1060), (460, 960), (440, 880)))
    fill(clothes, blazer, linear_gradient(W, H, (0, 880), (0, 1250), [(0, "#2b3156"), (1, "#1a1d36")]))
    shirt = doc.add_layer("Shirt")
    for pts in ([(446, 866), (500, 985), (424, 1000), (378, 912)],
                flip_x([(446, 866), (500, 985), (424, 1000), (378, 912)], W)):
        fill(shirt, pts, "#f4f2fb")
    fill(shirt, [(470, 985), (530, 985), (520, 1250), (480, 1250)], "#eceaf6")
    lapel = doc.add_layer("Lapels")
    for pts in ([(378, 912), (424, 1000), (470, 1250), (380, 1250), (330, 1000)],
                flip_x([(378, 912), (424, 1000), (470, 1250), (380, 1250), (330, 1000)], W)):
        fill(lapel, pts, "#252a4c")
    step("Uniform")

    cloth_shade = doc.add_layer("Uniform shadow", mode="multiply")
    fill(cloth_shade, [(440, 875), (560, 875), (530, 960), (470, 960)], "#b8b4d6", feather=12, opacity=0.8)
    for pts in ([(424, 1000), (470, 1250), (452, 1250), (410, 1010)],
                flip_x([(424, 1000), (470, 1250), (452, 1250), (410, 1010)], W)):
        fill(cloth_shade, pts, "#8a86b0", feather=4, opacity=0.7)
    line(cloth_shade, bezier((300, 1000), (330, 1120), (350, 1250)), 30, "#6c6a99", 0.2, (0.2, 0), 0.5)
    line(cloth_shade, bezier((700, 1000), (670, 1120), (650, 1250)), 30, "#6c6a99", 0.2, (0.2, 0), 0.5)
    step("Uniform shading")

    ribbon = doc.add_layer("Ribbon")
    wing_l = path((500, 995), ((470, 960), (420, 960), (425, 1000)), ((420, 1040), (470, 1035), (500, 995)))
    tail_l = [(492, 1000), (470, 1090), (488, 1080), (500, 1100), (500, 1005)]
    for pts in (tail_l, flip_x(tail_l, W), wing_l, flip_x(wing_l, W)):
        fill(ribbon, pts, "#c9344c")
    ell(ribbon, 500, 997, 17, 19, "#a8243b")
    rib_shade = doc.add_layer("Ribbon shine", mode="screen", clip=True)
    line(rib_shade, bezier((440, 985), (455, 975), (478, 985)), 7, "#ff9aa8", 0.5, (0.4, 0.4), 0.8)
    line(rib_shade, bezier((560, 985), (545, 975), (522, 985)), 7, "#ff9aa8", 0.5, (0.4, 0.4), 0.8)
    step("Ribbon")

    # ---- eyes -----------------------------------------------------------------
    eyes = doc.add_layer("Eye whites")
    eye_l = path((362, 578), ((385, 528), (452, 522), (480, 574)), ((470, 640), (382, 642), (362, 578)))
    eye_r = flip_x(eye_l, W)
    for e in (eye_l, eye_r):
        fill(eyes, e, "#fbf8ff")
    lid = doc.add_layer("Lid shadow", mode="multiply", clip=True)
    for cx in (421, 579):
        ell(lid, cx, 545, 75, 30, "#b3a9d6", feather=14)
    step("Eye whites")

    iris = doc.add_layer("Iris", clip=True)
    iris_grad = linear_gradient(W, H, (0, 542), (0, 640),
                                [(0, "#4a200e"), (0.35, "#a8541a"), (0.7, "#e2952f"), (1, "#ffd774")])
    centers = [(424, 592), (576, 592)]
    for cx, cy in centers:
        ell(iris, cx, cy, 37, 49, iris_grad)
    ring = doc.add_layer("Iris ring", clip=True)
    for cx, cy in centers:
        outer = ellipse_mask(W, H, cx, cy, 37, 49)
        inner = ellipse_mask(W, H, cx, cy, 33, 45, feather=3)
        ring.paint("#331307", outer - inner)
        ring.paint("#2a1006", ellipse_mask(W, H, cx, cy + 2, 15, 25))
        for k in range(10):
            ang = -0.6 + k * 0.13
            x0, y0 = cx + 18 * ang, cy + 12
            ring.paint("#ffcf73", stroke_mask(W, H, [(x0, y0), (x0 + 30 * ang, y0 + 22)], 3, 0.6, (0.5, 0.5)), 0.35)
    step("Irises")

    glow = doc.add_layer("Iris glow", mode="add", clip=True)
    for cx, cy in centers:
        ell(glow, cx, cy + 26, 27, 15, "#ffb347", feather=10, opacity=0.7)
    shine = doc.add_layer("Eye highlights", clip=True)
    for cx, cy in centers:
        ell(shine, cx - 13, cy - 24, 12, 15, "#ffffff", feather=1)
        ell(shine, cx + 15, cy + 22, 5, 5, "#ffffff", feather=1)
        ell(shine, cx + 12, cy - 12, 3, 3, "#ffffff", feather=1, opacity=0.9)
    step("Eye highlights")

    lashes = doc.add_layer("Lashes & lines")
    upper = bezier((358, 584), (385, 524), (452, 518), (484, 570), n=40)
    for side in (1, -1):
        up = upper if side == 1 else flip_x(upper, W)
        line(lashes, up, 10, "#2a1a24", 0.9, (0.05, 0.35))
        ox = 358 if side == 1 else 642
        d = 1 if side == 1 else -1
        line(lashes, [(ox + 14 * d, 572), (ox - 12 * d, 556)], 7, "#2a1a24", 0.9, (0, 0.8))
        line(lashes, [(ox + 8 * d, 584), (ox - 16 * d, 586)], 6, "#2a1a24", 0.9, (0, 0.8))
        low = bezier((372, 620), (400, 640), (440, 642), n=20)
        line(lashes, low if side == 1 else flip_x(low, W), 3, "#7a4048", 0.8, (0.4, 0.4), 0.75)
        crease = bezier((382, 528), (420, 504), (462, 520), n=20)
        line(lashes, crease if side == 1 else flip_x(crease, W), 3, "#c2857e", 0.8, (0.4, 0.4), 0.8)
    step("Lashes")

    # ---- nose and mouth -------------------------------------------------------
    line(lashes, [(507, 664), (499, 684)], 4, "#cf8d84", 0.8, (0.4, 0.5))
    ell(lashes, 512, 668, 3, 3, "#fff6f2", feather=1, opacity=0.9)
    mouth = path((478, 722), ((490, 726), (510, 726), (522, 721)), ((514, 742), (486, 742), (478, 722)))
    fill(lashes, mouth, "#b04656")
    ell(lashes, 500, 736, 11, 5, "#f08a98", feather=2)
    line(lashes, bezier((470, 720), (500, 728), (530, 718)), 3.5, "#7a2f3d", 0.85, (0.4, 0.4))
    line(lashes, jaw, 3.2, "#a86a64", 0.85, (0.35, 0.35), 0.8)
    step("Nose and mouth")

    # ---- front hair -----------------------------------------------------------
    hair = doc.add_layer("Hair (front)")
    ell(hair, 500, 318, 204, 162, hair_grad)
    bangs = [(375, 80, (340, 540), -22), (420, 80, (386, 566), -12), (462, 66, (446, 512), -6),
             (505, 58, (500, 592), 0), (546, 66, (562, 506), 8), (590, 80, (620, 562), 12),
             (630, 70, (662, 530), 20), (440, 46, (420, 470), -4), (568, 46, (592, 476), 6),
             (485, 40, (472, 540), -3), (527, 40, (538, 548), 4)]
    for rx, rw, tip, bend in bangs:
        fill(hair, strand(rx, rw, tip, bend), hair_grad)
    for side in (1, -1):
        for rx, rw, tip, bend in ((350, 70, (330, 900), -40), (318, 60, (282, 1010), -55), (372, 40, (360, 760), -20)):
            pts = strand(rx, rw, tip, bend, root_y=360)
            fill(hair, pts if side == 1 else flip_x(pts, W), hair_grad)
    step("Front hair")

    hair_shade = doc.add_layer("Hair shadow", mode="multiply", clip=True)
    for rx, rw, tip, bend in bangs:
        l = (rx - rw / 2, 330)
        line(hair_shade, bezier(l, ((l[0] + tip[0]) / 2 + bend, (l[1] + tip[1]) / 2), tip),
             16, "#3a3d6a", 0.3, (0.3, 0.4), 0.8)
    ell(hair_shade, 500, 440, 190, 70, "#4b4f80", feather=40, opacity=0.6)
    step("Hair shading")

    forehead = doc.add_layer("Bang shadow on skin", mode="multiply")
    shadow = []
    for rx, rw, tip, bend in bangs[:7]:
        shadow += [(tip[0] + 6, tip[1] + 22)]
    shadow = [(340, 470)] + shadow + [(662, 470)]
    fill(forehead, shadow + [(640, 400), (360, 400)], "#e6aaa3", feather=8, opacity=0.75)
    forehead.erase(1 - polygon_mask(W, H, face))
    forehead.erase(polygon_mask(W, H, eye_l, 1) + polygon_mask(W, H, eye_r, 1))
    step("Shadow from bangs")

    brows = doc.add_layer("Brows (see-through)", opacity=0.55)
    brow = bezier((376, 492), (410, 474), (458, 482), n=20)
    for b in (brow, flip_x(brow, W)):
        line(brows, b, 6, "#2a2440", 0.8, (0.2, 0.6))
    step("Eyebrows")

    hair_lines = doc.add_layer("Hair strands", clip=False)
    for rx, rw, tip, bend in bangs:
        r = (rx + rw / 2, 330)
        line(hair_lines, bezier(r, ((r[0] + tip[0]) / 2 + bend, (r[1] + tip[1]) / 2), tip),
             3, "#11142a", 0.8, (0.3, 0.5), 0.7)
    for _ in range(26):
        x = rng.uniform(260, 740)
        side = -1 if x < 500 else 1
        line(hair_lines, bezier((x, 200 + abs(x - 500) * 0.3), (x + side * 40, 420), (x + side * 70, 640)),
             2, "#7fb4cc", 0.6, (0.4, 0.4), 0.25)
    hair_mask = np.clip(polygon_mask(W, H, back) + hair.px[..., 3], 0, 1)
    hair_lines.px[..., 3] *= hair_mask
    step("Strand lines")

    ring_hl = doc.add_layer("Angel ring", mode="add")
    arc = [(x, 238 + 0.0028 * (x - 500) ** 2) for x in range(345, 656, 6)]
    line(ring_hl, arc, 26, "#4f86a8", 0.2, (0.3, 0.3), 0.6)
    for i in range(16):
        x = 362 + i * 18 + rng.uniform(-4, 4)
        y = 238 + 0.0028 * (x - 500) ** 2
        line(ring_hl, [(x - 2, y - 16), (x + 4, y + 20)], 9, "#8cc4e0", 0.5, (0.5, 0.5), 0.6)
    ring_hl.blur(3)
    ring_hl.px[..., 3] *= ellipse_mask(W, H, 500, 318, 204, 162)
    step("Hair shine")

    pin = doc.add_layer("Moon hairpin")
    moon = np.clip(ellipse_mask(W, H, 618, 392, 30, 30) - ellipse_mask(W, H, 632, 382, 26, 26), 0, 1)
    pin.paint(linear_gradient(W, H, (590, 362), (648, 422), [(0, "#fff3b0"), (1, "#e0a83a")]), moon)
    ell(pin, 600, 380, 5, 5, "#fffbe6", feather=1, opacity=0.9)
    step("Moon hairpin")

    # ---- lighting -------------------------------------------------------------
    rim = doc.add_layer("Rim light", mode="add")
    for pts in (bezier((300, 300), (240, 520), (200, 1100)), bezier((700, 300), (760, 520), (800, 1100)),
                bezier((330, 260), (420, 140), (500, 150)), bezier((670, 260), (580, 140), (500, 150))):
        line(rim, pts, 46, "#ff8a55", 0.15, (0.2, 0.3), 0.55)
    line(rim, bezier((250, 975), (190, 1050), (150, 1250)), 40, "#ff8a55", 0.15, (0.1, 0.1), 0.45)
    line(rim, bezier((750, 975), (810, 1050), (850, 1250)), 40, "#ff8a55", 0.15, (0.1, 0.1), 0.45)
    hair_body = polygon_mask(W, H, back) + ellipse_mask(W, H, 500, 318, 204, 162) + polygon_mask(W, H, blazer)
    rim.erase(1 - hair_body)
    step("Sunset rim light")

    particles = doc.add_layer("Light particles", mode="add")
    for _ in range(40):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(2, 6)
        ell(particles, x, y, r, r, rng.choice(["#ffd59a", "#ffb0c8", "#bfe6ff"]), feather=r, opacity=rng.uniform(0.3, 0.8))
    step("Light particles")

    grade = doc.add_layer("Colour grade", mode="soft light", opacity=0.35)
    grade.px[..., :3] = linear_gradient(W, H, (0, 0), (W, H), [(0, "#3a4cff"), (0.5, "#808080"), (1, "#ff9050")])
    grade.px[..., 3] = 1
    vignette = doc.add_layer("Vignette", mode="multiply", opacity=0.55)
    vignette.px[..., :3] = radial_gradient(W, H, (500, 620), 820, [(0, "#ffffff"), (0.6, "#ffffff"), (1, "#2a2140")])
    vignette.px[..., 3] = 1
    step("Colour grade")

    doc.bloom(threshold=0.68, radius=36, strength=0.55)
    step("Bloom")


if __name__ == "__main__":
    d = Document(W, H)
    paint(d, lambda label: print(label, flush=True))
    d.to_image().save(sys.argv[1] if len(sys.argv) > 1 else "anime_girl.png")
