"""Sequence 1 - The Encounter (S1-01 .. S1-10).

Geography (camera always faces north): the lit city and the sunset are
screen-left (west); Gojo stands on the WEST-corner traffic-light mast
(x = -7, cap y = 6.4, arm reaching east to x = -1.5 at y = 6.2); Thragg lands
at the intersection centre (x = 0) and stays screen-right of Gojo for the whole
sequence. Infinity is never visualised in Seq 1.

Every shot function is a pure function of the frame. Timings are authored in
the shot list's frame numbers and either read from the shot's own sfx /
dialogue cues (contact frames) or rescaled to the shot's actual length.

Local helpers (kept here so no shared module is touched):
  * street_stage()      - C.stage('street') with the Seq 1 storefront row
                          slotted between the skyline and the street, so the
                          mast and the crater stay in front of it.
  * storefronts()       - the north-side shop windows that burst on the landing
                          (continuity: 'storefront glass burst').
  * plate()             - background card (sky, sunset, LIT city on the west
                          horizon) for elevated / close shots, rendered through
                          a wide card camera because the lit-city layers only
                          reach frame at zoom <= 30.
  * thragg_front_face() - readable front-view face for Thragg (the rig's
                          profile features collapse to a centre line in
                          view='front'), with yaw / pitch / gaze.
  * front_cape()        - symmetric cape for view='front' (the rig's cape is
                          one-sided).
  * soft_street()       - the real street set, blurred, behind a street-level
                          close-up (S1-08).
  * thragg_eyes(), thragg_cu(), gojo_mcu() - insert portraits with gaze, jaw
                          and blindfold-lift controls the shared inserts lack.
  * S1-01 aerial        - the engine cameras cannot tilt, so the opening
                          crane-down is a pinhole projection of a box model of
                          the same geography (_Pin, _city, _box ...).
"""
from __future__ import annotations

import math
import random
from dataclasses import replace

from PIL import ImageDraw, ImageFilter

from engine import Cam, kf, pulse, clamp, EASE, lerp, mix_color, shade, smoothstep, PAL, FPS
import env
import fx
import inserts
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, blend, solve
import scenes.common as C

SEQ = 1
RIM_W = (-0.6, 0.5)                          # dusk key from screen-left (west): rim on the west edge
GOJO_DUSK = replace(GOJO, rim=(255, 196, 150))   # warm sunset rim on Gojo's hair and collar in Seq 1
MAST_X, MAST_TOP, ARM_Y = env.GANTRY_X, 6.4, 6.2
CAP_GROUND = 6.43                             # top of the mast cap plate
ARM_GROUND = 6.25                             # top surface of the mast arm


# ===========================================================================
# timing helpers
# ===========================================================================

def F(fr, f, n0):
    """Seconds of nominal frame f in a shot authored at n0 frames, rescaled to
    the shot's real length (so the staging survives a retime of a few frames)."""
    return f * (fr.n / float(n0)) / FPS


def cue_t(fr, cue, default_f, nth=0):
    """Seconds of the n-th sfx cue called `cue` in this shot (contact frames
    are keyed to the sound), falling back to the authored frame."""
    hits = [s.get("at", 0) for s in (fr.shot.get("sfx") or []) if s.get("cue") == cue]
    f = hits[nth] if len(hits) > nth else default_f
    return f / FPS


def dlg_t(fr, default_at, default_len):
    d = fr.shot.get("dialogue") or []
    if d:
        return d[0].get("at_frame", default_at) / FPS, d[0].get("frames", default_len) / FPS
    return default_at / FPS, default_len / FPS


def on2(fr):
    """Acting time quantised to 2s."""
    return (fr.f - fr.f % 2) / FPS


def seg(t, t0, t1, ease="inout"):
    return EASE[ease](clamp((t - t0) / max(1e-6, t1 - t0)))


# ===========================================================================
# environment helpers
# ===========================================================================

def _make_stores():
    rng = random.Random("s1-stores")
    out, x = [], -26.0
    while x < 24.0:
        w = rng.uniform(3.2, 4.6)
        out.append((x, x + w))
        x += w + rng.uniform(0.6, 1.3)
    return out


STORE_D = 2.4
STORES = _make_stores()
BURST_RANGE = (-4.0, 18.0)


def pane_burst_f(cx):
    """S1-02 frame at which the pane centred at cx bursts (None = never in Seq 1).
    Right-hand panes first (f20, sfx pan +0.25), then the left group (f26)."""
    if not (BURST_RANGE[0] <= cx <= BURST_RANGE[1]):
        return None
    if cx >= 4.0:
        return min(25, 20 + int(round(abs(cx - 10.0) * 0.7)))
    return min(32, 26 + int(round(abs(cx + 1.0) * 1.2)))


def storefronts(fr, mode="burst", t=0.0, lit=1.0):
    """North-side storefront row at d = 2.4 along the far curb.
    mode: 'intact' (S1-01), 's1-02' (bursting by pane at t), 'burst' (after)."""
    d = STORE_D
    half = (fr.W / fr.ss / 2) / fr.cam.zoom * d + 6
    frame_c = shade((46, 44, 52), lit)
    sign_c = shade((30, 30, 38), lit)
    glass_c = shade((62, 72, 88), lit)
    for i, (x0, x1) in enumerate(STORES):
        if x1 < fr.cam.x - half or x0 > fr.cam.x + half:
            continue
        cx = 0.5 * (x0 + x1)
        fr.rect(x0 - 0.3, 0.25, x1 + 0.3, 4.4, frame_c, d=d)
        fr.rect(x0 - 0.3, 3.55, x1 + 0.3, 4.4, sign_c, d=d)
        fr.line([(x0 - 0.3, 3.55), (x1 + 0.3, 3.55)], shade((70, 66, 72), lit), width_m=0.06, d=d)
        bf = pane_burst_f(cx)
        if mode == "burst":
            broken = bf is not None
        elif mode == "s1-02":
            broken = bf is not None and t >= bf / FPS
        else:
            broken = False
        if not broken:
            fr.rect(x0, 0.4, x1, 3.4, glass_c, d=d)
            # dusk reflections: two diagonal streaks
            for k, o in enumerate((0.25, 0.62)):
                xa = x0 + (x1 - x0) * o
                fr.poly([(xa, 0.4), (xa + 0.35, 0.4), (xa + 1.25, 3.4), (xa + 0.9, 3.4)],
                        shade(mix_color(glass_c, PAL["rim_warm"], 0.22), lit), d=d)
            fr.line([(cx, 0.4), (cx, 3.4)], frame_c, width_m=0.08, d=d)
        else:
            fr.rect(x0, 0.4, x1, 3.4, shade((17, 17, 23), lit), d=d)          # dark, empty shop
            fr.rect(x0 + 0.3, 0.4, x1 - 0.3, 1.0, shade((25, 25, 31), lit), d=d)
            rng = random.Random(f"shard{i}")
            # a few irregular shards still stuck in the frame
            for k in range(rng.randint(2, 4)):
                edge = rng.choice(("top", "top", "bottom", "side"))
                g = shade(glass_c, rng.uniform(1.0, 1.35))
                if edge == "top":
                    xa = rng.uniform(x0, x1 - 0.4)
                    w = rng.uniform(0.2, 0.6)
                    fr.poly([(xa, 3.4), (xa + w, 3.4), (xa + w * rng.uniform(0.2, 0.8), 3.4 - rng.uniform(0.3, 1.2))], g, d=d)
                elif edge == "bottom":
                    xa = rng.uniform(x0, x1 - 0.4)
                    w = rng.uniform(0.2, 0.5)
                    fr.poly([(xa, 0.4), (xa + w, 0.4), (xa + w * rng.uniform(0.3, 0.7), 0.4 + rng.uniform(0.2, 0.5))], g, d=d)
                else:
                    xa, sx = (x0, 1) if rng.random() < 0.5 else (x1, -1)
                    ya = rng.uniform(1.0, 2.8)
                    fr.poly([(xa, ya), (xa, ya + rng.uniform(0.4, 0.9)), (xa + sx * rng.uniform(0.2, 0.5), ya + 0.2)], g, d=d)
            # glass glittering on the pavement in front
            for k in range(8):
                gx = rng.uniform(x0, x1)
                fr.rect(gx, 0.26, gx + 0.14, 0.33, shade(PAL["glass"], rng.uniform(0.55, 0.95)), d=d)


def street_stage(fr, extra=(), lit=1.0, store="burst", t_store=0.0, gantry_on=True, lightning=0.0):
    """C.stage(fr, 1, 'street') with the Seq 1 storefront row slotted between the
    skyline and the street (so the mast, cars and crater stay in front of it)."""
    st = C.state(SEQ, *extra)
    tg = C.tg(fr)
    env.sky(fr, lit, lightning)
    env.clouds(fr, tg, lit=lit)
    env.river(fr, lit)
    env.skyline(fr, st, layers=(0, 1, 2, 3), lit=lit)
    env.smoke_columns(fr, tg, st, lit)
    env.light_shafts(fr, st)
    storefronts(fr, store, t_store, lit)
    env.street(fr, st, lit, show_gantry=gantry_on)
    return st


def plate(fr, horizon_v=0.6, lit=1.0, blur=0.0, card_x=-106.0, card_zoom=8.0, card_y=4.0,
          ground=True, near=True, drift=0.0):
    """Background card for shots where the engine cannot reach the western
    horizon: storm-dusk sky, sunset glow, the LIT city across the river at
    frame-left and the dark eastern towers right. Rendered through a wide
    'card' camera whose horizon is offset to `horizon_v`; the real camera is
    restored afterwards. blur > 0 softens it for long-lens close shots."""
    real = fr.cam
    off = (horizon_v - 0.5) * 1080.0
    fr.cam = Cam(x=card_x + drift, y=card_y, zoom=card_zoom, rot=real.rot, shake=(real.shake[0] * 0.3, off))
    st = C.state(SEQ)
    env.sky(fr, lit)
    env.clouds(fr, C.tg(fr), lit=lit)
    if ground:
        # distant ground below the horizon (dark) with the river's sunset glints
        gcol = shade((30, 28, 38), lit)
        fr.poly([(card_x - 9000, -1.8), (card_x + 9000, -1.8), (card_x + 9000, -4000), (card_x - 9000, -4000)],
                gcol, d=14.0)
        env.river(fr, lit)
    env.skyline(fr, st, layers=(0, 1), lit=lit, haze=0.04)
    if near:
        # a dark band of near rooftops just under the horizon
        rng = random.Random("plate-roofs")
        x = card_x - 900
        col = shade((20, 20, 28), lit)
        while x < card_x + 900:
            w = rng.uniform(14, 40)
            h = rng.uniform(-1.0, 3.5)
            fr.rect(x, -60, x + w, h, col, d=2.6)
            x += w + rng.uniform(0, 6)
    fr.cam = real
    if blur > 0:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(blur * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)


def soft_street(fr, cam, blur=7.0, extra=("landing_crater",)):
    """The real street set seen through `cam`, blurred: background for the
    close shots at street level (keeps the geography behind the insert)."""
    real = fr.cam
    fr.cam = cam
    street_stage(fr, extra=extra, store="burst")
    fr.cam = real
    if blur > 0:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(blur * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)


def drift_dust(fr, x0, x1, y0, y1, t, n=40, d=1.0, speed=1.4, salt="drift", alpha=110, size=0.02):
    """Fine dust drifting east -> west (screen right -> left) on the wind."""
    rng = fr.srng(salt)
    img, dr = fr.layer()
    span = x1 - x0
    for i in range(n):
        sp = speed * rng.uniform(0.6, 1.4)
        x = x1 - ((rng.random() * span + t * sp) % span)
        y = y0 + (y1 - y0) * rng.random() + 0.05 * math.sin(t * 2 + i)
        X, Y = fr.P(x, y, d)
        r = max(1.0, fr.S(size * rng.uniform(0.6, 1.6), d))
        c = shade(PAL["dust"], rng.uniform(0.8, 1.2))
        dr.ellipse([X - r * 1.8, Y - r * 0.8, X + r * 1.8, Y + r * 0.8], fill=c + (int(alpha * rng.uniform(0.5, 1)),))
    fr.merge(img)


# ===========================================================================
# fighter helpers
# ===========================================================================

def gojo_at(fr, pose, x, ground=CAP_GROUND, switch=None, depth=1.0, **extra):
    o = C.opts(fr, "gojo", switch, **extra)
    return draw_fighter(fr, GOJO_DUSK, pose, x, None, 1, opts=o, ground=ground, rim_dir=RIM_W, depth=depth)


def thragg_side(fr, pose, x, y=None, facing=-1, switch=None, depth=1.0, style=THRAGG, **extra):
    o = C.opts(fr, "thragg", switch, **extra)
    return draw_fighter(fr, style, pose, x, y, facing, opts=o, rim_dir=RIM_W, depth=depth)


def thragg_front(fr, pose, x, y=None, switch=None, lift=0.0, flutter=0.0, spine_k=1.0, chest_k=1.0,
                 yaw=0.0, pitch=0.0, gaze=(0.0, 0.0), warm=0.0, scale=1.0, silhouette=None, depth=1.0):
    """Thragg square to camera (facing south) with a symmetric cape behind him
    and a readable front face."""
    o = C.opts(fr, "thragg", switch)
    cape_kind = o.get("cape")
    o["cape"] = None
    st = replace(THRAGG, spine=THRAGG.spine * spine_k, w_chest=THRAGG.w_chest * chest_k)
    J0 = solve(st, pose, x, y, -1, scale, "front")
    prev = fr.depth
    fr.depth = depth
    if cape_kind:
        front_cape(fr, J0, lift, flutter, cape_kind, sil=silhouette)
    fr.depth = prev
    J = draw_fighter(fr, st, pose, x, y, -1, scale=scale, view="front", opts=o, rim_dir=RIM_W,
                     silhouette=silhouette, depth=depth)
    if silhouette is None:
        thragg_front_face(fr, J, yaw, pitch, gaze, warm)
    return J


def front_cape(fr, J, lift=0.0, flutter=0.0, kind="full", sil=None):
    """Cape seen from the front: hangs behind the back (lift 0) or is thrown up
    behind the head (lift 1). Drawn before the body, so only the flaring edges
    (and, when lifted, the part above the shoulders) show."""
    s = J["scale"]
    sl, sr = J["sh_f"], J["sh_n"]                 # screen-left / screen-right shoulder
    px, py = J["pelvis"]
    hx, hy = J["head"]
    L = 1.0 if kind == "full" else 0.45
    # standing: hangs to the calves; crouched: bunched over the back, hidden behind him
    hem_y0 = lerp(py - 0.12 * s, max(0.05, py - 0.8 * L * s), clamp((py - 0.62) / 0.3))
    hem_y1 = hy + (0.25 + 0.55 * L) * s
    hy_ = lerp(hem_y0, hem_y1, clamp(lift))
    spread = lerp(0.1, 0.55, clamp(lift)) * s
    xl, xr = sl[0] - spread, sr[0] + spread
    pts = [(sl[0] + 0.02, sl[1] + 0.05), (J["neck"][0], J["neck"][1] + 0.02), (sr[0] - 0.02, sr[1] + 0.05),
           (sr[0] + 0.1 * s, sr[1] - 0.05)]
    n = 7
    for k in range(n + 1):
        u = 1 - k / n
        x = xl + (xr - xl) * u
        wav = 0.05 * s * math.sin(k * 1.9 + flutter) + (0.07 * s if k % 2 else 0) * (0.3 + lift)
        pts.append((x, hy_ + wav))
    pts.append((sl[0] - 0.1 * s, sl[1] - 0.05))
    col = sil if sil is not None else mix_color(shade(THRAGG.accent, 0.5), shade(THRAGG.accent, 0.72),
                                                 clamp((J["pelvis"][1] - 0.6) / 0.35))
    fr.poly(pts, col)
    if lift > 0.35 and sil is None:
        # dark lining shows when the cape is thrown up
        inner = [(sl[0] + 0.05, sl[1] + 0.1), (sr[0] - 0.05, sr[1] + 0.1),
                 (xr - 0.12 * s, hy_ - 0.05 * s), (xl + 0.12 * s, hy_ - 0.05 * s)]
        fr.poly(inner, (96, 14, 20))


def thragg_front_face(fr, J, yaw=0.0, pitch=0.0, gaze=(0.0, 0.0), warm=0.0):
    """Front-view face for Thragg. yaw -1..1 (+ = looking screen-right/east),
    pitch 0..1 (1 = head bowed), gaze = pupil offset (-1..1, + = right/up)."""
    hx, hy = J["head"]
    s = J["scale"]
    r = THRAGG.head_r * s
    hd = J["head_dir"]
    sd = (hd[1], -hd[0])
    skin, hair = THRAGG.skin, THRAGG.hair
    pv = clamp(pitch)

    def vm(v):
        return v * (1 - 0.25 * pv) - 0.3 * pv

    fu = 0.42 * yaw

    def at(u, v):
        v = vm(v)
        return (hx + (sd[0] * u + hd[0] * v) * r, hy + (sd[1] * u + hd[1] * v) * r)

    def ck(k):                                    # foreshortening of the side turned away
        return 1 - 0.45 * max(0.0, k * yaw)

    # cover the profile features the rig collapses onto the centre line
    fr.ellipse(hx, hy, r * 0.97, r * 1.07, fill=skin)
    # ears
    for k in (-1, 1):
        ex = k * (0.98 - 0.12 * max(0.0, -k * yaw))
        fr.ellipse(hx + sd[0] * ex * r, hy + hd[1] * (0.0 - 0.2 * pv) * r, r * 0.13 * ck(-k), r * 0.22, fill=shade(skin, 0.86))
    fr.ellipse(hx, hy, r * 0.95, r * 1.05, fill=skin)
    # jaw shadow
    fr.poly([at(-0.85, -0.45), at(0.85, -0.45), at(0.55, -0.95), at(-0.55, -0.95)], shade(skin, 0.93))
    # close-cropped hair cap with a square hairline
    cap = []
    for i in range(15):
        a = math.radians(-12 + 204 * i / 14)
        cap.append((hx + math.cos(a) * r * 1.0, hy + math.sin(a) * r * 1.09))
    hl = 0.5 - 0.42 * pv
    cap += [(hx - 0.96 * r, hy + 0.05 * r), at(-0.62 + fu * 0.5, hl), at(0.62 + fu * 0.5, hl)]
    fr.poly(cap, hair)
    # brows, eyes
    for k in (-1, 1):
        c = ck(k)
        u = fu + k * 0.36 * c
        bw = 0.24 * c
        fr.poly([at(u - bw, 0.31), at(u + bw, 0.31 - 0.03 * k), at(u + bw, 0.2), at(u - bw, 0.2)], hair)
        fr.ellipse(*at(u, 0.08), r * 0.14 * c, r * 0.055, fill=(222, 214, 212))
        gx, gy = gaze
        ix, iy = at(u + gx * 0.07 * c, 0.08 + gy * 0.03)
        fr.ellipse(ix, iy, r * 0.055 * c, r * 0.05, fill=(40, 26, 22))
        # heavy, half-lowered upper lid
        fr.poly([at(u - 0.16 * c, 0.1), at(u + 0.16 * c, 0.1), at(u + 0.16 * c, 0.19), at(u - 0.16 * c, 0.19)],
                shade(skin, 0.82))
        fr.line([at(u - 0.15 * c, 0.1), at(u + 0.15 * c, 0.105)], (54, 36, 34), width_m=r * 0.04)
    # nose
    nu = fu * 1.12
    fr.poly([at(nu - 0.02, 0.06), at(nu + 0.1, -0.24), at(nu - 0.12, -0.24)], shade(skin, 0.8))
    # mustache: thick drooping horseshoe; mouth line between the drooping ends
    m = fu * 1.1
    ka, kb = ck(-1), ck(1)
    fr.line([at(m - 0.17 * ka, -0.52), at(m + 0.17 * kb, -0.52)], (110, 56, 56), width_m=r * 0.06)
    fr.poly([at(m - 0.1, -0.27), at(m + 0.1, -0.27), at(m + 0.34 * kb, -0.34), at(m + 0.36 * kb, -0.74),
             at(m + 0.25 * kb, -0.74), at(m + 0.2 * kb, -0.45), at(m - 0.2 * ka, -0.45), at(m - 0.25 * ka, -0.74),
             at(m - 0.36 * ka, -0.74), at(m - 0.34 * ka, -0.34)], hair)
    if warm > 0:
        # warm sunset rim on the west (screen-left) side of the face
        fr.glow_line([at(-0.98, -0.6), at(-1.02, 0.1), at(-0.85, 0.75)], shade((190, 100, 50), warm), width_px=5)


def impact_scaled(fr, x, y, t, kind="heavy", k=0.5, salt="imp"):
    """fx.impact at k x its size, placed so it lands on world point (x, y):
    drawn on a farther depth plane (d = 1/k) at the matching coordinates."""
    d = 1.0 / k
    cx, cy = fr.cam.x, fr.cam.y
    fx.impact(fr, cx + (x - cx) * d, cy + (y - cy) * d, t, kind=kind, d=d, salt=salt)


def streak(fr, x, y_lo, y_hi, width_m=0.7, d=1.0, alpha=140, color=(245, 238, 236)):
    """Vertical smear ribbon + a few hard speed strokes (falling body)."""
    img, dr = fr.layer()
    a = fr.P(x - width_m / 2, y_hi, d)
    b = fr.P(x + width_m / 2, y_hi, d)
    c = fr.P(x + width_m * 0.3, y_lo, d)
    e = fr.P(x - width_m * 0.3, y_lo, d)
    dr.polygon([a, b, c, e], fill=color + (alpha,))
    rng = fr.srng("streak")
    for i in range(9):
        o = rng.uniform(-width_m * 0.9, width_m * 0.9)
        y0 = y_lo + rng.uniform(0.2, 1.5)
        dr.line([fr.P(x + o, y0, d), fr.P(x + o, y_hi, d)], fill=(255, 255, 255, 170),
                width=max(1, int(rng.uniform(1, 3) * fr.ss)))
    fr.merge(img)


# ===========================================================================
# insert portraits (local versions with gaze / jaw / blindfold-lift controls)
# ===========================================================================

def thragg_eyes(fr, gaze=(0.0, 0.0), mood="contempt", lid=0.0, glint=1.0, t=0.0):
    """ECU band across Thragg's eyes (after inserts.thragg_eyes_ecu) with a
    controllable gaze: gaze x -1..1 (+ = screen-right), y -1..1 (+ = up).
    lid 0..1 lowers the upper lids a touch. Warm light from screen-left."""
    skin = THRAGG.skin
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=shade(skin, 0.62))
    L = inserts.Local(fr, 0.5, 0.5, 1.0)
    h = {"contempt": 0.08, "analytical": 0.12, "fury": 0.18}.get(mood, 0.1) * (1 - 0.25 * lid)
    gx, gy = gaze
    for ex in (-0.75, 0.75):
        L.poly([(ex - 0.5, 0.0), (ex - 0.2, -h), (ex + 0.25, -h * 1.1), (ex + 0.5, -0.02), (ex + 0.2, h * 0.6),
                (ex - 0.2, h * 0.7)], (228, 222, 220))
        ix = ex + 0.05 + gx * 0.2
        iy = -0.02 - gy * 0.07
        L.ell(ix, iy, 0.15, 0.15, fill=(64, 40, 28))
        L.ell(ix, iy, 0.07, 0.07, fill=(12, 8, 10))
        # warm specular glint from screen-left
        L.ell(ix - 0.07, iy - 0.05, 0.03 * glint, 0.022 * glint, fill=(255, 236, 210))
        # lids clip the iris to the eye shape
        L.poly([(ex - 0.62, 0.0), (ex - 0.5, 0.0), (ex - 0.2, -h), (ex + 0.25, -h * 1.1), (ex + 0.5, -0.02),
                (ex + 0.62, -0.02), (ex + 0.62, -0.32), (ex - 0.62, -0.28)], shade(skin, 0.62))
        L.poly([(ex - 0.62, 0.0), (ex - 0.5, 0.0), (ex - 0.2, h * 0.7), (ex + 0.2, h * 0.6), (ex + 0.5, -0.02),
                (ex + 0.62, -0.02), (ex + 0.62, 0.45), (ex - 0.62, 0.45)], shade(skin, 0.62))
        L.line([(ex - 0.5, 0.0), (ex - 0.2, -h), (ex + 0.25, -h * 1.1), (ex + 0.5, -0.02)], (40, 26, 26), 0.022)
        L.line([(ex - 0.45, 0.02), (ex - 0.2, h * 0.7), (ex + 0.2, h * 0.6)], shade(skin, 0.45), 0.01)
    L.poly([(-2, -0.62), (2, -0.66), (2, -0.3), (-2, -0.26)], shade(skin, 0.45))     # brow shadow
    L.poly([(-2, -1.2), (2, -1.2), (2, -0.7), (-2, -0.66)], skin)                     # forehead
    for ex in (-0.75, 0.75):
        L.poly([(ex - 0.55, -0.42), (ex + 0.5, -0.5), (ex + 0.52, -0.36), (ex - 0.5, -0.3)], THRAGG.hair)
    # nose bridge between the eyes, cheek mass below
    L.poly([(-0.08, -0.27), (0.08, -0.27), (0.17, 0.62), (-0.17, 0.62)], shade(skin, 0.66))
    L.line([(0.08, -0.27), (0.17, 0.62)], shade(skin, 0.55), 0.01)
    # warm wash from the west
    fr.soft_circle(0.0, 0.5, 0.7, (90, 44, 20), world=False)


def thragg_cu(fr, cu=0.52, cv=0.56, s=1.0, gaze=(0.0, 0.0), jaw=0.0, rot=0.0, warm=1.0):
    """Close-up of Thragg 3/4 facing screen-left (after inserts.thragg_face,
    flip = -1) with a controllable gaze and jaw (the mustache masks the lips,
    so dialogue is carried by the jaw)."""
    L = inserts.Local(fr, cu, cv, s, rot, -1)
    skin, shadow = THRAGG.skin, shade(THRAGG.skin, 0.74)
    hair, hair_sh = THRAGG.hair, shade(THRAGG.hair, 0.72)
    j = 0.07 * clamp(jaw)
    # massive neck + uniform with the crimson yoke
    L.poly([(-0.42, 0.5), (0.3, 0.5 + j), (0.46, 1.3), (-0.62, 1.3)], skin)
    L.poly([(-1.1, 0.95), (0.9, 0.9), (1.2, 1.5), (-1.3, 1.5)], THRAGG.suit)
    L.poly([(-1.1, 0.95), (0.9, 0.9), (0.95, 1.08), (-1.1, 1.12)], THRAGG.accent)
    # face: the lower jaw drops with j
    face = [(-0.52, -0.42), (-0.5, 0.2), (-0.36, 0.56 + j * 0.6), (0.04, 0.74 + j), (0.34, 0.68 + j),
            (0.52, 0.42 + j * 0.6), (0.56, 0.0), (0.52, -0.46), (0.0, -0.66), (-0.42, -0.62)]
    L.poly(face, skin)
    L.poly([(-0.52, -0.42), (-0.5, 0.2), (-0.36, 0.56 + j * 0.6), (0.04, 0.74 + j), (-0.1, 0.3), (-0.3, -0.2)], shadow)
    # ear
    L.ell(-0.44, -0.08, 0.08, 0.15, fill=shade(skin, 0.66))
    # brow ridge
    L.poly([(-0.2, -0.3), (0.56, -0.34), (0.56, -0.22), (-0.18, -0.2)], shade(skin, 0.78))
    gx, gy = gaze
    for ex in (0.34, -0.06):
        L.ell(ex, -0.13, 0.1, 0.034, fill=(220, 214, 214))
        L.ell(ex + 0.02 + gx * 0.05, -0.13 - gy * 0.012, 0.035, 0.028, fill=(26, 18, 22))
        # heavy half-lowered lid
        L.poly([(ex - 0.11, -0.13), (ex + 0.11, -0.135), (ex + 0.11, -0.17), (ex - 0.11, -0.17)], shade(skin, 0.86))
        L.line([(ex - 0.1, -0.135), (ex + 0.1, -0.14)], (50, 34, 34), 0.012)
    L.poly([(-0.2, -0.36), (0.56, -0.4), (0.56, -0.3), (-0.18, -0.27)], hair)          # heavy black brow
    # nose
    L.poly([(0.42, -0.1), (0.56, 0.14), (0.46, 0.2), (0.36, 0.16)], shade(skin, 0.85))
    # mouth opening (only the jaw reads under the mustache)
    if j > 0.004:
        L.poly([(0.08, 0.41), (0.4, 0.39), (0.38, 0.41 + j * 1.2), (0.1, 0.43 + j * 1.2)], (52, 18, 22))
    else:
        L.line([(0.06, 0.43), (0.42, 0.41)], (110, 54, 54), 0.02)
    # mustache: thick, drooping horseshoe (rides with the upper lip, not the jaw)
    L.poly([(0.6, 0.22), (0.5, 0.18), (0.04, 0.24), (-0.12, 0.34), (-0.16, 0.6 + j * 0.5), (-0.06, 0.62 + j * 0.5),
            (0.02, 0.38), (0.4, 0.34), (0.5, 0.58 + j * 0.5), (0.6, 0.56 + j * 0.5)], hair)
    L.poly([(0.04, 0.24), (-0.12, 0.34), (-0.16, 0.6 + j * 0.5), (-0.06, 0.62 + j * 0.5), (0.02, 0.38)], hair_sh)
    # close-cropped hair
    L.poly([(0.5, -0.46), (0.44, -0.66), (0.12, -0.8), (-0.36, -0.8), (-0.66, -0.62), (-0.72, -0.3),
            (-0.66, 0.02), (-0.56, 0.04), (-0.54, -0.3), (-0.3, -0.56), (0.1, -0.6)], hair)
    for k in range(9):
        x = 0.36 - k * 0.11
        L.line([(x, -0.76 + abs(x) * 0.08), (x - 0.03, -0.62)], shade(hair, 1.6), 0.006)
    if warm > 0:
        # warm rim from screen-left: the face's front edge (it faces west)
        L.line([(0.52, -0.46), (0.56, 0.0), (0.52, 0.42 + j * 0.6), (0.34, 0.68 + j)], (255, 176, 120), 0.018 * warm)


def gojo_mcu(fr, cu=0.42, cv=0.56, s=1.0, smile=1.0, brow=0.0, lift=0.0, hand=0.0, hook=0.0, glint=0.0):
    """Gojo MCU, 3/4 facing screen-right (after inserts.gojo_face, blindfold).
    smile 0 (curious, flat) .. 1 (amused) .. 1.4 (a hair wider)
    brow  0..1  near eyebrow lifting above the band
    lift  0..1  blindfold hooked up a finger's width over the near (right) eye
    hand  0..1  right hand up from the pocket (0 = out of frame)
    hook  0..1  two fingers hooked under the band"""
    L = inserts.Local(fr, cu, cv, s, 0.0, 1)
    skin, shadow = GOJO.skin, shade(GOJO.skin, 0.8)
    hair, hair_sh = GOJO.hair, shade(GOJO.hair, 0.78)
    suit = GOJO.suit
    L.poly([(-0.28, 0.55), (0.22, 0.55), (0.3, 1.2), (-0.4, 1.2)], skin)
    L.poly([(-0.55, 0.7), (0.5, 0.62), (0.62, 1.4), (-0.7, 1.4)], suit)
    L.poly([(-0.42, 0.62), (0.36, 0.56), (0.42, 0.85), (-0.48, 0.92)], shade(suit, 1.3))
    face = [(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (0.22, 0.62), (0.42, 0.34), (0.5, 0.0),
            (0.48, -0.4), (0.0, -0.62), (-0.4, -0.58)]
    L.poly(face, skin)
    L.poly([(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (-0.12, 0.3), (-0.3, -0.1)], shadow)
    # warm rim from screen-left on the jaw/collar edge
    L.line([(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45)], (255, 190, 140), 0.012)
    # mouth: flat (curious) -> smirk (amused) -> a hair wider
    my = 0.38
    sm = clamp(smile, 0.0, 1.5)
    L.line([(0.02 - 0.02 * max(0, sm - 1), my + 0.02 * min(1, sm)), (0.18, my - 0.002),
            (0.28 + 0.04 * max(0, sm - 1), my - 0.01 - 0.04 * sm)], (140, 80, 80), 0.022)
    L.line([(0.38, 0.0), (0.44, 0.16), (0.36, 0.2)], shade(skin, 0.7), 0.015)
    # the near (right) eye, revealed when the band lifts
    if lift > 0.05:
        ex, ey = 0.3, -0.15
        L.ell(ex, ey, 0.12, 0.07, fill=(240, 252, 255))
        L.ell(ex + 0.02, ey + 0.005, 0.065, 0.065, fill=(60, 190, 255))
        L.ell(ex + 0.02, ey + 0.005, 0.03, 0.03, fill=(200, 240, 255))
        L.ell(ex + 0.0, ey - 0.02, 0.018, 0.014, fill=(255, 255, 255))
        L.line([(ex - 0.13, ey - 0.06), (ex + 0.13, ey - 0.08)], hair, 0.014)     # white lashes
        L.line([(ex - 0.12, ey + 0.055), (ex + 0.1, ey + 0.05)], shade(hair, 0.9), 0.008)
        if glint > 0:
            gx, gy = ex - 0.05, ey - 0.03
            for a in range(4):
                ang = a * math.pi / 2 + math.pi / 4
                L.line([(gx, gy), (gx + math.cos(ang) * 0.07 * glint, gy + math.sin(ang) * 0.07 * glint)],
                       (255, 255, 255), 0.008)
    # brow lifting above the band: a sliver of forehead + the white brow
    if brow > 0.02:
        bl = 0.09 * brow
        L.poly([(0.08, -0.29), (0.52, -0.31), (0.52, -0.31 - bl - 0.04), (0.1, -0.29 - bl - 0.03)], skin)
        L.line([(0.14, -0.3 - bl), (0.3, -0.34 - bl), (0.48, -0.33 - bl)], shade(hair, 0.62), 0.028)
    # blindfold band; the near end lifts a finger's width
    lw = 0.17 * clamp(lift)

    def w(x):
        return smoothstep(-0.05, 0.22, x)
    xs = [-0.6 + 1.12 * k / 12 for k in range(13)]
    top = [(x, -0.28 - 0.02 * (x + 0.6) / 1.12 - lw * 0.75 * w(x)) for x in xs]
    bot = [(x, -0.02 - 0.04 * (x + 0.6) / 1.12 - lw * w(x)) for x in xs[::-1]]
    L.poly(top + bot, GOJO.accent)
    L.line(top, (40, 40, 50), 0.01)
    if lift > 0.05:
        L.line(bot[: 6], (34, 34, 44), 0.012)            # the lifted hem catches a little light
    # hair pushed up into tall spikes
    spikes = [(-0.62, -0.25), (-0.95, -0.55), (-0.62, -0.62), (-0.92, -0.98), (-0.45, -0.82),
              (-0.55, -1.32), (-0.2, -0.95), (-0.12, -1.42), (0.08, -1.0), (0.32, -1.36), (0.3, -0.92),
              (0.62, -1.18), (0.45, -0.74), (0.78, -0.82), (0.5, -0.5), (0.58, -0.3 - lw * 0.75)]
    spikes = [(x, y - (0.07 * brow if x > 0.1 and y > -0.4 else 0.0)) for x, y in spikes]
    L.poly(spikes, hair)
    L.poly([(-0.62, -0.25), (-0.92, -0.98), (-0.45, -0.82), (-0.3, -0.5)], hair_sh)
    L.line([(-0.62, -0.25), (-0.95, -0.55), (-0.62, -0.62), (-0.92, -0.98)], (255, 196, 150), 0.012)
    # right hand: up from the pocket, two fingers hooking under the band
    if hand > 0.01:
        rise = EASE["out"](clamp(hand))
        oy = (1 - rise) * 1.1
        ly = -lw
        hk = clamp(hook)
        wx, wy = 0.78, 0.62 + oy
        kx, ky = 0.58, 0.1 + oy + ly * hk
        L.poly([(wx + 0.3, wy + 0.9), (wx + 0.06, wy + 0.9), (wx - 0.06, wy), (wx + 0.18, wy - 0.02)], suit)
        L.poly([(wx - 0.08, wy + 0.02), (wx + 0.17, wy - 0.02), (kx + 0.12, ky + 0.04), (kx - 0.1, ky + 0.06)], skin)
        L.poly([(wx - 0.08, wy + 0.02), (kx - 0.1, ky + 0.06), (kx - 0.02, ky + 0.2)], shadow)
        # index + middle fingers: straight up (hk 0) -> tips curled under the band (hk 1)
        for k, (bx, tx) in enumerate(((kx - 0.07, 0.38), (kx + 0.05, 0.47))):
            tip = (lerp(bx - 0.03, tx, hk), lerp(ky - 0.3, -0.02 + ly - 0.02 * k, hk))
            mid = (lerp(bx - 0.01, tx + 0.05, hk), lerp(ky - 0.15, 0.06 + ly, hk))
            L.line([(bx, ky + 0.07), (bx, ky), mid, tip], skin if k == 0 else shade(skin, 0.92), 0.068)
        # curled ring + little fingers, thumb
        L.ell(kx + 0.04, ky + 0.1, 0.07, 0.06, fill=shadow)
        L.line([(wx - 0.05, wy - 0.1), (kx - 0.14, ky + 0.16)], shade(skin, 0.88), 0.045)


# ===========================================================================
# S1-01  EWS aerial crane-down
# ===========================================================================
# The engine's cameras cannot tilt, so the opening aerial is drawn through a
# small pinhole camera over a box model of the same geography: the
# intersection at the origin (x east, y up, z north), the west-corner mast
# at x = -7, the north storefront block, the east block, the unfinished tower
# (x 80..110, 176 m + crane) and, screen-left beyond the river, the lit city.

A_PITCH = math.radians(15.0)            # optical axis below horizontal
A_DEP = math.radians(25.5)              # depression of the intersection (keeps it lower-centre)
A_F = 1400.0                            # focal length in 1080p px (~28 mm)


def river_x(z):
    """East bank of the river (runs roughly north, drifting west)."""
    return -330.0 - 0.36 * z


RIVER_W = 190.0


class _Pin:
    def __init__(self, fr, eye):
        self.ex, self.ey, self.ez = eye
        self.cp, self.sp = math.cos(A_PITCH), math.sin(A_PITCH)
        self.F = A_F * fr.ss
        self.cx, self.cy = fr.W / 2, fr.H / 2
        self.horizon = self.cy - self.F * math.tan(A_PITCH)

    def zc(self, x, y, z):
        return (z - self.ez) * self.cp - (y - self.ey) * self.sp

    def __call__(self, x, y, z):
        dx, dy, dz = x - self.ex, y - self.ey, z - self.ez
        zc = max(0.5, dz * self.cp - dy * self.sp)
        yc = dy * self.cp + dz * self.sp
        return (self.cx + self.F * dx / zc, self.cy - self.F * yc / zc)


_CITY = None


def _city():
    """Deterministic box model of the district (built once)."""
    global _CITY
    if _CITY is not None:
        return _CITY
    rng = random.Random("s1-city")
    boxes = []

    def add(x0, x1, z0, z1, h, kind):
        boxes.append(dict(x0=x0, x1=x1, z0=z0, z1=z1, h=h, kind=kind, seed=rng.random()))

    def cells(lo, hi, pitch, street, start):
        """Blocks of (pitch - street) metres, symmetric about 0, starting at +-start."""
        out, k = [], 0
        while start + k * pitch < max(hi, -lo):
            a0 = start + k * pitch
            if a0 < hi:
                out.append((a0, a0 + pitch - street))
            if -a0 > lo:
                out.append((-(a0 + pitch - street), -a0))
            k += 1
        return sorted(out)
    # near grid: 76 m blocks; the avenue (z -16..16) and the N-S boulevard
    # (x -20..20) cross at the origin, wide and empty
    for (z0, z1) in cells(-700, 1500, 78.0, 16.0, 16.0):
        for (x0, x1) in cells(-1500, 1300, 78.0, 16.0, 20.0):
            cxx, czz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
            if 70 <= x1 and x0 <= 120 and 0 < z0 < 60:
                continue                                    # the unfinished tower's lot
            if x1 > river_x(czz) - RIVER_W and x0 < river_x(czz):
                continue                                    # the river
            lit = cxx < river_x(czz) - RIVER_W
            r = math.hypot(cxx, czz)
            k = rng.randint(1, 3)
            w = (x1 - x0) / k
            for j in range(k):
                if lit:
                    hh = rng.uniform(30, 170)
                elif czz < 0 and abs(cxx) < 260:
                    hh = rng.uniform(8, 22)                 # low blocks under the descent: the camera sees over them
                elif r < 160:
                    hh = rng.uniform(14, 46)
                elif r < 700:
                    hh = rng.uniform(24, 100) * (1.5 if rng.random() < 0.15 else 1)
                else:
                    hh = rng.uniform(30, 130)
                zz0 = z0 + rng.uniform(0, 6)
                add(x0 + j * w + 1.5, x0 + (j + 1) * w - 1.5, zz0, z1 - rng.uniform(0, 6), hh, "lit" if lit else "dark")
    # far grid: coarser, out to the horizon
    for (z0, z1) in cells(1500, 4800, 150.0, 30.0, 1500.0):
        for (x0, x1) in cells(-3600, 3200, 150.0, 30.0, 10.0):
            cxx, czz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
            if x1 > river_x(czz) - RIVER_W and x0 < river_x(czz):
                continue
            lit = cxx < river_x(czz) - RIVER_W
            add(x0, x1, z0, z1, rng.uniform(40, 260 if lit else 200), "lit" if lit else "dark")
    _CITY = boxes
    return boxes


def _haze(c, dist, lit=1.0):
    return shade(mix_color(c, (70, 58, 78), clamp(dist / 4200.0) * 0.85), lit)


def _box(fr, pj, b, dist, flash=0.0):
    x0, x1, z0, z1, h = b["x0"], b["x1"], b["z0"], b["z1"], b["h"]
    lit = b["kind"] == "lit"
    rng = random.Random(b["seed"])
    base = (30, 30, 42) if not lit else (34, 32, 44)
    south = _haze(shade(base, rng.uniform(0.85, 1.15)), dist)
    top = _haze(mix_color(base, (90, 84, 104), 0.45 + 0.4 * flash), dist)
    west = _haze(mix_color(base, (150, 90, 70), 0.35), dist)
    east = _haze(shade(base, 1.1), dist)
    d = fr.draw
    P_ = pj
    s_face = [P_(x0, 0, z0), P_(x1, 0, z0), P_(x1, h, z0), P_(x0, h, z0)]
    if pj.ex < x0:
        d.polygon([P_(x0, 0, z0), P_(x0, h, z0), P_(x0, h, z1), P_(x0, 0, z1)], fill=west)
    elif pj.ex > x1:
        d.polygon([P_(x1, 0, z0), P_(x1, h, z0), P_(x1, h, z1), P_(x1, 0, z1)], fill=east)
    d.polygon(s_face, fill=south)
    if pj.ey > h:
        d.polygon([P_(x0, h, z0), P_(x1, h, z0), P_(x1, h, z1), P_(x0, h, z1)], fill=top)
    # windows on the south face (bilinear placement)
    (ax, ay), (bx, by), (cx_, cy_), (dx_, dy_) = s_face
    wpx, hpx = abs(bx - ax), abs(ay - dy_)
    if wpx < 6 * fr.ss or hpx < 6 * fr.ss:
        return
    floors = max(1, int(h / 4.2))
    cols = max(1, int((x1 - x0) / 3.2))
    if wpx / cols < 3 * fr.ss:
        # too small for a grid: lit speckle (lit city) or nothing
        if lit:
            for _ in range(min(60, int(floors * cols * 0.15))):
                u, v = rng.random(), rng.uniform(0.05, 0.95)
                px = ax + (bx - ax) * u
                py = ay + (dy_ - ay) * v
                r = max(1, int(0.8 * fr.ss))
                d.rectangle([px, py, px + r, py + r], fill=_haze(PAL["window_lit"], dist * 0.6, rng.uniform(0.6, 1.0)))
        return
    p_lit = 0.55 if lit else 0.012
    for i in range(floors):
        v0, v1 = (i + 0.25) / floors, (i + 0.75) / floors
        for j in range(cols):
            r = rng.random()
            if not lit and r > 0.35:
                continue
            u0, u1 = (j + 0.2) / cols, (j + 0.8) / cols
            if r < p_lit:
                c = _haze(PAL["window_lit"], dist * 0.5, rng.uniform(0.5, 1.0))
            elif not lit and r < 0.12:
                c = (8, 8, 12)                               # shattered
            else:
                c = _haze((24, 26, 36), dist)
            p0 = (ax + (bx - ax) * u0 + (dx_ - ax) * v0, ay + (by - ay) * u0 + (dy_ - ay) * v0)
            p1 = (ax + (bx - ax) * u1 + (dx_ - ax) * v1, ay + (by - ay) * u1 + (dy_ - ay) * v1)
            d.rectangle([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])], fill=c)


def _unfinished(fr, pj, dist):
    """The unfinished tower (x 80..110, 176 m) with its yellow crane."""
    x0, x1, z0, z1, H = 80.0, 110.0, 18.0, 48.0, 176.0
    d = fr.draw
    core = _haze((70, 70, 78), dist)
    slab = _haze((120, 116, 112), dist)
    glass = _haze((60, 80, 100), dist)
    d.polygon([pj(x0, 0, z0), pj(x1, 0, z0), pj(x1, H * 0.62, z0), pj(x0, H * 0.62, z0)], fill=glass)
    for i in range(5):
        cx = x0 + i * (x1 - x0) / 4
        d.line([pj(cx, 0, z0), pj(cx, H, z0)], fill=core, width=max(1, int(fr.ss * 2)))
    y = 4.2
    while y < H:
        d.line([pj(x0 - 0.6, y, z0), pj(x1 + 0.6, y, z0)], fill=slab, width=max(1, int(fr.ss * 1.5)))
        y += 4.2 * 2
    yel = _haze((200, 156, 40), dist)
    d.line([pj(x0 + 13, H, z0 + 15), pj(x0 + 13, H + 24, z0 + 15)], fill=yel, width=max(1, int(fr.ss * 3)))
    d.line([pj(x0 - 30, H + 22, z0 + 15), pj(x0 + 52, H + 22, z0 + 15)], fill=yel, width=max(1, int(fr.ss * 2.5)))
    d.line([pj(x0 + 13, H + 30, z0 + 15), pj(x0 - 30, H + 22, z0 + 15)], fill=yel, width=max(1, int(fr.ss)))
    d.line([pj(x0 + 13, H + 30, z0 + 15), pj(x0 + 52, H + 22, z0 + 15)], fill=yel, width=max(1, int(fr.ss)))


def _aerial_ground(fr, pj):
    d = fr.draw
    W, H = fr.W, fr.H
    d.rectangle([0, pj.horizon, W, H], fill=(36, 34, 44))
    zn = pj.ez + 20
    # river with the sunset in it
    L, R = [], []
    zs = [zn + (8000 - zn) * (k / 30) ** 2 for k in range(31)]
    for z in zs:
        L.append(pj(river_x(z) - RIVER_W, 0, z))
        R.append(pj(river_x(z), 0, z))
    d.polygon(L + R[::-1], fill=(46, 40, 58))
    rng = random.Random("glints")
    for k in range(60):
        z = zn + (6000 - zn) * rng.random() ** 2
        x = river_x(z) - RIVER_W * rng.uniform(0.15, 0.85)
        wl = rng.uniform(10, 30)
        d.line([pj(x, 0, z), pj(x + wl, 0, z)], fill=mix_color((46, 40, 58), (230, 150, 96), rng.uniform(0.4, 0.9)),
               width=max(1, int(fr.ss)))
    # lit-city street lights on the ground west of the river
    for k in range(700):
        z = zn + 60 + (5000 - zn) * rng.random() ** 1.5
        x = river_x(z) - RIVER_W - rng.uniform(10, 2600)
        px, py = pj(x, 0, z)
        if 0 <= px < W and pj.horizon <= py < H:
            r = max(1, int(fr.ss * (1.6 if z - pj.ez < 900 else 1)))
            d.rectangle([px, py, px + r, py + r], fill=mix_color(PAL["window_lit"], (60, 50, 60), rng.uniform(0, 0.4)))
    # sidewalks / block plinths near the intersection, lane markings, crosswalks
    pl = (50, 48, 58)
    for (x0, x1) in ((-160, -98), (-82, -20), (20, 82), (98, 160)):
        for (z0, z1) in ((94, 156), (16, 78), (-78, -16)):
            d.polygon([pj(x0, 0, z0), pj(x1, 0, z0), pj(x1, 0, z1), pj(x0, 0, z1)], fill=pl)
    lw = max(1, int(fr.ss))
    for zz in (-6.0, 6.0):
        x = -400.0
        while x < 400:
            if abs(x) > 22:
                d.line([pj(x, 0, zz), pj(x + 3, 0, zz)], fill=(110, 104, 90), width=lw)
            x += 9
    for xx in (-7.0, 7.0):
        z = -400.0
        while z < 600:
            if abs(z) > 18 and z > pj.ez + 25:
                d.line([pj(xx, 0, z), pj(xx, 0, z + 3)], fill=(110, 104, 90), width=lw)
            z += 9
    for xs in (-24.0, 24.0):                      # crosswalks over the avenue
        for k in range(12):
            z = -13 + k * 2.4
            d.line([pj(xs - 3, 0, z), pj(xs + 3, 0, z)], fill=(150, 146, 132), width=max(1, int(fr.ss * 1.5)))
    for zs_ in (-20.0, 20.0):                     # crosswalks over the boulevard
        for k in range(16):
            x = -18 + k * 2.4
            d.line([pj(x, 0, zs_ - 3), pj(x, 0, zs_ + 3)], fill=(150, 146, 132), width=max(1, int(fr.ss * 1.5)))
    # abandoned cars
    crng = random.Random("cars")
    for k in range(9):
        cx = crng.uniform(-160, 160)
        cz = crng.choice([-9.0, -3.5, 3.5, 9.0])
        if abs(cx) < 26:
            continue
        col = crng.choice([(70, 40, 40), (50, 60, 70), (60, 62, 58), (80, 76, 60)])
        d.polygon([pj(cx - 2.2, 1.4, cz - 0.9), pj(cx + 2.2, 1.4, cz - 0.9), pj(cx + 2.2, 1.4, cz + 0.9),
                   pj(cx - 2.2, 1.4, cz + 0.9)], fill=col)


def _mast(fr, pj):
    c = (70, 74, 84)
    w = max(1, int(fr.ss * 1.5))
    fr.draw.line([pj(MAST_X, 0, -11), pj(MAST_X, MAST_TOP, -11)], fill=c, width=w)
    fr.draw.line([pj(MAST_X, ARM_Y, -11), pj(MAST_X + 5.5, ARM_Y, -11)], fill=c, width=w)


def _aerial_sky(fr, pj, flash=0.0):
    W = fr.W
    hz = pj.horizon
    top, mid, low = PAL["sky_top"], PAL["sky_mid"], PAL["sky_low"]
    n = 24
    for i in range(n):
        v0, v1 = hz * i / n, hz * (i + 1) / n + 2
        c = mix_color(top, mid, i / (n - 1)) if i < n * 0.6 else mix_color(mid, low, (i - n * 0.6) / (n * 0.4))
        if flash:
            c = mix_color(c, (190, 180, 220), flash * 0.5)
        fr.draw.rectangle([0, v0, W, v1], fill=c)
    # the sunset smouldering under the cloud edge, far left
    fr.soft_circle(0.04, hz / fr.H, 0.2, (120, 56, 24), world=False)
    fr.soft_circle(0.02, hz / fr.H, 0.07, (170, 90, 40), world=False)
    # a smouldering strip along the western horizon under the deck
    for i in range(6):
        fr.draw.rectangle([0, hz - (i + 1) * 3 * fr.ss, fr.W * (0.45 - i * 0.06), hz - i * 3 * fr.ss],
                          fill=mix_color(low, (230, 130, 70), 0.5 - i * 0.07))


def _aerial_deck(fr, pj, flash=0.0):
    """Underside of the storm deck (y = 440), projected: ragged blobs above
    the horizon, darkest overhead."""
    img, dr = fr.layer()
    rng = random.Random("deck3d")
    Y = 440.0
    for i in range(260):
        z = pj.ez + 30 + 6000 * rng.random() ** 2.2
        x = pj.ex + rng.uniform(-1.4, 1.4) * (z - pj.ez)
        size = rng.uniform(120, 380)
        X, Yp = pj(x, Y, z)
        zc = pj.zc(x, Y, z)
        rx = pj.F * size / zc
        ry = rx * 0.16
        if Yp + ry < 0 or Yp - ry > pj.horizon + 6 or X + rx < 0 or X - rx > fr.W:
            continue
        far = clamp((z - pj.ez) / 5000.0)
        c = mix_color((32, 30, 46), (92, 70, 86), far * 0.9)
        c = mix_color(c, (200, 190, 230), flash * 0.6)
        dr.ellipse([X - rx, Yp - ry, X + rx, Yp + ry], fill=c + (int(150 - 80 * far),))
    fr.merge(img)


def _aerial_tatters(fr, pj, t):
    """Cloud tatters around the descent path, streaming past the lens."""
    img, dr = fr.layer()
    rng = random.Random("tat3d")
    for i in range(70):
        y = rng.uniform(250, 470)
        zline = -y / math.tan(A_DEP)
        z = zline + rng.uniform(40, 260)
        x = rng.uniform(-180, 150)
        size = rng.uniform(25, 80)
        zc = pj.zc(x, y, z)
        if zc < 3:
            continue
        X, Yp = pj(x, y, z)
        rx = pj.F * size / zc
        ry = rx * rng.uniform(0.35, 0.6)
        if Yp + ry < 0 or Yp - ry > fr.H:
            continue
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], rng.uniform(0.0, 0.45))
        dr.ellipse([X - rx, Yp - ry, X + rx, Yp + ry], fill=c + (int(rng.uniform(120, 210)),))
    fr.merge(img)
    k = 1 - smoothstep(0.0, 1.0, t)
    if k > 0:
        img, dr = fr.layer()
        dr.rectangle([0, 0, fr.W, fr.H], fill=PAL["cloud"] + (int(150 * k),))
        fr.merge(img)


def _aerial_dust_sheet(fr, pj, t, t0, t1):
    """A sheet of dust and paper sliding east -> west across the crosswalks."""
    if not (t0 - 0.2 < t < t1 + 0.6):
        return
    u = (t - t0) / (t1 - t0)
    k = smoothstep(-0.1, 0.15, u) * (1 - smoothstep(0.85, 1.15, u))
    xc = lerp(40.0, -45.0, u)
    img, dr = fr.layer()
    for i in range(12):
        x = xc + math.sin(i * 2.1) * 10
        z = -10 + i * 2.0
        X0, Y0 = pj(x - 12, 2.5, z)
        X1, Y1 = pj(x + 12, 0, z)
        dr.ellipse([X0, Y0, X1, Y1], fill=(176, 154, 130, int(40 * k)))
    fr.merge(img)
    rng = fr.srng("paper")
    for i in range(30):
        x = xc + rng.uniform(-20, 20)
        z = rng.uniform(-12, 12)
        y = abs(math.sin(t * 3 + i)) * 2.2
        px, py = pj(x, y, z)
        if k > 0.1:
            r = max(1, int(fr.ss * 1.5))
            fr.draw.rectangle([px, py, px + r * 1.5, py + r], fill=(228, 224, 212))


def _aerial_tarps(fr, pj, b, t):
    """Tarps / curtains flapping from shattered windows of a near tower (on 2s)."""
    rng = random.Random(b["seed"] + 7)
    if rng.random() < 0.6 or b["h"] < 14:
        return
    tq = math.floor(t * 12) / 12.0
    for k in range(rng.randint(1, 2)):
        x = rng.uniform(b["x0"] + 2, b["x1"] - 4)
        y = rng.uniform(5, b["h"] - 3)
        w = rng.uniform(1.6, 2.6)
        sway = math.sin(tq * 7 + rng.uniform(0, 6)) * 0.8 - 0.6          # streams west on the east wind
        col = rng.choice([(118, 112, 100), (78, 90, 112), (120, 62, 50)])
        z = b["z0"] - 0.2
        fr.draw.polygon([pj(x, y, z), pj(x + w, y, z), pj(x + w + sway * 0.6, y - 2.8, z), pj(x + sway, y - 3.2, z)],
                        fill=col)


def s1_01(fr):
    t, dur = fr.t, fr.dur
    n0 = 136
    # camera: one continuous ease-out crane-down on 1s (no pan, no roll); it
    # sinks along a line that keeps the intersection at lower centre
    e = EASE["out"](clamp(t / dur))
    h = lerp(420.0, 60.0, e)
    eye = (lerp(-30.0, -8.0, e), h, -h / math.tan(A_DEP))
    pj = _Pin(fr, eye)
    fr.cam = Cam(x=eye[0], y=h, zoom=lerp(2.6, 14.0, e))   # nominal (for any world helpers)
    t_light = cue_t(fr, "thunder_distant", 44) - 8 / FPS     # 2-frame flicker, 8 frames before the thunder
    flash = 0.9 if t_light - 1e-6 <= t < t_light + 2 / FPS - 1e-6 else 0.0
    _aerial_sky(fr, pj, flash)
    _aerial_deck(fr, pj, flash)
    _aerial_ground(fr, pj)
    # dusk haze lying on the far field (behind everything that stands up)
    img, dr = fr.layer()
    hz = pj.horizon
    for i in range(8):
        dr.rectangle([0, hz + i * fr.H * 0.012, fr.W, hz + (i + 1) * fr.H * 0.012], fill=(120, 86, 96, int(70 * (1 - i / 8))))
    fr.merge(img)
    boxes = []
    for b in _city():
        cxx, czz = 0.5 * (b["x0"] + b["x1"]), 0.5 * (b["z0"] + b["z1"])
        if b["z0"] < pj.ez + 15:
            continue
        dist = math.hypot(cxx - pj.ex, czz - pj.ez)
        px, _ = pj(cxx, 0, czz)
        if px < -0.5 * fr.W or px > 1.5 * fr.W:
            continue
        boxes.append((dist, b))
    boxes.append((math.hypot(95 - pj.ex, 33 - pj.ez), None))
    boxes.sort(key=lambda q: -q[0])
    for dist, b in boxes:
        if b is None:
            _unfinished(fr, pj, dist)
            continue
        _box(fr, pj, b, dist, flash)
        if dist < 450 and b["kind"] == "dark":
            _aerial_tarps(fr, pj, b, t)
    _mast(fr, pj)
    _aerial_dust_sheet(fr, pj, t, F(fr, 70, n0), F(fr, 120, n0))
    # the speck: Thragg, dead vertical over x = 0, entering frame-top at f122
    t_in, t_out = F(fr, 122, n0), F(fr, n0 - 1, n0)
    if t >= t_in - 1e-6:
        e_in = EASE["out"](clamp(t_in / dur))
        h_in = lerp(420.0, 60.0, e_in)
        dz = h_in / math.tan(A_DEP)
        T_ = 540.0 / A_F
        c_, s_ = math.cos(A_PITCH), math.sin(A_PITCH)
        y_top = h_in + dz * (T_ * c_ - s_) / (c_ + T_ * s_) + 1.0
        u = (t - t_in) / max(1e-6, t_out - t_in)
        ys = lerp(y_top, y_top - 32.0, u)
        X, Y = pj(0.0, ys, 0.0)
        X2, Y2 = pj(0.0, ys + 7.0, 0.0)
        img, dr = fr.layer()
        dr.line([(X2, Y2), (X, Y)], fill=(220, 214, 226, 90), width=max(1, int(fr.ss * 1.2)))
        fr.merge(img)
        r = 1.7 * fr.ss
        fr.draw.ellipse([X - r, Y - r * 1.7, X + r, Y + r * 1.7], fill=(214, 208, 204))
        fr.draw.ellipse([X - r * 0.7, Y - r * 1.9, X + r * 0.9, Y - r * 0.2], fill=(200, 34, 42))
    if t < 1.8:
        _aerial_tatters(fr, pj, t)
    fr.vignette = 0.45


# ===========================================================================
# S1-02  WS worm's-eye: the landing
# ===========================================================================

T_DROP = P("front_stand", ua_n=4, fa_n=2, ua_f=4, fa_f=2, th_n=3, sh_n=1, th_f=3, sh_f=1, hand_n="fist", hand_f="fist")
T_CONTACT = P("front_stand", ua_n=26, fa_n=10, ua_f=26, fa_f=10, th_n=44, sh_n=-6, th_f=44, sh_f=-6,
              hand_n="open", hand_f="open")
T_CROUCH = P("front_stand", ua_n=16, fa_n=-4, ua_f=16, fa_f=-4, th_n=66, sh_n=-12, th_f=66, sh_f=-12,
             hand_n="open", hand_f="open")
T_UPRIGHT = P("front_stand", ua_n=9, fa_n=5, ua_f=9, fa_f=5, th_n=5, sh_n=3, th_f=5, sh_f=3,
              hand_n="fist", hand_f="fist")


def _ground_cracks(fr, x, r0, r1, salt="gc", n=12, d=1.0, width=0.05):
    rng = random.Random(salt)
    for k in range(n):
        a = rng.uniform(0, math.tau)
        L = r1 * rng.uniform(0.6, 1.0)
        if L <= r0:
            continue
        pts = []
        for j in range(5):
            ll = r0 + (L - r0) * j / 4
            aa = a + rng.uniform(-0.12, 0.12)
            pts.append((x + math.cos(aa) * ll, -math.sin(aa) * ll * 0.14))
        fr.line(pts, (16, 14, 16), width_m=width, d=d)


def s1_02(fr):
    t, dur = fr.t, fr.dur
    n0 = 86
    tc = cue_t(fr, "land_heavy", 16)                 # CONTACT
    fc = int(round(tc * FPS))
    f = fr.f
    sh = C.shake(t, tc, amp=12.0, dur=6 / FPS)
    fr.cam = Cam(x=3.5, y=3.5, zoom=95, shake=sh)
    landed = f >= fc
    street_stage(fr, extra=("landing_crater",) if landed else (), store="s1-02", t_store=t)
    # Gojo stands on the cap just outside frame-left (continuity only)
    gojo_at(fr, P("g_idle"), MAST_X)
    # dust drifting right to left before the landing; paper lifts as the air arrives
    drift_dust(fr, -8, 14, 0.05, 1.2, t, n=30, d=1.4, salt="pre")
    k = smoothstep(F(fr, 10, n0), tc, t)
    rng = fr.srng("paperlift")
    ta_ = max(0.0, t - tc)
    for i in range(10):
        px = rng.uniform(-4, 5)
        py = 0.05 + k * rng.uniform(0.5, 2.2)
        if ta_ > 0:                                   # blown out by the blast, then fluttering down
            px += (1 if px > 0 else -1) * 9.0 * (1 - math.exp(-3 * ta_)) + math.sin(ta_ * 5 + i) * 0.3
            py = max(0.03, py + 1.5 * (1 - math.exp(-4 * ta_)) - 0.6 * ta_)
        tilt = 0.12 * math.sin(t * 6 + i)
        fr.poly([(px, py), (px + 0.3, py + tilt), (px + 0.3, py + 0.2 + tilt), (px, py + 0.2)], (220, 216, 204), d=1.2)
    tt = t - tc
    if landed:
        # radial cracks race outward f16-24 (beyond the crater's own cracks)
        rr = lerp(3.0, 9.0, seg(t, tc, tc + 8 / FPS, "out"))
        _ground_cracks(fr, 0.0, 2.6, rr, "s102", n=14)
        # storefront glass bursting outward, staggered (north side, d = 2.4)
        for i, (x0, x1) in enumerate(STORES):
            bf = pane_burst_f(0.5 * (x0 + x1))
            if bf is None:
                continue
            tb = t - bf / FPS
            if 0 <= tb < 1.3:
                fx.glass_shatter(fr, x0, 0.5, x1, 3.3, tb, n=28, outward=0.5 if x0 > 0 else -0.5,
                                 salt=f"pane{i}", d=STORE_D)
    if landed:
        impact_scaled(fr, 0.0, 0.05, tt * 2.0 + 0.045, "heavy", k=0.4, salt="land")
    # ---- Thragg -------------------------------------------------------------
    if f == fc - 2 or f == fc - 1:
        # two smear drawings: feet-first, arms tight, cape streaming up
        yf = 4.6 if f == fc - 2 else 1.0
        streak(fr, 0.0, yf + 1.6, 12.0, width_m=0.75)
        thragg_front(fr, T_DROP, 0.0, yf + 1.0, lift=1.25, flutter=f, pitch=0.25)
        streak(fr, 0.0, yf + 2.2, 12.0, width_m=0.35, alpha=90)
    elif landed:
        # f16 contact drawing held 1 frame, then the knees fold deep; crouch on 2s
        if f == fc:
            pose, spk = T_CONTACT, 0.92
        else:
            ta = on2(fr) if f > fc + 6 else t
            u = seg(ta, tc + 1 / FPS, tc + 6 / FPS, "out")
            pose, spk = blend(T_CONTACT, T_CROUCH, u), lerp(0.92, 0.8, u)
        # cape: 3-frame overshoot up, hangs, then settles heavily f44-72 (on 2s)
        ta = on2(fr)
        lift = kf(ta, [(tc, 1.0), (tc + 3 / FPS, 1.22, "out"), (F(fr, 44, n0), 0.8, "inout"),
                       (F(fr, 72, n0), 0.0, "inout")])
        thragg_front(fr, pose, 0.0, None, lift=lift, flutter=math.floor(ta * 12), spine_k=spk, pitch=1.0)
    # ---- contact effects ----------------------------------------------------
    if landed:
        if f == fc:
            fr.flash = 0.2                           # small white flash, NO invert
        fx.shockwave(fr, 0.0, 0.02, tt - 1 / FPS, r_max=14.0, dur=1.0, ground=True, width=3)
        fade = 1 - smoothstep(F(fr, 40, n0), F(fr, 62, n0), t)
        if fade > 0:
            fx.dust_cloud(fr, 0.0, 0.1, tt - 1 / FPS, r=5.0, n=24, alpha=int(120 * fade), salt="ring", rise=0.3)
            fx.dust_cloud(fr, 1.5, 0.0, tt - 6 / FPS, r=2.0, n=10, alpha=int(55 * fade), salt="lens", d=0.62,
                          rise=0.2)
        fx.debris(fr, 0.0, 0.25, tt, n=18, speed=7.5, angle=math.pi / 2, spread=math.pi * 0.85,
                  size=(0.04, 0.14), color=PAL["street"], g=9.8, ground=0.0, salt="grit")
        fx.debris(fr, 0.6, 0.2, tt - 1 / FPS, n=6, speed=4.0, angle=math.radians(70), spread=0.9,
                  size=(0.05, 0.12), color=PAL["concrete"], g=9.8, ground=0.0, salt="lensgrit", d=0.7)
    if t >= F(fr, 60, n0):
        # grit patters down in the stillness
        rng = fr.srng("patter")
        for i in range(14):
            ph = rng.random()
            yy = 3.2 - ((t * 1.6 + ph * 3) % 3.2)
            fr.circle(rng.uniform(-1.2, 1.4), yy, 0.012, fill=(150, 140, 130))


# ===========================================================================
# S1-03  MS low angle: he rises, surveys, settles on the lit city
# ===========================================================================

def s1_03(fr):
    t, n0 = fr.t, 70
    T = lambda f: F(fr, f, n0)   # noqa: E731
    ta = on2(fr)
    rise = seg(ta, T(4), T(34), "inout")
    fr.cam = Cam(x=0.4, y=lerp(1.0, 1.6, seg(t, T(4), T(34), "inout")), zoom=280)
    street_stage(fr, extra=("landing_crater",), store="burst")
    # residual dust thinning and drifting east -> west
    drift_dust(fr, -6, 6, 0.0, 1.0, t, n=34, d=1.3, salt="resid", alpha=int(lerp(120, 50, t / fr.dur)))
    fx.dust_cloud(fr, 0.3, 0.05, 2.0 + t, r=4.5, n=16, alpha=int(lerp(32, 10, t / fr.dur)), salt="ring", rise=0.1)
    # the head turn: east (screen-right) -> west, eyes lead by 2 frames; on 2s
    yaw_of = lambda tt: kf(tt, [(T(20), 0.0), (T(34), 0.5), (T(38), 0.5), (T(62), -0.85, "inout")])  # noqa: E731
    yaw = yaw_of(ta)
    gaze_x = clamp(clamp((yaw_of(ta + 2 / FPS) - yaw) * 6.0, -1, 1) + yaw * 0.6, -1, 1)
    pitch = 1.0 - rise
    breath = pulse(t, T(35), 2 / FPS, 6 / FPS)
    chest = 1.0 - 0.14 * seg(ta, T(62), T(69), "inout")
    pose = blend(T_CROUCH, T_UPRIGHT, rise)
    pose["ua_f"] += 6 * (1 - chest) / 0.14                  # far shoulder starts to swing west
    warm = 0.25 + 0.75 * clamp(-yaw)
    J = thragg_front(fr, pose, 0.0, None, lift=0.0, flutter=math.floor(ta * 12), spine_k=lerp(0.8, 1.0, rise),
                     chest_k=chest, yaw=yaw, pitch=pitch, gaze=(gaze_x, 0.15 * clamp(-yaw)), warm=warm,
                     scale=1.0 + 0.008 * breath)
    # grit sliding off the shoulders as he rises
    if T(6) < t < T(34):
        rng = fr.srng("shouldergrit")
        for i in range(16):
            side = J["sh_n"] if i % 2 else J["sh_f"]
            ph = rng.random()
            age = ((t - T(6)) * 1.3 + ph) % 1.0
            gx = side[0] + rng.uniform(-0.12, 0.12) + (0.1 if i % 2 else -0.1) * age
            gy = side[1] + 0.05 - age * age * 1.6
            fr.circle(gx, gy, 0.01 + 0.006 * rng.random(), fill=(140, 128, 118))


# ===========================================================================
# S1-04  MS: Gojo revealed on the mast
# ===========================================================================

G_WEIGHT = P("g_idle", lean=3, th_n=1, sh_n=1, th_f=-12, sh_f=-2)


def _hem(fr, J, t, k=1.0):
    """Jacket hem stirring screen-left in the east wind (on 2s)."""
    px, py = J["pelvis"]
    tq = math.floor(t * 12) / 12.0
    flap = 0.04 + 0.03 * math.sin(tq * 9.0) * k
    fr.poly([(px - 0.12, py + 0.08), (px + 0.12, py + 0.08), (px + 0.1, py - 0.12), (px - 0.14 - flap, py - 0.16),
             (px - 0.2 - flap, py - 0.1)], shade(GOJO.suit, 1.0))


def s1_04(fr):
    t, n0 = fr.t, 44
    T = lambda f: F(fr, f, n0)   # noqa: E731
    ta = on2(fr)
    cy = kf(t, [(0.0, 6.6), (T(26), 8.1, "inout")])
    fr.cam = Cam(x=-6.5, y=cy, zoom=330)
    plate(fr, horizon_v=0.7)
    env.gantry(fr, MAST_X)
    pose = pose_at(ta, [(T(6), "g_idle"), (T(10), G_WEIGHT, "inout")])
    pose = P(pose, neck=kf(ta, [(0.0, -2.0), (T(20), 4.0), (T(28), 10.0, "out")]))
    mouth = "smirk" if ta >= T(34) else "flat"
    J = gojo_at(fr, pose, MAST_X, mouth=mouth)
    _hem(fr, J, t)
    if T(30) <= ta < T(34):
        # the smile forming: one corner first
        hx, hy = J["head"]
        r = GOJO.head_r
        fr.line([(hx + r * 0.62, hy - r * 0.48), (hx + r * 0.82, hy - r * 0.44)], (130, 74, 74), width_m=r * 0.07)
    drift_dust(fr, -9.5, -3.5, 5.6, 9.6, t, n=14, d=1.6, salt="mastdust", alpha=60, size=0.012)


# ===========================================================================
# S1-05  ECU insert: Thragg classifies him
# ===========================================================================

def s1_05(fr):
    t, n0 = fr.t, 26
    T = lambda f: F(fr, f, n0)   # noqa: E731
    # f0-5 lift from the far lights up-left onto the figure; f6-14 one measuring
    # pass down and back up; f15-25 settle and hold (eyes on 1s, head locked)
    gx = kf(t, [(0.0, -0.75), (T(5), -0.5, "out"), (T(10), -0.42), (T(14), -0.5), (T(16), -0.52)])
    gy = kf(t, [(0.0, -0.05), (T(5), 0.85, "out"), (T(10), -0.35, "inout"), (T(14), 0.85, "inout"),
                (T(16), 0.8)])
    lid = 0.35 * pulse(t, cue_t(fr, "breath", 16), 2 / FPS, 8 / FPS)
    thragg_eyes(fr, (gx, gy), "contempt", lid=lid, glint=1.0, t=t)
    fr.vignette = 0.5


# ===========================================================================
# S1-06  POV: the Six Eyes read through the blindfold
# ===========================================================================

def _pov_proj(push, roll):
    """Pinhole camera at Gojo's eyes on the west mast looking down ~46 deg at
    Thragg (cheated north-east so screen-x still reads west -> east and
    Thragg sits right of centre). World (x east, y up, z north).
    Returns f(x, y, z) -> (u, v) in 0..1."""
    E = (-7.0, 8.2, -5.0)
    T = (-2.4, 1.0, 1.6)
    fx_, fy_, fz_ = T[0] - E[0], T[1] - E[1], T[2] - E[2]
    L = math.sqrt(fx_ * fx_ + fy_ * fy_ + fz_ * fz_)
    fwd = (fx_ / L, fy_ / L, fz_ / L)
    rl = math.hypot(fwd[2], fwd[0])
    right = (fwd[2] / rl, 0.0, -fwd[0] / rl)            # up x fwd
    up = (fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2],
          fwd[0] * right[1] - fwd[1] * right[0])        # fwd x right
    if up[1] < 0:
        up = (-up[0], -up[1], -up[2])
    foc = 2.5 * push
    ca, sa = math.cos(math.radians(roll)), math.sin(math.radians(roll))

    def f(x, y, z):
        dx, dy, dz = x - E[0], y - E[1], z - E[2]
        zc = max(0.2, dx * fwd[0] + dy * fwd[1] + dz * fwd[2])
        xc = dx * right[0] + dy * right[1] + dz * right[2]
        yc = dx * up[0] + dy * up[1] + dz * up[2]
        sx, sy = foc * xc / zc, foc * yc / zc
        sx, sy = sx * ca - sy * sa, sx * sa + sy * ca
        return (0.5 + sx * 0.5 * 1080 / 1920, 0.5 - sy * 0.5)
    return f


def s1_06(fr):
    t, n0 = fr.t, 26
    T = lambda f: F(fr, f, n0)   # noqa: E731
    push = lerp(1.0, 1.08, seg(t, T(14), T(25), "inout"))
    roll = 3.0 * seg(t, T(14), T(25), "inout")
    proj = _pov_proj(push, roll)
    W, H = fr.W, fr.H
    fr.draw.rectangle([0, 0, W, H], fill=(6, 10, 30))
    reveal = smoothstep(T(3), T(13), t)
    img, dr = fr.layer()

    def S(p):
        return (p[0] * W, p[1] * H)

    def pl(pts, col, a, w=1.5):
        dr.line([S(proj(*p)) for p in pts], fill=col + (int(a * reveal),), width=max(1, int(w * fr.ss)), joint="curve")

    flow = (t * 0.6) % 1.0
    # residual-energy currents tracing the street: lane lines, kerbs, crosswalks
    for z in (-6, -3.5, 3.5, 6, 9.5):
        pl([(x, 0, z) for x in range(-24, 25, 2)], (70, 140, 220), 130, 1.4)
    for x0 in (-9.0, 9.0):
        for k in range(7):
            xx = x0 - 3 + k
            pl([(xx, 0, -6), (xx, 0, 6)], (80, 150, 230), 110, 1.4)
    # crater rim + cracks as contour rings
    for rr, a in ((2.0, 170), (2.6, 110), (3.4, 70)):
        pl([(math.cos(q) * rr, 0, math.sin(q) * rr) for q in [i * math.tau / 40 for i in range(41)]],
           (110, 180, 255), a, 1.6)
    rng = random.Random("povcracks")
    for k in range(12):
        a = rng.uniform(0, math.tau)
        L = rng.uniform(4, 8)
        pl([(math.cos(a) * r, 0, math.sin(a) * r) for r in (2.0, L * 0.5, L)], (90, 150, 230), 80, 1.0)
    # the north storefronts traced as outlines (burst glass)
    for (x0, x1) in STORES:
        if -14 < x0 < 16:
            pl([(x0, 0.3, 10), (x0, 4.4, 10), (x1, 4.4, 10), (x1, 0.3, 10), (x0, 0.3, 10)], (80, 140, 220), 110, 1.3)
            pl([(x0 + 0.3, 3.4, 10), (x1 - 0.3, 3.4, 10)], (80, 140, 220), 70, 1.0)
    # Thragg's silhouette position in this projection
    foot = proj(0.0, 0.0, 0.0)
    head = proj(0.0, 2.0, 0.0)
    tu, tv = foot[0], 0.5 * (foot[1] + head[1])
    hgt = abs(foot[1] - head[1])
    hb = pulse(t, cue_t(fr, "heartbeat", 8), 2 / FPS, 10 / FPS)
    # currents crowding and bending around his outline like water round a boulder
    for i in range(34):
        v0 = (i + 0.5) / 34
        pts = []
        for j in range(61):
            u = j / 60
            du, dv = (u - tu) * 1920 / 1080, v0 - tv
            rx, ry = 0.11 * (1 + 0.12 * hb), hgt * 0.6 * (1 + 0.1 * hb)
            a_ = abs(dv) / ry
            env_ = math.exp(-0.5 * (du / rx) ** 2)
            push_v = (1 if dv >= 0 else -1) * ry * env_ * 1.05 / (a_ + 1.05) * (1 + 0.15 * hb)
            wav = 0.004 * math.sin(u * 14 + i + t * 3)
            pts.append(((u + 0.0) * W, (v0 + push_v + wav) * H))
        dense = math.exp(-((v0 - tv) / (hgt * 0.9)) ** 2)
        col = mix_color((50, 100, 190), (150, 210, 255), dense)
        dr.line(pts, fill=col + (int((60 + 110 * dense) * reveal),), width=max(1, int((1 + 1.2 * dense) * fr.ss)),
                joint="curve")
        # moving flow dashes (currents drift east -> west)
        for k in range(4):
            jj = int(((k / 4 + flow + i * 0.13) % 1.0) * 59)
            dr.line([pts[60 - jj], pts[max(0, 60 - jj - 1)]], fill=(200, 235, 255, int(150 * reveal)),
                    width=max(1, int(2.5 * fr.ss)))
    fr.merge(img)
    # the dense mass itself: map the engine camera so x = 0 sits at his feet
    # in this projection and y 0..2 spans feet..head (rolled with the view)
    p0 = _pov_proj(push, 0.0)
    f0, h0 = p0(0.0, 0.0, 0.0), p0(0.0, 2.0, 0.0)
    Z = abs(f0[1] - h0[1]) * 1080 / 2.0
    fr.cam = Cam(x=(960 - f0[0] * 1920) / Z, y=(f0[1] * 1080 - 540) / Z, zoom=Z, rot=roll)
    # civilian-level haze on the skin: faint, thin, flickering on 2s
    fl = random.Random(f"haze{fr.f // 2}").uniform(0.45, 1.0)
    for k, (off, a) in enumerate(((0.05, 26), (0.025, 40))):
        img, dr = fr.layer()
        J0 = solve(THRAGG, T_UPRIGHT, 0.0, None, -1, 1.0 + off * 4, "front")
        for key in ("head", "chest", "pelvis", "kn_n", "kn_f", "el_n", "el_f"):
            X, Y = fr.P(*J0[key])
            R = fr.S(0.24 + off * 2)
            dr.ellipse([X - R, Y - R * 1.3, X + R, Y + R * 1.3], fill=(120, 170, 230, int(a * fl * reveal)))
        fr.merge(img)
    draw_fighter(fr, THRAGG, T_UPRIGHT, 0.0, None, -1, view="front", opts={"cape": None},
                 silhouette=(3, 4, 12))
    fr.cam = Cam()
    # blindfold weave dissolving f0-3
    weave = 1 - smoothstep(0.0, T(4), t)
    if weave > 0:
        img, dr = fr.layer()
        dr.rectangle([0, 0, W, H], fill=(4, 4, 8, int(235 * weave)))
        step = int(18 * fr.ss)
        for x in range(0, W, step):
            dr.line([(x, 0), (x, H)], fill=(30, 30, 40, int(200 * weave)), width=max(1, int(5 * fr.ss)))
        for y in range(0, H, step):
            dr.line([(0, y), (W, y)], fill=(22, 22, 30, int(200 * weave)), width=max(1, int(4 * fr.ss)))
        fr.merge(img)
    fr.vignette = 0.75


# ===========================================================================
# S1-07  MCU: one bare eye
# ===========================================================================

def s1_07(fr):
    t, n0 = fr.t, 40
    T = lambda f: F(fr, f, n0)   # noqa: E731
    ta = on2(fr)
    plate(fr, horizon_v=0.68, blur=6.0, near=True)
    s = lerp(0.98, 1.06, t / fr.dur)                       # very slow push-in (zoom 600 -> 680)
    smile = kf(ta, [(0.0, 1.0), (T(5), 0.15, "inout"), (T(36), 0.15), (T(39), 1.35, "out")])
    brow = kf(ta, [(T(6), 0.0), (T(9), 1.0, "out"), (T(27), 1.0), (T(30), 0.4), (T(36), 0.0)])
    hand = kf(ta, [(T(9), 0.0), (T(14), 1.0, "out"), (T(30), 1.0), (T(36), 0.0, "in")])
    hook = kf(ta, [(T(12), 0.0), (T(15), 1.0, "out"), (T(28), 1.0), (T(31), 0.0)])
    lift = kf(ta, [(T(14), 0.0), (T(19), 1.0, "out"), (T(27), 1.0), (T(30), 0.0, "in")])
    glint = pulse(t, T(22), 1 / FPS, 4 / FPS)
    gojo_mcu(fr, cu=0.42, cv=0.6, s=s, smile=smile, brow=brow, lift=lift, hand=hand, hook=hook, glint=glint)


# ===========================================================================
# S1-08  CU low angle: "You stand in my way."
# ===========================================================================

def _jaw(t, t0, length, words=5):
    """Jaw opening for a slow, formal line: one open-close per word, held on 2s."""
    if not (t0 <= t < t0 + length):
        return 0.0
    u = (t - t0) / length * words
    k = u - math.floor(u)
    w = math.floor(u)
    amp = (0.7, 0.9, 0.5, 0.65, 1.0)[int(w) % 5]
    return amp * max(0.0, math.sin(min(1.0, k / 0.8) * math.pi))


def _cape_edge(fr, t, side=1):
    """Crimson cape edge behind the shoulder in a close shot, stirring on 2s."""
    tq = math.floor(t * 12) / 12.0
    fl = 0.02 * math.sin(tq * 8)
    u0 = 0.86 if side > 0 else 0.14
    fr.s_poly([(u0 - 0.1 * side, 1.0), (u0 - 0.02 * side, 0.74 + fl), (u0 + 0.1 * side, 0.7 - fl),
               (u0 + 0.2 * side, 0.78 + fl), (u0 + 0.22 * side, 1.0)], shade(THRAGG.accent, 0.72))


def s1_08(fr):
    t, n0 = fr.t, 52
    T = lambda f: F(fr, f, n0)   # noqa: E731
    # low camera looking north past him: the dark north block and its burst
    # shop windows, softened by the long lens
    soft_street(fr, Cam(x=0.6, y=3.4, zoom=150), blur=7.0)
    _cape_edge(fr, t, side=1)
    t0, ln = dlg_t(fr, 4, 46)
    tq = on2(fr)
    jaw = _jaw(tq, t0, ln - T(2))
    # eyes on Gojo (up-left); on "way" (f40-44) they flick to the city lights and back
    gx = kf(t, [(T(39), -0.55), (T(41), -1.0, "out"), (T(43), -1.0), (T(45), -0.55, "out")])
    gy = kf(t, [(T(39), 0.6), (T(41), -0.1, "out"), (T(43), -0.1), (T(45), 0.6, "out")])
    _cu_dust(fr, t)
    thragg_cu(fr, cu=0.55, cv=0.6, s=1.05, gaze=(gx, gy), jaw=jaw, rot=-4.0)
    fr.vignette = 0.5


def _cu_dust(fr, t):
    """Dust drifting east -> west along the bottom of a close shot (screen space)."""
    rng = fr.srng("cudust")
    img, dr = fr.layer()
    for i in range(40):
        sp = rng.uniform(0.05, 0.14)
        u = 1.05 - ((rng.random() + t * sp) % 1.1)
        v = rng.uniform(0.82, 1.0) + 0.01 * math.sin(t * 2 + i)
        r = rng.uniform(1.5, 4.5) * fr.ss
        c = PAL["dust"]
        dr.ellipse([u * fr.W - r * 2, v * fr.H - r, u * fr.W + r * 2, v * fr.H + r], fill=c + (int(rng.uniform(40, 110)),))
    fr.merge(img)


# ===========================================================================
# S1-09  MWS low angle: "You should've picked an easier planet." + the step
# ===========================================================================

G_STEP_LIFT = P("g_idle", lean=4, th_n=34, sh_n=6, th_f=-8, sh_f=-10)
G_STEP_PLANT = P("g_idle", lean=3, th_n=16, sh_n=12, th_f=-16, sh_f=-26)
G_STEP_FOLLOW = P("g_idle", lean=2, th_n=6, sh_n=4, th_f=14, sh_f=-14)


def _lowangle_frame(fr, k=1.0, lit=1.0):
    """Keystoned building edges at the frame corners: the camera is at the foot
    of the mast looking up ~35 degrees."""
    col = shade((18, 18, 26), lit)
    win = shade((34, 32, 44), lit)
    cx, cy = 0.5, 0.5

    def sc(u, v):
        return (cx + (u - cx) * k, cy + (v - cy) * k)
    left = [sc(-0.1, 1.2), sc(-0.1, 0.35), sc(0.07, 0.42), sc(0.13, 1.2)]
    right = [sc(1.1, 1.2), sc(1.1, 0.28), sc(0.9, 0.36), sc(0.84, 1.2)]
    fr.s_poly(left, col)
    fr.s_poly(right, col)
    for j in range(8):
        v = 0.48 + j * 0.09
        ul = 0.07 + (v - 0.42) * 0.075
        fr.s_line([sc(0.0, v), sc(ul - 0.01, v + 0.01)], win, width=3)
        ur = 0.9 - (v - 0.36) * 0.075
        fr.s_line([sc(1.0, v - 0.02), sc(ur + 0.01, v - 0.01)], win, width=3)
    # warm rim on the west-facing edge of the right-hand building
    fr.s_line([sc(0.9, 0.36), sc(0.84, 1.2)], shade((150, 90, 60), lit), width=3)


def s1_09(fr):
    t, n0 = fr.t, 78
    T = lambda f: F(fr, f, n0)   # noqa: E731
    ta = on2(fr)
    z = lerp(170.0, 205.0, t / fr.dur)                     # slow, constant push
    fr.cam = Cam(x=-6.2, y=6.55, zoom=z)
    plate(fr, horizon_v=1.12, near=False)
    _lowangle_frame(fr, k=z / 170.0)
    # the mast seen from its foot: the pole flares toward the lens
    env.gantry(fr, MAST_X)
    pb = fr.P(MAST_X, fr.cam.y - 540 / z - 0.5)
    pt = fr.P(MAST_X, MAST_TOP)
    wb, wt = fr.S(0.42), fr.S(0.11)
    fr.draw.polygon([(pb[0] - wb, pb[1]), (pb[0] + wb, pb[1]), (pt[0] + wt, pt[1]), (pt[0] - wt, pt[1])],
                    fill=(52, 56, 64))
    fr.draw.line([(pb[0] - wb * 0.5, pb[1]), (pt[0] - wt * 0.5, pt[1])], fill=(150, 100, 70),
                 width=max(1, int(2 * fr.ss)))
    # the step: weight shift f54, right foot lifts f56, plants f61, left follows f62-66
    t_plant = cue_t(fr, "footstep", 61)
    t54, t56, t66 = t_plant - 7 / FPS, t_plant - 5 / FPS, t_plant + 5 / FPS
    x = kf(ta, [(t54, MAST_X), (t_plant, MAST_X + 0.62, "inout"), (t66, MAST_X + 1.0, "inout")])
    ground = kf(ta, [(t56, CAP_GROUND), (t_plant, ARM_GROUND, "in")])
    pose = pose_at(ta, [(0.0, "g_idle"), (t54, P("g_idle", lean=-2)), (t56, G_STEP_LIFT, "out"),
                        (t_plant, G_STEP_PLANT, "in"), (t_plant + 2 / FPS, G_STEP_FOLLOW), (t66, "g_idle", "inout")])
    # line f4-58: light and amused, small head tilt on "easier" (word 5)
    t0, ln = dlg_t(fr, 4, 54)
    tilt = 6 * pulse(ta, t0 + ln * 0.62, 4 / FPS, 10 / FPS)
    pose = P(pose, neck=pose["neck"] + 6 + tilt)
    talking = t0 <= ta < t0 + ln and int(ta * 12) % 3 != 0
    J = gojo_at(fr, pose, x, ground=ground, mouth="flat" if talking else "smirk")
    _hem(fr, J, t, k=1.0 + 0.6 * smoothstep(T(58), T(62), t))
    drift_dust(fr, -11, -1, 4.0, 9.0, t, n=16, d=1.5, salt="lowdust", alpha=50, size=0.012)


# ===========================================================================
# S1-10  WS two-shot: silence, then the launch
# ===========================================================================

T_LOOKUP = P("t_stand", neck=-24, ua_n=10, fa_n=6, ua_f=-8, fa_f=-4)
T_COIL = P("t_stand", lean=30, neck=-36, ua_n=-34, fa_n=12, ua_f=-52, fa_f=4, th_n=62, sh_n=-40, th_f=30,
           sh_f=-72)
T_LAUNCH = P("t_stand", lean=42, neck=-26, ua_n=58, fa_n=84, ua_f=-58, fa_f=34, th_n=-24, sh_n=-46,
             th_f=-44, sh_f=-74)


def _sonic_ring(fr, x, y, t, ux, uy, r_max=3.2, dur=0.3):
    """Boom ring seen edge-on: an ellipse perpendicular to the flight line,
    expanding through the dust (plus the refraction warp of fx.shockwave)."""
    u = clamp(t / dur)
    if u >= 1:
        return
    R = r_max * EASE["out"](u)
    a = 1 - u
    nx, ny = -uy, ux
    pts = []
    for i in range(40):
        q = i * math.tau / 40
        o, w = math.cos(q) * R, math.sin(q) * R * 0.28
        pts.append(fr.P(x + nx * o + ux * w, y + ny * o + uy * w))
    img, dr = fr.layer()
    dr.line(pts + pts[:1], fill=(238, 240, 248, int(220 * a)), width=max(1, int(4 * fr.ss)), joint="curve")
    dr.line(pts + pts[:1], fill=(200, 210, 230, int(90 * a)), width=max(1, int(10 * fr.ss)), joint="curve")
    fr.merge(img)
    px, py = fr.P(x, y)
    fr.post.append(("ring", px / fr.ss, py / fr.ss, fr.S(R) / fr.ss, 0.5 * a, t))


def s1_10(fr):
    t, n0 = fr.t, 42
    T = lambda f: F(fr, f, n0)   # noqa: E731
    t_launch = cue_t(fr, "accel_burst", 39)
    t_boom = cue_t(fr, "sonic_boom", 40)
    f_l = int(round(t_launch * FPS))
    f = fr.f
    sh = C.shake(t, t_boom, amp=8.0, dur=2 / FPS + 1e-3)
    z = lerp(105.0, 118.0, seg(t, 0.0, T(37), "linear"))
    fr.cam = Cam(x=-3.0, y=4.2, zoom=z, shake=sh)
    street_stage(fr, extra=("landing_crater",), store="burst")
    tq = on2(fr)
    drift_dust(fr, -12, 8, 0.0, 1.6, t, n=40, d=1.2, salt="s110", alpha=80)
    # Gojo: perfectly still on the arm, hands in pockets
    J_g = gojo_at(fr, P("g_idle", neck=8), MAST_X + 1.0, ground=ARM_GROUND)
    _hem(fr, J_g, t, k=0.6)
    # Thragg
    o_wind = (0.6, -0.15 + 0.1 * math.sin(tq * 5))
    if f < f_l - 1:
        thragg_side(fr, T_LOOKUP, 0.0, cape_wind=o_wind)
    elif f == f_l - 1:
        # ONE compressed anticipation drawing: knees and shoulders drop, cape lifts
        thragg_side(fr, T_COIL, 0.0, cape_wind=(0.8, 1.6))
        _ground_cracks(fr, 0.0, 0.3, 2.2, "floor", n=10, width=0.035)
    else:
        k = f - f_l                                        # 0, 1, 2 frames into the launch
        lead = [(-1.2, 2.2), (-1.35, 2.35), (-1.5, 2.5)][min(2, k)]
        ux, uy = -0.67, 0.74                              # launch line toward Gojo's head (~48 deg)
        bx, by = lead[0] - ux * 0.9, lead[1] - uy * 1.35  # pelvis behind the leading edge
        _ground_cracks(fr, 0.0, 0.3, 2.6, "floor", n=12, width=0.04)
        # smear: a torn-air ribbon from the crater floor up the launch line to
        # his heels, white with the cape's crimson streaked through it
        root = (0.2, 0.3)
        heel = (bx + 0.35, by - 0.55)
        fx.trail(fr, [root, (lerp(root[0], heel[0], 0.5) + 0.1, lerp(root[1], heel[1], 0.5)), heel],
                 color=(246, 240, 238), width_m=1.0, alpha=150)
        fx.trail(fr, [(root[0] + 0.15, root[1]), (lerp(root[0], heel[0], 0.5) + 0.2, lerp(root[1], heel[1], 0.5)),
                      (heel[0] + 0.1, heel[1] + 0.1)], color=(200, 40, 48), width_m=0.4, alpha=140)
        J = thragg_side(fr, T_LAUNCH, bx, by, cape_wind=(0.95, -0.7))
        # vapour cone peeling off the shoulders
        cx_, cy_ = J["chest"]
        fx.sonic_boom(fr, cx_ + ux * 0.5, cy_ + uy * 0.5, (k + 1) / FPS, ux, uy, size=0.36)
        # asphalt fan from the crater's east lip, dust jets thrown east
        tl = t - t_launch
        fx.debris(fr, 1.6, 0.15, tl + 1.5 / FPS, n=22, speed=15, angle=math.radians(58), spread=math.radians(48),
                  size=(0.12, 0.42), color=PAL["street"], salt="fan")
        fx.debris(fr, 2.4, 0.1, tl + 1.0 / FPS, n=8, speed=10, angle=math.radians(40), spread=0.5,
                  size=(0.3, 0.6), color=shade(PAL["street"], 1.1), salt="slabs")
        fx.dust_cloud(fr, 2.2, 0.2, tl * 3 + 0.15, r=2.6, n=14, alpha=110, salt="jets", rise=0.8)
        if t >= t_boom:
            # the sonic crack: ring-shaped shock front through the dust
            ts = t - t_boom + 1 / FPS
            _sonic_ring(fr, -0.45, 1.2, ts, ux, uy)
            fx.shockwave(fr, -0.3, 0.05, ts, r_max=7.0, dur=0.35, ground=True, width=4)


SHOTS = {
    "S1-01": s1_01,
    "S1-02": s1_02,
    "S1-03": s1_03,
    "S1-04": s1_04,
    "S1-05": s1_05,
    "S1-06": s1_06,
    "S1-07": s1_07,
    "S1-08": s1_08,
    "S1-09": s1_09,
    "S1-10": s1_10,
}
