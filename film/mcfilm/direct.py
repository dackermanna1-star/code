"""Direction layer: timeline/shots, actors on paths, walk cycles, cameras, lighting presets, weather."""
import json
import math
import os
import numpy as np
import bpy
from mathutils import Vector

from . import blcore as bc
from .noise import value2

FPS = bc.FPS
SUN_SCALE = float(os.environ.get("MC_SUN", "0.6"))


# ====================================================================== maths helpers
def lerp(a, b, u):
    if isinstance(a, (tuple, list)):
        return tuple(x + (y - x) * u for x, y in zip(a, b))
    return a + (b - a) * u


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(u):
    u = clamp(u)
    return u * u * (3 - 2 * u)


def ease_io(u, p=2.0):
    u = clamp(u)
    return u ** p / (u ** p + (1 - u) ** p)


def seg(t, t0, t1):
    """0..1 progress of t inside [t0, t1]."""
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return clamp((t - t0) / (t1 - t0))


def keys(t, pts, fn=ease):
    """Piecewise interpolation through [(t, value), ...] with easing between keys."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (ta, va), (tb, vb) in zip(pts, pts[1:]):
        if t <= tb:
            return lerp(va, vb, fn(seg(t, ta, tb)))
    return pts[-1][1]


def shake(t, amp, freq=1.3, seed=0):
    return (amp * (value2(t * freq, 0.5, seed) - 0.5) * 2, amp * (value2(t * freq, 7.5, seed + 1) - 0.5) * 2,
            amp * 0.6 * (value2(t * freq, 3.5, seed + 2) - 0.5) * 2)


# ====================================================================== paths
class Path:
    """Arc-length parametrised Catmull-Rom path over (x, y) waypoints with ground following."""

    def __init__(self, pts, world=None, ceiling=None, z=None, samples=12):
        P = np.array(pts, float)
        if len(P) == 2:
            P = np.array([P[0], (P[0] + P[1]) / 2, P[1]])
        Q = []
        Pe = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
        for i in range(1, len(Pe) - 2):
            p0, p1, p2, p3 = Pe[i - 1], Pe[i], Pe[i + 1], Pe[i + 2]
            for k in range(samples):
                s = k / samples
                Q.append(0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s
                                + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3))
        Q.append(P[-1])
        self.Q = np.array(Q)
        d = np.linalg.norm(np.diff(self.Q, axis=0), axis=1)
        self.S = np.concatenate([[0], np.cumsum(d)])
        self.length = self.S[-1]
        self.world = world
        self.ceiling = ceiling
        self.zfixed = z

    def at(self, s):
        s = clamp(s, 0, self.length)
        x = np.interp(s, self.S, self.Q[:, 0])
        y = np.interp(s, self.S, self.Q[:, 1])
        return x, y

    def heading(self, s, look=0.6):
        x0, y0 = self.at(s - look)
        x1, y1 = self.at(s + look)
        return math.atan2(x1 - x0, -(y1 - y0))

    def ground(self, x, y, r=0.28):
        if self.zfixed is not None:
            return self.zfixed
        if self.world is None:
            return 0.0
        zs = [self.world.top_z(x + dx, y + dy, below=self.ceiling) for dx in (-r, r) for dy in (-r, r)]
        return float(max(zs))


def yaw_to(src, dst):
    return math.atan2(dst[0] - src[0], -(dst[1] - src[1]))


# ====================================================================== gaits
GAITS = {
    #        stride(m)  leg amp  arm amp  bob   lean
    "walk": (1.7, 32.0, 26.0, 0.035, 2.0),
    "tired": (1.4, 20.0, 12.0, 0.03, 9.0),
    "sneak": (1.0, 22.0, 15.0, 0.02, 12.0),
    "run": (2.6, 58.0, 55.0, 0.07, 10.0),
    "trudge": (1.2, 24.0, 10.0, 0.025, 14.0),
}


def gait_pose(dist, gait="walk", amt=1.0):
    stride, la, aa, bob, lean = GAITS[gait]
    ph = dist / stride * 2 * math.pi
    s = math.sin(ph)
    return {"leg_r": la * s * amt, "leg_l": -la * s * amt, "arm_r": -aa * s * amt, "arm_l": aa * s * amt,
            "bob": abs(math.cos(ph)) * bob * amt, "lean": lean * amt}, ph


class Mover:
    """Moves a rig along a path with a speed profile; emits footsteps; handles step-ups with hops."""

    def __init__(self, rig, path, speed_keys, gait="walk", surface="grass", t0=0.0, name="steve",
                 hop_height=0.45):
        self.rig, self.path, self.gait, self.surface, self.name = rig, path, gait, surface, name
        self.speed_keys = speed_keys  # [(t, speed m/s), ...] in shot-local seconds
        self.hop_height = hop_height
        self._cache = None
        self.t0 = t0

    def _build(self, t_end, dt=1.0 / FPS):
        n = int(math.ceil(t_end / dt)) + 2
        dist = np.zeros(n)
        z = np.zeros(n)
        s = 0.0
        zc = None
        vz = 0.0
        for i in range(n):
            t = i * dt
            v = keys(t, self.speed_keys, fn=lambda u: u) if len(self.speed_keys) > 1 else self.speed_keys[0][1]
            if i > 0:
                s = min(self.path.length, s + v * dt)
            dist[i] = s
            x, y = self.path.at(s)
            g = self.path.ground(x, y)
            if zc is None:
                zc = g
            if g > zc + 0.05:
                zc = min(g, zc + 0.22)  # quick step-up (auto-jump)
                vz = 0
            elif g < zc - 0.05:
                vz -= 22 * dt
                zc = max(g, zc + vz * dt)
            else:
                zc, vz = g, 0
            z[i] = zc
        self._cache = (dist, z)

    def state(self, t, t_end=None):
        if self._cache is None or (t_end and len(self._cache[0]) < t_end * FPS):
            self._build(max(t_end or 0, 60))
        dist, z = self._cache
        i = int(round(t * FPS))
        i = max(0, min(len(dist) - 1, i))
        s = dist[i]
        x, y = self.path.at(s)
        # hop: if ground rose within next frames add a little arc
        hop = 0.0
        j0, j1 = max(0, i - 4), min(len(z) - 1, i + 4)
        if z[j1] - z[j0] > 0.5:
            u = (i - j0) / max(1, (j1 - j0))
            hop = math.sin(math.pi * u) * self.hop_height
        yaw = self.path.heading(s)
        moving = (dist[min(i + 1, len(dist) - 1)] - dist[i]) > 1e-4
        return (x, y, z[i] + hop), yaw, s, moving


# ====================================================================== lighting presets
LIGHT = {
    "sunrise": dict(sun_el=4, sun_az=0, sun_energy=2.2, sun_rgb=(1.0, 0.62, 0.36),
                    zenith=(0.22, 0.32, 0.62), horizon=(1.0, 0.62, 0.42), ground=(0.35, 0.28, 0.3),
                    fog_color=(0.95, 0.68, 0.52), fog_density=0.0032, fog_start=40, sky_strength=0.9,
                    sun_glow=1.4, sun_color=(1.0, 0.55, 0.3), star_amount=0.0, emit_strength=0.6,
                    fog_hamt=0.6, fog_h0=34, fog_hfall=0.06, exposure=0.0),
    "morning": dict(sun_el=18, sun_az=10, sun_energy=3.0, sun_rgb=(1.0, 0.85, 0.65),
                    zenith=(0.2, 0.4, 0.85), horizon=(0.78, 0.8, 0.88), ground=(0.35, 0.33, 0.3),
                    fog_color=(0.78, 0.8, 0.88), fog_density=0.0028, fog_start=50, sky_strength=0.9,
                    sun_glow=0.6, sun_color=(1.0, 0.8, 0.55), star_amount=0.0, emit_strength=0.5,
                    fog_hamt=0.4, fog_h0=36, fog_hfall=0.05, exposure=0.0),
    "day": dict(sun_el=52, sun_az=35, sun_energy=3.6, sun_rgb=(1.0, 0.95, 0.88),
                zenith=(0.16, 0.36, 0.85), horizon=(0.62, 0.75, 0.95), ground=(0.35, 0.35, 0.35),
                fog_color=(0.65, 0.77, 0.95), fog_density=0.0022, fog_start=60, sky_strength=1.0,
                sun_glow=0.3, sun_color=(1.0, 0.95, 0.8), star_amount=0.0, emit_strength=0.5,
                fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=0.0),
    "afternoon": dict(sun_el=28, sun_az=200, sun_energy=3.2, sun_rgb=(1.0, 0.85, 0.65),
                      zenith=(0.2, 0.38, 0.8), horizon=(0.85, 0.78, 0.7), ground=(0.35, 0.32, 0.3),
                      fog_color=(0.85, 0.78, 0.7), fog_density=0.0026, fog_start=60, sky_strength=0.95,
                      sun_glow=0.5, sun_color=(1.0, 0.8, 0.5), star_amount=0.0, emit_strength=0.5,
                      fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=0.0),
    "dusk": dict(sun_el=3, sun_az=190, sun_energy=2.0, sun_rgb=(1.0, 0.45, 0.22),
                 zenith=(0.16, 0.12, 0.32), horizon=(0.95, 0.42, 0.25), ground=(0.2, 0.14, 0.16),
                 fog_color=(0.62, 0.34, 0.32), fog_density=0.0045, fog_start=40, sky_strength=0.8,
                 sun_glow=1.6, sun_color=(1.0, 0.4, 0.15), star_amount=0.1, emit_strength=0.6,
                 fog_hamt=0.3, fog_h0=36, fog_hfall=0.05, exposure=0.0),
    "night": dict(sun_el=40, sun_az=150, sun_energy=0.9, sun_rgb=(0.5, 0.62, 1.0),
                  zenith=(0.01, 0.015, 0.05), horizon=(0.04, 0.06, 0.14), ground=(0.01, 0.01, 0.02),
                  fog_color=(0.035, 0.05, 0.1), fog_density=0.03, fog_start=6, sky_strength=1.0,
                  sun_glow=0.06, sun_color=(0.6, 0.7, 1.0), star_amount=0.9, emit_strength=1.2,
                  fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=1.3, moon=True, ambient=0.9),
    "storm": dict(sun_el=50, sun_az=150, sun_energy=0.3, sun_rgb=(0.55, 0.6, 0.8),
                  zenith=(0.03, 0.035, 0.05), horizon=(0.07, 0.08, 0.1), ground=(0.02, 0.02, 0.02),
                  fog_color=(0.06, 0.07, 0.09), fog_density=0.045, fog_start=4, sky_strength=1.0,
                  sun_glow=0.0, sun_color=(0.5, 0.5, 0.6), star_amount=0.0, emit_strength=1.2,
                  fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=1.3, moon=False, ambient=0.9),
    "cave": dict(sun_el=60, sun_az=0, sun_energy=0.0, sun_rgb=(0.5, 0.5, 0.5),
                 zenith=(0.0, 0.0, 0.0), horizon=(0.0, 0.0, 0.0), ground=(0.0, 0.0, 0.0),
                 fog_color=(0.006, 0.006, 0.01), fog_density=0.07, fog_start=3, sky_strength=0.0,
                 sun_glow=0.0, sun_color=(0, 0, 0), star_amount=0.0, emit_strength=2.6,
                 fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=0.4, moon=False),
    "dawn_exit": dict(sun_el=10, sun_az=0, sun_energy=3.2, sun_rgb=(1.0, 0.78, 0.55),
                      zenith=(0.25, 0.42, 0.8), horizon=(0.98, 0.82, 0.62), ground=(0.35, 0.3, 0.3),
                      fog_color=(0.95, 0.82, 0.66), fog_density=0.0035, fog_start=40, sky_strength=1.0,
                      sun_glow=1.2, sun_color=(1.0, 0.7, 0.4), star_amount=0.0, emit_strength=0.4,
                      fog_hamt=0.5, fog_h0=40, fog_hfall=0.04, exposure=0.0),
    "blizzard": dict(sun_el=35, sun_az=60, sun_energy=0.9, sun_rgb=(0.85, 0.9, 1.0),
                     zenith=(0.62, 0.66, 0.72), horizon=(0.78, 0.8, 0.84), ground=(0.75, 0.77, 0.8),
                     fog_color=(0.78, 0.8, 0.84), fog_density=0.045, fog_start=4, sky_strength=1.1,
                     sun_glow=0.0, sun_color=(1, 1, 1), star_amount=0.0, emit_strength=0.3,
                     fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=-0.2),
    "desert": dict(sun_el=70, sun_az=100, sun_energy=5.0, sun_rgb=(1.0, 0.93, 0.8),
                   zenith=(0.22, 0.42, 0.82), horizon=(0.95, 0.86, 0.68), ground=(0.6, 0.5, 0.35),
                   fog_color=(0.95, 0.86, 0.68), fog_density=0.004, fog_start=30, sky_strength=1.2,
                   sun_glow=0.6, sun_color=(1.0, 0.95, 0.8), star_amount=0.0, emit_strength=0.3,
                   fog_hamt=0.5, fog_h0=40, fog_hfall=0.08, exposure=-0.15),
    "jungle": dict(sun_el=55, sun_az=80, sun_energy=3.0, sun_rgb=(0.95, 1.0, 0.8),
                   zenith=(0.2, 0.45, 0.6), horizon=(0.55, 0.7, 0.55), ground=(0.2, 0.3, 0.2),
                   fog_color=(0.4, 0.55, 0.38), fog_density=0.018, fog_start=8, sky_strength=0.9,
                   sun_glow=0.4, sun_color=(0.9, 1.0, 0.7), star_amount=0.0, emit_strength=0.3,
                   fog_hamt=0.0, fog_h0=60, fog_hfall=0.0, exposure=0.15),
    "desolate": dict(sun_el=14, sun_az=170, sun_energy=1.4, sun_rgb=(0.95, 0.88, 0.8),
                     zenith=(0.32, 0.34, 0.38), horizon=(0.6, 0.58, 0.56), ground=(0.3, 0.3, 0.3),
                     fog_color=(0.6, 0.58, 0.56), fog_density=0.0045, fog_start=25, sky_strength=0.85,
                     sun_glow=0.5, sun_color=(1.0, 0.85, 0.7), star_amount=0.0, emit_strength=0.3,
                     fog_hamt=0.5, fog_h0=36, fog_hfall=0.06, exposure=0.0),
    "broken": dict(sun_el=8, sun_az=200, sun_energy=1.5, sun_rgb=(1.0, 0.55, 0.45),
                   zenith=(0.07, 0.05, 0.12), horizon=(0.42, 0.26, 0.32), ground=(0.12, 0.1, 0.12),
                   fog_color=(0.36, 0.25, 0.32), fog_density=0.009, fog_start=20, sky_strength=0.85,
                   sun_glow=0.9, sun_color=(1.0, 0.45, 0.35), star_amount=0.05, emit_strength=0.5,
                   fog_hamt=0.85, fog_h0=34, fog_hfall=0.09, exposure=0.1),
    "farlands": dict(sun_el=7, sun_az=170, sun_energy=2.6, sun_rgb=(1.0, 0.6, 0.42),
                     zenith=(0.08, 0.07, 0.18), horizon=(0.75, 0.45, 0.42), ground=(0.15, 0.12, 0.15),
                     fog_color=(0.48, 0.34, 0.42), fog_density=0.0055, fog_start=40, sky_strength=0.9,
                     sun_glow=1.3, sun_color=(1.0, 0.5, 0.35), star_amount=0.08, emit_strength=0.5,
                     fog_hamt=0.9, fog_h0=46, fog_hfall=0.02, exposure=0.1),
}


def mix_light(a, b, u):
    A, Bp = (LIGHT[a] if isinstance(a, str) else a), (LIGHT[b] if isinstance(b, str) else b)
    out = {}
    for k, v in A.items():
        w = Bp.get(k, v)
        if isinstance(v, bool) or k == "moon":
            out[k] = v if u < 0.5 else w
        elif k == "sun_az":
            d = (w - v + 180) % 360 - 180
            out[k] = v + d * u
        else:
            out[k] = lerp(v, w, u)
    return out


# ====================================================================== director
class Director:
    def __init__(self, seq_name, shots, world=None):
        """shots: list of (shot_id, start_frame, end_frame, fn) - fn(ctx) called for each frame."""
        self.seq = seq_name
        self.shots = shots
        self.world = world
        self.rigs = []
        self.events = []
        self.scn = bpy.context.scene
        self.cam = self._camera()
        self.sun = bc.make_sun_lamp()
        self.sunobj = bc.celestial("SunDisc", (1, 1, 0.8), size=110, kind="sun")
        self.moonobj = bc.celestial("MoonDisc", (0.9, 0.9, 1), size=80, kind="moon")
        self.weather = {}
        self.extra = []  # callbacks per frame (ctx)
        self.cam_light = None

    def _camera(self):
        cd = bpy.data.cameras.new("Cam")
        cd.clip_start = 0.1
        cd.clip_end = 4000
        cd.sensor_width = 36
        cam = bpy.data.objects.new("Cam", cd)
        cam.rotation_mode = "XYZ"
        bc.link(cam)
        self.scn.camera = cam
        return cam

    def add_rig(self, rig):
        self.rigs.append(rig)
        return rig

    def event(self, t_global, kind, **kw):
        self.events.append(dict(t=round(t_global, 3), kind=kind, seq=self.seq, **kw))

    def run(self):
        A = bc.ANIM
        f_first = min(s[1] for s in self.shots)
        f_last = max(s[2] for s in self.shots)
        for sid, f0, f1, fn in self.shots:
            for f in range(f0, f1 + 1):
                A.frame = f
                ctx = Ctx(self, sid, f0, f1, f)
                fn(ctx)
                for r in self.rigs:
                    if r not in ctx.posed:
                        r.pose((0, 0, -500), 0, {}, visible=False)
                for cb in self.extra:
                    cb(ctx)
                if not ctx.lit:
                    ctx.light("day")
                if not ctx.cammed:
                    ctx.camera((0, -10, 5), (0, 0, 0))
                ctx.place_celestial()
                for name, wobj in self.weather.items():
                    wobj.update(ctx, ctx.weather_amt.get(name, 0.0))
        A.flush()
        self.scn.frame_start = f_first
        self.scn.frame_end = f_last
        return f_first, f_last

    def save_events(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            json.dump(self.events, fh, indent=0)


class Ctx:
    def __init__(self, d, sid, f0, f1, f):
        self.d, self.sid, self.f0, self.f1, self.f = d, sid, f0, f1, f
        self.t = (f - f0) / FPS
        self.dur = (f1 - f0 + 1) / FPS
        self.u = (f - f0) / max(1, (f1 - f0))
        self.tg = (f - 1) / FPS  # global film time
        self.posed = set()
        self.lit = False
        self.cammed = False
        self.weather_amt = {}
        self.first = f == f0

    # --------------------------------------------------------------- events
    def event(self, kind, dt=0.0, **kw):
        if self.f == self.f0 or True:
            self.d.event(self.tg + dt, kind, shot=self.sid, **kw)

    def once(self, t_at, kind, **kw):
        """Emit an event when local time crosses t_at."""
        if self.t <= t_at < self.t + 1.0 / FPS:
            self.d.event(self.tg + (t_at - self.t), kind, shot=self.sid, **kw)
            return True
        return False

    # --------------------------------------------------------------- actors
    def pose(self, rig, loc, yaw, p=None):
        rig.pose(loc, yaw, p or {})
        self.posed.add(rig)

    def walk(self, rig, mover, extra=None, gait=None, look=None, t=None, surface=None, step_vol=1.0):
        t = self.t if t is None else t
        loc, yaw, s, moving = mover.state(t, t_end=self.dur + 2)
        g = gait or mover.gait
        p, ph = gait_pose(s, g, 1.0 if moving else 0.0)
        if moving:
            loc_prev, _, s_prev, _ = mover.state(t - 1.0 / FPS)
            _, ph_prev = gait_pose(s_prev, g)
            if math.floor(ph / math.pi) != math.floor(ph_prev / math.pi):
                self.d.event(self.tg, "step", surface=surface or mover.surface, who=mover.name,
                             vol=step_vol, gait=g, shot=self.sid)
        if extra:
            p.update(extra)
        self.pose(rig, loc, yaw, p)
        return loc, yaw, s

    # --------------------------------------------------------------- camera
    def camera(self, loc, target, lens=35.0, roll=0.0, shake_amp=0.0, shake_freq=1.2, focus=None, fstop=None):
        A = bc.ANIM
        loc = Vector(loc)
        target = Vector(target)
        if shake_amp:
            sx, sy, sz = shake(self.tg, shake_amp, shake_freq, seed=self.f0)
            off = Vector((sx, sy, sz))
            loc = loc + off
            target = target + off * 0.3
        loc = self._unblock(loc, target)
        cam = self.d.cam
        A.set(cam, "location", loc)
        A.set(cam, "rotation_euler", bc.look_rot(loc, target, roll))
        A.set(cam.data, "lens", lens)
        if focus is not None and fstop:
            cam.data.dof.use_dof = True
            A.set(cam.data, "dof.focus_distance", focus)
            A.set(cam.data, "dof.aperture_fstop", fstop)
        else:
            A.set(cam.data, "dof.aperture_fstop", 64.0)
            A.set(cam.data, "dof.focus_distance", 10.0)
        self.cam_loc = loc
        self.cammed = True

    def _unblock(self, loc, target):
        """If the camera sits inside an opaque block, slide it toward the target until it is free."""
        w = self.d.world
        if w is None:
            return loc
        from .voxel import OPAQUE

        def blocked(p):
            for dx in (-0.15, 0.15):
                for dy in (-0.15, 0.15):
                    for dz in (-0.12, 0.12):
                        x, y, z = int(math.floor(p.x + dx)), int(math.floor(p.y + dy)), int(math.floor(p.z + dz))
                        if w.inb(x, y, z) and OPAQUE[w.b[x, y, z]]:
                            return True
            return False
        if not blocked(loc):
            return loc
        d = target - loc
        L = d.length
        d.normalize()
        k = 0.2
        while k < L - 0.8:
            p = loc + d * k
            if not blocked(p):
                return p + d * 0.15
            k += 0.2
        return loc

    # --------------------------------------------------------------- lighting
    def light(self, preset, **over):
        L = dict(LIGHT[preset]) if isinstance(preset, str) else dict(preset)
        L.update(over)
        A = bc.ANIM
        el, az = math.radians(L["sun_el"]), math.radians(L["sun_az"])
        dvec = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        sun = self.d.sun
        A.set(sun, "rotation_euler", dvec.to_track_quat("Z", "Y").to_euler())
        flash = L.get("flash", 0.0)
        A.set(sun.data, "energy", (L["sun_energy"] * SUN_SCALE + flash * 6.0))
        A.set(sun.data, "color", lerp(L["sun_rgb"], (0.85, 0.9, 1.0), clamp(flash)))
        env = {k: L.get(k, v[1]) for k, v in bc.ENV_DEFAULTS.items()}
        moon = L.get("moon", False)
        celestial_dir = -dvec if moon else dvec
        env["sun_x"], env["sun_y"], env["sun_z"] = tuple(dvec)
        env["flash"] = flash * 0.25
        bc.env_set(**env)
        self._celestial = (dvec, moon, L["sun_energy"] > 0.5 and not moon)
        A.set(self.d.scn, "view_settings.exposure", L.get("exposure", 0.0) + L.get("fade", 0.0))
        self.lit = True
        return L

    def place_celestial(self):
        A = bc.ANIM
        dvec, moon, show_sun = self._celestial
        cam_loc = self.cam_loc
        for obj, show in ((self.d.sunobj, show_sun), (self.d.moonobj, moon)):
            pos = cam_loc + dvec * 1800
            A.set(obj, "location", pos if show else (0, 0, -9000))
            A.set(obj, "rotation_euler", (-dvec).to_track_quat("Z", "Y").to_euler())

    def weather(self, name, amount):
        self.weather_amt[name] = amount


# ====================================================================== weather systems
class Precip:
    """Rain / snow / dust volume that follows the camera; particles wrap vertically."""

    def __init__(self, kind="rain", count=5000, box=(36, 36, 24), speed=18.0, drift=(0, 0), seed=0):
        rng = np.random.default_rng(seed)
        self.kind, self.box, self.speed, self.drift = kind, box, speed, drift
        bx, by, bz = box
        P = rng.uniform((-bx / 2, -by / 2, 0), (bx / 2, by / 2, bz), size=(count, 3))
        V = []
        if kind == "rain":
            for p in P:
                a = rng.uniform(0, math.pi)
                dx, dy = math.cos(a) * 0.012, math.sin(a) * 0.012
                V += [(p[0] - dx, p[1] - dy, p[2]), (p[0] + dx, p[1] + dy, p[2]),
                      (p[0] + dx, p[1] + dy, p[2] + 0.7), (p[0] - dx, p[1] - dy, p[2] + 0.7)]
            mat = bc.flat_material("RainMat", (0.6, 0.65, 0.75), emission=0.6, alpha=0.35, fog=False)
        else:
            s = 0.05 if kind == "snow" else 0.022
            for p in P:
                for c in bc.box_mesh_data(-s, -s, -s, s, s, s):
                    V.append(tuple(p + c))
            if kind == "snow":
                mat = bc.flat_material("SnowMat", (1, 1, 1), emission=0.9, alpha=0.9, fog=True)
            else:
                mat = bc.flat_material("DustMat", (1.0, 0.75, 0.6), emission=0.7, alpha=0.5, fog=True)
        self.objs = []
        for k in range(2):
            o = bc.quads_mesh(f"{kind}_{k}", np.array(V), mat=mat)
            o.visible_shadow = False
            self.objs.append(o)

    def update(self, ctx, amount):
        A = bc.ANIM
        cam = getattr(ctx, "cam_loc", Vector((0, 0, 0)))
        bx, by, bz = self.box
        t = ctx.tg
        off = (t * self.speed) % bz
        dx, dy = self.drift
        for k, o in enumerate(self.objs):
            if amount <= 0:
                A.set(o, "location", (0, 0, -5000))
                A.set(o, "scale", (1e-3,) * 3)
                continue
            z = cam.z - bz * 0.5 - off + k * bz
            ddx = ((t * dx) % bx) - bx / 2 if dx else 0
            ddy = ((t * dy) % by) - by / 2 if dy else 0
            A.set(o, "location", (cam.x + ddx * 0.0 + (t * dx % 6) - 3 if dx else cam.x,
                                  cam.y + (t * dy % 6) - 3 if dy else cam.y, z))
            A.set(o, "scale", (1.0, 1.0, 1.0) if amount >= 0.5 else (1.0, 1.0, 1.0))
