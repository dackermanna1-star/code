"""Synthesizes every Godforge sound effect and writes OGG Vorbis files + sounds.json.

Requires numpy and ffmpeg (with libvorbis). Run from the repository root:  python3 tools/gen_sounds.py
All sounds are original procedural audio (additive/subtractive synthesis, FM, filtered noise).
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'godforge')
OUT = os.path.join(ROOT, 'sounds')
rng = np.random.default_rng(20251)


# ------------------------------------------------------------------ primitives

def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def noise(dur):
    return rng.standard_normal(int(SR * dur))


def brown(dur):
    w = noise(dur)
    b = np.cumsum(w)
    b -= np.convolve(b, np.ones(2000) / 2000, mode='same')
    return b / (np.max(np.abs(b)) + 1e-9)


def osc(freq, dur, shape='sine', phase=0.0):
    """freq may be a scalar or an array (per-sample frequency)."""
    n = int(SR * dur)
    f = np.full(n, freq, dtype=float) if np.isscalar(freq) else np.asarray(freq, dtype=float)[:n]
    ph = 2 * np.pi * np.cumsum(f) / SR + phase
    if shape == 'sine':
        return np.sin(ph)
    if shape == 'saw':
        return 2.0 * ((ph / (2 * np.pi)) % 1.0) - 1.0
    if shape == 'square':
        return np.sign(np.sin(ph))
    if shape == 'tri':
        return 2.0 * np.abs(2.0 * ((ph / (2 * np.pi)) % 1.0) - 1.0) - 1.0
    raise ValueError(shape)


def sweep(f0, f1, dur, curve='exp'):
    t = np.linspace(0, 1, int(SR * dur))
    if curve == 'exp':
        return f0 * (f1 / f0) ** t
    return f0 + (f1 - f0) * t


def env_exp(dur, decay, attack=0.002):
    t = t_axis(dur)
    e = np.exp(-t / decay)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return e * a


def env_ad(dur, attack, release):
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.clip((dur - t) / max(release, 1e-4), 0, 1)
    return a * r


def env_swell(dur, peak_at=0.8, power=2.0):
    t = np.linspace(0, 1, int(SR * dur))
    up = np.clip(t / peak_at, 0, 1) ** power
    down = np.clip((1 - t) / max(1e-4, 1 - peak_at), 0, 1)
    return up * np.where(t > peak_at, down, 1.0)


def fft_filter(x, lo=None, hi=None, sweep_hi=None):
    """Brick-ish band filter with soft edges. sweep_hi: (f_start, f_end) moving low-pass in 8 blocks."""
    if sweep_hi is not None:
        blocks = 16
        out = np.zeros_like(x)
        n = len(x)
        edges = np.linspace(0, n, blocks + 1).astype(int)
        fades = np.hanning(2 * (n // blocks) + 2)
        for i in range(blocks):
            a, b = edges[i], edges[i + 1]
            pad = n // blocks
            s, e = max(0, a - pad), min(n, b + pad)
            frac = (i + 0.5) / blocks
            cutoff = sweep_hi[0] * (sweep_hi[1] / sweep_hi[0]) ** frac
            seg = fft_filter(x[s:e], lo=lo, hi=cutoff)
            w = np.hanning(e - s)
            out[s:e] += seg * w
        norm = np.zeros(n)
        for i in range(blocks):
            a, b = edges[i], edges[i + 1]
            pad = n // blocks
            s, e = max(0, a - pad), min(n, b + pad)
            norm[s:e] += np.hanning(e - s)
        return out / np.maximum(norm, 1e-3)
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    mask = np.ones_like(freqs)
    if lo is not None:
        mask *= 1 / (1 + (lo / np.maximum(freqs, 1e-3)) ** 4)
    if hi is not None:
        mask *= 1 / (1 + (freqs / hi) ** 4)
    return np.fft.irfft(spec * mask, n=len(x))


def distort(x, drive=3.0):
    return np.tanh(x * drive) / np.tanh(drive)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def pad(x, dur):
    n = int(SR * dur)
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def delay(x, seconds, gain, taps=3):
    out = x.copy()
    d = int(seconds * SR)
    for k in range(1, taps + 1):
        shifted = np.zeros_like(x)
        if d * k < len(x):
            shifted[d * k:] = x[:-d * k] * (gain ** k)
        out += shifted
    return out


def reverb(x, size=0.6, wet=0.35):
    out = x.copy()
    for d, g in ((0.029, 0.6), (0.037, 0.55), (0.043, 0.5), (0.061, 0.45), (0.083, 0.4), (0.113, 0.3)):
        out += delay(x, d * (0.5 + size), g * size, taps=4) * wet
    return out


def finish(x, peak=0.89, fade_in=0.004, fade_out=0.05):
    x = x - np.mean(x)
    n = len(x)
    fi = int(SR * fade_in)
    fo = int(SR * fade_out)
    if fi > 0:
        x[:fi] *= np.linspace(0, 1, fi)
    if fo > 0:
        x[-fo:] *= np.linspace(1, 0, fo)
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def make_loop(x, crossfade=0.25):
    """Crossfade the tail into the head so the sound loops seamlessly."""
    c = int(SR * crossfade)
    head = x[:c].copy()
    tail = x[-c:].copy()
    fade = np.linspace(0, 1, c)
    blended = tail * (1 - fade) + head * fade
    body = x[c:-c]
    return np.concatenate([blended, body])


# ------------------------------------------------------------------ building blocks

def boom(dur, low=48.0, bright=2500.0, decay=0.9):
    body = fft_filter(noise(dur), hi=bright) * env_exp(dur, decay * 0.35, 0.003)
    rumble = fft_filter(brown(dur), hi=180) * env_exp(dur, decay, 0.01) * 1.4
    thump = osc(sweep(low * 2.2, low * 0.6, dur), dur) * env_exp(dur, decay * 0.45, 0.002) * 1.6
    crackle = (rng.random(int(SR * dur)) < 0.0025).astype(float) * rng.standard_normal(int(SR * dur)) * env_exp(dur, decay * 0.6) * 1.5
    return mix(body, rumble, thump, fft_filter(crackle, lo=800))


def whoosh(dur, f0, f1, q=1.0):
    n = noise(dur)
    out = np.zeros_like(n)
    blocks = 24
    edges = np.linspace(0, len(n), blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        f = f0 * (f1 / f0) ** ((i + 0.5) / blocks)
        seg = fft_filter(n[a:b], lo=f / (1.5 * q), hi=f * (1.5 * q))
        out[a:b] = seg
    return out


def bells(dur, freqs, decay=0.8, detune=0.0):
    out = np.zeros(int(SR * dur))
    for i, f in enumerate(freqs):
        out += osc(f * (1 + detune * (i % 2 - 0.5)), dur) * env_exp(dur, decay / (1 + i * 0.3)) / (1 + i * 0.4)
    return out


def shatter(dur, grains=180, lo=2500, uniform=False):
    n = int(SR * dur)
    out = np.zeros(n)
    for _ in range(grains):
        start = int((rng.random() * dur if uniform else abs(rng.normal(0, 0.18))) * SR)
        if start >= n:
            continue
        length = int(SR * (0.01 + rng.random() * 0.05))
        g = rng.standard_normal(length) * np.exp(-np.linspace(0, 6, length))
        f = 2000 + rng.random() * 7000
        g = g * np.sin(2 * np.pi * f * np.arange(length) / SR)
        end = min(n, start + length)
        out[start:end] += g[:end - start] * (0.5 + rng.random())
    return fft_filter(out, lo=lo)


def choir(dur, root, chord=(1.0, 1.25, 1.5, 2.0), vibrato=5.0):
    t = t_axis(dur)
    out = np.zeros(len(t))
    for i, ratio in enumerate(chord):
        for voice in range(3):
            f = root * ratio * (1 + 0.004 * (voice - 1)) * (1 + 0.006 * np.sin(2 * np.pi * vibrato * t + voice))
            s = osc(f, dur, 'saw')
            out += fft_filter(s, hi=1800 + 400 * i) / (1 + i * 0.3)
    return out


# ------------------------------------------------------------------ the sounds

def s_charge_up():
    d = 2.2
    f = sweep(110, 880, d)
    trem = 0.7 + 0.3 * np.sin(2 * np.pi * np.linspace(4, 18, int(SR * d)) * t_axis(d))
    tone = (osc(f, d, 'saw') * 0.4 + osc(f * 1.5, d) * 0.3 + osc(f * 2, d) * 0.2) * trem
    shimmer = fft_filter(noise(d), lo=4000) * env_swell(d, 0.98) * 0.4
    return finish(mix(fft_filter(tone, hi=5000) * env_swell(d, 0.97, 1.5), shimmer), fade_out=0.08)


def s_mode_switch():
    d = 0.22
    a = osc(880, 0.08, 'square') * env_exp(0.08, 0.03)
    b = osc(1320, 0.1, 'square') * env_exp(0.1, 0.04)
    return finish(fft_filter(mix(a, np.concatenate([np.zeros(int(SR * 0.09)), b])), hi=6000) * 0.5, peak=0.5)


def s_big_explosion():
    return finish(reverb(boom(3.5, 42, 2200, 1.0), 0.8, 0.3), fade_out=0.4)


def s_shockwave():
    d = 1.6
    w = whoosh(d, 3000, 250, 1.2) * env_swell(d, 0.25, 1.0)
    thump = osc(sweep(90, 35, d), d) * env_exp(d, 0.35)
    return finish(mix(w * 1.2, thump), fade_out=0.2)


def s_debris_impact():
    d = 0.6
    click = fft_filter(noise(d), hi=3000) * env_exp(d, 0.05)
    rattle = shatter(d, 40, 600) * 0.5
    thud = osc(sweep(120, 50, d), d) * env_exp(d, 0.12)
    return finish(mix(click, rattle, thud), fade_out=0.1)


def s_worldcutter_slash():
    d = 0.9
    w = whoosh(d, 500, 7000, 1.3) * env_ad(d, 0.12, 0.6)
    ring = bells(d, [1210, 1873, 2650, 3410], 0.5, 0.01) * 0.35
    return finish(mix(w, ring), fade_out=0.15)


def s_worldcutter_sever():
    d = 4.8
    crack = fft_filter(noise(0.25), lo=1500) * env_exp(0.25, 0.04) * 2.0
    rip = whoosh(d, 6000, 120, 1.0) * env_exp(d, 1.4, 0.05) * 1.3
    sub = osc(sweep(70, 26, d), d) * env_exp(d, 2.0, 0.05) * 1.6
    dissonance = bells(d, [523, 554, 1046, 1109], 2.2, 0.02) * 0.25
    rumble = fft_filter(brown(d), hi=140) * env_exp(d, 2.5, 0.2) * 1.2
    return finish(reverb(mix(crack, rip, sub, dissonance, rumble), 0.9, 0.35), fade_out=0.6)


def s_worldcutter_rumble():
    d = 3.0
    r = fft_filter(brown(d), hi=120)
    mod = 0.6 + 0.4 * np.sin(2 * np.pi * 1.7 * t_axis(d)) * np.sin(2 * np.pi * 0.6 * t_axis(d))
    grit = fft_filter(noise(d), lo=200, hi=900) * 0.08
    return finish(mix(r * mod, grit) * env_ad(d, 0.4, 0.8))


def s_laser_loop():
    d = 2.25
    f = 110.0
    hum = osc(f, d, 'saw') * 0.5 + osc(f * 2, d, 'saw') * 0.25 + osc(f * 3.01, d) * 0.2
    whine = osc(3200, d) * 0.06 + osc(3205, d) * 0.06
    am = 0.85 + 0.15 * np.sin(2 * np.pi * 16 * t_axis(d))
    crackle = fft_filter(noise(d), lo=2500, hi=9000) * 0.12 * (0.7 + 0.3 * np.sin(2 * np.pi * 7 * t_axis(d)))
    sig = distort(fft_filter(hum, hi=4500) * am, 1.6) + whine + crackle
    return finish(make_loop(sig, 0.2), fade_in=0, fade_out=0)


def s_laser_start():
    d = 0.6
    z = osc(sweep(200, 1600, d), d, 'saw') * env_ad(d, 0.01, 0.35)
    click = fft_filter(noise(0.05), lo=2000) * env_exp(0.05, 0.01)
    return finish(mix(fft_filter(z, hi=6000), click))


def s_laser_stop():
    d = 0.55
    z = osc(sweep(1500, 90, d), d, 'saw') * env_exp(d, 0.15)
    return finish(fft_filter(z, hi=5000))


def s_laser_overload():
    d = 2.6
    f = sweep(80, 420, d)
    roar = distort(osc(f, d, 'saw') + osc(f * 1.01, d, 'saw') + fft_filter(noise(d), hi=3000) * 0.6, 4.0)
    return finish(fft_filter(roar, hi=7000) * env_swell(d, 0.9, 1.2), fade_out=0.2)


def s_orb_charge():
    d = 2.6
    base = sweep(220, 440, d)
    chord = sum(osc(base * r, d) / (1 + i * 0.4) for i, r in enumerate((1.0, 1.25, 1.5, 2.0, 2.5)))
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.linspace(3, 12, int(SR * d)) * t_axis(d))
    sparkle = shatter(d, 160, 5000, uniform=True) * 0.25 * env_swell(d, 0.95, 1.0)
    return finish(mix(chord * trem * env_swell(d, 0.95, 1.3), sparkle), fade_out=0.1)


def s_orb_fire():
    d = 2.2
    roar = whoosh(d, 2000, 150, 1.4) * env_exp(d, 0.7, 0.02) * 1.3
    chord = sum(osc(sweep(880 * r, 220 * r, d), d) for r in (1.0, 1.25, 1.5)) * env_exp(d, 0.6) * 0.35
    thump = osc(sweep(140, 40, d), d) * env_exp(d, 0.3) * 1.2
    return finish(reverb(mix(roar, chord, thump), 0.6, 0.25), fade_out=0.25)


def s_orb_travel():
    d = 1.0
    rush = fft_filter(noise(d), lo=300, hi=2500) * 0.7
    tone = sum(osc(330 * r, d) for r in (1.0, 1.5, 2.0)) * 0.2
    return finish(mix(rush, tone) * env_ad(d, 0.1, 0.4))


def s_orb_impact():
    d = 3.2
    glass = shatter(d, 260, 3000) * 1.1
    chime = bells(d, [1318, 1568, 1976, 2637, 3136], 1.4) * 0.45
    b = boom(d, 46, 2000, 1.1)
    return finish(reverb(mix(b, glass, chime), 0.8, 0.3), fade_out=0.4)


def s_asteroid_lock():
    d = 0.5
    a = osc(1000, 0.12, 'square') * env_exp(0.12, 0.05)
    b = osc(1500, 0.2, 'square') * env_exp(0.2, 0.08)
    sig = mix(a, np.concatenate([np.zeros(int(SR * 0.15)), b]))
    return finish(fft_filter(pad(sig, d), hi=5000) * 0.7, peak=0.6)


def s_asteroid_incoming():
    d = 5.0
    roar = fft_filter(noise(d), hi=sweep(600, 4000, d).mean()) * env_swell(d, 0.96, 2.2) * 1.2
    whistle = osc(sweep(1400, 300, d), d) * env_swell(d, 0.9, 1.5) * 0.4
    rumble = fft_filter(brown(d), hi=150) * env_swell(d, 0.97, 1.8)
    crackle = shatter(d, 260, 1500, uniform=True) * env_swell(d, 0.95, 2.0) * 0.35
    return finish(mix(roar, whistle, rumble, crackle), fade_out=0.05)


def s_asteroid_impact():
    d = 6.0
    b = boom(d, 34, 2600, 1.6) * 1.2
    tail = fft_filter(brown(d), hi=110) * env_exp(d, 2.6, 0.3) * 1.3
    debris = shatter(d, 220, 800) * env_exp(d, 1.5) * 0.4
    return finish(reverb(mix(b, tail, debris), 1.0, 0.35), fade_out=0.8)


def s_blackhole_launch():
    d = 1.1
    whomp = osc(sweep(220, 38, d), d) * env_exp(d, 0.35, 0.01) * 1.4
    rev = fft_filter(noise(d), lo=200, hi=3000) * env_swell(d, 0.3) * 0.4
    return finish(mix(whomp, rev), fade_out=0.15)


def s_blackhole_loop():
    d = 3.2
    t = t_axis(d)
    drone = osc(40, d) * 0.6 + osc(80.5, d) * 0.4 + osc(120.3, d, 'tri') * 0.15
    beat = 0.65 + 0.35 * np.sin(2 * np.pi * (1 / 1.6) * t)
    whistle = osc(1900 + 60 * np.sin(2 * np.pi * 0.3125 * t), d) * 0.05
    swirl = fft_filter(noise(d), lo=400, hi=1600) * 0.18 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.625 * t))
    return finish(make_loop(drone * beat + whistle + swirl, 0.3), fade_in=0, fade_out=0)


def s_blackhole_collapse():
    d = 3.0
    rise = fft_filter(noise(d), hi=8000) * env_swell(d, 0.82, 3.0) * 1.2
    pitch = osc(sweep(60, 900, d), d, 'saw') * env_swell(d, 0.82, 3.0) * 0.4
    cut = int(SR * d * 0.82)
    sig = mix(rise, fft_filter(pitch, hi=4000))
    sig[cut:] = 0
    b = boom(d * 0.18 + 0.1, 30, 1800, 0.3)
    sig = mix(sig, np.concatenate([np.zeros(cut), b * 1.5]))
    return finish(pad(sig, d), fade_out=0.1)


def s_reality_shatter():
    d = 1.6
    glass = shatter(d, 300, 2500) * 1.2
    wob = osc(sweep(160, 50, d) * (1 + 0.15 * np.sin(2 * np.pi * 9 * t_axis(d))), d) * env_exp(d, 0.4) * 1.1
    tones = bells(d, [740, 1047, 1480, 2093], 0.6, 0.03) * 0.3
    return finish(reverb(mix(glass, wob, tones), 0.5, 0.3), fade_out=0.2)


def s_rift_loop():
    d = 3.0
    t = t_axis(d)
    mod = 180 * np.sin(2 * np.pi * 0.333 * t)
    fm = np.sin(2 * np.pi * 330 * t + 4.0 * np.sin(2 * np.pi * (220 + mod * 0.2) * t)) * 0.35
    whisper = fft_filter(noise(d), lo=1500, hi=6000) * 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.667 * t))
    low = osc(55, d) * 0.3
    return finish(make_loop(fm + whisper + low, 0.3), fade_in=0, fade_out=0)


def s_reality_collapse():
    d = 5.5
    parts = [boom(d, 36, 2200, 1.4)]
    for k in range(5):
        start = int(SR * (0.15 + k * 0.45))
        s = shatter(1.5, 200, 2000) * (1.0 - k * 0.12)
        parts.append(np.concatenate([np.zeros(start), s]))
    drone = osc(sweep(220, 40, d), d, 'saw') * env_exp(d, 2.0) * 0.3
    return finish(reverb(mix(*parts, fft_filter(drone, hi=2000)), 1.0, 0.35), fade_out=0.6)


def s_starfall_shoot():
    d = 0.8
    pluck = sum(osc(196 * h, d) * env_exp(d, 0.25 / h) / h for h in range(1, 7))
    sparkle = shatter(d, 60, 6000) * 0.35
    zip_ = whoosh(d, 1500, 6000, 1.5) * env_exp(d, 0.15) * 0.5
    return finish(mix(pluck, sparkle, zip_), fade_out=0.15)


def s_star_impact():
    d = 1.8
    b = boom(d, 60, 4000, 0.6)
    bell = bells(d, [1568, 2093, 2637, 3136], 0.9) * 0.5
    sparkle = shatter(d, 140, 5000) * 0.5
    return finish(reverb(mix(b, bell, sparkle), 0.6, 0.3), fade_out=0.25)


def s_starfall_judgment():
    d = 6.5
    ch = choir(d, 130.8, (1.0, 1.2599, 1.4983, 2.0, 2.5198)) * env_swell(d, 0.55, 1.5) * 0.5
    hit_at = int(SR * d * 0.55)
    b = boom(d - d * 0.55, 30, 3000, 1.8) * 1.6
    shimmer = shatter(d, 300, 5000, uniform=True) * env_swell(d, 0.6) * 0.3
    sig = mix(ch, shimmer, np.concatenate([np.zeros(hit_at), b]))
    return finish(reverb(sig, 1.0, 0.4), fade_out=0.8)


def s_godfist_punch():
    d = 0.9
    smack = fft_filter(noise(0.1), hi=4000) * env_exp(0.1, 0.015) * 1.6
    thump = osc(sweep(110, 45, d), d) * env_exp(d, 0.18) * 1.6
    crunch = shatter(d, 50, 800) * 0.6
    return finish(mix(smack, thump, crunch), fade_out=0.15)


def s_godfist_shockwave():
    d = 1.6
    whomp = osc(sweep(80, 30, d), d) * env_exp(d, 0.4, 0.01) * 1.5
    air = whoosh(d, 1800, 200, 1.0) * env_exp(d, 0.5, 0.02)
    return finish(mix(whomp, air), fade_out=0.2)


def s_godfist_slam():
    d = 5.2
    b = boom(d, 28, 2400, 1.8) * 1.3
    rumble = fft_filter(brown(d), hi=90) * env_exp(d, 2.8, 0.1) * 1.4
    rubble = shatter(d, 400, 500, uniform=True) * env_exp(d, 1.6) * 0.5
    return finish(reverb(mix(b, rumble, rubble), 1.0, 0.35), fade_out=0.7)


def s_sunforge_bolt():
    d = 1.0
    fire = fft_filter(noise(d), lo=300, hi=4500) * env_ad(d, 0.03, 0.7)
    pops = (rng.random(int(SR * d)) < 0.004).astype(float) * rng.standard_normal(int(SR * d)) * 2.0
    whoomp = osc(sweep(160, 60, d), d) * env_exp(d, 0.2) * 0.8
    return finish(mix(fire, fft_filter(pops, lo=1000), whoomp), fade_out=0.15)


def s_sun_loop():
    d = 3.0
    t = t_axis(d)
    roar = fft_filter(brown(d), hi=900) * 0.9 + fft_filter(noise(d), lo=200, hi=2500) * 0.3
    hum = osc(55, d) * 0.25 + osc(110.2, d) * 0.12
    crackle = (rng.random(len(t)) < 0.003).astype(float) * rng.standard_normal(len(t)) * 1.5
    sig = roar * (0.8 + 0.2 * np.sin(2 * np.pi * (1 / 3.0) * t)) + hum + fft_filter(crackle, lo=1500)
    return finish(make_loop(sig, 0.3), fade_in=0, fade_out=0)


def s_solar_eruption():
    d = 5.5
    swell = fft_filter(noise(d), hi=5000) * env_swell(d, 0.25, 2.0) * 1.2
    b = boom(d, 32, 3200, 1.6) * 1.3
    roar = fft_filter(brown(d), hi=800) * env_exp(d, 2.2, 0.3) * 1.2
    return finish(reverb(mix(swell, np.concatenate([np.zeros(int(SR * 0.4)), b]), roar), 0.9, 0.3), fade_out=0.7)


def s_cracker_charge():
    d = 2.6
    whine = osc(sweep(60, 640, d), d, 'saw') * env_swell(d, 0.96, 1.3) * 0.7
    hum = osc(50, d, 'square') * 0.15
    clunks = np.zeros(int(SR * d))
    for k in range(4):
        s = int(SR * (0.1 + k * 0.5))
        c = fft_filter(noise(0.08), hi=1200) * env_exp(0.08, 0.02) * 1.2
        clunks[s:s + len(c)] += c[:max(0, min(len(c), len(clunks) - s))]
    return finish(mix(fft_filter(whine, hi=5000), hum, clunks), fade_out=0.08)


def s_cracker_fire():
    d = 2.4
    crack = fft_filter(noise(0.2), lo=500) * env_exp(0.2, 0.03) * 2.0
    b = boom(d, 40, 3000, 0.9) * 1.3
    zap = osc(sweep(2400, 200, 0.5), 0.5, 'saw') * env_exp(0.5, 0.12) * 0.5
    return finish(reverb(delay(mix(crack, b, fft_filter(zap, hi=6000)), 0.18, 0.35, 2), 0.7, 0.25), fade_out=0.3)


def s_cracker_impact():
    d = 5.5
    b = boom(d, 30, 2800, 1.7) * 1.3
    tail = fft_filter(brown(d), hi=120) * env_exp(d, 2.5, 0.2) * 1.2
    return finish(reverb(mix(b, tail, shatter(d, 200, 700) * 0.4), 1.0, 0.35), fade_out=0.7)


def s_orbital_strike():
    d = 3.0
    zap = osc(sweep(6000, 120, 0.7), 0.7, 'saw') * env_exp(0.7, 0.25) * 0.6
    beam = fft_filter(noise(0.7), lo=1000, hi=8000) * env_exp(0.7, 0.3) * 0.4
    b = boom(d, 38, 3000, 1.0)
    sig = mix(fft_filter(zap, hi=8000), beam, np.concatenate([np.zeros(int(SR * 0.35)), b * 1.2]))
    return finish(reverb(pad(sig, d), 0.7, 0.3), fade_out=0.4)


SOUNDS = {
    'charge_up': (s_charge_up, 'Weapon charges'),
    'mode_switch': (s_mode_switch, 'Weapon mode changes'),
    'big_explosion': (s_big_explosion, 'Colossal explosion'),
    'shockwave': (s_shockwave, 'Shockwave rolls outward'),
    'debris_impact': (s_debris_impact, 'Debris crashes down'),
    'worldcutter_slash': (s_worldcutter_slash, 'Space is cleaved'),
    'worldcutter_sever': (s_worldcutter_sever, 'Reality is severed'),
    'worldcutter_rumble': (s_worldcutter_rumble, 'The world rumbles'),
    'laser_loop': (s_laser_loop, 'Laser beam hums'),
    'laser_start': (s_laser_start, 'Laser ignites'),
    'laser_stop': (s_laser_stop, 'Laser powers down'),
    'laser_overload': (s_laser_overload, 'Laser overloads'),
    'orb_charge': (s_orb_charge, 'Prism energy gathers'),
    'orb_fire': (s_orb_fire, 'Eraser orb fires'),
    'orb_travel': (s_orb_travel, 'Orb tears past'),
    'orb_impact': (s_orb_impact, 'Prismatic nova'),
    'asteroid_lock': (s_asteroid_lock, 'Target locked'),
    'asteroid_incoming': (s_asteroid_incoming, 'Asteroid incoming'),
    'asteroid_impact': (s_asteroid_impact, 'Asteroid impact'),
    'blackhole_launch': (s_blackhole_launch, 'Singularity forms'),
    'blackhole_loop': (s_blackhole_loop, 'Singularity devours'),
    'blackhole_collapse': (s_blackhole_collapse, 'Singularity collapses'),
    'reality_shatter': (s_reality_shatter, 'Reality shatters'),
    'rift_loop': (s_rift_loop, 'Dimensional rift whispers'),
    'reality_collapse': (s_reality_collapse, 'Dimensions collapse'),
    'starfall_shoot': (s_starfall_shoot, 'Star loosed'),
    'star_impact': (s_star_impact, 'Star detonates'),
    'starfall_judgment': (s_starfall_judgment, 'Celestial Judgment'),
    'godfist_punch': (s_godfist_punch, 'Kinetic punch'),
    'godfist_shockwave': (s_godfist_shockwave, 'Kinetic shockwave'),
    'godfist_slam': (s_godfist_slam, 'Worldbreaker slam'),
    'sunforge_bolt': (s_sunforge_bolt, 'Solar bolt'),
    'sun_loop': (s_sun_loop, 'Star roars'),
    'solar_eruption': (s_solar_eruption, 'Solar eruption'),
    'cracker_charge': (s_cracker_charge, 'Planet Cracker charges'),
    'cracker_fire': (s_cracker_fire, 'Planet Cracker fires'),
    'cracker_impact': (s_cracker_impact, 'World-ending impact'),
    'orbital_strike': (s_orbital_strike, 'Orbital strike'),
}

# attenuation distance (blocks at volume 1) for each sound
RANGES = {
    'big_explosion': 64, 'asteroid_impact': 96, 'asteroid_incoming': 96, 'worldcutter_sever': 96, 'worldcutter_rumble': 64,
    'starfall_judgment': 96, 'godfist_slam': 96, 'solar_eruption': 96, 'cracker_impact': 96, 'reality_collapse': 96,
    'orbital_strike': 80, 'sun_loop': 48, 'blackhole_loop': 32, 'blackhole_collapse': 64, 'shockwave': 48, 'orb_impact': 64,
}


def write_ogg(samples, path):
    pcm = np.clip(samples, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav_path = tmp.name
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'libvorbis', '-q:a', '5', path], check=True)
    os.unlink(wav_path)


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    sounds_json = {}
    for name, (fn, subtitle) in SOUNDS.items():
        if not only or name in only:
            samples = fn()
            write_ogg(samples, os.path.join(OUT, name + '.ogg'))
            print('%-22s %.2fs' % (name, len(samples) / SR))
        entry = {'name': 'godforge:' + name, 'attenuation_distance': RANGES.get(name, 24)}
        sounds_json[name] = {'subtitle': 'subtitles.godforge.' + name, 'sounds': [entry]}
    with open(os.path.join(ROOT, 'sounds.json'), 'w') as f:
        json.dump(sounds_json, f, indent=1)
    return sounds_json


if __name__ == '__main__':
    main()
