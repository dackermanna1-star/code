"""Effects library. Each signature technique has its own visual grammar
(see docs/09-vfx-bible.md):

INFINITY  - never a glowing shield. Refraction ripple (screen-space lens warp)
            + particles/fists that SLOW progressively as they approach and
            never arrive (Zeno). Strength rises only when something is
            approaching.
BLUE      - attraction toward a point: dark lensing ring + bright core;
            streaks flow INWARD and accelerate as they near the core; small
            particles move first, heavy debris later (see `pull`).
RED       - repulsion: a tight crimson point that jitters, then a hard
            DIRECTIONAL release - cone of light + pressure ring + blown debris.
PURPLE    - blue and red orbs converge and fuse into a large layered sphere
            with a dark "hollow" inner shell; travels on a clear trajectory
            and leaves an erased channel with clean edges.
DOMAIN    - a boundless starfield/void with converging light rings and
            streaming information particles; see domain_void().
Physical impacts are tiered so a jab never looks like a city-scale hit:
  impact(kind='light' | 'heavy' | 'massive' | 'blocked')
"""
from __future__ import annotations

import math
import random

from engine import PAL, clamp, mix_color, shade, smoothstep, pulse, EASE


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def zeno(dist0: float, t: float, rate: float = 3.0) -> float:
    """Distance remaining for something entering Infinity: halves and halves
    again - it approaches but never arrives."""
    return dist0 * math.exp(-rate * max(0.0, t))


def pull(p0, center, t, t_start=0.0, mass=1.0, strength=1.0):
    """Position of an object being dragged by Blue. Heavier objects start
    later and accelerate slower. Returns (x, y, progress 0..1)."""
    tt = max(0.0, t - t_start - 0.12 * mass)
    u = clamp((tt * strength / (0.55 + 0.35 * mass)) ** 2)
    x = p0[0] + (center[0] - p0[0]) * u
    y = p0[1] + (center[1] - p0[1]) * u
    return x, y, u


def ballistic(p0, v0, t, g=9.8 * 0.6, drag=0.0):
    if drag:
        k = (1 - math.exp(-drag * t)) / drag
        return (p0[0] + v0[0] * k, p0[1] + v0[1] * k - 0.5 * g * t * t)
    return (p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t)


# --------------------------------------------------------------------------
# INFINITY
# --------------------------------------------------------------------------

def infinity(fr, x, y, r=0.9, strength=0.5, t=0.0, d=None):
    """Spatial refraction around Gojo. strength 0 = invisible; ~0.4 at rest
    when something is near; 1 at the moment an attack is being stopped."""
    if strength <= 0.01:
        return
    px, py = fr.P(x, y, d)
    R = fr.S(r, d) / fr.ss
    fr.post.append(("lens", px / fr.ss, py / fr.ss, R, 0.10 * strength, t))
    # faint concentric refraction lines (like heat over glass), not a bubble
    img, dr = fr.layer()
    for k in range(3):
        rr = fr.S(r * (0.55 + 0.17 * k + 0.03 * math.sin(t * 3 + k)), d)
        a = int(28 * strength * (1 - k * 0.25))
        for seg in range(10):
            a0 = seg * 36 + t * 40 * (1 if k % 2 else -1)
            dr.arc([px - rr, py - rr, px + rr, py + rr], a0, a0 + 18, fill=(200, 230, 255, a),
                   width=max(1, int(1.4 * fr.ss)))
    fr.merge(img)


def suspended_dust(fr, x0, y0, x1, y1, n=40, t=0.0, salt="dust", color=None, size=0.012, d=None):
    """Particles hanging nearly motionless in a gap (e.g. between a fist and
    Gojo's face). They jitter microscopically - time is not stopped, they
    just never get closer."""
    rng = fr.srng(salt)
    col = color or PAL["dust"]
    for i in range(n):
        u, v = rng.random(), rng.random()
        jx = math.sin(t * 2 + i) * 0.002
        jy = math.cos(t * 1.7 + i * 1.3) * 0.002
        px = x0 + (x1 - x0) * u + jx
        py = y0 + (y1 - y0) * v + jy
        fr.circle(px, py, size * rng.uniform(0.4, 1.4), fill=shade(col, rng.uniform(0.7, 1.3)), d=d)


def zeno_particles(fr, cx, cy, r_out, r_in, t, n=60, salt="zp", d=None, color=None):
    """Particles flying toward (cx,cy) from r_out that decelerate and pile up
    at r_in - never touching. Use while an attack is being stopped."""
    rng = fr.srng(salt)
    col = color or (220, 220, 230)
    for i in range(n):
        a = rng.uniform(-math.pi, math.pi)
        t0 = rng.uniform(-0.6, 0.6)
        tt = max(0.0, t - t0)
        rr = r_in + (r_out - r_in) * math.exp(-4.0 * tt)
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        fr.circle(x, y, 0.008 + 0.006 * rng.random(), fill=col, d=d)


# --------------------------------------------------------------------------
# BLUE
# --------------------------------------------------------------------------

def blue(fr, x, y, t, r=0.5, strength=1.0, streaks=70, salt="blue", d=None):
    """Attraction point. r = visible core radius (m). Streaks flow inward."""
    if strength <= 0:
        return
    rng = fr.srng(salt)
    R = r * (1 + 0.06 * math.sin(t * 30))
    # inward streaks (accelerating toward the core)
    for i in range(streaks):
        a = rng.uniform(0, math.tau)
        phase = (t * (0.9 + rng.random()) + rng.random()) % 1.0
        dist = R * (1.4 + 7 * (1 - phase) ** 2)
        L = R * (0.4 + 2.2 * phase)
        p0 = (x + math.cos(a) * dist, y + math.sin(a) * dist)
        p1 = (x + math.cos(a) * max(R * 1.05, dist - L), y + math.sin(a) * max(R * 1.05, dist - L))
        c = mix_color((40, 80, 160), PAL["blue"], phase)
        fr.glow_line([p0, p1], shade(c, 0.6 * strength), width_px=2 + 3 * phase, d=d)
    # gravitational lensing: dark ring + bright Einstein ring + core
    fr.circle(x, y, R * 1.45, fill=(6, 10, 26), d=d)
    fr.circle(x, y, R * 1.45, outline=(90, 160, 255), width=2.5, d=d)
    fr.glow_circle(x, y, R * 1.25, shade(PAL["blue"], 0.8 * strength), d=d)
    fr.circle(x, y, R * 0.75, fill=PAL["blue"], d=d)
    fr.circle(x, y, R * 0.42, fill=PAL["blue_core"], d=d)
    fr.glow_circle(x, y, R * 3.0, shade((30, 70, 160), strength), d=d)
    px, py = fr.P(x, y, d)
    fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(R * 4.5, d) / fr.ss, -0.22 * strength, t))


# --------------------------------------------------------------------------
# RED
# --------------------------------------------------------------------------

def red_charge(fr, x, y, t, r=0.12, strength=1.0, d=None):
    j = 0.25 * r
    rng = fr.rng
    cx, cy = x + rng.uniform(-j, j), y + rng.uniform(-j, j)
    fr.glow_circle(cx, cy, r * 4, shade((140, 10, 20), strength), d=d)
    fr.circle(cx, cy, r * 1.2, fill=PAL["red"], d=d)
    fr.circle(cx, cy, r * 0.6, fill=PAL["red_core"], d=d)
    for k in range(6):
        a = rng.uniform(0, math.tau)
        fr.glow_line([(cx, cy), (cx + math.cos(a) * r * 3.5, cy + math.sin(a) * r * 3.5)],
                     (200, 30, 40), width_px=2, d=d)


def red_release(fr, x, y, dirx, diry, t, length=14.0, width=2.6, strength=1.0, d=None, salt="red"):
    """Directional repulsive blast. t = seconds since release."""
    L = math.hypot(dirx, diry) or 1
    ux, uy = dirx / L, diry / L
    nx, ny = -uy, ux
    grow = EASE["snap"](clamp(t / 0.12))
    fade = 1 - clamp((t - 0.25) / 0.5)
    if fade <= 0:
        return
    ln = length * grow
    w = width * (0.6 + 0.6 * grow)
    tip = (x + ux * ln, y + uy * ln)
    cone = [(x + nx * 0.15, y + ny * 0.15), (tip[0] + nx * w, tip[1] + ny * w),
            (tip[0] + ux * w * 0.6, tip[1] + uy * w * 0.6), (tip[0] - nx * w, tip[1] - ny * w),
            (x - nx * 0.15, y - ny * 0.15)]
    fr.glow_poly(cone, shade((210, 20, 30), fade * strength), d=d)
    inner = [(x, y), (tip[0] + nx * w * 0.4, tip[1] + ny * w * 0.4), (tip[0] - nx * w * 0.4, tip[1] - ny * w * 0.4)]
    fr.glow_poly(inner, shade((255, 160, 140), fade * strength), d=d)
    fr.poly(inner, mix_color(PAL["red"], (255, 230, 220), 0.4 * fade), d=d)
    # pressure ring travelling with the front
    rr = 0.6 + ln * 0.35
    fr.ellipse(tip[0], tip[1], rr * 0.35, rr, outline=shade((255, 120, 110), fade), width=3, d=d)
    # streak lines along the direction
    rng = fr.srng(salt)
    for i in range(18):
        o = rng.uniform(-w, w)
        s0 = rng.uniform(0, ln)
        p0 = (x + ux * s0 + nx * o, y + uy * s0 + ny * o)
        p1 = (p0[0] + ux * rng.uniform(1, 3), p0[1] + uy * rng.uniform(1, 3))
        fr.glow_line([p0, p1], shade((255, 90, 80), fade), width_px=2, d=d)
    px, py = fr.P(x + ux * ln * 0.5, y + uy * ln * 0.5, d)
    fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(ln * 0.6, d) / fr.ss, 0.12 * fade, t))


# --------------------------------------------------------------------------
# HOLLOW PURPLE
# --------------------------------------------------------------------------

def purple_charge(fr, bx, by, rx, ry, t, conv=0.0, d=None):
    """Blue orb at (bx,by) and Red orb at (rx,ry) converging; conv 0..1 =
    how far they have closed. Tension arcs crackle between them."""
    mx, my = (bx + rx) / 2, (by + ry) / 2
    b = (bx + (mx - bx) * conv, by + (my - by) * conv)
    r = (rx + (mx - rx) * conv, ry + (my - ry) * conv)
    blue(fr, b[0], b[1], t, r=0.16 + 0.06 * conv, strength=0.9, streaks=30, salt="pb", d=d)
    red_charge(fr, r[0], r[1], t, r=0.14 + 0.05 * conv, d=d)
    rng = fr.rng
    for k in range(3 + int(conv * 6)):
        pts = [b]
        for j in range(1, 6):
            u = j / 6
            pts.append((b[0] + (r[0] - b[0]) * u + rng.uniform(-0.15, 0.15), b[1] + (r[1] - b[1]) * u + rng.uniform(-0.15, 0.15)))
        pts.append(r)
        fr.glow_line(pts, mix_color((120, 120, 255), (255, 100, 120), rng.random()), width_px=2, d=d)


def purple_orb(fr, x, y, R, t, strength=1.0, d=None):
    """The fused technique: layered sphere - outer violet corona, bright
    shell, darker 'hollow' interior with slow swirls, hot rim."""
    wob = 1 + 0.03 * math.sin(t * 25)
    Rr = R * wob
    fr.glow_circle(x, y, Rr * 2.4, shade((80, 20, 140), strength), d=d)
    fr.glow_circle(x, y, Rr * 1.5, shade((160, 70, 255), strength), d=d)
    fr.circle(x, y, Rr * 1.08, fill=mix_color(PAL["purple"], (255, 255, 255), 0.35), d=d)
    fr.circle(x, y, Rr, fill=PAL["purple"], d=d)
    fr.circle(x, y, Rr * 0.82, fill=(40, 8, 70), d=d)
    for k in range(5):
        a0 = t * (2 + k) + k * 1.3
        pts = []
        for j in range(12):
            a = a0 + j * 0.45
            rr = Rr * (0.2 + 0.05 * j)
            pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr * 0.8))
        fr.line(pts, (150, 90, 230), width_m=Rr * 0.03, d=d)
    fr.circle(x, y, Rr * 0.18, fill=PAL["purple_core"], d=d)
    px, py = fr.P(x, y, d)
    fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(Rr * 2.2, d) / fr.ss, 0.25 * strength, t))


def purple_channel(fr, x0, y0, x1, y1, R, fade=1.0, d=None):
    """The erased path left behind - clean-edged, faint violet afterglow."""
    L = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = -(y1 - y0) / L * R, (x1 - x0) / L * R
    quad = [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]
    fr.glow_poly(quad, shade((90, 30, 150), 0.6 * fade), d=d)
    fr.line([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny)], shade((200, 150, 255), fade), width_m=R * 0.05, d=d)
    fr.line([(x0 - nx, y0 - ny), (x1 - nx, y1 - ny)], shade((200, 150, 255), fade), width_m=R * 0.05, d=d)


# --------------------------------------------------------------------------
# UNLIMITED VOID
# --------------------------------------------------------------------------

def domain_void(fr, t, intensity=1.0, center=(0.5, 0.5), info=1.0):
    """Unlimited Void interior, drawn in screen space. Vast starfield depth,
    rings receding to an impossible vanishing point, streams of luminous
    'information' rushing outward, slow galactic spiral."""
    W, H = fr.W, fr.H
    cu, cv = center
    fr.draw.rectangle([0, 0, W, H], fill=(2, 3, 10))
    rng = random.Random("void-stars")
    # starfield with depth drift
    for i in range(900):
        a = rng.uniform(0, math.tau)
        z = (rng.random() + t * 0.05 * (0.5 + rng.random())) % 1.0
        rr = (z ** 2) * 1.3
        u = cu + math.cos(a) * rr * 0.9
        v = cv + math.sin(a) * rr * 0.9 * 1.0
        if 0 <= u <= 1 and 0 <= v <= 1:
            b = int(60 + 195 * z * intensity)
            col = (b, b, min(255, b + 30))
            s = 0.0008 + z * 0.002
            fr.s_circle(u, v, s, fill=col)
    # galactic spiral arms
    for arm in range(3):
        pts = []
        for j in range(60):
            ang = arm * math.tau / 3 + j * 0.12 + t * 0.15
            rr = 0.01 + j * 0.0075
            pts.append((cu + math.cos(ang) * rr * 1.2, cv + math.sin(ang) * rr * 0.6))
        fr.glow_line(pts, shade((90, 120, 220), 0.7 * intensity), width_px=10, world=False)
    # receding rings
    for k in range(10):
        z = (k / 10 + t * 0.12) % 1.0
        rr = 0.02 + z ** 2.2 * 0.9
        col = shade((120, 200, 255), (1 - z) * 0.6 * intensity + 0.1)
        fr.s_circle(cu, cv, rr, outline=col, width=1 + 2 * z)
    # streaming information: short luminous dashes radiating from the centre,
    # far too many to read - the point is overload
    for i in range(int(500 * info)):
        a = rng.uniform(0, math.tau)
        sp = 0.4 + rng.random()
        z = (rng.random() + t * sp * 0.6) % 1.0
        r0 = 0.02 + z ** 1.6 * 0.9
        r1 = r0 + 0.01 + z * 0.05
        col = mix_color((80, 160, 255), (255, 255, 255), rng.random() * 0.6)
        fr.glow_line([(cu + math.cos(a) * r0 * 1.2, cv + math.sin(a) * r0),
                      (cu + math.cos(a) * r1 * 1.2, cv + math.sin(a) * r1)],
                     shade(col, z * info * intensity), width_px=1 + 2 * z, world=False)
    fr.glow_circle(cu, cv, 0.05, shade((200, 230, 255), intensity), world=False)


def domain_transition(fr, u, center=(0.5, 0.5)):
    """Expanding black sphere that swallows the frame (u 0..1)."""
    if u <= 0:
        return
    cu, cv = center
    r = EASE["in"](clamp(u)) * 1.4
    fr.s_circle(cu, cv, r, fill=(2, 3, 10), outline=(150, 210, 255), width=3)


# --------------------------------------------------------------------------
# PHYSICAL IMPACTS & ENVIRONMENTAL EFFECTS
# --------------------------------------------------------------------------

def impact(fr, x, y, t, kind="heavy", dirx=1.0, diry=0.0, d=None, salt="imp"):
    """Tiered impact signatures. t = seconds since contact.
       light   - small white star + 6 streaks, no shake
       heavy   - star + ring + debris spray + camera shake (caller)
       massive - large ring, ground-hugging dust ring, flash
       blocked - Infinity stop: no contact flash; compressed-air ripple ahead
                 of the fist + streaks that stall (pair with infinity())."""
    rng = fr.srng(salt)
    if kind == "blocked":
        a = 1 - clamp(t / 0.5)
        if a <= 0:
            return
        for k in range(3):
            rr = 0.15 + t * (0.6 + k * 0.3)
            fr.ellipse(x, y, rr * 0.35, rr, outline=shade((200, 220, 240), a * (1 - k * 0.25)), width=2, d=d)
        for i in range(10):
            ang = rng.uniform(-1.2, 1.2) + math.atan2(-diry, -dirx)
            L = 0.2 + 0.6 * (1 - math.exp(-6 * t))
            fr.line([(x, y), (x + math.cos(ang) * L, y + math.sin(ang) * L)], shade((230, 230, 240), a), width_px=2, d=d)
        return
    scale = {"light": 0.35, "heavy": 1.0, "massive": 3.2}[kind]
    a = 1 - clamp(t / (0.25 if kind == "light" else 0.6 if kind == "heavy" else 1.2))
    if a <= 0:
        return
    if t < 0.08:
        star = []
        for i in range(16):
            ang = i * math.tau / 16
            rr = scale * (0.9 if i % 2 == 0 else 0.3) * (1 + rng.random() * 0.4)
            star.append((x + math.cos(ang) * rr, y + math.sin(ang) * rr))
        fr.poly(star, (255, 252, 240), d=d)
        fr.glow_circle(x, y, scale * 1.4, (255, 230, 200), d=d)
    for k in range(2 if kind != "light" else 1):
        rr = scale * (0.4 + t * (4 + k * 2.5))
        fr.ellipse(x, y, rr, rr * (0.85 if kind != "massive" else 0.35), outline=shade((255, 240, 220), a), width=3 + 4 * (kind == "massive"), d=d)
    for i in range(6 if kind == "light" else 16):
        ang = rng.uniform(0, math.tau)
        r0 = scale * 0.3 + t * scale * 3
        L = scale * rng.uniform(0.6, 1.6)
        fr.line([(x + math.cos(ang) * r0, y + math.sin(ang) * r0),
                 (x + math.cos(ang) * (r0 + L), y + math.sin(ang) * (r0 + L))], shade((255, 245, 230), a), width_px=2 + (kind == "massive") * 3, d=d)


def shockwave(fr, x, y, t, r_max=20.0, dur=0.8, ground=False, color=(235, 230, 220), d=None, width=4):
    u = clamp(t / dur)
    if u >= 1 or t < 0:
        return
    rr = r_max * EASE["out"](u)
    a = 1 - u
    if ground:
        fr.ellipse(x, y, rr, rr * 0.12, outline=shade(color, a), width=width, d=d)
        fr.ellipse(x, y, rr * 0.9, rr * 0.1, outline=shade(color, a * 0.6), width=width * 2, d=d)
    else:
        fr.circle(x, y, rr, outline=shade(color, a), width=width, d=d)
        px, py = fr.P(x, y, d)
        fr.post.append(("ring", px / fr.ss, py / fr.ss, fr.S(rr, d) / fr.ss, 0.6 * a, t))


def sonic_boom(fr, x, y, t, dirx=1.0, diry=0.0, size=2.5, d=None):
    """Vapour cone at the moment of breaking the sound barrier + boom ring."""
    a = 1 - clamp(t / 0.45)
    if a <= 0:
        return
    L = math.hypot(dirx, diry) or 1
    ux, uy = dirx / L, diry / L
    nx, ny = -uy, ux
    base = (x - ux * size * 1.2, y - uy * size * 1.2)
    cone = [(x + ux * 0.2, y + uy * 0.2), (base[0] + nx * size, base[1] + ny * size),
            (base[0] - ux * 0.4, base[1] - uy * 0.4), (base[0] - nx * size, base[1] - ny * size)]
    img, dr = fr.layer()
    dr.polygon(fr.pts(cone, d), fill=(235, 240, 250, int(150 * a)))
    fr.merge(img)
    rr = size * (0.6 + t * 6)
    fr.ellipse(x - ux * size, y - uy * size, rr * 0.3 if abs(ux) > 0.5 else rr, rr if abs(ux) > 0.5 else rr * 0.3,
               outline=shade((230, 236, 245), a), width=3, d=d)


def debris(fr, x, y, t, n=24, speed=10.0, spread=math.pi, angle=math.pi / 2, size=(0.08, 0.4),
           color=None, g=9.8, salt="deb", d=None, drag=0.4, ground=None):
    """Ballistic chunks. angle = central launch direction (rad), spread = cone."""
    if t < 0:
        return
    rng = fr.srng(salt)
    col = color or PAL["concrete"]
    for i in range(n):
        a = angle + rng.uniform(-spread / 2, spread / 2)
        sp = speed * rng.uniform(0.35, 1.1)
        sz = rng.uniform(*size)
        p = ballistic((x, y), (math.cos(a) * sp, math.sin(a) * sp), t, g=g, drag=drag)
        if ground is not None and p[1] < ground:
            p = (p[0], ground + sz * 0.3)
        rot = rng.uniform(0, math.tau) + t * rng.uniform(-8, 8)
        pts = []
        for k in range(4 + i % 2):
            ang = rot + k * math.tau / (4 + i % 2)
            rr = sz * rng.uniform(0.5, 1.0)
            pts.append((p[0] + math.cos(ang) * rr, p[1] + math.sin(ang) * rr))
        fr.poly(pts, shade(col, rng.uniform(0.6, 1.2)), d=d)


def dust_cloud(fr, x, y, t, r=4.0, n=18, color=None, rise=0.6, salt="dc", d=None, alpha=105, ground=True):
    """Billowing dust: translucent puffs expand outward (ground-hugging if
    ground=True), rise slowly and thin out. Kept translucent on purpose:
    dust must never bury the characters."""
    if t < 0:
        return
    rng = fr.srng(salt)
    col = color or PAL["dust"]
    img, dr = fr.layer()
    fade = clamp(1.25 - t * 0.35)
    if fade <= 0:
        return
    for i in range(n):
        a = rng.uniform(0.05, math.pi - 0.05) if ground else rng.uniform(0, math.tau)
        sp = rng.uniform(0.4, 1.0)
        grow = 1 - math.exp(-2.5 * t * sp)
        px = x + math.cos(a) * r * grow * (1.5 if ground else 1)
        py = y + (math.sin(a) * r * grow * (0.18 if ground else 1)) + rise * t * sp
        pr = r * (0.1 + 0.22 * grow) * rng.uniform(0.7, 1.3)
        c = shade(col, rng.uniform(0.75, 1.1))
        X, Y = fr.P(px, py, d)
        R = fr.S(pr, d)
        dr.ellipse([X - R, Y - R * 0.7, X + R, Y + R * 0.7], fill=c + (int(alpha * fade * rng.uniform(0.6, 1.0)),))
    fr.merge(img)


def glass_shatter(fr, x0, y0, x1, y1, t, n=40, outward=1.0, salt="glass", d=None):
    if t < 0:
        return
    rng = fr.srng(salt)
    for i in range(n):
        sx, sy = rng.uniform(x0, x1), rng.uniform(y0, y1)
        vx = outward * rng.uniform(1, 6)
        vy = rng.uniform(-1, 3)
        p = ballistic((sx, sy), (vx, vy), t, g=9.8)
        sz = rng.uniform(0.04, 0.18)
        rot = rng.uniform(0, 6) + t * 10
        pts = [(p[0] + math.cos(rot) * sz, p[1] + math.sin(rot) * sz),
               (p[0] + math.cos(rot + 2.2) * sz * 0.6, p[1] + math.sin(rot + 2.2) * sz * 0.6),
               (p[0] + math.cos(rot + 4.0) * sz * 0.8, p[1] + math.sin(rot + 4.0) * sz * 0.8)]
        glint = 0.6 + 0.4 * math.sin(t * 20 + i)
        fr.poly(pts, shade(PAL["glass"], glint), d=d)


def speed_lines(fr, intensity=1.0, direction=(1.0, 0.0), salt="sl", focus=None, color=(235, 235, 245)):
    """Anime speed lines in screen space. focus=(u,v) -> radial focus lines
    converging on that point; otherwise parallel streaks along direction."""
    if intensity <= 0:
        return
    rng = random.Random(f"{salt}{fr.f // 2}")
    img, dr = fr.layer()
    W, H = fr.W, fr.H
    n = int(60 * intensity)
    if focus:
        fu, fv = focus
        cx, cy = fu * W, fv * H
        for i in range(n):
            a = rng.uniform(0, math.tau)
            r0 = rng.uniform(0.35, 0.6) * H
            r1 = 1.4 * W
            w = rng.uniform(1, 5) * fr.ss
            p0 = (cx + math.cos(a) * r0, cy + math.sin(a) * r0)
            p1 = (cx + math.cos(a) * r1, cy + math.sin(a) * r1)
            p2 = (cx + math.cos(a + 0.004 * w) * r1, cy + math.sin(a + 0.004 * w) * r1)
            dr.polygon([p0, p1, p2], fill=color + (int(150 * intensity),))
    else:
        dx, dy = direction
        L = math.hypot(dx, dy) or 1
        dx, dy = dx / L, dy / L
        for i in range(n):
            u, v = rng.random() * W, rng.random() * H
            ln = rng.uniform(0.1, 0.45) * W
            dr.line([(u, v), (u - dx * ln, v - dy * ln)], fill=color + (int(rng.uniform(60, 160) * intensity),),
                    width=max(1, int(rng.uniform(1, 3) * fr.ss)))
    fr.merge(img)


def trail(fr, pts, color=(240, 240, 255), width_m=0.4, d=None, alpha=110):
    """Afterimage streak through world points (oldest first): a tapered,
    translucent ribbon - thin at the tail, full width at the head."""
    if len(pts) < 2:
        return
    img, dr = fr.layer()
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        j = min(i, n - 2)
        dx, dy = pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]
        L = math.hypot(dx, dy) or 1e-6
        w = width_m * 0.5 * (i / (n - 1)) ** 1.5
        left.append(fr.P(x - dy / L * w, y + dx / L * w, d))
        right.append(fr.P(x + dy / L * w, y - dx / L * w, d))
    dr.polygon(left + right[::-1], fill=color + (alpha,))
    for k in range(3):
        o = (k - 1) * 0.3
        dr.line([fr.P(x, y + o * width_m * 0.4, d) for (x, y) in pts], fill=color + (alpha // 2,),
                width=max(1, int(1.5 * fr.ss)))
    fr.merge(img)


def aura(fr, J, color=(110, 180, 255), strength=0.6, t=0.0):
    """Cursed energy aura licking up off a fighter (Gojo) - used sparingly:
    only for the most intense technique moments."""
    if strength <= 0:
        return
    rng = fr.rng
    for key in ("chest", "pelvis", "head", "wr_n", "el_n", "kn_n"):
        x, y = J[key]
        for k in range(3):
            fr.glow_circle(x + rng.uniform(-0.1, 0.1), y + rng.uniform(0, 0.2) + k * 0.12, 0.18 * strength,
                           shade(color, strength * 0.5), d=J.get("depth", 1.0))


def gather(fr, x, y, t, r=3.0, n=50, color=(120, 160, 255), salt="g", d=None):
    """Particles converging on a point (charging)."""
    rng = fr.srng(salt)
    for i in range(n):
        a = rng.uniform(0, math.tau)
        z = (rng.random() + t * (0.8 + rng.random())) % 1.0
        rr = r * (1 - z)
        fr.glow_circle(x + math.cos(a) * rr, y + math.sin(a) * rr, 0.03 + 0.03 * z, shade(color, z), d=d)


def lightning(fr, u0, t, salt="lt"):
    """Distant sheet lightning flicker: returns intensity 0..1 for sky()."""
    rng = random.Random(salt)
    k = 0.0
    for i in range(3):
        tt = rng.uniform(0, 6)
        k = max(k, pulse(t % 7.0, tt, 0.03, 0.25) * (0.5 + 0.5 * rng.random()))
    return k


def cracks(fr, x, y, r, n=9, salt="ck", color=(14, 12, 14), d=None, width=0.04):
    rng = fr.srng(salt)
    for k in range(n):
        a = rng.uniform(0, math.tau)
        pts = [(x, y)]
        L = r * rng.uniform(0.5, 1.0)
        for j in range(1, 5):
            a += rng.uniform(-0.4, 0.4)
            pts.append((x + math.cos(a) * L * j / 4, y + math.sin(a) * L * j / 4))
        fr.line(pts, color, width_m=width, d=d)


def blood(fr, x, y, t, n=8, dirx=1.0, salt="bl", d=None):
    rng = fr.srng(salt)
    for i in range(n):
        p = ballistic((x, y), (dirx * rng.uniform(1, 4), rng.uniform(0, 3)), t, g=9.8)
        fr.circle(p[0], p[1], 0.012 + 0.012 * rng.random(), fill=(140, 8, 18), d=d)


def domain_dome(fr, x, y, r, u=1.0, t=0.0, d=None):
    """Exterior of Unlimited Void's barrier: a perfectly black sphere sitting in
    the city, silent; thin cold rim light. u<1 = forming/dissolving (radius
    scales and the edge frays)."""
    if u <= 0:
        return
    R = r * EASE["out"](clamp(u))
    fr.glow_circle(x, y, R * 1.06, (20, 50, 90), d=d)
    fr.circle(x, y, R, fill=(2, 3, 8), d=d)
    fr.circle(x, y, R, outline=(120, 180, 255), width=2, d=d)
    if u < 1:
        rng = fr.rng
        for k in range(30):
            a = rng.uniform(0, math.tau)
            rr = R * rng.uniform(0.95, 1.15)
            fr.circle(x + math.cos(a) * rr, y + math.sin(a) * rr, R * 0.02, fill=(10, 14, 24), d=d)


def rct_heal(fr, x, y, t, r=0.12, d=None):
    """Reverse Cursed Technique at a wound: soft warm-white shimmer knitting inward."""
    a = clamp(1 - abs(t - 0.4) / 0.6)
    if a <= 0:
        return
    for k in range(3):
        rr = r * (1.4 - k * 0.35) * (1 - 0.3 * math.sin(t * 6 + k))
        fr.glow_circle(x, y, rr, shade((255, 240, 210), a * (0.5 - k * 0.12)), d=d)


def blood_trail(fr, x0, y0, x1, y1, w=0.01, d=None):
    fr.line([(x0, y0), (x1, y1)], (140, 8, 18), width_m=w, d=d)
