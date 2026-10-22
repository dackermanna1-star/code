"""Procedural sound design for every Ordnance sound event, encoded as mono Ogg Vorbis (mono so Minecraft
positions and attenuates them in 3D)."""
import os
import subprocess
import tempfile
import wave

import numpy as np

from .common import ASSETS, path, write_json

SR = 44100


# ---------------------------------------------------------------------------- DSP helpers

def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def noise(n, rng):
    return rng.standard_normal(n)


def brown(n, rng):
    b = np.cumsum(rng.standard_normal(n))
    b -= np.convolve(b, np.ones(2048) / 2048, mode="same")
    return b / (np.max(np.abs(b)) + 1e-9)


def _response(n, fn):
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    return freqs, fn(np.maximum(freqs, 1e-3))


def spectral(x, fn):
    spec = np.fft.rfft(x)
    _, h = _response(len(x), fn)
    return np.fft.irfft(spec * h, len(x))


def lowpass(x, fc, order=2):
    return spectral(x, lambda f: 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order)))


def highpass(x, fc, order=2):
    return spectral(x, lambda f: 1.0 / np.sqrt(1.0 + (fc / f) ** (2 * order)))


def bandpass(x, f0, q=1.0):
    return spectral(x, lambda f: 1.0 / np.sqrt(1.0 + (q * (f / f0 - f0 / f)) ** 2))


def tv_filter(x, response_at, frame=2048, hop=512):
    """Time-varying zero-phase filter: response_at(t) -> function(freqs) -> gain."""
    window = np.hanning(frame)
    padded = np.concatenate([np.zeros(frame), x, np.zeros(frame)])
    out = np.zeros_like(padded)
    norm = np.zeros_like(padded)
    freqs = np.fft.rfftfreq(frame, 1.0 / SR)
    freqs = np.maximum(freqs, 1e-3)
    for start in range(0, len(padded) - frame, hop):
        seg = padded[start:start + frame] * window
        centre = (start + frame / 2 - frame) / SR
        h = response_at(max(centre, 0.0))(freqs)
        out[start:start + frame] += np.fft.irfft(np.fft.rfft(seg) * h, frame) * window
        norm[start:start + frame] += window ** 2
    out = out / np.maximum(norm, 1e-6)
    return out[frame:frame + len(x)]


def sweep_lowpass(x, fc_at, order=2):
    return tv_filter(x, lambda t: (lambda f, fc=fc_at(t): 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))))


def sweep_bandpass(x, f0_at, q=1.5):
    return tv_filter(x, lambda t: (lambda f, f0=f0_at(t): 1.0 / np.sqrt(1.0 + (q * (f / f0 - f0 / f)) ** 2)))


def env(t, attack, decay):
    return (1.0 - np.exp(-t / max(attack, 1e-4))) * np.exp(-t / decay)


def saturate(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def echo(x, taps):
    out = x.copy()
    for delay, gain, cutoff in taps:
        d = int(delay * SR)
        if d < len(x):
            tail = np.zeros_like(x)
            tail[d:] = x[:-d]
            out += lowpass(tail, cutoff) * gain
    return out


def tone(t, freq, phase=0.0):
    return np.sin(2 * np.pi * freq * t + phase)


def chirp(t, f0, f1, tau):
    f = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def crackle(t, rng, rate, decay, centre=2500.0, q=1.2, length=0.012):
    """Sparse debris/fire crackles: Poisson clicks whose rate decays with time."""
    out = np.zeros_like(t)
    n = len(t)
    clicks = rng.random(n) < (rate * np.exp(-t / decay)) / SR
    burst_len = int(length * SR)
    burst_t = np.arange(burst_len) / SR
    for i in np.nonzero(clicks)[0]:
        b = rng.standard_normal(burst_len) * np.exp(-burst_t / (length / 4))
        end = min(n, i + burst_len)
        out[i:end] += b[:end - i] * rng.uniform(0.3, 1.0)
    return bandpass(out, centre, q)


def fade(x, fade_in=0.002, fade_out=0.05):
    x = x.copy()
    a = int(fade_in * SR)
    b = int(fade_out * SR)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def normalize(x, peak=0.9):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def make_loop(x, crossfade):
    """Crossfades the tail into the head so the sound repeats seamlessly."""
    n = int(crossfade * SR)
    body = x[:-n].copy()
    ramp = np.linspace(0, 1, n)
    body[:n] = body[:n] * ramp + x[-n:] * (1 - ramp)
    return body


# ---------------------------------------------------------------------------- sound designs

def explosion(seed, seconds, boom=(110.0, 40.0), boom_decay=0.35, crack=1.0, rumble_decay=1.1, rumble_cut=380.0,
              crackles=40.0, echoes=0.35, drive=2.2, roll=0.0):
    """Near-field blast: supersonic crack, mid-range body and punch, descending thump, rolling rumble, debris."""
    rng = np.random.default_rng(seed)
    t = t_axis(seconds)
    n = len(t)
    sharp = lowpass(highpass(noise(n, rng), 300.0), 7000.0) * env(t, 0.0006, 0.05) * crack
    body = lowpass(noise(n, rng), 1400.0) * env(t, 0.002, 0.22) * 1.7
    punch = bandpass(noise(n, rng), 260.0, 0.8) * env(t, 0.003, 0.3) * 2.4
    thump = chirp(t, boom[0], boom[1], 0.15) * env(t, 0.003, boom_decay) * 1.1
    thump_noise = lowpass(noise(n, rng), 200.0) * env(t, 0.004, boom_decay * 1.3) * 1.4
    rolling = 1.0 + roll * np.sin(2 * np.pi * (0.6 + rng.random()) * t + rng.random() * 6) * np.minimum(1.0, t * 2.0)
    rumble = (lowpass(brown(n, rng), rumble_cut) * 0.8 + bandpass(noise(n, rng), 170.0, 0.7) * 0.6) * env(t, 0.03, rumble_decay) * rolling * 1.3
    debris = crackle(t, rng, crackles, rumble_decay * 0.7, 2600.0) * 0.5
    mix = sharp * 0.8 + body + punch + thump + thump_noise + rumble + debris
    mix = saturate(normalize(mix, 1.0), drive)
    if echoes > 0:
        mix = echo(mix, [(0.19, echoes * 0.55, 1800.0), (0.41, echoes * 0.35, 1100.0), (0.77, echoes * 0.2, 700.0)])
    return fade(normalize(mix, 0.95), 0.0005, 0.3)


def distant(seed, seconds, cutoff=260.0, decay=1.6, roll=0.4):
    rng = np.random.default_rng(seed)
    t = t_axis(seconds)
    n = len(t)
    boom = lowpass(noise(n, rng), cutoff * 1.4) * env(t, 0.02, decay * 0.5) * 2.0
    thump = chirp(t, 70.0, 32.0, 0.3) * env(t, 0.015, decay * 0.4) * 1.0
    rolling = 1.0 + roll * np.sin(2 * np.pi * 0.45 * t + 1.0) * np.minimum(1.0, t)
    tail = (lowpass(brown(n, rng), cutoff) * 0.9 + bandpass(noise(n, rng), 140.0, 0.8) * 0.8) * env(t, 0.08, decay) * rolling * 1.3
    mix = saturate(normalize(boom + thump + tail, 1.0), 1.4)
    mix = echo(mix, [(0.35, 0.4, 400.0), (0.9, 0.3, 300.0), (1.7, 0.2, 250.0)])
    return fade(normalize(mix, 0.95), 0.01, 0.5)


def underwater(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(2.2)
    n = len(t)
    thump = lowpass(noise(n, rng), 280.0) * env(t, 0.006, 0.25) * 2.0 + chirp(t, 70.0, 30.0, 0.2) * env(t, 0.005, 0.3)
    bubbles = np.zeros(n)
    for _ in range(60):
        start = rng.uniform(0.05, 1.8)
        f0 = rng.uniform(180.0, 700.0)
        tt = t - start
        mask = tt > 0
        bubbles[mask] += np.sin(2 * np.pi * f0 * (1 + 0.6 * tt[mask]) * tt[mask]) * np.exp(-tt[mask] / 0.04) * rng.uniform(0.1, 0.4)
    mix = thump + lowpass(bubbles, 1200.0) * 0.6 + lowpass(brown(n, rng), 200.0) * env(t, 0.05, 0.9)
    return fade(normalize(mix, 0.9), 0.002, 0.3)


def debris_rain(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(2.6)
    patter = crackle(t, rng, 220.0, 0.9, 1800.0, q=0.7, length=0.02)
    patter += crackle(t, rng, 120.0, 1.1, 4000.0, q=1.0, length=0.008) * 0.6
    thuds = crackle(t, rng, 18.0, 1.0, 180.0, q=0.6, length=0.06) * 2.5
    swell = np.minimum(1.0, t / 0.25)
    return fade(normalize((patter + thuds) * swell, 0.75), 0.05, 0.4)


def incendiary(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(2.6)
    n = len(t)
    whoomp = sweep_bandpass(noise(n, rng), lambda s: 180.0 + 700.0 * np.exp(-s / 0.25) + 120.0, q=0.9) * env(t, 0.025, 0.4) * 2.2
    low = lowpass(noise(n, rng), 220.0) * env(t, 0.02, 0.5) * 2.0
    roar = lowpass(noise(n, rng), 1500.0) * env(t, 0.1, 1.2) * 0.5
    fire = crackle(t, rng, 90.0, 1.3, 2600.0, q=0.9) * 0.6
    mix = saturate(normalize(whoomp + low + roar + fire, 1.0), 1.8)
    return fade(normalize(mix, 0.92), 0.004, 0.4)


def smoke_pop():
    rng = np.random.default_rng(5)
    t = t_axis(0.9)
    n = len(t)
    pop = lowpass(noise(n, rng), 1300.0) * env(t, 0.0008, 0.03) * 2.0
    hiss = highpass(noise(n, rng), 2200.0) * np.minimum(1.0, t / 0.25) * np.exp(-np.maximum(t - 0.5, 0) / 0.2) * 0.35
    return fade(normalize(pop + hiss, 0.8), 0.0005, 0.15)


def smoke_hiss():
    rng = np.random.default_rng(6)
    t = t_axis(2.3)
    n = len(t)
    flutter = 1.0 + 0.15 * np.sin(2 * np.pi * 7.0 * t) + 0.1 * np.sin(2 * np.pi * 13.0 * t)
    hiss = highpass(noise(n, rng), 1800.0) * flutter + lowpass(noise(n, rng), 600.0) * 0.25
    shape = np.minimum(1.0, t / 0.3) * np.minimum(1.0, (2.3 - t) / 0.4)
    return normalize(hiss * shape, 0.5)


def debris_land(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(0.4)
    n = len(t)
    thud = lowpass(noise(n, rng), 350.0) * env(t, 0.001, 0.04) * 2.0
    crumble = crackle(t, rng, 300.0, 0.12, 2200.0, q=0.8, length=0.01) * 0.7
    return fade(normalize(thud + crumble, 0.8), 0.0005, 0.08)


def metal_ring(t, partials, decay):
    return sum(tone(t, f) * a for f, a in partials) * np.exp(-t / decay)


def grenade_pin():
    rng = np.random.default_rng(21)
    t = t_axis(0.55)
    n = len(t)
    click = highpass(noise(n, rng), 2500.0) * env(t, 0.0002, 0.004)
    ring = metal_ring(t, [(3150, 0.6), (4710, 0.4), (6320, 0.25), (8150, 0.1)], 0.18)
    spoon = np.zeros(n)
    k = int(0.18 * SR)
    spoon[k:] = metal_ring(t[:n - k], [(2400, 0.4), (3600, 0.25)], 0.06) + highpass(noise(n - k, rng), 3000.0) * env(t[:n - k], 0.0002, 0.003)
    return fade(normalize(click * 1.5 + ring * 0.6 + spoon * 0.7, 0.7), 0.0002, 0.1)


def whoosh(seed, seconds=0.38, low=350.0, high=1500.0):
    rng = np.random.default_rng(seed)
    t = t_axis(seconds)
    mid = seconds * 0.4
    centre = lambda s: low + (high - low) * np.exp(-((s - mid) / (seconds * 0.3)) ** 2)
    sig = sweep_bandpass(noise(len(t), rng), centre, q=1.3)
    shape = np.exp(-((t - mid) / (seconds * 0.3)) ** 2)
    return fade(normalize(sig * shape, 0.6), 0.01, 0.05)


def grenade_bounce(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(0.25)
    n = len(t)
    thud = lowpass(noise(n, rng), 320.0) * env(t, 0.0005, 0.02) * 2.0
    click = highpass(noise(n, rng), 2000.0) * env(t, 0.0002, 0.004)
    ring = metal_ring(t, [(2150 + rng.uniform(-200, 200), 0.5), (3700, 0.3)], 0.05)
    return fade(normalize(thud + click + ring * 0.6, 0.75), 0.0002, 0.05)


def rpg_fire(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(2.0)
    n = len(t)
    bang = highpass(noise(n, rng), 300.0) * env(t, 0.0005, 0.04) * 1.4 + chirp(t, 95.0, 42.0, 0.1) * env(t, 0.002, 0.16) * 1.4
    roar = sweep_lowpass(noise(n, rng), lambda s: 600.0 + 3400.0 * np.exp(-s / 0.5)) * env(t, 0.02, 0.75) * 1.3
    hiss = highpass(noise(n, rng), 3000.0) * env(t, 0.04, 0.5) * 0.35
    rumble = lowpass(brown(n, rng), 300.0) * env(t, 0.03, 0.8)
    mix = saturate(normalize(bang + roar + hiss + rumble, 1.0), 2.0)
    mix = echo(mix, [(0.21, 0.3, 1500.0), (0.46, 0.18, 900.0)])
    return fade(normalize(mix, 0.95), 0.0005, 0.3)


def rpg_reload():
    rng = np.random.default_rng(31)
    t = t_axis(0.65)
    n = len(t)
    slide = sweep_bandpass(noise(n, rng), lambda s: 1800.0 + 1800.0 * s, q=2.5) * np.minimum(1.0, t / 0.15) * np.exp(-np.maximum(t - 0.35, 0) / 0.05) * 0.5
    k = int(0.45 * SR)
    clunk = np.zeros(n)
    tt = t[:n - k]
    clunk[k:] = lowpass(noise(n - k, rng), 500.0) * env(tt, 0.0005, 0.03) * 2.0 + metal_ring(tt, [(1500, 0.4), (2600, 0.25)], 0.05)
    return fade(normalize(slide + clunk, 0.75), 0.002, 0.05)


def latch_clicks(seed, gap=0.1, count=2, pitch=1.0):
    rng = np.random.default_rng(seed)
    t = t_axis(gap * count + 0.15)
    n = len(t)
    out = np.zeros(n)
    for i in range(count):
        k = int(i * gap * SR)
        tt = t[:n - k]
        out[k:] += highpass(noise(n - k, rng), 1800.0 * pitch) * env(tt, 0.0002, 0.006) + metal_ring(tt, [(2800 * pitch, 0.35), (4300 * pitch, 0.2)], 0.025)
    return fade(normalize(out, 0.7), 0.0002, 0.03)


def rocket_motor():
    rng = np.random.default_rng(41)
    t = t_axis(2.4)
    n = len(t)
    roar = lowpass(noise(n, rng), 1800.0) * (1.0 + 0.2 * np.sin(2 * np.pi * 21.0 * t))
    rumble = lowpass(brown(n, rng), 140.0) * 1.2
    hiss = highpass(noise(n, rng), 3500.0) * 0.25
    pops = crackle(t, rng, 30.0, 100.0, 900.0, q=0.7, length=0.02) * 0.5
    return normalize(make_loop(saturate(normalize(roar + rumble + hiss + pops, 1.0), 1.5), 0.3), 0.8)


def gl_fire(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(0.6)
    n = len(t)
    pop = chirp(t, 140.0, 60.0, 0.05) * env(t, 0.001, 0.07) * 1.6
    puff = lowpass(noise(n, rng), 900.0) * env(t, 0.0008, 0.035) * 1.5
    click = highpass(noise(n, rng), 2200.0) * env(t, 0.0002, 0.003) * 0.6
    tube = bandpass(noise(n, rng), 420.0, 4.0) * env(t, 0.002, 0.08) * 0.8
    mix = saturate(normalize(pop + puff + click + tube, 1.0), 1.6)
    mix = echo(mix, [(0.12, 0.2, 1200.0)])
    return fade(normalize(mix, 0.9), 0.0003, 0.1)


def gl_reload(seed):
    rng = np.random.default_rng(seed)
    t = t_axis(0.35)
    n = len(t)
    slide = bandpass(noise(n, rng), 3200.0, 2.0) * np.exp(-((t - 0.08) / 0.04) ** 2) * 0.5
    k = int(0.16 * SR)
    tt = t[:n - k]
    clack = np.zeros(n)
    clack[k:] = highpass(noise(n - k, rng), 1500.0) * env(tt, 0.0002, 0.008) + metal_ring(tt, [(1900, 0.3), (3100, 0.2)], 0.03)
    return fade(normalize(slide + clack, 0.7), 0.001, 0.03)


def flame_ignite():
    rng = np.random.default_rng(51)
    t = t_axis(0.9)
    n = len(t)
    click = highpass(noise(n, rng), 3000.0) * env(t, 0.0002, 0.003) * 0.6
    whoosh_sig = sweep_lowpass(noise(n, rng), lambda s: 250.0 + 3200.0 * min(1.0, s / 0.25)) * np.minimum(1.0, t / 0.15) * np.exp(-np.maximum(t - 0.45, 0) / 0.18)
    low = lowpass(noise(n, rng), 200.0) * env(t, 0.05, 0.3) * 1.2
    return fade(normalize(click + whoosh_sig + low, 0.85), 0.0005, 0.15)


def flame_loop():
    rng = np.random.default_rng(52)
    t = t_axis(3.2)
    n = len(t)
    jet = lowpass(noise(n, rng), 2600.0) * (1.0 + 0.12 * np.sin(2 * np.pi * 9.0 * t) + 0.08 * np.sin(2 * np.pi * 23.0 * t))
    rumble = lowpass(brown(n, rng), 120.0) * 1.4
    fire = crackle(t, rng, 140.0, 100.0, 2400.0, q=0.9) * 0.8
    return normalize(make_loop(saturate(normalize(jet + rumble + fire, 1.0), 1.4), 0.4), 0.8)


def flame_stop():
    rng = np.random.default_rng(53)
    t = t_axis(1.0)
    n = len(t)
    gate = (np.sin(2 * np.pi * (6.0 + 6.0 * t) * t) > -0.2).astype(float)
    sput = lowpass(noise(n, rng), 1600.0) * gate * np.exp(-t / 0.35)
    pops = crackle(t, rng, 40.0, 0.4, 700.0, q=0.6, length=0.03) * 1.5
    return fade(normalize(sput + pops, 0.8), 0.002, 0.15)


def refuel():
    rng = np.random.default_rng(54)
    t = t_axis(1.1)
    n = len(t)
    out = np.zeros(n)
    for i in range(7):
        start = 0.05 + i * 0.12 + rng.uniform(-0.02, 0.02)
        tt = t - start
        m = tt > 0
        f0 = rng.uniform(220.0, 380.0)
        out[m] += np.sin(2 * np.pi * f0 * (1 + 2.5 * tt[m]) * tt[m]) * np.exp(-tt[m] / 0.05)
    k = int(0.95 * SR)
    tt = t[:n - k]
    out[k:] += metal_ring(tt, [(1200, 0.5), (2100, 0.3)], 0.06) + lowpass(noise(n - k, rng), 600.0) * env(tt, 0.0005, 0.02)
    return fade(normalize(out, 0.7), 0.002, 0.05)


def beep(freqs, length=0.07, gap=0.05, amplitude=0.5):
    total = len(freqs) * (length + gap)
    t = t_axis(total + 0.02)
    out = np.zeros(len(t))
    for i, f in enumerate(freqs):
        start = i * (length + gap)
        tt = t - start
        m = (tt >= 0) & (tt < length)
        shape = np.minimum(1.0, tt[m] / 0.004) * np.minimum(1.0, (length - tt[m]) / 0.01)
        out[m] += (np.sin(2 * np.pi * f * tt[m]) + 0.25 * np.sin(4 * np.pi * f * tt[m])) * shape
    return normalize(out, amplitude)


def alarm():
    t = t_axis(1.0)
    f = np.where((t % 0.5) < 0.25, 880.0, 640.0)
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.tanh(2.5 * np.sin(phase)) * 0.8
    return fade(normalize(lowpass(sig, 3500.0), 0.6), 0.01, 0.05)


def missile_incoming():
    rng = np.random.default_rng(61)
    t = t_axis(3.2)
    n = len(t)
    vib = 1.0 + 0.012 * np.sin(2 * np.pi * 5.5 * t)
    phase = 2 * np.pi * np.cumsum(1700.0 * vib) / SR
    scream = np.sin(phase) * 0.5 + np.sin(phase * 1.5) * 0.18 + np.sin(phase * 2.01) * 0.12
    roar = lowpass(noise(n, rng), 1200.0) * 0.9 + lowpass(brown(n, rng), 120.0)
    hiss = highpass(noise(n, rng), 4000.0) * 0.3
    return normalize(make_loop(saturate(normalize(scream + roar + hiss, 1.0), 1.3), 0.4), 0.85)


def sonic_boom():
    rng = np.random.default_rng(62)
    t = t_axis(1.8)
    n = len(t)
    crack = np.zeros(n)
    for k in (0, int(0.11 * SR)):
        tt = t[:n - k]
        crack[k:] += lowpass(noise(n - k, rng), 4500.0) * env(tt, 0.0003, 0.012) * 1.5
    thump = chirp(t, 60.0, 30.0, 0.2) * env(t, 0.004, 0.3) * 1.2
    rumble = lowpass(brown(n, rng), 220.0) * env(t, 0.05, 0.7)
    mix = saturate(normalize(crack + thump + rumble, 1.0), 2.0)
    mix = echo(mix, [(0.3, 0.35, 900.0), (0.7, 0.2, 600.0)])
    return fade(normalize(mix, 0.95), 0.0003, 0.3)


def dry_fire():
    rng = np.random.default_rng(71)
    t = t_axis(0.18)
    n = len(t)
    click = highpass(noise(n, rng), 1500.0) * env(t, 0.0002, 0.007)
    ring = metal_ring(t, [(3300, 0.3), (5100, 0.15)], 0.02)
    return fade(normalize(click + ring, 0.6), 0.0002, 0.03)


# ---------------------------------------------------------------------------- output

def write_ogg(rel, samples):
    out = path(ASSETS, "sounds", rel + ".ogg")
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        with wave.open(wav_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "5", out], check=True)
    finally:
        os.unlink(wav_path)


def generate():
    events = {}

    def add(event, files, subtitle, attenuation=16, stream=False, volume=1.0):
        sounds = []
        for rel, samples in files:
            write_ogg(rel, samples)
            entry = {"name": f"ordnance:{rel}"}
            if attenuation != 16:
                entry["attenuation_distance"] = attenuation
            if stream:
                entry["stream"] = True
            if volume != 1.0:
                entry["volume"] = volume
            sounds.append(entry)
        events[event] = {"subtitle": f"subtitles.ordnance.{subtitle}", "sounds": sounds}

    add("explosion.small", [(f"explosion/small_{i}", explosion(100 + i, 1.9, boom=(125, 45), boom_decay=0.25, rumble_decay=0.8, crackles=50)) for i in range(3)], "explosion", 48)
    add("explosion.medium", [(f"explosion/medium_{i}", explosion(110 + i, 2.6, boom=(110, 40), boom_decay=0.35, rumble_decay=1.1, crackles=60, roll=0.15)) for i in range(3)], "explosion", 48)
    add("explosion.large", [(f"explosion/large_{i}", explosion(120 + i, 3.6, boom=(95, 34), boom_decay=0.5, rumble_decay=1.6, rumble_cut=320, crackles=70, echoes=0.45, roll=0.25)) for i in range(2)], "explosion", 48)
    add("explosion.huge", [(f"explosion/huge_{i}", explosion(130 + i, 6.5, boom=(80, 28), boom_decay=0.9, crack=1.2, rumble_decay=2.8, rumble_cut=260, crackles=90, echoes=0.55, drive=2.8, roll=0.4)) for i in range(2)], "explosion_huge", 48)
    add("explosion.distant", [(f"explosion/distant_{i}", distant(140 + i, 3.2)) for i in range(3)], "explosion_distant", 128)
    add("explosion.distant_huge", [(f"explosion/distant_huge_{i}", distant(150 + i, 7.0, cutoff=200.0, decay=3.2, roll=0.6)) for i in range(2)], "explosion_distant", 128)
    add("explosion.underwater", [(f"explosion/underwater_{i}", underwater(160 + i)) for i in range(2)], "explosion_underwater", 48)
    add("explosion.debris", [(f"explosion/debris_{i}", debris_rain(170 + i)) for i in range(3)], "debris", 32)
    add("explosion.incendiary", [(f"explosion/incendiary_{i}", incendiary(180 + i)) for i in range(2)], "explosion_incendiary", 48)
    add("explosion.smoke_pop", [("explosion/smoke_pop", smoke_pop())], "smoke_pop", 24)
    add("smoke.hiss", [("smoke/hiss", smoke_hiss())], "smoke_hiss", 20)
    add("debris.land", [(f"debris/land_{i}", debris_land(190 + i)) for i in range(3)], "debris_land", 16)
    add("grenade.pin", [("grenade/pin", grenade_pin())], "grenade_pin")
    add("grenade.throw", [(f"grenade/throw_{i}", whoosh(200 + i)) for i in range(2)], "grenade_throw")
    add("grenade.bounce", [(f"grenade/bounce_{i}", grenade_bounce(210 + i)) for i in range(3)], "grenade_bounce", 20)
    add("rpg.fire", [(f"rpg/fire_{i}", rpg_fire(220 + i)) for i in range(2)], "rpg_fire", 64)
    add("rpg.reload", [("rpg/reload", rpg_reload())], "rpg_reload")
    add("rpg.reload_done", [("rpg/reload_done", latch_clicks(230))], "reload_done")
    add("rocket.motor", [("rocket/motor", rocket_motor())], "rocket_motor", 48)
    add("grenade_launcher.fire", [(f"grenade_launcher/fire_{i}", gl_fire(240 + i)) for i in range(2)], "gl_fire", 32)
    add("grenade_launcher.reload", [(f"grenade_launcher/reload_{i}", gl_reload(250 + i)) for i in range(2)], "gl_reload")
    add("grenade_launcher.mode", [("grenade_launcher/mode", latch_clicks(260, count=1, pitch=1.3))], "gl_mode")
    add("flamethrower.ignite", [("flamethrower/ignite", flame_ignite())], "flamethrower_ignite", 24)
    add("flamethrower.loop", [("flamethrower/loop", flame_loop())], "flamethrower", 24)
    add("flamethrower.stop", [("flamethrower/stop", flame_stop())], "flamethrower_stop", 24)
    add("flamethrower.refuel", [("flamethrower/refuel", refuel())], "flamethrower_refuel")
    add("designator.beep", [("designator/beep", beep([1650.0], 0.06))], "designator_beep", 8)
    add("designator.lock", [("designator/lock", beep([2200.0, 2200.0], 0.3, 0.08, 0.55))], "designator_lock", 8)
    add("designator.confirm", [("designator/confirm", beep([1200.0, 1600.0, 2100.0], 0.09, 0.05))], "designator_confirm", 8)
    add("missile.alarm", [("missile/alarm", alarm())], "missile_alarm", 64)
    add("missile.incoming", [("missile/incoming", missile_incoming())], "missile_incoming", 96)
    add("missile.sonic_boom", [("missile/sonic_boom", sonic_boom())], "sonic_boom", 128)
    add("weapon.dry_fire", [("weapon/dry_fire", dry_fire())], "dry_fire", 8)
    write_json("sounds.json", events)
    return events
