"""Reference scene (not part of the film): how to stage Infinity stopping a
blow. Copy the patterns, not the numbers.

  python3 -c "import scenes._example as e; e.preview()"   # writes /tmp/example_*.png
"""
import math

from engine import Cam, kf, pulse, clamp, EASE, Frame
import env
import fx
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos


def first_punch(fr):
    t, dur = fr.t, fr.dur
    # --- timing (seconds) ---------------------------------------------
    t_launch = 0.25          # Thragg leaves frame-left
    t_reach = 0.42           # fist enters Infinity's outer zone
    # --- camera: medium two-shot, slight push-in, NO shake (nothing was hit)
    fr.cam = Cam(x=kf(t, [(0, 1.2), (dur, 1.5)]), y=1.55, zoom=kf(t, [(0, 230), (dur, 260)]))
    env.city_street(fr, fr.gf / 24, env.STATE[2], gantry_on=False)

    # --- Gojo: does not move at all (that's the point) ------------------
    gx = 2.6
    G = draw_fighter(fr, GOJO, P("g_idle"), gx, None, -1, opts={"eyes": "blindfold"})
    face = (G["head"][0] - 0.12, G["head"][1] - 0.02)

    # --- Thragg: crosses the gap, the fist decelerates and never arrives --
    if t < t_launch:
        tx = -3.0
        pose = P("t_punch_wind")
    elif t < t_reach:
        u = (t - t_launch) / (t_reach - t_launch)
        tx = -3.0 + (gx - 1.55 + 3.0) * EASE["snap"](u)
        pose = pose_at(u, [(0, "t_punch_wind"), (1, "t_punch", "snap")])
    else:
        # inside Infinity: remaining distance halves again and again (Zeno)
        rem0 = 0.55
        rem = fx.zeno(rem0, t - t_reach, rate=5.0)
        tx = gx - 1.55 - (rem - 0.04)
        # his body keeps driving but the arm compresses: elbow bends a little
        pose = P("t_punch", fa_n=91 - 10 * clamp((t - t_reach) * 3), lean=24 + 4 * clamp((t - t_reach) * 3))
    J = draw_fighter(fr, THRAGG, pose, tx, None, 1, opts={"cape": "full"})
    if t_launch <= t < t_reach + 0.05:
        fx.trail(fr, [(tx - 3.0 + k * 0.5, 1.25) for k in range(7)], width_m=0.9)
        fx.sonic_boom(fr, -2.6, 1.2, t - t_launch, 1, 0, size=1.4)

    # --- Infinity cues: refraction + suspended dust in the gap ----------
    if t >= t_reach - 0.03:
        k = clamp((t - t_reach + 0.03) / 0.1)
        hx, hy = hand_pos(J)
        fx.infinity(fr, face[0], face[1], r=0.85, strength=0.4 + 0.6 * k, t=t)
        fx.suspended_dust(fr, hx + 0.03, hy - 0.12, face[0] - 0.05, hy + 0.12, n=50, t=t)
        fx.impact(fr, hx + 0.05, hy, t - t_reach, kind="blocked", dirx=1, diry=0)
        # the air shoved ahead of the fist flows AROUND Gojo and hits the street behind him
        fx.dust_cloud(fr, gx + 1.2, 0.05, t - t_reach, r=2.0, salt="behind")


SHOT = dict(id="EX-01", seq=2, start_frame=600, frames=48)


def preview():
    for f in (0, 8, 11, 20, 47):
        fr = Frame(SHOT, f, ss=1.5)
        first_punch(fr)
        fr.finish().save(f"/tmp/example_{f:02d}.png")
