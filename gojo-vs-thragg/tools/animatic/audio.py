"""Temp sound design + temp score for the animatic, synthesised with numpy.

The shot list drives everything:
  shot["sfx"]   = [{"at": frame_in_shot, "cue": <name in SFX>, "gain": 0..1}, ...]
  shot["music"] = {"intensity": 0..1, "event": None | "drop_out" | "silence" |
                   "swell" | "hit" | "return" | "stinger", "at": frame_in_shot}
Sequence-level tempo/key come from MUSIC_SEQ below. Dialogue lines duck the
music (so final VO will sit clearly).

This is TEMP audio for timing reviews - it marks where every sound lands and
how the score breathes; it is not the final mix (see docs/06-sound-design.md).
"""
from __future__ import annotations

import math
import wave

import numpy as np

SR = 48000
FPS = 24
TOTAL_S = 240.0

rng_global = np.random.default_rng(7)


def _t(sec):
    return np.arange(int(sec * SR)) / SR


def _noise(sec, seed=0):
    return np.random.default_rng(seed).standard_normal(int(sec * SR)).astype(np.float32)


def _env(n, a, d, curve=4.0):
    """attack seconds a, exponential decay d seconds."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), np.exp(-(t - a) / max(d, 1e-4) * curve / 4))
    return e.astype(np.float32)


def _band(x, lo, hi):
    """FFT band-pass."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(np.float32)
    # soft edges
    m = np.convolve(m, np.ones(9) / 9, mode="same")
    return np.fft.irfft(X * m, n=len(x)).astype(np.float32)


def _lp(x, hi):
    return _band(x, 0, hi)


def _hp(x, lo):
    return _band(x, lo, SR / 2)


def _sweep(sec, f0, f1, shape="exp"):
    t = _t(sec)
    if shape == "exp":
        f = f0 * (f1 / f0) ** (t / sec)
    else:
        f = f0 + (f1 - f0) * t / sec
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph).astype(np.float32)


def _norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return (x / m * peak).astype(np.float32)


def _st(x, pan=0.0, width=0.0, seed=0):
    """mono -> stereo with pan (-1..1) and a little decorrelated width."""
    l = x * math.cos((pan + 1) * math.pi / 4)
    r = x * math.sin((pan + 1) * math.pi / 4)
    if width:
        d = int(SR * 0.012 * width)
        r = np.concatenate([np.zeros(d, np.float32), r[:-d]]) if d else r
    return np.stack([l, r], axis=1).astype(np.float32)


def _add(*xs):
    n = max(len(x) for x in xs)
    out = np.zeros(n, np.float32)
    for x in xs:
        out[: len(x)] += x
    return out


def _verb(x, sec=2.0, mix=0.3, seed=1):
    ir = _noise(sec, seed) * np.exp(-np.arange(int(sec * SR)) / SR * 3.2)
    ir = _lp(ir, 6000)
    n = len(x) + len(ir)
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x) + len(ir) - 1]
    y = _norm(y, np.max(np.abs(x)) or 1)
    out = np.zeros(len(y), np.float32)
    out[: len(x)] += x * (1 - mix)
    out += y * mix
    return out


# --------------------------------------------------------------------------
# SFX vocabulary
# --------------------------------------------------------------------------

def sfx_thunder(seed=0):
    n = _noise(5, seed)
    body = _lp(n, 180) * _env(len(n), 0.25, 3.5)
    crack = _band(_noise(5, seed + 1), 200, 1200) * _env(len(n), 0.02, 0.6) * 0.4
    return _norm(body + crack, 0.7)


def sfx_wind(seed=0, sec=4.0):
    n = _noise(sec, seed)
    w = _band(n, 250, 1400)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * _t(sec) + seed)
    e = np.minimum(1, _t(sec) / 0.8) * np.minimum(1, (sec - _t(sec)) / 0.8)
    return _norm(w * lfo * e, 0.35)


def sfx_land_heavy(seed=0):
    sub = _sweep(1.6, 70, 24) * _env(int(1.6 * SR), 0.004, 1.2)
    crunch = _band(_noise(1.6, seed), 300, 5000) * _env(int(1.6 * SR), 0.002, 0.25)
    rattle = _band(_noise(1.6, seed + 3), 1500, 7000) * (_noise(1.6, seed + 4) > 2.4) * _env(int(1.6 * SR), 0.05, 1.0) * 3
    return _norm(_verb(sub * 1.0 + crunch * 0.7 + rattle * 0.3, 2.2, 0.35), 0.95)


def sfx_crack_ground(seed=0):
    x = _band(_noise(0.9, seed), 150, 3000) * _env(int(0.9 * SR), 0.001, 0.35)
    return _norm(x, 0.7)


def sfx_glass(seed=0):
    sec = 1.8
    out = np.zeros(int(sec * SR), np.float32)
    r = np.random.default_rng(seed)
    for k in range(60):
        st = int(r.uniform(0, 0.9) * SR)
        f = r.uniform(2500, 9000)
        L = int(r.uniform(0.04, 0.3) * SR)
        tt = np.arange(L) / SR
        ping = np.sin(2 * np.pi * f * tt) * np.exp(-tt * r.uniform(15, 40))
        out[st:st + L] += ping[: len(out) - st] * r.uniform(0.2, 0.7)
    out += _hp(_noise(sec, seed), 3000) * _env(len(out), 0.001, 0.2) * 0.6
    return _norm(out, 0.6)


def sfx_accel(seed=0):
    sec = 0.9
    w = _band(_noise(sec, seed), 200, 4000)
    e = np.clip(_t(sec) / 0.15, 0, 1) * np.exp(-np.maximum(0, _t(sec) - 0.15) * 5)
    thump = _sweep(sec, 90, 40) * _env(int(sec * SR), 0.002, 0.25)
    return _norm(w * e * 0.8 + thump, 0.85)


def sfx_sonic_boom(seed=0):
    sec = 2.5
    out = np.zeros(int(sec * SR), np.float32)
    n_wave = np.zeros(int(0.12 * SR), np.float32)
    n_wave[0] = 1
    n_wave[-1] = -1
    out[: len(n_wave)] += np.linspace(1, -1, len(n_wave)) * 0.6
    out[:200] += 1
    out[len(n_wave):len(n_wave) + 200] -= 1
    boom = _lp(_noise(sec, seed), 120) * _env(int(sec * SR), 0.01, 1.8) * 3
    return _norm(_verb(_lp(out, 4000) + boom, 2.5, 0.4), 0.95)


def sfx_flyby(seed=0):
    sec = 1.4
    n = _noise(sec, seed)
    out = np.zeros_like(n)
    # sweep band center downward (doppler)
    for i, (lo, hi) in enumerate([(2000, 6000), (1000, 3500), (400, 1800), (150, 800)]):
        seg = _band(n, lo, hi)
        w = np.exp(-((_t(sec) - (0.25 + i * 0.25)) / 0.18) ** 2)
        out += seg * w
    return _norm(out, 0.7)


def sfx_punch(seed=0, heavy=True):
    sec = 0.9 if heavy else 0.4
    thud = _sweep(sec, 110 if heavy else 180, 45) * _env(int(sec * SR), 0.001, 0.22 if heavy else 0.08)
    smack = _band(_noise(sec, seed), 800, 5000) * _env(int(sec * SR), 0.0005, 0.04)
    air = _band(_noise(sec, seed + 1), 150, 900) * _env(int(sec * SR), 0.002, 0.3 if heavy else 0.1) * 0.5
    x = thud * 1.2 + smack * 0.8 + air
    return _norm(_verb(x, 1.2, 0.2) if heavy else x, 0.95 if heavy else 0.6)


def sfx_infinity_stop(seed=0):
    """Blocked movement: the swell of a blow that never lands - a pressure
    'whumm' that stalls, then a glassy high ring that hangs."""
    sec = 2.2
    t = _t(sec)
    swell = _band(_noise(sec, seed), 60, 400) * np.clip(t / 0.08, 0, 1) * np.exp(-t * 6)
    stall = _sweep(sec, 300, 900) * np.exp(-((t - 0.12) / 0.05) ** 2) * 0.4
    ring = (np.sin(2 * np.pi * 2350 * t) + 0.5 * np.sin(2 * np.pi * 3525 * t)) * np.exp(-t * 1.6) * \
           (0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)) * np.clip((t - 0.06) / 0.1, 0, 1)
    return _norm(swell * 1.2 + stall + ring * 0.25, 0.75)


def sfx_whoosh(seed=0):
    sec = 0.6
    w = _band(_noise(sec, seed), 400, 3000) * np.sin(np.pi * np.clip(_t(sec) / sec, 0, 1)) ** 2
    return _norm(w, 0.5)


def sfx_blue(seed=0, sec=2.5):
    t = _t(sec)
    suck = _band(_noise(sec, seed), 300, 3000) * (t / sec) ** 2
    throb = np.sin(2 * np.pi * (48 + 20 * t / sec) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)) * 0.6
    tone = _sweep(sec, 200, 900) * (t / sec) * 0.25
    return _norm((suck + throb + tone) * np.minimum(1, (sec - t) / 0.15), 0.8)


def sfx_red_charge(seed=0):
    sec = 0.8
    t = _t(sec)
    crackle = _hp(_noise(sec, seed), 2000) * (np.random.default_rng(seed).random(len(t)) > 0.97) * 4
    tone = _sweep(sec, 300, 1400) * 0.4
    return _norm((crackle + tone) * (t / sec), 0.6)


def sfx_red_release(seed=0):
    sec = 2.4
    hit = _band(_noise(sec, seed), 100, 6000) * _env(int(sec * SR), 0.001, 0.18)
    sub = _sweep(sec, 90, 30) * _env(int(sec * SR), 0.002, 0.9)
    tail = _lp(_noise(sec, seed + 2), 600) * _env(int(sec * SR), 0.05, 1.6) * 0.6
    return _norm(_verb(hit + sub * 1.3 + tail, 2.4, 0.35), 0.98)


def sfx_purple_charge(seed=0, sec=6.0):
    t = _t(sec)
    a = np.sin(2 * np.pi * (110 + 40 * t / sec) * t)
    b = np.sin(2 * np.pi * (330 - 150 * t / sec) * t)
    beat = (a + b) * 0.3 * (t / sec)
    crackle = _hp(_noise(sec, seed), 2500) * (np.random.default_rng(seed).random(len(t)) > (0.995 - 0.03 * t / sec)) * 3
    rumble = _lp(_noise(sec, seed + 1), 90) * (t / sec) * 2
    return _norm(beat + crackle + rumble, 0.85)


def sfx_purple_release(seed=0):
    sec = 4.5
    t = _t(sec)
    sub = _sweep(sec, 60, 18) * _env(len(t), 0.01, 3.0) * 1.6
    tear = _band(_noise(sec, seed), 200, 8000) * _env(len(t), 0.003, 1.2)
    roar = _lp(_noise(sec, seed + 5), 400) * _env(len(t), 0.2, 3.5) * 1.2
    return _norm(_verb(sub + tear + roar, 3.0, 0.4), 1.0)


def sfx_domain_open(seed=0):
    sec = 5.0
    t = _t(sec)
    snap = _hp(_noise(sec, seed), 3000) * _env(len(t), 0.0005, 0.02)
    chord = sum(np.sin(2 * np.pi * f * t) for f in (523.25, 659.25, 783.99, 1046.5, 1318.5)) / 5
    shimmer = chord * np.clip((t - 0.5) / 2.5, 0, 1) * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t))
    whoosh = _band(_noise(sec, seed + 1), 100, 1200) * np.exp(-((t - 0.4) / 0.25) ** 2)
    return _norm(_add(snap * 2, _verb(shimmer * 0.5 + whoosh, 3.5, 0.6)), 0.75)


def sfx_domain_bed(seed=0, sec=8.0):
    t = _t(sec)
    drone = sum(np.sin(2 * np.pi * f * t + i) for i, f in enumerate((55, 82.4, 110.0, 164.8))) / 4
    ticks = np.zeros(len(t), np.float32)
    r = np.random.default_rng(seed)
    for k in range(int(sec * 60)):
        st = int(r.uniform(0, sec - 0.05) * SR)
        L = int(0.01 * SR)
        ticks[st:st + L] += np.sin(2 * np.pi * r.uniform(2000, 9000) * np.arange(L) / SR) * np.exp(-np.arange(L) / SR * 400)
    clusters = sum(np.sin(2 * np.pi * f * t) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.3 + i * 0.17) * t))
                   for i, f in enumerate((1760, 1864.7, 2093, 2217.5))) / 4
    return _norm(drone * 0.6 + ticks * 0.5 + clusters * 0.25, 0.6)


def sfx_domain_close(seed=0):
    g = sfx_glass(seed)[::-1].copy()
    return _norm(g, 0.6)


def sfx_concrete(seed=0):
    sec = 1.6
    x = _band(_noise(sec, seed), 120, 4000) * _env(int(sec * SR), 0.002, 0.4)
    chunks = _band(_noise(sec, seed + 1), 200, 2500) * (_noise(sec, seed + 2) > 2.2) * _env(int(sec * SR), 0.1, 1.2) * 3
    return _norm(_verb(x + chunks, 1.5, 0.3), 0.85)


def sfx_collapse(seed=0):
    sec = 6.0
    t = _t(sec)
    rumble = _lp(_noise(sec, seed), 150) * np.clip(t / 0.5, 0, 1) * np.exp(-t * 0.5) * 2
    crashes = np.zeros(len(t), np.float32)
    r = np.random.default_rng(seed)
    for k in range(14):
        c = sfx_concrete(seed + k)
        st = int(r.uniform(0, 4) * SR)
        crashes[st:st + len(c)] += c[: len(t) - st] * r.uniform(0.3, 0.8)
    groan = np.sin(2 * np.pi * (40 + 15 * np.sin(2 * np.pi * 0.4 * t)) * t) * np.exp(-t * 0.6) * 0.4
    return _norm(rumble + crashes + groan, 0.95)


def sfx_metal_groan(seed=0):
    sec = 2.5
    t = _t(sec)
    f = 70 + 30 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR + 3 * np.sin(2 * np.pi * 23 * t)) * np.sin(np.pi * t / sec)
    return _norm(x, 0.6)


def sfx_metal_snap(seed=0):
    sec = 0.8
    t = _t(sec)
    x = (np.sin(2 * np.pi * 1700 * t) + np.sin(2 * np.pi * 2650 * t)) * np.exp(-t * 9)
    x += _hp(_noise(sec, seed), 1500) * _env(len(t), 0.0005, 0.03)
    return _norm(x, 0.7)


def sfx_impact_massive(seed=0):
    sec = 5.0
    t = _t(sec)
    sub = _sweep(sec, 55, 16) * _env(len(t), 0.003, 3.5) * 2
    body = _band(_noise(sec, seed), 60, 2500) * _env(len(t), 0.002, 0.9)
    debris = _band(_noise(sec, seed + 1), 400, 6000) * (_noise(sec, seed + 2) > 2.3) * _env(len(t), 0.3, 3.0) * 2
    return _norm(_verb(sub + body + debris, 3.5, 0.45), 1.0)


def sfx_shockwave(seed=0):
    sec = 2.0
    t = _t(sec)
    w = _band(_noise(sec, seed), 80, 1500) * np.exp(-((t - 0.2) / 0.15) ** 2) * 1.5
    b = _sweep(sec, 70, 30) * _env(len(t), 0.01, 0.8)
    return _norm(w + b, 0.85)


def sfx_heartbeat(seed=0):
    sec = 1.0
    t = _t(sec)
    beat = _sweep(sec, 60, 40) * (np.exp(-((t - 0.05) / 0.03) ** 2) + 0.7 * np.exp(-((t - 0.3) / 0.03) ** 2))
    return _norm(_lp(beat, 200), 0.7)


def sfx_breath(seed=0):
    sec = 1.2
    t = _t(sec)
    return _norm(_band(_noise(sec, seed), 300, 2500) * np.sin(np.pi * t / sec) ** 3, 0.25)


def sfx_cloth(seed=0):
    sec = 0.5
    x = _band(_noise(sec, seed), 600, 4000) * (0.5 + 0.5 * np.sin(2 * np.pi * 30 * _t(sec))) * _env(int(sec * SR), 0.02, 0.3)
    return _norm(x, 0.3)


def sfx_footstep(seed=0):
    sec = 0.25
    x = _band(_noise(sec, seed), 100, 2500) * _env(int(sec * SR), 0.001, 0.05)
    return _norm(x, 0.3)


def sfx_debris_rain(seed=0):
    sec = 3.0
    out = np.zeros(int(sec * SR), np.float32)
    r = np.random.default_rng(seed)
    for k in range(70):
        st = int(r.uniform(0, 2.6) * SR)
        c = sfx_footstep(seed + k)
        out[st:st + len(c)] += c[: len(out) - st] * r.uniform(0.3, 1.0)
    return _norm(out, 0.5)


def sfx_final_impact(seed=0):
    x = sfx_impact_massive(seed)
    return x


def sfx_blood_spit(seed=0):
    sec = 0.3
    return _norm(_band(_noise(sec, seed), 500, 3000) * _env(int(sec * SR), 0.005, 0.06), 0.25)


def sfx_teleport(seed=0):
    sec = 0.35
    t = _t(sec)
    x = _sweep(sec, 2000, 400) * np.exp(-t * 14) + _hp(_noise(sec, seed), 4000) * _env(len(t), 0.0005, 0.02)
    return _norm(x, 0.45)


def sfx_grab(seed=0):
    sec = 0.4
    x = _band(_noise(sec, seed), 200, 2000) * _env(int(sec * SR), 0.001, 0.06) + sfx_cloth(seed)[: int(sec * SR)] * 0.5
    return _norm(x, 0.55)


def sfx_rcf_heal(seed=0):
    """Reverse Cursed Technique: soft rising airy tone."""
    sec = 1.6
    t = _t(sec)
    x = sum(np.sin(2 * np.pi * f * t) for f in (880, 1320, 1760)) / 3 * np.sin(np.pi * t / sec) ** 2
    return _norm(_verb(x, 1.5, 0.5), 0.3)


SFX = {
    "thunder_distant": sfx_thunder, "wind_gust": sfx_wind, "land_heavy": sfx_land_heavy,
    "crack_ground": sfx_crack_ground, "glass_shatter": sfx_glass, "accel_burst": sfx_accel,
    "sonic_boom": sfx_sonic_boom, "flyby": sfx_flyby,
    "punch_heavy": lambda s=0: sfx_punch(s, True), "punch_light": lambda s=0: sfx_punch(s, False),
    "infinity_stop": sfx_infinity_stop, "whoosh": sfx_whoosh, "blue": sfx_blue,
    "red_charge": sfx_red_charge, "red_release": sfx_red_release,
    "purple_charge": sfx_purple_charge, "purple_release": sfx_purple_release,
    "domain_open": sfx_domain_open, "domain_bed": sfx_domain_bed, "domain_close": sfx_domain_close,
    "concrete_break": sfx_concrete, "building_collapse": sfx_collapse, "metal_groan": sfx_metal_groan,
    "metal_snap": sfx_metal_snap, "impact_massive": sfx_impact_massive, "shockwave": sfx_shockwave,
    "heartbeat": sfx_heartbeat, "breath": sfx_breath, "cloth": sfx_cloth, "footstep": sfx_footstep,
    "debris_rain": sfx_debris_rain, "final_impact": sfx_final_impact, "blood_spit": sfx_blood_spit,
    "teleport": sfx_teleport, "grab": sfx_grab, "rct_heal": sfx_rcf_heal,
}

# --------------------------------------------------------------------------
# temp score
# --------------------------------------------------------------------------
# key D minor throughout; tempo per sequence
MUSIC_SEQ = {
    1: dict(bpm=60, drums=0.0, pulse=0.0, brass=0.2, choir=0.5),
    2: dict(bpm=96, drums=0.5, pulse=0.4, brass=0.3, choir=0.2),
    3: dict(bpm=112, drums=0.6, pulse=0.6, brass=0.6, choir=0.3),
    4: dict(bpm=140, drums=1.0, pulse=0.9, brass=0.7, choir=0.3),
    5: dict(bpm=120, drums=0.7, pulse=0.5, brass=1.0, choir=1.0),
    6: dict(bpm=60, drums=0.0, pulse=0.0, brass=0.1, choir=0.6),
    7: dict(bpm=150, drums=1.0, pulse=1.0, brass=0.8, choir=0.6),
    8: dict(bpm=54, drums=0.0, pulse=0.0, brass=0.6, choir=0.4),
}
D2, A2, D3, F3, A3, C4, D4, E4, F4, A4 = 73.42, 110.0, 146.83, 174.61, 220.0, 261.63, 293.66, 329.63, 349.23, 440.0


def _saw(f, t):
    return (2 * ((f * t) % 1.0) - 1).astype(np.float32)


def build_score(shotlist, total_n):
    t = np.arange(total_n) / SR
    # per-sample intensity + sequence id from shots
    inten = np.zeros(total_n, np.float32)
    seq_of = np.zeros(total_n, np.int8)
    mute = np.ones(total_n, np.float32)
    hits = []
    for s in shotlist["shots"]:
        a = int(s["start_frame"] / FPS * SR)
        b = int((s["start_frame"] + s["frames"]) / FPS * SR)
        m = s.get("music") or {}
        inten[a:b] = float(m.get("intensity", 0.5))
        seq_of[a:b] = s["seq"]
        ev = m.get("event")
        if ev:
            at = a + int(m.get("at", 0) / FPS * SR)
            if ev in ("drop_out", "silence"):
                end = b if ev == "silence" else min(total_n, at + int(0.15 * SR))
                mute[at:b] = 0.0
            elif ev in ("hit", "stinger", "swell", "return"):
                hits.append((at, ev))
    # smooth intensity (0.4 s) via cumulative moving average
    k = int(0.4 * SR)
    c = np.cumsum(np.concatenate([np.zeros(1, np.float32), inten]))
    sm = np.empty_like(inten)
    sm[:] = (c[np.minimum(np.arange(total_n) + k, total_n)] - c[np.maximum(np.arange(total_n) - k, 0)]) / (2 * k)
    inten = sm
    km = int(0.03 * SR)
    cm = np.cumsum(np.concatenate([np.zeros(1, np.float32), mute]))
    mute = (cm[np.minimum(np.arange(total_n) + km, total_n)] - cm[np.maximum(np.arange(total_n) - km, 0)]) / (2 * km)

    out = np.zeros((total_n, 2), np.float32)
    # drone: low D + A fifths, filtered saws (always present, scaled)
    drone = (_saw(D2, t) + _saw(A2 * 1.003, t) * 0.7 + _saw(D3 * 0.997, t) * 0.5)
    drone = _lp(drone, 400) * (0.25 + 0.35 * inten)
    out += _st(drone, 0, 0.5)
    # choir pad: stacked sines with slow vibrato, chord changes every 8 s
    chords = [(D3, F3, A3), (C4 / 2 * 1.0, E4 / 2, A3), (D3 * 0.89, F3, A3 * 0.89), (A2, C4 / 2, E4 / 2)]
    pad = np.zeros(total_n, np.float32)
    for i in range(int(TOTAL_S / 8) + 1):
        a = int(i * 8 * SR)
        b = min(total_n, int((i + 1) * 8 * SR) + int(0.5 * SR))
        if a >= total_n:
            break
        tt = t[a:b]
        ch = chords[i % 4]
        seg = sum(np.sin(2 * np.pi * f * 2 * tt * (1 + 0.002 * np.sin(2 * np.pi * 5 * tt))) for f in ch) / 3
        env = np.minimum(1, (tt - tt[0]) / 1.0) * np.minimum(1, (tt[-1] - tt) / 0.5 + 1e-3)
        pad[a:b] += seg * env
    choir_amt = np.array([MUSIC_SEQ.get(int(s), MUSIC_SEQ[1])["choir"] for s in range(9)], np.float32)[seq_of]
    out += _st(pad * 0.18 * choir_amt * (0.4 + inten), 0, 1.0)
    # drums + pulse per sequence tempo
    drums = np.zeros(total_n, np.float32)
    pulse = np.zeros(total_n, np.float32)
    kick = _sweep(0.5, 120, 40) * _env(int(0.5 * SR), 0.001, 0.25)
    taiko = _norm(_verb(_sweep(1.2, 90, 50) * _env(int(1.2 * SR), 0.002, 0.5), 1.0, 0.3), 1.0)
    tick = _hp(_noise(0.05, 3), 4000) * _env(int(0.05 * SR), 0.0005, 0.01)
    pos = 0
    while pos < total_n:
        sq = int(seq_of[pos]) or 1
        p = MUSIC_SEQ[sq]
        beat = 60.0 / p["bpm"]
        step = int(beat / 4 * SR)
        n16 = (pos // max(1, step))
        if p["drums"] > 0:
            if n16 % 16 in (0, 6, 10):
                drums[pos:pos + len(kick)] += kick[: total_n - pos] * p["drums"]
            if n16 % 32 == 0:
                drums[pos:pos + len(taiko)] += taiko[: total_n - pos] * 0.6 * p["drums"]
        if p["pulse"] > 0:
            f = [D3, D3, F3, D3, A3 / 2 * 2, D3, C4 / 2, D3][n16 % 8]
            L = min(step, total_n - pos)
            tt = np.arange(L) / SR
            pulse[pos:pos + L] += (_saw(f, tt) * np.exp(-tt * 18)) * p["pulse"]
            pulse[pos:pos + len(tick)] += tick[: total_n - pos] * 0.3 * p["pulse"]
        pos += step
    out += _st(drums * 0.55 * np.clip(inten * 1.3, 0, 1), 0, 0.2)
    out += _st(_lp(pulse, 2500) * 0.12 * np.clip(inten * 1.2, 0, 1), 0, 0.8)
    # brass stabs on hits / stingers / swells
    for at, ev in hits:
        sec = 2.5 if ev in ("hit", "stinger") else 5.0
        tt = _t(sec)
        L = min(len(tt), total_n - at)
        if L <= 0:
            continue
        tt = tt[:L]
        br = (_saw(D3, tt) + _saw(A3, tt) * 0.8 + _saw(F3, tt) * 0.6) / 2.4
        br = _lp(br, 1800)
        env = (np.exp(-tt * 1.4) if ev in ("hit", "stinger") else np.clip(tt / 3.0, 0, 1) * np.exp(-np.maximum(0, tt - 3.5) * 2))
        out[at:at + L] += _st(br * env * 0.35, 0, 0.6)
    out *= mute[:, None]
    return out


def _wav_write(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def build(shotlist, path):
    total_frames = shotlist.get("total_frames", 5760)
    total_n = int(total_frames / FPS * SR)
    print("  synthesising temp score...", flush=True)
    mix = build_score(shotlist, total_n) * 0.55
    # dialogue ducking (placeholder for VO)
    duck = np.ones(total_n, np.float32)
    for s in shotlist["shots"]:
        for dl in s.get("dialogue") or []:
            a = int((s["start_frame"] + dl.get("at_frame", 0)) / FPS * SR)
            b = a + int(dl.get("frames", 48) / FPS * SR)
            duck[a:b] = 0.45
    mix *= duck[:, None]
    print("  placing sound effects...", flush=True)
    cache = {}
    for s in shotlist["shots"]:
        for i, e in enumerate(s.get("sfx") or []):
            name = e["cue"]
            if name not in SFX:
                print(f"  ! unknown sfx cue {name!r} in {s['id']}")
                continue
            key = (name, i % 3)
            if key not in cache:
                cache[key] = SFX[name](i % 3)
            x = cache[key]
            at = int((s["start_frame"] + e.get("at", 0)) / FPS * SR)
            if at >= total_n:
                continue
            L = min(len(x), total_n - at)
            pan = float(e.get("pan", 0.0))
            mix[at:at + L] += _st(x[:L], pan, 0.3) * float(e.get("gain", 0.8)) * 0.6
    # soft limiter
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    _wav_write(path, mix)
    print("  wrote", path, f"({total_n / SR:.3f}s)")
