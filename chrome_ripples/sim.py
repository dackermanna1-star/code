"""
Deterministic choreography / physics for the "Chrome Ripples" animation.

Pure numpy, no Blender dependency, so it can be run and tuned standalone:

    python3 sim.py            # prints timing / event statistics

Model
-----
* A liquid-metal surface whose height is a superposition of analytic,
  damped radial wave trains ("ripple events").  Each event is created by
  a sphere touching the surface and also carries a local dimple that the
  sphere presses into the liquid.
* Spheres are point-like rigid bodies with three states:
    FLOAT  - resting on the liquid, bobbing with the waves
    FLIGHT - ballistic arc (gravity only)
    CONTACT- pressing into the surface (sinusoidal dip), then bounce
* A floating sphere is kicked into the air when a strong enough wave
  front reaches it, which produces the chain reaction.
* Physics runs in "sim time"; a smooth time-remap (rate < 1) turns it into
  slow motion, with an extra slow-down around the hero impact.

The exact same wave formula is rebuilt as a Geometry Nodes tree in
build_scene.py, so the rendered surface and the floating spheres agree.
"""

import math
import numpy as np

# --------------------------------------------------------------------------
# Global parameters
# --------------------------------------------------------------------------
FPS = 30
DURATION = 60.0                    # seconds of final video
N_FRAMES = int(FPS * DURATION)

G = 9.81                           # gravity (m/s^2, sim time)
WAVE_C = 1.75                      # wave front speed (m/s, sim time)
WAVE_DECAY = 5.0                   # global temporal decay (s)
SPREAD_R0 = 0.6                    # geometric spreading length (m)
TRAIN_CYCLES = 2.6                 # length of wave train behind front, in wavelengths
REBOUND_T = 0.22                   # central rebound bump duration (s)
REBOUND_K = 0.35                   # central rebound bump relative height
HALF_SIZE = 20.0                   # half extent of the detailed liquid grid (m)
EDGE_TAPER = 6.0                   # waves fade to zero over this border width
EVENT_LIFETIME = 7.5               # ripples fade out completely after this (s)

DT = 0.002                         # integration step (sim seconds)
T_FINALE = 12.75                   # hero's last gentle hop (sim seconds)
FINALE_VZ = 3.6

# Sphere behaviour
FLOAT_OFFSET = 0.12                # resting centre height above surface, x radius
FLOAT_SETTLE = 0.18                # time constant for sinking into float pose
HOME_SPRING = 1.4                  # time constant for drifting back home (s)
LAUNCH_GAIN = 165.0                # launch speed per metre of local wave amplitude
LAUNCH_VMAX = 4.6
LAUNCH_THRESH = 0.0035             # minimum local amplitude to launch (m)
RADIAL_KICK = 0.10                 # horizontal kick relative to vertical speed
REFRACTORY = 0.55                  # min float time before a sphere can relaunch
REST_SPEED = 0.95                  # below this impact speed the sphere settles
MAX_LAUNCHES = 2                   # how often a sphere can be re-launched by waves
AMP_K = 0.030                      # ripple amplitude = AMP_K * r * v^0.85
DIP_MAX = 0.42                     # max dip depth, x radius


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# --------------------------------------------------------------------------
# Time remap (real seconds  <->  sim seconds)
# --------------------------------------------------------------------------
HERO_DROP_Z = 14.0
HERO_R = 0.62
T_HERO_IMPACT = math.sqrt(2.0 * (HERO_DROP_Z - HERO_R) / G)


def rate_of_sim(ts):
    """Playback rate (sim seconds per real second) as a function of sim time."""
    ts = np.asarray(ts, dtype=float)
    base = 0.31
    # dramatic slow-down around the hero impact
    dip = 0.20 * np.exp(-((ts - (T_HERO_IMPACT + 0.05)) / 0.26) ** 2)
    # let the finale breathe a little slower
    tail = 0.06 * smoothstep(14.0, 17.5, ts)
    return base - dip - tail


def build_time_map():
    """Return sim time for every frame (frame 1 .. N_FRAMES)."""
    # integrate d(real)/d(sim) = 1/rate on a fine sim grid, then invert
    ts = np.arange(0.0, 40.0, 0.0005)
    dreal = 1.0 / rate_of_sim(ts)
    real = np.concatenate([[0.0], np.cumsum(0.5 * (dreal[1:] + dreal[:-1]) * 0.0005)])
    frame_real = (np.arange(N_FRAMES)) / FPS
    return np.interp(frame_real, real, ts)


# --------------------------------------------------------------------------
# Ripple events and the surface height function
# --------------------------------------------------------------------------
class Events:
    def __init__(self):
        self.x, self.y, self.t0, self.A, self.D = [], [], [], [], []
        self.W, self.Tc, self.lam = [], [], []

    def add(self, x, y, t0, A, D, W, Tc, lam):
        self.x.append(x); self.y.append(y); self.t0.append(t0)
        self.A.append(A); self.D.append(D); self.W.append(W)
        self.Tc.append(Tc); self.lam.append(lam)

    def arrays(self):
        return {k: np.asarray(getattr(self, k), dtype=float)
                for k in ("x", "y", "t0", "A", "D", "W", "Tc", "lam")}

    def __len__(self):
        return len(self.t0)


def event_height(ev, idx, px, py, t):
    """Surface height contribution of events `idx` at points (px, py).

    px, py: arrays of shape (P,);  returns (P,)
    This is mirrored node-for-node in the Geometry Nodes tree.
    """
    if len(idx) == 0:
        return np.zeros_like(px)
    ex = ev["x"][idx][None, :]; ey = ev["y"][idx][None, :]
    tau = t - ev["t0"][idx][None, :]
    A = ev["A"][idx][None, :]; D = ev["D"][idx][None, :]
    W = ev["W"][idx][None, :]; Tc = ev["Tc"][idx][None, :]
    lam = ev["lam"][idx][None, :]

    r = np.hypot(px[:, None] - ex, py[:, None] - ey)
    active = tau > 0.0
    tau = np.maximum(tau, 0.0)

    # travelling wave train behind the front
    xb = WAVE_C * tau - r                     # distance behind the front
    L = TRAIN_CYCLES * lam
    k = 2.0 * np.pi / lam
    env = smoothstep(0.0, 0.35 * lam, xb) * (1.0 - smoothstep(0.35 * L, L, xb))
    spread = 1.0 / np.sqrt(1.0 + r / SPREAD_R0)
    decay = np.exp(-tau / WAVE_DECAY)
    wave = A * env * np.sin(k * xb) * spread * decay

    # local dimple pressed by the sphere, then a small rebound bump
    g = np.exp(-(r / W) ** 2)
    s1 = np.clip(tau / Tc, 0.0, 1.0)
    press = -D * np.sin(np.pi * s1)
    s2 = np.clip((tau - Tc) / REBOUND_T, 0.0, 1.0)
    rebound = REBOUND_K * D * np.sin(np.pi * s2)
    fade = 1.0 - smoothstep(0.6 * EVENT_LIFETIME, EVENT_LIFETIME, tau)
    h = (wave + (press + rebound) * g) * active * fade
    return h.sum(axis=1)


def edge_taper(px, py):
    m = np.maximum(np.abs(px), np.abs(py))
    return 1.0 - smoothstep(HALF_SIZE - EDGE_TAPER, HALF_SIZE - 0.5, m)


def surface_height(ev, px, py, t):
    t0 = ev["t0"]
    idx = np.nonzero((t0 <= t) & (t0 > t - EVENT_LIFETIME))[0]
    return event_height(ev, idx, px, py, t) * edge_taper(px, py)


# --------------------------------------------------------------------------
# Spheres
# --------------------------------------------------------------------------
FLOAT, FLIGHT, CONTACT = 0, 1, 2

# (ring radius, count, sphere radius, angular phase, material key)
RINGS = [
    (2.7, 6, 0.36, 0.0, "gold"),
    (4.6, 12, 0.30, 0.5, "chrome"),
    (6.6, 18, 0.255, 0.0, "titanium"),
    (8.7, 24, 0.215, 0.5, "chrome"),
    (10.9, 30, 0.185, 0.0, "gold"),
]


def make_spheres():
    spheres = [dict(name="Hero", r=HERO_R, home=(0.0, 0.0), mat="hero", ring=0)]
    for ri, (R, n, rad, ph, mat) in enumerate(RINGS):
        for j in range(n):
            a = 2.0 * math.pi * (j + ph) / n + 0.15 * ri
            spheres.append(dict(name=f"Sphere_r{ri+1}_{j:02d}", r=rad,
                                home=(R * math.cos(a), R * math.sin(a)),
                                mat=mat, ring=ri + 1))
    return spheres


def energy(ts):
    """Chain reaction gain envelope: full power, then gently winds down."""
    return 1.0 - 0.75 * smoothstep(9.5, 14.5, ts)


def simulate(verbose=False):
    spheres = make_spheres()
    nb = len(spheres)
    r = np.array([s["r"] for s in spheres])
    home = np.array([s["home"] for s in spheres])

    pos = np.zeros((nb, 3)); pos[:, :2] = home
    pos[:, 2] = FLOAT_OFFSET * r
    vel = np.zeros((nb, 3))
    state = np.full(nb, FLOAT)
    pos[0, 2] = HERO_DROP_Z; state[0] = FLIGHT
    float_since = np.full(nb, -10.0)
    float_off0 = np.zeros(nb)              # extra height when entering FLOAT
    c_start = np.zeros(nb); c_D = np.zeros(nb); c_Tc = np.ones(nb)
    c_vin = np.zeros(nb); c_z0 = np.zeros(nb)
    last_src = np.full(nb, -1)             # last event that launched this sphere
    n_launch = np.zeros(nb, dtype=int)

    ev = Events()
    ev_owner = []
    launches = 0

    t_end = build_time_map()[-1] + 0.05
    n_steps = int(t_end / DT) + 2
    rec_mode = np.zeros((n_steps, nb), dtype=np.int8)
    rec_pos = np.zeros((n_steps, nb, 3), dtype=np.float32)
    rec_fs = np.zeros((n_steps, nb), dtype=np.float32)
    rec_off = np.zeros((n_steps, nb), dtype=np.float32)

    for step in range(n_steps):
        t = step * DT
        evA = ev.arrays() if len(ev) else None

        # ---- wave-front launches of floating spheres --------------------
        if evA is not None:
            fl = np.nonzero((state == FLOAT) & (t - float_since > REFRACTORY)
                            & (n_launch < MAX_LAUNCHES))[0]
            if len(fl):
                dx = pos[fl, 0][:, None] - evA["x"][None, :]
                dy = pos[fl, 1][:, None] - evA["y"][None, :]
                d = np.hypot(dx, dy)
                t_arr = evA["t0"][None, :] + d / WAVE_C + 0.06
                hit = (t_arr > t - DT) & (t_arr <= t)
                own = np.asarray(ev_owner)[None, :] == fl[:, None]
                hit &= ~own
                if hit.any():
                    tau = t_arr - evA["t0"][None, :]
                    a = (evA["A"][None, :] / np.sqrt(1.0 + d / SPREAD_R0)
                         * np.exp(-tau / WAVE_DECAY))
                    a = np.where(hit, a, 0.0)
                    best = a.argmax(axis=1)
                    amax = a[np.arange(len(fl)), best]
                    for bi, e, am in zip(fl, best, amax):
                        if am < LAUNCH_THRESH:
                            continue
                        vz = min(LAUNCH_VMAX, LAUNCH_GAIN * am * energy(t))
                        vz *= (0.36 / r[bi]) ** 0.25
                        if vz < 0.9:
                            continue
                        dirv = pos[bi, :2] - np.array([evA["x"][e], evA["y"][e]])
                        n = np.linalg.norm(dirv)
                        dirv = dirv / n if n > 1e-6 else np.zeros(2)
                        vel[bi, :2] = dirv * RADIAL_KICK * vz
                        vel[bi, 2] = vz
                        h = surface_height(evA, pos[bi:bi+1, 0], pos[bi:bi+1, 1], t)[0]
                        pos[bi, 2] = h + FLOAT_OFFSET * r[bi]
                        state[bi] = FLIGHT
                        last_src[bi] = e
                        n_launch[bi] += 1
                        launches += 1

        # ---- scripted finale: one last hop of the hero ----------------
        if T_FINALE - DT < t <= T_FINALE and state[0] == FLOAT:
            state[0] = FLIGHT
            vel[0] = (0.0, 0.0, FINALE_VZ)
            pos[0, :2] = home[0]

        # ---- flight ------------------------------------------------------
        fly = np.nonzero(state == FLIGHT)[0]
        if len(fly):
            vel[fly, 2] -= G * DT
            pos[fly] += vel[fly] * DT
            if evA is not None:
                hs = surface_height(evA, pos[fly, 0], pos[fly, 1], t)
            else:
                hs = np.zeros(len(fly))
            touch = (pos[fly, 2] - r[fly] <= hs) & (vel[fly, 2] < 0)
            for bi, h in zip(fly[touch], hs[touch]):
                v = -vel[bi, 2]
                D = r[bi] * min(DIP_MAX, 0.055 * v)
                Tc = max(0.035, math.pi * D / v)
                A = AMP_K * r[bi] * v ** 0.85
                lam = 0.45 + 0.75 * r[bi]
                ev.add(pos[bi, 0], pos[bi, 1], t, A, D, 1.15 * r[bi], Tc, lam)
                ev_owner.append(bi)
                state[bi] = CONTACT
                c_start[bi] = t; c_D[bi] = D; c_Tc[bi] = Tc; c_vin[bi] = v
                c_z0[bi] = r[bi]
                vel[bi, :2] *= 0.4

        # ---- contact -----------------------------------------------------
        con = np.nonzero(state == CONTACT)[0]
        for bi in con:
            s = (t - c_start[bi]) / c_Tc[bi]
            if s < 1.0:
                pos[bi, 2] = c_z0[bi] - c_D[bi] * math.sin(math.pi * s)
                pos[bi, :2] += vel[bi, :2] * DT
            else:
                e = 0.62 if bi == 0 else 0.46
                vout = e * c_vin[bi]
                pos[bi, 2] = c_z0[bi]
                if vout > REST_SPEED:
                    state[bi] = FLIGHT
                    vel[bi, 2] = vout
                else:
                    state[bi] = FLOAT
                    float_since[bi] = t
                    float_off0[bi] = c_z0[bi] - FLOAT_OFFSET * r[bi]
                    vel[bi] = 0.0

        # ---- floating: drift home ---------------------------------------
        fl_all = state == FLOAT
        pos[fl_all, :2] += (home[fl_all] - pos[fl_all, :2]) * (DT / HOME_SPRING)

        rec_mode[step] = state
        rec_pos[step] = pos
        rec_fs[step] = float_since
        rec_off[step] = float_off0

    evA = ev.arrays()
    if verbose:
        print(f"hero impact at sim t={T_HERO_IMPACT:.3f}s, events={len(ev)}, "
              f"launches={launches}, sim length={t_end:.2f}s")
    return dict(spheres=spheres, events=evA, rec_mode=rec_mode, rec_pos=rec_pos,
                rec_fs=rec_fs, rec_off=rec_off, r=r)


def sample_frames(sim, frame_ts):
    """Sphere positions (F, B, 3) at each frame's sim time."""
    ev = sim["events"]; r = sim["r"]
    out = np.zeros((len(frame_ts), len(r), 3))
    for fi, t in enumerate(frame_ts):
        step = min(int(round(t / DT)), len(sim["rec_mode"]) - 1)
        mode = sim["rec_mode"][step]
        p = sim["rec_pos"][step].astype(float).copy()
        fl = mode == FLOAT
        if fl.any():
            h = surface_height(ev, p[fl, 0], p[fl, 1], t)
            age = t - sim["rec_fs"][step][fl]
            settle = sim["rec_off"][step][fl] * np.exp(-np.maximum(age, 0) / FLOAT_SETTLE)
            p[fl, 2] = h + FLOAT_OFFSET * r[fl] + settle
        out[fi] = p
    return out


def frame_event_windows(ev, frame_ts):
    """For each frame: (first active event index, active count) with events
    sorted by t0.  Lets the node tree only loop over live ripples."""
    t0 = ev["t0"]
    start = np.searchsorted(t0, frame_ts - EVENT_LIFETIME, side="right")
    end = np.searchsorted(t0, frame_ts, side="right")
    return start, end - start


if __name__ == "__main__":
    ts = build_time_map()
    print(f"frames={N_FRAMES}, sim time span {ts[0]:.2f}..{ts[-1]:.2f}s")
    real_imp = np.interp(T_HERO_IMPACT, ts, np.arange(N_FRAMES) / FPS)
    print(f"hero impact at real t={real_imp:.2f}s (frame {real_imp*FPS+1:.0f})")
    sim = simulate(verbose=True)
    ev = sim["events"]
    assert np.all(np.diff(ev["t0"]) >= 0)
    st, cnt = frame_event_windows(ev, ts)
    print(f"max active events per frame: {cnt.max()}, mean {cnt.mean():.1f}")
    # event timeline histogram in real seconds
    real_of_event = np.interp(ev["t0"], ts, np.arange(N_FRAMES) / FPS)
    hist, _ = np.histogram(real_of_event, bins=12, range=(0, 60))
    print("impacts per 5s of video:", hist.tolist())
    print("A range: %.4f .. %.4f" % (ev["A"].min(), ev["A"].max()))
